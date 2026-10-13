"""A counted fact from games against this opponent, next to the FanDuel price."""

from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import quote

from nfl_bets.hedge import implied_prob
from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json

_REFERER = "https://www.espn.com/"
_PATH = {
    "NFL": ("football", "nfl"),
    "NBA": ("basketball", "nba"),
    "WNBA": ("basketball", "wnba"),
    "MLB": ("baseball", "mlb"),
    "NHL": ("hockey", "nhl"),
}
_CARDS = ("chalk", "four", "plus", "hits", "todayBet", "band", "weekThree", "weekFive", "weekSafe")
_TTL = 12 * 3600
_MEM: dict[str, Any] | None = None
_DIRTY = False


def annotate_board(board: dict[str, Any]) -> None:
    games = [game for game in board.get("games") or [] if isinstance(game, dict)]
    for key in _CARDS:
        card = board.get(key)
        if not isinstance(card, dict):
            continue
        rows = [leg for leg in card.get("legs") or [] if isinstance(leg, dict)]
        for group in card.get("groups") or []:
            if isinstance(group, dict):
                rows.extend(leg for leg in group.get("legs") or [] if isinstance(leg, dict))
        fallback = str(card.get("gameId") or "")
        for leg in rows:
            if fallback and not leg.get("gameId"):
                leg["gameId"] = fallback
        annotate(rows, games)
    _flush()


def annotate(legs: list[dict[str, Any]], games: list[dict[str, Any]]) -> None:
    by_id = {str(game.get("id") or ""): game for game in games}
    for leg in legs:
        game = by_id.get(str(leg.get("gameId") or "")) or _find(leg, games)
        try:
            fact, sway, hits, count = describe(leg, game)
        except Exception:  # noqa: BLE001
            continue
        if not fact:
            continue
        leg["fact"] = fact
        leg["sway"] = sway
        leg["historyHits"] = hits
        leg["historyN"] = count
    _flush()


def resway(leg: dict[str, Any]) -> None:
    hits, count = leg.get("historyHits"), leg.get("historyN")
    if hits is None or not count:
        return
    leg["sway"] = _sway(int(hits), int(count), leg.get("odds"))


def describe(leg: dict[str, Any], game: dict[str, Any] | None) -> tuple[str, str, int, int]:
    if not game:
        return "", "", 0, 0
    sport = str(leg.get("sport") or game.get("sport") or "")
    path = _PATH.get(sport)
    text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
    spec = _spec(text)
    if not path or not spec:
        return _side_fact(leg, game, path) if path else ("", "", 0, 0)
    keys, noun, fixed = spec
    line = _line(text, fixed)
    name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
    away, home = _teams(game)
    if line is None or not name or not away or not home:
        return "", "", 0, 0
    pack = _player_log(sport, path, name)
    if not pack:
        return "", "", 0, 0
    opponent = _opponent(str(pack.get("team") or ""), away, home)
    if not opponent:
        return "", "", 0, 0
    played = _meetings(pack, keys, opponent)
    if len(played) < 2:
        return "", "", 0, 0
    hits = sum(1 for value in played if value >= line)
    nick = _nick(opponent)
    shown = int(line) if float(line).is_integer() else line
    if fixed and line == 1:
        fact = f"Scored a touchdown against the {nick} in {hits} of the last {len(played)}."
    else:
        fact = f"{shown}+ {noun} against the {nick} in {hits} of the last {len(played)}."
    return fact, _sway(hits, len(played), leg.get("odds")), hits, len(played)


def _side_fact(leg: dict[str, Any], game: dict[str, Any], path: tuple[str, str]) -> tuple[str, str, int, int]:
    market = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    if "winner" not in market and "moneyline" not in market and "money line" not in market:
        return "", "", 0, 0
    half = "1st half" in market or "first half" in market
    name = str(leg.get("runner") or "").strip()
    away, home = _teams(game)
    opponent = home if _same(name, away) else away if _same(name, home) else ""
    if not name or not opponent:
        return "", "", 0, 0
    sport = str(leg.get("sport") or game.get("sport") or "")
    marks = _side_marks(sport, path, name, opponent, half)
    if len(marks) < 2:
        return "", "", 0, 0
    hits = sum(marks)
    what = "the first half" if half else "the game"
    fact = f"Won {what} against the {_nick(opponent)} in {hits} of the last {len(marks)}."
    return fact, _sway(hits, len(marks), leg.get("odds")), hits, len(marks)


