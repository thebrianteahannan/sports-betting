"""A few anytime touchdown prices that still sit under a hot recent run.

The price has to be at least 8 points under the last 4 games, and those 4
have to be hotter than the longer log. The note names the front, the
touchdowns that front has allowed, and the players in it.
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from time import time
from typing import Any
from urllib.parse import quote

from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json
from nfl_bets.td_read import _last, _num, _season

_REFERER = "https://www.espn.com/"
_TTL = 6 * 3600
_CACHE = "td_few.json"
_CLUBS = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}
_ALIAS = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR"}


def few(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    wanted = []
    seen: set[str] = set()
    for row in rows:
        name = str(row.get("name") or "").strip()
        if not name or name.casefold() in seen:
            continue
        try:
            odds = int(row.get("odds"))
        except (TypeError, ValueError):
            continue
        if odds == 0:
            continue
        seen.add(name.casefold())
        wanted.append({"name": name, "odds": odds, "match": str(row.get("match") or "")})
    if not wanted:
        return []
    cache = _load()
    if wanted:
        _active(str((_player(wanted[0]["name"], cache) or {}).get("team") or "SEA"), cache)
    with ThreadPoolExecutor(max_workers=6) as pool:
        facts = list(pool.map(lambda row: _fact(row, cache), wanted))
    _save(cache)
    by_name = {fact["name"]: fact for fact in facts if fact}
    ordered = [by_name[row["name"]] for row in wanted if row["name"] in by_name]
    try:
        from nfl_bets.td_dive import dive
        return dive(ordered)
    except Exception:  # noqa: BLE001
        return [{"name": row["name"], "line": row["line"], "summary": row["line"], "parts": []} for row in ordered]


def _fact(row: dict[str, Any], cache: dict[str, Any]) -> dict[str, Any] | None:
    name, odds = row["name"], int(row["odds"])
    pack = _player(name, cache)
    if not pack:
        return None
    recent, prior = list(pack.get("recent") or []), list(pack.get("prior") or [])
    played = int(pack.get("played") or 0)
    listed = _backs(str(pack.get("team") or ""), cache)
    index = next((i for i, who in enumerate(listed) if who.casefold() == name.casefold()), -1)
    if index >= 0:
        kind = "rush"
    else:
        rush = sum(game["rush"] for game in recent)
        rec = sum(game["rec"] for game in recent)
        kind = "rush" if rush > rec else "pass"
    back = _returning(name, cache) if kind == "rush" else ""
    asked = round(100 * _implied(odds))
    return {"name": name, "line": _line(name, recent, prior, played, asked, back), "back": back, "kind": kind, "team": str(pack.get("team") or ""), "played": played, "asked": asked, "match": row["match"], "recent": recent, "prior": prior, "index": index}


def _line(name: str, recent: list[dict[str, Any]], prior: list[dict[str, Any]], played: int, asked: int, back: str) -> str:
    who = _last(name)
    if played <= 0:
        return f"{who} has no game this season. There is no recent scoring to put under this price."
    if back:
        return back
    window = recent[:4]
    hits = sum(1 for game in window if game["td"])
    n = len(window)
    if n < 3:
        return f"The price is {asked}%."
    recent_pct = round(100 * hits / n)
    scored = f"{who} scored a touchdown in {hits} of the last {n} games."
    prior_hits = sum(1 for game in prior if game["td"]) if len(prior) >= 3 else None
    prior_pct = round(100 * prior_hits / len(prior)) if prior_hits is not None else None
    if prior_pct is not None and prior_pct < asked < recent_pct:
        when = "Earlier this season" if played > n else "Last season"
        got = f"{prior_hits} of {len(prior)}" if prior_hits else f"none of {len(prior)}"
        return f"{scored} {when}, {got}. The {asked}% price is under those last {n} and over those earlier games."
    colder = prior_pct is not None and prior_pct >= recent_pct + 8
    if abs(asked - recent_pct) <= 6:
        return f"{scored} That run is colder than the earlier games, and the price is on it." if colder else f"{scored} The {asked}% price is on that run, not under it."
    if asked + 6 <= recent_pct:
        return f"{scored} The {asked}% price is under that run."
    return f"{scored} The {asked}% price is over that run."


def _join(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


def _player(name: str, cache: dict[str, Any]) -> dict[str, Any] | None:
    bag = cache.setdefault("players", {})
    saved = bag.get(name)
    if isinstance(saved, dict) and saved.get("year") == _season() and time() - float(saved.get("at") or 0) < _TTL and saved.get("recent") is not None:
        return saved
    try:
        data = get_json(f"https://site.web.api.espn.com/apis/common/v3/search?query={quote(name)}&limit=5&type=player", referer=_REFERER, timeout=12)
        hits = [item for item in data.get("items") or [] if str(item.get("league") or "") == "nfl"]
        hit = next((item for item in hits if str(item.get("displayName") or "").casefold() == name.casefold()), None)
        if not hit or not hit.get("id"):
            return None
        athlete_id = str(hit["id"])
        page = get_json(f"https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete_id}", referer=_REFERER, timeout=12)
        team = str(((page.get("athlete") or {}).get("team") or {}).get("abbreviation") or "")
        now = _games(athlete_id, 0)
        rest = now[4:]
        last = _games(athlete_id, _season() - 1) if len(rest) < 3 else []
        prior = rest if len(rest) >= 3 else last if len(last) >= 5 else []
        saved = {"at": time(), "year": _season(), "team": _ALIAS.get(team, team), "played": len(now), "recent": now[:4], "prior": prior}
    except Exception:  # noqa: BLE001
        return None
    bag[name] = saved
    return saved


def _returning(name: str, cache: dict[str, Any] | None = None) -> str:
    own = cache is None
    cache = _load() if cache is None else cache
    bag = cache.setdefault("back", {})
    saved = bag.get(name)
    if isinstance(saved, dict) and time() - float(saved.get("at") or 0) < _TTL:
        line = str(saved.get("line") or "")
        if "carries" in line or not line:
            if own:
                _save(cache)
            return line
    line = ""
    pack = _player(name, cache)
    team = str((pack or {}).get("team") or "")
    order = _backs(team, cache) if team else []
    index = next((i for i, who in enumerate(order) if who.casefold() == name.casefold()), -1)
    active = _active(team, cache) if index > 0 else set()
    for lead in order[:index]:
        if lead.casefold() not in active:
            continue
        lead_pack = _player(lead, cache)
        if lead_pack and int(lead_pack.get("played") or 0) == 0:
            line = f"{_last(name)}'s scores came while he had {_last(lead)}'s carries. {_last(lead)} has those carries tonight."
            break
    bag[name] = {"at": time(), "line": line}
    if own:
        _save(cache)
    return line


def _backs(abbr: str, cache: dict[str, Any]) -> list[str]:
    bag = cache.setdefault("backs", {})
    saved = bag.get(abbr)
    if isinstance(saved, dict) and time() - float(saved.get("at") or 0) < _TTL:
        return list(saved.get("names") or [])
    names: list[str] = []
    try:
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/depthcharts", referer=_REFERER, timeout=12)
        best: list[str] = []
        for block in data.get("depthchart") or []:
            athletes = ((block.get("positions") or {}).get("rb") or {}).get("athletes") or []
            got = [str(athlete.get("displayName") or "").strip() for athlete in athletes if str(athlete.get("displayName") or "").strip()]
            if len(got) > len(best):
                best = got
        names = best
    except Exception:  # noqa: BLE001
        names = []
    bag[abbr] = {"at": time(), "names": names}
    return names


def _active(abbr: str, cache: dict[str, Any]) -> set[str]:
    saved = cache.get("report")
    if not (isinstance(saved, dict) and time() - float(saved.get("at") or 0) < _TTL and isinstance(saved.get("teams"), dict) and isinstance(saved.get("outs"), dict)):
        teams: dict[str, list[str]] = {}
        outs: dict[str, list[str]] = {}
        try:
            data = get_json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries", referer=_REFERER, timeout=20)
            for team in data.get("injuries") or []:
                nick = _CLUBS.get(str(team.get("displayName") or ""), "")
                active: list[str] = []
                for row in team.get("injuries") or []:
                    who = str((row.get("athlete") or {}).get("displayName") or "").strip()
                    status = str(row.get("status") or "").lower()
                    if not who:
                        continue
                    if status == "active":
                        active.append(who.casefold())
                    if status in {"out", "doubtful", "questionable", "injured reserve", "suspension"}:
                        kind = row.get("details") if isinstance(row.get("details"), dict) else {}
                        outs[who.casefold()] = [status, str(kind.get("type") or "")]
                if nick:
                    teams[nick] = active
        except Exception:  # noqa: BLE001
            teams, outs = {}, {}
        cache["report"] = {"at": time(), "teams": teams, "outs": outs}
        saved = cache["report"]
    return set((saved.get("teams") or {}).get(abbr) or [])


def _outs() -> dict[str, tuple[str, str]]:
    cache = _load()
    _active("CHI", cache)
    _save(cache)
    found = {}
    for key, row in ((cache.get("report") or {}).get("outs") or {}).items():
        if isinstance(row, list) and row:
            found[str(key)] = (str(row[0]), str(row[1]) if len(row) > 1 else "")
    return found


def _mark(count: int, who: str, status: str, hurt: str) -> str:
    if status == "injured reserve":
        return f"{who} had {count}, and he is on injured reserve"
    body = hurt.strip()
    extra = ""
    if body and body.casefold() not in {"coach's decision", "undisclosed", "rest"}:
        extra = f" with {'an' if body[:1].lower() in 'aeiou' else 'a'} {body.lower()}"
    verb = "had" if status in {"out", "doubtful", "injured reserve"} else "has"
    return f"{who} {verb} {count}, and he is {status}{extra}"


def _games(athlete_id: str, year: int) -> list[dict[str, Any]]:
    url = f"https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete_id}/gamelog?season={year or _season()}"
    try:
        log = get_json(url, referer=_REFERER, timeout=12)
    except Exception:  # noqa: BLE001
        return []
    names = [str(item) for item in log.get("names") or []]
    if "rushingTouchdowns" not in names and "receivingTouchdowns" not in names:
        return []
    rush_i = names.index("rushingTouchdowns") if "rushingTouchdowns" in names else -1
    rec_i = names.index("receivingTouchdowns") if "receivingTouchdowns" in names else -1
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for season in log.get("seasonTypes") or []:
        label = str(season.get("displayName") or "").lower()
        if "post" in label or "pre" in label:
            continue
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
                rows.append({"td": rush + rec > 0, "rush": rush, "rec": rec})
    return rows


def _opponent(team: str, match: str) -> str:
    sides = [part.strip() for part in re.split(r"\s+@\s+|\s+v\s+", match) if part.strip()]
    abbrs = [_CLUBS.get(side, "") for side in sides]
    if team and team in abbrs and len(abbrs) == 2:
        return abbrs[1] if abbrs[0] == team else abbrs[0]
    return ""


def _card(abbr: str, cache: dict[str, Any]) -> dict[str, Any]:
    bag = cache.setdefault("cards", {})
    saved = bag.get(abbr)
    if isinstance(saved, dict) and time() - float(saved.get("at") or 0) < _TTL:
        return saved
    card: dict[str, Any] = {"at": time(), "scheme": "", "linebackers": [], "corners": []}
    try:
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/depthcharts", referer=_REFERER, timeout=12)
        block = _front(data.get("depthchart") or [])
        if block:
            card["scheme"] = _scheme(str(block.get("name") or ""))
            positions = block.get("positions") or {}
            card["linebackers"] = _starters(positions, lambda key: "lb" in key)[:4]
            card["corners"] = _starters(positions, lambda key: key in {"lcb", "rcb", "cb", "nb", "scb", "nickel"})[:3]
    except Exception:  # noqa: BLE001
        pass
    bag[abbr] = card
    return card


def _front(blocks: list[dict[str, Any]]) -> dict[str, Any] | None:
    defense = []
    for block in blocks:
        low = str(block.get("name") or "").lower()
        if "special" in low:
            continue
        positions = block.get("positions") or {}
        if any("lb" in str(key) or str(key) in {"lcb", "rcb", "cb"} for key in positions):
            defense.append(block)
    return next((block for block in defense if "base" in str(block.get("name") or "").lower()), None) or (defense[0] if defense else None)


def _scheme(name: str) -> str:
    found = re.search(r"\d\s*-\s*\d", name)
    if found:
        return f"a {found.group().replace(' ', '')}"
    low = name.lower()
    if "nickel" in low:
        return "nickel"
    if "dime" in low:
        return "dime"
    return ""


def _starters(positions: dict[str, Any], want) -> list[str]:
    names = []
    for key, slot in positions.items():
        if not want(str(key)):
            continue
        for athlete in (slot or {}).get("athletes") or []:
            if any(str((item or {}).get("status") or "").lower() in {"out", "doubtful"} for item in athlete.get("injuries") or []):
                continue
            shown = str(athlete.get("displayName") or "").strip()
            if shown:
                names.append(shown)
                break
    return names


def _implied(price: int) -> float:
    return abs(price) / (abs(price) + 100) if price < 0 else 100 / (price + 100)


def _load() -> dict[str, Any]:
    data = read_json(out_dir() / _CACHE, {})
    return data if isinstance(data, dict) else {}


def _save(cache: dict[str, Any]) -> None:
    write_json(out_dir() / _CACHE, cache)


def main() -> None:
    try:
        raw = json.load(sys.stdin)
    except json.JSONDecodeError:
        raw = {}
    rows = raw.get("rows") if isinstance(raw, dict) else []
    print(json.dumps({"picks": few(rows if isinstance(rows, list) else [])}))


if __name__ == "__main__":
    main()
