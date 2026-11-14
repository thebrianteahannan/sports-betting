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
            ("Alternate-line middle",
             "The same side of a market, bought as two different numbers. Over 44.5 at one book and under 48.5 at another, or favorite −2.5 and dog +6.5 after a move. "
             "The window is every finish between the two numbers. Outside it, one ticket pays for the other. "
             "It is a middle that started as two alternate lines instead of a line move. The window still has to be wide enough, and the juice on both tickets still has to be thin enough, or the ordinary night is just a slow leak."),
            ("Half and quarter stack",
             "Bet the full game and a half or a quarter on the same opinion. Favorite −3 for the game and favorite −0.5 for the first half. "
             "A blowout that starts early cashes both. A slow start that finishes strong cashes only the game. A lead that fades cashes only the half. "
             "The two tickets need the same team, but they do not need the same clock. Size them as two bets, not one opinion written twice at full stake."),
            ("Synthetic spread",
             "Build a homemade point spread from a moneyline and a total, or from a team total and a moneyline. "
             "Favorite moneyline plus the under is often the same script as favorite −6.5: a lead, a slow clock, and fewer points. "
             "Price the package against the posted spread. If the two tickets cost more, in break-even percent, than the straight spread, you built a worse number. If they cost less, you found a cheaper way to say the same thing."),
        ]),
        ("Several bets, one payout", [
            ("Dutching",
             "Split one stake across every result you are willing to hold, so each winner pays the same amount. "
             "Three players to score the first touchdown, at +450, +600, and +800. Stake them in proportion to the implied price so a win by any of the three returns the same profit. "
             "The book still holds the players you left off. If none of the three scores first, the stake is gone. "
             "Dutch a set only when the combined implied price of your side is under 100 percent. Over 100 percent, every winner still loses money."),
            ("Cover the field",
             "Dutching on a futures board. Four teams left in a conference, priced +200, +250, +400, and +600. Stake each so any champion returns the same dollars. "
             "The leftover is the juice: if the four prices sum over 100 percent, every winner still loses money. "
             "Leave one longshot off only when you mean to. An uncovered champion is a full loss on the whole stack, not a small miss."),
            ("Arbitrage",
             "Two books post a gap big enough that a bet on each side returns more than the combined stake. "
             "Book A has the over at +110. Book B has the under at +110. Split the stake so both payouts match. Either result returns the same profit, about the gap minus nothing, because both prices are plus money. "
             "The profit exists only if both tickets are accepted at those numbers. A book that cuts the bet, moves the line, or voids one side leaves you holding the other side alone. "
             "That leftover side is a normal bet, and it can lose."),
            ("Scalp",
             "A short-lived arbitrage. The same side opens at +105 in one book and the other side is still +100 somewhere else for a few minutes. "
             "You take both, lock a few cents on the dollar, and you are done before the game starts. "
             "The risk is the same as any arb: one book moves, rejects, or limits the ticket, and the leftover side is a naked bet. A scalp that needs five accounts and a refresh every ten seconds is a job, not a night off."),
            ("Low-hold shopping",
             "The same side is −105 in one book and −115 in another. Take the −105. "
             "This is one ticket, not a middle. The whole of the edge is the juice you did not pay. Over a season of flat bets, the difference between −105 and −115 is the difference between a price that needs 51.2 percent and a price that needs 53.5 percent."),
            ("Round robin",
             "Three legs, and a parlay for every pair, plus the three-leg if you want it. "
             "A miss on one leg kills the tickets that used it and leaves the other pair alive. Two hits pay one two-leg. Three hits pay all three pairs and the long ticket. "
             "You pay for that survival. Three two-leg tickets cost more than one three-leg, and a single hit pays nothing. Use it when each pair is a bet you would have made anyway."),
            ("System bets",
             "Named round robins. A Trixie is three legs as every two-leg plus the three-leg: four tickets. A Patent adds the three singles: seven tickets. "
             "A Yankee is four legs as every two-leg, every three-leg, and the four-leg: eleven tickets. A Lucky 15 adds the four singles. "
             "Heinz, Super Heinz, and Goliath keep climbing the count. The shape is the same as a round robin: survival when some legs miss, and a bigger total stake than one long parlay. "
             "Name them when the book does. Build them by hand when it does not. Either way, count the tickets before you size the unit."),
            ("If-bet",
             "The second ticket is placed only if the first wins, and only for the amount the first returned. "
             "A $10 if-bet on two sides risks $10, not $20. If the first loses, the second never exists. If the first wins and the second loses, the profit from the first is what you lose. "
             "The order is the whole strategy. Put the leg you trust first."),
            ("Reverse",
             "Two if-bets, each order. A then B, and B then A. "
             "Both can lose, one can win, or the pair can chain. The stake is two units up front because both openers are live. "
             "It costs more than a single if-bet and less than two straight bets when the second game is the one that misses."),
            ("Action reverse",
             "A reverse that still fires the second ticket when the first pushes. "
             "A plain if-bet dies on a push. An action ticket treats the push as a go-ahead, so the second side is still live. "
             "You pay for that. The book prices action as more exposure, because a push no longer saves the stake. Use it when a key number makes a push likely and you still want the second game."),
            ("Free-bet conversion",
             "A free bet that returns profit only, stake not returned, hedged with real money on the other side. "
             "A $50 free bet at +300 pays $150 profit if it hits. A real-money hedge on the other side sized to that $150 locks about $35 either way, give or take the hedge price. "
             "That locked number is the conversion. Around seventy cents on the free-bet dollar is a clean take. Under half is a gift you are selling back too cheap. "
             "The free bet has to clear the book's rules: eligible market, minimum price, and one use. A voided free bet leaves the hedge standing alone."),
        ]),
        ("Protection after the first ticket is down", [
            ("Hedge",
             "You already hold a side. You bet the other side, smaller or larger, to change what the night can cost. "
             "A $10 ticket at +300 pays $40 if it hits. The live book offers the other side at −200. "
             "A $20 hedge on that side locks about $10 either way: the original wins and the hedge loses, or the hedge wins and the original loses. "
             "Hedge when the locked number is a profit you want to keep. Skip it when the hedge price is short enough that you are selling the ticket for less than it is worth."),
            ("Partial hedge",
             "Hedge less than the full payout. The $10 ticket at +300 still pays $40. A $10 hedge at −200 locks a smaller floor and leaves a larger ceiling. "
             "If the original hits, you keep more of the long side after the hedge loses. If the hedge hits, you lose less than a naked ticket and less profit than a full lock. "
             "The point is a night you can still enjoy, not a night you have sold. Size the hedge to the floor you need, not to the floor that erases the ticket."),
            ("Freeroll hedge",
             "Hedge only enough that the worst result is break-even, and leave the rest as free upside. "
             "A futures ticket that would pay $500 is hedged so a loss returns the original stake, and a win still pays a leftover profit after the hedge loses. "
             "You are not locking a win. You are buying a night where you cannot lose the stake, and you can still win. If the hedge price is too short, the freeroll costs more than the upside is worth."),
            ("Parlay hedge",
             "Four of five legs have hit, and the last game has not started. The ticket pays $80 on a $10 stake. "
             "Bet the other side of the last leg for enough that a loss on the parlay still leaves a profit, and a win on the parlay still leaves a profit after the hedge loses. "
             "The last leg's price decides the size. A −300 last leg is expensive to hedge. A +100 last leg is cheap, and that is when the hedge is the bet."),
            ("Future hedge",
             "A team you took at +800 in March to win the title is now −150 in the final. "
             "A bet on the other side at the final price locks a profit on the season. The size is the same arithmetic as any hedge: match the payouts, then decide whether the locked number is worth giving up the longshot."),
            ("Cash-out",
             "The book offers to buy the ticket back before it ends. The number they offer is a hedge they priced, with their juice still in it. "
             "Take it when you would have bet the other side at that price anyway. Leave it when the offer is a shorter number than the live hedge you can type yourself."),
            ("Early-payout middle",
             "A promo pays the ticket early when a team leads by a set margin, and the game is still live. "
             "You take the side that can trigger the early pay. After it pays, you buy the other side of the live game. "
             "If the lead holds, you already collected and the live hedge is a small loss or a scratch. If the other team comes back, the live ticket cashes and the early pay already cleared. "
             "Both tickets paying is the middle. The promo rules are the whole bet: which sports, which margin, and whether a push voids the early pay."),
        ]),
        ("How much to put on the ticket", [
            ("Flat stake",
             "The same small piece of the bankroll on every ticket. One or two percent. A $500 bankroll is a $5 to $10 bet, and it stays there after a win and after a loss. "
             "The price of the ticket does not change the stake. A +400 and a −150 get the same dollars. The record is then the prices, not a staking swing."),
            ("Kelly",
             "Stake a fraction of the bankroll equal to your edge divided by the payout odds. "
             "You have a 55 percent side at even money. The edge is 10 percent, the odds are 1 to 1, and full Kelly says bet 10 percent of the bankroll. "
             "Full Kelly assumes the 55 is real. If the edge is half of what you thought, full Kelly overbets. Half Kelly, 5 percent in that example, keeps most of the growth and cuts the swing."),
            ("Stake by price",
             "Smaller dollars on longer prices, larger dollars on shorter ones, without claiming a full Kelly edge. "
             "A −150 gets one unit. A +200 gets half a unit. A +500 gets a quarter. "
             "The point is that a cold night of longshots cannot erase a week of favorites. The record still has to beat the price. Shrinking the stake does not turn a bad number into a good one."),
            ("Martingale",
             "Double the stake after every loss. A $5 start goes $5, $10, $20, $40, $80. The first win recovers the losses and wins one unit. "
             "Ten losses in a row asks for $5,120 on the next ticket. The book stops taking the bet before that, or the bankroll does. "
             "The streak does not owe you a win. The progression spends the bankroll buying that idea."),
            ("D'Alembert",
             "Raise the stake by one unit after a loss, and drop it by one unit after a win. Start at one. A loss goes to two. A win from two goes back to one. "
             "It climbs slower than a double, so the book and the bankroll last longer. It still assumes a win is due. A long losing run leaves a stack of open units that one short-priced winner does not clear."),
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
            ("Labouchere",
             "Write a short line of units that add up to the profit you want, such as 1-2-3. The next stake is the sum of the first and last numbers. A win crosses those two off. A loss appends the stake you just lost to the end of the line. "
             "The series ends when the line is empty. A cold stretch makes the line longer, and the next stake larger, until the bankroll or the book stops it. "
             "It is a way to chase a fixed profit. It is not a way to create an edge."),
            ("Oscar's grind",
             "Raise the stake by one unit after a win, and only when that raise still fits inside a one-unit profit for the series. After a loss, repeat the same stake. "
             "The series ends when you are up one unit, then it starts over. The point is a small, finished gain. A long losing run still piles up the units you have to win back one at a time."),
            ("Stop and reset",
             "A hard cap on the night, not a formula for the next stake. Stop after three units won, or after three units lost, and leave the book until tomorrow. "
             "The window is the session. Outside it, you do not chase. "
             "It does not improve a bad price. It only keeps a cold night from becoming a worse one, and a hot night from giving the profit back on a ticket you would not have opened cold."),
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
            ("Opposite-script pair",
             "Two tickets from the same game that need different nights on purpose. A receiver over and a rushing under. A favorite moneyline and the game over. "
             "One script cashes the first and loses the second. The other script does the reverse. A weird middle can cash both, and a dead game can lose both. "
             "This is a hedge you meant to make. Size them so one winner pays for the other, or admit you are paying juice to argue with yourself."),
            ("First touchdown and anytime",
             "Anytime at −110 and first touchdown at +600 on the same player. "
             "If he scores first, both cash. If he scores later, only the anytime pays, and it has to cover the first-touchdown stake. If he never scores, both lose. "
             "The first-touchdown ticket is the expensive rung. Keep it smaller than the anytime, the way a ladder keeps the top rung smaller than the bottom."),
            ("Team total and scorer",
             "A team's over on points and an anytime touchdown on that team's back or receiver. "
             "A shootout that runs through that player cashes both. A shootout that runs through someone else cashes only the team total. A defensive slog can lose both. "
             "The same-game button will price the correlation. The multiplied card will not. Read both before you call it a bargain."),
            ("Live press",
             "The side you wanted is winning late, and the live price on more of the same opinion is still long enough to take. "
             "You already hold the pregame ticket. You add a smaller live ticket on the lead holding, the under staying under, or the player clearing the next rung. "
             "A collapse loses the press and can still cash the original. A hold cashes both. The press is only the profit you are willing to put back at risk, never the stake you needed to keep."),
        ]),
        ("When the number moves", [
            ("Steam follow",
             "A sharp book moves first, and the other books are still asleep. You take the side that moved, at the old number, before the rest of the market catches up. "
             "The window is minutes. Miss it, and you are buying the new number with no edge left. "
             "A follow is only as good as the move. Public steam on a prime-time side is not the same as a syndicated opener getting bet down at a respected book."),
            ("Reverse line move",
             "Most of the dollars are on one side, and the line moves the other way. The market is saying the smaller money is the sharper money. "
             "You take the side the line is moving toward, not the side the tickets are piling onto. "
             "It fails when the move is a house adjustment, an injury, or a limit, not a respect for the other side. Read why the number moved before you fade the public."),
            ("Closing line value",
             "Judge the ticket by the number at kickoff, not by the result. You took +3.5 in the morning. The game closes at +2.5. You beat the close by a point even if the game loses. "
             "A season of beating the close is the habit. A single win against a worse close is a lucky ticket. "
             "This is not a second bet. It is the report card on the first one. Keep the record of the close next to the record of the win."),
            ("Slow number",
             "An injury, a weather change, or a lineup confirm hits, and one book is still posting the old price. "
             "You take the side that should move, at the stale number, and you do not wait for the market to agree. "
             "The risk is that the book knew something you did not, or that the ticket gets limited or voided when the news is marked. A slow number that survives is a gift. One that gets taken down after you bet is a fight with the desk."),
        ]),
        ("What the book is handing out", [
            ("Odds boost",
             "The book posts a juiced price on a named ticket. A two-leg that should be +120 is hanging at +200. "
             "Take it when the boost is real juice on a ticket you already wanted. Skip it when the boost is on a long shot you would never have typed, because a bad number at a better price is still a bad number. "
             "Boosts are often one per account, capped, and graded by the book's own rules. Read the cap before you size the stake."),
            ("No-sweat and insurance",
             "A promo refunds the stake as a free bet or credit when the ticket loses. "
             "A $25 no-sweat at −110 costs $25 if it wins the same as any other −110, and costs a free bet if it loses. The free bet is not cash. Convert it, or spend it on a second ticket you already liked. "
             "The promo is the edge, not the side. A no-sweat on a side you hate is still a side you hate, with a coupon attached."),
            ("Profit boost",
             "The book adds a percent to the profit on a winning ticket, not to the odds on the board. A +200 ticket with a 50 percent profit boost pays $15 profit on $10 instead of $20. "
             "That is a smaller gift than a true odds boost to +300, and the fine print usually caps the boost dollars. "
             "Use it on a short list of tickets you already planned to write. A boost that forces a five-leg same-game is the book picking your card for you."),
            ("Reduced juice night",
             "The book cuts −110 to −105 or −102 on a slate. "
             "That is low-hold shopping without a second book. Flat-bet the sides you already liked. Do not invent new sides just because the juice is cheaper. "
             "Cheaper juice on a bad number is still a bad number. The night is for the tickets that were close before the cut."),
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
