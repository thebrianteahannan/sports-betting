/** When player props first show up, and the usual time they land before tip. */

const KEY = "bets/line-clock";
const SPORTS = ["NBA", "NFL", "NHL", "MLB"];
const HOUR = 3600000;
const FRESH = HOUR;
let clock = { games: {}, hours: {} };
let loaded = false;
let ticking = false;

function keyOf(game) {
  return `${game.match}|${game.kickoff}`;
}

async function ready() {
  if (loaded) return clock;
  const { kv } = require("./live-recs");
  try {
    const rows = await kv(`?k=eq.${encodeURIComponent(KEY)}&select=v`);
    const saved = rows && rows[0] && rows[0].v;
    if (saved && typeof saved === "object") clock = { games: saved.games || {}, hours: saved.hours || {} };
  } catch (error) {
    console.error("line clock load failed:", error);
  }
  loaded = true;
  return clock;
}

function save() {
  const { kv } = require("./live-recs");
  kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY, v: clock } }).catch((error) => console.error("line clock save failed:", error));
}

function etTime(at) {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function etDay(at) {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function lineSay(game, now) {
  const at = now || Date.now();
  const row = clock.games[keyOf(game)];
  const kick = Date.parse(game.kickoff || "");
  if (row && row.propsAt) {
    const when = etDay(row.propsAt) === etDay(at) ? etTime(row.propsAt) : `${new Date(row.propsAt).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })} ${etTime(row.propsAt)}`;
    return at - row.propsAt < FRESH ? `New lines at ${when} ET` : `Lines in at ${when} ET`;
  }
  const samples = (clock.hours[game.sport] || []).slice().sort((a, b) => a - b);
  if (samples.length < 4 || !Number.isFinite(kick) || kick <= at) return "";
  const mid = samples[Math.floor(samples.length / 2)];
  const left = (kick - at) / HOUR;
  if (left <= mid + 0.5) return `${game.sport} props are usually up by now`;
  return `${game.sport} props usually land around ${etTime(kick - mid * HOUR)} ET`;
}

function shortMatch(match) {
  const parts = String(match || "").split(" @ ");
  if (parts.length !== 2) return match;
  const nick = (side) => side.trim().split(/\s+/).pop();
  return `${nick(parts[0])} @ ${nick(parts[1])}`;
}

function freshGames(now) {
  const at = now || Date.now();
  const rows = [];
  Object.values(clock.games).forEach((row) => {
    const kick = Date.parse(row.kickoff || "");
    if (!row.propsAt || at - row.propsAt >= FRESH || !Number.isFinite(kick)) return;
    if (kick < at - 2 * HOUR || kick > at + 18 * HOUR) return;
    const name = shortMatch(row.match);
    if (!name || rows.some((item) => item.name === name)) return;
    rows.push({ match: row.match, name, sport: row.sport || "", kickoff: row.kickoff || "" });
  });
  return rows.slice(0, 2);
}

function freshNote(now) {
  const rows = freshGames(now);
  if (!rows.length) return "";
  if (rows.length === 1) return `New lines on ${rows[0].name}.`;
  return `New lines on ${rows.map((row) => row.name).join(" and ")}.`;
}

async function lineTick(board) {
  if (ticking) return;
  ticking = true;
  try {
    await ready();
    const now = Date.now();
    const due = ((board && board.games) || []).filter((game) => {
      const kick = Date.parse(game.kickoff || "");
      return SPORTS.includes(game.sport) && game.id && game.match && kick > now && kick - now < 36 * HOUR && !clock.games[keyOf(game)];
    }).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)).slice(0, 3);
    const { propsPosted } = require("./choose-api");
    let dirty = false;
    for (const game of due) {
      let open = false;
      try { open = await propsPosted(game.id); } catch (error) { console.error("line clock probe failed:", game.match, error); continue; }
      if (!open) continue;
      const hours = (Date.parse(game.kickoff) - Date.now()) / HOUR;
      clock.games[keyOf(game)] = { sport: game.sport, id: String(game.id), match: game.match, kickoff: game.kickoff, propsAt: Date.now() };
      if (hours > 0 && hours < 72) {
        const list = clock.hours[game.sport] || [];
        list.push(Math.round(hours * 10) / 10);
        clock.hours[game.sport] = list.slice(-40);
      }
      dirty = true;
    }
    Object.keys(clock.games).forEach((key) => {
      if (Date.now() - Date.parse(clock.games[key].kickoff || "") <= 36 * HOUR) return;
      delete clock.games[key];
      dirty = true;
    });
    if (dirty) save();
  } finally { ticking = false; }
}

module.exports = { ready, lineSay, freshNote, freshGames, lineTick };
