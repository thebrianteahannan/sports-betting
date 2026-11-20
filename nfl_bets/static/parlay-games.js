/** When a bet is open, stack its games collapsed under THE BET. Click a leg row (or the team name) to expand that game; opening one closes the others. */

function parlayGameKey(bet) {
  return `${bet.match || ""}|${bet.kickoff || ""}`;
}

function parlayGameList() {
  if (typeof parlayLeg === "undefined" || !parlayLeg.size) return [];
  const seen = new Set(), rows = [];
  parlayLeg.forEach((bet) => {
    if (!bet || !bet.match) return;
    const key = parlayGameKey(bet);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(bet);
  });
  return rows;
}

function parlayGameMatchOf(node) {
  return (node && (node.dataset.parlayMatch || "")) || "";
}

function parlayGameFoldSay(match) {
  if (!match) return;
  const shut = match.classList.contains("find-game-shut");
  const say = shut ? "Show ▾" : "Hide ▴";
  match.querySelectorAll(":scope > .find-when .find-game-fold, :scope > .find-when .find-game-open").forEach((node) => {
    if (node.classList.contains("find-game-open")) {
      const base = node.dataset.base || node.textContent.replace(/\s·\s(?:Show ▾|Hide ▴)\s*$/, "").trim();
      node.dataset.base = base;
      node.textContent = [base, say].filter(Boolean).join(" · ");
      node.setAttribute("aria-expanded", String(!shut));
    } else node.textContent = say;
  });
}

function parlayGameShut(match, shut) {
  if (!match) return;
  match.classList.toggle("find-game-shut", !!shut);
  parlayGameFoldSay(match);
}

function parlayGameExpand(want) {
  const board = document.querySelector("#desk-glass-in .find-board");
  const teams = board && board.querySelector(":scope > .find-teams");
  if (!teams || !teams.dataset.parlayGames || !want) return;
  let opened = null;
  teams.querySelectorAll(":scope > .find-match[data-parlay-match]").forEach((match) => {
    const on = parlayGameMatchOf(match) === want;
    parlayGameShut(match, !on);
    if (on) opened = match;
  });
  if (opened && typeof gameScrollTo === "function") gameScrollTo(opened);
  else if (opened) opened.scrollIntoView({ behavior: "smooth", block: "start" });
}

function parlayGameLabel(match, bet) {
  const bar = match.querySelector(":scope > .find-when");
  if (!bar) return;
  const tools = bar.querySelector(".find-game-tools");
  const short = typeof gameShort === "function" ? gameShort(bet.match) : "";
  const time = bet.kickoff && typeof window.when === "function" ? `${window.when(bet.kickoff)} ET` : "";
  const base = [short || bet.match, time].filter(Boolean).join(" · ");
  bar.replaceChildren();
  const open = document.createElement("button");
  open.type = "button";
  open.className = "find-game-open";
  open.dataset.base = base;
  open.setAttribute("aria-expanded", String(!match.classList.contains("find-game-shut")));
  bar.append(open);
  if (tools) {
    tools.querySelectorAll(".find-game-x").forEach((node) => node.remove());
    const fold = tools.querySelector(".find-game-fold");
    // Keep Show on the left of the tools row so chat/profile chips do not cover it.
    if (fold) tools.prepend(fold);
    bar.append(tools);
  }
  parlayGameFoldSay(match);
}

function parlayGamesPaint() {
  const board = document.querySelector("#desk-glass-in .find-board");
  if (!board || typeof paintMatch !== "function") return;
  const teams = board.querySelector(":scope > .find-teams");
  const list = board.querySelector(":scope > .find-list");
  const hits = board.querySelector(":scope > .find-hits:not(.find-tray)");
  if (!teams) return;
  if (board.classList.contains("find-td-on") || board.querySelector(".find-list.find-td-board")) {
    if (teams.dataset.parlayGames) { teams.replaceChildren(); delete teams.dataset.parlayGames; }
    return;
  }
  const games = parlayGameList();
  const sig = games.map(parlayGameKey).join(";");
  if (!sig) {
    if (teams.dataset.parlayGames) { teams.replaceChildren(); delete teams.dataset.parlayGames; delete teams.dataset.who; }
    return;
  }
  if (teams.dataset.parlayGames === sig && teams.querySelector(":scope > .find-match[data-parlay-match]")) return;
  const people = board.people || [];
  const open = teams.querySelector(":scope > .find-match[data-parlay-match]:not(.find-game-shut)");
  const keep = open && parlayGameMatchOf(open);
  teams.replaceChildren();
  delete teams.dataset.who;
  teams.dataset.parlayGames = sig;
  games.forEach((bet) => {
    paintMatch(teams, bet, people, list, hits, true);
    const match = [...teams.querySelectorAll(":scope > .find-match")].pop();
    if (!match) return;
    match.dataset.parlayMatch = bet.match;
    if (typeof gameBarTools === "function") gameBarTools(match, false);
    parlayGameLabel(match, bet);
    parlayGameShut(match, bet.match !== keep);
  });
}

document.addEventListener("click", (event) => {
  const bar = event.target.closest && event.target.closest("#desk-glass-in .find-teams[data-parlay-games] .find-match > .find-when");
  if (!bar) return;
  if (event.target.closest(".find-game-x")) return;
  const match = bar.closest(".find-match");
  const teams = match && match.parentElement;
  if (!match || !teams) return;
  event.preventDefault();
  event.stopPropagation();
  const open = !match.classList.contains("find-game-shut");
  if (open) parlayGameShut(match, true);
  else {
    parlayGameExpand(parlayGameMatchOf(match));
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest) return;
  if (event.target.closest("button.find-out, button.find-leg-hist, button.find-leg-swap, button.find-leg-to, button.find-leg-seek, button.find-leg-more, button.find-name, a, input, label, i.prop, i.who, .find-tray-swap, .find-tray-read, .find-leg-menu, .leg-boost-box")) return;
  const line = event.target.closest(".find-tray .find-chose");
  if (!line) return;
  const teams = document.querySelector("#desk-glass-in .find-teams[data-parlay-games]");
  if (!teams) return;
  const key = line.dataset.key || (line.querySelector("[data-key]") || {}).dataset.key;
  const bet = key && typeof parlayLeg !== "undefined" && parlayLeg.get(key);
  if (!bet || !bet.match) return;
  event.preventDefault();
  event.stopPropagation();
  const open = [...teams.querySelectorAll(":scope > .find-match[data-parlay-match]")].find((node) => parlayGameMatchOf(node) === bet.match && !node.classList.contains("find-game-shut"));
  if (open) parlayGameShut(open, true);
  else parlayGameExpand(bet.match);
}, true);

if (typeof paintParlay === "function") {
  const paintParlayGames = paintParlay;
  paintParlay = function () {
    paintParlayGames.apply(this, arguments);
    parlayGamesPaint();
  };
}
