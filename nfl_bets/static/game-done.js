/** Leaves finished games off the search page's game list, using ESPN's scoreboard. */

const gameDoneSet = new Set();
const GAME_DONE_PATHS = { NFL: "football/nfl", NBA: "basketball/nba", MLB: "baseball/mlb", NHL: "hockey/nhl", WNBA: "basketball/wnba" };
const gameDoneDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

function gameDoneKey(sport, away, home) {
  const nick = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/).pop();
  return `${sport}|${nick(away)}|${nick(home)}`;
}

function gameDoneOf(game) {
  const [away, home] = String(game.match || "").split(/\s@\s/);
  return Boolean(home) && gameDoneSet.has(gameDoneKey(game.sport, away, home));
}

if (typeof loadedGames === "function") {
  const loadedGamesAll = loadedGames;
  loadedGames = function (people, span) {
    const rows = loadedGamesAll(people, span);
    return Array.isArray(rows) ? rows.filter((game) => !gameDoneOf(game)) : rows;
  };
}

function gameDoneRepaint() {
  const board = document.querySelector(".find-board");
  if (!board || !board.paintSlate || !board.people) return;
  board.people.games = null;
  board.querySelectorAll(".find-games").forEach((box) => {
    box.games = null;
    if (!box.querySelector("summary")) return;
    const open = new Set([...box.querySelectorAll(":scope > details[open] > summary")].map((head) => head.textContent.split(",")[0]));
    board.paintSlate(box);
    box.querySelectorAll(":scope > details > summary").forEach((head) => { if (open.has(head.textContent.split(",")[0])) head.parentElement.open = true; });
  });
}

async function gameDoneCheck() {
  const board = document.querySelector(".find-board");
  if (!board || !board.people || document.visibilityState === "hidden") return;
  const now = Date.now(), asks = new Set();
  board.people.forEach((person) => (person.bets || []).forEach((bet) => {
    const kick = Date.parse(bet.kickoff || "");
    if (GAME_DONE_PATHS[bet.sport] && kick < now && kick > now - 30 * 3600000) asks.add(`${bet.sport}|${gameDoneDay.format(kick).replace(/-/g, "")}`);
  }));
  const before = gameDoneSet.size;
  await Promise.all([...asks].map(async (ask) => {
    const [sport, day] = ask.split("|");
    try {
      const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${GAME_DONE_PATHS[sport]}/scoreboard?dates=${day}`);
      if (!res.ok) return;
      ((await res.json()).events || []).forEach((event) => {
        const comp = (event.competitions || [])[0] || {}, type = (comp.status || event.status || {}).type || {};
        if (!type.completed && type.state !== "post") return;
        const side = (where) => (((comp.competitors || []).find((team) => team.homeAway === where) || {}).team || {}).displayName;
        gameDoneSet.add(gameDoneKey(sport, side("away"), side("home")));
      });
    } catch (error) { console.log("[game-done] scoreboard did not load", sport, error); }
  }));
  if (gameDoneSet.size !== before) gameDoneRepaint();
}

setInterval(gameDoneCheck, 120000);
setInterval(() => { const board = document.querySelector(".find-board"); if (board && board.people && board !== gameDoneCheck.board) { gameDoneCheck.board = board; gameDoneCheck(); } }, 1500);
