"""How an NFL game should play out, and the bet each script sets up.

Final NFL margins land around the spread with about 13.5 points of scatter.
A team up two scores runs the ball to kill the clock, and the team chasing
throws. Each player's own games split by his team's final margin, 8 or more
either way, say whose volume moves with the script.
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from math import erf, sqrt
from time import time
from typing import Any

from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json
from nfl_bets.sway import _nick

_CACHE = "nfl_script_v2.json"
_TTL = 6 * 3600
_SCATTER = 13.5
_GAP = 8
_FEW = 3
_REF = "https://www.espn.com/"
_SKIP = re.compile(r"\b(qtr|quarter|half|each|most|touchdowns?|tds?|longest|1st|2nd|3rd|first|under)\b|\d+\+ yard", re.I)
_KINDS = (
    (re.compile(r"rush(?:ing)?\s*\+\s*rec(?:eiving)?", re.I), ("rushingYards", "receivingYards"), "rushing + receiving yards"),
    (re.compile(r"passing (?:yds|yards)", re.I), ("passingYards",), "passing yards"),
    (re.compile(r"pass(?:ing)? attempts", re.I), ("passingAttempts",), "pass attempts"),
    (re.compile(r"completions", re.I), ("completions",), "completions"),
    (re.compile(r"rushing (?:yds|yards)", re.I), ("rushingYards",), "rushing yards"),
    (re.compile(r"rushing attempts|carries", re.I), ("rushingAttempts",), "carries"),
    (re.compile(r"receiving (?:yds|yards)", re.I), ("receivingYards",), "receiving yards"),
    (re.compile(r"receptions", re.I), ("receptions",), "receptions"),
)
_VOLUME = {"RB": ("rushingAttempts", 3, "carries", "times"), "QB": ("passingAttempts", 5, "throws", "times"), "WR": ("receivingTargets", 2, "is targeted", "times"), "TE": ("receivingTargets", 2, "is targeted", "times")}
_DRIVES = {"rushingAttempts": {"rushingAttempts", "rushingYards"}, "passingAttempts": {"passingAttempts", "passingYards", "completions"}, "receivingTargets": {"receptions", "receivingYards"}}
_INJURIES = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"
_CLEARED = re.compile(r"not listed on|full participant|practiced fully|cleared to (play|return)|no injury designation|will play|expected to play", re.I)
_BIG = {"RB": 8, "QB": 15, "WR": 4, "TE": 4}
_MATES = {"RB": ("RB",), "QB": ("QB",), "WR": ("WR", "TE"), "TE": ("WR", "TE")}
_NOUN = {"RB": "carries", "QB": "throws", "WR": "targets", "TE": "targets"}
_cache: dict[str, Any] = {}


def script(game: dict[str, Any]) -> dict[str, Any]:
    away, home = str(game.get("away") or ""), str(game.get("home") or "")
    if not away or not home:
        return {}
    spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
    try:
        home_line = float(spread.get("homeLine"))
    except (TypeError, ValueError):
        home_line = 0.0
    fav, dog, lead = (home, away, -home_line) if home_line <= 0 else (away, home, home_line)
    fav_up, dog_up = _tail(lead), _tail(-lead)
    _load()
    props = [row for row in game.get("props") or [] if isinstance(row, dict)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        sides = dict(zip((fav, dog), pool.map(lambda team: _side(team, props), (fav, dog))))
    hurt = _hurt()
    outs = [part for team in (away, home) for part in _missing(team, sides[team], hurt.get(team.casefold(), []))]
    _save()
    head = f"{_nick(fav)} by {_num(lead)}." if lead >= 0.5 else "No favorite."
    summary = f"{head} {_pct(1 - fav_up - dog_up)} of games at this spread finish within one score. The {_nick(fav)} win by {_GAP}+ in {_pct(fav_up)}, the {_nick(dog)} in {_pct(dog_up)}."
    parts = outs
    for up, down, chance in ((fav, dog, fav_up), (dog, fav, dog_up)):
        lines = [line for line in (_mover(sides[up], "ahead", chance), _mover(sides[down], "behind", chance)) if line]
        if lines:
            parts.append({"title": f"If the {_nick(up)} pull away", "text": " ".join(row[0] for row in lines), "proof": "\n".join(row[1] for row in lines if row[1])})
    return {"summary": summary, "parts": parts, "fav": round(fav_up, 3), "dog": round(dog_up, 3)}


def _tail(lead: float) -> float:
    return 1 - _cdf((_GAP - 0.5 - lead) / _SCATTER)


def _cdf(x: float) -> float:
    return 0.5 * (1 + erf(x / sqrt(2)))


def _side(team: str, props: list[dict[str, Any]]) -> list[dict[str, Any]]:
    roster = _roster(team)
    names = [row for row in roster if any(_owns(row["name"], prop) for prop in props)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        logs = list(pool.map(lambda row: _log(row["id"]), names))
    rows = []
    for row, games in zip(names, logs):
        if len(games) >= _FEW * 2:
            rows.append({**row, "games": games, "props": [prop for prop in props if _owns(row["name"], prop)]})
    return rows


def _mover(rows: list[dict[str, Any]], state: str, chance: float) -> tuple[str, str] | None:
    best = None
    for row in rows:
        spec = _VOLUME.get(row["pos"])
        if not spec:
            continue
        key, need, verb, unit = spec
        inside = [game for game in row["games"] if _state(game) == state]
        outside = [game for game in row["games"] if _state(game) != state]
        if len(inside) < _FEW or len(outside) < _FEW or not any(key in game["stats"] for game in row["games"]):
            continue
        a, b = _mean(inside, (key,)), _mean(outside, (key,))
        if a - b < need:
            continue
        bets = [bet for bet in _bets(row, inside, outside, chance) if bet["keys"] & _DRIVES[key] and bet["in"] > bet["out"]]
        if not bets:
            continue
        pick = max(bets, key=lambda bet: bet["chance"] - implied_prob(bet["odds"]))
        edge = pick["chance"] - implied_prob(pick["odds"])
        if best is None or edge > best[0]:
            when = f"win by {_GAP} or more" if state == "ahead" else f"lose by {_GAP} or more"
            text = f"{row['name']} {verb} {a:.0f} {unit} a game when the {_nick(row['team'])} {when}, {b:.0f} in their other games."
            best = (edge, text, _proof(pick, state))
    return (best[1], best[2]) if best else None


def _hurt() -> dict[str, list[str]]:
    try:
        data = get_json(_INJURIES, referer=_REF, timeout=12)
    except (RuntimeError, OSError, TypeError, ValueError):
        return {}
    found: dict[str, list[str]] = {}
    for block in data.get("injuries") or []:
        for item in block.get("injuries") or []:
            status, note = str(item.get("status") or "").lower(), str(item.get("shortComment") or "")
            name = str((item.get("athlete") or {}).get("displayName") or "")
            if name and status in ("out", "injured reserve") and not _CLEARED.search(note):
                found.setdefault(str(block.get("displayName") or "").casefold(), []).append(name)
    return found


def _missing(team: str, rows: list[dict[str, Any]], gone: list[str]) -> list[dict[str, Any]]:
    roster, parts = {row["name"].casefold(): row for row in _roster(team)}, []
    recent = sorted({game["date"][:10] for row in rows for game in row["games"]}, reverse=True)[:4]
    for name in gone:
        out = roster.get(name.casefold())
        if not out:
            continue
        key, _need, verb, unit = _VOLUME[out["pos"]]
        logs = [game for game in _log(out["id"]) if key in game["stats"]]
        club = logs[0].get("club", "") if logs else ""
        logs = [game for game in logs if game.get("club", "") == club]
        his = _mean(logs[:8], (key,))
        early = [game for game in logs if _sum(game, (key,)) < 0.4 * his]
        played = {game["date"][:10] for game in logs if game not in early}
        if len(logs) < _FEW or not played or his < _BIG[out["pos"]] or (len(recent) == 4 and max(played) < recent[-1]):
            continue
        short = re.sub(r"\s+(jr|sr|ii|iii|iv|v)\.?$", "", out["name"], flags=re.I).split()[-1]
        left = f" He left the last game after {_sum(logs[0], (key,)):.0f} {_NOUN[out['pos']]}." if logs[0] in early else ""
        took = max(((row, _sum(game, (_VOLUME[row["pos"]][0],))) for row in rows if row["pos"] in _MATES[out["pos"]] and row["name"] != out["name"] for game in row["games"] if left and game["date"][:10] == logs[0]["date"][:10]), key=lambda pair: pair[1], default=None)
        if took and took[1] >= _BIG[took[0]["pos"]]:
            left += f" {took[0]['name']} had {took[1]:.0f} {_NOUN[took[0]['pos']]} in that game."
        lines, proofs, next_up = [f"{out['name']} is out. He {verb} {his:.0f} {unit} a game.{left}"], [], None
        for row in rows:
            spec = _VOLUME.get(row["pos"])
            if row["name"] == out["name"] or row["pos"] not in _MATES[out["pos"]] or not spec:
                continue
            mine, need, mine_verb, mine_unit = spec
            span = [game for game in row["games"] if game["date"][:10] >= min(played) and game.get("club", "") == club]
            without = [game for game in span if game["date"][:10] not in played]
            with_him = [game for game in span if game["date"][:10] in played]
            a, b = _mean(without, (mine,)), _mean(with_him, (mine,))
            if with_him and len(without) < 2:
                if next_up is None or b > next_up[1]:
                    next_up = (row, b, mine_verb, mine_unit)
                continue
            if not without or (with_him and abs(a - b) < need) or (not with_him and a < _BIG[row["pos"]]):
                continue
            count = f"{len(without)} game{'s' if len(without) > 1 else ''}"
            lines.append(f"{row['name']} {mine_verb} {a:.0f} {mine_unit} a game in {count} without {short}" + (f", {b:.0f} with him." if with_him else "."))
            bets = [bet for bet in _bets(row, without, with_him, 1.0) if bet["keys"] & _DRIVES[mine] and bet["in"] > bet["out"]] if with_him and len(without) >= _FEW else []
            if bets:
                pick = max(bets, key=lambda bet: bet["chance"] - implied_prob(bet["odds"]))
                price, won = f"+{pick['odds']}" if pick["odds"] > 0 else str(pick["odds"]), 5 * (american_decimal(pick["odds"]) - 1)
                hit, n = pick["hits"][0], pick["hits"][1]
                proofs.append(f"{pick['label']}, {price}: {hit} of {n} games without {short}, so that is {hit / n * 100:.0f}%. {price} needs {implied_prob(pick['odds']) * 100:.1f}%. $5 wins ${won:.2f}.")
        if len(lines) == 1 and next_up:
            row, b, mine_verb, mine_unit = next_up
            lines.append(f"{row['name']} is next in line. He {mine_verb} {b:.0f} {mine_unit} a game with {short} playing, and the job is his now.")
        if len(lines) > 1:
            parts.append({"title": f"{out['name']} is out", "text": " ".join(lines), "proof": "\n".join(proofs)})
    return parts


def _bets(row: dict[str, Any], inside: list[dict[str, Any]], outside: list[dict[str, Any]], chance: float) -> list[dict[str, Any]]:
    games, found = row["games"], []
    for prop in row["props"]:
        label, market = str(prop.get("label") or ""), str(prop.get("market") or "")
        text = f"{market} {label}"
        if _SKIP.search(text):
            continue
        kind = next(((keys, noun) for pattern, keys, noun in _KINDS if pattern.search(text)), None)
        bar = re.search(r"(\d+(?:\.\d+)?)", label[len(row["name"]):])
        try:
            odds = int(prop.get("odds"))
        except (TypeError, ValueError):
            continue
        if not kind or not bar or odds < -250 or not any(key in game["stats"] for game in games for key in kind[0]):
            continue
        line, over = float(bar.group(1)), bool(re.search(r"\bover\b", label, re.I))
        hit = lambda game: (_sum(game, kind[0]) > line) if over else (_sum(game, kind[0]) >= line)
        a, b = sum(1 for game in inside if hit(game)), sum(1 for game in outside if hit(game))
        cut = re.match(r"(.*?\d+(?:\.\d+)?\+?)", label)
        shown = f"{cut.group(1)} {kind[1]}" if cut else f"{label} {kind[1]}"
        found.append({"label": shown, "odds": odds, "keys": set(kind[0]), "hits": (a, len(inside), b, len(outside)), "in": a / len(inside), "out": b / len(outside), "chance": a / len(inside) * chance + b / len(outside) * (1 - chance)})
    return found


def _proof(bet: dict[str, Any], state: str) -> str:
    chance, need, odds = bet["chance"], implied_prob(bet["odds"]), bet["odds"]
    price = f"+{odds}" if odds > 0 else str(odds)
    won = 5 * (american_decimal(odds) - 1)
    a, n, b, m = bet["hits"]
    when = f"wins by {_GAP}+" if state == "ahead" else f"losses by {_GAP}+"
    return f"{bet['label']}, {price}: {a} of {n} {when} and {b} of {m} other games. At this spread that is {chance * 100:.0f}%. {price} needs {need * 100:.1f}%. $5 wins ${won:.2f}."


def _state(game: dict[str, Any]) -> str:
    return "ahead" if game["margin"] >= _GAP else "behind" if game["margin"] <= -_GAP else "close"


def _sum(game: dict[str, Any], keys: tuple[str, ...]) -> float:
    return sum(float(game["stats"].get(key) or 0) for key in keys)


def _mean(games: list[dict[str, Any]], keys: tuple[str, ...]) -> float:
    return sum(_sum(game, keys) for game in games) / len(games) if games else 0.0


def _owns(name: str, prop: dict[str, Any]) -> bool:
    low = name.casefold()
    return str(prop.get("label") or "").casefold().startswith(low) or str(prop.get("market") or "").casefold().startswith(low)


def _roster(team: str) -> list[dict[str, Any]]:
    rosters = _cache.setdefault("rosters", {})
    if team in rosters:
        return rosters[team]
    try:
        clubs = get_json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40", referer=_REF, timeout=12)
        pool = ((clubs.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams") or []
        club = next((row.get("team") or {} for row in pool if str((row.get("team") or {}).get("displayName") or "").casefold() == team.casefold()), {})
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{club.get('id')}/roster", referer=_REF, timeout=12) if club.get("id") else {}
    except (RuntimeError, OSError, TypeError, ValueError, IndexError):
        return []
    rows = []
    for group in data.get("athletes") or []:
        for item in group.get("items") or []:
            pos = str((item.get("position") or {}).get("abbreviation") or "")
            if pos in _VOLUME and item.get("id"):
                rows.append({"name": str(item.get("displayName") or ""), "id": str(item["id"]), "pos": pos, "team": team})
    rosters[team] = rows
    return rows


def _log(athlete: str) -> list[dict[str, Any]]:
    logs = _cache.setdefault("logs", {})
    if athlete in logs:
        return logs[athlete]
    rows, year = _season(athlete, None)
    if year:
        seen = {row["date"] for row in rows}
        rows += [row for row in _season(athlete, year - 1)[0] if row["date"] not in seen]
    rows.sort(key=lambda row: row["date"], reverse=True)
    logs[athlete] = rows[:30]
    return logs[athlete]


def _season(athlete: str, year: int | None) -> tuple[list[dict[str, Any]], int]:
    url = f"https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete}/gamelog" + (f"?season={year}" if year else "")
    try:
        data = get_json(url, referer=_REF, timeout=12)
    except (RuntimeError, OSError, TypeError, ValueError):
        return [], 0
    names, events, rows, seasons = [str(item) for item in data.get("names") or []], data.get("events") or {}, [], set()
    for block in data.get("seasonTypes") or []:
        label = str(block.get("displayName") or "")
        if re.search(r"preseason", label, re.I):
            continue
        found = re.search(r"(\d{4})", label)
        if found:
            seasons.add(int(found.group(1)))
        for cat in block.get("categories") or []:
            for item in cat.get("events") or []:
                event = events.get(str(item.get("eventId") or "")) or {}
                try:
                    gap = abs(float(event.get("homeTeamScore")) - float(event.get("awayTeamScore")))
                except (TypeError, ValueError):
                    continue
                sign = 1 if event.get("gameResult") == "W" else -1 if event.get("gameResult") == "L" else 0
                stats = {}
                for key, raw in zip(names, item.get("stats") or []):
                    try:
                        stats[key] = float(str(raw).replace(",", ""))
                    except ValueError:
                        continue
                rows.append({"date": str(event.get("gameDate") or ""), "margin": sign * gap, "stats": stats, "club": str((event.get("team") or {}).get("abbreviation") or "")})
    return rows, max(seasons) if seasons else 0


def _num(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def _pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def _load() -> None:
    data = read_json(out_dir() / _CACHE, {})
    if isinstance(data, dict) and time() - float(data.get("at") or 0) <= _TTL:
        _cache.update({"at": data.get("at"), "rosters": data.get("rosters") or {}, "logs": data.get("logs") or {}})
    else:
        _cache.update({"at": time(), "rosters": {}, "logs": {}})


def _save() -> None:
    write_json(out_dir() / _CACHE, {"at": _cache.get("at") or time(), "rosters": _cache.get("rosters") or {}, "logs": _cache.get("logs") or {}})


def main() -> None:
    try:
        raw = json.load(sys.stdin)
    except (ValueError, TypeError):
        raw = {}
    print(json.dumps(script(raw if isinstance(raw, dict) else {})))


if __name__ == "__main__":
    main()
