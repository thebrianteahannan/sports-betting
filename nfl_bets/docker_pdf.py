#!/usr/bin/env python3
"""What the nfl-bets Docker image does, how often, and where it pulls from."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#0E1A2B")
INK = colors.HexColor("#1A1F28")
MUTED = colors.HexColor("#5C6570")
RULE = colors.HexColor("#D7D2C8")
PAPER = colors.HexColor("#F7F4EC")
RED = colors.HexColor("#9D2A32")
ROOT = Path(__file__).resolve().parents[1]


def main() -> Path:
    out = ROOT / "docs" / "docker.pdf"
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
        title="What the Docker image does", author="Parlay of the Day",
    )
    style = _styles()
    story: list = [
        Paragraph("Docker", style["kicker"]),
        Paragraph("What the nfl-bets container does", style["title"]),
        Paragraph(f"{today:%B} {today.day}, {today.year} · image nfl-bets:latest · container nfl-bets", style["sub"]),
        Paragraph(
            "Every 10 minutes the container pulls FanDuel's game lines and ESPN's NFL schedule and "
            "headlines, saves each line move, grades the tickets already on record, and pushes the "
            "board to Supabase. parlayoftheday.com reads that board. The container does not use AI.",
            style["verdict"],
        ),
        Paragraph("How often it runs", style["h"]),
        _bullets(style, [
            "On start, <b>nfl_bets/loop.sh</b> runs one refresh (<b>python -m nfl_bets.refresh</b>), then starts the local desk on port 8793.",
            "Then it sleeps 600 seconds and refreshes again, forever. NFL_BETS_INTERVAL_SECONDS sets the 600. "
            "The sleep starts after a refresh finishes, so the real gap is 10 minutes plus the refresh time.",
            "Missing career logs for players are filled once every 24 hours, on the first refresh after a day has passed.",
            "<b>restart: unless-stopped</b> brings it back after a crash or a Docker restart. It stops only when you stop it.",
            "The code folder <b>./nfl_bets</b> is mounted into the container. Each refresh is a new Python process, "
            "so a code change lands on the next refresh without a rebuild. The desk on port 8793 needs a container restart to pick up a change.",
        ]),
        Paragraph("What it pulls, and from where", style["h"]),
        _sources(style),
        Spacer(1, 6),
        Paragraph(
            "FanDuel is called with the public client key the FanDuel site itself sends. New Jersey is tried first, "
            "then Pennsylvania, then Michigan if a host fails. The last refresh, at 12:00 AM ET on November 9, "
            "loaded 27 games from the New Jersey host (15 NFL, 9 NBA, 3 NHL) with no errors.",
            style["body"],
        ),
        Paragraph("What it writes", style["h"]),
        _bullets(style, [
            "<b>./output/board.json</b>: every game with its spread, moneyline, total, the opening number, and flags.",
            "<b>./output/history/</b>: one file per game. A new snapshot is added only when the number or the price moved. "
            "The first snapshot is the open.",
            "<b>./output/archive.json</b>: every recommended ticket on record, graded win, loss, or push from ESPN's final score.",
            "<b>Supabase</b> key-value table: bets/board.json, bets/archive.json, bets/ignored.json, and one player log per player at bets/log/{sport}/{name}.",
        ]),
        Paragraph("The flags on a game", style["h"]),
        Paragraph(
            "Each game gets flags for a FanDuel number that disagrees with its open, with its own prices once the juice "
            "is taken out, or with an ESPN headline about that team. A game with more flags sorts higher. These are "
            "comparisons and arithmetic, not a model.",
            style["body"],
        ),
        Paragraph("What the website builds instead", style["h"]),
        Paragraph(
            "The container sends game lines only. Player props and the recommended parlay cards are built on the "
            "website when a page asks for them. The Node server on Hostinger pulls FanDuel's player props for each game "
            "(choose-api.js) and runs the strategy finder (nfl_bets.stack_find) against the Supabase board and player logs.",
            style["body"],
        ),
        Paragraph(
            "The card builders in refresh.py run only with NFL_BETS_EXPERIMENTAL set to 1. The container does not set it, "
            "so the board it publishes has no parlay cards and no player props.",
            style["body"],
        ),
        Paragraph("Is it using AI?", style["h"]),
        Paragraph(
            "<b>No.</b> The Python code in the image calls FanDuel, ESPN, and Supabase. No call goes to Gemini, Ollama, "
            "or any other model.",
            style["body"],
        ),
        Paragraph(
            "AI lives on the website, outside the image. <b>bet-ask.js</b> writes the Game details lead and the parrot's answers "
            "with Gemini, or a local Ollama model. <b>slip-api.js</b> uses Gemini to read a pasted bet screenshot into legs.",
            style["body"],
        ),
        Paragraph("Commands", style["h"]),
        _bullets(style, [
            "Start or rebuild: <b>docker compose up -d --build</b>",
            "Watch the refreshes: <b>docker logs -f nfl-bets</b>. Each refresh prints games=, looks=, and errors=.",
            "Local desk: <b>http://localhost:8793</b>",
        ]),
        Paragraph(
            "Read from Dockerfile, docker-compose.yml, nfl_bets/loop.sh, nfl_bets/refresh.py, nfl_bets/fanduel.py, "
            "nfl_bets/espn_context.py, nfl_bets/archive.py, and nfl_bets/cloud.py, plus the running container's log and its last board.",
            style["foot"],
        ),
    ]
    doc.build(story)


def _sources(style: dict) -> Table:
    header = ["Source", "What it pulls", "How often"]
    rows = [[Paragraph(cell, style["headcell"]) for cell in header]]
    body = [
        ("FanDuel sportsbook API<br/>sbapi.nj.sportsbook.fanduel.com", "Spread, moneyline, and total for every NFL, NBA, MLB, and NHL game FanDuel has up. WNBA comes in on the basketball page.", "Every refresh"),
        ("ESPN NFL scoreboard<br/>site.web.api.espn.com", "This week and next week. Gives the week number and ESPN's game id for each matchup.", "Every refresh"),
        ("ESPN NFL news", "The latest 50 NFL headlines, matched to teams for the flags.", "Every refresh"),
        ("ESPN scoreboard and box scores", "Final scores and player stats for tickets still open, so they get graded.", "Every refresh, cached"),
        ("ESPN player game logs", "Career logs for players on record who do not have one yet.", "Once a day"),
        ("Supabase", "The archive the website saved, merged with the local one before it is pushed back.", "Every refresh"),
    ]
    rows.extend([Paragraph(cell, style["cell"]) for cell in row] for row in body)
    table = Table(rows, colWidths=[2.0 * inch, 3.4 * inch, 1.1 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (-1, -1), PAPER),
        ("GRID", (0, 0), (-1, -1), 0.3, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _bullets(style: dict, items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(item, style["body"]), leftIndent=12) for item in items],
        bulletType="bullet", start="•", leftIndent=14,
        bulletFontName="Helvetica", bulletFontSize=9, spaceBefore=1, spaceAfter=4,
    )


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle("K", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=RED, alignment=TA_CENTER, spaceAfter=4),
        "title": ParagraphStyle("T", parent=base["Title"], fontName="Times-Bold", fontSize=18, leading=22, textColor=NAVY, alignment=TA_CENTER, spaceAfter=2),
        "sub": ParagraphStyle("S", parent=base["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER, spaceAfter=10),
        "verdict": ParagraphStyle("V", parent=base["Normal"], fontName="Times-Italic", fontSize=11, leading=15, textColor=NAVY, alignment=TA_LEFT, spaceBefore=2, spaceAfter=8),
        "h": ParagraphStyle("H", parent=base["Heading2"], fontName="Times-Bold", fontSize=13, leading=16, textColor=NAVY, spaceBefore=9, spaceAfter=3),
        "body": ParagraphStyle("B", parent=base["Normal"], fontName="Times-Roman", fontSize=10.5, leading=14, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=4),
        "headcell": ParagraphStyle("HC", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white),
        "cell": ParagraphStyle("C", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK),
        "foot": ParagraphStyle("F", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED, spaceBefore=12),
    }


if __name__ == "__main__":
    main()
