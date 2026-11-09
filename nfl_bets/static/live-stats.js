/** What a player has so far in a game that is under way, on his card and on each bet. */

const LIVE_PATHS = { NFL: "football/nfl", NBA: "basketball/nba", WNBA: "basketball/wnba", NHL: "hockey/nhl", MLB: "baseball/mlb" };
const LIVE_KINDS = {
  "Passing yards": ["passing.passingYards"], "Passing touchdowns": ["passing.passingTouchdowns"], "Passing attempts": ["passing.passingAttempts"],
  Completions: ["passing.completions"], Interceptions: ["passing.interceptions"],
  "Rushing yards": ["rushing.rushingYards"], "Rushing attempts": ["rushing.rushingAttempts"], "Rushing touchdowns": ["rushing.rushingTouchdowns"],
  "Receiving yards": ["receiving.receivingYards"], Receptions: ["receiving.receptions"], "Receiving touchdowns": ["receiving.receivingTouchdowns"],
  Touchdowns: ["rushing.rushingTouchdowns", "receiving.receivingTouchdowns", "kickReturns.kickReturnTouchdowns", "puntReturns.puntReturnTouchdowns"],
  "Rushing and receiving yards": ["rushing.rushingYards", "receiving.receivingYards"],
  Tackles: ["defensive.totalTackles"], Sacks: ["defensive.sacks"],
  Points: ["points"], Rebounds: ["rebounds"], Assists: ["assists"], Threes: ["threePointFieldGoalsMade"], Steals: ["steals"], Blocks: ["blocks"],
  PRA: ["points", "rebounds", "assists"], "Pts + Reb": ["points", "rebounds"], "Pts + Ast": ["points", "assists"], "Reb + Ast": ["rebounds", "assists"],
  Goals: ["goals"], Shots: ["shotsTotal"], Saves: ["saves"],
  Hits: ["hits"], Runs: ["runs"], RBIs: ["RBIs"], "Home runs": ["homeRuns"], Strikeouts: ["strikeouts"], "Stolen bases": ["stolenBases"],
};
const LIVE_SHOW = ["C/ATT", "YDS", "TD", "INT", "CAR", "REC", "TGTS", "MIN", "PTS", "REB", "AST", "3PT", "STL", "BLK", "TOI", "G", "A", "S", "GA", "SV", "H", "R", "RBI", "HR", "K", "AB", "IP", "ER"];

function livePlain(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

function liveBox(data, name) {
  const want = livePlain(name), got = {}, lines = [];
  ((data.boxscore || {}).players || []).forEach((team) => (team.statistics || []).forEach((group) => {
    const row = (group.athletes || []).find((item) => livePlain((item.athlete || {}).displayName) === want);
    if (!row) return;
    const shown = [];
    (group.keys || []).forEach((key, index) => {
      const raw = String((row.stats || [])[index] || ""), keys = key.split(/[/-]/), parts = keys.length > 1 ? raw.split(/[/-]/) : [raw];
      keys.forEach((one, at) => { const num = Number(parts[at]); if (parts[at] === "" || !Number.isFinite(num)) return; got[`${group.name}.${one}`] = num; if (got[one] === undefined) got[one] = num; });
      const label = (group.labels || [])[index];
      if (label && raw && LIVE_SHOW.includes(label)) shown.push(`${raw} ${label}`);
    });
    if (shown.length && !/fumbles|kicking|punting|interceptions|kickReturns|puntReturns/.test(group.name || "")) lines.push(`${/^(passing|rushing|receiving|defensive)$/.test(group.name || "") ? `${group.name[0].toUpperCase()}${group.name.slice(1)}: ` : ""}${shown.join(", ")}`);
  }));
  return { got, lines };
}

function liveValue(got, kind, sport) {
  const keys = sport === "NHL" && kind === "Points" ? ["goals", "assists"] : LIVE_KINDS[kind];
  return keys ? keys.reduce((sum, key) => sum + (got[key] || 0), 0) : null;
}

function liveSay(row, have, kind) {
  const prop = String((row.querySelector(".prop") || {}).textContent || "");
  if (/qtr|quarter|half|each|period|inning|first|1st|2nd|3rd|\dth|last/i.test(`${row.dataset.market || ""} ${prop}`)) return "";
  const word = kind === "PRA" ? kind : kind.toLowerCase();
  const plus = prop.match(/(\d+(?:\.\d+)?)\+/), over = prop.match(/over\s*(\d+(?:\.\d+)?)/i), under = prop.match(/under\s*(\d+(?:\.\d+)?)/i);
  if (under) { const cap = Number(under[1]); return have > cap ? `Has ${have} ${word}. This under already lost.` : `Has ${have} ${word}. Stays under with ${Math.floor(cap - have)} or fewer more.`; }
  const bar = plus ? Number(plus[1]) : over ? Math.floor(Number(over[1])) + 1 : kind === "Touchdowns" ? 1 : null;
  if (bar == null) return `Has ${have} ${word} so far.`;
  return have >= bar ? `Has ${have} ${word}. Already cleared ${bar}.` : `Has ${have} ${word}. Needs ${bar - have} more.`;
}

function paintLive(list, heading, person) {
  const now = Date.now();
  const bet = (person.bets || []).find((row) => { const kick = Date.parse(row.kickoff || ""); return kick <= now && kick > now - 6 * 3600000; });
  const path = bet && LIVE_PATHS[bet.sport];
  if (!path || !window.noteEspnId) return;
  const box = document.createElement("p");
  box.className = "find-live";
  box.style.cssText = "margin: 0.35rem 0; color: #3dff6e; font-weight: 800;";
  heading.after(box);
  const run = () => window.noteEspnId(path, bet).then((id) => id && fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`).then((res) => res.json())).then((data) => {
    if (!data || !box.isConnected) return;
    const status = ((((data.header || {}).competitions || [])[0] || {}).status || {}).type || {};
    if (status.state !== "in") { box.remove(); list.querySelectorAll(".find-live-row").forEach((node) => node.remove()); return; }
    const { got, lines } = liveBox(data, person.name);
    box.textContent = `Live, ${status.detail || "in progress"}. ${lines.length ? lines.join(". ") : `${person.name} has no stats yet`}.`;
    list.querySelectorAll(":scope > .rec-bet").forEach((row) => {
      const kind = row.dataset.kind || "", have = liveValue(got, kind, bet.sport);
      const text = have == null ? "" : liveSay(row, have, kind);
      let note = row.querySelector(":scope > .find-live-row");
      if (!text) { if (note) note.remove(); return; }
      if (!note) { note = document.createElement("p"); note.className = "find-live-row"; note.style.cssText = "margin: 0.25rem 0; color: #3dff6e; font-weight: 800;"; const line = row.querySelector(":scope > .rec-gist"); if (line) line.after(note); else row.append(note); }
      note.textContent = `Live: ${text}`;
    });
  }).catch(() => {});
  run();
  const timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); return; } run(); }, 60000);
}

window.paintLive = paintLive;
