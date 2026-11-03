"""The read on a gold anytime price: the job, the script, and what is rare on this page."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from time import time
from typing import Any

from nfl_bets.http_util import get_json
from nfl_bets.store import load_board, out_dir, read_json, write_json
from nfl_bets.td_few import _ALIAS, _CLUBS, _mark, _opponent, _outs
from nfl_bets.td_read import _last, _season
from nfl_bets.zone import plays, positions

_REFERER = "https://www.espn.com/"
_TTL = 6 * 3600
_CACHE = "td_dive.json"

def dive(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pack = plays()
    spots = positions()
    league = _league(pack)
    board = load_board()
    abbrs = {str(fact.get("team") or "") for fact in facts}
    abbrs |= {_opponent(str(fact.get("team") or ""), str(fact.get("match") or "")) for fact in facts}
    coaches = _coaches({abbr for abbr in abbrs if abbr})
    built = [_one(fact, pack, league, board, coaches, spots) for fact in facts]
    _summaries(built)
    return [{"name": row["name"], "summary": row["summary"], "line": row["summary"], "parts": row["parts"]} for row in built]

def _one(fact: dict[str, Any], pack: dict[str, Any], league: dict[str, float], board: dict[str, Any], coaches: dict[str, str], spots: dict[str, str]) -> dict[str, Any]:
    team = _ALIAS.get(str(fact.get("team") or ""), str(fact.get("team") or ""))
    match = str(fact.get("match") or "")
    opp = _opponent(team, match)
    player = _find(pack.get("players") or {}, str(fact.get("name") or ""))
    club = (pack.get("teams") or {}).get(_full(team)) or {}
    foe = (pack.get("stops") or {}).get(_full(opp)) or {}
    script, script_mark = _script(fact, club, board, team)
    role, role_mark = _role(fact, player, club)
    history, gap, blank = _history(fact)
    mates = pack.get("players") or {}
    red, red_share = _red(fact, player, club, mates, spots)
    goal, goal_share = _goal(fact, player, club, foe, opp, board, mates, spots)
    defense, front = _defense(fact, foe, league, opp, board)
    staff = _staff(fact, club, foe, league, coaches, team, opp, board)
    parts = [part for part in (script, role, history, red, goal, defense, staff) if part]
    return {"name": fact.get("name") or "", "parts": parts, "summary": "", "role": role_mark, "blank": blank, "gap": gap, "goal": goal_share, "script": script_mark, "red": red_share, "front": front, "hist": (history or {}).get("text") or ""}

def _script(fact: dict[str, Any], club: dict[str, Any], board: dict[str, Any], team: str) -> tuple[dict[str, str] | None, str]:
    rush, thrown = int(club.get("rush") or 0), int(club.get("tgt") or 0)
    called = rush + thrown
    if called < 30:
        return None, ""
    pass_pct = _pct(thrown, called) or 0
    run_pct = 100 - pass_pct
    nick = _nick(_game(board, str(fact.get("match") or "")), team)
    who = _last(str(fact.get("name") or ""))
    gl_plays, gl_run = int(club.get("glPlays") or 0), int(club.get("glRun") or 0)
    if pass_pct >= 58:
        opening, lean = f"The {nick} throw it on {pass_pct}% of snaps.", "pass"
    elif run_pct >= 58:
        opening, lean = f"The {nick} run it on {run_pct}% of snaps.", "run"
    else:
        opening, lean = f"The {nick} are close to even, {pass_pct}% pass and {run_pct}% run.", ""
    goal_lean = ""
    goal = ""
    if gl_plays >= 8 and gl_run >= 65:
        goal, goal_lean = f"Inside the 5 they hand it off on {gl_run}% of snaps.", "run"
    elif gl_plays >= 8 and gl_run <= 40:
        goal, goal_lean = f"Inside the 5 they throw it on {100 - gl_run}% of snaps.", "pass"
    if fact.get("back") and goal_lean == "run":
        close = f"That run was {who}'s job, and it goes back to the starter tonight."
    elif fact.get("kind") == "rush" and (lean == "run" or goal_lean == "run"):
        close = f"That is the side {who} scores on."
    elif fact.get("kind") == "pass" and goal_lean == "run":
        close = f"{who} scores on the throws, not those goal-line runs."
    elif fact.get("kind") == "pass" and lean == "pass":
        close = f"That is the side {who} scores on."
    elif fact.get("kind") == "rush" and lean == "pass":
        close = f"{who} scores on the ground, and this offense throws it."
    else:
        close = ""
    text = " ".join(bit for bit in (opening, goal, close) if bit)
    mark = ""
    if not fact.get("back") and ((fact.get("kind") == "rush" and (lean == "run" or goal_lean == "run")) or (fact.get("kind") == "pass" and lean == "pass")):
        mark = f"The {nick} call the side {who} scores on."
    return _part("Script", text, f"{rush} runs, {thrown} passes."), mark

def _role(fact: dict[str, Any], player: dict[str, Any] | None, club: dict[str, Any]) -> tuple[dict[str, str] | None, str]:
    who = _last(str(fact.get("name") or ""))
    if fact.get("back"):
        share = _pct((player or {}).get("rush"), club.get("rush"))
        proof = f"{share}% of the team's carries this season." if share is not None else ""
        return _part("Role", str(fact.get("back") or ""), proof), str(fact.get("back") or "")
    if int(fact.get("played") or 0) <= 0 and fact.get("index") == 0:
        return _part("Role", f"{who} is the back listed first. He has not taken a carry this season.", ""), ""
    if not player or not club:
        return None, ""
    if fact.get("kind") == "rush":
        share = _pct(player.get("rush"), club.get("rush"))
        if share is None:
            return None, ""
        text = f"{who} has had {share}% of the carries."
        if share >= 40:
            text += " That is the lead back's share."
        elif share < 20:
            text += " That is a backup's share."
        return _part("Role", text, f"{player.get('rush')} carries, {player.get('tgt')} targets."), ""
    share = _pct(player.get("tgt"), club.get("tgt"))
    if share is None:
        return None, ""
    text = f"{who} has had {share}% of the targets."
    if share >= 25:
        text += " That is a lead receiver's share."
    elif share < 12:
        text += " That is a small share of the throws."
    return _part("Role", text, f"{player.get('tgt')} targets, {player.get('rush')} carries."), ""

def _history(fact: dict[str, Any]) -> tuple[dict[str, str] | None, str, str]:
    who = _last(str(fact.get("name") or ""))
    from nfl_bets.edge import _now_season
    asked = int(fact.get("asked") or 0)
    rows = _log(str(fact.get("name") or ""))
    year = _now_season("NFL") if rows else 0
    now = [row for row in rows if int(row.get("season") or 0) == year]
    last = [row for row in rows if int(row.get("season") or 0) == year - 1]
    got_now, got_last, got_career = _hit(now), _hit(last), _hit(rows)
    got_3, got_10 = _hit(rows[:3]), _hit(rows[:10])
    proof = _proof(got_now, got_last, got_career, got_3 if now else None, got_10 if now else None)
    if not got_last and not got_career:
        line = str(fact.get("line") or "")
        blank = line if "no game this season" in line else ""
        return _part("History", line, ""), "", blank
    if not now:
        text, lead = _missed(who, asked, got_last, got_career, got_3)
        return _part("History", text, proof), lead, ""
    line = str(fact.get("line") or "")
    older = _older(got_last, got_career)
    if fact.get("back"):
        text = "Those scores came while he had the starter's carries."
        if older:
            text = f"{text} {older}"
        return _part("History", text, proof), "", ""
    text = f"{line} {older}".strip() if older else line
    gap = line if ("under those last" in line or "under that run" in line) else ""
    return _part("History", text, proof), gap, ""

def _missed(who: str, asked: int, last: tuple[int, int, int] | None, career: tuple[int, int, int] | None, recent: tuple[int, int, int] | None) -> tuple[str, str]:
    bits = [f"{who} has no game this season."]
    if recent and recent[1] >= 3 and (not last or recent[1] != last[1]):
        bits.append(f"The last {recent[1]} he played were last year, {recent[0]} of {recent[1]}.")
    if last:
        bits.append(f"Last year he scored a touchdown in {last[0]} of {last[1]}, {last[2]}%.")
    if career:
        bits.append(f"His career is {career[0]} of {career[1]}, {career[2]}%.")
    if last and career and career[2] < asked < last[2]:
        verdict = f"The {asked}% price is under last year's {last[0]} of {last[1]} and over the career, {career[0]} of {career[1]}."
    elif last and career and asked + 6 <= min(last[2], career[2]):
        verdict = f"The {asked}% price is under last year's {last[0]} of {last[1]} and under the career, {career[0]} of {career[1]}."
    elif last and abs(asked - last[2]) <= 6:
        verdict = f"The {asked}% price is on last year."
    elif career and abs(asked - career[2]) <= 6:
        verdict = f"The {asked}% price is on the career."
    else:
        verdict = ""
    if verdict:
        bits.append(verdict)
    return " ".join(bits), f"{who} has no game this season. {verdict}".strip()

def _older(last: tuple[int, int, int] | None, career: tuple[int, int, int] | None) -> str:
    bits = []
    if last:
        bits.append(f"Last year he scored in {last[0]} of {last[1]}, {last[2]}%.")
    if career:
        bits.append(f"The career is {career[0]} of {career[1]}, {career[2]}%.")
    return " ".join(bits)

def _proof(now, last, career, recent, last10) -> str:
    bits = []
    if recent:
        bits.append(f"Last {recent[1]}, {recent[0]} of {recent[1]}")
    if last10 and (not recent or last10[1] != recent[1]):
        bits.append(f"Last {last10[1]}, {last10[0]} of {last10[1]}")
    if now:
        bits.append(f"This season, {now[0]} of {now[1]}")
    if last:
        bits.append(f"Last season, {last[0]} of {last[1]}")
    if career:
        bits.append(f"Career, {career[0]} of {career[1]}")
    return ". ".join(bits) + "." if bits else ""

def _hit(rows: list[dict[str, Any]]) -> tuple[int, int, int] | None:
    if not rows:
        return None
    hits = sum(1 for row in rows if float(row.get("value") or 0) >= 1)
    return hits, len(rows), round(100 * hits / len(rows))

def _log(name: str) -> list[dict[str, Any]]:
    from nfl_bets.edge import _rows
    from nfl_bets.sway import _PATH, _cache, _career
    key = f"NFL|{name.lower()}|career"
    pack = _cache().get(key)
    if not (isinstance(pack, dict) and pack.get("rows")):
        pack = _career("NFL", _PATH.get("NFL"), name)
    if not isinstance(pack, dict):
        return []
    return _rows(pack, ("receivingTouchdowns", "rushingTouchdowns"))

def _red(fact: dict[str, Any], player: dict[str, Any] | None, club: dict[str, Any], mates: dict[str, Any], spots: dict[str, str]) -> tuple[dict[str, str] | None, int | None]:
    who = _last(str(fact.get("name") or ""))
    crowd = _where(mates, spots, _full(str(fact.get("team") or "")), str(fact.get("name") or ""), "rzRush", "rzTgt")
    if not player or not club.get("rz"):
        if int(fact.get("played") or 0) <= 0:
            text = f"{who} has no red-zone touch this season."
            return _part("Red zone", f"{text} {crowd}".strip(), ""), None
        return None, None
    rushes, targets = int(player.get("rzRush") or 0), int(player.get("rzTgt") or 0)
    share = _pct(rushes + targets, club.get("rz"))
    if share is None:
        return None, None
    touch = f"{_n(rushes, 'carry', 'carries')} and {_n(targets, 'target', 'targets')} inside the 20" if fact.get("kind") == "rush" else f"{_n(targets, 'target', 'targets')} and {_n(rushes, 'carry', 'carries')} inside the 20"
    text = f"{who} had {touch}, {share}% of the red-zone plays." if fact.get("back") else f"{who} has {touch}, {share}% of the red-zone plays."
    if fact.get("back"):
        text += " That work goes back with the starter."
    elif share < 8:
        text += " There is little red-zone work behind this price."
    return _part("Red zone", f"{text} {crowd}".strip(), f"The team throws it {club.get('pass')}% of the time inside the 20."), share

def _goal(fact: dict[str, Any], player: dict[str, Any] | None, club: dict[str, Any], foe: dict[str, Any], opp: str, board: dict[str, Any], mates: dict[str, Any], spots: dict[str, str]) -> tuple[dict[str, str] | None, int | None]:
    who = _last(str(fact.get("name") or ""))
    plays = int(club.get("glPlays") or 0)
    stop = _stop(foe, opp, board)
    crowd = _where(mates, spots, _full(str(fact.get("team") or "")), str(fact.get("name") or ""), "glRush", "glTgt")
    if not player or plays <= 0:
        if int(fact.get("played") or 0) <= 0:
            text = f"{who} has no touch inside the 5 this season."
            return _part("Goal line", f"{text} {crowd}".strip(), stop), None
        return None, None
    touches = int(player.get("glRush") or 0) + int(player.get("glTgt") or 0)
    share = _pct(touches, plays)
    if share is None:
        return None, None
    if touches <= 0:
        text = f"{who} has no touch inside the 5."
    elif fact.get("back"):
        text = f"{who} had {touches} touches inside the 5, {share}% of the snaps. That work goes back with the starter."
    else:
        text = f"{who} has {touches} touches inside the 5, {share}% of the snaps."
    return _part("Goal line", f"{text} {crowd}".strip(), stop), share

def _where(players: dict[str, Any], spots: dict[str, str], team: str, name: str, rush_key: str, tgt_key: str) -> str:
    mine = _bucket(spots.get(name) or "")
    sit = _outs()
    rows = []
    for who, row in players.items():
        if str(row.get("team") or "") != team or str(who).casefold() == name.casefold():
            continue
        count = int(row.get(rush_key) or 0) + int(row.get(tgt_key) or 0)
        if count < 2:
            continue
        status, hurt = sit.get(who.casefold(), ("", ""))
        rows.append((count, _last(who), _bucket(spots.get(who) or ""), status, hurt))
    rows = sorted(rows, key=lambda row: (-row[0], row[1]))[:6]
    if not rows or not mine:
        return ""
    down = {"out", "doubtful", "questionable", "injured reserve", "suspension"}
    gone = [row for row in rows if row[3] in down]
    live = [row for row in rows if row[3] not in down]
    same = [row for row in live if row[2] == mine]
    quarter = [row for row in live if row[2] == "quarterback" and mine != "quarterback"]
    other = [row for row in live if row[2] not in {mine, "quarterback", ""}]
    noun = {"back": "backs", "receiver": "receivers", "quarterback": "quarterbacks"}[mine]
    left = "what is left" if gone else "the other work"
    if not same and any(row[2] == mine for row in gone):
        lead = f"No other {noun[:-1]} is playing."
    elif not same:
        lead = f"It leaves the {noun}."
    elif not other and not quarter:
        lead = f"It stays with the other {noun}."
    elif sum(row[0] for row in other) + sum(row[0] for row in quarter) > sum(row[0] for row in same):
        lead = f"More of {left} leaves the {noun}."
    else:
        lead = f"The other work stays with the {noun}."
    bits = [f"{_mark(row[0], row[1], row[3], row[4])}." for row in gone]
    if same:
        bits.append(_names(same) + ".")
    bits.append(lead)
    if other:
        bits.append(("On throws, " if mine == "back" else "The runs go elsewhere. ") + _names(other) + ".")
    if quarter:
        bits.append(_names(quarter) + " at quarterback.")
    return " ".join(bits)

def _names(rows: list[tuple]) -> str:
    if len({row[0] for row in rows}) == 1 and len(rows) > 1:
        who = [row[1] for row in rows]
        shown = f"{who[0]} and {who[1]}" if len(who) == 2 else ", ".join(who[:-1]) + ", and " + who[-1]
        return f"{shown} have {rows[0][0]} each"
    bits = [f"{row[1]} has {row[0]}" for row in rows]
    if len(bits) <= 2:
        return " and ".join(bits)
    return ", ".join(bits[:-1]) + ", and " + bits[-1]

def _bucket(pos: str) -> str:
    return "back" if pos in {"RB", "FB"} else "quarterback" if pos == "QB" else "receiver" if pos in {"WR", "TE"} else ""

def _defense(fact: dict[str, Any], foe: dict[str, Any], league: dict[str, float], opp: str, board: dict[str, Any]) -> tuple[dict[str, str] | None, str]:
    nick = _nick(_game(board, str(fact.get("match") or "")), opp) or _full(opp).split()[-1]
    if fact.get("kind") == "rush" and foe.get("rushPlays") and league.get("rushTd") is not None:
        ypc = foe["rushYds"] / foe["rushPlays"]
        med, med_y = league["rushTd"], league.get("ypc") or ypc
        if foe["rushTd"] <= med - 3 or ypc <= med_y - 0.3:
            word = "a stingy front for a rushing score"
        elif foe["rushTd"] >= med + 3 or ypc >= med_y + 0.3:
            word = "a soft front for a rushing score"
        else:
            word = "in the middle of the league against the run"
        text = f"The {nick} have allowed {foe['rushTd']} rushing scores, {ypc:.1f} yards per carry. The league median is {med:.0f} scores and {med_y:.1f} yards. That is {word}."
        mark = f"The {nick} are {word}." if word.startswith("a ") else ""
        return _part("Defense", text, ""), mark
    if foe.get("passPlays") and league.get("passTd") is not None:
        med = league["passTd"]
        if foe["passTd"] <= med - 3:
            word = "a stingy pass defense for a score"
        elif foe["passTd"] >= med + 3:
            word = "a soft pass defense for a score"
        else:
            word = "in the middle of the league against the pass"
        text = f"The {nick} have allowed {foe['passTd']} passing scores. The league median is {med:.0f}. That is {word}."
        mark = f"The {nick} are {word}." if word.startswith("a ") else ""
        return _part("Defense", text, ""), mark
    return None, ""

def _staff(fact: dict[str, Any], club: dict[str, Any], foe: dict[str, Any], league: dict[str, float], coaches: dict[str, str], team: str, opp: str, board: dict[str, Any]) -> dict[str, str] | None:
    if not club.get("glPlays") or league.get("glRun") is None:
        return None
    game = _game(board, str(fact.get("match") or ""))
    off = coaches.get(team) or _nick(game, team) or "The offense"
    de = coaches.get(opp) or _nick(game, opp) or "The defense"
    rate = int(club.get("glRun") or 0)
    med = league["glRun"]
    if rate >= med + 12:
        call = f"{off}'s team hands it off on {rate}% of snaps inside the 5. The league is at {med:.0f}%."
    elif rate <= med - 12:
        call = f"{off}'s team throws it on {club.get('glPass')}% of snaps inside the 5. The league hands it off {med:.0f}% of the time."
    else:
        call = f"{off}'s team hands it off on {rate}% of snaps inside the 5, near the league rate of {med:.0f}%."
    if not foe.get("plays") or league.get("glRate") is None:
        return _part("Coaches", call, "")
    allowed = foe["td"] / foe["plays"]
    if allowed <= league["glRate"] - 0.12:
        stop = f"{de}'s defense has allowed a score on {foe['td']} of {foe['plays']} snaps inside the 5, fewer than the league."
    elif allowed >= league["glRate"] + 0.12:
        stop = f"{de}'s defense has allowed a score on {foe['td']} of {foe['plays']} snaps inside the 5, more than the league."
    else:
        stop = f"{de}'s defense has allowed a score on {foe['td']} of {foe['plays']} snaps inside the 5, near the league."
    return _part("Coaches", f"{call} {stop}", "")

def _summaries(rows: list[dict[str, Any]]) -> None:
    goals = [row["goal"] for row in rows if isinstance(row.get("goal"), int)]
    reds = [row["red"] for row in rows if isinstance(row.get("red"), int)]
    scripts = sum(1 for row in rows if row.get("script"))
    for row in rows:
        if row.get("role"):
            row["summary"] = row["role"]
            continue
        if row.get("blank"):
            row["summary"] = row["blank"]
            continue
        bits = []
        if row.get("gap"):
            bits.append(row["gap"])
        goal_med = _median(goals)
        if isinstance(row.get("goal"), int) and goal_med is not None and row["goal"] >= goal_med + 15 and row["goal"] >= 25:
            bits.append(f"He has had {row['goal']}% of the snaps inside the 5.")
        red_med = _median(reds)
        if len(bits) < 2 and isinstance(row.get("red"), int) and red_med is not None and row["red"] >= red_med + 15 and row["red"] >= 25:
            bits.append(f"He has had {row['red']}% of the red-zone plays.")
        if len(bits) < 2 and row.get("front"):
            bits.append(row["front"])
        if len(bits) < 2 and row.get("script") and scripts * 2 <= len(rows):
            bits.append(row["script"])
        row["summary"] = " ".join(bits[:2]) if bits else (row.get("hist") or "The price is on the recent rate and the role is the usual one.")

def _league(pack: dict[str, Any]) -> dict[str, float]:
    teams = list((pack.get("teams") or {}).values())
    stops = list((pack.get("stops") or {}).values())
    return {
        "glRun": _median([row.get("glRun") for row in teams if row.get("glPlays")]) or 0,
        "rushTd": _median([row.get("rushTd") for row in stops if row.get("rushPlays")]) or 0,
        "ypc": _median([row["rushYds"] / row["rushPlays"] for row in stops if row.get("rushPlays")]) or 0,
        "passTd": _median([row.get("passTd") for row in stops if row.get("passPlays")]) or 0,
        "glRate": _median([row["td"] / row["plays"] for row in stops if row.get("plays")]) or 0,
    }

def _coaches(abbrs: set[str]) -> dict[str, str]:
    saved = read_json(out_dir() / _CACHE, {})
    bag = saved.get("coaches") if isinstance(saved, dict) and time() - float(saved.get("at") or 0) < _TTL else {}
    if not isinstance(bag, dict):
        bag = {}
    missing = [abbr for abbr in abbrs if abbr not in bag]
    if missing:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for abbr, name in zip(missing, pool.map(_coach_name, missing)):
                bag[abbr] = name
        write_json(out_dir() / _CACHE, {"at": time(), "coaches": bag})
    return {abbr: str(bag.get(abbr) or "") for abbr in abbrs}

def _coach_name(abbr: str) -> str:
    try:
        team = get_json(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}", referer=_REFERER, timeout=12)
        tid = str((team.get("team") or {}).get("id") or "")
        if not tid:
            return ""
        listing = get_json(f"https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{_season()}/teams/{tid}/coaches", referer=_REFERER, timeout=12)
        ref = str(((listing.get("items") or [{}])[0] or {}).get("$ref") or "").split("?")[0]
        if not ref:
            return ""
        person = get_json(ref, referer=_REFERER, timeout=12)
        return " ".join(part for part in (str(person.get("firstName") or ""), str(person.get("lastName") or "")) if part)
    except Exception:  # noqa: BLE001
        return ""

def _stop(foe: dict[str, Any], opp: str, board: dict[str, Any]) -> str:
    if not foe.get("plays"):
        return ""
    nick = _full(opp).split()[-1]
    return f"{nick} have allowed a score on {foe['td']} of {foe['plays']} snaps inside the 5."

def _find(players: dict[str, Any], name: str) -> dict[str, Any] | None:
    if name in players:
        return players[name]
    low = name.casefold()
    return next((row for key, row in players.items() if str(key).casefold() == low), None)

def _game(board: dict[str, Any], match: str) -> dict[str, Any] | None:
    games = board.get("games") if isinstance(board, dict) else []
    return next((game for game in games or [] if str(game.get("match") or "") == match and str(game.get("sport") or "") == "NFL"), None)

def _nick(game: dict[str, Any] | None, abbr: str) -> str:
    if not game:
        return _full(abbr).split()[-1]
    if abbr == str(game.get("away") or ""):
        return str(game.get("awayNick") or _full(abbr).split()[-1])
    if abbr == str(game.get("home") or ""):
        return str(game.get("homeNick") or _full(abbr).split()[-1])
    return _full(abbr).split()[-1]

def _full(abbr: str) -> str:
    abbr = _ALIAS.get(abbr, abbr)
    return next((name for name, code in _CLUBS.items() if code == abbr), abbr)

def _pct(part: Any, whole: Any) -> int | None:
    try:
        got, total = float(part), float(whole)
    except (TypeError, ValueError):
        return None
    if total <= 0:
        return None
    return round(100 * got / total)

def _median(rows: list[Any]) -> float | None:
    nums = sorted(float(row) for row in rows if isinstance(row, (int, float)))
    if not nums:
        return None
    mid = len(nums) // 2
    return nums[mid] if len(nums) % 2 else (nums[mid - 1] + nums[mid]) / 2

def _n(count: int, one: str, many: str) -> str:
    return f"{int(count)} {one if int(count) == 1 else many}"

def _num(value: float) -> str:
    return str(int(value)) if float(value) == int(value) else f"{float(value):.1f}"

def _part(title: str, text: str, proof: str) -> dict[str, str] | None:
    if not text:
        return None
    part = {"title": title, "text": text}
    if proof:
        part["proof"] = proof
    return part
