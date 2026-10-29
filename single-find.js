/** One prop from the build-a-bet slate. The count has to be far enough off the price. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function names(game) {
  let away = String(game.awayName || "");
  let home = String(game.homeName || "");
  const match = String(game.match || "");
  if ((!away || !home) && match.includes(" @ ")) {
    const [left, right] = match.split(" @ ");
    away = away || left.trim();
    home = home || right.trim();
  }
  return { away, home };
}

function singleFind(pools, games, opts) {
  const slim = (Array.isArray(games) ? games : []).map((game) => {
    const side = names(game);
    return {
      id: game.id, sport: game.sport, match: game.match, awayName: side.away, homeName: side.home,
      kickoff: game.kickoff, espnId: game.espnId || "", flags: game.flags || [],
    };
  });
  const legs = [];
  (pools || []).forEach(([game, rows]) => {
    const side = names(game);
    (rows || []).forEach((leg) => legs.push({
      market: leg.market || "", runner: leg.runner || "", label: leg.label || "", odds: leg.odds,
      gameId: String(game.id || ""), sport: game.sport || leg.sport || "", kickoff: game.kickoff || "",
    }));
    if (!slim.some((row) => String(row.id) === String(game.id))) slim.push({ id: game.id, sport: game.sport, match: game.match, awayName: side.away, homeName: side.home, kickoff: game.kickoff, espnId: game.espnId || "", flags: game.flags || [] });
  });
  const raw = execFileSync("python3", ["-m", "nfl_bets.single"], {
    input: JSON.stringify({ legs, games: slim, skip: [...(opts.skip || [])], stake: opts.stake, profit: opts.profit }),
    encoding: "utf8", timeout: 50000, maxBuffer: 8 * 1024 * 1024, cwd: __dirname,
  });
  return JSON.parse(raw);
}

function markPlayer(name, bets, games) {
  const legs = (Array.isArray(bets) ? bets : []).slice(0, 200).map((bet) => ({
    market: bet.market || "", runner: bet.runner || "", label: bet.label || "", odds: bet.odds,
    sport: bet.sport || "", match: bet.match || "", kickoff: bet.kickoff || "",
  }));
  let saved = [];
  try { saved = JSON.parse(fs.readFileSync(path.join(__dirname, "output", "board.json"), "utf8")).games || []; } catch (err) { saved = []; }
  const slate = (Array.isArray(games) ? games : []).map((game) => {
    const full = saved.find((row) => row && row.kickoff === game.kickoff && row.match === game.match) || game;
    return {
      id: full.id, sport: full.sport || game.sport || "", match: full.match || game.match || "",
      awayName: full.awayName || "", homeName: full.homeName || "", kickoff: full.kickoff || game.kickoff || "",
      espnId: full.espnId || "", spread: full.spread || null, total: full.total || null,
    };
  });
  const raw = execFileSync("python3", ["-m", "nfl_bets.single"], {
    input: JSON.stringify({ mark: true, name: String(name || ""), legs, games: slate }),
    encoding: "utf8", timeout: 40000, maxBuffer: 8 * 1024 * 1024, cwd: __dirname,
  });
  return JSON.parse(raw);
}

async function whyPlayer(name, text, sport) {
  const raw = execFileSync("python3", ["-m", "nfl_bets.why"], {
    input: JSON.stringify({ name: String(name || ""), text: String(text || ""), sport: String(sport || "") }),
    encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024, cwd: __dirname,
  });
  const found = JSON.parse(raw);
  try {
    const spoken = await require("./bet-ask").askTrend(name, text, found.why || "", sport);
    if (spoken) return { why: spoken };
  } catch (err) { /* keep the box score */ }
  return found;
}

module.exports = { singleFind, markPlayer, whyPlayer };
