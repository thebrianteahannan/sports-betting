const { spawn } = require("child_process");

function createPull(readKey, writeKey, root) {
  return async function pullLive(cardId) {
    const id = String(cardId || "");
    const card = await runPull(root, id);
    const board = (await readKey("bets/board.json")) || {};
    board[id] = card;
    await writeKey("bets/board.json", board);
    return { id, card };
  };
}

function runPull(root, id) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-m", "nfl_bets.pull", id], { cwd: root });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("FanDuel took too long. Try again."));
    }, 70000);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim().split("\n").pop() || "FanDuel did not update that bet."));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (error) {
        reject(new Error("FanDuel did not update that bet."));
      }
    });
  });
}

module.exports = { createPull };
