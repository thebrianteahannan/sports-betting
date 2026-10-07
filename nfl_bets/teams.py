"""NFL names, abbreviations, and headline aliases."""

from __future__ import annotations

import re

# Full name -> (abbr, phrases that mean this club in a headline).
TEAMS: dict[str, tuple[str, tuple[str, ...]]] = {
    "Arizona Cardinals": ("ARI", ("cardinals",)),
    "Atlanta Falcons": ("ATL", ("falcons",)),
    "Baltimore Ravens": ("BAL", ("ravens",)),
    "Buffalo Bills": ("BUF", ("bills",)),
    "Carolina Panthers": ("CAR", ("panthers",)),
    "Chicago Bears": ("CHI", ("bears",)),
    "Cincinnati Bengals": ("CIN", ("bengals",)),
    "Cleveland Browns": ("CLE", ("browns",)),
    "Dallas Cowboys": ("DAL", ("cowboys",)),
    "Denver Broncos": ("DEN", ("broncos",)),
    "Detroit Lions": ("DET", ("lions",)),
    "Green Bay Packers": ("GB", ("packers",)),
    "Houston Texans": ("HOU", ("texans",)),
    "Indianapolis Colts": ("IND", ("colts",)),
    "Jacksonville Jaguars": ("JAX", ("jaguars",)),
    "Kansas City Chiefs": ("KC", ("chiefs",)),
    "Las Vegas Raiders": ("LV", ("raiders",)),
    "Los Angeles Chargers": ("LAC", ("chargers",)),
    "Los Angeles Rams": ("LAR", ("rams",)),
    "Miami Dolphins": ("MIA", ("dolphins",)),
    "Minnesota Vikings": ("MIN", ("vikings",)),
    "New England Patriots": ("NE", ("patriots",)),
    "New Orleans Saints": ("NO", ("saints",)),
    "New York Giants": ("NYG", ("giants",)),
    "New York Jets": ("NYJ", ("jets",)),
    "Philadelphia Eagles": ("PHI", ("eagles",)),
    "Pittsburgh Steelers": ("PIT", ("steelers",)),
    "San Francisco 49ers": ("SF", ("49ers", "niners")),
    "Seattle Seahawks": ("SEA", ("seahawks",)),
    "Tampa Bay Buccaneers": ("TB", ("buccaneers", "bucs")),
    "Tennessee Titans": ("TEN", ("titans",)),
    "Washington Commanders": ("WAS", ("commanders",)),
}

_ABBR_NORM = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR"}
BY_ABBR: dict[str, str] = {abbr: name for name, (abbr, _) in TEAMS.items()}
_PATTERNS: dict[str, re.Pattern[str]] = {
    abbr: re.compile(
        r"\b(?:" + "|".join(re.escape(p) for p in phrases) + r")\b",
        re.I,
    )
    for _, (abbr, phrases) in TEAMS.items()
}


def norm_abbr(raw: str) -> str:
    abbr = (raw or "").upper().strip()
    return _ABBR_NORM.get(abbr, abbr)


def from_full_name(name: str) -> tuple[str, str] | None:
    row = TEAMS.get((name or "").strip())
    if not row:
        return None
    return row[0], name.strip()


def nick(abbr: str) -> str:
    name = BY_ABBR.get(abbr)
    if not name:
        return abbr
    phrases = TEAMS[name][1]
    word = phrases[0]
    if word == "49ers":
        return "49ers"
    return word[:1].upper() + word[1:]


def mentions(text: str, abbr: str) -> bool:
    pat = _PATTERNS.get(abbr)
    if not pat or not text:
        return False
    return pat.search(text) is not None
