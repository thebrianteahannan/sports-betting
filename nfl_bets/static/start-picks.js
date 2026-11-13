/** Build a bet always shows the home Recommended picks and Games under the bet, so a leg or a game is one tap away instead of on another page. */

let startTab = "rec", startBack = null, startUndo = null, startRandomAt = null;
let startFavOnly = localStorage.getItem("startFavOnly") === "1";
const startKinds = new Set(), START_KINDS = [["safe", "Safe"], ["balanced", "Balanced"], ["payout", "Payout"], ["good", "Good bet"], ["math", "Math"], ["script", "Script"]];

function startKindOf(pick) {
  const key = typeof scriptKindSay === "function" ? scriptKindSay(pick).key : "";
  return [key, ...(pick.basis === "both" ? ["math", "script"] : [pick.basis])].filter(Boolean);
}

function startKindOk(pick) {
  const has = startKindOf(pick), kinds = ["safe", "balanced", "payout", "good"].filter((id) => startKinds.has(id)), bases = ["math", "script"].filter((id) => startKinds.has(id));
  return (!kinds.length || kinds.some((id) => has.includes(id))) && (!bases.length || bases.some((id) => has.includes(id)));
}

function startKindBar(all) {
  const bar = document.createElement("div"), have = new Set(all.flatMap(startKindOf));
  bar.className = "find-start-kinds";
  START_KINDS.filter(([id]) => have.has(id) || startKinds.has(id)).forEach(([id, label]) => {
    const on = startKinds.has(id), chip = Object.assign(document.createElement("button"), { type: "button", className: `find-start-kind${on ? " on" : ""}`, textContent: label });
    chip.setAttribute("aria-pressed", String(on));
    chip.addEventListener("click", () => { if (on) startKinds.delete(id); else startKinds.add(id); startPaint(1); });
    bar.append(chip);
  });
  if (startKinds.size) {
    const clear = Object.assign(document.createElement("button"), { type: "button", className: "find-start-kind find-start-clear", textContent: "Clear" });
    clear.addEventListener("click", () => { startKinds.clear(); startPaint(1); });
    bar.append(clear);
  }
  return bar;
}

