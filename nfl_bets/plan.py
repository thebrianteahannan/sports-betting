"""When to bet, when to hold, and how large each wager is.

Real stakes come from the purse. The desk never sends the bet. A day that is
too early, or has no look, is a hold. Future slates stay visible because the
prices are already up.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
HOLD_IF_KICK_HOURS = 30
DAY_FRACTION = 0.10
MAX_TICKET = 5
MAX_TICKETS = 5

PARLAY_NOTE = (
    "The other ideas are on Bets to make. They name the stat, and none of them spend the bank. "
    "This tab is the NFL game card. It is the only one that can spend the bank."
)


def stakes_today(bets: list[dict[str, Any]], now: datetime | None = None) -> float:
    """Real dollars put in play today, Eastern time. Voids and paper do not count."""
    return round(sum(float(bet.get("stake") or 0) for bet in _today_real(bets, now)), 2)


def build_plan(
    games: list[dict[str, Any]],
    bank: dict[str, Any],
    *,
    current_week: int | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(ET)
    games = [game for game in games if str(game.get("sport") or "NFL") == "NFL"]
    bets = list(bank.get("bets") or [])
    week = int(current_week or 0)
    slate = [game for game in games if not week or int(game.get("week") or 0) == week]
    cash = round(float(bank.get("cash") or 0), 2)
    at_risk = round(float(bank.get("atRiskToday") or 0), 2)
    working = round(cash + at_risk, 2)
    budget = _day_budget(working)
    cap_count = _ticket_cap(budget)
    placed = len(_today_real(bets, now))
    used = {
        str(bet.get("gameId") or "")
        for bet in bets
        if str(bet.get("mode") or "real") != "paper" and str(bet.get("status") or "") == "open"
    }
    room = round(max(0.0, budget - at_risk), 2)
    hours = _hours_to_next(slate, now)
    days = _days(games, now, budget, used, room)
    active = next((day for day in days if day.get("state") == "type"), None)
    tickets = list((active or {}).get("tickets") or [])
    strong = [game for game in slate if _strong(game)]

    reasons: list[str] = []
    action = "bet"
    if hours is not None and hours > HOLD_IF_KICK_HOURS:
        action = "hold"
        reasons.append(
            f"The next kickoff is {hours:.0f} hours away. Let FanDuel's number settle. "
            "This is a read day. The card below is set up in advance. Leave real money alone."
        )
    if not strong:
        action = "hold"
        reasons.append(
            "Nothing on this slate is a real look. A watch is for reading. Holding off is the bet."
        )
    if placed >= cap_count and cap_count > 0:
        action = "hold"
        reasons.append(
            f"Today already has {placed} real wagers, which fills a {cap_count}-ticket card."
        )
    elif at_risk >= budget - 0.001 and budget > 0:
        action = "hold"
        reasons.append(
            f"Real money already in play today is ${at_risk:.2f}, which fills the ${budget:.0f} day."
        )
    purse = _purse_sentence(working, budget, cap_count)
    if action == "bet":
        reasons.insert(
            0,
            "Type the lines below into FanDuel. The desk does not send them. "
            "Then log each one here as real.",
        )
    reasons.append(purse)
    if action != "bet":
        tickets = []
    week_note = _week_note(bets, now)
    return {
        "action": action,
        "title": "Hold off today" if action == "hold" else "Type these in",
        "reasons": reasons,
        "purseNote": purse,
        "parlayNote": PARLAY_NOTE,
        "weekNote": week_note,
        "dailyCap": budget,
        "maxTickets": cap_count,
        "atRiskToday": at_risk,
        "room": room if action == "bet" else 0,
        "unit": tickets[0]["stake"] if tickets else _one_ticket(budget),
        "hoursToKick": None if hours is None else round(hours, 1),
        "strongCount": len(strong),
        "tickets": tickets,
        "days": days,
    }


def _today_real(bets: list[dict[str, Any]], now: datetime | None) -> list[dict[str, Any]]:
    today = (now or datetime.now(ET)).astimezone(ET).date()
    rows = []
    for bet in bets:
        if str(bet.get("mode") or "real") == "paper":
            continue
        if str(bet.get("status") or "") == "void":
            continue
        stamp = _parse(str(bet.get("placedAt") or ""))
        if stamp is None or stamp.astimezone(ET).date() != today:
            continue
        rows.append(bet)
    return rows


def _day_budget(working: float) -> float:
    """10% of the purse, in whole dollars, and never more than five $5 tickets."""
    if working < 10:
        return 0.0
    dollars = int(working * DAY_FRACTION + 1e-9)
    return float(min(dollars, MAX_TICKET * MAX_TICKETS, int(working)))


def _ticket_cap(budget: float) -> int:
    if budget >= 10:
        return 5
    if budget >= 6:
        return 3
    if budget >= 2:
        return 2
    if budget >= 1:
        return 1
    return 0


def _one_ticket(budget: float) -> float:
    return float(min(MAX_TICKET, int(budget))) if budget >= 1 else 0.0


def _purse_sentence(working: float, budget: float, cap_count: int) -> str:
    if budget < 6:
        band = (
            " The $2–$5 wagers, three to five of them, start when 10% of the purse "
            f"can pay that card. On ${working:.0f} the day is ${budget:.0f}"
        )
        if cap_count:
            band += f", in {cap_count} ticket{'s' if cap_count != 1 else ''}"
        band += "."
    else:
        band = (
            f" That is up to {cap_count} tickets, $1 to ${MAX_TICKET:.0f} each, "
            "with more on the stronger look."
        )
    return (
        f"Purse is ${working:.2f}. A day may spend 10% of it, ${budget:.0f}."
        + band
        + " The size is the plan. It does not guarantee a profit. "
        "A week that wins 5 days out of 7 is the score to watch. Some weeks miss it."
    )


def _days(
    games: list[dict[str, Any]],
    now: datetime,
    budget: float,
    used: set[str],
    room_today: float,
) -> list[dict[str, Any]]:
    grouped: dict[Any, list[dict[str, Any]]] = {}
    for game in games:
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp <= now:
            continue
        grouped.setdefault(stamp.astimezone(ET).date(), []).append(game)
    today = now.astimezone(ET).date()
    days = []
    for day in sorted(grouped)[:4]:
        rows = grouped[day]
        soonest = min(_parse(str(game.get("kickoff") or "")) for game in rows)
        assert soonest is not None
        hours = (soonest - now).total_seconds() / 3600.0
        spend = room_today if day == today else budget
        strong = [game for game in rows if _strong(game) and str(game.get("id")) not in used]
        tickets = _allocate(strong, spend)
        later = hours > HOLD_IF_KICK_HOURS
        label = f"{soonest.astimezone(ET):%a, %b} {soonest.astimezone(ET).day}"
        if not tickets:
            state, title, note = (
                "empty",
                f"{label} · no card",
                "Nothing that day is a real look. Holding off is the bet.",
            )
        elif later:
            state, title, note = (
                "later",
                f"{label} · set up",
                "Odds are already up. Do not type these in until the day is inside 30 hours of kickoff.",
            )
        else:
            state, title, note = (
                "type",
                f"{label} · type these in",
                "Type each line into FanDuel, then log it here. The desk does not send the bet.",
            )
        unused = int(spend) - sum(int(ticket["stake"]) for ticket in tickets)
        if tickets and unused > 0:
            note += f" ${unused:.0f} of the day stays in the purse. There are not enough looks to fill it."
        days.append(
            {
                "date": day.isoformat(),
                "state": state,
                "title": title,
                "note": note,
                "tickets": tickets,
            }
        )
    opened = False
    for day in days:
        if day["state"] != "type":
            continue
        if opened:
            day["state"] = "later"
            day["title"] = str(day["title"]).replace("· type these in", "· set up")
            day["note"] = "This card waits until the earlier day is finished."
        opened = True
        cue = "Type this into FanDuel." if day["state"] == "type" else "Not today. The size is the plan."
        for ticket in day["tickets"]:
            ticket["cue"] = cue
    for day in days:
        if day["state"] == "type":
            continue
        for ticket in day["tickets"]:
            ticket["cue"] = "Not today. The size is the plan."
    return days


def _allocate(games: list[dict[str, Any]], budget: float) -> list[dict[str, Any]]:
    dollars = int(budget)
    cap = _ticket_cap(float(dollars))
    ranked = sorted(games, key=lambda game: (-int(game.get("lookScore") or 0), str(game.get("kickoff") or "")))
    count = min(len(ranked), cap, dollars)
    if count <= 0:
        return []
    stakes = [1] * count
    left = dollars - count
    index = 0
    guard = 0
    while left > 0 and guard < 50:
        guard += 1
        if stakes[index] < MAX_TICKET:
            stakes[index] += 1
            left -= 1
        index = (index + 1) % count
        if all(stake >= MAX_TICKET for stake in stakes):
            break
    tickets = []
    for game, stake in zip(ranked, stakes):
        quote = _quote(game)
        if quote is None:
            continue
        tickets.append({"gameId": str(game.get("id") or ""), "stake": stake, "cue": "Type this into FanDuel.", **quote})
    return tickets


def _quote(game: dict[str, Any]) -> dict[str, str] | None:
    flag = next(
        (
            row
            for row in game.get("flags") or []
            if row.get("market") and row.get("side") and str(row.get("severity") or "") in {"look", "steam"}
        ),
        None,
    )
    if flag is None:
        return None
    market = str(flag["market"])
    side = str(flag["side"])
    label = _label(game, market, side)
    if not label:
        return None
    return {"market": market, "side": side, "label": label}


def _label(game: dict[str, Any], market: str, side: str) -> str:
    away = str(game.get("awayNick") or game.get("away") or "Away")
    home = str(game.get("homeNick") or game.get("home") or "Home")
    spread = game.get("spread") or {}
    money = game.get("moneyline") or {}
    total = game.get("total") or {}
    if market == "spread" and side in {"away", "home"}:
        line = spread.get("awayLine" if side == "away" else "homeLine")
        odds = spread.get("awayOdds" if side == "away" else "homeOdds")
        team = away if side == "away" else home
        return f"{team} {_signed(line)} {_american(odds)}".strip()
    if market == "moneyline" and side in {"away", "home"}:
        odds = money.get("awayOdds" if side == "away" else "homeOdds")
        team = away if side == "away" else home
        return f"{team} ML {_american(odds)}".strip()
    if market == "total" and side in {"over", "under"}:
        odds = total.get("overOdds" if side == "over" else "underOdds")
        name = "Over" if side == "over" else "Under"
        return f"{name} {_num(total.get('line'))} {_american(odds)}".strip()
    return ""


def _week_note(bets: list[dict[str, Any]], now: datetime) -> str:
    today = now.astimezone(ET).date()
    start = today - timedelta(days=6)
    nets: dict[Any, float] = {}
    for bet in bets:
        if str(bet.get("mode") or "real") == "paper" or str(bet.get("status") or "") in {"open", "void"}:
            continue
        stamp = _parse(str(bet.get("settledAt") or bet.get("placedAt") or ""))
        if stamp is None:
            continue
        day = stamp.astimezone(ET).date()
        if day < start or day > today:
            continue
        nets[day] = nets.get(day, 0.0) + _net(bet)
    up = sum(1 for value in nets.values() if value > 0.005)
    down = sum(1 for value in nets.values() if value < -0.005)
    return (
        f"Last 7 days: {up} up, {down} down. "
        "The score to watch is 5 up days out of 7. Some weeks miss it."
    )


def _net(bet: dict[str, Any]) -> float:
    stake = float(bet.get("stake") or 0)
    status = str(bet.get("status") or "")
    if status == "lost":
        return -stake
    if status != "won":
        return 0.0
    from nfl_bets.hedge import american_decimal

    return stake * (american_decimal(float(bet.get("odds") or -110)) - 1)


def _strong(game: dict[str, Any]) -> bool:
    return any(str(flag.get("severity") or "") in {"look", "steam"} for flag in game.get("flags") or [])


def _hours_to_next(games: list[dict[str, Any]], now: datetime) -> float | None:
    soonest: datetime | None = None
    for game in games:
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp <= now:
            continue
        if soonest is None or stamp < soonest:
            soonest = stamp
    if soonest is None:
        return None
    return (soonest - now).total_seconds() / 3600.0


def _parse(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=ET)
    return stamp


def _signed(line: Any) -> str:
    if line is None:
        return ""
    value = float(line)
    return f"+{value:g}" if value > 0 else f"{value:g}"


def _american(odds: Any) -> str:
    if odds is None:
        return ""
    value = int(odds)
    return f"+{value}" if value > 0 else str(value)


def _num(line: Any) -> str:
    if line is None:
        return ""
    return f"{float(line):g}"
