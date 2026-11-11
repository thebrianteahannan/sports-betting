/** NFL and NHL box scores behind the game script: each team's recent games, the recent meetings, and a baseline from every team-game pulled. */

const MEM = new Map();
const HOUR = 6 * 60 * 60 * 1000;
const PATHS = { NFL: "football/nfl", NHL: "hockey/nhl" };
const LAST = { NFL: 8, NHL: 10 };

async function json(url) {
  const hit = MEM.get(url);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const res = await fetch(url, { headers: { Accept: "application/json", Referer: "https://www.espn.com/", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  MEM.set(url, { at: Date.now(), data });
  if (MEM.size > 3000) MEM.delete(MEM.keys().next().value);
  return data;
}

const site = (sport) => `https://site.api.espn.com/apis/site/v2/sports/${PATHS[sport]}`;
const web = (sport) => `https://site.web.api.espn.com/apis/site/v2/sports/${PATHS[sport]}`;
function fold(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim(); }
function num(value) { const n = Number(String(value == null ? "" : value).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
function pair(text) { const [a, b] = String(text || "").split(/[-/]/).map(Number); return [a || 0, b || 0]; }
function clock(text) { const [m, s] = String(text || "").split(":").map(Number); return (m || 0) + (s || 0) / 60; }
function avg(rows, pick) { const nums = rows.map(pick).filter(Number.isFinite); return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }

async function teamId(sport, name) {
  const data = await json(`${site(sport)}/teams?limit=50`);
  const rows = ((((data.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];
  const want = fold(name);
  const hit = rows.map((row) => row.team || row).find((team) => fold(team.displayName) === want || fold(team.name) === want || want.endsWith(fold(team.name)));
  return hit ? String(hit.id) : "";
}

async function played(sport, id, season) {
  const data = await json(`${site(sport)}/teams/${id}/schedule${season ? `?season=${season}` : ""}`);
  return (data.events || []).filter((ev) => (((((ev.competitions || [])[0] || {}).status || {}).type || {}).completed)).map((ev) => {
    const comp = (ev.competitions || [])[0] || {};
    const foe = (comp.competitors || []).find((side) => String((side.team || {}).id) !== String(id)) || {};
    return { id: String(ev.id), when: Date.parse(ev.date || ""), foe: String((foe.team || {}).id || "") };
  }).sort((a, b) => b.when - a.when);
}

function sheetOf(block) {
  const out = new Map();
  (block.statistics || []).forEach((cat) => {
    const keys = cat.keys || [];
    (cat.athletes || []).forEach((row) => {
      const ath = row.athlete || {};
      if (!ath.id || !(row.stats || []).length) return;
      const one = out.get(String(ath.id)) || { id: String(ath.id), name: ath.displayName || "", pos: (ath.position || {}).abbreviation || "", cats: {} };
      const bag = {};
      keys.forEach((key, at) => { bag[key] = (row.stats || [])[at]; });
      one.cats[cat.name] = bag;
      out.set(one.id, one);
    });
  });
  return [...out.values()];
}

function footPerson(one) {
  const pass = one.cats.passing || {}, rush = one.cats.rushing || {}, rec = one.cats.receiving || {};
  const [, passAtt] = pair(pass["completions/passingAttempts"]);
  return { id: one.id, name: one.name, pos: one.pos, passAtt, passYds: num(pass.passingYards), passTd: num(pass.passingTouchdowns), int: num(pass.interceptions), rushAtt: num(rush.rushingAttempts), rushYds: num(rush.rushingYards), rushTd: num(rush.rushingTouchdowns), rec: num(rec.receptions), recYds: num(rec.receivingYards), recTd: num(rec.receivingTouchdowns), tgt: num(rec.receivingTargets) };
}

function icePerson(one) {
  const goalie = one.cats.goalies;
  if (goalie) return { id: one.id, name: one.name, pos: "G", toi: clock(goalie.timeOnIce), sa: num(goalie.shotsAgainst), sv: num(goalie.saves), ga: num(goalie.goalsAgainst) };
  const s = one.cats.forwards || one.cats.defenses || one.cats.skaters || {};
  return { id: one.id, name: one.name, pos: one.pos, toi: clock(s.timeOnIce), pptoi: clock(s.powerPlayTimeOnIce), shots: num(s.shotsTotal), goals: num(s.goals), ast: num(s.assists), blk: num(s.blockedShots), hits: num(s.hits), pim: num(s.penaltyMinutes) };
}

function readSport(sport, doc, eventId) {
  const comps = ((((doc.header || {}).competitions || [])[0] || {}).competitors) || [];
  const box = doc.boxscore || {};
  const teams = (box.teams || []).map((side) => {
    const id = String((side.team || {}).id || "");
    const bag = {};
    (side.statistics || []).forEach((row) => { if (!(row.name in bag)) bag[row.name] = row.displayValue; });
    const comp = comps.find((row) => String((row.team || {}).id) === id) || {};
    const block = (box.players || []).find((row) => String((row.team || {}).id) === id) || {};
    const base = { id, name: (side.team || {}).displayName || "", abbr: (side.team || {}).abbreviation || "", pts: num(comp.score), periods: (comp.linescores || []).map((row) => num(row.displayValue)) };
    if (sport === "NFL") {
      const [, passAtt] = pair(bag.completionAttempts), [sacks] = pair(bag.sacksYardsLost), rz = pair(bag.redZoneAttempts), third = pair(bag.thirdDownEff);
      return { ...base, plays: num(bag.totalOffensivePlays), yards: num(bag.totalYards), passAtt, sacks, passYds: num(bag.netPassingYards), rushAtt: num(bag.rushingAttempts), rushYds: num(bag.rushingYards), to: num(bag.turnovers), drives: num(bag.totalDrives), top: clock(bag.possessionTime), rz, third, people: sheetOf(block).map(footPerson) };
    }
    const people = sheetOf(block).map(icePerson);
    return { ...base, shots: num(bag.shotsTotal), ppg: num(bag.powerPlayGoals), ppo: num(bag.powerPlayOpportunities), pen: num(bag.penalties), pim: num(bag.penaltyMinutes), hits: num(bag.hits), blk: num(bag.blockedShots), people: people.filter((one) => one.pos !== "G"), goalies: people.filter((one) => one.pos === "G" && one.toi > 0) };
  });
  if (teams.length !== 2 || !teams.every((team) => (sport === "NFL" ? team.plays : team.shots))) return null;
  return { id: eventId, sport, teams };
}

async function boxOf(sport, eventId) {
  try { return readSport(sport, await json(`${web(sport)}/summary?event=${eventId}`), eventId); } catch (err) { return null; }
}

function sideRows(boxes) { return boxes.flatMap((box) => box.teams.map((team) => ({ box, team, foe: box.teams.find((row) => row !== team) }))); }

function iceGroup(pos) { return /^D$/.test(String(pos || "").toUpperCase()) ? "D" : "F"; }
function footGroup(pos) { const p = String(pos || "").toUpperCase(); return p === "FB" ? "RB" : ["WR", "TE", "RB", "QB"].includes(p) ? p : ""; }

function profile(sport, rows) {
  const n = rows.length;
  const base = { games: n, pts: avg(rows, (row) => row.team.pts), allow: avg(rows, (row) => row.foe.pts) };
  if (sport === "NFL") {
    const slots = {};
    ["WR", "TE", "RB"].forEach((key) => {
      const per = rows.map((row) => row.foe.people.filter((one) => footGroup(one.pos) === key));
      slots[key] = { recYds: avg(per, (list) => list.reduce((s, one) => s + one.recYds, 0)), rec: avg(per, (list) => list.reduce((s, one) => s + one.rec, 0)), rushYds: avg(per, (list) => list.reduce((s, one) => s + one.rushYds, 0)), n: per.filter((list) => list.length).length };
    });
    return { ...base, plays: avg(rows, (row) => row.team.plays), oppPlays: avg(rows, (row) => row.foe.plays), passAtt: avg(rows, (row) => row.team.passAtt), rushAtt: avg(rows, (row) => row.team.rushAtt), passRate: avg(rows, (row) => (row.team.passAtt + row.team.sacks) / Math.max(1, row.team.passAtt + row.team.sacks + row.team.rushAtt)), passYds: avg(rows, (row) => row.team.passYds), rushYds: avg(rows, (row) => row.team.rushYds), oppPassYds: avg(rows, (row) => row.foe.passYds), oppRushYds: avg(rows, (row) => row.foe.rushYds), sacked: avg(rows, (row) => row.team.sacks), sacks: avg(rows, (row) => row.foe.sacks), to: avg(rows, (row) => row.team.to), takes: avg(rows, (row) => row.foe.to), top: avg(rows, (row) => row.team.top), slots };
  }
  const slots = {};
  ["F", "D"].forEach((key) => { slots[key] = { shots: avg(rows, (row) => row.foe.people.filter((one) => iceGroup(one.pos) === key).reduce((s, one) => s + one.shots, 0)), n }; });
  const ppo = rows.reduce((s, row) => s + row.team.ppo, 0), ppg = rows.reduce((s, row) => s + row.team.ppg, 0), pko = rows.reduce((s, row) => s + row.foe.ppo, 0), pkg = rows.reduce((s, row) => s + row.foe.ppg, 0);
  return { ...base, shots: avg(rows, (row) => row.team.shots), oppShots: avg(rows, (row) => row.foe.shots), ppo: avg(rows, (row) => row.team.ppo), pp: ppo ? ppg / ppo : null, pen: avg(rows, (row) => row.foe.ppo), pk: pko ? 1 - pkg / pko : null, hits: avg(rows, (row) => row.team.hits), slots };
}

function playerBook(sport, rows) {
  const book = new Map();
  rows.forEach((row) => row.team.people.forEach((one) => { const list = book.get(one.name) || []; list.push(one); book.set(one.name, list); }));
  const out = {};
  const keys = sport === "NFL" ? ["passAtt", "passYds", "passTd", "rushAtt", "rushYds", "rushTd", "tgt", "rec", "recYds", "recTd"] : ["toi", "pptoi", "shots", "goals", "ast", "blk", "hits"];
  book.forEach((list, name) => { const row = { games: list.length, pos: list[0].pos, log: list }; keys.forEach((key) => { row[key] = avg(list, (one) => one[key]); }); out[name] = row; });
  return out;
}

function goalieBook(rows) {
  const book = new Map();
  rows.forEach((row) => (row.team.goalies || []).filter((one) => one.toi >= 40).forEach((one) => { const g = book.get(one.name) || { name: one.name, starts: 0, sa: 0, sv: 0 }; g.starts += 1; g.sa += one.sa; g.sv += one.sv; book.set(one.name, g); }));
  return [...book.values()].map((g) => ({ ...g, pct: g.sa ? g.sv / g.sa : null })).sort((a, b) => b.starts - a.starts);
}

async function positions(sport, boxes) {
  if (sport !== "NFL") return;
  const ids = new Set(boxes.flatMap((box) => box.teams.map((team) => team.id)));
  const map = new Map();
  await Promise.all([...ids].map(async (id) => {
    const data = await json(`${site(sport)}/teams/${id}/roster`).catch(() => ({}));
    (data.athletes || []).forEach((group) => (group.items || []).forEach((one) => map.set(String(one.id), (one.position || {}).abbreviation || "")));
  }));
  boxes.forEach((box) => box.teams.forEach((team) => team.people.forEach((one) => { if (!one.pos) one.pos = map.get(one.id) || ""; })));
}

async function lastBoxes(sport, id, before) {
  const early = (ev) => !before || ev.when < before;
  const now = (await played(sport, id).catch(() => [])).filter(early);
  const year = new Date(before || Date.now()).getFullYear();
  const back = sport === "NHL" ? year : year - 1;
  const rows = now.length >= Math.min(4, LAST[sport]) ? now : now.concat(await played(sport, id, back).catch(() => []).then((more) => more.filter((ev) => early(ev) && !now.some((row) => row.id === ev.id))));
  const boxes = (await Promise.all(rows.slice(0, LAST[sport]).map((ev) => boxOf(sport, ev.id)))).filter(Boolean);
  return { boxes, lastAt: (rows[0] || {}).when || null };
}

async function meetBoxes(sport, awayId, homeId, before) {
  const year = new Date(before || Date.now()).getFullYear();
  const seasons = sport === "NHL" ? [year, year - 1] : [year - 1, year - 2];
  const lists = await Promise.all([played(sport, awayId).catch(() => [])].concat(seasons.map((season) => played(sport, awayId, season).catch(() => []))));
  const seen = new Set();
  const ids = lists.flat().filter((ev) => ev.foe === String(homeId) && (!before || ev.when < before) && !seen.has(ev.id) && seen.add(ev.id)).sort((a, b) => b.when - a.when).slice(0, 4);
  return (await Promise.all(ids.map(async (ev) => { const box = await boxOf(sport, ev.id); return box ? { ...box, when: ev.when } : null; }))).filter(Boolean);
}

async function sportBoxes(sport, awayName, homeName, kickoff, before) {
  if (!PATHS[sport]) return null;
  const key = `${sport}|${awayName}|${homeName}|${before || ""}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const [awayId, homeId] = await Promise.all([teamId(sport, awayName), teamId(sport, homeName)]);
  if (!awayId || !homeId) return null;
  const [awayLast, homeLast, meet] = await Promise.all([lastBoxes(sport, awayId, before), lastBoxes(sport, homeId, before), meetBoxes(sport, awayId, homeId, before)]);
  if (!awayLast.boxes.length || !homeLast.boxes.length) return null;
  const all = new Map();
  awayLast.boxes.concat(homeLast.boxes, meet).forEach((box) => all.set(box.id, box));
  await positions(sport, [...all.values()]);
  const mine = (boxes, id) => sideRows(boxes).filter((row) => row.team.id === String(id));
  const start = Date.parse(kickoff || "") || before || Date.now();
  const side = (id, name, last) => ({ id, name, ...profile(sport, mine(last.boxes, id)), players: playerBook(sport, mine(last.boxes, id)), goalies: sport === "NHL" ? goalieBook(mine(last.boxes, id)) : [], rest: last.lastAt ? (start - last.lastAt) / 86400000 : null });
  const data = { sport, away: side(awayId, awayName, awayLast), home: side(homeId, homeName, homeLast), base: profile(sport, sideRows(awayLast.boxes.concat(homeLast.boxes).filter((box, at, list) => list.findIndex((one) => one.id === box.id) === at))), meet };
  MEM.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { sportBoxes, readSport, iceGroup, footGroup, PATHS };
