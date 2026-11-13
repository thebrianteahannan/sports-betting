/** Team bets that clear their price: tonight's spread, moneyline, and total against each team's recent final scores.
 * A team bet needs at least 8 games and a record 15 points over what the price needs, a stricter bar than player props. */

const { betKind } = require("./bet-kind");

const EDGE = 0.15, MIN = 8;

function need(odds) { const o = Number(odds); return o > 0 ? 100 / (o + 100) : -o / (-o + 100); }
function pct(value) { return `${(Math.round(value * 1000) / 10).toFixed(1)}%`; }
function money(odds) { return odds > 0 ? `+${odds}` : String(odds); }
function wins(odds) { const o = Number(odds); return (5 * (o > 0 ? o / 100 : 100 / -o)).toFixed(2); }
function nick(name) { return String(name || "").split(" ").pop(); }

function sideOf(label, sides) {
  const text = String(label || "").toLowerCase();
  return sides.find((side) => text.startsWith(String(side.name || "").toLowerCase())) || sides.find((side) => text.split(/\s[+-]?\d/)[0].endsWith(nick(side.name).toLowerCase()));
}

function readLine(row, sides) {
  const market = String(row.market || ""), label = String(row.label || "");
  if (/^total$/i.test(market)) {
    const hit = label.match(/^(Over|Under) (\d+(?:\.\d+)?)$/i);
    if (!hit) return null;
    const line = Number(hit[2]), over = /over/i.test(hit[1]), games = sides.flatMap((side) => side.scores || []);
    const hits = games.filter(([a, b]) => (over ? a + b > line : a + b < line)).length;
    return { team: "Game total", who: "", text: `${hit[1]} ${line}`, hits, n: games.length, say: (h, n) => `The total went ${over ? "over" : "under"} ${line} in ${h} of the two teams' last ${n} games` };
  }
  if (!/^(spread|moneyline)$/i.test(market)) return null;
  const side = sideOf(label, sides), games = (side && side.scores) || [];
  if (!side) return null;
  const name = nick(side.name);
  if (/moneyline/i.test(market)) {
    const hits = games.filter(([a, b]) => a > b).length;
    return { team: name, who: side.name, text: "to win", hits, n: games.length, say: (h, n) => `The ${name} won ${h} of their last ${n}` };
  }
  const line = Number((label.slice(String(side.name).length).match(/[+-]?\d+(?:\.\d+)?/) || [])[0]);
  if (!Number.isFinite(line)) return null;
  const sign = line > 0 ? `+${line}` : String(line), hits = games.filter(([a, b]) => a - b + line > 0).length;
  return { team: name, who: side.name, text: sign, hits, n: games.length, say: (h, n) => `The ${name} covered ${sign} in ${h} of their last ${n}` };
}

function teamBets(boxes, lines) {
  if (!boxes || !boxes.away || !boxes.home || !Array.isArray(lines)) return [];
  const sides = [boxes.away, boxes.home], best = new Map();
  lines.slice(0, 60).forEach((row) => {
    const odds = Number(row.odds);
    if (!Number.isFinite(odds) || odds >= 150) return;
    const read = readLine(row, sides);
    if (!read || read.n < MIN) return;
    const bar = need(odds), edge = read.hits / read.n - bar;
    if (edge < EDGE) return;
    const market = String(row.market), now = best.get(market);
    if (now && now.edge >= edge) return;
    const how = `${read.say(read.hits, read.n)} (${Math.round((read.hits / read.n) * 100)}%). At ${money(odds)} the bet needs ${pct(bar)}. $5 wins $${wins(odds)}.`;
    best.set(market, { edge, pick: { label: row.label, market, odds, who: read.who, team: read.team, text: read.text, hits: read.hits, n: read.n, need: pct(bar), kind: betKind(odds), basis: "math", tier: "rec", how } });
  });
  return [...best.values()].sort((a, b) => b.edge - a.edge).map((row) => row.pick);
}

module.exports = { teamBets };