def _side_marks(sport: str, path: tuple[str, str], name: str, opponent: str, half: bool) -> list[int]:
    rows = [row for row in _side_rows(sport, path, name) if _same(str(row.get("opponent") or ""), opponent)][:6]
    if not half:
        return [1 if row.get("won") else 0 for row in rows]
    marks = []
    for row in rows:
        mark = _half_won(path, str(row.get("event") or ""), name)
        if mark is not None:
            marks.append(mark)
    return marks


def _side_rows(sport: str, path: tuple[str, str], name: str) -> list[dict[str, Any]]:
    key = f"side|{sport}|{name.lower()}"
    cached = _cache().get(key)
    if isinstance(cached, dict) and time.time() - float(cached.get("at") or 0) < _TTL:
        return list(cached.get("rows") or [])
    sport_name, league = path
    team_id = _team_id(name, sport_name, league)
    rows: list[dict[str, Any]] = []
    if team_id:
        year, rows = _finals(sport_name, league, team_id, None)
        if year and len(rows) < 8:
            _, older = _finals(sport_name, league, team_id, year - 1)
            seen = {row.get("event") for row in rows}
            rows.extend(row for row in older if row.get("event") not in seen)
        rows.sort(key=lambda row: str(row.get("date") or ""), reverse=True)
    global _DIRTY
    _cache()[key] = {"at": time.time(), "rows": rows}
    _DIRTY = True
    return rows


def _team_id(name: str, sport_name: str, league: str) -> str:
    url = f"https://site.web.api.espn.com/apis/common/v3/search?query={quote(name)}&limit=5&type=team"
    data = get_json(url, referer=_REFERER, timeout=12)
    want = name.casefold()
    hits = [item for item in data.get("items") or [] if str(item.get("league") or "") == league]
    picked = next((item for item in hits if str(item.get("displayName") or "").casefold() == want), None)
    picked = picked or (hits[0] if len(hits) == 1 else None)
    return str(picked.get("id") or "") if picked else ""


def _finals(sport_name: str, league: str, team_id: str, year: int | None) -> tuple[int, list[dict[str, Any]]]:
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport_name}/{league}/teams/{team_id}/schedule"
    if year:
        url = f"{url}?season={year}"
    data = get_json(url, referer=_REFERER, timeout=12)
    season = int(((data.get("requestedSeason") or {}).get("year") or 0))
    rows = []
    for event in data.get("events") or []:
        comp = (event.get("competitions") or [{}])[0]
        state = str(((comp.get("status") or {}).get("type") or {}).get("state") or "")
        if state != "post":
            continue
        teams = [team for team in comp.get("competitors") or [] if isinstance(team, dict)]
        mine = next((team for team in teams if str((team.get("team") or {}).get("id") or "") == team_id), None)
        other = next((team for team in teams if team is not mine), None)
        if not mine or not other:
            continue
        rows.append({
            "date": str(event.get("date") or ""),
            "event": str(event.get("id") or ""),
            "opponent": str((other.get("team") or {}).get("displayName") or ""),
            "won": bool(mine.get("winner")),
        })
    return season, rows


def _half_won(path: tuple[str, str], event_id: str, name: str) -> int | None:
    if not event_id:
        return None
    key = f"half|{event_id}"
    cached = _cache().get(key)
    if not isinstance(cached, dict) or time.time() - float(cached.get("at") or 0) >= _TTL:
        sport_name, league = path
        url = f"https://site.api.espn.com/apis/site/v2/sports/{sport_name}/{league}/summary?event={event_id}"
        data = get_json(url, referer=_REFERER, timeout=12)
        scores: dict[str, int] = {}
        comps = ((data.get("header") or {}).get("competitions") or [{}])[0].get("competitors") or []
        for team in comps:
            lines = team.get("linescores") or []
            if len(lines) < 2:
                continue
            try:
                total = int(float(lines[0].get("displayValue") or 0)) + int(float(lines[1].get("displayValue") or 0))
            except (TypeError, ValueError):
                continue
            label = str((team.get("team") or {}).get("displayName") or "")
            if label:
                scores[label] = total
        global _DIRTY
        cached = {"at": time.time(), "scores": scores}
        _cache()[key] = cached
        _DIRTY = True
    scores = cached.get("scores") or {}
    mine = next((value for label, value in scores.items() if _same(str(label), name)), None)
    others = [value for label, value in scores.items() if not _same(str(label), name)]
    if mine is None or not others:
        return None
    return 1 if mine > others[0] else 0


