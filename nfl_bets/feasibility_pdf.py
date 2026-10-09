#!/usr/bin/env python3
"""Feasibility brief for the NFL FanDuel desk."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from nfl_bets.hedge import american_decimal

NAVY = colors.HexColor("#1A2114")
INK = colors.HexColor("#1C2418")
MUTED = colors.HexColor("#5C6754")
RULE = colors.HexColor("#D5DCC8")
PAPER = colors.HexColor("#F7F4EC")
AMBER = colors.HexColor("#8A5A12")
GREEN = colors.HexColor("#1F6B4A")

ROOT = Path(__file__).resolve().parents[1]


def main() -> Path:
    out = ROOT / "docs" / "NFL_Desk_Feasibility.pdf"
    static = ROOT / "nfl_bets" / "static" / "feasibility.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    _write(out)
    static.write_bytes(out.read_bytes())
    print(out)
    return out


def _write(path: Path) -> None:
    doc = SimpleDocTemplate(
        str(path),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.6 * inch,
        title="NFL Desk Feasibility",
        author="NFL Betting Desk",
    )
    style = _styles()
    story: list = [
        Paragraph("NFL desk feasibility", style["kicker"]),
        Paragraph("Small profits, sit-out days, and a $20 FanDuel bank", style["title"]),
        Paragraph(
            f"{date.today():%B} {date.today().day}, {date.today().year} · FanDuel only · NFL only",
            style["sub"],
        ),
        Paragraph(
            "A slow experiment is feasible. A plan that cannot lose, or that turns "
            "$20 into serious money on a short clock, is not. The desk is built for "
            "the experiment.",
            style["verdict"],
        ),
        Paragraph("What he is actually describing", style["h"]),
        Paragraph(
            "The old system lived on paper and took all day, so it never got run. "
            "The desk is that scan: FanDuel's NFL prices, a reason when a number "
            "looks off, and a deep dive for injuries, headlines, and the hedge. "
            "He guinea-pigs the live bets. The paper record stays, so an idea can "
            "be tracked without spending. Beating the book is close to impossible. "
            "The version that has a chance is the one he named: small profits, "
            "holding off on some days, and managing the amount.",
            style["body"],
        ),
        Paragraph("What is feasible", style["h"]),
        _bullets(style, [
            "One screen instead of a day of notebooks. Read the flags. Skip the rest.",
            "Stake size comes from the purse. A day may spend 10% of it. On $20 that is $2, split into two $1 tickets. $2–$5 wagers, three to five of them, start only when 10% of the purse can pay that card.",
            "Hold days. If the next kickoff is more than 30 hours out, or nothing is a real look, or the day's cap is full, real bets stay closed.",
            "Paper bets for the guinea-pig notebook. They do not touch the cash.",
            "A hedge panel that shows the other side. At a normal FanDuel price it locks a small loss, because both sides include the vig.",
        ]),
        Paragraph("What is not feasible", style["h"]),
        _bullets(style, [
            "A hedge or a parlay that guarantees profit. At -110 against -110, $1 on each side locks about a 9 cent loss. A parlay multiplies that vig. Both results profit only when two prices overlap, which FanDuel rarely offers.",
            "Betting every game, every day, or every sport. More bets at a fair price just pay the vig faster. NFL only, and only the looks.",
            "Turning $20 into a house on a season of $1 bets. Even a real edge produces nickels until the bank is larger. The arithmetic is below.",
            "Treating ESPN's matchup model, or a shaded -104, as proof the book is wrong. Those are reasons to read. They are not a measured edge.",
        ]),
        Paragraph("The arithmetic", style["h"]),
        Paragraph(
            _math_lead(),
            style["body"],
        ),
        _table(style),
        Paragraph(
            "Two $1 bets a week at a 54% win rate expect about 6 cents a week. "
            "That is the honest shape of a small edge on a $20 bank. It compounds "
            "only after the bank is big enough that the unit grows, and only if "
            "the flags are actually right. We have not proven that yet. A month "
            "of paper bets is the test. If the paper record is not clearly ahead "
            "of the vig, do not add real money.",
            style["body"],
        ),
        Paragraph("Rules now in the desk", style["h"]),
        _bullets(style, [
            "Hold off today when Sunday is still more than 30 hours away. Friday is a read. The number moves.",
            "Hold off when the slate has no look or steam flag. Watches stay on the board so you can read them. They are not a card.",
            "The plan names the dollars. On a $20 purse the card is two $1 tickets. He types those into FanDuel. The desk never sends the bet.",
            "Days already on the board stay visible, because the prices are up early. Real money stays closed until kickoff is inside 30 hours.",
            "Log on paper records the idea and does not touch the cash. Log for real subtracts from the bank.",
            "Settle won, lost, push, or void. A void on a real bet puts the stake back. Paper results move a separate paper total.",
        ]),
        Paragraph("How to run the next month", style["h"]),
        Paragraph(
            "Use the desk as the finance page, not as a green light. On a hold day, "
            "do nothing with real money. On a card day, type in only the sized "
            "lines and leave the rest. The score to watch is 5 up days out of 7. "
            "Some weeks miss it. Keep the paper log even when you also bet real. "
            "After a few dozen settled paper bets, compare the win rate to 52.4%. "
            "Under that, the system is entertainment with a ledger. Over that, and "
            "only then, the sized guinea pig is earning its keep.",
            style["body"],
        ),
        Paragraph(
            "21+. Gambling problem? Call 1-800-GAMBLER. Prices are FanDuel's and move. "
            "Nothing here is a promise of profit.",
            style["foot"],
        ),
    ]
    doc.build(story)


def _math_lead() -> str:
    win_profit = american_decimal(-110) - 1
    breakeven = 1.0 / american_decimal(-110)
    return (
        f"A $1 bet at -110 wins ${win_profit:.2f} and loses $1.00. You have to win "
        f"{breakeven * 100:.1f}% of those bets just to break even. That is the tax. "
        "The table is expected profit on 100 separate $1 bets, before anyone limits the account."
    )


def _table(style: dict) -> Table:
    win_profit = american_decimal(-110) - 1
    header = ["Win rate", "Edge vs the vig", "Expected on 100 bets of $1"]
    rows = [[Paragraph(cell, style["headcell"]) for cell in header]]
    body_rows = []
    for rate in (0.50, 0.524, 0.54, 0.55, 0.57):
        profit = rate * win_profit - (1 - rate)
        if abs(rate - 0.524) < 0.01:
            edge = "Break even"
        elif profit > 0:
            edge = "Ahead"
        else:
            edge = "Behind"
        body_rows.append([f"{rate * 100:.1f}%", edge, _dollars(profit * 100)])
    rows.extend([Paragraph(cell, style["cell"]) for cell in row] for row in body_rows)
    table = Table(rows, colWidths=[1.6 * inch, 2.2 * inch, 2.6 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A2114")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F4E4E1")),
                ("BACKGROUND", (0, 2), (-1, 2), PAPER),
                ("BACKGROUND", (0, 3), (-1, -1), colors.HexColor("#E7F0E4")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.3, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return table


def _dollars(value: float) -> str:
    if abs(value) < 0.05:
        return "$0"
    sign = "-" if value < 0 else "+"
    return f"{sign}${abs(value):.2f}"


def _bullets(style: dict, items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(item, style["body"]), leftIndent=12) for item in items],
        bulletType="bullet",
        start="•",
        leftIndent=14,
        bulletFontName="Helvetica",
        bulletFontSize=9,
        spaceBefore=1,
        spaceAfter=4,
    )


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle(
            "K",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=AMBER,
            alignment=TA_CENTER,
            tracking=1.2,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "T",
            parent=base["Title"],
            fontName="Times-Bold",
            fontSize=18,
            leading=22,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "S",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "verdict": ParagraphStyle(
            "V",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=11,
            leading=15,
            textColor=GREEN,
            alignment=TA_LEFT,
            spaceBefore=2,
            spaceAfter=8,
        ),
        "h": ParagraphStyle(
            "H",
            parent=base["Heading2"],
            fontName="Times-Bold",
            fontSize=13,
            leading=16,
            textColor=NAVY,
            spaceBefore=9,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "B",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10.5,
            leading=14,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=4,
        ),
        "headcell": ParagraphStyle(
            "HC",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=colors.white,
        ),
        "cell": ParagraphStyle(
            "C",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=INK,
        ),
        "foot": ParagraphStyle(
            "F",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=MUTED,
            spaceBefore=12,
        ),
    }


if __name__ == "__main__":
    main()
