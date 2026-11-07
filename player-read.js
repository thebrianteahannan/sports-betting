/** What kind of player this is, and the prop numbers he usually posts. */

const { savedPack } = require("./single-find");
const { careerPack } = require("./sway-api");

function seasonYear(sport) {
  const clock = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const month = clock.getMonth() + 1, year = clock.getFullYear();
  if (/^(NBA|NHL|NCAAB)$/.test(String(sport || ""))) return month >= 9 ? year + 1 : year;
  return month >= 3 ? year : year - 1;
}

function num(raw, key) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text || text === "-" || text === "—") return null;
  if (text.includes(":") && /time|minute/i.test(String(key))) {
    const [min, sec] = text.split(":");
    const value = Number(min) + Number(sec || 0) / 60;
    return Number.isFinite(value) ? value : null;
  }
  if (text.includes("-")) return Number(text.split("-")[0]);
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function attempts(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text.includes("-")) return null;
  const value = Number(text.split("-")[1]);
  return Number.isFinite(value) ? value : null;
}

const KEYS = {
  threes: ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "threePointFieldGoalsMade"],
  reb: ["totalRebounds", "rebounds"],
  shots: ["shotsTotal", "shotsOnGoal", "shots"],
  minutes: ["minutes", "timeOnIcePerGame"],
  fga: ["fieldGoalsMade-fieldGoalsAttempted"],
  fta: ["freeThrowsMade-freeThrowsAttempted"],
};

function indexOf(names, key) {
  const options = KEYS[key] || [key];
  const hit = options.find((name) => names.includes(name));
  return hit ? names.indexOf(hit) : -1;
}

