"""Four legs near an 85% price, each from a different sport."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _catches_to_yards, _from_decimal, _label, _legs, _size
from nfl_bets.hedge import american_decimal, implied_prob

_ET = ZoneInfo("America/New_York")
_TARGET = 0.85
_STAKE = 5.0
_SKIP_MARKET = (
    "moneyline", "spread", "handicap", "puck line", "run line",
    "total points", "total runs", "total goals", "alt total", "alternate total",
    "alternate puck", "alternate run", "alternate handicap",
    "period", "minute", "drive 1", "regular season", "playoff",
    "home run", "no-hitter", "winner",
)


def build_cross_four(games: list[dict]) -> dict | None:
    combo = _combo(games)
    if len(combo) < 4:
        return None
    decimal = 1.0
    for leg in combo:
        decimal *= american_decimal(leg["odds"])
    american = _from_decimal(decimal)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    profit = round(_STAKE * (decimal - 1.0), 2)
    sports = ", ".join(leg["sport"] for leg in combo)
    return {
        "gameId": "",
        "game": sports,
        "title": "Four yardage legs near 85% each",
        "goal": (
            "Going for four legs, each priced near an 85% chance, from different sports. "
            "Small lines only. Touchdowns and receptions of 4.5 or more stay off. "
            "Four prices near 85% multiply to about a coin flip, not an 85% parlay."
        ),
        "american": american,
        "impliedPct": chance,
        "stake": _STAKE,
        "profit": profit,
        "copy": (
            f"Four small player lines, one from each of {sports}, multiply to {american}. "
            f"That parlay is about a {chance}% price. "
            f"A ${_STAKE:.0f} bet would win ${profit:.2f}."
        ),
        "live": any(bool(leg.get("live")) for leg in combo),
        "note": _note(combo),
        "legs": [
            {
                "market": leg["market"],
                "runner": leg["runner"],
                "label": leg["label"],
                "odds": leg["odds"],
                "kickoff": leg.get("kickoff") or "",
                "pct": f"{implied_prob(leg['odds']) * 100:.1f}%",
            }
            for leg in combo
        ],
    }


def _combo(games: list[dict]) -> list[dict]:
    grouped = _soon(games)
    found: dict[str, dict] = {}
    fetches = 0
    for sport in sorted(grouped, key=lambda name: str(grouped[name][0].get("kickoff") or "")):
        best: dict | None = None
        for game in grouped.get(sport, [])[:3]:
            if fetches >= 18:
                break
            fetches += 1
            try:
                leg = _best(game)
            except Exception:  # noqa: BLE001
                leg = None
            if leg and (best is None or _rank(leg) < _rank(best)):
                best = leg
        if best:
            found[sport] = best
    ranked = sorted(found.values(), key=_rank)
    return ranked[:4]


def _soon(games: list[dict]) -> dict[str, list[dict]]:
    now = datetime.now(timezone.utc)
    grouped: dict[str, list[dict]] = {}
    for game in games:
        sport = str(game.get("sport") or "")
        if not sport:
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < now - timedelta(hours=2) or stamp > now + timedelta(hours=72):
            continue
        grouped.setdefault(sport, []).append(game)
    for rows in grouped.values():
        rows.sort(key=lambda game: str(game.get("kickoff") or ""))
    return grouped


def _best(game: dict) -> dict | None:
    rows = _candidates(game)
    pool = [leg for leg in rows if abs(implied_prob(leg["odds"]) - _TARGET) <= 0.03]
    if not pool:
        pool = [leg for leg in rows if abs(implied_prob(leg["odds"]) - _TARGET) <= 0.05]
    pool = _catches_to_yards(rows, pool)
    if not pool:
        return None
    pool.sort(key=lambda leg: (abs(implied_prob(leg["odds"]) - _TARGET), _size(leg)))
    return pool[0]


def _candidates(game: dict) -> list[dict]:
    try:
        legs, live = _legs(str(game.get("id") or ""))
    except Exception:
        return []
    rows = []
    for leg in legs:
        name = str(leg.get("market") or "")
        odds = leg.get("odds")
        if not _player_market(name) or odds is None or odds < -900 or odds > -400:
            continue
        runner_name = str(leg.get("runner") or "").strip()
        if _scary(name, runner_name):
            continue
        pretty = _pretty(name, runner_name)
        rows.append({
            "sport": game.get("sport") or "",
            "gameId": str(game.get("id") or ""),
            "kickoff": game.get("kickoff") or "",
            "market": name,
            "runner": runner_name,
            "label": f"{pretty} — {game.get('sport')}, {_when(game)}",
            "odds": odds,
            "live": live,
        })
    return rows


def _note(combo: list[dict]) -> str:
    text = (
        "FanDuel's button can still show a different number."
    )
    if any(leg.get("sport") == "NCAAF" for leg in combo):
        text += (
            " The college leg is a FanDuel New Jersey price. "
            "FanDuel Pennsylvania lists the game and no player props."
        )
    return text


def _rank(leg: dict) -> tuple[float, float]:
    return (abs(implied_prob(leg["odds"]) - _TARGET), _size(leg))


def _player_market(name: str) -> bool:
    low = name.lower()
    if any(token in low for token in _SKIP_MARKET):
        return False
    if " - " in name and "alternate" not in name.split(" - ", 1)[0].lower():
        return True
    return low.startswith("to ") or low.startswith("player to")


def _scary(market: str, runner: str) -> bool:
    text = f"{market} {runner}".lower()
    if "reception" in text:
        match = re.search(r"(\d+(?:\.\d+)?)", runner)
        return bool(match) and float(match.group(1)) >= 4.5
    return False


def _pretty(market: str, runner: str) -> str:
    if " - " in market:
        return _label(market, runner)
    text = re.sub(r"^(Player to Record|To Record|To Score|To)\s+", "", market, count=1, flags=re.I)
    return f"{runner} {text.lower()}".strip()


def _when(game: dict) -> str:
    stamp = _parse(str(game.get("kickoff") or ""))
    match = str(game.get("match") or "")
    if stamp is None:
        return match
    local = stamp.astimezone(_ET)
    hour = local.strftime("%I").lstrip("0") or "12"
    return f"{match}, {local:%a} {hour}:{local:%M %p} ET"


def _parse(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp
