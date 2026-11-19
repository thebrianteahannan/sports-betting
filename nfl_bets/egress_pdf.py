#!/usr/bin/env python3
"""Design changes so Parlay of the Day stops blowing Supabase free-tier egress."""

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
GREEN = colors.HexColor("#1F6B4A")
ROOT = Path(__file__).resolve().parents[1]


def main() -> Path:
    out = ROOT / "Parlay of the Day - Supabase Egress Plan.pdf"
    docs = ROOT / "docs" / "egress.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    docs.parent.mkdir(parents=True, exist_ok=True)
    _write(out)
    docs.write_bytes(out.read_bytes())
    print(out)
    print(docs)
    return out


def _write(path: Path) -> None:
    today = date.today()
    doc = SimpleDocTemplate(
        str(path), pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.65 * inch, bottomMargin=0.6 * inch,
        title="Supabase Egress Plan", author="Parlay of the Day",
    )
    style = _styles()
    story: list = [
        Paragraph("Infrastructure", style["kicker"]),
        Paragraph("Stop running out of Supabase egress", style["title"]),
        Paragraph(
            f"{today:%B} {today.day}, {today.year} · Free plan 5 GB/month · Reclaim the old Wizards project for Parlay only",
            style["sub"],
        ),
        Paragraph(
            "In November 2026 the org used about <b>15.8 GB</b> of egress against a "
            "<b>5 GB</b> free cap (~316%). Supabase locked the project with HTTP 402. "
            "Sign-in, join, and board reads all failed — including for members whose "
            "trials were still open. Usage was tagged to the project still named "
            "<b>Wizards of Wiff</b>. That team is gone. Parlay already owns the same "
            "project and <b>kv</b> table (<b>bets/…</b> keys). Rename the project, "
            "delete leftover Wizards rows, then cut how often Parlay re-downloads "
            "large JSON so the free cap does not trip again.",
            style["verdict"],
        ),
        Paragraph("What “egress” means here", style["h"]),
        Paragraph(
            "Egress is bytes <b>leaving</b> Supabase toward our Mac or Hostinger. "
            "Every PostgREST read of a <b>kv</b> row counts. Uploads (writes) are mostly "
            "ingress and are not the quota that tripped. Storage size on disk is fine "
            "(near 0 of 1 GB). The problem is how often we re-download the same large JSON.",
            style["body"],
        ),
        Paragraph("Why it got this high", style["h"]),
        _bullets(style, [
            "<b>No host cache.</b> <b>server.js</b> <b>readKey()</b> hits Supabase on almost every "
            "request path. <b>/api/board</b> loads <b>bets/board.json</b> and "
            "<b>bets/archive.json</b> again even when nothing changed.",
            "<b>Fat archive.</b> Live <b>bets/archive.json</b> is on the order of "
            "<b>~1.5–1.7 MB</b> per download. Board alone is ~0.1 MB.",
            "<b>Browser poll.</b> Signed-in clients call <b>/api/board</b> about every "
            "<b>2 minutes</b> (<b>app.js</b>). Each poll can force another full archive pull "
            "from Supabase on the server, even when the client already has the archive "
            "tag (<b>have=</b> only skips sending archive to the browser — the host still "
            "reads it to compute the tag).",
            "<b>Mac refresh ~every 10 minutes.</b> <b>publish_board</b> <b>GET</b>s the remote "
            "archive to merge, then writes board, archive, ignored, and player logs. "
            "Archive GET alone is roughly <b>~7 GB/month</b> at a 10-minute cadence.",
            "<b>Player logs.</b> ~1,800 <b>bets/log/{sport}/{name}</b> rows. Stack/find paths "
            "batch-read many of them. Re-reading logs after they were already uploaded "
            "adds egress.",
            "<b>Leftover Wizards rows.</b> The same <b>kv</b> table still held team files "
            "(<b>roster.json</b>, <b>schedule.json</b>, accounts, fees, …) with no "
            "<b>bets/</b> prefix. They are unused now and should be deleted so the "
            "project is Parlay-only.",
        ]),
        Paragraph("Rough math (order of magnitude)", style["h"]),
        _math(style),
        Spacer(1, 8),
        Paragraph(
            "One active signed-in tab for a couple of weeks, plus the Mac refresh loop, "
            "is enough to exhaust the free 5 GB. A few concurrent users make it certain.",
            style["body"],
        ),
        Paragraph("Design goal", style["h"]),
        Paragraph(
            "Keep the free (or low) Supabase bill, restore login reliability, and stay "
            "comfortably under <b>2 GB egress / month</b>. Prefer <b>read less often</b> and "
            "<b>read smaller payloads</b> over moving hosts on day one. Make this Supabase "
            "project Parlay-only — rename it and purge non-<b>bets/</b> keys.",
            style["body"],
        ),
        Paragraph("Make the project Parlay-only", style["h"]),
        _bullets(style, [
            "In the Supabase dashboard, rename <b>Wizards of Wiff</b> to "
            "<b>Parlay of the Day</b> (Settings → General).",
            "Unlock the org first (upgrade or lift the spend cap) so API calls work again.",
            "Run <b>node purge-wizards-kv.js</b> (dry run), then "
            "<b>node purge-wizards-kv.js --apply</b>. That deletes every <b>kv</b> key that "
            "does not start with <b>bets/</b>, including the known Wizards files: "
            "roster, schedule, availability, tournament, practice, announcements, "
            "jerseys, contacts, recruits, fees, activity, accounts, strategy, lineups.",
            "Leave any Hostinger / DNS pointing at Parlay alone. Do not redeploy the "
            "Wizards Node app against this project.",
        ]),
        Paragraph("Design changes (do these)", style["h"]),
        Paragraph("1. In-memory cache on the Hostinger Node process", style["h2"]),
        _bullets(style, [
            "Cache <b>bets/board.json</b>, <b>bets/archive.json</b>, <b>bets/members.json</b>, "
            "<b>bets/ignored.json</b>, and picks/shelved with a short TTL (30–120 seconds) "
            "plus explicit invalidate on write.",
            "<b>/api/board</b> must compute <b>archiveTag</b> from the cached archive, not from "
            "a fresh Supabase GET on every poll.",
            "<b>loadMembers()</b> / <b>memberFrom()</b> must not re-download the full members "
            "blob on every API call; refresh on TTL or after login/join/reset writes.",
            "Expected impact: cut site-driven egress by an order of magnitude.",
        ]),
        Paragraph("2. Stop downloading archive just to hash it", style["h2"]),
        _bullets(style, [
            "Store <b>archiveTag</b> (or <b>updatedAt</b> + content hash) <b>inside</b> the "
            "archive or board document when the Mac or site writes it.",
            "If the client sends <b>have=</b> matching the cached tag, skip both the "
            "Supabase read (via cache) and the response body for archive — already partially "
            "true for the browser; make the server path match.",
        ]),
        Paragraph("3. Slim and split the archive", style["h2"]),
        _bullets(style, [
            "Keep publishing a thin open-ticket set for the live board (current "
            "<b>thin_archive</b> direction), but do not force the full settled history into "
            "every board poll.",
            "Move settled history to a separate key, e.g. <b>bets/archive-settled.json</b> "
            "or month shards <b>bets/archive/2026-11.json</b>, loaded only on the Finished / "
            "admin paths.",
            "Target: live poll payload from Supabase under <b>~100–200 KB</b>, not ~1.7 MB.",
        ]),
        Paragraph("4. Mac refresh: local-first merge", style["h2"]),
        _bullets(style, [
            "Treat <b>./output/archive.json</b> as source of truth on the Mac. Only "
            "<b>GET</b> remote archive when a site-side write may have happened (picks, "
            "settle, ignore) — or at most once per hour, not every 10 minutes.",
            "Always <b>PUT</b> board; <b>PUT</b> archive only when the merged bytes changed "
            "(already partially gated).",
            "Do not <b>PUT ignored.json</b> every refresh unless it changed.",
            "Expected impact: reclaim most of the ~7 GB/month archive GET cost.",
        ]),
        Paragraph("5. Player logs: write-once, read-rare", style["h2"]),
        _bullets(style, [
            "Keep <b>log-sent.json</b> so unchanged career packs are not re-uploaded.",
            "On the site, cache log batches in memory/disk for the process lifetime; "
            "stack builders should not re-fetch the same player on every card paint.",
            "Prefer fetching only the players on the current game, not wide <b>k=in.(…)</b> "
            "lists that overlap every request.",
        ]),
        Paragraph("6. Org / billing hygiene", style["h2"]),
        _bullets(style, [
            "<b>Short term:</b> upgrade the org or raise the spend cap so login works again "
            "while the cache ships and the Wizards purge runs.",
            "Add a simple egress budget alert (weekly check of the Usage page, or a "
            "logged counter of <b>readKey</b> bytes on the host).",
            "No second product should write to this <b>kv</b> table again.",
        ]),
        Paragraph("What not to do first", style["h"]),
        _bullets(style, [
            "Do not rewrite the whole data layer to Postgres tables before a host cache "
            "exists — that is weeks of work and does not stop the 2-minute full-archive pull.",
            "Do not store the 116 MB <b>sway.json</b> cache in Supabase.",
            "Do not raise browser poll frequency; if anything, slow idle polls when the "
            "tab is hidden (Page Visibility is already partly used elsewhere).",
        ]),
        Paragraph("Suggested build order", style["h"]),
        _order(style),
        Spacer(1, 8),
        Paragraph("Acceptance checks", style["h"]),
        _bullets(style, [
            "After deploy, a quiet night with the Mac refresh running and one idle signed-in "
            "tab uses well under <b>100 MB/day</b> of Supabase egress attributable to Parlay.",
            "Login and <b>/api/me</b> succeed while the board is warm — no 402 from Supabase.",
            "Admin can still open full history; live home does not download settled months.",
            "After purge + rename, Usage attributes traffic to Parlay of the Day, and "
            "no non-<b>bets/</b> keys remain in <b>kv</b>.",
        ]),
        Paragraph("Owner note", style["h"]),
        Paragraph(
            "Dave Simonds and every other member were blocked because the <b>store</b> was "
            "locked, not because their passwords or trials failed. Fixing egress is a "
            "reliability fix for the whole desk, not a one-off account repair.",
            style["body"],
        ),
    ]
    doc.build(story)


