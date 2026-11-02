"""Grade a pasted bet against the live box score."""
from __future__ import annotations

import json
import math
import re
import sys
from datetime import datetime, timedelta
from typing import Any

from zoneinfo import ZoneInfo

from nfl_bets.archive import (
    _PATHS,
    _compare,
    _final,
    _find_event,
    _grade_leg,
    _player_stat,
    _same_player,
    _comps,
    _started,
    _stat,
    _summary_for,
)
from nfl_bets.http_util import get_json

_ET = ZoneInfo("America/New_York")
_SPORTS = ("NFL", "NBA", "NHL", "MLB", "WNBA", "NCAAF")


def grade(legs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for raw in legs:
        if isinstance(raw, dict) and str(raw.get("player") or raw.get("market") or "").strip():
            out.append(_one(raw))
    return out


def _one(raw: dict[str, Any]) -> dict[str, Any]:
    leg = _prepare(raw)
    _attach(leg)
    summary = _summary_for(leg) if leg.get("espnId") or (leg.get("match") and leg.get("kickoff")) else None
    if summary and not _started(summary):
        leg["result"] = "open"
        leg["say"] = "The game has not started."
    elif leg.get("side") == "win":
        _winner(leg, summary)
    elif leg.get("stat") == "anytime":
        _anytime(leg, summary)
    else:
        _grade_leg(leg)
        leg["say"] = _say(leg)
    _odds(leg, summary)
    return _view(leg)


def _prepare(raw: dict[str, Any]) -> dict[str, Any]:
    player = str(raw.get("player") or "").strip()
    market = str(raw.get("market") or "").strip()
    text = f"{market} {raw.get('label') or ''}"
    side = str(raw.get("side") or "").lower()
    try:
        line = float(raw.get("line"))
    except (TypeError, ValueError):
        line = None
    anytime = bool(re.search(r"any\s*time|anytime|to score", text, re.I) and re.search(r"touchdown|\btd\b", text, re.I) and not re.search(r"rush|receiv|pass", text, re.I))
    if anytime:
        stat, side, line = "anytime", "plus", 1.0
        market = market or "anytime touchdown"
    elif re.search(r"to win|moneyline", market, re.I):
        stat, side = "", "win"
    else:
        stat = _stat(text)
        if side not in {"over", "under", "plus", "win"}:
            side = "plus" if re.search(r"\d+\s*\+", text) else "over"
        if line is None:
            found = re.search(r"(\d+(?:\.\d+)?)", text)
            line = float(found.group(1)) if found else None
    sport = str(raw.get("sport") or "").upper()
    if sport not in _PATHS:
        sport = ""
    return {
        "player": player, "market": market, "side": side, "line": line, "stat": stat, "scope": "game",
        "sport": sport or str(raw.get("sport") or ""), "match": str(raw.get("match") or ""),
        "when": str(raw.get("when") or "")[:10], "kickoff": str(raw.get("kickoff") or ""),
        "espnId": str(raw.get("espnId") or ""), "label": f"{player} {market}",
    }


def _attach(leg: dict[str, Any]) -> None:
    if leg.get("espnId") and leg.get("sport") in _PATHS:
        if not leg.get("kickoff") and leg.get("when"):
            leg["kickoff"] = f"{leg['when']}T17:00:00-05:00"
        return
    sports = [leg["sport"]] if leg.get("sport") in _PATHS else list(_SPORTS)
    for sport in sports:
        path = _PATHS[sport]
        for day in _days(leg.get("when") or ""):
            kick = f"{day}T17:00:00-05:00"
            match = leg.get("match") or ""
            espn = _find_event(path, match, kick) if match else ""
            if not espn and leg.get("player"):
                espn = _find_player(path, day, str(leg["player"]))
            if espn:
                leg["sport"], leg["espnId"], leg["kickoff"] = sport, espn, kick
                return


def _days(when: str) -> list[str]:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", when or ""):
        day = datetime.strptime(when, "%Y-%m-%d")
        return [(day + timedelta(days=offset)).strftime("%Y%m%d") for offset in (0, -1, 1)]
    now = datetime.now(_ET)
    return [(now + timedelta(days=offset)).strftime("%Y%m%d") for offset in range(-1, 8)]


def _find_player(path: str, day: str, player: str) -> str:
    url = f"https://site.web.api.espn.com/apis/site/v2/sports/{path}/scoreboard?dates={day}"
    try:
        data = get_json(url, referer="https://www.espn.com/")
    except Exception:
        return ""
    checked = 0
    for event in (data or {}).get("events") or []:
        if checked >= 8:
            break
        espn = str(event.get("id") or "")
        if not espn:
            continue
        checked += 1
        summary = _summary_for({"sport": _sport_for(path), "espnId": espn, "match": "x @ y", "kickoff": f"{day[:4]}-{day[4:6]}-{day[6:]}T17:00:00-05:00"})
        if summary and _named(summary, player):
            return espn
    return ""


def _sport_for(path: str) -> str:
    for sport, value in _PATHS.items():
        if value == path and sport in _SPORTS:
            return sport
    return ""


def _named(summary: dict[str, Any], player: str) -> bool:
    for team in (summary.get("boxscore") or {}).get("players") or []:
        for block in team.get("statistics") or []:
            for athlete in block.get("athletes") or []:
                name = str((athlete.get("athlete") or {}).get("displayName") or "")
                if _same_player(name, player):
                    return True
    return False


def _anytime(leg: dict[str, Any], summary: dict[str, Any] | None) -> None:
    if not summary:
        leg["result"] = "open"
        leg["say"] = "Waiting on the game."
        return
    rush = _player_stat(summary, str(leg.get("player") or ""), "rushingTouchdowns")
    rec = _player_stat(summary, str(leg.get("player") or ""), "receivingTouchdowns")
    if rush is None and rec is None:
        leg["result"] = "open"
        leg["say"] = "Waiting on the game."
        return
    if not _named(summary, str(leg.get("player") or "")):
        leg["result"] = "open"
        leg["say"] = "Waiting on the game."
        return
    have = (rush or 0) + (rec or 0)
    leg["have"] = have
    leg["result"] = _compare(have, 1, "plus", _final(summary))
    leg["say"] = _say(leg)


def _say(leg: dict[str, Any]) -> str:
    state = str(leg.get("result") or "")
    if state == "won":
        return "Reached."
    if state == "lost":
        return "Missed."
    if state == "push":
        return "Push."
    have = leg.get("have")
    if isinstance(have, (int, float)):
        shown = int(have) if float(have).is_integer() else round(float(have), 1)
        return f"Not yet, {shown}."
    return "Waiting on the game."


def _nice(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" -")
    return text.title() if text.isupper() else text


def _winner(leg: dict[str, Any], summary: dict[str, Any] | None) -> None:
    rows = []
    for side in ((_comps(summary).get("competitors") or []) if summary else []):
        team = side.get("team") or {}
        names = " ".join(str(team.get(key) or "") for key in ("displayName", "shortDisplayName", "name", "abbreviation")).lower()
        short = str(team.get("shortDisplayName") or team.get("displayName") or "")
        try:
            score = float(side.get("score"))
        except (TypeError, ValueError):
            score = None
        rows.append((names, score, short))
    want = f"{leg.get('player') or ''} {leg.get('market') or ''}".lower()
    mine = next((row for row in rows if any(word in row[0] for word in re.findall(r"[a-z0-9]+", want) if len(word) > 3)), None)
    other = next((row for row in rows if row is not mine), None)
    if not mine or mine[1] is None or not other or other[1] is None:
        leg["result"], leg["say"] = "open", "Waiting on the game."
        return
    leg["have"] = mine[1]
    if not _final(summary):
        leg["result"] = "open"
        leg["say"] = f"Not yet. {mine[2]} {int(mine[1])}, {other[2]} {int(other[1])}."
        return
    leg["result"] = "won" if mine[1] > other[1] else "lost" if mine[1] < other[1] else "push"
    leg["say"] = _say(leg)


def _phrase(leg: dict[str, Any]) -> str:
    player, market = _nice(leg.get("player")), _nice(leg.get("market")) or "the bet"
    if leg.get("side") == "win" or re.search(r"to win", market, re.I):
        who = player or re.sub(r"\bto win\b", "", market, flags=re.I).strip()
        return f"{who} to win".strip()
    if leg.get("stat") == "anytime" or leg.get("side") == "plus":
        return f"{player} {market}".strip()
    if re.match(r"^(over|under)\b", market, re.I):
        return market if player.lower() in market.lower() else f"{player} {market}".strip()
    line = leg.get("line")
    shown = int(line) if isinstance(line, float) and line.is_integer() else line
    word = "under" if leg.get("side") == "under" else "over"
    body = f"{word} {shown} {market}".strip() if shown is not None else market
    return body if player.lower() in body.lower() else f"{player} {body}".strip()


def _of(have: float, line: float) -> str:
    show = lambda num: int(num) if float(num).is_integer() else round(float(num), 1)
    return f"{show(have)} of {show(line)}"


def _gone(summary: dict[str, Any] | None, sport: str) -> float | None:
    if not summary:
        return None
    if _final(summary):
        return 1.0
    if not _started(summary):
        return 0.0
    status = _comps(summary).get("status") or {}
    if sport == "MLB":
        inning = int(status.get("period") or 0)
        return None if inning < 1 else min(0.99, (inning - 1) / 9)
    length = {"NBA": (4, 720, 300), "WNBA": (4, 600, 300), "NHL": (3, 1200, 300)}.get(sport, (4, 900, 600))
    regs, span, extra = length
    period = int(status.get("period") or 0)
    bits = [int(part) for part in str(status.get("displayClock") or "0:00").split(":") if part.isdigit()]
    left = bits[0] * 60 + bits[1] if len(bits) >= 2 else 0
    if period < 1:
        return None
    if period <= regs:
        elapsed = (period - 1) * span + max(0, span - left)
        return min(0.99, elapsed / (regs * span))
    return min(0.99, (regs * span + max(0, extra - left)) / (regs * span + extra))


def _clip(prob: float) -> int:
    return min(99, max(1, int(round(100 * prob))))


def _box(summary: dict[str, Any], player: str, names: tuple[str, ...]) -> float | None:
    want = set(names)
    for team in (summary.get("boxscore") or {}).get("players") or []:
        for block in team.get("statistics") or []:
            columns = [str(item).lower().replace(" ", "") for item in (block.get("keys") or block.get("names") or block.get("labels") or [])]
            index = next((i for i, col in enumerate(columns) if col in want), None)
            if index is None:
                continue
            for athlete in block.get("athletes") or []:
                if not _same_player(str((athlete.get("athlete") or {}).get("displayName") or ""), player):
                    continue
                stats = athlete.get("stats") or []
                if index >= len(stats):
                    return None
                try:
                    return float(stats[index])
                except (TypeError, ValueError):
                    return None
    return None


def _blend(seen: float, prior: float, gone: float) -> float:
    elapsed = max(gone, 0.02)
    weight = elapsed / (elapsed + 0.35)
    return weight * seen + (1 - weight) * prior


def _over(mean: float, line: float, sigma: float, under: bool) -> int:
    z = (line - mean) / sigma if sigma else 0
    cdf = 0.5 * (1 + math.erf(z / math.sqrt(2)))
    return _clip(cdf if under else 1 - cdf)


def _at_least(lam: float, need: int) -> int:
    if need <= 0:
        return 100
    term = total = math.exp(-max(lam, 0))
    for k in range(1, need):
        term *= lam / k
        total += term
    return _clip(1 - total)


def _live_stat(leg: dict[str, Any], have: float, line: float, gone: float, summary: dict[str, Any] | None) -> int:
    player, stat, under = str(leg.get("player") or ""), str(leg.get("stat") or ""), leg.get("side") == "under"
    elapsed = max(gone, 0.02)
    carries = _box(summary, player, ("rushingattempts",)) if summary else None
    targets = _box(summary, player, ("receivingtargets",)) if summary else None
    catches = _box(summary, player, ("receptions",)) if summary else None
    if stat == "anytime" or leg.get("side") == "plus":
        touches = (carries or 0) + (catches or 0)
        full = _blend(touches / elapsed, 12 if line <= 1 else max(line * 8, 12), gone)
        return _at_least(max(1, full - touches) * 0.045, int(math.ceil(line - have)))
    if stat == "rushingYards" and carries:
        ypc = (have + 4.2 * 6) / (carries + 6)
        full = _blend(carries / elapsed, max(line / 4.2, 8), gone)
        remain = max(0.5, full - carries)
        return _over(have + remain * ypc, line, max(8, 7 * math.sqrt(remain)), under)
    if stat in {"receptions", "receivingYards"} and targets:
        each = 0.68 if stat == "receptions" else 8
        rate = ((have + each * 4) / (targets + 4))
        full = _blend(targets / elapsed, max(line / each, 3), gone)
        remain = max(0.4, full - targets)
        wide = 0.85 if stat == "receptions" else 9
        return _over(have + remain * rate, line, max(0.8, wide * math.sqrt(remain)), under)
    prior = float(line)
    rate = (gone / (gone + 0.45)) * (have / elapsed) + (1 - gone / (gone + 0.45)) * prior
    remain = max(1 - elapsed, 0.01)
    wide = {"receivingYards": 26, "passingYards": 55, "points": 8, "rebounds": 3.2, "assists": 2.4}.get(stat, max(abs(prior) * 0.35, 1))
    return _over(have + rate * remain, line, wide * math.sqrt(remain), under)


def _live_win(leg: dict[str, Any], summary: dict[str, Any], gone: float) -> int:
    want = f"{leg.get('player') or ''} {leg.get('market') or ''}".lower()
    home = None
    for side in _comps(summary).get("competitors") or []:
        team = side.get("team") or {}
        names = " ".join(str(team.get(key) or "") for key in ("displayName", "shortDisplayName", "name")).lower()
        if any(word in names for word in re.findall(r"[a-z0-9]+", want) if len(word) > 3):
            home = str(side.get("homeAway") or "") == "home"
            break
    board = summary.get("winprobability") or []
    last = board[-1] if isinstance(board, list) and board else {}
    if home is not None and isinstance(last, dict) and last.get("homeWinPercentage") is not None:
        share = float(last["homeWinPercentage"])
        return _clip(share if home else 1 - share - float(last.get("tiePercentage") or 0))
    margin = float(leg.get("have") or 0)
    other = 0
    return _clip(0.5 * (1 + math.erf(((margin - other) ) / (14 * math.sqrt(max(1 - gone, 0.05)) * math.sqrt(2)))))


def _odds(leg: dict[str, Any], summary: dict[str, Any] | None) -> None:
    result = str(leg.get("result") or "")
    have, line = leg.get("have"), leg.get("line")
    if result == "won":
        leg["chance"] = 100
    elif result == "lost":
        leg["chance"] = 0
    elif result == "push":
        leg["chance"] = 100
    else:
        gone = _gone(summary, str(leg.get("sport") or "NFL"))
        if gone is None:
            return
        if gone <= 0:
            leg["chance"] = 50
        elif leg.get("side") == "win":
            leg["chance"] = _live_win(leg, summary or {}, gone)
        elif isinstance(have, (int, float)) and isinstance(line, (int, float)):
            leg["chance"] = _live_stat(leg, float(have), float(line), gone, summary)
    _note(leg, summary)
    if summary and _started(summary):
        leg["clock"] = _left(summary, str(leg.get("sport") or "NFL"))


def _view(leg: dict[str, Any]) -> dict[str, Any]:
    return {
        "player": leg.get("player") or "", "market": leg.get("market") or "", "side": leg.get("side") or "",
        "line": leg.get("line"), "match": leg.get("match") or "", "when": leg.get("when") or "",
        "sport": leg.get("sport") if leg.get("sport") in _PATHS else "", "espnId": leg.get("espnId") or "",
        "kickoff": leg.get("kickoff") or "", "have": leg.get("have"), "result": leg.get("result") or "open",
        "say": leg.get("say") or _say(leg), "text": _phrase(leg), "pace": leg.get("pace") or "",
        "chance": leg.get("chance"), "clock": leg.get("clock") or "",
    }


def _count(n: float, one: str, many: str) -> str:
    shown = int(n)
    return f"{shown} {one if shown == 1 else many}"


def _left(summary: dict[str, Any], sport: str) -> str:
    if _final(summary):
        return "Final"
    status = _comps(summary).get("status") or {}
    period = int(status.get("period") or 0)
    clock = str(status.get("displayClock") or "")
    word = "period" if sport == "NHL" else "quarter"
    names = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}
    label = "Overtime" if period > (3 if sport == "NHL" else 4) else f"{names.get(period, period)} {word}"
    return f"{label}, {clock} left" if clock else label


