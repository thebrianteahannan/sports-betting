"""One game, opened up: why the flag fired, injuries, model, and the hedge."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from nfl_bets.espn_context import fetch_summary, matching_articles
from nfl_bets.hedge import no_vig, size_hedge
from nfl_bets.store import load_board, now_iso, out_dir, public_bank, read_json, write_json
from nfl_bets.teams import nick

_KEEP_STATUS = {"out", "doubtful", "questionable"}


def build_dive(game_id: str) -> dict[str, Any]:
    board = load_board()
    game = _find(board, game_id)
    if not game:
        raise ValueError("game is not on the current board")
    summary: dict[str, Any] = {}
    note = ""
    espn_id = str(game.get("espnId") or "")
    if espn_id:
        try:
            summary = _cached_summary(espn_id)
        except Exception as exc:  # noqa: BLE001
            note = f"ESPN game page failed: {exc}"
    else:
        note = "No ESPN game id for this matchup, so injuries and the model are skipped."

    injuries = [
        row
        for row in (summary.get("injuries") or [])
        if str(row.get("status") or "").lower() in _KEEP_STATUS
    ]
    away = str(game.get("away") or "")
    home = str(game.get("home") or "")
    wire = matching_articles(
        list(board.get("articles") or []),
        away,
        home,
        within_hours=72,
    )
    articles = matching_articles(
        _merge_articles(list(summary.get("articles") or []), wire),
        away,
        home,
    )
    model = _model_view(game, summary.get("model"))
    prices = _prices(game)
    bank = public_bank()
    from nfl_bets.plan import build_plan

    plan = build_plan(
        list(board.get("games") or []),
        bank,
        current_week=board.get("currentWeek"),
    )
    mine = next(
        (ticket for ticket in plan.get("tickets") or [] if str(ticket.get("gameId")) == str(game.get("id"))),
        None,
    )
    focus = (
        {"market": str(mine["market"]), "side": str(mine["side"])}
        if mine
        else _focus_flag(game)
    )
    stake = float(mine["stake"]) if mine else float(bank.get("suggestedStake") or 0)
    hedge = _preview_hedge(prices, focus, stake)
    return {
        "game": game,
        "injuries": injuries,
        "articles": articles[:8],
        "model": model,
        "prices": prices,
        "paragraphs": _paragraphs(game, injuries, model, hedge, bank, plan),
        "hedgePreview": hedge,
        "focus": focus,
        "bank": bank,
        "stake": stake,
        "note": note,
    }


def price_for(game: dict[str, Any], market: str, side: str) -> dict[str, Any] | None:
    row = (_prices(game).get(market) or {}).get(side)
    return row if isinstance(row, dict) else None


def _find(board: dict[str, Any], game_id: str) -> dict[str, Any] | None:
    for game in board.get("games") or []:
        if str(game.get("id")) == str(game_id):
            return game
    return None


def _cached_summary(espn_id: str) -> dict[str, Any]:
    path = out_dir() / "espn" / f"{espn_id}.json"
    cached = read_json(path, {})
    if isinstance(cached, dict) and cached.get("summary") and cached.get("fetchedAt"):
        try:
            stamp = datetime.fromisoformat(str(cached["fetchedAt"]).replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - stamp).total_seconds()
        except ValueError:
            age = 99999.0
        if age < 600:
            return cached["summary"]
    summary = fetch_summary(espn_id)
    write_json(path, {"fetchedAt": now_iso(), "summary": summary})
    return summary


def _model_view(game: dict[str, Any], model: dict[str, Any] | None) -> dict[str, Any] | None:
    if not model:
        return None
    money = game.get("moneyline") or {}
    away_pct = float(model.get("awayPct") or 0)
    home_pct = float(model.get("homePct") or 0)
    if model.get("away") and model.get("away") != game.get("away"):
        away_pct, home_pct = home_pct, away_pct
    view: dict[str, Any] = {"awayPct": round(away_pct, 1), "homePct": round(home_pct, 1)}
    if money.get("awayOdds") is None or money.get("homeOdds") is None:
        return view
    nv_away, nv_home = no_vig(float(money["awayOdds"]), float(money["homeOdds"]))
    gap = away_pct - nv_away * 100.0
    side = "away" if gap >= 0 else "home"
    view.update(
        {
            "mlAwayPct": round(nv_away * 100.0, 1),
            "mlHomePct": round(nv_home * 100.0, 1),
            "gap": round(abs(gap), 1),
            "side": side,
            "team": nick(str(game["away"] if side == "away" else game["home"])),
        }
    )
    return view


def _prices(game: dict[str, Any]) -> dict[str, Any]:
    spread = game.get("spread") or {}
    money = game.get("moneyline") or {}
    total = game.get("total") or {}
    away = str(game.get("awayNick") or game.get("away") or "Away")
    home = str(game.get("homeNick") or game.get("home") or "Home")
    return {
        "spread": {
            "away": _row(spread.get("awayLine"), spread.get("awayOdds"), f"{away} {_signed(spread.get('awayLine'))} {_american(spread.get('awayOdds'))}"),
            "home": _row(spread.get("homeLine"), spread.get("homeOdds"), f"{home} {_signed(spread.get('homeLine'))} {_american(spread.get('homeOdds'))}"),
        },
        "moneyline": {
            "away": _row(None, money.get("awayOdds"), f"{away} ML {_american(money.get('awayOdds'))}"),
            "home": _row(None, money.get("homeOdds"), f"{home} ML {_american(money.get('homeOdds'))}"),
        },
        "total": {
            "over": _row(total.get("line"), total.get("overOdds"), f"Over {_num(total.get('line'))} {_american(total.get('overOdds'))}"),
            "under": _row(total.get("line"), total.get("underOdds"), f"Under {_num(total.get('line'))} {_american(total.get('underOdds'))}"),
        },
    }


def _row(line: Any, odds: Any, label: str) -> dict[str, Any]:
    return {"line": line, "odds": odds, "label": " ".join(label.split())}


def _focus_flag(game: dict[str, Any]) -> dict[str, str]:
    for flag in game.get("flags") or []:
        if flag.get("market") and flag.get("side"):
            return {"market": str(flag["market"]), "side": str(flag["side"])}
    return {"market": "spread", "side": "away"}


def _preview_hedge(prices: dict[str, Any], focus: dict[str, str], stake: float) -> dict[str, Any] | None:
    if stake <= 0:
        return None
    market = prices.get(focus.get("market") or "") or {}
    side = market.get(focus.get("side") or "") or {}
    other = market.get(_opposite(focus.get("market") or "", focus.get("side") or "")) or {}
    if side.get("odds") is None or other.get("odds") is None:
        return None
    try:
        sized = size_hedge(stake, float(side["odds"]), float(other["odds"]))
    except (TypeError, ValueError):
        return None
    sized["label"] = side.get("label")
    sized["hedgeLabel"] = other.get("label")
    return sized


def _paragraphs(
    game: dict[str, Any],
    injuries: list[dict[str, Any]],
    model: dict[str, Any] | None,
    hedge: dict[str, Any] | None,
    bank: dict[str, Any],
    plan: dict[str, Any] | None = None,
) -> list[str]:
    flags = list(game.get("flags") or [])
    lines = [
        str(flags[0].get("why") or "")
        if flags
        else (
            "Nothing on this game is out of line right now. FanDuel's spread, "
            "total, and moneyline agree, and the number has not moved since this desk saved it."
        )
    ]
    if model and model.get("gap") is not None:
        gap = float(model["gap"])
        side = str(model.get("side") or "away")
        model_pct = model["awayPct"] if side == "away" else model["homePct"]
        ml_pct = model.get("mlAwayPct") if side == "away" else model.get("mlHomePct")
        if gap >= 6:
            lines.append(
                f"ESPN's matchup model has the {model.get('team')} at {model_pct}%. "
                f"FanDuel's moneyline, vig removed, says {ml_pct}%. That is a public "
                "model, not a sharp sheet. Read it. Do not bet it by itself."
            )
        else:
            rounded = int(round(gap))
            word = "point" if rounded == 1 else "points"
            lines.append(
                f"ESPN's matchup model and FanDuel's moneyline are close ({rounded} {word})."
            )
    outs = [row for row in injuries if str(row.get("status") or "").lower() == "out"]
    if outs:
        names = ", ".join(f"{row.get('player')} ({row.get('status')})" for row in outs[:4])
        lines.append(f"ESPN lists {names} out. See whether FanDuel's number already paid for that.")
    elif injuries:
        lines.append(f"ESPN lists {len(injuries)} questionable or doubtful names, and nobody out.")
    mine = next(
        (
            ticket
            for ticket in (plan or {}).get("tickets") or []
            if str(ticket.get("gameId")) == str(game.get("id"))
        ),
        None,
    )
    if mine:
        lines.append(
            f"This purse sizes this wager at ${float(mine['stake']):.0f}: {mine.get('label')}. "
            "Type that into FanDuel. The desk does not send it."
        )
    elif plan and plan.get("action") == "hold":
        lines.append(
            "Today is a hold. Log this on paper if you want the record. "
            "Real money stays in the bank."
        )
    if plan and plan.get("parlayNote"):
        lines.append(str(plan["parlayNote"]))
    if hedge and hedge.get("note"):
        lines.append(str(hedge["note"]))
    return [line for line in lines if line]


def _merge_articles(primary: list[dict[str, Any]], extra: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for article in primary + extra:
        headline = str(article.get("headline") or "")
        if not headline or headline in seen:
            continue
        seen.add(headline)
        out.append(article)
    return out


def _opposite(market: str, side: str) -> str:
    table = {
        "spread": {"away": "home", "home": "away"},
        "moneyline": {"away": "home", "home": "away"},
        "total": {"over": "under", "under": "over"},
    }
    return (table.get(market) or {}).get(side, "")


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
