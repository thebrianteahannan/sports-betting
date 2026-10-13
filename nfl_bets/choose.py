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
    "hits": ("to record a hit", "to hit"),
}
_SKIP = (
    "spread", "moneyline", "money line", "puck line", "puckline", "run line", "handicap",
    "total", "alternate total", "alt total", "team to score", "first pitch", "pitch result", "kicking",
)


def offer_legs(game: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    props = game.get("props")
    if isinstance(props, list) and props:
        return [leg for leg in props if isinstance(leg, dict)], bool(game.get("live"))
    return _legs(str(game.get("id") or ""))


_AIM = {"safe": -200, "good": -100}
_AIMS = {"top", "safe", "good", "payout"}


def choose(board: dict[str, Any], sports: list[str], kind: str, count: int, game_ids: list[str] | str | None = None, when: str = "today", aim: str = "safe", skip: list[str] | None = None) -> dict[str, Any]:
    named = [sport for sport in _SPORTS if sport in sports]
    picked = named or list(_SPORTS)
    ids = _ids(game_ids)
    count = min(10, max(2, int(count or 3)))
    kind = kind if kind in _KINDS else "any"
    aim = aim if aim in _AIMS else "top"
    span = "week" if when == "week" else "today"
    games = _slate(list(board.get("games") or []), picked, ids, span)
    if not games:
        if span == "week":
            return _empty("No game is left this week." if not named else f"No game in {', '.join(named)} is left this week.", aim)
        return _empty("No game is on today." if not named else f"No game in {', '.join(named)} is on today.", aim)
    pools, trouble = _gather(games[:30], kind)
    if trouble and not pools:
        return _empty(trouble, aim)
    combo, only, again = _pick(pools, count, aim, {str(item) for item in (skip or []) if item})
    if len(combo) < count:
        return _empty(_miss(pools, picked, count, span), aim)
    return _card(combo, picked, kind, count, aim, only, again)


def _ids(game_ids: list[str] | str | None) -> list[str]:
    if isinstance(game_ids, str):
        return [game_ids] if game_ids else []
    return [str(item) for item in (game_ids or []) if str(item or "")]


def _slate(games: list[dict[str, Any]], sports: list[str], game_ids: list[str], span: str) -> list[dict[str, Any]]:
    now = datetime.now(_ET)
    start, end = _bounds(span, now)
    wanted = set(game_ids)
    buckets: dict[str, list[tuple[datetime, dict[str, Any]]]] = {sport: [] for sport in sports}
    for game in games:
        sport = str(game.get("sport") or "")
        if sport not in buckets:
            continue
        if wanted and str(game.get("id") or "") not in wanted:
            continue
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is None or stamp < start or stamp > end:
            continue
        buckets[sport].append((stamp, game))
    for rows in buckets.values():
        rows.sort(key=lambda item: item[0])
    ordered: list[dict[str, Any]] = []
    while any(buckets.values()):
        for sport in sports:
            rows = buckets[sport]
            if rows:
                ordered.append(rows.pop(0)[1])
    return ordered


def _gather(games: list[dict[str, Any]], kind: str) -> tuple[list[tuple[dict[str, Any], list[dict[str, Any]], bool]], str]:
    from concurrent.futures import ThreadPoolExecutor

    pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]] = []
    trouble = ""
    with ThreadPoolExecutor(max_workers=6) as pool:
        for game, legs, live, err in pool.map(_one, games):
            if err and not trouble:
                trouble = err
            kept = [leg for leg in legs if _fits(leg, kind) and not _team_leg(leg, game)]
            if kind in {"any", "yards"}:
                kept = _catches_to_yards(legs, kept)
            kept.sort(key=lambda leg: leg["odds"])
            if kept:
                pools.append((game, kept, live))
    return pools, trouble


def _one(game: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], bool, str]:
    try:
        legs, live = offer_legs(game)
    except Exception as exc:  # noqa: BLE001
        return game, [], False, f"FanDuel did not answer for {game.get('match')}: {exc}"
    return game, legs, live, ""


def _bounds(span: str, now: datetime) -> tuple[datetime, datetime]:
    start = now - timedelta(hours=3)
    if span == "week":
        horizon = (now + timedelta(days=14)).date()
        return start, datetime.combine(horizon, time(23, 59), _ET)
    end = datetime.combine(now.date(), time(23, 59), _ET)
    return start, end


def _team_leg(leg: dict[str, Any], game: dict[str, Any]) -> bool:
    blob = f"{leg.get('runner') or ''} {leg.get('label') or ''}".lower()
    teams = [part.split("(")[0].strip().lower() for part in str(game.get("match") or "").split(" @ ")]
    return any(team and team in blob for team in teams)


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


def _pick(pools: list[tuple[dict[str, Any], list[dict[str, Any]], bool]], count: int, aim: str, skip: set[str]) -> tuple[list[tuple[dict, dict, bool]], bool, bool]:
    width = 1 if count >= 8 else 2 if count >= 5 else 4
    menus = []
    for game, legs, live in pools:
        rows = _spaced([(leg, game, live) for leg in legs], width, aim)
        if rows:
            menus.append(rows)
    ranked = [combo for _, combo in _search(menus[:14], count, aim, True) if len(combo) >= count]
    if not ranked:
        flat = [[row] for menu in menus for row in menu]
        ranked = [combo for _, combo in _search(flat[:18 if count >= 8 else 24], count, aim, False) if len(combo) >= count]
    if aim == "top" and ranked:
        return ranked[0], len(ranked) == 1, False
    window = _window(ranked, aim)
    fresh = [combo for combo in window if _mark(combo) not in skip]
    if fresh:
        return fresh[0], len(window) == 1, False
    if window:
        return window[0], len(window) == 1, len(window) > 1
    return [], True, False


