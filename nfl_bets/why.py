"""Where a recent shift starts. Only the log, and age or injuries when they change the read."""

from __future__ import annotations

import json
import sys
from typing import Any

import re

from nfl_bets.edge import _SPAN, _bar, _hits, _lean, _now_season, _rows, _share, _windows
from nfl_bets.hedge import implied_prob
from nfl_bets.http_util import get_json
from nfl_bets.single import _OTHER, _PART, _combo
from nfl_bets.ones import match_text
from nfl_bets.sway import _PATH, _career, _nick, _spec, _value

_REFERER = "https://www.espn.com/"


def explain(name: str, text: str, sport: str, pack: dict[str, Any] | None = None) -> dict[str, str]:
    spec = _spec(text)
    path = _PATH.get(sport)
    rows = _games(pack, spec[0][0]) if isinstance(pack, dict) and spec else []
    if spec and path and name and len(rows) < 20:
        career = _career(sport, path, name)
        if career:
            pack, rows = career, _games(career, spec[0][0])
    if not spec or len(rows) < 3:
        return {"why": ""}
    return {"why": _brief(name, text, sport, path, pack, rows, spec[0][0])}


def _games(pack: dict[str, Any] | None, key: str) -> list[dict[str, float]]:
    if not pack or not key:
        return []
    names = list(pack.get("names") or [])
    if key not in names:
        return []
    index = names.index(key)
    found = []
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        raw = str(stats[index] if index < len(stats) else "").strip()
        made, attempts = _pair(raw, key)
        if made is None:
            continue
        fgm, fga = _pair(str(_cell(stats, names, "fieldGoalsMade-fieldGoalsAttempted")), "fieldGoalsMade-fieldGoalsAttempted")
        found.append({
            "made": made,
            "attempts": attempts if attempts is not None else -1,
            "minutes": _plain(stats, names, "minutes"),
            "fgm": fgm if fgm is not None else -1,
            "fga": fga if fga is not None else _attempt(stats, names, "fieldGoalsMade-fieldGoalsAttempted"),
            "fta": _attempt(stats, names, "freeThrowsMade-freeThrowsAttempted"),
            "points": _plain(stats, names, "points"),
            "assists": _plain(stats, names, "assists"),
            "turnovers": _plain(stats, names, "turnovers"),
            "season": float(row.get("season") or 0),
            "opp": str(row.get("opponent") or ""),
        })
    return found


def _pair(raw: str, key: str) -> tuple[float | None, float | None]:
    if raw in {"", "-", "—"}:
        return None, None
    if "-" in raw and "Made-" in key:
        left, right = raw.split("-", 1)
        try:
            return float(left), float(right)
        except ValueError:
            return None, None
    try:
        return float(raw), None
    except ValueError:
        return None, None


def _cell(stats: list[Any], names: list[str], key: str) -> Any:
    if key not in names:
        return ""
    at = names.index(key)
    return stats[at] if at < len(stats) else ""


def _plain(stats: list[Any], names: list[str], key: str) -> float:
    if key not in names:
        return -1
    index = names.index(key)
    try:
        return float(stats[index])
    except (TypeError, ValueError, IndexError):
        return -1


def _attempt(stats: list[Any], names: list[str], key: str) -> float:
    if key not in names:
        return -1
    raw = str(stats[names.index(key)] if names.index(key) < len(stats) else "")
    if "-" not in raw:
        return -1
    try:
        return float(raw.split("-", 1)[1])
    except ValueError:
        return -1


def _num(value: float) -> str:
    shown = round(float(value), 1)
    return str(int(shown)) if float(shown).is_integer() else f"{shown:.1f}"


def _mean(rows: list[dict[str, float]], key: str) -> float | None:
    vals = [row[key] for row in rows if row.get(key, -1) >= 0]
    return sum(vals) / len(vals) if vals else None


def _club(path: tuple[str, str], abbr: str) -> set[str]:
    if not abbr:
        return set()
    try:
        roster = get_json(f"https://site.api.espn.com/apis/site/v2/sports/{path[0]}/{path[1]}/teams/{abbr}/roster", referer=_REFERER, timeout=12)
    except RuntimeError:
        return set()
    found = []
    for row in roster.get("athletes") or []:
        if isinstance(row, dict) and row.get("items"):
            found.extend(str(one.get("displayName") or "") for one in row["items"])
        elif isinstance(row, dict):
            found.append(str(row.get("displayName") or ""))
    return {name.casefold() for name in found if name}


