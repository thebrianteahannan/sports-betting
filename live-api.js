/** Live tracker: every game in progress on ESPN with each player's box score line, plus the games starting next. */

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const LEAGUES = [["NBA", "basketball/nba"], ["NFL", "football/nfl"], ["NHL", "hockey/nhl"], ["MLB", "baseball/mlb"]];
const KEEP = 15000;
const MEM = new Map();

function json(url, keep = KEEP) {
  const hit = MEM.get(url);
  if (hit && Date.now() - hit.at < keep) return hit.promise;
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
        id: String((one.athlete || {}).id || ""),
        name: (one.athlete || {}).displayName || "",
        pos: ((one.athlete || {}).position || {}).abbreviation || "",
        starter: !!one.starter,
        on: !!one.active,
        stats: one.stats || [],
      })),
    })).filter((group) => group.rows.length),
  }));
}

function inPlay(data, teams) {
  const rows = teams.flatMap((team) => team.groups.flatMap((group) => group.rows));
  if (rows.some((row) => row.on)) return;
  const plays = (data.plays || ((data.drives || {}).current || {}).plays || []).filter((play) => (play.participants || []).length && Date.parse(play.wallclock || ""));
  const last = Math.max(0, ...plays.map((play) => Date.parse(play.wallclock))), seen = new Set();
  plays.filter((play) => last - Date.parse(play.wallclock) <= 180000).forEach((play) => play.participants.forEach((one) => { const who = one.athlete || {}; if (who.id) seen.add(String(who.id)); if (who.displayName) seen.add(who.displayName); }));
  rows.forEach((row) => { row.on = seen.has(row.id) || seen.has(row.name); });
}

function hurtOf(data, when) {
  const tip = Date.parse(when || ""), heads = ((data.news || {}).articles || []).map((one) => String(one.headline || ""));
  const end = Math.max(tip, ...(data.plays || []).map((play) => Date.parse(play.wallclock || "") || 0)) + 15 * 60000;
  return (data.injuries || []).flatMap((team) => (team.injuries || []).filter((one) => Date.parse(one.date || "") > tip && Date.parse(one.date || "") <= end).map((one) => {
    const name = (one.athlete || {}).displayName || "", last = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/, "").split(" ").pop(), info = one.details || {};
    const head = heads.find((text) => last && text.includes(last) && /exit|injur|ruled out|leaves|return/i.test(text)) || "";
    return { name, team: (team.team || {}).abbreviation || "", status: one.status || "", part: [info.type, info.detail].filter((text) => text && text !== "Not Specified").join(" "), out: /ruled out|won't return|will not return/i.test(head), head };
  }));
}

function lastPlay(data) {
  const plays = data.plays || [], drive = ((data.drives || {}).current || {}).plays || [];
  const play = plays[plays.length - 1] || drive[drive.length - 1];
  return play ? String(play.text || "") : "";
}

async function liveBoard(all) {
  const now = Date.now(), live = [], next = [], done = [];
  const boards = await Promise.all(LEAGUES.map(([sport, path]) => json(`${BASE}/${path}/scoreboard`).then((data) => ({ sport, path, data })).catch(() => ({ sport, path, data: {} }))));
  boards.forEach(({ sport, path, data }) => (data.events || []).forEach((ev) => {
    const comp = (ev.competitions || [])[0] || {}, status = comp.status || ev.status || {}, type = status.type || {};
    const row = { id: String(ev.id), sport, path, when: ev.date || "", clock: type.shortDetail || type.detail || "", period: Number(status.period) || 0, left: Number(status.clock) || 0, away: side(comp, "away"), home: side(comp, "home"), last: ((comp.situation || {}).lastPlay || {}).text || "" };
    if (type.state === "in") live.push(row);
    else if (all && type.state === "post" && now - Date.parse(ev.date || "") < 24 * 3600000) { row.final = true; done.push(row); }
    else if (type.state === "pre" && Date.parse(ev.date || "") - now < 12 * 3600000) next.push(row);
  }));
  await Promise.all([...live, ...done].map(async (row) => {
    try { const data = await json(`${BASE}/${row.path}/summary?event=${row.id}`, row.final ? 600000 : KEEP); row.teams = boxOf(data); if (!row.final) inPlay(data, row.teams); row.hurt = hurtOf(data, row.when); if (!row.last) row.last = lastPlay(data); } catch (error) { row.teams = []; }
  }));
  [...live, ...next, ...done].forEach((row) => { delete row.path; });
  [next, done].forEach((list) => list.sort((a, b) => Date.parse(a.when) - Date.parse(b.when)));
  return { at: now, live, next: next.slice(0, 8), ...(all ? { done } : {}) };
}

let weekMem = { at: 0, games: [] };

async function liveWeek(board) {
  if (Date.now() - weekMem.at < 5 * 60000) return weekMem.games;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(Date.now()), end = fmt.format(Date.now() + 14 * 24 * 3600000);
  const games = ((await board()).games || []).filter((game) => { const kick = Date.parse(game.kickoff || ""); return /^(NFL|NBA|MLB|NHL|WNBA)$/.test(game.sport || "") && kick > Date.now() && fmt.format(kick) <= end; })
    .map((game) => ({ sport: game.sport, match: game.match, kickoff: game.kickoff, awayName: game.awayName || "", homeName: game.homeName || "", total: (game.total && game.total.line) || null })).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const tail = (name) => String(name || "").toLowerCase().trim().split(/\s+/).pop(), slate = [];
  const days = [...new Set(games.map((game) => `${game.sport}|${fmt.format(Date.parse(game.kickoff)).replace(/-/g, "")}`))];
  await Promise.all(LEAGUES.flatMap(([sport, path]) => days.filter((day) => day.startsWith(`${sport}|`)).map((day) => [sport, path, day.split("|")[1]])).map(([sport, path, day]) => json(`${BASE}/${path}/scoreboard?dates=${day}`).then((data) => (data.events || []).forEach((ev) => { const comp = (ev.competitions || [])[0] || {}; slate.push({ sport, when: ev.date, away: side(comp, "away"), home: side(comp, "home") }); })).catch(() => null)));
  games.forEach((game) => {
    const [away, home] = game.match.split(" @ "), hit = slate.find((ev) => ev.sport === game.sport && tail(ev.away.name) === tail(game.awayName || away) && tail(ev.home.name) === tail(game.homeName || home) && Math.abs(Date.parse(ev.when) - Date.parse(game.kickoff)) < 12 * 3600000);
    game.away = hit ? { ...hit.away, score: "" } : { name: game.awayName || away || "" };
    game.home = hit ? { ...hit.home, score: "" } : { name: game.homeName || home || "" };
  });
  weekMem = { at: Date.now(), games };
  return games;
}

async function teamLogos() {
  const logos = {};
  await Promise.all(LEAGUES.map(([sport, path]) => json(`${BASE}/${path}/teams`, 24 * 3600000).then((data) => (((((data.sports || [])[0] || {}).leagues || [])[0] || {}).teams || []).forEach(({ team = {} }) => { const logo = ((team.logos || [])[0] || {}).href; if (team.displayName && logo) logos[team.displayName] = logo; })).catch(() => null)));
  return logos;
}

module.exports = { liveBoard, liveWeek, teamLogos, json, boxOf };
