const https = require("https");
const { askBet } = require("./bet-ask");

const PATHS = {
  NFL: "football/nfl", NCAAF: "football/college-football", Football: "football/college-football",
  WNBA: "basketball/wnba", NBA: "basketball/nba", NCAAB: "basketball/mens-college-basketball",
  Basketball: "basketball/nba", NHL: "hockey/nhl", Hockey: "hockey/nhl",
  MLB: "baseball/mlb", Baseball: "baseball/mlb",
};
const RIVALS = [
  ["packers", "bears"], ["cowboys", "eagles"], ["cowboys", "giants"], ["eagles", "giants"],
  ["ravens", "steelers"], ["steelers", "browns"], ["bengals", "browns"], ["chiefs", "raiders"],
  ["chiefs", "bills"], ["bears", "vikings"], ["packers", "vikings"], ["49ers", "seahawks"],
  ["49ers", "rams"], ["patriots", "jets"], ["lakers", "celtics"], ["yankees", "red sox"],
  ["dodgers", "giants"], ["cubs", "cardinals"], ["bruins", "canadiens"], ["rangers", "islanders"],
];
const GAPS = [
  [/mile/, "Miles since the last game are not on the public log."],
  [/umpire|referee|foul rate/, "Umpire and referee rates are not on the public log."],
  [/corner|shadow|assigned/, "Which defender travels with a receiver is not on the public log."],
  [/save percentage|goalie save/, "Goalie save percentage is not on the public log."],
  [/open(ing|ed)? (line|number)|where the prop opened/, "The first number on this prop is not on the public log."],
];
const CLUBS = [
  ["cardinals", "ARI", "Arizona Cardinals"], ["falcons", "ATL", "Atlanta Falcons"], ["ravens", "BAL", "Baltimore Ravens"],
  ["bills", "BUF", "Buffalo Bills"], ["panthers", "CAR", "Carolina Panthers"], ["bears", "CHI", "Chicago Bears"],
  ["bengals", "CIN", "Cincinnati Bengals"], ["browns", "CLE", "Cleveland Browns"], ["cowboys", "DAL", "Dallas Cowboys"],
  ["broncos", "DEN", "Denver Broncos"], ["lions", "DET", "Detroit Lions"], ["packers", "GB", "Green Bay Packers"],
  ["texans", "HOU", "Houston Texans"], ["colts", "IND", "Indianapolis Colts"], ["jaguars", "JAX", "Jacksonville Jaguars"],
  ["chiefs", "KC", "Kansas City Chiefs"], ["raiders", "LV", "Las Vegas Raiders"], ["chargers", "LAC", "Los Angeles Chargers"],
  ["rams", "LAR", "Los Angeles Rams"], ["dolphins", "MIA", "Miami Dolphins"], ["vikings", "MIN", "Minnesota Vikings"],
  ["patriots", "NE", "New England Patriots"], ["saints", "NO", "New Orleans Saints"], ["giants", "NYG", "New York Giants"],
  ["jets", "NYJ", "New York Jets"], ["eagles", "PHI", "Philadelphia Eagles"], ["steelers", "PIT", "Pittsburgh Steelers"],
  ["49ers", "SF", "San Francisco 49ers"], ["niners", "SF", "San Francisco 49ers"], ["seahawks", "SEA", "Seattle Seahawks"],
  ["buccaneers", "TB", "Tampa Bay Buccaneers"], ["bucs", "TB", "Tampa Bay Buccaneers"], ["titans", "TEN", "Tennessee Titans"],
  ["commanders", "WSH", "Washington Commanders"],
];
const cache = new Map();

function getJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return Promise.resolve(hit.data);
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "parlay-desk", Referer: "https://www.espn.com/" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error("lookup failed")); return; }
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          cache.set(url, { at: Date.now(), data });
          resolve(data);
        } catch (err) { reject(err); }
      });
    });
    req.setTimeout(12000, () => req.destroy(new Error("lookup timed out")));
    req.on("error", reject);
  });
}

