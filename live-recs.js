/** Recommended bets from each game script, kept from before tip-off so the live tracker can show whether they hit. */

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
    const todo = games.filter((game) => { const kept = recs[`${game.match}|${game.kickoff}`]; return !kept || now - kept.at > (near(game) ? 30 * 60000 : 6 * 3600000); }).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
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

async function recRanked(days) {
  await pull();
  const now = Date.now(), day = (when) => new Date(when - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const tonight = Object.values(recs).filter((row) => Date.parse(row.kickoff) > now && (days ? Date.parse(row.kickoff) - now < days * 86400000 : day(Date.parse(row.kickoff)) === day(now)));
  const picks = tonight.flatMap((row) => (((row.story || {}).bets || {}).picks || []).map((pick) => ({ ...pick, match: row.match, kickoff: row.kickoff })));
  const edge = (pick) => (pick.n >= 5 ? (pick.hits / pick.n) * 100 - parseFloat(pick.need) : -Infinity);
  const ranked = picks.filter((pick) => pick.how && pick.tier !== "good" && Number.isFinite(edge(pick))).sort((a, b) => edge(b) - edge(a));
  return { all: picks.length, ranked: ranked.map((pick) => ({ who: pick.who, team: pick.team, label: pick.label, market: pick.market, odds: pick.odds, need: pick.need, hits: pick.hits, n: pick.n, how: pick.how, kind: pick.kind || "", basis: pick.basis || "", match: pick.match, kickoff: pick.kickoff })) };
}

async function recSample() {
  const { all, ranked } = await recRanked();
  return ranked.length ? { pick: ranked[0], more: all - 1 } : { pick: null, more: 0 };
}

async function recTop(count) {
  const today = (await recRanked()).ranked;
  if (today.length) return { span: "today", picks: today.slice(0, count) };
  const day = (when) => new Date(when - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), next = day(Date.now() + 86400000);
  const ahead = (await recRanked(14)).ranked, tomorrow = ahead.filter((pick) => day(Date.parse(pick.kickoff)) === next);
  return tomorrow.length ? { span: "tomorrow", picks: tomorrow.slice(0, count) } : { span: "week", picks: ahead.slice(0, count) };
}

async function recLazy() {
  const today = (await recRanked()).ranked;
  return today.length ? { span: "today", picks: today.slice(0, 30) } : { span: "week", picks: (await recRanked(7)).ranked.slice(0, 30) };
}

pull();

module.exports = { recRecord, recWarm, recsList, recStory, recSample, recTop, recLazy, kv };
