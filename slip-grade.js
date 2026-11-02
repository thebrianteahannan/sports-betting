/** Grade a pasted slip from the ESPN box score. No Python, so the live site can run it. */

const PATHS = {
  NFL: "football/nfl", NCAAF: "football/college-football", NBA: "basketball/nba",
  NHL: "hockey/nhl", MLB: "baseball/mlb", WNBA: "basketball/wnba",
};
const SPORTS = ["NFL", "NBA", "NHL", "MLB", "WNBA", "NCAAF"];
const ALIASES = {
  receivingYards: ["receivingyards"], receivingTouchdowns: ["receivingtouchdowns"],
  rushingYards: ["rushingyards"], rushingTouchdowns: ["rushingtouchdowns"],
  passingYards: ["passingyards"], passingTouchdowns: ["passingtouchdowns"],
  receptions: ["receptions"], rebounds: ["rebounds", "totalrebounds"], points: ["points"],
  assists: ["assists"], shotsOnGoal: ["shotsongoal", "shotstotal"],
  strikeouts: ["strikeouts", "pitchingstrikeouts"],
};
const cache = new Map();

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

function etDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date).replace(/-/g, "");
}

function days(when) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(when || "")) {
    const day = new Date(`${when}T12:00:00-05:00`);
    return [0, -1, 1].map((offset) => etDay(new Date(day.getTime() + offset * 86400000)));
  }
  const now = Date.now();
  return Array.from({ length: 9 }, (_, index) => etDay(new Date(now + (index - 1) * 86400000)));
}

function isoDay(day) {
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
}

async function getJson(url) {
  const now = Date.now();
  const hit = cache.get(url);
  const ttl = url.includes("/summary?") ? 15000 : 120000;
  if (hit && now - hit.at < ttl) return hit.data;
  let data = null;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Referer: "https://www.espn.com/", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    data = response.ok ? await response.json() : null;
  } catch (err) { data = null; }
  cache.set(url, { at: data ? now : now - (120000 - 30000), data });
  return data;
}

function comps(summary) {
  return (((summary || {}).header || {}).competitions || [{}])[0] || {};
}

function final(summary) {
  const type = (comps(summary).status || {}).type || {};
  return Boolean(type.completed) || String(type.state || "") === "post";
}

function started(summary) {
  const state = String(((comps(summary).status || {}).type || {}).state || "");
  return state === "in" || state === "post";
}

