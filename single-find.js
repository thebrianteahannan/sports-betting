/** One prop from the build-a-bet slate. The count has to be far enough off the price. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function names(game) {
  let away = String(game.awayName || "");
  let home = String(game.homeName || "");
  const match = String(game.match || "");
  if ((!away || !home) && match.includes(" @ ")) {
    const [left, right] = match.split(" @ ");
    away = away || left.trim();
    home = home || right.trim();
  }
  return { away, home };
}

function singleFind(pools, games, opts) {
  const slim = (Array.isArray(games) ? games : []).map((game) => {
    const side = names(game);
    return {
      id: game.id, sport: game.sport, match: game.match, awayName: side.away, homeName: side.home,
      kickoff: game.kickoff, espnId: game.espnId || "", flags: game.flags || [],
    };
  });
  const legs = [];
  (pools || []).forEach(([game, rows]) => {
    const side = names(game);
    (rows || []).forEach((leg) => legs.push({
      market: leg.market || "", runner: leg.runner || "", label: leg.label || "", odds: leg.odds,
      gameId: String(game.id || ""), sport: game.sport || leg.sport || "", kickoff: game.kickoff || "",
    }));
    if (!slim.some((row) => String(row.id) === String(game.id))) slim.push({ id: game.id, sport: game.sport, match: game.match, awayName: side.away, homeName: side.home, kickoff: game.kickoff, espnId: game.espnId || "", flags: game.flags || [] });
  });
  const payload = JSON.stringify({ legs: thinLegs(legs), games: slim, skip: [...(opts.skip || [])], stake: opts.stake, profit: opts.profit });
  const file = path.join(require("os").tmpdir(), `one-pick-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, payload);
  try {
    const raw = execFileSync(pythonBin() || "python3", ["-m", "nfl_bets.single", file], {
      encoding: "utf8", timeout: 50000, maxBuffer: 8 * 1024 * 1024, cwd: __dirname,
    });
    return JSON.parse(raw);
  } catch (error) {
    const raw = String(error.stdout || "").trim();
    if (raw.startsWith("{")) { try { return JSON.parse(raw); } catch (err) { /* the line below */ } }
    console.error("single", error.signal || error.code || "", String(error.stderr || "").split("\n").slice(-3).join(" "));
    return { title: "One pick", game: "", copy: "The single bet did not finish.", note: "The single bet did not finish.", why: "", legs: [], players: [], only: false, again: false };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function thinLegs(legs) {
  const skip = /\b(quarter|half|period|inning|first|last|1st|2nd|3rd)\b/i;
  const groups = new Map();
  legs.forEach((leg) => {
    if (skip.test(`${leg.market || ""} ${leg.label || ""} ${leg.runner || ""}`)) return;
    const name = String(leg.runner || leg.label || "").split(/\d/)[0].trim().toLowerCase();
    const rows = groups.get(`${leg.gameId}|${name}`);
    if (rows) rows.push(leg);
    else groups.set(`${leg.gameId}|${name}`, [leg]);
  });
  const take = groups.size > 400 ? 8 : 16;
  const kept = [];
  groups.forEach((rows) => {
    if (rows.length <= take) { kept.push(...rows); return; }
    rows.sort((a, b) => Number(a.odds) - Number(b.odds));
    for (let i = 0; i < take; i += 1) kept.push(rows[Math.round((i * (rows.length - 1)) / (take - 1))]);
  });
  return kept;
}

function markGap(hits, count, price) {
  if (count < 3 || price <= 0) return null;
  const gap = Math.round((hits / count - price) * 100);
  return gap >= 8 ? gap : null;
}

function markLine(name, spec, bar, under, hits, count, price) {
  const gap = markGap(hits, count, price);
  if (gap == null) return null;
  const verb = spec && spec[2] && bar === 1 ? "scored a touchdown" : `${under ? "stayed under" : "cleared"} ${whole(bar) ? Math.round(bar) : bar}+ ${spec ? spec[1] : ""}`.trim();
  return { gap, n: count, why: `${nick(name)} ${verb} in ${hits} of the last ${count}. FanDuel has this at ${Math.round(price * 100)}%.` };
}

