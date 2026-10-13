"""Recent form from the last few games. The FanDuel price stays the price."""

from __future__ import annotations

from typing import Any

from nfl_bets.sway import _PATH, _line, _nick, _player, _player_log, _side_rows, _spec, _value


def recent(leg: dict[str, Any], game: dict[str, Any] | None) -> str:
    if not game:
        return ""
    sport = str(leg.get("sport") or game.get("sport") or "")
    path = _PATH.get(sport)
    if not path:
        return ""
    text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
    spec = _spec(text)
    if spec:
        return _player_form(sport, path, leg, spec)
    return _team_form(sport, path, leg)


def _player_form(sport: str, path: tuple[str, str], leg: dict[str, Any], spec: tuple[tuple[str, ...], str, bool]) -> str:
    keys, noun, fixed = spec
    text = f"{leg.get('market') or ''} {leg.get('label') or ''} {leg.get('runner') or ''}"
    line = _line(text, fixed)
    name = _player(str(leg.get("runner") or ""), str(leg.get("label") or ""))
    pack = _player_log(sport, path, name) if line is not None and name else None
    values = _recent_values(pack, keys) if pack else []
    if line is None or len(values) < 3:
        return ""
    hits = sum(1 for value in values if value >= line)
    shown = int(line) if float(line).is_integer() else line
    did = "scored a touchdown" if fixed and line == 1 else f"cleared {shown}+ {noun}"
    return _words(hits, len(values), f"{_nick(name)} {did} in {hits} of the last {len(values)}")


def _team_form(sport: str, path: tuple[str, str], leg: dict[str, Any]) -> str:
    market = f"{leg.get('market') or ''} {leg.get('label') or ''}".lower()
    if any(word in market for word in ("half", "period", "quarter", "inning")):
        return ""
    if "winner" not in market and "moneyline" not in market and "money line" not in market:
        return ""
    name = str(leg.get("runner") or "").strip()
    rows = [row for row in _side_rows(sport, path, name) if "won" in row][:5]
    if len(rows) < 3 or not name:
        return ""
    hits = sum(1 for row in rows if row.get("won"))
    return _words(hits, len(rows), f"the {_nick(name)} won {hits} of the last {len(rows)}")


def _recent_values(pack: dict[str, Any], keys: tuple[str, ...]) -> list[float]:
    names = list(pack.get("names") or [])
    indexes = [names.index(key) for key in keys if key in names]
    if not indexes:
        return []
    found: list[float] = []
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        values = [_value(stats[index] if index < len(stats) else "", names[index]) for index in indexes]
        if any(value is None for value in values):
            continue
        found.append(sum(value or 0 for value in values))
        if len(found) >= 5:
            break
    return found


def _words(hits: int, count: int, phrase: str) -> str:
    rate = hits / count if count else 0
    if rate >= 0.8:
        return f"{phrase}."
    label = "Cold" if rate <= 0.25 else "Mixed"
    return f"{label}: {phrase}."
