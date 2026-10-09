"""Free memberships. A signed-in person has a valid membership until payments exist."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from typing import Any

from nfl_bets.store import now_iso, out_dir, read_json, write_json

_LOCK = threading.Lock()
_MONTH = 60 * 60 * 24 * 30


def member_from_cookie(header: str | None) -> dict[str, Any] | None:
    token = _token(header)
    if not token:
        return None
    with _LOCK:
        data = _load()
        session = data["sessions"].get(token)
        if not session or float(session.get("expires") or 0) < time.time():
            return None
        return _find(data, str(session.get("userId") or ""))


def join(name: str, email: str, password: str) -> tuple[dict[str, Any], str]:
    clean_name = " ".join(name.split())
    clean_email = email.strip().lower()
    if len(clean_name) < 2:
        raise ValueError("Enter your name.")
    if "@" not in clean_email or "." not in clean_email.split("@")[-1]:
        raise ValueError("Enter an email.")
    if len(password) < 8:
        raise ValueError("Use at least 8 characters.")
    with _LOCK:
        data = _load()
        if any(str(user.get("email")) == clean_email for user in data["users"]):
            raise ValueError("That email already has a membership.")
        salt = secrets.token_hex(16)
        user = {
            "id": secrets.token_hex(8),
            "name": clean_name,
            "email": clean_email,
            "salt": salt,
            "hash": _hash(password, salt),
            "plan": "free",
            "createdAt": now_iso(),
        }
        data["users"].append(user)
        token = _open_session(data, user["id"])
        _save(data)
        return _public(user), token


def login(email: str, password: str) -> tuple[dict[str, Any], str]:
    clean_email = email.strip().lower()
    with _LOCK:
        data = _load()
        user = next((row for row in data["users"] if str(row.get("email")) == clean_email), None)
        if not user or not hmac.compare_digest(str(user.get("hash")), _hash(password, str(user.get("salt")))):
            raise ValueError("Email or password does not match.")
        token = _open_session(data, str(user["id"]))
        _save(data)
        return _public(user), token


def logout(header: str | None) -> None:
    token = _token(header)
    if not token:
        return
    with _LOCK:
        data = _load()
        data["sessions"].pop(token, None)
        _save(data)


def note(user: dict[str, Any], kind: str, detail: dict[str, Any]) -> None:
    with _LOCK:
        data = _load()
        data["activity"].insert(0, {
            "id": secrets.token_hex(6),
            "userId": user["id"],
            "kind": kind,
            "at": now_iso(),
            "detail": detail,
        })
        data["activity"] = data["activity"][:400]
        _save(data)


def profile(user: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        data = _load()
    rows = [row for row in data["activity"] if row.get("userId") == user.get("id")][:30]
    return {"member": _public(user), "activity": rows}


def _load() -> dict[str, Any]:
    raw = read_json(out_dir() / "members.json", {})
    data = raw if isinstance(raw, dict) else {}
    users = data.get("users") if isinstance(data.get("users"), list) else []
    sessions = data.get("sessions") if isinstance(data.get("sessions"), dict) else {}
    activity = data.get("activity") if isinstance(data.get("activity"), list) else []
    return {"users": users, "sessions": sessions, "activity": activity}


def _save(data: dict[str, Any]) -> None:
    write_json(out_dir() / "members.json", data)


def _public(user: dict[str, Any]) -> dict[str, Any]:
    return {"id": user["id"], "name": user["name"], "email": user["email"], "plan": "free"}


def _find(data: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    return next((row for row in data["users"] if str(row.get("id")) == user_id), None)


def _open_session(data: dict[str, Any], user_id: str) -> str:
    token = secrets.token_hex(24)
    data["sessions"][token] = {"userId": user_id, "expires": time.time() + _MONTH}
    return token


def _hash(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 120_000)
    return digest.hex()


def _token(header: str | None) -> str:
    for part in (header or "").split(";"):
        piece = part.strip()
        if piece.startswith("pod="):
            return piece[4:]
    return ""
