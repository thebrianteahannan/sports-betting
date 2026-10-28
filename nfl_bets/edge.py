"""Measured reads on a ticket. The ranking lives in tiebreak.

Counts, the injury report, rest, the building, and the trip are fetched here.
The FanDuel price stays the price. A note is only written when a count or a
report says it. This does not send a bet.
"""

from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.archive import _PATHS, _find_event
from nfl_bets.choose import _parse
from nfl_bets.hedge import implied_prob
from nfl_bets.http_util import get_json
from nfl_bets.store import out_dir, read_json, write_json
from nfl_bets.sway import _PATH, _nick, _player, _player_log, _same, _spec, _value

_ET = ZoneInfo("America/New_York")
_TTL = 6 * 3600
_SIT: dict[str, Any] | None = None
_DIRTY = False
_RIVALS = (
    ("packers", "bears"), ("cowboys", "eagles"), ("cowboys", "giants"), ("eagles", "giants"),
    ("ravens", "steelers"), ("steelers", "browns"), ("bengals", "browns"), ("chiefs", "raiders"),
    ("chiefs", "bills"), ("bears", "vikings"), ("packers", "vikings"), ("49ers", "seahawks"),
    ("49ers", "rams"), ("patriots", "jets"), ("lakers", "celtics"), ("lakers", "warriors"),
    ("yankees", "red sox"), ("dodgers", "giants"), ("cubs", "cardinals"), ("yankees", "mets"),
    ("bruins", "canadiens"), ("rangers", "islanders"), ("rangers", "devils"), ("oilers", "flames"),
    ("ohio state", "michigan"), ("alabama", "auburn"), ("army", "navy"),
)
_ALIAS = {
    "shotsTotal": ("shotsTotal", "shotsOnGoal", "shots"),
    "totalRebounds": ("totalRebounds", "rebounds"),
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ("threePointFieldGoalsMade-threePointFieldGoalsAttempted", "threePointFieldGoalsMade"),
}


def mark_board(board: dict[str, Any]) -> None:
    games = [game for game in board.get("games") or [] if isinstance(game, dict)]
    by_id = {str(game.get("id") or ""): game for game in games}
    for card in board.values():
        if not isinstance(card, dict):
            continue
        offers = [offer for offer in card.get("offers") or [] if isinstance(offer, dict) and offer.get("legs")]
        if not offers:
            continue
        packed: list[tuple[list[tuple[int, str]], dict[str, Any]]] = []
        for offer in offers:
            offer.pop("edge", None)
            offer.pop("why", None)
            notes, _score = _offer(offer, by_id, games)
            packed.append((notes, offer))
        _mark(packed, by_id, games)
    _save()
    from nfl_bets.sway import _flush

    _flush()


def _mark(packed: list[tuple[list[tuple[int, str]], dict[str, Any]]], by_id: dict[str, dict], games: list[dict]) -> None:
    """Rank this strategy by the reads that actually differ."""
    from nfl_bets.tiebreak import settle

    settle(packed, by_id, games)


def _offer(offer: dict[str, Any], by_id: dict[str, dict], games: list[dict]) -> tuple[list[tuple[int, str]], int]:
    notes: list[tuple[int, str]] = []
    blocked = False
    seen_game: set[str] = set()
    for leg in offer.get("legs") or []:
        if not isinstance(leg, dict):
            continue
        game = _game(leg, by_id, games)
        leg_notes, leg_score, out = _leg(leg, game)
        notes.extend(leg_notes)
        blocked = blocked or out
        if game and str(game.get("id") or "") not in seen_game:
            seen_game.add(str(game.get("id") or ""))
            notes.extend(_place(game, leg))
    if blocked:
        return notes, -40
    highs = [score for score, _text in notes if score > 0]
    return notes, max(highs) if highs else 0


