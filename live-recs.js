/** Recommended bets from each game script, kept from before tip-off so the live tracker can show whether they hit. */

const { betTag, edgeGap } = require("./bet-kind");
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
  const prior = new Map((((recs[`${match}|${kickoff}`] || {}).picks) || []).map((pick) => [`${pick.label}|${pick.market}`, pick]));
  const picks = [bets, bets.stars].filter(Boolean).flatMap((set) => set.picks || []).filter((pick) => {
    const id = `${pick.label}|${pick.market}`;
    if (!pick.label || seen.has(id)) return false;
    seen.add(id); return true;
  }).map((pick) => {
    const old = prior.get(`${pick.label}|${pick.market}`);
    return { label: pick.label, market: pick.market, odds: pick.odds, who: pick.who, kind: pick.kind || "", basis: pick.basis || "", tier: pick.tier || "", drop: pick.drop || "", hits: pick.hits, n: pick.n, need: pick.need, role: pick.role || "", cushion: !!pick.cushion, cushionRoom: pick.cushion ? pick.cushionRoom : null, cushionPct: pick.cushion ? pick.cushionPct : null, avg: pick.avg, reach: pick.reach, how: pick.how || "", matchupShift: Number(pick.matchupShift) || 0, matchupNote: pick.matchupNote || "", postedOdds: old && old.postedOdds != null ? old.postedOdds : Number(pick.odds), fair: old && old.fair != null ? old.fair : null, fairBooks: old && old.fairBooks != null ? old.fairBooks : null, fairEx: !!(old && old.fairEx), closeOdds: old && old.closeOdds != null ? old.closeOdds : null, closeFair: old && old.closeFair != null ? old.closeFair : null };
  });
  if (!picks.length) return;
  stampFair(bets, picks);
  recs[`${match}|${kickoff}`] = { match, kickoff, at: Date.now(), picks, story };
  save(`${match}|${kickoff}`);
  prune();
}

function stampFair(bets, picks) {
  const byId = new Map(picks.map((pick) => [`${pick.label}|${pick.market}`, pick]));
  [bets, bets && bets.stars].filter(Boolean).forEach((set) => (set.picks || []).forEach((pick) => {
    const kept = byId.get(`${pick.label}|${pick.market}`);
    if (!kept) return;
    ["postedOdds", "fair", "fairBooks", "fairEx", "closeOdds", "closeFair"].forEach((key) => { if (kept[key] != null) pick[key] = kept[key]; });
  }));
}

function fairFields(pick) {
  return { postedOdds: pick.postedOdds != null ? pick.postedOdds : null, fair: pick.fair != null ? pick.fair : null, fairBooks: pick.fairBooks != null ? pick.fairBooks : null, fairEx: !!pick.fairEx, closeOdds: pick.closeOdds != null ? pick.closeOdds : null, closeFair: pick.closeFair != null ? pick.closeFair : null };
}

function recOpen(book) {
  const games = book && book.pack === 1 && Array.isArray(book.games) ? book.games : null;
  return ((book && book.people) || []).filter((person) => person && person.kind === "player").map((person) => ({
    ...person,
    bets: (person.bets || []).map((bet) => {
      if (!games || !Array.isArray(bet)) return bet;
      const game = games[bet[2]] || ["", "", ""];
      return { label: bet[0], odds: bet[1], match: game[0], sport: game[1], kickoff: game[2], market: bet[3] || "" };
    }),
  }));
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
    const choose = require("./choose-api").chooseBet;
    const [today, week] = await Promise.all([
      choose({ list: "lookup", when: "today" }, board),
      choose({ list: "lookup", when: "week" }, board),
    ]);
    const people = new Map();
    [today, week].forEach((book) => {
      recOpen(book).forEach((person) => {
        const have = people.get(person.key);
        if (!have) { people.set(person.key, { ...person, bets: (person.bets || []).slice() }); return; }
        const seen = new Set(have.bets.map((bet) => `${bet.label}|${bet.odds}|${bet.match}`));
        (person.bets || []).forEach((bet) => {
          const id = `${bet.label}|${bet.odds}|${bet.match}`;
          if (!seen.has(id)) { seen.add(id); have.bets.push(bet); }
        });
      });
    });
    const players = [...people.values()];
    const empty = [], missed = [];
    for (const game of todo) {
      const props = players.flatMap((person) => (person.bets || []).filter((bet) => bet.match === game.match && /\d/.test(`${bet.market} ${bet.label}`) && !SKIP.test(`${bet.market} ${bet.label}`)).map((bet) => ({ label: bet.label, market: bet.market, odds: bet.odds, who: person.name })));
      if (!props.length) { empty.push(game.match); continue; }
      try { await require("./game-story").gameStory({ match: game.match, kickoff: game.kickoff, props }, board); } catch (error) { console.error("live recs warm failed:", game.match, error); }
      if (!recs[`${game.match}|${game.kickoff}`]) missed.push(game.match);
    }
    console.log(`[live] recs warm: ${todo.length} games, ${empty.length} with no props, ${missed.length} with no list`);
    if (empty.length) console.log("[live] no props:", empty.join("; "));
    if (missed.length) console.log("[live] no list:", missed.join("; "));
  } finally { warming = false; }
}

