/** How these two teams play, and what that does to the game. */

const MEM = new Map();
const HOUR = 6 * 60 * 60 * 1000;

async function json(url) {
  const hit = MEM.get(url);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const res = await fetch(url, { headers: { Accept: "application/json", Referer: "https://www.espn.com/", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  MEM.set(url, { at: Date.now(), data });
  return data;
}

function stat(data, name) {
  const cats = (((data || {}).results || {}).stats || {}).categories || [];
  for (const cat of cats) {
    const hit = (cat.stats || []).find((row) => row.name === name);
    if (!hit) continue;
    const value = Number(String(hit.displayValue != null ? hit.displayValue : hit.value).replace(/,/g, ""));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function median(rows, key) {
  const nums = rows.map((row) => row[key]).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function mark(value, mid, gap) {
  if (!Number.isFinite(value) || !Number.isFinite(mid)) return "";
  if (value >= mid + gap) return "high";
  if (value <= mid - gap) return "low";
  return "";
}

function shown(n) { return Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : ""; }
function nick(name) { return `the ${String(name || "").split(" ").pop() || name}`; }
function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; }
function join(bits) { return bits.filter(Boolean).slice(0, 3).map((bit) => bit.charAt(0).toUpperCase() + bit.slice(1)).join(" "); }

function kindOf(path) {
  if (String(path).includes("basketball")) return "hoop";
  if (String(path).includes("football")) return "ball";
  if (String(path).includes("hockey")) return "ice";
  if (String(path).includes("baseball")) return "bat";
  return "";
}

async function teamIds(path) {
  const data = await json(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams?limit=50`);
  const league = ((((data.sports || [])[0] || {}).leagues || [])[0] || {});
  return (league.teams || []).map((row) => String((row.team || row).id || "")).filter(Boolean);
}

async function table(path) {
  const data = await json(`https://site.web.api.espn.com/apis/v2/sports/${path}/standings`);
  const map = new Map();
  (data.children || []).forEach((group) => {
    (((group.standings || {}).entries) || []).forEach((entry) => {
      const bag = {};
      (entry.stats || []).forEach((row) => { bag[row.name] = Number(String(row.displayValue != null ? row.displayValue : row.value).replace(/[+,%]/g, "").replace(/,/g, "")); });
      const games = (bag.wins || 0) + (bag.losses || 0) + (bag.ties || bag.otLosses || 0);
      const pts = Number.isFinite(bag.avgPointsFor) ? bag.avgPointsFor : (games ? (bag.pointsFor || 0) / games : null);
      const allow = Number.isFinite(bag.avgPointsAgainst) ? bag.avgPointsAgainst : (games ? (bag.pointsAgainst || 0) / games : null);
      map.set(String((entry.team || {}).id || ""), { pts, allow, games });
    });
  });
  return map;
}

async function sheet(path, id) {
  return json(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/teams/${id}/statistics`);
}

function hoopRaw(data, board) {
  const fga = stat(data, "avgFieldGoalsAttempted"), fta = stat(data, "avgFreeThrowsAttempted"), oreb = stat(data, "avgOffensiveRebounds"), tov = stat(data, "avgTurnovers");
  const tpa = stat(data, "avgThreePointFieldGoalsAttempted"), stl = stat(data, "avgSteals");
  if (![fga, fta, oreb, tov, tpa].every((n) => n != null) || !fga) return null;
  return { poss: fga + 0.44 * fta - oreb + tov, tov, oreb, stl, three: tpa / fga, pts: board && board.pts != null ? board.pts : stat(data, "avgPoints"), allow: board && board.allow };
}

function ballRaw(data, board) {
  const games = stat(data, "gamesPlayed") || (board && board.games);
  const plays = stat(data, "totalOffensivePlays"), clock = stat(data, "possessionTimeSeconds");
  const pass = stat(data, "passingAttempts"), rush = stat(data, "rushingAttempts");
  const py = stat(data, "netPassingYards"), ry = stat(data, "rushingYards");
  const give = stat(data, "totalGiveaways"), take = stat(data, "totalTakeaways");
  if (!games || !plays || !pass || !rush) return null;
  return { plays: plays / games, top: clock != null ? clock / games / 60 : null, pass: pass / (pass + rush), ypp: py != null && ry != null ? (py + ry) / plays : null, give: give != null ? give / games : null, take: take != null ? take / games : null, pts: board && board.pts != null ? board.pts : stat(data, "totalPointsPerGame"), allow: board && board.allow };
}

function iceRaw(data, board) {
  const games = stat(data, "gamesPlayed") || (board && board.games);
  const shots = stat(data, "shotsTotal"), against = stat(data, "shotsAgainst"), pens = stat(data, "penaltyMinutes");
  if (!games || shots == null) return null;
  return { shots: shots / games, shotsAgainst: against != null ? against / games : null, pens: pens != null ? pens / games : null, pts: board && board.pts, allow: board && board.allow };
}

function batRaw(data, board) {
  const games = (board && board.games) || stat(data, "gamesPlayed");
  const hr = stat(data, "homeRuns"), k = stat(data, "strikeouts");
  if (!games || (hr == null && k == null)) return null;
  return { hr: hr != null ? hr / games : null, k: k != null ? k / games : null, pts: board && board.pts, allow: board && board.allow };
}

const BUILD = { hoop: hoopRaw, ball: ballRaw, ice: iceRaw, bat: batRaw };

async function league(path, kind) {
  const key = `${path}|${kind}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const [ids, board] = await Promise.all([teamIds(path), table(path)]);
  const rows = (await Promise.all(ids.map(async (id) => {
    try { return BUILD[kind](await sheet(path, id), board.get(id)); } catch (err) { return null; }
  }))).filter(Boolean);
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const mids = {};
  keys.forEach((name) => { mids[name] = median(rows, name); });
  const data = { mids, rows: rows.length };
  MEM.set(key, { at: Date.now(), data });
  return data;
}

function edge(game, sides) {
  const spread = game && game.spread;
  const home = spread && Number(spread.homeLine);
  if (!Number.isFinite(home) || Math.abs(home) < 7) return null;
  const fav = sides.find((side) => side.homeAway === (home < 0 ? "home" : "away"));
  const dog = sides.find((side) => side !== fav);
  return fav && dog ? { fav, dog } : null;
}

function totalOf(game) {
  const line = game && game.total && Number(game.total.line);
  return Number.isFinite(line) ? line : null;
}

function hoopFlags(row, mids) {
  return {
    pace: mark(row.poss, mids.poss, 2.5), threes: row.three >= 0.46 ? "high" : row.three <= 0.37 ? "low" : mark(row.three, mids.three, 0.03), tov: mark(row.tov, mids.tov, 1.5),
    board: mark(row.oreb, mids.oreb, 1.5), stl: mark(row.stl, mids.stl, 1.5), score: mark(row.pts, mids.pts, 4), allow: mark(row.allow, mids.allow, 4),
  };
}

function hoopType(flags) {
  const bits = [];
  if (flags.pace === "high") bits.push("plays fast"); else if (flags.pace === "low") bits.push("walks it up");
  if (flags.threes === "high") bits.push("lives on threes"); else if (flags.threes === "low") bits.push("lives inside");
  if (flags.tov === "high" && flags.board === "low") bits.push("gives it away without boarding");
  else if (flags.tov === "high") bits.push("gives the ball away");
  else if (flags.board === "high") bits.push("keeps possessions on the glass");
  else if (flags.stl === "high") bits.push("takes the ball away");
  else if (flags.tov === "low") bits.push("takes care of the ball");
  if (!bits.length) return "";
  if (bits.length === 1) return `${cap(bits[0])}.`;
  if (bits.length === 2) return `${cap(bits[0])} and ${bits[1]}.`;
  return `${cap(bits[0])}, ${bits.slice(1, -1).join(", ")}, and ${bits[bits.length - 1]}.`;
}

function hoopLines(rows, game) {
  const fast = rows.filter((row) => row.flags.pace === "high"), slow = rows.filter((row) => row.flags.pace === "low");
  const bombs = rows.filter((row) => row.flags.threes === "high"), inside = rows.filter((row) => row.flags.threes === "low");
  const paceGap = Math.abs(rows[0].poss - rows[1].poss), midPace = rows[0].midPace, bothUnder = Number.isFinite(midPace) && rows.every((row) => row.poss <= midPace + 0.4);
  let pace = "";
  const total = totalOf(game);
  if (fast.length === 2) pace = total ? `Both teams play fast, so ${total} gets extra trips. The points and the counting stats get more chances.` : "Both teams play fast. More trips, so the points and the counting stats get more chances.";
  else if ((slow.length === 2 || (bothUnder && paceGap < 2.5)) && bombs.length === 2) pace = total ? `Neither team runs, and both live on threes, so ${total} comes from the shooting night, not from extra trips.` : "Neither team runs, and both live on threes. The points come from the shooting night, not from extra trips.";
  else if (slow.length === 2 || (bothUnder && paceGap < 2.5)) pace = total ? `Neither team runs, so ${total} has to come from making shots. This pairing does not hand it extra trips.` : "Neither team runs. Fewer trips, so the points have to come from making shots.";
  else if (fast.length === 1 && slow.length === 1) pace = `${nick(fast[0].name)} want to run and ${nick(slow[0].name)} want to hold it. The slower team usually gets the pace.`;
  else if (bombs.length === 2) pace = "Both sides live on threes. The total swings with the shooting night.";
  else if (bombs.length === 1 && inside.length === 1) pace = `${nick(bombs[0].name)} live on threes and ${nick(inside[0].name)} live inside. One side is streaky and the other grinds.`;
  let ball = "";
  rows.forEach((row) => {
    const other = rows.find((side) => side !== row);
    if (!ball && row.flags.tov === "high" && other.flags.stl === "high") ball = `${nick(row.name)} give it away and ${nick(other.name)} take it. Those become open-floor trips the other way.`;
    else if (!ball && row.flags.tov === "high" && row.flags.board === "low") ball = `${nick(row.name)} give the ball away and do not get the offensive rebound, so the trip ends early.`;
  });
  if (!ball && rows.every((row) => row.flags.tov === "low" && row.flags.board === "high")) ball = "Both teams keep the ball. The extra points come from second chances, not from running.";
  else if (!ball && fast.length < 2) rows.forEach((row) => { if (!ball && row.flags.board === "high" && row.flags.pace !== "high") ball = `${nick(row.name)} keep the possession alive on the glass. That is a longer trip, not a faster game.`; });
  const soft = rows.filter((row) => row.flags.allow === "high"), stingy = rows.filter((row) => row.flags.allow === "low"), scorer = rows.filter((row) => row.flags.score === "high");
  let points = "";
  if (scorer.length === 2 && soft.length === 2) points = "Neither defense gets a stop. The points are there even before the pace.";
  else if (stingy.length === 2) points = "Both defenses take points off the game.";
  else rows.forEach((row) => {
    const other = rows.find((side) => side !== row);
    if (!points && row.flags.score === "high" && other.flags.allow === "high" && !(other.flags.score === "high" && row.flags.allow === "high")) points = `The points have a path for ${nick(row.name)}. They score, and ${nick(other.name)} give them up.`;
  });
  if (!points && Math.abs(rows[0].pts - rows[1].pts) >= 8) { const more = rows[0].pts >= rows[1].pts ? rows[0] : rows[1]; const less = more === rows[0] ? rows[1] : rows[0]; points = `The points lean to ${nick(more.name)}. They score ${shown(more.pts)}, and ${nick(less.name)} score ${shown(less.pts)}.`; }
  const spot = edge(game, rows);
  if (spot) {
    const fav = rows.find((row) => row.id === spot.fav.id);
    if (fav && fav.flags.pace === "low") points = `The spread says ${nick(fav.name)} spend the fourth ahead. They already hold the ball, so a lead makes the game slower.`;
    else if (fav && (fav.flags.pace === "high" || fav.flags.threes === "high")) points = points || `The spread says ${nick(fav.name)} can get ahead. A lead does not turn them into a walking team. They keep playing the same way.`;
  }
  return join([pace, ball, points]);
}

function ballFlags(row, mids) {
  return { plays: mark(row.plays, mids.plays, 3), top: mark(row.top, mids.top, 1.5), pass: mark(row.pass, mids.pass, 0.06), ypp: mark(row.ypp, mids.ypp, 0.35), give: mark(row.give, mids.give, 0.35), take: mark(row.take, mids.take, 0.35), score: mark(row.pts, mids.pts, 3), allow: mark(row.allow, mids.allow, 3) };
}

function ballType(flags) {
  const bits = [];
  if (flags.top === "high") bits.push("holds the ball"); else if (flags.plays === "high") bits.push("runs a lot of plays"); else if (flags.plays === "low") bits.push("runs few plays");
  if (flags.pass === "high") bits.push("throws it"); else if (flags.pass === "low") bits.push("runs it");
  if (flags.ypp === "high") bits.push("hits big plays");
  if (flags.give === "high") bits.push("gives the ball away"); else if (flags.take === "high") bits.push("takes it away");
  if (!bits.length) return "";
  if (bits.length === 1) return `${cap(bits[0])}.`;
  if (bits.length === 2) return `${cap(bits[0])} and ${bits[1]}.`;
  return `${cap(bits[0])}, ${bits.slice(1, -1).join(", ")}, and ${bits[bits.length - 1]}.`;
}

function ballLines(rows, game) {
  const busy = rows.filter((row) => row.flags.plays === "high"), quiet = rows.filter((row) => row.flags.plays === "low" || row.flags.top === "high");
  const throwers = rows.filter((row) => row.flags.pass === "high"), runners = rows.filter((row) => row.flags.pass === "low");
  let pace = "";
  if (busy.length === 2) pace = "Both teams run a lot of plays. More snaps, so the counting stats get more chances.";
  else if (quiet.length === 2) pace = "Both teams want the ball and the clock. The other skill players stand around.";
  else if (quiet.length === 1) { const other = rows.find((row) => row !== quiet[0]); pace = other && other.flags.pass === "high" ? `${nick(quiet[0].name)} hold the ball. ${nick(other.name)} passing props need a stop, or a lead the other way, before they see the field.` : `${nick(quiet[0].name)} hold the ball. ${nick(other.name)} have to take it back before their skill players get snaps.`; }
  else if (throwers.length === 2) pace = "Both teams throw. The receivers stay in the game until somebody gets a real lead.";
  else if (runners.length === 2) pace = "Both teams run. The game is carries and the clock.";
  else if (quiet.length === 1 && throwers.length === 1) pace = `${nick(quiet[0].name)} holds the ball. ${nick(throwers[0].name)}'s passing props need a stop, or a lead the other way, before they see the field.`;
  let ball = "";
  rows.forEach((row) => {
    const other = rows.find((side) => side !== row);
    if (!ball && row.flags.give === "high" && other.flags.take === "high") ball = `${nick(row.name)} give it away and ${nick(other.name)} take it. Those are short fields, points that do not need a long drive.`;
  });
  if (!ball && rows.every((row) => row.flags.ypp === "high")) ball = "Both sides hit big plays. The points do not need a lot of snaps.";
  if (!ball) rows.forEach((row) => { if (!ball && row.flags.give === "high") ball = `${nick(row.name)} give the ball away. Those become short fields.`; });
  const spot = edge(game, rows);
  let points = "";
  if (spot) {
    const fav = rows.find((row) => row.id === spot.fav.id), dog = rows.find((row) => row.id === spot.dog.id);
    if (fav && dog && fav.flags.pass === "low" && dog.flags.pass === "high") points = `If ${nick(fav.name)} lead, they can run the clock and ${nick(dog.name)} have to throw. The carries live on the favorite. The passing props live on the dog.`;
    else if (fav && dog && dog.flags.pass === "high") points = `If ${nick(fav.name)} lead, ${nick(dog.name)} have to throw. That is the script for the dog's receivers.`;
  }
  const soft = rows.filter((row) => row.flags.allow === "high"), scorer = rows.filter((row) => row.flags.score === "high");
  if (!points && scorer.length === 2 && soft.length === 2) points = "Both sides score and both defenses give it up. The points have a path even in a slow script.";
  const total = totalOf(game);
  if (total && quiet.length === 2 && !points) points = `The number is ${total}, and both teams want to hold the clock.`;
  return join([pace, ball, points]);
}

function iceLines(rows) {
  const volume = rows.filter((row) => row.flags.shots === "high"), quiet = rows.filter((row) => row.flags.shots === "low");
  let pace = "";
  if (volume.length === 2) pace = "Both teams shoot. The goals have a lot of chances at even strength.";
  else if (quiet.length === 2) pace = "Neither team shoots much. The goals have to come from a special team or a breakdown.";
  else if (volume.length === 1) { const other = rows.find((row) => row !== volume[0]); pace = other && other.flags.shots === "low" ? `${nick(volume[0].name)} shoot. ${nick(other.name)} do not. The chances lean one way.` : `${nick(volume[0].name)} shoot more. The chances lean their way.`; }
  let ball = "";
  rows.forEach((row) => {
    const other = rows.find((side) => side !== row);
    if (!ball && row.flags.pens === "high") ball = `${nick(row.name)} sit. ${nick(other.name)} get the power play, which is a different path to a goal than shot volume.`;
  });
  const scorer = rows.filter((row) => row.flags.score === "high"), soft = rows.filter((row) => row.flags.allow === "high");
  const points = scorer.length === 2 && soft.length === 2 ? "Neither goalie gets a quiet night." : "";
  return join([pace, ball, points]);
}

function batLines(rows) {
  const power = rows.filter((row) => row.flags.hr === "high"), swing = rows.filter((row) => row.flags.k === "high");
  let pace = "";
  if (swing.length === 2) pace = "Both lineups strike out. Innings end, and the runs have to come on the homer.";
  else if (swing.length === 1 && power.includes(swing[0])) pace = `${nick(swing[0].name)} strike out, and the damage is the homer. Empty at-bats, then one swing.`;
  else if (power.length === 2) pace = "Both lineups do the damage in one swing.";
  else if (swing.length === 1) pace = `${nick(swing[0].name)} strike out. Their innings end early unless the homer shows up.`;
  const scorer = rows.filter((row) => row.flags.score === "high"), soft = rows.filter((row) => row.flags.allow === "high");
  const points = scorer.length === 2 && soft.length === 2 ? "Both lineups score and both staffs give it up." : "";
  return join([pace, points]);
}

function hoopCol(row) {
  return [hoopType(row.flags), `${shown(row.pts)} points, ${shown(row.allow)} allowed.`, `Pace ${shown(row.poss)}. ${shown(row.tov)} turnovers. ${shown(row.oreb)} offensive boards. ${Math.round(row.three * 100)}% of the shots are threes.`].filter(Boolean);
}

function ballCol(row) {
  const pass = Math.round(row.pass * 100);
  return [ballType(row.flags), `${shown(row.pts)} points, ${shown(row.allow)} allowed.`, `${shown(row.plays)} plays a game. ${shown(row.top)} minutes with the ball. ${pass}% throws. ${shown(row.give)} giveaways.`].filter(Boolean);
}

function iceCol(row) {
  return [`${shown(row.pts)} goals, ${shown(row.allow)} allowed.`, `${shown(row.shots)} shots, ${shown(row.shotsAgainst)} allowed. ${shown(row.pens)} penalty minutes.`];
}

function batCol(row) {
  return [`${shown(row.pts)} runs, ${shown(row.allow)} allowed.`, `${shown(row.hr)} home runs a game. ${shown(row.k)} strikeouts a game.`];
}

async function gameScript(path, sport, sides, game) {
  const kind = kindOf(path || sport);
  if (!kind || !Array.isArray(sides) || sides.length < 2) return null;
  let book, mids;
  try { book = await table(path); mids = (await league(path, kind)).mids; } catch (err) { return null; }
  const built = await Promise.all(sides.slice(0, 2).map(async (side) => {
    try {
      const raw = BUILD[kind](await sheet(path, side.id), book.get(side.id));
      return raw ? { ...side, ...raw } : null;
    } catch (err) { return null; }
  }));
  if (built.some((row) => !row)) return null;
  if (kind === "hoop") built.forEach((row) => { row.flags = hoopFlags(row, mids); row.midPace = mids.poss; });
  if (kind === "ball") built.forEach((row) => { row.flags = ballFlags(row, mids); });
  if (kind === "ice") built.forEach((row) => { row.flags = { shots: mark(row.shots, mids.shots, 2), pens: mark(row.pens, mids.pens, 1.5), score: mark(row.pts, mids.pts, 0.35), allow: mark(row.allow, mids.allow, 0.35) }; });
  if (kind === "bat") built.forEach((row) => { row.flags = { hr: mark(row.hr, mids.hr, 0.15), k: mark(row.k, mids.k, 1), score: mark(row.pts, mids.pts, 0.4), allow: mark(row.allow, mids.allow, 0.4) }; });
  const text = kind === "hoop" ? hoopLines(built, game) : kind === "ball" ? ballLines(built, game) : kind === "ice" ? iceLines(built) : batLines(built);
  const col = kind === "hoop" ? hoopCol : kind === "ball" ? ballCol : kind === "ice" ? iceCol : batCol;
  const cols = built.map((row) => ({ title: row.short || row.name, lines: col(row) }));
  if (!text && cols.every((row) => row.lines.length < 2)) return null;
  return { name: "How they play", script: true, text: text || cols.map((row) => row.lines.join(" ")).join(" "), lines: text ? [text] : [], cols };
}

module.exports = { gameScript };
