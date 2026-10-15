#!/usr/bin/env python3
"""How a later membership could be billed weekly or monthly."""

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
    out = ROOT / "docs" / "payments.pdf"
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
        title="Collecting membership payments", author="Parlay of the Day",
    )
    style = _styles()
    story: list = [
        Paragraph("Payments", style["kicker"]),
        Paragraph("Collecting a weekly or monthly membership", style["title"]),
        Paragraph(
            f"{today:%B} {today.day}, {today.year} · information product · 21+ · not a sportsbook · not legal advice",
            style["sub"],
        ),
        Paragraph(
            "A big payments company is not required. One ordinary processor can bill adults "
            "each month and tell the desk who is paid. Patreon is the simple storefront, and it "
            "is a poor fit: it does not bill weekly, and its rules bar using Patreon to provide "
            "or facilitate betting. Stripe is the ordinary tool. Gambling advice is on Stripe's "
            "restricted list, so they can say no. A specialist processor is the backup after that no.",
            style["verdict"],
        ),
        Paragraph("What the charge is for", style["h"]),
        Paragraph(
            "The charge would be for a login to this board. The member still types any ticket "
            "into their own sportsbook. The desk does not send the bet, and it does not pay a "
            "prize for a correct pick. The tiers already written are monthly: Rookie $9.99, "
            "Pro $19.99, VIP $34.99, and an annual Pro at $199.99. Nothing is on sale today.",
            style["body"],
        ),
        Paragraph("Patreon", style["h"]),
        Paragraph(
            "Patreon is the simple version. They host the join page, store the card, send the "
            "receipt, and handle cancel. A new creator page pays Patreon 10% of the membership, "
            "then card processing on top, often 2.9% + $0.30 in the U.S. There is no weekly plan. "
            "Patreon's terms, dated May 27, 2026, offer a monthly subscription, a per-post charge, "
            "and an annual subscription.",
            style["body"],
        ),
        Paragraph(
            "Their commerce guidelines say creators may not use Patreon to provide or facilitate "
            "gambling for money, and they list betting in that rule. A page that sells sports "
            "picks can be removed even though this desk never sends a wager. Describing the page "
            "as a generic newsletter to get through that rule is not a plan. Patreon members also "
            "live on Patreon. This desk would not know they had paid unless the two were connected.",
            style["body"],
        ),
        Paragraph("An ordinary processor", style["h"]),
        Paragraph(
            "Stripe is the normal tool a small site uses. It is not an enterprise contract. "
            "Stripe Billing can charge every month or every week, email a receipt, and tell this "
            "site when to open or close the membership that already exists. Card numbers stay "
            "on Stripe's page. The desk stores paid or not paid.",
            style["body"],
        ),
        Paragraph(
            "Stripe's restricted list includes consultation, advisory, or prediction services "
            "related to online gaming or gambling. A separate prohibited line covers sports "
            "forecasting or odds-making when a monetary prize is paid. This board pays no prize. "
            "The application still has to say what the page is: a 21+ membership for sports "
            "picks and a bet builder. Approval can be refused or later taken back. A refusal is "
            "a stop. PayPal and similar card tools draw the same kind of line.",
            style["body"],
        ),
        Paragraph("Weekly or monthly", style["h"]),
        Paragraph(
            "Launch on the monthly tiers already written. A member can cancel before the next "
            "month. Weekly is possible only on a processor that offers a weekly interval. "
            "Patreon does not. A weekly charge also keeps less of a small price, because the "
            "fixed part of the card fee hits every week.",
            style["body"],
        ),
        _fee_table(style),
        Spacer(1, 6),
        Paragraph(
            "The figures use published rates checked October 15, 2026: Stripe-style U.S. cards "
            "at 2.9% + $0.30, and Patreon's standard 10% platform fee plus that same card rate. "
            "They are examples, not a quote. Tax, currency conversion, and a payout fee can "
            "come off as well. A specialist processor, if one is needed later, usually costs more "
            "than either row and may hold a reserve.",
            style["body"],
        ),
        Paragraph("If the ordinary processor says no", style["h"]),
        _bullets(style, [
            "Do not open a second ordinary account and describe the product as something else.",
            "Do not run the charge through a friend's unrelated store.",
            "Then talk to a processor that already accepts handicapping information. That is the bigger service. Higher fees and a longer application are the cost of that yes.",
            "The product description stays the same: information, 21+, no bet sent, no prize, cancel any month.",
        ]),
        Paragraph("Before the first charge", style["h"]),
        _bullets(style, [
            "A lawyer who knows the membership rules reads the site, the ads, and the billing page. This note is not that advice.",
            "Terms say it is not a sportsbook, past results do not promise the next ticket, the member must be 21+, and help is 1-800-GAMBLER.",
            "The signup already collects a state. Billing should refuse a charge where the lawyer says the membership cannot be sold.",
            "Cancel and refund rules are written down. A failed card drops the login back to the free board.",
            "Payouts land in a business account, separate from personal money.",
        ]),
        Paragraph("Order of work", style["h"]),
        _bullets(style, [
            "Leave the board free until the terms and the lawyer are done.",
            "Apply to Stripe, or a tool in that same class, for monthly Rookie, Pro, and VIP. Say what the page is.",
            "If they approve, their billing page unlocks the membership this site already has.",
            "Skip Patreon for the desk. Use it only if their own review accepts a picks page, and only as a separate reading membership. Do not plan on weekly billing there.",
            "If the ordinary application is refused, then ask a specialist processor. Still describe the page the same way.",
        ]),
        Paragraph(
            "21+. Gambling problem? Call 1-800-GAMBLER. Sources checked October 15, 2026: "
            "Patreon Commerce Guidelines, Patreon Terms of Use (May 27, 2026), Patreon's pricing page, "
            "and Stripe's list of prohibited and restricted businesses. Policies change. "
            "This is not legal, tax, or payments advice, and it is not a promise of profit.",
            style["foot"],
        ),
    ]
    doc.build(story)


def _fee_table(style: dict) -> Table:
    header = ["Example", "Fees taken off", "Left from the price"]
    rows = [[Paragraph(cell, style["headcell"]) for cell in header]]
    body = [
        ("Pro, $19.99 once a month, ordinary card rate", "$0.88", "$19.11"),
        ("Pro, $19.99 once a month, on Patreon", "$2.88", "$17.11"),
        ("$5 every week, four ordinary card charges", "$1.80", "$18.20"),
    ]
    rows.extend([Paragraph(cell, style["cell"]) for cell in row] for row in body)
    table = Table(rows, colWidths=[3.4 * inch, 1.5 * inch, 1.5 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (-1, -1), PAPER),
        ("GRID", (0, 0), (-1, -1), 0.3, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
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
