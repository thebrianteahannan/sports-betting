/** Fantasy Start/Sit: Sleeper roster in, prop-desk score out. NFL only. Roster is not saved. */

const SLEEPER = "https://api.sleeper.app/v1";
const FAN_POS = new Set(["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"]);
const BENCH = new Set(["BN", "IR", "TAXI", "RESERVE"]);
const FLEX = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
};
const { projectPlayer, suggestSwaps } = require("./fantasy-score");

let playerMap = null;
let playerAt = 0;
const rosterCache = new Map();

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((part) => part && !["jr", "sr", "ii", "iii", "iv"].includes(part));
}

function samePlayer(a, b) {
  const left = words(a);
  const right = words(b);
  return Boolean(left.length && right.length && left[left.length - 1] === right[right.length - 1] && left[0][0] === right[0][0]);
}

async function sleeperGet(path) {
  const res = await fetch(`${SLEEPER}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "ParlayOfTheDay/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sleeper ${res.status}`);
  return res.json();
}

async function nflState() {
  return (await sleeperGet("/state/nfl")) || {};
}

async function loadPlayers() {
  if (playerMap && Date.now() - playerAt < 24 * 3600000) return playerMap;
  const raw = await sleeperGet("/players/nfl");
  if (!raw || typeof raw !== "object") throw new Error("Could not load Sleeper players.");
  playerMap = raw;
  playerAt = Date.now();
  return playerMap;
}

function playerRow(id, map) {
  if (!id || id === "0") return null;
  if (/^[A-Z]{2,3}$/.test(id)) {
    return { id, name: id, pos: "DEF", team: id, status: "", injury: "", fantasy: ["DEF"] };
  }
  const row = map[id];
  if (!row) return { id, name: id, pos: "", team: "", status: "", injury: "", fantasy: [] };
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || String(row.full_name || id);
  const fantasy = Array.isArray(row.fantasy_positions) ? row.fantasy_positions.filter((p) => FAN_POS.has(p)) : [];
  return {
    id: String(id),
    name,
    pos: String(row.position || fantasy[0] || ""),
    team: String(row.team || ""),
    status: String(row.status || ""),
    injury: String(row.injury_status || ""),
    fantasy: fantasy.length ? fantasy : (row.position ? [row.position] : []),
  };
}

function starterSlots(positions) {
  return (positions || []).filter((slot) => !BENCH.has(String(slot || "").toUpperCase()));
}

function slotEligible(slot, fantasy) {
  const key = String(slot || "").toUpperCase();
  const have = (fantasy || []).map((p) => String(p).toUpperCase());
  if (FLEX[key]) return FLEX[key].some((p) => have.includes(p));
  if (FAN_POS.has(key)) return have.includes(key);
  return have.includes(key);
}

function fillLineup(players, slots) {
  const left = players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const start = [];
  const used = new Set();
  slots.forEach((slot) => {
    const pick = left.find((row) => !used.has(row.id) && slotEligible(slot, row.fantasy));
    if (!pick) {
      start.push({ slot, empty: true });
      return;
    }
    used.add(pick.id);
    start.push({ slot, ...pick, start: true });
  });
  const sit = left.filter((row) => !used.has(row.id)).map((row) => ({ ...row, start: false }));
  return { start, sit };
}

async function resolveUser(username) {
  const name = String(username || "").trim().replace(/^@/, "");
  if (!name) throw new Error("Enter a Sleeper username.");
  const user = await sleeperGet(`/user/${encodeURIComponent(name)}`);
  if (!user || !user.user_id) throw new Error("No Sleeper user with that name.");
  return { user_id: String(user.user_id), username: String(user.username || user.display_name || name), display_name: String(user.display_name || user.username || name) };
}

async function leaguesFor(userId, season) {
  const rows = await sleeperGet(`/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`);
  return (rows || []).map((row) => ({
    league_id: String(row.league_id),
    name: String(row.name || "League"),
    status: String(row.status || ""),
    season: String(row.season || season),
    total_rosters: Number(row.total_rosters) || 0,
  }));
}

