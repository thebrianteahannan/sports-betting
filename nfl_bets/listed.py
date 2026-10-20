"""Pick the better parlay in each list the desk is showing.

The list is every parlay for that strategy that can still be placed.
One parlay stays unmarked. Two or more means one of them is the better one.
"""

from __future__ import annotations

from time import time
from typing import Any

from nfl_bets.edge import _offer, _parse
from nfl_bets.store import out_dir, read_json
from nfl_bets.tiebreak import settle


def mark_listed(rows: list[dict[str, Any]]) -> None:
    games = [game for game in (read_json(out_dir() / "board.json", {}).get("games") or []) if isinstance(game, dict)]
    by_id = {str(game.get("id") or ""): game for game in games}
    now = time()
    groups: dict[str, dict[tuple, list[dict[str, Any]]]] = {}
    for row in rows:
        if str(row.get("result") or "open") != "open" or not row.get("legs") or not _ahead(row, now):
            continue
        labels = tuple(str(leg.get("label") or "") for leg in row["legs"] if isinstance(leg, dict))
        groups.setdefault(str(row.get("card") or ""), {}).setdefault((row.get("american"), labels), []).append(row)
    for group in groups.values():
        for bunch in group.values():
            for row in bunch:
                row.pop("edge", None)
                row.pop("why", None)
        if len(group) < 2:
            continue
        packed = []
        pairs = []
        for bunch in group.values():
            offer = {"impliedPct": bunch[0].get("impliedPct"), "legs": bunch[0].get("legs")}
            try:
                notes, _score = _offer(offer, by_id, games)
            except Exception:  # noqa: BLE001
                notes = []
            packed.append((notes, offer))
            pairs.append((bunch, offer))
        failed = False
        try:
            settle(packed, by_id, games)
        except Exception:  # noqa: BLE001
            failed = True
        winner = None if failed else next(((bunch, offer) for bunch, offer in pairs if offer.get("edge")), None)
        if winner is None:
            bunch = max(group.values(), key=lambda rows: float(rows[0].get("impliedPct") or 0))
            for row in bunch:
                row["edge"] = True
                row["why"] = "This parlay has the highest chance in this list."
            continue
        for row in winner[0]:
            row["edge"] = True
            row["why"] = str(winner[1].get("why") or "")


def _ahead(row: dict[str, Any], now: float) -> bool:
    stamps = [row.get("kickoff")]
    stamps.extend(leg.get("kickoff") for leg in row.get("legs") or [] if isinstance(leg, dict))
    for raw in stamps:
        stamp = _parse(str(raw or ""))
        if stamp is not None and stamp.timestamp() <= now:
            return False
    return True
