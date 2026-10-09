"""FanDuel board for every sport the site has up. Prices come from here only."""

from __future__ import annotations

import re
from typing import Any

from nfl_bets.http_util import get_json
from nfl_bets.teams import from_full_name

# Public client key the FanDuel site sends. Not a user secret.
_AK = "FhMFpcPWXMeyZxOx"
_HOSTS = (
    "https://sbapi.nj.sportsbook.fanduel.com",
    "https://sbapi.pa.sportsbook.fanduel.com",
    "https://sbapi.mi.sportsbook.fanduel.com",
)
# Event-type ids FanDuel's sport pages use.
_PAGES = (
    6423, 7522, 7511, 7524, 1, 2, 6, 26420387, 3503, 4, 5, 1477, 3,
    468328, 2593174, 27454571,
)
_SPREADS = ("Spread", "Run Line", "Puck Line", "Spread Betting", "Spread (60 Min)")
_MONEYS = (
    "Moneyline",
    "Moneyline (3-way)",
    "Moneyline (3-Way)",
    "Moneyline (3 way)",
    "Moneyline Inc Tie",
)
_TOTALS = (
    "Total Points",
    "Total Runs",
    "Total Goals",
    "Total Points inc Overtime",
    "Total Goals (60 Min)",
)
_LABEL = {
    "Run Line": "Run line",
    "Puck Line": "Puck line",
    "Moneyline (3-way)": "3-way",
    "Moneyline (3-Way)": "3-way",
    "Moneyline (3 way)": "3-way",
    "Moneyline Inc Tie": "Inc tie",
    "Total Runs": "Runs",
    "Total Goals": "Goals",
    "Total Goals (60 Min)": "Goals",
    "Total Points inc Overtime": "Total",
}
_FAMILY = {
    1: "Soccer",
    2: "Tennis",
    3: "Golf",
    4: "Cricket",
    5: "Rugby",
    6: "Boxing",
    1477: "Rugby",
    3503: "Darts",
    2593174: "Table tennis",
    468328: "Handball",
    27454571: "eSports",
}


def fetch_board() -> tuple[list[dict[str, Any]], str]:
    last = "FanDuel board unreachable"
    for host in _HOSTS:
        try:
            games = _host_games(host)
        except Exception as exc:  # noqa: BLE001
            last = str(exc)
            continue
        if games:
            return games, host.replace("https://", "")
        last = f"no games on {host}"
    raise RuntimeError(last)


def _host_games(host: str) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    failures = 0
    for event_type in _PAGES:
        url = (
            f"{host}/api/content-managed-page?page=SPORT&eventTypeId={event_type}"
            f"&pbHorizontal=false&_ak={_AK}&timezone=America/New_York"
        )
        try:
            data = get_json(url, referer="https://sportsbook.fanduel.com/")
        except Exception:  # noqa: BLE001
            failures += 1
            continue
        for game in _games(data, event_type):
            found[str(game["id"])] = game
    if failures == len(_PAGES):
        raise RuntimeError(f"FanDuel sport pages failed on {host}")
    games = list(found.values())
    games.sort(key=lambda game: (game["kickoff"], game["sport"], game["match"]))
    return games


def _games(data: dict[str, Any], event_type: int) -> list[dict[str, Any]]:
    att = data.get("attachments") or {}
    events = att.get("events") or {}
    markets = att.get("markets") or {}
    comps = att.get("competitions") or {}
    by_event: dict[str, dict[str, dict[str, Any]]] = {}
    for market in markets.values():
        if not isinstance(market, dict):
            continue
        name = str(market.get("marketName") or "")
        event_id = str(market.get("eventId") or "")
        if not event_id or name not in _SPREADS + _MONEYS + _TOTALS:
            continue
        bucket = by_event.setdefault(event_id, {})
        prev = bucket.get(name)
        if prev is None or _better(market, prev):
            bucket[name] = market

    games: list[dict[str, Any]] = []
    for event in events.values():
        if not isinstance(event, dict):
            continue
        game = _event_game(event, comps, by_event, event_type)
        if game:
            games.append(game)
    if event_type == 3:
        games.extend(_golf(events, comps, markets))
    return games


def _event_game(
    event: dict[str, Any],
    comps: dict[str, Any],
    by_event: dict[str, dict[str, dict[str, Any]]],
    event_type: int,
) -> dict[str, Any] | None:
    title = str(event.get("name") or "")
    pair = _pair(title)
    if not pair:
        return None
    away_name, home_name = pair
    books = by_event.get(str(event.get("eventId") or "")) or {}
    spread_name, spread = _pick(books, _SPREADS)
    money_name, money = _pick(books, _MONEYS)
    total_name, total = _pick(books, _TOTALS)
    if spread is None and money is None:
        return None
    league = _league(event, comps)
    sport = _sport(event_type, league)
    return _row(
        str(event.get("eventId") or ""),
        sport,
        title,
        away_name,
        home_name,
        str(event.get("openDate") or ""),
        spread_name,
        _side_market(spread, away_name, home_name),
        money_name,
        _side_market(money, away_name, home_name),
        total_name,
        _total(total),
    )