def _math(style: dict) -> Table:
    rows = [
        [Paragraph("<b>Path</b>", style["th"]), Paragraph("<b>About</b>", style["th"])],
        [
            Paragraph("Mac refresh GET archive every 10 min", style["td"]),
            Paragraph("~1.6 MB × 144/day ≈ <b>7 GB/month</b>", style["td"]),
        ],
        [
            Paragraph("One signed-in tab polling /api/board every 2 min (uncached host reads of board+archive)", style["td"]),
            Paragraph("~1.7 MB × 720/day ≈ <b>1.2 GB/day</b> (~35 GB/month)", style["td"]),
        ],
        [
            Paragraph("Free org cap", style["td"]),
            Paragraph("<b>5 GB/month</b> shared — already exceeded at 15.8 GB", style["td"]),
        ],
    ]
    table = Table(rows, colWidths=[3.4 * inch, 3.6 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _order(style: dict) -> Table:
    rows = [
        [Paragraph("<b>#</b>", style["th"]), Paragraph("<b>Change</b>", style["th"]), Paragraph("<b>Why first</b>", style["th"])],
        [Paragraph("0", style["td"]), Paragraph("Restore Supabase (upgrade / lift spend cap)", style["td"]), Paragraph("Login is hard-down until 402 clears", style["td"])],
        [Paragraph("1", style["td"]), Paragraph("Rename project; purge-wizards-kv.js --apply", style["td"]), Paragraph("Parlay-only kv; no leftover team files", style["td"])],
        [Paragraph("2", style["td"]), Paragraph("Host memory cache + invalidate on write", style["td"]), Paragraph("Biggest cut for the least code", style["td"])],
        [Paragraph("3", style["td"]), Paragraph("Persist archiveTag; skip GET when have= matches", style["td"]), Paragraph("Stops hashing via re-download", style["td"])],
        [Paragraph("4", style["td"]), Paragraph("Mac local-first archive merge", style["td"]), Paragraph("Removes ~7 GB/mo refresh tax", style["td"])],
        [Paragraph("5", style["td"]), Paragraph("Split settled archive from live board", style["td"]), Paragraph("Shrinks every remaining miss", style["td"])],
    ]
    table = Table(rows, colWidths=[0.4 * inch, 3.2 * inch, 3.4 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def _bullets(style: dict, items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(item, style["body"]), leftIndent=8, value="•") for item in items],
        bulletType="bullet", start="•", leftIndent=12, bulletFontSize=10,
    )


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle(
            "kicker", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10,
            textColor=RED, tracking=1, spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=20,
            textColor=NAVY, leading=24, spaceAfter=4,
        ),
        "sub": ParagraphStyle(
            "sub", parent=base["Normal"], fontName="Helvetica", fontSize=9,
            textColor=MUTED, spaceAfter=12,
        ),
        "verdict": ParagraphStyle(
            "verdict", parent=base["Normal"], fontName="Helvetica", fontSize=10.5,
            textColor=INK, leading=15, alignment=TA_JUSTIFY, spaceAfter=14,
            backColor=PAPER, borderPadding=8, leftIndent=4, rightIndent=4,
        ),
        "h": ParagraphStyle(
            "h", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=12,
            textColor=NAVY, spaceBefore=10, spaceAfter=6,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10.5,
            textColor=GREEN, spaceBefore=6, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica", fontSize=9.5,
            textColor=INK, leading=13, alignment=TA_JUSTIFY, spaceAfter=4,
        ),
        "th": ParagraphStyle(
            "th", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
            textColor=colors.white, leading=11, alignment=TA_LEFT,
        ),
        "td": ParagraphStyle(
            "td", parent=base["Normal"], fontName="Helvetica", fontSize=8.5,
            textColor=INK, leading=11, alignment=TA_LEFT,
        ),
        "center": ParagraphStyle(
            "center", parent=base["Normal"], alignment=TA_CENTER,
        ),
    }


if __name__ == "__main__":
    main()
