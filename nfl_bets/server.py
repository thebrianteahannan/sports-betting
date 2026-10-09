"""LAN desk for the NFL betting board."""

from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from nfl_bets.deep_dive import build_dive, price_for
from nfl_bets.hedge import size_hedge
from nfl_bets.archive import mark_good, settle_archive
from nfl_bets.picks import save_pick, settle_pick
from nfl_bets.plan import build_plan
from nfl_bets.choose import choose
from nfl_bets.members import join, login, logout, member_from_cookie, note, profile
from nfl_bets.refresh import public_payload, run
from nfl_bets.store import load_board, place_bet, public_bank, reset_bank, settle_bet

_STATIC = Path(__file__).resolve().parent / "static"
_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in {"/", "/index.html"}:
            self._file("index.html")
            return
        if path in {"/app.css", "/app.js", "/choose.js", "/lessons.js", "/swipe.js", "/stars.js", "/filters.js", "/members.js", "/logo.png"}:
            self._file(path.lstrip("/"))
            return
        if path == "/feasibility.pdf":
            self._file("feasibility.pdf")
            return
        if path == "/subscription.pdf":
            self._file("subscription.pdf")
            return
        if path == "/api/me":
            user = self._user()
            if not user:
                self._json({"error": "Sign in."}, 401)
                return
            self._json(profile(user))
            return
        if path == "/api/board":
            if not self._user():
                self._json({"error": "Sign in to open the board."}, 401)
                return
            self._json(public_payload())
            return
        if path == "/api/bank":
            self._json(public_bank())
            return
        if path == "/api/dive":
            game_id = (parse_qs(urlparse(self.path).query).get("id") or [""])[0]
            try:
                self._json(build_dive(game_id))
            except ValueError as exc:
                self._json({"error": str(exc)}, 404)
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            body = self._body()
            if path == "/api/join":
                user, token = join(str(body.get("name") or ""), str(body.get("email") or ""), str(body.get("password") or ""))
                self._json(profile(user), cookie=token)
                return
            if path == "/api/login":
                user, token = login(str(body.get("email") or ""), str(body.get("password") or ""))
                self._json(profile(user), cookie=token)
                return
            if path == "/api/logout":
                logout(self.headers.get("Cookie"))
                self._json({"ok": True}, clear_cookie=True)
                return
            if path == "/api/choose":
                sports = body.get("sports") if isinstance(body.get("sports"), list) else []
                self._json(choose(
                    load_board(),
                    [str(sport) for sport in sports],
                    str(body.get("kind") or "any"),
                    int(body.get("legs") or 3),
                    str(body.get("gameId") or ""),
                ))
                return
            if path == "/api/refresh":
                self._json(public_payload(run()))
                return
            if path == "/api/picks":
                user = self._user()
                if not user:
                    self._json({"error": "Sign in."}, 401)
                    return
                card = str(body.get("card") or "")
                board = load_board()
                saved = save_pick(
                    card,
                    board.get(card) if isinstance(board.get(card), dict) else None,
                    str(body.get("group") or ""),
                )
                note(user, "save", {"card": card, "group": str(body.get("group") or "")})
                self._json(saved)
                return
            if path == "/api/picks/settle":
                self._json(settle_pick(str(body.get("id") or ""), str(body.get("result") or "")))
                return
            if path == "/api/archive/settle":
                self._json(settle_archive(str(body.get("id") or ""), str(body.get("result") or "")))
                return
            if path == "/api/archive/good":
                user = self._user()
                if not user:
                    self._json({"error": "Sign in."}, 401)
                    return
                raw_stars = body.get("stars")
                stars = int(raw_stars) if raw_stars is not None and str(raw_stars) != "" else None
                saved = mark_good(
                    str(body.get("id") or ""),
                    str(body.get("card") or ""),
                    load_board(),
                    str(body.get("group") or ""),
                    stars,
                )
                note(user, "rate", {
                    "stars": 0 if stars is None else stars,
                    "id": str(body.get("id") or ""),
                    "card": str(body.get("card") or ""),
                    "group": str(body.get("group") or ""),
                })
                self._json(saved)
                return
            if path == "/api/hedge":
                self._json(
                    size_hedge(
                        float(body.get("stake") or 0),
                        float(body.get("odds")),
                        float(body.get("hedgeOdds")),
                    )
                )
                return
            if path == "/api/bets":
                self._json(self._place(body))
                return
            if path == "/api/bets/settle":
                saved = settle_bet(str(body.get("id") or ""), str(body.get("result") or ""))
                saved["plan"] = self._plan()
                saved["bank"] = public_bank()
                self._json(saved)
                return
            if path == "/api/bank/reset":
                self._json(public_bank(reset_bank(float(body.get("amount") or 20))))
                return
        except (TypeError, ValueError) as exc:
            self._json({"error": str(exc)}, 400)
            return
        self._json({"error": "not found"}, 404)

    def log_message(self, fmt: str, *args: Any) -> None:
        code = str(args[1]) if len(args) > 1 else ""
        if code not in {"200", "304"}:
            super().log_message(fmt, *args)

    def _place(self, body: dict[str, Any]) -> dict[str, Any]:
        board = load_board()
        game = next(
            (
                row
                for row in board.get("games") or []
                if str(row.get("id")) == str(body.get("gameId") or "")
            ),
            None,
        )
        if not game:
            raise ValueError("game is not on the board")
        market = str(body.get("market") or "")
        side = str(body.get("side") or "")
        quote = price_for(game, market, side)
        if not quote or quote.get("odds") is None:
            raise ValueError("that side has no FanDuel price")
        mode = str(body.get("mode") or "real").lower()
        plan = self._plan()
        stake = round(float(body.get("stake") or 0), 2)
        if mode == "real" and plan.get("action") == "hold":
            why = (plan.get("reasons") or ["Real bets are closed today."])[0]
            raise ValueError(why)
        if mode == "real":
            match = next(
                (
                    ticket
                    for ticket in plan.get("tickets") or []
                    if str(ticket.get("gameId")) == str(game.get("id"))
                    and str(ticket.get("market")) == market
                    and str(ticket.get("side")) == side
                ),
                None,
            )
            if not match:
                raise ValueError("That side is not on today's card. Log it on paper, or skip it.")
            sized = float(match.get("stake") or 0)
            if stake > sized + 0.001:
                raise ValueError(f"This purse sizes that wager at ${sized:.0f}.")
        if mode == "real" and stake > float(plan.get("room") or 0) + 0.001:
            raise ValueError(
                f"${stake:.2f} is over the ${float(plan.get('room') or 0):.2f} left in today's card."
            )
        saved = place_bet(
            {
                "gameId": game["id"],
                "market": market,
                "side": side,
                "odds": quote["odds"],
                "stake": stake,
                "mode": mode,
                "label": quote.get("label") or "Bet",
            }
        )
        saved["plan"] = self._plan()
        saved["bank"] = public_bank()
        return saved

    def _plan(self) -> dict[str, Any]:
        board = load_board()
        return build_plan(
            list(board.get("games") or []),
            public_bank(),
            current_week=board.get("currentWeek"),
        )

    def _user(self) -> dict[str, Any] | None:
        return member_from_cookie(self.headers.get("Cookie"))

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        data = json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(data, dict):
            raise ValueError("body must be an object")
        return data

    def _file(self, name: str) -> None:
        path = _STATIC / name
        if not path.is_file():
            self._json({"error": "missing file"}, 404)
            return
        payload = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", _TYPES.get(path.suffix, "text/plain"))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _json(self, payload: dict[str, Any], code: int = 200, cookie: str = "", clear_cookie: bool = False) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", f"pod={cookie}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000")
        if clear_cookie:
            self.send_header("Set-Cookie", "pod=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def _live_counts() -> None:
    """Grade open props often and publish when a live count changes."""
    from nfl_bets.archive import grade_open
    from nfl_bets.cloud import publish_board

    last = None
    while True:
        try:
            rows = grade_open()
            snap = tuple(
                (row.get("id"), leg.get("label"), leg.get("have"), leg.get("result"))
                for row in rows
                for leg in (row.get("legs") or [])
            )
            if snap != last:
                last = snap
                publish_board(load_board())
        except Exception:  # noqa: BLE001
            pass
        time.sleep(20)


def main() -> None:
    host = os.environ.get("NFL_BETS_BIND") or "0.0.0.0"
    port = int(os.environ.get("NFL_BETS_PORT") or "8793")
    threading.Thread(target=_live_counts, name="live-counts", daemon=True).start()
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"[nfl-bets] desk on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
