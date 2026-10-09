#!/usr/bin/env python3
"""Plan for taking the NFL desk live as a paid information subscription."""

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

NAVY = colors.HexColor("#0E1A2B")
INK = colors.HexColor("#1A1F28")
MUTED = colors.HexColor("#5C6570")
RULE = colors.HexColor("#D7D2C8")
PAPER = colors.HexColor("#F7F4EC")
RED = colors.HexColor("#9D2A32")

ROOT = Path(__file__).resolve().parents[1]


def main() -> Path:
    out = ROOT / "docs" / "NFL_Desk_Subscription_Plan.pdf"
    static = ROOT / "nfl_bets" / "static" / "subscription.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    _write(out)
    static.write_bytes(out.read_bytes())
    print(out)
    return out


def _write(path: Path) -> None:
    today = date.today()
    doc = SimpleDocTemplate(
        str(path),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.6 * inch,
        title="NFL Desk Subscription Plan",
        author="NFL Betting Desk",
    )
    style = _styles()
    story: list = [
        Paragraph("Go-live plan", style["kicker"]),
        Paragraph("Selling the NFL desk as a subscription", style["title"]),
        Paragraph(
            f"{today:%B} {today.day}, {today.year} · information product · 21+ · not a sportsbook",
            style["sub"],
        ),
        Paragraph(
            "Adults can pay to read this board. A lock, a bet the desk sends, "
            "or a charge to anyone under 21 is a different business, and it is "
            "not this one. Ten thousand subscribers is a company. It is not step one.",
            style["verdict"],
        ),
        Paragraph("What is for sale", style["h"]),
        Paragraph(
            "The product is a login that unlocks the day's bets. The page shows "
            "bets to make, and nothing else. The Near -180 card stacks -400 to -700 "
            "prices until the parlay is about -180. The four-leg card takes one small "
            "player line from each of four sports, each priced near 85%. Four prices "
            "near 85% multiply to about a coin flip. Every card says it can miss. "
            "The member types any bet into their own FanDuel account. The desk does not send it.",
            style["body"],
        ),
        _bullets(style, [
            "A day can show about five bets, plus one lucky flyer. The flyer is a longshot, and the card says so. Five bets are a menu. They are not five locks.",
            "Every yardage leg names the stat: passing, rushing, or receiving. A line that only says \"yards\" is not ready to sell.",
            "A higher tier can be a wager builder: the member assembles legs and sees the multiplied price. That tier still does not send the bet.",
            "One price. $20 a month is the number in the thread. $15 is the other price already on the table. No annual plan until a few people have stayed a month.",
            "Names from the thread to consider: BetLab, Clutch Picks. Lock City stays unused, because the product does not sell a lock.",
        ]),
        Paragraph("Who can buy", style["h"]),
        Paragraph(
            "Subscribers, promoters, and anyone who takes a split are 21 or older. "
            "Signup asks for a date of birth and refuses the account when it is not. "
            "The friend who asked for a birthday parlay is 16. He cannot subscribe, "
            "post the picks, or share the revenue. That is a launch rule.",
            style["body"],
        ),
        Paragraph(
            "State rules differ, and a handicapping page is not a licensed sportsbook. "
            "A lawyer reads the terms before the first charge. This PDF is the plan. "
            "It is not that legal advice.",
            style["body"],
        ),
        Paragraph("What is not for sale", style["h"]),
        _bullets(style, [
            "A sportsbook, a managed betting account, or a button that sends the wager. Customers place their own bets in their own FanDuel accounts.",
            "Ads that say guaranteed winners, 100% locks, or guaranteed profits. A +250 price is about 29%. $10 wins $25, and the ticket misses most of the time.",
            "One daily slip that every member bets. Books limit accounts that all hammer the same number. The product is the bets and the reason.",
            "A claim that the flags beat the vig. The feasibility note still stands: a month of paper bets has to be ahead of 52.4% before the sales line says the desk is anything but a ledger.",
        ]),
        Paragraph("The money, without the round number", style["h"]),
        Paragraph(
            "Gross is members times the price. It is not profit, and it assumes "
            "everyone stays and the card processor allows the charge.",
            style["body"],
        ),
        _money_table(style),
        Spacer(1, 6),
        Paragraph(
            "The 150-member row is the target named in the thread: 150 people at $20. "
            "That is $3,000 a month before the card fee, the lawyer, support, refunds, "
            "and time. The 10,000-member row is arithmetic. Neither row is a forecast. "
            "Costs already paid, and costs still to pay, come out before anyone splits what is left.",
            style["body"],
        ),
        Paragraph(
            "The thread also asked for a 50/50 split and for half of each deposit to "
            "land in two accounts automatically. The person who asked is 16. He cannot "
            "subscribe, market the picks, or be on a deposit. A partner, if there is "
            "one later, is 21 or older, and only after those costs.",
            style["body"],
        ),
        Paragraph("The company, before a charge", style["h"]),
        _bullets(style, [
            "Form an LLC, get an EIN, and open a business bank account. Business money stays separate from personal money.",
            "Sell the analysis and the picks. The company does not take the bet.",
            "Keep a record of every pick: the odds, the date, the bet, the result, and the profit or loss. Losing picks stay in the record.",
            "The site needs terms of service, a privacy policy, a refund and subscription policy, responsible-gambling information, the 21+ rule, and a line that past results do not promise future results.",
            "The site does not look like FanDuel, and it does not use FanDuel's branding, unless FanDuel has given permission.",
            "Sportsbook affiliate links, if any, wait for a Tennessee gaming and consumer-law review. Extra rules can apply.",
            "A lawyer reads the business, the site, the ads, the disclaimers, and any affiliate deal before the first paying member. This PDF is the plan. It is not that legal advice.",
        ]),
        Paragraph("What has to exist before a charge", style["h"]),
        _bullets(style, [
            "The paper month, including the weeks it loses, written down where a subscriber could have seen the same board.",
            "Stat names on the yardage legs, and the miss line left on both parlays.",
            "Terms: not a sportsbook, no promise of profit, 21+, 1-800-GAMBLER, prices move, cancel any month.",
            "An age gate that actually blocks the account.",
            "A processor that has been told what the product is. Stripe and others often refuse gambling and sometimes refuse gambling advice. A rejection is a stop. It is not a reason to describe the product as something else, and card numbers stay with the processor.",
        ]),
        Paragraph("How the desk goes live", style["h"]),
        Paragraph(
            "Today the desk is a Docker container on this Mac, port 8793, with no login. "
            "The board sits in a folder on disk. Live means that same bets page, "
            "with a door on it.",
            style["body"],
        ),
        _bullets(style, [
            "Private host. Put the container on a small server with HTTPS and a domain. One operator login. Still free. Confirm the bets page, including the four-sport 85% ticket, matches what is on this machine.",
            "Accounts. Email and a password, or a hosted login. Date of birth at signup. The day's bets stay locked until the account is 21+ and paid. No feed of other people's bets.",
            "Payments, only after the lawyer and the paper month. One monthly tier first. The wager builder, if it is built, is a higher tier. Receipts by email. Cancel from the account page.",
        ]),
        Paragraph("Order of work", style["h"]),
        _bullets(style, [
            "Keep the bets page as the whole product: the parlays, the four-sport 85% ticket, and the miss line on each card.",
            "Finish a month of paper results against a 52.4% line. Write down the losses too.",
            "Talk to a lawyer. Form the LLC, get the EIN, open the business account, and write the terms.",
            "Host the desk with HTTPS and an operator login.",
            "Add the 21+ gate.",
            "Apply to a processor with an honest description of the product.",
            "Charge one price to adults. Stop if the paper record is not ahead of the vig.",
        ]),
        Paragraph(
            "21+. Gambling problem? Call 1-800-GAMBLER. This is a plan for an "
            "information subscription. It is not legal advice, and it is not a promise of profit.",
            style["foot"],
        ),
    ]
    doc.build(story)


