"""Rank the tickets already inside one strategy.

A read counts only when the desk can measure it, and only when it separates
this ticket from the others in the strategy. Miles, umpires, referees, shadow
assignments, save rate, pitcher hand, prop opens, and esports logs are not
invented. This does not send a bet.
"""

from __future__ import annotations

import re
from typing import Any

from nfl_bets.edge import (
    _ET,
    _RIVALS,
    _bar,
    _call,
    _game,
    _hits,
    _parse,
    _rows,
    _situation,
    _slice,
)
from nfl_bets.http_util import get_json
from nfl_bets.sway import _PATH, _nick, _player, _player_log, _same, _spec, _team_id, _value

_SCHED: dict[str, list[dict[str, Any]]] = {}
_OFFSET = {
    -3: "seahawks 49ers rams chargers raiders lakers clippers warriors blazers suns kings ducks sharks kraken canucks dodgers angels padres giants mariners athletics",
    -2: "broncos nuggets jazz avalanche rockies flames oilers",
    -1: "bears packers lions vikings cowboys texans chiefs saints buccaneers titans colts jaguars pelicans grizzlies mavericks spurs thunder wolves royals twins brewers cubs astros blues blackhawks predators stars wild",
    0: "patriots bills dolphins jets ravens steelers browns bengals eagles giants commanders falcons panthers celtics nets knicks sixers raptors bulls pistons pacers bucks hawks hornets magic heat wizards cavaliers braves mets phillies nationals redsox yankees orioles guardians tigers whitesox reds pirates rays marlins bruins sabres redwings canadiens senators mapleleafs lightning hurricanes capitals flyers penguins devils islanders bluejackets",
}
_TZ = {name: offset for offset, names in _OFFSET.items() for name in names.split()}
_CITY = {
    "seattle": -3, "san francisco": -3, "los angeles": -3, "inglewood": -3, "anaheim": -3, "oakland": -3, "sacramento": -3, "portland": -3, "las vegas": -3, "paradise": -3, "san diego": -3, "vancouver": -3,
    "denver": -2, "salt lake city": -2, "calgary": -2, "edmonton": -2, "phoenix": -2, "glendale": -2,
    "chicago": -1, "dallas": -1, "arlington": -1, "houston": -1, "kansas city": -1, "minneapolis": -1, "new orleans": -1, "nashville": -1, "indianapolis": -1, "milwaukee": -1, "green bay": -1, "st. louis": -1, "austin": -1, "oklahoma city": -1, "memphis": -1, "san antonio": -1,
    "boston": 0, "new york": 0, "brooklyn": 0, "philadelphia": 0, "pittsburgh": 0, "baltimore": 0, "washington": 0, "landover": 0, "miami": 0, "tampa": 0, "orlando": 0, "detroit": 0, "cleveland": 0, "cincinnati": 0, "buffalo": 0, "toronto": 0, "montreal": 0, "ottawa": 0, "atlanta": 0, "charlotte": 0,
}

def settle(packed: list[tuple[list[tuple[int, str]], dict[str, Any]]], by_id: dict[str, dict], games: list[dict]) -> None:
    """Score every ticket, then mark the ones the reads actually separate."""
    built: list[list[Any]] = []
    for notes, offer in packed:
        rows = [(text, score, text) for score, text in notes if text]
        rows.extend(_extra(offer, by_id, games))
        built.append([rows, offer])
    _easier(built)
    _finish(built)

def _finish(built: list[list[Any]]) -> None:
    bags: list[dict[str, int]] = []
    texts: dict[str, str] = {}
    held: dict[str, int] = {}
    for rows, offer in built:
        bag: dict[str, int] = {}
        for key, score, text in rows:
            if text and (key not in bag or abs(score) > abs(bag[key])):
                bag[key] = score
                texts[key] = text
                held[key] = score
        bags.append(bag)
        offer.pop("edge", None)
        offer.pop("why", None)
    keys = set().union(*bags) if bags else set()
    count = len(bags) or 1
    means = {key: sum(bag.get(key, 0) for bag in bags) / count for key in keys}
    ranked = []
    for bag, (_rows, offer) in zip(bags, built):
        delta = {key: bag.get(key, 0) - means[key] for key in keys}
        why = _line(bag, delta, texts, held)
        ranked.append((sum(delta.values()), float(offer.get("impliedPct") or 0), why, offer))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    if len(ranked) < 2:
        return
    _total, _price, why, offer = ranked[0]
    offer["edge"] = True
    offer["why"] = why or "This parlay has the highest chance in this list."

