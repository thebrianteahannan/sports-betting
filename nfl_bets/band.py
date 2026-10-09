"""Best bet of the day: the ticket priced from -150 to +100.

Short prices like -800 stay off this card. This does not send a bet.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from itertools import combinations, product
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _catches_to_yards, _from_decimal, _who
from nfl_bets.choose import _clock, _fits, _parse, _place, offer_legs
from nfl_bets.hedge import american_decimal, implied_prob

_ET = ZoneInfo("America/New_York")
_SPORTS = ("NFL", "MLB", "NBA", "NHL", "WNBA", "PGA")
_LOW = -150
_HIGH = 100


def build_band(games: list[dict[str, Any]], now: datetime | None = None) -> dict[str, Any]:
    moment = now.astimezone(_ET) if now else datetime.now(_ET)
    pools = _pools(_today(list(games or []), moment))
    return _card(_search(pools))


def _today(games: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    today = now.date()
    start = now - timedelta(hours=3)
    rows = []
    for game in games:
        if str(game.get("sport") or "") not in _SPORTS:
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < start or stamp.astimezone(_ET).date() != today:
            continue
        rows.append((stamp, game))
    rows.sort(key=lambda item: item[0])
    return [game for _, game in rows[:10]]


def _pools(games: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]], bool]]:
    pools = []
    for game in games:
        try:
            legs, live = offer_legs(game)
        except Exception:  # noqa: BLE001
            continue
        kept = [leg for leg in legs if _fits(leg, "any") and -800 <= leg["odds"] <= -110]
        kept = _catches_to_yards(legs, kept)
        kept.sort(key=lambda leg: (abs(leg["odds"] + 180), leg["odds"]))
        if kept:
            pools.append((game, kept[:5], live))
    return pools


def _search(pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]]) -> list[tuple[dict, dict, bool]]:
    best: tuple[tuple, list[tuple[dict, dict, bool]]] | None = None
    for size in (1, 2, 3):
        for group in combinations(range(len(pools)), size):
            choices = [pools[index][1] for index in group]
            for picks in product(*choices):
                names = [_who(leg) for leg in picks]
                if "" in names or len(set(names)) != len(names):
                    continue
                combo = [(picks[pos], pools[group[pos]][0], pools[group[pos]][2]) for pos in range(size)]
                american = _american(combo)
                if american is None or american < _LOW or american > _HIGH:
                    continue
                rank = (implied_prob(american), -size)
                if best is None or rank > best[0]:
                    best = (rank, combo)
    return [] if best is None else best[1]


def _american(combo: list[tuple[dict, dict, bool]]) -> int | None:
    decimal = 1.0
    for leg, _, _ in combo:
        decimal *= american_decimal(leg["odds"])
    return _from_decimal(decimal)


def _card(combo: list[tuple[dict, dict, bool]]) -> dict[str, Any]:
    goal = "The best ticket on today's slate priced from −150 to +100."
    if not combo:
        return {
            "title": "Best bet of the day",
            "strategy": "Best price from −150 to +100",
            "game": "",
            "goal": goal,
            "copy": "FanDuel has no ticket on today's slate priced from −150 to +100 yet.",
            "legs": [],
            "note": "",
        }
    american = _american(combo)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    decimal = 1.0
    for leg, _, _ in combo:
        decimal *= american_decimal(leg["odds"])
    profit = round(5 * (decimal - 1.0), 2)
    legs = []
    for leg, game, _ in combo:
        label = str(leg.get("label") or "")
        if len(combo) > 1:
            label = f"{label} — {game.get('sport')}, {_place(game)}, {_clock(game)}"
        legs.append({
            "market": leg.get("market") or "",
            "runner": leg.get("runner") or "",
            "label": label,
            "odds": leg.get("odds"),
            "kickoff": game.get("kickoff") or "",
            "gameId": str(game.get("id") or ""),
            "sport": game.get("sport") or "",
            "pct": f"{implied_prob(leg['odds']) * 100:.1f}%",
        })
    one = len(combo) == 1
    return {
        "title": "Best bet of the day",
        "strategy": "Best price from −150 to +100",
        "game": _place(combo[0][1]) if one else "",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": 5,
        "profit": profit,
        "live": any(live for _, _, live in combo),
        "note": (
            "This is one FanDuel price between −150 and +100."
            if one else
            "These legs are in different games, so this is a regular parlay. The price stays between −150 and +100."
        ),
        "copy": (
            f"The ticket is {american}. That is about {chance}%. "
            f"A $5 bet would win ${profit:.2f}."
        ),
        "legs": legs,
    }
