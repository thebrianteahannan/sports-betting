"""Build the NFL board from FanDuel prices plus ESPN context."""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Any

from nfl_bets.chalk import build_parlays
from nfl_bets.cross_four import build_cross_four
from nfl_bets.espn_context import fetch_context
from nfl_bets.fanduel import fetch_board
from nfl_bets.indicators import build_flags, score_flags
from nfl_bets.store import load_bank, now_iso, public_bank, record_quote, save_board
from nfl_bets.teams import nick

_LOCK = threading.Lock()

_SOURCES = [
    {
        "id": "fanduel",
        "label": "FanDuel",
        "detail": "Spread, total, and moneyline from every FanDuel sport that is up.",
    },
    {
        "id": "history",
        "label": "Line history",
        "detail": (
            "Each refresh stores FanDuel's number, the same idea as the fantasy "
            "Vegas total tracker. Open is the first price this desk saw."
        ),
    },
    {
        "id": "espn-news",
        "label": "ESPN news",
        "detail": (
            "NFL headlines from the same ESPN host the fantasy desks use, "
            "to see whether a story landed and the FanDuel number did not."
        ),
    },
    {
        "id": "espn-dive",
        "label": "Deep dive",
        "detail": (
            "Opening a game pulls that game's ESPN injury report and matchup "
            "predictor. The predictor is a public model, not a second book."
        ),
    },
]


def run() -> dict[str, Any]:
    with _LOCK:
        return _run()


def _run() -> dict[str, Any]:
    errors: list[str] = []
    host = ""
    try:
        raw_games, host = fetch_board()
    except Exception as exc:  # noqa: BLE001
        errors.append(f"FanDuel: {exc}")
        raw_games = []
    try:
        context = fetch_context()
    except Exception as exc:  # noqa: BLE001
        context = {"index": {}, "articles": [], "week": 0, "year": 0, "error": str(exc)}
    if context.get("error"):
        errors.append(f"ESPN: {context['error']}")

    index = context.get("index") or {}
    articles = list(context.get("articles") or [])
    now = datetime.now(timezone.utc)
    games = [
        _decorate(raw, index, articles)
        for raw in raw_games
        if _still_bettable(str(raw.get("kickoff") or ""), now)
    ]
    games.sort(key=lambda game: (-int(game.get("lookScore") or 0), game.get("kickoff") or ""))
    weeks = sorted({
        int(game["week"])
        for game in games
        if str(game.get("sport") or "NFL") == "NFL" and game.get("week")
    })
    parlays = _parlays(games, errors)
    try:
        cross = build_cross_four(games)
        if cross:
            parlays["four"] = cross
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Cross parlay: {exc}")
    payload = {
        "updatedAt": now_iso(),
        "book": "FanDuel",
        "season": context.get("year"),
        "espnWeek": context.get("week"),
        "currentWeek": _current_week(games, now),
        "weeks": weeks,
        "host": host,
        "errors": errors,
        "sources": _source_rows(host, errors),
        "games": games,
        "lookCount": sum(1 for game in games if int(game.get("lookScore") or 0) > 0),
        "articles": articles,
        "bank": public_bank(load_bank()),
        "chalk": parlays["chalk"],
        "four": parlays["four"],
        "plus": parlays["plus"],
        "hits": parlays["hits"],
        "todayBet": _today_bet(games, now, errors),
    }
    try:
        from nfl_bets.archive import record_offers

        record_offers(payload)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Archive: {exc}")
        payload["errors"] = errors
    save_board(payload)
    try:
        from nfl_bets.cloud import publish_board

        publish_board(payload)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Supabase: {exc}")
        payload["errors"] = errors
    return payload


def _parlays(games: list[dict[str, Any]], errors: list[str]) -> dict[str, Any]:
    blank = {"title": "No parlay", "goal": "", "copy": "No game on the board yet.", "legs": []}
    upcoming = [
        game for game in games
        if game.get("kickoff") and str(game.get("sport") or "NFL") == "NFL"
    ]
    if not upcoming:
        return {"chalk": blank, "four": blank, "plus": blank, "hits": blank}
    soonest = min(upcoming, key=lambda game: str(game.get("kickoff") or ""))
    try:
        return build_parlays(soonest)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Parlay: {exc}")
        missed = {"title": "No parlay", "goal": "", "copy": "FanDuel's prop board did not load.", "legs": []}
        return {"chalk": missed, "four": missed, "plus": missed, "hits": missed}