def _line(bag: dict[str, int], delta: dict[str, float], texts: dict[str, str], held: dict[str, int]) -> str:
    positives = sorted(((diff, texts[key]) for key, diff in delta.items() if bag.get(key, 0) > 0 and diff >= 3), reverse=True)
    lines: list[str] = []
    for _diff, text in positives:
        if text not in lines:
            lines.append(text)
        if len(lines) == 3:
            return " ".join(lines)
    relief = sum(diff for key, diff in delta.items() if bag.get(key, 0) == 0 and held.get(key, 0) < 0 and diff > 0)
    cold = "The other parlays have a player who has been coming up short. This one does not."
    if relief >= 4 and len(lines) < 3 and cold not in lines:
        lines.append(cold)
    gaps = sorted(((diff, key) for key, diff in delta.items() if bag.get(key, 0) == 0 and diff >= 4 and held.get(key, 0) < 0), reverse=True)
    for _diff, key in gaps:
        text = _absent(texts.get(key, ""))
        if text and text not in lines:
            lines.append(text)
            break
    return " ".join(lines[:3])

def _absent(example: str) -> str:
    text = example.lower()
    rules = (
        ("back-to-back", "Nobody in this parlay is playing on the second night in a row."), ("road trip", "This is not a long road trip."),
        ("time zone", "Nobody in this parlay crossed two time zones to get here."), ("early east", "No West Coast team in this parlay is playing an early East Coast game."),
        ("game-time", "Nobody in this parlay is waiting on a game-time decision."), ("third game", "Nobody in this parlay is playing a third game in four nights."),
        ("after a rivalry", "This is not the game after a rivalry."), ("next game", "A rivalry is not the next game."),
        ("first game back", "Nobody in this parlay is coming back from a layoff."), ("on turf", "This game is not on turf."),
        ("degrees", "This is not a cold passing game."), ("same game", "Each leg is from a different game."),
        ("receiver are on", "The quarterback and a receiver are not both in this parlay."), ("player's number has not", "The spread and the total on this parlay have not moved."),
        ("minutes are down", "Nobody's minutes are down."), ("targets are down", "Nobody's targets are down."),
        ("only ", "The other parlays have a player who has been coming up short. This one does not."), ("missed it", "The other parlays have a player who has been coming up short. This one does not."),
    )
    return next((line for needle, line in rules if needle in text), "")

def _extra(offer: dict[str, Any], by_id: dict[str, dict], games: list[dict]) -> list[tuple[str, int, str]]:
    legs = [leg for leg in offer.get("legs") or [] if isinstance(leg, dict)]
    notes = _shape(legs)
    seen_game: set[str] = set()
    seen_player: set[str] = set()
    for leg in legs:
        game = _game(leg, by_id, games)
        gid = str((game or {}).get("id") or leg.get("gameId") or "")
        if game and gid not in seen_game:
            seen_game.add(gid)
            notes.extend(_building(game, leg))
            notes.extend(_moved(game, [row for row in legs if str(row.get("gameId") or "") == str(leg.get("gameId") or "")]))
        name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
        if not name or name.lower() in seen_player:
            if not name:
                notes.extend(_team_form(leg, game))
            continue
        seen_player.add(name.lower())
        notes.extend(_person(leg, game, name))
    return notes

def _shape(legs: list[dict]) -> list[tuple[str, int, str]]:
    notes: list[tuple[str, int, str]] = []
    ids = [str(leg.get("gameId") or "") for leg in legs if leg.get("gameId")]
    if len(ids) >= 2 and len(set(ids)) < len(ids):
        notes.append(("same", -6, "Two legs come from the same game."))
    stamps = [stamp for stamp in (_parse(str(leg.get("kickoff") or "")) for leg in legs) if stamp]
    days = {stamp.astimezone(_ET).date() for stamp in stamps}
    if len(days) >= 2:
        notes.append(("days", 4, "The legs are on different days."))
    elif len(stamps) >= 2 and (max(stamps) - min(stamps)).total_seconds() <= 2 * 3600:
        notes.append(("hour", -4, "The legs start in the same hour."))
    grouped: dict[str, list[dict]] = {}
    for leg in legs:
        gid = str(leg.get("gameId") or "")
        if gid:
            grouped.setdefault(gid, []).append(leg)
    for group in grouped.values():
        blob = " ".join(f"{leg.get('market') or ''} {leg.get('label') or ''}" for leg in group).lower()
        if any(word in blob for word in ("pass", "quarterback")) and "receiv" in blob:
            notes.append(("stack", -6, "The quarterback and a receiver are both in this parlay."))
            break
    return notes

