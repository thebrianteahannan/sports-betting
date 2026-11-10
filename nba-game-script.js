/** The NBA or NFL game script for one game, from nfl_bets.nba_script or nfl_bets.nfl_script. */

const { execFile } = require("child_process");

const MEM = new Map();
const KEEP = 10 * 60 * 1000;

function nbaScript(body, board) {
  const game = ((board && board.games) || []).find((row) => row.match === body.match && row.kickoff === body.kickoff);
  const py = game && { NBA: "nfl_bets.nba_script", NFL: "nfl_bets.nfl_script" }[game.sport];
  if (!py) return Promise.resolve({ parts: [] });
  const key = `${game.match}|${game.kickoff}`;
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < KEEP) return hit.promise;
  const input = JSON.stringify({ away: game.awayName, home: game.homeName, spread: game.spread || {}, props: (Array.isArray(body.props) ? body.props : []).slice(0, 1500) });
  const promise = new Promise((resolve) => {
    const child = execFile("python3", ["-m", py], { cwd: __dirname, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (error, out) => {
      let data = { parts: [] };
      try { if (!error) data = JSON.parse(out); } catch (err) { data = { parts: [] }; }
      if (error || !data.summary) MEM.delete(key);
      resolve(data);
    });
    child.stdin.end(input);
  });
  MEM.set(key, { at: Date.now(), promise });
  return promise;
}

module.exports = { nbaScript };