async function savedMarks(name, bets) {
  const legs = (Array.isArray(bets) ? bets : []).slice(0, 200);
  const sport = String((legs.find((leg) => leg && leg.sport) || {}).sport || "");
  const pack = await savedPack(sport, name);
  if (!pack || !(pack.rows || []).length) return { known: false, marks: [] };
  const marks = [];
  legs.forEach((leg, index) => {
    const body = `${leg.market || ""} ${leg.label || ""} ${leg.runner || ""}`;
    if (/\b(quarter|half|period|inning)\b/i.test(body) || /\b(first|last|1st|2nd|3rd)\b/i.test(body) || combo(body)) return;
    const spec = specOf(body);
    const rows = spec ? logRows(pack, spec[0]) : [];
    const bar = spec ? barOf(body, spec[2]) : null;
    const price = priceOf(leg.odds);
    if (bar == null || rows.length < 3) return;
    const under = /\bunder\b/i.test(body);
    const lines = [];
    const window = rows.slice(0, 8);
    const wide = markLine(name, spec, bar, under, hitsOf(window, bar, under), window.length, price);
    if (wide) lines.push(wide);
    if (window.length !== 3) {
      const last = rows.slice(0, 3);
      const near = markLine(name, spec, bar, under, hitsOf(last, bar, under), last.length, price);
      if (near) lines.push(near);
    }
    if (!lines.length) return;
    lines.sort((a, b) => b.gap - a.gap || b.n - a.n);
    const read = savedRead(name, "", sport, leg.odds, pack, leg);
    marks.push({ index, gap: lines[0].gap, why: lines[0].why, notes: [], spans: read.spans || "", lean: read.lean || "" });
  });
  marks.sort((a, b) => b.gap - a.gap);
  return { known: true, marks };
}

async function markPlayer(name, bets, games) {
  const legs = (Array.isArray(bets) ? bets : []).slice(0, 200).map((bet) => ({
    market: bet.market || "", runner: bet.runner || "", label: bet.label || "", odds: bet.odds,
    sport: bet.sport || "", match: bet.match || "", kickoff: bet.kickoff || "",
  }));
  return savedMarks(name, legs);
}

function slimGame(game) {
  return {
    id: game.id, sport: game.sport || "", match: game.match || "",
    awayName: game.awayName || "", homeName: game.homeName || "", kickoff: game.kickoff || "",
    espnId: game.espnId || "", spread: game.spread || null, total: game.total || null, flags: game.flags || [],
  };
}

function pythonBin() {
  if (pythonBin.found) return pythonBin.found;
  const { spawnSync } = require("child_process");
  for (const bin of ["python3", "python", "/usr/bin/python3", "/usr/local/bin/python3"]) {
    const probe = spawnSync(bin, ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"], { timeout: 4000 });
    if (!probe.error && probe.status === 0) return (pythonBin.found = bin);
  }
  return "";
}

async function savedPack(sport, name) {
  const who = String(name || "").trim().toLowerCase();
  const league = String(sport || "").trim();
  if (!who || !league) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, "output", "sway.json"), "utf8"));
    const pack = saved[`${league}|${who}|career`];
    if (pack && pack.rows && pack.rows.length) return pack;
  } catch (err) { /* the shared copy is next */ }
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  try {
    const response = await fetch(`${url}/rest/v1/kv?k=eq.${encodeURIComponent(`bets/log/${league}/${who}`)}&select=v`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const pack = rows && rows[0] && rows[0].v;
    return pack && pack.rows && pack.rows.length ? pack : null;
  } catch (err) { return null; }
}

