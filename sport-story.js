/** The NFL and NHL game scripts: load the box scores and the game details, then tell the story for that league. */

const { sportBoxes } = require("./sport-boxes");
const { tellNfl } = require("./nfl-story");
const { tellNhl } = require("./nhl-story");

function last(name) { return String(name || "").split(" ").pop(); }
function sectionOf(read, name) { return ((read && read.sections) || []).find((row) => row.name === name) || null; }
function colFor(section, team) { const tail = last(team).toLowerCase(); return ((section && section.cols) || []).find((col) => String(col.title || "").toLowerCase().includes(tail)) || null; }

function outsOf(read, team) {
  const col = colFor(sectionOf(read, "Who's out"), team);
  return ((col && col.lines) || []).map((line) => {
    const hit = String(line).match(/^(.+?), ([A-Z]{1,4}), (out|doubtful|questionable|injured reserve)(?: \((.+)\))?$/);
    return hit ? { name: hit[1], pos: hit[2], status: hit[3], next: hit[4] || "" } : null;
  }).filter(Boolean);
}

function tellSport(sport, game, boxes, extra) {
  if (sport === "NFL") return tellNfl(game, boxes, extra);
  if (sport === "NHL") return tellNhl(game, boxes, extra);
  return { plays: [], sections: [], watch: [] };
}

async function buildSport(game, board) {
  const { gameRead } = require("./game-read");
  const [boxes, read] = await Promise.all([
    sportBoxes(game.sport, game.awayName, game.homeName, game.kickoff).catch(() => null),
    gameRead({ match: game.match, kickoff: game.kickoff, sport: game.sport, espnId: game.espnId || "", noLead: true }, board).catch(() => null),
  ]);
  if (!boxes) return { sections: [] };
  const sky = sectionOf(read, "Weather");
  const extra = {
    outs: { away: outsOf(read, boxes.away.name), home: outsOf(read, boxes.home.name) },
    weather: sky && sky.text ? String(sky.text) : "",
    coach: (((sectionOf(read, "Coaches") || {}).lines) || [])[0] || "",
  };
  return tellSport(game.sport, game, boxes, extra);
}

module.exports = { buildSport, tellSport };