function wanted(attribute, question) {
  const key = String(attribute || "").trim();
  if (key === "all") return ["out", "rest", "building", "weather", "total", "recent", "rivalry"];
  if (key) return [key];
  const q = String(question || "").toLowerCase();
  const hits = [];
  if (/out|injur|questionable|doubtful|hurt|inactive/.test(q)) hits.push("out");
  if (/rest|bye|short week|days off/.test(q)) hits.push("rest");
  if (/building|indoor|dome|turf|grass|altitude|denver/.test(q)) hits.push("building");
  if (/wind|rain|weather|cold/.test(q)) hits.push("weather");
  if (/total|points|script|spread|favou?red/.test(q)) hits.push("total");
  if (/recent|last game|form|scored|won|lost/.test(q)) hits.push("recent");
  if (/rival/.test(q)) hits.push("rivalry");
  return hits;
}

function gapLine(question) {
  const q = String(question || "").toLowerCase();
  const hit = GAPS.find(([pattern]) => pattern.test(q));
  return hit ? hit[1] : "";
}

function matchName(game) {
  const match = String(game.match || "").replace(/\s@\s/g, " at ").trim();
  if (match) return match;
  if (game.awayName && game.homeName) return `${game.awayName} at ${game.homeName}`;
  return "";
}

function gameFromLabel(leg) {
  const label = String(leg.label || "");
  const teams = label.match(/,\s*([^,]+?)\s+at\s+([^,]+?)(?:,|$)/i);
  if (!teams) return null;
  const sport = (label.match(/\b(NFL|NBA|NHL|MLB|NCAAF|NCAAB|WNBA)\b/) || [])[1] || String(leg.sport || "");
  const when = label.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/i);
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  let kickoff = "";
  if (when && months[when[1].slice(0, 3).toLowerCase()] != null) {
    kickoff = new Date(Date.UTC(new Date().getFullYear(), months[when[1].slice(0, 3).toLowerCase()], Number(when[2]), 16, 0, 0)).toISOString();
  }
  return { id: `label:${teams[1].trim()}:${teams[2].trim()}`, sport, match: `${teams[1].trim()} @ ${teams[2].trim()}`, kickoff };
}

function gameFor(leg, games) {
  const id = String(leg.gameId || "");
  if (id) {
    const hit = games.find((game) => String(game.id) === id);
    if (hit) return hit;
  }
  const fromLabel = gameFromLabel(leg);
  if (fromLabel) {
    const hit = games.find((game) => String(game.match || "").toLowerCase() === fromLabel.match.toLowerCase());
    return hit || fromLabel;
  }
  const label = String(leg.label || "");
  const sport = String(leg.sport || "");
  return games.find((game) => (!sport || game.sport === sport) && game.awayName && game.homeName && label.includes(game.awayName) && label.includes(game.homeName)) || null;
}

function teams(data) {
  const rows = ((((data.header || {}).competitions || [])[0] || {}).competitors) || [];
  const named = {};
  rows.forEach((row) => {
    const team = row.team || {};
    named[String(team.id || "")] = team.shortDisplayName || team.displayName || "";
  });
  return named;
}

function injuryLines(data) {
  const rank = { out: 0, doubtful: 1, questionable: 2 };
  const blocks = [];
  (data.injuries || []).forEach((block) => {
    const team = String((block.team || {}).displayName || "This team");
    const rows = [];
    (block.injuries || []).forEach((item) => {
      const status = String(item.status || "").toLowerCase();
      if (!rank.hasOwnProperty(status)) return;
      const athlete = item.athlete || {};
      const name = String(athlete.displayName || "");
      if (!name) return;
      const pos = String((athlete.position || {}).abbreviation || "");
      rows.push({ status, line: `${name}${pos ? `, ${pos}` : ""}, ${status}` });
    });
    rows.sort((a, b) => rank[a.status] - rank[b.status]);
    if (rows.length) blocks.push(`${team}\n${rows.map((row) => row.line).join("\n")}`);
  });
  return blocks.length ? [blocks.join("\n")] : ["No one is listed out, doubtful, or questionable."];
}

