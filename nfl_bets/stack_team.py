"""How often a spread, team total, or game total landed in each team's recent games."""

from __future__ import annotations

import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json
from nfl_bets.sway import _PATH, _REFERER, _team_id

_FILE = "stack_team.json"
_TTL = 6 * 3600
_LAST = 10
_NUM = r"([+-]?\d+(?:\.\d+)?)"
_UNIT = {"NHL": "goals", "MLB": "runs"}


def load(games: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    path = out_dir() / _FILE
    cache = read_json(path, {}) if path.exists() else {}
    want = {f"{game.get('sport')}|{name}" for game in games for name in (game.get("homeName"), game.get("awayName")) if name and game.get("sport") in _PATH}
    stale = [key for key in want if time.time() - float((cache.get(key) or {}).get("at") or 0) >= _TTL]
    if stale:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for key, rows in zip(stale, pool.map(_fetch, stale)):
                if rows is not None:
                    cache[key] = {"at": time.time(), "rows": rows}
        write_json(path, cache)
    return {key: list((cache.get(key) or {}).get("rows") or []) for key in want}


def count(label: str, game: dict[str, Any], logs: dict[str, list[dict[str, Any]]]) -> dict[str, Any] | None:
    sport = str(game.get("sport") or "")
    teams = [str(game.get(side) or "") for side in ("homeName", "awayName")]
    text = label.strip()
    for team in teams:
        found = re.fullmatch(rf"{re.escape(team)}\s+\(?{_NUM}\)?(?:\s+spread)?", text) if team else None
        if found:
            line = float(found.group(1))
            rows = logs.get(f"{sport}|{team}", [])[:_LAST]
            if len(rows) < 5:
                return None
            hits = sum(1 for row in rows if row["for"] - row["against"] + line > 0)
            verb = f"won by {math.floor(-line) + 1}+" if line < 0 and line != int(line) else f"covered {line:+g}"
            return {"who": team, "verb": verb, "hits": hits, "games": len(rows)}
    found = re.search(rf"\b(Over|Under)\s+\(?{_NUM}\)?", text, re.I)
    if not found or "total" not in text.lower():
        return None
    side, line = found.group(1).lower(), float(found.group(2))
    unit = _UNIT.get(sport, "points")
    head = text[: found.start()].lower()
    team = next((name for name in teams if name and name.split()[-1].lower() in head), "")
    if team:
        rows = [row["for"] for row in logs.get(f"{sport}|{team}", [])[:_LAST]]
        who, words = team, f"{unit}"
        verb_word = "scored under" if side == "under" else "scored over"
    else:
        seen, rows = set(), []
        for name in teams:
            for row in logs.get(f"{sport}|{name}", [])[:_LAST]:
                if row["event"] not in seen:
                    seen.add(row["event"])
                    rows.append(row["for"] + row["against"])
        who = " and ".join(name.split()[-1] for name in reversed(teams) if name) + " games"
        words = f"total {unit}"
        verb_word = "stayed under" if side == "under" else "went over"
    if len(rows) < 5:
        return None
    hits = sum(1 for value in rows if (value < line if side == "under" else value > line))
    return {"who": who, "verb": f"{verb_word} {line:g} {words}", "hits": hits, "games": len(rows)}


def _fetch(key: str) -> list[dict[str, Any]] | None:
    sport, _, name = key.partition("|")
    sport_name, league = _PATH[sport]
    try:
        team_id = _team_id(name, sport_name, league)
        if not team_id:
            return []
        year, rows = _finals(sport_name, league, team_id, None)
        if year and len(rows) < _LAST:
            seen = {row["event"] for row in rows}
            rows += [row for row in _finals(sport_name, league, team_id, year - 1)[1] if row["event"] not in seen]
    except Exception:  # noqa: BLE001
        return None
    rows.sort(key=lambda row: row["date"], reverse=True)
    return rows[:_LAST]


def _finals(sport_name: str, league: str, team_id: str, year: int | None) -> tuple[int, list[dict[str, Any]]]:
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport_name}/{league}/teams/{team_id}/schedule"
    data = get_json(f"{url}?season={year}" if year else url, referer=_REFERER, timeout=12)
    rows = []
    for event in data.get("events") or []:
        comp = (event.get("competitions") or [{}])[0]
        if str(((comp.get("status") or {}).get("type") or {}).get("state") or "") != "post":
            continue
        sides = [side for side in comp.get("competitors") or [] if isinstance(side, dict)]
        mine = next((side for side in sides if str((side.get("team") or {}).get("id") or "") == team_id), None)
        other = next((side for side in sides if side is not mine), None)
        if not mine or not other:
            continue
        try:
            rows.append({"date": str(event.get("date") or ""), "event": str(event.get("id") or ""), "for": _score(mine), "against": _score(other)})
        except (TypeError, ValueError):
            continue
    return int(((data.get("requestedSeason") or {}).get("year") or 0)), rows


def _score(side: dict[str, Any]) -> float:
    score = side.get("score")
    return float(score.get("value") if isinstance(score, dict) else score)