def _golf(
    events: dict[str, Any],
    comps: dict[str, Any],
    markets: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for market in markets.values():
        if not isinstance(market, dict):
            continue
        event = events.get(str(market.get("eventId") or "")) or {}
        if _pga(event, comps):
            continue
        title = str(market.get("marketName") or "")
        if " vs " not in title or str(market.get("marketStatus") or "").upper() != "OPEN":
            continue
        runners = list(market.get("runners") or [])
        if len(runners) != 2:
            continue
        left = str(runners[0].get("runnerName") or "")
        right = str(runners[1].get("runnerName") or "")
        if not left or not right or left not in title or right not in title:
            continue
        rows.append(
            _row(
                str(market.get("marketId") or ""),
                "Golf",
                title,
                left,
                right,
                str(market.get("marketTime") or event.get("openDate") or ""),
                "",
                None,
                "Moneyline",
                _named_market(runners, left, right),
                "",
                None,
            )
        )
    rows.extend(_pga_tournaments(events, comps, markets))
    return rows


def _pga(event: dict[str, Any], comps: dict[str, Any]) -> bool:
    comp = comps.get(str(event.get("competitionId") or "")) or {}
    return "pga" in str(comp.get("name") or "").lower()


def _pga_tournaments(
    events: dict[str, Any],
    comps: dict[str, Any],
    markets: dict[str, Any],
) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for event in events.values():
        if not isinstance(event, dict) or not _pga(event, comps):
            continue
        comp_id = str(event.get("competitionId") or "")
        slot = grouped.setdefault(comp_id, {"event": None, "ids": set()})
        slot["ids"].add(str(event.get("eventId") or ""))
        if "pga" in str(event.get("name") or "").lower():
            slot["event"] = event
    rows: list[dict[str, Any]] = []
    for comp_id, slot in grouped.items():
        event = slot["event"]
        if not event:
            continue
        comp = comps.get(comp_id) or {}
        title = str(comp.get("name") or event.get("name") or "").strip()
        props: list[dict[str, Any]] = []
        live = False
        for market in markets.values():
            if not isinstance(market, dict) or str(market.get("eventId") or "") not in slot["ids"]:
                continue
            if str(market.get("marketStatus") or "").upper() != "OPEN":
                continue
            name = str(market.get("marketName") or "")
            if not _pga_market(name):
                continue
            if market.get("inPlay"):
                live = True
            market_id = str(market.get("marketId") or name)
            for runner in market.get("runners") or []:
                odds = _odds(runner)
                runner_name = str(runner.get("runnerName") or "").strip()
                if odds is None or odds < -1500 or odds > -110 or not runner_name:
                    continue
                props.append({
                    "market": name,
                    "runner": runner_name,
                    "label": _pga_label(name, runner_name),
                    "odds": odds,
                    "key": f"{market_id}:{runner_name}",
                    "prop": True,
                })
        if not props:
            continue
        game = _row(
            str(event.get("eventId") or comp_id),
            "PGA",
            title,
            title,
            "Field",
            str(event.get("openDate") or ""),
            "",
            None,
            "",
            None,
            "",
            None,
        )
        game["props"] = props
        game["live"] = live
        rows.append(game)
    return rows


def _pga_market(name: str) -> bool:
    low = name.lower()
    return low in {"top 5", "top 10", "top 20"} or "matchbet" in low or low.startswith("3 ball")


def _pga_label(market: str, runner: str) -> str:
    low = market.lower()
    if low in {"top 5", "top 10", "top 20"}:
        return f"{runner} {low}"
    if low.startswith("3 ball"):
        return f"{runner} to win the 3-ball"
    if "18 hole" in low:
        return f"{runner} to win the round match"
    return f"{runner} to win the match"


def _row(
    event_id: str,
    sport: str,
    title: str,
    away_name: str,
    home_name: str,
    kickoff: str,
    spread_name: str,
    spread: dict[str, Any] | None,
    money_name: str,
    money: dict[str, Any] | None,
    total_name: str,
    total: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "id": event_id,
        "sport": sport,
        "match": title,
        "away": _short(away_name, sport),
        "home": _short(home_name, sport),
        "awayName": away_name,
        "homeName": home_name,
        "kickoff": kickoff,
        "spread": spread,
        "moneyline": money,
        "total": total,
        "spreadLabel": _LABEL.get(spread_name, "Spread"),
        "moneyLabel": _LABEL.get(money_name, "Moneyline"),
        "totalLabel": _LABEL.get(total_name, "Total"),
    }


def _pair(name: str) -> tuple[str, str] | None:
    """Away, home. FanDuel writes American games as away @ home, and the rest as home v away."""
    if " @ " in name:
        left, right = name.split(" @ ", 1)
        return left.strip(), right.strip()
    for sep in (" vs ", " v "):
        if sep in name:
            left, right = name.split(sep, 1)
            return right.strip(), left.strip()
    return None


def _league(event: dict[str, Any], comps: dict[str, Any]) -> str:
    comp = comps.get(str(event.get("competitionId") or "")) or {}
    return str(comp.get("name") or "")


def _sport(event_type: int, league: str) -> str:
    name = league.lower()
    if any(token in name for token in ("efootball", "ebasketball", "esoccer", "esport")):
        return "eSports"
    if event_type == 6423:
        if name == "nfl" or name.startswith("nfl "):
            return "NFL"
        if "ncaa" in name:
            return "NCAAF"
        if "cfl" in name:
            return "CFL"
        return "Football"
    if event_type == 7522:
        if name == "nba" or name.startswith("nba"):
            return "NBA"
        if "wnba" in name:
            return "WNBA"
        if "ncaa" in name:
            return "NCAAB"
        return "Basketball"
    if event_type == 7511:
        return "MLB" if name == "mlb" or name.startswith("mlb") else "Baseball"
    if event_type == 7524:
        return "NHL" if name == "nhl" or name.startswith("nhl") else "Hockey"
    if event_type == 26420387:
        return "UFC" if "ufc" in name else "MMA"
    return _FAMILY.get(event_type, "Other")


def _short(name: str, sport: str) -> str:
    clean = re.sub(r"\s*\([^)]*\)", "", name)
    clean = re.sub(r"\s+", " ", clean).strip()
    if sport == "NFL":
        known = from_full_name(clean)
        if known:
            return known[0]
    if len(clean) <= 18:
        return clean
    parts = [part for part in clean.split() if part]
    for size in (2, 1):
        if len(parts) >= size and len(" ".join(parts[-size:])) <= 18:
            return " ".join(parts[-size:])
    return parts[-1][:18] if parts else clean[:18]


def _pick(
    books: dict[str, dict[str, Any]],
    names: tuple[str, ...],
) -> tuple[str, dict[str, Any] | None]:
    for name in names:
        market = books.get(name)
        if market and str(market.get("marketStatus") or "").upper() == "OPEN":
            return name, market
    return "", None


def _better(market: dict[str, Any], prev: dict[str, Any]) -> bool:
    def score(item: dict[str, Any]) -> tuple[int, int]:
        status = str(item.get("marketStatus") or "").upper()
        active = 0 if item.get("inPlay") else 1
        return (1 if status == "OPEN" else 0, active)

    return score(market) > score(prev)


def _odds(runner: dict[str, Any]) -> int | None:
    american = (
        (runner.get("winRunnerOdds") or {}).get("americanDisplayOdds") or {}
    ).get("americanOdds")
    if american is None:
        return None
    try:
        return int(american)
    except (TypeError, ValueError):
        return None


def _line(runner: dict[str, Any]) -> float | None:
    raw = runner.get("handicap")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _side_market(
    market: dict[str, Any] | None,
    away_name: str,
    home_name: str,
) -> dict[str, Any] | None:
    if not market:
        return None
    away = home = None
    for runner in market.get("runners") or []:
        side = str((runner.get("result") or {}).get("type") or "").upper()
        rname = str(runner.get("runnerName") or "")
        if side == "AWAY" or rname == away_name:
            away = runner
        elif side == "HOME" or rname == home_name:
            home = runner
    if not away or not home:
        return None
    return {
        "awayLine": _line(away),
        "awayOdds": _odds(away),
        "homeLine": _line(home),
        "homeOdds": _odds(home),
    }


def _named_market(runners: list[dict[str, Any]], away_name: str, home_name: str) -> dict[str, Any] | None:
    away = home = None
    for runner in runners:
        if str(runner.get("runnerName") or "") == away_name:
            away = runner
        elif str(runner.get("runnerName") or "") == home_name:
            home = runner
    if not away or not home:
        return None
    return {
        "awayLine": _line(away),
        "awayOdds": _odds(away),
        "homeLine": _line(home),
        "homeOdds": _odds(home),
    }


def _total(market: dict[str, Any] | None) -> dict[str, Any] | None:
    if not market:
        return None
    over = under = None
    for runner in market.get("runners") or []:
        side = str((runner.get("result") or {}).get("type") or "").upper()
        rname = str(runner.get("runnerName") or "").upper()
        if side == "OVER" or rname == "OVER":
            over = runner
        elif side == "UNDER" or rname == "UNDER":
            under = runner
    if not over or not under:
        return None
    return {
        "line": _line(over),
        "overOdds": _odds(over),
        "underOdds": _odds(under),
    }
