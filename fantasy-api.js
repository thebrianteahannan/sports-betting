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
const { projectPlayer, suggestSwaps, statKit, rate, statAmount, returnKeys } = require("./fantasy-score");

let playerMap = null;
let playerAt = 0;
const rosterCache = new Map();
const takenCache = new Map();
let weekCache = { week: 0, at: 0, data: null };
let projCache = { key: "", at: 0, data: null };
let statsCache = { key: "", at: 0, data: null };
let ownCache = { key: "", at: 0, data: null };

const TEAM_NORM = {
  WAS: "WSH", WSH: "WSH", JAC: "JAX", JAX: "JAX", LAR: "LAR", LA: "LAR",
  STL: "LAR", SD: "LAC", LAC: "LAC", OAK: "LV", LV: "LV", ARZ: "ARI",
};

const DST_NAME = {
  ARI: "Cardinals D/ST", ATL: "Falcons D/ST", BAL: "Ravens D/ST", BUF: "Bills D/ST",
  CAR: "Panthers D/ST", CHI: "Bears D/ST", CIN: "Bengals D/ST", CLE: "Browns D/ST",
  DAL: "Cowboys D/ST", DEN: "Broncos D/ST", DET: "Lions D/ST", GB: "Packers D/ST",
  HOU: "Texans D/ST", IND: "Colts D/ST", JAX: "Jaguars D/ST", KC: "Chiefs D/ST",
  LAC: "Chargers D/ST", LAR: "Rams D/ST", LV: "Raiders D/ST", MIA: "Dolphins D/ST",
  MIN: "Vikings D/ST", NE: "Patriots D/ST", NO: "Saints D/ST", NYG: "Giants D/ST",
  NYJ: "Jets D/ST", PHI: "Eagles D/ST", PIT: "Steelers D/ST", SEA: "Seahawks D/ST",
  SF: "49ers D/ST", TB: "Buccaneers D/ST", TEN: "Titans D/ST", WSH: "Commanders D/ST",
};

function teamKey(team) {
  const raw = String(team || "").toUpperCase();
  return TEAM_NORM[raw] || raw;
}

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
  if (!left.length || !right.length) return false;
  // Exact token match (Jr/Sr already stripped by words()).
  if (left.join(" ") === right.join(" ")) return true;
  // Full first + last — not just an initial. Stops "Josh Allen" → "Jonathan Allen"
  // and rejects extra middles like "Josh Hines Allen".
  if (left.length !== right.length) return false;
  return left[0] === right[0] && left[left.length - 1] === right[right.length - 1];
}

function findPerson(people, name) {
  const want = words(name).join(" ");
  if (!want) return null;
  const rows = people || [];
  const exact = rows.find((p) => words(p.name).join(" ") === want);
  if (exact) return exact;
  return rows.find((p) => samePlayer(p.name, name)) || null;
}

async function sleeperGet(path, opts = {}) {
  const bust = opts.fresh ? `${path.includes("?") ? "&" : "?"}t=${Date.now()}` : "";
  const res = await fetch(`${SLEEPER}${path}${bust}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ParlayOfTheDay/1.0",
      ...(opts.fresh ? { "Cache-Control": "no-cache", Pragma: "no-cache" } : {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sleeper ${res.status}`);
  return res.json();
}

async function nflState() {
  return (await sleeperGet("/state/nfl")) || {};
}