def _outs(team: str, sport: str, path: tuple[str, str] | None, skip: str = "") -> list[str]:
    if not path or not team:
        return []
    try:
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/{path[0]}/{path[1]}/injuries", referer=_REFERER, timeout=12)
    except RuntimeError:
        return []
    names, abbr = [], ""
    for group in data.get("injuries") or []:
        if str(group.get("displayName") or "").casefold() != team.casefold():
            continue
        for item in group.get("injuries") or []:
            athlete = item.get("athlete") or {}
            abbr = str((athlete.get("team") or {}).get("abbreviation") or abbr)
            if str(item.get("status") or "").lower() != "out":
                continue
            note = f"{item.get('shortComment') or ''} {item.get('longComment') or ''}".lower()
            if "waiv" in note or "questionable" in note:
                continue
            who = str(athlete.get("displayName") or "").strip()
            if who and who.casefold() != skip.casefold():
                names.append(who)
        break
    club = _club(path, abbr)
    if club:
        names = [who for who in names if who.casefold() in club]
    return names[:3]


def _listed(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + ", and " + names[-1]


def _noun(key: str) -> str:
    named = {
        "receivingYards": "receiving yards", "rushingYards": "rushing yards", "passingYards": "passing yards",
        "receptions": "receptions", "receivingTargets": "targets", "rushingAttempts": "carries",
    }
    if key in named:
        return named[key]
    low = key.casefold()
    if "three" in low:
        return "threes"
    if "rebound" in low:
        return "rebounds"
    if "freethrow" in low:
        return "free throws"
    if key in {"assists", "points", "turnovers", "steals", "blocks"}:
        return key
    return "number"


def _moved(now: float | None, then: float | None) -> bool:
    if now is None or then is None:
        return False
    base = abs(then)
    return abs(now - then) > (0.34 if base < 8 else max(0.9, base * 0.1))


def _seasons(rows: list[dict[str, float]], sport: str = "") -> tuple[list[dict[str, float]] | None, list[dict[str, float]] | None, list[dict[str, float]] | None]:
    years = sorted({int(row["season"]) for row in rows if row["season"]})
    if len(years) < 2 or (sport and years[-1] != _now_season(sport)):
        return None, None, None

    def take(year: int) -> list[dict[str, float]]:
        return [row for row in rows if int(row["season"]) == year]

    newest = take(years[-1])
    if len(newest) >= 5:
        now, last_year, before_year = newest, years[-2], years[-3] if len(years) > 2 else None
    elif len(years) > 2:
        now, last_year, before_year = take(years[-2]), years[-3], years[-4] if len(years) > 3 else None
    else:
        return None, None, None
    last = take(last_year) if last_year is not None else []
    before = take(before_year) if before_year is not None else None
    if len(last) < 8 or len(now) < 5:
        return None, None, None
    if before is not None and len(before) < 8:
        before = None
    return before, last, now


def _pct(rows: list[dict[str, float]]) -> float | None:
    counted = [row for row in rows if row.get("fgm", -1) >= 0 and row.get("fga", -1) > 0]
    atts = sum(row["fga"] for row in counted)
    if len(counted) < 5 or atts <= 0:
        return None
    return sum(row["fgm"] for row in counted) / atts * 100


def _spot(rows: list[dict[str, float]], text: str) -> str:
    bar = _bar(text, False)
    if bar is None:
        return ""
    under = bool(re.search(r"\bunder\b", text, re.I))
    other: list[str] = []
    for row in rows:
        opp = str(row.get("opp") or "")
        made = row.get("made", -1)
        if not opp or made < 0:
            continue
        if under == (made + 1e-9 >= bar):
            nick = opp.split()[-1]
            if nick not in other:
                other.append(nick)
    if not other or len(other) > 3:
        return ""
    shown = str(int(bar)) if float(bar).is_integer() else _num(bar)
    word = "over" if under else "under"
    if len(other) == 1:
        return f"The game {word} {shown} was against the {other[0]}."
    return f"The games {word} {shown} were against the {_listed(other)}."


def _brief(name: str, text: str, sport: str, path: tuple[str, str] | None, pack: dict[str, Any] | None, rows: list[dict[str, float]], key: str) -> str:
    _before, last, now = _seasons(rows, sport)
    if now and last:
        window, base, label = now, last, "This season"
    else:
        window, base, label = rows[:10], rows[10:50], "The last 10"
    made = _mean(window, "made")
    if made is None or len(window) < 3:
        return ""
    noun = _noun(key)
    then = _mean(base, "made") if len(base) >= 8 else None
    bits = [f"{label} the {noun} went to {_num(made)} a game from {_num(then)}." if _moved(made, then) else f"{label} the {noun} are {_num(made)} a game."]
    mins, prior = _mean(window, "minutes"), _mean(base, "minutes") if len(base) >= 8 else None
    if mins is not None and prior is not None:
        if abs(mins - prior) < 2:
            bits.append(f"The minutes stayed at {round(mins)}.")
        elif mins > prior:
            bits.append(f"The minutes went up to {round(mins)} from {round(prior)}.")
        else:
            bits.append(f"The minutes went to {round(mins)} from {round(prior)}.")
    elif mins is not None:
        bits.append(f"The minutes are {round(mins)}.")
    field, word = ("attempts", "three-point attempts") if "three" in key else ("fga", "shots")
    if key in {"points", "assists"} or "three" in key:
        shot, shot_then = _mean(window, field), _mean(base, field) if len(base) >= 8 else None
        if _moved(shot, shot_then):
            bits.append(f"The {word} {'went up to' if (shot or 0) > (shot_then or 0) else 'went to'} {_num(shot or 0)} from {_num(shot_then or 0)}.")
    fg, fg_then = _pct(window), _pct(base) if len(base) >= 8 else None
    if fg is not None and fg_then is not None and abs(fg - fg_then) >= 4:
        bits.append(f"He's shooting {round(fg)}% from the field, {'up' if fg > fg_then else 'down'} from {round(fg_then)}%.")
    elif key == "points" and fg is not None and fg_then is not None and _moved(made, then):
        bits.append(f"The field goal percentage stayed around {round(fg)}%.")
    spot = _spot(window, text)
    if spot:
        bits.append(spot)
    gone = _outs(str((pack or {}).get("team") or ""), sport, path, name)
    if gone:
        bits.append(f"{_listed(gone)} {'is' if len(gone) == 1 else 'are'} out.")
    return " ".join(bits)


def _mates(sport: str, player: str, names: list[str]) -> str:
    path = _PATH.get(sport)
    home = str((_career(sport, path, player) or {}).get("team") or "")
    bits = []
    for raw in names[:2]:
        name = str(raw or "").strip()
        pack = _career(sport, path, name) if name else None
        team = str((pack or {}).get("team") or "")
        if not pack or (home and team and team.casefold() != home.casefold()):
            continue
        rows = _games(pack, "points")
        seasons = _seasons(rows, sport) if len(rows) >= 20 else (None, None, None)
        last, now = (seasons[1], seasons[2]) if seasons else (None, None)
        now_pts, then_pts = _mean(now or [], "made"), _mean(last or [], "made")
        if now_pts is None or then_pts is None:
            continue
        if not _moved(now_pts, then_pts):
            bits.append(f"{name}'s points stayed around {_num(now_pts)}.")
        elif now_pts > then_pts:
            bits.append(f"{name}'s points went up to {_num(now_pts)} from {_num(then_pts)}.")
        else:
            bits.append(f"{name}'s points went to {_num(now_pts)} from {_num(then_pts)}.")
    return " ".join(bits)


def _kinds(text: str) -> list[tuple[tuple[str, ...], str]]:
    low = text.lower()
    bare = low.replace("shots on goal", " ")
    found: list[tuple[tuple[str, ...], str]] = []
    if "shots on goal" in low or re.search(r"\bshots\b", low):
        found.append((("shotsTotal",), "shots on goal"))
    if re.search(r"\bpoints?\b|\bpts?\b", low):
        found.append((("points",), "points"))
    if re.search(r"rebounds?|\brebs?\b", low):
        found.append((("totalRebounds",), "rebounds"))
    if re.search(r"assists?|\basts?\b", low):
        found.append((("assists",), "assists"))
    if re.search(r"made threes?|\bthrees\b", low):
        found.append((("threePointFieldGoalsMade-threePointFieldGoalsAttempted",), "made threes"))
    if re.search(r"\bgoals?\b", bare):
        found.append((("goals",), "goals"))
    return found


def _per(chunk: list[dict[str, Any]]) -> tuple[Any, str]:
    per = sum(row["value"] for row in chunk) / len(chunk)
    shown = int(per) if float(per).is_integer() else round(per, 1)
    played = [row["minutes"] for row in chunk if isinstance(row.get("minutes"), (int, float))]
    clock = f" · {round(sum(played) / len(played))} min" if played and len(played) == len(chunk) else ""
    return shown, f"{shown} a game{clock}"


def _grid(rows: list[dict[str, Any]], sport: str, piece) -> str:
    counts = _SPAN.get(sport) or (3, 6, 10, 25, 50)
    bits = [f"Last {n}, {piece(rows[:n])}" for n in counts if len(rows) >= n]
    year = _now_season(sport)
    now = [row for row in rows if int(row.get("season") or 0) == year]
    last = [row for row in rows if int(row.get("season") or 0) == year - 1]
    if len(now) >= 3:
        bits.append(f"This season, {piece(now)}")
    if len(last) >= 3:
        bits.append(f"Last season, {piece(last)}")
    bits.append(f"Career, {piece(rows)}")
    return ". ".join(bits) + "."


_LOAD = {"receiving yards": ("receivingTargets", "targets"), "rushing yards": ("rushingAttempts", "carries"), "passing yards": ("passingAttempts", "passes"), "receptions": ("receivingTargets", "targets")}


def _hold(pack: dict[str, Any], text: str, price: float) -> str:
    spec = _spec(text)
    if not spec or price <= 0 or spec[1] not in _LOAD:
        return ""
    key, noun = _LOAD[spec[1]]
    rows = _with_load(pack, spec[0], key)
    bar = _bar(text, spec[2])
    if bar is None or len(rows) < 7:
        return ""
    under = bool(re.search(r"\bunder\b", text, re.I))
    recent, rest = rows[:4], rows[4:]
    prior = _prior(recent, rest)
    if len(prior) < 3 or not _job(_avg(recent), _avg(prior), under):
        return ""
    now, then = _avg(recent), _avg(prior)
    lifted = (lambda row: row["load"] <= then - 1) if under else (lambda row: row["load"] >= then + 1)
    if sum(1 for row in recent if lifted(row)) < 3:
        return ""
    spike = min(recent, key=lambda row: row["load"]) if under else max(recent, key=lambda row: row["load"])
    if not _job(_avg([row for row in recent if row is not spike]), then, under):
        return ""
    best = min(recent, key=lambda row: row["value"]) if under else max(recent, key=lambda row: row["value"])
    if _hits([row for row in recent if row is not best], bar, under) < 2:
        return ""
    fair = round((2 * _hits(prior, bar, under) / len(prior) + _hits(recent, bar, under)) / 6 * 100)
    asked = round(price * 100)
    if fair < asked + 6:
        return ""
    return f"{noun.capitalize()} went to {_num(now)} from {_num(then)}. At {fair}%, the recent run still clears the {asked}% price."


def _job(now: float, then: float, under: bool) -> bool:
    return then >= now + max(1.5, now * 0.25) if under else now >= then + max(1.5, then * 0.25)


def _avg(rows: list[dict]) -> float:
    return sum(row["load"] for row in rows) / len(rows)


def _prior(recent: list[dict], rest: list[dict]) -> list[dict]:
    year = int(recent[0].get("season") or 0)
    same = [row for row in rest if year and int(row.get("season") or 0) == year]
    if len(same) >= 3:
        return same
    years = sorted({int(row.get("season") or 0) for row in rest if int(row.get("season") or 0) not in {0, year}})
    last = [row for row in rest if years and int(row.get("season") or 0) == years[-1]]
    return last if len(last) >= 5 else rest if len(rest) >= 8 else []


def _with_load(pack: dict[str, Any], keys: tuple[str, ...], load_key: str) -> list[dict]:
    names = list(pack.get("names") or [])
    if load_key not in names:
        return []
    index = names.index(load_key)
    found: dict[str, float] = {}
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        value = _value(stats[index] if index < len(stats) else "", load_key)
        if value is not None:
            found.setdefault(str(row.get("date") or ""), float(value))
    attached = []
    for row in _rows(pack, keys):
        load = found.get(str(row.get("date") or ""))
        if load is None:
            continue
        attached.append({**row, "load": load})
    return attached


def read_one(name: str, leg: dict[str, Any], pack: dict[str, Any] | None = None) -> dict[str, str]:
    text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
    part = bool(_PART.search(text) or _OTHER.search(text))
    kinds = _kinds(text)
    sport = str(leg.get("sport") or "")
    path = _PATH.get(sport)
    if not (isinstance(pack, dict) and pack.get("rows")):
        pack = (_career(sport, path, name) or None) if path and name else None
    if pack and part and len(kinds) == 1 and (rows := _rows(pack, kinds[0][0])) and len(rows) >= 3:
        shown, _line = _per(rows[:3])
        return {"why": f"{_nick(name)} is at {shown} {kinds[0][1]} a game over the last 3.", "spans": _grid(rows, sport, lambda chunk: _per(chunk)[1]), "lean": ""}
    if pack and len(kinds) > 1 and not part:
        keys = tuple(key for group, _noun in kinds for key in group)
        rows = _rows(pack, keys)
        bar = _bar(text, False)
        if bar is not None and len(rows) >= 3:
            under = bool(re.search(r"\bunder\b", text, re.I))
            try:
                price = implied_prob(float(leg.get("odds")))
            except (TypeError, ValueError):
                price = 0.0
            hits = _hits(rows[:3], bar, under)
            shown = int(bar) if float(bar).is_integer() else bar
            noun = " and ".join(noun for _keys, noun in kinds)
            verb = f"{'stayed under' if under else 'cleared'} {shown}+ {noun}"
            return {"why": f"{_nick(name)} {verb} in {hits} of the last 3. FanDuel has this at {round(price * 100)}%.", "spans": _grid(rows, sport, lambda chunk: _share(chunk, bar, under)), "lean": ""}
    if _combo(text):
        return {"why": "A combo prop stays off a single stat's log."}
    sport = str(leg.get("sport") or "")
    path = _PATH.get(sport)
    if not (isinstance(pack, dict) and pack.get("rows")):
        pack = (_career(sport, path, name) or None) if path and name else None
    spans = _windows(pack, text, sport) if pack else ""
    try:
        price = implied_prob(float(leg.get("odds")))
    except (TypeError, ValueError):
        price = 0.0
    lean = (_lean(pack, text, price) or _hold(pack, text, price)) if pack else ""
    spec = _spec(text)
    rows = _rows(pack, spec[0]) if pack and spec else []
    bar = _bar(text, spec[2]) if spec else None
    why = ""
    if bar is not None and len(rows) >= 3:
        under = bool(re.search(r"\bunder\b", text, re.I))
        window = rows[:3]
        hits = _hits(window, bar, under)
        shown = int(bar) if float(bar).is_integer() else bar
        verb = "scored a touchdown" if spec[2] and bar == 1 else f"{'stayed under' if under else 'cleared'} {shown}+ {spec[1]}"
        why = (__import__("nfl_bets.td_few", fromlist=["_returning"])._returning(name) if spec[2] and bar == 1 else "") or f"{_nick(name)} {verb} in {hits} of the last {len(window)}. FanDuel has this at {round(price * 100)}%."
    return {"why": why, "spans": spans, "lean": lean}


def _main() -> None:
    body = json.load(sys.stdin)
    given = body.get("pack") if isinstance(body.get("pack"), dict) else None
    if body.get("read"):
        json.dump(read_one(str(body.get("name") or ""), body.get("bet") if isinstance(body.get("bet"), dict) else {}, given), sys.stdout)
        return
    if body.get("mates"):
        json.dump({"why": _mates(str(body.get("sport") or ""), str(body.get("name") or ""), list(body.get("mates") or []))}, sys.stdout)
        return
    found = explain(str(body.get("name") or ""), str(body.get("text") or ""), str(body.get("sport") or ""), given)
    games = [row for row in (body.get("games") or []) if isinstance(row, dict)]
    if games:
        found["hits"] = match_text(str(body.get("text") or ""), games, body.get("odds"))
    json.dump(found, sys.stdout)


if __name__ == "__main__":
    _main()