function startOpen(board, bet) {
  const teams = board.querySelector(":scope > .find-teams"), list = board.querySelector(":scope > .find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), span = board.querySelector(":scope > .find-span"), more = board.querySelector(".find-games-go");
  if (!teams || !list || typeof paintMatch !== "function") return;
  if (hits) hits.replaceChildren();
  teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on");
  if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
  startBack = { board, picked: span ? span.classList.contains("find-picked") : false, more: more ? more.hidden : true };
  if (more) more.hidden = false;
  paintMatch(teams, bet, board.people || [], list, hits, true);
  teams.scrollIntoView({ block: "start", behavior: "smooth" });
}

function startClose() {
  const { board, picked, more } = startBack || {};
  startBack = null;
  if (!board || !board.isConnected || !board.querySelector(":scope > .find-teams .find-match")) return false;
  const span = board.querySelector(":scope > .find-span"), go = board.querySelector(".find-games-go"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)");
  board.querySelector(":scope > .find-teams").replaceChildren(); board.querySelector(":scope > .find-list").replaceChildren();
  if (hits) hits.replaceChildren();
  if (span && !picked) span.classList.remove("find-picked");
  if (go) go.hidden = more;
  if (!document.querySelector("#desk-glass-in .find-start")) startPaint();
  const glass = document.getElementById("desk-glass-in");
  if (glass) glass.scrollTop = 0;
  return true;
}

function startBet(board, pick) {
  const index = typeof legBoostFind === "function" ? legBoostFind(board.people) : new Map();
  const hit = index.get(`${pick.label}|${pick.market}|${pick.match}`) || [...index.values()].find((row) => row.bet.label === pick.label && row.bet.match === pick.match);
  if (hit) { startUndo = { board, key: parlayKey(hit.bet), ids: new Set(saveList().map((row) => row.id)) }; if (typeof betFromSay === "function") betFromSay("Recommended"); return legSwapAdd(hit.person, hit.bet); }
  window.location.href = `/?${new URLSearchParams({ game: pick.match, label: pick.label, market: pick.market || "" })}`;
}

function startGameOpen(board, game) {
  let bet = null;
  (board.people || []).some((person) => (person.bets || []).some((one) => (one.match === game.match ? (bet = one) : false)));
  if (bet) startOpen(board, bet); else homeGamesOpen(game);
}

function startRandomPool(board, picks) {
  const index = typeof legBoostFind === "function" ? legBoostFind(board.people) : new Map(), seen = new Set();
  return picks.map((pick) => index.get(`${pick.label}|${pick.market}|${pick.match}`) || [...index.values()].find((row) => row.bet.label === pick.label && row.bet.match === pick.match)).filter((hit) => hit && !seen.has(hit.person.key) && seen.add(hit.person.key));
}

function startRandom(board, picks, n) {
  const pool = startRandomPool(board, picks);
  for (let at = pool.length - 1; at > 0; at--) { const swap = Math.floor(Math.random() * (at + 1)); [pool[at], pool[swap]] = [pool[swap], pool[at]]; }
  const legs = pool.slice(0, n);
  if (!legs.length) return;
  const again = startRandomAt && window.parlayOpenId === startRandomAt.id && saveSig([...parlayLeg.values()]) === startRandomAt.sig;
  if (again) { parlayLeg.clear(); parlayPick.clear(); }
  else {
    const had = parlayLeg.size > 0;
    if (had && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
    startRandomAt = { prior: had ? window.parlayOpenId || "" : "", ids: new Set(saveList().map((row) => row.id)) };
    saveNew();
  }
  if (typeof betFromSay === "function") betFromSay("Random Recommended", true);
  legs.forEach(({ person, bet }) => { parlayLeg.set(parlayKey(bet), bet); if (!parlayPick.has(person.key)) parlayPick.set(person.key, person); });
  if (typeof trayRoster === "function") trayRoster();
  saveNow(); paintParlay();
  Object.assign(startRandomAt, { id: window.parlayOpenId, sig: saveSig([...parlayLeg.values()]) });
  startUndo = { board, keys: [...parlayLeg.keys()], ids: startRandomAt.ids, prior: startRandomAt.prior };
  const glass = document.getElementById("desk-glass-in");
  if (glass) glass.scrollTo({ top: 0, behavior: "smooth" });
}

function startRandomBar(board, picks) {
  const most = startRandomPool(board, picks).length, bar = document.createElement("span");
  bar.className = "find-start-random";
  if (most < 2) return bar;
  bar.append(Object.assign(document.createElement("i"), { textContent: "Random parlay" }));
  [2, 3, 4, 5].filter((n) => n <= most).forEach((n) => {
    const go = Object.assign(document.createElement("button"), { type: "button", textContent: String(n), title: `Build a random ${n}-leg parlay from the recommended picks` });
    go.addEventListener("click", () => startRandom(board, picks, n));
    bar.append(go);
  });
  if (most > 5) {
    const more = document.createElement("select");
    more.setAttribute("aria-label", "Random parlay with more legs");
    more.innerHTML = `<option value="">More</option>${Array.from({ length: most - 5 }, (_, at) => `<option value="${at + 6}">${at + 6} legs</option>`).join("")}`;
    more.addEventListener("change", () => { const n = Number(more.value); more.value = ""; if (n) startRandom(board, picks, n); });
    bar.append(more);
  }
  return bar;
}

function startFavBox() {
  const box = document.createElement("label"), check = Object.assign(document.createElement("input"), { type: "checkbox", checked: startFavOnly });
  box.className = "find-start-fav";
  check.addEventListener("change", () => { startFavOnly = check.checked; localStorage.setItem("startFavOnly", startFavOnly ? "1" : ""); startPaint(1); });
  box.append(check, document.createTextNode("Only my teams"));
  return box;
}

function startRecs(board) {
  const now = Date.now(), left = homeGamesList.filter((game) => Date.parse(game.kickoff || "") > now), picks = [], all = [];
  const recs = homeRecRows(left).filter((node) => { if (node.startPick) all.push(node.startPick); return !node.startPick || startKindOk(node.startPick); }).map((node) => {
    if (node.startPick) picks.push(node.startPick);
    if (!node.classList.contains("desk-rec")) return node;
    const copy = node.cloneNode(true), pick = node.startPick;
    if (pick) { copy.title = "Add to a new bet"; copy.addEventListener("click", () => startBet(board, pick)); }
    return copy;
  });
  const fav = (game) => typeof favTeamsHas === "function" && favTeamsHas(game), allGames = homeGameRows(left), favAny = allGames.some((node) => node.startGame && fav(node.startGame));
  const games = allGames.filter((node) => !startFavOnly || !node.startGame || fav(node.startGame)).map((node) => {
    if (!node.classList.contains("desk-game") || node.classList.contains("desk-game-live")) return node;
    const copy = node.cloneNode(true), game = node.startGame;
    if (game) copy.addEventListener("click", () => startGameOpen(board, game));
    return copy;
  });
  if (startFavOnly && !games.some((node) => node.startGame)) games.push(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: "None of your teams play today. Uncheck Only my teams for the rest." }));
  if (all.length && !picks.length) recs.push(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: "No picks match these filters. Tap Clear for the rest." }));
  return { recs, games, picks, all, favAny };
}

function startUndoGo() {
  const { board, key, keys = [key], ids, prior } = startUndo || {};
  startUndo = null;
  if (!board || !board.isConnected || parlayLeg.size !== keys.length || !keys.every((one) => parlayLeg.has(one))) return false;
  if (window.parlayOpenId && !ids.has(window.parlayOpenId)) saveStore(saveList().filter((row) => row.id !== window.parlayOpenId));
  window.parlayOpenId = ""; window.sharedViewing = "";
  parlayPick.clear(); parlayLeg.clear();
  if (prior && saveList().some((row) => row.id === prior)) saveOpen(prior);
  else { if (typeof trayRoster === "function") trayRoster(); paintParlay(); saveTips(); }
  const glass = document.getElementById("desk-glass-in");
  if (glass) glass.scrollTop = 0;
  return true;
}

