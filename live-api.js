/** Live tracker: every game in progress on ESPN with each player's box score line, plus the games starting next. */

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const LEAGUES = [["NBA", "basketball/nba"], ["NFL", "football/nfl"], ["NHL", "hockey/nhl"], ["MLB", "baseball/mlb"]];
const KEEP = 15000;
const MEM = new Map();

function json(url) {
  const hit = MEM.get(url);
  if (hit && Date.now() - hit.at < KEEP) return hit.promise;
  const promise = fetch(url, { headers: { Accept: "application/json", Referer: "https://www.espn.com/", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) })
    .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json(); });
  promise.catch(() => MEM.delete(url));
  MEM.set(url, { at: Date.now(), promise });
  if (MEM.size > 200) MEM.delete(MEM.keys().next().value);
  return promise;
}

function side(comp, where) {
  const row = (comp.competitors || []).find((item) => item.homeAway === where) || {}, team = row.team || {};
  return { name: team.displayName || "", short: team.abbreviation || "", logo: team.logo || "", color: team.color ? `#${team.color}` : "", score: row.score == null ? "" : String(row.score) };
}

function boxOf(data) {
  return ((data.boxscore || {}).players || []).map((team) => ({
    name: (team.team || {}).displayName || "",
    short: (team.team || {}).abbreviation || "",
    groups: (team.statistics || []).map((group) => ({
      name: group.text || group.name || "",
      labels: group.labels || [],
      rows: (group.athletes || []).filter((one) => !one.didNotPlay && (one.stats || []).length).map((one) => ({
        name: (one.athlete || {}).displayName || "",
        pos: ((one.athlete || {}).position || {}).abbreviation || "",
        starter: !!one.starter,
        on: !!one.active,
        stats: one.stats || [],
      })),
    })).filter((group) => group.rows.length),
  }));
}

function lastPlay(data) {
  const plays = data.plays || [], drive = ((data.drives || {}).current || {}).plays || [];
  const play = plays[plays.length - 1] || drive[drive.length - 1];
  return play ? String(play.text || "") : "";
}

async function liveBoard() {
  const now = Date.now(), live = [], next = [];
  const boards = await Promise.all(LEAGUES.map(([sport, path]) => json(`${BASE}/${path}/scoreboard`).then((data) => ({ sport, path, data })).catch(() => ({ sport, path, data: {} }))));
  boards.forEach(({ sport, path, data }) => (data.events || []).forEach((ev) => {
    const comp = (ev.competitions || [])[0] || {}, type = (comp.status || ev.status || {}).type || {};
    const row = { id: String(ev.id), sport, path, when: ev.date || "", clock: type.shortDetail || type.detail || "", away: side(comp, "away"), home: side(comp, "home"), last: ((comp.situation || {}).lastPlay || {}).text || "" };
    if (type.state === "in") live.push(row);
    else if (type.state === "pre" && Date.parse(ev.date || "") - now < 12 * 3600000) next.push(row);
  }));
  await Promise.all(live.map(async (row) => {
    try { const data = await json(`${BASE}/${row.path}/summary?event=${row.id}`); row.teams = boxOf(data); if (!row.last) row.last = lastPlay(data); } catch (error) { row.teams = []; }
  }));
  [...live, ...next].forEach((row) => { delete row.path; });
  next.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  return { at: now, live, next: next.slice(0, 8) };
}

module.exports = { liveBoard };
