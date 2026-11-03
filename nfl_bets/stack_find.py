"""FanDuel prices that fit a stack. A shape that needs a second book is left uncovered."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from nfl_bets.chalk import _legs
from nfl_bets.hedge import american_decimal
from nfl_bets.store import load_board

_ET = ZoneInfo("America/New_York")
_SKIP = "We only look at FanDuel, so this one is not covered."
_NOTES = {
    "Arbitrage": _SKIP,
    "Low-hold shopping": _SKIP,
    "Live middle": "FanDuel shows the current number. The morning number is not on the board, so there is no first ticket to middle against.",
    "Teaser": "FanDuel prices a teaser as its own ticket. That price is not on the board we read.",
    "Wong teaser": "FanDuel prices a teaser as its own ticket. That price is not on the board we read.",
    "Pleaser": "FanDuel prices a pleaser as its own ticket. That price is not on the board we read.",
    "Cash-out": "FanDuel's cash-out number is not on the board we read.",
    "Hedge": "This needs a ticket you already hold. The board has prices, not your open bets.",
    "Parlay hedge": "This needs a parlay you already hold. The board has prices, not your open bets.",
    "Future hedge": "This needs a future you already hold. The board has today's games, not that ticket.",
    "If-bet": "This is the order of two tickets you already like. FanDuel does not post it as a price.",
    "Reverse": "This is the order of two tickets you already like. FanDuel does not post it as a price.",
    "Flat stake": "This is the size of a ticket you already like. FanDuel does not post it as a price.",
    "Kelly": "This is the size of a ticket you already like. FanDuel does not post it as a price.",
    "Martingale": "This is the size of the next ticket after a loss. FanDuel does not post it as a price.",
    "Paroli": "This is the size of the next ticket after a win. FanDuel does not post it as a price.",
    "1-3-2-6": "This is the size of the next ticket after a win. FanDuel does not post it as a price.",
    "Fibonacci": "This is the size of the next ticket after a loss. FanDuel does not post it as a price.",
    "Oscar's grind": "This is the size of the next ticket in a series. FanDuel does not post it as a price.",
}


def find() -> dict[str, Any]:
    games = _games()
    loaded = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for game, legs in pool.map(_load, games):
            if legs:
                loaded.append((game, legs))
    found = {
        "Prop ladder": _ladders(loaded),
        "Overlapping under": _unders(loaded),
        "Classic middle": _middles(loaded),
        "Key-number middle": _keys(loaded),
        "Buying the hook": _hooks(games, loaded),
        "Dutching": _dutch(loaded),
        "Round robin": _robin(games),
        "Correlated stack": _correlated(loaded),
        "Side and the total": _side_total(games),
        "Player and the total": _player_total(games, loaded),
        "First touchdown and anytime": _score(loaded),
    }
    return {"found": {key: value for key, value in found.items() if value}, "notes": _NOTES}


def _games() -> list[dict[str, Any]]:
    now = datetime.now(_ET)
    rows = []
    for game in load_board().get("games") or []:
        if not isinstance(game, dict):
            continue
        try:
            stamp = datetime.fromisoformat(str(game.get("kickoff") or "").replace("Z", "+00:00"))
        except ValueError:
            continue
        if stamp.astimezone(_ET) > now:
            rows.append(game)
    return rows


def _load(game: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        legs, _live = _legs(str(game.get("id") or ""))
    except Exception:  # noqa: BLE001
        return game, []
    return game, [leg for leg in legs if isinstance(leg, dict) and isinstance(leg.get("odds"), int)]


def _bet(kind: str, rung: str, label: str, odds: int, stake: int, job: str, game: str) -> dict[str, Any]:
    return {"kind": kind, "rung": rung, "label": label, "odds": odds, "stake": stake, "job": job, "game": game}


def _stack(game: str, bets: list[dict[str, Any]]) -> dict[str, Any]:
    return {"game": game, "bets": bets}


def _match(game: dict[str, Any]) -> str:
    return str(game.get("match") or "")


def _line_of(text: str) -> float | None:
    found = re.search(r"(\d+(?:\.\d+)?)\s*\+", text)
    if found:
        return float(found.group(1))
    found = re.search(r"\(([+-]?\d+(?:\.\d+)?)\)", text)
    if found:
        return float(found.group(1))
    found = re.search(r"(?:Over|Under)\s+(\d+(?:\.\d+)?)", text, re.I)
    return float(found.group(1)) if found else None


def _cover(odds: int, need: float) -> int:
    per = 100 / abs(odds) if odds < 0 else odds / 100
    return max(5, int(need / per + 0.999)) if per else 5


def _shown(odds: int) -> str:
    return f"+{odds}" if odds > 0 else str(odds)


def _ladders(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        groups: dict[str, list[tuple[float, dict[str, Any]]]] = {}
        for leg in legs:
            market = str(leg.get("market") or "")
            if "alt" not in market.lower():
                continue
            line = _line_of(str(leg.get("runner") or ""))
            if line is None or "under" in str(leg.get("runner") or "").lower():
                continue
            groups.setdefault(market, []).append((line, leg))
        for market, rows in groups.items():
            rows.sort(key=lambda item: item[0])
            for index in range(len(rows) - 2):
                window = rows[index:index + 3]
                if [item[0] for item in window] != sorted({item[0] for item in window}):
                    continue
                bottom, top = window[0][1], window[2][1]
                if not (-260 <= int(bottom["odds"]) <= -110) or int(top["odds"]) <= 0:
                    continue
                score = abs(int(bottom["odds"]) + 160) + (400 if any(word in market.lower() for word in ("period", "qtr", "half")) else 0)
                stake = _cover(int(bottom["odds"]), 10)
                names = ("Bottom rung", "Middle rung", "Top rung")
                jobs = (
                    f"${stake} to win ${_cover_profit(int(bottom['odds']), stake)}. That covers the $5 and $5 above it.",
                    "The next line up. $5.",
                    "The highest line. $5. This is the one a huge night clears.",
                )
                bets = [_bet("Single", names[i], _say(window[i][1]), int(window[i][1]["odds"]), 5 if i else stake, jobs[i], _match(game)) for i in range(3)]
                picked.append((score, _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _cover_profit(odds: int, stake: int) -> str:
    profit = stake * (100 / abs(odds) if odds < 0 else odds / 100)
    shown = round(profit) if abs(profit - round(profit)) < 0.05 else round(profit, 2)
    return str(int(shown)) if isinstance(shown, float) and shown == int(shown) else str(shown)


def _say(leg: dict[str, Any]) -> str:
    text = str(leg.get("label") or leg.get("runner") or "").strip()
    return text or str(leg.get("market") or "")


def _unders(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        groups: dict[str, list[tuple[float, dict[str, Any]]]] = {}
        for leg in legs:
            if "under" not in str(leg.get("runner") or "").lower():
                continue
            line = _line_of(str(leg.get("runner") or ""))
            if line is None:
                continue
            groups.setdefault(str(leg.get("market") or ""), []).append((line, leg))
        for _market, rows in groups.items():
            rows.sort(key=lambda item: item[0])
            for left in range(len(rows)):
                for right in range(left + 1, len(rows)):
                    low, high = rows[left], rows[right]
                    gap = high[0] - low[0]
                    if gap < 3 or gap > 6 or not (-180 <= int(high[1]["odds"]) <= -105):
                        continue
                    score = abs(gap - 4) + abs(int(high[1]["odds"]) + 120) / 50
                    stake = _cover(int(high[1]["odds"]), 5)
                    bets = [
                        _bet("Single", "Higher under", _say(high[1]), int(high[1]["odds"]), stake, f"${stake} on the higher under. Its profit covers the $5 tighter under.", _match(game)),
                        _bet("Single", "Lower under", _say(low[1]), int(low[1]["odds"]), 5, "The tight line. Both cash only under this number. $5.", _match(game)),
                    ]
                    picked.append((score, _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _middles(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        groups: dict[str, list[dict[str, Any]]] = {}
        for leg in legs:
            groups.setdefault(str(leg.get("market") or ""), []).append(leg)
        for market, rows in groups.items():
            if "total" not in market.lower():
                continue
            overs = [(line, leg) for leg in rows if (line := _line_of(str(leg.get("runner") or ""))) is not None and "over" in str(leg.get("runner") or "").lower()]
            unders = [(line, leg) for leg in rows if (line := _line_of(str(leg.get("runner") or ""))) is not None and "under" in str(leg.get("runner") or "").lower()]
            for over_line, over in overs:
                for under_line, under in unders:
                    gap = under_line - over_line
                    if gap < 3 or gap > 8 or int(over["odds"]) < -170 or int(under["odds"]) < -170:
                        continue
                    score = abs(int(over["odds"]) + 110) + abs(int(under["odds"]) + 110) - gap * 20
                    bets = [
                        _bet("Single", "Low side", _say(over), int(over["odds"]), 5, f"Over {over_line:g}. $5.", _match(game)),
                        _bet("Single", "High side", _say(under), int(under["odds"]), 5, f"Under {under_line:g}. A finish between them wins both. $5.", _match(game)),
                    ]
                    picked.append((score, _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _signed(text: str) -> tuple[str, float] | None:
    found = re.search(r"^(.*?)\s+\(([+-]?\d+(?:\.\d+)?)\)$", text.strip())
    if not found:
        return None
    return found.group(1).strip(), float(found.group(2))


def _keys(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    pairs = ((-2.5, 3.5, 3), (-6.5, 7.5, 7))
    for game, legs in loaded:
        book: dict[tuple[str, float], dict[str, Any]] = {}
        for leg in legs:
            if str(leg.get("market") or "") != "Alternate Spread":
                continue
            parsed = _signed(str(leg.get("runner") or ""))
            if parsed:
                book[parsed] = leg
        teams = {team for team, _line in book}
        if len(teams) != 2:
            continue
        for favorite, dog_line, key in pairs:
            for team in teams:
                other = next(name for name in teams if name != team)
                left, right = book.get((team, favorite)), book.get((other, dog_line))
                if not left or not right or int(left["odds"]) < -220 or int(right["odds"]) < -220:
                    continue
                score = abs(int(left["odds"]) + 110) + abs(int(right["odds"]) + 110)
                bets = [
                    _bet("Single", f"Covers a win by {key}", _say(left), int(left["odds"]), 5, f"A win by {key} clears this side. $5.", _match(game)),
                    _bet("Single", f"Also covers a win by {key}", _say(right), int(right["odds"]), 5, f"The other side also covers a {key}-point win. $5.", _match(game)),
                ]
                picked.append((score, _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _full(leg: dict[str, Any], tail: str) -> bool:
    market = str(leg.get("market") or "").lower()
    return market.endswith(" - " + tail.lower()) and "alt" not in market and "qtr" not in market and "half" not in market and "over" in str(leg.get("runner") or "").lower()


def _hooks(games: list[dict[str, Any]], loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
        try:
            home, away = float(spread.get("homeLine")), float(spread.get("awayLine"))
        except (TypeError, ValueError):
            continue
        favorite = ("home", home) if home < 0 else ("away", away)
        if abs(favorite[1]) not in {3.5, 7.5}:
            continue
        bought = favorite[1] + 1 if favorite[1] < 0 else favorite[1] - 1
        team = str(game.get("homeName") if favorite[0] == "home" else game.get("awayName") or "")
        main_odds = int(spread.get("homeOdds") if favorite[0] == "home" else spread.get("awayOdds") or 0)
        alt = next((leg for leg in legs if str(leg.get("market") or "") == "Alternate Spread" and (parsed := _signed(str(leg.get("runner") or ""))) and parsed[0] == team and parsed[1] == bought), None)
        if alt is None or not main_odds:
            continue
        key = 3 if abs(favorite[1]) == 3.5 else 7
        bets = [
            _bet("Single", "The posted number", f"{team} {favorite[1]:g}", main_odds, 5, f"A win by {key} loses this number.", _match(game)),
            _bet("Single", "The hook", _say(alt), int(alt["odds"]), 5, f"Bought to {bought:g}. A win by {key} covers. $5.", _match(game)),
        ]
        picked.append((abs(int(alt["odds"]) - main_odds), _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _dutch(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        rows = [leg for leg in legs if str(leg.get("market") or "") == "1st Touchdown Scorer"]
        rows.sort(key=lambda leg: int(leg["odds"]))
        chosen, implied = [], 0.0
        for leg in rows:
            chance = _prob(int(leg["odds"]))
            if implied + chance >= 1:
                break
            chosen.append(leg)
            implied += chance
        if len(chosen) < 2 or implied <= 0:
            continue
        decimals = [american_decimal(int(leg["odds"])) for leg in chosen]
        raw = [1 / decimal for decimal in decimals]
        scale = 15 / sum(raw)
        stakes = [max(1, round(part * scale)) for part in raw]
        pct = round(implied * 100)
        bets = [
            _bet("Single", f"First touchdown {index + 1}", _say(leg), int(leg["odds"]), stakes[index], f"${stakes[index]}. Any of these pays about the same. The set is {pct}%.", _match(game))
            for index, leg in enumerate(chosen)
        ]
        picked.append((implied, _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _prob(odds: int) -> float:
    return abs(odds) / (abs(odds) + 100) if odds < 0 else 100 / (odds + 100)


def _robin(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chosen = []
    seen: set[str] = set()
    for game in games:
        spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
        best = None
        for side, line_key, odds_key in (("away", "awayLine", "awayOdds"), ("home", "homeLine", "homeOdds")):
            try:
                line, odds = float(spread.get(line_key)), int(spread.get(odds_key))
            except (TypeError, ValueError):
                continue
            team = str(game.get("awayName") if side == "away" else game.get("homeName") or "")
            rank = abs(odds + 110)
            if team and (best is None or rank < best[0]):
                best = (rank, f"{team} {line:g}", odds, _match(game))
        if not best or best[3] in seen:
            continue
        seen.add(best[3])
        chosen.append(best[1:])
    if len(chosen) < 3:
        return []
    bets = []
    for left in range(len(chosen)):
        for right in range(left + 1, len(chosen)):
            price = _parlay(chosen[left][1], chosen[right][1])
            bets.append(_bet("Parlay", f"Pair {len(bets) + 1}", f"{chosen[left][0]} and {chosen[right][0]}", price, 5, "One miss kills this pair and leaves the other pair. $5.", f"{chosen[left][2]} · {chosen[right][2]}"))
    return [_stack("One side from each game, the price closer to -110", bets)]


def _parlay(left: int, right: int) -> int:
    decimal = american_decimal(left) * american_decimal(right)
    if decimal >= 2:
        return int(round((decimal - 1) * 100))
    return int(round(-100 / (decimal - 1)))


def _correlated(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        passing = [leg for leg in legs if _full(leg, "Passing Yds")]
        receiving = [leg for leg in legs if _full(leg, "Receiving Yds")]
        for quarter in passing:
            for catch in receiving:
                bets = [
                    _bet("Single", "Passing yards", _say(quarter), int(quarter["odds"]), 5, "The throws. $5.", _match(game)),
                    _bet("Single", "Receiving yards", _say(catch), int(catch["odds"]), 5, "The catches on those throws. Same game, so the card's multiplied price treats them as two games. $5.", _match(game)),
                ]
                picked.append((abs(int(quarter["odds"]) + 110) + abs(int(catch["odds"]) + 110), _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _side_total(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    picked = []
    for game in games:
        spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
        total = game.get("total") if isinstance(game.get("total"), dict) else {}
        try:
            home, away = float(spread.get("homeLine")), float(spread.get("awayLine"))
            over, under = int(total.get("overOdds")), int(total.get("underOdds"))
            line = float(total.get("line"))
        except (TypeError, ValueError):
            continue
        favorite = "home" if home < 0 else "away"
        margin = abs(home)
        team = str(game.get("homeName") if favorite == "home" else game.get("awayName") or "")
        number = home if favorite == "home" else away
        odds = int(spread.get("homeOdds") if favorite == "home" else spread.get("awayOdds") or 0)
        dog = str(game.get("awayName") if favorite == "home" else game.get("homeName") or "")
        dog_number = away if favorite == "home" else home
        dog_odds = int(spread.get("awayOdds") if favorite == "home" else spread.get("homeOdds") or 0)
        if not team or not odds:
            continue
        if margin >= 6.5:
            bets = [
                _bet("Single", "The favorite", f"{team} {number:g}", odds, 5, "A lead runs the clock. $5.", _match(game)),
                _bet("Single", "The under", f"Under {line:g}", under, 5, "The clock helps this number. $5.", _match(game)),
            ]
            picked.append((-margin, _stack(_match(game), bets)))
        elif margin <= 3:
            bets = [
                _bet("Single", "The dog", f"{dog} {dog_number:g}", dog_odds, 5, "A close game stays live. $5.", _match(game)),
                _bet("Single", "The over", f"Over {line:g}", over, 5, "Both teams keep throwing. $5.", _match(game)),
            ]
            picked.append((margin, _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _player_total(games: list[dict[str, Any]], loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        total = game.get("total") if isinstance(game.get("total"), dict) else {}
        try:
            over, line = int(total.get("overOdds")), float(total.get("line"))
        except (TypeError, ValueError):
            continue
        for catch in [leg for leg in legs if _full(leg, "Receiving Yds")]:
            bets = [
                _bet("Single", "The receiver", _say(catch), int(catch["odds"]), 5, "The catches need points. $5.", _match(game)),
                _bet("Single", "The over", f"Over {line:g}", over, 5, "The game script that gives him those plays. $5.", _match(game)),
            ]
            picked.append((abs(int(catch["odds"]) + 110), _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def _score(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    picked = []
    for game, legs in loaded:
        anytime = {str(leg.get("runner") or "").strip(): leg for leg in legs if str(leg.get("market") or "") == "Any Time Touchdown Scorer"}
        first = {str(leg.get("runner") or "").strip(): leg for leg in legs if str(leg.get("market") or "") == "1st Touchdown Scorer"}
        for name, any_leg in anytime.items():
            first_leg = first.get(name)
            if not first_leg:
                continue
            any_odds, first_odds = int(any_leg["odds"]), int(first_leg["odds"])
            if not (-200 <= any_odds <= 150) or first_odds <= 0:
                continue
            stake = _cover(any_odds, 5)
            bets = [
                _bet("Single", "Anytime", f"{name} anytime touchdown", any_odds, stake, f"${stake}. The profit covers the $5 first-touchdown ticket if he scores later.", _match(game)),
                _bet("Single", "First touchdown", f"{name} first touchdown", first_odds, 5, "The expensive rung. $5. Both cash if he scores first.", _match(game)),
            ]
            picked.append((abs(any_odds + 110), _stack(_match(game), bets)))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def main() -> None:
    import json
    print(json.dumps(find()))


if __name__ == "__main__":
    main()
