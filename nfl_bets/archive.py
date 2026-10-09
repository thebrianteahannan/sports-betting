"""Every offered ticket, with the pull time and a box-score result."""
from __future__ import annotations
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo
from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json
_LOCK = threading.Lock()
_ET = ZoneInfo("America/New_York")
_RESULTS = {"won", "lost", "push"}
_TTL = 120.0
_CACHE: dict[str, tuple[float, Any]] = {}
_CARDS = ("chalk", "four", "plus", "hits", "todayBet")
_PATHS = {
    "NFL": "football/nfl", "NCAAF": "football/college-football", "Football": "football/college-football",
    "WNBA": "basketball/wnba", "NBA": "basketball/nba", "NCAAB": "basketball/mens-college-basketball",
    "Basketball": "basketball/nba", "NHL": "hockey/nhl", "Hockey": "hockey/nhl",
    "MLB": "baseball/mlb", "Baseball": "baseball/mlb",
}
_ALIASES = {
    "receivingYards": ["receivingyards"], "receivingTouchdowns": ["receivingtouchdowns"],
    "rushingYards": ["rushingyards"], "rushingTouchdowns": ["rushingtouchdowns"],
    "passingYards": ["passingyards"], "passingTouchdowns": ["passingtouchdowns"],
    "receptions": ["receptions"],
    "rebounds": ["rebounds", "totalrebounds"], "points": ["points"],
    "assists": ["assists"],
    "shotsOnGoal": ["shotsongoal", "shotstotal"],
    "strikeouts": ["strikeouts", "pitchingstrikeouts"],
}
def record_offers(board: dict[str, Any]) -> list[dict[str, Any]]:
    with _LOCK:
        rows = _load()
        games = {str(game.get("id") or ""): game for game in board.get("games") or [] if isinstance(game, dict)}
        stamp = str(board.get("updatedAt") or "")
        for ticket in _from_board(board, games, stamp):
            prior = next((row for row in rows if _signature(row) == _signature(ticket)), None)
            if prior:
                prior["lastSeenAt"] = stamp or prior.get("lastSeenAt")
                continue
            rows.append(ticket)
        _grade(rows)
        _write(rows)
        return _sorted(rows)
def grade_open() -> list[dict[str, Any]]:
    with _LOCK:
        rows = _load()
        _grade(rows)
        _write(rows)
        return _sorted(rows)
def settle_archive(ticket_id: str, result: str) -> dict[str, Any]:
    if result not in _RESULTS:
        raise ValueError("Mark it won, lost, or push.")
    with _LOCK:
        rows = _load()
        found = next((row for row in rows if str(row.get("id")) == ticket_id), None)
        if not found:
            raise ValueError("That bet is not on record.")
        if found.get("result") != "open":
            raise ValueError("That bet is already marked.")
        found["result"] = result
        found["settledAt"] = _now()
        found["how"] = "marked here"
        _write(rows)
        return {"archive": _sorted(rows)}
def mark_good(ticket_id: str = "", card_id: str = "", board: dict[str, Any] | None = None, group: str = "", stars: int | None = None) -> dict[str, Any]:
    with _LOCK:
        rows = _load()
        found = _good_rows(rows, ticket_id, card_id, board or {}, group)
        if not found:
            raise ValueError("That bet is not on record yet.")
        want = _star_value(found, stars)
        for row in found:
            row["stars"] = want
            row["good"] = want > 0
            if want:
                row["goodAt"] = _now()
            else:
                row.pop("goodAt", None)
        _write(rows)
        return {"archive": _sorted(rows)}
def _star_value(found: list[dict[str, Any]], stars: int | None) -> int:
    def current(row: dict[str, Any]) -> int:
        saved = row.get("stars")
        if saved is not None and saved != "":
            return int(saved)
        return 1 if row.get("good") else 0
    if stars is None:
        return 0 if all(current(row) for row in found) else 1
    want = max(0, min(5, int(stars)))
    if want and all(current(row) == want for row in found):
        return 0
    return want
