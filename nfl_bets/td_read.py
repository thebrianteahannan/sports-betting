"""Who has been scoring, and what the defense has allowed.

A touchdown parlay uses a high total, how the player scores, and the matching
defense. The line is touchdowns per game they have played, then how many
of those games had a touchdown: this year, last year, and career. A rusher
is judged on yards per carry, rushing touchdowns,
and red-zone touchdown rate. A receiver is judged on yards per throw and
passing touchdowns. There is no separate goal-line split. Cached for a few hours.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from time import time
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json

_ET = ZoneInfo("America/New_York")
_REFERER = "https://www.espn.com/"
_TOTAL = 47.0
_TTL = 6 * 3600
_CACHE = "td_cache.json"


def td_parlays(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int) -> list[dict[str, Any]]:
    slate = []
    for game, legs in rows:
        total = _total(game)
        if total is None or total < _TOTAL or len(legs) < count:
            continue
        slate.append((game, sorted(legs, key=lambda leg: leg["odds"]), total))
    if not slate:
        return []
    names = [str(leg.get("runner") or "").strip() for _game, legs, _total in slate for leg in legs[:8]]
    facts = _players([name for name in names if name])
    defense: dict[str, dict[str, Any]] = {}
    found = []
    for game, legs, total in slate:
        picked = []
        for leg in legs:
            fact = facts.get(str(leg.get("runner") or "").strip())
            now = (fact or {}).get("now") or {}
            last = (fact or {}).get("last") or {}
            career = (fact or {}).get("career") or {}
            rate = _rate(now, last, career)
            if not fact or rate <= 0:
                continue
            abbr = str(fact.get("team") or "")
            opp = _opponent(game, abbr)
            if not opp:
                continue
            if opp not in defense:
                defense[opp] = _defense(opp)
            nick = _nick(game, opp)
            kind = _fact_kind(fact)
            if kind not in {"rush", "pass"}:
                continue
            side = defense[opp]
            if kind == "rush":
                mark = _run_mark(nick, side)
                soft = (float(side.get("rushYpc") or 0), float(side.get("redzone") or 0), float(side.get("rushTd") or 0))
            else:
                mark = _pass_mark(nick, side)
                soft = (float(side.get("passYpa") or 0), float(side.get("passTd") or 0), 0)
            copy = dict(leg)
            label = str(leg.get("label") or leg.get("runner") or "").strip()
            copy["label"] = _label(label, fact)
            copy["_rate"] = rate
            copy["_now"], copy["_last"], copy["_career"] = now, last, career
            copy["_kind"] = kind
            copy["_soft"] = soft
            copy["_opp"] = nick
            copy["_mark"] = mark
            picked.append(copy)
        chosen = _choose(picked, count)
        if not chosen:
            continue
        found.append({
            "combo": [(leg, game) for leg in chosen],
            "say": _say(game, total, chosen),
            "total": total,
            "today": _today(game),
        })
    found.sort(key=lambda item: (0 if item["today"] else 1, -item["total"]))
    return found


def _choose(picked: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    rushers = sorted((leg for leg in picked if leg.get("_kind") == "rush"), key=lambda leg: (-leg["_rate"], -leg["_soft"][0], -leg["_soft"][1], leg["odds"]))
    receivers = sorted((leg for leg in picked if leg.get("_kind") != "rush"), key=lambda leg: (-leg["_rate"], -leg["_soft"][0], -leg["_soft"][1], leg["odds"]))
    chosen: list[dict[str, Any]] = []
    if rushers:
        chosen.append(rushers.pop(0))
    if receivers and len(chosen) < count:
        chosen.append(receivers.pop(0))
    rest = sorted(rushers + receivers, key=lambda leg: (-leg["_rate"], leg["odds"]))
    while len(chosen) < count and rest:
        chosen.append(rest.pop(0))
    return chosen if len(chosen) >= count else []


def _say(game: dict[str, Any], total: float, legs: list[dict[str, Any]]) -> str:
    place = f"{game.get('awayNick') or ''} at {game.get('homeNick') or ''}".strip()
    parts = []
    for leg in legs:
        parts.append(f"{leg.get('runner')} {_span(leg)}")
    scorers = _join(parts)
    line = f"{scorers}, in a {place} game totaled at {total:g}."
    faced = [f"{_last(leg.get('runner'))} faces a {leg.get('_mark')}" for leg in legs if leg.get("_mark")]
    if not faced:
        return line
    second = faced[0] if len(faced) == 1 else ", and ".join(faced) if len(faced) == 2 else ", ".join(faced[:-1]) + f", and {faced[-1]}"
    return f"{line} {second}."


def _join(parts: list[str]) -> str:
    if len(parts) <= 1:
        return parts[0] if parts else ""
    if len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"
    return ", ".join(parts[:-1]) + f", and {parts[-1]}"


def _run_mark(nick: str, side: dict[str, Any]) -> str:
    bits = []
    if side.get("rushYpc") is not None:
        bits.append(f"{float(side['rushYpc']):.1f} a carry")
    if side.get("rushTd") is not None:
        bits.append(f"{int(side['rushTd'])} rushing touchdowns")
    if side.get("redzone") is not None:
        bits.append(f"a touchdown on {int(round(float(side['redzone'])))}% of red-zone trips")
    if not bits or not nick:
        return ""
    return f"{nick} run defense allowing " + _join(bits)


def _pass_mark(nick: str, side: dict[str, Any]) -> str:
    bits = []
    if side.get("passYpa") is not None:
        bits.append(f"{float(side['passYpa']):.1f} a throw")
    if side.get("passTd") is not None:
        bits.append(f"{int(side['passTd'])} passing touchdowns")
    if not bits or not nick:
        return ""
    return f"{nick} pass defense allowing " + _join(bits)


def _last(name: Any) -> str:
    parts = [part for part in str(name or "").split() if part.lower() not in {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"}]
    return parts[-1] if parts else str(name or "")


def _players(names: list[str]) -> dict[str, dict[str, Any]]:
    cache = _load()
    bag = cache.setdefault("players", {})
    need = [name for name in dict.fromkeys(names) if not (isinstance(bag.get(name), dict) and _fresh(bag.get(name)) and "scored" in (bag[name].get("now") or {}))]
    if need:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for name, fact in pool.map(lambda name: (name, _player(name)), need):
                if not fact.get("error"):
                    bag[name] = {"at": time(), **fact}
        _save(cache)
    return {name: bag[name] for name in names if isinstance(bag.get(name), dict)}


def _player(name: str) -> dict[str, Any]:
    empty = {"games": 0, "tds": 0, "rush": 0, "rec": 0, "scored": None}
    try:
        url = f"https://site.web.api.espn.com/apis/common/v3/search?query={quote(name)}&limit=5&type=player"
        data = get_json(url, referer=_REFERER, timeout=12)
        hits = [item for item in data.get("items") or [] if str(item.get("league") or "") == "nfl"]
        picked = next((item for item in hits if str(item.get("displayName") or "").casefold() == name.casefold()), None)
        if not picked or not picked.get("id"):
            return {"team": "", "kind": "", "now": dict(empty), "last": dict(empty), "career": dict(empty)}
        athlete_id = str(picked["id"])
        page = get_json(
            f"https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete_id}",
            referer=_REFERER,
            timeout=12,
        )
        stats = get_json(
            f"https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete_id}/stats?seasontype=2",
            referer=_REFERER,
            timeout=12,
        )
        athlete = page.get("athlete") or {}
        team = str((athlete.get("team") or {}).get("abbreviation") or "")
        pos = str((athlete.get("position") or {}).get("abbreviation") or "")
        cats = {str(row.get("name") or ""): row for row in stats.get("categories") or [] if isinstance(row, dict)}
        rush_years = _years(cats.get("rushing") or {}, "rushingTouchdowns")
        rec_years = _years(cats.get("receiving") or {}, "receivingTouchdowns")
        if not rush_years and not rec_years and not (cats.get("rushing") or cats.get("receiving")):
            return {"team": team, "kind": "", "now": dict(empty), "last": dict(empty), "career": dict(empty), "error": True}
        season = _season()
        now = _window(rush_years, rec_years, season)
        last = _window(rush_years, rec_years, season - 1)
        career = _career(cats.get("rushing") or {}, cats.get("receiving") or {})
        counts, years = _touch_counts(athlete_id)
        now["scored"] = counts.get(season)
        last["scored"] = counts.get(season - 1)
        career["scored"] = sum(counts[year] for year in years) if years and set(years) <= set(counts) else (sum(counts.values()) if counts and not years else None)
        sample = now if int(now["tds"]) else last if int(last["tds"]) else career
        return {"team": team, "kind": _kind(int(sample["rush"]), int(sample["rec"]), pos), "now": now, "last": last, "career": career}
    except Exception:  # noqa: BLE001
        return {"team": "", "kind": "", "now": dict(empty), "last": dict(empty), "career": dict(empty), "error": True}


def _kind(rush: int, rec: int, pos: str) -> str:
    if rush > rec:
        return "rush"
    if rec > rush:
        return "pass"
    if pos in {"WR", "TE"}:
        return "pass"
    if rush or rec:
        return "rush"
    return ""


def _season() -> int:
    now = datetime.now(_ET)
    return now.year if now.month >= 3 else now.year - 1


def _years(cat: dict[str, Any], td_key: str) -> dict[int, dict[str, int]]:
    names = [str(item) for item in cat.get("names") or []]
    if "gamesPlayed" not in names or td_key not in names:
        return {}
    gp_i, td_i = names.index("gamesPlayed"), names.index(td_key)
    bag: dict[int, dict[str, int]] = {}
    for row in cat.get("statistics") or []:
        year = int(((row.get("season") or {}).get("year")) or 0)
        stats = row.get("stats") or []
        if not year or len(stats) <= max(gp_i, td_i):
            continue
        slot = bag.setdefault(year, {"games": 0, "tds": 0})
        slot["games"] += _num(stats[gp_i])
        slot["tds"] += _num(stats[td_i])
    return bag


def _window(rush_years: dict[int, dict[str, int]], rec_years: dict[int, dict[str, int]], year: int) -> dict[str, int]:
    rush = rush_years.get(year) or {"games": 0, "tds": 0}
    rec = rec_years.get(year) or {"games": 0, "tds": 0}
    return {"games": max(rush["games"], rec["games"]), "tds": rush["tds"] + rec["tds"], "rush": rush["tds"], "rec": rec["tds"]}


def _career(rush_cat: dict[str, Any], rec_cat: dict[str, Any]) -> dict[str, int]:
    rush_games, rush_td = _counted(rush_cat, "rushingTouchdowns")
    rec_games, rec_td = _counted(rec_cat, "receivingTouchdowns")
    return {"games": max(rush_games, rec_games), "tds": rush_td + rec_td, "rush": rush_td, "rec": rec_td}


def _counted(cat: dict[str, Any], td_key: str) -> tuple[int, int]:
    names = [str(item) for item in cat.get("names") or []]
    totals = cat.get("totals") or []
    if "gamesPlayed" not in names or td_key not in names:
        return 0, 0
    gp_i, td_i = names.index("gamesPlayed"), names.index(td_key)
    if len(totals) <= max(gp_i, td_i):
        return 0, 0
    return _num(totals[gp_i]), _num(totals[td_i])


def _num(text: Any) -> int:
    try:
        return int(float(str(text).replace(",", "")))
    except (TypeError, ValueError):
        return 0


def _label(label: str, fact: dict[str, Any]) -> str:
    head, sep, tail = label.partition(" — ")
    lines = [head, _rates(fact)]
    scored = _scored(fact)
    if scored:
        lines.append(scored)
    body = "\n".join(lines)
    return f"{body} — {tail}" if sep else body


def _rates(fact: dict[str, Any]) -> str:
    return f"{_pace(fact.get('now'))} this year, {_pace(fact.get('last'))} last year, {_pace(fact.get('career'))} career"


def _scored(fact: dict[str, Any]) -> str:
    bits = []
    for key, tail in (("now", "this year"), ("last", "last year"), ("career", "career")):
        text = _games(fact.get(key), lead=not bits)
        if text:
            bits.append(f"{text} {tail}")
    return ", ".join(bits)


def _touch_counts(athlete_id: str) -> tuple[dict[int, int], list[int]]:
    data = _gamelog(athlete_id, 0)
    years = _log_years(data)
    counts: dict[int, int] = {}
    if data:
        got = _count_log(data)
        if got is not None:
            counts[years[0] if years else _season()] = got
    for year in years[1:]:
        got = _count_log(_gamelog(athlete_id, year))
        if got is not None:
            counts[year] = got
    return counts, years


def _log_years(data: dict[str, Any]) -> list[int]:
    for item in data.get("filters") or []:
        if item.get("name") != "season":
            continue
        years = []
        for option in item.get("options") or []:
            try:
                years.append(int(option.get("value")))
            except (TypeError, ValueError):
                continue
        return years
    return []


def _gamelog(athlete_id: str, year: int) -> dict[str, Any]:
    url = f"https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete_id}/gamelog"
    if year:
        url += f"?season={year}"
    try:
        data = get_json(url, referer=_REFERER, timeout=12)
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _count_log(data: dict[str, Any]) -> int | None:
    names = [str(item) for item in data.get("names") or []]
    if "rushingTouchdowns" not in names and "receivingTouchdowns" not in names:
        return None
    rush_i = names.index("rushingTouchdowns") if "rushingTouchdowns" in names else -1
    rec_i = names.index("receivingTouchdowns") if "receivingTouchdowns" in names else -1
    seen: set[str] = set()
    count = 0
    for season in data.get("seasonTypes") or []:
        for cat in season.get("categories") or []:
            for item in cat.get("events") or []:
                event_id = str(item.get("eventId") or "")
                if event_id and event_id in seen:
                    continue
                if event_id:
                    seen.add(event_id)
                stats = item.get("stats") or []
                rush = _num(stats[rush_i]) if 0 <= rush_i < len(stats) else 0
                rec = _num(stats[rec_i]) if 0 <= rec_i < len(stats) else 0
                if rush + rec > 0:
                    count += 1
    return count


def _span(leg: dict[str, Any]) -> str:
    now, last, career = _pace(leg.get("_now")), _pace(leg.get("_last")), _pace(leg.get("_career"))
    if now == "no games":
        return f"has no games this year, {last} last year, and {career} career"
    return f"scores an anytime touchdown, {now} this year, {last} last year, and {career} career"


def _rate(now: dict[str, Any], last: dict[str, Any], career: dict[str, Any]) -> float:
    """Per game he has played. This year when he has played, otherwise the last season he played."""
    for row in (now, last, career):
        games = int((row or {}).get("games") or 0)
        if games > 0:
            return int((row or {}).get("tds") or 0) / games
    return 0.0


def _fact_kind(fact: dict[str, Any]) -> str:
    saved = str(fact.get("kind") or "")
    if saved in {"rush", "pass"}:
        return saved
    for row in (fact.get("now"), fact.get("last"), fact.get("career")):
        if int((row or {}).get("tds") or 0) <= 0:
            continue
        kind = _kind(int(row.get("rush") or 0), int(row.get("rec") or 0), "")
        if kind:
            return kind
    return ""


def _pace(row: Any) -> str:
    games = int((row or {}).get("games") or 0)
    if games <= 0:
        return "no games"
    rate = int((row or {}).get("tds") or 0) / games
    text = f"{rate:.2f}".rstrip("0").rstrip(".")
    return f"{text} per game in {games}"


def _games(row: Any, lead: bool = True) -> str:
    games = int((row or {}).get("games") or 0)
    if games <= 0:
        return "" if not lead else "no games"
    if (row or {}).get("scored") is None:
        return ""
    count = int(row.get("scored") or 0)
    if not lead:
        return str(count)
    word = "game" if count == 1 else "games"
    return f"{count} {word} with a touchdown"


def _defense(abbr: str) -> dict[str, Any]:
    cache = _load()
    bag = cache.setdefault("defense", {})
    saved = bag.get(abbr)
    if _fresh(saved) and isinstance(saved, dict) and "rushYpc" in saved:
        return saved
    fact: dict[str, Any] = {"at": time(), "points": None, "rushYpc": None, "rushTd": None, "passYpa": None, "passTd": None, "redzone": None}
    try:
        data = get_json(
            f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/statistics",
            referer=_REFERER,
            timeout=12,
        )
        rows = {str(row.get("name") or ""): row for row in (data.get("results") or {}).get("opponent") or [] if isinstance(row, dict)}

        def grab(cat: str, key: str) -> float | None:
            stats = {str(item.get("name") or ""): item.get("value") for item in (rows.get(cat) or {}).get("stats") or []}
            try:
                return float(stats[key])
            except (TypeError, ValueError, KeyError):
                return None

        fact["points"] = grab("scoring", "totalPointsPerGame")
        fact["rushYpc"] = grab("rushing", "yardsPerRushAttempt")
        fact["rushTd"] = grab("rushing", "rushingTouchdowns")
        fact["passYpa"] = grab("passing", "yardsPerPassAttempt")
        fact["passTd"] = grab("passing", "passingTouchdowns")
        fact["redzone"] = grab("miscellaneous", "redzoneTouchdownPct")
    except (TypeError, ValueError, KeyError, RuntimeError):
        pass
    bag[abbr] = fact
    _save(cache)
    return fact


def _opponent(game: dict[str, Any], team: str) -> str:
    away, home = str(game.get("away") or ""), str(game.get("home") or "")
    if team and team == home:
        return away
    if team and team == away:
        return home
    return ""


def _nick(game: dict[str, Any], abbr: str) -> str:
    if abbr == str(game.get("away") or ""):
        return str(game.get("awayNick") or abbr)
    if abbr == str(game.get("home") or ""):
        return str(game.get("homeNick") or abbr)
    return abbr


def _total(game: dict[str, Any]) -> float | None:
    raw = game.get("total")
    line = raw.get("line") if isinstance(raw, dict) else raw
    try:
        return float(line)
    except (TypeError, ValueError):
        return None


def _today(game: dict[str, Any]) -> bool:
    raw = str(game.get("kickoff") or "")
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return False
    return stamp.astimezone(_ET).date() == datetime.now(_ET).date()


def _fresh(row: Any) -> bool:
    return isinstance(row, dict) and time() - float(row.get("at") or 0) < _TTL


def _load() -> dict[str, Any]:
    data = read_json(out_dir() / _CACHE, {})
    return data if isinstance(data, dict) else {}


def _save(cache: dict[str, Any]) -> None:
    write_json(out_dir() / _CACHE, cache)
