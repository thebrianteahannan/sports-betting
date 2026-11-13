/** Grades recommended picks once their game is final and keeps the record in Supabase for the live tracker's Today and All time counts. */

const { json, boxOf } = require("./live-api");
const { kv, recsList } = require("./live-recs");
const { gradeParlay } = require("./parlay-grade");
const { betKind, betCash } = require("./bet-kind");
const SPORT = { "basketball/nba": "NBA", "hockey/nhl": "NHL", "football/nfl": "NFL" };

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const PATHS = ["basketball/nba", "hockey/nhl", "football/nfl"];
const KEY = "bets/live-recs-graded/";
const NBA = { points: ["PTS"], rebounds: ["REB"], assists: ["AST"], threes: ["3PT"], "made threes": ["3PT"], steals: ["STL"], blocks: ["BLK"], "pts + reb": ["PTS", "REB"], "pts + ast": ["PTS", "AST"], "reb + ast": ["REB", "AST"], "pts + reb + ast": ["PTS", "REB", "AST"] };
const NHL = { points: ["G", "A"], goals: ["G"], assists: ["A"], "shots on goal": ["S"], "blocked shots": ["BS"], saves: ["SV"] };
let tickAt = 0, done = null, doneAt = 0;

function fold(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
}

function keep(pick) {
  return { label: pick.label, market: pick.market, odds: pick.odds, kind: pick.kind || betKind(pick.odds), basis: pick.basis || "", tier: pick.tier || "", drop: pick.drop || "", hits: pick.hits, n: pick.n, need: pick.need };
}

function dayOf(when) {
  return new Date(new Date(when).getTime() - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function grade(teams, pick) {
  const label = String(pick.label || ""), market = String(pick.market || "");
  const who = fold(label.split(/\s+(?=\d+\+|Over\b|Under\b)/)[0].replace(/\s+-$/, ""));
  const plus = market.match(/^(\d+)\+\s+(.+)$/), named = market.match(/\s-\s(?:Alt\s+)?(.+)$/), line = label.match(/\b(Over|Under)\s+(\d+(?:\.\d+)?)/i);
  const stat = ((plus && plus[2]) || (named && named[1]) || (label.match(/\b(?:Over|Under)\s+\d+(?:\.\d+)?\s+(.+)$/i) || [])[1] || "").toLowerCase();
  const need = plus ? Number(plus[1]) : line ? Number(line[2]) : null;
  if (need === null) return { result: "void" };
  for (const team of teams) for (const group of team.groups) {
    const row = group.rows.find((one) => fold(one.name) === who);
    if (!row) continue;
    const keys = [NBA[stat], NHL[stat]].find((set) => set && set.every((key) => group.labels.includes(key)));
    if (!keys) return { result: "void" };
    const now = keys.reduce((sum, key) => sum + (Number(String(row.stats[group.labels.indexOf(key)] || "0").split("-")[0]) || 0), 0);
    if (!plus && now === need) return { result: "void", got: now };
    const under = line && /under/i.test(line[1]), bar = plus ? need : under ? Math.ceil(need) - 1 : Math.floor(need) + 1, short = under ? now - bar : bar - now;
    const out = { got: now, bar, under: !!under };
    if (short <= 0) return { ...out, result: "won" };
    return { ...out, result: "lost", short, close: short <= (keys.includes("PTS") ? 2 : 1) && (under || now >= 1) };
  }
  return { result: "void" };
}

async function graded() {
  if (done && Date.now() - doneAt < 120000) return done;
  const rows = await kv(`?k=like.${encodeURIComponent(KEY)}*&select=v`);
  done = new Map((rows || []).filter((row) => row && row.v && row.v.id).map((row) => [row.v.id, row.v]));
  doneAt = Date.now();
  return done;
}

async function eventFor(match, kickoff) {
  const tail = (name) => fold(name).split(" ").pop(), sides = String(match).split(/ @ | v /).map(tail), kick = Date.parse(kickoff);
  const day = new Date(kick).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");
  for (const path of PATHS) {
    const data = await json(`${BASE}/${path}/scoreboard?dates=${day}`).catch(() => ({}));
    for (const ev of data.events || []) {
      const comp = (ev.competitions || [])[0] || {}, names = (comp.competitors || []).map((one) => tail((one.team || {}).displayName));
      if (sides.every((side) => names.includes(side)) && Math.abs(Date.parse(ev.date) - kick) < 12 * 3600000) return { id: String(ev.id), path, when: ev.date, state: ((comp.status || ev.status || {}).type || {}).state };
    }
  }
  return null;
}

async function gradeTick() {
  if (Date.now() - tickAt < 120000) return;
  tickAt = Date.now();
  const have = await graded(), games = new Map(), found = new Map();
  (await recsList()).filter((pick) => Date.now() - Date.parse(pick.kickoff) > 2 * 3600000).forEach((pick) => {
    const key = `${pick.match}|${pick.kickoff}`;
    if (!games.has(key)) games.set(key, []);
    games.get(key).push(pick);
  });
  for (const picks of games.values()) {
    const ev = await eventFor(picks[0].match, picks[0].kickoff);
    if (!ev || ev.state !== "post" || have.has(ev.id)) continue;
    if (!found.has(ev.id)) found.set(ev.id, { ev, picks: [] });
    found.get(ev.id).picks.push(...picks);
  }
  for (const { ev, picks } of found.values()) {
    const teams = boxOf(await json(`${BASE}/${ev.path}/summary?event=${ev.id}`)), seen = new Set();
    const out = picks.filter((pick) => { const id = `${pick.label}|${pick.market}`; if (seen.has(id)) return false; seen.add(id); return true; }).map((pick) => ({ ...keep(pick), ...grade(teams, pick) }));
    const row = { id: ev.id, match: picks[0].match, kickoff: ev.when, day: dayOf(ev.when), sport: SPORT[ev.path] || "", at: Date.now(), picks: out };
    await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + ev.id, v: row } });
    have.set(ev.id, row);
  }
  await gradeFill().catch((error) => console.error("live recs fill failed:", error));
}