def _good_rows(rows: list[dict[str, Any]], ticket_id: str, card_id: str, board: dict[str, Any], group: str = "") -> list[dict[str, Any]]:
    if ticket_id:
        return [row for row in rows if str(row.get("id")) == ticket_id]
    games = {str(game.get("id") or ""): game for game in board.get("games") or [] if isinstance(game, dict)}
    tickets = [ticket for ticket in _from_board(board, games, "") if ticket.get("card") == card_id]
    if group:
        tickets = [ticket for ticket in tickets if str(ticket.get("title") or "").endswith(group)]
    keys = {_signature(ticket) for ticket in tickets}
    return [row for row in rows if _signature(row) in keys]
def _from_board(board: dict[str, Any], games: dict[str, dict], stamp: str) -> list[dict[str, Any]]:
    tickets: list[dict[str, Any]] = []
    for card_id in _CARDS:
        card = board.get(card_id)
        if not isinstance(card, dict):
            continue
        groups = [group for group in card.get("groups") or [] if isinstance(group, dict)]
        if groups:
            for group in groups:
                legs = [_leg(leg, card, games) for leg in group.get("legs") or [] if isinstance(leg, dict)]
                if legs:
                    tickets.append(_ticket(card_id, card, games, stamp, legs, group))
            continue
        legs = [_leg(leg, card, games) for leg in card.get("legs") or [] if isinstance(leg, dict)]
        if legs:
            tickets.append(_ticket(card_id, card, games, stamp, legs, None))
    return tickets
def _ticket(card_id: str, card: dict, games: dict, stamp: str, legs: list[dict], group: dict | None) -> dict[str, Any]:
    game = games.get(str(card.get("gameId") or ""), {})
    title = str(card.get("title") or "Bet")
    if group:
        title = f"{title} · {group.get('title') or 'Stack'}"
    price = _price(group.get("price") if group else card.get("american"))
    return {
        "id": uuid.uuid4().hex[:12],
        "card": card_id,
        "title": title,
        "game": str(card.get("game") or ""),
        "gameId": str(card.get("gameId") or ""),
        "espnId": str(game.get("espnId") or ""),
        "sport": str(game.get("sport") or ""),
        "kickoff": str(game.get("kickoff") or ""),
        "american": price,
        "impliedPct": card.get("impliedPct"),
        "offeredAt": stamp,
        "lastSeenAt": stamp,
        "live": bool(card.get("live")),
        "result": "open",
        "legs": legs,
    }
def _leg(raw: dict[str, Any], card: dict, games: dict) -> dict[str, Any]:
    label = str(raw.get("label") or "")
    market = str(raw.get("market") or "")
    runner = str(raw.get("runner") or "")
    head, sport, match = _split_label(label)
    game = _game_for(raw, card, games, match)
    text = f"{market} {runner} {head}"
    stat = _stat(text)
    return {
        "label": label,
        "odds": raw.get("odds"),
        "pct": str(raw.get("pct") or ""),
        "market": market,
        "player": _player(head, market, runner),
        "stat": stat,
        "line": _line(text, stat),
        "side": "under" if "under" in text.lower() else ("over" if stat == "total" else "plus"),
        "scope": _scope(text),
        "sport": sport or str(raw.get("sport") or game.get("sport") or card.get("sport") or ""),
        "match": match,
        "gameId": str(raw.get("gameId") or card.get("gameId") or ""),
        "espnId": str(game.get("espnId") or ""),
        "kickoff": str(raw.get("kickoff") or game.get("kickoff") or card.get("kickoff") or ""),
        "result": "open",
    }
def _game_for(raw: dict[str, Any], card: dict, games: dict, match: str) -> dict:
    found = games.get(str(raw.get("gameId") or card.get("gameId") or ""))
    if found:
        return found
    sides = [_side(part) for part in re.split(r"\s@\s|\sat\s", match)]
    sides = [side for side in sides if side]
    if len(sides) < 2:
        return {}
    for game in games.values():
        blob = " ".join(
            str(game.get(key) or "")
            for key in ("match", "awayName", "homeName", "away", "home")
        ).lower()
        if all(side in blob for side in sides):
            return game
    return {}
