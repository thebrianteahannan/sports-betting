/** NFL one-pick strategies for the picks page. */

const { execFileSync } = require("child_process");

function onesList(games) {
  const slim = (Array.isArray(games) ? games : []).filter((game) => String(game.sport || "") === "NFL").map((game) => ({
    id: game.id, sport: "NFL", match: game.match, awayName: game.awayName, homeName: game.homeName,
    kickoff: game.kickoff, espnId: game.espnId || "", flags: game.flags || [], spread: game.spread || {},
    total: game.total || {}, props: game.props || [],
  }));
  const raw = execFileSync("python3", ["-m", "nfl_bets.ones"], {
    input: JSON.stringify({ games: slim }), encoding: "utf8", timeout: 90000, maxBuffer: 20 * 1024 * 1024, cwd: __dirname,
  });
  return JSON.parse(raw);
}

module.exports = { onesList };