function fantasyWeek(state) {
  const coming = Number(state && (state.leg || state.week));
  const shown = Number(state && state.display_week);
  // Sleeper leaves display_week on the week that just ended until waivers run.
  if (Number.isFinite(coming) && Number.isFinite(shown) && coming === shown + 1) return coming;
  return Number(shown || coming) || null;
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

function sleeperPts(proj, scoring) {
  if (!proj || typeof proj !== "object") return null;
  let total = 0;
  let used = false;
  Object.entries(scoring || {}).forEach(([key, rateVal]) => {
    if (/^pts_|^adp_|^pos_adp|^gp$/i.test(key)) return;
    const n = statAmount(proj, key);
    const r = Number(rateVal);
    if (!Number.isFinite(n) || !Number.isFinite(r) || !r) return;
    total += n * r;
    used = true;
  });
  if (used) return +total.toFixed(1);
  const fallback = Number(proj.pts_ppr ?? proj.pts_half_ppr ?? proj.pts_std);
  return Number.isFinite(fallback) ? +fallback.toFixed(1) : null;
}

function returnLabel(key) {
  if (/kr_td|def_kr_td/.test(key)) return ["KRTD", "Kick return TDs"];
  if (/pr_td|def_pr_td/.test(key)) return ["PRTD", "Punt return TDs"];
  if (/pr_yd|def_pr_yd/.test(key)) return ["PR", "Punt return yards"];
  return ["KR", "Kick return yards"];
}

function foldReturnStats(stats, proj, scoring) {
  const keys = returnKeys(scoring);
  if (!keys.length || !proj) return { stats, returnPts: 0, why: [] };
  const rows = [...(stats || [])];
  const why = [];
  let returnPts = 0;
  const seen = new Set();
  keys.forEach((key) => {
    const amount = statAmount(proj, key);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const pts = amount * rate(scoring, key, 0);
    if (!Number.isFinite(pts) || Math.abs(pts) < 0.05) return;
    const [short, label] = returnLabel(key);
    // League may score both kr_yd and def_kr_yd — only count once.
    const stamp = `${short}:${Math.round(amount * 10)}`;
    if (seen.has(stamp)) return;
    seen.add(stamp);
    returnPts += pts;
    const idx = rows.findIndex((row) => row && (row.key === key || row.short === short));
    const next = {
      key,
      short,
      label,
      amount: +amount.toFixed(2),
      pts: +pts.toFixed(2),
      odds: null,
      have: true,
      from: "sleeper",
    };
    if (idx >= 0) rows[idx] = { ...rows[idx], ...next };
    else rows.push(next);
    why.push(`${label} ~${amount.toFixed(1)} → ${pts.toFixed(1)} fantasy pts`);
  });
  return { stats: rows, returnPts: +returnPts.toFixed(1), why };
}

async function loadProjections(season, week) {
  const key = `${season}:${week}`;
  if (projCache.data && projCache.key === key && Date.now() - projCache.at < 30 * 60000) return projCache.data;
  const path = `/projections/nfl/regular/${encodeURIComponent(season)}/${encodeURIComponent(week)}`;
  const raw = await sleeperGet(path);
  const data = raw && typeof raw === "object" ? raw : {};
  projCache = { key, at: Date.now(), data };
  return data;
}

async function loadWeekStats(season, week) {
  const key = `${season}:${week}`;
  if (statsCache.data && statsCache.key === key && Date.now() - statsCache.at < 5 * 60000) return statsCache.data;
  const path = `/stats/nfl/regular/${encodeURIComponent(season)}/${encodeURIComponent(week)}`;
  const raw = await sleeperGet(path);
  const data = raw && typeof raw === "object" ? raw : {};
  statsCache = { key, at: Date.now(), data };
  return data;
}

function hasPlayed(stat) {
  if (!stat || typeof stat !== "object") return false;
  if (Number(stat.gp) > 0 || Number(stat.gms_active) > 0) return true;
  return ["pass_yd", "pass_td", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td", "fgm", "xpm", "sack", "int", "fum_rec", "def_td"]
    .some((key) => Number(stat[key]) > 0);
}

function statsFromActual(stat, pos, scoring) {
  if (!stat) return null;
  const kit = statKit(pos, scoring);
  if (!kit.length) return null;
  const rows = kit.map(([key, short, label]) => {
    const amount = statAmount(stat, key);
    const have = Number.isFinite(amount);
    const pts = have ? amount * rate(scoring, key, key.endsWith("_td") ? 6 : key === "rec" ? 1 : key.includes("yd") ? 0.1 : 0) : null;
    return {
      key,
      short,
      label,
      amount: have ? +amount.toFixed(2) : null,
      pts: pts == null ? null : +Number(pts).toFixed(2),
      odds: null,
      have,
    };
  });
  return rows.some((row) => row.have) ? rows : null;
}

function kickLabel(ms) {
  if (!Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(ms));
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
  const day = get("weekday");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").replace(/\./g, "").toLowerCase().replace(/m$/, "");
  if (!day || !hour) return "";
  const time = minute === "00" ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`;
  return `${day} ${time}`;
}

async function loadNflWeek(week) {
  const w = Number(week) || 0;
  if (weekCache.data && weekCache.week === w && Date.now() - weekCache.at < 10 * 60000) return weekCache.data;
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${encodeURIComponent(w || "")}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`NFL week ${res.status}`);
  const data = await res.json();
  const playing = new Set();
  const kick = new Map();
  const matchup = new Map();
  const lockedTeams = new Set();
  const now = Date.now();
  (data.events || []).forEach((ev) => {
    const comp = (ev.competitions || [])[0] || {};
    const when = Date.parse(comp.date || ev.date || "");
    const state = String((comp.status && comp.status.type && (comp.status.type.name || comp.status.type.state)) || "").toLowerCase();
    const started = (Number.isFinite(when) && when <= now) || /in|live|halftime|end|final|status_in_progress|status_halftime|status_final/.test(state);
    const sides = (comp.competitors || []).map((side) => ({
      ab: teamKey((side.team || {}).abbreviation),
      home: String(side.homeAway || "").toLowerCase() === "home",
    })).filter((side) => side.ab);
    sides.forEach((side) => {
      playing.add(side.ab);
      if (Number.isFinite(when)) kick.set(side.ab, when);
      if (started) lockedTeams.add(side.ab);
      const opp = sides.find((other) => other.ab !== side.ab);
      if (!opp) return;
      const label = kickLabel(when);
      matchup.set(side.ab, {
        opp: opp.ab,
        home: side.home,
        kick: Number.isFinite(when) ? when : null,
        text: `${side.home ? "vs" : "@"} ${opp.ab}${label ? ` · ${label}` : ""}`,
      });
    });
  });
  // NFL has 32 teams; anything not on this week's board is on bye.
  const all = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WSH"];
  const bye = new Set(all.filter((team) => !playing.has(team)));
  const pack = { week: w, playing, kick, matchup, lockedTeams, bye };
  weekCache = { week: w, at: Date.now(), data: pack };
  return pack;
}

async function loadOwnership(season, week) {
  const key = `${season}:${week}`;
  if (ownCache.data && ownCache.key === key && Date.now() - ownCache.at < 30 * 60000) return ownCache.data;
  const filter = JSON.stringify({
    players: {
      filterStatsForCurrentSeasonScoringPeriodId: { value: [Number(week) || 0] },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit: 1000,
    },
  });
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${encodeURIComponent(season)}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=${encodeURIComponent(week || "")}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      "X-Fantasy-Filter": filter,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ESPN ownership ${res.status}`);
  const data = await res.json();
  const byName = new Map();
  (data.players || []).forEach((row) => {
    const player = row.player || {};
    const name = String(player.fullName || "").trim();
    if (!name) return;
    const own = player.ownership || {};
    const pack = {
      ownPct: Number.isFinite(Number(own.percentOwned)) ? +Number(own.percentOwned).toFixed(1) : null,
      startPct: Number.isFinite(Number(own.percentStarted)) ? +Number(own.percentStarted).toFixed(1) : null,
      injury: String(player.injuryStatus || ""),
    };
    byName.set(words(name).join(" "), pack);
    byName.set(name.toLowerCase(), pack);
  });
  ownCache = { key, at: Date.now(), data: byName };
  return byName;
}

function ownershipFor(row, byName) {
  if (!byName || !byName.size) return { ownPct: null, startPct: null };
  const team = teamKey(row.team);
  if ((row.pos === "DEF" || (row.fantasy || []).includes("DEF")) && team && DST_NAME[team]) {
    const dst = byName.get(words(DST_NAME[team]).join(" ")) || byName.get(DST_NAME[team].toLowerCase());
    if (dst) return dst;
  }
  const want = words(row.name).join(" ");
  if (byName.has(want)) return byName.get(want);
  const hit = [...byName.entries()].find(([key]) => samePlayer(key, row.name));
  return hit ? hit[1] : { ownPct: null, startPct: null };
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

function markStatus(row, reserveIds, weekInfo) {
  const injury = String(row.injury || "");
  const status = String(row.status || "");
  const blob = `${injury} ${status}`;
  const onReserve = (reserveIds || []).includes(String(row.id));
  const ir = onReserve || /\bir\b|injured reserve|pup|nfi/i.test(blob);
  const questionable = !ir && /^questionable$/i.test(injury.trim());
  const out = !ir && !questionable && (
    /^(out|doubtful)$/i.test(injury.trim())
    || (/\bout\b|\bdoubtful\b|suspended/i.test(blob) && !/questionable|probable/i.test(injury))
  );
  const team = teamKey(row.team);
  const bye = !!(team && weekInfo && weekInfo.bye && weekInfo.bye.has(team));
  const locked = !!(team && weekInfo && weekInfo.lockedTeams && weekInfo.lockedTeams.has(team));
  const game = team && weekInfo && weekInfo.matchup ? weekInfo.matchup.get(team) : null;
  return {
    ...row,
    ir: !!ir,
    out: !!out,
    questionable: !!questionable,
    bye: !!bye,
    gameLocked: !!locked,
    opp: game ? game.opp : "",
    kick: game && game.kick != null ? game.kick : null,
    matchup: bye ? "Bye" : (game ? game.text : ""),
  };
}

function fillLineup(players, slots, opts = {}) {
  const byId = new Map((players || []).map((row) => [row.id, row]));
  const current = (opts.currentStarters || []).map(String);
  // "all" = mirror Sleeper. "locked" = hold locked starters only, then optimize. "none" = pure optimize.
  const keep = opts.keep || (opts.keepCurrent === false ? "none" : opts.keepCurrent === "locked" ? "locked" : "all");
  const allowBye = opts.allowBye !== false;
  const used = new Set();
  const start = slots.map((slot, i) => {
    if (keep === "none") return null;
    const id = current[i];
    if (!id || id === "0") return null;
    const row = byId.get(id);
    if (!row) return null;
    const locked = !!(row.gameLocked && !row.ir);
    if (keep === "locked" && !locked) return null;
    used.add(row.id);
    return { slot, ...row, start: true, locked };
  });

  const rank = (row) => (Number.isFinite(Number(row.rankScore)) ? Number(row.rankScore) : Number(row.score) || 0);
  // Locked bench stays on the bench — kickoff already passed, they cannot enter a slot.
  const pool = (players || [])
    .filter((row) => !used.has(row.id) && !row.ir && !row.out && !row.taxi && !row.gameLocked && (allowBye || !row.bye))
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
  const open = allowBye
    ? pool.filter((row) => !row.bye).concat(pool.filter((row) => row.bye))
    : pool;

  start.forEach((held, i) => {
    if (held) return;
    const slot = slots[i];
    // Mirror mode: leave Sleeper empties empty. Do not pull bench into the lineup.
    if (keep === "all") {
      start[i] = { slot, empty: true };
      return;
    }
    const pick = open.find((row) => !used.has(row.id) && slotEligible(slot, row.fantasy));
    if (!pick) {
      start[i] = { slot, empty: true };
      return;
    }
    used.add(pick.id);
    start[i] = { slot, ...pick, start: true, locked: false };
  });

  const rest = (players || []).filter((row) => !used.has(row.id));
  const taxi = rest.filter((row) => row.taxi).sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({ ...row, start: false }));
  const active = rest.filter((row) => !row.taxi);
  const sit = active.filter((row) => !row.out && !row.ir).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((row) => ({ ...row, start: false }));
  const out = active.filter((row) => row.out && !row.ir).sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({ ...row, start: false }));
  const ir = active.filter((row) => row.ir).sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({ ...row, start: false }));
  return { start, sit, out, taxi, ir };
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

