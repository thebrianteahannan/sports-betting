/** NBA box scores behind the game script: each team's last 10, the recent meetings, and a baseline from every team-game pulled. */

const MEM = new Map();
const HOUR = 6 * 60 * 60 * 1000;
const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const WEB = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba";
const LAST = 10;

async function json(url) {
  const hit = MEM.get(url);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const res = await fetch(url, { headers: { Accept: "application/json", Referer: "https://www.espn.com/", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  MEM.set(url, { at: Date.now(), data });
  return data;
}

function fold(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim(); }

async function teamId(name) {
  const data = await json(`${SITE}/teams?limit=50`);
  const rows = ((((data.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];
  const want = fold(name);
  const hit = rows.map((row) => row.team || row).find((team) => fold(team.displayName) === want || fold(team.name) === want || want.endsWith(fold(team.name)));
  return hit ? String(hit.id) : "";
}

async function played(id, season) {
  const data = await json(`${SITE}/teams/${id}/schedule${season ? `?season=${season}` : ""}`);
  return (data.events || []).filter((ev) => (((((ev.competitions || [])[0] || {}).status || {}).type || {}).completed)).map((ev) => {
    const comp = (ev.competitions || [])[0] || {};
    const foe = (comp.competitors || []).find((side) => String((side.team || {}).id) !== String(id)) || {};
    return { id: String(ev.id), when: Date.parse(ev.date || ""), foe: String((foe.team || {}).id || "") };
  }).sort((a, b) => b.when - a.when);
}

function two(text) { const [made, tried] = String(text || "").split("-").map(Number); return [made || 0, tried || 0]; }

function readBox(doc, eventId) {
  const comps = ((((doc.header || {}).competitions || [])[0] || {}).competitors) || [];
  const box = doc.boxscore || {};
  const teams = (box.teams || []).map((side) => {
    const id = String((side.team || {}).id || "");
    const bag = {};
    (side.statistics || []).forEach((row) => { bag[row.name] = row.displayValue; });
    const [, fga] = two(bag["fieldGoalsMade-fieldGoalsAttempted"]), [, tpa] = two(bag["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]), [, fta] = two(bag["freeThrowsMade-freeThrowsAttempted"]);
    const comp = comps.find((row) => String((row.team || {}).id) === id) || {};
    const block = (box.players || []).find((row) => String((row.team || {}).id) === id) || {};
    const sheet = (block.statistics || [])[0] || {};
    const keys = sheet.keys || [];
    const at = (key) => keys.indexOf(key);
    const people = (sheet.athletes || []).filter((row) => (row.stats || []).length).map((row) => {
      const stats = row.stats || [];
      const num = (key) => Number(stats[at(key)]) || 0;
      const [fgm, fga] = two(stats[at("fieldGoalsMade-fieldGoalsAttempted")]), [tpm, tpa] = two(stats[at("threePointFieldGoalsMade-threePointFieldGoalsAttempted")]);
      return { id: String((row.athlete || {}).id || ""), name: (row.athlete || {}).displayName || "", pos: ((row.athlete || {}).position || {}).abbreviation || "", starter: !!row.starter, min: num("minutes"), pts: num("points"), reb: num("rebounds"), ast: num("assists"), fta: two(stats[at("freeThrowsMade-freeThrowsAttempted")])[1], pf: num("fouls"), fgm, fga, tpm, tpa };
    });
    const [fgm] = two(bag["fieldGoalsMade-fieldGoalsAttempted"]), [tpm] = two(bag["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]);
    return { id, name: (side.team || {}).displayName || "", abbr: (side.team || {}).abbreviation || "", pts: Number(comp.score) || 0, fgm, fga, tpm, tpa, fta, reb: Number(bag.totalRebounds) || 0, lead: Number(bag.largestLead) || 0, oreb: Number(bag.offensiveRebounds) || 0, tov: Number(bag.totalTurnovers || bag.turnovers) || 0, fouls: Number(bag.fouls) || 0, paint: Number(bag.pointsInPaint) || 0, fast: Number(bag.fastBreakPoints) || 0, blk: Number(bag.blocks) || 0, stl: Number(bag.steals) || 0, people };
  });
  if (teams.length !== 2 || !teams.every((team) => team.fga)) return null;
  const poss = teams.reduce((sum, team) => sum + team.fga + 0.44 * team.fta - team.oreb + team.tov, 0) / 2;
  return { id: eventId, poss, teams };
}

async function boxOf(eventId) {
  try { return readBox(await json(`${WEB}/summary?event=${eventId}`), eventId); } catch (err) { return null; }
}

function group(pos) { const p = String(pos || "").toUpperCase(); return p === "C" ? "C" : /G/.test(p) ? "G" : /F/.test(p) ? "F" : ""; }

function avg(rows, pick) { const nums = rows.map(pick).filter(Number.isFinite); return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }

function sideRows(boxes) {
  return boxes.flatMap((box) => box.teams.map((team) => ({ box, team, foe: box.teams.find((row) => row !== team) })));
}

function profile(rows) {
  const slots = {};
  ["G", "F", "C"].forEach((key) => {
    const seen = rows.flatMap((row) => row.foe.people.filter((one) => one.starter && group(one.pos) === key));
    slots[key] = { pts: avg(seen, (one) => one.pts), reb: avg(seen, (one) => one.reb), ast: avg(seen, (one) => one.ast), n: seen.length };
  });
  return {
    games: rows.length, pace: avg(rows, (row) => row.box.poss), pts: avg(rows, (row) => row.team.pts), allow: avg(rows, (row) => row.foe.pts),
    three: avg(rows, (row) => row.team.tpa / row.team.fga), tpa: avg(rows, (row) => row.team.tpa), fta: avg(rows, (row) => row.team.fta), fouls: avg(rows, (row) => row.team.fouls),
    paint: avg(rows, (row) => row.team.paint), fast: avg(rows, (row) => row.team.fast), blk: avg(rows, (row) => row.team.blk), stl: avg(rows, (row) => row.team.stl), tov: avg(rows, (row) => row.team.tov), oreb: avg(rows, (row) => row.team.oreb),
    oppTpa: avg(rows, (row) => row.foe.tpa), oppFta: avg(rows, (row) => row.foe.fta), oppPaint: avg(rows, (row) => row.foe.paint), oppFast: avg(rows, (row) => row.foe.fast), oppTov: avg(rows, (row) => row.foe.tov),
    slots,
  };
}

function playerBook(rows) {
  const book = new Map();
  rows.forEach((row) => row.team.people.forEach((one) => { if (one.min <= 0) return; const list = book.get(one.name) || []; list.push(one); book.set(one.name, list); }));
  const out = {};
  book.forEach((list, name) => { out[name] = { games: list.length, min: avg(list, (one) => one.min), pts: avg(list, (one) => one.pts), reb: avg(list, (one) => one.reb), ast: avg(list, (one) => one.ast), fta: avg(list, (one) => one.fta), pf: avg(list, (one) => one.pf), fga: avg(list, (one) => one.fga), tpm: avg(list, (one) => one.tpm), pos: list[0].pos, log: list.map((one) => ({ pts: one.pts, reb: one.reb, ast: one.ast, tpm: one.tpm })) }; });
  return out;
}

async function lastBoxes(id, before) {
  const early = (ev) => !before || ev.when < before;
  const now = (await played(id).catch(() => [])).filter(early);
  const year = new Date().getFullYear();
  const rows = now.length >= LAST ? now : now.concat(await played(id, year).catch(() => []).then((more) => more.filter((ev) => early(ev) && !now.some((row) => row.id === ev.id))));
  return (await Promise.all(rows.slice(0, LAST).map((ev) => boxOf(ev.id)))).filter(Boolean);
}

async function meetBoxes(awayId, homeId, before) {
  const year = new Date().getFullYear();
  const lists = await Promise.all([played(awayId).catch(() => []), played(awayId, year).catch(() => []), played(awayId, year - 1).catch(() => [])]);
  const seen = new Set();
  const ids = lists.flat().filter((ev) => ev.foe === String(homeId) && (!before || ev.when < before) && !seen.has(ev.id) && seen.add(ev.id)).sort((a, b) => b.when - a.when).slice(0, 4);
  return (await Promise.all(ids.map(async (ev) => { const box = await boxOf(ev.id); return box ? { ...box, when: ev.when } : null; }))).filter(Boolean);
}

async function gameBoxes(awayName, homeName, before) {
  const key = `story|${awayName}|${homeName}|${before || ""}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const [awayId, homeId] = await Promise.all([teamId(awayName), teamId(homeName)]);
  if (!awayId || !homeId) return null;
  const [awayBoxes, homeBoxes, meet] = await Promise.all([lastBoxes(awayId, before), lastBoxes(homeId, before), meetBoxes(awayId, homeId, before)]);
  if (!awayBoxes.length || !homeBoxes.length) return null;
  const mine = (boxes, id) => sideRows(boxes).filter((row) => row.team.id === String(id));
  const all = new Map();
  awayBoxes.concat(homeBoxes).forEach((box) => all.set(box.id, box));
  const data = {
    away: { id: awayId, name: awayName, ...profile(mine(awayBoxes, awayId)), players: playerBook(mine(awayBoxes, awayId)), scores: mine(awayBoxes, awayId).map((row) => [row.team.pts, row.foe.pts]) },
    home: { id: homeId, name: homeName, ...profile(mine(homeBoxes, homeId)), players: playerBook(mine(homeBoxes, homeId)), scores: mine(homeBoxes, homeId).map((row) => [row.team.pts, row.foe.pts]) },
    base: profile(sideRows([...all.values()])),
    meet,
  };
  MEM.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { gameBoxes, group, readBox };