def _moved(game: dict, legs: list[dict]) -> list[tuple[str, int, str]]:
    flags = [flag for flag in game.get("flags") or [] if isinstance(flag, dict)]
    codes = {str(flag.get("code") or "") for flag in flags}
    if not ({"STEAM", "TOTAL_MOVE"} & codes):
        return []
    gid = str(game.get("id") or "")
    if any(_player(str(leg.get("runner") or ""), str(leg.get("label") or "")) for leg in legs):
        return [(f"move:{gid}", -6, "The spread or the total has moved, and this player's number has not.")]
    for flag in flags:
        side = str(flag.get("side") or "")
        team = str(game.get("awayName") if side == "away" else game.get("homeName") if side == "home" else "")
        if team and any(_same(str(leg.get("runner") or ""), team) for leg in legs):
            return [(f"steam:{gid}", 6, "The spread has moved toward this side.")]
    return []

def _building(game: dict, leg: dict) -> list[tuple[str, int, str]]:
    sport = str(leg.get("sport") or game.get("sport") or "")
    if sport not in set(_PATH) | {"NCAAF", "Football"}:
        return []
    sit = _situation(game)
    if not sit or set(sit) <= {"at"}:
        return []
    city = str(sit.get("city") or "")
    low = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    gid = str(game.get("id") or city)
    notes: list[tuple[str, int, str]] = []
    if sit.get("indoor"):
        notes.append((f"dome:{gid}", 4, "It's indoors."))
    elif sit.get("grass") is False and sport in {"NFL", "NCAAF", "Football"}:
        notes.append((f"turf:{gid}", -4, "It's on turf."))
    if city.lower() in {"denver", "mexico city", "salt lake city"}:
        hit = sport in {"MLB", "Baseball"} and any(word in low for word in ("hit", "home run", "total base"))
        notes.append((f"alt:{gid}", 6 if hit else -4, f"{city} plays big for hits." if hit else f"Altitude in {city}."))
    temp = sit.get("temp")
    if isinstance(temp, (int, float)) and temp <= 35 and not sit.get("indoor") and sport in {"NFL", "NCAAF", "Football"} and any(word in low for word in ("pass", "receiv")):
        notes.append((f"air:{gid}", -6, f"It's {int(temp)} degrees. Cold changes a passing game."))
    return notes

def _team_form(leg: dict, game: dict | None) -> list[tuple[str, int, str]]:
    if not game:
        return []
    runner = str(leg.get("runner") or "")
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    side = away if _same(runner, away) else home if _same(runner, home) else ""
    if not side:
        return []
    opponent = home if side == away else away
    sport = str(game.get("sport") or leg.get("sport") or "")
    kick = _parse(str(game.get("kickoff") or ""))
    recent = [row for row in _schedule(sport, opponent) if kick and row["state"] == "post" and row["when"] < kick and (kick.astimezone(_ET).date() - row["day"]).days <= 14]
    recent = sorted(recent, key=lambda row: row["when"], reverse=True)[:5]
    if len(recent) < 3:
        return []
    wins = sum(1 for row in recent if row["won"])
    score = 6 if wins / len(recent) <= 0.34 else -6 if wins / len(recent) >= 0.7 else 0
    if not score:
        return []
    return [(f"opp:{_nick(opponent)}", score, f"{_nick(opponent)} has won {wins} of {len(recent)} in the last two weeks.")]

