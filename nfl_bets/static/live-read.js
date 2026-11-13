/** Reads a bet leg against a live box score. Shared by the live page and the bet card on the home page. */

let liveLegs = [], liveRecs = [];
const LIVE_STAT = { points: ["PTS"], rebounds: ["REB"], assists: ["AST"], threes: ["3PT"], "made threes": ["3PT"], steals: ["STL"], blocks: ["BLK"], "pts + reb": ["PTS", "REB"], "pts + ast": ["PTS", "AST"], "reb + ast": ["REB", "AST"], "pts + reb + ast": ["PTS", "REB", "AST"] };
const LIVE_NHL = { points: ["G", "A"], goals: ["G"], assists: ["A"], "shots on goal": ["S"], "blocked shots": ["BS"], saves: ["SV"] };
const LIVE_NFL = { "rushing yards": [["rushing", "YDS"]], "receiving yards": [["receiving", "YDS"]], "passing yards": [["passing", "YDS"]], receptions: [["receiving", "REC"]], "rushing attempts": [["rushing", "CAR"]], "passing touchdowns": [["passing", "TD"]], "passing completions": [["passing", "C/ATT"]], "pass completions": [["passing", "C/ATT"]], completions: [["passing", "C/ATT"]], "interceptions thrown": [["passing", "INT"]], "rushing + receiving yards": [["rushing", "YDS"], ["receiving", "YDS"]], touchdowns: [["rushing", "TD"], ["receiving", "TD"]] };

function liveFold(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
}

function liveLegRead(leg) {
  const label = String(leg.label || ""), market = String(leg.market || "");
  const who = label.split(/\s+(?=\d+\+|Over\b|Under\b)/)[0].replace(/\s+-$/, "").trim();
  const plus = market.match(/^(\d+)\+\s+(.+)$/), named = market.match(/\s-\s(?:Alt\s+)?(.+)$/), line = label.match(/\b(Over|Under)\s+(\d+(?:\.\d+)?)/i);
  const stat = ((plus && plus[2]) || (named && named[1]) || (label.match(/\b(?:Over|Under)\s+\d+(?:\.\d+)?\s+(.+)$/i) || [])[1] || "").toLowerCase();
  const text = plus ? `${plus[1]}+ ${stat}` : line ? `${line[1]} ${line[2]} ${stat}`.trim() : label.slice(who.length).trim() || market;
  const score = !plus && !line && (market.match(/any\s*time touchdown|to score (\d+)\+ touchdowns/i) || null), tagged = !plus && !line && !score && label.slice(who.length).match(/^\s*(\d+)\+\s/);
  return { parlay: leg.parlay || "", size: leg.parlaySize || 0, label, market, match: leg.match || "", kickoff: leg.kickoff || "", who, stat: score ? "touchdowns" : stat, text, odds: Number(leg.odds), need: plus ? Number(plus[1]) : line ? Number(line[2]) : score ? Number(score[1] || 1) : tagged ? Number(tagged[1]) : null, plus: !!plus || !!score || !!tagged, under: !!(line && /under/i.test(line[1])) };
}

function liveMine(game, list = liveLegs) {
  const tail = (name) => liveFold(name).split(" ").pop(), sides = [tail(game.away.name), tail(game.home.name)], seen = new Set();
  return list.filter((leg) => {
    const teams = String(leg.match || "").split(/ @ | v /).map(tail), id = `${leg.label}|${leg.market}`;
    if (!sides.every((side) => teams.includes(side)) || Math.abs(Date.parse(leg.kickoff || "") - Date.parse(game.when || "")) > 12 * 3600000 || seen.has(id)) return false;
    seen.add(id); return true;
  }).map(liveLegRead);
}

function liveNfl(game, pick) {
  const key = pick.stat.replace(/\byds\b/g, "yards").replace(/\btds\b/g, "touchdowns").replace(/^(total|alt)\s+/, "").replace(/\brush\b/, "rushing").replace(/\brec\b/, "receiving");
  const parts = LIVE_NFL[key], want = liveFold(pick.who), teams = game.teams || [];
  if (!parts || !teams.length) return { row: null, now: null };
  let row = null, now = 0;
  parts.forEach(([kind, label]) => teams.forEach((team) => team.groups.forEach((group) => {
    const hit = group.name.toLowerCase().endsWith(kind) && group.labels.includes(label) && group.rows.find((one) => liveFold(one.name) === want);
    if (!hit) return;
    row = row || hit;
    now += Number(String(hit.stats[group.labels.indexOf(label)] || "0").split(/[-/]/)[0]) || 0;
  })));
  return { row, now };
}

function liveNow(game, pick) {
  if (String(game.sport || "").toUpperCase() === "NFL") return liveNfl(game, pick);
  const want = liveFold(pick.who);
  for (const team of game.teams || []) for (const group of team.groups) {
    const row = group.rows.find((one) => liveFold(one.name) === want);
    if (!row) continue;
    const keys = [LIVE_STAT[pick.stat], LIVE_NHL[pick.stat]].find((set) => set && set.every((key) => group.labels.includes(key)));
    if (!keys) return { row, now: null };
    return { row, now: keys.reduce((sum, key) => sum + (Number(String(row.stats[group.labels.indexOf(key)] || "0").split("-")[0]) || 0), 0) };
  }
  return { row: null, now: null };
}
