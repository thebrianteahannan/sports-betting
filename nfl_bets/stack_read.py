"""How often each stack leg's player reached that line in his recent games."""

from __future__ import annotations

import math
import re
from typing import Any

from nfl_bets.edge import _rows
from nfl_bets.hedge import implied_prob
from nfl_bets.stack_team import count as team_count, load as team_load
from nfl_bets.sway import _cache, _spec

_LABEL = re.compile(r"(.+?)\s+(?:(Over|Under)\s+(\d+(?:\.\d+)?)|(\d+)\+)\s*(.*)$", re.I)
_LAST = 10


def tally(found: dict[str, list[dict[str, Any]]], games: list[dict[str, Any]]) -> None:
    game_of = {str(game.get("match") or ""): game for game in games}
    logs = team_load(games)
    cache = _cache()
    by_last: dict[str, dict[str, list[str]]] = {}
    for key, pack in cache.items():
        sport, _, who = key.partition("|")
        if who and "|" not in who and isinstance(pack, dict) and pack.get("rows"):
            by_last.setdefault(sport, {}).setdefault(who.split()[-1], []).append(who)
    for stacks in found.values():
        for stack in stacks or []:
            game = game_of.get(str(stack.get("game") or ""), {})
            sport = str(game.get("sport") or "")
            reads = []
            for bet in stack.get("bets") or []:
                label = str(bet.get("label") or "")
                read = _count(label, sport, cache, by_last.get(sport, {})) or team_count(label, game, logs)
                if read:
                    bet["hits"], bet["games"] = read["hits"], read["games"]
                    reads.append((bet, read))
            if reads:
                bet, read = min(reads, key=lambda item: implied_prob(float(item[0]["odds"])))
                price = implied_prob(float(bet["odds"]))
                stack["beats"] = read["hits"] / read["games"] > price
                stack["read"] = f"{read['who']} {read['verb']} in {read['hits']} of the last {read['games']}. FanDuel prices that at {price * 100:.1f}%."


def _count(label: str, sport: str, cache: dict[str, Any], by_last: dict[str, list[str]]) -> dict[str, Any] | None:
    found = _LABEL.match(re.sub(r"^(.+?) anytime touchdown$", r"\1 1+ anytime touchdown", label.strip()))
    if not found or not sport:
        return None
    who, side, line, plus, stat = found.groups()
    keys = tuple(key for part in stat.split("+") if (spec := _spec(part)) for key in spec[0])
    pack = _pack(who.strip(), sport, cache, by_last)
    if not keys or not pack:
        return None
    rows = _rows(pack, keys)[:_LAST]
    if len(rows) < 5:
        return None
    words = stat.strip().lower()
    if plus:
        bar = int(plus)
        hits = sum(1 for row in rows if row["value"] + 1e-9 >= bar)
        verb = "scored a touchdown" if words == "anytime touchdown" else f"reached {bar}+ {words}"
    elif side.lower() == "under":
        number = float(line)
        hits = sum(1 for row in rows if row["value"] < number)
        verb = f"stayed under {number:g} {words}"
    else:
        number = float(line)
        bar = math.floor(number) + 1 if number != int(number) else int(number)
        hits = sum(1 for row in rows if row["value"] + 1e-9 >= bar)
        verb = f"reached {bar}+ {words}"
    return {"who": who.strip(), "verb": verb, "hits": hits, "games": len(rows)}


def _pack(who: str, sport: str, cache: dict[str, Any], by_last: dict[str, list[str]]) -> dict[str, Any] | None:
    low = who.lower()
    pack = cache.get(f"{sport}|{low}")
    if isinstance(pack, dict) and pack.get("rows"):
        return pack
    options = [name for name in by_last.get(low.split()[-1], []) if name.endswith(low)]
    return cache.get(f"{sport}|{options[0]}") if len(options) == 1 else None
