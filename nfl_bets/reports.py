"""Member notes about a win, for an admin to accept or skip."""

from __future__ import annotations

import base64
import secrets
import threading
from typing import Any

from nfl_bets.members import is_admin
from nfl_bets.store import now_iso, out_dir, read_json, write_json

_LOCK = threading.Lock()
_CAP = 1_500_000


def submit(user: dict[str, Any], strategy: str, story: str, image: str) -> dict[str, Any]:
    clean_strategy = " ".join(strategy.split())
    clean_story = " ".join(story.split())
    if len(clean_strategy) < 8:
        raise ValueError("Say what you did, in a sentence or two.")
    if len(clean_story) < 8:
        raise ValueError("Say a little about the bet.")
    blob, ext, mime = _image(image)
    report_id = secrets.token_hex(8)
    folder = out_dir() / "reports"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{report_id}.{ext}").write_bytes(blob)
    row = {
        "id": report_id,
        "userId": user["id"],
        "name": user.get("name") or "",
        "strategy": clean_strategy[:400],
        "story": clean_story[:1200],
        "file": f"{report_id}.{ext}",
        "mime": mime,
        "at": now_iso(),
        "decision": "",
    }
    with _LOCK:
        data = _load()
        data["reports"].insert(0, row)
        data["reports"] = data["reports"][:200]
        _save(data)
    return {"report": _public_row(row, True)}


def listing(user: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        rows = _load()["reports"]
    admin = is_admin(user)
    shown = rows if admin else [row for row in rows if row.get("userId") == user.get("id")]
    return {"admin": admin, "reports": [_public_row(row, row.get("userId") == user.get("id")) for row in shown[:40]]}


def decide(user: dict[str, Any], report_id: str, decision: str) -> dict[str, Any]:
    if not is_admin(user):
        raise ValueError("Sign in as an admin.")
    choice = decision if decision in {"use", "skip"} else ""
    if not choice:
        raise ValueError("Choose use or skip.")
    with _LOCK:
        data = _load()
        row = next((item for item in data["reports"] if item.get("id") == report_id), None)
        if not row:
            raise ValueError("That report is not here.")
        row["decision"] = choice
        _save(data)
    return {"report": _public_row(row, row.get("userId") == user.get("id"))}


def shot(user: dict[str, Any], report_id: str) -> tuple[bytes, str]:
    with _LOCK:
        row = next((item for item in _load()["reports"] if item.get("id") == report_id), None)
    if not row:
        raise ValueError("That screenshot is not here.")
    if row.get("userId") != user.get("id") and not is_admin(user):
        raise ValueError("Sign in.")
    path = out_dir() / "reports" / str(row.get("file") or "")
    folder = out_dir() / "reports"
    if not path.is_file() or folder not in path.resolve().parents:
        raise ValueError("That screenshot is not here.")
    return path.read_bytes(), str(row.get("mime") or "image/png")


def _public_row(row: dict[str, Any], mine: bool) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name") or "",
        "strategy": row.get("strategy") or "",
        "story": row.get("story") or "",
        "at": row.get("at") or "",
        "decision": row.get("decision") or "",
        "mine": mine,
    }


def _image(raw: str) -> tuple[bytes, str, str]:
    text = raw.strip()
    if "," in text and text.startswith("data:"):
        text = text.split(",", 1)[1]
    try:
        blob = base64.b64decode(text, validate=False)
    except Exception as exc:
        raise ValueError("That screenshot could not be read.") from exc
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        kind = ("png", "image/png")
    elif blob.startswith(b"\xff\xd8\xff"):
        kind = ("jpg", "image/jpeg")
    elif len(blob) > 12 and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        kind = ("webp", "image/webp")
    else:
        raise ValueError("Use a PNG or JPEG screenshot.")
    if len(blob) > _CAP:
        raise ValueError("That screenshot is too large.")
    return blob, kind[0], kind[1]


def _load() -> dict[str, Any]:
    raw = read_json(out_dir() / "reports.json", {})
    data = raw if isinstance(raw, dict) else {}
    rows = data.get("reports") if isinstance(data.get("reports"), list) else []
    return {"reports": rows}


def _save(data: dict[str, Any]) -> None:
    write_json(out_dir() / "reports.json", data)
