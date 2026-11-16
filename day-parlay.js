/** Free Parlay of the Day: one 4-leg ticket, three anchors and one juice, from Anthony's same-game shape. */

const { decimal, pool, gameLegs, seedLogs } = require("./stack-base");
const { teamLoad } = require("./stack-read");
const { packed } = require("./stack-sgp");

let cache = { at: 0, value: null }, busy = null;

function dayKey(when) {
  return new Date(when - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function ticketOdds(bets) {
  const dec = (bets || []).reduce((sum, bet) => sum * decimal(bet.odds), 1);
  if (!(dec > 1)) return null;
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  return Number.isFinite(price) ? price : null;
}

function pickGames(board) {
  const now = Date.now(), today = dayKey(now);
  const nfl = ((board && board.games) || []).filter((game) => String(game.sport || "") === "NFL" && Date.parse(game.kickoff || "") > now);
  const tonight = nfl.filter((game) => dayKey(Date.parse(game.kickoff)) === today);
  if (tonight.length) return tonight;
  const soon = nfl.filter((game) => Date.parse(game.kickoff) - now < 3 * 86400000);
  return (soon.length ? soon : nfl).slice(0, 10);
}

async function buildDay(board) {
  const games = pickGames(board);
  if (!games.length) return { parlay: null, span: "week" };
  const loaded = (await pool(games, 4, async (game) => {
    try { return [game, (await gameLegs(String(game.id || ""))).filter((leg) => Number.isInteger(leg.odds))]; }
    catch (error) { return [game, []]; }
  })).filter(([, legs]) => legs.length);
  if (!loaded.length) return { parlay: null, span: "week" };
  await seedLogs(loaded);
  const logs = await teamLoad(games);
  const stacks = packed(games, loaded, logs, { team: false, share: 0.6, floor: 0.8 });
  const best = stacks[0];
  if (!best || !(best.bets || []).length) return { parlay: null, span: dayKey(Date.now()) === dayKey(Date.parse(games[0].kickoff)) ? "today" : "week" };
  const odds = ticketOdds(best.bets);
  if (!Number.isFinite(odds)) return { parlay: null, span: "week" };
  const kickoff = best.kickoff || (games.find((game) => game.match === best.game) || {}).kickoff || "";
  const span = kickoff && dayKey(Date.parse(kickoff)) === dayKey(Date.now()) ? "today" : "week";
  return {
    span,
    parlay: {
      match: best.game,
      kickoff,
      odds,
      how: "Three short player lines hold it. The touchdown pays.",
      shape: "Anchors and juice",
      bets: best.bets.map((bet) => ({ label: bet.label, odds: bet.odds, rung: bet.rung, job: bet.job, game: bet.game || best.game })),
    },
  };
}

async function dayParlay(board) {
  if (cache.value && Date.now() - cache.at < 10 * 60000) return cache.value;
  if (busy) return busy;
  busy = buildDay(board).then((value) => {
    cache = { at: Date.now(), value };
    return value;
  }).catch((error) => {
    console.error("day parlay failed:", error);
    return { parlay: null, span: "week" };
  }).finally(() => { busy = null; });
  return busy;
}

module.exports = { dayParlay, ticketOdds };