async function recsList() {
  await pull();
  return Object.values(recs).flatMap((row) => {
    const full = new Map(((((row.story || {}).bets || {}).picks) || []).map((pick) => [`${pick.label}|${pick.market}`, pick]));
    return (row.picks || []).map((pick) => {
      const src = full.get(`${pick.label}|${pick.market}`) || pick;
      return { label: pick.label, market: pick.market, odds: pick.odds, kind: src.kind || pick.kind || "", basis: src.basis || pick.basis || "", tier: src.tier || pick.tier || "", drop: src.drop || pick.drop || "", hits: src.hits != null ? src.hits : pick.hits, n: src.n != null ? src.n : pick.n, need: src.need != null ? src.need : pick.need, role: src.role || pick.role || "", cushion: !!(src.cushion || pick.cushion), cushionRoom: (src.cushion || pick.cushion) ? (src.cushionRoom != null ? src.cushionRoom : pick.cushionRoom) : null, cushionPct: (src.cushion || pick.cushion) ? (src.cushionPct != null ? src.cushionPct : pick.cushionPct) : null, avg: src.avg != null ? src.avg : pick.avg, reach: src.reach != null ? src.reach : pick.reach, how: src.how || pick.how || "", matchupShift: Number(src.matchupShift != null ? src.matchupShift : pick.matchupShift) || 0, matchupNote: src.matchupNote || pick.matchupNote || "", match: row.match, kickoff: row.kickoff, ...fairFields(src.fair != null || src.postedOdds != null ? src : pick) };
    });
  });
}

function recStory(match, kickoff) {
  const kept = recs[`${match}|${kickoff}`];
  return kept && kept.story ? kept.story : null;
}

function inGoldenBand(odds) {
  const o = Number(odds);
  return Number.isFinite(o) && o >= -250 && o <= 100;
}

function markGolden(ranked) {
  return require("./golden-log").choose(ranked);
}

