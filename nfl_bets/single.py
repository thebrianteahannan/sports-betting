"""One prop whose counted history is far enough off the FanDuel price.

A row needs three or more games and about 8 points of room, or a situation
the desk already treats as large. The price stays the FanDuel price.
This does not send a bet.
"""

from __future__ import annotations

import re
from typing import Any

from nfl_bets.edge import _bar, _foe, _hits, _place, _player_out, _report, _rows, _situation
from nfl_bets.hedge import american_decimal, implied_prob
from nfl_bets.sway import _PATH, _nick, _player, _player_log, _same, _spec, _value
from nfl_bets.tiebreak import _ET, _building, _parse, _person, _schedule, _sites

_PART = re.compile(r"\b(quarter|half|period|inning)\b", re.I)
_OTHER = re.compile(r"\b(first|last|1st|2nd|3rd)\b", re.I)
_EMPTY = "Nothing on this slate is far enough off the count."


def find_single(legs: list[dict[str, Any]], games: list[dict[str, Any]], skip: list[str], stake: float, profit: float) -> dict[str, Any]:
    by_id = {str(game.get("id") or ""): game for game in games if isinstance(game, dict)}
    seen = {part for mark in skip for part in str(mark).split("|") if part}
    kept = [leg for leg in legs if isinstance(leg, dict) and _open(leg, seen, stake, profit)]
    rosters = _rosters(kept)
    cap = 48
    chosen: list[tuple[str, str]] = []
    while len(chosen) < cap and any(names for _gid, names, _rows_ in rosters):
        for gid, names, _rows_ in rosters:
            if names and len(chosen) < cap:
                chosen.append((gid, names.pop(0)))
    found: list[dict[str, Any]] = []
    used: set[str] = set()
    for gid, name in chosen:
        game = by_id.get(gid) or {}
        rows = next((rows for key, _names, rows in rosters if key == gid), [])
        mine: list[dict[str, Any]] = []
        for leg in rows:
            if _mark(leg) != name:
                continue
            hit = _look(leg, game)
            if not hit:
                continue
            mark = f"{name}|{hit['leg'].get('label')}|{hit['leg'].get('odds')}"
            if mark in used:
                continue
            used.add(mark)
            mine.append(hit)
        mine.sort(key=lambda row: (row["score"], row["sample"]), reverse=True)
        found.extend(mine[:3])
    found.sort(key=lambda row: (row["score"], row["sample"]), reverse=True)
    found = found[:24]
    if not found:
        return _miss()
    card = _card(found[0]["leg"], found[0]["game"], found[0]["why"], stake)
    card["title"] = "One pick" if len(found) == 1 else "One pick bets"
    card["offers"] = [_card(row["leg"], row["game"], row["why"], stake) for row in found[1:]]
    for offer in card["offers"]:
        offer["edge"] = False
        offer["title"] = card["title"]
    return card


def _open(leg: dict[str, Any], seen: set[str], stake: float, profit: float) -> bool:
    if _mark(leg) in seen or _PART.search(_text(leg)) or _OTHER.search(_text(leg)):
        return False
    if not (profit > 0):
        return True
    try:
        decimal = american_decimal(int(leg.get("odds")))
    except (TypeError, ValueError):
        return False
    target = 1 + profit / (stake if stake > 0 else 5)
    return target * 0.6 <= decimal <= target * 1.8