const SPAN = { NFL: [3, 5, 10, 15, 17], NCAAF: [3, 5, 8, 10, 12], NBA: [3, 6, 10, 25, 50], NHL: [3, 6, 10, 25, 50], WNBA: [3, 6, 10, 20, 30], NCAAB: [3, 5, 10, 15, 25], MLB: [3, 10, 20, 40, 81] };
function seasonYear(sport) {
  const clock = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const month = clock.getMonth() + 1, year = clock.getFullYear();
  if (/^(NBA|NHL|NCAAB)$/.test(String(sport || ""))) return month >= 9 ? year + 1 : year;
  return month >= 3 ? year : year - 1;
}
const ALIAS = { shotsTotal: ["shotsTotal", "shotsOnGoal", "shots"], totalRebounds: ["totalRebounds", "rebounds"], "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "threePointFieldGoalsMade"] };

function specOf(text) {
  const low = String(text || "").toLowerCase();
  const mix = [["points", /\b(pts|points?)\b/, "points"], ["totalRebounds", /\b(reb|rebounds?)\b/, "rebounds"], ["assists", /\b(ast|assists?)\b/, "assists"], ["steals", /\b(stl|steals?)\b/, "steals"], ["blocks", /\b(blk|blocks?)\b/, "blocks"]].filter((row) => row[1].test(low));
  if (mix.length > 1 && /\b(pts|points?|reb|rebounds?|ast|assists?|stl|steals?|blk|blocks?)\s*\+\s*(pts|points?|reb|rebounds?|ast|assists?|stl|steals?|blk|blocks?)\b/.test(low)) return [mix.map((row) => row[0]), mix.map((row) => row[2]).join(" and "), false];
  if (low.includes("touchdown")) return [["receivingTouchdowns", "rushingTouchdowns"], "touchdown", true];
  if (low.includes("receiving") && (low.includes("yard") || low.includes("yds"))) return [["receivingYards"], "receiving yards", false];
  if (low.includes("rushing") && (low.includes("yard") || low.includes("yds"))) return [["rushingYards"], "rushing yards", false];
  if (low.includes("passing") && (low.includes("yard") || low.includes("yds"))) return [["passingYards"], "passing yards", false];
  if (low.includes("reception")) return [["receptions"], "receptions", false];
  if (low.includes("shots on goal") || /\bshots\b/.test(low)) return [["shotsTotal"], "shots on goal", false];
  if (low.includes("made three") || low.includes("threes")) return [["threePointFieldGoalsMade-threePointFieldGoalsAttempted"], "made threes", false];
  if (low.includes("rebound")) return [["totalRebounds"], "rebounds", false];
  if (low.includes("assist")) return [["assists"], "assists", false];
  if (low.includes("strikeout")) return [["strikeouts"], "strikeouts", false];
  if (low.includes("home run")) return [["homeRuns"], "home runs", false];
  if (/\bhits?\b/.test(low)) return [["hits"], "hits", false];
  if (/\bgoals?\b/.test(low)) return [["goals"], "goals", false];
  if (/\bpoints?\b/.test(low)) return [["points"], "points", false];
  return null;
}

function statValue(raw, key) {
  let text = String(raw == null ? "" : raw).trim();
  if (text === "" || text === "-" || text === "—") return null;
  if (text.includes("-") && String(key).includes("Made-")) text = text.split("-")[0];
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function logRows(pack, keys) {
  const names = pack.names || [];
  const minute = names.indexOf("minutes");
  const indexes = keys.map((key) => { const hit = (ALIAS[key] || [key]).find((option) => names.includes(option)); return hit ? names.indexOf(hit) : -1; }).filter((index) => index >= 0);
  if (!indexes.length) return [];
  const rows = [];
  (pack.rows || []).forEach((row) => {
    const stats = row.stats || [];
    const values = indexes.map((index) => statValue(index < stats.length ? stats[index] : "", names[index]));
    if (values.some((value) => value == null)) return;
    const built = { date: String(row.date || ""), opponent: String(row.opponent || ""), value: values.reduce((sum, value) => sum + value, 0) };
    if (row.season) built.season = row.season;
    if (minute >= 0 && minute < stats.length) { const played = statValue(stats[minute], "minutes"); if (played != null) built.minutes = played; }
    rows.push(built);
  });
  return rows;
}

function hitsOf(rows, bar, under) { return rows.filter((row) => (under ? row.value <= bar : row.value + 1e-9 >= bar)).length; }
function whole(n) { return Math.abs(n - Math.round(n)) < 1e-9; }
function priceOf(odds) { const n = Number(odds); if (!Number.isFinite(n) || !n) return 0; return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100); }
function nick(name) { const word = String(name || "").replace(/\s*\([^)]*\)/g, "").trim().split(/\s+/).pop() || ""; if (word.toLowerCase() === "49ers") return "49ers"; return word ? word[0].toUpperCase() + word.slice(1) : String(name || ""); }
function combo(text) { const low = String(text || "").toLowerCase(); let kinds = 0; if (low.includes("touchdown")) kinds += 1; if (low.includes("receiving") && (low.includes("yard") || low.includes("yds"))) kinds += 1; if (low.includes("rushing") && (low.includes("yard") || low.includes("yds"))) kinds += 1; if (low.includes("passing") && (low.includes("yard") || low.includes("yds"))) kinds += 1; if (low.includes("reception")) kinds += 1; if (low.includes("shots on goal") || /\bshots\b/.test(low)) kinds += 1; if (low.includes("made three") || low.includes("threes")) kinds += 1; if (low.includes("rebound")) kinds += 1; if (low.includes("assist")) kinds += 1; if (low.includes("strikeout")) kinds += 1; if (low.includes("home run")) kinds += 1; else if (/\bhits?\b/.test(low)) kinds += 1; if (/\bgoals?\b/.test(low.replace(/shots on goal/g, ""))) kinds += 1; if (/\bpoints?\b/.test(low)) kinds += 1; return kinds > 1; }

