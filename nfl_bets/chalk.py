"""Two football parlays from the same FanDuel prop board.

Near -180 stacks prices from -400 to -700 until the parlay is about -180.
Four at 85% picks four small player lines, each priced near an 85% chance.
The combined number is the regular parlay: multiply the decimal odds.
A same-game ticket on FanDuel can differ, because those legs move together.
"""

from __future__ import annotations

import re
from itertools import combinations
from typing import Any

from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.http_util import get_json

_AK = "FhMFpcPWXMeyZxOx"
_LOW = -700
_HIGH = -400
_TARGET = -180
_EIGHTY_FIVE = 0.85
_STAKE = 5.0


def build_parlays(game: dict[str, Any]) -> dict[str, Any]:
    event_id = str(game.get("id") or "")
    title = f"{game.get('awayNick') or game.get('away')} at {game.get('homeNick') or game.get('home')}"
    legs, live = _legs(event_id)
    band = _catches_to_yards(legs, [leg for leg in legs if _LOW <= leg["odds"] <= _HIGH])
    cards = {
        "chalk": _chalk_card(event_id, title, band),
        "four": _four_card(event_id, title, band),
        "plus": _plus_card(event_id, title, legs),
        "hits": _hits_card(event_id, title, legs),
    }
    for card in cards.values():
        card["live"] = live
        card["kickoff"] = str(game.get("kickoff") or "")
    return cards


def _chalk_card(event_id: str, title: str, legs: list[dict[str, Any]]) -> dict[str, Any]:
    pick = _best(legs)
    goal = (
        "Going for one parlay priced near -180. "
        "The legs are FanDuel prices between -400 and -700, and the multiplied price is the target."
    )
    if not pick:
        return _empty(event_id, title, "No -180 stack", goal, (
            f"Nothing on {title} in the -400 to -700 band multiplies to about -180."
        ))
    american, combo = pick
    decimal = 1.0
    for leg in combo:
        decimal *= american_decimal(leg["odds"])
    profit = round(_STAKE * (decimal - 1.0), 2)
    chance = round(implied_prob(american) * 100, 1)
    count = len(combo)
    many = {2: "Two", 3: "Three", 4: "Four"}.get(count, str(count))
    return {
        "gameId": event_id,
        "game": title,
        "title": "Near -180",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": _STAKE,
        "profit": profit,
        "copy": (
            f"{many} FanDuel prices between -400 and -700, multiplied as a regular "
            f"parlay, land at {american}. That is about a {chance}% price. "
            f"A ${_STAKE:.0f} bet would win ${profit:.2f}."
        ),
        "note": (
            "This card is the -180 stack. FanDuel's same-game parlay button can charge a different "
            "number, because these legs are in one game and move together."
        ),
        "legs": _publish(combo),
    }


def _four_card(event_id: str, title: str, legs: list[dict[str, Any]]) -> dict[str, Any]:
    goal = (
        "Going for four legs, each priced near an 85% chance. "
        "Small yardage only. Touchdowns and receptions of 4.5 or more stay off. "
        "Four prices near 85% multiply to about a coin flip, not an 85% parlay."
    )
    combo = _best_four(legs)
    if not combo:
        return _empty(event_id, title, "No four-leg 85% parlay", goal, (
            f"Nothing on {title} has four small yardage lines that each sit near an 85% price."
        ))
    decimal = 1.0
    for leg in combo:
        decimal *= american_decimal(leg["odds"])
    american = _from_decimal(decimal)
    profit = round(_STAKE * (decimal - 1.0), 2)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    return {
        "gameId": event_id,
        "game": title,
        "title": "Four at 85% each",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": _STAKE,
        "profit": profit,
        "copy": (
            f"Four small yardage prices, each near 85%, multiply to {american}. "
            f"That parlay is about a {chance}% price. "
            f"A ${_STAKE:.0f} bet would win ${profit:.2f}."
        ),
        "note": (
            "This card is the four-leg 85% idea. FanDuel's same-game parlay button can charge a different "
            "number, because these legs are in one game and move together."
        ),
        "legs": _publish(combo),
    }


