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

function slimGame(game) {
  return {
    id: game.id, sport: game.sport || "", match: game.match || "",
    awayName: game.awayName || "", homeName: game.homeName || "", kickoff: game.kickoff || "",
    espnId: game.espnId || "", spread: game.spread || null, total: game.total || null, flags: game.flags || [],
  };
}

function pythonBin() {
  if (pythonBin.found) return pythonBin.found;
  const { spawnSync } = require("child_process");
  for (const bin of ["python3", "python", "/usr/bin/python3", "/usr/local/bin/python3"]) {
    const probe = spawnSync(bin, ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"], { timeout: 4000 });
    if (!probe.error && probe.status === 0) return (pythonBin.found = bin);
  }
  return "";
}

async function savedPack(sport, name) {
  const who = String(name || "").trim().toLowerCase();
  const league = String(sport || "").trim();
  if (!who || !league) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, "output", "sway.json"), "utf8"));
    const pack = saved[`${league}|${who}|career`];
    if (pack && pack.rows && pack.rows.length) return pack;
  } catch (err) { /* the shared copy is next */ }
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  try {
    const response = await fetch(`${url}/rest/v1/kv?k=eq.${encodeURIComponent(`bets/log/${league}/${who}`)}&select=v`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const pack = rows && rows[0] && rows[0].v;
    return pack && pack.rows && pack.rows.length ? pack : null;
  } catch (err) { return null; }
}

async function whyPlayer(name, text, sport, bet, odds, games) {
  const league = String((bet && bet.sport) || sport || "");
  const pack = await savedPack(league, name);
  const asked = bet && typeof bet === "object"
    ? { read: true, name: String(name || ""), bet, pack }
    : { name: String(name || ""), text: String(text || ""), sport: String(sport || ""), odds, games: (Array.isArray(games) ? games : []).slice(0, 40).map(slimGame), pack };
  const bin = pythonBin();
  if (!bin) return { why: "This server has no Python, so the game log cannot be read." };
  let found;
  try {
    found = JSON.parse(execFileSync(bin, ["-m", "nfl_bets.why"], {
      input: JSON.stringify(asked), encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024, cwd: __dirname,
    }));
  } catch (err) {
    return { why: "The game log did not load." };
  }
  if (asked.read) return found;
  let looks = [];
  try { looks = (await require("./desk-looks").currentLooks()).looks || []; } catch (err) { looks = []; }
  const allowed = new Set(looks.map((row) => row.id));
  const measured = (found.hits || []).filter((row) => row && row.line && (!allowed.size || allowed.has(row.id))).map((row) => row.line).join(" ");
  const facts = [found.why, measured].filter(Boolean).join(" ");
  try {
    const spoken = await require("./bet-ask").askTrend(name, text, facts, sport, looks);
    if (spoken) return { why: spoken };
  } catch (err) { /* keep the box score */ }
  return { why: facts || found.why || "" };
}

module.exports = { singleFind, markPlayer, whyPlayer };
