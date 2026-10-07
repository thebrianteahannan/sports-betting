"""JSON files for line history, the board, and the bankroll."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
_MAX_SNAPS = 96


def out_dir() -> Path:
    raw = (os.environ.get("NFL_BETS_OUT_DIR") or "output").strip()
    path = Path(raw).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def board_path() -> Path:
    return out_dir() / "board.json"


def load_board() -> dict[str, Any]:
    data = read_json(board_path(), {})
    return data if isinstance(data, dict) else {}


def save_board(payload: dict[str, Any]) -> None:
    with _LOCK:
        write_json(board_path(), payload)


def history_path(event_id: str) -> Path:
    return out_dir() / "history" / f"{event_id}.json"


def load_history(event_id: str) -> list[dict[str, Any]]:
    data = read_json(history_path(event_id), {"snapshots": []})
    snaps = data.get("snapshots") if isinstance(data, dict) else []
    return [s for s in snaps or [] if isinstance(s, dict)]


def record_quote(event_id: str, quote: dict[str, Any]) -> dict[str, Any]:
    """Append a snapshot when the number or the price actually moved."""
    with _LOCK:
        snaps = load_history(event_id)
        if not snaps or _moved(snaps[-1], quote):
            snaps.append({"ts": now_iso(), **quote})
        snaps = snaps[-_MAX_SNAPS:]
        write_json(history_path(event_id), {"id": event_id, "snapshots": snaps})
    return {"open": snaps[0], "snaps": snaps}


def _moved(prev: dict[str, Any], quote: dict[str, Any]) -> bool:
    for key in ("spreadAway", "spreadHome", "total", "mlAway", "mlHome"):
        if prev.get(key) != quote.get(key):
            return True
    for key in ("spreadAwayOdds", "spreadHomeOdds", "overOdds", "underOdds"):
        old = prev.get(key)
        new = quote.get(key)
        if old is None or new is None:
            if old != new:
                return True
            continue
        if abs(float(old) - float(new)) >= 10:
            return True
    return False


def bank_path() -> Path:
    return out_dir() / "bank.json"


def starting_bank() -> float:
    try:
        return round(float(os.environ.get("NFL_BETS_BANK_START") or 20), 2)
    except ValueError:
        return 20.0


def load_bank() -> dict[str, Any]:
    with _LOCK:
        data = read_json(bank_path(), {})
        if not isinstance(data, dict) or "cash" not in data:
            data = {"started": starting_bank(), "cash": starting_bank(), "bets": []}
            write_json(bank_path(), data)
        data.setdefault("bets", [])
        return data


def suggested_stake(cash: float) -> float:
    """$1 at a $20 bank, never more than $2 until $50, then 5% of the bank."""
    cash = round(float(cash), 2)
    if cash < 1:
        return 0.0
    raw = round(cash * 0.05 + 1e-9, 2)
    if cash < 50:
        raw = min(raw, 2.0)
    if cash >= 20:
        raw = max(raw, 1.0)
    return min(raw, cash)


def _save_bank(data: dict[str, Any]) -> dict[str, Any]:
    data["cash"] = round(float(data.get("cash") or 0), 2)
    write_json(bank_path(), data)
    return data


def reset_bank(amount: float) -> dict[str, Any]:
    amount = round(float(amount), 2)
    if amount < 0:
        raise ValueError("bank cannot be negative")
    with _LOCK:
        return _save_bank({"started": amount, "cash": amount, "bets": []})


def place_bet(bet: dict[str, Any]) -> dict[str, Any]:
    stake = round(float(bet.get("stake") or 0), 2)
    if stake <= 0:
        raise ValueError("stake must be positive")
    with _LOCK:
        data = read_json(bank_path(), {})
        if not isinstance(data, dict) or "cash" not in data:
            data = {"started": starting_bank(), "cash": starting_bank(), "bets": []}
        cash = round(float(data.get("cash") or 0), 2)
        mode = str(bet.get("mode") or "real").lower()
        if mode not in {"real", "paper"}:
            raise ValueError("mode must be real or paper")
        if mode == "real" and stake > cash + 0.001:
            raise ValueError(f"stake ${stake:.2f} is more than the ${cash:.2f} left")
        row = {
            "id": uuid.uuid4().hex[:10],
            "gameId": str(bet.get("gameId") or ""),
            "label": str(bet.get("label") or "Bet"),
            "market": str(bet.get("market") or ""),
            "side": str(bet.get("side") or ""),
            "odds": bet.get("odds"),
            "stake": stake,
            "placedAt": now_iso(),
            "status": "open",
            "mode": mode,
        }
        if mode == "real":
            data["cash"] = round(cash - stake, 2)
        bets = list(data.get("bets") or [])
        bets.append(row)
        data["bets"] = bets
        saved = _save_bank(data)
    return {"bet": row, "bank": public_bank(saved)}


def settle_bet(bet_id: str, result: str) -> dict[str, Any]:
    result = (result or "").lower().strip()
    if result not in {"won", "lost", "push", "void"}:
        raise ValueError("result must be won, lost, push, or void")
    with _LOCK:
        data = read_json(bank_path(), {})
        bets = list((data or {}).get("bets") or [])
        found = None
        for bet in bets:
            if str(bet.get("id")) == bet_id:
                found = bet
                break
        if not found:
            raise ValueError("bet not found")
        if found.get("status") != "open":
            raise ValueError("bet is already settled")
        stake = float(found.get("stake") or 0)
        odds = found.get("odds")
        cash = float(data.get("cash") or 0)
        paper = str(found.get("mode") or "real") == "paper"
        if result == "won":
            from nfl_bets.hedge import american_decimal

            gain = stake * american_decimal(float(odds))
            if paper:
                data["paperNet"] = round(float(data.get("paperNet") or 0) + gain - stake, 2)
            else:
                cash += gain
        elif result == "lost" and paper:
            data["paperNet"] = round(float(data.get("paperNet") or 0) - stake, 2)
        elif result in {"push", "void"} and not paper:
            cash += stake
        found["status"] = result
        found["settledAt"] = now_iso()
        data["cash"] = cash
        data["bets"] = bets
        saved = _save_bank(data)
    return {"bet": found, "bank": public_bank(saved)}


def public_bank(data: dict[str, Any] | None = None) -> dict[str, Any]:
    from nfl_bets.plan import stakes_today

    data = data if data is not None else load_bank()
    cash = round(float(data.get("cash") or 0), 2)
    bets = list(data.get("bets") or [])
    at_risk = stakes_today(bets)
    return {
        "started": data.get("started"),
        "cash": cash,
        "paperNet": round(float(data.get("paperNet") or 0), 2),
        "suggestedStake": suggested_stake(round(cash + at_risk, 2)),
        "atRiskToday": at_risk,
        "openCount": sum(1 for bet in bets if bet.get("status") == "open"),
        "bets": list(reversed(bets[-40:])),
    }