function share(rows, bar, under) { const hits = hitsOf(rows, bar, under), per = rows.reduce((sum, row) => sum + row.value, 0) / rows.length, shown = whole(per) ? String(Math.round(per)) : String(Math.round(per * 10) / 10), played = rows.map((row) => row.minutes).filter((n) => typeof n === "number"), clock = played.length === rows.length && played.length ? ` · ${Math.round(played.reduce((sum, n) => sum + n, 0) / played.length)} min` : ""; return `${hits} of ${rows.length} · ${Math.round(hits / rows.length * 100)}% · ${shown} a game${clock}`; }

function barOf(text, fixed) {
  const plus = String(text).match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) return Number(plus[1]);
  const line = String(text).match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);
  if (line) return Number(line[1]);
  return fixed ? 1 : null;
}

function windowsOf(pack, text, sport) {
  const spec = specOf(text);
  const rows = spec ? logRows(pack, spec[0]) : [];
  const bar = spec ? barOf(text, spec[2]) : null;
  if (bar == null || rows.length < 3) return "";
  const under = /\bunder\b/i.test(text);
  const bits = (SPAN[sport] || [3, 6, 10, 25, 50]).filter((n) => rows.length >= n).map((n) => `Last ${n}, ${share(rows.slice(0, n), bar, under)}`);
  const year = seasonYear(sport);
  const now = rows.filter((row) => Number(row.season) === year);
  const last = rows.filter((row) => Number(row.season) === year - 1);
  if (now.length >= 3) bits.push(`This season, ${share(now, bar, under)}`);
  if (last.length >= 3) bits.push(`Last season, ${share(last, bar, under)}`);
  bits.push(`Career, ${share(rows, bar, under)}`);
  return `${bits.join(". ")}.`;
}

function dip(rows, bar, under, asked, far) {
  const years = rows.map((row) => Number(row.season) || 0).filter(Boolean);
  const top = years.length ? Math.max(...years) : 0;
  const last = rows.filter((row) => Number(row.season) === top - 1);
  const played = rows.map((row) => row.minutes).filter((n) => typeof n === "number");
  const recentMin = played.length >= 10 ? Math.round(played.slice(0, 10).reduce((sum, n) => sum + n, 0) / 10) : null;
  const careerMin = played.length >= 20 ? Math.round(played.reduce((sum, n) => sum + n, 0) / played.length) : null;
  const short = recentMin != null && careerMin != null && careerMin - recentMin >= 3;
  if (last.length >= 10) {
    const season = Math.round(hitsOf(last, bar, under) / last.length * 100);
    const seasonPlayed = last.map((row) => row.minutes).filter((n) => typeof n === "number");
    const seasonMin = seasonPlayed.length >= 10 ? Math.round(seasonPlayed.reduce((sum, n) => sum + n, 0) / seasonPlayed.length) : null;
    if (far - season >= 8) {
      const line = `Last season was ${season}%${seasonMin != null ? `, at ${seasonMin} minutes` : ""}.${short ? ` Career minutes are ${careerMin}.` : ""} The ${far}% career rate is the seasons before that.`;
      return season >= asked + 8 ? `${line} Last season still hits more often than the ${asked}% price.` : line;
    }
    if (season >= asked + 8 && recentMin != null && careerMin != null) {
      return short
        ? `Last 10, ${recentMin} minutes. Career, ${careerMin}. Last season was still ${season}%. At ${far}%, this hits more often than the ${asked}% price.`
        : `The minutes are the same, ${recentMin} in the last 10 and ${careerMin} for the career. Last season was ${season}%. At ${far}%, this hits more often than the ${asked}% price.`;
    }
  }
  if (short) return `Last 10, ${recentMin} minutes. Career, ${careerMin}.`;
  if (recentMin != null && careerMin != null) return `The minutes are the same, ${recentMin} in the last 10 and ${careerMin} for the career. At ${far}%, this hits more often than the ${asked}% price.`;
  return "";
}

