/** Double-double and triple-double props, counted from the player's box scores. */

const PARTS = ["points", "totalRebounds", "assists", "steals", "blocks"];

function doubleRead(nick, pack, bet, price) {
  const body = `${(bet && bet.market) || ""} ${(bet && bet.label) || ""}`.toLowerCase();
  const need = /triple[\s-]*double/.test(body) ? 3 : /double[\s-]*double/.test(body) ? 2 : 0;
  const names = (pack && pack.names) || [];
  const at = PARTS.map((key) => names.indexOf(key));
  if (!need || at.slice(0, 3).some((i) => i < 0)) return null;
  const clock = names.indexOf("minutes");
  const games = (pack.rows || [])
    .filter((row) => clock < 0 || Number((row.stats || [])[clock]) > 0)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((row) => ({ season: Number(row.season) || 0, hit: at.filter((i) => i >= 0 && Number((row.stats || [])[i]) >= 10).length >= need }));
  if (games.length < 5) return null;
  const word = need === 3 ? "triple-double" : "double-double";
  const count = (list) => `${list.filter((game) => game.hit).length} of ${list.length}`;
  const ten = games.slice(0, 10), year = games[0].season;
  const now = games.filter((game) => game.season === year), last = games.filter((game) => game.season === year - 1);
  const spans = [`Last 10, ${count(ten)}`, now.length ? `This season, ${count(now)}` : "", last.length ? `Last season, ${count(last)}` : "", `All games, ${count(games)}`].filter(Boolean).join(". ");
  const odds = price ? ` FanDuel has this at ${Math.round(price * 100)}%.` : "";
  const hits = ten.filter((game) => game.hit).length;
  const why = `${nick} had a ${word} in ${hits} of his last ${ten.length} games, ${Math.round(hits / ten.length * 100)}%.${odds}`;
  return { why, spans: `${spans}.`, lean: "" };
}

module.exports = { doubleRead };