function restLines(data, kickoff) {
  const start = Date.parse(kickoff || "");
  const lines = [];
  (data.lastFiveGames || []).forEach((row) => {
    const team = String((row.team || {}).displayName || "This team");
    const last = (row.events || []).map((event) => Date.parse(event.gameDate || "")).filter((stamp) => Number.isFinite(stamp) && (!Number.isFinite(start) || stamp < start)).sort((a, b) => b - a)[0];
    if (!Number.isFinite(last) || !Number.isFinite(start)) return;
    const days = Math.round((start - last) / 86400000);
    lines.push(days >= 13 ? `${team} is off a bye, ${days} days since the last game.` : `${team} has ${days} days since the last game.`);
  });
  return lines.length ? lines : ["Rest days are not on the public log for this game."];
}

function buildingLines(data) {
  const venue = ((data.gameInfo || {}).venue) || {};
  const city = String((venue.address || {}).city || "");
  const where = venue.indoor ? "indoors" : "outdoors";
  const surface = venue.grass === true ? "grass" : venue.grass === false ? "turf" : "";
  const place = [city, where, surface].filter(Boolean).join(", ");
  return [place ? `The building is ${place}.` : "The building is not posted yet."];
}

function weatherLines(data) {
  const venue = ((data.gameInfo || {}).venue) || {};
  if (venue.indoor) return ["It is indoors, so wind and rain stay off this one."];
  const weather = (data.gameInfo || {}).weather || {};
  const wind = weather.wind && typeof weather.wind === "object" ? weather.wind.speed : null;
  const gust = typeof weather.gust === "number" ? weather.gust : wind;
  const rain = weather.precipitation;
  const lines = [];
  if (typeof gust === "number") lines.push(`Wind is ${Math.round(gust)} mph.`);
  if (typeof rain === "number") lines.push(rain >= 40 ? "Rain is in the forecast." : "No rain is in the forecast.");
  return lines.length ? lines : ["No wind or rain number is posted for this game."];
}

function totalLines(data, game, question) {
  const pick = (data.pickcenter || [])[0] || {};
  const total = pick.overUnder != null ? pick.overUnder : (game.total || {}).line;
  const spread = pick.details || "";
  const lines = [];
  if (total != null && total !== "") lines.push(`The total is ${total}.`);
  if (spread) lines.push(`The spread is ${spread}.`);
  const named = teams(data);
  const pred = data.predictor || {};
  const home = pred.homeTeam || {};
  const away = pred.awayTeam || {};
  if (home.gameProjection && away.gameProjection) {
    lines.push(`ESPN lists a ${away.gameProjection}% win projection for the ${named[String(away.id)] || "away team"} and ${home.gameProjection}% for the ${named[String(home.id)] || "home team"}.`);
  }
  if (/script/.test(String(question || "").toLowerCase())) lines.push("A play-by-play script is not on the public log.");
  return lines.length ? lines : ["The total is not posted yet."];
}

