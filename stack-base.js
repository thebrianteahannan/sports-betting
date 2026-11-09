/** Shared pieces for the strategy finder: prices, FanDuel props, labels, and player logs. */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LOG_TTL = 30 * 60 * 1000;
const logs = new Map();

function implied(odds) {
  const value = Number(odds);
  return value < 0 ? Math.abs(value) / (Math.abs(value) + 100) : 100 / (value + 100);
}

function decimal(odds) {
  const value = Number(odds);
  return value > 0 ? 1 + value / 100 : 1 + 100 / Math.abs(value);
}

function pyRound(value, places = 0) {
  const scale = 10 ** places;
  const scaled = value * scale;
  const tie = Math.abs(scaled - Math.trunc(scaled)) === 0.5;
  return (tie ? 2 * Math.round(scaled / 2) : Math.round(scaled)) / scale;
}

function g(value) {
  return String(Number(value));
}

function signed(value) {
  return Number(value) >= 0 ? `+${g(value)}` : g(value);
}

function plain(text) {
  return String(text).split(/\s+/).filter(Boolean).join(" ");
}

async function getJson(url, referer, timeout = 30000) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9", Referer: referer }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.split("?")[0]}`);
  return response.json();
}

async function pool(items, size, work) {
  const out = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await work(items[at]);
    }
  });
  await Promise.all(lanes);
  return out;
}

const UNITS = ["shots on goal", "receiving yards", "rushing yards", "passing yards", "receptions", "rebounds", "strikeouts", "assists", "puck line", "run line", "saves", "points", "goals", "shots", "made threes", "threes", "tries", "spread", "yards"];

function legKind(market) {
  const text = market.toLowerCase();
  if (text.includes("reception")) return "receptions";
  if (text.includes("rush")) return "rushing";
  if (text.includes("pass")) return "passing";
  if (text.includes("receiv")) return "receiving";
  return "";
}

function label(market, runner) {
  const bare = market.replace(/\s+\d+$/, "").trim();
  const race = /^race to\s+(\d+(?:\.\d+)?)\s+(points|tries|goals)\b/i.exec(bare);
  if (race && runner.trim() && !/\d/.test(runner)) return `${runner.trim()} race to ${race[1]} ${race[2].toLowerCase()}`;
  if (/winning margin/i.test(bare) && !/win by|\bby\s+\d|margin/i.test(runner)) {
    let text = runner.trim().replace(/(\d+(?:\.\d+)?\+)$/, "to win by $1");
    text = text.replace(/(\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?)$/, "to win by $1");
    if (text !== runner.trim()) return plain(text);
  }
  if (["over", "under"].includes(runner.toLowerCase()) || ["over", "unde"].includes(runner.slice(0, 4).toLowerCase())) return `${market}: ${runner}`;
  const kind = legKind(market);
  if (kind && !runner.toLowerCase().includes(kind) && /\by(?:ar)?ds?\b/i.test(runner)) runner = runner.replace(/\by(?:ar)?ds?\b/i, `${kind} yards`);
  const norm = market.replace(/\byds\b/gi, "yards").replace(/puckline/gi, "puck line");
  const low = norm.toLowerCase();
  const scopeHit = /^(1st|2nd|3rd|4th)\s+(period|half|quarter)/.exec(low);
  const scope = scopeHit ? scopeHit[0] : "";
  const unit = UNITS.find((word) => new RegExp(`\\b${word}\\b`).test(low)) || "";
  let text = runner.trim();
  if (/^\d+(?:\.\d+)?\+$/.test(text)) {
    let who = scope ? norm.slice(scope.length) : norm;
    who = who.replace(/\b(alt|alternate)\b/gi, " ");
    if (unit) who = who.replace(new RegExp(`\\b${unit}\\b`, "i"), " ");
    who = plain(who.replace(/[-:]/g, " "));
    text = [who, text, unit].filter(Boolean).join(" ");
  } else if (unit && !text.toLowerCase().includes(unit)) {
    const count = /\d/.test(text) ? "" : ((/\d+(?:\.\d+)?\+/.exec(norm) || [""])[0]);
    text = [text, count, unit].filter(Boolean).join(" ");
  }
  if (scope && !text.toLowerCase().includes(scope)) text = `${text}, ${scope}`;
  return plain(text);
}

