/** News and the other books, only for a bet the desk already says to take. */

const MOVE = /questionable|doubtful|ruled out|will not play|won't play|inactive|scratched|injury|injured|ankle|knee|hamstring|groin|illness|minutes|starting|lineup|traded|suspended|rest/i;
const BAG = new Map();

function plain(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function playerName(label) {
  return String(label || "").split(/\s+(?:over|under)\b/i)[0].replace(/\s+\d.*$/, "").trim();
}

async function headlines(name) {
  const last = name.split(" ").filter(Boolean).pop();
  if (!last) return "Nothing in today's news explains this move.";
  const response = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(`"${name}" injury OR questionable OR out OR lineup OR minutes`)}&format=rss`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return "The news check did not come back.";
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((match) => {
    const grab = (tag) => {
      const found = match[1].match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return found ? plain(found[1]) : "";
    };
    return { title: grab("title"), description: grab("description") };
  }).filter((item) => item.title);
  const hit = items.find((item) => new RegExp(`\\b${last}\\b`, "i").test(`${item.title} ${item.description}`) && MOVE.test(`${item.title} ${item.description}`));
  if (!hit) return "Nothing in today's news explains this move.";
  const title = hit.title.replace(/\s+[-|]\s+[^-|]+$/, "").trim();
  return /[.!?]$/.test(title) ? title : `${title}.`;
}

async function events(sport) {
  const hit = BAG.get(sport);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.rows;
  const rows = await require("./market-fair").fetchLeague(sport);
  BAG.set(sport, { at: Date.now(), rows });
  return rows;
}

async function booksLine(label, match, market, sport) {
  const fair = require("./market-fair");
  if (!fair.hasKey()) return "The other books are not connected on this server.";
  if (!/^(NFL|NBA|NHL)$/.test(sport)) return "The other books do not have this line.";
  const pick = { who: playerName(label), label, market, text: `${label} ${market}`, match };
  let rows = [];
  try { rows = await events(sport); } catch (error) { return "The other books did not answer."; }
  const event = rows.find((row) => fair.sameGame(match, row));
  const priced = event && fair.fairPrice(pick, event, sport);
  if (!priced || !(priced.fair > 0)) return "The other books do not have this line.";
  return `The other books, with FanDuel left out, have it at ${(priced.fair * 100).toFixed(1)}% across ${priced.fairBooks} books.`;
}

async function look(query) {
  const field = (name) => String((query && typeof query.get === "function" ? query.get(name) : query && query[name]) || "").slice(0, 160);
  const label = field("label");
  const match = field("match");
  const market = field("market");
  const sport = field("sport").slice(0, 12);
  const name = playerName(label);
  if (field("kind") === "books") return { line: await booksLine(label, match, market, sport) };
  return { line: name ? await headlines(name) : "Nothing in today's news explains this move." };
}

module.exports = { look };