async function packRoster(leagueId, ownerId) {
  const key = `${leagueId}:${ownerId}`;
  const hit = rosterCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.data;

  const [league, users, rosters, map] = await Promise.all([
    sleeperGet(`/league/${encodeURIComponent(leagueId)}`),
    sleeperGet(`/league/${encodeURIComponent(leagueId)}/users`),
    sleeperGet(`/league/${encodeURIComponent(leagueId)}/rosters`),
    loadPlayers(),
  ]);
  if (!league) throw new Error("League not found.");
  const roster = (rosters || []).find((row) => String(row.owner_id) === String(ownerId));
  if (!roster) throw new Error("That user is not on this league roster.");
  const owner = (users || []).find((row) => String(row.user_id) === String(ownerId));
  const slots = starterSlots(league.roster_positions);
  const ids = [...new Set([...(roster.players || []), ...(roster.starters || []), ...(roster.reserve || [])].filter(Boolean))];
  const players = ids.map((id) => playerRow(id, map)).filter(Boolean);
  const data = {
    league: {
      league_id: String(league.league_id),
      name: String(league.name || "League"),
      season: String(league.season || ""),
      status: String(league.status || ""),
      roster_positions: league.roster_positions || [],
      scoring_settings: league.scoring_settings || {},
      slots,
    },
    owner: {
      user_id: String(ownerId),
      display_name: String((owner && (owner.display_name || owner.username)) || ownerId),
      team_name: String((owner && owner.metadata && owner.metadata.team_name) || ""),
    },
    roster: {
      roster_id: roster.roster_id,
      starters: (roster.starters || []).filter(Boolean).map(String),
      reserve: (roster.reserve || []).filter(Boolean).map(String),
      players,
    },
    note: "Roster is not saved. Pull again anytime.",
  };
  rosterCache.set(key, { at: Date.now(), data });
  return data;
}

async function sleeper(query) {
  const state = await nflState();
  const season = String(query.season || state.league_season || state.season || new Date().getFullYear());
  const week = Number(state.display_week || state.week) || null;
  const user = await resolveUser(query.user || query.username);
  const leagues = await leaguesFor(user.user_id, season);
  if (!query.league && !query.leagueId) {
    return { sport: "NFL", season, week, user, leagues, note: "Roster is not saved." };
  }
  const leagueId = String(query.league || query.leagueId || "");
  if (!leagues.some((row) => row.league_id === leagueId) && !query.ownerId) {
    // Still allow direct league id if they pasted one and own a roster there.
  }
  const packed = await packRoster(leagueId, query.ownerId || user.user_id);
  return { sport: "NFL", season, week, user, leagues, ...packed };
}

async function startSit(body, board) {
  const query = {
    user: body.user || body.username,
    league: body.league || body.leagueId,
    ownerId: body.ownerId,
    season: body.season,
  };
  const pack = await sleeper(query);
  const peopleBook = await require("./choose-api").chooseBet({ list: "lookup", when: "week" }, board).catch(() => ({ people: [] }));
  const people = ((peopleBook && peopleBook.people) || []).filter((person) => person.kind === "player");
  const scoring = (pack.league && pack.league.scoring_settings) || {};

  const scored = (pack.roster.players || []).map((row) => {
    const person = people.find((p) => samePlayer(p.name, row.name)) || { name: row.name, bets: [] };
    const marked = projectPlayer({ ...person, name: row.name }, scoring, row.pos || (row.fantasy || [])[0]);
    const out = /out|ir|pup|suspended/i.test(`${row.status} ${row.injury}`);
    let score = marked.score;
    if (out) {
      score = Math.min(score, 1.5);
      marked.why = [`${row.injury || row.status || "Out"} — projection cut`, ...marked.why].slice(0, 6);
    }
    return { ...row, ...marked, score };
  });

  const lineup = fillLineup(scored, pack.league.slots || []);
  const swaps = suggestSwaps(lineup.start, pack.roster.starters || [], scored);
  return {
    sport: pack.sport || "NFL",
    season: pack.season,
    week: pack.week,
    user: pack.user,
    league: pack.league,
    owner: pack.owner,
    note: pack.note,
    method: "Projected fantasy points from Vegas lines using your Sleeper scoring settings.",
    players: scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    start: lineup.start,
    sit: lineup.sit,
    swaps,
  };
}

module.exports = { sleeper, startSit, samePlayer, fillLineup };
