/** Keeps each game's FanDuel props from just before kickoff, so Build a bet can still open the game after it starts. */

const { kv } = require("./live-recs");
const KEY = "bets/kept-games/";
const savedAt = new Map(), asked = new Map();
let warming = false, prunedAt = 0;

function prune() {
  if (Date.now() - prunedAt < 3600000) return;
  prunedAt = Date.now();
  kv(`?k=like.${encodeURIComponent(KEY)}*&select=k`).then((rows) => (rows || []).forEach((row) => {
    if (Date.now() - Date.parse(String(row.k).split("|").pop()) <= 36 * 3600000) return;
    kv(`?k=eq.${encodeURIComponent(row.k)}`, { method: "DELETE", prefer: "return=minimal" }).catch((error) => console.error("kept games prune failed:", error));
  })).catch((error) => { prunedAt = 0; console.error("kept games list failed:", error); });
}

async function keepWarm(board) {
  if (warming) return;
  warming = true;
  try {
    const now = Date.now(), { offerLegs } = require("./choose-api");
    const soon = ((board && board.games) || []).filter((game) => /^(NFL|NBA|MLB|NHL|WNBA)$/.test(game.sport || "") && Date.parse(game.kickoff) > now && Date.parse(game.kickoff) - now < 2 * 3600000);
    for (const game of soon) {
      const key = `${game.match}|${game.kickoff}`;
      if (now - (savedAt.get(key) || 0) < 20 * 60000) continue;
      savedAt.set(key, now);
      try {
        const { rows } = await offerLegs(game);
        if (rows.length) await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + key, v: { at: now, game: { ...game, props: rows, kept: true } } } });
      } catch (error) { console.error("kept games save failed:", game.match, error); }
    }
    prune();
  } finally { warming = false; }
}

async function keptGame(match) {
  const hit = asked.get(match);
  if (hit && Date.now() - hit.at < 60000) return hit.game;
  const rows = await kv(`?k=like.${encodeURIComponent(`${KEY}${match}|`)}*&select=v`).catch((error) => { console.error("kept game load failed:", match, error); return []; });
  const game = (rows || []).map((row) => row.v && row.v.game).filter((row) => row && Date.parse(row.kickoff) <= Date.now()).sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))[0] || null;
  asked.set(match, { at: Date.now(), game });
  return game;
}

async function withKept(board, match) {
  const games = (board && board.games) || [];
  if (!match || games.some((game) => game.match === match && Date.parse(game.kickoff) <= Date.now())) return board;
  const game = await keptGame(match);
  return game ? { ...board, games: [...games, game] } : board;
}

module.exports = { keepWarm, withKept };
