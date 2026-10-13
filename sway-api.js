/** History against this opponent for a built bet. The FanDuel price stays the price. */

const PATHS = {
  NFL: ["football", "nfl"], NBA: ["basketball", "nba"], WNBA: ["basketball", "wnba"],
  MLB: ["baseball", "mlb"], NHL: ["hockey", "nhl"],
};
const CACHE = new Map();
const TTL = 12 * 60 * 60 * 1000;

async function addSway(legs, games) {
  const byId = new Map((games || []).map((game) => [String(game.id || ""), game]));
  for (const leg of legs || []) {
    const game = byId.get(String(leg.gameId || "")) || findGame(leg, games || []);
    try {
      const row = await describe(leg, game);
      if (row.fact) {
        leg.fact = row.fact;
        leg.sway = row.sway;
        leg.historyHits = row.hits;
        leg.historyN = row.count;
      }
      if (row.form) leg.form = row.form;
    } catch (error) {
      continue;
    }
  }
}

async function describe(leg, game) {
  if (!game) return blank();
  const sport = String(leg.sport || game.sport || "");
  const path = PATHS[sport];
  const text = `${leg.market || ""} ${leg.label || ""} ${leg.runner || ""}`;
  const spec = readSpec(text);
  if (!path || !spec) return blank();
  const line = readLine(text, spec.fixed);
  const name = playerName(leg.runner || "", leg.label || "");
  const [away, home] = teams(game);
  if (line == null || !name || !away || !home) return blank();
  const pack = await playerLog(sport, path, name);
  if (!pack || !pack.team) return blank();
  const form = formLine(pack, spec, line, name);
  const opponent = otherSide(pack.team, away, home);
  if (!opponent) return blank(form);
  const played = meetings(pack, spec.keys, opponent);
  if (played.length < 2) return blank(form);
  const hits = played.filter((value) => value >= line).length;
  const nick = nickname(opponent);
  const shown = Number.isInteger(line) ? line : line;
  const fact = spec.fixed && line === 1
    ? `Scored a touchdown against the ${nick} in ${hits} of the last ${played.length}.`
    : `${shown}+ ${spec.noun} against the ${nick} in ${hits} of the last ${played.length}.`;
  return { fact, sway: swayText(hits, played.length, leg.odds), hits, count: played.length, form };
}

function blank(form) {
  return { fact: "", sway: "", hits: 0, count: 0, form: form || "" };
}

function formLine(pack, spec, line, name) {
  const values = recentValues(pack, spec.keys);
  if (values.length < 3) return "";
  const hits = values.filter((value) => value >= line).length;
  const shown = Number.isInteger(line) ? line : line;
  const did = spec.fixed && line === 1 ? "scored a touchdown" : `cleared ${shown}+ ${spec.noun}`;
  const who = nickname(name);
  return formWords(hits, values.length, `${who} ${did} in ${hits} of the last ${values.length}`);
}

function recentValues(pack, keys) {
  const names = pack.names || [];
  const indexes = keys.map((key) => names.indexOf(key)).filter((index) => index >= 0);
  if (!indexes.length) return [];
  const found = [];
  (pack.rows || []).forEach((row) => {
    if (found.length >= 5) return;
    const values = indexes.map((index) => statValue((row.stats || [])[index], names[index]));
    if (values.some((value) => value == null)) return;
    found.push(values.reduce((sum, value) => sum + value, 0));
  });
  return found;
}

function formWords(hits, count, phrase) {
  const rate = count ? hits / count : 0;
  const label = rate >= 0.8 ? "In form" : rate <= 0.25 ? "Cold" : "Mixed";
  return `${label}: ${phrase}.`;
}

function readSpec(text) {
  const low = text.toLowerCase();
  if (low.includes("touchdown")) return { keys: ["receivingTouchdowns", "rushingTouchdowns"], noun: "touchdown", fixed: true };
  if (low.includes("receiving") && (low.includes("yard") || low.includes("yds"))) return { keys: ["receivingYards"], noun: "receiving yards", fixed: false };
  if (low.includes("rushing") && (low.includes("yard") || low.includes("yds"))) return { keys: ["rushingYards"], noun: "rushing yards", fixed: false };
  if (low.includes("passing") && (low.includes("yard") || low.includes("yds"))) return { keys: ["passingYards"], noun: "passing yards", fixed: false };
  if (low.includes("reception")) return { keys: ["receptions"], noun: "receptions", fixed: false };
  if (low.includes("shots on goal") || /\bshots\b/.test(low)) return { keys: ["shotsTotal"], noun: "shots on goal", fixed: false };
  if (low.includes("made three") || low.includes("threes")) return { keys: ["threePointFieldGoalsMade-threePointFieldGoalsAttempted"], noun: "made threes", fixed: false };
  if (low.includes("rebound")) return { keys: ["totalRebounds"], noun: "rebounds", fixed: false };
  if (low.includes("assist")) return { keys: ["assists"], noun: "assists", fixed: false };
  if (low.includes("strikeout")) return { keys: ["strikeouts"], noun: "strikeouts", fixed: false };
  if (/\bhits?\b/.test(low)) return { keys: ["hits"], noun: "hits", fixed: false };
  if (low.includes("home run")) return { keys: ["homeRuns"], noun: "home runs", fixed: false };
  if (/\bgoals?\b/.test(low)) return { keys: ["goals"], noun: "goals", fixed: false };
  if (/\bpoints?\b/.test(low)) return { keys: ["points"], noun: "points", fixed: false };
  return null;
}

