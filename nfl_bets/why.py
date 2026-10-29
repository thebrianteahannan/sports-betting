"""Where a recent shift starts. Only the log, and age or injuries when they change the read."""

from __future__ import annotations

import json
import sys
from typing import Any

from nfl_bets.http_util import get_json
from nfl_bets.sway import _PATH, _career, _search, _spec

_REFERER = "https://www.espn.com/"


def explain(name: str, text: str, sport: str) -> dict[str, str]:
    spec = _spec(text)
    path = _PATH.get(sport)
    pack = _career(sport, path, name) if path and name and spec else None
    rows = _games(pack, spec[0][0]) if pack and spec else []
    if spec is None or len(rows) < 20:
        return {"why": "The log is too short to split a recent stretch from the career."}
    brief = _brief(name, sport, path, pack, rows, spec[0][0])
    if not brief:
        return {"why": "The recent windows and the career are the same number."}
    return {"why": brief}


def _games(pack: dict[str, Any] | None, key: str) -> list[dict[str, float]]:
    if not pack or not key:
        return []
    names = list(pack.get("names") or [])
    if key not in names:
        return []
    index = names.index(key)
    found = []
    for row in pack.get("rows") or []:
        stats = row.get("stats") or []
        raw = str(stats[index] if index < len(stats) else "").strip()
        made, attempts = _pair(raw, key)
        if made is None:
            continue
        found.append({
            "made": made,
            "attempts": attempts if attempts is not None else -1,
            "minutes": _plain(stats, names, "minutes"),
            "fga": _attempt(stats, names, "fieldGoalsMade-fieldGoalsAttempted"),
            "fta": _attempt(stats, names, "freeThrowsMade-freeThrowsAttempted"),
            "points": _plain(stats, names, "points"),
            "assists": _plain(stats, names, "assists"),
            "turnovers": _plain(stats, names, "turnovers"),
            "season": float(row.get("season") or 0),
        })
    return found


def _pair(raw: str, key: str) -> tuple[float | None, float | None]:
    if raw in {"", "-", "—"}:
        return None, None
    if "-" in raw and "Made-" in key:
        left, right = raw.split("-", 1)
        try:
            return float(left), float(right)
        except ValueError:
            return None, None
    try:
        return float(raw), None
    except ValueError:
        return None, None


def _plain(stats: list[Any], names: list[str], key: str) -> float:
    if key not in names:
        return -1
    index = names.index(key)
    try:
        return float(stats[index])
    except (TypeError, ValueError, IndexError):
        return -1


def _attempt(stats: list[Any], names: list[str], key: str) -> float:
    if key not in names:
        return -1
    raw = str(stats[names.index(key)] if names.index(key) < len(stats) else "")
    if "-" not in raw:
        return -1
    try:
        return float(raw.split("-", 1)[1])
    except ValueError:
        return -1


def _num(value: float) -> str:
    shown = round(float(value), 1)
    return str(int(shown)) if float(shown).is_integer() else f"{shown:.1f}"


def _mean(rows: list[dict[str, float]], key: str) -> float | None:
    vals = [row[key] for row in rows if row.get(key, -1) >= 0]
    return sum(vals) / len(vals) if vals else None


def _age(name: str, sport: str, path: tuple[str, str] | None) -> int | None:
    if not path:
        return None
    try:
        found = _search(name, path[0], path[1])
        if not found:
            return None
        page = get_json(f"https://site.web.api.espn.com/apis/common/v3/sports/{path[0]}/{path[1]}/athletes/{found[0]}", referer=_REFERER, timeout=12)
        age = (page.get("athlete") or {}).get("age")
        return int(age) if age else None
    except (RuntimeError, TypeError, ValueError):
        return None


def _outs(team: str, sport: str, path: tuple[str, str] | None) -> list[str]:
    if not path or not team:
        return []
    try:
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/{path[0]}/{path[1]}/injuries", referer=_REFERER, timeout=12)
    except RuntimeError:
        return []
    names = []
    for group in data.get("injuries") or []:
        if str(group.get("displayName") or "").casefold() != team.casefold():
            continue
        for item in group.get("injuries") or []:
            if str(item.get("status") or "").lower() != "out":
                continue
            note = f"{item.get('shortComment') or ''} {item.get('longComment') or ''}".lower()
            if "waiv" in note:
                continue
            who = str((item.get("athlete") or {}).get("displayName") or "").strip()
            if who:
                names.append(who)
    return names[:4]