const BESIDE = { "receiving yards": ["receivingTargets", "targets"], "rushing yards": ["rushingAttempts", "carries"], "passing yards": ["passingAttempts", "passes"], receptions: ["receivingTargets", "targets"] };

function oneStat(pack, key) {
  const names = pack.names || [], hit = (ALIAS[key] || [key]).find((option) => names.includes(option)), index = hit ? names.indexOf(hit) : -1, rows = [];
  if (index < 0) return rows;
  (pack.rows || []).forEach((row) => { const stats = row.stats || [], value = statValue(index < stats.length ? stats[index] : "", names[index]); if (value != null) rows.push({ value, season: Number(row.season) || 0 }); });
  return rows;
}

function meanOf(rows) {
  if (!rows.length) return null;
  return Math.round(rows.reduce((sum, row) => sum + row.value, 0) / rows.length * 10) / 10;
}

function numOf(n) { return n == null ? "" : (whole(n) ? String(Math.round(n)) : String(n)); }

function happened(pack, text) {
  const spec = specOf(text);
  const rows = spec ? logRows(pack, spec[0]) : [];
  if (!spec || rows.length < 10) return "";
  const noun = spec[1];
  const years = [...new Set(rows.map((row) => Number(row.season) || 0).filter(Boolean))].sort((a, b) => a - b);
  const newest = rows.filter((row) => row.season === years.at(-1));
  const early = newest.length < 5 && years.length > 1;
  const nowYear = early ? years.at(-2) : years.at(-1);
  const nowRows = rows.filter((row) => row.season === nowYear);
  const lastRows = rows.filter((row) => row.season === nowYear - 1);
  const bits = [];
  const nowAvg = meanOf(nowRows), lastAvg = meanOf(lastRows);
  if (nowRows.length >= 5 && lastRows.length >= 8 && nowAvg != null && lastAvg != null && Math.abs(nowAvg - lastAvg) >= Math.max(1, Math.abs(lastAvg) * 0.1)) {
    bits.push(`${early ? "Last season" : "This season"} ${noun} ${nowAvg < lastAvg ? "went to" : "went up to"} ${numOf(nowAvg)} a game from ${numOf(lastAvg)}.`);
  }
  const recent = meanOf(rows.slice(0, 10)), career = meanOf(rows);
  if (recent != null && career != null) {
    const beside = BESIDE[noun];
    const side = beside && spec[0].length === 1 ? oneStat(pack, beside[0]) : [];
    const recentSide = side.length >= 10 ? meanOf(side.slice(0, 10)) : null;
    const careerSide = side.length >= 20 ? meanOf(side) : null;
    const same = recentSide != null && careerSide != null && Math.abs(recentSide - careerSide) < 0.5;
    const extra = recentSide == null ? "" : (same ? `, on about the same ${numOf(recentSide)} ${beside[1]}` : `, on ${numOf(recentSide)} ${beside[1]}`);
    const moved = Math.abs(recent - career) >= Math.max(1, Math.abs(career) * 0.1);
    const verb = !moved ? "are" : (recent < career ? "are down to" : "are up to");
    bits.push(`The last 10 ${verb} ${numOf(recent)} ${noun} a game${extra}. The career is ${numOf(career)} a game${careerSide != null && !same ? `, on ${numOf(careerSide)} ${beside[1]}` : ""}.`);
  }
  return bits.join(" ");
}

function leanOf(pack, text, price) {
  const spec = specOf(text), rows = spec ? logRows(pack, spec[0]) : [], bar = spec ? barOf(text, spec[2]) : null, under = /\bunder\b/i.test(text);
  if (bar != null && price > 0 && rows.length >= 20) {
    const near = Math.round(hitsOf(rows.slice(0, 10), bar, under) / 10 * 100), far = Math.round(hitsOf(rows, bar, under) / rows.length * 100), asked = Math.round(price * 100);
    if (near !== far && Math.abs(asked - near) + 3 < Math.abs(asked - far) && far >= asked + 8) return dip(rows, bar, under, asked, far);
  }
  return holdOf(pack, text, price);
}