function startStackKey() {
  return [...new Set([...parlayLeg.values()].map((bet) => bet.match).filter(Boolean))].join("|");
}

function startStacks() {
  if (typeof saveStacks !== "function") return [];
  const temp = document.createElement("div");
  window.saveStacksOpen = true; saveStacks(temp); window.saveStacksOpen = false;
  const panel = temp.querySelector(".find-saved-stacks");
  if (panel && typeof stackKindBar === "function" && !panel.querySelector(":scope > .stack-kind-bar")) panel.prepend(stackKindBar(panel));
  return panel ? [panel] : [];
}

function startSpot() {
  const tray = document.querySelector("#desk-glass-in .find-board > .find-tray");
  return tray && (tray.parentElement.querySelector(":scope > .find-tips") || tray);
}

function startPlace() {
  const spot = startSpot(), box = document.querySelector("#desk-glass-in .find-start");
  if (!spot) return;
  if (!box) startPaint(); else if (spot.nextElementSibling !== box) spot.after(box);
}

function startPaint(again) {
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  const spot = startSpot(), board = spot && spot.closest(".find-board");
  if (!spot || !board || typeof homeRecRows !== "function") return;
  const input = board.querySelector("label.find input");
  homeRecsLoad(); homeLogosLoad(); homeLeagueSync();
  const box = document.createElement("div"), tabs = document.createElement("span");
  box.className = "find-start"; tabs.className = "desk-games-tabs";
  const { recs, games, picks, all, favAny } = startRecs(board), shared = Boolean(window.saveWho && typeof sharedTabBody === "function");
  if (startTab === "shared" && !shared) startTab = "rec";
  [["rec", "Recommended"], ["games", `Games ${games.filter((node) => node.classList.contains("desk-game")).length}`], ["stacks", "Strategies"], ...(shared ? [["shared", sharedTabLabel()]] : [])].forEach(([id, label]) => {
    const tab = Object.assign(document.createElement("button"), { type: "button", className: `desk-games-tab${startTab === id ? " on" : ""}`, textContent: label });
    tab.setAttribute("aria-pressed", String(startTab === id));
    tab.addEventListener("click", () => { startTab = id; startPaint(1); });
    tabs.append(tab);
  });
  box.dataset.stacks = startStackKey();
  if (typeof sharedTabKey === "function") box.dataset.shared = sharedTabKey();
  const row = document.createElement("div");
  row.className = "find-start-row";
  row.append(tabs, ...(startTab === "rec" ? [startRandomBar(board, picks)] : startTab === "games" && (favAny || startFavOnly) ? [startFavBox()] : []));
  box.append(row, ...(startTab === "rec" ? [...(all.length ? [startKindBar(all)] : []), ...recs] : startTab === "stacks" ? startStacks() : startTab === "shared" && shared ? [sharedTabBody(board)] : games));
  box.hidden = Boolean(input && input.value.trim());
  spot.after(box);
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
  saveTips = function () { saveTipsStart.apply(this, arguments); startPlace(); };
}
if (typeof paintParlay === "function") {
  const paintParlayStart = paintParlay;
  paintParlay = function () {
    if (window.saveStacksOpen) { window.saveStacksOpen = false; startTab = "stacks"; document.querySelectorAll(".find-start").forEach((node) => node.remove()); }
    paintParlayStart.apply(this, arguments); startPlace();
    const box = document.querySelector("#desk-glass-in .find-start");
    if (box && ((startTab === "stacks" && box.dataset.stacks !== startStackKey()) || (typeof sharedTabKey === "function" && box.dataset.shared !== sharedTabKey()))) startPaint(1);
  };
}
document.addEventListener("input", (event) => { if (event.target.closest && event.target.closest("label.find")) { startBack = startUndo = null; document.querySelectorAll(".find-start").forEach((node) => { node.hidden = Boolean(event.target.value.trim()); }); } });
document.addEventListener("click", (event) => {
  if (!(startBack || startUndo) || !event.target.closest || !event.target.closest("#desk-back") || document.getElementById("desk").classList.contains("bird-on")) return;
  if (startClose() || startUndoGo()) { event.stopImmediatePropagation(); event.preventDefault(); }
}, true);
document.addEventListener("scroll", () => {
  const row = document.querySelector("#desk-glass-in .find-start-row"), tray = row && row.closest(".find-board").querySelector(":scope > .find-tray:not([hidden])");
  if (row) row.style.top = tray && tray.classList.contains("find-shut") && getComputedStyle(tray).position === "sticky" ? `${tray.offsetHeight + 8}px` : "";
}, true);