function mean(rows, names, key, side) {
  const index = indexOf(names, key);
  if (index < 0) return null;
  const values = [];
  rows.forEach((row) => {
    const raw = (row.stats || [])[index];
    const value = side === "att" ? attempts(raw) : num(raw, key);
    if (value != null) values.push(value);
  });
  if (values.length < 3) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function shown(value) {
  if (value == null) return "";
  return (Math.round(value * 10) / 10).toFixed(1);
}

function cell(rows, names, key, label, side) {
  const value = mean(rows, names, key, side);
  return value == null ? null : { label, value: shown(value), n: value };
}

function keepMinutes(rows, names) {
  const index = indexOf(names, "minutes");
  if (index < 0) return rows;
  const full = rows.filter((row) => { const min = num((row.stats || [])[index], "minutes"); return min == null || min >= 18; });
  return full.length >= 5 ? full : rows;
}

function windowOf(pack, sport, names) {
  const rows = pack.rows || [];
  const year = seasonYear(sport);
  const now = rows.filter((row) => Number(row.season) === year);
  const picked = keepMinutes(now.length >= 5 ? now : rows.slice(0, 10), names);
  const span = now.length >= 5 ? `This season, ${picked.length} games.` : `Last ${picked.length}.`;
  return { rows: picked, span };
}

function jobs(list) {
  const picked = list.filter(Boolean).slice(0, 3);
  if (!picked.length) return "";
  if (picked.length === 1) return `He ${picked[0]}.`;
  if (picked.length === 2) return `He ${picked[0]} and ${picked[1]}.`;
  return `He ${picked[0]}, ${picked[1]}, and ${picked[2]}.`;
}

function hoop(rows, names) {
  const pts = mean(rows, names, "points"), ast = mean(rows, names, "assists"), reb = mean(rows, names, "reb");
  const threes = mean(rows, names, "threes"), min = mean(rows, names, "minutes"), stl = mean(rows, names, "steals"), blk = mean(rows, names, "blocks");
  const fga = mean(rows, names, "fga", "att"), tpa = mean(rows, names, "threes", "att"), fta = mean(rows, names, "fta", "att");
  const share = pts ? ((threes || 0) * 3) / pts : 0;
  const clock = min >= 32 ? "plays the whole night" : min >= 24 ? "plays starter minutes" : min > 0 ? "comes off the bench" : "";
  const habits = [];
  if (threes >= 2.5 && share >= 0.34) habits.push("lives on threes");
  if (ast >= 6) habits.push("sets up the shots");
  if (reb >= 8) habits.push("boards");
  if (pts >= 20 && !habits.includes("lives on threes")) habits.push("scores");
  if ((stl || 0) + (blk || 0) >= 2.2) habits.push("gets his hands on the ball");
  const line = [jobs([clock, ...habits])];
  if (fga && tpa / fga >= 0.45) line.push("Most of the shots are threes.");
  else if (fta >= 6) line.push("He gets to the line.");
  else if (pts >= 18 && reb >= 8 && ast >= 6) line.push("The points, the boards, and the assists come in the same game.");
  const stats = [cell(rows, names, "points", "Pts/Game"), cell(rows, names, "assists", "Assists/Game"), cell(rows, names, "reb", "Rebounds/Game"), cell(rows, names, "threes", "3pters/Game"), cell(rows, names, "minutes", "Minutes/Game")].filter(Boolean);
  if (stl >= 0.8) stats.push({ label: "Steals/Game", value: shown(stl) });
  if (blk >= 0.8) stats.push({ label: "Blocks/Game", value: shown(blk) });
  if (pts != null && reb != null && ast != null) stats.push({ label: "PRA/Game", value: shown(pts + reb + ast) });
  return { line: line.filter(Boolean).join(" "), stats };
}

function ball(rows, names) {
  const pass = mean(rows, names, "passingYards"), rush = mean(rows, names, "rushingYards"), rec = mean(rows, names, "receivingYards");
  const carries = mean(rows, names, "rushingAttempts"), catches = mean(rows, names, "receptions"), targets = mean(rows, names, "receivingTargets");
  const passTd = mean(rows, names, "passingTouchdowns"), rushTd = mean(rows, names, "rushingTouchdowns"), recTd = mean(rows, names, "receivingTouchdowns");
  let line = "";
  if (pass >= 150) line = rush >= 20 ? "He throws it, and he runs when the pocket breaks." : "He throws it. The yards come through the air.";
  else if (rush >= 35 && rec >= 20) line = "He runs and he catches. The touches come both ways.";
  else if (rush >= (rec || 0) && rush >= 30) line = "He is the runner. The yards come on the ground.";
  else if (rec >= 30) line = targets >= 6 ? "He is the receiver. The ball comes his way." : "He is the receiver. The yards come on the catch.";
  else if (catches >= 3) line = "He catches the ball. The receptions are the prop.";
  const stats = [];
  const add = (value, label) => { if (value > 0) stats.push({ label, value: shown(value) }); };
  add(pass, "Pass Yds/Game"); add(passTd, "Pass TD/Game"); add(rush, "Rush Yds/Game"); add(carries, "Carries/Game");
  add(rec, "Rec Yds/Game"); add(catches, "Receptions/Game"); add(targets, "Targets/Game");
  if ((rushTd || 0) + (recTd || 0) > 0) stats.push({ label: "TD/Game", value: shown((rushTd || 0) + (recTd || 0)) });
  return { line, stats };
}

function ice(rows, names) {
  const goals = mean(rows, names, "goals"), ast = mean(rows, names, "assists"), pts = mean(rows, names, "points"), shots = mean(rows, names, "shots"), min = mean(rows, names, "minutes");
  let line = "";
  if (shots >= 3.5 && goals >= (ast || 0)) line = "He shoots. The goals come from the volume.";
  else if (ast > (goals || 0) && ast >= 0.6) line = "He sets up the goals more than he scores them.";
  else if (goals >= 0.4) line = "He scores. The goals are the prop.";
  const stats = [cell(rows, names, "goals", "Goals/Game"), cell(rows, names, "assists", "Assists/Game"), cell(rows, names, "points", "Points/Game"), cell(rows, names, "shots", "Shots/Game")].filter(Boolean);
  if (min != null) stats.push({ label: "Minutes/Game", value: shown(min) });
  return { line, stats };
}

function bat(rows, names) {
  if (names.includes("inningsPitched") || names.includes("earnedRuns")) {
    const k = mean(rows, names, "strikeouts"), ip = mean(rows, names, "inningsPitched");
    const line = k >= 5 || (ip && k / ip >= 1) ? "He misses bats." : ip ? "He gets through the lineup." : "";
    const stats = [cell(rows, names, "strikeouts", "Strikeouts/Game"), cell(rows, names, "hits", "Hits/Game"), cell(rows, names, "earnedRuns", "Earned Runs/Game"), cell(rows, names, "walks", "Walks/Game"), cell(rows, names, "inningsPitched", "Innings/Game")].filter(Boolean);
    return { line, stats };
  }
  const hr = mean(rows, names, "homeRuns"), hits = mean(rows, names, "hits");
  const line = hr >= 0.18 ? "He hits for power. The home runs come with the hits." : hits >= 0.8 ? "He finds hits." : "";
  const stats = [cell(rows, names, "hits", "Hits/Game"), cell(rows, names, "homeRuns", "Home Runs/Game"), cell(rows, names, "RBIs", "RBIs/Game"), cell(rows, names, "runs", "Runs/Game"), cell(rows, names, "stolenBases", "Stolen Bases/Game")].filter((row) => row && (row.label === "Hits/Game" || row.label === "Home Runs/Game" || row.label === "RBIs/Game" || Number(row.value) > 0));
  return { line, stats };
}

function kindOf(sport, names) {
  if (/^(NBA|WNBA|NCAAB)$/.test(sport) || names.includes("totalRebounds")) return "hoop";
  if (/^(NFL|NCAAF)$/.test(sport) || names.includes("rushingYards") || names.includes("passingYards") || names.includes("receivingYards")) return "ball";
  if (sport === "NHL" || names.includes("timeOnIcePerGame")) return "ice";
  if (sport === "MLB" || names.includes("atBats") || names.includes("inningsPitched")) return "bat";
  return "";
}

async function playerCard(name, sport) {
  const league = String(sport || "").trim();
  let pack = league ? await savedPack(league, name) : null;
  if (!(pack && pack.rows && pack.rows.length)) { try { pack = await careerPack(league, name); } catch (err) { pack = null; } }
  if (!(pack && pack.rows && pack.rows.length)) return { line: "", stats: [] };
  const names = pack.names || [];
  const kind = kindOf(league, names);
  if (!kind) return { line: "", stats: [] };
  const window = windowOf(pack, league, names);
  if (window.rows.length < 3) return { line: "", stats: [] };
  const built = kind === "hoop" ? hoop(window.rows, names) : kind === "ball" ? ball(window.rows, names) : kind === "ice" ? ice(window.rows, names) : bat(window.rows, names);
  return { line: built.line, span: window.span, stats: built.stats };
}

module.exports = { playerCard };
