"""Same-game yardage parlays: a quarterback, his receiver, a back, and the over or the back's touchdown, each on a line he clears most weeks."""

from __future__ import annotations

import re
from itertools import combinations
from typing import Any

from nfl_bets.hedge import implied_prob
from nfl_bets.stack_read import _count, _pack
from nfl_bets.stack_team import count as team_count, load as team_load
from nfl_bets.sway import _cache

_STATS = {"Alt Passing Yds": "Passing yards", "Alt Receiving Yds": "Receiving yards", "Alt Receptions": "Receptions", "Alt Rushing Yds": "Rushing yards"}
_JOBS = {
    "Passing yards": "The throws his receiver needs.",
    "Receiving yards": "Catches on those throws.",
    "Receptions": "The catches those throws find.",
    "Rushing yards": "The yards on the ground.",
    "The over": "The points those yards turn into.",
    "Anytime touchdown": "The carries that end in the end zone.",
    "The spread": "The result those yards build.",
}
_FLOOR = {"Passing yards": 150, "Receiving yards": 20, "Receptions": 3, "Rushing yards": 20}
_SHARE = 0.8


def build(games: list[dict[str, Any]], loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]], end: str = "over", floor: float = 0.0, catches: str = "Receiving yards", need: int = 2) -> list[dict[str, Any]]:
    nfl = [(game, legs) for game, legs in loaded if str(game.get("sport") or "") == "NFL"]
    if not nfl:
        return []
    cache = _cache()
    by_last: dict[str, list[str]] = {}
    for key, pack in cache.items():
        sport, _, who = key.partition("|")
        if sport == "NFL" and who and "|" not in who and isinstance(pack, dict) and pack.get("rows"):
            by_last.setdefault(who.split()[-1], []).append(who)
    logs = team_load(games)
    picked = []
    for game, legs in nfl:
        match = str(game.get("match") or "")
        best: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]] = {}
        sure: dict[tuple[str, str], tuple[dict[str, Any], dict[str, Any]]] = {}
        for leg in legs:
            who, _, tail = str(leg.get("market") or "").partition(" - ")
            stat = _STATS.get(tail)
            odds = int(leg["odds"])
            line = re.search(r"(\d+)\+", str(leg.get("runner") or ""))
            safe = bool(floor) and odds >= -2500 and implied_prob(float(odds)) >= floor
            if not stat or not line or int(line.group(1)) < _FLOOR[stat] or not (-500 <= odds <= -150 or safe):
                continue
            read = _count(str(leg.get("label") or ""), "NFL", cache, by_last)
            if not read or read["hits"] < _SHARE * read["games"]:
                continue
            pool = sure if safe else best
            prev = pool.get((stat, who))
            if prev is None or odds > int(prev[0]["odds"]):
                pool[(stat, who)] = (leg, read)
        best.update(sure)

        def team_of(who: str) -> str:
            pack = _pack(who, "NFL", cache, by_last) or {}
            return str(pack.get("team") or "")

        def side(stat: str, team: str) -> list[tuple[str, dict[str, Any], dict[str, Any]]]:
            rows = [(stat, leg, read) for (kind, who), (leg, read) in best.items() if kind == stat and team_of(who) == team and (need < 3 or implied_prob(float(leg["odds"])) >= floor)]
            return sorted(rows, key=lambda row: row[2]["hits"] / row[2]["games"] - implied_prob(float(row[1]["odds"])), reverse=True)

        over = None
        for leg in legs:
            runner = str(leg.get("runner") or "")
            line = re.search(r"Over \((\d+(?:\.\d+)?)\)", runner)
            odds = int(leg["odds"])
            low = need >= 4 and odds >= -2500 and implied_prob(float(odds)) >= floor
            if str(leg.get("market") or "") != "Alternate Total Points" or not line or not (-450 <= odds <= -150 or low):
                continue
            label = f"Over {float(line.group(1)):g} total points"
            read = team_count(label, game, logs)
            if read and read["hits"] >= _SHARE * read["games"] and (need < 4 or low) and (over is None or odds > int(over[1]["odds"])):
                over = ("The over", {**leg, "label": label}, read)

        def who_of(row: tuple[str, dict[str, Any], dict[str, Any]]) -> str:
            return str(row[1].get("market") or "").partition(" - ")[0]

        def score(who: str) -> tuple[str, dict[str, Any], dict[str, Any]] | None:
            leg = next((leg for leg in legs if leg.get("market") == "Any Time Touchdown Scorer" and str(leg.get("runner") or "").strip() == who), None)
            if not leg or int(leg["odds"]) > 150:
                return None
            label = f"{who} anytime touchdown"
            read = _count(label, "NFL", cache, by_last)
            if not read or read["hits"] / read["games"] <= implied_prob(float(leg["odds"])):
                return None
            return ("Anytime touchdown", {**leg, "label": label}, read)

        def cover(team: str) -> tuple[str, dict[str, Any], dict[str, Any]] | None:
            found = None
            for leg in legs:
                parsed = re.fullmatch(r"(.+?)\s+\(([+-]?\d+(?:\.\d+)?)\)", str(leg.get("runner") or "").strip())
                odds = int(leg["odds"])
                if str(leg.get("market") or "") != "Alternate Spread" or not parsed or parsed.group(1) != team or not -500 <= odds <= -150:
                    continue
                label = f"{team} {float(parsed.group(2)):+g} spread"
                read = team_count(label, game, logs)
                if read and read["hits"] >= _SHARE * read["games"] and (found is None or odds > int(found[1]["odds"])):
                    found = ("The spread", {**leg, "label": label}, read)
            return found

        teams = [str(game.get("homeName") or ""), str(game.get("awayName") or "")]
        for team in teams:
            other = next((name for name in teams if name != team), "")
            arms = side("Passing yards", team)[:1]
            spread = cover(team) if end == "spread" else None
            if not arms or (end == "spread" and not spread):
                continue
            runs = (side("Rushing yards", team)[:1] + side("Rushing yards", other)[:1])[:2]
            for catch in side(catches, team)[:2]:
                for run in runs:
                    if who_of(catch) == who_of(run):
                        continue
                    last = spread or over or score(who_of(run))
                    rows = arms + [catch, run] + ([last] if last else [])
                    if floor and (sum(1 for _stat, leg, _read in rows if implied_prob(float(leg["odds"])) >= floor) < need or (need > 2 and len(rows) < 4)):
                        continue
                    edge = sum(read["hits"] / read["games"] - implied_prob(float(leg["odds"])) for _stat, leg, read in rows)
                    bets = [
                        {"kind": "Same-game parlay", "rung": stat, "label": str(leg.get("label") or ""), "odds": int(leg["odds"]), "stake": 5, "job": _JOBS[stat], "game": match}
                        for stat, leg, _read in rows
                    ]
                    picked.append((-edge, {"game": match, "bets": bets}))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def mixed(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    """A back's catches, a receiver's yards, and a third player's touchdown, each beating FanDuel's price lately."""
    nfl = [(game, legs) for game, legs in loaded if str(game.get("sport") or "") == "NFL"]
    if not nfl:
        return []
    cache = _cache()
    by_last: dict[str, list[str]] = {}
    for key, pack in cache.items():
        sport, _, who = key.partition("|")
        if sport == "NFL" and who and "|" not in who and isinstance(pack, dict) and pack.get("rows"):
            by_last.setdefault(who.split()[-1], []).append(who)
    picked = []
    for game, legs in nfl:
        match = str(game.get("match") or "")
        tails: dict[str, set[str]] = {}
        for leg in legs:
            who, _, tail = str(leg.get("market") or "").partition(" - ")
            tails.setdefault(who, set()).add(tail)
        throwers = {who for who, kinds in tails.items() if kinds & {"Alt Passing Yds", "Passing Yds"}}
        backs = {who for who, kinds in tails.items() if kinds & {"Alt Rushing Yds", "Rushing Yds"} and who not in throwers}
        catchers = {who for who, kinds in tails.items() if kinds & {"Alt Receiving Yds", "Receiving Yds"} and who not in throwers}

        def pick(tail: str, group: set[str], low: int, high: int) -> list[tuple[float, str, str, int]]:
            rows = []
            for leg in legs:
                who, _, kind = str(leg.get("market") or "").partition(" - ")
                if tail == "Any Time Touchdown Scorer":
                    who, kind = str(leg.get("runner") or "").strip(), str(leg.get("market") or "")
                label = f"{who} anytime touchdown" if tail == "Any Time Touchdown Scorer" else str(leg.get("label") or "")
                odds = int(leg["odds"])
                if kind != tail or who not in group or not low <= odds <= high or (tail != "Any Time Touchdown Scorer" and " Over " not in f" {label} "):
                    continue
                read = _count(label, "NFL", cache, by_last)
                if read and read["hits"] / read["games"] > implied_prob(float(odds)):
                    rows.append((read["hits"] / read["games"] - implied_prob(float(odds)), who, label, odds))
            return sorted(rows, reverse=True)

        found = []
        for back in pick("Total Receptions", backs, -200, 150)[:2]:
            for wide in pick("Receiving Yds", catchers - backs, -200, 150)[:3]:
                for score in pick("Any Time Touchdown Scorer", catchers, 150, 500)[:4]:
                    if len({back[1], wide[1], score[1]}) < 3:
                        continue
                    rows = [("Back receptions", back, "The back's catches out of the backfield."), ("Receiver yards", wide, "The receiver's yards on his main line."), ("Anytime touchdown", score, "The long shot that pays the ticket.")]
                    bets = [{"kind": "Same-game parlay", "rung": rung, "label": row[2], "odds": row[3], "stake": 5, "job": job, "game": match} for rung, row, job in rows]
                    found.append((-sum(row[0] for _rung, row, _job in rows), {"game": match, "bets": bets}))
        found.sort(key=lambda item: item[0])
        picked.extend(found[:3])
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]


