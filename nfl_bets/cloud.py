"""Publish the desk to Supabase. The Mac writes. The website reads.

Same key-value table as the Wizards site. Betting rows use a bets/ prefix
so they do not touch roster or schedule data.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from nfl_bets.store import out_dir, read_json, write_json

_KEYS = {
    "board": "bets/board.json",
    "archive": "bets/archive.json",
    "picks": "bets/picks.json",
}
_CARD_KEYS = ("updatedAt", "intervalSeconds", "book", "errors", "chalk", "four", "plus", "hits", "todayBet", "band", "weekThree", "weekFive")


def configured() -> bool:
    _load_env()
    return bool(_url() and _key())


def publish_board(board: dict[str, Any]) -> None:
    """Push the cards and a merged archive. Picks stay where the site saved them."""
    if not configured():
        return
    local = _local_archive()
    remote = _get(_KEYS["archive"]) or {"tickets": []}
    merged = _merge_archive(local, remote.get("tickets") if isinstance(remote, dict) else [])
    if merged != local:
        write_json(out_dir() / "archive.json", {"tickets": merged})
    _put(_KEYS["board"], _slim(board))
    _put(_KEYS["archive"], {"tickets": merged})
    _put("bets/ignored.json", read_json(out_dir() / "ignored.json", {"tickets": []}))


def _slim(board: dict[str, Any]) -> dict[str, Any]:
    return {key: board.get(key) for key in _CARD_KEYS}


def _local_archive() -> list[dict[str, Any]]:
    data = read_json(out_dir() / "archive.json", {"tickets": []})
    rows = data.get("tickets") if isinstance(data, dict) else []
    return [row for row in rows or [] if isinstance(row, dict)]


def _merge_archive(local: list[dict[str, Any]], remote: list[Any]) -> list[dict[str, Any]]:
    prior = {str(row.get("id")): row for row in remote if isinstance(row, dict) and row.get("id")}
    merged: list[dict[str, Any]] = []
    for row in local:
        other = prior.get(str(row.get("id")))
        if not other:
            merged.append(row)
            continue
        kept = dict(row)
        remote_at = str(other.get("goodAt") or "")
        local_at = str(kept.get("goodAt") or "")
        if other.get("stars") is not None and remote_at >= local_at:
            kept["stars"] = int(other.get("stars") or 0)
            kept["good"] = kept["stars"] > 0
            if remote_at:
                kept["goodAt"] = remote_at
        elif other.get("good") and kept.get("stars") is None:
            kept["good"] = True
            if other.get("goodAt"):
                kept["goodAt"] = other.get("goodAt")
        local_result = str(kept.get("result") or "open")
        remote_result = str(other.get("result") or "open")
        if local_result == "open" and remote_result in {"won", "lost", "push"}:
            kept["result"] = remote_result
            kept["how"] = other.get("how") or kept.get("how")
            kept["settledAt"] = other.get("settledAt") or kept.get("settledAt")
        merged.append(kept)
    return merged


def _load_env() -> None:
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        return
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        cut = line.strip()
        if not cut or cut.startswith("#") or "=" not in cut:
            continue
        name, raw = cut.split("=", 1)
        if name and not os.environ.get(name):
            os.environ[name] = raw.strip().strip('"').strip("'")


def _url() -> str:
    return os.environ.get("SUPABASE_URL", "").strip().rstrip("/")


def _key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def _get(key: str) -> Any:
    rows = _request(f"kv?k=eq.{_quote(key)}&select=v", "GET")
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return rows[0].get("v")
    return None


def _put(key: str, value: Any) -> None:
    _request(
        "kv",
        "POST",
        body={"k": key, "v": value},
        prefer="resolution=merge-duplicates,return=minimal",
    )


def _quote(value: str) -> str:
    return value.replace("/", "%2F")


def _request(path: str, method: str, body: Any = None, prefer: str = "return=representation") -> Any:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        f"{_url()}/rest/v1/{path}",
        data=payload,
        method=method,
        headers={
            "apikey": _key(),
            "Authorization": f"Bearer {_key()}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:180]
        raise RuntimeError(f"Supabase {exc.code}") from RuntimeError(detail)
    except URLError as exc:
        raise RuntimeError("Supabase did not answer") from exc
    return json.loads(text) if text else None
