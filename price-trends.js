/** Looks through saved FanDuel reprices for a clock that repeats, then lists props still on the early price. */

const KEY = "bets/price-trends";
const LOG = "bets/price-trends-log";
const HOUR = 3600000;
const WINDOWS = [
  [0, 1, "in the last hour"],
  [1, 3, "1 to 3 hours out"],
  [3, 6, "3 to 6 hours out"],
  [6, 12, "6 to 12 hours out"],
  [12, 24, "the day before"],
  [24, 48, "two days out"],
  [48, 96, "early in the week"],
];
const BLOCKS = [
  [0, 3, "from 12 to 3 AM"],
  [3, 6, "from 3 to 6 AM"],
  [6, 9, "from 6 to 9 AM"],
  [9, 12, "from 9 AM to 12 PM"],
  [12, 15, "from 12 to 3 PM"],
  [15, 18, "from 3 to 6 PM"],
  [18, 21, "from 6 to 9 PM"],
  [21, 24, "from 9 PM to 12 AM"],
];

let cache = null;
let ticking = false;

function implied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function pointsOf(prev, next) {
  const from = implied(prev);
  const to = implied(next);
  if (!(from > 0) || !(to > 0)) return 0;
  return Math.round((to - from) * 1000) / 10;
}

function priceText(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function etParts(at) {
  const bag = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", hour: "numeric", hourCycle: "h23", dayPeriod: "short" }).formatToParts(new Date(at)).forEach((part) => {
    if (part.type !== "literal") bag[part.type] = part.value;
  });
  let hour = parseInt(bag.hour, 10);
  if (!Number.isFinite(hour)) hour = 0;
  if (bag.dayPeriod && /pm/i.test(bag.dayPeriod) && hour < 12) hour += 12;
  if (bag.dayPeriod && /am/i.test(bag.dayPeriod) && hour === 12) hour = 0;
  return { weekday: bag.weekday || "", hour, day: new Date(at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) };
}

function hourSay(hour) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

function familyOf(label, market) {
  const text = `${market || ""} ${label || ""}`.toLowerCase().replace(/\byds\b/g, "yards").replace(/\btds\b/g, "touchdowns");
  if (/\b(alt|qtr|quarter|half|first|last|either|most|combine|each)\b/.test(text)) return "";
  if (/\bspread\b|\bhandicap\b|\bmoneyline\b|\bmoney line\b/.test(text)) return "";
  if (/\bteam total\b/.test(text)) return "Team total";
  if (/\btotal points\b/.test(text)) return "Game total";
  if (/any ?time touchdown|to score/.test(text)) return "Anytime TD";
  if (/passing yards/.test(text)) return "Passing yards";
  if (/rushing yards/.test(text)) return "Rushing yards";
  if (/receiving yards/.test(text)) return "Receiving yards";
  if (/receptions/.test(text)) return "Receptions";
  if (/passing touchdowns/.test(text)) return "Passing TDs";
  if (/rushing attempts|\bcarries\b/.test(text)) return "Carries";
  if (/threes|3-pointers|\b3pt/.test(text)) return "Threes";
  if (/\brebounds\b/.test(text) && !/\bpoints\b/.test(text)) return "Rebounds";
  if (/\bassists\b/.test(text) && !/\bpoints\b/.test(text)) return "Assists";
  if (/\bpoints\b/.test(text) && !/[+]/.test(text)) return "Points";
  if (/\bshots\b/.test(text)) return "Shots";
  if (/\bgoals\b/.test(text)) return "Goals";
  if (/\bsaves\b/.test(text)) return "Saves";
  return "";
}

function sideOf(label) {
  if (/\bunder\b/i.test(label)) return "Under";
  if (/\bover\b/i.test(label)) return "Over";
  return "";
}

function spoken(prop, side) {
  const name = prop === "Anytime TD" ? "anytime TDs" : String(prop || "").toLowerCase();
  return side ? `${side.toLowerCase()} ${name}` : name;
}