def scorers(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]], count: int = 2) -> list[dict[str, Any]]:
    nfl = [(game, legs) for game, legs in loaded if str(game.get("sport") or "") == "NFL"]
    if not nfl:
        return []
    cache = _cache()
    by_last: dict[str, list[str]] = {}
    for key, pack in cache.items():
        sport, _, who = key.partition("|")
        if sport == "NFL" and who and "|" not in who and isinstance(pack, dict) and pack.get("rows"):
            by_last.setdefault(who.split()[-1], []).append(who)
    picked = []
    for game, legs in nfl:
        match = str(game.get("match") or "")
        live = []
        for leg in legs:
            who = str(leg.get("runner") or "").strip()
            odds = int(leg["odds"])
            if leg.get("market") != "Any Time Touchdown Scorer" or not -250 <= odds <= 300:
                continue
            label = f"{who} anytime touchdown"
            read = _count(label, "NFL", cache, by_last)
            if read and read["hits"] / read["games"] > implied_prob(float(odds)):
                live.append((read["hits"] / read["games"] - implied_prob(float(odds)), label, odds))
        live.sort(reverse=True)
        jobs = {
            2: ("One of the two touchdowns.", "The other one. Both have to score."),
            3: ("One of the three touchdowns.", "The second one.", "The third one. All three have to score."),
            4: ("One of the four touchdowns.", "The second one.", "The third one.", "The fourth one. All four have to score."),
            5: ("One of the five touchdowns.", "The second one.", "The third one.", "The fourth one.", "The fifth one. All five have to score."),
        }[count]
        for group in sorted(combinations(live, count), key=lambda rows: sum(row[0] for row in rows), reverse=True)[:3]:
            bets = [
                {"kind": "Same-game parlay", "rung": "Anytime touchdown", "label": row[1], "odds": row[2], "stake": 5, "job": jobs[index], "game": match}
                for index, row in enumerate(group)
            ]
            picked.append((-sum(row[0] for row in group), {"game": match, "bets": bets}))
    picked.sort(key=lambda item: item[0])
    return [item[1] for item in picked]