function sideName(text) {
  return (String(text || "").replace(/\([^)]*\)/g, "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length > 2).join(" ");
}

function eventText(event) {
  const bits = [event.name, event.shortName];
  for (const side of (((event.competitions || [{}])[0] || {}).competitors || [])) {
    const team = side.team || {};
    bits.push(team.displayName, team.shortDisplayName, team.name);
  }
  return bits.filter(Boolean).join(" ").toLowerCase();
}

async function findEvent(path, match, kickoff) {
  const sides = String(match || "").split(/\s@\s|\sat\s/i).map(sideName).filter(Boolean);
  const day = String(kickoff || "").replace(/-/g, "").slice(0, 8);
  if (sides.length < 2 || !/^\d{8}$/.test(day)) return "";
  const data = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}`);
  for (const event of (data || {}).events || []) {
    const blob = eventText(event);
    if (sides.every((side) => blob.includes(side))) return String(event.id || "");
  }
  return "";
}

function tokens(value) {
  const skip = new Set(["jr", "sr", "ii", "iii", "iv"]);
  return String(value || "").toLowerCase().replace(/\./g, "").replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((part) => part && !skip.has(part));
}

function samePlayer(box, want) {
  const left = tokens(box);
  const right = tokens(want);
  return Boolean(left.length && right.length && left[left.length - 1] === right[right.length - 1] && left[0][0] === right[0][0]);
}

function named(summary, player) {
  for (const team of ((summary.boxscore || {}).players || [])) {
    for (const block of team.statistics || []) {
      for (const athlete of block.athletes || []) {
        if (samePlayer((athlete.athlete || {}).displayName, player)) return true;
      }
    }
  }
  return false;
}

function statName(text) {
  const low = String(text || "").toLowerCase();
  const td = low.includes("touchdown");
  if (low.includes("assist")) return "assists";
  if (low.includes("shot")) return "shotsOnGoal";
  if (low.includes("rebound")) return "rebounds";
  if (low.includes("strikeout")) return "strikeouts";
  if (low.includes("reception") && !low.includes("yard")) return "receptions";
  if (low.includes("rush")) return td ? "rushingTouchdowns" : "rushingYards";
  if (low.includes("pass")) return td ? "passingTouchdowns" : "passingYards";
  if (low.includes("receiv") || (low.includes("yard") && !low.includes("total"))) return td && low.includes("receiv") ? "receivingTouchdowns" : "receivingYards";
  if (low.includes("point") && !low.includes("total")) return "points";
  if (low.includes("total")) return "total";
  return "";
}

function playerStat(summary, player, stat) {
  const aliases = ALIASES[stat] || [];
  let found = false;
  for (const team of ((summary.boxscore || {}).players || [])) {
    for (const block of team.statistics || []) {
      const columns = (block.keys || block.names || block.labels || []).map((item) => String(item).toLowerCase().replace(/ /g, ""));
      const index = aliases.map((alias) => columns.indexOf(alias)).find((at) => at >= 0);
      if (index == null) continue;
      found = true;
      for (const athlete of block.athletes || []) {
        if (!samePlayer((athlete.athlete || {}).displayName, player)) continue;
        const raw = (athlete.stats || [])[index];
        const num = parseFloat(String(raw == null ? "" : raw).split("-")[0].split("/")[0]);
        return Number.isFinite(num) ? num : null;
      }
    }
  }
  return found ? 0 : null;
}

function box(summary, player, names) {
  const want = new Set(names);
  for (const team of ((summary.boxscore || {}).players || [])) {
    for (const block of team.statistics || []) {
      const columns = (block.keys || block.names || block.labels || []).map((item) => String(item).toLowerCase().replace(/ /g, ""));
      const index = columns.findIndex((col) => want.has(col));
      if (index < 0) continue;
      for (const athlete of block.athletes || []) {
        if (!samePlayer((athlete.athlete || {}).displayName, player)) continue;
        const raw = (athlete.stats || [])[index];
        const num = parseFloat(raw);
        return Number.isFinite(num) ? num : null;
      }
    }
  }
  return null;
}

function prepare(raw) {
  const player = String(raw.player || "").trim();
  let market = String(raw.market || "").trim();
  const text = `${market} ${raw.label || ""}`;
  let side = String(raw.side || "").toLowerCase();
  let line = Number(raw.line);
  if (!Number.isFinite(line)) line = null;
  const anytime = /any\s*time|anytime|to score/i.test(text) && /touchdown|\btd\b/i.test(text) && !/rush|receiv|pass/i.test(text);
  let stat = "";
  if (anytime) { stat = "anytime"; side = "plus"; line = 1; market = market || "anytime touchdown"; }
  else if (/to win|moneyline/i.test(market)) { stat = ""; side = "win"; }
  else {
    stat = statName(text);
    if (!["over", "under", "plus", "win"].includes(side)) side = /\d+\s*\+/.test(text) ? "plus" : "over";
    if (line == null) { const found = text.match(/(\d+(?:\.\d+)?)/); line = found ? Number(found[1]) : null; }
  }
  const sport = PATHS[String(raw.sport || "").toUpperCase()] ? String(raw.sport).toUpperCase() : "";
  return {
    player, market, side, line, stat, sport: sport || String(raw.sport || ""),
    match: String(raw.match || ""), when: String(raw.when || "").slice(0, 10),
    kickoff: String(raw.kickoff || ""), espnId: String(raw.espnId || ""),
  };
}

async function attach(leg) {
  if (leg.espnId && PATHS[leg.sport]) {
    if (!leg.kickoff && leg.when) leg.kickoff = `${leg.when}T17:00:00-05:00`;
    return;
  }
  for (const sport of (PATHS[leg.sport] ? [leg.sport] : SPORTS)) {
    for (const day of days(leg.when)) {
      const kick = `${isoDay(day)}T17:00:00-05:00`;
      let espn = leg.match ? await findEvent(PATHS[sport], leg.match, kick) : "";
      if (!espn && leg.player) espn = await findPlayer(sport, day, leg.player);
      if (espn) { leg.sport = sport; leg.espnId = espn; leg.kickoff = kick; return; }
    }
  }
}

async function findPlayer(sport, day, player) {
  const data = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${PATHS[sport]}/scoreboard?dates=${day}`);
  let checked = 0;
  for (const event of (data || {}).events || []) {
    if (checked >= 8) break;
    const espn = String(event.id || "");
    if (!espn) continue;
    checked += 1;
    const summary = await summaryFor({ sport, espnId: espn, match: "x @ y", kickoff: `${isoDay(day)}T17:00:00-05:00` });
    if (summary && named(summary, player)) return espn;
  }
  return "";
}