function stepsFrom(books) {
  const steps = [];
  const seenGames = new Set();
  let props = 0;
  (books || []).forEach((game) => {
    if (!game || !game.props) return;
    const kick = Date.parse(game.kickoff || "");
    const sport = String(game.sport || "");
    const id = String(game.id || `${game.match}|${game.kickoff}`);
    if (!sport || !Number.isFinite(kick)) return;
    let used = false;
    Object.entries(game.props).forEach(([key, series]) => {
      if (!series || series.length < 2) return;
      const parts = String(key).split("\u0001");
      const label = parts[0] || "";
      const prop = familyOf(label, parts[1] || "");
      if (!prop) return;
      props += 1;
      const side = sideOf(label);
      for (let i = 1; i < series.length; i += 1) {
        const prev = series[i - 1];
        const next = series[i];
        if (Math.abs(Number(prev[0])) > 600 || Math.abs(Number(next[0])) > 600) continue;
        const points = pointsOf(prev[0], next[0]);
        if (Math.abs(points) < 1) continue;
        const at = Number(next[1]);
        const hours = (kick - at) / HOUR;
        if (!Number.isFinite(at) || !(hours > 0) || hours > 120) continue;
        const when = etParts(at);
        let close = next[0];
        for (let j = i; j < series.length; j += 1) {
          const left = (kick - Number(series[j][1])) / HOUR;
          if (left > 0) close = series[j][0];
        }
        steps.push({ sport, prop, side, gameId: id, label, market: parts[1] || "", match: game.match || "", kickoff: game.kickoff || "", odds: next[0], before: prev[0], close, at, hours, points, weekday: when.weekday, hour: when.hour, day: when.day });
        used = true;
      }
    });
    if (used) seenGames.add(id);
  });
  return { steps, games: seenGames.size, props };
}

function judge(rows, loose) {
  const byGame = new Map();
  rows.forEach((row) => {
    const list = byGame.get(row.gameId) || [];
    list.push(row.points);
    byGame.set(row.gameId, list);
  });
  const games = [...byGame.values()].map((list) => {
    const sorted = list.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  });
  const minGames = loose ? 3 : 4;
  if (games.length < minGames) return null;
  const shorter = games.filter((mid) => mid >= 1).length;
  const longer = games.filter((mid) => mid <= -1).length;
  const way = shorter >= longer ? "shorter" : "longer";
  const agree = way === "shorter" ? shorter : longer;
  const minAgree = loose ? 3 : 4;
  if (agree < minAgree || agree / games.length < (loose ? 0.67 : 0.75)) return null;
  const mids = games.filter((mid) => (way === "shorter" ? mid >= 1 : mid <= -1)).sort((a, b) => a - b);
  const typical = mids[Math.floor(mids.length / 2)];
  if (Math.abs(typical) < 1) return null;
  return { way, games: games.length, agree, steps: rows.length, points: Math.round(typical * 10) / 10 };
}

function addBucket(bag, step, slot) {
  if (!slot) return;
  const key = `${step.sport}|${step.prop}|${step.side}|${slot.kind}|${slot.id}`;
  let row = bag.get(key);
  if (!row) {
    row = { sport: step.sport, prop: step.prop, side: step.side, kind: slot.kind, id: slot.id, span: slot.span, when: slot.when, lo: slot.lo, hi: slot.hi, weekday: slot.weekday || "", start: slot.start, end: slot.end, rows: [] };
    bag.set(key, row);
  }
  row.rows.push(step);
}

function collect(steps) {
  const bag = new Map();
  steps.forEach((step) => {
    WINDOWS.forEach(([lo, hi, when]) => {
      if (step.hours >= lo && step.hours < hi) addBucket(bag, step, { kind: "kick", id: `${lo}-${hi}`, span: hi - lo, when, lo, hi });
    });
    const block = BLOCKS.find(([start, end]) => step.hour >= start && step.hour < end);
    if (block) addBucket(bag, step, { kind: "clock", id: `b-${step.weekday}-${block[0]}`, span: 3, when: `on ${step.weekday}s ${block[2]}`, weekday: step.weekday, start: block[0], end: block[1] });
    addBucket(bag, step, { kind: "clock", id: `h-${step.weekday}-${step.hour}`, span: 1, when: `on ${step.weekday}s around ${hourSay(step.hour)} ET`, weekday: step.weekday, start: step.hour, end: step.hour + 1 });
  });
  return [...bag.values()];
}

