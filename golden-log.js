/** Each new Golden Ticket, saved with the time it was marked and the card as it stood. */

const { kv } = require("./live-recs");

const KEY = "bets/golden/";
let book = null, bookAt = 0;

function idOf(pick) {
  return `${pick.label}|${pick.market || ""}|${pick.match}|${pick.kickoff || ""}`;
}

function snap(pick) {
  return {
    id: idOf(pick),
    markedAt: Date.now(),
    who: pick.who || "",
    team: pick.team || "",
    label: pick.label,
    market: pick.market || "",
    text: pick.text || "",
    odds: pick.odds,
    need: pick.need,
    hits: pick.hits,
    n: pick.n,
    how: pick.how || "",
    kind: pick.kind || "",
    basis: pick.basis || "",
    role: pick.role || "",
    tier: pick.tier || "",
    drop: pick.drop || "",
    cushion: !!pick.cushion,
    cushionRoom: pick.cushionRoom == null ? null : pick.cushionRoom,
    cushionPct: pick.cushionPct == null ? null : pick.cushionPct,
    avg: pick.avg,
    reach: pick.reach,
    starter: !!pick.starter,
    match: pick.match,
    kickoff: pick.kickoff,
    sport: pick.sport || "",
    result: "",
  };
}

async function load(force) {
  if (!force && book && Date.now() - bookAt < 60000) return book;
  const rows = await kv(`?k=like.${encodeURIComponent(KEY)}*&select=k,v`);
  book = new Map();
  (rows || []).forEach((row) => { if (row && row.v && row.v.id) book.set(row.v.id, row.v); });
  bookAt = Date.now();
  return book;
}

async function save(row) {
  book.set(row.id, row);
  bookAt = Date.now();
  await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + encodeURIComponent(row.id), v: row } });
}

async function note(pick) {
  if (!pick || !pick.label || !pick.match) return;
  const have = await load();
  const id = idOf(pick);
  if (have.has(id)) return;
  await save(snap(pick));
}

async function settle() {
  const have = await load(true);
  const due = [...have.values()].filter((row) => !row.result && Date.now() - Date.parse(row.kickoff) > 2 * 3600000).slice(0, 4);
  if (!due.length) return;
  const { gradeSaved } = require("./live-grade");
  for (const row of due) {
    const out = await gradeSaved(row).catch(() => null);
    if (!out || !out.result) continue;
    row.result = out.result;
    if (out.got != null) row.got = out.got;
    row.gradedAt = Date.now();
    await save(row);
  }
}

async function tally() {
  const rows = [...(await load().catch(() => new Map())).values()];
  const decided = rows.filter((row) => row.result === "won" || row.result === "lost");
  const history = rows.slice().sort((a, b) => (b.markedAt || 0) - (a.markedAt || 0)).map((row) => ({
    id: row.id,
    markedAt: row.markedAt,
    who: row.who || "",
    label: row.label,
    market: row.market || "",
    text: row.text || "",
    odds: row.odds,
    match: row.match,
    kickoff: row.kickoff,
    how: row.how || "",
    sport: row.sport || "",
    kind: row.kind || "",
    hits: row.hits,
    n: row.n,
    result: row.result || "",
    got: row.got,
  }));
  return {
    won: decided.filter((row) => row.result === "won").length,
    lost: decided.filter((row) => row.result === "lost").length,
    open: rows.filter((row) => !row.result).length,
    history,
  };
}

module.exports = { note, settle, tally };
