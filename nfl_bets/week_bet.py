"""Week bets: a 3-leg and a 5-leg, each leg from a different game.

A full pair stays up for the Monday-through-Sunday week. The next Monday
builds a new pair. This does not send a bet.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta
from itertools import combinations
import bisect
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _catches_to_yards, _from_decimal, _who
from nfl_bets.choose import _clock, _fits, _place, _parse, offer_legs
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.store import now_iso, out_dir, read_json, write_json

_ET = ZoneInfo("America/New_York")
_HOLD_HOURS = 6
_SPREAD = "open"
_ANCHORS = (-800, -400, -300, -250, -200, -170, -150, -130, -110, 100, 150, 220)
_GOOD = -200
_SAFE = -350
_EVEN = -100


def build_week(games: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    monday = _monday(datetime.now(_ET))
    key = monday.isoformat()
    saved = read_json(out_dir() / "week.json", {})
    if saved.get("week") == key and saved.get("spread") == _SPREAD and saved.get("options") and _fresh(saved):
        return _turn(saved)
    label = _span(datetime.now(_ET))
    options = _build(list(games or []), label)
    stamp = now_iso()
    for name in ("three", "five", "safe", "even"):
        for card in options[name]:
            _remember(card, stamp)
        if options[name] and isinstance(options[name][0], dict):
            options[name][0]["offers"] = _offers(options[name])
    saved = {
        "week": key,
        "spread": _SPREAD,
        "builtAt": stamp,
        "options": options,
        "index": 0,
        "three": options["three"][0],
        "five": options["five"][0],
        "safe": options["safe"][0],
        "even": options["even"][0],
    }
    write_json(out_dir() / "week.json", saved)
    return saved["three"], saved["five"], saved["safe"], saved["even"]


def _offers(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"title": str(row.get("american") if row.get("american") is not None else ""), "price": row.get("american"), "impliedPct": row.get("impliedPct"), "legs": row.get("legs") or []} for row in rows if isinstance(row, dict) and row.get("legs")]


def _remember(card: Any, stamp: str) -> None:
    if isinstance(card, dict) and stamp and not card.get("pulledAt"):
        card["pulledAt"] = stamp


def _fresh(saved: dict[str, Any]) -> bool:
    three = saved.get("three") if isinstance(saved.get("three"), dict) else {}
    five = saved.get("five") if isinstance(saved.get("five"), dict) else {}
    safe = saved.get("safe") if isinstance(saved.get("safe"), dict) else {}
    even = saved.get("even") if isinstance(saved.get("even"), dict) else None
    if even is None:
        return False
    if len(three.get("legs") or []) >= 3 and len(five.get("legs") or []) >= 5 and len(safe.get("legs") or []) >= 3 and len(even.get("legs") or []) >= 3:
        return True
    stamp = _parse(str(saved.get("builtAt") or ""))
    if stamp is None:
        return False
    return datetime.now(_ET) - stamp.astimezone(_ET) < timedelta(hours=_HOLD_HOURS)


def _turn(saved: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    options = saved.get("options") if isinstance(saved.get("options"), dict) else {}
    index = int(saved.get("index") or 0) + 1
    saved["index"] = index
    for name in ("three", "five", "safe", "even"):
        rows = options.get(name) if isinstance(options.get(name), list) else []
        card = rows[index % len(rows)] if rows else saved.get(name)
        if isinstance(card, dict):
            card["offers"] = _offers(rows)
        saved[name] = card
        _remember(saved.get(name), str(saved.get("builtAt") or ""))
    write_json(out_dir() / "week.json", saved)
    return saved["three"], saved["five"], saved["safe"], saved["even"]


def _build(games: list[dict[str, Any]], label: str) -> dict[str, list[dict[str, Any]]]:
    menu = _menu(_pools(_slate(games)))
    return {
        "three": _pack(_choose(menu, 3, _GOOD, True), 3, label, "3 legs, different days, near −200", _GOOD),
        "five": _pack(_choose(menu, 5, _GOOD, True), 5, label, "5 legs, different days, near −200", _GOOD),
        "safe": _pack(_choose(menu, 3, _SAFE, False), 3, label, "3 legs, different days, near −350", _SAFE),
        "even": _pack(_choose(menu, 3, _EVEN, False), 3, label, "3 legs, different days, near −100", _EVEN),
    }


def _pack(combos: list[list[tuple[dict, dict, bool]]], count: int, label: str, title: str, aim: int) -> list[dict[str, Any]]:
    cards = [_card(combo, count, label, title, aim) for combo in combos] or [_card([], count, label, title, aim)]
    if len(cards) == 1 and cards[0].get("legs"):
        cards[0]["note"] = f"{cards[0].get('note') or ''} This is the only bet that fits, so it keeps showing up.".strip()
    return cards


def _slate(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(_ET)
    start = now
    end = datetime.combine((now + timedelta(days=13)).date(), time(23, 59), _ET)
    chosen = []
    for game in games:
        if not str(game.get("sport") or ""):
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < start or stamp > end:
            continue
        chosen.append(game)
    return chosen


def _pools(games: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]], bool]]:
    def load(game: dict[str, Any]):
        try:
            legs, live = offer_legs(game)
        except Exception:  # noqa: BLE001
            return None
        kept = [leg for leg in legs if _fits(leg, "any")]
        kept = _catches_to_yards(legs, kept)
        kept.sort(key=lambda leg: leg["odds"])
        return (game, kept, live) if kept else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        return [row for row in pool.map(load, games) if row]


def _menu(pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]]) -> dict[str, list[tuple[dict, dict, bool]]]:
    grouped: dict[str, list[tuple[dict, dict, bool]]] = {}
    for game, legs, live in pools:
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None:
            continue
        day = stamp.astimezone(_ET).date().isoformat()
        grouped.setdefault(day, []).extend((leg, game, live) for leg in legs)
    return {day: rows for day, rows in ((day, _thin(items)) for day, items in grouped.items()) if rows}


def _thin(rows: list[tuple[dict, dict, bool]]) -> list[tuple[dict, dict, bool]]:
    kept: list[tuple[dict, dict, bool]] = []
    seen: set[tuple[str, str]] = set()
    for anchor in _ANCHORS:
        goal = american_decimal(anchor)
        order = sorted(rows, key=lambda item: abs(american_decimal(item[0]["odds"]) - goal))
        added = 0
        for leg, game, live in order:
            key = (str(game.get("id") or ""), _who(leg) or "")
            if not key[1] or key in seen:
                continue
            seen.add(key)
            kept.append((leg, game, live))
            added += 1
            if added == 2:
                break
    return kept


def _choose(menu: dict[str, list[tuple[dict, dict, bool]]], count: int, target: int, at_least: bool) -> list[list[tuple[dict, dict, bool]]]:
    days = sorted(menu)
    if len(days) < count:
        combo = _search([menu[day] for day in days], target, at_least) if days else []
        return [combo] if len(combo) >= count else []
    ranked: list[tuple[float, int, list[tuple[dict, dict, bool]]]] = []
    goal = american_decimal(target)
    for picked in combinations(days, count):
        combo = _search([menu[day] for day in picked], target, at_least)
        if len(combo) < count:
            continue
        decimal = 1.0
        for leg, _, _ in combo:
            decimal *= american_decimal(leg["odds"])
        score = abs(decimal - goal) + (10 if at_least and decimal < goal else 0)
        span = datetime.fromisoformat(picked[-1]).toordinal() - datetime.fromisoformat(picked[0]).toordinal()
        ranked.append((score, span, combo))
    ranked.sort(key=lambda item: (item[0], -item[1]))
    kept: list[list[tuple[dict, dict, bool]]] = []
    marks: set[str] = set()
    best = ranked[0][0] if ranked else 0
    for score, _, combo in ranked:
        if kept and score > best + 0.4:
            break
        mark = "|".join(sorted(_who(leg) for leg, _, _ in combo))
        if not mark or mark in marks:
            continue
        marks.add(mark)
        kept.append(combo)
    return kept


def _search(day_legs: list[list[tuple[dict, dict, bool]]], target: int, at_least: bool) -> list[tuple[dict, dict, bool]]:
    width = 1
    for day in day_legs:
        width *= max(len(day), 1)
        if width > 250_000:
            return _meet(day_legs, target, at_least)
    return _walk(day_legs, target, at_least)


def _walk(day_legs: list[list[tuple[dict, dict, bool]]], target: int, at_least: bool) -> list[tuple[dict, dict, bool]]:
    goal = american_decimal(target)
    best: tuple[float, list[tuple[dict, dict, bool]]] | None = None

    def walk(index: int, decimal: float, players: set[str], combo: list[tuple[dict, dict, bool]]) -> None:
        nonlocal best
        if index == len(day_legs):
            score = abs(decimal - goal) + (10 if at_least and decimal < goal else 0)
            if best is None or score < best[0]:
                best = (score, list(combo))
            return
        for leg, game, live in day_legs[index]:
            player = _who(leg)
            if not player or player in players:
                continue
            players.add(player)
            combo.append((leg, game, live))
            walk(index + 1, decimal * american_decimal(leg["odds"]), players, combo)
            combo.pop()
            players.remove(player)

    walk(0, 1.0, set(), [])
    return best[1] if best else []


def _meet(day_legs: list[list[tuple[dict, dict, bool]]], target: int, at_least: bool) -> list[tuple[dict, dict, bool]]:
    goal = american_decimal(target)
    mid = max(1, len(day_legs) // 2)
    left = _products(day_legs[:mid])
    right = _products(day_legs[mid:])
    right.sort(key=lambda item: item[0])
    decimals = [item[0] for item in right]
    best: tuple[float, list[tuple[dict, dict, bool]]] | None = None
    for dec, combo in left:
        if dec <= 0:
            continue
        spot = bisect.bisect_left(decimals, goal / dec)
        for index in range(max(0, spot - 20), min(len(right), spot + 21)):
            if index < 0 or index >= len(right):
                continue
            other_dec, other = right[index]
            whole = combo + other
            players = [_who(leg) for leg, _, _ in whole]
            if any(not player for player in players) or len(set(players)) < len(players):
                continue
            decimal = dec * other_dec
            score = abs(decimal - goal) + (10 if at_least and decimal < goal else 0)
            if best is None or score < best[0]:
                best = (score, whole)
    return best[1] if best else []


def _products(day_legs: list[list[tuple[dict, dict, bool]]]) -> list[tuple[float, list[tuple[dict, dict, bool]]]]:
    rows: list[tuple[float, list[tuple[dict, dict, bool]]]] = [(1.0, [])]
    for day in day_legs:
        nxt = []
        for dec, combo in rows:
            players = {_who(leg) for leg, _, _ in combo}
            for leg, game, live in day:
                player = _who(leg)
                if not player or player in players:
                    continue
                nxt.append((dec * american_decimal(leg["odds"]), [*combo, (leg, game, live)]))
        rows = nxt
        if not rows:
            return []
    return [(dec, combo) for dec, combo in rows if combo]


def _card(combo: list[tuple[dict, dict, bool]], count: int, label: str, title: str, aim: int) -> dict[str, Any]:
    goal = f"For the week of {label}. Aimed at {aim}. Each leg is a different day."
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
        "strategy": f"Player props on different days, aimed at {aim}",
        "game": "",
        "goal": goal,
        "american": american,
        "impliedPct": chance,
        "stake": 5,
        "profit": profit,
        "live": any(live for _, _, live in combo),
        "note": "",
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