async function summaryFor(leg) {
  const path = PATHS[leg.sport] || "";
  let espn = leg.espnId;
  if (!espn && path) espn = await findEvent(path, leg.match, leg.kickoff);
  if (!espn || !path) return null;
  leg.espnId = espn;
  return getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${espn}`);
}

function say(leg) {
  if (leg.result === "won") return "Reached.";
  if (leg.result === "lost") return "Missed.";
  if (leg.result === "push") return "Push.";
  if (typeof leg.have === "number") return `Not yet, ${show(leg.have)}.`;
  return "Waiting on the game.";
}

function compare(have, line, side, done) {
  if (side === "under") return have > line ? "lost" : !done ? "open" : have < line ? "won" : "push";
  if (side === "plus" && have + 1e-9 >= line) return "won";
  if (side === "over" && have > line + 1e-9) return "won";
  if (Math.abs(have - line) < 1e-9 && side === "over") return done ? "push" : "open";
  return done ? "lost" : "open";
}

function winner(leg, summary) {
  const rows = (comps(summary).competitors || []).map((side) => {
    const team = side.team || {};
    const names = [team.displayName, team.shortDisplayName, team.name, team.abbreviation].filter(Boolean).join(" ").toLowerCase();
    const score = Number(side.score);
    return { names, score: Number.isFinite(score) ? score : null, short: team.shortDisplayName || team.displayName || "" };
  });
  const want = `${leg.player || ""} ${leg.market || ""}`.toLowerCase();
  const words = (want.match(/[a-z0-9]+/g) || []).filter((word) => word.length > 3);
  const mine = rows.find((row) => words.some((word) => row.names.includes(word)));
  const other = rows.find((row) => row !== mine);
  if (!mine || mine.score == null || !other || other.score == null) { leg.result = "open"; leg.say = "Waiting on the game."; return; }
  leg.have = mine.score;
  if (!final(summary)) { leg.result = "open"; leg.say = `Not yet. ${mine.short} ${Math.trunc(mine.score)}, ${other.short} ${Math.trunc(other.score)}.`; return; }
  leg.result = mine.score > other.score ? "won" : mine.score < other.score ? "lost" : "push";
  leg.say = say(leg);
}

function anytime(leg, summary) {
  if (!summary) { leg.result = "open"; leg.say = "Waiting on the game."; return; }
  const rush = playerStat(summary, leg.player, "rushingTouchdowns");
  const rec = playerStat(summary, leg.player, "receivingTouchdowns");
  if ((rush == null && rec == null) || !named(summary, leg.player)) { leg.result = "open"; leg.say = "Waiting on the game."; return; }
  leg.have = (rush || 0) + (rec || 0);
  leg.result = compare(leg.have, 1, "plus", final(summary));
  leg.say = say(leg);
}

function gradeLeg(leg, summary) {
  const fresh = statName(`${leg.market || ""} ${leg.player || ""} ${leg.market || ""}`);
  if (fresh) leg.stat = fresh;
  if (!leg.stat || leg.line == null || !summary || !started(summary)) { leg.result = "open"; leg.say = "Waiting on the game."; return; }
  const have = leg.stat === "total" ? null : playerStat(summary, leg.player, leg.stat);
  if (have == null) { leg.result = "open"; leg.say = "Waiting on the game."; return; }
  leg.have = have;
  leg.result = compare(have, leg.line, leg.side || "plus", final(summary));
  leg.say = say(leg);
}

function show(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function nice(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().replace(/^-+|-+$/g, "");
  return text && text === text.toUpperCase() ? text.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()) : text;
}

function phrase(leg) {
  const player = nice(leg.player);
  const market = nice(leg.market) || "the bet";
  if (leg.side === "win" || /to win/i.test(market)) return `${player || market.replace(/\bto win\b/ig, "").trim()} to win`.trim();
  if (leg.stat === "anytime" || leg.side === "plus") return `${player} ${market}`.trim();
  const shown = typeof leg.line === "number" ? show(leg.line) : "";
  const word = leg.side === "under" ? "under" : "over";
  const body = shown ? `${word} ${shown} ${market}`.trim() : market;
  return player && !body.toLowerCase().includes(player.toLowerCase()) ? `${player} ${body}`.trim() : body;
}

function gone(summary, sport) {
  if (!summary) return null;
  if (final(summary)) return 1;
  if (!started(summary)) return 0;
  const status = comps(summary).status || {};
  if (sport === "MLB") { const inning = Number(status.period) || 0; return inning < 1 ? null : Math.min(0.99, (inning - 1) / 9); }
  const length = { NBA: [4, 720, 300], WNBA: [4, 600, 300], NHL: [3, 1200, 300] }[sport] || [4, 900, 600];
  const [regs, span, extra] = length;
  const period = Number(status.period) || 0;
  const bits = String(status.displayClock || "0:00").split(":").map((part) => Number(part)).filter((part) => Number.isFinite(part));
  const left = bits.length >= 2 ? bits[0] * 60 + bits[1] : 0;
  if (period < 1) return null;
  if (period <= regs) return Math.min(0.99, ((period - 1) * span + Math.max(0, span - left)) / (regs * span));
  return Math.min(0.99, (regs * span + Math.max(0, extra - left)) / (regs * span + extra));
}

function clip(prob) { return Math.min(99, Math.max(1, Math.round(100 * prob))); }

function blend(seen, prior, gone) {
  const elapsed = Math.max(gone, 0.02);
  const weight = elapsed / (elapsed + 0.35);
  return weight * seen + (1 - weight) * prior;
}

function overProb(mean, line, sigma, under) {
  const z = sigma ? (line - mean) / sigma : 0;
  const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)));
  return clip(under ? cdf : 1 - cdf);
}

function atLeast(lam, need) {
  if (need <= 0) return 100;
  let term = Math.exp(-Math.max(lam, 0));
  let total = term;
  for (let k = 1; k < need; k += 1) { term *= lam / k; total += term; }
  return clip(1 - total);
}

function liveStat(leg, have, line, goneShare, summary) {
  const under = leg.side === "under";
  const elapsed = Math.max(goneShare, 0.02);
  const carries = summary ? box(summary, leg.player, ["rushingattempts"]) : null;
  const targets = summary ? box(summary, leg.player, ["receivingtargets"]) : null;
  const catches = summary ? box(summary, leg.player, ["receptions"]) : null;
  if (leg.stat === "anytime" || leg.side === "plus") {
    const touches = (carries || 0) + (catches || 0);
    const full = blend(touches / elapsed, line <= 1 ? 12 : Math.max(line * 8, 12), goneShare);
    return atLeast(Math.max(1, full - touches) * 0.045, Math.ceil(line - have));
  }
  if (leg.stat === "rushingYards" && carries) {
    const ypc = (have + 4.2 * 6) / (carries + 6);
    const full = blend(carries / elapsed, Math.max(line / 4.2, 8), goneShare);
    const remain = Math.max(0.5, full - carries);
    return overProb(have + remain * ypc, line, Math.max(8, 7 * Math.sqrt(remain)), under);
  }
  if ((leg.stat === "receptions" || leg.stat === "receivingYards") && targets) {
    const each = leg.stat === "receptions" ? 0.68 : 8;
    const rate = (have + each * 4) / (targets + 4);
    const full = blend(targets / elapsed, Math.max(line / each, 3), goneShare);
    const remain = Math.max(0.4, full - targets);
    const wide = leg.stat === "receptions" ? 0.85 : 9;
    return overProb(have + remain * rate, line, Math.max(0.8, wide * Math.sqrt(remain)), under);
  }
  const rate = (goneShare / (goneShare + 0.45)) * (have / elapsed) + (1 - goneShare / (goneShare + 0.45)) * line;
  const remain = Math.max(1 - elapsed, 0.01);
  const wide = { receivingYards: 26, passingYards: 55, points: 8, rebounds: 3.2, assists: 2.4 }[leg.stat] || Math.max(Math.abs(line) * 0.35, 1);
  return overProb(have + rate * remain, line, wide * Math.sqrt(remain), under);
}

function liveWin(leg, summary, goneShare) {
  const want = `${leg.player || ""} ${leg.market || ""}`.toLowerCase();
  const words = (want.match(/[a-z0-9]+/g) || []).filter((word) => word.length > 3);
  let home = null;
  for (const side of comps(summary).competitors || []) {
    const team = side.team || {};
    const names = [team.displayName, team.shortDisplayName, team.name].filter(Boolean).join(" ").toLowerCase();
    if (words.some((word) => names.includes(word))) { home = String(side.homeAway || "") === "home"; break; }
  }
  const board = summary.winprobability || [];
  const last = Array.isArray(board) && board.length ? board[board.length - 1] : {};
  if (home != null && last && last.homeWinPercentage != null) {
    const share = Number(last.homeWinPercentage);
    return clip(home ? share : 1 - share - Number(last.tiePercentage || 0));
  }
  return clip(0.5 * (1 + erf((Number(leg.have) || 0) / (14 * Math.sqrt(Math.max(1 - goneShare, 0.05)) * Math.sqrt(2)))));
}

function count(n, one, many) {
  const shown = Math.trunc(n);
  return `${shown} ${shown === 1 ? one : many}`;
}

function note(leg, summary) {
  if (leg.side === "win" || typeof leg.have !== "number" || typeof leg.line !== "number") return;
  const base = `${show(leg.have)} of ${show(leg.line)}`;
  const carries = summary ? box(summary, leg.player, ["rushingattempts"]) : null;
  const targets = summary ? box(summary, leg.player, ["receivingtargets"]) : null;
  const catches = summary ? box(summary, leg.player, ["receptions"]) : null;
  if (leg.stat === "rushingYards" && carries) leg.pace = `${base} on ${count(carries, "carry", "carries")}`;
  else if ((leg.stat === "receptions" || leg.stat === "receivingYards") && targets) leg.pace = `${base} on ${count(targets, "target", "targets")}`;
  else if (leg.stat === "anytime" || leg.side === "plus") {
    const bits = [carries ? count(carries, "carry", "carries") : "", catches ? count(catches, "reception", "receptions") : ""].filter(Boolean);
    leg.pace = bits.length ? `${base}. ${bits.join(", ")}` : base;
  } else leg.pace = base;
}

function clock(summary, sport) {
  if (final(summary)) return "Final";
  const status = comps(summary).status || {};
  const period = Number(status.period) || 0;
  const time = String(status.displayClock || "");
  const names = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };
  const word = sport === "NHL" ? "period" : "quarter";
  const label = period > (sport === "NHL" ? 3 : 4) ? "Overtime" : `${names[period] || period} ${word}`;
  return time ? `${label}, ${time} left` : label;
}

function odds(leg, summary) {
  if (leg.result === "won" || leg.result === "push") leg.chance = 100;
  else if (leg.result === "lost") leg.chance = 0;
  else {
    const share = gone(summary, leg.sport || "NFL");
    if (share == null) return;
    if (share <= 0) leg.chance = 50;
    else if (leg.side === "win") leg.chance = liveWin(leg, summary || {}, share);
    else if (typeof leg.have === "number" && typeof leg.line === "number") leg.chance = liveStat(leg, leg.have, leg.line, share, summary);
  }
  note(leg, summary);
  if (summary && started(summary)) leg.clock = clock(summary, leg.sport || "NFL");
}

function view(leg) {
  return {
    player: leg.player || "", market: leg.market || "", side: leg.side || "", line: leg.line == null ? null : leg.line,
    match: leg.match || "", when: leg.when || "", sport: PATHS[leg.sport] ? leg.sport : "", espnId: leg.espnId || "",
    kickoff: leg.kickoff || "", have: leg.have, result: leg.result || "open", say: leg.say || say(leg),
    text: phrase(leg), pace: leg.pace || "", chance: leg.chance, clock: leg.clock || "",
  };
}

async function one(raw) {
  const leg = prepare(raw);
  await attach(leg);
  const summary = leg.espnId || (leg.match && leg.kickoff) ? await summaryFor(leg) : null;
  if (summary && !started(summary)) { leg.result = "open"; leg.say = "The game has not started."; }
  else if (leg.side === "win") winner(leg, summary);
  else if (leg.stat === "anytime") anytime(leg, summary);
  else gradeLeg(leg, summary);
  odds(leg, summary);
  return view(leg);
}

async function gradeLegs(legs) {
  const out = [];
  for (const raw of legs || []) {
    if (!raw || !(String(raw.player || raw.market || "").trim())) continue;
    try { out.push(await one(raw)); } catch (err) {
      const leg = prepare(raw);
      out.push(view({ ...leg, result: "open", say: "Waiting on the game." }));
    }
  }
  return out;
}

module.exports = { gradeLegs };
