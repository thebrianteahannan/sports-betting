"""NFL one-pick strategies. A bet is listed under each reason that applies.

The price stays the FanDuel price. A corner on the injury report is a corner
who is out, not a corner assigned to this receiver. This does not send a bet.
"""

from __future__ import annotations

import time
import re
from typing import Any

from nfl_bets.choose import offer_legs
from nfl_bets.edge import _RIVALS, _call, _player_out, _situation
from nfl_bets.hedge import implied_prob
from nfl_bets.single import _OTHER, _PART, _counts, _mark, _text
from nfl_bets.store import out_dir, read_json, write_json
from nfl_bets.sway import _nick, _player, _player_log, _same, _spec
from nfl_bets.tiebreak import _ET, _parse, _person

_TTL = 3 * 3600
_STRATS = (
    ("cb", "Opposing corner out", "A corner or safety on the other team is out. A receiver has a better chance at yards and a score."),
    ("qb", "Quarterback out", "The starting quarterback is out. The passing game has fewer clean chances."),
    ("wr", "Other receiver out", "Another receiver on his team is out. The one still playing can see more targets."),
    ("rb", "Lead back out", "The lead back is out. The next back can see more carries."),
    ("up", "Targets up", "His targets in the last few games are higher than the games before."),
    ("down", "Targets down", "His targets have fallen off."),
    ("hot", "Cleared it lately", "He has cleared this number lately, and the FanDuel price is short of that count."),
    ("foe", "Against this team", "He has cleared this number against this team."),
    ("home", "At home", "He clears this number at home, and the road games are different."),
    ("road", "On the road", "He clears this number on the road, and the home games are different."),
    ("bye", "Off a bye", "He is coming off a bye."),
    ("short", "Short week", "This is a short week, and his short weeks play out differently."),
    ("rest", "More rest", "He has had more rest than the other team."),
    ("back", "First game back", "This is his first game back from a layoff."),
    ("early", "Early East start", "A West Coast team is playing an early East Coast game."),
    ("zones", "Two time zones", "This trip crosses two time zones."),
    ("script", "High-scoring script", "His team's side of the number says a lot of points."),
    ("throw", "They'll be throwing", "His team is a big underdog, so the script leans pass."),
    ("run", "They'll be running", "His team is a big favorite, so the script leans run."),
    ("move", "The number didn't move", "The spread or the total moved, and this player's number stayed."),
    ("cold", "The other team is cold", "The other team has won few of its last games."),
    ("prime", "Prime time", "The kickoff is 7:00 PM ET or later."),
    ("rival", "Rivalry", "These two teams are rivals."),
    ("after", "After a rivalry", "This is the game after a rivalry."),
    ("next", "A rivalry is next", "A rivalry is the next game."),
    ("wind", "Wind", "Wind is 20 mph or more and the game is outside."),
    ("rain", "Rain", "Rain is in the forecast and the game is outside."),
    ("air", "Cold", "It is cold, and this bet is a pass or a catch."),
    ("dome", "Indoors", "The game is indoors."),
    ("denver", "Denver", "This game is in the altitude."),
    ("abroad", "Overseas", "This game is outside the usual US building."),
)
_HINTS = (
    ("targets are up", "up"), ("targets are down", "down"), ("At home", "home"), ("On the road", "road"),
    ("short week", "short"), ("off a bye", "bye"), ("days of rest", "rest"), ("first game back", "back"),
    ("early East", "early"), ("two time zones", "zones"), ("after a rivalry", "after"), ("is the next game", "next"),
    ("have won", "cold"),
)


def build_ones(games: list[dict[str, Any]]) -> dict[str, Any]:
    slate = [game for game in games if _soon(game)]
    key = ",".join(sorted(str(game.get("id") or "") for game in slate))
    cached = read_json(out_dir() / "ones.json", {})
    if isinstance(cached, dict) and cached.get("key") == key and time.time() - float(cached.get("at") or 0) < _TTL and cached.get("v") == 5:
        return {"strategies": cached.get("strategies") or _shells()}
    buckets: dict[str, list[dict[str, Any]]] = {row[0]: [] for row in _STRATS}
    for game in slate[:6]:
        try:
            legs, _live = offer_legs(game)
        except Exception:  # noqa: BLE001
            continue
        sit = _situation(game)
        for leg in _pick(legs, sit)[:6]:
            for code, why, hot in _tags(leg, game, sit):
                pile = buckets[code]
                if len(pile) >= 6 or any(_mark(leg) == bet.get("who") for bet in pile):
                    continue
                pile.append(_bet(leg, game, why, hot))
    strategies = []
    for code, name, gist in _STRATS:
        bets = sorted(buckets[code], key=lambda bet: (0 if bet.get("hot") else 1, abs(int(bet.get("american") or 0) + 150)))
        for bet in bets:
            bet.pop("hot", None)
            bet.pop("who", None)
        strategies.append({"id": code, "name": name, "gist": gist, "bets": bets})
    write_json(out_dir() / "ones.json", {"v": 5, "at": time.time(), "key": key, "strategies": strategies})
    return {"strategies": strategies}