def _plus_card(event_id: str, title: str, legs: list[dict[str, Any]]) -> dict[str, Any]:
    goal = (
        "Going for four legs that multiply to about +250, built as safe as that number allows. "
        "Small yardage only. A +250 price is about 29%, so this one misses more often than it hits."
    )
    combo = _best_target(legs, 4, 250, -270)
    if not combo:
        return _empty(event_id, title, "No +250 parlay", goal, (
            f"Nothing on {title} has four small yardage lines that multiply to about +250."
        ))
    american, chance, profit = _price(combo)
    return {
        "gameId": event_id,
        "game": title,
        "title": "Safest near +250",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": _STAKE,
        "profit": profit,
        "copy": (
            f"Four small yardage prices, chosen to land near +250 and to keep the win chance as high "
            f"as that target allows, multiply to {_signed(american)}. "
            f"That is about a {chance}% price. "
            f"A ${_STAKE:.0f} bet would win ${profit:.2f}."
        ),
        "note": (
            "This card is the +250 shape. "
            "Two prices with the same number are not the same job. The stat is in the line."
        ),
        "legs": _publish(combo),
    }


def _hits_card(event_id: str, title: str, legs: list[dict[str, Any]]) -> dict[str, Any]:
    goal = (
        "Going for a count. Five legs near a 90% price, set next to four legs near an 80% price. "
        "The higher combined chance is the stack that hits more often."
    )
    five = _best_chance(legs, 5, 0.90)
    four = _best_chance(legs, 4, 0.80)
    if not five or not four:
        return _empty(event_id, title, "No 90% vs 80% compare", goal, (
            f"Nothing on {title} has both a five-leg 90% stack and a four-leg 80% stack."
        ))
    a5, c5, p5 = _price(five)
    a4, c4, p4 = _price(four)
    more = "five near 90%" if (c5 or 0) >= (c4 or 0) else "four near 80%"
    return {
        "gameId": event_id,
        "game": title,
        "title": "Which stack hits more",
        "goal": goal,
        "copy": (
            f"Five yardage prices nearest 90% multiply to {_signed(a5)}, about {c5}%. "
            f"Four nearest 80% multiply to {_signed(a4)}, about {c4}%. "
            f"The {more} stack is the one that hits more often. "
            f"A ${_STAKE:.0f} bet on the five-leg stack would win ${p5:.2f}. "
            f"On the four-leg stack it would win ${p4:.2f}."
        ),
        "note": (
            "A 90% leg is not a 90% parlay. "
            "FanDuel's same-game button can charge a different number."
        ),
        "legs": [],
        "groups": [
            {"title": "Five near 90% each", "price": _signed(a5), "pct": f"{c5}%", "legs": _publish(five)},
            {"title": "Four near 80% each", "price": _signed(a4), "pct": f"{c4}%", "legs": _publish(four)},
        ],
    }


def _empty(event_id: str, title: str, heading: str, goal: str, copy: str) -> dict[str, Any]:
    return {
        "gameId": event_id,
        "game": title,
        "title": heading,
        "goal": goal,
        "copy": copy,
        "legs": [],
    }


def _legs(event_id: str) -> tuple[list[dict[str, Any]], bool]:
    url = (
        "https://sbapi.nj.sportsbook.fanduel.com/api/event-page"
        f"?eventId={event_id}&tab=popular&_ak={_AK}&timezone=America/New_York"
    )
    data = get_json(url, referer="https://sportsbook.fanduel.com/")
    attachments = data.get("attachments") or {}
    markets = attachments.get("markets") or {}
    live = any(
        bool(event.get("inPlay"))
        for event in (attachments.get("events") or {}).values()
        if isinstance(event, dict) and str(event.get("eventId") or "") == event_id
    )
    rows: list[dict[str, Any]] = []
    for market in markets.values():
        if str(market.get("eventId") or "") != event_id:
            continue
        if str(market.get("marketStatus") or "OPEN").upper() != "OPEN":
            continue
        name = str(market.get("marketName") or "")
        if any(skip in name for skip in ("Regular Season", "Playoff", "Drive 1")):
            continue
        market_id = str(market.get("marketId") or name)
        for runner in market.get("runners") or []:
            odds = _american(runner)
            if odds is None or odds < -1500 or odds > -110:
                continue
            runner_name = str(runner.get("runnerName") or "").strip()
            rows.append(
                {
                    "market": name,
                    "runner": runner_name,
                    "label": _label(name, runner_name),
                    "odds": odds,
                    "key": _key(name, market_id),
                    "prop": _prop(name),
                }
            )
    return rows, live