async function gradeFill() {
  const have = await graded(), stale = [...have.values()].filter((row) => !row.explained || (row.picks || []).some((pick) => pick.result !== "void" && pick.bar === undefined)).slice(0, 3);
  for (const row of stale) {
    for (const path of PATHS) {
      const teams = boxOf(await json(`${BASE}/${path}/summary?event=${row.id}`).catch(() => ({})));
      if (!teams.some((team) => team.groups.some((group) => group.rows.length))) continue;
      row.picks = row.picks.map((pick) => ({ ...keep(pick), ...grade(teams, pick) }));
      await explain(row, SPORT[path]).catch((error) => console.error("live recs explain failed:", row.match, error && error.message));
      row.explained = Date.now();
      await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + row.id, v: row } });
      break;
    }
  }
}

async function explain(row, sport) {
  const legs = row.picks.map((pick) => ({ label: pick.label, market: pick.market, odds: pick.odds, match: row.match, kickoff: row.kickoff, sport }));
  const done = await gradeParlay({ id: row.id, legs });
  if (!done) return;
  const review = Object.values(done.reviews || {})[0];
  if (review) { const { players, ...lean } = review; row.review = lean; }
  row.picks = row.picks.map((pick, at) => ({ ...pick, why: ((done.legs || [])[at] || {}).why || "" }));
}

async function gradeTally() {
  const rows = [...(await graded().catch(() => new Map())).values()], today = dayOf(Date.now());
  const count = (list) => { const results = list.flatMap((row) => (row.picks || []).filter((pick) => pick.tier !== "good").map((pick) => pick.result)); return { won: results.filter((one) => one === "won").length, lost: results.filter((one) => one === "lost").length }; };
  const kinds = (list) => {
    const out = {};
    list.flatMap((row) => row.picks || []).forEach((pick) => {
      if (pick.result !== "won" && pick.result !== "lost") return;
      const box = out[pick.tier === "good" ? "good" : pick.kind || betKind(pick.odds)] ||= { won: 0, lost: 0, cash: 0 };
      box[pick.result] += 1; box.cash = Math.round((box.cash + betCash(pick.odds, pick.result)) * 100) / 100;
    });
    return out;
  };
  const history = rows.slice().sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff)).map((row) => ({ id: row.id, match: row.match, kickoff: row.kickoff, picks: row.picks || [], review: row.review || null }));
  const mine = rows.filter((row) => row.day === today);
  return { today: count(mine), all: count(rows), kinds: { today: kinds(mine), all: kinds(rows) }, history };
}

module.exports = { gradeTick, gradeTally };
