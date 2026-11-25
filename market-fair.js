/** Juice-free price from the free nine-book feed. No key means the desk stays on FanDuel. */

const BOOKS = ["fanduel", "draftkings", "betmgm", "caesars", "espnbet", "bovada", "unibet", "pointsbet", "williamhill"];
const OUTSIDE = BOOKS.filter((book) => book !== "fanduel");
const LEDGER = "bets/market-fair/ledger";
const DAY_CAP = 80;
const STATS = [
  [/passing touchdowns|passing tds/, "passing_touchdowns"],
  [/passing yards|passing yds/, "passing_yards"],
  [/rushing yards|rushing yds/, "rushing_yards"],
  [/receiving yards|receiving yds/, "receiving_yards"],
  [/receptions/, "receiving_receptions"],
  [/made threes|\bthrees\b/, "threePointersMade"],
  [/rebounds/, "rebounds"],
  [/shots on goal/, "shots_onGoal"],
];

function hasKey() {
  return !!String(process.env.SPORTSGAMEODDS_API_KEY || "").trim();
}

function fold(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9.+ ]/g, " ").replace(/\s+/g, " ").trim();
}

function chance(odds) {
  const n = Number(String(odds == null ? "" : odds).replace("+", ""));
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function statOf(pick, sport) {
  const text = fold(`${pick.market || ""} ${pick.label || ""} ${pick.text || ""}`);
  const hit = STATS.find(([test]) => test.test(text));
  if (hit) return hit[1];
  if (sport === "NHL" && /\bgoals\b/.test(text)) return "points";
  if (sport === "NHL" && /\bpoints\b/.test(text)) return "goals+assists";
  if (/\bassists\b/.test(text)) return "assists";
  if (/\bpoints\b/.test(text)) return "points";
  return "";
}

function lineOf(pick) {
  const text = `${pick.label || ""} ${pick.market || ""} ${pick.text || ""}`;
  const over = text.match(/over\s+(\d+(?:\.\d+)?)/i);
  const plus = text.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (over) return { line: Number(over[1]), plus: false };
  if (plus) return { line: Number(plus[1]), plus: true };
  const reach = Number(pick.reach);
  return Number.isFinite(reach) ? { line: reach, plus: /\d\s*\+/.test(text) } : null;
}

function sameLine(overUnder, want) {
  const n = Number(overUnder);
  if (!Number.isFinite(n) || !want) return false;
  if (Math.abs(n - want.line) < 0.01) return true;
  return !!(want.plus && Math.abs(n - (want.line - 0.5)) < 0.01);
}

function whoMatch(pick, odd) {
  const parts = fold(pick.who || "").split(" ").filter((word) => word && !/^(jr|sr|ii|iii|iv|v)$/.test(word));
  if (parts.length < 2) return false;
  const blob = fold(`${odd.playerID || ""} ${odd.marketName || ""}`.replace(/_/g, " "));
  return blob.includes(parts[0]) && blob.includes(parts[parts.length - 1]);
}

function sameGame(match, event) {
  const teams = event && event.teams;
  const names = [teams && teams.away && teams.away.names && teams.away.names.long, teams && teams.home && teams.home.names && teams.home.names.long].map(fold).filter(Boolean);
  const text = fold(match);
  return names.length === 2 && names.every((name) => text.includes(name));
}

function sideAt(book, want) {
  if (!book || book.available === false) return null;
  const rows = [{ overUnder: book.overUnder, odds: book.odds }].concat(Array.isArray(book.altLines) ? book.altLines : []);
  return rows.find((row) => row && row.odds && sameLine(row.overUnder, want)) || null;
}

function fairPrice(pick, event, sport) {
  const stat = statOf(pick, sport);
  const want = lineOf(pick);
  const odds = event && event.odds;
  if (!stat || !want || !odds) return null;
  const rows = Object.values(odds);
  const overs = rows.filter((odd) => odd && odd.sideID === "over" && odd.betTypeID === "ou" && odd.periodID === "game" && odd.statID === stat && whoMatch(pick, odd));
  const byBook = new Map();
  overs.forEach((over) => {
    const under = rows.find((odd) => odd && (odd.oddID === over.opposingOddID || (odd.sideID === "under" && odd.statID === stat && odd.playerID === over.playerID && odd.periodID === "game")));
    if (!under || !under.byBookmaker || !over.byBookmaker) return;
    OUTSIDE.forEach((book) => {
      if (byBook.has(book)) return;
      const left = sideAt(over.byBookmaker[book], want);
      const right = sideAt(under.byBookmaker[book], want);
      const o = left && chance(left.odds);
      const u = right && chance(right.odds);
      if (o > 0 && u > 0) byBook.set(book, o / (o + u));
    });
  });
  if (byBook.size < 2) return null;
  const values = [...byBook.values()];
  const fair = Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10000) / 10000;
  return { fair, fairBooks: byBook.size, names: [...byBook.keys()], fairEx: true };
}

function dayKey(now) {
  return new Date(now || Date.now()).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function readLedger(kv, now) {
  const rows = await kv(`?k=eq.${encodeURIComponent(LEDGER)}&select=v`);
  const saved = rows && rows[0] && rows[0].v;
  const day = dayKey(now);
  const games = (saved && saved.games) || {};
  Object.keys(games).forEach((key) => {
    const kick = Date.parse(games[key] && games[key].kickoff);
    if (Number.isFinite(kick) && now - kick > 3 * 86400000) delete games[key];
  });
  return { day, used: saved && saved.day === day ? Number(saved.used) || 0 : 0, games };
}

async function writeLedger(kv, ledger) {
  await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: LEDGER, v: ledger } });
}

function need(slot, kickoff, now) {
  const kick = Date.parse(kickoff);
  if (!Number.isFinite(kick) || kick <= now) return "";
  if (!slot || !slot.first) return "first";
  if (!slot.ex) return "ex";
  if (kick - now < 3600000 && !slot.close) return "close";
  return "";
}

async function fetchLeague(league) {
  const url = new URL("https://api.sportsgameodds.com/v2/events");
  const odds = ["passing_touchdowns", "passing_yards", "rushing_yards", "receiving_yards", "receiving_receptions", "points", "rebounds", "assists", "threePointersMade", "shots_onGoal", "goals+assists"].map((stat) => `${stat}-PLAYER_ID-game-ou-over`).join(",");
  url.searchParams.set("apiKey", String(process.env.SPORTSGAMEODDS_API_KEY).trim());
  url.searchParams.set("leagueID", league);
  url.searchParams.set("oddsAvailable", "true");
  url.searchParams.set("ended", "false");
  url.searchParams.set("limit", "20");
  url.searchParams.set("bookmakerID", BOOKS.join(","));
  url.searchParams.set("oddID", odds);
  url.searchParams.set("includeOpposingOdds", "true");
  url.searchParams.set("includeAltLines", "true");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`fair feed ${response.status}`);
  const body = await response.json();
  return Array.isArray(body && body.data) ? body.data : [];
}

module.exports = { hasKey, fairPrice, readLedger, writeLedger, need, fetchLeague, sameGame, LEDGER, DAY_CAP };
