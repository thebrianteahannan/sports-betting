"""Free memberships. A signed-in person has a valid membership until payments exist."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from typing import Any

from nfl_bets.store import now_iso

_LOCK = threading.Lock()
_MONTH = 60 * 60 * 24 * 30
_KEY = "bets/members.json"


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
            "lastLogin": now_iso(),
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
        user["lastLogin"] = now_iso()
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
    from nfl_bets.cloud import _get, configured
    if not configured():
        raise ValueError("Memberships are stored in Supabase.")
    raw = _get(_KEY) or {}
    data = raw if isinstance(raw, dict) else {}
    users = data.get("users") if isinstance(data.get("users"), list) else []
    sessions = data.get("sessions") if isinstance(data.get("sessions"), dict) else {}
    activity = data.get("activity") if isinstance(data.get("activity"), list) else []
    return {"users": users, "sessions": sessions, "activity": activity}


def _save(data: dict[str, Any]) -> None:
    from nfl_bets.cloud import _put, configured
    if not configured():
        raise ValueError("Memberships are stored in Supabase.")
    _put(_KEY, {"users": data["users"], "sessions": data["sessions"], "activity": data["activity"]})


_OWNER = "bthannan@gmail.com"


def is_admin(user: dict[str, Any]) -> bool:
    email = str(user.get("email") or "").strip().lower()
    return email == _OWNER or bool(user.get("admin"))


def set_admin(actor: dict[str, Any], email: str, admin: bool) -> dict[str, Any]:
    if not is_admin(actor):
        raise ValueError("Sign in as an admin.")
    clean = email.strip().lower()
    if clean == _OWNER and not admin:
        raise ValueError("That admin stays.")
    with _LOCK:
        data = _load()
        user = next((row for row in data["users"] if str(row.get("email")) == clean), None)
        if not user:
            raise ValueError("That member is not here.")
        user["admin"] = bool(admin)
        _save(data)
    return roster(actor)


def roster(user: dict[str, Any]) -> dict[str, Any]:
    if not is_admin(user):
        raise ValueError("Sign in as an admin.")
    with _LOCK:
        data = _load()
    rows = [_member_row(row) for row in data["users"]]
    rows.sort(key=lambda row: str(row.get("lastLogin") or ""), reverse=True)
    return {"users": rows}


def _member_row(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": user.get("name") or "",
        "email": user.get("email") or "",
        "plan": user.get("plan") or "free",
        "admin": is_admin(user),
        "lastLogin": user.get("lastLogin") or "",
        "createdAt": user.get("createdAt") or "",
    }


def _public(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "plan": "free",
        "admin": is_admin(user),
    }


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