def _spec(text: str) -> tuple[tuple[str, ...], str, bool] | None:
    low = text.lower()
    if "touchdown" in low:
        return ("receivingTouchdowns", "rushingTouchdowns"), "touchdown", True
    if "receiving" in low and ("yard" in low or "yds" in low):
        return ("receivingYards",), "receiving yards", False
    if "rushing" in low and ("yard" in low or "yds" in low):
        return ("rushingYards",), "rushing yards", False
    if "passing" in low and ("yard" in low or "yds" in low):
        return ("passingYards",), "passing yards", False
    if "reception" in low:
        return ("receptions",), "receptions", False
    if "shots on goal" in low or re.search(r"\bshots\b", low):
        return ("shotsTotal",), "shots on goal", False
    if "made three" in low or "threes" in low:
        return ("threePointFieldGoalsMade-threePointFieldGoalsAttempted",), "made threes", False
    if "rebound" in low:
        return ("totalRebounds",), "rebounds", False
    if "assist" in low:
        return ("assists",), "assists", False
    if "strikeout" in low:
        return ("strikeouts",), "strikeouts", False
    if re.search(r"\bhits?\b", low):
        return ("hits",), "hits", False
    if "home run" in low:
        return ("homeRuns",), "home runs", False
    if re.search(r"\bgoals?\b", low):
        return ("goals",), "goals", False
    if re.search(r"\bpoints?\b", low):
        return ("points",), "points", False
    return None


def _line(text: str, fixed: bool) -> float | None:
    found = re.search(r"(\d+(?:\.\d+)?)\s*\+", text)
    if found:
        return float(found.group(1))
    return 1.0 if fixed else None


def _player(runner: str, label: str) -> str:
    text = re.sub(r"\s+\d.*$", "", runner).strip()
    if text and not re.search(r"\d", text):
        return text
    found = re.match(r"(.+?)\s+\d", label)
    return found.group(1).strip() if found else ""


def _teams(game: dict[str, Any]) -> tuple[str, str]:
    away = str(game.get("awayName") or "").strip()
    home = str(game.get("homeName") or "").strip()
    if away and home:
        return away, home
    match = str(game.get("match") or "")
    if " @ " in match:
        left, right = match.split(" @ ", 1)
        return left.strip(), right.strip()
    return "", ""


def _same(left: str, right: str) -> bool:
    a = re.sub(r"\s*\([^)]*\)", "", left).lower().split()
    b = re.sub(r"\s*\([^)]*\)", "", right).lower().split()
    return bool(a and b and a[-1] == b[-1] and len(a[-1]) > 3)


def _opponent(team: str, away: str, home: str) -> str:
    if _same(team, away):
        return home
    if _same(team, home):
        return away
    return ""


def _nick(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)", "", name).strip()
    word = name.split()[-1] if name.split() else name
    if word.lower() == "49ers":
        return "49ers"
    return word[:1].upper() + word[1:] if word else name


def _sway(hits: int, count: int, odds: Any) -> str:
    try:
        price = implied_prob(float(odds))
    except (TypeError, ValueError):
        return ""
    if count < 2 or price <= 0:
        return ""
    gap = round((hits / count - price) * 100)
    if count < 3 or abs(gap) < 8:
        return "That history sits close to the FanDuel price."
    side = "above" if gap > 0 else "below"
    return f"Estimated sway: history sits {abs(gap)} points {side} the FanDuel price."


def _meetings(pack: dict[str, Any], keys: tuple[str, ...], opponent: str) -> list[float]:
    names = list(pack.get("names") or [])
    indexes = [names.index(key) for key in keys if key in names]
    if not indexes:
        return []
    found = []
    for row in pack.get("rows") or []:
        if not _same(str(row.get("opponent") or ""), opponent):
            continue
        stats = row.get("stats") or []
        values = [_value(stats[index] if index < len(stats) else "", names[index]) for index in indexes]
        if any(value is None for value in values):
            continue
        found.append(sum(value or 0 for value in values))
        if len(found) >= 6:
            break
    return found


