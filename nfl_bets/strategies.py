"""Extra parlay cards from the FanDuel prices already on the board.

Each card is one ticket. A window that cannot be filled stays empty.
This does not send a bet.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _from_decimal, _who, _yardage
from nfl_bets.choose import _clock, _fits, _parse, _place, offer_legs
from nfl_bets.hedge import american_decimal, implied_prob

_ET = ZoneInfo("America/New_York")
Row = tuple[dict[str, Any], dict[str, Any]]


def build_new(games: list[dict[str, Any]]) -> dict[str, Any]:
    return build_from(_pools(list(games or [])))


def build_from(pools: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> dict[str, Any]:
    props = [(game, [leg for leg in legs if _fits(leg, "any")]) for game, legs in pools]
    sides = [(game, [leg for leg in legs if _ou(leg) and -220 <= leg["odds"] <= -110]) for game, legs in pools]
    early = [(game, legs) for game, legs in props if _hour(game) < 16]
    prime = [(game, legs) for game, legs in props if _hour(game) >= 19]
    weekend = [(game, legs) for game, legs in props if _weekend(game)]
    touch = [(game, [leg for leg in legs if _anytime_td(leg)]) for game, legs in props if str(game.get("sport") or "") == "NFL"]
    touch = [(game, legs) for game, legs in touch if legs]
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
        "early3": _with(_search(early, 3, _every(_playable), _likely) + _search(early, 2, _every(_playable), _likely), 2, "Early slate, 2 to 3 legs", "Legs from games that start before 4:00 PM ET."),
        "prime3": _with(_search(prime, 3, _every(_playable), _likely), 3, "Prime time, 3 legs", "Three legs from games that start at 7:00 PM ET or later."),
        "weekend4": _with(_search(weekend, 4, _every(lambda leg: -260 <= leg["odds"] <= -140), _near(-200)), 4, "Weekend special, 4 legs", "Four legs from Saturday and Sunday games."),
        "td2": _td_card(touch, 2, "2 NFL players, 1 TD each", "Two NFL players, each scoring one touchdown, in a game totaled at 47 or higher."),
        "td3": _td_card(touch, 3, "3 NFL players, 1 TD each", "Three NFL players, each scoring one touchdown, in a game totaled at 47 or higher."),
    }
    found = cards["early3"]
    if len(found.get("legs") or []) == 3:
        found["goal"] = "Three legs from games that start before 4:00 PM ET."
    return cards


def _slate(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(_ET)
    horizon = now + timedelta(days=14)
    picked = []
    for game in games:
        if not str(game.get("sport") or ""):
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < now or stamp > horizon:
            continue
        picked.append(game)
    picked.sort(key=lambda game: str(game.get("kickoff") or ""))
    return picked


def _pools(games: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    picked = _slate(list(games or []))
    with ThreadPoolExecutor(max_workers=8) as pool:
        loaded = list(pool.map(_load, picked))
    return [(game, legs) for game, legs in loaded if legs]


def _load(game: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        legs, _live = offer_legs(game)
    except Exception:  # noqa: BLE001
        return game, []
    return game, [leg for leg in legs if isinstance(leg, dict) and isinstance(leg.get("odds"), int)]


def _search(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int, accept, score) -> list[list[Row]]:
    found: dict[str, tuple[float, list[Row]]] = {}
    _cover(rows, count, accept, score, found, True)
    by_sport: dict[str, list[tuple[dict[str, Any], list[dict[str, Any]]]]] = {}
    for game, legs in rows:
        if legs:
            by_sport.setdefault(str(game.get("sport") or ""), []).append((game, legs))
    for batch in by_sport.values():
        _cover(batch, count, accept, score, found, False)
    return [paired for _rank, paired in sorted(found.values(), key=lambda item: item[0])]


def _cover(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int, accept, score, found: dict[str, tuple[float, list[Row]]], single: bool) -> None:
    if accept is _split_sides:
        _cover_sides(rows, accept, score, found, single)
        return
    if accept is _mix:
        _cover_mix(rows, accept, score, found, single)
        return
    if getattr(score, "flat", False):
        _cover_flat(rows, count, accept, score, found, single)
        return
    each = getattr(accept, "each", None)
    picks: list[Row] = []
    for game, legs in rows:
        eligible = [leg for leg in legs if _player(leg) and (each is None or each(leg))]
        if eligible:
            picks.append((min(eligible, key=lambda leg: score([(leg, game)])), game))
    ranked = sorted(picks, key=lambda row: score([row]))
    if len(ranked) < count:
        return
    combos = [_take(ranked, None, count)]
    if not single:
        combos.extend(_take(ranked, row, count) for row in ranked)
    for combo in combos:
        if combo:
            _store(found, combo, accept, score)


def _take(ranked: list[Row], required: Row | None, count: int) -> list[Row] | None:
    picked: list[Row] = []
    players: set[str] = set()
    games: set[str] = set()
    ordered = [required] if required is not None else []
    ordered.extend(row for row in ranked if row is not required)
    for leg, game in ordered:
        gid = str(game.get("id") or "")
        player = _player(leg)
        if gid in games or not player or player in players:
            continue
        games.add(gid)
        players.add(player)
        picked.append((leg, game))
        if len(picked) == count:
            return picked
    return None


def _cover_flat(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int, accept, score, found: dict[str, tuple[float, list[Row]]], single: bool) -> None:
    each = getattr(accept, "each", None)
    ordered = []
    for game, legs in rows:
        for leg in legs:
            if _player(leg) and (each is None or each(leg)):
                ordered.append((leg, game, implied_prob(leg["odds"])))
    ordered.sort(key=lambda item: item[2])
    best: tuple[float, list[Row]] | None = None
    by_game: dict[str, tuple[float, list[Row]]] = {}
    for index, item in enumerate(ordered):
        combo = _nearest(ordered, index, count)
        if not combo:
            continue
        rank = score(combo)
        gid = str(item[1].get("id") or "")
        prior = by_game.get(gid)
        if prior is None or rank < prior[0]:
            by_game[gid] = (rank, combo)
        if best is None or rank < best[0]:
            best = (rank, combo)
    chosen = [best[1]] if single and best else [combo for _rank, combo in by_game.values()]
    for combo in chosen:
        _store(found, combo, accept, score)


def _nearest(ordered: list[tuple[dict[str, Any], dict[str, Any], float]], index: int, count: int) -> list[Row] | None:
    _leg, game, prob = ordered[index]
    chosen: list[Row] = [(ordered[index][0], game)]
    seen_g = {str(game.get("id") or "")}
    seen_p = {_player(ordered[index][0])}
    left, right = index - 1, index + 1
    while len(chosen) < count and (left >= 0 or right < len(ordered)):
        take_left = right >= len(ordered) or (left >= 0 and abs(ordered[left][2] - prob) <= abs(ordered[right][2] - prob))
        item = ordered[left] if take_left else ordered[right]
        left, right = (left - 1, right) if take_left else (left, right + 1)
        gid = str(item[1].get("id") or "")
        player = _player(item[0])
        if gid in seen_g or not player or player in seen_p:
            continue
        seen_g.add(gid)
        seen_p.add(player)
        chosen.append((item[0], item[1]))
    return chosen if len(chosen) == count else None


def _cover_mix(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], accept, score, found: dict[str, tuple[float, list[Row]]], single: bool) -> None:
    favs: list[Row] = []
    dogs: list[Row] = []
    for game, legs in rows:
        fav = [leg for leg in legs if -300 <= leg["odds"] <= -120 and _player(leg)]
        dog = [leg for leg in legs if 100 <= leg["odds"] <= 220 and _player(leg)]
        if fav:
            favs.append((min(fav, key=lambda leg: -implied_prob(leg["odds"])), game))
        if dog:
            dogs.append((min(dog, key=lambda leg: -implied_prob(leg["odds"])), game))
    favs.sort(key=lambda row: score([row]))
    dogs.sort(key=lambda row: score([row]))
    combos = []
    if single:
        if len(favs) >= 2 and dogs:
            combos.append(_mix_of(dogs[0], favs))
    else:
        for dog in dogs:
            combos.append(_mix_of(dog, favs))
        for fav in favs:
            combos.append(_mix_of(fav, favs, dogs))
    for combo in combos:
        if combo:
            _store(found, combo, accept, score)


def _mix_of(required: Row, favs: list[Row], dogs: list[Row] | None = None) -> list[Row] | None:
    rid = str(required[1].get("id") or "")
    if dogs is None:
        combo = [row for row in favs if str(row[1].get("id") or "") != rid][:2]
        combo.append(required)
    else:
        second = next((row for row in favs if row is not required and str(row[1].get("id") or "") != rid), None)
        dog = next((row for row in (dogs or []) if str(row[1].get("id") or "") not in {rid, str(second[1].get("id") or "") if second else ""}), None)
        if second is None or dog is None:
            return None
        combo = [required, second, dog]
    games = {str(item[1].get("id") or "") for item in combo}
    players = {_player(item[0]) for item in combo}
    if len(combo) != 3 or len(games) < 3 or len(players) < 3:
        return None
    return combo


def _cover_sides(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], accept, score, found: dict[str, tuple[float, list[Row]]], single: bool) -> None:
    overs: list[Row] = []
    unders: list[Row] = []
    for game, legs in rows:
        over = [leg for leg in legs if _ou(leg) == "over" and _player(leg)]
        under = [leg for leg in legs if _ou(leg) == "under" and _player(leg)]
        if over:
            overs.append((max(over, key=lambda leg: implied_prob(leg["odds"])), game))
        if under:
            unders.append((max(under, key=lambda leg: implied_prob(leg["odds"])), game))
    overs.sort(key=lambda row: -implied_prob(row[0]["odds"]))
    unders.sort(key=lambda row: -implied_prob(row[0]["odds"]))
    seeds = [None] if single else [None, *overs, *unders]
    for seed in seeds:
        combo = _sides_of(overs, unders, seed)
        if combo:
            _store(found, combo, accept, score)


def _sides_of(overs: list[Row], unders: list[Row], required: Row | None) -> list[Row] | None:
    chosen: list[Row] = []
    games: set[str] = set()
    players: set[str] = set()

    def add(row: Row) -> bool:
        leg, game = row
        gid = str(game.get("id") or "")
        player = _player(leg)
        if gid in games or not player or player in players:
            return False
        games.add(gid)
        players.add(player)
        chosen.append(row)
        return True

    if required is not None:
        add(required)
    for row in overs:
        if sum(_ou(leg) == "over" for leg, _game in chosen) >= 2:
            break
        add(row)
    for row in unders:
        if sum(_ou(leg) == "under" for leg, _game in chosen) >= 2:
            break
        add(row)
    return chosen if len(chosen) == 4 and _split_sides(chosen) else None


def _store(found: dict[str, tuple[float, list[Row]]], combo: list[Row], accept, score) -> None:
    if not accept(combo):
        return
    mark = "|".join(sorted(str(leg.get("label") or "") for leg, _game in combo))
    rank = score(combo)
    prior = found.get(mark)
    if prior is None or rank < prior[0]:
        found[mark] = (rank, combo)


def _with(combos: list[list[Row]], count: int, title: str, goal: str) -> dict[str, Any]:
    ready = [combo for combo in combos if len(combo) >= count]
    card = _ticket(ready[0] if ready else [], count, title, goal)
    card["offers"] = []
    for combo in ready:
        alt = _ticket(combo, count, title, goal)
        if not alt.get("legs"):
            continue
        card["offers"].append({"title": str(alt.get("american") if alt.get("american") is not None else ""), "price": alt.get("american"), "impliedPct": alt.get("impliedPct"), "legs": alt["legs"]})
    return card


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
    def accept(paired: list[Row]) -> bool:
        return all(test(leg) for leg, _game in paired)
    accept.each = test
    return accept


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


_flat.flat = True


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


def _td_card(rows: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int, title: str, goal: str) -> dict[str, Any]:
    from nfl_bets.td_read import td_parlays

    found = td_parlays(rows, count)
    if not found:
        fallback = "Two NFL players to score a touchdown, each in a different game." if count == 2 else "Three NFL players to score a touchdown, each in a different game."
        return _with(_search(rows, count, _every(_anytime_td), _likely), count, title, fallback)
    card = _with([item["combo"] for item in found], count, title, goal)
    card["note"] = "FanDuel's same-game button can charge a different number."
    says = {tuple(sorted(str(leg.get("runner") or "") for leg, _game in item["combo"])): item["say"] for item in found}
    for offer in card.get("offers") or []:
        key = tuple(sorted(str(leg.get("runner") or "") for leg in offer.get("legs") or []))
        if key in says:
            offer["why"] = says[key]
    return card


def _anytime_td(leg: dict[str, Any]) -> bool:
    market = str(leg.get("market") or "").lower()
    if "any time touchdown scorer" not in market and "anytime touchdown scorer" not in market:
        return False
    return not any(word in market for word in ("half", "quarter", "1st", "first", "last", "either", "2+", "3+"))


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
