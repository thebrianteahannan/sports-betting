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
  board.classList.remove("find-td-on");
  teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on", "find-td-board");
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

function startHit(board, pick) {
  const index = typeof legBoostFind === "function" ? legBoostFind(board.people) : new Map();
  return index.get(`${pick.label}|${pick.market}|${pick.match}`) || [...index.values()].find((row) => row.bet.label === pick.label && row.bet.match === pick.match);
}

function startSeek(board, pick) {
  const hit = startHit(board, pick), name = hit ? hit.person.name : pick.who || String(pick.label || "").split(/\s+(?:\d|Over\b|Under\b)/)[0].trim();
  if (name && typeof legSeek === "function") legSeek(name);
}

function startTeam(board, pick) {
  const hit = startHit(board, pick), nick = String((hit && hit.person && hit.person.team) || pick.team || "").trim();
  const sides = String(pick.match || "").includes(" @ ") ? String(pick.match).split(" @ ") : String(pick.match || "").split(/\sv\s/i);
  const side = sides.map((name) => name.replace(/\s*\([^)]*\)/g, "").trim()).find((name) => nick && (name === nick || name.endsWith(` ${nick}`))) || nick;
  const fold = (text) => typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase();
  const want = fold(side), nickFold = fold(nick);
  const team = (board.people || []).find((person) => person.kind === "team" && (fold(person.name) === want || (nickFold && fold(person.name).endsWith(` ${nickFold}`))));
  const list = board.querySelector(".find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), roster = board.querySelector(":scope > .find-roster");
  if (team && list && hits && typeof showFind === "function") { showFind(list, hits, team, roster, board.people); return; }
  if (side && typeof legSeek === "function") legSeek(side);
}

function startCard(board, pick, card) {
  const open = card.querySelector(":scope > .desk-rec-more"), hit = startHit(board, pick);
  if (open) { open.remove(); return; }
  if (!hit || typeof paintCard !== "function") { startSeek(board, pick); return; }
  const more = document.createElement("div"), mark = document.createElement("span");
  more.className = "desk-rec-more"; mark.hidden = true;
  more.append(mark); card.append(more);
  paintCard(more, mark, hit.person);
}

function startBetGo(board, pick, mode) {
  if (mode !== "new" || !parlayLeg.size) { startBet(board, pick); return; }
  if (saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
  const prior = window.parlayOpenId || "", ids = new Set(saveList().map((row) => row.id));
  saveNew();
  startBet(board, pick);
  if (startUndo) Object.assign(startUndo, { ids, prior });
}

function startBetAsk(board, pick, card) {
  const open = card.querySelector(".desk-rec-ask");
  document.querySelectorAll(".find-start .desk-rec-ask").forEach((node) => node.remove());
  if (open) return;
  if (!parlayLeg.size) { startBetGo(board, pick, "new"); return; }
  const ask = document.createElement("span");
  ask.className = "desk-rec-ask";
  ask.innerHTML = `<i>You have a bet open.</i><span role="button" tabindex="0" data-bet-go="add">Add to this bet</span><span role="button" tabindex="0" data-bet-go="new">Start a new bet</span>`;
  card.append(ask);
}

function startBet(board, pick) {
  const hit = startHit(board, pick);
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

function startRandomSig(legs) {
  return legs.map(({ bet }) => parlayKey(bet)).sort().join("~");
}

function startRandomDraw(board, picks, n, skip) {
  const pool = startRandomPool(board, picks);
  let legs = [], sig = "";
  for (let tryAt = 0; tryAt < 12; tryAt++) {
    for (let at = pool.length - 1; at > 0; at--) { const swap = Math.floor(Math.random() * (at + 1)); [pool[at], pool[swap]] = [pool[swap], pool[at]]; }
    legs = pool.slice(0, n);
    sig = startRandomSig(legs);
    if (!legs.length || !skip || sig !== skip) break;
  }
  return legs;
}

function startRandomClose() {
  const box = document.getElementById("start-random");
  if (box) box.remove();
  startRandomAt = null;
}

function startRandomLine({ person, bet }) {
  const who = person.name || "", raw = String(bet.label || "").split(/\s+—\s+/)[0].trim();
  const prop = who && raw.toLowerCase().startsWith(who.toLowerCase()) ? raw.slice(who.length).trim() : raw;
  const odds = Number(bet.odds);
  return { who, prop: prop || bet.market || "", shown: odds > 0 ? `+${odds}` : String(odds), pct: typeof findPct === "function" ? findPct(odds) : "", match: bet.match || "" };
}

function startRandomStakeOf(box) {
  const n = Number(box && box.dataset.stake);
  if (n > 0) return n;
  return typeof parlayStakeOf === "function" ? parlayStakeOf() : 5;
}

function startRandomCashLine(box, legs) {
  const bets = legs.map(({ bet }) => bet);
  const px = typeof savePrice === "function" ? savePrice(bets) : "";
  const american = Number(String(px || "").replace("+", ""));
  const stake = startRandomStakeOf(box);
  const shown = Number.isInteger(stake) ? String(stake) : stake.toFixed(2);
  const pct = typeof findPct === "function" ? findPct(american) : "";
  const cash = typeof findCash === "function" ? findCash(american, stake) : "";
  const bits = [
    px && `<i class="px">${esc(px)}</i>`,
    pct && `<i class="pct">${esc(pct)}</i>`,
    cash && `<i class="pay"><button type="button" class="stake" aria-label="Change the bet size">$${esc(shown)}</button> profits ${esc(cash)}</i>`,
  ].filter(Boolean);
  return bits.length ? `${legs.length}-leg · ${bits.join("")}` : `${legs.length}-leg parlay`;
}

function startRandomEditStake(button, box) {
  const pay = button.closest("i.pay");
  if (!pay) return;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "stake";
  input.min = "1";
  input.max = "100000";
  input.step = "1";
  input.setAttribute("aria-label", "Bet size");
  input.value = button.textContent.replace(/[^0-9.]/g, "") || "5";
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    if (!input.isConnected) return;
    const amount = Number(input.value);
    box.dataset.stake = String(Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5);
    if (startRandomAt && startRandomAt.legs) startRandomFill(box, startRandomAt.legs);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { input.value = button.textContent; input.blur(); }
  });
  input.addEventListener("blur", finish);
}

