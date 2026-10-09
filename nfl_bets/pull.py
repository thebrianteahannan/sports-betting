"""Refresh one board card from FanDuel without rebuilding the slate."""

from __future__ import annotations

from typing import Any

from nfl_bets.chalk import _AK, _american, _from_decimal
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.http_util import get_json
from nfl_bets.store import load_board, now_iso, out_dir, read_json, save_board, write_json

_CARDS = {"chalk", "four", "plus", "hits", "todayBet", "band", "weekThree", "weekFive"}


def refresh_card(card_id: str) -> dict[str, Any]:
    if card_id not in _CARDS:
        raise ValueError("That bet is not on the board.")
    board = load_board()
    card = board.get(card_id)
    if not isinstance(card, dict):
        raise ValueError("That bet is not on the board.")
    games = [game for game in board.get("games") or [] if isinstance(game, dict)]
    rows = _rows(card)
    if not rows:
        raise ValueError("That bet has no lines to update.")
    quotes: dict[str, dict[tuple[str, str], int]] = {}
    live = False
    updated = 0
    for leg, event_id in rows:
        if not event_id:
            continue
        if event_id not in quotes:
            quotes[event_id], event_live = _quotes(event_id)
            live = live or event_live
        odds = quotes[event_id].get((str(leg.get("market") or "").lower(), str(leg.get("runner") or "").lower()))
        if odds is None:
            continue
        leg["odds"] = odds
        leg["pct"] = f"{implied_prob(odds) * 100:.1f}%"
        updated += 1
    if not updated:
        raise ValueError("FanDuel did not return prices for that bet.")
    _reprice(card)
    card["live"] = live
    card["pulledAt"] = now_iso()
    board[card_id] = card
    save_board(board)
    _keep_week(card_id, card)
    return card


def _rows(card: dict[str, Any]) -> list[tuple[dict[str, Any], str]]:
    games = [game for game in (load_board().get("games") or []) if isinstance(game, dict)]
    sole = str(card.get("gameId") or "")
    found = []
    legs = [leg for leg in card.get("legs") or [] if isinstance(leg, dict)]
    for group in card.get("groups") or []:
        if isinstance(group, dict):
            legs.extend(leg for leg in group.get("legs") or [] if isinstance(leg, dict))
    for leg in legs:
        found.append((leg, _event(leg, card, games, sole)))
    return found


def _event(leg: dict[str, Any], card: dict[str, Any], games: list[dict[str, Any]], sole: str) -> str:
    gid = str(leg.get("gameId") or "")
    if gid:
        return gid
    text = f"{leg.get('label') or ''} {card.get('game') or ''}".lower().replace(" at ", " @ ")
    kick = str(leg.get("kickoff") or card.get("kickoff") or "")[:16]
    hits = []
    for game in games:
        away = str(game.get("awayName") or game.get("away") or "").lower()
        home = str(game.get("homeName") or game.get("home") or "").lower()
        if not away or not home or away not in text or home not in text:
            continue
        if kick and str(game.get("kickoff") or "")[:16] != kick:
            continue
        hits.append(str(game.get("id") or ""))
    if len(hits) == 1:
        return hits[0]
    return sole


def _quotes(event_id: str) -> tuple[dict[tuple[str, str], int], bool]:
    url = (
        "https://sbapi.nj.sportsbook.fanduel.com/api/event-page"
        f"?eventId={event_id}&tab=popular&_ak={_AK}&timezone=America/New_York"
    )
    data = get_json(url, referer="https://sportsbook.fanduel.com/")
    attachments = data.get("attachments") or {}
    live = any(
        bool(event.get("inPlay"))
        for event in (attachments.get("events") or {}).values()
        if isinstance(event, dict) and str(event.get("eventId") or "") == event_id
    )
    quotes: dict[tuple[str, str], int] = {}
    for market in (attachments.get("markets") or {}).values():
        if str(market.get("eventId") or "") != event_id:
            continue
        name = str(market.get("marketName") or "").lower()
        for runner in market.get("runners") or []:
            odds = _american(runner)
            if odds is None:
                continue
            quotes[(name, str(runner.get("runnerName") or "").strip().lower())] = odds
    return quotes, live


def _reprice(card: dict[str, Any]) -> None:
    groups = [group for group in card.get("groups") or [] if isinstance(group, dict) and group.get("legs")]
    if groups:
        for group in groups:
            american, chance, _profit = _price(group.get("legs") or [])
            if american is None:
                continue
            group["price"] = f"+{american}" if american > 0 else str(american)
            group["pct"] = f"{chance}%"
        return
    american, chance, profit = _price(card.get("legs") or [])
    if american is None:
        return
    card["american"] = american
    card["impliedPct"] = chance
    card["profit"] = profit


def _price(legs: list[dict[str, Any]]) -> tuple[int | None, float | None, float | None]:
    decimal = 1.0
    for leg in legs:
        decimal *= american_decimal(leg.get("odds"))
    american = _from_decimal(decimal)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    profit = round(5 * (decimal - 1.0), 2) if american is not None else None
    return american, chance, profit


def _keep_week(card_id: str, card: dict[str, Any]) -> None:
    key = {"weekThree": "three", "weekFive": "five"}.get(card_id)
    if not key:
        return
    path = out_dir() / "week.json"
    saved = read_json(path, {})
    if not isinstance(saved, dict) or key not in saved:
        return
    saved[key] = card
    write_json(path, saved)