def _grade(rows: list[dict[str, Any]]) -> None:
    for ticket in rows:
        if ticket.get("result") != "open" or ticket.get("how") == "marked here":
            continue
        game = str(ticket.get("game") or "")
        for leg in ticket.get("legs") or []:
            if not leg.get("match") and game:
                leg["match"] = game.replace(" at ", " @ ")
            if not leg.get("kickoff"):
                leg["kickoff"] = str(ticket.get("kickoff") or "")
        states = [_grade_leg(leg) for leg in ticket.get("legs") or []]
        before = ticket.get("result")
        if any(state == "lost" for state in states):
            ticket["result"] = "lost"
        elif states and all(state == "won" for state in states):
            ticket["result"] = "won"
        elif states and all(state in {"won", "push"} for state in states) and any(state == "push" for state in states):
            ticket["result"] = "push"
        else:
            ticket["result"] = "open"
        if ticket["result"] != "open" and before == "open":
            ticket["settledAt"] = _now()
            ticket["how"] = "box score"
            _mirror(ticket)
def _grade_leg(leg: dict[str, Any]) -> str:
    fresh = _stat(f"{leg.get('market') or ''} {leg.get('label') or ''}")
    if fresh:
        leg["stat"] = fresh
    if leg.get("scope") != "game" or not leg.get("stat") or leg.get("line") is None:
        leg["result"] = "open"
        leg.pop("note", None)
        return "open"
    summary = _summary_for(leg)
    if not summary:
        leg["result"] = "open"
        leg["note"] = "Waiting on the box score."
        return "open"
    if not _started(summary):
        leg["result"] = "open"
        leg.pop("have", None)
        leg["note"] = "Waiting on the box score."
        return "open"
    final = _final(summary)
    if leg["stat"] == "total":
        have = _total_score(summary, str(leg.get("label") or ""))
    else:
        have = _player_stat(summary, str(leg.get("player") or ""), str(leg["stat"]))
    if have is None:
        leg["result"] = "open"
        leg["note"] = "Waiting on the box score."
        return "open"
    leg["have"] = have
    leg.pop("note", None)
    state = _compare(float(have), float(leg["line"]), str(leg.get("side") or "plus"), final)
    leg["result"] = state
    return state
def _compare(have: float, line: float, side: str, final: bool) -> str:
    if side == "under":
        if have > line:
            return "lost"
        if not final:
            return "open"
        return "won" if have < line else "push"
    if side == "plus" and have + 1e-9 >= line:
        return "won"
    if side == "over" and have > line + 1e-9:
        return "won"
    if abs(have - line) < 1e-9 and side == "over":
        return "push" if final else "open"
    return "lost" if final else "open"
def _summary_for(leg: dict[str, Any]) -> dict[str, Any] | None:
    sport = str(leg.get("sport") or "")
    path = _PATHS.get(sport)
    if not path:
        path = _find_sport(leg)
    if not path:
        return None
    espn_id = str(leg.get("espnId") or "")
    if not espn_id:
        espn_id = _find_event(path, str(leg.get("match") or ""), str(leg.get("kickoff") or ""))
        if espn_id:
            leg["espnId"] = espn_id
    if not espn_id:
        return None
    url = f"https://site.web.api.espn.com/apis/site/v2/sports/{path}/summary?event={espn_id}"
    data = _cached(url, lambda: get_json(url, referer="https://www.espn.com/"))
    return data if isinstance(data, dict) else None
def _find_event(path: str, match: str, kickoff: str) -> str:
    sides = [_side(part) for part in re.split(r"\s@\s|\sat\s", match) if part.strip()]
    sides = [side for side in sides if side]
    if len(sides) < 2 or not kickoff:
        return ""
    day = _ymd(kickoff)
    if not day:
        return ""
    url = f"https://site.web.api.espn.com/apis/site/v2/sports/{path}/scoreboard?dates={day}"
    data = _cached(url, lambda: get_json(url, referer="https://www.espn.com/"))
    if not isinstance(data, dict):
        return ""
    for event in data.get("events") or []:
        blob = _event_text(event)
        if all(side in blob for side in sides):
            return str(event.get("id") or "")
    return ""
