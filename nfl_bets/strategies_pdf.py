#!/usr/bin/env python3
"""Shapes that use more than one ticket on the same night."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

NAVY = colors.HexColor("#0E1A2B")
INK = colors.HexColor("#1A1F28")
MUTED = colors.HexColor("#5C6570")
RED = colors.HexColor("#9D2A32")
ROOT = Path(__file__).resolve().parents[1]


def main() -> Path:
    out = ROOT / "docs" / "strategies.pdf"
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
        title="Ways to stack more than one ticket", author="Parlay of the Day",
    )
    style = _styles()
    story: list = [
        Paragraph("Strategies", style["kicker"]),
        Paragraph("Ways to stack more than one ticket", style["title"]),
        Paragraph(f"{today:%B} {today.day}, {today.year}  ·  the shape, the window, and what loses", style["sub"]),
        Paragraph(
            "Each one is a way to split the same night across more than one price. "
            "The window is the result that cashes more than one ticket. "
            "Outside that window, one ticket pays for the others, or none of them pay.",
            style["verdict"],
        ),
    ]
    for group, rows in _groups():
        story.append(Paragraph(group, style["h"]))
        for name, text in rows:
            story.append(Paragraph(name, style["name"]))
            story.append(Paragraph(text, style["body"]))
            story.append(Spacer(1, 4))
    story.append(Paragraph("The desk does not send these. A member types each line into their own account.", style["foot"]))
    doc.build(story)


def _groups() -> list[tuple[str, list[tuple[str, str]]]]:
    return [
        ("Lines on the same stat", [
            ("Prop ladder",
             "Buy the same player over at rising lines. Over 3.5, over 4.5, and over 5.5 on made threes. "
             "Six or more clears every rung. Five clears the bottom two. Four clears only the bottom. Three or fewer loses the stack. "
             "The bottom rung is the cushion only when its payout covers the stake on the rungs above it. "
             "If the bottom pays $4 on a $5 bet and the two higher tickets cost $5 each, a finish on the bottom rung is still a loss. Size the higher rungs smaller than the bottom."),
            ("Overlapping under",
             "The ladder turned around. Under 5.5 and under 3.5 on the same player. "
             "A cold night, two or fewer, cashes both. A finish of 4 or 5 cashes only the higher under and has to pay for the lower one. Six or more loses both. "
             "The higher under is the cushion. It has to be big enough, in dollars, to cover the tighter under when the player lands in the gap."),
            ("Classic middle",
             "Over a low line and under a high line on the same stat. Over 3.5 threes and under 6.5 threes. "
             "A finish of 4, 5, or 6 wins both tickets. A finish under 4 wins only the under. A finish over 6 wins only the over. "
             "The ordinary night is a small loss: the winner's profit minus the loser's stake, which is the juice on both sides. "
             "The middle is worth having when that ordinary loss is a few cents on the dollar and the window is wide enough to land in. A one-number window at a fat price is a donation."),
            ("Live middle",
             "The same shape, taken after the number moves. You hold over 44.5 from the morning. The live total falls to 41.5 and you buy the under. "
             "A finish of 42, 43, or 44 wins both. The cost is the same as a pregame middle: outside the window, one ticket pays and one loses. "
             "Take it when the move has opened a gap wider than the juice you are paying to stand on both sides."),
            ("Key-number middle",
             "On an NFL spread, the numbers that land most often are 3 and 7. A middle that catches one of those is a different bet from a middle between 9 and 10. "
             "You have the favorite at -2.5. The line moves to -3.5 and you take the dog. A win by exactly 3 pushes or wins both, depending on the hook. "
             "Pay for the half point that crosses 3 or 7. Skip the half point that crosses 5 or 8. Those finishes are rare, and the price of the hook is the whole bet."),
            ("Teaser",
             "Move two or more football numbers in your favor, tied on one ticket. A 6-point teaser takes a -7.5 favorite to -1.5 and a 47 total down to 41. "
             "Both legs have to hold. The price is shorter than the two sides bet straight, because the book knows you crossed the key numbers. "
             "A teaser through 3 and 7 is the one with a job. A teaser that moves a 1-point line to a 7-point line the other way is buying numbers the game does not land on."),
            ("Wong teaser",
             "A 6-point teaser that starts on the numbers 1.5 through 2.5, or 7.5 through 8.5, so the teased number lands on the far side of 3 or 7. "
             "Favorite -2.5 teased to +3.5 crosses both key numbers. Dog +7.5 teased to +13.5 crosses 10 and stops short of the next key. "
             "The ticket is two of those, and nothing else. A third leg gives the juice back."),
            ("Pleaser",
             "A teaser reversed. The numbers move against you, and the price gets longer. Favorite -2.5 becomes -8.5. "
             "You are selling the key numbers for a plus-money payout. It cashes when the game is a blowout, and it loses the close ones a teaser was built to survive."),
            ("Buying and selling the hook",
             "Pay extra juice to move a 3 to a 2.5, or take a better price to move a 3 to a 3.5. "
             "Buy the hook when the number you are crossing is 3 or 7 and the game lands there often enough to pay for the juice. "
             "Sell the hook on 4, 5, 6, 8, and 9. Those margins are thin, and the better price is the whole trade."),
        ]),
        ("Several bets, one payout", [
            ("Dutching",
             "Split one stake across every result you are willing to hold, so each winner pays the same amount. "
             "Three players to score the first touchdown, at +450, +600, and +800. Stake them in proportion to the implied price so a win by any of the three returns the same profit. "
             "The book still holds the players you left off. If none of the three scores first, the stake is gone. "
             "Dutch a set only when the combined implied price of your side is under 100 percent. Over 100 percent, every winner still loses money."),
            ("Arbitrage",
             "Two books post a gap big enough that a bet on each side returns more than the combined stake. "
             "Book A has the over at +110. Book B has the under at +110. Split the stake so both payouts match. Either result returns the same profit, about the gap minus nothing, because both prices are plus money. "
             "The profit exists only if both tickets are accepted at those numbers. A book that cuts the bet, moves the line, or voids one side leaves you holding the other side alone. "
             "That leftover side is a normal bet, and it can lose."),
            ("Low-hold shopping",
             "The same side is -105 in one book and -115 in another. Take the -105. "
             "This is one ticket, not a middle. The whole of the edge is the juice you did not pay. Over a season of flat bets, the difference between -105 and -115 is the difference between a price that needs 51.2 percent and a price that needs 53.5 percent."),
            ("Round robin",
             "Three legs, and a parlay for every pair, plus the three-leg if you want it. "
             "A miss on one leg kills the tickets that used it and leaves the other pair alive. Two hits pay one two-leg. Three hits pay all three pairs and the long ticket. "
             "You pay for that survival. Three two-leg tickets cost more than one three-leg, and a single hit pays nothing. Use it when each pair is a bet you would have made anyway."),
            ("If-bet",
             "The second ticket is placed only if the first wins, and only for the amount the first returned. "
             "A $10 if-bet on two sides risks $10, not $20. If the first loses, the second never exists. If the first wins and the second loses, the profit from the first is what you lose. "
             "The order is the whole strategy. Put the leg you trust first."),
            ("Reverse",
             "Two if-bets, each order. A then B, and B then A. "
             "Both can lose, one can win, or the pair can chain. The stake is two units up front because both openers are live. "
             "It costs more than a single if-bet and less than two straight bets when the second game is the one that misses."),
        ]),
        ("Protection after the first ticket is down", [
            ("Hedge",
             "You already hold a side. You bet the other side, smaller or larger, to change what the night can cost. "
             "A $10 ticket at +300 pays $40 if it hits. The live book offers the other side at -200. "
             "A $20 hedge on that side locks about $10 either way: the original wins and the hedge loses, or the hedge wins and the original loses. "
             "Hedge when the locked number is a profit you want to keep. Skip it when the hedge price is short enough that you are selling the ticket for less than it is worth."),
            ("Parlay hedge",
             "Four of five legs have hit, and the last game has not started. The ticket pays $80 on a $10 stake. "
             "Bet the other side of the last leg for enough that a loss on the parlay still leaves a profit, and a win on the parlay still leaves a profit after the hedge loses. "
             "The last leg's price decides the size. A -300 last leg is expensive to hedge. A +100 last leg is cheap, and that is when the hedge is the bet."),
            ("Future hedge",
             "A team you took at +800 in March to win the title is now -150 in the final. "
             "A bet on the other side at the final price locks a profit on the season. The size is the same arithmetic as any hedge: match the payouts, then decide whether the locked number is worth giving up the longshot."),
            ("Cash-out",
             "The book offers to buy the ticket back before it ends. The number they offer is a hedge they priced, with their juice still in it. "
             "Take it when you would have bet the other side at that price anyway. Leave it when the offer is a shorter number than the live hedge you can type yourself."),
        ]),
        ("How much to put on the ticket", [
            ("Flat stake",
             "The same small piece of the bankroll on every ticket. One or two percent. A $500 bankroll is a $5 to $10 bet, and it stays there after a win and after a loss. "
             "The price of the ticket does not change the stake. A +400 and a -150 get the same dollars. The record is then the prices, not a staking swing."),
            ("Kelly",
             "Stake a fraction of the bankroll equal to your edge divided by the payout odds. "
             "You have a 55 percent side at even money. The edge is 10 percent, the odds are 1 to 1, and full Kelly says bet 10 percent of the bankroll. "
             "Full Kelly assumes the 55 is real. If the edge is half of what you thought, full Kelly overbets. Half Kelly, 5 percent in that example, keeps most of the growth and cuts the swing."),
            ("Martingale",
             "Double the stake after every loss. A $5 start goes $5, $10, $20, $40, $80. The first win recovers the losses and wins one unit. "
             "Ten losses in a row asks for $5,120 on the next ticket. The book stops taking the bet before that, or the bankroll does. "
             "The streak does not owe you a win. The progression spends the bankroll buying that idea."),
            ("Paroli",
             "Press the stake after a win, and only after a win. Start at one unit. After a win, bet two. After a second win, bet four. After the third win, take the profit and go back to one unit. A loss at any step goes back to one unit. "
             "The most you have in action is the profit from the series, plus the opening unit. A cold streak costs one unit at a time."),
            ("1-3-2-6",
             "A four-step press, in units: 1, then 3, then 2, then 6. Each step happens only after a win. Any loss returns to 1. "
             "Two wins in a row lock a profit even if the third loses, because the 1 and the 3 have already paid more than the 2 you then lose. "
             "Four wins is the long branch. You stop there. A fifth bet is a new series."),
            ("Fibonacci",
             "After a loss, the next stake is the sum of the last two stakes: 1, 1, 2, 3, 5, 8. After a win, step back two places. "
             "It climbs slower than a double. It still climbs. A long losing run reaches a stake the bankroll cannot cover, and the book does not pause the series for you."),
            ("Oscar's grind",
             "Raise the stake by one unit after a win, and only when that raise still fits inside a one-unit profit for the series. After a loss, repeat the same stake. "
             "The series ends when you are up one unit, then it starts over. The point is a small, finished gain. A long losing run still piles up the units you have to win back one at a time."),
        ]),
        ("Tickets that move together", [
            ("Correlated stack",
             "Two legs from the same game that rise together. A quarterback's passing yards and his receiver's receiving yards. A team total and that team's anytime scorer. "
             "The straight parlay price multiplies them as if they were separate games. They are not. "
             "The book's same-game price is the one that already knows they move together. The multiplied price on a card is a different number, and it can be the worse one."),
            ("Game total and side",
             "A big favorite and the under can be the same bet. If the favorite pulls away, the clock runs, and the under gets easier. "
             "A dog and the over can be the same bet the other way. The dog keeps it close, both teams throw, and the total stays live. "
             "Price them as one opinion. Two tickets that need the same game script are one bet written twice."),
            ("Player and the total",
             "A pass-catcher's over and the game over need the same script. A back's rushing over and a lead for his team need the opposite script, because a lead lets him run out the clock. "
             "Check the script before you stack them. Two tickets that need different games are a hedge you did not mean to make."),
            ("First touchdown and anytime",
             "Anytime at -110 and first touchdown at +600 on the same player. "
             "If he scores first, both cash. If he scores later, only the anytime pays, and it has to cover the first-touchdown stake. If he never scores, both lose. "
             "The first-touchdown ticket is the expensive rung. Keep it smaller than the anytime, the way a ladder keeps the top rung smaller than the bottom."),
        ]),
    ]


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle("K", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=RED, alignment=TA_CENTER, spaceAfter=4),
        "title": ParagraphStyle("T", parent=base["Title"], fontName="Times-Bold", fontSize=18, leading=22, textColor=NAVY, alignment=TA_CENTER, spaceAfter=2),
        "sub": ParagraphStyle("S", parent=base["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER, spaceAfter=10),
        "verdict": ParagraphStyle("V", parent=base["Normal"], fontName="Times-Italic", fontSize=11, leading=15, textColor=NAVY, alignment=TA_LEFT, spaceBefore=2, spaceAfter=8),
        "h": ParagraphStyle("H", parent=base["Heading2"], fontName="Times-Bold", fontSize=13, leading=16, textColor=NAVY, spaceBefore=11, spaceAfter=4),
        "name": ParagraphStyle("N", parent=base["Normal"], fontName="Times-Bold", fontSize=11, leading=14, textColor=NAVY, spaceBefore=2, spaceAfter=1),
        "body": ParagraphStyle("B", parent=base["Normal"], fontName="Times-Roman", fontSize=10.5, leading=14, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=1),
        "foot": ParagraphStyle("F", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED, spaceBefore=12),
    }


if __name__ == "__main__":
    main()