def _shells() -> list[dict[str, Any]]:
    return [{"id": code, "name": name, "gist": gist, "bets": []} for code, name, gist in _STRATS]


def _soon(game: dict[str, Any]) -> bool:
    if str(game.get("sport") or "") != "NFL":
        return False
    stamp = _parse(str(game.get("kickoff") or ""))
    if stamp is None:
        return False
    left = stamp.timestamp() - time.time()
    return 0 < left < 8 * 86400


def _pick(legs: list[dict[str, Any]], sit: dict[str, Any]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for leg in legs:
        if not isinstance(leg, dict) or _PART.search(_text(leg)) or _OTHER.search(_text(leg)) or re.search(r"\bunder\b", _text(leg), re.I):
            continue
        raw = _player(str(leg.get("runner") or ""), str(leg.get("label") or "")) or _mark(leg)
        name = re.sub(r"\s+(over|under)\b.*$", "", raw, flags=re.I).strip().lower()
        try:
            odds = int(leg.get("odds"))
        except (TypeError, ValueError):
            continue
        if not name or not _spec(_text(leg)):
            continue
        prior = best.get(name)
        if prior is None or abs(odds + 150) < abs(int(prior.get("odds") or 0) + 150):
            best[name] = leg
    rows = list(best.values())
    rows.sort(key=lambda leg: (_boost(leg, sit), abs(int(leg.get("odds") or 0) + 150)))
    return rows


def _boost(leg: dict[str, Any], sit: dict[str, Any]) -> int:
    role = _role(_text(leg))
    if role == "catch" and _corner(sit):
        return 0
    return 1 if role else 2


def _tags(leg: dict[str, Any], game: dict[str, Any], sit: dict[str, Any]) -> list[tuple[str, str, bool]]:
    text = _text(leg)
    name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
    if name and _player_out(name, sit):
        return []
    try:
        price = implied_prob(float(leg.get("odds")))
    except (TypeError, ValueError):
        return []
    sport = str(game.get("sport") or "NFL")
    pack = _player_log(sport, ("football", "nfl"), name) if name else None
    team = str((pack or {}).get("team") or "")
    found: dict[str, str] = {}
    found.update(_place(game, sit, _role(text)))
    if team:
        found.update(_injury(name, team, game, sit, _role(text)))
        found.update(_script(game, team, _role(text)))
    if pack and name and price > 0:
        for _gap, _count, line in _counts(leg, game, pack, team, name, price):
            if line.startswith("Against"):
                found["foe"] = line
            else:
                found.setdefault("hot", line)
        try:
            for note in _person(leg, game, name):
                score, line = (note[1], note[2]) if len(note) == 3 else note
                if int(score) <= 0 and "have won" not in str(line):
                    continue
                for needle, code in _HINTS:
                    if needle in str(line):
                        found[code] = str(line)
        except Exception:  # noqa: BLE001
            pass
    hot = "hot" in found or "foe" in found
    return [(code, why, hot) for code, why in found.items()]


def _place(game: dict[str, Any], sit: dict[str, Any], role: str) -> dict[str, str]:
    found: dict[str, str] = {}
    away, home = _clubs(game)
    blob = f"{away} {home}".lower()
    if any(all(word in blob for word in pair) for pair in _RIVALS):
        found["rival"] = f"{_nick(away)} and {_nick(home)}. Rivalry game."
    kick = _parse(str(game.get("kickoff") or ""))
    if kick is not None and kick.astimezone(_ET).hour >= 19:
        found["prime"] = "This starts at 7:00 PM ET or later."
    city = str(sit.get("city") or "")
    if city.lower() in {"denver", "mexico city", "salt lake city"}:
        found["denver"] = f"Altitude in {city}."
    country = str(sit.get("country") or "")
    if country.upper() not in {"", "USA", "US", "UNITED STATES"} or any(word in city.lower() for word in ("london", "munich", "frankfurt", "berlin", "paris", "mexico", "tokyo")):
        found["abroad"] = f"This game is in {city or country}, not a usual US building."
    gust = sit.get("gust")
    if role in {"catch", "pass"} and isinstance(gust, (int, float)) and not sit.get("indoor") and gust >= 20:
        found["wind"] = f"Wind is {int(gust)} mph."
    rain = sit.get("precipitation")
    if role in {"catch", "pass"} and isinstance(rain, (int, float)) and not sit.get("indoor") and rain >= 40:
        found["rain"] = "Rain is in the forecast."
    temp = sit.get("temp")
    if role in {"catch", "pass"} and isinstance(temp, (int, float)) and not sit.get("indoor") and temp <= 35:
        found["air"] = f"It's {int(temp)} degrees. Cold changes a passing game."
    if sit.get("indoor"):
        found["dome"] = "It's indoors."
    codes = {str(flag.get("code") or "") for flag in game.get("flags") or [] if isinstance(flag, dict)}
    if {"STEAM", "TOTAL_MOVE"} & codes:
        found["move"] = "The spread or the total has moved, and this player's number has not."
    return found


def _injury(name: str, team: str, game: dict[str, Any], sit: dict[str, Any], role: str) -> dict[str, str]:
    found: dict[str, str] = {}
    corners, own_qb, own_wr, own_rb = [], "", "", ""
    for row in sit.get("injuries") or []:
        who = str(row.get("player") or "")
        if not who or str(row.get("status") or "").lower() not in {"out", "doubtful"}:
            continue
        pos = str(row.get("pos") or "").upper()
        own = _same(str(row.get("team") or ""), team)
        if own and _same(who, name):
            continue
        if not own and pos in {"CB", "DB", "S", "FS", "SS"}:
            corners.append(_call(who))
        elif own and pos == "QB":
            own_qb = str(row.get("status") or "").lower()
        elif own and pos in {"WR", "TE"}:
            own_wr = _call(who)
        elif own and pos in {"RB", "FB"}:
            own_rb = _call(who)
    if role in {"catch", "score"} and corners:
        word = "corner" if len(corners) == 1 else "corners"
        found["cb"] = f"Their {word} {', '.join(corners[:2])} {'is' if len(corners) == 1 else 'are'} out."
    if role in {"catch", "pass"} and own_qb:
        found["qb"] = f"The quarterback is {own_qb}."
    if role == "catch" and own_wr:
        found["wr"] = f"Teammate {own_wr} is out."
    if role == "rush" and own_rb:
        found["rb"] = f"The lead back {own_rb} is out."
    return found


def _script(game: dict[str, Any], team: str, role: str) -> dict[str, str]:
    line = _side(game, team)
    total = _num((game.get("total") or {}).get("line"))
    found: dict[str, str] = {}
    if line is None:
        return found
    if role in {"catch", "rush", "score"} and total is not None and (total - line) / 2 >= 24:
        found["script"] = "His team's side of the number says a lot of points."
    if role == "catch" and line >= 7:
        found["throw"] = "His team is a big underdog, so the script leans pass."
    if role == "rush" and line <= -7:
        found["run"] = "His team is a big favorite, so the script leans run."
    return found


def _side(game: dict[str, Any], team: str) -> float | None:
    spread = game.get("spread") or {}
    away, home = _clubs(game)
    raw = spread.get("awayLine") if _same(team, away) else spread.get("homeLine") if _same(team, home) else None
    return _num(raw)


def _bet(leg: dict[str, Any], game: dict[str, Any], why: str, hot: bool) -> dict[str, Any]:
    odds = int(leg.get("odds"))
    chance = round(implied_prob(odds) * 1000) / 10
    label = str(leg.get("label") or leg.get("runner") or "")
    match = str(game.get("match") or "")
    if match and match not in label:
        stamp = _parse(str(game.get("kickoff") or ""))
        clock = stamp.astimezone(_ET).strftime("%-I:%M %p ET") if stamp is not None else ""
        tail = ", ".join(part for part in ("NFL", match, clock) if part)
        label = f"{label} — {tail}" if tail else label
    return {
        "who": _mark(leg), "american": odds, "impliedPct": chance, "why": why, "hot": hot,
        "legs": [{
            "market": leg.get("market") or "", "runner": leg.get("runner") or "", "label": label, "odds": odds,
            "kickoff": game.get("kickoff") or "", "sport": "NFL", "pct": f"{implied_prob(odds) * 100:.1f}%",
        }],
    }


def _clubs(game: dict[str, Any]) -> tuple[str, str]:
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    match = str(game.get("match") or "")
    if (not away or not home) and " @ " in match:
        left, right = match.split(" @ ", 1)
        away, home = away or left.strip(), home or right.strip()
    return away, home


def _role(text: str) -> str:
    low = text.lower()
    if "rush" in low:
        return "rush"
    if "pass" in low and "reception" not in low:
        return "pass"
    if "receiv" in low or "reception" in low:
        return "catch"
    if "touchdown" in low:
        return "score"
    return ""


def _corner(sit: dict[str, Any]) -> bool:
    return any(str(row.get("pos") or "").upper() in {"CB", "DB", "S", "FS", "SS"} and str(row.get("status") or "").lower() in {"out", "doubtful"} for row in sit.get("injuries") or [])


def _num(raw: Any) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _main() -> None:
    import json
    import sys

    body = json.load(sys.stdin)
    games = [row for row in (body.get("games") or []) if isinstance(row, dict)]
    json.dump(build_ones(games), sys.stdout)


if __name__ == "__main__":
    _main()