function holdOf(pack, text, price) {
  const spec = specOf(text), load = spec && BESIDE[spec[1]], names = (pack && pack.names) || [], index = load ? names.indexOf(load[0]) : -1;
  const logged = index >= 0 ? logRows(pack, spec[0]) : [], bar = spec ? barOf(text, spec[2]) : null;
  if (!load || index < 0 || bar == null || price <= 0 || logged.length < 7) return "";
  const byDate = new Map();
  (pack.rows || []).forEach((row) => { const value = statValue(index < (row.stats || []).length ? row.stats[index] : "", load[0]); if (value != null && !byDate.has(String(row.date || ""))) byDate.set(String(row.date || ""), value); });
  const played = logged.map((row) => ({ ...row, load: byDate.get(row.date) })).filter((row) => row.load != null);
  if (played.length < 7) return "";
  const under = /\bunder\b/i.test(text), recent = played.slice(0, 4), rest = played.slice(4), year = Number(recent[0].season) || 0;
  const same = rest.filter((row) => Number(row.season) === year && year), years = [...new Set(rest.map((row) => Number(row.season) || 0).filter((n) => n && n !== year))].sort((a, b) => a - b);
  const last = years.length ? rest.filter((row) => Number(row.season) === years[years.length - 1]) : [], prior = same.length >= 3 ? same : last.length >= 5 ? last : rest.length >= 8 ? rest : [];
  if (prior.length < 3) return "";
  const avg = (list) => list.reduce((sum, row) => sum + row.load, 0) / list.length, now = avg(recent), then = avg(prior);
  const job = (left, right) => (under ? right >= left + Math.max(1.5, left * 0.25) : left >= right + Math.max(1.5, right * 0.25));
  const spike = recent.slice().sort((a, b) => (under ? a.load - b.load : b.load - a.load))[0], best = recent.slice().sort((a, b) => (under ? a.value - b.value : b.value - a.value))[0];
  if (!job(now, then) || recent.filter((row) => (under ? row.load <= then - 1 : row.load >= then + 1)).length < 3 || !job(avg(recent.filter((row) => row !== spike)), then) || hitsOf(recent.filter((row) => row !== best), bar, under) < 2) return "";
  const fair = Math.round((2 * (hitsOf(prior, bar, under) / prior.length) + hitsOf(recent, bar, under)) / 6 * 100), asked = Math.round(price * 100);
  if (fair < asked + 6) return "";
  const num = (n) => { const shown = Math.round(n * 10) / 10; return Math.abs(shown - Math.round(shown)) < 1e-9 ? String(Math.round(shown)) : String(shown); };
  return `${load[1][0].toUpperCase()}${load[1].slice(1)} went to ${num(now)} from ${num(then)}. At ${fair}%, the recent run still clears the ${asked}% price.`;
}

function savedRead(name, text, sport, odds, pack, bet) {
  const body = bet && typeof bet === "object" ? `${bet.market || ""} ${bet.label || ""} ${bet.runner || ""}` : String(text || "");
  const league = String((bet && bet.sport) || sport || "");
  const spec = specOf(body);
  if (combo(body) && !(spec && spec[1].includes(" and "))) return { why: "A combo prop stays off a single stat's log." };
  const rows = spec ? logRows(pack, spec[0]) : [];
  const bar = spec ? barOf(body, spec[2]) : null;
  const price = priceOf(bet && bet.odds != null ? bet.odds : odds);
  if (!(bet && typeof bet === "object")) {
    if (rows.length < 10) return { why: rows.length ? `The last ${rows.length} average ${numOf(meanOf(rows))} ${spec[1]}.` : "" };
    return { why: happened(pack, body) };
  }
  const part = /\b(quarter|half|period|inning|first|last|1st|2nd|3rd)\b/i.test(body);
  if (part && spec && rows.length >= 3) {
    const per = (chunk) => { const avg = chunk.reduce((sum, row) => sum + row.value, 0) / chunk.length; const shown = whole(avg) ? String(Math.round(avg)) : String(Math.round(avg * 10) / 10); const played = chunk.map((row) => row.minutes).filter((n) => typeof n === "number"); const clock = played.length === chunk.length && played.length ? ` · ${Math.round(played.reduce((sum, n) => sum + n, 0) / played.length)} min` : ""; return `${shown} a game${clock}`; };
    const counts = (SPAN[league] || [3, 6, 10, 25, 50]).filter((n) => rows.length >= n);
    const bits = counts.map((n) => `Last ${n}, ${per(rows.slice(0, n))}`);
    const year = seasonYear(league);
    const now = rows.filter((row) => Number(row.season) === year), last = rows.filter((row) => Number(row.season) === year - 1);
    if (now.length >= 3) bits.push(`This season, ${per(now)}`);
    if (last.length >= 3) bits.push(`Last season, ${per(last)}`);
    bits.push(`Career, ${per(rows)}`);
    return { why: `${nick(name)} is at ${per(rows.slice(0, 3)).split(" a game")[0]} ${spec[1]} a game over the last 3.`, spans: `${bits.join(". ")}.`, lean: "" };
  }
  const under = /\bunder\b/i.test(body);
  const shown = bar == null ? "" : (whole(bar) ? String(Math.round(bar)) : String(bar));
  const verb = spec && spec[2] && bar === 1 ? "scored a touchdown" : `${under ? "stayed under" : "cleared"} ${shown}+ ${spec ? spec[1] : ""}`.trim();
  const why = bar != null && rows.length >= 3 ? `${nick(name)} ${verb} in ${hitsOf(rows.slice(0, 3), bar, under)} of the last 3. FanDuel has this at ${Math.round(price * 100)}%.` : "";
  return { why, spans: windowsOf(pack, body, league), lean: leanOf(pack, body, price) };
}

