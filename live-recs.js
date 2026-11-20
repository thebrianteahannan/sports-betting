/** Recommended bets from each game script, kept from before tip-off so the live tracker can show whether they hit. */

const { betTag } = require("./bet-kind");
const KEY = "bets/live-recs/";
const SKIP = /under|quarter|qtr|half|each|most|touchdown|1st|first|minutes|double|triple/i;
let recs = {};
let warmAt = 0, pullAt = 0, pulling = null, warming = false;

async function kv(query, options = {}) {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""), key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Supabase is not configured on the host.");
  const response = await fetch(`${url}/rest/v1/kv${query}`, { method: options.method || "GET", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: options.prefer || "return=representation" }, body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function pull() {
  if (Date.now() - pullAt < 60000) return pulling || Promise.resolve();
  pullAt = Date.now();
  pulling = kv(`?k=like.${encodeURIComponent(KEY)}*&select=k,v`).then((rows) => {
    const fresh = {};
    (rows || []).forEach((row) => { if (row && row.v && row.v.match) fresh[`${row.v.match}|${row.v.kickoff}`] = row.v; });
    Object.keys(recs).forEach((key) => { if (!fresh[key] || recs[key].at > fresh[key].at) fresh[key] = recs[key]; });
    recs = fresh;
  }).catch((error) => { pullAt = 0; console.error("live recs load failed:", error); });
  return pulling;
}

function save(key) {
  kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + key, v: recs[key] } }).catch((error) => console.error("live recs save failed:", error));
}

function prune() {
  Object.keys(recs).forEach((key) => {
    if (Date.now() - Date.parse(recs[key].kickoff || "") <= 36 * 3600000) return;
    delete recs[key];
    kv(`?k=eq.${encodeURIComponent(KEY + key)}`, { method: "DELETE", prefer: "return=minimal" }).catch((error) => console.error("live recs prune failed:", error));
  });
}

function recRecord(match, kickoff, story) {
  const kick = Date.parse(kickoff || ""), bets = story && story.bets;
  if (!bets || !Number.isFinite(kick) || Date.now() >= kick) return;
  const seen = new Set();
  const picks = [bets, bets.stars].filter(Boolean).flatMap((set) => set.picks || []).filter((pick) => {
    const id = `${pick.label}|${pick.market}`;
    if (!pick.label || seen.has(id)) return false;
    seen.add(id); return true;
  }).map((pick) => ({ label: pick.label, market: pick.market, odds: pick.odds, who: pick.who, kind: pick.kind || "", basis: pick.basis || "", tier: pick.tier || "", drop: pick.drop || "", hits: pick.hits, n: pick.n, need: pick.need }));
  if (!picks.length) return;
  recs[`${match}|${kickoff}`] = { match, kickoff, at: Date.now(), picks, story };
  save(`${match}|${kickoff}`);
  prune();
}

async function recWarm(board) {
  const now = Date.now();
  if (now - warmAt < 10 * 60000 || warming) return;
  warmAt = now;
  warming = true;
  try {
    await pull();
    const near = (game) => Date.parse(game.kickoff) - now < 12 * 3600000;
    const games = ((board && board.games) || []).filter((game) => /^(NBA|NFL|NHL)$/.test(game.sport) && Date.parse(game.kickoff) > now && Date.parse(game.kickoff) - now < 14 * 24 * 3600000);
    const todo = games.filter((game) => { const kept = recs[`${game.match}|${game.kickoff}`]; return !kept || now - kept.at > (near(game) ? 30 * 60000 : 6 * 3600000); }).sort((a, b) => Boolean(recs[`${a.match}|${a.kickoff}`]) - Boolean(recs[`${b.match}|${b.kickoff}`]) || Date.parse(a.kickoff) - Date.parse(b.kickoff));
    if (!todo.length) return;
    const book = await require("./choose-api").chooseBet({ list: "lookup", when: "week" }, board);
    const people = ((book && book.people) || []).filter((person) => person.kind === "player");
    for (const game of todo) {
      const props = people.flatMap((person) => (person.bets || []).filter((bet) => bet.match === game.match && /\d/.test(`${bet.market} ${bet.label}`) && !SKIP.test(`${bet.market} ${bet.label}`)).map((bet) => ({ label: bet.label, market: bet.market, odds: bet.odds, who: person.name })));
      if (!props.length) continue;
      try { await require("./game-story").gameStory({ match: game.match, kickoff: game.kickoff, props }, board); } catch (error) { console.error("live recs warm failed:", game.match, error); }
    }
  } finally { warming = false; }
}