def _person(leg: dict, game: dict | None, name: str) -> list[tuple[str, int, str]]:
    sport = str(leg.get("sport") or (game or {}).get("sport") or "")
    text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
    path = _PATH.get(sport)
    sit = _situation(game) if game and path else {}
    notes = _gtd(name, sit)
    pack = _player_log(sport, path, name) if path and name else None
    team = str((pack or {}).get("team") or "")
    notes.extend(_roles(name, team, text, sit))
    if pack:
        notes.extend(_trend(pack, name))
    spec = _spec(text)
    logged = _rows(pack, spec[0]) if pack and spec else []
    if logged:
        bar = _bar(text, spec[2])
        if bar is not None:
            under = bool(re.search(r"\bunder\b", text, re.I))
            notes.extend(_splits(logged, bar, under, name, game, team, sport))
    if path and team and game:
        notes.extend(_trip(sport, team, name, game, logged))
    return notes

def _gtd(name: str, sit: dict) -> list[tuple[str, int, str]]:
    for row in sit.get("injuries") or []:
        status = str(row.get("status") or "").lower()
        if status in {"questionable", "day-to-day", "game-time decision"} and _same(str(row.get("player") or ""), name):
            return [(f"gtd:{name.lower()}", -8, f"{_nick(name)} is a game-time decision.")]
    return []

def _roles(name: str, team: str, text: str, sit: dict) -> list[tuple[str, int, str]]:
    low = text.lower()
    notes: list[tuple[str, int, str]] = []
    for row in sit.get("injuries") or []:
        who = str(row.get("player") or "")
        if not who or _same(who, name) or str(row.get("status") or "").lower() not in {"out", "doubtful"}:
            continue
        pos = str(row.get("pos") or "").upper()
        own = bool(team) and _same(str(row.get("team") or ""), team)
        if not own and pos == "C" and "rebound" in low:
            notes.append((f"c:{who}", 8, f"Their center {_call(who)} is out."))
        elif not own and pos == "PG" and "assist" in low:
            notes.append((f"pg:{who}", 8, f"Their point guard {_call(who)} is out."))
        elif own and pos in {"PG", "C"} and any(word in low for word in ("point", "rebound", "shot")):
            notes.append((f"mate:{who}", 4, f"Teammate {_call(who)} is out."))
    return notes[:2]

def _trend(pack: dict, name: str) -> list[tuple[str, int, str]]:
    names = list(pack.get("names") or [])
    nick = _nick(name)
    notes: list[tuple[str, int, str]] = []
    for key, cutoff, up, down in (("minutes", 4, f"{nick}'s minutes are up.", f"{nick}'s minutes are down."), ("receivingTargets", 2, f"{nick}'s targets are up.", f"{nick}'s targets are down.")):
        if key not in names:
            continue
        delta = _avg_delta(pack, names.index(key))
        if delta is None:
            continue
        if delta >= cutoff:
            notes.append((f"{key}:{nick}", 6, up))
        elif delta <= -cutoff:
            notes.append((f"{key}:{nick}", -6, down))
    return notes

def _avg_delta(pack: dict, index: int) -> float | None:
    values = []
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        if index < len(stats):
            value = _value(stats[index], "minutes")
            if value is not None:
                values.append(value)
    if len(values) < 6:
        return None
    width = min(5, len(values) - 3)
    return sum(values[:3]) / 3 - sum(values[3:3 + width]) / width

def _splits(rows: list[dict], bar: float, under: bool, name: str, game: dict | None, team: str, sport: str) -> list[tuple[str, int, str]]:
    notes: list[tuple[str, int, str]] = []
    nick = _nick(name)
    did = "stayed under" if under else "cleared"
    kick = _parse(str((game or {}).get("kickoff") or ""))
    last = _parse(rows[0]["date"]) if rows else None
    if kick and last and 15 <= (kick.astimezone(_ET).date() - last.astimezone(_ET).date()).days <= 40:
        notes.append((f"rust:{nick}", -6, f"{nick} is in the first game back."))
    short, other = _rest_rows(rows)
    found = _slice(short, other, bar, under) if short and other else None
    if found is not None:
        word = "only " if found[0] < 0 else ""
        notes.append((f"short:{nick}", found[0], f"After a short week, {nick} {did} it in {word}{_hits(short, bar, under)} of {len(short)}. Other weeks are different."))
    events = _schedule(sport, team) if team else []
    if events and game:
        home_rows, road_rows = _sites(rows, events)
        at_home = _same(team, str(game.get("homeName") or ""))
        piece, rest = (home_rows, road_rows) if at_home else (road_rows, home_rows)
        found = _slice(piece, rest, bar, under) if piece and rest else None
        if found is not None:
            where = "At home" if at_home else "On the road"
            word = "only " if found[0] < 0 else ""
            notes.append((f"site:{nick}", found[0], f"{where}, {nick} {did} it in {word}{_hits(piece, bar, under)} of {len(piece)}. The other sites are different."))
    return notes