async function packRoster(leagueId, ownerId, opts = {}) {
  const key = `${leagueId}:${ownerId}`;
  const hit = rosterCache.get(key);
  // League sweep can reuse a roster for a few seconds. A lineup view always asks again.
  if (!opts.fresh && hit && Date.now() - hit.at < 20 * 1000) return hit.data;

  const [league, users, rosters, map] = await Promise.all([
    sleeperGet(`/league/${encodeURIComponent(leagueId)}`),
    sleeperGet(`/league/${encodeURIComponent(leagueId)}/users`),
    sleeperGet(`/league/${encodeURIComponent(leagueId)}/rosters`, { fresh: !!opts.fresh }),
    loadPlayers(),
  ]);
  if (!league) throw new Error("League not found.");
  const roster = (rosters || []).find((row) => String(row.owner_id) === String(ownerId));
  if (!roster) throw new Error("That user is not on this league roster.");
  const owner = (users || []).find((row) => String(row.user_id) === String(ownerId));
  const slots = starterSlots(league.roster_positions);
  const ids = [...new Set([...(roster.players || []), ...(roster.starters || []), ...(roster.reserve || []), ...(roster.taxi || [])].filter(Boolean))];
  const players = ids.map((id) => playerRow(id, map)).filter(Boolean);
  const taken = new Set();
  (rosters || []).forEach((row) => {
    [...(row.players || []), ...(row.reserve || []), ...(row.starters || []), ...(row.taxi || [])].forEach((id) => {
      if (id && id !== "0") taken.add(String(id));
    });
  });
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
      taxi: (roster.taxi || []).filter(Boolean).map(String),
      players,
      taken: [...taken],
    },
    note: "Roster is not saved. Pull again anytime.",
  };
  rosterCache.set(key, { at: Date.now(), data });
  return data;
}