function sayOf(row, found) {
  const more = row.side === "Under" ? found.way !== "shorter" : found.way === "shorter";
  const word = more ? "more likely" : "less likely";
  const bit = !row.side && /td|goal/i.test(row.prop) ? `${word} to score` : /total/i.test(row.prop) ? `${word} to clear` : `${word} to reach it`;
  const who = /total/i.test(row.prop) ? "the total" : "the player";
  const move = `${row.sport} ${spoken(row.prop, row.side)} ${row.when}. They treat ${who} as ${bit}. ${found.agree} of ${found.games} games, about ${Math.abs(found.points)} points.`;
  return found.way === "longer" ? `${move} The number gets better if you wait.` : move;
}

function trendsFrom(steps) {
  const best = new Map();
  collect(steps).forEach((row) => {
    if (row.kind === "clock" && new Set(row.rows.map((step) => step.day)).size < 2) return;
    const found = judge(row.rows, false);
    if (!found) return;
    const item = { ...row, ...found, say: sayOf(row, found) };
    delete item.rows;
    const key = `${item.sport}|${item.prop}|${item.side}|${item.kind}`;
    const have = best.get(key);
    const score = item.agree / item.games + (item.span <= 1 ? 0.05 : 0);
    const haveScore = have ? have.agree / have.games + (have.span <= 1 ? 0.05 : 0) : -1;
    if (!have || score > haveScore || (score === haveScore && item.games > have.games)) best.set(key, item);
  });
  const tight = [];
  [...best.values()].forEach((item) => {
    const at = tight.findIndex((have) => have.sport === item.sport && have.prop === item.prop && have.side === item.side && have.agree === item.agree && have.games === item.games && have.points === item.points);
    if (at < 0) tight.push(item);
    else if (item.span < tight[at].span) tight[at] = item;
  });
  return tight.sort((a, b) => (b.agree / b.games) - (a.agree / a.games) || Math.abs(b.points) - Math.abs(a.points) || b.games - a.games);
}

function nearFrom(steps) {
  let best = null;
  collect(steps).forEach((row) => {
    if (row.kind === "clock" && new Set(row.rows.map((step) => step.day)).size < 2) return;
    if (judge(row.rows, false)) return;
    const found = judge(row.rows, true);
    if (!found) return;
    const item = { ...row, ...found, say: sayOf(row, found).replace(/ Waiting pays more on these\.$/, "") };
    const score = item.agree / item.games;
    if (!best || score > best.score || (score === best.score && Math.abs(item.points) > Math.abs(best.points))) best = { ...item, score };
  });
  if (!best) return null;
  const left = Math.max(0, 4 - best.agree);
  const more = left ? ` ${left === 1 ? "One more game" : `${left} more games`} like that and it counts.` : " The games do not agree often enough yet.";
  return { say: `${best.say}${more}` };
}

function inKick(series, kick, lo, hi) {
  for (let i = 1; i < series.length; i += 1) {
    const hours = (kick - Number(series[i][1])) / HOUR;
    if (hours >= lo && hours < hi && Math.abs(pointsOf(series[i - 1][0], series[i][0])) >= 1) return true;
  }
  return false;
}

function inClock(series, day, start, end) {
  for (let i = 1; i < series.length; i += 1) {
    const when = etParts(Number(series[i][1]));
    if (when.day === day && when.hour >= start && when.hour < end && Math.abs(pointsOf(series[i - 1][0], series[i][0])) >= 1) return true;
  }
  return false;
}

function nextSlot(now, weekday, start, end) {
  const from = now - (now % HOUR);
  for (let i = 0; i < 8 * 24; i += 1) {
    const at = from + i * HOUR;
    const part = etParts(at + 60000);
    if (part.weekday === weekday && part.hour >= start && part.hour < end && at + HOUR > now) return { at: Math.max(at, now), day: part.day };
  }
  return null;
}

