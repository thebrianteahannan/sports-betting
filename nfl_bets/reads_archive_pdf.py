#!/usr/bin/env python3
"""Archive of the admin Reads tab: the reads the trend button used, and the notes that were not on the desk yet."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch

from nfl_bets.attributes_pdf import _bullets, _styles

ROOT = Path(__file__).resolve().parents[1]

READS = [
    ("cb", "Opposing corner out", "A corner or safety on the other team is out. A receiver has a better chance at yards and a score."),
    ("qb", "Quarterback out", "The starting quarterback is out. The passing game has fewer clean chances."),
    ("wr", "Other receiver out", "Another receiver on his team is out. The one still playing can see more targets."),
    ("rb", "Lead back out", "The lead back is out. The next back can see more carries."),
    ("up", "Targets up", "His targets in the last few games are higher than the games before."),
    ("down", "Targets down", "His targets have fallen off."),
    ("hot", "Cleared it lately", "He has cleared this number lately, and the FanDuel price is short of that count."),
    ("foe", "Against this team", "He has cleared this number against this team."),
    ("home", "At home", "He clears this number at home, and the road games are different."),
    ("road", "On the road", "He clears this number on the road, and the home games are different."),
    ("bye", "Off a bye", "He is coming off a bye."),
    ("short", "Short week", "This is a short week, and his short weeks play out differently."),
    ("rest", "More rest", "He has had more rest than the other team."),
    ("back", "First game back", "This is his first game back from a layoff."),
    ("early", "Early East start", "A West Coast team is playing an early East Coast game."),
    ("zones", "Two time zones", "This trip crosses two time zones."),
    ("script", "High-scoring script", "His team's side of the number says a lot of points."),
    ("throw", "They'll be throwing", "His team is a big underdog, so the script leans pass."),
    ("run", "They'll be running", "His team is a big favorite, so the script leans run."),
    ("move", "The number didn't move", "The spread or the total moved, and this player's number stayed."),
    ("cold", "The other team is cold", "The other team has won few of its last games."),
    ("prime", "Prime time", "The kickoff is 7:00 PM ET or later."),
    ("rival", "Rivalry", "These two teams are rivals."),
    ("after", "After a rivalry", "This is the game after a rivalry."),
    ("next", "A rivalry is next", "A rivalry is the next game."),
    ("wind", "Wind", "Wind is 20 mph or more and the game is outside."),
    ("rain", "Rain", "Rain is in the forecast and the game is outside."),
    ("air", "Cold", "It is cold, and this bet is a pass or a catch."),
    ("dome", "Indoors", "The game is indoors."),
    ("denver", "Denver", "This game is in the altitude."),
    ("abroad", "Overseas", "This game is outside the usual US building."),
]

NOT_YET = [
    ("The trip, in miles", "Miles since the last game."),
    ("Baseball specifics", "Park factor as its own number. Whether the pitcher throws left or right. An umpire's strikeout tendency."),
    ("Who is assigned", "Which corner travels with this receiver. A goalie's save percentage. A referee's foul rate."),
    ("Where the prop opened", "The first number on this prop."),
]


def main() -> Path:
    out = ROOT / "docs" / "reads-archive.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    today = date.today()
    style = _styles()
    doc = SimpleDocTemplate(
        str(out), pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.65 * inch, bottomMargin=0.6 * inch,
        title="Reads archive", author="Parlay of the Day",
    )
    story: list = [
        Paragraph("Archive", style["kicker"]),
        Paragraph("The Reads tab", style["title"]),
        Paragraph(f"Taken off the admin page {today:%B} {today.day}, {today.year} · admin note", style["sub"]),
        Paragraph(
            "These were the reads on the admin Reads tab. When a member tapped \"Why the recent trend?\" on a player's bet, "
            "the server handed this list to Gemini as the things to look for, and Gemini named one only when the facts showed it. "
            "The server also kept only the measured hits whose id was on this list. Nobody ever edited the list, so it is the original set.",
            style["verdict"],
        ),
        Paragraph(f"The reads, {len(READS)}", style["h"]),
        _bullets(style, [f"<b>{name}</b> ({rid}). {gist}" for rid, name, gist in READS]),
        Spacer(1, 6),
        Paragraph("Not on the desk yet", style["h"]),
        Paragraph("The tab also listed reads the desk had no feed for. The longer list is in attributes.pdf.", style["body"]),
        _bullets(style, [f"<b>{name}.</b> {gist}" for name, gist in NOT_YET]),
        Paragraph("This note does not send a bet. A member still types the line into their own account.", style["foot"]),
    ]
    doc.build(story)
    print(out)
    return out


if __name__ == "__main__":
    main()
