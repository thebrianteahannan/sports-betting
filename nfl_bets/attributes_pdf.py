#!/usr/bin/env python3
"""Reads that can separate two tickets with the same FanDuel price."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer

NAVY = colors.HexColor("#0E1A2B")
INK = colors.HexColor("#1A1F28")
MUTED = colors.HexColor("#5C6570")
RED = colors.HexColor("#9D2A32")
ROOT = Path(__file__).resolve().parents[1]


def main() -> Path:
    out = ROOT / "docs" / "attributes.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    _write(out)
    print(out)
    return out


def _write(path: Path) -> None:
    today = date.today()
    doc = SimpleDocTemplate(
        str(path), pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.65 * inch, bottomMargin=0.6 * inch,
        title="Reads that separate a bet", author="Parlay of the Day",
    )
    style = _styles()
    story: list = [
        Paragraph("Reads", style["kicker"]),
        Paragraph("What can separate two tickets with the same price", style["title"]),
        Paragraph(f"{today:%B} {today.day}, {today.year} · FanDuel price stays the price · admin note", style["sub"]),
        Paragraph(
            "Two tickets can carry the same FanDuel number and still be different bets. "
            "The desk already uses the injury report, the building, the weekday, the time of day, "
            "rest, rivalry, and wind. This is the longer list.",
            style["verdict"],
        ),
    ]
    for title, items in _sections():
        story.append(Paragraph(title, style["h"]))
        story.append(_bullets(style, items))
    story.extend([
        Spacer(1, 6),
        Paragraph("Where to start", style["h"]),
        Paragraph(
            "The reads that would move the most tickets, from sources the desk can actually reach, "
            "are back-to-backs, time zones, opponent pace and opponent rank against the stat, "
            "home and road splits, first game back, the shadow corner, prop-line movement, "
            "and the lefty-righty or park split in baseball.",
            style["body"],
        ),
        Paragraph("This note does not send a bet. A member still types the line into their own account.", style["foot"]),
    ])
    doc.build(story)


def _sections() -> list[tuple[str, list[str]]]:
    return [
        ("Schedule and the trip", [
            "Second night of a back-to-back.",
            "Third game in four nights.",
            "Game number on the road trip, first stop versus the fifth.",
            "Miles traveled since the last game.",
            "Time zones crossed on the trip.",
            "A West Coast team playing an early East Coast start.",
            "Coming off a bye.",
            "Rest advantage: one team had three days, the other had eight.",
            "A look-ahead spot, with a bigger game next.",
            "A letdown spot, the game after a rivalry or a prime-time game.",
        ]),
        ("The opponent", [
            "How many of this stat the opponent has allowed lately.",
            "Opponent pace: a fast game produces more points, shots, and assists.",
            "Opponent rank against this exact stat, not just a good defense.",
            "Home and road splits for this stat.",
            "How the opponent has played in the last two weeks, not the season average.",
            "Division game.",
            "Former team.",
            "A confirmed starter on the other side versus a day-to-day one.",
        ]),
        ("The player's role", [
            "Minutes or snap share trending up or down.",
            "Usage when a teammate is out, not just the name on the injury list.",
            "First game back from an injury.",
            "A minutes limit.",
            "Starter versus bench.",
            "Last three games, separate from the last five.",
            "Home split and road split for this number.",
            "Performance after a short week, as its own count.",
            "Performance in prime time, as its own count.",
            "Sample size on the split: 4 of 4 is a different read from 22 of 30.",
        ]),
        ("Who is missing", [
            "The quarterback, plus the backup's history.",
            "The specific corner who travels with this receiver, not any corner on the roster.",
            "The center or the point guard, when the bet is rebounds or assists.",
            "A star teammate out, which can raise usage or cut the quality of the looks.",
            "The starting pitcher versus the bullpen, for a hits or strikeouts bet.",
            "The opposing goalie's save percentage, even when the starter is playing.",
            "A game-time decision, listed separately from out.",
        ]),
        ("The building", [
            "Dome versus outdoors.",
            "Grass versus turf.",
            "Altitude, Denver and Mexico City.",
            "Park factor for that stadium, hits and home runs.",
            "Cold, which changes a passing game differently from wind.",
            "Indoor tennis versus outdoor, and the surface: hard, clay, or grass.",
        ]),
        ("The number", [
            "Whether this prop has moved since the desk first saw it.",
            "The spread or total moving while this prop has not.",
            "Juice on the leg: −120 and −180 can be the same stat at a worse price.",
            "Alternate line versus the main line, and how far the alt sits from the main.",
            "The same player offered in two tickets at two different numbers.",
        ]),
        ("The parlay itself", [
            "One cold leg inside an otherwise strong ticket.",
            "Two legs from the same game, so they move together.",
            "A quarterback and his receiver on the same ticket.",
            "A player and the opposing defense on the same ticket.",
            "Legs spread across days versus legs that all start in the same hour.",
        ]),
        ("By sport, where a feed exists", [
            "Baseball: left-handed or right-handed pitcher, park, umpire strikeout tendency.",
            "Hockey: goalie, back-to-back, shots allowed by that team.",
            "Basketball: referee foul rate, pace, rest.",
            "Football: turf, wind, the shadow corner, coming off a bye.",
            "Soccer: days since the midweek game, travel from Europe.",
            "Tennis: surface, yesterday's match length, head-to-head.",
            "Esports and table tennis: a roster change or a patch. There is no clean public log for those yet.",
        ]),
    ]


def _bullets(style: dict, items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(item, style["body"]), leftIndent=12) for item in items],
        bulletType="bullet", start="•", leftIndent=14,
        bulletFontName="Helvetica", bulletFontSize=9, spaceBefore=1, spaceAfter=2,
    )


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle("K", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=RED, alignment=TA_CENTER, spaceAfter=4),
        "title": ParagraphStyle("T", parent=base["Title"], fontName="Times-Bold", fontSize=18, leading=22, textColor=NAVY, alignment=TA_CENTER, spaceAfter=2),
        "sub": ParagraphStyle("S", parent=base["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER, spaceAfter=10),
        "verdict": ParagraphStyle("V", parent=base["Normal"], fontName="Times-Italic", fontSize=11, leading=15, textColor=NAVY, alignment=TA_LEFT, spaceBefore=2, spaceAfter=8),
        "h": ParagraphStyle("H", parent=base["Heading2"], fontName="Times-Bold", fontSize=13, leading=16, textColor=NAVY, spaceBefore=9, spaceAfter=3),
        "body": ParagraphStyle("B", parent=base["Normal"], fontName="Times-Roman", fontSize=10.5, leading=14, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=2),
        "foot": ParagraphStyle("F", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED, spaceBefore=12),
    }


if __name__ == "__main__":
    main()