function kickoffSay(kickoff) {
  const at = Date.parse(kickoff || "");
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function closerToEven(odds, other) {
  const gap = (price) => { const p = implied(price); return p ? Math.abs(p - 0.5) : 1; };
  return gap(odds) < gap(other);
}

function earlyFrom(books, trends, now) {
  const out = [];
  const perTrend = new Map();
  trends.filter((trend) => trend.way === "shorter").forEach((trend) => {
    const trendKey = `${trend.sport}|${trend.prop}|${trend.side}|${trend.when}`;
    (books || []).forEach((game) => {
      if (!game || !game.props || game.sport !== trend.sport) return;
      const kick = Date.parse(game.kickoff || "");
      if (!Number.isFinite(kick) || kick <= now) return;
      const hoursLeft = (kick - now) / HOUR;
      let wait = 0;
      let open = false;
      let day = "";
      if (trend.kind === "kick") {
        if (hoursLeft <= trend.lo) return;
        open = hoursLeft < trend.hi;
        wait = open ? 0 : hoursLeft - trend.hi;
      } else {
        const slot = nextSlot(now, trend.weekday, trend.start, trend.end);
        if (!slot || slot.at >= kick) return;
        day = slot.day;
        open = slot.at <= now;
        wait = Math.max(0, slot.at - now) / HOUR;
      }
      Object.entries(game.props).forEach(([key, series]) => {
        if (!series || !series.length) return;
        const parts = String(key).split("\u0001");
        const label = parts[0] || "";
        if (familyOf(label, parts[1] || "") !== trend.prop || sideOf(label) !== trend.side) return;
        const id = `${game.match}|${trend.prop}|${trend.side}`;
        if (trend.kind === "kick" ? inKick(series, kick, trend.lo, trend.hi) : inClock(series, day, trend.start, trend.end)) return;
        const odds = series[series.length - 1][0];
        const price = priceText(odds);
        const when = kickoffSay(game.kickoff);
        const clock = open ? "The window is open and this price has not moved." : "That clock has not hit yet.";
        const more = trend.side !== "Under";
        const word = more ? "more likely" : "less likely";
        const bit = !trend.side && /td|goal/i.test(trend.prop) ? `${word} to score` : /total/i.test(trend.prop) ? `${word} to clear` : `${word} to reach it`;
        const who = /total/i.test(trend.prop) ? "the total" : "the player";
        const say = `Take ${label}${price ? ` now at ${price}` : " now"}. They treat ${who} as ${bit} ${trend.when}. ${clock}${when ? ` Kickoff is ${when} ET.` : ""}`;
        const have = out.find((row) => row.id === id);
        if (have) { if (closerToEven(odds, have.odds)) Object.assign(have, { label, odds, say, prop: trend.prop, side: trend.side, when: trend.when, points: Math.abs(trend.points) }); return; }
        if ((perTrend.get(trendKey) || 0) >= 2) return;
        perTrend.set(trendKey, (perTrend.get(trendKey) || 0) + 1);
        out.push({ id, label, match: game.match || "", kickoff: game.kickoff || "", sport: game.sport, prop: trend.prop, side: trend.side, when: trend.when, points: Math.abs(trend.points), odds, wait, say });
      });
    });
  });
  out.sort((a, b) => a.wait - b.wait || Math.abs(b.odds) - Math.abs(a.odds));
  return out.slice(0, 8);
}

function tripsFrom(books) {
  const trips = [];
  (books || []).forEach((game) => {
    if (!game || !game.props) return;
    const kick = Date.parse(game.kickoff || "");
    const sport = String(game.sport || "");
    const id = String(game.id || `${game.match}|${game.kickoff}`);
    if (!sport || !Number.isFinite(kick)) return;
    Object.entries(game.props).forEach(([key, series]) => {
      if (!series || series.length < 2) return;
      const parts = String(key).split("\u0001");
      const label = parts[0] || "";
      const prop = familyOf(label, parts[1] || "");
      if (!prop) return;
      const pre = series.filter((point) => (kick - Number(point[1])) / HOUR > 0 && (kick - Number(point[1])) / HOUR <= 120);
      if (pre.length < 2) return;
      const points = pointsOf(pre[0][0], pre[pre.length - 1][0]);
      trips.push({ sport, prop, side: sideOf(label), gameId: id, hours: (kick - Number(pre[0][1])) / HOUR, points });
    });
  });
  return trips;
}

function digest(books, now, past) {
  const at = now || Date.now();
  const looked = stepsFrom(books);
  const ranked = trendsFrom(looked.steps);
  const trends = ranked.slice(0, 8);
  const early = earlyFrom(books, trends, at);
  const near = nearFrom(looked.steps);
  const counts = { games: looked.games, props: looked.props, steps: looked.steps.length };
  const dive = require("./price-dive").build({ steps: looked.steps, trips: tripsFrom(books), trends: ranked, early, looked: counts, near: near && near.say || "", windows: WINDOWS, past: past || [] });
  let say = "";
  if (!trends.length) {
    say = !counts.steps
      ? "The price log is still filling in. The next pass looks for a clock."
      : near
        ? near.say
        : `${counts.steps} reprices across ${counts.games} games. Nothing has landed on the same clock yet.`;
  }
  return { at, looked: counts, trends: trends.map(({ sport, prop, side, kind, when, way, games, agree, points, say: line }) => ({ sport, prop, side, kind, when, way, games, agree, points, say: line })), early, say, brief: dive.brief, dive };
}

function logClocks(clocks) {
  return (clocks || []).map((row) => ({ sport: row.sport, prop: row.prop, side: row.side, when: row.when || "", way: row.way, held: !!row.held, faded: !!row.faded }))
    .sort((a, b) => `${a.sport}|${a.prop}|${a.side}|${a.when}|${a.way}`.localeCompare(`${b.sport}|${b.prop}|${b.side}|${b.when}|${b.way}`));
}

function foldLog(log, at, clocks) {
  const slim = logClocks(clocks);
  const mark = slim.map((row) => `${row.sport}|${row.prop}|${row.side}|${row.when}|${row.way}|${row.held ? 1 : 0}|${row.faded ? 1 : 0}`).join("~");
  const next = (log || []).slice();
  const last = next[next.length - 1];
  if (last && last.mark === mark) {
    next[next.length - 1] = { ...last, to: at, n: (last.n || 1) + 1 };
    return next;
  }
  next.push({ from: at, to: at, n: 1, mark, clocks: slim });
  return next.slice(-400);
}

async function readLog() {
  try {
    const { kv } = require("./live-recs");
    const rows = await kv(`?k=eq.${encodeURIComponent(LOG)}&select=v`);
    const saved = rows && rows[0] && rows[0].v;
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

async function writeLog(log) {
  const { kv } = require("./live-recs");
  await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: LOG, v: log } });
}