def _note(leg: dict[str, Any], summary: dict[str, Any] | None) -> None:
    have, line = leg.get("have"), leg.get("line")
    if leg.get("side") == "win" or not isinstance(have, (int, float)) or not isinstance(line, (int, float)):
        return
    base = _of(float(have), float(line))
    player, stat = str(leg.get("player") or ""), str(leg.get("stat") or "")
    carries = _box(summary, player, ("rushingattempts",)) if summary else None
    targets = _box(summary, player, ("receivingtargets",)) if summary else None
    catches = _box(summary, player, ("receptions",)) if summary else None
    if stat == "rushingYards" and carries:
        leg["pace"] = f"{base} on {_count(carries, 'carry', 'carries')}"
    elif stat in {"receptions", "receivingYards"} and targets:
        leg["pace"] = f"{base} on {_count(targets, 'target', 'targets')}"
    elif stat == "anytime" or leg.get("side") == "plus":
        bits = [bit for bit in (_count(carries, "carry", "carries") if carries else "", _count(catches, "reception", "receptions") if catches else "") if bit]
        leg["pace"] = f"{base}. {', '.join(bits)}" if bits else base
    else:
        leg["pace"] = base


if __name__ == "__main__":
    body = json.load(sys.stdin)
    json.dump({"legs": grade(body.get("legs") or [])}, sys.stdout)