def _leg(leg: dict[str, Any], game: dict[str, Any] | None) -> tuple[list[tuple[int, str]], int, bool]:
    notes: list[tuple[int, str]] = []
    text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
    name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
    spec = _spec(text)
    sport = str(leg.get("sport") or (game or {}).get("sport") or "")
    path = _PATH.get(sport)
    pack = _player_log(sport, path, name) if path and spec and name else None
    team = str((pack or {}).get("team") or "")
    sit = _situation(game) if game else {}
    if name and _player_out(name, sit):
        status = _player_out(name, sit)
        return [( -40, f"ESPN has {_nick(name)} {status}.")], -40, True
    if spec and pack and team:
        notes.extend(_report(text, name, team, game, sit))
    try:
        price = implied_prob(int(leg["odds"]))
    except (TypeError, ValueError, KeyError):
        price = 0
    if not spec or not pack or price <= 0:
        return notes, 0, False
    bar = _bar(text, spec[2])
    if bar is None:
        return notes, 0, False
    rows = _rows(pack, spec[0])
    under = bool(re.search(r"\bunder\b", text, re.I))
    nick = _nick(name)
    notes.extend(_counted(rows, bar, under, price, nick, game, team))
    best = max((score for score, _text in notes), default=0)
    worst = min((score for score, _text in notes), default=0)
    return notes, worst if worst <= -8 else best, False


def _counted(rows: list[dict], bar: float, under: bool, price: float, nick: str, game: dict | None, team: str) -> list[tuple[int, str]]:
    notes: list[tuple[int, str]] = []
    did = "stayed under" if under else "cleared"
    recent = rows[:5]
    gap = _gap(_hits(recent, bar, under), len(recent), price)
    if abs(gap) >= 5:
        notes.append((gap, f"{nick} {did} this in {'only ' if gap < 0 else ''}{_hits(recent, bar, under)} of the last {len(recent)}."))
    streak = _slice(rows[:3], rows[3:8], bar, under)
    if streak is not None:
        hot, _cold = streak
        note = f"{nick}'s last three {did} it." if hot > 0 else f"{nick}'s last three missed it."
        notes.append((hot, note))
    foe = _foe(rows, game, team)
    gap = _gap(_hits(foe, bar, under), len(foe), price)
    if abs(gap) >= 5:
        other = _other(game, team)
        notes.append((gap, f"Against the {_nick(other) if other else 'opponent'}, {_hits(foe, bar, under)} of {len(foe)}."))
    stamp = _parse(str((game or {}).get("kickoff") or ""))
    if stamp is None:
        return notes
    when = stamp.astimezone(_ET)
    prime = [row for row in rows if (spot := _stamp(row["date"])) and spot.astimezone(_ET).hour >= 19]
    other = [row for row in rows if row not in prime]
    if when.hour >= 19:
        spot_gap = _slice(prime, other, bar, under)
        if spot_gap is not None:
            notes.append((spot_gap[0], f"In prime time, {nick} {did} it in {'only ' if spot_gap[0] < 0 else ''}{_hits(prime, bar, under)} of {len(prime)}. Earlier tips are different."))
    if rows and _stamp(rows[0]["date"]):
        rest = (when.date() - _stamp(rows[0]["date"]).astimezone(_ET).date()).days
        sport = str((game or {}).get("sport") or "")
        if rest == 1:
            notes.append((-8, f"{nick} is on a back-to-back."))
        elif 2 <= rest <= 3:
            notes.append((-4, f"{nick} played {rest} days ago."))
        elif sport == "NFL" and 12 <= rest <= 16:
            notes.append((6, f"{nick} is off a bye."))
        elif 8 <= rest <= 14:
            notes.append((4, f"{nick} has had {rest} days off."))
    return notes


def _slice(piece: list[dict], rest: list[dict], bar: float, under: bool) -> tuple[int, int] | None:
    total = len(piece) + len(rest)
    if len(piece) < 3 or len(rest) < 3 or len(piece) >= total * 0.7:
        return None
    piece_rate = _hits(piece, bar, under) / len(piece)
    rest_rate = _hits(rest, bar, under) / len(rest)
    gap = round((piece_rate - rest_rate) * 100 * min(1.0, total / 12))
    if len(piece) < 6:
        gap = max(-5, min(5, gap))
    if abs(gap) < (5 if len(piece) < 6 else 15):
        return None
    return gap, round(rest_rate * 100)