async function sleeper(query) {
  const state = await nflState();
  const season = String(query.season || state.league_season || state.season || new Date().getFullYear());
  const week = fantasyWeek(state) || null;
  const user = await resolveUser(query.user || query.username);
  const leagues = await leaguesFor(user.user_id, season);
  if (!query.league && !query.leagueId) {
    return { sport: "NFL", season, week, user, leagues, note: "Roster is not saved." };
  }
  const leagueId = String(query.league || query.leagueId || "");
  if (!leagues.some((row) => row.league_id === leagueId) && !query.ownerId) {
    // Still allow direct league id if they pasted one and own a roster there.
  }
  const packed = await packRoster(leagueId, query.ownerId || user.user_id, { fresh: !!query.fresh });
  return { sport: "NFL", season, week, user, leagues, ...packed };
}

function clearCaches() {
  rosterCache.clear();
  takenCache.clear();
  weekCache = { week: 0, at: 0, data: null };
  projCache = { key: "", at: 0, data: null };
  statsCache = { key: "", at: 0, data: null };
  ownCache = { key: "", at: 0, data: null };
}

function benchCanFill(slot, holder, scored, startIds) {
  return (scored || []).some((row) => {
    if (!row || !row.id || startIds.has(String(row.id))) return false;
    if (holder && String(row.id) === String(holder.id)) return false;
    if (row.ir || row.out || row.bye || row.taxi || row.gameLocked) return false;
    return slotEligible(slot, row.fantasy);
  });
}

function pickupHoles(lineupStart, slots, scored) {
  const startIds = new Set((lineupStart || []).filter((row) => row && row.id && !row.empty).map((row) => String(row.id)));
  const holes = [];
  const seen = new Set();
  (slots || []).forEach((slot, i) => {
    const row = (lineupStart || [])[i];
    const empty = !row || row.empty;
    const dead = row && !row.empty && (row.bye || (row.out && !row.gameLocked));
    if (!empty && !dead) return;
    if (benchCanFill(slot, dead ? row : null, scored, startIds)) return;
    if (seen.has(slot)) return;
    seen.add(slot);
    const who = dead ? row.name : "";
    const why = empty
      ? `Your ${slot} slot is empty and nobody on your bench can fill it.`
      : `${who} is ${row.bye ? "on bye" : "out"} at ${slot}, and nobody on your bench can fill it.`;
    holes.push({ slot, why, holding: who || null });
  });
  return holes;
}

