/** Player names on the slate Build a bet is using. */

function who(leg) {
  return String(leg.runner || leg.label || "").split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim().toLowerCase();
}

function playerNames(pools) {
  const names = new Map();
  const skip = /\b(and|or|the|each|half|to|record|score|in|a|an|both|teams)\b/i;
  (pools || []).forEach((row) => {
    (row[1] || []).forEach((leg) => {
      const key = who(leg);
      const words = key.split(" ").filter(Boolean);
      if (words.length < 2 || words.length > 3 || skip.test(key) || names.has(key)) return;
      const shown = String(leg.runner || leg.label || "").split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim();
      names.set(key, shown || key);
    });
  });
  return { players: [...names].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)) };
}

function rank(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return -1;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function bookOf(pools) {
  const people = new Map();
  const skip = /\b(and|or|the|each|half|to|record|score|in|a|an|both|teams)\b/i;
  function put(key, name, kind, bet) {
    if (!key || !name || !bet || !Number.isFinite(Number(bet.odds)) || Number(bet.odds) === 0) return;
    const row = people.get(key) || { key, name, kind, bets: [] };
    const id = `${bet.label}|${bet.odds}|${bet.match}`;
    if (row.bets.some((item) => `${item.label}|${item.odds}|${item.match}` === id)) return;
    row.bets.push({ label: String(bet.label), odds: Number(bet.odds), market: String(bet.market || ""), match: String(bet.match || ""), sport: String(bet.sport || ""), kickoff: String(bet.kickoff || "") });
    people.set(key, row);
  }
  (pools || []).forEach(([game, legs]) => {
    const away = String(game.awayName || (game.match || "").split(" @ ")[0] || "").trim();
    const home = String(game.homeName || (game.match || "").split(" @ ")[1] || "").trim();
    const teams = [away, home].filter(Boolean).map((name) => ({ key: `team:${name.toLowerCase()}`, name }));
    const where = { match: game.match || [away, home].filter(Boolean).join(" @ "), sport: game.sport || "", kickoff: game.kickoff || "" };
    const spread = game.spread || {};
    const money = game.moneyline || {};
    const total = game.total || {};
    function side(name, line, odds, market) {
      if (odds == null || odds === "") return;
      const shown = line === "" || line == null ? `${name} ${market}` : `${name} ${line}`;
      put(`team:${name.toLowerCase()}`, name, "team", { ...where, label: shown, odds, market });
    }
    if (away) { if (spread.awayLine != null) side(away, Number(spread.awayLine) > 0 ? `+${spread.awayLine}` : spread.awayLine, spread.awayOdds, "Spread"); side(away, "", money.awayOdds, "Moneyline"); }
    if (home) { if (spread.homeLine != null) side(home, Number(spread.homeLine) > 0 ? `+${spread.homeLine}` : spread.homeLine, spread.homeOdds, "Spread"); side(home, "", money.homeOdds, "Moneyline"); }
    const tot = Number(total.line);
    if (Number.isFinite(tot)) {
      teams.forEach((team) => {
        if (total.overOdds != null) put(team.key, team.name, "team", { ...where, label: `Over ${tot}`, odds: total.overOdds, market: "Total" });
        if (total.underOdds != null) put(team.key, team.name, "team", { ...where, label: `Under ${tot}`, odds: total.underOdds, market: "Total" });
      });
    }
    (legs || []).forEach((leg) => {
      const blob = `${leg.runner || ""} ${leg.label || ""} ${leg.market || ""}`;
      const team = teams.find((item) => { const name = item.name.toLowerCase(); const nick = name.split(/\s+/).pop().replace(/[^a-z]/g, ""); return blob.toLowerCase().includes(name) || (nick.length > 3 && blob.toLowerCase().includes(nick)); });
      const bet = { ...where, label: String(leg.label || leg.runner || ""), odds: leg.odds, market: leg.market || "" };
      if (team) { put(team.key, team.name, "team", bet); return; }
      const key = who(leg).replace(/\s+to\b.*$/, "").trim();
      const words = key.split(" ").filter(Boolean);
      const shown = String(leg.runner || leg.label || "").split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").replace(/\s+to\b.*$/i, "").trim();
      if (words.length < 2 || words.length > 3 || skip.test(key) || /^(over|under)\b/i.test(key) || /[()]/.test(shown)) return;
      put(key, shown || key, "player", bet);
    });
  });
  return {
    people: [...people.values()].map((row) => { row.bets.sort((a, b) => rank(b.odds) - rank(a.odds)); row.bets = row.bets.slice(0, 200); return row; }).filter((row) => row.bets.length).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const bookCache = new Map();

function etDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(ms);
}

function inSpan(game, span) {
  const kick = Date.parse(game.kickoff || "");
  if (!Number.isFinite(kick) || kick <= Date.now()) return false;
  if (span !== "today" && span !== "week") return true;
  const day = etDay(kick);
  const today = etDay(Date.now());
  if (span === "today") return day === today;
  return day > today && day <= etDay(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

async function nameBook(games, offerLegs, span) {
  const now = Date.now();
  const open = (games || []).filter((game) => inSpan(game, span));
  const key = `${span || "all"}:${open.map((game) => String(game.id || "")).sort().join(",")}`;
  const saved = bookCache.get(key);
  if (saved && now - saved.at < 30 * 60 * 1000) return saved.book;
  const pools = [];
  for (let i = 0; i < open.length; i += 8) {
    const chunk = await Promise.all(open.slice(i, i + 8).map(async (game) => {
      try { const offer = await offerLegs(game); return [game, offer.rows || []]; } catch (error) { return [game, []]; }
    }));
    pools.push(...chunk);
  }
  const book = bookOf(pools);
  book.checked = open.length;
  bookCache.set(key, { at: now, book });
  return book;
}

const clubCache = new Map();

async function playerClub(raw) {
  const q = String(raw || "").replace(/\s+/g, " ").trim();
  const want = q.toLowerCase();
  if (want.split(" ").length < 2) return { clubs: [] };
  if (clubCache.has(want)) return clubCache.get(want);
  let data = {};
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=8&type=player`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
    if (res.ok) data = await res.json();
  } catch (error) { data = {}; }
  const clubs = [];
  const seen = new Set();
  for (const item of data.items || []) {
    const name = String(item && item.displayName || "");
    if (!name || item.isActive === false || !name.toLowerCase().includes(want)) continue;
    const team = String(((item.teamRelationships || [])[0] || {}).displayName || "");
    if (!team || seen.has(team.toLowerCase())) continue;
    seen.add(team.toLowerCase());
    clubs.push({ player: name, team });
  }
  const found = { clubs };
  clubCache.set(want, found);
  return found;
}

const rosterCache = new Map();
const LEAGUE = { mlb: "mlb", nfl: "nfl", nba: "nba", nhl: "nhl", wnba: "wnba", baseball: "mlb", football: "nfl", basketball: "nba", hockey: "nhl" };

async function teamRoster(raw, sport) {
  const want = String(raw || "").replace(/\s+/g, " ").trim().toLowerCase();
  const league = LEAGUE[String(sport || "").toLowerCase()] || "";
  const key = `${want}|${league}`;
  if (!want) return { players: [] };
  if (rosterCache.has(key)) return rosterCache.get(key);
  const found = { players: [] };
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(want)}&limit=5&type=team`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
    const data = res.ok ? await res.json() : {};
    const team = (data.items || []).find((item) => String(item.displayName || "").toLowerCase() === want && (!league || String(item.league || "") === league));
    if (team) {
      const page = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.league}/teams/${team.id}/roster`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
      const roster = page.ok ? await page.json() : {};
      for (const group of roster.athletes || []) {
        for (const item of group.items || (group.displayName ? [group] : [])) {
          const name = String(item.displayName || item.fullName || "").trim();
          if (name && String((item.status && item.status.type) || "active") !== "inactive") found.players.push(name);
        }
      }
    }
  } catch (error) { found.players = []; }
  rosterCache.set(key, found);
  return found;
}

module.exports = { playerNames, nameBook, playerClub, teamRoster };