def _catches_to_yards(legs: list[dict[str, Any]], band: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A modest yardage line at the same price is a better leg than several catches."""
    kept: list[dict[str, Any]] = []
    seen: set[str] = set()
    for leg in band:
        if _td(leg) and not _passing_td(leg):
            continue
        chosen = leg
        if _reception(leg):
            yards = _same_price_yards(legs, leg)
            if yards is not None and _size(yards) <= 55:
                chosen = yards
            elif yards is not None:
                continue
        token = str(chosen.get("key") or chosen.get("label") or "")
        if token in seen:
            continue
        seen.add(token)
        kept.append(chosen)
    return kept


def _reception(leg: dict[str, Any]) -> bool:
    text = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    return "reception" in text and "yard" not in text


def _receiving_yards(leg: dict[str, Any]) -> bool:
    text = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    return "yard" in text and "receiv" in text


def _td(leg: dict[str, Any]) -> bool:
    text = f"{leg.get('market') or ''} {leg.get('runner') or ''} {leg.get('label') or ''}".lower()
    return "touchdown" in text or re.search(r"\btd\b", text) is not None


def _passing_td(leg: dict[str, Any]) -> bool:
    text = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    return _td(leg) and "pass" in text


def _who(leg: dict[str, Any]) -> str:
    text = str(leg.get("runner") or leg.get("label") or "")
    return re.split(r"\d", text, maxsplit=1)[0].strip().lower()


def _same_price_yards(legs: list[dict[str, Any]], catch: dict[str, Any]) -> dict[str, Any] | None:
    name = _who(catch)
    if not name:
        return None
    pool = [leg for leg in legs if _receiving_yards(leg) and _who(leg) == name]
    if not pool:
        return None
    pool.sort(key=lambda leg: abs(implied_prob(leg["odds"]) - implied_prob(catch["odds"])))
    nearest = pool[0]
    if abs(implied_prob(nearest["odds"]) - implied_prob(catch["odds"])) > 0.08:
        return None
    return nearest


def _best(legs: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]] | None:
    ranked: list[tuple[tuple, int, list[dict[str, Any]]]] = []
    for count in (2, 3, 4):
        for combo in combinations(legs, count):
            keys = [leg["key"] for leg in combo]
            if len(set(keys)) != len(keys):
                continue
            decimal = 1.0
            for leg in combo:
                decimal *= american_decimal(leg["odds"])
            american = _from_decimal(decimal)
            if american is None:
                continue
            distance = abs(american - _TARGET)
            props = sum(1 for leg in combo if leg["prop"])
            ranked.append(((0 if distance <= 12 else 1, -props, -count, distance), american, list(combo)))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0])
    _rank, american, combo = ranked[0]
    if abs(american - _TARGET) > 40:
        return None
    return american, combo


def _best_four(legs: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    pool = [leg for leg in legs if leg["prop"] and _yardage(leg) and not _scary(leg)]
    narrow = [leg for leg in pool if abs(implied_prob(leg["odds"]) - _EIGHTY_FIVE) <= 0.03]
    wide = [leg for leg in pool if abs(implied_prob(leg["odds"]) - _EIGHTY_FIVE) <= 0.05]
    use = narrow if len({leg["key"] for leg in narrow}) >= 4 else wide
    best: tuple[tuple[float, float], list[dict[str, Any]]] | None = None
    for combo in combinations(use, 4):
        keys = [leg["key"] for leg in combo]
        if len(set(keys)) != 4:
            continue
        drift = sum(abs(implied_prob(leg["odds"]) - _EIGHTY_FIVE) for leg in combo)
        size = sum(_size(leg) for leg in combo)
        rank = (round(drift, 4), size)
        if best is None or rank < best[0]:
            best = (rank, list(combo))
    return None if best is None else best[1]


def _best_target(legs: list[dict[str, Any]], count: int, target: int, center: int) -> list[dict[str, Any]] | None:
    pool = _closest(legs, implied_prob(center), count, 0.12)
    best: tuple[tuple, list[dict[str, Any]]] | None = None
    for combo in combinations(pool, count):
        if len({leg["key"] for leg in combo}) != count:
            continue
        american, chance, _profit = _price(list(combo))
        if american is None:
            continue
        distance = abs(american - target)
        rank = (0 if distance <= 40 else 1, -(chance or 0), distance, sum(_size(leg) for leg in combo))
        if best is None or rank < best[0]:
            best = (rank, list(combo))
    if best is None or abs(_price(best[1])[0] - target) > 80:
        return None
    return best[1]


def _best_chance(legs: list[dict[str, Any]], count: int, chance: float) -> list[dict[str, Any]] | None:
    pool = _closest(legs, chance, count, 0.08)
    best: tuple[tuple, list[dict[str, Any]]] | None = None
    for combo in combinations(pool, count):
        if len({leg["key"] for leg in combo}) != count:
            continue
        drift = round(sum(abs(implied_prob(leg["odds"]) - chance) for leg in combo), 4)
        rank = (drift, sum(_size(leg) for leg in combo))
        if best is None or rank < best[0]:
            best = (rank, list(combo))
    return None if best is None else best[1]


def _closest(legs: list[dict[str, Any]], chance: float, need: int, slack: float) -> list[dict[str, Any]]:
    ranked = []
    seen: set[str] = set()
    for leg in legs:
        if not leg["prop"] or not _yardage(leg) or _scary(leg) or leg["key"] in seen:
            continue
        drift = abs(implied_prob(leg["odds"]) - chance)
        if drift > slack:
            continue
        seen.add(leg["key"])
        ranked.append((drift, _size(leg), leg))
    if len(ranked) < need and slack < 0.2:
        return _closest(legs, chance, need, slack + 0.04)
    ranked.sort(key=lambda item: (item[0], item[1]))
    return [item[2] for item in ranked[:16]]


def _price(combo: list[dict[str, Any]]) -> tuple[int | None, float | None, float]:
    decimal = 1.0
    for leg in combo:
        decimal *= american_decimal(leg["odds"])
    american = _from_decimal(decimal)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    return american, chance, round(_STAKE * (decimal - 1.0), 2)


def _signed(american: int | None) -> str:
    if american is None:
        return "—"
    return f"+{american}" if american > 0 else str(american)


def _yardage(leg: dict[str, Any]) -> bool:
    text = f"{leg['market']} {leg['label']}".lower()
    return "yd" in text or "yard" in text


def _scary(leg: dict[str, Any]) -> bool:
    text = f"{leg['market']} {leg['runner']} {leg['label']}".lower()
    if "touchdown" in text or re.search(r"\btd\b", text):
        return True
    if "reception" in text:
        number = _size(leg)
        return number >= 4.5
    return False


def _size(leg: dict[str, Any]) -> float:
    match = re.search(r"(\d+(?:\.\d+)?)", f"{leg['runner']} {leg['label']}")
    return float(match.group(1)) if match else 999.0


def _publish(combo: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for leg in combo:
        rows.append({
            "market": leg["market"],
            "runner": leg["runner"],
            "label": leg["label"],
            "odds": leg["odds"],
            "pct": f"{implied_prob(leg['odds']) * 100:.1f}%",
        })
    return rows


def _key(market: str, market_id: str) -> str:
    if " - " in market and "Alternate" not in market.split(" - ", 1)[0]:
        return market.split(" - ", 1)[0].strip().lower()
    return f"m:{market_id}"


def _prop(market: str) -> bool:
    head = market.split(" - ", 1)[0]
    return " - " in market and "Alternate" not in head


def _kind(market: str) -> str:
    text = market.lower()
    if "reception" in text:
        return "receptions"
    if "rush" in text:
        return "rushing"
    if "pass" in text:
        return "passing"
    if "receiv" in text:
        return "receiving"
    return ""


def _label(market: str, runner: str) -> str:
    if runner.lower() in {"over", "under"} or runner[:4].lower() in {"over", "unde"}:
        return f"{market}: {runner}"
    kind = _kind(market)
    if kind and kind not in runner.lower() and re.search(r"yards?", runner, re.I):
        return re.sub(r"yards?", f"{kind} yards", runner, count=1, flags=re.I)
    return runner


def _american(runner: dict[str, Any]) -> int | None:
    raw = ((runner.get("winRunnerOdds") or {}).get("americanDisplayOdds") or {}).get("americanOdds")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _from_decimal(decimal: float) -> int | None:
    if decimal <= 1:
        return None
    if decimal >= 2:
        return int(round((decimal - 1) * 100))
    return int(round(-100 / (decimal - 1)))
