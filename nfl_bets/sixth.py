"""The 6th man when the game is set up as a blowout.

He is the first reserve, the one who comes in for a starter. A wide
spread is a game where that starter can sit. The over is listed when
he has cleared it in blowouts more often than not. The price stays
the FanDuel price. This does not send a bet.
"""

from __future__ import annotations

import re
from typing import Any

from nfl_bets.choose import _clock, _place
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.http_util import get_json
from nfl_bets.sway import _nick, _player, _search, _value

_PART = re.compile(r"\b(quarter|half|period|inning|first|last|1st|2nd|3rd)\b", re.I)
_KINDS = (
    (re.compile(r"\b(?:pts?|points?).{0,20}(?:rebs?|rebounds?).{0,20}(?:asts?|assists?)\b", re.I), "pra", "points + rebounds + assists"),
    (re.compile(r"\b(?:pts?|points?).{0,20}(?:rebs?|rebounds?)\b", re.I), "pr", "points + rebounds"),
    (re.compile(r"\b(?:pts?|points?).{0,20}(?:asts?|assists?)\b", re.I), "pa", "points + assists"),
    (re.compile(r"\b(?:rebs?|rebounds?).{0,20}(?:asts?|assists?)\b", re.I), "ra", "rebounds + assists"),
    (re.compile(r"\b(?:threes|3-?pointers?|made threes)\b", re.I), "threes", "threes"),
    (re.compile(r"\brebounds?\b", re.I), "reb", "rebounds"),
    (re.compile(r"\bassists?\b", re.I), "ast", "assists"),
    (re.compile(r"\bpoints?\b", re.I), "pts", "points"),
)
_TITLE = "6th man in a blowout"
_GOAL = "The first reserve, in a game the spread says can get away, on a prop he has cleared in blowouts more often than not."
_REFERER = "https://www.espn.com/"
_SPOTS = ("pg", "sg", "sf", "pf", "c")


