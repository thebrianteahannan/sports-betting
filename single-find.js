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
  const raw = execFileSync("python3", ["-m", "nfl_bets.single"], {
    input: JSON.stringify({ legs, games: slim, skip: [...(opts.skip || [])], stake: opts.stake, profit: opts.profit }),
    encoding: "utf8", timeout: 50000, maxBuffer: 8 * 1024 * 1024, cwd: __dirname,
  });
  return JSON.parse(raw);
}

function markPlayer(name, bets, games) {
  const legs = (Array.isArray(bets) ? bets : []).slice(0, 200).map((bet) => ({
    market: bet.market || "", runner: bet.runner || "", label: bet.label || "", odds: bet.odds,
    sport: bet.sport || "", match: bet.match || "", kickoff: bet.kickoff || "",
  }));
  let saved = [];
  try { saved = JSON.parse(fs.readFileSync(path.join(__dirname, "output", "board.json"), "utf8")).games || []; } catch (err) { saved = []; }
  const slate = (Array.isArray(games) ? games : []).map((game) => {
    const full = saved.find((row) => row && row.kickoff === game.kickoff && row.match === game.match) || game;
    return {
      id: full.id, sport: full.sport || game.sport || "", match: full.match || game.match || "",
      awayName: full.awayName || "", homeName: full.homeName || "", kickoff: full.kickoff || game.kickoff || "",
      espnId: full.espnId || "", spread: full.spread || null, total: full.total || null,
    };
  });
  const raw = execFileSync("python3", ["-m", "nfl_bets.single"], {
    input: JSON.stringify({ mark: true, name: String(name || ""), legs, games: slate }),
    encoding: "utf8", timeout: 40000, maxBuffer: 8 * 1024 * 1024, cwd: __dirname,
  });
  return JSON.parse(raw);
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
const ALIAS = { shotsTotal: ["shotsTotal", "shotsOnGoal", "shots"], totalRebounds: ["totalRebounds", "rebounds"], "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "threePointFieldGoalsMade"] };

function specOf(text) {
  const low = String(text || "").toLowerCase();
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
function combo(text) { const low = String(text || "").toLowerCase(); let kinds = 0; if (low.includes("touchdown")) kinds += 1; if (low.includes("receiving") && (low.includes("yard") || low.includes("yds"))) kinds += 1; if (low.includes("rushing") && (low.includes("yard") || low.includes("yds"))) kinds += 1; if (low.includes("passing") && (low.includes("yard") || low.includes("yds"))) kinds += 1; if (low.includes("reception")) kinds += 1; if (low.includes("shots on goal") || /\bshots\b/.test(low)) kinds += 1; if (low.includes("made three") || low.includes("threes")) kinds += 1; if (low.includes("rebound")) kinds += 1; if (low.includes("assist")) kinds += 1; if (low.includes("strikeout")) kinds += 1; if (low.includes("home run")) kinds += 1; else if (/\bhits?\b/.test(low)) kinds += 1; if (/\bgoals?\b/.test(low)) kinds += 1; if (/\bpoints?\b/.test(low)) kinds += 1; return kinds > 1; }

function share(rows, bar, under) {
  const hits = hitsOf(rows, bar, under);
  const per = rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
  const shown = whole(per) ? String(Math.round(per)) : String(Math.round(per * 10) / 10);
  const played = rows.map((row) => row.minutes).filter((n) => typeof n === "number");
  const clock = played.length === rows.length && played.length ? ` · ${Math.round(played.reduce((sum, n) => sum + n, 0) / played.length)} min` : "";
  return `${hits} of ${rows.length} · ${Math.round(hits / rows.length * 100)}% · ${shown} a game${clock}`;
}

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
  const year = rows.reduce((max, row) => Math.max(max, Number(row.season) || 0), 0);
  const now = rows.filter((row) => year && Number(row.season) === year);
  const last = rows.filter((row) => year && Number(row.season) === year - 1);
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

function leanOf(pack, text, price) {
  const spec = specOf(text);
  const rows = spec ? logRows(pack, spec[0]) : [];
  const bar = spec ? barOf(text, spec[2]) : null;
  if (bar == null || price <= 0 || rows.length < 20) return "";
  const under = /\bunder\b/i.test(text);
  const near = Math.round(hitsOf(rows.slice(0, 10), bar, under) / 10 * 100);
  const far = Math.round(hitsOf(rows, bar, under) / rows.length * 100);
  const asked = Math.round(price * 100);
  if (near === far) return `The last 10 and the full history are both ${near}%.`;
  if (Math.abs(asked - near) + 3 < Math.abs(asked - far)) {
    const extra = far >= asked + 8 ? dip(rows, bar, under, asked, far) : "";
    return `The ${asked}% price is closer to the recent history (last 10, ${near}%) than the full history (${far}%). ${extra}`.trim();
  }
  if (Math.abs(asked - far) + 3 < Math.abs(asked - near)) return `The ${asked}% price is closer to the full history (${far}%) than the recent history (last 10, ${near}%).`;
  return `The ${asked}% price sits between the recent history (last 10, ${near}%) and the full history (${far}%).`;
}

function savedRead(name, text, sport, odds, pack, bet) {
  const body = bet && typeof bet === "object" ? `${bet.market || ""} ${bet.label || ""} ${bet.runner || ""}` : String(text || "");
  const league = String((bet && bet.sport) || sport || "");
  if (/\b(quarter|half|period|inning)\b/i.test(body) || /\b(first|last|1st|2nd|3rd)\b/i.test(body)) return { why: "A quarter, half, or first-scorer prop stays off the full-game log." };
  if (combo(body)) return { why: "A combo prop stays off a single stat's log." };
  const spec = specOf(body);
  const rows = spec ? logRows(pack, spec[0]) : [];
  const bar = spec ? barOf(body, spec[2]) : null;
  const price = priceOf(bet && bet.odds != null ? bet.odds : odds);
  if (!(bet && typeof bet === "object")) {
    if (rows.length < 20) return { why: "The log is too short to split a recent stretch from the career." };
    return { why: leanOf(pack, body, price) || "The recent windows and the career are the same number." };
  }
  const under = /\bunder\b/i.test(body);
  const shown = bar == null ? "" : (whole(bar) ? String(Math.round(bar)) : String(bar));
  const verb = spec && spec[2] && bar === 1 ? "scored a touchdown" : `${under ? "stayed under" : "cleared"} ${shown}+ ${spec ? spec[1] : ""}`.trim();
  const why = bar != null && rows.length >= 3 ? `${nick(name)} ${verb} in ${hitsOf(rows.slice(0, 3), bar, under)} of the last 3. FanDuel has this at ${Math.round(price * 100)}%.` : "";
  return { why, spans: windowsOf(pack, body, league), lean: leanOf(pack, body, price) };
}

async function whyPlayer(name, text, sport, bet, odds, games) {
  const league = String((bet && bet.sport) || sport || "");
  const pack = await savedPack(league, name);
  const bin = pythonBin();
  if (!bin) return pack ? savedRead(name, text, sport, odds, pack, bet) : { why: "This player's game log is not on the desk yet." };
  const asked = bet && typeof bet === "object"
    ? { read: true, name: String(name || ""), bet, pack }
    : { name: String(name || ""), text: String(text || ""), sport: String(sport || ""), odds, games: (Array.isArray(games) ? games : []).slice(0, 40).map(slimGame), pack };
  let found;
  try {
    found = JSON.parse(execFileSync(bin, ["-m", "nfl_bets.why"], {
      input: JSON.stringify(asked), encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024, cwd: __dirname,
    }));
  } catch (err) {
    return { why: "The game log did not load." };
  }
  if (asked.read) return found;
  let looks = [];
  try { looks = (await require("./desk-looks").currentLooks()).looks || []; } catch (err) { looks = []; }
  const allowed = new Set(looks.map((row) => row.id));
  const measured = (found.hits || []).filter((row) => row && row.line && (!allowed.size || allowed.has(row.id))).map((row) => row.line).join(" ");
  const facts = [found.why, measured].filter(Boolean).join(" ");
  try {
    const spoken = await require("./bet-ask").askTrend(name, text, facts, sport, looks);
    if (spoken) return { why: spoken };
  } catch (err) { /* keep the box score */ }
  return { why: facts || found.why || "" };
}

module.exports = { singleFind, markPlayer, whyPlayer };