async function meetingLines(data, path) {
  const comps = ((((data.header || {}).competitions || [])[0] || {}).competitors) || [];
  const sides = comps.map((row) => String((row.team || {}).id || "")).filter(Boolean);
  if (sides.length < 2 || !path) return ["Recent games between these teams are not posted."];
  const year = new Date().getFullYear();
  const found = [];
  for (const season of [year, year - 1, year - 2]) {
    let sched = {};
    try { sched = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${sides[0]}/schedule?season=${season}`); }
    catch (err) { continue; }
    for (const ev of sched.events || []) {
      const comp = (ev.competitions || [])[0] || {};
      if (!((comp.status || {}).type || {}).completed) continue;
      const rows = (comp.competitors || []).map((side) => ({
        id: String((side.team || {}).id || ""),
        name: (side.team || {}).shortDisplayName || (side.team || {}).abbreviation || "",
        score: side.score && typeof side.score === "object" ? side.score.displayValue : side.score,
        where: side.homeAway || "",
      }));
      if (!rows.some((row) => row.id === sides[1])) continue;
      found.push({ id: String(ev.id || ev.date || ""), when: Date.parse(ev.date || ""), rows });
    }
  }
  const seen = new Set();
  const games = found.filter((game) => (seen.has(game.id) ? false : seen.add(game.id))).sort((a, b) => b.when - a.when).slice(0, 4);
  if (!games.length) return ["No finished game between these teams is posted from the last three seasons."];
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const lines = games.map((game) => {
    const away = game.rows.find((row) => row.where === "away") || game.rows[0] || {};
    const home = game.rows.find((row) => row.where === "home") || game.rows[1] || {};
    const date = Number.isFinite(game.when) ? when.format(game.when) : "";
    return `${away.name} ${away.score} at ${home.name} ${home.score}${date ? ` on ${date}` : ""}.`;
  });
  return [`Recent games between these teams: ${lines.join(" ")}`];
}

function rivalryLines(game) {
  const parts = String(game.match || "").split(/\s@\s|\sat\s/i);
  const away = String(game.awayName || parts[0] || "").toLowerCase();
  const home = String(game.homeName || parts[1] || "").toLowerCase();
  const hit = RIVALS.some(([a, b]) => (away.includes(a) && home.includes(b)) || (away.includes(b) && home.includes(a)));
  return [hit ? "This matchup is a rivalry." : "This matchup is not on the rivalry list."];
}

async function findEspn(path, match, kickoff) {
  const parts = String(match || "").split(/\s@\s|\sat\s/i).map((part) => part.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter((part) => part.length > 2);
  const stamp = Date.parse(kickoff || "");
  if (parts.length < 2 || !Number.isFinite(stamp)) return "";
  const when = new Date(stamp);
  const et = new Date(when.getTime() - 4 * 3600000);
  const day = `${et.getUTCFullYear()}${String(et.getUTCMonth() + 1).padStart(2, "0")}${String(et.getUTCDate()).padStart(2, "0")}`;
  const data = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}`);
  const hit = (data.events || []).find((event) => {
    const blob = `${event.name || ""} ${event.shortName || ""}`.toLowerCase();
    return parts.every((part) => part.split(" ").some((word) => word.length > 2 && blob.includes(word)));
  });
  return hit ? String(hit.id || "") : "";
}

function topicLines(topic, data, game, question) {
  if (topic === "out") return injuryLines(data);
  if (topic === "rest") return restLines(data, game.kickoff);
  if (topic === "building") return buildingLines(data);
  if (topic === "weather") return weatherLines(data);
  if (topic === "total") return totalLines(data, game, question);
  if (topic === "recent") return [];
  if (topic === "rivalry") return rivalryLines(game);
  return [];
}

function playerName(legs, question) {
  const q = String(question || "").toLowerCase();
  if (!q) return "";
  const names = legs.map((leg) => String(leg.label || "").split(/—|,/)[0].trim()).filter((name) => name.split(" ").length >= 2);
  return names.find((name) => q.includes(name.toLowerCase())) || "";
}

function seasonYear() {
  const now = new Date();
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

function statAt(cat, key, year) {
  const names = cat.names || [];
  const index = names.indexOf(key);
  if (index < 0) return null;
  const row = (cat.statistics || []).find((item) => Number(((item.season || {}).year) || 0) === year);
  const value = row && row.stats ? row.stats[index] : null;
  const number = Number(String(value == null ? "" : value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

async function playerLine(name, sport) {
  const path = PATHS[sport] || "";
  if (!path.startsWith("football/")) return "";
  const league = path.endsWith("/nfl") ? "nfl" : "";
  const found = await getJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player`);
  const hits = (found.items || []).filter((row) => !league || String(row.league || "") === league);
  const athlete = hits.find((row) => String(row.displayName || "").toLowerCase() === name.toLowerCase()) || hits[0];
  if (!athlete || !athlete.id) return "";
  const stats = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${athlete.id}/stats?seasontype=2`);
  const cats = {};
  (stats.categories || []).forEach((cat) => { cats[String(cat.name || "").toLowerCase()] = cat; });
  const year = seasonYear();
  const rush = cats.rushing || {};
  const rec = cats.receiving || {};
  const games = Math.max(statAt(rush, "gamesPlayed", year) || 0, statAt(rec, "gamesPlayed", year) || 0);
  const tds = (statAt(rush, "rushingTouchdowns", year) || 0) + (statAt(rec, "receivingTouchdowns", year) || 0);
  if (!games) return `${name} has no games on the regular-season log this year.`;
  return `${name} has ${tds} touchdown${tds === 1 ? "" : "s"} in ${games} game${games === 1 ? "" : "s"} this regular season.`;
}

function namedClubs(question) {
  const q = String(question || "").toLowerCase();
  const seen = new Set();
  return CLUBS.filter(([nick, abbr]) => {
    if (seen.has(abbr) || !new RegExp(`\\b${nick}\\b`).test(q)) return false;
    seen.add(abbr);
    return true;
  });
}

async function defenseLine(abbr, name) {
  const data = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(abbr.toLowerCase())}/statistics`);
  const rows = {};
  (((data.results || {}).opponent) || []).forEach((row) => { if (row && row.name) rows[row.name] = row; });
  const grab = (cat, key) => {
    const stats = {};
    ((rows[cat] || {}).stats || []).forEach((item) => { if (item && item.name) stats[item.name] = item.value; });
    const value = Number(stats[key]);
    return Number.isFinite(value) ? value : null;
  };
  const shown = (value, digits) => (value == null ? "" : Number(value).toFixed(digits).replace(/\.0$/, ""));
  const ypa = shown(grab("passing", "yardsPerPassAttempt"), 1);
  const passTd = shown(grab("passing", "passingTouchdowns"), 0);
  const ypc = shown(grab("rushing", "yardsPerRushAttempt"), 1);
  const rushTd = shown(grab("rushing", "rushingTouchdowns"), 0);
  const points = shown(grab("scoring", "totalPointsPerGame"), 1);
  const pass = [ypa ? `${ypa} yards a throw` : "", passTd ? `${passTd} passing touchdowns` : ""].filter(Boolean);
  const run = [ypc ? `${ypc} yards a carry` : "", rushTd ? `${rushTd} rushing touchdowns` : ""].filter(Boolean);
  const bits = [];
  if (pass.length) bits.push(`${name} pass defense allows ${pass.join(" and ")}.`);
  if (run.length) bits.push(`${name} run defense allows ${run.join(" and ")}.`);
  if (points) bits.push(`${name} defense allows ${points} points a game.`);
  return bits.join(" ");
}

async function publicNotes(game) {
  const path = PATHS[game.sport];
  if (!path) return [`${matchName(game) || "This game"} is not on the public log.`];
  let espn = String(game.espnId || "");
  if (!espn) {
    try { espn = await findEspn(path, game.match, game.kickoff); } catch (err) { espn = ""; }
  }
  if (!espn) return [`${matchName(game) || "This game"} is not on the public log.`];
  const data = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${espn}`);
  const defense = [];
  if (path === "football/nfl") {
    const sides = (((((data.header || {}).competitions || [])[0] || {}).competitors) || []);
    for (const side of sides) {
      const team = side.team || {};
      if (!team.abbreviation) continue;
      try {
        const line = await defenseLine(team.abbreviation, team.displayName || team.abbreviation);
        if (line) defense.push(line);
      } catch (err) { /* a missing team page stays out of the notes */ }
    }
  }
  const lines = [];
  ["out", "rest", "building", "weather", "total"].forEach((topic) => lines.push(...topicLines(topic, data, game, "")));
  try { lines.push(...await meetingLines(data, path)); } catch (err) { lines.push("Recent games between these teams did not come back."); }
  const title = matchName(game);
  return [[title, ...defense, ...lines].filter(Boolean).join("\n")];
}

function createResearch(readKey) {
  return async function researchBet(body) {
    const legs = Array.isArray(body.legs) ? body.legs.slice(0, 8) : [];
    const question = String(body.question || "").slice(0, 240);
    if (body.attribute === "worth") {
      try {
        return await askBet("Would repeating this bet profit in the long run?", {
          title: String(body.title || "").slice(0, 120),
          copy: [String(body.worth || "The price is not on this bet.").slice(0, 900)],
          locked: true,
          legs: [],
        });
      } catch (error) {
        return { error: error.message || "The bird could not think of that." };
      }
    }
    const all = body.attribute === "all";
    const topics = wanted(body.attribute, question);
    const heads = { out: "Who is out", rest: "Rest", building: "The building", weather: "Wind and rain", total: "The total", recent: "Recent games", rivalry: "Rivalry" };
    const board = (await readKey("bets/board.json")) || {};
    const games = [];
    legs.forEach((leg) => {
      const game = gameFor(leg, board.games || []);
      if (game && !games.some((row) => row.id === game.id)) games.push(game);
    });
    if (!games.length) return { answer: "This bet is not tied to a game on the board." };
    if (!String(body.attribute || "").trim() && question) {
      const notes = [];
      for (const game of games.slice(0, 3)) {
        try { notes.push(...await publicNotes(game)); }
        catch (err) { notes.push(`The public log did not come back for ${matchName(game) || "this game"}.`); }
      }
      for (const [, abbr, club] of namedClubs(question)) {
        if (notes.some((line) => line.includes(`${club} pass defense allows`))) continue;
        try {
          const line = await defenseLine(abbr, club);
          if (line) notes.unshift(line);
        } catch (err) { notes.unshift(`A defense line for ${club} did not come back.`); }
      }
      const named = playerName(legs, question);
      if (named) {
        try {
          const line = await playerLine(named, games[0].sport);
          if (line) notes.push(line);
        } catch (err) { notes.push(`A season line for ${named} did not come back.`); }
      }
      try {
        return await askBet(question, {
          title: String(body.title || "").slice(0, 120),
          aim: String(body.aim || "").slice(0, 240),
          copy: notes,
          legs: legs.map((leg) => ({ name: String(leg.label || "").slice(0, 180) })),
        });
      } catch (error) {
        return { error: error.message || "The bird could not think of that." };
      }
    }
    const name = playerName(legs, question);
    const gap = topics.length ? "" : gapLine(question);
    const lines = [];
    let lead = "";
    if (!topics.length && gap && !name) return { answer: gap };
    if (!topics.length && !name) {
      lead = "Here is what the public log has on this game.";
      topics.push("out", "total", "recent");
    }
    if (name && !body.attribute) {
      try {
        const line = await playerLine(name, games[0].sport);
        if (line) lines.push(line);
      } catch (err) { lines.push(`A season line for ${name} did not come back.`); }
    }
    if (gap) lines.push(gap);
    for (const game of games.slice(0, 3)) {
      if (!topics.length) break;
      const path = PATHS[game.sport];
      if (!path) { lines.push(`${game.match || "This game"} is not on the public log.`); continue; }
      let espn = String(game.espnId || "");
      if (!espn) {
        try { espn = await findEspn(path, game.match, game.kickoff); } catch (err) { espn = ""; }
      }
      if (!espn) { lines.push(`${game.match || "This game"} is not on the public log.`); continue; }
      let data = {};
      try { data = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${espn}`); }
      catch (err) { lines.push(`The public log did not come back for ${game.match || "this game"}.`); continue; }
      const block = [];
      for (const topic of topics) {
        let piece = [];
        if (topic === "recent") {
          try { piece = await meetingLines(data, path); }
          catch (err) { piece = ["Recent games between these teams did not come back."]; }
        } else piece = topicLines(topic, data, game, question);
        const rows = piece.flatMap((line) => String(line).split("\n")).filter(Boolean);
        if (all && rows.length) block.push(`# ${heads[topic] || topic}`, ...rows);
        else block.push(...piece);
      }
      if (all && block.length && games.length > 1) lines.push(`# ${matchName(game) || "This game"}`, ...block);
      else if (all && block.length) lines.push(...block);
      const grouped = block.some((line) => line.includes("\n"));
      if (!all && games.length > 1 && block.length) {
        const title = matchName(game) || "This game";
        lines.push(grouped ? `${title}\n${block.join("\n")}` : `${title}. ${block.join(" ")}`);
      } else if (!all) lines.push(...block);
    }
    const broken = lines.some((line) => line.includes("\n"));
    const answer = [lead, ...lines].filter(Boolean).join(all || broken ? "\n" : " ");
    return { answer: answer || "The public log does not have that for this game." };
  };
}

module.exports = { createResearch };