def _rest_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    short: list[dict] = []
    other: list[dict] = []
    for index, row in enumerate(rows[:-1]):
        newer, older = _parse(row["date"]), _parse(rows[index + 1]["date"])
        if not newer or not older:
            continue
        gap = (newer.astimezone(_ET).date() - older.astimezone(_ET).date()).days
        if 1 <= gap <= 3:
            short.append(row)
        elif gap >= 6:
            other.append(row)
    return short, other

def _sites(rows: list[dict], events: list[dict]) -> tuple[list[dict], list[dict]]:
    home_rows: list[dict] = []
    road_rows: list[dict] = []
    for row in rows:
        stamp = _parse(row["date"])
        if stamp is None:
            continue
        day = stamp.astimezone(_ET).date()
        event = next((item for item in events if item["day"] == day and _same(item["opponent"], row["opponent"])), None)
        event = event or next((item for item in events if item["day"] == day), None)
        if event is not None:
            (home_rows if event["home"] else road_rows).append(row)
    return home_rows, road_rows

def _trip(sport: str, team: str, name: str, game: dict, played: list[dict]) -> list[tuple[str, int, str]]:
    kick = _parse(str(game.get("kickoff") or ""))
    events = _schedule(sport, team)
    if not kick or not events:
        return []
    nick = _nick(name)
    past = sorted((row for row in events if row["state"] == "post" and row["when"] < kick), key=lambda row: row["when"], reverse=True)
    upcoming = sorted((row for row in events if row["state"] == "pre" and row["when"] > kick), key=lambda row: row["when"])
    notes = _body(played, events, game, team, nick, kick)
    notes.extend(_rest_edge(sport, team, nick, game, kick, played))
    notes.extend(_zones(team, game, nick))
    if past and _rival(team, past[0]["opponent"]) and not _rival(str(game.get("awayName") or ""), str(game.get("homeName") or "")):
        notes.append((f"let:{nick}", -6, "This is the game after a rivalry."))
    if upcoming and _rival(team, upcoming[0]["opponent"]):
        notes.append((f"ahead:{nick}", -6, "A rivalry is the next game."))
    return notes

def _body(played: list[dict], events: list[dict], game: dict, team: str, nick: str, kick: Any) -> list[tuple[str, int, str]]:
    notes: list[tuple[str, int, str]] = []
    day = kick.astimezone(_ET).date()
    if sum(1 for row in played if (stamp := _parse(row["date"])) and 0 < (day - stamp.astimezone(_ET).date()).days <= 3) >= 2:
        notes.append((f"crowd:{nick}", -8, f"{nick} is playing a third game in four nights."))
    if events and not _same(team, str(game.get("homeName") or "")):
        streak = 1
        for row in played:
            stamp = _parse(row["date"])
            if stamp is None or (day - stamp.astimezone(_ET).date()).days <= 0:
                continue
            event = next((item for item in events if item["day"] == stamp.astimezone(_ET).date() and _same(item["opponent"], row["opponent"])), None)
            if event is None or event["home"]:
                break
            streak += 1
        if streak >= 4:
            notes.append((f"trip:{nick}", -8, f"This is game {streak} of the road trip."))
    return notes

def _rest_edge(sport: str, team: str, nick: str, game: dict, kick: Any, played: list[dict]) -> list[tuple[str, int, str]]:
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    opponent = home if _same(team, away) else away if _same(team, home) else ""
    last = _parse(played[0]["date"]) if played else None
    if not opponent or last is None:
        return []
    mine = (kick.astimezone(_ET).date() - last.astimezone(_ET).date()).days
    theirs = [row for row in _schedule(sport, opponent) if row["state"] == "post" and row["when"] < kick]
    if not theirs:
        return []
    other = (kick.astimezone(_ET).date() - max(theirs, key=lambda row: row["when"])["day"]).days
    if mine - other >= 3:
        return [(f"rest:{nick}", 6, f"{nick} has {mine} days of rest. The {_nick(opponent)} have {other}.")]
    if other - mine >= 3:
        return [(f"rest:{nick}", -6, f"The {_nick(opponent)} have {other} days of rest. {nick} has {mine}.")]
    return []