async function whyPlayer(name, text, sport, bet, odds, games) {
  const league = String((bet && bet.sport) || sport || "").trim() || ((`${text || ""} ${(bet && bet.label) || ""}`.match(/\b(NFL|NBA|NHL|MLB|WNBA|NCAAF|NCAAB)\b/i) || [])[1] || "").toUpperCase();
  let pack = await savedPack(league, name);
  const bin = pythonBin();
  const asked = bet && typeof bet === "object"
    ? { read: true, name: String(name || ""), bet, pack }
    : { name: String(name || ""), text: String(text || ""), sport: String(sport || league || ""), odds, games: (Array.isArray(games) ? games : []).slice(0, 40).map(slimGame), pack };
  if (asked.read && !(pack && pack.rows && pack.rows.length)) { try { pack = await require("./sway-api").careerPack(league, name); asked.pack = pack || null; } catch (err) { pack = null; } }
  let found = null;
  try {
    if (bin) found = JSON.parse(execFileSync(bin, ["-m", "nfl_bets.why"], { input: JSON.stringify(asked), encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024, cwd: __dirname }));
  } catch (err) { found = null; }
  if (asked.read) { const dub = pack ? require("./double-read").doubleRead(nick(name), pack, bet, priceOf(bet.odds != null ? bet.odds : odds)) : null; if (dub) return dub; const read = pack ? savedRead(name, text, sport || league, odds, pack, bet) : null; const why = (found && found.why) || (read && read.why) || ""; const spans = (found && found.spans) || (read && read.spans) || ""; const lean = (found && found.lean) || (read && read.lean) || ""; return (why || spans || lean) ? { ...(found || {}), why, spans, lean } : { why: "" }; }
  if (!found) return { why: "The game log did not load." };
  let looks = [];
  try { looks = (await require("./desk-looks").currentLooks()).looks || []; } catch (err) { looks = []; }
  const allowed = new Set(looks.map((row) => row.id));
  const measured = (found.hits || []).filter((row) => row && row.line && (!allowed.size || allowed.has(row.id))).map((row) => row.line).join(" ");
  const facts = [found.why, measured].filter(Boolean).join(" ");
  try {
    const spoken = await require("./bet-ask").askTrend(name, text, facts, sport, looks);
    if (spoken && !found.why) return { why: spoken };
  } catch (err) { /* keep the box score */ }
  return { why: facts || found.why || "" };
}

function asked(opts) {
  const when = opts.span === "week" ? "this week" : "today", league = (opts.sports || []).filter(Boolean), kind = opts.kind && opts.kind !== "any" ? String(opts.kind) : "";
  const where = league.length === 1 ? ` in the ${league[0]}` : league.length === 2 ? ` in the ${league[0]} and ${league[1]}` : league.length ? ` in the ${league.slice(0, -1).join(", ")} and ${league[league.length - 1]}` : "";
  return `You asked for ${kind || "one pick"}${where}${opts.game ? ` for ${opts.game}` : ""} ${when}.${Number(opts.profit) > 0 ? ` You wanted about $${Number(opts.profit)} profit on a $${opts.stake || 5} bet.` : ""}`;
}