function american(runner) {
  const raw = String((((runner || {}).winRunnerOdds || {}).americanDisplayOdds || {}).americanOdds ?? "").trim();
  return /^[+-]?\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

function runnerName(runner) {
  let name = String(runner.runnerName || "").trim();
  const mark = runner.handicap;
  if (mark && Number(mark) && /(?:^|\s)(?:over|under)$/i.test(name) && !/\d/.test(name)) name = `${name} ${g(mark)}`;
  return name;
}

function propTabs(layout) {
  const tabs = (layout && layout.tabs) || {};
  const words = ["prop", "point", "three", "rebound", "assist", "goal", "shot", "batter", "pitcher", "scorer", "hit", "combo"];
  const slugs = [];
  ((layout && layout.tabsDisplayOrder) || []).forEach((id) => {
    const low = String((tabs[String(id)] || {}).title || "").toLowerCase();
    if (!words.some((word) => low.includes(word))) return;
    if (["quarter", "half", "period", "margin", "same game"].some((word) => low.includes(word)) && !low.includes("prop") && !low.includes("player")) return;
    const slug = low.replace(/™/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  });
  return slugs;
}

async function gameLegs(eventId) {
  const { eventPage } = require("./choose-api");
  const first = await eventPage(eventId, "popular");
  const pages = [first].concat((await pool(propTabs(first.layout || {}), 6, (slug) => eventPage(eventId, slug).catch(() => null))).filter(Boolean));
  const rows = [];
  const seen = new Set();
  pages.forEach((data) => {
    Object.values((data.attachments || {}).markets || {}).forEach((market) => {
      if (!market || typeof market !== "object" || String(market.eventId || "") !== String(eventId)) return;
      if (String(market.marketStatus || "OPEN").toUpperCase() !== "OPEN") return;
      const name = String(market.marketName || "");
      if (["Regular Season", "Playoff", "Drive 1"].some((skip) => name.includes(skip))) return;
      const marketId = String(market.marketId || name);
      (market.runners || []).forEach((runner) => {
        const odds = american(runner);
        if (odds === null || odds < -2000 || odds > 5000) return;
        const who = runnerName(runner);
        const token = `${marketId}|${who}|${odds}`;
        if (seen.has(token)) return;
        seen.add(token);
        rows.push({ market: name, runner: who, label: label(name, who), odds });
      });
    });
  });
  return rows;
}

const TD = new Set(["Any Time Touchdown Scorer", "First Touchdown Scorer"]);

async function kvRows(keys) {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return [];
  const listed = encodeURIComponent(keys.map((item) => `"${item.replace(/"/g, "")}"`).join(",")).replace(/%2C/g, ",");
  try {
    const response = await fetch(`${url}/rest/v1/kv?k=in.(${listed})&select=k,v`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    return response.ok ? await response.json() : [];
  } catch (error) {
    return [];
  }
}

async function seedLogs(loaded) {
  const names = new Set();
  loaded.forEach(([game, legs]) => {
    const sport = String(game.sport || "");
    legs.forEach((leg) => {
      const market = String(leg.market || "");
      const who = (TD.has(market) ? String(leg.runner || "") : market.includes(" - ") ? market.split(" - ")[0] : "").trim();
      if (sport && who) names.add(`${sport}|${who.toLowerCase()}`);
    });
  });
  const now = Date.now();
  const keys = [...names].filter((name) => !(logs.get(name) && now - logs.get(name).at < LOG_TTL)).map((name) => `bets/log/${name.replace("|", "/")}`);
  const chunks = [];
  for (let at = 0; at < keys.length; at += 40) chunks.push(keys.slice(at, at + 40));
  (await pool(chunks, 6, kvRows)).flat().forEach((row) => {
    const rest = String((row || {}).k || "").slice("bets/log/".length);
    const cut = rest.indexOf("/");
    const pack = (row || {}).v;
    if (cut > 0 && pack && typeof pack === "object" && Array.isArray(pack.rows) && pack.rows.length) logs.set(`${rest.slice(0, cut)}|${rest.slice(cut + 1)}`, { at: now, pack });
  });
}

function logCache() {
  const out = {};
  logs.forEach((item, key) => { out[key] = item.pack; });
  return out;
}

function byLast(cache, sport) {
  const found = {};
  Object.entries(cache).forEach(([key, pack]) => {
    const cut = key.indexOf("|");
    const who = key.slice(cut + 1);
    if (key.slice(0, cut) === sport && who && !who.includes("|") && pack && pack.rows && pack.rows.length) (found[who.split(/\s+/).pop()] = found[who.split(/\s+/).pop()] || []).push(who);
  });
  return found;
}

module.exports = { implied, decimal, pyRound, g, signed, getJson, pool, label, gameLegs, seedLogs, logCache, byLast };