def _spaced(rows: list[tuple[dict, dict, bool]], width: int, aim: str) -> list[tuple[dict, dict, bool]]:
    rows = sorted(rows, key=lambda item: item[0]["odds"])
    if not rows:
        return []
    if width <= 1:
        spots = {len(rows) - 1} if aim == "payout" else {0}
    elif len(rows) <= width:
        spots = set(range(len(rows)))
    else:
        spots = {round(index * (len(rows) - 1) / (width - 1)) for index in range(width)}
    kept: list[tuple[dict, dict, bool]] = []
    seen: set[str] = set()
    for index in sorted(spots):
        leg, game, live = rows[index]
        player = _who(leg)
        if not player or player in seen:
            continue
        seen.add(player)
        kept.append((leg, game, live))
    return kept


def _search(menus: list[list[tuple[dict, dict, bool]]], count: int, aim: str, split: bool) -> list[tuple[float, list[tuple[dict, dict, bool]]]]:
    found: list[tuple[float, list[tuple[dict, dict, bool]], str]] = []

    def walk(start: int, need: int, decimal: float, players: set[str], games: set[str], combo: list[tuple[dict, dict, bool]]) -> None:
        if need == 0:
            _keep(found, _score(decimal, aim), combo)
            return
        if len(menus) - start < need:
            return
        for index in range(start, len(menus) - need + 1):
            for leg, game, live in menus[index]:
                player = _who(leg)
                game_id = str(game.get("id") or "")
                if not player or player in players or (split and game_id in games):
                    continue
                players.add(player)
                combo.append((leg, game, live))
                if split:
                    games.add(game_id)
                walk(index + 1, need - 1, decimal * american_decimal(leg["odds"]), players, games, combo)
                combo.pop()
                players.remove(player)
                if split:
                    games.remove(game_id)

    walk(0, count, 1.0, set(), set(), [])
    return [(score, combo) for score, combo, _ in found]


def _keep(found: list[tuple[float, list[tuple[dict, dict, bool]], str]], score: float, combo: list[tuple[dict, dict, bool]]) -> None:
    mark = _mark(combo)
    for index, (old, _, prior) in enumerate(found):
        if prior == mark:
            if score < old:
                found[index] = (score, list(combo), mark)
                found.sort(key=lambda item: item[0])
            return
    found.append((score, list(combo), mark))
    found.sort(key=lambda item: item[0])
    del found[8:]


def _mark(combo: list[tuple[dict, dict, bool]]) -> str:
    return "|".join(sorted(_who(leg) for leg, _, _ in combo))


def _window(ranked: list[list[tuple[dict, dict, bool]]], aim: str) -> list[list[tuple[dict, dict, bool]]]:
    if not ranked:
        return []
    scored = [(_score(_decimal(combo), aim), combo) for combo in ranked]
    best = scored[0][0]
    if aim == "payout":
        return [combo for score, combo in scored if score <= best * 0.85]
    return [combo for score, combo in scored if score <= best + 0.4]


def _decimal(combo: list[tuple[dict, dict, bool]]) -> float:
    decimal = 1.0
    for leg, _, _ in combo:
        decimal *= american_decimal(leg["odds"])
    return decimal


def _signed(american: int | None) -> str:
    if american is None:
        return ""
    return f"+{american}" if american > 0 else str(american)


def _score(decimal: float, aim: str) -> float:
    if aim == "payout":
        return -decimal
    if aim == "top":
        return decimal
    goal = american_decimal(_AIM[aim])
    short = 10 if aim == "good" and decimal < goal else 0
    return abs(decimal - goal) + short


def _card(combo: list[tuple[dict, dict, bool]], sports: list[str], kind: str, count: int, aim: str, only: bool = False, again: bool = False) -> dict[str, Any]:
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
            "gameId": str(game.get("id") or ""),
            "sport": game.get("sport") or "",
            "pct": f"{implied_prob(leg['odds']) * 100:.1f}%",
        })
    name = {"top": "Safest", "safe": "Safe", "good": "Good", "payout": "Best payout"}[aim]
    aimed = {
        "top": "This is the safest price from these props.",
        "safe": "Aimed at -200, so a $5 bet wins about $2.50.",
        "good": "Aimed at -100, so a $5 bet wins $5.",
        "payout": "The longest price from these props, so the payout is the largest.",
    }[aim]
    from nfl_bets.sway import annotate

    annotate(legs, list(games.values()))
    return {
        "title": f"{name} {count}-leg",
        "game": title_game,
        "kind": kind_name,
        "american": american,
        "impliedPct": chance,
        "profit": profit,
        "live": any(live for _, _, live in combo),
        "copy": (
            f"{aimed} {kind_name.capitalize()} that fit {', '.join(sports)}. "
            f"The parlay is {_signed(american)}, about {chance}%. "
            f"A $5 bet would win ${profit:.2f}."
        ),
        "note": (
            ("These legs are in one game, so FanDuel's same-game button can charge a different number."
            if one else
            "These legs are in different games, so this is a regular parlay.")
            + (" This is the only bet that fits, so it keeps showing up." if only else "")
        ),
        "players": [_who(leg) for leg, _, _ in combo],
        "only": only,
        "again": again,
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


def _empty(copy: str, aim: str = "safe") -> dict[str, Any]:
    name = {"top": "Safest parlay", "safe": "Safe parlay", "good": "Good parlay", "payout": "Best payout"}[aim]
    return {"title": name, "game": "", "copy": copy, "legs": [], "note": ""}


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