async function tick() {
  if (ticking) return cache;
  ticking = true;
  try {
    const { logged } = require("./price-log");
    const past = await readLog();
    const next = digest(logged(), Date.now(), past);
    const log = foldLog(past, next.at, next.dive && next.dive.clocks);
    if (JSON.stringify(log) !== JSON.stringify(past)) await writeLog(log);
    const pack = (row) => JSON.stringify({ trends: row.trends, early: row.early, say: row.say, brief: row.brief });
    const same = cache && pack(cache) === pack(next);
    cache = next;
    if (!same) {
      const { kv } = require("./live-recs");
      await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY, v: next } });
    }
    const line = next.trends[0] ? next.trends[0].say : next.say;
    console.log(`[price-trends] ${next.looked.steps} reprices, ${next.trends.length} clocks, ${next.early.length} early. ${line}`);
    return next;
  } catch (error) {
    console.error("price trends failed:", error);
    return cache;
  } finally {
    ticking = false;
  }
}

async function stored() {
  if (cache) return cache;
  if (ticking) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (cache) return cache;
  }
  try {
    const { kv } = require("./live-recs");
    const rows = await kv(`?k=eq.${encodeURIComponent(KEY)}&select=v`);
    const saved = rows && rows[0] && rows[0].v;
    if (saved && saved.looked) { cache = saved; return cache; }
  } catch (error) {
    console.error("price trends load failed:", error);
  }
  return tick();
}

async function view() {
  const data = await stored();
  if (!data || !data.dive) return data;
  try {
    const voice = await require("./price-say").say(data);
    if (voice) data.voice = voice;
  } catch (error) {
    console.error("price say failed:", error && error.message);
  }
  return data;
}

module.exports = { digest, tick, view };