async function recsList() {
  await pull();
  return Object.values(recs).flatMap((row) => (row.picks || []).map((pick) => ({ label: pick.label, market: pick.market, odds: pick.odds, kind: pick.kind || "", basis: pick.basis || "", tier: pick.tier || "", drop: pick.drop || "", hits: pick.hits, n: pick.n, need: pick.need, match: row.match, kickoff: row.kickoff })));
}

function recStory(match, kickoff) {
  const kept = recs[`${match}|${kickoff}`];
  return kept && kept.story ? kept.story : null;
}

function inGoldenBand(odds) {
  const o = Number(odds);
  return Number.isFinite(o) && o >= -250 && o <= 100;
}

function pickKey(pick) {
  return `${pick.label}|${pick.market}|${pick.match}|${pick.odds}`;
}

function markGolden(ranked) {
  const list = ranked || [];
  const golden = list.find((pick) => inGoldenBand(pick.odds)) || null;
  const key = golden ? pickKey(golden) : "";
  return {
    picks: list.map((pick) => ({ ...pick, golden: key ? pickKey(pick) === key : false })),
    golden: golden ? { ...golden, golden: true } : null,
  };
}

async function recRanked(days) {
  await pull();
  const now = Date.now(), day = (when) => new Date(when - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const tonight = Object.values(recs).filter((row) => Date.parse(row.kickoff) > now && (days ? Date.parse(row.kickoff) - now < days * 86400000 : day(Date.parse(row.kickoff)) === day(now)));
  const picks = tonight.flatMap((row) => (((row.story || {}).bets || {}).picks || []).map((pick) => ({ ...pick, match: row.match, kickoff: row.kickoff })));
  const cleared = (pick) => {
    if (pick.tier !== "good" || !/^his record is only \d+ games$/.test(pick.drop || "")) return pick;
    const need = parseFloat(pick.need);
    const tag = betTag({ ...pick, need: need > 1 ? need / 100 : need });
    return tag.tier === "rec" ? { ...pick, tier: "rec", drop: "" } : pick;
  };
  const edge = (pick) => {
    if (pick.n < 5) return -Infinity;
    const base = (pick.hits / pick.n) * 100 - parseFloat(pick.need);
    const role = pick.role === "solid" ? 1.5 : pick.role === "thin" ? -2 : 0;
    const cushion = pick.cushion ? 0.75 : 0;
    return base + role + cushion;
  };
  const ranked = picks.map(cleared).filter((pick) => pick.how && pick.tier !== "good" && Number.isFinite(edge(pick))).sort((a, b) => edge(b) - edge(a));
  return {
    all: picks.length,
    ranked: ranked.map((pick) => ({
      who: pick.who,
      team: pick.team,
      label: pick.label,
      market: pick.market,
      text: pick.text || "",
      odds: pick.odds,
      need: pick.need,
      hits: pick.hits,
      n: pick.n,
      how: pick.how,
      kind: pick.kind || "",
      basis: pick.basis || "",
      role: pick.role || "",
      cushion: !!pick.cushion,
      cushionRoom: pick.cushion && Number.isFinite(Number(pick.cushionRoom)) ? Number(pick.cushionRoom) : null,
      cushionPct: pick.cushion && Number.isFinite(Number(pick.cushionPct)) ? Number(pick.cushionPct) : null,
      avg: Number.isFinite(Number(pick.avg)) ? Number(pick.avg) : undefined,
      reach: Number.isFinite(Number(pick.reach)) ? Number(pick.reach) : undefined,
      starter: !!pick.starter,
      match: pick.match,
      kickoff: pick.kickoff,
    })),
  };
}

let sportBoardAt = 0, sportBoardGames = [];
async function sportMap() {
  if (Date.now() - sportBoardAt >= 60000) {
    const rows = await kv(`?k=eq.${encodeURIComponent("bets/board.json")}&select=v`);
    sportBoardGames = (rows && rows[0] && rows[0].v && rows[0].v.games) || [];
    sportBoardAt = Date.now();
  }
  const map = new Map();
  sportBoardGames.forEach((game) => { if (!game || !game.match) return; map.set(`${game.match}|${game.kickoff}`, game.sport || ""); if (!map.has(game.match)) map.set(game.match, game.sport || ""); });
  return map;
}

function oneEach(ranked, sports) {
  const order = ["NFL", "NBA", "NHL", "MLB", "WNBA", "PGA"], seen = new Set(), picks = [];
  ranked.forEach((pick) => {
    const sport = (sports && (sports.get(`${pick.match}|${pick.kickoff}`) || sports.get(pick.match))) || "";
    if (!sport || seen.has(sport)) return;
    seen.add(sport);
    picks.push({ ...pick, sport });
  });
  return picks.sort((a, b) => ((order.indexOf(a.sport) + 1) || 99) - ((order.indexOf(b.sport) + 1) || 99));
}

async function recSample() {
  const today = await recRanked();
  let span = "today", ranked = today.ranked;
  if (!ranked.length) {
    const day = (when) => new Date(when - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), next = day(Date.now() + 86400000);
    const ahead = await recRanked(14), tomorrow = ahead.ranked.filter((pick) => day(Date.parse(pick.kickoff)) === next);
    span = tomorrow.length ? "tomorrow" : "week";
    ranked = tomorrow.length ? tomorrow : ahead.ranked;
  }
  const marked = markGolden(ranked);
  const sports = await sportMap().catch(() => new Map());
  const band = marked.picks.filter((pick) => inGoldenBand(pick.odds));
  const pool = band.length ? band : marked.picks;
  let picks = oneEach(pool, sports);
  const golden = marked.golden ? (await withSport([marked.golden]))[0] : null;
  if (golden && !picks.some((pick) => pick.golden)) picks = [golden, ...picks];
  const pick = golden || picks[0] || null;
  return { span, pick, picks, golden, more: Math.max(0, ranked.length - picks.length) };
}

async function withSport(picks) {
  const sports = await sportMap().catch(() => new Map());
  return (picks || []).map((pick) => {
    const sport = pick.sport || (sports.get(`${pick.match}|${pick.kickoff}`) || sports.get(pick.match) || "");
    return sport ? { ...pick, sport } : { ...pick };
  });
}

async function recTopPack(ranked, count) {
  const marked = markGolden(ranked);
  const picks = await withSport(marked.picks.slice(0, count));
  const golden = marked.golden ? (await withSport([marked.golden]))[0] : null;
  return { picks, golden };
}

async function recTop(count, when) {
  if (when === "week") {
    const pack = await recTopPack((await recRanked(14)).ranked, count);
    return { span: "week", ...pack };
  }
  const today = (await recRanked()).ranked;
  if (today.length) {
    const pack = await recTopPack(today, count);
    return { span: "today", ...pack };
  }
  const day = (at) => new Date(at - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), next = day(Date.now() + 86400000);
  const ahead = (await recRanked(14)).ranked, tomorrow = ahead.filter((pick) => day(Date.parse(pick.kickoff)) === next);
  if (tomorrow.length) {
    const pack = await recTopPack(tomorrow, count);
    return { span: "tomorrow", ...pack };
  }
  const pack = await recTopPack(ahead, count);
  return { span: "week", ...pack };
}

async function recLazy() {
  const today = (await recRanked()).ranked;
  return today.length ? { span: "today", picks: today.slice(0, 30) } : { span: "week", picks: (await recRanked(7)).ranked.slice(0, 30) };
}

pull();

module.exports = { recRecord, recWarm, recsList, recStory, recSample, recTop, recLazy, kv };
