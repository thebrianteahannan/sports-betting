const https = require("https");

const TTL = 6 * 3600 * 1000;
const cache = new Map();
const answered = new Map();
const PATHS = {
  NBA: "basketball/nba", WNBA: "basketball/wnba", NFL: "football/nfl",
  MLB: "baseball/mlb", NHL: "hockey/nhl",
};
const BOOKS = {
  basketball: {
    points: ["points"], rebounds: ["totalRebounds"], assists: ["assists"],
    steals: ["steals"], blocks: ["blocks"], threes: ["threePointFieldGoalsMade*"],
  },
  football: {
    "receiving yards": ["receivingYards"], "rushing yards": ["rushingYards"], receptions: ["receptions"],
    "passing yards": ["passingYards"], "passing touchdowns": ["passingTouchdowns"],
    "receiving touchdowns": ["receivingTouchdowns"], "rushing touchdowns": ["rushingTouchdowns"],
    touchdowns: ["rushingTouchdowns", "receivingTouchdowns"],
  },
  baseball: {
    hits: ["hits"], "home runs": ["homeRuns"], rbis: ["RBIs"], runs: ["runs"],
    strikeouts: ["strikeouts"], "stolen bases": ["stolenBases"],
  },
  hockey: { goals: ["goals"], assists: ["assists"], points: ["points"], shots: ["shotsTotal"] },
};
const WORDS = [
  [/receiving touchdowns?|rec(?:eiving)? tds?/, "receiving touchdowns"],
  [/rushing touchdowns?|rush tds?/, "rushing touchdowns"],
  [/passing touchdowns?|pass tds?/, "passing touchdowns"],
  [/touchdowns?|\btds?\b/, "touchdowns"],
  [/receiving yards?|rec(?:eiving)? yds?/, "receiving yards"],
  [/rushing yards?|rush yds?/, "rushing yards"],
  [/passing yards?|pass yds?/, "passing yards"],
  [/receptions?/, "receptions"],
  [/home runs?|\bhrs?\b/, "home runs"],
  [/stolen bases?/, "stolen bases"],
  [/strikeouts?|punch ?outs?/, "strikeouts"],
  [/\brbis?\b/, "rbis"],
  [/\bruns?\b/, "runs"],
  [/\bhits?\b/, "hits"],
  [/threes?|3pt|three pointers?/, "threes"],
  [/rebounds?|\brebs?\b/, "rebounds"],
  [/assists?|\basts?\b/, "assists"],
  [/steals?|\bstls?\b/, "steals"],
  [/blocks?|\bblks?\b/, "blocks"],
  [/points?|\bpts?\b/, "points"],
  [/shots?/, "shots"],
  [/goals?/, "goals"],
];