function startRandomFill(box, legs) {
  const list = box.querySelector(".start-random-legs"), price = box.querySelector(".start-random-price");
  if (!list || !price) return;
  list.replaceChildren(...legs.map((hit) => {
    const line = startRandomLine(hit), row = document.createElement("div");
    row.className = "start-random-leg";
    row.innerHTML = `<b>${esc(line.who)}</b><span>${esc(line.prop)}</span><i class="px">${esc(line.shown)}</i>${line.pct ? `<i class="pct">${esc(line.pct)}</i>` : ""}<em>${esc(line.match)}</em>`;
    return row;
  }));
  price.innerHTML = startRandomCashLine(box, legs);
  const stakeBtn = price.querySelector("button.stake");
  if (stakeBtn) stakeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startRandomEditStake(stakeBtn, box);
  });
  if (startRandomAt) Object.assign(startRandomAt, { legs, sig: startRandomSig(legs) });
}

function startRandomAdd(board, legs, stake) {
  if (!legs.length) return;
  const had = parlayLeg.size > 0;
  if (had && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
  const prior = had ? window.parlayOpenId || "" : "", ids = new Set(saveList().map((row) => row.id));
  saveNew();
  if (typeof parlayStakeSet === "function") parlayStakeSet(stake);
  else window.parlayStake = Number(stake) > 0 ? Number(stake) : 5;
  if (typeof betFromSay === "function") betFromSay("Random Recommended", true);
  legs.forEach(({ person, bet }) => { parlayLeg.set(parlayKey(bet), bet); if (!parlayPick.has(person.key)) parlayPick.set(person.key, person); });
  if (typeof trayRoster === "function") trayRoster();
  window.saveGone = false;
  window.saveShut = false;
  try { localStorage.setItem("savedShut", "0"); } catch (error) {}
  saveNow(); paintParlay();
  startUndo = { board, keys: [...parlayLeg.keys()], ids, prior };
  startRandomClose();
  document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (fold) fold.click(); });
  const show = document.querySelector("#desk-glass-in .find-saved-chip.on") || document.querySelector("#desk-glass-in .find-saved") || document.querySelector("#desk-glass-in .find-tray");
  if (show) show.scrollIntoView({ block: "start", behavior: "smooth" });
}

