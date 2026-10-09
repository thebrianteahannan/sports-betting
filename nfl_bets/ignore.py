"""Bets the desk leaves off the record. Open, wins, and losses all go."""

from __future__ import annotations

from typing import Any

from nfl_bets.store import out_dir, read_json, write_json

RULES = (
    ("short", "Under half the line"),
    ("early", "One miss, legs still open"),
    ("college", "College receiving yards"),
)


def keep_public(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    drop: list[dict[str, Any]] = []
    for row in rows:
        if _tags(row):
            drop.append(row)
        else:
            kept.append(row)
    if drop:
        _park(drop)
    return kept


def view() -> dict[str, Any]:
    live = _load_archive()
    parked = _load_ignored()
    labels = dict(RULES)
    ignored = []
    for row in reversed(parked):
        reason_ids = list(row.get("ignoredBecause") or sorted(_tags(row)))
        ignored.append({
            "id": str(row.get("id") or ""),
            "title": str(row.get("title") or ""),
            "result": str(row.get("result") or "open"),
            "reasons": [labels.get(item, item) for item in reason_ids],
            "at": str(row.get("offeredAt") or ""),
        })
    return {
        "rules": [
            {
                "id": rule_id,
                "label": label,
                "onRecord": _count(live, rule_id),
                "ignored": _count(parked, rule_id),
            }
            for rule_id, label in RULES
        ],
        "ignored": ignored[:80],
    }


def sweep() -> dict[str, Any]:
    from nfl_bets import archive as record
    from nfl_bets.cloud import configured, publish_board
    from nfl_bets.store import load_board

    with record._LOCK:
        rows = record._load()
        record._write(rows)
    if configured():
        publish_board(load_board())
    return view()


def _count(rows: list[dict[str, Any]], rule_id: str) -> int:
    return sum(1 for row in rows if rule_id in (row.get("ignoredBecause") or _tags(row)))


def _park(rows: list[dict[str, Any]]) -> None:
    current = _load_ignored()
    have = {_signature(row) for row in current}
    for row in rows:
        key = _signature(row)
        if key in have:
            continue
        marked = dict(row)
        marked["ignoredBecause"] = sorted(_tags(row))
        current.append(marked)
        have.add(key)
    write_json(out_dir() / "ignored.json", {"tickets": current[-400:]})


def _load_archive() -> list[dict[str, Any]]:
    data = read_json(out_dir() / "archive.json", {"tickets": []})
    rows = data.get("tickets") if isinstance(data, dict) else []
    return [row for row in rows or [] if isinstance(row, dict)]


def _load_ignored() -> list[dict[str, Any]]:
    data = read_json(out_dir() / "ignored.json", {"tickets": []})
    rows = data.get("tickets") if isinstance(data, dict) else []
    return [row for row in rows or [] if isinstance(row, dict)]


def _tags(ticket: dict[str, Any]) -> set[str]:
    found: set[str] = set()
    legs = [leg for leg in ticket.get("legs") or [] if isinstance(leg, dict)]
    if any(_sport(leg) == "NCAAF" and leg.get("stat") == "receivingYards" for leg in legs):
        found.add("college")
    missed = [leg for leg in legs if leg.get("result") == "lost"]
    for leg in missed:
        line = _num(leg.get("line"))
        have = _num(leg.get("have"))
        if line and have is not None and have < line * 0.5:
            found.add("short")
    if missed and any(not leg.get("result") or leg.get("result") == "open" for leg in legs):
        found.add("early")
    return found


def _sport(leg: dict[str, Any]) -> str:
    if leg.get("sport"):
        return str(leg.get("sport"))
    parts = str(leg.get("label") or "").split(" — ")
    tail = parts[1] if len(parts) > 1 else ""
    return tail.split(",")[0].strip()


def _num(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return number


def _signature(row: dict[str, Any]) -> tuple:
    legs = tuple((str(leg.get("label") or ""), leg.get("odds")) for leg in row.get("legs") or [] if isinstance(leg, dict))
    return (row.get("card"), row.get("title"), legs)
