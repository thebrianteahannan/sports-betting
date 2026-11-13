/** An empty bet shows the home Recommended picks and Games under the parrot's tips, inline, so a bet starts right here instead of on another page. */

let startTab = "rec";

function startOpen(board, bet) {
  const teams = board.querySelector(":scope > .find-teams"), list = board.querySelector(":scope > .find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), span = board.querySelector(":scope > .find-span"), more = board.querySelector(".find-games-go");
  if (!teams || !list || typeof paintMatch !== "function") return;
  if (hits) hits.replaceChildren();
  teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on");
  if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
  if (more) more.hidden = false;
  paintMatch(teams, bet, board.people || [], list, hits, true);
  teams.scrollIntoView({ block: "start", behavior: "smooth" });
}

function startBet(board, pick) {
  const index = typeof legBoostFind === "function" ? legBoostFind(board.people) : new Map();
  const hit = index.get(`${pick.label}|${pick.market}|${pick.match}`) || [...index.values()].find((row) => row.bet.label === pick.label && row.bet.match === pick.match);
  if (hit) return legSwapAdd(hit.person, hit.bet);
  window.location.href = `/?${new URLSearchParams({ game: pick.match, label: pick.label, market: pick.market || "" })}`;
}

function startGameOpen(board, game) {
  let bet = null;
  (board.people || []).some((person) => (person.bets || []).some((one) => (one.match === game.match ? (bet = one) : false)));
  if (bet) startOpen(board, bet); else homeGamesOpen(game);
}

function startRecs(board) {
  const now = Date.now(), left = homeGamesList.filter((game) => Date.parse(game.kickoff || "") > now);
  const recs = homeRecRows(left).map((node) => {
    if (!node.classList.contains("desk-rec")) return node;
    const copy = node.cloneNode(true), pick = node.startPick;
    if (pick) { copy.title = "Add to a new bet"; copy.addEventListener("click", () => startBet(board, pick)); }
    return copy;
  });
  const games = homeGameRows(left).map((node) => {
    if (!node.classList.contains("desk-game") || node.classList.contains("desk-game-live")) return node;
    const copy = node.cloneNode(true), game = node.startGame;
    if (game) copy.addEventListener("click", () => startGameOpen(board, game));
    return copy;
  });
  return { recs, games };
}

function startPaint(again) {
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  const tips = document.querySelector("#desk-glass-in .find-tips"), board = tips && tips.closest(".find-board");
  if (!tips || !board || parlayLeg.size || parlayPick.size || typeof homeRecRows !== "function") return;
  homeRecsLoad(); homeLogosLoad(); homeLeagueSync();
  const box = document.createElement("div"), tabs = document.createElement("span");
  box.className = "find-start"; tabs.className = "desk-games-tabs";
  const { recs, games } = startRecs(board);
  [["rec", "Recommended"], ["games", `Games ${games.filter((node) => node.classList.contains("desk-game")).length}`]].forEach(([id, label]) => {
    const tab = Object.assign(document.createElement("button"), { type: "button", className: `desk-games-tab${startTab === id ? " on" : ""}`, textContent: label });
    tab.setAttribute("aria-pressed", String(startTab === id));
    tab.addEventListener("click", () => { startTab = id; startPaint(1); });
    tabs.append(tab);
  });
  box.append(tabs, ...(startTab === "rec" ? recs : games));
  tips.after(box);
  if ((!homeRecs || homeRecs.loading) && (again || 0) < 20) setTimeout(() => { if (box.isConnected) startPaint((again || 0) + 1); }, 600);
}

if (typeof homeRecRow === "function") {
  const homeRecRowStart = homeRecRow;
  homeRecRow = function (pick) { const card = homeRecRowStart.apply(this, arguments); card.startPick = pick; return card; };
}
if (typeof homeGamesRow === "function") {
  const homeGamesRowStart = homeGamesRow;
  homeGamesRow = function (game) { const row = homeGamesRowStart.apply(this, arguments); row.startGame = game; return row; };
}
if (typeof saveTips === "function") {
  const saveTipsStart = saveTips;
  saveTips = function () { saveTipsStart.apply(this, arguments); startPaint(); };
}
if (typeof paintParlay === "function") {
  const paintParlayStart = paintParlay;
  paintParlay = function () { paintParlayStart.apply(this, arguments); if (parlayLeg.size || parlayPick.size) document.querySelectorAll(".find-start").forEach((node) => node.remove()); };
}
document.addEventListener("input", (event) => { if (event.target.closest && event.target.closest("label.find")) document.querySelectorAll(".find-start").forEach((node) => node.remove()); });