function startRandomShow(board, picks, n, legs) {
  startRandomClose();
  if (!legs.length) return;
  startRandomAt = { board, picks, n, legs, sig: startRandomSig(legs) };
  const box = document.createElement("div");
  box.id = "start-random";
  box.dataset.stake = String(startRandomStakeOf(null));
  box.innerHTML = `<div class="start-random-card" role="dialog" aria-modal="true" aria-labelledby="start-random-title"><button type="button" class="start-random-x" aria-label="Close">&times;</button><p id="start-random-title" class="start-random-head">Random parlay</p><p class="start-random-price"></p><div class="start-random-legs"></div><p class="start-random-do"><button type="button" class="start-random-again">Regenerate</button><button type="button" class="start-random-add">Add to My Bets</button></p></div>`;
  const close = () => startRandomClose();
  box.addEventListener("click", (event) => { if (event.target === box) close(); });
  box.querySelector(".start-random-x").addEventListener("click", close);
  box.querySelector(".start-random-again").addEventListener("click", () => {
    if (!startRandomAt) return;
    const next = startRandomDraw(startRandomAt.board, startRandomAt.picks, startRandomAt.n, startRandomAt.sig);
    if (next.length) startRandomFill(box, next);
  });
  box.querySelector(".start-random-add").addEventListener("click", () => {
    if (!startRandomAt || !startRandomAt.legs.length) return;
    startRandomAdd(startRandomAt.board, startRandomAt.legs, startRandomStakeOf(box));
  });
  startRandomFill(box, legs);
  document.body.append(box);
}

function startRandom(board, picks, n) {
  const legs = startRandomDraw(board, picks, n);
  if (!legs.length) return;
  startRandomShow(board, picks, n, legs);
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

function startFavGame(match) {
  const game = homeGamesList.find((row) => row.match === match) || startWeekGames.find((row) => row.match === match) || ((window.state && state.board && state.board.games) || []).find((row) => row.match === match);
  return Boolean(game && typeof favTeamsHas === "function" && favTeamsHas(game));
}

function startStackFav(stack) {
  return !startFavOnly || [stack.game, ...(stack.bets || []).map((bet) => bet.game)].filter(Boolean).some(startFavGame);
}

function startFavBox() {
  const box = document.createElement("label"), check = Object.assign(document.createElement("input"), { type: "checkbox", checked: startFavOnly });
  box.className = "find-start-fav";
  check.addEventListener("change", () => { startFavOnly = check.checked; localStorage.setItem("startFavOnly", startFavOnly ? "1" : ""); window.saveStacksPanel = null; startPaint(1); });
  box.append(check, document.createTextNode("Only my teams"));
  return box;
}

function startTdGo(board, people) {
  if (!board || typeof openTdPage !== "function") return;
  const list = board.querySelector(".find-list");
  const hits = board.querySelector(":scope > .find-hits:not(.find-tray)");
  const span = board.querySelector(":scope > .find-span");
  const more = board.querySelector(".find-games-go");
  if (!list) return;
  startBack = { board, picked: span ? span.classList.contains("find-picked") : false, more: more ? more.hidden : true };
  if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
  if (more) more.hidden = false;
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  openTdPage(list, people || board.people || [], hits, null, null, startSpan === "week" ? "week" : "today");
}
window.startTdGo = startTdGo;

function startTdButton(board) {
  const games = leftGames();
  const league = typeof homeLeagueOn === "function" ? homeLeagueOn(games) : "";
  if (league && league !== "NFL") return null;
  const hasNfl = games.some((game) => String(game.sport || "") === "NFL") || ((homeRecs && homeRecs.picks) || []).some((pick) => (typeof homePickSport === "function" ? homePickSport(pick) : pick.sport) === "NFL");
  if (!hasNfl || typeof openTdPage !== "function") return null;
  const go = Object.assign(document.createElement("button"), { type: "button", className: "find-start-td", textContent: "Anytime TDs" });
  go.title = "See who is most likely to score a touchdown";
  go.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const live = document.querySelector("#desk-glass-in .find-board") || board;
    if (!live || typeof startTdGo !== "function") return;
    if (!(live.people || []).some((person) => person.kind === "player" && (person.bets || []).length)) return;
    startTdGo(live);
  });
  return go;
}