function readLine(text, fixed) {
  const found = text.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (found) return Number(found[1]);
  return fixed ? 1 : null;
}

function playerName(runner, label) {
  const text = String(runner).replace(/\s+\d.*$/, "").trim();
  if (text && !/\d/.test(text)) return text;
  const found = String(label).match(/^(.+?)\s+\d/);
  return found ? found[1].trim() : "";
}

function teams(game) {
  if (game.awayName && game.homeName) return [game.awayName, game.homeName];
  const match = String(game.match || "");
  if (match.includes(" @ ")) return match.split(" @ ").map((part) => part.trim());
  return ["", ""];
}

function sameName(left, right) {
  const a = String(left).toLowerCase().split(/\s+/);
  const b = String(right).toLowerCase().split(/\s+/);
  return a.length && b.length && a[a.length - 1] === b[b.length - 1] && a[a.length - 1].length > 3;
}

function otherSide(team, away, home) {
  if (sameName(team, away)) return home;
  if (sameName(team, home)) return away;
  return "";
}

function nickname(name) {
  const word = String(name).split(/\s+/).pop() || name;
  if (word.toLowerCase() === "49ers") return "49ers";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function swayText(hits, count, odds) {
  const price = implied(odds);
  if (count < 2 || !price) return "";
  const gap = Math.round((hits / count - price) * 100);
  if (count < 3 || Math.abs(gap) < 8) return "That history sits close to the FanDuel price.";
  return `Estimated sway: history sits ${Math.abs(gap)} points ${gap > 0 ? "above" : "below"} the FanDuel price.`;
}

function implied(odds) {
  const n = Number(odds);
  if (!n) return 0;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

function meetings(pack, keys, opponent) {
  const names = pack.names || [];
  const indexes = keys.map((key) => names.indexOf(key)).filter((index) => index >= 0);
  if (!indexes.length) return [];
  const found = [];
  (pack.rows || []).forEach((row) => {
    if (found.length >= 6 || !sameName(row.opponent, opponent)) return;
    const values = indexes.map((index) => statValue((row.stats || [])[index], names[index]));
    if (values.some((value) => value == null)) return;
    found.push(values.reduce((sum, value) => sum + value, 0));
  });
  return found;
}

function statValue(raw, key) {
  let text = String(raw == null ? "" : raw).trim();
  if (!text || text === "-" || text === "—") return null;
  if (text.includes("-") && String(key).includes("Made-")) text = text.split("-")[0];
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

async function playerLog(sport, path, name) {
  const key = `${sport}|${name.toLowerCase()}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached;
  const found = await search(name, path[0], path[1]);
  if (!found) return remember(key, "", [], []);
  let [names, rows, year] = await season(path[0], path[1], found.id, null);
  if (year && rows.length < 8) {
    const older = await season(path[0], path[1], found.id, year - 1);
    names = names.length ? names : older[0];
    const seen = new Set(rows.map((row) => `${row.date}|${row.opponent}`));
    rows = rows.concat(older[1].filter((row) => !seen.has(`${row.date}|${row.opponent}`)));
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  return remember(key, found.team, names, rows.slice(0, 80));
}

function remember(key, team, names, rows) {
  const pack = { at: Date.now(), team, names, rows };
  CACHE.set(key, pack);
  return pack;
}

async function search(name, sportName, league) {
  const data = await getJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player`);
  const hits = (data.items || []).filter((item) => item.league === league);
  const picked = hits.find((item) => String(item.displayName || "").toLowerCase() === name.toLowerCase()) || (hits.length === 1 ? hits[0] : null);
  if (!picked) return null;
  const sport = picked.sport || sportName;
  const page = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/${sport}/${league}/athletes/${picked.id}`);
  const team = page.athlete && page.athlete.team && page.athlete.team.displayName;
  return team ? { id: String(picked.id), team } : null;
}

async function season(sport, league, athleteId, year) {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/${sport}/${league}/athletes/${athleteId}/gamelog${year ? `?season=${year}` : ""}`;
  const data = await getJson(url);
  const names = data.names || [];
  const events = data.events || {};
  const rows = [];
  (data.seasonTypes || []).forEach((block) => {
    (block.categories || []).forEach((cat) => {
      (cat.events || []).forEach((item) => {
        const event = events[String(item.eventId)] || {};
        const opponent = event.opponent && event.opponent.displayName;
        if (opponent) rows.push({ date: event.gameDate || "", opponent, stats: item.stats || [] });
      });
    });
  });
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const filter = (data.filters || []).find((item) => item.name === "season");
  const current = filter && filter.options && filter.options[0] ? Number(filter.options[0].value) || 0 : 0;
  return [names, rows, current];
}

function findGame(leg, games) {
  const text = String(leg.label || "").toLowerCase();
  const hits = games.filter((game) => {
    const [away, home] = teams(game);
    return away && home && text.includes(away.toLowerCase()) && text.includes(home.toLowerCase());
  });
  return hits.length === 1 ? hits[0] : null;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json", Referer: "https://www.espn.com/" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

module.exports = { addSway };
