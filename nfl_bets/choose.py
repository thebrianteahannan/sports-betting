"""A parlay built from the leagues, prop, and leg count the user picked."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, time
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _catches_to_yards, _from_decimal, _legs, _who
from nfl_bets.hedge import american_decimal, implied_prob

_ET = ZoneInfo("America/New_York")
_SPORTS = ("NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA")
_KINDS = {
    "yards": ("yard", "yd"),
    "points": ("point",),
    "assists": ("assist",),
    "shots": ("shot",),
    "strikeouts": ("strikeout",),
}
_SKIP = (
    "spread", "moneyline", "puck line", "puckline", "run line", "handicap",
    "total", "alternate total", "alt total",
)


def offer_legs(game: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    props = game.get("props")
    if isinstance(props, list) and props:
        return [leg for leg in props if isinstance(leg, dict)], bool(game.get("live"))
    return _legs(str(game.get("id") or ""))


def choose(board: dict[str, Any], sports: list[str], kind: str, count: int, game_id: str = "", when: str = "today") -> dict[str, Any]:
    picked = [sport for sport in _SPORTS if sport in sports]
    count = min(4, max(2, int(count or 3)))
    kind = kind if kind in _KINDS else "any"
    span = "week" if when == "week" else "today"
    games = _slate(list(board.get("games") or []), picked, game_id, span)
    if not games:
        if span == "week":
            return _empty("No game in those leagues is left this week.")
        return _empty("No game in those leagues is on today.")
    pools = []
    for game in games:
        try:
            legs, live = offer_legs(game)
        except Exception as exc:  # noqa: BLE001
            return _empty(f"FanDuel did not answer for {game.get('match')}: {exc}")
        kept = [leg for leg in legs if _fits(leg, kind)]
        if kind in {"any", "yards"}:
            kept = _catches_to_yards(legs, kept)
        kept.sort(key=lambda leg: leg["odds"])
        pools.append((game, kept, live))
    combo = _take(pools, count)
    if len(combo) < count:
        return _empty(_miss(pools, picked, count, span))
    return _card(combo, picked, kind, count)


def _slate(games: list[dict[str, Any]], sports: list[str], game_id: str, span: str) -> list[dict[str, Any]]:
    if game_id:
        return [game for game in games if str(game.get("id") or "") == game_id][:1]
    now = datetime.now(_ET)
    start, end = _bounds(span, now)
    chosen: list[dict[str, Any]] = []
    for sport in sports:
        rows = []
        for game in games:
            if str(game.get("sport") or "") != sport:
                continue
            stamp = _parse(str(game.get("kickoff") or ""))
            if stamp is None or stamp < start or stamp > end:
                continue
            rows.append((stamp, game))
        rows.sort(key=lambda item: item[0])
        chosen.extend(game for _, game in rows[:16])
    return chosen


def _bounds(span: str, now: datetime) -> tuple[datetime, datetime]:
    start = now - timedelta(hours=3)
    if span == "week":
        horizon = (now + timedelta(days=14)).date()
        return start, datetime.combine(horizon, time(23, 59), _ET)
    end = datetime.combine(now.date(), time(23, 59), _ET)
    return start, end


def _fits(leg: dict[str, Any], kind: str) -> bool:
    text = f"{leg.get('market') or ''} {leg.get('runner') or ''} {leg.get('label') or ''}".lower()
    runner = str(leg.get("runner") or "").strip().lower()
    if any(skip in text for skip in _SKIP) or runner in {"yes", "no"} or runner.endswith((" over", " under")):
        return False
    if "?" in text or "combine" in text or "either" in text:
        return False
    if not re.search(r"\d", text) and "to record a hit" not in text and "to score" not in text:
        return False
    if not _who(leg) or _who(leg) in {"over", "under"}:
        return False
    if kind == "any":
        return True
    return any(word in text for word in _KINDS[kind])


def _take(pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]], count: int) -> list[tuple[dict, dict, bool]]:
    flat = [(leg, game, live) for game, legs, live in pools for leg in legs]
    flat.sort(key=lambda item: item[0]["odds"])
    picked: list[tuple[dict, dict, bool]] = []
    players: set[str] = set()
    used_games: set[str] = set()
    for leg, game, live in flat:
        player = _who(leg)
        game_id = str(game.get("id") or "")
        if not player or player in players or game_id in used_games:
            continue
        picked.append((leg, game, live))
        players.add(player)
        used_games.add(game_id)
        if len(picked) == count:
            return picked
    for leg, game, live in flat:
        player = _who(leg)
        if not player or player in players:
            continue
        picked.append((leg, game, live))
        players.add(player)
        if len(picked) == count:
            return picked
    return picked


def _card(combo: list[tuple[dict, dict, bool]], sports: list[str], kind: str, count: int) -> dict[str, Any]:
    decimal = 1.0
    for leg, _, _ in combo:
        decimal *= american_decimal(leg["odds"])
    american = _from_decimal(decimal)
    chance = round(implied_prob(american) * 100, 1) if american is not None else None
    profit = round(5 * (decimal - 1.0), 2)
    games = {str(game.get("id") or ""): game for _, game, _ in combo}
    one = len(games) == 1
    title_game = _place(next(iter(games.values()))) if one else ", ".join(sports)
    kind_name = "player props" if kind == "any" else kind
    legs = []
    for leg, game, _ in combo:
        label = _shown(leg)
        if not one:
            label = f"{label} — {game.get('sport')}, {_place(game)}, {_clock(game)}"
        legs.append({
            "market": leg.get("market") or "",
            "runner": leg.get("runner") or "",
            "label": label,
            "odds": leg.get("odds"),
            "kickoff": game.get("kickoff") or "",
            "pct": f"{implied_prob(leg['odds']) * 100:.1f}%",
        })
    return {
        "title": f"Safest {count}-leg",
        "game": title_game,
        "kind": kind_name,
        "american": american,
        "impliedPct": chance,
        "profit": profit,
        "live": any(live for _, _, live in combo),
        "copy": (
            f"The shortest FanDuel prices in {kind_name} that fit "
            f"{', '.join(sports)}. The parlay is about {chance}%. "
            f"A $5 bet would win ${profit:.2f}."
        ),
        "note": (
            "These legs are in one game, so FanDuel's same-game button can charge a different number."
            if one else
            "These legs are in different games, so this is a regular parlay."
        ),
        "legs": legs,
    }


def _shown(leg: dict[str, Any]) -> str:
    market = str(leg.get("market") or "")
    label = str(leg.get("label") or "")
    if "to record a hit" in market.lower() and not re.search(r"\d", label):
        return f"{leg.get('runner') or label} 1+ hits"
    return label


def _miss(pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]], sports: list[str], count: int, span: str) -> str:
    ready = [(game, legs) for game, legs, _ in pools if legs]
    names = {_who(leg) for _, legs in ready for leg in legs}
    names.discard("")
    league = ", ".join(sports)
    when = "today" if span != "week" else "in this window"
    if not ready:
        return f"FanDuel has not posted player props for the {league} games {when}."
    places = " and ".join(_place(game) for game, _ in ready[:3])
    if len(ready) > 3:
        places += f" and {len(ready) - 3} more"
    noun = "player" if len(names) == 1 else "players"
    if len(pools) == 1:
        return (
            f"The only {league} game {when} is {places}. "
            f"FanDuel has player props for {len(names)} {noun} in that game, "
            f"so a {count}-leg parlay does not fit yet."
        )
    return (
        f"FanDuel has player props for {len(names)} {noun} across {places}, "
        f"so a {count}-leg parlay does not fit yet."
    )


def _empty(copy: str) -> dict[str, Any]:
    return {"title": "Safest parlay", "game": "", "copy": copy, "legs": [], "note": ""}


def _clock(game: dict[str, Any]) -> str:
    stamp = _parse(str(game.get("kickoff") or ""))
    if stamp is None:
        return ""
    local = stamp.astimezone(_ET)
    hour = local.strftime("%I").lstrip("0") or "12"
    return f"{local.strftime('%a %b')} {local.day}, {hour}:{local.strftime('%M %p')} ET"


def _place(game: dict[str, Any]) -> str:
    match = str(game.get("match") or "")
    if " @ " in match:
        away, home = match.split(" @ ", 1)
        return f"{away.strip()} at {home.strip()}"
    return match


def _parse(raw: str) -> datetime | None:
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