_TODAY_SPORTS = {"NFL", "NHL", "NBA", "MLB", "NCAAF", "WNBA"}
_ET = ZoneInfo("America/New_York")


def _today_bet(games: list[dict[str, Any]], now: datetime, errors: list[str]) -> dict[str, Any]:
    slate = _today_games(games, now)
    offers: list[dict[str, Any]] = []
    for game in slate:
        try:
            cards = build_parlays(game)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Today: {exc}")
            continue
        title = _place(game)
        for card in cards.values():
            for offer in _offers(card):
                if title:
                    offer["game"] = title
                offers.append(offer)
    if slate:
        try:
            cross = build_cross_four(slate)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Today parlay: {exc}")
            cross = None
        if cross:
            offers.extend(_offers(cross))
    best = max(
        offers,
        key=lambda offer: (float(offer.get("impliedPct") or -1), 0 if offer.get("live") else 1),
        default=None,
    )
    if not best:
        return {
            "title": "Today's Best Bet",
            "goal": "A bet you can place today.",
            "copy": "Nothing left to bet on today's slate.",
            "legs": [],
        }
    return {
        "title": "Today's Best Bet",
        "strategy": best.get("strategy") or "",
        "game": best.get("game") or "",
        "goal": "A bet you can place today.",
        "american": best.get("american"),
        "impliedPct": best.get("impliedPct"),
        "stake": 5,
        "profit": best.get("profit"),
        "live": bool(best.get("live")),
        "note": best.get("note") or "",
        "copy": "",
        "legs": best.get("legs") or [],
    }


def _place(game: dict[str, Any]) -> str:
    match = str(game.get("match") or "")
    if " @ " in match:
        away, home = match.split(" @ ", 1)
        return f"{away.strip()} at {home.strip()}"
    return ""


def _today_games(games: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    today = now.astimezone(_ET).date()
    grouped: dict[str, list[tuple[datetime, dict[str, Any]]]] = {}
    for game in games:
        sport = str(game.get("sport") or "")
        if sport not in _TODAY_SPORTS:
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp.astimezone(_ET).date() != today:
            continue
        if stamp < now - timedelta(hours=3):
            continue
        grouped.setdefault(sport, []).append((stamp, game))
    picked: list[dict[str, Any]] = []
    for rows in grouped.values():
        rows.sort(key=lambda item: (item[0] < now, item[0] if item[0] >= now else -item[0].timestamp()))
        picked.extend(game for _, game in rows[:2])
    picked.sort(key=lambda game: str(game.get("kickoff") or ""))
    return picked


def _offers(card: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    chance = card.get("impliedPct")
    if card.get("legs") and isinstance(chance, (int, float)):
        rows.append({
            "strategy": str(card.get("strategy") or card.get("title") or ""),
            "game": card.get("game") or "",
            "impliedPct": float(chance),
            "american": card.get("american"),
            "profit": card.get("profit"),
            "note": card.get("note") or "",
            "live": bool(card.get("live")),
            "legs": card.get("legs") or [],
        })
    for group in card.get("groups") or []:
        if not isinstance(group, dict) or not group.get("legs"):
            continue
        pct = _pct_value(group.get("pct"))
        if pct is None:
            continue
        price = _american_price(group.get("price"))
        rows.append({
            "strategy": str(group.get("title") or ""),
            "game": card.get("game") or "",
            "impliedPct": pct,
            "american": price,
            "profit": _win(price),
            "note": card.get("note") or "",
            "live": bool(card.get("live")),
            "legs": group.get("legs") or [],
        })
    return rows


def _pct_value(raw: Any) -> float | None:
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw or "").replace("%", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def _american_price(raw: Any) -> int | None:
    text = str(raw or "").replace("+", "").strip()
    try:
        return int(text)
    except ValueError:
        return None


def _win(price: int | None) -> float | None:
    if not price:
        return None
    decimal = 1 + (price / 100 if price > 0 else 100 / abs(price))
    return round(5 * (decimal - 1), 2)


def _decorate(
    raw: dict[str, Any],
    index: dict[str, Any],
    articles: list[dict[str, Any]],
) -> dict[str, Any]:
    meta = index.get(f"{raw['away']}@{raw['home']}") or {}
    hist = record_quote(str(raw["id"]), _quote(raw))
    snaps = hist["snaps"]
    opened = hist["open"]
    flags = build_flags(raw, snaps, articles)
    return {
        "id": raw["id"],
        "week": meta.get("week") or 0,
        "espnId": meta.get("espnId") or "",
        "away": raw["away"],
        "home": raw["home"],
        "awayName": raw["awayName"],
        "homeName": raw["homeName"],
        "sport": raw.get("sport") or "NFL",
        "match": raw.get("match") or "",
        "awayNick": nick(raw["away"]) if (raw.get("sport") or "NFL") == "NFL" else raw["away"],
        "homeNick": nick(raw["home"]) if (raw.get("sport") or "NFL") == "NFL" else raw["home"],
        "kickoff": raw["kickoff"],
        "spread": raw.get("spread"),
        "moneyline": raw.get("moneyline"),
        "total": raw.get("total"),
        "spreadLabel": raw.get("spreadLabel") or "Spread",
        "moneyLabel": raw.get("moneyLabel") or "Moneyline",
        "totalLabel": raw.get("totalLabel") or "Total",
        "open": {
            "spreadAway": opened.get("spreadAway"),
            "total": opened.get("total"),
            "mlAway": opened.get("mlAway"),
            "mlHome": opened.get("mlHome"),
            "ts": opened.get("ts"),
        },
        "snapCount": len(snaps),
        "flags": flags,
        "lookScore": score_flags(flags),
    }


def _quote(raw: dict[str, Any]) -> dict[str, Any]:
    spread = raw.get("spread") or {}
    total = raw.get("total") or {}
    money = raw.get("moneyline") or {}
    return {
        "spreadAway": spread.get("awayLine"),
        "spreadHome": spread.get("homeLine"),
        "spreadAwayOdds": spread.get("awayOdds"),
        "spreadHomeOdds": spread.get("homeOdds"),
        "total": total.get("line"),
        "overOdds": total.get("overOdds"),
        "underOdds": total.get("underOdds"),
        "mlAway": money.get("awayOdds"),
        "mlHome": money.get("homeOdds"),
    }


def _still_bettable(kickoff: str, now: datetime) -> bool:
    stamp = _parse(kickoff)
    if stamp is None:
        return True
    return stamp >= now - timedelta(hours=8)


def _current_week(games: list[dict[str, Any]], now: datetime) -> int:
    future = []
    for game in games:
        stamp = _parse(str(game.get("kickoff") or ""))
        week = int(game.get("week") or 0)
        if week and stamp and stamp >= now:
            future.append(week)
    if future:
        return min(future)
    weeks = [int(game.get("week") or 0) for game in games if game.get("week")]
    return min(weeks) if weeks else 0


def _parse(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp


def _source_rows(host: str, errors: list[str]) -> list[dict[str, str]]:
    rows = []
    for source in _SOURCES:
        row = dict(source)
        if source["id"] == "fanduel":
            row["detail"] = (
                f"Spread, total, and moneyline from FanDuel ({host or 'sportsbook'}). "
                "Every sport FanDuel has up. No other sportsbook is loaded."
            )
        row["ok"] = "no" if source["id"] == "fanduel" and any(
            err.startswith("FanDuel") for err in errors
        ) else "yes"
        rows.append(row)
    return rows


def public_payload(board: dict[str, Any] | None = None) -> dict[str, Any]:
    """Board for the browser. Headlines stay on disk for the deep dive."""
    from nfl_bets.store import load_board

    from nfl_bets.plan import build_plan

    data = dict(board or load_board())
    data.pop("articles", None)
    bank = public_bank()
    data["bank"] = bank
    data["plan"] = build_plan(
        list(data.get("games") or []),
        bank,
        current_week=data.get("currentWeek"),
    )
    from nfl_bets.picks import list_picks
    from nfl_bets.archive import grade_open

    data["picks"] = list_picks()
    try:
        data["archive"] = grade_open()
    except Exception:  # noqa: BLE001
        data["archive"] = []
    return data


if __name__ == "__main__":
    result = run()
    print(
        f"games={len(result.get('games') or [])} "
        f"looks={result.get('lookCount')} errors={result.get('errors')}"
    )