def _zones(team: str, game: dict, nick: str) -> list[tuple[str, int, str]]:
    home_tz = _TZ.get(_nick(team).lower())
    venue_tz = _CITY.get(str(_situation(game).get("city") or "").lower())
    if home_tz is None or venue_tz is None:
        return []
    kick = _parse(str(game.get("kickoff") or ""))
    hour = kick.astimezone(_ET).hour if kick else 18
    away = not _same(team, str(game.get("homeName") or ""))
    if away and home_tz <= -3 and venue_tz >= -1 and hour < 16:
        return [(f"early:{nick}", -8, "A West Coast team is playing an early East Coast start.")]
    if abs(home_tz - venue_tz) >= 2:
        return [(f"zones:{nick}", -6, "This trip crosses two time zones.")]
    return []

def _easier(built: list[list[Any]]) -> None:
    groups: dict[tuple[str, str, bool], list[tuple[float, list, str]]] = {}
    for rows, offer in built:
        for leg in offer.get("legs") or []:
            if not isinstance(leg, dict):
                continue
            name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
            text = f"{leg.get('market') or ''} {leg.get('runner') or ''} {leg.get('label') or ''}"
            bar = _bar(text, False)
            if not name or bar is None:
                continue
            family = re.sub(r"\s+", " ", re.sub(r"\d+(?:\.\d+)?", "", re.sub(r"\b(alt|alternate)\b", "", str(leg.get("market") or "").lower()))).strip()
            under = bool(re.search(r"\bunder\b", text, re.I))
            groups.setdefault((name.lower(), family, under), []).append((bar, rows, name))
    for (_name, _family, under), items in groups.items():
        bars = {bar for bar, _rows, _who in items}
        if len(bars) < 2:
            continue
        best = max(bars) if under else min(bars)
        said: set[int] = set()
        for bar, rows, name in items:
            if bar == best and id(rows) not in said:
                said.add(id(rows))
                rows.append((f"line:{name.lower()}", 6, f"This is the easier number on {_nick(name)}."))

def _rival(left: str, right: str) -> bool:
    blob = f"{left} {right}".lower()
    return any(all(word in blob for word in pair) for pair in _RIVALS)

def _schedule(sport: str, team: str) -> list[dict[str, Any]]:
    key = f"{sport}|{team.strip().lower()}"
    if key in _SCHED:
        return _SCHED[key]
    path = _PATH.get(sport)
    if not path or not team.strip():
        _SCHED[key] = []
        return []
    try:
        team_id = _team_id(team, path[0], path[1])
        rows = _events(path, team_id) if team_id else []
    except Exception:  # noqa: BLE001
        rows = []
    _SCHED[key] = rows
    return rows

def _events(path: tuple[str, str], team_id: str) -> list[dict[str, Any]]:
    sport_name, league = path
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport_name}/{league}/teams/{team_id}/schedule"
    data = get_json(url, referer="https://www.espn.com/", timeout=12)
    rows = []
    for event in data.get("events") or []:
        if int((event.get("season") or {}).get("type") or 0) == 1:
            continue
        comp = (event.get("competitions") or [{}])[0] or {}
        state = str(((comp.get("status") or {}).get("type") or {}).get("state") or "")
        sides = [side for side in comp.get("competitors") or [] if isinstance(side, dict)]
        mine = next((side for side in sides if str((side.get("team") or {}).get("id") or "") == str(team_id)), None)
        other = next((side for side in sides if side is not mine), None)
        when = _parse(str(event.get("date") or ""))
        if not mine or not other or when is None:
            continue
        rows.append({
            "when": when,
            "day": when.astimezone(_ET).date(),
            "home": str(mine.get("homeAway") or "") == "home",
            "opponent": str((other.get("team") or {}).get("displayName") or ""),
            "won": bool(mine.get("winner")),
            "state": state,
        })
    return rows
