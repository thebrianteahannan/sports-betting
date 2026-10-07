"""Hedge and no-vig math for American odds.

A full hedge at a normal FanDuel price locks a small loss. Both outcomes
profit only when the two prices overlap (the vig is gone).
"""

from __future__ import annotations

from typing import Any


def american_decimal(odds: float) -> float:
    odds = float(odds)
    if odds == 0:
        raise ValueError("odds cannot be 0")
    if odds > 0:
        return 1.0 + odds / 100.0
    return 1.0 + 100.0 / abs(odds)


def implied_prob(odds: float) -> float:
    odds = float(odds)
    if odds < 0:
        return abs(odds) / (abs(odds) + 100.0)
    return 100.0 / (odds + 100.0)


def no_vig(odds_a: float, odds_b: float) -> tuple[float, float]:
    pa = implied_prob(odds_a)
    pb = implied_prob(odds_b)
    total = pa + pb
    if total <= 0:
        return 0.0, 0.0
    return pa / total, pb / total


def size_hedge(stake: float, odds: float, hedge_odds: float) -> dict[str, Any]:
    """Stake on the other side so both outcomes pay the same result."""
    stake = round(float(stake), 2)
    if stake <= 0:
        raise ValueError("stake must be positive")
    d1 = american_decimal(odds)
    d2 = american_decimal(hedge_odds)
    hedge_stake = stake * d1 / d2
    # Profit if the original wins: original profit minus the hedge stake lost.
    if_original = stake * (d1 - 1.0) - hedge_stake
    if_hedge = hedge_stake * (d2 - 1.0) - stake
    # Cover the original stake if it loses. Win is smaller. Loss becomes ~0.
    cover = stake / (d2 - 1.0) if d2 > 1 else 0.0
    if_cover_wins = stake * (d1 - 1.0) - cover
    locks = if_original > 0.05 and if_hedge > 0.05
    arb = (d1 - 1.0) * (d2 - 1.0) >= 1.0
    return {
        "stake": stake,
        "odds": odds,
        "hedgeOdds": hedge_odds,
        "hedgeStake": round(hedge_stake, 2),
        "ifOriginalWins": round(if_original, 2),
        "ifHedgeWins": round(if_hedge, 2),
        "coverStake": round(cover, 2),
        "ifCoverAndOriginalWins": round(if_cover_wins, 2),
        "locksProfit": locks,
        "pricesOverlap": arb,
        "note": _note(if_original, locks),
    }


def _note(locked: float, locks: bool) -> str:
    if locks:
        return (
            "These two FanDuel prices overlap. Hedging the other side locks "
            f"about ${abs(locked):.2f} either way. That is rare. Check both "
            "numbers in the FanDuel app before you bet, because this disappears "
            "as soon as either price moves."
        )
    lost = abs(min(locked, 0.0))
    return (
        "Hedging the other side at this FanDuel price locks about "
        f"${lost:.2f} of loss either way. You pay the vig twice. "
        "That cuts the chance of a big loss. It does not create a profit. "
        "A locked profit only shows up after your first price was long enough "
        "that the other side still overlaps it."
    )


if __name__ == "__main__":
    even = size_hedge(1, -110, -110)
    assert even["hedgeStake"] == 1.0
    assert even["ifOriginalWins"] < 0
    assert not even["locksProfit"]
    plus = size_hedge(10, 150, -130)
    assert plus["locksProfit"]
    assert plus["ifOriginalWins"] > 0
    print("hedge ok", even["ifOriginalWins"], plus["ifOriginalWins"])
