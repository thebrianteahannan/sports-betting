"""Red-zone and goal-line plays for each NFL team and player."""

from __future__ import annotations

import csv
import gzip
import io
import json
import time
import urllib.request
from typing import Any

from nfl_bets.store import out_dir, read_json, write_json

_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz"
_ROSTER = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv"
_TTL = 6 * 60 * 60
_TEAMS = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "JAC": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs", "LV": "Las Vegas Raiders", "LAC": "Los Angeles Chargers", "LAR": "Los Angeles Rams",
    "LA": "Los Angeles Rams", "MIA": "Miami Dolphins", "MIN": "Minnesota Vikings", "NE": "New England Patriots",
    "NO": "New Orleans Saints", "NYG": "New York Giants", "NYJ": "New York Jets", "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers", "SF": "San Francisco 49ers", "SEA": "Seattle Seahawks", "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans", "WAS": "Washington Commanders", "WSH": "Washington Commanders",
}


def red_zone() -> dict[str, Any]:
    saved = _ensure()
    return {"teams": saved.get("teams") or {}, "backs": saved.get("backs") or []}


def positions() -> dict[str, str]:
    path = out_dir() / "spots.json"
    saved = read_json(path, {})
    spots = saved.get("spots") if isinstance(saved, dict) else None
    if isinstance(spots, dict) and spots and time.time() - float(saved.get("at") or 0) < _TTL:
        return spots
    try:
        request = urllib.request.Request(_ROSTER, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8")
        found: dict[str, str] = {}
        for row in csv.DictReader(io.StringIO(text)):
            full, pos = str(row.get("full_name") or "").strip(), str(row.get("position") or "").strip()
            if full and pos:
                found[full] = pos
        if found:
            write_json(path, {"at": time.time(), "spots": found})
        return found
    except Exception:  # noqa: BLE001
        return spots if isinstance(spots, dict) else {}


def plays() -> dict[str, Any]:
    saved = _ensure()
    return {
        "teams": saved.get("teams") or {},
        "players": saved.get("players") or {},
        "goal": saved.get("goal") or {},
        "stops": saved.get("stops") or {},
    }


def _ensure() -> dict[str, Any]:
    path = out_dir() / "zone.json"
    saved = read_json(path, {})
    if _fresh(saved):
        return saved
    try:
        built = _build()
    except Exception:  # noqa: BLE001
        built = {}
    if built.get("teams"):
        write_json(path, {"at": time.time(), **built})
        return {"at": time.time(), **built}
    return saved if isinstance(saved, dict) else {}


def _fresh(saved: Any) -> bool:
    if not isinstance(saved, dict) or time.time() - float(saved.get("at") or 0) >= _TTL:
        return False
    teams = saved.get("teams") if isinstance(saved.get("teams"), dict) else {}
    sample = next(iter(teams.values()), {}) if teams else {}
    stop = next(iter((saved.get("stops") or {}).values()), {}) if isinstance(saved.get("stops"), dict) else {}
    return isinstance(sample, dict) and "back" in sample and "glRun" in sample and isinstance(saved.get("players"), dict) and "rushTd" in stop


def _build() -> dict[str, Any]:
    rb_ids, backs, by_id = _roster()
    teams, players, goal, stops = _scan(rb_ids, by_id)
    return {"teams": teams, "backs": backs, "players": players, "goal": goal, "stops": stops}


def _roster() -> tuple[set[str], list[str], dict[str, str]]:
    request = urllib.request.Request(_ROSTER, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8")
    ids: set[str] = set()
    names: set[str] = set()
    by_id: dict[str, str] = {}
    for row in csv.DictReader(io.StringIO(text)):
        gsis = str(row.get("gsis_id") or "")
        full = str(row.get("full_name") or "").strip()
        if gsis and full:
            by_id[gsis] = full
        if str(row.get("position") or "") != "RB":
            continue
        if gsis:
            ids.add(gsis)
        if full:
            names.add(full)
    return ids, sorted(names), by_id


def _scan(rb_ids: set[str], by_id: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    request = urllib.request.Request(_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = gzip.decompress(response.read())
    games: dict[str, set[str]] = {}
    passes: dict[str, int] = {}
    runs: dict[str, int] = {}
    aimed: dict[str, int] = {}
    gl_pass: dict[str, int] = {}
    gl_run: dict[str, int] = {}
    rush_n: dict[str, int] = {}
    tgt_n: dict[str, int] = {}
    players: dict[str, dict[str, Any]] = {}
    sides: dict[str, dict[str, int]] = {}
    stops: dict[str, dict[str, int]] = {}
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8"))):
        if str(row.get("season_type") or "REG") != "REG":
            continue
        kind = str(row.get("play_type") or "")
        if kind not in {"pass", "run"}:
            continue
        name = _TEAMS.get(str(row.get("posteam") or ""))
        if not name:
            continue
        games.setdefault(name, set()).add(str(row.get("game_id") or ""))
        try:
            spot = float(row.get("yardline_100") or "")
        except (TypeError, ValueError):
            spot = 100.0
        scored = str(row.get("touchdown") or "") in {"1", "1.0"}
        raw_id = row.get("rusher_player_id") if kind == "run" else row.get("receiver_player_id")
        who = by_id.get(str(raw_id or ""))
        if who:
            _touch(players, sides, who, name, kind, spot, scored)
        if kind == "run":
            rush_n[name] = rush_n.get(name, 0) + 1
        else:
            tgt_n[name] = tgt_n.get(name, 0) + 1
        if spot <= 20:
            if kind == "pass":
                passes[name] = passes.get(name, 0) + 1
                if str(row.get("receiver_player_id") or "") in rb_ids:
                    aimed[name] = aimed.get(name, 0) + 1
            else:
                runs[name] = runs.get(name, 0) + 1
        foe = _TEAMS.get(str(row.get("defteam") or ""))
        if foe:
            bag = stops.setdefault(foe, {"plays": 0, "td": 0, "rushTd": 0, "rushPlays": 0, "rushYds": 0, "passTd": 0, "passPlays": 0})
            try:
                yards = int(round(float(row.get("yards_gained") or 0)))
            except (TypeError, ValueError):
                yards = 0
            if kind == "run":
                bag["rushPlays"] += 1
                bag["rushYds"] += yards
                if scored:
                    bag["rushTd"] += 1
            else:
                bag["passPlays"] += 1
                if scored:
                    bag["passTd"] += 1
            if spot <= 5:
                bag["plays"] += 1
                if scored:
                    bag["td"] += 1
        if spot <= 5:
            if kind == "pass":
                gl_pass[name] = gl_pass.get(name, 0) + 1
            else:
                gl_run[name] = gl_run.get(name, 0) + 1
    teams = _teams(games, passes, runs, aimed, gl_pass, gl_run, rush_n, tgt_n)
    for who, counts in sides.items():
        if who in players and counts:
            players[who]["team"] = max(counts, key=counts.get)
    goal = {name: {"pass": gl_pass.get(name, 0), "run": gl_run.get(name, 0)} for name in set(gl_pass) | set(gl_run)}
    return teams, players, goal, stops


def _touch(players: dict[str, dict[str, Any]], sides: dict[str, dict[str, int]], who: str, team: str, kind: str, spot: float, scored: bool) -> None:
    row = players.setdefault(who, {"rush": 0, "tgt": 0, "rzRush": 0, "rzTgt": 0, "glRush": 0, "glTgt": 0, "tdRush": 0, "tdCatch": 0, "team": team})
    bag = sides.setdefault(who, {})
    bag[team] = bag.get(team, 0) + 1
    rush = kind == "run"
    if rush:
        row["rush"] += 1
        if scored:
            row["tdRush"] += 1
    else:
        row["tgt"] += 1
        if scored:
            row["tdCatch"] += 1
    if spot <= 20:
        row["rzRush" if rush else "rzTgt"] += 1
    if spot <= 5:
        row["glRush" if rush else "glTgt"] += 1


def _teams(games: dict[str, set[str]], passes: dict[str, int], runs: dict[str, int], aimed: dict[str, int], gl_pass: dict[str, int], gl_run: dict[str, int], rush_n: dict[str, int], tgt_n: dict[str, int]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for name, seen in games.items():
        thrown = passes.get(name, 0)
        rushed = runs.get(name, 0)
        total = thrown + rushed
        played = len([game for game in seen if game])
        if played <= 0 or total <= 0:
            continue
        rate = round(total / played, 1)
        shown = str(int(rate)) if rate == int(rate) else f"{rate:.1f}"
        share = round(100 * thrown / total)
        gl_total = gl_pass.get(name, 0) + gl_run.get(name, 0)
        found[name] = {
            "plays": shown, "pass": share, "run": 100 - share,
            "back": round(100 * aimed.get(name, 0) / thrown) if thrown else 0,
            "rush": rush_n.get(name, 0), "tgt": tgt_n.get(name, 0), "rz": total,
            "glPass": round(100 * gl_pass.get(name, 0) / gl_total) if gl_total else 0,
            "glRun": round(100 * gl_run.get(name, 0) / gl_total) if gl_total else 0,
            "glPlays": gl_total,
        }
    return found


def main() -> None:
    print(json.dumps(red_zone()))


if __name__ == "__main__":
    main()
