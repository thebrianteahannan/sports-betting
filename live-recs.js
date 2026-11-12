/** Recommended bets from each game script, kept from before tip-off so the live tracker can show whether they hit. */

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "output", "live-recs.json");
const SKIP = /under|quarter|qtr|half|each|most|touchdown|1st|first|minutes|double|triple/i;
let recs = {};
try { recs = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (error) { recs = {}; }
let warmAt = 0;

function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(recs)); } catch (error) { console.error("live recs save failed:", error); }
}

function recRecord(match, kickoff, bets) {
  const kick = Date.parse(kickoff || "");
  if (!bets || !Number.isFinite(kick) || Date.now() >= kick) return;
  const seen = new Set();
  const picks = [bets, bets.stars].filter(Boolean).flatMap((set) => set.picks || []).filter((pick) => {
    const id = `${pick.label}|${pick.market}`;
    if (!pick.label || seen.has(id)) return false;
    seen.add(id); return true;
  }).map((pick) => ({ label: pick.label, market: pick.market, odds: pick.odds, who: pick.who }));
  if (!picks.length) return;
  recs[`${match}|${kickoff}`] = { match, kickoff, at: Date.now(), picks };
  Object.keys(recs).forEach((key) => { if (Date.now() - Date.parse(recs[key].kickoff || "") > 36 * 3600000) delete recs[key]; });
  save();
}

async function recWarm(board) {
  const now = Date.now();
  if (now - warmAt < 10 * 60000) return;
  warmAt = now;
  const games = ((board && board.games) || []).filter((game) => /^(NBA|NFL|NHL)$/.test(game.sport) && Date.parse(game.kickoff) > now && Date.parse(game.kickoff) - now < 12 * 3600000);
  const todo = games.filter((game) => { const kept = recs[`${game.match}|${game.kickoff}`]; return !kept || now - kept.at > 30 * 60000; });
  if (!todo.length) return;
  const book = await require("./choose-api").chooseBet({ list: "lookup", when: "today" }, board);
  const people = ((book && book.people) || []).filter((person) => person.kind === "player");
  for (const game of todo) {
    const props = people.flatMap((person) => (person.bets || []).filter((bet) => bet.match === game.match && /\d/.test(`${bet.market} ${bet.label}`) && !SKIP.test(`${bet.market} ${bet.label}`)).map((bet) => ({ label: bet.label, market: bet.market, odds: bet.odds, who: person.name })));
    if (!props.length) continue;
    try { await require("./game-story").gameStory({ match: game.match, kickoff: game.kickoff, props }, board); } catch (error) { console.error("live recs warm failed:", game.match, error); }
  }
}

function recsList() {
  return Object.values(recs).flatMap((row) => row.picks.map((pick) => ({ label: pick.label, market: pick.market, odds: pick.odds, match: row.match, kickoff: row.kickoff })));
}

module.exports = { recRecord, recWarm, recsList };
