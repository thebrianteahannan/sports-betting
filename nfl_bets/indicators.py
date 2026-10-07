"""Flags for a FanDuel number that disagrees with its open, its prices, or the news."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from nfl_bets.espn_context import matching_articles
from nfl_bets.hedge import no_vig
from nfl_bets.teams import nick

_SIGMA = 13.5
_FOOTBALL = {"NFL", "NCAAF", "CFL", "Football"}
_INJURY_WORDS = (
    "out",
    "injured",
    "injury",
    "doubtful",
    "questionable",
    "ruled out",
    "inactive",
    "concussion",
    "sidelined",
    "torn",
    "surgery",
)


def score_flags(flags: list[dict[str, Any]]) -> int:
    weight = {"steam": 5, "look": 3, "watch": 1}
    return sum(weight.get(str(flag.get("severity")), 1) for flag in flags)


def build_flags(
    game: dict[str, Any],
    snaps: list[dict[str, Any]],
    articles: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    spread = game.get("spread") or {}
    total = game.get("total") or {}
    money = game.get("moneyline") or {}
    open_snap = snaps[0] if snaps else {}

    away_line = _num(spread.get("awayLine"))
    open_line = _num(open_snap.get("spreadAway"))
    if away_line is not None and open_line is not None and away_line != open_line:
        flags.extend(_line_move(game, open_line, away_line))

    open_total = _num(open_snap.get("total"))
    now_total = _num(total.get("line"))
    if open_total is not None and now_total is not None and open_total != now_total:
        flags.append(_total_move(open_total, now_total))

    flags.extend(_price_flags(game, spread))
    if _football(game):
        flags.extend(_spread_vs_moneyline(game, spread, money))
    flags.extend(_news_flags(game, articles, snaps, away_line, open_line))

    rank = {"steam": 3, "look": 2, "watch": 1}
    flags.sort(key=lambda flag: rank.get(str(flag.get("severity")), 0), reverse=True)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for flag in flags:
        code = str(flag.get("code") or "")
        if code in seen:
            continue
        seen.add(code)
        unique.append(flag)
    return unique


def _line_move(
    game: dict[str, Any],
    open_line: float,
    now_line: float,
) -> list[dict[str, Any]]:
    delta = now_line - open_line
    side = "away" if delta < 0 else "home"
    team = nick(game["away"] if side == "away" else game["home"])
    crossed = _crossed_keys(open_line, now_line)
    flags: list[dict[str, Any]] = []
    if crossed and _football(game):
        nums = ", ".join(str(int(abs(n))) for n in crossed)
        dog = "home" if now_line < 0 else "away"
        flags.append(
            _flag(
                "KEY_NUMBER",
                "look",
                "Crossed a key number",
                (
                    f"FanDuel moved {nick(game['away'])} from {_spread(open_line)} "
                    f"to {_spread(now_line)}. That crosses {nums}. A field goal or a "
                    "touchdown used to push or win, and now it does not."
                ),
                market="spread",
                side=dog,
            )
        )
    size = abs(delta)
    if size >= 1.5:
        flags.append(
            _flag(
                "STEAM",
                "steam",
                "Spread has moved",
                (
                    f"{team} is {size:.1f} points shorter than the first FanDuel "
                    f"number this desk saved ({_spread(open_line)} to {_spread(now_line)}). "
                    "Read the dive before you chase the move."
                ),
                market="spread",
                side=side,
            )
        )
    elif size >= 0.5:
        flags.append(
            _flag(
                "LINE_MOVE",
                "watch",
                "Spread ticked",
                (
                    f"FanDuel has {nick(game['away'])} {_spread(now_line)}, "
                    f"from {_spread(open_line)} at the open we saved."
                ),
                market="spread",
                side=side,
            )
        )
    return flags


def _total_move(open_total: float, now_total: float) -> dict[str, Any]:
    delta = now_total - open_total
    side = "over" if delta > 0 else "under"
    return _flag(
        "TOTAL_MOVE",
        "steam" if abs(delta) >= 2 else "watch",
        "Total has moved",
        (
            f"The total went from {open_total:g} to {now_total:g} ({delta:+.1f}). "
            "A move of a point or more is the market changing the script."
        ),
        market="total",
        side=side,
    )


def _price_flags(game: dict[str, Any], spread: dict[str, Any]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    away_odds = spread.get("awayOdds")
    home_odds = spread.get("homeOdds")
    soft = _softer(away_odds, home_odds)
    shaded = None if soft else _shaded(away_odds, home_odds)
    pick = soft or shaded
    if pick:
        side = "away" if pick == "a" else "home"
        team = nick(game["away"] if side == "away" else game["home"])
        odds = away_odds if side == "away" else home_odds
        other = home_odds if side == "away" else away_odds
        line = spread.get("awayLine") if side == "away" else spread.get("homeLine")
        if soft:
            title, code = "Plus money on the number", "SOFT_PRICE"
            why = (
                f"{team} {_spread(line)} is priced {_american(odds)} while the "
                "other side is juiced. You are being paid to take the points."
            )
        else:
            title, code = "Price is shaded", "PRICE_GAP"
            why = (
                f"{team} {_spread(line)} is {_american(odds)}. The other side is "
                f"{_american(other)}. FanDuel shaded one side of the same number. "
                "Read the cheaper side first."
            )
        flags.append(
            _flag(code, "look", title, why, market="spread", side=side)
        )
    flags.extend(_key_tax(game, spread))
    return flags


def _football(game: dict[str, Any]) -> bool:
    return str(game.get("sport") or "NFL") in _FOOTBALL


def _key_tax(game: dict[str, Any], spread: dict[str, Any]) -> list[dict[str, Any]]:
    if not _football(game):
        return []
    for side, line_key, odds_key in (
        ("away", "awayLine", "awayOdds"),
        ("home", "homeLine", "homeOdds"),
    ):
        line = _num(spread.get(line_key))
        odds = spread.get(odds_key)
        if line is None or odds is None:
            continue
        if line < 0 and abs(line) in {3.0, 7.0, 10.0} and int(odds) <= -115:
            team = nick(game["away"] if side == "away" else game["home"])
            dog = "home" if side == "away" else "away"
            return [
                _flag(
                    "KEY_TAX",
                    "look",
                    "Taxed on a key number",
                    (
                        f"{team} {_spread(line)} is {_american(odds)}. Laying more than "
                        "-110 on exactly 3, 7, or 10 means a field goal or a touchdown "
                        "pushes and you still paid extra. Look at the other side."
                    ),
                    market="spread",
                    side=dog,
                )
            ]
    return []


def _spread_vs_moneyline(
    game: dict[str, Any],
    spread: dict[str, Any],
    money: dict[str, Any],
) -> list[dict[str, Any]]:
    away_line = _num(spread.get("awayLine"))
    if away_line is None:
        return []
    if money.get("awayOdds") is None or money.get("homeOdds") is None:
        return []
    expected = -away_line
    spread_win = 0.5 * (1.0 + math.erf((expected / _SIGMA) / math.sqrt(2.0)))
    nv_away, _nv_home = no_vig(float(money["awayOdds"]), float(money["homeOdds"]))
    gap = spread_win - nv_away
    if abs(gap) < 0.04:
        return []
    side = "away" if gap > 0 else "home"
    team = nick(game["away"] if side == "away" else game["home"])
    team_spread = spread_win if side == "away" else 1.0 - spread_win
    team_ml = nv_away if side == "away" else 1.0 - nv_away
    big = abs(away_line) >= 9
    severity = "watch" if big or abs(gap) < 0.05 else "look"
    extra = (
        " A double-digit spread drifts off a simple points-to-win curve, so this is a prompt to read, not a number to bet."
        if big
        else ""
    )
    return [
        _flag(
            "SPREAD_ML",
            severity,
            "Spread and moneyline disagree",
            (
                f"The spread treats {team} like a {team_spread * 100:.0f}% chance to "
                f"win outright. FanDuel's moneyline, with the vig removed, implies "
                f"{team_ml * 100:.0f}%. The points and the moneyline disagree.{extra}"
            ),
            market="moneyline",
            side=side,
        )
    ]


def _news_flags(
    game: dict[str, Any],
    articles: list[dict[str, Any]],
    snaps: list[dict[str, Any]],
    away_line: float | None,
    open_line: float | None,
) -> list[dict[str, Any]]:
    if not articles:
        return []
    away = str(game.get("away") or "")
    home = str(game.get("home") or "")
    fresh = matching_articles(articles, away, home, within_hours=18)
    recent = matching_articles(articles, away, home, within_hours=36)
    moved = (
        away_line is not None
        and open_line is not None
        and abs(away_line - open_line) >= 0.5
    )
    held = (
        away_line is not None
        and open_line is not None
        and away_line == open_line
        and _held_hours(snaps) >= 0.5
    )
    flags: list[dict[str, Any]] = []
    injury_hits = [a for a in fresh if _injury_copy(a)]
    if injury_hits and held:
        headline = str(injury_hits[0].get("headline") or "A fresh injury note")
        flags.append(
            _flag(
                "NEWS_AHEAD",
                "look",
                "News moved, the number did not",
                (
                    f"ESPN has a fresh note ({headline}) and FanDuel's spread is still "
                    f"{_spread(away_line)}, the same as the first number we saved. "
                    "The story may not be in the price yet."
                ),
                market="spread",
            )
        )
    if moved and not recent:
        flags.append(
            _flag(
                "QUIET_MOVE",
                "watch",
                "Number moved, wire is quiet",
                (
                    "FanDuel's spread moved and the ESPN NFL wire has no fresh story "
                    f"on the {nick(away)} or the {nick(home)}. Open the dive before you chase it."
                ),
                market="spread",
            )
        )
    return flags


def _injury_copy(article: dict[str, Any]) -> bool:
    text = f"{article.get('headline') or ''} {article.get('description') or ''}".lower()
    return any(word in text for word in _INJURY_WORDS)


def _shaded(odds_a: Any, odds_b: Any) -> str | None:
    """One side of the spread is -118 or shorter and the other is -105 or better."""
    if odds_a is None or odds_b is None:
        return None
    a = int(odds_a)
    b = int(odds_b)
    if a <= -118 and -105 <= b < 0:
        return "b"
    if b <= -118 and -105 <= a < 0:
        return "a"
    return None


def _softer(odds_a: Any, odds_b: Any) -> str | None:
    if odds_a is None or odds_b is None:
        return None
    a = int(odds_a)
    b = int(odds_b)
    if a >= 100 and b <= -115:
        return "a"
    if b >= 100 and a <= -115:
        return "b"
    return None


def _crossed_keys(open_line: float, now_line: float) -> list[float]:
    lo, hi = min(open_line, now_line), max(open_line, now_line)
    return [key for key in (3.0, -3.0, 7.0, -7.0, 10.0, -10.0) if lo < key <= hi]


def _held_hours(snaps: list[dict[str, Any]]) -> float:
    if not snaps:
        return 0.0
    try:
        stamp = datetime.fromisoformat(str(snaps[0].get("ts") or "").replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - stamp).total_seconds() / 3600.0


def _flag(
    code: str,
    severity: str,
    title: str,
    why: str,
    *,
    market: str = "",
    side: str = "",
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "title": title,
        "why": why,
        "market": market,
        "side": side,
    }


def _num(raw: Any) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _spread(line: float | None) -> str:
    if line is None:
        return "—"
    if line > 0:
        return f"+{line:g}"
    return f"{line:g}"


def _american(odds: Any) -> str:
    if odds is None:
        return "—"
    value = int(odds)
    return f"+{value}" if value > 0 else str(value)
