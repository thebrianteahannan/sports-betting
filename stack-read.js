/** How often each stack leg's player, or team, reached that line in recent games. */

const { implied, pyRound, g, signed, getJson, pool, logCache, byLast } = require("./stack-base");

const REFERER = "https://www.espn.com/";
const PATH = { NFL: ["football", "nfl"], NBA: ["basketball", "nba"], WNBA: ["basketball", "wnba"], MLB: ["baseball", "mlb"], NHL: ["hockey", "nhl"] };
const UNIT = { NHL: "goals", MLB: "runs" };
const LAST = 10;
const TEAM_TTL = 6 * 3600 * 1000;
const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
const LABEL = /^(.+?)\s+(?:(Over|Under)\s+(\d+(?:\.\d+)?)|(\d+)\+)\s*(.*)$/i;
const ALIAS = { shotsTotal: ["shotsTotal", "shotsOnGoal", "shots"], totalRebounds: ["totalRebounds", "rebounds"], "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "threePointFieldGoalsMade"] };
const teams = new Map();

function spec(text) {
  const low = text.toLowerCase();
  const yards = low.includes("yard") || low.includes("yds");
  if (low.includes("touchdown")) return ["receivingTouchdowns", "rushingTouchdowns"];
  if (low.includes("receiving") && yards) return ["receivingYards"];
  if (low.includes("rushing") && yards) return ["rushingYards"];
  if (low.includes("passing") && yards) return ["passingYards"];
  if (low.includes("reception")) return ["receptions"];
  if (low.includes("shots on goal") || /\bshots\b/.test(low)) return ["shotsTotal"];
  if (low.includes("made three") || low.includes("threes")) return ["threePointFieldGoalsMade-threePointFieldGoalsAttempted"];
  if (low.includes("rebound")) return ["totalRebounds"];
  if (low.includes("assist")) return ["assists"];
  if (low.includes("strikeout")) return ["strikeouts"];
  if (low.includes("home run")) return ["homeRuns"];
  if (/\bhits?\b/.test(low)) return ["hits"];
  if (/\bgoals?\b/.test(low)) return ["goals"];
  if (/\bpoints?\b/.test(low)) return ["points"];
  return null;
}

function statValue(raw, key) {
  let text = String(raw ?? "None").trim();
  if (["", "-", "—"].includes(text)) return null;
  if (text.includes("-") && key.includes("Made-")) text = text.split("-")[0];
  const value = Number(text);
  return text && Number.isFinite(value) ? value : null;
}

function statRows(pack, keys) {
  const names = Array.isArray(pack.names) ? pack.names : [];
  const indexes = keys.map((key) => (ALIAS[key] || [key]).map((option) => names.indexOf(option)).find((at) => at >= 0)).filter((at) => at !== undefined);
  if (!indexes.length) return [];
  const rows = [];
  (pack.rows || []).forEach((row) => {
    const stats = row.stats || [];
    const values = indexes.map((at) => statValue(at < stats.length ? stats[at] : "", names[at]));
    if (values.some((value) => value === null)) return;
    rows.push({ value: values.reduce((sum, value) => sum + value, 0) });
  });
  return rows;
}

function findPack(who, sport, cache, last) {
  const low = who.toLowerCase();
  const pack = cache[`${sport}|${low}`];
  if (pack && pack.rows && pack.rows.length) return pack;
  const options = (last[low.split(/\s+/).pop()] || []).filter((name) => name.endsWith(low));
  return options.length === 1 ? cache[`${sport}|${options[0]}`] : null;
}

function count(text, sport, cache, last) {
  const found = LABEL.exec(text.trim().replace(/^(.+?) anytime touchdown$/, "$1 1+ anytime touchdown"));
  if (!found || !sport) return null;
  const [, who, side, line, plus, stat] = found;
  const keys = stat.split("+").flatMap((part) => spec(part) || []);
  const pack = findPack(who.trim(), sport, cache, last);
  if (!keys.length || !pack) return null;
  const rows = statRows(pack, keys).slice(0, LAST);
  if (rows.length < 5) return null;
  const words = stat.trim().toLowerCase();
  let hits;
  let verb;
  if (plus) {
    const bar = Number.parseInt(plus, 10);
    hits = rows.filter((row) => row.value + 1e-9 >= bar).length;
    verb = words === "anytime touchdown" ? "scored a touchdown" : `reached ${bar}+ ${words}`;
  } else if (side.toLowerCase() === "under") {
    const number = Number(line);
    hits = rows.filter((row) => row.value < number).length;
    verb = `stayed under ${g(number)} ${words}`;
  } else {
    const number = Number(line);
    const bar = Number.isInteger(number) ? number : Math.floor(number) + 1;
    hits = rows.filter((row) => row.value + 1e-9 >= bar).length;
    verb = `reached ${bar}+ ${words}`;
  }
  return { who: who.trim(), verb, hits, games: rows.length };
}

async function teamId(name, sportName, league) {
  const data = await getJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=team`, REFERER, 12000);
  const want = name.toLowerCase();
  const hits = (data.items || []).filter((item) => String(item.league || "") === league);
  const picked = hits.find((item) => String(item.displayName || "").toLowerCase() === want) || (hits.length === 1 ? hits[0] : null);
  return picked ? String(picked.id || "") : "";
}

function score(side) {
  const raw = side.score && typeof side.score === "object" ? side.score.value : side.score;
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(value)) throw new Error("no score");
  return value;
}

async function finals(sportName, league, id, year) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportName}/${league}/teams/${id}/schedule`;
  const data = await getJson(year ? `${url}?season=${year}` : url, REFERER, 12000);
  const rows = [];
  (data.events || []).forEach((event) => {
    const comp = (event.competitions || [{}])[0] || {};
    if (String((((comp.status || {}).type || {}).state) || "") !== "post") return;
    const sides = (comp.competitors || []).filter((side) => side && typeof side === "object");
    const mine = sides.find((side) => String((side.team || {}).id || "") === id);
    const other = sides.find((side) => side !== mine);
    if (!mine || !other) return;
    try { rows.push({ date: String(event.date || ""), event: String(event.id || ""), for: score(mine), against: score(other) }); } catch (error) { /* unfinished score */ }
  });
  return [Number((data.requestedSeason || {}).year || 0), rows];
}

async function teamRows(key) {
  const cut = key.indexOf("|");
  const [sportName, league] = PATH[key.slice(0, cut)];
  try {
    const id = await teamId(key.slice(cut + 1), sportName, league);
    if (!id) return [];
    let [year, rows] = await finals(sportName, league, id, null);
    if (year && rows.length < LAST) {
      const seen = new Set(rows.map((row) => row.event));
      rows = rows.concat((await finals(sportName, league, id, year - 1))[1].filter((row) => !seen.has(row.event)));
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, LAST);
  } catch (error) {
    return null;
  }
}

async function teamLoad(games) {
  const want = [...new Set(games.flatMap((game) => [game.homeName, game.awayName].filter((name) => name && PATH[game.sport]).map((name) => `${game.sport}|${name}`)))];
  const stale = want.filter((key) => !(teams.get(key) && Date.now() - teams.get(key).at < TEAM_TTL));
  (await pool(stale, 8, async (key) => [key, await teamRows(key)])).forEach(([key, rows]) => { if (rows !== null) teams.set(key, { at: Date.now(), rows }); });
  const out = {};
  want.forEach((key) => { out[key] = ((teams.get(key) || {}).rows || []).slice(); });
  return out;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function teamCount(text, game, logs) {
  const sport = String(game.sport || "");
  const pair = ["homeName", "awayName"].map((side) => String(game[side] || ""));
  text = text.trim();
  for (const team of pair) {
    const found = team ? new RegExp(`^${escape(team)}\\s+\\(?${NUM}\\)?(?:\\s+spread)?$`).exec(text) : null;
    if (!found) continue;
    const line = Number(found[1]);
    const rows = (logs[`${sport}|${team}`] || []).slice(0, LAST);
    if (rows.length < 5) return null;
    const hits = rows.filter((row) => row.for - row.against + line > 0).length;
    const verb = line < 0 && !Number.isInteger(line) ? `won by ${Math.floor(-line) + 1}+` : `covered ${signed(line)}`;
    return { who: team, verb, hits, games: rows.length };
  }
  const found = new RegExp(`\\b(Over|Under)\\s+\\(?${NUM}\\)?`, "i").exec(text);
  if (!found || !text.toLowerCase().includes("total")) return null;
  const side = found[1].toLowerCase();
  const line = Number(found[2]);
  const unit = UNIT[sport] || "points";
  const head = text.slice(0, found.index).toLowerCase();
  const team = pair.find((name) => name && head.includes(name.split(/\s+/).pop().toLowerCase())) || "";
  let rows;
  let who;
  let words;
  let verbWord;
  if (team) {
    rows = (logs[`${sport}|${team}`] || []).slice(0, LAST).map((row) => row.for);
    who = team;
    words = unit;
    verbWord = side === "under" ? "scored under" : "scored over";
  } else {
    const seen = new Set();
    rows = [];
    pair.forEach((name) => (logs[`${sport}|${name}`] || []).slice(0, LAST).forEach((row) => { if (!seen.has(row.event)) { seen.add(row.event); rows.push(row.for + row.against); } }));
    who = `${pair.slice().reverse().filter(Boolean).map((name) => name.split(/\s+/).pop()).join(" and ")} games`;
    words = `total ${unit}`;
    verbWord = side === "under" ? "stayed under" : "went over";
  }
  if (rows.length < 5) return null;
  const hits = rows.filter((value) => (side === "under" ? value < line : value > line)).length;
  return { who, verb: `${verbWord} ${g(line)} ${words}`, hits, games: rows.length };
}

async function tally(found, games) {
  const gameOf = Object.fromEntries(games.map((game) => [String(game.match || ""), game]));
  const logs = await teamLoad(games);
  const cache = logCache();
  const lasts = {};
  Object.values(found).forEach((stacks) => (stacks || []).forEach((stack) => {
    const game = gameOf[String(stack.game || "")] || {};
    const sport = String(game.sport || "");
    lasts[sport] = lasts[sport] || byLast(cache, sport);
    const reads = [];
    (stack.bets || []).forEach((bet) => {
      const text = String(bet.label || "");
      const read = count(text, sport, cache, lasts[sport]) || teamCount(text, game, logs);
      if (!read) return;
      bet.hits = read.hits;
      bet.games = read.games;
      reads.push([bet, read]);
    });
    if (!reads.length) return;
    const [bet, read] = reads.reduce((low, item) => (implied(item[0].odds) < implied(low[0].odds) ? item : low));
    const price = implied(bet.odds);
    stack.beats = read.hits / read.games > price;
    stack.read = `${read.who} ${read.verb} in ${read.hits} of the last ${read.games}. FanDuel prices that at ${pyRound(price * 100, 1).toFixed(1)}%.`;
  }));
}

module.exports = { count, findPack, teamLoad, teamCount, tally };
