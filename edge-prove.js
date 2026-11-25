/** Posted price and the close, kept after the live list is gone. */

const { kv } = require("./live-recs");
const { edgePull } = require("./bet-kind");

const KEY = "bets/edge-prove/";
const KEEP = 90 * 86400000;
const TAG_AT = 3;
const OURS_AT = 3;

function implied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function gapOf(fair, odds) {
  const price = implied(odds);
  const chance = Number(fair);
  if (!(chance > 0 && chance < 1) || !(price > 0 && price < 1)) return null;
  return Math.round((chance - price) * 1000) / 10;
}

function modelFields(pick, odds) {
  const pull = edgePull(pick && pick.hits, pick && pick.n);
  const price = implied(odds);
  if (!pull || !(price > 0 && price < 1)) return null;
  return { model: pull.pulled, modelGap: Math.round((pull.pulled - price) * 1000) / 10, modelN: Number(pick.n), recipe: "pull" };
}

let book = null;
let bookAt = 0;
let chain = Promise.resolve();

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

function note(pick, match, kickoff, mode) {
  const run = chain.then(() => writeNote(pick, match, kickoff, mode));
  chain = run.catch(() => {});
  return run;
}

async function writeNote(pick, match, kickoff, mode) {
  if (!pick || !pick.fairEx || !(Number(pick.fair) > 0) || !pick.label || !match) return;
  const have = await load();
  const id = `${pick.label}|${pick.market || ""}|${match}|${kickoff || ""}`;
  let row = have.get(id);
  let changed = false;
  if (!row) {
    const postedOdds = pick.postedOdds != null ? Number(pick.postedOdds) : Number(pick.odds);
    const postedGap = gapOf(pick.fair, postedOdds);
    row = {
      id,
      label: pick.label,
      market: pick.market || "",
      match,
      kickoff,
      postedOdds,
      postedFair: pick.fair,
      postedBooks: pick.fairBooks,
      postedGap,
      tagged: postedGap >= TAG_AT,
      postedAt: Date.now(),
    };
    const fields = modelFields(pick, postedOdds);
    if (fields) Object.assign(row, fields);
    changed = true;
  } else if (row.model == null) {
    const postedOdds = row.postedOdds != null ? row.postedOdds : (pick.postedOdds != null ? Number(pick.postedOdds) : Number(pick.odds));
    const fields = modelFields(pick, postedOdds);
    if (fields) { Object.assign(row, fields); changed = true; }
  }
  const kick = Date.parse(kickoff);
  const closing = mode === "close" || (mode !== "fill" && Number.isFinite(kick) && kick > Date.now() && kick - Date.now() < 3600000);
  if (closing && row.closeOdds == null) {
    row.closeOdds = Number(pick.odds);
    row.closeFair = pick.fair;
    row.closeAt = Date.now();
    const posted = implied(row.postedOdds);
    const close = implied(row.closeOdds);
    row.closeMove = posted != null && close != null ? Math.round((close - posted) * 1000) / 10 : null;
    row.beat = row.closeMove != null && row.closeMove >= 0.5;
    changed = true;
  }
  if (changed) await save(row);
}

async function prune(now) {
  const have = await load();
  for (const row of [...have.values()]) {
    const kick = Date.parse(row.kickoff);
    if (!Number.isFinite(kick) || now - kick <= KEEP) continue;
    const k = KEY + encodeURIComponent(row.id);
    await kv(`?k=eq.${encodeURIComponent(k)}`, { method: "DELETE", prefer: "return=minimal" });
    book.delete(row.id);
  }
}

function pile(rows) {
  const closed = rows.filter((row) => row.closeOdds != null && row.postedOdds != null);
  const moves = closed.map((row) => Number(row.closeMove)).filter((n) => Number.isFinite(n));
  const avg = moves.length ? Math.round((moves.reduce((sum, n) => sum + n, 0) / moves.length) * 10) / 10 : null;
  return { closed: closed.length, beat: closed.filter((row) => row.beat).length, avg };
}

async function summary() {
  const now = Date.now();
  await prune(now).catch(() => {});
  const rows = [...(await load()).values()];
  const tagged = rows.filter((row) => row.tagged);
  const ours = rows.filter((row) => Number(row.modelGap) >= OURS_AT);
  const card = (row) => ({ label: row.label, match: row.match, postedOdds: row.postedOdds, closeOdds: row.closeOdds, beat: !!row.beat, model: row.model });
  const closed = (list) => list.filter((row) => row.closeOdds != null).sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff)).slice(0, 40).map(card);
  return { tagged: pile(tagged), rest: pile(rows.filter((row) => !row.tagged)), ours: pile(ours), rows: closed(tagged), oursRows: closed(ours) };
}

module.exports = { note, summary, gapOf };
