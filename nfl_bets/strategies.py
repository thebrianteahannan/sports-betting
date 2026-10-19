"""Extra parlay cards from the FanDuel prices already on the board.

Each card is one ticket. A window that cannot be filled stays empty.
This does not send a bet.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from itertools import combinations, product
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _from_decimal, _who, _yardage
from nfl_bets.choose import _clock, _fits, _parse, _place, offer_legs
from nfl_bets.hedge import american_decimal, implied_prob

_ET = ZoneInfo("America/New_York")
_CAP = 16
_KEEP = 6
Row = tuple[dict[str, Any], dict[str, Any]]


def build_new(games: list[dict[str, Any]]) -> dict[str, Any]:
    return build_from(_pools(list(games or [])))


def build_from(pools: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> dict[str, Any]:
    props = [(game, [leg for leg in legs if _fits(leg, "any")]) for game, legs in pools]
    sides = [(game, [leg for leg in legs if _ou(leg) and -220 <= leg["odds"] <= -110]) for game, legs in pools]
    early = [(game, legs) for game, legs in props if _hour(game) < 16]
    prime = [(game, legs) for game, legs in props if _hour(game) >= 19]
    weekend = [(game, legs) for game, legs in props if _weekend(game)]
    cards = {
        "safe2": _with(_search(props, 2, _every(lambda leg: implied_prob(leg["odds"]) >= 0.75), _likely), 2, "Safe 2-leg, both 75%+", "Both legs are 75% or better."),
        "mid3": _with(_search(props, 3, _every(lambda leg: -400 <= leg["odds"] <= -250), _near(-325)), 3, "3 legs, −250 to −400", "Every leg is priced from −250 to −400."),
        "win4": _with(_search(props, 4, _every(lambda leg: -300 <= leg["odds"] <= -150), _near(-225)), 4, "4 legs, −150 to −300", "Every leg is priced from −150 to −300."),
        "plusLegs": _with(_search(props, 2, _every(lambda leg: 100 <= leg["odds"] <= 200), _likely), 2, "+100 to +200 legs", "Both legs are priced from +100 to +200."),
        "mix21": _with(_search(props, 3, _mix, _likely), 3, "2 favorites and 1 underdog", "Two favorites and one underdog, each from a different game."),
        "low3": _with(_search(props, 3, _every(lambda leg: -230 <= leg["odds"] <= -170), _flat), 3, "Low-variance 3-leg", "Three legs priced close to each other, each from a different game."),
        "yards3": _with(_search(props, 3, _every(_yards80), _yards_rank), 3, "3 yardage legs near 80% each", "Three yardage legs, each near an 80% price."),
        "ou4": _with(_search(sides, 4, _split_sides, _likely), 4, "2 overs and 2 unders", "Two overs and two unders, each from a different game."),
        "alt3": _with(_search(props, 3, _every(_alt85), _likely), 3, "Alt lines, 3 legs, 85%+", "Three alt lines, each at 85% or better."),
        "games4": _with(_search(props, 4, _every(lambda leg: -280 <= leg["odds"] <= -140), _near(-200)), 4, "4 legs, 4 different games", "One player from each of four games."),
        "early3": _with(_search(early, 3, _every(_playable), _likely) or _search(early, 2, _every(_playable), _likely), 2, "Early slate, 2 to 3 legs", "Legs from games that start before 4:00 PM ET."),
        "prime3": _with(_search(prime, 3, _every(_playable), _likely), 3, "Prime time, 3 legs", "Three legs from games that start at 7:00 PM ET or later."),
        "weekend4": _with(_search(weekend, 4, _every(lambda leg: -260 <= leg["odds"] <= -140), _near(-200)), 4, "Weekend special, 4 legs", "Four legs from Saturday and Sunday games."),
    }
    found = cards["early3"]
    if len(found.get("legs") or []) == 3:
        found["goal"] = "Three legs from games that start before 4:00 PM ET."
    return cards


def _slate(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(_ET)
    grouped: dict[str, list[tuple[datetime, dict[str, Any]]]] = {}
    for game in games:
        sport = str(game.get("sport") or "")
        if not sport:
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < now:
            continue
        grouped.setdefault(sport, []).append((stamp, game))
    for rows in grouped.values():
        rows.sort(key=lambda item: item[0])
    order = sorted(grouped, key=lambda sport: grouped[sport][0][0])
    picked: list[dict[str, Any]] = []
    round_n = 0
    while len(picked) < _CAP:
        added = False
        for sport in order:
            rows = grouped[sport]
            if round_n >= len(rows):
                continue
            picked.append(rows[round_n][1])
            added = True
            if len(picked) >= _CAP:
                break
        if not added:
            break
        round_n += 1
    return picked


def _pools(games: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    picked = _slate(list(games or []))
    with ThreadPoolExecutor(max_workers=6) as pool:
        loaded = list(pool.map(_load, picked))
    return [(game, legs) for game, legs in loaded if legs]


def _load(game: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        legs, _live = offer_legs(game)
    except Exception:  # noqa: BLE001
        return game, []
    return game, [leg for leg in legs if isinstance(leg, dict) and isinstance(leg.get("odds"), int)]


def _search(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int, accept, score) -> list[list[Row]]:
    menus = [(game, _sample(legs)) for game, legs in rows if legs]
    menus = menus[:10]
    if len(menus) < count:
        return []
    found: list[tuple[float, str, list[Row]]] = []
    for group in combinations(range(len(menus)), count):
        choices = [menus[index][1] for index in group]
        games = [menus[index][0] for index in group]
        for picks in product(*choices):
            players: list[str] = []
            paired: list[Row] = []
            skip = False
            for pos, leg in enumerate(picks):
                player = _player(leg)
                if not player or player in players:
                    skip = True
                    break
                players.append(player)
                paired.append((leg, games[pos]))
            if skip or not accept(paired):
                continue
            mark = "|".join(sorted(str(leg.get("label") or "") for leg, _game in paired))
            rank = score(paired)
            prior = next((index for index, item in enumerate(found) if item[1] == mark), None)
            if prior is not None:
                if rank < found[prior][0]:
                    found[prior] = (rank, mark, paired)
                    found.sort(key=lambda item: item[0])
                continue
            found.append((rank, mark, paired))
            found.sort(key=lambda item: item[0])
            del found[_KEEP:]
    return [item[2] for item in found]


def _with(combos: list[list[Row]], count: int, title: str, goal: str) -> dict[str, Any]:
    ready = [combo for combo in combos if len(combo) >= count][:_KEEP]
    card = _ticket(ready[0] if ready else [], count, title, goal)
    card["offers"] = []
    for combo in ready:
        alt = _ticket(combo, count, title, goal)
        if not alt.get("legs"):
            continue
        card["offers"].append({"title": str(alt.get("american") if alt.get("american") is not None else ""), "price": alt.get("american"), "impliedPct": alt.get("impliedPct"), "legs": alt["legs"]})
    return card


def _sample(legs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(legs, key=lambda leg: leg["odds"])
    if len(ordered) <= 4:
        return ordered
    spots = sorted({round(index * (len(ordered) - 1) / 3) for index in range(4)})
    return [ordered[index] for index in spots]


def _ticket(combo: list[Row], count: int, title: str, goal: str) -> dict[str, Any]:
    if len(combo) < count:
        return {"title": title, "strategy": title, "game": "", "goal": goal, "copy": "FanDuel does not have enough legs in this window right now.", "legs": [], "note": ""}
    decimal = 1.0
    for leg, _game in combo:
        decimal *= american_decimal(leg["odds"])
    american = _from_decimal(decimal)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    profit = round(5 * (decimal - 1.0), 2)
    legs = []
    for leg, game in combo:
        legs.append({
            "market": leg.get("market") or "",
            "runner": leg.get("runner") or "",
            "label": f"{leg.get('label') or ''} — {game.get('sport')}, {_place(game)}, {_clock(game)}",
            "odds": leg.get("odds"),
            "kickoff": game.get("kickoff") or "",
            "gameId": str(game.get("id") or ""),
            "sport": game.get("sport") or "",
            "pct": f"{implied_prob(leg['odds']) * 100:.1f}%",
        })
    signed = f"+{american}" if american is not None and american > 0 else american
    return {
        "title": title,
        "strategy": title,
        "game": "",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": 5,
        "profit": profit,
        "live": False,
        "note": "",
        "copy": f"{len(combo)} FanDuel legs multiply to {signed}. The parlay is about {chance}%. A $5 bet would win ${profit:.2f}.",
        "legs": legs,
    }


def _every(test):
    return lambda paired: all(test(leg) for leg, _game in paired)


def _likely(paired: list[Row]) -> float:
    prob = 1.0
    for leg, _game in paired:
        prob *= implied_prob(leg["odds"])
    return -prob


def _near(center: int):
    return lambda paired: sum(abs(leg["odds"] - center) for leg, _game in paired)


def _flat(paired: list[Row]) -> float:
    probs = [implied_prob(leg["odds"]) for leg, _game in paired]
    mean = sum(probs) / len(probs)
    return sum((prob - mean) ** 2 for prob in probs)


def _yards_rank(paired: list[Row]) -> float:
    return sum(abs(implied_prob(leg["odds"]) - 0.80) for leg, _game in paired)


def _mix(paired: list[Row]) -> bool:
    fav = sum(1 for leg, _game in paired if -300 <= leg["odds"] <= -120)
    dog = sum(1 for leg, _game in paired if 100 <= leg["odds"] <= 220)
    return fav == 2 and dog == 1


def _playable(leg: dict[str, Any]) -> bool:
    return -300 <= leg["odds"] <= -130


def _yards80(leg: dict[str, Any]) -> bool:
    return bool(_yardage(leg)) and 0.75 <= implied_prob(leg["odds"]) <= 0.85


def _alt85(leg: dict[str, Any]) -> bool:
    text = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    return ("alt" in text or "+" in text) and implied_prob(leg["odds"]) >= 0.85


def _ou(leg: dict[str, Any]) -> str:
    runner = str(leg.get("runner") or "").strip().lower()
    side = "over" if runner.startswith("over") else "under" if runner.startswith("under") else ""
    market = str(leg.get("market") or "")
    if not side or " - " not in market:
        return ""
    head = market.split(" - ", 1)[0].strip().lower()
    if not head or any(word in head for word in ("total", "spread", "team")):
        return ""
    return side


def _split_sides(paired: list[Row]) -> bool:
    sides = [_ou(leg) for leg, _game in paired]
    return sides.count("over") == 2 and sides.count("under") == 2


def _player(leg: dict[str, Any]) -> str:
    who = _who(leg)
    if who and who not in {"over", "under", "yes", "no"}:
        return who
    market = str(leg.get("market") or "")
    head = market.split(" - ", 1)[0].strip().lower() if " - " in market else ""
    if head and head not in {"over", "under"}:
        return head
    return ""


def _hour(game: dict[str, Any]) -> int:
    stamp = _parse(str(game.get("kickoff") or ""))
    if stamp is None:
        return -1
    return stamp.astimezone(_ET).hour


def _weekend(game: dict[str, Any]) -> bool:
    stamp = _parse(str(game.get("kickoff") or ""))
    return stamp is not None and stamp.astimezone(_ET).weekday() >= 5