def _report(text: str, name: str, team: str, game: dict | None, sit: dict) -> list[tuple[int, str]]:
    notes: list[tuple[int, str]] = []
    low = text.lower()
    catch = any(word in low for word in ("receiv", "reception", "passing"))
    shot = any(word in low for word in ("shot", "goal"))
    corners: list[str] = []
    goalies: list[str] = []
    quarterback = ""
    for row in sit.get("injuries") or []:
        who = str(row.get("player") or "")
        if not who or _same(who, name):
            continue
        status = str(row.get("status") or "").lower()
        if status not in {"out", "doubtful"}:
            continue
        pos = str(row.get("pos") or "").upper()
        own = _same(str(row.get("team") or ""), team)
        if own and pos == "QB" and catch:
            quarterback = status
        elif not own and pos in {"CB", "DB", "S", "FS", "SS"} and "receiv" in low:
            corners.append(_call(who))
        elif not own and pos in {"G", "GK"} and shot:
            goalies.append(_call(who))
    if quarterback:
        notes.append((-12, f"The quarterback is {quarterback}."))
    if corners:
        notes.append((10, f"Their {'corner' if len(corners) == 1 else 'corners'} {', '.join(corners[:3])} {'is' if len(corners) == 1 else 'are'} out."))
    if goalies:
        notes.append((8, f"Their {'goalie' if len(goalies) == 1 else 'goalies'} {', '.join(goalies[:2])} {'is' if len(goalies) == 1 else 'are'} out."))
    return notes


def _place(game: dict, leg: dict) -> list[tuple[int, str]]:
    sit = _situation(game)
    sport = str(leg.get("sport") or game.get("sport") or "")
    notes: list[tuple[int, str]] = []
    city = str(sit.get("city") or "")
    country = str(sit.get("country") or "")
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    blob = f"{away} {home}".lower()
    if any(all(word in blob for word in pair) for pair in _RIVALS):
        notes.append((0, f"{_nick(away)} and {_nick(home)}. Rivalry game."))
    outs = [str(row.get("player") or "") for row in sit.get("injuries") or [] if str(row.get("status") or "").lower() in {"out", "doubtful"} and row.get("player")]
    if outs:
        notes.append((0, "ESPN has " + ", ".join(_call(who) for who in outs[:4]) + " out."))
    abroad = sport in {"NFL", "NBA", "WNBA", "NCAAF", "NCAAB"} and country.upper() not in {"", "USA", "US", "UNITED STATES"}
    overseas = sport in {"NFL", "NBA", "WNBA"} and any(word in city.lower() for word in ("london", "munich", "frankfurt", "berlin", "paris", "mexico", "tokyo", "sydney"))
    if abroad or overseas:
        notes.append((-4, f"This game is in {city or country}, not a usual US building."))
    elif sit.get("neutral") and city:
        notes.append((-2, f"Neutral site in {city}."))
    gust = sit.get("gust")
    if isinstance(gust, (int, float)) and not sit.get("indoor") and gust >= 20:
        notes.append((6, f"Wind is {int(gust)} mph."))
    rain = sit.get("precipitation")
    if isinstance(rain, (int, float)) and not sit.get("indoor") and rain >= 40:
        notes.append((6, "Rain is in the forecast."))
    return notes


def _situation(game: dict[str, Any]) -> dict[str, Any]:
    sport = str(game.get("sport") or "")
    path = _PATHS.get(sport)
    if not path:
        return {}
    day = ""
    stamp = _parse(str(game.get("kickoff") or ""))
    if stamp is not None:
        day = stamp.astimezone(_ET).strftime("%Y%m%d")
    key = f"{sport}|{game.get('id')}|{day}"
    cached = _cache().get(key)
    if isinstance(cached, dict) and time.time() - float(cached.get("at") or 0) < _TTL and ("indoor" in cached or set(cached) <= {"at"}):
        return cached
    match = str(game.get("match") or "")
    if " @ " not in match and game.get("awayName") and game.get("homeName"):
        match = f"{game.get('awayName')} @ {game.get('homeName')}"
    espn = str(game.get("espnId") or "") or _find_event(path, match, str(game.get("kickoff") or ""))
    if not espn:
        return _remember(key, {})
    url = f"https://site.web.api.espn.com/apis/site/v2/sports/{path}/summary?event={espn}"
    try:
        data = get_json(url, referer="https://www.espn.com/", timeout=12)
    except Exception:  # noqa: BLE001
        return _remember(key, {})
    return _remember(key, _read(data if isinstance(data, dict) else {}))


