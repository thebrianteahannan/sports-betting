"""ESPN context around a FanDuel price: week, news, injuries, predictor.

The fantasy Vegas desk reads the same scoreboard host for totals. Here it
only names the week and supplies the story around FanDuel's number.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from nfl_bets.http_util import get_json
from nfl_bets.teams import mentions, norm_abbr

_SCOREBOARD = (
    "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
)
_NEWS = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50"
_SUMMARY = (
    "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event="
)
_REFERER = "https://www.espn.com/"


def fetch_context() -> dict[str, Any]:
    """Week index for team pairs, plus recent NFL headlines."""
    errors: list[str] = []
    index: dict[str, dict[str, Any]] = {}
    try:
        current = get_json(_SCOREBOARD, referer=_REFERER)
        week = int((current.get("week") or {}).get("number") or 0)
        year = int((current.get("season") or {}).get("year") or 0)
    except Exception as exc:  # noqa: BLE001
        return {"index": {}, "articles": [], "week": 0, "year": 0, "error": str(exc)}

    for offset in (0, 1):
        target = week + offset
        if target <= 0:
            continue
        try:
            board = get_json(
                f"{_SCOREBOARD}?seasontype=2&week={target}",
                referer=_REFERER,
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))
            continue
        for event in board.get("events") or []:
            parsed = _event_teams(event)
            if not parsed:
                continue
            away, home = parsed
            index[f"{away}@{home}"] = {
                "week": target,
                "espnId": str(event.get("id") or ""),
            }

    articles: list[dict[str, Any]] = []
    try:
        articles = _articles(get_json(_NEWS, referer=_REFERER))
    except Exception as exc:  # noqa: BLE001
        errors.append(str(exc))

    return {
        "index": index,
        "articles": articles,
        "week": week,
        "year": year,
        "error": "; ".join(errors),
    }


def fetch_summary(espn_id: str) -> dict[str, Any]:
    data = get_json(_SUMMARY + str(espn_id), referer=_REFERER)
    return {
        "injuries": _injuries(data),
        "articles": _articles(data.get("news") or {}),
        "model": _model(data),
    }


def matching_articles(
    articles: list[dict[str, Any]],
    away: str,
    home: str,
    *,
    within_hours: float | None = None,
) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    hits: list[dict[str, Any]] = []
    for article in articles:
        text = f"{article.get('headline') or ''} {article.get('description') or ''}"
        if not (mentions(text, away) or mentions(text, home)):
            continue
        if within_hours is not None:
            age = _hours_ago(str(article.get("published") or ""), now)
            if age is None or age > within_hours:
                continue
        hits.append(article)
    return hits


def _event_teams(event: dict[str, Any]) -> tuple[str, str] | None:
    comps = event.get("competitions") or []
    if not comps:
        return None
    away = home = ""
    for side in comps[0].get("competitors") or []:
        abbr = norm_abbr((side.get("team") or {}).get("abbreviation") or "")
        if side.get("homeAway") == "home":
            home = abbr
        elif side.get("homeAway") == "away":
            away = abbr
    if not away or not home:
        return None
    return away, home


def _articles(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("articles") if isinstance(payload, dict) else None
    out: list[dict[str, Any]] = []
    for article in raw or []:
        if not isinstance(article, dict):
            continue
        headline = str(article.get("headline") or "").strip()
        if not headline:
            continue
        out.append(
            {
                "headline": headline,
                "description": str(article.get("description") or "").strip(),
                "published": str(article.get("published") or ""),
                "link": _link(article),
            }
        )
    return out


def _link(article: dict[str, Any]) -> str:
    links = article.get("links")
    if isinstance(links, dict):
        web = links.get("web")
        if isinstance(web, dict) and web.get("href"):
            return str(web["href"])
        if isinstance(web, str):
            return web
    if isinstance(links, list):
        for item in links:
            if isinstance(item, dict) and item.get("href"):
                return str(item["href"])
    return ""


def _injuries(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for block in data.get("injuries") or []:
        abbr = norm_abbr((block.get("team") or {}).get("abbreviation") or "")
        for item in block.get("injuries") or []:
            athlete = item.get("athlete") or {}
            position = athlete.get("position") or {}
            details = item.get("details") or {}
            status = str(item.get("status") or "").strip()
            if not status:
                continue
            rows.append(
                {
                    "team": abbr,
                    "player": str(athlete.get("displayName") or "").strip(),
                    "pos": str(position.get("abbreviation") or "").strip(),
                    "status": status,
                    "injury": str(details.get("type") or "").strip(),
                    "date": str(item.get("date") or ""),
                }
            )
    rank = {"out": 0, "doubtful": 1, "questionable": 2}
    rows.sort(key=lambda row: (rank.get(row["status"].lower(), 9), row["player"]))
    return rows


def _model(data: dict[str, Any]) -> dict[str, Any] | None:
    predictor = data.get("predictor") or {}
    home = predictor.get("homeTeam") or {}
    away = predictor.get("awayTeam") or {}
    if home.get("gameProjection") is None or away.get("gameProjection") is None:
        return None
    ids = _team_ids(data)
    try:
        away_pct = float(away.get("gameProjection"))
        home_pct = float(home.get("gameProjection"))
    except (TypeError, ValueError):
        return None
    return {
        "away": ids.get(str(away.get("id") or ""), ""),
        "home": ids.get(str(home.get("id") or ""), ""),
        "awayPct": away_pct,
        "homePct": home_pct,
    }


def _team_ids(data: dict[str, Any]) -> dict[str, str]:
    comps = (data.get("header") or {}).get("competitions") or []
    out: dict[str, str] = {}
    if not comps:
        return out
    for side in comps[0].get("competitors") or []:
        team = side.get("team") or {}
        out[str(team.get("id") or "")] = norm_abbr(team.get("abbreviation") or "")
    return out


def _hours_ago(raw: str, now: datetime) -> float | None:
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return (now - stamp).total_seconds() / 3600.0