def _listed(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + ", and " + names[-1]


def _noun(key: str) -> str:
    if "three" in key:
        return "threes"
    if "rebound" in key:
        return "rebounds"
    if "freeThrow" in key:
        return "free throws"
    if key in {"assists", "points", "turnovers", "steals", "blocks"}:
        return key
    return "number"


def _moved(now: float | None, then: float | None) -> bool:
    if now is None or then is None:
        return False
    base = abs(then)
    return abs(now - then) > (0.34 if base < 8 else max(0.9, base * 0.1))


def _seasons(rows: list[dict[str, float]]) -> tuple[list[dict[str, float]] | None, list[dict[str, float]] | None, list[dict[str, float]] | None]:
    years = sorted({int(row["season"]) for row in rows if row["season"]})
    if len(years) < 2:
        return None, None, None

    def take(year: int) -> list[dict[str, float]]:
        return [row for row in rows if int(row["season"]) == year]

    newest = take(years[-1])
    if len(newest) >= 5:
        now, last_year, before_year = newest, years[-2], years[-3] if len(years) > 2 else None
    elif len(years) > 2:
        now, last_year, before_year = take(years[-2]), years[-3], years[-4] if len(years) > 3 else None
    else:
        return None, None, None
    last = take(last_year) if last_year is not None else []
    before = take(before_year) if before_year is not None else None
    if len(last) < 8 or len(now) < 5:
        return None, None, None
    if before is not None and len(before) < 8:
        before = None
    return before, last, now


def _clock(newer: list[dict[str, float]], older: list[dict[str, float]]) -> str:
    now, then = _mean(newer, "minutes"), _mean(older, "minutes")
    if now is None or then is None or abs(now - then) < 2:
        return f", on the same {round(now)} minutes" if now is not None else ""
    if now > then:
        return f", with the minutes up to {round(now)} from {round(then)}"
    return f", on fewer minutes, {round(now)} from {round(then)}"


def _trade(newer: list[dict[str, float]], older: list[dict[str, float]], key: str) -> str:
    stat_now, stat_then = _mean(newer, "made"), _mean(older, "made")
    if not _moved(stat_now, stat_then):
        return ""
    up = (stat_now or 0) > (stat_then or 0)
    fields = [("attempts", "three-point attempts"), ("fga", "shots"), ("points", "points"), ("assists", "assists")] if "three" in key else [("fga", "shots"), ("fta", "free throws"), ("points", "points"), ("assists", "assists"), ("turnovers", "turnovers")]
    noun = _noun(key)
    best: tuple[float, str, float, float] | None = None
    for field, label in fields:
        if label == noun:
            continue
        now, then = _mean(newer, field), _mean(older, field)
        if not _moved(now, then):
            continue
        opposite = (now > then) != up
        score = abs(now - then) / max(abs(then), 0.5)
        score += 2 if (key == "assists") == opposite else 0
        if best is None or score > best[0]:
            best = (score, label, now, then)
    verb = "dropped to" if best and best[2] < best[3] else "went to"
    return f" while the {best[1]} {verb} {_num(best[2])} from {_num(best[3])}" if best else ""


def _mix(rows: list[dict[str, float]]) -> float | None:
    attempts, goals = _mean(rows, "attempts"), _mean(rows, "fga")
    if attempts is None or goals is None or goals <= 0 or abs(attempts - goals) < 1:
        return None
    return attempts / goals * 100


def _shift(newer: list[dict[str, float]], older: list[dict[str, float]], key: str, when: str, clock: bool) -> str:
    stat_now, stat_then = _mean(newer, "made"), _mean(older, "made")
    if not _moved(stat_now, stat_then):
        return ""
    side = _trade(newer, older, key)
    stamp = _clock(newer, older)
    if not clock and stamp.startswith(", on the same"):
        stamp = ""
    bits = [f"{when} the {_noun(key)} went to {_num(stat_now or 0)} from {_num(stat_then or 0)}{side}{stamp}."]
    if key == "assists" and "turnovers" not in side and (stat_now or 0) > (stat_then or 0):
        now, then = _mean(newer, "turnovers"), _mean(older, "turnovers")
        if _moved(now, then):
            bits.append(f"Turnovers rose with them, to {_num(now or 0)} from {_num(then or 0)}.")
    if key == "assists" and "points" not in side:
        now, then = _mean(newer, "points"), _mean(older, "points")
        if now is not None and then is not None and not _moved(now, then):
            bits.append(f"The points stayed around {round((now + then) / 2)}.")
        elif _moved(now, then):
            bits.append(f"The points went to {_num(now or 0)} from {_num(then or 0)}.")
    if "three" in key:
        mix_now, mix_then = _mix(newer), _mix(older)
        if mix_now is not None and mix_then is not None and abs(mix_now - mix_then) >= 5:
            bits.append(f"Threes went to {round(mix_now)}% of the shots from {round(mix_then)}%.")
    return " ".join(bits)


def _slice(rows: list[dict[str, float]], season: list[dict[str, float]], key: str) -> str:
    lines = []
    field = "attempts" if "three" in key else "fga"
    word = "three-point attempts" if "three" in key else "shots"
    for count, label in ((10, "last 10"), (3, "last 3")):
        if len(rows) < count or len(season) <= count:
            continue
        recent = rows[:count]
        stat_now, stat_then = _mean(recent, "made"), _mean(season, "made")
        mins, base = _mean(recent, "minutes"), _mean(season, "minutes")
        if not _moved(stat_now, stat_then):
            if count == 10 and mins is not None and base is not None and abs(mins - base) >= 3:
                lines.append(f"The last 10 are still {_num(stat_now or 0)} {_noun(key)}, with the minutes at {round(mins)}.")
            continue
        shot_now, shot_then = _mean(recent, field), _mean(season, field)
        shot = f" on {_num(shot_now or 0)} {word}" if _moved(shot_now, shot_then) else ""
        clock = f", at {round(mins)} minutes" if mins is not None else ""
        verb = "fell to" if (stat_now or 0) < (stat_then or 0) else "went to"
        if count == 3 and lines and (stat_now or 0) > (stat_then or 0):
            continue
        lines.append(f"The {label} {verb} {_num(stat_now or 0)} {_noun(key)}{shot}{clock}.")
        if count == 10:
            break
    return " ".join(lines)


def _brief(name: str, sport: str, path: tuple[str, str] | None, pack: dict[str, Any] | None, rows: list[dict[str, float]], key: str) -> str:
    before, last, now = _seasons(rows)
    if not last or not now:
        return ""
    earlier = _shift(last, before, key, "Last season", True) if before else ""
    current = _shift(now, last, key, "This season", not earlier)
    again = ""
    if before and current and not _moved(_mean(now, "made"), _mean(before, "made")) and _moved(_mean(last, "made"), _mean(before, "made")):
        field = "attempts" if "three" in key else "fga"
        word = "three-point attempts" if "three" in key else "shots"
        prior = _mean(before, field)
        again = f"The season before that already had {_num(_mean(before, 'made') or 0)}{f' on {_num(prior)} {word}' if prior is not None else ''}."
    bits = [line for line in (earlier, current, again, _slice(rows, now, key)) if line]
    if not bits:
        return ""
    if len(now) < 15 and current:
        outs = _outs(str((pack or {}).get("team") or ""), sport, path)
        if outs:
            count = {5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten"}.get(len(now), str(len(now)))
            bits.append(f"{_listed(outs)} are out. {count} games is too early to pin this on them.")
    made_now, made_all = _mean(now, "made"), _mean(rows, "made")
    if made_now is not None and made_all is not None and made_now < made_all and len(now) >= 25:
        age = _age(name, sport, path)
        if age is not None and age >= 33:
            bits.append(f"Age {age}, and the number has been down for a while.")
    return " ".join(bits)


def _mates(sport: str, player: str, names: list[str]) -> str:
    path = _PATH.get(sport)
    home = str((_career(sport, path, player) or {}).get("team") or "")
    bits = []
    for raw in names[:2]:
        name = str(raw or "").strip()
        pack = _career(sport, path, name) if name else None
        team = str((pack or {}).get("team") or "")
        if not pack or (home and team and team.casefold() != home.casefold()):
            continue
        rows = _games(pack, "points")
        seasons = _seasons(rows) if len(rows) >= 20 else (None, None, None)
        last, now = (seasons[1], seasons[2]) if seasons else (None, None)
        now_pts, then_pts = _mean(now or [], "made"), _mean(last or [], "made")
        if now_pts is None or then_pts is None:
            continue
        if not _moved(now_pts, then_pts):
            bits.append(f"{name}'s points stayed around {_num(now_pts)}.")
        elif now_pts > then_pts:
            bits.append(f"{name}'s points went up to {_num(now_pts)} from {_num(then_pts)}.")
        else:
            bits.append(f"{name}'s points went to {_num(now_pts)} from {_num(then_pts)}.")
    return " ".join(bits)


def _main() -> None:
    body = json.load(sys.stdin)
    if body.get("mates"):
        json.dump({"why": _mates(str(body.get("sport") or ""), str(body.get("name") or ""), list(body.get("mates") or []))}, sys.stdout)
        return
    json.dump(explain(str(body.get("name") or ""), str(body.get("text") or ""), str(body.get("sport") or "")), sys.stdout)


if __name__ == "__main__":
    _main()
