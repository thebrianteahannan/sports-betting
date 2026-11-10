/** How a blowout (final margin 15+) moves his minutes and his numbers. */

const { SERIES, series } = require("./player-swing");

const CACHE = new Map(), TTL = 6 * 60 * 60 * 1000, BLOW = 15;

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json", Referer: "https://www.espn.com/" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function season(id, year) {
  const data = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog${year ? `?season=${year}` : ""}`);
  const events = data.events || {}, rows = [];
  (data.seasonTypes || []).forEach((block) => {
    if (/preseason/i.test(String(block.displayName || ""))) return;
    (block.categories || []).forEach((cat) => (cat.events || []).forEach((item) => {
      const event = events[String(item.eventId)] || {};
      const home = Number(event.homeTeamScore), away = Number(event.awayTeamScore);
      if (!Number.isFinite(home) || !Number.isFinite(away) || home + away <= 0) return;
      rows.push({ date: String(event.gameDate || ""), stats: item.stats || [], margin: Math.abs(home - away) });
    }));
  });
  const filter = (data.filters || []).find((item) => item.name === "season");
  const current = filter && filter.options && filter.options[0] ? Number(filter.options[0].value) || 0 : 0;
  return { names: data.names || [], rows, current };
}

async function blowLog(name) {
  const key = String(name || "").trim().toLowerCase();
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached;
  const data = await getJson(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player`);
  const hits = (data.items || []).filter((item) => item.league === "nba");
  const picked = hits.find((item) => String(item.displayName || "").toLowerCase() === key) || (hits.length === 1 ? hits[0] : null);
  let pack = { at: Date.now(), names: [], rows: [] };
  if (picked) {
    const now = await season(picked.id, null);
    let rows = now.rows;
    if (now.current && rows.filter((row) => row.margin >= BLOW).length < 4) {
      const seen = new Set(rows.map((row) => row.date));
      rows = rows.concat((await season(picked.id, now.current - 1)).rows.filter((row) => !seen.has(row.date)));
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    pack = { at: Date.now(), names: now.names, rows: rows.slice(0, 30) };
  }
  CACHE.set(key, pack);
  return pack;
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function one(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

async function blowTags(name, stats, pullOf) {
  let pack;
  try { pack = await blowLog(name); } catch (err) { return null; }
  const blow = pack.rows.filter((row) => row.margin >= BLOW), rest = pack.rows.filter((row) => row.margin < BLOW);
  if (blow.length < 3 || rest.length < 3) return null;
  const inBlow = pullOf(blow, pack.names), inRest = pullOf(rest, pack.names);
  const mins = { a: avg(series("Minutes/Game", inBlow)), b: avg(series("Minutes/Game", inRest)) };
  if (mins.a == null || mins.b == null) return null;
  const gap = mins.a - mins.b, way = gap <= -3 ? "down" : gap >= 3 ? "up" : "";
  stats.forEach((stat) => {
    if (!way || !SERIES[stat.label]) return;
    const a = avg(series(stat.label, inBlow)), b = avg(series(stat.label, inRest));
    if (a == null || b == null || (a > b ? "up" : "down") !== way) return;
    const minutes = stat.label === "Minutes/Game";
    if (!(minutes || (Math.abs(a - b) >= 0.5 && (b <= 0 || Math.abs(a - b) / b >= 0.2)))) return;
    stat.blow = way;
    stat.blowTag = `${a > b ? "+" : "−"}${one(Math.abs(a - b))}${minutes ? " min" : ""} in blowouts`;
    stat.blowTip = `${one(a)} in ${blow.length} blowouts, ${one(b)} in ${rest.length} other games.`;
  });
  const tag = way === "down" ? "Sits in blowouts" : way === "up" ? "Plays more in blowouts" : "Blowouts don't move him";
  return { tag, kind: way, tip: `${one(mins.a)} minutes in ${blow.length} blowouts, ${one(mins.b)} in ${rest.length} other games.` };
}

module.exports = { blowTags };