def _money_table(style: dict) -> Table:
    header = ["Paid members", "$20 / month gross", "After a 3% card fee"]
    rows = [[Paragraph(cell, style["headcell"]) for cell in header]]
    body = [
        ("25", "$500", "$485"),
        ("100", "$2,000", "$1,940"),
        ("150", "$3,000", "$2,910"),
        ("500", "$10,000", "$9,700"),
        ("10,000", "$200,000", "$194,000"),
    ]
    rows.extend([Paragraph(cell, style["cell"]) for cell in row] for row in body)
    table = Table(rows, colWidths=[1.8 * inch, 2.3 * inch, 2.3 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("BACKGROUND", (0, 1), (-1, -2), PAPER),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F4E4E1")),
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
            "K", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10,
            textColor=RED, alignment=TA_CENTER, spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "T", parent=base["Title"], fontName="Times-Bold", fontSize=18, leading=22,
            textColor=NAVY, alignment=TA_CENTER, spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "S", parent=base["Normal"], fontName="Helvetica", fontSize=9, leading=12,
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=10,
        ),
        "verdict": ParagraphStyle(
            "V", parent=base["Normal"], fontName="Times-Italic", fontSize=11, leading=15,
            textColor=NAVY, alignment=TA_LEFT, spaceBefore=2, spaceAfter=8,
        ),
        "h": ParagraphStyle(
            "H", parent=base["Heading2"], fontName="Times-Bold", fontSize=13, leading=16,
            textColor=NAVY, spaceBefore=9, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "B", parent=base["Normal"], fontName="Times-Roman", fontSize=10.5, leading=14,
            textColor=INK, alignment=TA_JUSTIFY, spaceAfter=4,
        ),
        "headcell": ParagraphStyle(
            "HC", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
            leading=11, textColor=colors.white,
        ),
        "cell": ParagraphStyle(
            "C", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=11,
            textColor=INK,
        ),
        "foot": ParagraphStyle(
            "F", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10,
            textColor=MUTED, spaceBefore=12,
        ),
    }


if __name__ == "__main__":
    main()
