"""NBA points + rebounds + assists for a player who does all three.

A do-it-all player scores, boards, and passes in the same games. The over
is listed when he has cleared that number more often than not. The price
stays the FanDuel price. This does not send a bet.
"""

from __future__ import annotations

import re
from typing import Any

from nfl_bets.choose import _clock, _place
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.sway import _PATH, _nick, _player, _player_log, _value

_PRA = re.compile(r"\b(?:pts?|points?).{0,20}(?:rebs?|rebounds?).{0,20}(?:asts?|assists?)\b", re.I)
_PART = re.compile(r"\b(quarter|half|period|inning|first|last|1st|2nd|3rd)\b", re.I)
_TITLE = "Do-it-all PRA"
_GOAL = "A player who scores, boards, and passes, on a points + rebounds + assists over he has cleared more often than not."


def pra_card(pools: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> dict[str, Any]:
    found = _pick(pools)
    if not found:
        return {"title": _TITLE, "strategy": _TITLE, "game": "", "goal": _GOAL, "copy": "No do-it-all player has a points + rebounds + assists over he has cleared more often than not.", "legs": [], "note": "", "offers": []}
    best = found[0]
    card = _ticket(best)
    card["offers"] = [_offer(row) for row in found]
    card["goal"] = _GOAL
    return card


def do_it_all(name: str) -> bool:
    games = _games(name)
    if len(games) < 8:
        return False
    pts = sum(row[0] for row in games) / len(games)
    reb = sum(row[1] for row in games) / len(games)
    ast = sum(row[2] for row in games) / len(games)
    return pts >= 18 and reb >= 6 and ast >= 2.5


def _pick(pools: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    for game, legs in pools:
        if str(game.get("sport") or "") != "NBA":
            continue
        for leg in legs or []:
            text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
            if _PART.search(text) or not _PRA.search(text) or re.search(r"\bunder\b", text, re.I):
                continue
            raw = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
            name = re.sub(r"\s+(over|under)\b.*$", "", raw, flags=re.I).strip()
            bar = _bar(text)
            try:
                odds = int(leg.get("odds"))
            except (TypeError, ValueError):
                continue
            if not name or bar is None or odds < -250:
                continue
            games = _games(name)
            if not do_it_all(name):
                continue
            hits = sum(1 for row in games if _made(row[0] + row[1] + row[2], bar, text))
            if hits * 2 <= len(games):
                continue
            prior = by_name.get(name.lower())
            row = {"name": name, "leg": leg, "game": game, "hits": hits, "count": len(games), "bar": bar, "odds": odds}
            if prior is None or (abs(odds + 110), -hits) < (abs(prior["odds"] + 110), -prior["hits"]):
                by_name[name.lower()] = row
    rows = sorted(by_name.values(), key=lambda row: (row["hits"] / row["count"], -abs(row["odds"] + 110)), reverse=True)
    return rows[:8]


def _games(name: str) -> list[tuple[float, float, float]]:
    saved = _games.cache.get(name.lower()) if hasattr(_games, "cache") else None
    if saved is not None:
        return saved
    if not hasattr(_games, "cache"):
        _games.cache = {}
    pack = _player_log("NBA", _PATH["NBA"], name)
    games = _split(pack) if pack else []
    _games.cache[name.lower()] = games
    return games


def _split(pack: dict[str, Any]) -> list[tuple[float, float, float]]:
    names = list(pack.get("names") or [])
    def col(*options: str) -> int | None:
        return next((names.index(option) for option in options if option in names), None)
    ip, ir, ia, im = col("points"), col("totalRebounds", "rebounds"), col("assists"), col("minutes")
    if None in (ip, ir, ia):
        return []
    found = []
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        played = _value(stats[im], "minutes") if im is not None and im < len(stats) else 1
        if played == 0:
            continue
        vals = [_value(stats[i] if i < len(stats) else "", names[i]) for i in (ip, ir, ia)]
        if any(value is None for value in vals):
            continue
        found.append((float(vals[0]), float(vals[1]), float(vals[2])))
        if len(found) >= 10:
            break
    return found


def _bar(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    return float(match.group(1)) if match else None


def _made(total: float, bar: float, text: str) -> bool:
    if re.search(r"\bover\b", text, re.I):
        return total > bar
    return total >= bar


def _why(row: dict[str, Any]) -> str:
    shown = int(row["bar"]) if float(row["bar"]).is_integer() else row["bar"]
    return f"{_nick(row['name'])} cleared {shown} points + rebounds + assists in {row['hits']} of his last {row['count']}."


def _leg(row: dict[str, Any]) -> dict[str, Any]:
    leg, game = row["leg"], row["game"]
    odds = row["odds"]
    return {
        "market": leg.get("market") or "",
        "runner": leg.get("runner") or "",
        "label": f"{leg.get('label') or ''} — {game.get('sport')}, {_place(game)}, {_clock(game)}",
        "odds": odds,
        "kickoff": game.get("kickoff") or "",
        "gameId": str(game.get("id") or ""),
        "sport": game.get("sport") or "NBA",
        "pct": f"{implied_prob(odds) * 100:.1f}%",
    }


def _offer(row: dict[str, Any]) -> dict[str, Any]:
    odds = row["odds"]
    decimal = american_decimal(odds)
    return {"title": _nick(row["name"]), "price": odds, "impliedPct": round(implied_prob(odds) * 100, 1), "why": _why(row), "legs": [_leg(row)], "profit": round(5 * (decimal - 1), 2)}


def _ticket(row: dict[str, Any]) -> dict[str, Any]:
    offer = _offer(row)
    odds = row["odds"]
    return {
        "title": _TITLE, "strategy": _TITLE, "game": "", "goal": _GOAL, "american": odds,
        "impliedPct": offer["impliedPct"], "stake": 5, "profit": offer["profit"], "live": False, "note": "",
        "copy": _why(row), "why": _why(row), "legs": offer["legs"], "offers": [],
    }
