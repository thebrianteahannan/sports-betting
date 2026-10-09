"""Saved picks. This file only remembers a choice. It does not send a bet."""

from __future__ import annotations

import threading
import uuid
from typing import Any

from nfl_bets.store import now_iso, out_dir, read_json, write_json

_CARDS = {"chalk", "four", "plus", "hits", "todayBet", "band", "weekThree", "weekFive"}
_RESULTS = {"won", "lost", "push"}
_LOCK = threading.Lock()


def list_picks() -> list[dict[str, Any]]:
    data = read_json(_path(), {"picks": []})
    rows = data.get("picks") if isinstance(data, dict) else []
    picks = [row for row in rows or [] if isinstance(row, dict)]
    picks.sort(key=lambda row: str(row.get("savedAt") or ""), reverse=True)
    return picks


def save_pick(card_id: str, card: dict[str, Any] | None, group_title: str = "") -> dict[str, Any]:
    with _LOCK:
        return _save_pick(card_id, card, group_title)


def _save_pick(card_id: str, card: dict[str, Any] | None, group_title: str = "") -> dict[str, Any]:
    if card_id not in _CARDS or not isinstance(card, dict):
        raise ValueError("That card is not on the board.")
    if group_title:
        card = _one_group(card, group_title)
    legs = [_leg(leg) for leg in card.get("legs") or [] if isinstance(leg, dict)]
    groups = [_group(group) for group in card.get("groups") or [] if isinstance(group, dict)]
    if not legs and not groups:
        raise ValueError("That card has no bet to save.")
    fresh = {
        "id": uuid.uuid4().hex[:12],
        "card": card_id,
        "title": str(card.get("title") or "Pick"),
        "game": str(card.get("game") or ""),
        "american": card.get("american"),
        "impliedPct": card.get("impliedPct"),
        "copy": str(card.get("copy") or ""),
        "legs": legs,
        "groups": groups,
        "savedAt": now_iso(),
        "result": "open",
    }
    picks = list_picks()
    prior = next((row for row in picks if row.get("result") == "open" and _same(row, fresh)), None)
    if prior:
        return {"picks": picks, "pick": prior, "already": True}
    picks.insert(0, fresh)
    _write(picks)
    return {"picks": picks, "pick": fresh, "already": False}


def settle_pick(pick_id: str, result: str) -> dict[str, Any]:
    with _LOCK:
        return _settle_pick(pick_id, result)


def _settle_pick(pick_id: str, result: str) -> dict[str, Any]:
    if result not in _RESULTS:
        raise ValueError("Mark it won, lost, or push.")
    picks = list_picks()
    found = next((row for row in picks if str(row.get("id")) == pick_id), None)
    if not found:
        raise ValueError("That pick is not saved.")
    if found.get("result") != "open":
        raise ValueError("That pick is already marked.")
    found["result"] = result
    found["settledAt"] = now_iso()
    _write(picks)
    return {"picks": picks, "pick": found}


def _same(saved: dict[str, Any], fresh: dict[str, Any]) -> bool:
    return (
        saved.get("card") == fresh.get("card")
        and saved.get("american") == fresh.get("american")
        and _labels(saved) == _labels(fresh)
    )


def _labels(row: dict[str, Any]) -> tuple[str, ...]:
    names = [str(leg.get("label") or "") for leg in row.get("legs") or []]
    for group in row.get("groups") or []:
        names.append(str(group.get("title") or ""))
        names.extend(str(leg.get("label") or "") for leg in group.get("legs") or [])
    return tuple(names)


def _one_group(card: dict[str, Any], group_title: str) -> dict[str, Any]:
    chosen = next(
        (group for group in card.get("groups") or [] if str(group.get("title") or "") == group_title),
        None,
    )
    if not isinstance(chosen, dict):
        raise ValueError("That stack is not on the board.")
    narrowed = dict(card)
    narrowed["title"] = f"{card.get('title') or 'Pick'} · {group_title}"
    narrowed["legs"] = chosen.get("legs") or []
    narrowed["groups"] = []
    narrowed["american"] = _american(chosen.get("price"))
    narrowed["impliedPct"] = _pct(chosen.get("pct"))
    return narrowed


def _american(raw: Any) -> int | None:
    text = str(raw or "").replace("+", "").strip()
    try:
        return int(text)
    except ValueError:
        return None


def _pct(raw: Any) -> float | None:
    text = str(raw or "").replace("%", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def _leg(leg: dict[str, Any]) -> dict[str, Any]:
    return {
        "label": str(leg.get("label") or ""),
        "odds": leg.get("odds"),
        "pct": str(leg.get("pct") or ""),
    }


def _group(group: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": str(group.get("title") or ""),
        "price": str(group.get("price") or ""),
        "pct": str(group.get("pct") or ""),
        "legs": [_leg(leg) for leg in group.get("legs") or [] if isinstance(leg, dict)],
    }


def _path():
    return out_dir() / "picks.json"


def _write(picks: list[dict[str, Any]]) -> None:
    write_json(_path(), {"picks": picks})