function getJson(url) {
  const saved = cache.get(url);
  if (saved && Date.now() - saved.at < TTL) return Promise.resolve(saved.data);
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "parlay-desk", Referer: "https://www.espn.com/" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          cache.set(url, { at: Date.now(), data });
          resolve(data);
        } catch (err) { resolve(null); }
      });
    });
    req.setTimeout(12000, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

function familyOf(path) {
  if (path.startsWith("basketball")) return "basketball";
  if (path.startsWith("football")) return "football";
  if (path.startsWith("baseball")) return "baseball";
  return "hockey";
}

function person(text) {
  const name = String(text || "").replace(/\s+(over|under)$/i, "").trim();
  const bits = name.split(/\s+/);
  if (bits.length < 2 || /quarter|half|milestone|\balt\b|team|either|\byes\b|\bno\b/i.test(name)) return "";
  return name;
}

function playerName(leg) {
  const named = person(leg.player);
  if (named) return named;
  const head = String(leg.label || "").split(/\s+—\s+|\n/)[0];
  const cut = head.replace(/\s+(over|under)\b.*$/i, "").replace(/\s+\d.*$/, "").replace(/,.*$/, "").trim();
  return person(cut);
}

function statsIn(piece, book) {
  const found = [];
  WORDS.forEach(([pattern, key]) => {
    const hit = book[key] && piece.match(pattern);
    if (hit && !found.some((item) => item.key === key)) found.push({ key, at: hit.index });
  });
  return found.sort((a, b) => a.at - b.at).map((item) => item.key);
}

function phraseOf(plus, over, line, keys) {
  const shown = Number.isInteger(line) ? String(line) : String(line);
  const names = keys.map((key) => (key === "rbis" ? "RBIs" : key === "threes" ? "threes" : key));
  const list = names.length < 2 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  if (!over) return `under ${shown} ${list}`;
  return plus ? `${shown}+ ${list}` : `over ${shown} ${list}`;
}

function parseProp(leg) {
  const path = PATHS[String(leg.sport || "").toUpperCase()];
  if (!path) return null;
  const label = String(leg.label || "");
  const market = String(leg.market || "");
  const blob = `${label} ${market}`.toLowerCase();
  if (/\b(1st|2nd|3rd|4th)\b|\bquarter\b|\bhalf\b|\bperiod\b|\binning\b|yard reception|per game/.test(blob)) return null;
  const name = playerName(leg);
  const hit = blob.match(/(over|under)\s+(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*\+/);
  if (!name || !hit) return null;
  const plus = !hit[1];
  const over = hit[1] !== "under";
  const line = Number(hit[2] || hit[3]);
  const piece = blob.slice(blob.search(hit[0]) + hit[0].length);
  const keys = statsIn(piece, BOOKS[familyOf(path)]);
  if (!keys.length || !Number.isFinite(line)) return null;
  const cols = [...new Set(keys.flatMap((key) => BOOKS[familyOf(path)][key]))];
  return { name, path, cols, line, over, plus, phrase: phraseOf(plus, over, line, keys) };
}

function num(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text === "-" || text === "--") return null;
  const made = text.match(/^(\d+)\s*-\s*\d+/);
  if (made) return Number(made[1]);
  const number = Number(text.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function played(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text === "-" || text === "0" || text === "0:00") return false;
  if (text.includes(":")) return true;
  const number = Number(text);
  return Number.isFinite(number) && number > 0;
}

function colIndex(names, col) {
  if (col.endsWith("*")) {
    const prefix = col.slice(0, -1);
    return names.findIndex((name) => String(name).startsWith(prefix));
  }
  return names.indexOf(col);
}

function tally(data, parsed) {
  if (!data) return null;
  const names = data.names || [];
  const idx = parsed.cols.map((col) => colIndex(names, col));
  if (idx.some((index) => index < 0)) return null;
  const minutes = names.indexOf("minutes");
  const seen = new Set();
  let games = 0, sum = 0, hit = 0;
  (data.seasonTypes || []).forEach((season) => {
    (season.categories || []).forEach((cat) => {
      const bag = `${season.displayName || ""} ${cat.displayName || ""}`;
      if (/preseason|all-star|play-?in|postseason|playoff/i.test(bag)) return;
      (cat.events || []).forEach((item) => {
        const id = String(item.eventId || "");
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        const stats = item.stats || [];
        if (minutes >= 0 && !played(stats[minutes])) return;
        const parts = idx.map((index) => num(stats[index]));
        if (parts.some((part) => part == null)) return;
        const total = parts.reduce((acc, part) => acc + part, 0);
        games += 1;
        sum += total;
        const made = !parsed.over ? total < parsed.line : parsed.plus ? total >= parsed.line : total > parsed.line;
        if (made) hit += 1;
      });
    });
  });
  return { games, sum, hit };
}

function seasonYears(data) {
  const filter = ((data || {}).filters || []).find((item) => item.name === "season");
  const years = [];
  ((filter || {}).options || []).forEach((option) => {
    const year = Number(option.value);
    if (Number.isFinite(year)) years.push(year);
  });
  return years;
}

async function gamelog(path, athlete, year) {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${athlete}/gamelog${year ? `?season=${year}` : ""}`;
  return getJson(url);
}

async function findPlayer(parsed) {
  const key = `who:${parsed.path}:${parsed.name.toLowerCase()}`;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.at < TTL) return saved.data;
  const data = await getJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(parsed.name)}&limit=5&type=player`);
  const league = parsed.path.split("/")[1];
  const hits = ((data || {}).items || []).filter((row) => String(row.league || "") === league);
  const exact = hits.find((row) => String(row.displayName || "").toLowerCase() === parsed.name.toLowerCase());
  const athlete = exact || (hits.length === 1 ? hits[0] : null);
  const id = athlete && athlete.id ? String(athlete.id) : "";
  cache.set(key, { at: Date.now(), data: id });
  return id;
}

async function pool(items, size, job) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await job(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function pace(row) {
  if (!row || !row.games) return "no games";
  const text = (Math.round((row.sum / row.games) * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return `${text} per game in ${row.games}`;
}

function gamesLine(row, phrase, lead) {
  if (!row || !row.games) return lead ? "no games" : "";
  if (!lead) return String(row.hit);
  const word = row.hit === 1 ? "game" : "games";
  const glue = /^\d/.test(phrase) ? " with" : "";
  return `${row.hit} ${word}${glue} ${phrase}`;
}

function say(parsed, now, last, career) {
  const avg = `${pace(now)} this year, ${pace(last)} last year, ${pace(career)} career`;
  const bits = [["now", now], ["last", last], ["career", career]].map(([tail, row], index) => {
    const text = gamesLine(row, parsed.phrase, index === 0);
    return text ? `${text} ${tail === "now" ? "this year" : tail === "last" ? "last year" : "career"}` : "";
  }).filter(Boolean);
  return { avg, games: bits.join(", ") };
}

async function one(leg) {
  const parsed = parseProp(leg);
  if (!parsed) return null;
  const key = `${parsed.path}|${parsed.name.toLowerCase()}|${parsed.cols.join("+")}|${parsed.line}|${parsed.over}|${parsed.plus}`;
  const saved = answered.get(key);
  if (saved && Date.now() - saved.at < saved.ttl) return saved.row;
  const athlete = await findPlayer(parsed);
  const current = athlete ? await gamelog(parsed.path, athlete, 0) : null;
  const now = tally(current, parsed);
  let row = null;
  if (athlete && now) {
    const years = seasonYears(current).slice(1);
    const older = await pool(years, 4, async (year) => tally(await gamelog(parsed.path, athlete, year), parsed));
    const last = older[0] && older[0].games ? older[0] : { games: 0, sum: 0, hit: 0 };
    const career = [now, ...older].reduce((acc, item) => {
      if (!item) return acc;
      acc.games += item.games;
      acc.sum += item.sum;
      acc.hit += item.hit;
      return acc;
    }, { games: 0, sum: 0, hit: 0 });
    row = say(parsed, now, last, career);
  }
  answered.set(key, { at: Date.now(), row, ttl: row ? TTL : 10 * 60 * 1000 });
  return row;
}

async function propLog(body) {
  const legs = Array.isArray(body && body.legs) ? body.legs.slice(0, 4) : [];
  const lines = [];
  for (const leg of legs) lines.push(await one(leg).catch(() => null));
  return { lines };
}

module.exports = { propLog, parseProp };