def _read(data: dict[str, Any]) -> dict[str, Any]:
    venue = ((data.get("gameInfo") or {}).get("venue") or {})
    address = venue.get("address") or {}
    weather = (data.get("gameInfo") or {}).get("weather") or {}
    comp = (((data.get("header") or {}).get("competitions") or [{}])[0] or {})
    injuries = []
    for block in data.get("injuries") or []:
        team = str((block.get("team") or {}).get("displayName") or "")
        for item in block.get("injuries") or []:
            athlete = item.get("athlete") or {}
            injuries.append({
                "team": team,
                "player": str(athlete.get("displayName") or ""),
                "pos": str((athlete.get("position") or {}).get("abbreviation") or ""),
                "status": str(item.get("status") or ""),
            })
    wind = weather.get("wind") if isinstance(weather.get("wind"), dict) else {}
    grass = venue.get("grass")
    return {
        "city": str(address.get("city") or ""),
        "country": str(address.get("country") or ""),
        "neutral": bool(comp.get("neutralSite")),
        "indoor": bool(venue.get("indoor")),
        "grass": grass if isinstance(grass, bool) else None,
        "temp": weather.get("temperature") if isinstance(weather.get("temperature"), (int, float)) else None,
        "gust": weather.get("gust") if weather.get("gust") is not None else wind.get("speed"),
        "precipitation": weather.get("precipitation"),
        "injuries": injuries,
    }


def _game(leg: dict, by_id: dict[str, dict], games: list[dict]) -> dict | None:
    found = by_id.get(str(leg.get("gameId") or ""))
    if found:
        return found
    label = str(leg.get("label") or "")
    sport = str(leg.get("sport") or "")
    for game in games:
        if sport and game.get("sport") != sport:
            continue
        away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
        if away and home and away in label and home in label:
            return game
    return None


def _rows(pack: dict[str, Any], keys: tuple[str, ...]) -> list[dict[str, Any]]:
    names = list(pack.get("names") or [])
    minute = names.index("minutes") if "minutes" in names else None
    indexes = []
    for key in keys:
        found = next((names.index(option) for option in _ALIAS.get(key, (key,)) if option in names), None)
        if found is not None:
            indexes.append(found)
    if not indexes:
        return []
    rows = []
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        values = [_value(stats[index] if index < len(stats) else "", names[index]) for index in indexes]
        if any(value is None for value in values):
            continue
        built = {"date": str(row.get("date") or ""), "opponent": str(row.get("opponent") or ""), "value": sum(value or 0 for value in values)}
        if row.get("season"):
            built["season"] = row["season"]
        if minute is not None and minute < len(stats) and (played := _value(stats[minute], "minutes")) is not None:
            built["minutes"] = played
        rows.append(built)
    return rows


def _share(rows: list[dict], bar: float, under: bool) -> str:
    hits = _hits(rows, bar, under)
    return f"{hits} of {len(rows)} · {round(hits / len(rows) * 100)}%"


def _windows(pack: dict[str, Any], text: str) -> str:
    spec = _spec(text)
    rows = _rows(pack, spec[0]) if spec else []
    bar = _bar(text, spec[2]) if spec else None
    if bar is None or len(rows) < 3:
        return ""
    under = bool(re.search(r"\bunder\b", text, re.I))
    bits = [f"Last {n}, {_share(rows[:n], bar, under)}" for n in (3, 6, 10, 25, 50, 82) if len(rows) >= n]
    years = [row.get("season") for row in rows if row.get("season")]
    last = [row for row in rows if years and row.get("season") == max(years) - 1]
    if len(last) >= 3:
        bits.append(f"Last season, {_share(last, bar, under)}")
    bits.append(f"Career, {_share(rows, bar, under)}")
    return ". ".join(bits) + "."


def _lean(pack: dict[str, Any], text: str, price: float) -> str:
    spec = _spec(text)
    rows = _rows(pack, spec[0]) if spec else []
    bar = _bar(text, spec[2]) if spec else None
    if bar is None or price <= 0 or len(rows) < 20:
        return ""
    under = bool(re.search(r"\bunder\b", text, re.I))
    recent, career = _hits(rows[:10], bar, under) / 10, _hits(rows, bar, under) / len(rows)
    asked, near, far = round(price * 100), round(recent * 100), round(career * 100)
    if near == far:
        return f"The last 10 and the full history are both {near}%."
    recent_off, career_off = abs(asked - near), abs(asked - far)
    if recent_off + 3 < career_off:
        line = f"The {asked}% price is closer to the recent history (last 10, {near}%) than the full history ({far}%)."
        extra = _dip(rows, bar, under, asked, far) if far >= asked + 8 else ""
        return f"{line} {extra}".strip()
    if career_off + 3 < recent_off:
        return f"The {asked}% price is closer to the full history ({far}%) than the recent history (last 10, {near}%)."
    return f"The {asked}% price sits between the recent history (last 10, {near}%) and the full history ({far}%)."


