"""How an NBA game should play out, and the bet each script sets up.

The spread is the center. In 2025-26, 37% of NBA games ended 15 or more
apart and the average margin was 13.3, which fits final margins landing
around the spread with about 15 points of scatter. Each player's minutes
and stats in his own close games and blowouts say who plays the fourth
either way. A blowout costs the regulars on both sides about 4 minutes,
and those minutes go to the bench.
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from math import erf, sqrt
from time import time
from typing import Any

from nfl_bets import sixth
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.store import out_dir, read_json, write_json
from nfl_bets.sway import _nick

_CACHE = "nba_script.json"
_TTL = 6 * 3600
_SCATTER = 15.0
_BLOW = 15
_CLOSE = 5
_GAIN = 3
_FEW = 3


def script(game: dict[str, Any]) -> dict[str, Any]:
    away, home = str(game.get("away") or ""), str(game.get("home") or "")
    if not away or not home:
        return {}
    spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
    try:
        home_line = float(spread.get("homeLine"))
    except (TypeError, ValueError):
        home_line = 0.0
    fav, dog, lead = (home, away, -home_line) if home_line <= 0 else (away, home, home_line)
    blow, close = _chances(lead)
    cache = _load()
    with ThreadPoolExecutor(max_workers=2) as pool:
        sides = dict(zip((fav, dog), pool.map(_side, (fav, dog))))
    _save(cache)
    props = [row for row in game.get("props") or [] if isinstance(row, dict)]
    head = f"{_team(fav)} by {_num(lead)}." if lead >= 0.5 else "No favorite."
    summary = f"{head} {_pct(close)} of games at this spread finish within {_CLOSE}. {_pct(blow)} get away by {_BLOW}."
    parts = []
    stars = [line for team in (fav, dog) if (line := _star(sides[team], props, blow))]
    if stars:
        parts.append({"title": "If it stays close", "text": " ".join(row[0] for row in stars), "proof": "\n".join(row[1] for row in stars if row[1])})
    bench = [line for team in (fav, dog) if (line := _bench(sides[team], props, blow))]
    if bench:
        parts.append({"title": "If it gets away", "text": " ".join(row[0] for row in bench), "proof": "\n".join(row[1] for row in bench)})
    return {"summary": summary, "parts": parts, "blow": round(blow, 3), "close": round(close, 3)}


def _chances(lead: float) -> tuple[float, float]:
    cut, near = _BLOW - 0.5, _CLOSE + 0.5
    blow = 1 - _cdf((cut - lead) / _SCATTER) + _cdf((-cut - lead) / _SCATTER)
    close = _cdf((near - lead) / _SCATTER) - _cdf((-near - lead) / _SCATTER)
    return blow, close


def _cdf(x: float) -> float:
    return 0.5 * (1 + erf(x / sqrt(2)))


def _side(team: str) -> list[dict[str, Any]]:
    pairs = sixth._pairs(sixth._abbr(team))
    starters = {starter for _backup, starter in pairs}
    names = list(dict.fromkeys([starter for _backup, starter in pairs] + [backup for backup, _starter in pairs]))
    with ThreadPoolExecutor(max_workers=6) as pool:
        logs = dict(zip(names, pool.map(sixth._log, names)))
    rows = []
    for name in names:
        games = logs.get(name) or []
        blow = [row for row in games if row["margin"] >= _BLOW]
        close = [row for row in games if row["margin"] < _BLOW]
        if len(blow) < _FEW or len(close) < _FEW:
            continue
        rows.append({"name": name, "starter": name in starters, "blow": blow, "close": close, "bmin": sixth._mean(blow, "min"), "cmin": sixth._mean(close, "min"), "bpts": sixth._mean(blow, "pts"), "cpts": sixth._mean(close, "pts")})
    return rows


def _star(rows: list[dict[str, Any]], props: list[dict[str, Any]], blow: float) -> tuple[str, str] | None:
    starters = [row for row in rows if row["starter"] and row["cmin"] - row["bmin"] >= _GAIN]
    if not starters:
        return None
    row = max(starters, key=lambda one: one["cmin"])
    text = f"{row['name']} plays {row['cmin']:.0f} minutes and scores {row['cpts']:.0f} when his game stays inside {_BLOW}, {row['bmin']:.0f} and {row['bpts']:.0f} when it gets away."
    main = [bet for bet in _bets(row, props, blow) if bet["kind"][0] == "pts" and re.search(r"\bover\b", bet["text"], re.I)]
    best = min(main, key=lambda bet: abs(bet["odds"] + 110)) if main else None
    return text, _proof(best) if best else ""


def _bench(rows: list[dict[str, Any]], props: list[dict[str, Any]], blow: float) -> tuple[str, str] | None:
    gainers = sorted((row for row in rows if not row["starter"] and row["bmin"] - row["cmin"] >= _GAIN), key=lambda one: one["bmin"] - one["cmin"], reverse=True)
    for row in gainers:
        bets = [bet for bet in _bets(row, props, blow) if bet["bhit"] * 2 >= len(row["blow"])]
        if not bets:
            continue
        best = max(bets, key=lambda bet: bet["chance"] - implied_prob(bet["odds"]))
        text = f"{row['name']} plays {row['bmin']:.0f} minutes when his game gets away by {_BLOW} and {row['cmin']:.0f} when it does not."
        return text, _proof(best)
    return None


def _bets(row: dict[str, Any], props: list[dict[str, Any]], blow: float) -> list[dict[str, Any]]:
    name, found = row["name"].casefold(), []
    for prop in props:
        label, market = str(prop.get("label") or ""), str(prop.get("market") or "")
        if not (label.casefold().startswith(name) or market.casefold().startswith(name)):
            continue
        text = f"{market} {label}"
        kind, bar = sixth._kind(text), sixth._bar(text)
        try:
            odds = int(prop.get("odds"))
        except (TypeError, ValueError):
            continue
        if not kind or bar is None:
            continue
        bhit = sum(1 for game in row["blow"] if sixth._made(sixth._total(game, kind), bar, text))
        chit = sum(1 for game in row["close"] if sixth._made(sixth._total(game, kind), bar, text))
        shown = label if re.search(r"\d", label) else f"{label} {market}"
        bn, cn = len(row["blow"]), len(row["close"])
        found.append({"label": shown, "text": text, "kind": kind, "odds": odds, "bhit": bhit, "chit": chit, "bn": bn, "cn": cn, "chance": bhit / bn * blow + chit / cn * (1 - blow)})
    return found


def _proof(bet: dict[str, Any]) -> str:
    chance, need, odds = bet["chance"], implied_prob(bet["odds"]), bet["odds"]
    price = f"+{odds}" if odds > 0 else str(odds)
    won = 5 * (american_decimal(odds) - 1)
    return f"{bet['label']}, {price}: {bet['bhit']} of {bet['bn']} blowouts and {bet['chit']} of {bet['cn']} other games. At this spread that is {chance * 100:.0f}%. {price} needs {need * 100:.1f}%. $5 wins ${won:.2f}."


def _team(name: str) -> str:
    return _nick(name)


def _num(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def _pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def _load() -> dict[str, Any]:
    data = read_json(out_dir() / _CACHE, {})
    if not isinstance(data, dict) or time() - float(data.get("at") or 0) > _TTL:
        data = {"at": time()}
    sixth._pairs.cache.update({key: [tuple(pair) for pair in value] for key, value in (data.get("pairs") or {}).items()})
    sixth._log.cache.update(data.get("logs") or {})
    if data.get("clubs"):
        sixth._clubs.cache = data["clubs"]
    return data


def _save(cache: dict[str, Any]) -> None:
    write_json(out_dir() / _CACHE, {"at": cache.get("at") or time(), "pairs": sixth._pairs.cache, "logs": sixth._log.cache, "clubs": sixth._clubs.cache})


def main() -> None:
    try:
        raw = json.load(sys.stdin)
    except (ValueError, TypeError):
        raw = {}
    print(json.dumps(script(raw if isinstance(raw, dict) else {})))


if __name__ == "__main__":
    main()