function startRecs(board, box) {
  const left = leftGames(), picks = [], all = [], when = startSpan === "week" ? "this week" : "today";
  const recs = homeRecRows(left, box).filter((node) => {
    if (!node.startPick) return true;
    if (!startPickSpanOk(node.startPick)) return false;
    all.push(node.startPick);
    return startKindOk(node.startPick) && (!startFavOnly || startFavGame(node.startPick.match));
  }).map((node) => {
    if (node.startPick) picks.push(node.startPick);
    if (!node.classList.contains("desk-rec")) {
      if (node.classList.contains("desk-games-label") && startSpan === "week") node.textContent = "This week";
      return node;
    }
    const copy = node.cloneNode(true), pick = node.startPick;
    if (pick) {
      copy.title = "Show the player";
      const actions = document.createElement("span");
      actions.className = "desk-rec-go";
      actions.append(
        Object.assign(document.createElement("span"), { className: "desk-rec-bet", textContent: "Bet it", title: "Bet it" }),
        Object.assign(document.createElement("span"), { className: "desk-rec-team", textContent: "Team", title: "Team page" })
      );
      copy.append(actions);
      copy.addEventListener("click", (event) => {
        const go = event.target.closest("[data-bet-go]");
        if (go) { copy.querySelectorAll(".desk-rec-ask").forEach((node) => node.remove()); startBetGo(board, pick, go.dataset.betGo); return; }
        if (event.target.closest(".desk-rec-team")) { startTeam(board, pick); return; }
        if (event.target.closest(".desk-rec-bet")) { startBetAsk(board, pick, copy); return; }
        if (event.target.closest(".desk-rec-ask, .desk-rec-more, .desk-rec-go")) return;
        startCard(board, pick, copy);
      });
    }
    return copy;
  });
  const games = homeGameRows(left, box).filter((node) => !startFavOnly || !node.startGame || startFavGame(node.startGame.match)).map((node) => {
    if (!node.classList.contains("desk-game") || node.classList.contains("desk-game-live")) return node;
    const copy = node.cloneNode(true), game = node.startGame;
    if (game) copy.addEventListener("click", () => startGameOpen(board, game));
    return copy;
  });
  if (startFavOnly && !games.some((node) => node.startGame)) games.push(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: `None of your teams play ${when}. Uncheck Only my teams for the rest.` }));
  if (all.length && !picks.length) recs.push(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: startKinds.size ? "No picks match these filters. Tap Clear for the rest." : "None of your teams have a pick. Uncheck Only my teams for the rest." }));
  return { recs, games, picks, all };
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

function startTdOpen() {
  return Boolean(document.querySelector("#desk-glass-in .find-board.find-td-on, #desk-glass-in .find-list.find-td-board"));
}

function startPlace() {
  if (startTdOpen()) return;
  const spot = startSpot(), box = document.querySelector("#desk-glass-in .find-start");
  if (!spot) return;
  if (!box) startPaint(); else if (spot.nextElementSibling !== box) spot.after(box);
}

function startPaint(again) {
  if (startTdOpen()) return;
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  const spot = startSpot(), board = spot && spot.closest(".find-board");
  if (!spot || !board || typeof homeRecRows !== "function") return;
  const input = board.querySelector("label.find input");
  if (startSpan === "week") startWeekLoad();
  homeRecsLoad(startSpan === "week" ? "week" : ""); homeLogosLoad(); homeLeagueSync();
  const box = document.createElement("div"), tabs = document.createElement("span");
  box.className = "find-start"; tabs.className = "desk-games-tabs";
  if (startTab === "shared") startTab = "rec";
  const { recs, games, picks, all } = startRecs(board, box);
  [["rec", "Recommended"], ["games", `Games ${games.filter((node) => node.classList.contains("desk-game")).length}`], ["stacks", "Strategies"]].forEach(([id, label]) => {
    const tab = Object.assign(document.createElement("button"), { type: "button", className: `desk-games-tab${startTab === id ? " on" : ""}`, textContent: label });
    tab.setAttribute("aria-pressed", String(startTab === id));
    tab.addEventListener("click", () => { startTab = id; startPaint(1); });
    tabs.append(tab);
  });
  box.dataset.stacks = startStackKey();
  const row = document.createElement("div");
  row.className = "find-start-row";
  const leagues = typeof homeLeagues === "function" ? homeLeagues(box, leftGames()) : [];
  const td = startTab === "rec" ? startTdButton(board) : null;
  row.append(tabs, startSpanBar(), ...leagues, ...(startTab === "rec" ? [startRandomBar(board, picks)] : []), ...(((window.memberTeams || []).length || startFavOnly) ? [startFavBox()] : []), ...(td ? [td] : []));
  const quick = typeof quickAddBox === "function" ? quickAddBox(board) : null;
  box.append(...(quick ? [quick] : []), row, ...(startTab === "rec" ? [...(all.length ? [startKindBar(all)] : []), ...recs] : startTab === "stacks" ? startStacks() : games));
  box.hidden = Boolean(input && input.value.trim());
  spot.after(box);
  const waiting = (startSpan === "week" && startWeekLoading) || !homeRecs || homeRecs.loading;
  if (waiting && (again || 0) < 20) setTimeout(() => { if (box.isConnected) startPaint((again || 0) + 1); }, 600);
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
    if (box && startTab === "stacks" && box.dataset.stacks !== startStackKey()) startPaint(1);
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