def _find_sport(leg: dict[str, Any]) -> str:
    match, kickoff = str(leg.get("match") or ""), str(leg.get("kickoff") or "")
    if not match or not kickoff:
        return ""
    for sport in ("WNBA", "NBA", "NHL", "MLB", "NFL", "NCAAF"):
        espn_id = _find_event(_PATHS[sport], match, kickoff)
        if espn_id:
            leg["sport"], leg["espnId"] = sport, espn_id
            return _PATHS[sport]
    return ""
def _player_stat(summary: dict[str, Any], player: str, stat: str) -> float | None:
    aliases = _ALIASES.get(stat) or []
    found_category = False
    for team in (summary.get("boxscore") or {}).get("players") or []:
        for block in team.get("statistics") or []:
            columns = [str(item).lower().replace(" ", "") for item in (block.get("keys") or block.get("names") or block.get("labels") or [])]
            index = next((columns.index(alias) for alias in aliases if alias in columns), None)
            if index is None:
                continue
            found_category = True
            for athlete in block.get("athletes") or []:
                name = str((athlete.get("athlete") or {}).get("displayName") or "")
                if not _same_player(name, player):
                    continue
                stats = athlete.get("stats") or []
                if index >= len(stats):
                    return None
                return _number(stats[index])
    if found_category:
        return 0.0
    return None
def _total_score(summary: dict[str, Any], label: str) -> float | None:
    comps = _comps(summary)
    named: list[float] = []
    scores: list[float] = []
    text = label.lower()
    for side in comps.get("competitors") or []:
        try:
            score = float(side.get("score"))
        except (TypeError, ValueError):
            return None
        scores.append(score)
        team = side.get("team") or {}
        names = [str(team.get(key) or "") for key in ("abbreviation", "shortDisplayName", "displayName")]
        if any(name and name.lower() in text for name in names):
            named.append(score)
    if len(named) == 1:
        return named[0]
    return sum(scores) if len(scores) >= 2 else None
def _started(summary: dict[str, Any]) -> bool:
    state = str((_status(summary) or {}).get("state") or "")
    return state in {"in", "post"}
def _final(summary: dict[str, Any]) -> bool:
    status = _status(summary)
    return bool(status.get("completed")) or str(status.get("state") or "") == "post"
def _comps(summary: dict[str, Any]) -> dict[str, Any]:
    return ((summary.get("header") or {}).get("competitions") or [{}])[0]
def _status(summary: dict[str, Any]) -> dict[str, Any]:
    return (_comps(summary).get("status") or {}).get("type") or {}
def _mirror(ticket: dict[str, Any]) -> None:
    from nfl_bets.picks import list_picks, settle_pick
    labels = tuple(str(leg.get("label") or "") for leg in ticket.get("legs") or [])
    for pick in list_picks():
        if pick.get("result") != "open":
            continue
        pick_labels = [str(leg.get("label") or "") for leg in pick.get("legs") or []]
        for group in pick.get("groups") or []:
            pick_labels.extend(str(leg.get("label") or "") for leg in group.get("legs") or [])
        if tuple(pick_labels) != labels:
            continue
        try:
            settle_pick(str(pick.get("id") or ""), str(ticket.get("result") or ""))
        except ValueError:
            continue
def _split_label(label: str) -> tuple[str, str, str]:
    head, sep, tail = label.partition(" — ")
    if not sep:
        return head.strip(), "", ""
    sport, _, rest = tail.partition(",")
    match = re.split(r",\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b", rest, maxsplit=1)[0]
    return head.strip(), sport.strip(), match.strip()
def _player(head: str, market: str, runner: str) -> str:
    low = market.lower()
    if low.startswith("to ") or low.startswith("player to"):
        return runner.strip()
    if " - " in market:
        left = market.split(" - ", 1)[0].strip()
        if left and "total" not in left.lower() and not left.lower().startswith("alt"):
            return left
    cut = re.split(r"\d+(?:\.\d+)?\s*\+", head)[0]
    return re.sub(r"\bto record\b", "", cut, flags=re.I).strip(" -:")