function pickupOptions(slot, map, taken, scoring, projections, weekInfo, limit = 8) {
  const takenSet = taken instanceof Set ? taken : new Set(taken || []);
  const bye = (weekInfo && weekInfo.bye) || new Set();
  const rows = [];
  Object.keys(projections || {}).forEach((id) => {
    if (takenSet.has(String(id))) return;
    const base = playerRow(id, map);
    if (!base || !slotEligible(slot, base.fantasy)) return;
    const team = teamKey(base.team);
    if (team && bye.has(team)) return;
    if (base.injury && /^(out|ir|pup|suspended)$/i.test(String(base.injury).trim())) return;
    const pts = sleeperPts(projections[id], scoring);
    if (pts == null || pts < 0.5) return;
    rows.push({
      id: base.id,
      name: base.name,
      pos: base.pos || (base.fantasy || [])[0] || "",
      team: base.team || "",
      sleeperPts: pts,
    });
  });
  return rows.sort((a, b) => b.sleeperPts - a.sleeperPts || a.name.localeCompare(b.name)).slice(0, limit);
}

async function loadLineupContext(season, week, board) {
  const weekInfo = await loadNflWeek(week).catch(() => ({ bye: new Set(), lockedTeams: new Set(), playing: new Set(), matchup: new Map() }));
  const [projections, weekStats, ownership, peopleBook, map] = await Promise.all([
    loadProjections(season, week).catch(() => ({})),
    loadWeekStats(season, week).catch(() => ({})),
    loadOwnership(season, week).catch(() => new Map()),
    require("./choose-api").chooseBet({ list: "lookup", when: "open", sports: ["NFL"] }, board).catch(() => ({ people: [] })),
    loadPlayers().catch(() => ({})),
  ]);
  const people = ((peopleBook && peopleBook.people) || []).filter((person) => person.kind === "player");
  return { weekInfo, projections, weekStats, ownership, people, map };
}

function tagLabel(word, count) {
  return count > 1 ? `${word} ${count}` : word;
}

function actionTags(result) {
  const tags = [];
  const sitCount = (result.start || []).filter((row) => row && row.id && !row.empty && row.shouldStart === false && !(row.locked || row.gameLocked)).length;
  const startCount = (result.sit || []).filter((row) => row && row.id && row.shouldStart === true).length;
  const pickupCount = (result.pickups || []).length;
  if (startCount) tags.push({ id: "start", label: tagLabel("Start", startCount) });
  if (sitCount) tags.push({ id: "sit", label: tagLabel("Sit", sitCount) });
  if (pickupCount) tags.push({ id: "pickup", label: tagLabel("Pickup", pickupCount) });
  return tags;
}

