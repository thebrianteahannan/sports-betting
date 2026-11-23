/** Each new Golden Ticket, saved with the time it was marked and the card as it stood. */

const { kv } = require("./live-recs");

const KEY = "bets/golden/";
let book = null, bookAt = 0;

function idOf(pick) {
  return `${pick.label}|${pick.market || ""}|${pick.match}|${pick.kickoff || ""}`;
}

function dayKey(when) {
  const at = typeof when === "number" ? when : Date.parse(when || "");
  const stamp = Number.isFinite(at) ? at : Date.now();
  return new Date(stamp - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function inBand(odds) {
  const o = Number(odds);
  // A coin flip at the book: about 45% to 55%, so the profit is close to the stake.
  return Number.isFinite(o) && o >= -120 && o <= 120;
}

function ticketOk(pick) {
  const hits = Number(pick && pick.hits);
  const n = Number(pick && pick.n);
  return inBand(pick && pick.odds) && n >= 5 && hits / n >= 0.6;
}

function placeOf(row) {
  return row && (row.place === "silver" || row.place === "bronze") ? row.place : "golden";
}

function oneEachDay(rows, place) {
  const byDay = new Map();
  [...(rows || [])].forEach((row) => {
    if (place && placeOf(row) !== place) return;
    const day = dayKey(row.kickoff || row.markedAt);
    const prev = byDay.get(day);
    if (!prev || (row.markedAt || 0) < (prev.markedAt || 0)) byDay.set(day, row);
  });
  return byDay;
}

function heldDay(rows, day) {
  const spots = { golden: null, silver: null, bronze: null };
  [...(rows || [])].forEach((row) => {
    if (dayKey(row.kickoff || row.markedAt) !== day) return;
    const spot = placeOf(row);
    const prev = spots[spot];
    if (!prev || (row.markedAt || 0) < (prev.markedAt || 0)) spots[spot] = row;
  });
  return spots;
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

async function retireOpen() {
  const have = await load(true);
  for (const row of [...have.values()]) {
    if (row.result || ticketOk(row)) continue;
    const k = KEY + encodeURIComponent(row.id);
    await kv(`?k=eq.${encodeURIComponent(k)}`, { method: "DELETE", prefer: "return=minimal" });
    book.delete(row.id);
  }
  return book;
}

async function note(pick, place) {
  if (!pick || !pick.label || !pick.match) return;
  const spot = place === "silver" || place === "bronze" ? place : "golden";
  const have = await load(true);
  const day = dayKey(pick.kickoff || Date.now());
  if ([...have.values()].some((row) => placeOf(row) === spot && dayKey(row.kickoff || row.markedAt) === day && (row.result || ticketOk(row)))) return;
  if (!ticketOk(pick)) return;
  const id = idOf(pick);
  if (have.has(id)) return;
  await save({ ...snap(pick), place: spot });
}

async function choose(ranked) {
  const list = ranked || [];
  let have = new Map();
  try { have = await retireOpen(); } catch (error) { have = new Map(); }
  const today = dayKey(Date.now());
  const days = new Map();
  list.forEach((pick) => {
    const day = dayKey(pick.kickoff);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(pick);
  });
  const savedToday = heldDay(have.values(), today);
  const slate = (savedToday.golden || savedToday.silver || savedToday.bronze) ? today : ([...days.keys()].sort()[0] || today);
  const saved = heldDay(have.values(), slate);
  const pool = (days.get(slate) || []).filter((pick) => ticketOk(pick));
  const taken = new Set();
  const pickFor = (spot) => {
    const row = saved[spot];
    if (row && (row.result || ticketOk(row))) {
      const live = list.find((pick) => idOf(pick) === row.id) || row;
      taken.add(row.id || idOf(live));
      return live;
    }
    const next = pool.find((pick) => !taken.has(idOf(pick)));
    if (next) taken.add(idOf(next));
    return next || null;
  };
  const found = { golden: pickFor("golden"), silver: pickFor("silver"), bronze: pickFor("bronze") };
  const idSpot = new Map();
  ["golden", "silver", "bronze"].forEach((spot) => { if (found[spot]) idSpot.set(idOf(found[spot]), spot); });
  const stamp = (pick, spot) => (pick ? { ...pick, golden: spot === "golden", silver: spot === "silver", bronze: spot === "bronze", place: spot } : null);
  return {
    picks: list.map((pick) => {
      const spot = idSpot.get(idOf(pick)) || "";
      return { ...pick, golden: spot === "golden", silver: spot === "silver", bronze: spot === "bronze" };
    }),
    golden: stamp(found.golden, "golden"),
    silver: stamp(found.silver, "silver"),
    bronze: stamp(found.bronze, "bronze"),
  };
}

async function settle() {
  const have = await load(true);
  const due = [...have.values()].filter((row) => !row.result && Date.now() - Date.parse(row.kickoff) > 2 * 3600000).slice(0, 6);
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

function packRows(rows) {
  const decided = rows.filter((row) => row.result === "won" || row.result === "lost");
  const history = rows.slice().sort((a, b) => (b.markedAt || 0) - (a.markedAt || 0)).map((row) => ({
    id: row.id,
    place: placeOf(row),
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

async function tally(place) {
  const rows = [...oneEachDay((await load().catch(() => new Map())).values(), place || "golden").values()];
  return packRows(rows);
}

async function metals() {
  const have = await load().catch(() => new Map());
  const values = [...have.values()];
  return {
    golden: packRows([...oneEachDay(values, "golden").values()]),
    silver: packRows([...oneEachDay(values, "silver").values()]),
    bronze: packRows([...oneEachDay(values, "bronze").values()]),
  };
}

module.exports = { note, choose, settle, tally, metals };