def _stat(text: str) -> str:
    low, td = text.lower(), "touchdown" in text.lower()
    if "assist" in low:
        return "assists"
    if "shot" in low:
        return "shotsOnGoal"
    if "rebound" in low:
        return "rebounds"
    if "strikeout" in low:
        return "strikeouts"
    if "reception" in low and "yard" not in low:
        return "receptions"
    if "rush" in low:
        return "rushingTouchdowns" if td else "rushingYards"
    if "pass" in low:
        return "passingTouchdowns" if td else "passingYards"
    if "receiv" in low or ("yard" in low and "total" not in low):
        return "receivingTouchdowns" if td and "receiv" in low else "receivingYards"
    if "point" in low and "total" not in low:
        return "points"
    if "total" in low:
        return "total"
    return ""
def _line(text: str, stat: str) -> float | None:
    if stat == "total":
        match = re.search(r"\(([\d.]+)\)", text)
        if match:
            return float(match.group(1))
    match = re.search(r"(\d+(?:\.\d+)?)\s*\+", text)
    return float(match.group(1)) if match else None

def _scope(text: str) -> str:
    low = text.lower()
    if "half" in low or "quarter" in low or "drive" in low:
        return "part"
    return "game"

def _same_player(box_name: str, want: str) -> bool:
    skip = {"jr", "sr", "ii", "iii", "iv"}

    def tokens(value: str) -> list[str]:
        raw = re.sub(r"[^a-z0-9 ]", "", value.lower().replace(".", ""))
        return [part for part in raw.split() if part and part not in skip]

    left, right = tokens(box_name), tokens(want)
    if not left or not right or left[-1] != right[-1]:
        return False
    return left[0][:1] == right[0][:1]

def _event_text(event: dict[str, Any]) -> str:
    bits = [str(event.get("name") or ""), str(event.get("shortName") or "")]
    comps = event.get("competitions") or [{}]
    for side in comps[0].get("competitors") or []:
        team = side.get("team") or {}
        bits.extend(str(team.get(key) or "") for key in ("displayName", "shortDisplayName", "name"))
    return " ".join(bits).lower()

def _side(text: str) -> str:
    clean = re.sub(r"\([^)]*\)", "", text).lower()
    words = [word for word in re.findall(r"[a-z0-9]+", clean) if len(word) > 2]
    return " ".join(words)

def _number(raw: Any) -> float | None:
    try:
        return float(str(raw).split("-")[0].split("/")[0])
    except (TypeError, ValueError):
        return None

def _price(raw: Any) -> int | None:
    if isinstance(raw, int):
        return raw
    text = str(raw or "").replace("+", "").strip()
    try:
        return int(text)
    except ValueError:
        return None

def _signature(row: dict[str, Any]) -> tuple:
    legs = tuple((str(leg.get("label") or ""), leg.get("odds")) for leg in row.get("legs") or [])
    return (row.get("card"), row.get("title"), legs)

def _ymd(kickoff: str) -> str:
    try:
        stamp = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return stamp.astimezone(_ET).strftime("%Y%m%d")

def _cached(key: str, fetch) -> Any:
    now = time.time()
    hit = _CACHE.get(key)
    ttl = 15.0 if "/summary?" in key else _TTL
    if hit and now - hit[0] < ttl:
        return hit[1]
    try:
        data = fetch()
    except Exception:  # noqa: BLE001
        data = None
        now -= _TTL - 30
    _CACHE[key] = (now, data)
    return data

def _sorted(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows.sort(key=lambda row: str(row.get("offeredAt") or ""), reverse=True)
    return rows

def _load() -> list[dict[str, Any]]:
    data = read_json(out_dir() / "archive.json", {"tickets": []})
    rows = data.get("tickets") if isinstance(data, dict) else []
    return [row for row in rows or [] if isinstance(row, dict)]

def _write(rows: list[dict[str, Any]]) -> None:
    from nfl_bets.ignore import keep_public
    have = {_signature(row) for row in rows}
    rows[:] = keep_public([*rows, *[row for row in _load() if _signature(row) not in have]])
    write_json(out_dir() / "archive.json", {"tickets": rows})

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