def _rosters(legs: list[dict[str, Any]]) -> list[list[Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for leg in legs:
        grouped.setdefault(str(leg.get("gameId") or ""), []).append(leg)
    rosters = []
    for gid, rows in grouped.items():
        rows.sort(key=lambda leg: (0 if _spec(_text(leg)) else 1, int(leg.get("odds") or 0)))
        names: list[str] = []
        for leg in rows:
            name = _mark(leg)
            if name and name not in names:
                names.append(name)
        rosters.append([gid, names, rows])
    return rosters


def _look(leg: dict[str, Any], game: dict[str, Any]) -> dict[str, Any] | None:
    text = _text(leg)
    try:
        price = implied_prob(float(leg.get("odds")))
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None
    name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
    sport = str(leg.get("sport") or game.get("sport") or "")
    path = _PATH.get(sport)
    sit = _situation(game) if game else {}
    if name and _player_out(name, sit):
        return None
    pack = _player_log(sport, path, name) if path and name else None
    team = str((pack or {}).get("team") or "")
    counts = _counts(leg, game, pack, team, name, price) if pack and name else []
    sides = _sides(leg, game, name, team, text, sit)
    strong = [(score, line) for score, line in sides if score >= 8 and line]
    if not counts and not strong:
        return None
    if counts:
        longer = max(counts, key=lambda row: (row[1], row[0]))
        rest = [row for row in counts if row is not longer]
        rest.sort(key=lambda row: (row[1], row[0]), reverse=True)
        why = longer[2]
        extra = rest[0][2] if rest else (strong[0][1] if strong else _color(sides, game, team))
        score, sample = longer[0], longer[1]
    else:
        strong.sort(reverse=True)
        why, extra = strong[0][1], f"FanDuel has this at {round(price * 100)}%."
        score, sample = strong[0][0], 0
    if extra and extra not in why:
        why = f"{why} {extra}"
    return {"score": score, "sample": sample, "why": why, "leg": leg, "game": game}


def _counts(leg: dict[str, Any], game: dict[str, Any], pack: dict[str, Any], team: str, name: str, price: float) -> list[tuple[int, int, str]]:
    spec = _spec(_text(leg))
    if not spec:
        return []
    bar = _bar(_text(leg), spec[2])
    rows = _rows(pack, spec[0]) if bar is not None else []
    if bar is None or not rows:
        return []
    under = bool(re.search(r"\bunder\b", _text(leg), re.I))
    nick = _nick(name)
    found: list[tuple[int, int, str]] = []
    window = rows[:8]
    if len(window) >= 3:
        line = _line(nick, spec, bar, under, _hits(window, bar, under), len(window), price, "the last")
        if line:
            found.append(line)
    last = rows[:3]
    if len(last) == 3 and len(window) != 3:
        line = _line(nick, spec, bar, under, _hits(last, bar, under), 3, price, "the last")
        if line:
            found.append(line)
    foe = _foe(rows, game, team)[:8]
    if len(foe) >= 3:
        other = _nick(str(game.get("homeName") if _same(team, str(game.get("awayName") or "")) else game.get("awayName") or ""))
        hits = _hits(foe, bar, under)
        gap = _gap(hits, len(foe), price)
        if gap is not None and other:
            found.append((gap, len(foe), f"Against the {other}, {nick} {_verb(spec, bar, under)} in {hits} of {len(foe)}. FanDuel has this at {round(price * 100)}%."))
    kick = _parse(str(game.get("kickoff") or ""))
    if kick is not None and kick.astimezone(_ET).hour >= 19:
        prime = [row for row in rows if (stamp := _parse(row["date"])) and stamp.astimezone(_ET).hour >= 19]
        if len(prime) >= 3:
            hits = _hits(prime, bar, under)
            gap = _gap(hits, len(prime), price)
            if gap is not None:
                found.append((gap, len(prime), f"In prime time, {nick} {_verb(spec, bar, under)} in {hits} of {len(prime)}. FanDuel has this at {round(price * 100)}%."))
    return found


def _line(nick: str, spec: tuple, bar: float, under: bool, hits: int, count: int, price: float, scope: str) -> tuple[int, int, str] | None:
    gap = _gap(hits, count, price)
    if gap is None:
        return None
    return gap, count, f"{nick} {_verb(spec, bar, under)} in {hits} of {scope} {count}. FanDuel has this at {round(price * 100)}%."


def _verb(spec: tuple, bar: float, under: bool) -> str:
    if spec[2] and bar == 1:
        return "scored a touchdown"
    shown = int(bar) if float(bar).is_integer() else bar
    return f"{'stayed under' if under else 'cleared'} {shown}+ {spec[1]}"


def _gap(hits: int, count: int, price: float) -> int | None:
    if count < 3 or price <= 0:
        return None
    gap = round((hits / count - price) * 100)
    return gap if gap >= 8 else None


def _sides(leg: dict[str, Any], game: dict[str, Any], name: str, team: str, text: str, sit: dict) -> list[tuple[int, str]]:
    notes: list[tuple[int, str]] = []
    if name:
        try:
            notes.extend(_flat(_person(leg, game, name)))
        except Exception:  # noqa: BLE001
            pass
        notes.extend(_flat(_report(text, name, team, game, sit)))
    if game:
        notes.extend(_flat(_place(game, leg)))
        try:
            notes.extend(_flat(_building(game, leg)))
        except Exception:  # noqa: BLE001
            pass
    return notes


def _color(sides: list[tuple[int, str]], game: dict[str, Any], team: str) -> str:
    for score, line in sides:
        if score >= 6 and any(word in line for word in ("are up", "Wind", "Rain", "Rivalry")):
            return line
    cold = _cold(game, team)
    if cold:
        return cold
    kick = _parse(str((game or {}).get("kickoff") or ""))
    if kick is not None and kick.astimezone(_ET).hour >= 19:
        return "This starts at 7:00 PM ET or later."
    return ""


def _cold(game: dict[str, Any], team: str) -> str:
    if not game or not team:
        return ""
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    other = home if _same(team, away) else away if _same(team, home) else ""
    kick = _parse(str(game.get("kickoff") or ""))
    sport = str(game.get("sport") or "")
    if not other or kick is None:
        return ""
    recent = [row for row in _schedule(sport, other) if row.get("state") == "post" and row["when"] < kick and (kick.astimezone(_ET).date() - row["day"]).days <= 14]
    recent = sorted(recent, key=lambda row: row["when"], reverse=True)[:5]
    if len(recent) < 3:
        return ""
    wins = sum(1 for row in recent if row.get("won"))
    if wins / len(recent) > 0.34:
        return ""
    return f"The {_nick(other)} have won {wins} of {len(recent)} in the last two weeks."


def _flat(notes: list[tuple]) -> list[tuple[int, str]]:
    flat = []
    for note in notes:
        if len(note) == 3:
            _key, score, line = note
        else:
            score, line = note
        flat.append((int(score), str(line)))
    return flat


def _card(leg: dict[str, Any], game: dict[str, Any], why: str, stake: float) -> dict[str, Any]:
    odds = int(leg.get("odds"))
    decimal = american_decimal(odds)
    bet = stake if stake > 0 else 5
    profit = round(bet * (decimal - 1), 2)
    chance = round(implied_prob(odds) * 1000) / 10
    match = str(game.get("match") or "")
    label = str(leg.get("label") or leg.get("runner") or "")
    if match and match not in label:
        clock = ""
        stamp = _parse(str(game.get("kickoff") or ""))
        if stamp is not None:
            clock = stamp.astimezone(_ET).strftime("%-I:%M %p ET")
        tail = ", ".join(part for part in (str(game.get("sport") or ""), match, clock) if part)
        label = f"{label} — {tail}" if tail else label
    return {
        "title": "One pick", "game": match, "kind": "", "american": odds, "impliedPct": chance, "profit": profit,
        "why": why, "edge": True, "copy": why, "note": "", "players": [_mark(leg)], "only": False, "again": False,
        "legs": [{
            "market": leg.get("market") or "", "runner": leg.get("runner") or "", "label": label, "odds": odds,
            "kickoff": game.get("kickoff") or "", "gameId": str(game.get("id") or ""), "sport": game.get("sport") or leg.get("sport") or "",
            "pct": f"{implied_prob(odds) * 100:.1f}%",
        }],
    }


def mark_player(name: str, legs: list[dict[str, Any]], games: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = [leg for leg in legs if isinstance(leg, dict)]
    sport = next((str(leg.get("sport") or "") for leg in rows if leg.get("sport")), "")
    path = _PATH.get(sport)
    pack = _player_log(sport, path, name) if path and name else None
    if not pack or not pack.get("rows"):
        return {"known": False, "marks": []}
    team = str(pack.get("team") or "")
    board = [game for game in (games or []) if isinstance(game, dict)]
    marks = []
    for index, leg in enumerate(rows):
        text = _text(leg)
        if _PART.search(text) or _OTHER.search(text) or _combo(text):
            continue
        try:
            price = implied_prob(float(leg.get("odds")))
        except (TypeError, ValueError):
            continue
        game = _board_game(leg, board)
        found = _counts(leg, game, pack, team, name, price)
        if not found:
            continue
        gap, _sample, why = max(found, key=lambda row: (row[0], row[1]))
        marks.append({"index": index, "gap": gap, "why": why, "notes": _extra(name, pack, team, game, leg, why)})
    marks.sort(key=lambda row: row["gap"], reverse=True)
    return {"known": True, "marks": marks}


def _board_game(leg: dict[str, Any], games: list[dict[str, Any]]) -> dict[str, Any]:
    sport, kick, match = str(leg.get("sport") or ""), str(leg.get("kickoff") or ""), str(leg.get("match") or "").lower()
    picked = next((game for game in games if (not sport or game.get("sport") == sport) and (not kick or game.get("kickoff") == kick) and (title := str(game.get("match") or "").lower()) and match and (match in title or title in match)), {})
    names = _game_of(leg)
    merged = dict(picked or names)
    for key in ("awayName", "homeName", "match", "sport", "kickoff"):
        if not merged.get(key):
            merged[key] = names.get(key) or ""
    return merged
def _extra(name: str, pack: dict[str, Any], team: str, game: dict[str, Any], leg: dict[str, Any], why: str) -> list[str]:
    reads = _reads(leg, game, name, team)
    site = next((line for _score, line in reads if line.startswith(("At home", "On the road"))), "")
    found = [line for line in (site or _where(name, pack, team, game, leg), _usage(pack), _prime_minutes(pack, game), _book(game, team)) if line]
    said = f"{why} {' '.join(found)}"
    for _score, line in reads:
        if not line or line == site or "minutes are" in line or line in said:
            continue
        found.append(line)
        said = f"{said} {line}"
        if len(found) >= 6:
            break
    rest = _since(pack, game, name)
    if rest and rest not in said and len(found) < 6 and not any(word in said for word in ("back-to-back", "days", "bye", "short week", "first game")):
        found.append(rest)
    return found[:6]
def _reads(leg: dict[str, Any], game: dict[str, Any], name: str, team: str) -> list[tuple[int, str]]:
    notes: list[tuple[int, str]] = []
    try:
        notes.extend(_flat(_person(leg, game, name)))
    except Exception:  # noqa: BLE001
        pass
    try:
        sit = _situation(game) if game else {}
    except Exception:  # noqa: BLE001
        sit = {}
    notes.extend(_flat(_report(_text(leg), name, team, game, sit)))
    if game:
        notes.extend(_flat(_place(game, leg)))
        try:
            notes.extend(_flat(_building(game, leg)))
        except Exception:  # noqa: BLE001
            pass
    notes.sort(key=lambda row: abs(row[0]), reverse=True)
    return notes
def _where(name: str, pack: dict[str, Any], team: str, game: dict[str, Any], leg: dict[str, Any]) -> str:
    home, away = str(game.get("homeName") or ""), str(game.get("awayName") or "")
    if not team or not (_same(team, home) or _same(team, away)):
        return ""
    at_home = _same(team, home)
    place = "At home" if at_home else "On the road"
    spec = _spec(_text(leg))
    rows = _rows(pack, spec[0]) if spec else []
    bar = _bar(_text(leg), spec[2]) if spec else None
    if bar is None or len(rows) < 3:
        return f"{place}."
    try:
        events = _schedule(str(game.get("sport") or leg.get("sport") or ""), team)
        home_rows, road_rows = _sites(rows, events) if events else ([], [])
    except Exception:  # noqa: BLE001
        home_rows, road_rows = [], []
    piece = home_rows if at_home else road_rows
    if len(piece) < 3:
        return f"{place}."
    under = bool(re.search(r"\bunder\b", _text(leg), re.I))
    return f"{place}, {_nick(name)} {_verb(spec, bar, under)} in {_hits(piece, bar, under)} of {len(piece)}."
def _usage(pack: dict[str, Any]) -> str:
    names = list(pack.get("names") or [])
    for key, word in (("minutes", "minutes"), ("receivingTargets", "targets")):
        if key in names:
            return _span(pack, names.index(key), word)
    return ""
def _span(pack: dict[str, Any], index: int, word: str) -> str:
    values = [value for row in pack.get("rows") or [] if index < len(stats := row.get("stats") or []) and (value := _value(stats[index], "minutes")) is not None]
    if len(values) < 3:
        return ""
    recent = round(sum(values[:3]) / 3)
    if len(values) < 6:
        return f"{recent} {word} in the last 3."
    return f"{recent} {word} in the last 3. {round(sum(values[3:6]) / 3)} in the three before."
def _prime_minutes(pack: dict[str, Any], game: dict[str, Any]) -> str:
    kick, names = _parse(str((game or {}).get("kickoff") or "")), list(pack.get("names") or [])
    if kick is None or kick.astimezone(_ET).hour < 19 or "minutes" not in names:
        return ""
    index, prime, early = names.index("minutes"), [], []
    for row in pack.get("rows") or []:
        stamp, stats = _parse(str(row.get("date") or "")), row.get("stats") or []
        value = _value(stats[index], "minutes") if stamp is not None and index < len(stats) else None
        if value is not None:
            (prime if stamp.astimezone(_ET).hour >= 19 else early).append(value)
    if len(prime) < 3 or len(early) < 3:
        return ""
    now, then = round(sum(prime) / len(prime)), round(sum(early) / len(early))
    return "" if abs(now - then) < 3 else f"In prime time, {now} minutes. Earlier tips, {then}."
def _book(game: dict[str, Any], team: str) -> str:
    spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
    away, home = str(game.get("awayName") or ""), str(game.get("homeName") or "")
    raw = spread.get("awayLine") if _same(team, away) else spread.get("homeLine") if _same(team, home) else None
    bits = []
    if isinstance(raw, (int, float)) and raw != 0:
        number = abs(raw)
        shown = int(number) if float(number).is_integer() else number
        wide = " That's a wide number." if abs(raw) >= 9.5 else " This one is close." if abs(raw) <= 3 else ""
        bits.append(f"The {_nick(team)} are {'favored by' if raw < 0 else 'getting'} {shown}.{wide}")
    total = game.get("total") if isinstance(game.get("total"), dict) else {}
    if isinstance(total.get("line"), (int, float)):
        line = total["line"]
        bits.append(f"The total is {int(line) if float(line).is_integer() else line}.")
    return " ".join(bits)
def _since(pack: dict[str, Any], game: dict[str, Any], name: str) -> str:
    rows = pack.get("rows") or []
    last = _parse(str((rows[0] if rows else {}).get("date") or ""))
    kick = _parse(str(game.get("kickoff") or ""))
    if last is None or kick is None:
        return ""
    days = (kick.astimezone(_ET).date() - last.astimezone(_ET).date()).days
    if days == 1:
        return f"{_nick(name)} is on a back-to-back."
    if days > 1:
        return f"Last game was {days} days ago."
    return ""


def _combo(text: str) -> bool:
    low = text.lower()
    kinds = 0
    if "touchdown" in low:
        kinds += 1
    if "receiving" in low and ("yard" in low or "yds" in low):
        kinds += 1
    if "rushing" in low and ("yard" in low or "yds" in low):
        kinds += 1
    if "passing" in low and ("yard" in low or "yds" in low):
        kinds += 1
    if "reception" in low:
        kinds += 1
    if "shots on goal" in low or re.search(r"\bshots\b", low):
        kinds += 1
    if "made three" in low or "threes" in low:
        kinds += 1
    if "rebound" in low:
        kinds += 1
    if "assist" in low:
        kinds += 1
    if "strikeout" in low:
        kinds += 1
    if "home run" in low:
        kinds += 1
    elif re.search(r"\bhits?\b", low):
        kinds += 1
    if re.search(r"\bgoals?\b", low):
        kinds += 1
    if re.search(r"\bpoints?\b", low):
        kinds += 1
    return kinds > 1


def _game_of(leg: dict[str, Any]) -> dict[str, str]:
    match = str(leg.get("match") or "")
    away, home = "", ""
    if " @ " in match:
        away, home = [part.strip() for part in match.split(" @ ", 1)]
    return {"match": match, "sport": str(leg.get("sport") or ""), "kickoff": str(leg.get("kickoff") or ""), "awayName": away, "homeName": home}


def _miss() -> dict[str, Any]:
    return {"title": "One pick", "game": "", "copy": _EMPTY, "note": _EMPTY, "why": "", "legs": [], "players": [], "only": False, "again": False}


def _text(leg: dict[str, Any]) -> str:
    return f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"


def _mark(leg: dict[str, Any]) -> str:
    return re.split(r"\d", str(leg.get("runner") or leg.get("label") or ""), maxsplit=1)[0].strip().lower()


def _main() -> None:
    import json
    import sys

    body = json.load(sys.stdin)
    legs = [row for row in (body.get("legs") or []) if isinstance(row, dict)]
    if body.get("mark"):
        json.dump(mark_player(str(body.get("name") or ""), legs, [row for row in (body.get("games") or []) if isinstance(row, dict)]), sys.stdout)
        return
    games = [row for row in (body.get("games") or []) if isinstance(row, dict)]
    skip = [str(item) for item in (body.get("skip") or [])]
    stake = float(body.get("stake") or 5)
    profit = float(body.get("profit") or 0)
    json.dump(find_single(legs, games, skip, stake, profit), sys.stdout)


if __name__ == "__main__":
    _main()