def _hits(rows: list[dict], bar: float, under: bool) -> int:
    if under:
        return sum(1 for row in rows if row["value"] <= bar)
    return sum(1 for row in rows if row["value"] + 1e-9 >= bar)


def _dip(rows: list[dict], bar: float, under: bool, asked: int, far: int) -> str:
    years = [row.get("season") for row in rows if row.get("season")]
    last = [row for row in rows if years and row.get("season") == max(years) - 1]
    played = [row["minutes"] for row in rows if isinstance(row.get("minutes"), (int, float))]
    recent_min = round(sum(played[:10]) / 10) if len(played) >= 10 else None
    career_min = round(sum(played) / len(played)) if len(played) >= 20 else None
    short = recent_min is not None and career_min is not None and career_min - recent_min >= 3
    if len(last) >= 10:
        season = round(_hits(last, bar, under) / len(last) * 100)
        season_played = [row["minutes"] for row in last if isinstance(row.get("minutes"), (int, float))]
        season_min = round(sum(season_played) / len(season_played)) if len(season_played) >= 10 else None
        if far - season >= 8:
            at = f", at {season_min} minutes" if season_min is not None else ""
            career = f" Career minutes are {career_min}." if short else ""
            line = f"Last season was {season}%{at}.{career} The {far}% career rate is the seasons before that."
            return f"{line} Last season still hits more often than the {asked}% price." if season >= asked + 8 else line
        if season >= asked + 8 and recent_min is not None and career_min is not None:
            if short:
                return f"Last 10, {recent_min} minutes. Career, {career_min}. Last season was still {season}%. At {far}%, this hits more often than the {asked}% price."
            return f"The minutes are the same, {recent_min} in the last 10 and {career_min} for the career. Last season was {season}%. At {far}%, this hits more often than the {asked}% price."
    if short:
        return f"Last 10, {recent_min} minutes. Career, {career_min}."
    if recent_min is not None and career_min is not None:
        return f"The minutes are the same, {recent_min} in the last 10 and {career_min} for the career. At {far}%, this hits more often than the {asked}% price."
    return ""


def _gap(hits: int, count: int, price: float) -> int:
    if count < 3 or price <= 0:
        return 0
    gap = round((hits / count - price) * 100 * min(1.0, count / 8))
    return max(-5, min(5, gap)) if count < 6 else gap


def _bar(text: str, fixed: bool) -> float | None:
    found = re.search(r"(\d+(?:\.\d+)?)\s*\+", text)
    if found:
        return float(found.group(1))
    found = re.search(r"(?:over|under)\s+(\d+(?:\.\d+)?)", text, re.I)
    if found:
        return float(found.group(1))
    return 1.0 if fixed else None


def _foe(rows: list[dict], game: dict | None, team: str) -> list[dict]:
    other = _other(game, team)
    if not other:
        return []
    return [row for row in rows if _same(row["opponent"], other)]


def _other(game: dict | None, team: str) -> str:
    if not game or not team:
        return ""
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    if _same(team, away):
        return home
    if _same(team, home):
        return away
    return ""


def _player_out(name: str, sit: dict) -> str:
    for row in sit.get("injuries") or []:
        status = str(row.get("status") or "").lower()
        if status in {"out", "doubtful"} and _same(str(row.get("player") or ""), name):
            return status
    return ""


def _stamp(raw: str) -> datetime | None:
    return _parse(raw)


def _call(name: str) -> str:
    words = [word for word in re.sub(r"\s*\([^)]*\)", "", name).split() if word.lower().strip(".") not in {"jr", "sr", "ii", "iii", "iv"}]
    if not words:
        return name
    word = words[-1]
    return "49ers" if word.lower() == "49ers" else word[:1].upper() + word[1:]


def _cache() -> dict[str, Any]:
    global _SIT
    if _SIT is None:
        data = read_json(out_dir() / "situations.json", {})
        _SIT = data if isinstance(data, dict) else {}
    return _SIT


def _remember(key: str, row: dict[str, Any]) -> dict[str, Any]:
    global _DIRTY
    saved = dict(row)
    saved["at"] = time.time()
    _cache()[key] = saved
    _DIRTY = True
    return saved


def _save() -> None:
    global _DIRTY
    if _DIRTY:
        write_json(out_dir() / "situations.json", _cache())
        _DIRTY = False
