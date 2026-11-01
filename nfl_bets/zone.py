"""Red-zone plays per game, and the pass and run split, for each NFL team."""

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
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB": "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "JAC": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs",
    "LV": "Las Vegas Raiders",
    "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams",
    "LA": "Los Angeles Rams",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE": "New England Patriots",
    "NO": "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SF": "San Francisco 49ers",
    "SEA": "Seattle Seahawks",
    "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
    "WSH": "Washington Commanders",
}


def red_zone() -> dict[str, Any]:
    path = out_dir() / "zone.json"
    saved = read_json(path, {})
    sample = next(iter(saved["teams"].values()), {}) if isinstance(saved, dict) and isinstance(saved.get("teams"), dict) else {}
    if isinstance(saved, dict) and time.time() - float(saved.get("at") or 0) < _TTL and isinstance(sample, dict) and "back" in sample and isinstance(saved.get("backs"), list):
        return {"teams": saved["teams"], "backs": saved["backs"]}
    back_ids, backs = _backs()
    teams = _count(back_ids)
    if teams:
        write_json(path, {"at": time.time(), "teams": teams, "backs": backs})
    return {"teams": teams, "backs": backs}


def _backs() -> tuple[set[str], list[str]]:
    request = urllib.request.Request(_ROSTER, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8")
    ids: set[str] = set()
    names: set[str] = set()
    for row in csv.DictReader(io.StringIO(text)):
        if str(row.get("position") or "") != "RB":
            continue
        if row.get("gsis_id"):
            ids.add(str(row["gsis_id"]))
        if row.get("full_name"):
            names.add(str(row["full_name"]))
    return ids, sorted(names)


def _count(back_ids: set[str]) -> dict[str, dict[str, Any]]:
    request = urllib.request.Request(_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = gzip.decompress(response.read())
    games: dict[str, set[str]] = {}
    passes: dict[str, int] = {}
    runs: dict[str, int] = {}
    aimed: dict[str, int] = {}
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
            continue
        if spot > 20:
            continue
        if kind == "pass":
            passes[name] = passes.get(name, 0) + 1
            if str(row.get("receiver_player_id") or "") in back_ids:
                aimed[name] = aimed.get(name, 0) + 1
        else:
            runs[name] = runs.get(name, 0) + 1
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
        found[name] = {"plays": shown, "pass": share, "run": 100 - share, "back": round(100 * aimed.get(name, 0) / thrown) if thrown else 0}
    return found


def main() -> None:
    print(json.dumps(red_zone()))


if __name__ == "__main__":
    main()