def sixth_card(pools: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> dict[str, Any]:
    found = _pick(pools)
    if not found:
        return {"title": _TITLE, "strategy": _TITLE, "game": "", "goal": _GOAL, "copy": "No 6th man has a prop he has cleared in blowouts more often than not.", "legs": [], "note": "", "offers": []}
    card = _ticket(found[0])
    card["offers"] = [_offer(row) for row in found]
    card["goal"] = _GOAL
    return card


def reserve(team: str) -> tuple[str, str] | None:
    """The 6th man and the starter he comes in for, from the depth chart and the minutes."""
    picked = _man(team)
    return (picked[0], picked[1]) if picked else None


def _pick(pools: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    for game, legs in pools:
        if str(game.get("sport") or "") != "NBA" or _gap(game) < 8:
            continue
        men = {name.casefold(): (name, starter, rows) for side in (game.get("awayName"), game.get("homeName")) if (picked := _man(str(side or ""))) for name, starter, rows in [picked]}
        for leg in legs or []:
            text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
            kind = _kind(text)
            raw = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
            name = re.sub(r"\s+(over|under)\b.*$", "", raw, flags=re.I).strip()
            bar = _bar(text)
            try:
                odds = int(leg.get("odds"))
            except (TypeError, ValueError):
                continue
            seat = men.get(name.casefold())
            if not seat or not kind or bar is None or odds < -250:
                continue
            _who, starter, rows = seat
            blow = [row for row in rows if row["margin"] >= 15]
            close = [row for row in rows if row["margin"] < 15]
            if len(blow) < 4:
                continue
            if close and _mean(blow, "min") + 2 < _mean(close, "min"):
                continue
            if close and _mean(blow, kind) <= _mean(close, kind):
                continue
            hits = sum(1 for row in blow if _made(_total(row, kind), bar, text))
            if hits * 2 <= len(blow):
                continue
            prior = by_name.get(name.casefold())
            row = {"name": name, "starter": starter, "leg": leg, "game": game, "hits": hits, "count": len(blow), "bar": bar, "odds": odds, "unit": kind[1], "gap": _gap(game)}
            if prior is None or (abs(odds + 110), -hits) < (abs(prior["odds"] + 110), -prior["hits"]):
                by_name[name.casefold()] = row
    rows = sorted(by_name.values(), key=lambda row: (row["hits"] / row["count"], -abs(row["odds"] + 110)), reverse=True)
    return rows[:8]


def _man(team: str) -> tuple[str, str, list[dict[str, Any]]] | None:
    pairs = _pairs(_abbr(team))
    logs = {name: _log(name) for pair in pairs for name in pair}
    def minutes(name: str) -> float:
        rows = logs.get(name) or []
        return _mean(rows, "min") if len(rows) >= 8 else 0
    starters = [starter for _backup, starter in pairs if minutes(starter) >= 28]
    fifth = min(starters, key=minutes) if starters else ""
    best: tuple[float, str, str] | None = None
    for backup, starter in pairs:
        bench_min, start_min = minutes(backup), minutes(starter)
        if bench_min >= start_min + 8 and bench_min >= 28:
            backup, starter, bench_min, start_min = starter, backup, start_min, bench_min
        if start_min == 0 and fifth and bench_min <= 24 and backup != fifth:
            starter, start_min = fifth, minutes(fifth)
        if backup == starter or not (14 <= bench_min <= 26) or start_min < 28 or start_min - bench_min < 6:
            continue
        if best is None or bench_min > best[0]:
            best = (bench_min, backup, starter)
    return (best[1], best[2], logs[best[1]]) if best else None


def _pairs(abbr: str) -> list[tuple[str, str]]:
    saved = _pairs.cache.get(abbr) if abbr else []
    if abbr in _pairs.cache:
        return saved
    _pairs.cache[abbr] = []
    if not abbr:
        return []
    try:
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{abbr}/depthcharts", referer=_REFERER, timeout=12)
    except (RuntimeError, OSError, TypeError, ValueError):
        return []
    positions = ((data.get("depthchart") or [{}])[0].get("positions") or {})
    starters: list[str] = []
    found = []
    for spot in _SPOTS:
        names = [str(ath.get("displayName") or "") for ath in (positions.get(spot) or {}).get("athletes") or [] if ath.get("displayName")]
        first = next((name for name in names if name not in starters), "")
        if first:
            starters.append(first)
        second = next((name for name in names if name not in starters), "")
        if first and second:
            found.append((second, first))
    _pairs.cache[abbr] = found
    return found


def _abbr(team: str) -> str:
    want = str(team or "").casefold()
    for club in _clubs():
        names = {str(club.get(key) or "").casefold() for key in ("displayName", "shortDisplayName", "name", "nickname")}
        if want in names:
            return str(club.get("abbreviation") or "").lower()
    return ""


def _clubs() -> list[dict[str, Any]]:
    if _clubs.cache is not None:
        return _clubs.cache
    try:
        data = get_json("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=50", referer=_REFERER, timeout=12)
        clubs = ((data.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams") or []
    except (RuntimeError, OSError, TypeError, ValueError, IndexError):
        clubs = []
    _clubs.cache = [row.get("team") or row for row in clubs if isinstance(row, dict)]
    return _clubs.cache


def _log(name: str) -> list[dict[str, Any]]:
    key = name.casefold()
    if key in _log.cache:
        return _log.cache[key]
    found = _search(name, "basketball", "nba")
    rows, year = _pull(found[0], None) if found else ([], 0)
    if sum(1 for row in rows[:15] if row["margin"] >= 15) < 4 and year:
        older, _year = _pull(found[0], year - 1)
        seen = {row["date"] for row in rows}
        rows = rows + [row for row in older if row["date"] not in seen]
    _log.cache[key] = rows[:15]
    return _log.cache[key]


def _pull(athlete_id: str, year: int | None) -> tuple[list[dict[str, Any]], int]:
    url = f"https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{athlete_id}/gamelog"
    if year:
        url += f"?season={year}"
    try:
        data = get_json(url, referer=_REFERER, timeout=12)
    except (RuntimeError, OSError, TypeError, ValueError):
        return [], 0
    names = [str(item) for item in data.get("names") or []]
    def col(*options: str) -> int | None:
        return next((names.index(option) for option in options if option in names), None)
    ip, ir, ia, im, it = col("points"), col("totalRebounds", "rebounds"), col("assists"), col("minutes"), col("threePointFieldGoalsMade-threePointFieldGoalsAttempted")
    if None in (ip, ir, ia, im):
        return [], 0
    current = 0
    for item in data.get("filters") or []:
        if item.get("name") == "season":
            try:
                current = int((item.get("options") or [{}])[0].get("value") or 0)
            except (TypeError, ValueError):
                current = 0
    events, rows = data.get("events") or {}, []
    for season in data.get("seasonTypes") or []:
        if re.search(r"preseason", str(season.get("displayName") or ""), re.I):
            continue
        for cat in season.get("categories") or []:
            for item in cat.get("events") or []:
                event = events.get(str(item.get("eventId") or "")) or {}
                stats = item.get("stats") or []
                played = _value(stats[im], "minutes") if im < len(stats) else None
                if not played:
                    continue
                try:
                    margin = abs(float(event.get("homeTeamScore") or 0) - float(event.get("awayTeamScore") or 0))
                except (TypeError, ValueError):
                    continue
                def num(at: int | None, label: str) -> float:
                    got = _value(stats[at], label) if at is not None and at < len(stats) else 0
                    return float(got or 0)
                made = str(stats[it]).split("-")[0] if it is not None and it < len(stats) else "0"
                try:
                    threes = float(made)
                except ValueError:
                    threes = 0
                rows.append({"date": str(event.get("gameDate") or ""), "min": float(played), "pts": num(ip, "points"), "reb": num(ir, "totalRebounds"), "ast": num(ia, "assists"), "threes": threes, "margin": margin})
    rows.sort(key=lambda row: row["date"], reverse=True)
    return rows, current


def _kind(text: str) -> tuple[str, str] | None:
    if _PART.search(text) or re.search(r"\bunder\b", text, re.I):
        return None
    for pattern, key, unit in _KINDS:
        if pattern.search(text):
            return key, unit
    return None


def _total(row: dict[str, Any], kind: tuple[str, str]) -> float:
    key = kind[0]
    if key == "pra":
        return row["pts"] + row["reb"] + row["ast"]
    if key == "pr":
        return row["pts"] + row["reb"]
    if key == "pa":
        return row["pts"] + row["ast"]
    if key == "ra":
        return row["reb"] + row["ast"]
    return float(row[key])


def _mean(rows: list[dict[str, Any]], kind: str | tuple[str, str]) -> float:
    if isinstance(kind, tuple):
        return sum(_total(row, kind) for row in rows) / len(rows)
    return sum(float(row[kind]) for row in rows) / len(rows)


def _bar(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    return float(match.group(1)) if match else None


def _made(total: float, bar: float, text: str) -> bool:
    if re.search(r"\bover\b", text, re.I):
        return total > bar
    return total >= bar


def _gap(game: dict[str, Any]) -> float:
    spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
    try:
        return abs(float(spread.get("awayLine")))
    except (TypeError, ValueError):
        return 0


def _why(row: dict[str, Any]) -> str:
    shown = int(row["bar"]) if float(row["bar"]).is_integer() else row["bar"]
    gap = int(row["gap"]) if float(row["gap"]).is_integer() else row["gap"]
    return f"{_nick(row['name'])} comes in for {_nick(row['starter'])} when the game gets away. He cleared {shown} {row['unit']} in {row['hits']} of his last {row['count']} blowouts. The spread is {gap}."


def _leg(row: dict[str, Any]) -> dict[str, Any]:
    leg, game, odds = row["leg"], row["game"], row["odds"]
    return {"market": leg.get("market") or "", "runner": leg.get("runner") or "", "label": f"{leg.get('label') or ''} — {game.get('sport')}, {_place(game)}, {_clock(game)}", "odds": odds, "kickoff": game.get("kickoff") or "", "gameId": str(game.get("id") or ""), "sport": game.get("sport") or "NBA", "pct": f"{implied_prob(odds) * 100:.1f}%"}


def _offer(row: dict[str, Any]) -> dict[str, Any]:
    odds = row["odds"]
    return {"title": _nick(row["name"]), "price": odds, "impliedPct": round(implied_prob(odds) * 100, 1), "why": _why(row), "legs": [_leg(row)], "profit": round(5 * (american_decimal(odds) - 1), 2)}


def _ticket(row: dict[str, Any]) -> dict[str, Any]:
    offer, odds = _offer(row), row["odds"]
    return {"title": _TITLE, "strategy": _TITLE, "game": "", "goal": _GOAL, "american": odds, "impliedPct": offer["impliedPct"], "stake": 5, "profit": offer["profit"], "live": False, "note": "", "copy": _why(row), "why": _why(row), "legs": offer["legs"], "offers": []}


_pairs.cache = {}
_clubs.cache = None
_log.cache = {}