function buildLineup(pack, ctx) {
  const weekInfo = ctx.weekInfo;
  const projections = ctx.projections || {};
  const weekStats = ctx.weekStats || {};
  const ownership = ctx.ownership || new Map();
  const people = ctx.people || [];
  const scoring = (pack.league && pack.league.scoring_settings) || {};
  const reserveIds = ((pack.roster && pack.roster.reserve) || []).map(String);
  const taxiIds = new Set(((pack.roster && pack.roster.taxi) || []).map(String));

  const scored = ((pack.roster && pack.roster.players) || []).map((row) => {
    const person = findPerson(people, row.name) || { name: row.name, bets: [] };
    const pos = row.pos || (row.fantasy || [])[0];
    const marked = projectPlayer({ ...person, name: row.name }, scoring, pos);
    const status = markStatus({ ...row, taxi: taxiIds.has(String(row.id)) }, reserveIds, weekInfo);
    const owned = ownershipFor(row, ownership);
    const teamId = teamKey(row.team);
    const proj = projections[row.id] || projections[teamId] || null;
    const played = weekStats[row.id] || weekStats[String(row.id)] || weekStats[teamId] || null;
    let sleeperScore = sleeperPts(proj, scoring);
    let livePts = hasPlayed(played) ? sleeperPts(played, scoring) : null;
    let score = marked.score;
    let stats = marked.stats;
    const why = [...(marked.why || [])];
    // Vegas does not price return yards. Fold Sleeper KR/PR into the card when the league scores them.
    let returnPts = 0;
    if (livePts == null && !status.bye && !status.ir) {
      const folded = foldReturnStats(stats, proj, scoring);
      stats = folded.stats;
      returnPts = folded.returnPts;
      if (returnPts) {
        score = +(score + returnPts).toFixed(1);
        why.push(...folded.why);
      }
    }
    // Locked / already in the box score: show real fantasy points, not a cut projection.
    if (livePts != null) {
      const liveStats = statsFromActual(played, pos, scoring);
      if (liveStats) stats = liveStats;
      why.unshift(`Live: ${livePts} fantasy pts`);
    } else if (status.bye) {
      score = 0;
      sleeperScore = sleeperScore == null ? null : 0;
      livePts = null;
      why.unshift("Bye week");
    } else if (status.ir) {
      score = 0;
      sleeperScore = sleeperScore == null ? null : 0;
      why.unshift(`${row.injury || "IR"} — no play`);
    } else if (status.out) {
      score = Math.min(score, 1.5);
      if (sleeperScore != null) sleeperScore = Math.min(sleeperScore, 1.5);
      why.unshift(`${row.injury || row.status || "Out"} — projection cut`);
    }
    const vegasReady = (stats || []).some((stat) => stat && stat.have && stat.from !== "sleeper");
    // Thin Vegas (no props) was ranking studs like Moore near 0 and sitting them. Use Sleeper then.
    let rankScore = score;
    if (status.bye || status.ir) rankScore = 0;
    else if (livePts != null) rankScore = livePts;
    else if (!vegasReady && sleeperScore != null) rankScore = sleeperScore;
    else if (vegasReady && sleeperScore != null && score < sleeperScore * 0.35 && sleeperScore >= 6) rankScore = sleeperScore;
    else if (returnPts && sleeperScore != null && sleeperScore > score) rankScore = sleeperScore;
    return {
      ...row,
      ...marked,
      ...status,
      stats,
      score,
      rankScore,
      sleeperPts: sleeperScore,
      livePts,
      ownPct: owned.ownPct,
      startPct: owned.startPct,
      why: why.slice(0, 6),
    };
  });

  const slots = pack.league.slots || [];
  const currentIds = pack.roster.starters || [];
  // Columns never move: exact Sleeper lineup + bench.
  const lineup = fillLineup(scored, slots, { currentStarters: currentIds, keep: "all" });
  // Recommendation keeps locked starters put, then fills the rest (no bye starts).
  const optimal = fillLineup(scored, slots, { currentStarters: currentIds, keep: "locked", allowBye: false });
  const swaps = suggestSwaps(optimal.start, currentIds, scored);
  const recommendIds = new Set(
    (optimal.start || [])
      .filter((row) => row && row.id && !row.empty && !row.bye)
      .map((row) => String(row.id))
  );
  const currentStartSet = new Set((currentIds || []).filter((id) => id && id !== "0").map(String));
  const markRec = (row) => {
    if (!row || !row.id) return row;
    let shouldStart = recommendIds.has(String(row.id));
    if (row.bye || row.ir || row.taxi) shouldStart = false;
    if (row.out && !(row.locked || row.gameLocked)) shouldStart = false;
    // Already locked on the bench — cannot start them now.
    if (row.gameLocked && !currentStartSet.has(String(row.id))) shouldStart = false;
    return { ...row, shouldStart };
  };
  const holes = pickupHoles(lineup.start, slots, scored);
  const map = ctx.map || {};
  const taken = new Set((pack.roster && pack.roster.taken) || []);
  const pickups = holes.map((hole) => ({
    slot: hole.slot,
    why: hole.why,
    holding: hole.holding,
    options: pickupOptions(hole.slot, map, taken, scoring, projections, weekInfo, 8),
  })).filter((row) => row.options.length || row.why);
  return {
    players: scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    start: (lineup.start || []).map(markRec),
    sit: (lineup.sit || []).map(markRec),
    out: (lineup.out || []).map(markRec),
    taxi: (lineup.taxi || []).map(markRec),
    ir: (lineup.ir || []).map(markRec),
    swaps,
    pickups,
  };
}

