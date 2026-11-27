/** One Golden, Silver, and Bronze parlay a day, saved when marked and graded after the games. */

const { edgePull, ranHot } = require("./bet-kind");

const KEY = "bets/parlay-metal/";
const BARS = [
  { min: -120, max: 120, rate: 0.6 },
  { min: -150, max: 150, rate: 0.55 },
  { min: -200, max: 200, rate: 0.5 },
];
let book = null, bookAt = 0, notedAt = 0;

function kv() {
  return require("./live-recs").kv;
}

function dayKey(when) {
  const at = typeof when === "number" ? when : Date.parse(when || "");
  const stamp = Number.isFinite(at) ? at : Date.now();
  return new Date(stamp - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function whoOf(pick) {
  const named = String((pick && pick.who) || "").trim();
  if (named) return named.toLowerCase();
  return String((pick && pick.label) || "").split(/\s+(?:\d|Over\b|Under\b)/)[0].trim().toLowerCase();
}

function chance(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function priceOf(legs) {
  const dec = legs.reduce((p, leg) => {
    const n = Number(leg.odds);
    if (!Number.isFinite(n) || !n) return NaN;
    const rank = n > 0 ? n / 100 : 100 / Math.abs(n);
    return p * (1 + rank);
  }, 1);
  if (!Number.isFinite(dec) || dec <= 1) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function closePick(pick) {
  if (!pick || pick.golden || pick.silver || pick.bronze) return false;
  const hits = Number(pick.hits), n = Number(pick.n), odds = Number(pick.odds);
  if (!(n >= 5) || !Number.isFinite(hits) || !Number.isFinite(odds)) return false;
  const rate = hits / n;
  return BARS.some((bar) => {
    const off = odds < bar.min ? bar.min - odds : odds > bar.max ? odds - bar.max : 0;
    const short = bar.rate - rate;
    if (short <= 0 && off > 0 && off <= 40) return true;
    return off === 0 && short > 0 && short <= 0.08;
  });
}

function legsOf(picks, sports) {
  const now = Date.now();
  return (picks || []).map((pick) => {
    const kick = Date.parse(pick && pick.kickoff);
    if (!pick || !pick.label || !pick.match || !Number.isFinite(kick) || kick < now - 6 * 3600000) return null;
    if (ranHot(pick)) return null;
    const metal = !!(pick.golden || pick.silver || pick.bronze);
    if (!metal && !closePick(pick)) return null;
    const hits = Number(pick.hits), n = Number(pick.n);
    if (!(n >= 5) || !Number.isFinite(hits)) return null;
    const pull = edgePull(hits, n);
    const rate = pull ? pull.pulled : hits / n;
    const bookRate = chance(pick.odds);
    if (!(rate > 0) || bookRate == null) return null;
    const sport = (sports && (sports.get(`${pick.match}|${pick.kickoff}`) || sports.get(pick.match))) || pick.sport || "";
    return {
      who: whoOf(pick),
      rate,
      pick: { label: pick.label, market: pick.market || "", odds: Number(pick.odds), hits, n, match: pick.match, kickoff: pick.kickoff, sport },
    };
  }).filter(Boolean).sort((a, b) => (b.rate - chance(b.pick.odds)) - (a.rate - chance(a.pick.odds)));
}

function okLegs(legs) {
  const seen = new Set();
  for (const leg of legs) {
    const id = `${leg.who}|${leg.pick.market || ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function scoreLegs(legs) {
  const price = priceOf(legs.map((leg) => leg.pick));
  const need = chance(price);
  if (need == null) return null;
  const ours = legs.reduce((p, leg) => p * leg.rate, 1);
  const gap = Math.round((ours - need) * 1000) / 10;
  if (!(gap >= 0.5)) return null;
  return { price, need, ours, gap, legs };
}

function walk(pool, n, into) {
  const use = pool.slice(0, n >= 5 ? 12 : n === 4 ? 14 : n === 3 ? 22 : 40);
  if (use.length < n) return;
  const chosen = [];
  const step = (start) => {
    if (chosen.length === n) {
      if (!okLegs(chosen)) return;
      const row = scoreLegs(chosen.slice());
      if (row) into.push(row);
      return;
    }
    for (let i = start; i < use.length; i += 1) {
      chosen.push(use[i]);
      step(i + 1);
      chosen.pop();
    }
  };
  step(0);
}

function poolsOf(legs) {
  const byGame = new Map(), byLeague = new Map();
  legs.forEach((leg) => {
    const match = leg.pick.match;
    const sport = leg.pick.sport || dayKey(leg.pick.kickoff);
    if (!byGame.has(match)) byGame.set(match, []);
    byGame.get(match).push(leg);
    const key = `${dayKey(leg.pick.kickoff)}|${sport}`;
    if (!byLeague.has(key)) byLeague.set(key, []);
    byLeague.get(key).push(leg);
  });
  return [...byGame.values(), ...byLeague.values()].filter((group) => group.length >= 2);
}

function rank(picks, sports) {
  const raw = [];
  const seen = new Set();
  poolsOf(legsOf(picks, sports)).forEach((pool) => {
    [2, 3, 4, 5].forEach((n) => walk(pool, n, raw));
  });
  const rows = [];
  raw.sort((a, b) => b.gap - a.gap || a.legs.length - b.legs.length);
  raw.forEach((row) => {
    const id = row.legs.map((leg) => `${leg.pick.label}|${leg.pick.market}|${leg.pick.match}`).sort().join("~");
    if (seen.has(id)) return;
    seen.add(id);
    rows.push(row);
  });
  const spots = ["golden", "silver", "bronze"];
  const found = { golden: null, silver: null, bronze: null };
  rows.slice(0, 3).forEach((row, at) => {
    const legs = row.legs.map((leg) => leg.pick);
    const kickoff = legs.map((leg) => leg.kickoff).sort()[0];
    found[spots[at]] = {
      id: legs.map((leg) => `${leg.label}|${leg.market}|${leg.match}`).sort().join("~"),
      place: spots[at],
      markedAt: Date.now(),
      label: legs.map((leg) => leg.label).join(" · "),
      odds: row.price,
      ours: row.ours,
      need: row.need,
      match: [...new Set(legs.map((leg) => leg.match))].join(" · "),
      kickoff,
      legs,
      result: "",
    };
  });
  return found;
}

async function load(force) {
  if (!force && book && Date.now() - bookAt < 60000) return book;
  const rows = await kv()(`?k=like.${encodeURIComponent(KEY)}*&select=k,v`);
  book = new Map();
  (rows || []).forEach((row) => { if (row && row.v && row.v.id) book.set(row.v.id, row.v); });
  bookAt = Date.now();
  return book;
}

async function save(row) {
  book.set(row.id, row);
  bookAt = Date.now();
  await kv()("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + encodeURIComponent(row.id), v: row } });
}

async function note(picks) {
  if (Date.now() - notedAt < 60000) return;
  let sports = new Map();
  try { sports = await require("./live-recs").sportMap(); } catch (error) { sports = new Map(); }
  const found = rank(picks, sports);
  const have = await load(true);
  for (const spot of ["golden", "silver", "bronze"]) {
    const row = found[spot];
    if (!row) continue;
    const day = dayKey(row.kickoff);
    const held = [...have.values()].some((saved) => saved.place === spot && dayKey(saved.kickoff || saved.markedAt) === day);
    if (held || have.has(row.id)) continue;
    await save(row);
  }
  notedAt = Date.now();
}

function pack(rows) {
  const decided = rows.filter((row) => row.result === "won" || row.result === "lost");
  const history = rows.slice().sort((a, b) => (b.markedAt || 0) - (a.markedAt || 0)).map((row) => ({
    id: row.id,
    place: row.place,
    markedAt: row.markedAt,
    label: row.label,
    odds: row.odds,
    ours: row.ours,
    need: row.need,
    match: row.match,
    kickoff: row.kickoff,
    legs: row.legs || [],
    result: row.result || "",
  }));
  return {
    won: decided.filter((row) => row.result === "won").length,
    lost: decided.filter((row) => row.result === "lost").length,
    open: rows.filter((row) => !row.result).length,
    history,
  };
}

function oneEachDay(rows, place) {
  const byDay = new Map();
  rows.forEach((row) => {
    if (row.place !== place) return;
    const day = dayKey(row.kickoff || row.markedAt);
    const prev = byDay.get(day);
    if (!prev || (row.markedAt || 0) < (prev.markedAt || 0)) byDay.set(day, row);
  });
  return [...byDay.values()];
}

async function metals() {
  const values = [...(await load().catch(() => new Map())).values()];
  return {
    golden: pack(oneEachDay(values, "golden")),
    silver: pack(oneEachDay(values, "silver")),
    bronze: pack(oneEachDay(values, "bronze")),
  };
}

async function settle() {
  const have = await load(true);
  const due = [...have.values()].filter((row) => !row.result && Date.now() - Date.parse(row.kickoff) > 2 * 3600000).slice(0, 4);
  if (!due.length) return;
  const { gradeSaved } = require("./live-grade");
  for (const row of due) {
    const graded = [];
    let wait = false;
    for (const leg of row.legs || []) {
      const out = await gradeSaved(leg).catch(() => null);
      if (!out || !out.result) { wait = true; break; }
      graded.push(out.result);
    }
    if (wait || graded.length !== (row.legs || []).length) continue;
    if (graded.some((result) => result === "lost")) row.result = "lost";
    else if (graded.every((result) => result === "void")) row.result = "void";
    else {
      const live = (row.legs || []).filter((leg, at) => graded[at] !== "void");
      const next = priceOf(live);
      if (next) row.odds = next;
      row.result = "won";
    }
    row.gradedAt = Date.now();
    await save(row);
  }
}

module.exports = { note, settle, metals, rank };