def _value(raw: Any, key: str) -> float | None:
    text = str(raw).strip()
    if text in {"", "-", "—"}:
        return None
    if "-" in text and "Made-" in key:
        text = text.split("-", 1)[0]
    try:
        return float(text)
    except ValueError:
        return None


def _player_log(sport: str, path: tuple[str, str], name: str) -> dict[str, Any] | None:
    key = f"{sport}|{name.lower()}"
    cached = _cache().get(key)
    if isinstance(cached, dict) and time.time() - float(cached.get("at") or 0) < _TTL:
        return cached
    sport_name, league = path
    found = _search(name, sport_name, league)
    if not found:
        _remember(key, "", [], [])
        return None
    athlete_id, team = found
    names, rows, year = _season(sport_name, league, athlete_id, None)
    if year and sum(1 for row in rows if row.get("opponent")) < 8:
        older_names, older_rows, _ = _season(sport_name, league, athlete_id, year - 1)
        names = names or older_names
        seen = {(row.get("date"), row.get("opponent")) for row in rows}
        rows.extend(row for row in older_rows if (row.get("date"), row.get("opponent")) not in seen)
        rows.sort(key=lambda row: str(row.get("date") or ""), reverse=True)
    return _remember(key, team, names, rows[:80])


def _remember(key: str, team: str, names: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    global _DIRTY
    pack = {"at": time.time(), "team": team, "names": names, "rows": rows}
    _cache()[key] = pack
    _DIRTY = True
    return pack


def _search(name: str, sport_name: str, league: str) -> tuple[str, str] | None:
    url = f"https://site.web.api.espn.com/apis/common/v3/search?query={quote(name)}&limit=5&type=player"
    data = get_json(url, referer=_REFERER, timeout=12)
    want = name.casefold()
    hits = [item for item in data.get("items") or [] if str(item.get("league") or "") == league]
    picked = next((item for item in hits if str(item.get("displayName") or "").casefold() == want), None)
    picked = picked or (hits[0] if len(hits) == 1 else None)
    if not picked:
        return None
    athlete_id = str(picked.get("id") or "")
    sport = str(picked.get("sport") or sport_name)
    page = get_json(
        f"https://site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/athletes/{athlete_id}",
        referer=_REFERER,
        timeout=12,
    )
    team = str(((page.get("athlete") or {}).get("team") or {}).get("displayName") or "")
    return (athlete_id, team) if athlete_id and team else None


def _season(sport: str, league: str, athlete_id: str, year: int | None) -> tuple[list[str], list[dict[str, Any]], int]:
    url = f"https://site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/athletes/{athlete_id}/gamelog"
    if year:
        url += f"?season={year}"
    data = get_json(url, referer=_REFERER, timeout=12)
    names = [str(item) for item in data.get("names") or []]
    events = data.get("events") or {}
    rows = []
    for season in data.get("seasonTypes") or []:
        for cat in season.get("categories") or []:
            for item in cat.get("events") or []:
                event = events.get(str(item.get("eventId") or "")) or {}
                opponent = str((event.get("opponent") or {}).get("displayName") or "")
                if opponent:
                    rows.append({"date": str(event.get("gameDate") or ""), "opponent": opponent, "stats": item.get("stats") or []})
    rows.sort(key=lambda row: row["date"], reverse=True)
    current = 0
    for item in (data.get("filters") or []):
        if item.get("name") == "season":
            try:
                current = int((item.get("options") or [{}])[0].get("value") or 0)
            except (TypeError, ValueError):
                current = 0
    return names, rows, current


def _find(leg: dict[str, Any], games: list[dict[str, Any]]) -> dict[str, Any] | None:
    text = str(leg.get("label") or "").lower()
    hits = []
    for game in games:
        away, home = _teams(game)
        if away and home and away.lower() in text and home.lower() in text:
            hits.append(game)
    return hits[0] if len(hits) == 1 else None


def _cache() -> dict[str, Any]:
    global _MEM
    if _MEM is None:
        loaded = read_json(out_dir() / "sway.json", {})
        _MEM = loaded if isinstance(loaded, dict) else {}
    return _MEM


def _flush() -> None:
    global _DIRTY
    if _DIRTY:
        write_json(out_dir() / "sway.json", _cache())
        _DIRTY = False
