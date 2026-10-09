"""Every parlay leg names the player, the number, and the unit."""

from __future__ import annotations

import re

_UNITS = (
    "shots on goal", "receiving yards", "rushing yards", "passing yards",
    "receptions", "rebounds", "strikeouts", "assists", "puck line", "run line",
    "saves", "points", "goals", "shots", "made threes", "threes", "spread", "yards",
)


def label(market: str, runner: str) -> str:
    if runner.lower() in {"over", "under"} or runner[:4].lower() in {"over", "unde"}:
        return f"{market}: {runner}"
    kind = _kind(market)
    if kind and kind not in runner.lower() and re.search(r"\by(?:ar)?ds?\b", runner, re.I):
        runner = re.sub(r"\by(?:ar)?ds?\b", f"{kind} yards", runner, count=1, flags=re.I)
    norm = re.sub(r"\byds\b", "yards", market, flags=re.I)
    norm = re.sub(r"puckline", "puck line", norm, flags=re.I)
    low = norm.lower()
    scope_match = re.match(r"(1st|2nd|3rd|4th)\s+(period|half|quarter)", low)
    scope = scope_match.group(0) if scope_match else ""
    unit = _unit(low)
    text = runner.strip()
    if re.fullmatch(r"\d+(?:\.\d+)?\+", text):
        who = norm[len(scope):] if scope else norm
        who = re.sub(r"\b(alt|alternate)\b", " ", who, flags=re.I)
        if unit:
            who = re.sub(rf"\b{re.escape(unit)}\b", " ", who, count=1, flags=re.I)
        who = " ".join(re.sub(r"[-:]", " ", who).split())
        text = " ".join(part for part in (who, text, unit) if part)
    elif unit and unit not in text.lower():
        count = ""
        if not re.search(r"\d", text):
            found = re.search(r"\d+(?:\.\d+)?\+", norm)
            count = found.group(0) if found else ""
        text = " ".join(part for part in (text, count, unit) if part)
    if scope and scope not in text.lower():
        text = f"{text}, {scope}"
    return " ".join(text.split())


def _kind(market: str) -> str:
    text = market.lower()
    if "reception" in text:
        return "receptions"
    if "rush" in text:
        return "rushing"
    if "pass" in text:
        return "passing"
    if "receiv" in text:
        return "receiving"
    return ""


def _unit(text: str) -> str:
    for word in _UNITS:
        if re.search(rf"\b{word}\b", text):
            return word
    return ""