async function startSit(body, board) {
  const pack = await sleeper({
    user: body.user || body.username,
    league: body.league || body.leagueId,
    ownerId: body.ownerId,
    season: body.season,
    fresh: true,
  });
  const received = new Date().toISOString();
  const lineup = buildLineup(pack, await loadLineupContext(pack.season, pack.week, board));
  return {
    sport: pack.sport || "NFL",
    season: pack.season,
    week: pack.week,
    user: pack.user,
    league: pack.league,
    owner: pack.owner,
    note: pack.note,
    received,
    method: "Your Sleeper lineup stays put. Red Sit / green Start tags tell you what to change.",
    ...lineup,
  };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function leagueCheck(body, board) {
  if (body && (body.refresh || body.reload)) clearCaches();
  const state = await nflState();
  const season = String((body && body.season) || state.league_season || state.season || new Date().getFullYear());
  const week = fantasyWeek(state) || null;
  const user = await resolveUser((body && (body.user || body.username)) || "");
  const leagues = await leaguesFor(user.user_id, season);
  const live = leagues.some((row) => row.status === "in_season");
  const ctx = live ? await loadLineupContext(season, week, board) : null;
  const rows = await mapPool(leagues, 3, async (league) => {
    if (league.status !== "in_season") {
      return { league_id: league.league_id, name: league.name, ok: true, skip: true, tags: [], status: league.status };
    }
    try {
      const pack = await packRoster(league.league_id, user.user_id);
      const tags = actionTags(buildLineup(pack, ctx));
      return { league_id: league.league_id, name: league.name, ok: tags.length === 0, tags, status: league.status };
    } catch (error) {
      return {
        league_id: league.league_id,
        name: league.name,
        ok: false,
        tags: [{ id: "miss", label: "Check failed" }],
        error: String((error && error.message) || error),
        status: league.status,
      };
    }
  });
  return { user, season, week, leagues: rows };
}

function teamName(user) {
  const named = user && user.metadata && String(user.metadata.team_name || "").trim();
  return named || (user && user.display_name) || "Opponent";
}

function erf(x) {
  const sign = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

function winPct(mine, opp) {
  if (!Number.isFinite(mine) || !Number.isFinite(opp)) return null;
  const z = (mine - opp) / 18;
  const p = 0.5 * (1 + erf(z / Math.SQRT2));
  return Math.round(Math.min(99, Math.max(1, p * 100)));
}

function sideScore(matchup, scoring, projections, stats) {
  const starters = (matchup && matchup.starters) || [];
  const got = (matchup && matchup.starters_points) || [];
  let now = Number(matchup && matchup.points);
  if (!Number.isFinite(now)) now = got.reduce((sum, n) => sum + (Number(n) || 0), 0);
  let proj = 0;
  let used = false;
  starters.forEach((id, i) => {
    if (!id || id === "0") return;
    used = true;
    const actual = Number(got[i]);
    if (hasPlayed(stats && stats[id]) && Number.isFinite(actual)) proj += actual;
    else {
      const p = sleeperPts(projections && projections[id], scoring);
      proj += Number.isFinite(p) ? p : (Number.isFinite(actual) ? actual : 0);
    }
  });
  if (!used) proj = now;
  return { pts: +now.toFixed(1), proj: +proj.toFixed(1) };
}

function rosterPoints(settings) {
  const whole = Number(settings && settings.fpts) || 0;
  const dec = Number(settings && settings.fpts_decimal) || 0;
  return whole + (dec > 0 && dec < 1 ? dec : dec / 100);
}

function playoffOdds(rosters, mineId, league) {
  const spots = Number(league && league.settings && league.settings.playoff_teams) || 0;
  const start = Number(league && league.settings && league.settings.playoff_week_start) || 0;
  // A median league records a second win or loss each week. Points are still once a week.
  const perWeek = Number(league && league.settings && league.settings.league_average_match) === 1 ? 2 : 1;
  const season = start > 1 ? (start - 1) * perWeek : 0;
  const teams = (rosters || []).map((row) => {
    const bag = row.settings || {};
    const wins = Number(bag.wins) || 0;
    const losses = Number(bag.losses) || 0;
    const ties = Number(bag.ties) || 0;
    const played = wins + losses + ties;
    const pf = rosterPoints(bag);
    const weeks = perWeek > 1 ? played / perWeek : played;
    const left = season ? Math.max(0, season - played) : 0;
    return { id: row.roster_id, wins, losses, ties, pf, played, left, ppg: weeks ? pf / weeks : 0 };
  });
  const mine = teams.find((row) => row.id === mineId);
  if (!mine) return null;
  const record = mine.ties ? `${mine.wins}-${mine.losses}-${mine.ties}` : `${mine.wins}-${mine.losses}`;
  if (!spots) return { record, playoff: null };
  if (!mine.left && teams.every((row) => !row.left)) {
    const ranked = teams.slice().sort((a, b) => b.wins - a.wins || b.ties - a.ties || b.pf - a.pf);
    const place = ranked.findIndex((row) => row.id === mineId);
    return { record, playoff: place >= 0 && place < spots ? 99 : 1 };
  }
  const avg = teams.reduce((sum, row) => sum + row.ppg, 0) / (teams.length || 1);
  teams.forEach((row) => {
    const z = (row.ppg - avg) / (18 * Math.SQRT2);
    const p = 0.5 * (1 + erf(z));
    row.p = Math.min(0.82, Math.max(0.18, p));
  });
  const trials = 600;
  let made = 0;
  for (let n = 0; n < trials; n += 1) {
    const table = teams.map((row) => {
      let extra = 0;
      for (let g = 0; g < row.left; g += 1) if (Math.random() < row.p) extra += 1;
      return { id: row.id, wins: row.wins + extra, pf: row.pf };
    });
    table.sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    if (table.findIndex((row) => row.id === mineId) < spots) made += 1;
  }
  return { record, playoff: Math.round(Math.min(99, Math.max(1, (made / trials) * 100))) };
}

let matchupCache = { key: "", at: 0, data: null };

async function matchups(body) {
  const state = await nflState();
  const season = String((body && body.season) || state.league_season || state.season || new Date().getFullYear());
  const week = fantasyWeek(state) || null;
  const user = await resolveUser((body && (body.user || body.username)) || "");
  const key = `${user.user_id}:${season}:${week}`;
  if (matchupCache.data && matchupCache.key === key && Date.now() - matchupCache.at < 90 * 1000) return matchupCache.data;
  const leagues = await leaguesFor(user.user_id, season);
  const live = week && leagues.some((row) => row.status === "in_season");
  const projections = live ? await loadProjections(season, week).catch(() => ({})) : {};
  const stats = live ? await loadWeekStats(season, week).catch(() => ({})) : {};
  const rows = await mapPool(leagues, 3, async (league) => {
    if (league.status !== "in_season" || !week) {
      return { league_id: league.league_id, name: league.name, skip: true };
    }
    try {
      const [settings, users, rosters, games] = await Promise.all([
        sleeperGet(`/league/${encodeURIComponent(league.league_id)}`),
        sleeperGet(`/league/${encodeURIComponent(league.league_id)}/users`),
        sleeperGet(`/league/${encodeURIComponent(league.league_id)}/rosters`),
        sleeperGet(`/league/${encodeURIComponent(league.league_id)}/matchups/${week}`),
      ]);
      const mine = (rosters || []).find((row) => String(row.owner_id) === String(user.user_id));
      const mineGame = mine && (games || []).find((row) => row.roster_id === mine.roster_id);
      const oppGame = mineGame && mineGame.matchup_id != null
        ? (games || []).find((row) => row.matchup_id === mineGame.matchup_id && row.roster_id !== mine.roster_id)
        : null;
      const standing = playoffOdds(rosters, mine && mine.roster_id, settings);
      const season = { record: standing && standing.record, playoff: standing && standing.playoff };
      if (!mineGame || !oppGame) return { league_id: league.league_id, name: league.name, bye: true, ...season };
      const oppRoster = (rosters || []).find((row) => row.roster_id === oppGame.roster_id);
      const oppUser = oppRoster && (users || []).find((row) => String(row.user_id) === String(oppRoster.owner_id));
      const scoring = (settings && settings.scoring_settings) || {};
      const me = sideScore(mineGame, scoring, projections, stats);
      const them = sideScore(oppGame, scoring, projections, stats);
      return {
        league_id: league.league_id,
        name: league.name,
        opponent: teamName(oppUser),
        pts: me.pts,
        proj: me.proj,
        oppPts: them.pts,
        oppProj: them.proj,
        win: winPct(me.proj, them.proj),
        ...season,
      };
    } catch (error) {
      return { league_id: league.league_id, name: league.name, error: String((error && error.message) || error) };
    }
  });
  const data = { user, season, week, leagues: rows };
  matchupCache = { key, at: Date.now(), data };
  return data;
}

function playerHits(map, query) {
  const q = words(query).join(" ");
  if (q.length < 2) return [];
  const hits = [];
  Object.entries(map || {}).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    const positions = Array.isArray(row.fantasy_positions) ? row.fantasy_positions : [];
    const pos = positions.find((item) => FAN_POS.has(item)) || (FAN_POS.has(row.position) ? row.position : "");
    if (!pos) return;
    const full = words(row.full_name || `${row.first_name || ""} ${row.last_name || ""}`).join(" ");
    const first = words(row.first_name).join(" ");
    const last = words(row.last_name).join(" ");
    if (!full) return;
    let rank = 4;
    if (full === q) rank = 0;
    else if (q.includes(" ")) rank = full.startsWith(q) ? 1 : 4;
    else if (last === q) rank = 1;
    else if (first === q) rank = 2;
    else if (full.startsWith(q)) rank = 3;
    if (rank === 4) return;
    hits.push({
      id: String(id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || String(row.full_name || id),
      pos,
      team: String(row.team || ""),
      rank,
      onTeam: row.team ? 0 : 1,
      search: Number(row.search_rank) || 99999,
    });
  });
  hits.sort((a, b) => a.rank - b.rank || a.onTeam - b.onTeam || a.search - b.search || a.name.localeCompare(b.name));
  const exact = hits.filter((row) => row.rank === 0);
  const teamed = exact.filter((row) => row.onTeam === 0);
  const picked = teamed.length === 1 ? teamed : exact.length === 1 ? exact : hits.length === 1 ? hits : hits.slice(0, 6);
  return picked.map((row) => ({ id: row.id, name: row.name, pos: row.pos, team: row.team }));
}

async function takenIds(leagueId) {
  const hit = takenCache.get(leagueId);
  if (hit && Date.now() - hit.at < 60000) return hit.ids;
  const rosters = await sleeperGet(`/league/${encodeURIComponent(leagueId)}/rosters`);
  const ids = new Set();
  (rosters || []).forEach((row) => {
    [...(row.players || []), ...(row.reserve || []), ...(row.taxi || [])].forEach((id) => {
      if (id && id !== "0") ids.add(String(id));
    });
  });
  takenCache.set(leagueId, { at: Date.now(), ids });
  return ids;
}

async function playerFree(query) {
  const name = String((query && query.name) || "").trim();
  const user = await resolveUser(query && (query.user || query.username));
  const state = await nflState();
  const season = String(state.league_season || state.season || new Date().getFullYear());
  const leagues = await leaguesFor(user.user_id, season);
  const map = await loadPlayers();
  let id = String((query && query.id) || "");
  if (!id) {
    const matches = playerHits(map, name);
    if (matches.length !== 1) return { player: null, matches, leagues: [] };
    id = matches[0].id;
  }
  const player = playerRow(id, map);
  if (!player || !map[id]) throw new Error("No player with that name.");
  const rows = await Promise.all(leagues.map(async (league) => {
    const ids = await takenIds(league.league_id);
    return { league_id: league.league_id, available: !ids.has(String(id)) };
  }));
  return {
    player: { id: player.id, name: player.name, pos: player.pos, team: player.team },
    matches: [],
    leagues: rows.filter((row) => row.available),
  };
}

module.exports = { sleeper, startSit, leagueCheck, matchups, samePlayer, fillLineup, playerFree };
