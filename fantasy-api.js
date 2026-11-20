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
const PROP_OK = /pass|rush|rec|receiv|yard|reception|anytime|touchdown|td\b|rushing \+|receiving \+|longest/i;
const PROP_SKIP = /under|quarter|qtr|half|each|most|1st|first|minutes|double|triple|team total|alt\b/i;

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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
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

function needOf(odds) {
  const o = Number(odds);
  if (!Number.isFinite(o) || !o) return null;
  const implied = o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
  return +(implied * 100).toFixed(1);
}

function oddsVolume(odds) {
  const o = Number(odds);
  if (!Number.isFinite(o) || !o) return 20;
  // Shorter prices → more expected volume/usage.
  if (o <= -200) return 40;
  if (o <= -150) return 34;
  if (o <= -110) return 28;
  if (o <= 100) return 22;
  if (o <= 150) return 14;
  return 8;
}

function scorePlayer(person, recs) {
  const bets = ((person && person.bets) || []).filter((bet) => {
    const blob = `${bet.market || ""} ${bet.label || ""}`;
    return /NFL/i.test(bet.sport || "NFL") && PROP_OK.test(blob) && !PROP_SKIP.test(blob);
  });
  const matched = (recs || []).filter((pick) => samePlayer(pick.who || pick.label, person && person.name));
  const bestRec = matched.slice().sort((a, b) => {
    const ea = Number(a.n) > 0 ? (a.hits / a.n) * 100 - parseFloat(a.need) : -99;
    const eb = Number(b.n) > 0 ? (b.hits / b.n) * 100 - parseFloat(b.need) : -99;
    return eb - ea;
  })[0];
  const bestBet = bets.slice().sort((a, b) => oddsVolume(a.odds) - oddsVolume(b.odds)).reverse()[0];

  let score = 18;
  const why = [];
  if (bestRec && Number(bestRec.n) > 0) {
    const edge = (bestRec.hits / bestRec.n) * 100 - parseFloat(bestRec.need || needOf(bestRec.odds) || 0);
    score = 45 + clamp(edge, -20, 35);
    why.push(`${bestRec.hits}/${bestRec.n} vs ${bestRec.need || needOf(bestRec.odds)}% on ${bestRec.label || "prop"}`);
    if (bestRec.role === "solid") { score += 10; why.push("solid role"); }
    else if (bestRec.role === "thin") { score -= 5; why.push("thin role"); }
    if (bestRec.cushion) { score += 10; why.push("cushion"); }
    if (bestRec.tier === "rec") { score += 15; why.push("on the rec board"); }
    else if (bestRec.tier === "good") { score += 8; why.push("clears the price"); }
  } else if (bestBet) {
    score = 30 + oddsVolume(bestBet.odds);
    why.push(`${bestBet.label} ${Number(bestBet.odds) > 0 ? `+${bestBet.odds}` : bestBet.odds}`);
  } else {
    why.push("No matching NFL prop this week");
  }

  score = Math.round(clamp(score, 0, 100));
  return {
    score,
    why: why.slice(0, 3),
    prop: bestRec
      ? { label: bestRec.label, odds: bestRec.odds, market: bestRec.market, match: bestRec.match, hits: bestRec.hits, n: bestRec.n, need: bestRec.need, tier: bestRec.tier || "", role: bestRec.role || "", cushion: !!bestRec.cushion }
      : bestBet
        ? { label: bestBet.label, odds: bestBet.odds, market: bestBet.market, match: bestBet.match }
        : null,
    props: bets.slice(0, 6).map((bet) => ({ label: bet.label, odds: bet.odds, market: bet.market, match: bet.match })),
  };
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
  let recs = [];
  try {
    const ranked = await require("./live-recs").recRanked(14);
    recs = ((ranked && ranked.ranked) || []).map((pick) => ({
      ...pick,
      who: pick.who || String(pick.label || "").split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim(),
    }));
  } catch (error) {
    try {
      recs = (await require("./live-recs").recsList()).map((pick) => ({
        ...pick,
        who: pick.who || String(pick.label || "").split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim(),
      }));
    } catch (err) {
      recs = [];
    }
  }

  const scored = (pack.roster.players || []).map((row) => {
    const person = people.find((p) => samePlayer(p.name, row.name)) || { name: row.name, bets: [] };
    const marked = scorePlayer({ ...person, name: row.name }, recs);
    const out = /out|ir|pup|suspended/i.test(`${row.status} ${row.injury}`);
    const score = out ? Math.min(marked.score, 12) : marked.score;
    if (out) marked.why = [`${row.injury || row.status || "Out"}`, ...marked.why].slice(0, 3);
    return { ...row, ...marked, score };
  });

  const lineup = fillLineup(scored, pack.league.slots || []);
  return {
    sport: pack.sport || "NFL",
    season: pack.season,
    week: pack.week,
    user: pack.user,
    league: pack.league,
    owner: pack.owner,
    note: pack.note,
    players: scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    start: lineup.start,
    sit: lineup.sit,
  };
}

module.exports = { sleeper, startSit, samePlayer, scorePlayer, fillLineup };
