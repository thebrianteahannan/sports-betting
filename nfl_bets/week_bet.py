"""Week bets: a 3-leg and a 5-leg, each leg from a different game.

A full pair stays up for the Monday-through-Sunday week. The next Monday
builds a new pair. This does not send a bet.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _catches_to_yards, _from_decimal
from nfl_bets.choose import _clock, _fits, _place, _parse, offer_legs
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.store import now_iso, out_dir, read_json, write_json

_ET = ZoneInfo("America/New_York")
_SPORTS = ("NFL", "MLB", "NBA", "NHL", "WNBA", "PGA")
_PER_DAY = 3
_HOLD_HOURS = 6
_SPREAD = "across"


def build_week(games: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    monday = _monday(datetime.now(_ET))
    key = monday.isoformat()
    saved = read_json(out_dir() / "week.json", {})
    if saved.get("week") == key and saved.get("spread") == _SPREAD and _fresh(saved):
        _remember(saved.get("three"), str(saved.get("builtAt") or ""))
        _remember(saved.get("five"), str(saved.get("builtAt") or ""))
        return saved["three"], saved["five"]
    label = _span(datetime.now(_ET))
    three, five = _build(list(games or []), label)
    stamp = now_iso()
    _remember(three, stamp)
    _remember(five, stamp)
    write_json(out_dir() / "week.json", {
        "week": key,
        "spread": _SPREAD,
        "builtAt": stamp,
        "three": three,
        "five": five,
    })
    return three, five


def _remember(card: Any, stamp: str) -> None:
    if isinstance(card, dict) and stamp and not card.get("pulledAt"):
        card["pulledAt"] = stamp


def _fresh(saved: dict[str, Any]) -> bool:
    three = saved.get("three") if isinstance(saved.get("three"), dict) else {}
    five = saved.get("five") if isinstance(saved.get("five"), dict) else {}
    if len(three.get("legs") or []) >= 3 and len(five.get("legs") or []) >= 5:
        return True
    stamp = _parse(str(saved.get("builtAt") or ""))
    if stamp is None:
        return False
    return datetime.now(_ET) - stamp.astimezone(_ET) < timedelta(hours=_HOLD_HOURS)


def _build(games: list[dict[str, Any]], label: str) -> tuple[dict[str, Any], dict[str, Any]]:
    by_day = _best_by_day(_pools(_slate(games)))
    return _card(_spread(by_day, 3), 3, label), _card(_spread(by_day, 5), 5, label)


def _slate(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(_ET)
    start = now - timedelta(hours=3)
    end = datetime.combine((now + timedelta(days=13)).date(), time(23, 59), _ET)
    grouped: dict[str, list[tuple[datetime, dict[str, Any]]]] = {}
    for game in games:
        if str(game.get("sport") or "") not in _SPORTS:
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < start or stamp > end:
            continue
        grouped.setdefault(stamp.astimezone(_ET).date().isoformat(), []).append((stamp, game))
    chosen = []
    for rows in grouped.values():
        rows.sort(key=lambda item: item[0])
        chosen.extend(game for _, game in rows[:_PER_DAY])
    return chosen


def _pools(games: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]], bool]]:
    pools = []
    for game in games:
        try:
            legs, live = offer_legs(game)
        except Exception:  # noqa: BLE001
            continue
        kept = [leg for leg in legs if _fits(leg, "any")]
        kept = _catches_to_yards(legs, kept)
        kept.sort(key=lambda leg: leg["odds"])
        if kept:
            pools.append((game, kept, live))
    return pools


def _best_by_day(pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]]) -> dict[str, tuple[dict, dict, bool]]:
    best: dict[str, tuple[dict, dict, bool]] = {}
    for game, legs, live in pools:
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or not legs:
            continue
        day = stamp.astimezone(_ET).date().isoformat()
        leg = legs[0]
        current = best.get(day)
        if current is None or leg["odds"] < current[0]["odds"]:
            best[day] = (leg, game, live)
    return best


def _spread(by_day: dict[str, tuple[dict, dict, bool]], count: int) -> list[tuple[dict, dict, bool]]:
    days = sorted(by_day)
    if len(days) <= count:
        return [by_day[day] for day in days]
    ords = [datetime.fromisoformat(day).toordinal() for day in days]
    start, end = ords[0], ords[-1]
    chosen: list[str] = []
    for index in range(count):
        target = start + (end - start) * index / (count - 1)
        day = min(
            (day for day in days if day not in chosen),
            key=lambda day: abs(datetime.fromisoformat(day).toordinal() - target),
        )
        chosen.append(day)
    chosen.sort()
    return [by_day[day] for day in chosen]


def _card(combo: list[tuple[dict, dict, bool]], count: int, label: str) -> dict[str, Any]:
    title = "3-leg best bet" if count == 3 else "5-leg for the week"
    goal = f"For the week of {label}. Each leg is a different day."
    if len(combo) < count:
        return {
            "title": title,
            "strategy": title,
            "game": "",
            "goal": goal,
            "copy": (
                f"FanDuel has player props on {len(combo)} different days in this week, "
                f"so a {count}-leg parlay does not fit yet."
            ),
            "legs": [],
            "note": "",
        }
    decimal = 1.0
    for leg, _, _ in combo:
        decimal *= american_decimal(leg["odds"])
    american = _from_decimal(decimal)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    profit = round(5 * (decimal - 1.0), 2)
    legs = []
    for leg, game, _ in combo:
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
    return {
        "title": title,
        "strategy": "Safest player prop from a different day",
        "game": "",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": 5,
        "profit": profit,
        "live": any(live for _, _, live in combo),
        "note": "Each leg is on a different day, in a different game, so this is a regular parlay.",
        "copy": (
            f"{count} FanDuel player props, each on a different day, multiply to {american}. "
            f"The parlay is about {chance}%. A $5 bet would win ${profit:.2f}."
        ),
        "legs": legs,
    }


def _monday(now: datetime) -> datetime.date:
    return now.date() - timedelta(days=now.weekday())


def _span(now: datetime) -> str:
    start = now.date()
    end = (now + timedelta(days=13)).date()
    return f"{start.strftime('%b')} {start.day}–{end.strftime('%b')} {end.day}"