async function recRanked(days, keepStarted) {
  await pull();
  const now = Date.now(), day = (when) => new Date(when - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const tonight = Object.values(recs).filter((row) => {
    const kick = Date.parse(row.kickoff);
    if (days) return kick > now && kick - now < days * 86400000;
    if (keepStarted) return day(kick) === day(now) && (kick > now || now - kick < 36 * 3600000);
    return kick > now && day(kick) === day(now);
  });
  const picks = tonight.flatMap((row) => (((row.story || {}).bets || {}).picks || []).map((pick) => ({ ...pick, match: row.match, kickoff: row.kickoff })));
  const cleared = (pick) => {
    if (pick.tier !== "good" || !/^(?:his record is only \d+ games|that game ran hot|those \d+ games ran hot)$/.test(pick.drop || "")) return pick;
    const need = parseFloat(pick.need);
    const tag = betTag({ ...pick, need: need > 1 ? need / 100 : need });
    return tag.tier === "rec" ? { ...pick, tier: "rec", drop: "" } : pick;
  };
  const edge = (pick) => {
    if (pick.n < 5) return -Infinity;
    const row = edgeGap(pick.hits, pick.n, pick.need);
    const base = row ? row.gap : -Infinity;
    const role = pick.role === "solid" ? 1.5 : pick.role === "thin" ? -2 : 0;
    const cushion = pick.cushion ? 0.75 : 0;
    return base + role + cushion;
  };
  const fillCushion = (pick) => {
    let avg = Number(pick.avg), reach = Number(pick.reach);
    let room = Number(pick.cushionRoom), pct = Number(pick.cushionPct);
    const how = String(pick.how || "");
    const text = `${pick.text || ""} ${pick.label || ""}`;
    if (!Number.isFinite(reach)) {
      const hit = text.match(/\bover\s+([\d.]+)\b/i) || text.match(/([\d.]+)\s*\+/);
      if (hit) reach = Number(hit[1]);
    }
    if (!Number.isFinite(avg) || !Number.isFinite(reach)) {
      const hit = how.match(/averages\s+([\d.]+)[\s\S]*?reached\s+([\d.]+)/i);
      if (hit) {
        if (!Number.isFinite(avg)) avg = Number(hit[1]);
        if (!Number.isFinite(reach)) reach = Number(hit[2]);
      }
    }
    if (!Number.isFinite(room) && Number.isFinite(avg) && Number.isFinite(reach)) room = avg - reach;
    if (!Number.isFinite(pct) && Number.isFinite(room) && Number.isFinite(reach) && reach > 0) pct = room / reach;
    return {
      ...pick,
      avg: Number.isFinite(avg) ? avg : pick.avg,
      reach: Number.isFinite(reach) ? reach : pick.reach,
      cushionRoom: pick.cushion && Number.isFinite(room) ? room : null,
      cushionPct: pick.cushion && Number.isFinite(pct) ? pct : null,
    };
  };
  const ranked = picks.map(cleared).filter((pick) => pick.how && pick.tier !== "good" && Number.isFinite(edge(pick))).sort((a, b) => edge(b) - edge(a));
  return {
    all: picks.length,
    ranked: ranked.map((row) => {
      const pick = fillCushion(row);
      return {
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
        matchupShift: Number(pick.matchupShift) || 0,
        matchupNote: pick.matchupNote || "",
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
        ...fairFields(pick),
      };
    }),
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
  const marked = await markGolden(dedupePicks((await recRanked(null, true)).ranked.concat(ranked)));
  const sports = await sportMap().catch(() => new Map());
  const flagged = flagMetals(ranked, marked);
  const band = flagged.filter((pick) => inGoldenBand(pick.odds));
  const pool = band.length ? band : flagged;
  let picks = oneEach(pool, sports);
  const tickets = await stampMetals(marked);
  picks = frontTickets(picks, tickets);
  const pick = tickets.golden || picks[0] || null;
  return { span, pick, picks, ...tickets, more: Math.max(0, ranked.length - picks.length) };
}

function dedupePicks(rows) {
  const seen = new Set();
  return (rows || []).filter((pick) => {
    const id = `${pick && pick.label}|${(pick && pick.market) || ""}|${pick && pick.match}|${(pick && pick.kickoff) || ""}`;
    if (!pick || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function flagMetals(ranked, marked) {
  const byId = new Map((marked.picks || []).map((pick) => [`${pick.label}|${pick.market || ""}|${pick.match}|${pick.kickoff || ""}`, pick]));
  return (ranked || []).map((pick) => byId.get(`${pick.label}|${pick.market || ""}|${pick.match}|${pick.kickoff || ""}`) || pick);
}

function frontTickets(picks, tickets) {
  const front = [tickets.golden, tickets.silver, tickets.bronze].filter(Boolean);
  const rest = (picks || []).filter((pick) => !front.some((ticket) => ticket.label === pick.label && ticket.match === pick.match && ticket.kickoff === pick.kickoff));
  return front.concat(rest);
}

async function stampMetals(marked) {
  const golden = marked.golden ? (await withSport([marked.golden]))[0] : null;
  const silver = marked.silver ? (await withSport([marked.silver]))[0] : null;
  const bronze = marked.bronze ? (await withSport([marked.bronze]))[0] : null;
  const note = require("./golden-log").note;
  if (golden) note(golden).catch((error) => console.error("golden note failed:", error));
  if (silver) note(silver, "silver").catch((error) => console.error("silver note failed:", error));
  if (bronze) note(bronze, "bronze").catch((error) => console.error("bronze note failed:", error));
  return { golden, silver, bronze };
}

async function withSport(picks) {
  const sports = await sportMap().catch(() => new Map());
  return (picks || []).map((pick) => {
    const sport = pick.sport || (sports.get(`${pick.match}|${pick.kickoff}`) || sports.get(pick.match) || "");
    return sport ? { ...pick, sport } : { ...pick };
  });
}

async function recTop(count, when) {
  const picked = await recRankedList(when);
  const dayRanked = picked.span === "today" ? (await recRanked(null, true)).ranked : [];
  const marked = await markGolden(dedupePicks(dayRanked.concat(picked.ranked)));
  const picks = await withSport(flagMetals(picked.ranked, marked).slice(0, count));
  const tickets = await stampMetals(marked);
  return { span: picked.span, picks: frontTickets(picks, tickets), ...tickets };
}

async function recRankedList(when) {
  if (when === "week") return { span: "week", ranked: (await recRanked(14)).ranked };
  const today = (await recRanked()).ranked;
  if (today.length) return { span: "today", ranked: today };
  const day = (at) => new Date(at - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), next = day(Date.now() + 86400000);
  const ahead = (await recRanked(14)).ranked, tomorrow = ahead.filter((pick) => day(Date.parse(pick.kickoff)) === next);
  if (tomorrow.length) return { span: "tomorrow", ranked: tomorrow };
  return { span: "week", ranked: ahead };
}

async function recLazy() {
  const today = (await recRanked()).ranked;
  return today.length ? { span: "today", picks: today.slice(0, 30) } : { span: "week", picks: (await recRanked(7)).ranked.slice(0, 30) };
}

async function fairTick() {
  const fair = require("./market-fair");
  if (!fair.hasKey()) return;
  await pull();
  const now = Date.now();
  const sports = await sportMap().catch(() => new Map());
  const rows = Object.values(recs).map((row) => ({ row, sport: sports.get(`${row.match}|${row.kickoff}`) || sports.get(row.match) || "" })).filter((item) => /^(NFL|NBA|NHL)$/.test(item.sport) && Date.parse(item.row.kickoff) > now);
  await fillModel(rows);
  if (!rows.length) return;
  const ledger = await fair.readLedger(kv, now);
  if (ledger.used >= fair.DAY_CAP) return;
  const due = new Set(rows.filter((item) => fair.need(ledger.games[`${item.row.match}|${item.row.kickoff}`], item.row.kickoff, now)).map((item) => item.sport));
  if (!due.size) return;
  for (const sport of due) {
    if (ledger.used >= fair.DAY_CAP) break;
    let events = [];
    try { events = await fair.fetchLeague(sport); } catch (error) { console.error("fair price failed:", sport, error); continue; }
    ledger.used += events.length;
    for (const item of rows.filter((row) => row.sport === sport)) {
      const event = events.find((row) => fair.sameGame(item.row.match, row));
      const slot = ledger.games[`${item.row.match}|${item.row.kickoff}`] || { kickoff: item.row.kickoff };
      const mode = fair.need(slot, item.row.kickoff, now);
      if (!event || !mode) { ledger.games[`${item.row.match}|${item.row.kickoff}`] = slot; continue; }
      const logged = new Set();
      const proved = [];
      const closing = mode === "close" || Date.parse(item.row.kickoff) - now < 3600000;
      const apply = (pick) => {
        if (pick.postedOdds == null && Number.isFinite(Number(pick.odds))) pick.postedOdds = Number(pick.odds);
        const priced = fair.fairPrice(pick, event, sport);
        if (!priced) return;
        pick.fair = priced.fair;
        pick.fairBooks = priced.fairBooks;
        pick.fairEx = true;
        if (closing) { pick.closeOdds = Number(pick.odds); pick.closeFair = priced.fair; }
        const id = `${pick.label}|${pick.market}`;
        if (logged.has(id)) return;
        logged.add(id);
        proved.push(pick);
        console.log(`[fair] ${pick.label} ${priced.names.join(",")} ${(priced.fair * 100).toFixed(1)}%`);
      };
      (item.row.picks || []).forEach(apply);
      const bets = item.row.story && item.row.story.bets;
      [bets, bets && bets.stars].filter(Boolean).forEach((set) => (set.picks || []).forEach(apply));
      await Promise.all(proved.map((pick) => require("./edge-prove").note(pick, item.row.match, item.row.kickoff, closing ? "close" : mode).catch((error) => console.error("edge prove failed:", error))));
      slot.first = slot.first || Date.now();
      slot.ex = slot.ex || Date.now();
      if (closing) slot.close = Date.now();
      ledger.games[`${item.row.match}|${item.row.kickoff}`] = slot;
      item.row.at = Date.now();
      save(`${item.row.match}|${item.row.kickoff}`);
    }
  }
  await fair.writeLedger(kv, ledger);
}

async function fillModel(rows) {
  const prove = require("./edge-prove");
  const jobs = [];
  rows.forEach((item) => {
    const bets = item.row.story && item.row.story.bets;
    const sets = [item.row.picks, bets && bets.picks, bets && bets.stars && bets.stars.picks];
    sets.forEach((picks) => (picks || []).forEach((pick) => {
      if (pick && pick.fairEx) jobs.push(prove.note(pick, item.row.match, item.row.kickoff, "fill").catch((error) => console.error("edge prove failed:", error)));
    }));
  });
  if (jobs.length) {
    await Promise.all(jobs);
    console.log(`[fair] model fill ${jobs.length}`);
  }
}

pull();

module.exports = { recRecord, recWarm, recsList, recRanked, recStory, recSample, recTop, recLazy, fairTick, kv };