function sayClose(opts, later) {
  const why = "I looked at the recent games, and none of them sit far enough off the FanDuel price.";
  return later ? `${asked(opts)} Nothing today. ${why} These are the closest later this week.` : `${asked(opts)} ${why} These are the closest.`;
}

function near(odds) { const n = Number(odds); return !n ? 0 : n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100); }

function postedCards(pools, stake, limit) {
  const rows = [];
  (pools || []).forEach((row) => { const game = row[0] || {}; (row[1] || []).forEach((leg) => { if (Number(leg.odds)) rows.push({ leg, game }); }); });
  rows.sort((a, b) => Math.abs(Number(a.leg.odds) + 110) - Math.abs(Number(b.leg.odds) + 110));
  const seen = new Set();
  const cards = [];
  rows.forEach(({ leg, game }) => {
    const key = `${leg.label}|${game.id || game.match}`;
    if (seen.has(key) || cards.length >= limit) return;
    seen.add(key);
    const odds = Number(leg.odds), chance = Math.round(near(odds) * 1000) / 10, match = game.match || leg.match || "", label = String(leg.label || ""), dec = odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
    cards.push({ title: "One pick", game: match, american: odds, impliedPct: chance, profit: Math.round((Number(stake) || 5) * (dec - 1) * 100) / 100, why: `FanDuel has this at ${chance}%.`, edge: false, close: true, players: [], only: false, again: false, legs: [{ market: leg.market || "", runner: leg.runner || "", label: match && !label.includes(match) ? `${label} — ${match}` : label, odds, kickoff: game.kickoff || leg.kickoff || "", gameId: String(game.id || ""), sport: game.sport || leg.sport || "", pct: `${(near(odds) * 100).toFixed(1)}%` }] });
  });
  return cards;
}

function postedNote(opts, laterCount) {
  const week = opts.span === "week" ? "" : laterCount ? " I checked the rest of the week. Some of these are later this week." : " I checked the rest of the week. Nothing later is posted for this.";
  const similar = /rebound/i.test(String(opts.kind || "")) && /assist/i.test(String(opts.kind || "")) ? " Points, rebounds, and assists are each their own bet if you want one stat." : "";
  return `${asked(opts)}${week} None of them sit far enough off the FanDuel price. These are those lines anyway.${similar}`;
}

async function onePick(pools, games, opts, weekOf) {
  const card = singleFind(pools, games, opts);
  if (card.note === "The single bet did not finish.") return card;
  if ((card.legs || []).length && !card.close) return card;
  if (card.close && (card.legs || []).length) { card.note = card.copy = sayClose(opts, false); return card; }
  let weekPools = [];
  if (opts.span !== "week" && typeof weekOf === "function") {
    const week = await weekOf();
    weekPools = week.pools || [];
    const later = singleFind(weekPools, week.games || [], opts);
    if ((later.legs || []).length) { later.note = later.copy = later.close ? sayClose(opts, true) : `${asked(opts)} Nothing today. This one is later this week.`; later.close = true; return later; }
  }
  const today = postedCards(pools, opts.stake, 3);
  const ahead = postedCards(weekPools, opts.stake, 3).filter((row) => !today.some((have) => have.legs[0].label === row.legs[0].label));
  const cards = today.slice(0, ahead.length ? 2 : 3).concat(ahead.slice(0, Math.max(0, 3 - Math.min(today.length, ahead.length ? 2 : 3))));
  if (!cards.length) {
    const note = `${asked(opts)} I checked the rest of the week too. ${Number(opts.profit) > 0 ? "That profit leaves the posted lines out." : "FanDuel has not posted that today or later this week."}`;
    return { title: "One pick", game: "", copy: note, note, why: "", legs: [], players: [], only: false, again: false, close: true };
  }
  const host = cards[0];
  host.offers = cards.slice(1); host.edge = true; host.note = host.copy = postedNote(opts, ahead.length); host.title = cards.length > 1 ? "One pick bets" : "One pick";
  return host;
}

module.exports = { singleFind, onePick, markPlayer, whyPlayer, savedPack };
