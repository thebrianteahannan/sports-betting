/** Why a Bet Deez price moved: today's headlines, the injury list, and the other prices on that game. */

const BAG = new Map();
const KEEP = /questionable|doubtful|ruled out|will not play|won't play|inactive|scratched|injur|ankle|knee|hamstring|groin|illness|minutes|starting|lineup|traded|trade|suspended|\brest\b|locked in|will play|downgrad|upgrad|probable|weather|wind|rain|snow|dome/i;
const BOX = /\b(scores?|scored|tops|topped|defeat|defeated|beats?|wins?|overtime|final)\b/i;
const SKIP = /quarter|qtr|\bhalf\b|period|1st|first quarter/i;

function plain(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function fold(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function playerName(label) {
  return String(label || "").split(/\s+(?:over|under)\b/i)[0].replace(/\s+\d.*$/, "").trim();
}

function money(odds) {
  const n = Number(odds);
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function implied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function statsOf(label, market) {
  const text = `${label} ${market}`.toLowerCase();
  const stats = [];
  if (/\bpoints?\b|\bpts\b/.test(text)) stats.push("points");
  if (/\brebounds?\b|\breb\b/.test(text)) stats.push("rebounds");
  if (/\bassists?\b|\bast\b/.test(text)) stats.push("assists");
  if (/\bthrees?\b|\b3pt/.test(text)) stats.push("threes");
  if (/\bshots?\b/.test(text)) stats.push("shots");
  if (/\byards?\b/.test(text)) stats.push("yards");
  if (/\breceptions?\b/.test(text)) stats.push("receptions");
  return stats;
}

function sentence(text) {
  const line = String(text || "").replace(/\s+[-|]\s+[^-|]{0,40}$/, "").replace(/\s+live updates\.?$/i, "").trim();
  if (!line) return "";
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

async function feed(query) {
  const response = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map((match) => {
    const grab = (tag) => {
      const found = match[1].match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return found ? plain(found[1]) : "";
    };
    return { title: grab("title"), description: grab("description"), date: grab("pubDate") };
  }).filter((item) => item.title);
}

function newsSay(item, last) {
  const title = sentence(item.title);
  const about = new RegExp(`\\b${last}\\b`, "i").test(`${item.title} ${item.description}`);
  if (about && /questionable|doubtful|ruled out|inactive|injur|ankle|knee|hamstring|minutes/i.test(title)) return `Today: ${title} That can walk this price.`;
  if (about && /locked in|will play|starting|in the lineup/i.test(title)) return `Today: ${title} He is in the lineup.`;
  if (/weather|wind|rain|snow/i.test(title)) return `Today: ${title} That can move the number.`;
  return `Today: ${title}`;
}

async function headline(name, match, sport) {
  const last = name.split(" ").filter(Boolean).pop();
  if (!last) return "";
  const queries = [name];
  const teams = String(match || "").split(/\s+@\s+/).map((team) => team.split(" ").pop()).filter(Boolean);
  if (teams.length === 2) queries.push(`${teams[0]} ${teams[1]} injury`);
  if (sport === "NFL") queries.push(`${match} weather`);
  let items = [];
  try {
    const bags = await Promise.all(queries.map((query) => feed(query).catch(() => [])));
    items = bags.flat();
  } catch (error) {
    return "";
  }
  const fresh = items.filter((item) => {
    const at = Date.parse(item.date);
    return Number.isFinite(at) && Date.now() - at < 36 * 60 * 60 * 1000;
  });
  const rank = (item) => {
    const title = item.title;
    const about = new RegExp(`\\b${last}\\b`, "i").test(`${title} ${item.description}`) || (sport === "NFL" && /weather|wind|rain|snow/i.test(title));
    if (!about || !KEEP.test(title)) return 0;
    if (BOX.test(title) && !/injur|questionable|ruled out|inactive|minutes|lineup/i.test(title)) return 0;
    if (/questionable|doubtful|ruled out|inactive|injur|minutes|weather|wind|rain|snow/i.test(title)) return 3;
    return 2;
  };
  fresh.sort((a, b) => rank(b) - rank(a) || Date.parse(b.date) - Date.parse(a.date));
  const hit = fresh.find((item) => rank(item) > 0);
  return hit ? newsSay(hit, last) : "";
}

async function events(sport) {
  const hit = BAG.get(sport);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.rows;
  const rows = await require("./market-fair").fetchLeague(sport);
  BAG.set(sport, { at: Date.now(), rows });
  return rows;
}

async function booksPrice(label, match, market, sport) {
  const fair = require("./market-fair");
  if (!fair.hasKey() || !/^(NFL|NBA|NHL)$/.test(sport)) return null;
  const pick = { who: playerName(label), label, market, text: `${label} ${market}`, match };
  let rows = [];
  try { rows = await events(sport); } catch (error) { return null; }
  const event = rows.find((row) => fair.sameGame(match, row));
  const priced = event && fair.fairPrice(pick, event, sport);
  if (!priced || !(priced.fair > 0)) return null;
  return priced;
}

async function booksLine(label, match, market, sport) {
  const fair = require("./market-fair");
  if (!fair.hasKey()) return "The other books are not connected on this server.";
  const priced = await booksPrice(label, match, market, sport);
  if (!priced) return "The other books do not have this line.";
  return `The other books, with FanDuel left out, have it at ${(priced.fair * 100).toFixed(1)}% across ${priced.fairBooks} books.`;
}

async function gameOf(match) {
  const saved = BAG.get("logs");
  if (!saved || Date.now() - saved.at >= 2 * 60 * 1000) {
    const { kv } = require("./live-recs");
    const rows = await kv(`?k=like.${encodeURIComponent("bets/price-log/")}*&select=v`);
    BAG.set("logs", { at: Date.now(), rows: (rows || []).map((row) => row.v).filter(Boolean) });
  }
  return (BAG.get("logs").rows || []).find((game) => game && game.match === match) || null;
}

function movedRows(game, fromAt) {
  const rows = [];
  Object.entries(game.props || {}).forEach(([key, series]) => {
    if (!series || series.length < 2 || SKIP.test(key)) return;
    const label = key.split("\u0001")[0];
    const market = key.split("\u0001")[1] || "";
    if (/\bunder\b/i.test(label)) return;
    let from = series[0];
    series.forEach((point) => { if (point[1] <= fromAt) from = point; });
    const to = series[series.length - 1];
    if (to[1] < fromAt || Math.abs(from[0]) > 400 || Math.abs(to[0]) > 400) return;
    const open = implied(from[0]);
    const shut = implied(to[0]);
    if (!(open > 0) || !(shut > 0)) return;
    const points = Math.round((shut - open) * 1000) / 10;
    if (Math.abs(points) < 1.5) return;
    const who = playerName(label) || playerName(market);
    rows.push({ id: key, label, market, who, stats: statsOf(label, market), from: from[0], to: to[0], points });
  });
  return rows;
}

function cite(row) {
  if (/\d/.test(row.label) && row.stats.length && !/\b(points|rebounds|assists|threes|shots|yards|receptions)\b/i.test(row.label)) return `${row.label} ${row.stats.join(" + ")}`;
  return row.label || `${row.who} ${row.market}`;
}

function best(rows, pred) {
  return rows.filter(pred).sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.stats.length - b.stats.length)[0] || null;
}

function selfLine(subject, rows) {
  const hit = best(rows, (row) => row.who === subject.who && row.id !== subject.id && (row.points > 0) === (subject.points > 0) && row.stats.some((stat) => !subject.stats.includes(stat)));
  if (hit) {
    const word = hit.stats.filter((stat) => !subject.stats.includes(stat)).slice(0, 2).join(" and ");
    return `His ${word} walked with this. ${cite(hit)} went from ${money(hit.from)} to ${money(hit.to)}. FanDuel repriced him, not just this line.`;
  }
  const same = best(rows, (row) => row.who === subject.who && row.id !== subject.id && (row.points > 0) === (subject.points > 0));
  return same ? `His other ${subject.stats[0] || "prices"} walked with this one. ${cite(same)} went from ${money(same.from)} to ${money(same.to)}.` : "";
}

function otherLine(subject, rows) {
  const hits = rows.filter((row) => row.who && row.who !== subject.who && row.stats.length === 1 && (row.points > 0) !== (subject.points > 0) && Math.abs(row.points) >= 2.5);
  const weight = new Map();
  rows.forEach((row) => weight.set(row.who, (weight.get(row.who) || 0) + 1));
  hits.sort((a, b) => (weight.get(b.who) || 0) - (weight.get(a.who) || 0) || Math.abs(b.points) - Math.abs(a.points));
  const hit = hits[0];
  return hit ? `${hit.who}'s ${hit.stats[0]} walked the other way, from ${money(hit.from)} to ${money(hit.to)}.` : "";
}

function buddyLine(subject, rows, hisTeam, teamOf) {
  if (!hisTeam || !subject.stats.includes("points")) return "";
  const hit = best(rows, (row) => row.who !== subject.who && teamOf(row.who) === hisTeam && row.stats.length === 1 && row.stats[0] === "assists" && (row.points > 0) === (subject.points > 0));
  return hit ? `${hit.who}'s assists walked with this, from ${money(hit.from)} to ${money(hit.to)}. The shots he sets up ride with a points price.` : "";
}

async function sideOf(name, match, sport) {
  const teams = String(match || "").split(/\s+@\s+/).map((team) => team.trim()).filter(Boolean);
  if (teams.length !== 2) return { team: "", teamOf: () => "" };
  const who = require("./who-api");
  const books = await Promise.all(teams.map((team) => who.teamRoster(team, sport).catch(() => ({ players: [] }))));
  const map = new Map();
  teams.forEach((team, index) => (books[index].players || []).forEach((player) => map.set(fold(player.name), team)));
  return { team: map.get(fold(name)) || "", teamOf: (player) => map.get(fold(player)) || "" };
}

async function injuryLine(name, match, kickoff, label) {
  const last = name.split(" ").pop();
  const story = require("./live-recs").recStory(match, kickoff);
  const pick = ((((story || {}).bets || {}).picks) || []).find((row) => String(row.label || "").toLowerCase() === String(label || "").toLowerCase());
  if (pick && /is out/.test(pick.why || "")) return pick.why;
  let rows = [];
  try { rows = (await require("./who-api").outList()).out || []; } catch (error) { rows = []; }
  const mine = rows.find((row) => fold(row.player) === fold(name) && String(match || "").includes(row.team));
  if (mine) return `${mine.player} is out${mine.note ? `, ${mine.note}` : ""}. That can walk this price by itself.`;
  const named = rows.find((row) => row.spot && new RegExp(`\\b${last}\\b`, "i").test(row.spot) && String(match || "").includes(row.team));
  return named ? sentence(named.spot) : "";
}

async function why(label, match, market, sport, kickoff, model) {
  const name = playerName(label);
  const game = await gameOf(match).catch(() => null);
  const series = game && game.props && game.props[`${label}\u0001${market}`];
  const fromAt = series && series[0] ? series[0][1] : Date.now() - 8 * 60 * 60 * 1000;
  const rows = game ? movedRows(game, fromAt) : [];
  const last = series && series[series.length - 1];
  const subject = rows.find((row) => row.label === label && row.market === market) || { id: `${label}\u0001${market}`, label, market, who: name, stats: statsOf(label, market), from: series && series[0] && series[0][0], to: last && last[0], points: 0 };
  const [news, hurt, side, priced] = await Promise.all([
    headline(name, match, sport).catch(() => ""),
    injuryLine(name, match, kickoff, label).catch(() => ""),
    sideOf(name, match, sport).catch(() => ({ team: "", teamOf: () => "" })),
    booksPrice(label, match, market, sport).catch(() => null),
  ]);
  const lines = [news, hurt, selfLine(subject, rows), buddyLine(subject, rows, side.team, side.teamOf), otherLine(subject, rows)].filter(Boolean);
  const now = implied(subject.to);
  const fair = priced && priced.fair;
  const booksApart = fair > 0 && now > 0 && Math.abs(now - fair) >= 0.015;
  if (!lines.length) {
    const walk = subject.from && subject.to ? ` from ${money(subject.from)} to ${money(subject.to)}` : "";
    const m = Number(model);
    const toward = m > 0 && m < 1 && now > 0 && implied(subject.from) > 0 && Math.abs(now - m) + 0.002 < Math.abs(implied(subject.from) - m) ? ` toward our ${(m * 100).toFixed(1)}%` : "";
    lines.push(`I checked today's headlines, the injury list, and the other prices on this game. FanDuel moved this line on its own${walk}${toward}.`);
  }
  if (booksApart) lines.push(`The other books are still at ${(fair * 100).toFixed(1)}%. They have not made this walk.`);
  return { lines };
}

async function look(query) {
  const field = (name) => String((query && typeof query.get === "function" ? query.get(name) : query && query[name]) || "").slice(0, 160);
  const label = field("label");
  const match = field("match");
  const market = field("market");
  const sport = field("sport").slice(0, 12);
  if (field("kind") === "books") return { line: await booksLine(label, match, market, sport) };
  return why(label, match, market, sport, field("kickoff"), field("model"));
}

module.exports = { look };
