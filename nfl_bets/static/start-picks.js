/** Build a bet keeps Quick add. Recommended lives on the Recommended page. Strategies sit on the admin profile. */

let startTab = "rec", startBack = null, startUndo = null, startRandomAt = null, startGolden = null, startMetals = null;
let startFavOnly = false;
let startHistTab = "stats";
let startPickGames = new Set();
let startFoldOpen = { league: false, games: false, filters: false };
let startFiltersAuto = false;
let startFiltersMute = 0;
const startKinds = new Set(), START_KINDS = [["safe", "Safe"], ["balanced", "Balanced"], ["payout", "Payout"], ["good", "Good bet"], ["math", "Math"], ["script", "Script"], ["solid", "Steady role"], ["cushion", "Cushion"]];

function startKindOf(pick) {
  const key = typeof scriptKindSay === "function" ? scriptKindSay(pick).key : "";
  return [
    key,
    ...(pick.basis === "both" ? ["math", "script"] : [pick.basis]),
    pick.role === "solid" ? "solid" : "",
    pick.cushion ? "cushion" : "",
  ].filter(Boolean);
}

function startKindOk(pick) {
  const has = startKindOf(pick), kinds = ["safe", "balanced", "payout", "good"].filter((id) => startKinds.has(id)), bases = ["math", "script"].filter((id) => startKinds.has(id));
  const extras = ["solid", "cushion"].filter((id) => startKinds.has(id));
  return (!kinds.length || kinds.some((id) => has.includes(id))) && (!bases.length || bases.some((id) => has.includes(id))) && (!extras.length || extras.every((id) => has.includes(id)));
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
  if (!board || typeof board.querySelector !== "function") { if (side && typeof legSeek === "function") legSeek(side); return; }
  const list = board.querySelector(".find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), roster = board.querySelector(":scope > .find-roster");
  if (team && list && hits && typeof showFind === "function") { showFind(list, hits, team, roster, board.people); return; }
  if (side && typeof legSeek === "function") legSeek(side);
}

function startRecWhy(pick) {
  const box = document.createElement("div");
  box.className = "desk-rec-why";
  const tips = [];
  if (pick && pick.golden) tips.push({ label: "Golden Ticket", tip: "Golden Ticket: −120 to +120, and it has hit 60% or more." });
  if (pick && pick.silver) tips.push({ label: "Silver Ticket", tip: "Silver Ticket: −150 to +150, and it has hit 55% or more." });
  if (pick && pick.bronze) tips.push({ label: "Bronze Ticket", tip: "Bronze Ticket: −200 to +200, and it has hit 50% or more." });
  if (typeof scriptKindSay === "function" && pick) {
    const say = scriptKindSay(pick);
    if (say && say.text && say.tip) tips.push({ label: say.text, tip: say.tip });
  }
  if (pick && (pick.role === "solid" || pick.role === "thin")) {
    tips.push({
      label: pick.role === "solid" ? "Steady role" : "Thin role",
      tip: pick.role === "solid" ? "His minutes and role look locked in." : "His minutes are thin, so the opportunity can vanish.",
    });
  }
  if (pick && pick.cushion) {
    const tip = typeof scriptCushionTip === "function" ? scriptCushionTip(pick) : "Cushion: he has room above the line, so a soft night can still cash.";
    const nums = typeof scriptCushionNums === "function" ? scriptCushionNums(pick) : null;
    const n1 = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
    };
    tips.push({
      label: "Cushion",
      tip,
      detail: nums
        ? `Projected ${n1(nums.avg)} · Line ${n1(nums.line)} · Cushion +${n1(nums.room)} (${Math.round(nums.pct * 100)}%)`
        : "",
    });
  }
  if (pick && pick.how) {
    const why = document.createElement("p");
    why.className = "desk-rec-why-how";
    why.innerHTML = `<em>Why:</em> ${typeof esc === "function" ? esc(pick.how) : String(pick.how)}`;
    box.append(why);
  }
  tips.forEach((row) => {
    const line = document.createElement("p");
    line.className = "desk-rec-why-tag";
    line.innerHTML = `<b>${typeof esc === "function" ? esc(row.label) : row.label}</b> ${typeof esc === "function" ? esc(row.tip) : row.tip}`;
    box.append(line);
    if (row.detail) {
      const detail = document.createElement("p");
      detail.className = "desk-rec-why-nums";
      detail.textContent = row.detail;
      box.append(detail);
    }
  });
  return box.childNodes.length ? box : null;
}

function startCard(board, pick, card) {
  const open = card.querySelector(":scope > .desk-rec-more");
  const info = card.querySelector(".desk-rec-info");
  if (open) {
    open.remove();
    if (info) { info.textContent = "More info"; info.setAttribute("aria-expanded", "false"); }
    return;
  }
  const hit = startHit(board, pick);
  if (!hit || typeof paintCard !== "function") { startSeek(board, pick); return; }
  const more = document.createElement("div"), mark = document.createElement("span");
  more.className = "desk-rec-more"; mark.hidden = true;
  const why = startRecWhy(pick);
  if (why) more.append(why);
  more.append(mark); card.append(more);
  if (info) { info.textContent = "Less info"; info.setAttribute("aria-expanded", "true"); }
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
  document.querySelectorAll(".find-start .desk-rec-ask, #desk-games .desk-rec-ask").forEach((node) => node.remove());
  if (open) return;
  if (!parlayLeg.size) { startBetGo(board, pick, "new"); return; }
  const ask = document.createElement("span");
  ask.className = "desk-rec-ask";
  ask.innerHTML = `<i>You have a bet open.</i><span role="button" tabindex="0" data-bet-go="add">Add to this bet</span><span role="button" tabindex="0" data-bet-go="new">Start a new bet</span>`;
  card.append(ask);
}

function startBet(board, pick) {
  const hit = startHit(board, pick);
  if (hit) { startUndo = { board, key: parlayKey(hit.bet), ids: new Set(saveList().map((row) => row.id)) }; return legSwapAdd(hit.person, hit.bet); }
  window.location.href = `/?${new URLSearchParams({ game: pick.match, label: pick.label, market: pick.market || "" })}`;
}

function startGameOpen(board, game) {
  if (!board || typeof board.querySelector !== "function") { if (typeof homeGamesOpen === "function") homeGamesOpen(game); return; }
  let bet = null;
  (board.people || []).some((person) => (person.bets || []).some((one) => {
    const same = one.match === game.match || (typeof whenSame === "function" && whenSame(one, game));
    if (same) bet = one;
    return same;
  }));
  if (bet) { startOpen(board, bet); return; }
  const kick = Date.parse(game.kickoff || game.when || "");
  if (game.final || (Number.isFinite(kick) && kick <= Date.now())) {
    startOpen(board, { match: game.match, kickoff: game.kickoff || game.when || "", sport: game.sport || "" });
    return;
  }
  homeGamesOpen(game);
}

function startRandomPool(board, picks) {
  const shown = (picks || []).filter((pick) => typeof recDialOk !== "function" || recDialOk(pick));
  const index = typeof legBoostFind === "function" ? legBoostFind(board.people) : new Map(), seen = new Set();
  return shown.map((pick) => index.get(`${pick.label}|${pick.market}|${pick.match}`) || [...index.values()].find((row) => row.bet.label === pick.label && row.bet.match === pick.match)).filter((hit) => hit && !seen.has(hit.person.key) && seen.add(hit.person.key));
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

function startRandomAdd(board, legs, stake, quiet) {
  if (!legs.length) return false;
  const had = parlayLeg.size > 0;
  if (had && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
  const prior = had ? window.parlayOpenId || "" : "", ids = new Set(saveList().map((row) => row.id));
  saveNew();
  if (typeof parlayStakeSet === "function") parlayStakeSet(stake);
  else window.parlayStake = Number(stake) > 0 ? Number(stake) : 5;
  legs.forEach(({ person, bet }) => { parlayLeg.set(parlayKey(bet), bet); if (!parlayPick.has(person.key)) parlayPick.set(person.key, person); });
  if (typeof trayRoster === "function") trayRoster();
  if (!quiet) {
    window.saveGone = false;
    window.saveShut = false;
    try { localStorage.setItem("savedShut", "0"); } catch (error) {}
  }
  saveNow();
  if (quiet) {
    window.parlayOpenId = "";
    parlayPick.clear();
    parlayLeg.clear();
    window.parlayStake = 5;
    saveHeld = "";
    if (typeof trayRoster === "function") trayRoster();
  }
  paintParlay();
  startUndo = { board, keys: [...parlayLeg.keys()], ids, prior };
  if (typeof whoBetsPaint === "function") whoBetsPaint();
  if (quiet) return true;
  startRandomClose();
  document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (fold) fold.click(); });
  const show = document.querySelector("#desk-glass-in .find-saved-chip.on") || document.querySelector("#desk-glass-in .find-saved") || document.querySelector("#desk-glass-in .find-tray");
  if (show) show.scrollIntoView({ block: "start", behavior: "smooth" });
  return true;
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
    if (next.length >= startRandomAt.n) startRandomFill(box, next);
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
  if (legs.length < n) return;
  startRandomShow(board, picks, n, legs);
}

function startRandomSync() {
  document.querySelectorAll("#desk-glass-in .find-start-random, #desk-games .find-start-random").forEach((old) => {
    if (!old._picks) return;
    const board = old.closest(".find-board") || document.querySelector("#desk-glass-in .find-board") || (typeof homePickBoardNow === "function" ? homePickBoardNow() : null);
    if (!board) return;
    old.replaceWith(startRandomBar(board, old._picks));
  });
}

function startRandomBar(board, picks) {
  const most = startRandomPool(board, picks).length, bar = document.createElement("span");
  bar.className = "find-start-random";
  bar._picks = picks;
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
  openTdPage(list, people || board.people || [], hits, null, null, typeof startNeedsWeek === "function" && startNeedsWeek() ? "week" : "today");
}
window.startTdGo = startTdGo;

function startTdButton(board, inline) {
  const games = leftGames();
  const league = typeof homeLeagueOn === "function" ? homeLeagueOn(games) : "";
  if (!inline && league && league !== "NFL") return null;
  const hasNfl = games.some((game) => String(game.sport || "") === "NFL") || ((homeRecs && homeRecs.picks) || []).some((pick) => (typeof homePickSport === "function" ? homePickSport(pick) : pick.sport) === "NFL");
  if ((!hasNfl && !(inline && startTab === "td")) || typeof openTdPage !== "function") return null;
  const go = Object.assign(document.createElement("button"), { type: "button", className: `find-start-td${inline && startTab === "td" ? " on" : ""}`, textContent: "Anytime TDs" });
  go.title = "See who is most likely to score a touchdown";
  go.setAttribute("aria-pressed", String(inline && startTab === "td"));
  go.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (inline) { startTab = "td"; startPaint(1); return; }
    const live = document.querySelector("#desk-glass-in .find-board") || board;
    if (!live || typeof startTdGo !== "function") return;
    if (!(live.people || []).some((person) => person.kind === "player" && (person.bets || []).length)) return;
    startTdGo(live);
  });
  return go;
}

function startTdInline(board) {
  const host = document.createElement("div");
  host.className = "find-start-td-page";
  const list = document.createElement("div");
  list.className = "find-list";
  const hits = document.createElement("div");
  hits.className = "find-hits";
  hits.hidden = true;
  host.append(list, hits);
  queueMicrotask(() => {
    if (!host.isConnected || typeof openTdPage !== "function") return;
    openTdPage(list, board.people || [], hits, null, null, typeof startNeedsWeek === "function" && startNeedsWeek() ? "week" : "today");
  });
  return host;
}

function startDialCommit() {
  // Dial already filtered the list with CSS while dragging — do not rebuild the board (that made the thumb choppy).
  startRandomSync();
  const games = typeof leftGames === "function" ? leftGames() : [];
  document.querySelectorAll(".start-filter-say > span").forEach((node) => { node.textContent = `${startFilterBits(games).join(". ")}.`; });
}

const START_REC_PAGE = 24;
const START_REC_CAP = 120;

function startRecPool(games, opts) {
  if (!homeRecs || (homeRecs.loading && !(homeRecs.picks || []).length)) return { status: "loading", picks: [], league: "" };
  if (!(homeRecs.picks || []).length) return { status: (homeRecs.want || "auto") !== "week" ? "tonight" : "empty", picks: [], league: "" };
  const league = opts && Object.prototype.hasOwnProperty.call(opts, "league")
    ? (opts.league || "")
    : (typeof homeLeagueOn === "function" ? homeLeagueOn(games) : "");
  const picks = [];
  const seen = new Set();
  const push = (pick) => {
    if (!pick) return;
    const key = `${pick.label}|${pick.market}|${pick.match}|${pick.odds}`;
    if (seen.has(key)) return;
    if (typeof startPickSpanOk === "function" && !startPickSpanOk(pick)) return;
    if (league && typeof homePickSport === "function" && homePickSport(pick) !== league) return;
    if (!startGameOk(pick.match)) return;
    if (!startKindOk(pick)) return;
    if (startFavOnly && !startFavGame(pick.match)) return;
    seen.add(key);
    picks.push(pick);
  };
  if (homeRecs.golden) push(homeRecs.golden);
  if (homeRecs.silver) push(homeRecs.silver);
  if (homeRecs.bronze) push(homeRecs.bronze);
  (homeRecs.picks || []).forEach(push);
  return { status: "ok", picks: picks.slice(0, START_REC_CAP), league, span: homeRecs.span || "today" };
}

function startRecCard(board, pick, index) {
  const card = homeRecRow(pick, index, { stay: true });
  card.startPick = pick;
  card.title = "Show the player";
  const actions = document.createElement("span");
  actions.className = "desk-rec-go";
  actions.append(
    Object.assign(document.createElement("span"), { className: "desk-rec-bet", textContent: "Bet it", title: "Bet it" }),
    typeof recMoreSlider === "function" ? recMoreSlider(board, pick) : Object.assign(document.createElement("span"), { className: "desk-rec-info", textContent: "More info", title: "More info" }),
    Object.assign(document.createElement("span"), { className: "desk-rec-team", textContent: "Team", title: "Team page" })
  );
  card.append(actions);
  card.addEventListener("click", (event) => {
    if (event.target.closest(".bet-kind, .desk-rec-golden-tag")) return;
    if (document.body.classList.contains("needs-member")) { const join = document.getElementById("gate-join"); if (join) join.click(); return; }
    const go = event.target.closest("[data-bet-go]");
    if (go) { card.querySelectorAll(".desk-rec-ask").forEach((node) => node.remove()); startBetGo(board, pick, go.dataset.betGo); return; }
    if (event.target.closest(".desk-rec-team")) { startTeam(board, pick); return; }
    if (event.target.closest(".desk-rec-bet")) { startBetAsk(board, pick, card); return; }
    if (event.target.closest(".desk-rec-ask, .desk-rec-more, .desk-rec-go, .desk-rec-tag-why, .desk-rec-slide")) return;
    if (typeof recMoreStep === "function") { recMoreStep(board, pick, card); return; }
    startCard(board, pick, card);
  });
  return card;
}

function startRecMoreSync(wrap, more, pool, shown) {
  if (!more) return;
  const left = (pool.picks || []).slice(shown);
  const moreMatch = left.some((pick) => typeof recDialOk !== "function" || recDialOk(pick));
  if (shown >= (pool.picks || []).length) {
    more.hidden = true;
    return;
  }
  if (!moreMatch) {
    if (typeof recDial === "number" && recDial < 3) {
      more.hidden = false;
      more.textContent = "Slide right for the next one.";
      more.dataset.scroll = "0";
      return;
    }
    more.hidden = true;
    return;
  }
  more.hidden = false;
  more.textContent = "Scroll for more picks.";
  more.dataset.scroll = "1";
}

function startRecFeed(board, box, root) {
  const games = leftGames();
  const pool = startRecPool(games);
  const when = typeof startWhenSay === "function" ? startWhenSay() : (startSpan === "week" ? "this week" : "tonight");
  const recs = [];
  if (pool.status === "loading") return { recs: [...recs, Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: "Looking up the picks." })], picks: [], all: [] };
  if (pool.status === "tonight") return { recs: [...recs, typeof homeWeekNote === "function" ? homeWeekNote(box, pool.league || "") : Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: "No picks tonight." })], picks: [], all: [] };
  if (pool.status === "empty" || !pool.picks.length) {
    const say = pool.league
      ? (typeof homeLeagueClearNote === "function" ? homeLeagueClearNote(box, `No ${pool.league} picks ${when}.`) : Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: `No ${pool.league} picks ${when}.` }))
      : Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: startKinds.size ? "No picks match these filters. Tap Clear for the rest." : startPickGames.size ? "No picks in the games you picked." : `No picks ${when}.` });
    return { recs: [...recs, say], picks: [], all: [] };
  }
  const wrap = document.createElement("div");
  wrap.className = "find-start-recs";
  if (typeof recDialEmptyNote === "function") wrap.append(recDialEmptyNote());
  let shown = 0;
  const more = document.createElement("p");
  more.className = "desk-games-note find-start-recs-more";
  more.hidden = true;
  more.textContent = "Scroll for more picks.";
  const paintChunk = () => {
    const chunk = pool.picks.slice(shown, shown + START_REC_PAGE);
    chunk.forEach((pick, i) => wrap.insertBefore(startRecCard(board, pick, shown + i), more));
    shown += chunk.length;
    startRecMoreSync(wrap, more, pool, shown);
    if (typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 2, { quiet: true });
    startRecMoreSync(wrap, more, pool, shown);
  };
  wrap.append(more);
  if (typeof recDialNext === "function") wrap.append(recDialNext());
  wrap._recMoreSync = () => startRecMoreSync(wrap, more, pool, shown);
  paintChunk();
  if (pool.picks.length > START_REC_PAGE) {
    const glass = root || document.getElementById("desk-glass-in");
    const watch = new IntersectionObserver((rows) => {
      if (!rows.some((row) => row.isIntersecting) || !wrap.isConnected) return;
      if (more.dataset.scroll !== "1") return;
      paintChunk();
      if (shown >= pool.picks.length) watch.disconnect();
    }, { root: glass || null, rootMargin: "240px 0px" });
    watch.observe(more);
  }
  recs.push(wrap);
  return { recs, picks: pool.picks, all: pool.picks };
}

function startGameOk(match) {
  if (!startPickGames.size) return true;
  return startPickGames.has(String(match || ""));
}

function startGameBar(games) {
  const league = typeof homeLeagueOn === "function" ? homeLeagueOn(games) : "";
  const rows = [];
  const seen = new Set();
  (games || []).forEach((game) => {
    if (!game || !game.match || seen.has(game.match)) return;
    if (league && game.sport !== league) return;
    seen.add(game.match);
    rows.push(game);
  });
  [...startPickGames].forEach((match) => { if (!seen.has(match)) startPickGames.delete(match); });
  if (!rows.length) return null;
  const bar = document.createElement("span");
  bar.className = "desk-games-leagues start-game-picks";
  const all = document.createElement("button");
  all.type = "button";
  all.className = `desk-games-league${startPickGames.size ? "" : " on"}`;
  all.textContent = "All";
  all.addEventListener("click", () => { if (!startPickGames.size) return; startPickGames.clear(); startShow(); });
  bar.append(all);
  rows.forEach((game) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `desk-games-league${startPickGames.has(game.match) ? " on" : ""}`;
    button.textContent = typeof gameShort === "function" ? gameShort(game.match) : game.match;
    button.addEventListener("click", () => {
      if (startPickGames.has(game.match)) startPickGames.delete(game.match);
      else startPickGames.add(game.match);
      if (startPickGames.size === rows.length) startPickGames.clear();
      startShow();
    });
    bar.append(button);
  });
  return bar;
}

function startFilterLead(league) {
  if (league && startSpan === "live") return `Live ${league}`;
  if (league && startSpan === "next") return `Upcoming ${league} today`;
  if (league && startSpan === "tomorrow") return `${league} tomorrow`;
  if (league && startSpan === "week") return `${league} this week`;
  if (league && startSpan === "done") return `${league} that finished today`;
  if (startSpan === "live") return "Live";
  if (startSpan === "next") return "Upcoming today";
  if (startSpan === "tomorrow") return "Tomorrow";
  if (startSpan === "week") return "This week";
  if (startSpan === "done") return "Finished today";
  return "Upcoming today";
}

function startFilterBits(games) {
  const league = typeof homeLeagueOn === "function" ? homeLeagueOn(games) : "";
  const bits = [];
  bits.push(startFilterLead(league));
  if (!league) bits.push("All leagues");
  if (startPickGames.size) {
    const names = [...startPickGames].map((match) => typeof gameShort === "function" ? gameShort(match) : match);
    bits.push(names.length <= 2 ? names.join(" and ") : `${names.length} games`);
  } else bits.push("All games");
  if ((startTab === "rec" || startTab === "parlays") && typeof window.recDialSay === "function") {
    const level = Number(window.recDial);
    if (level === 0 || level === 1 || level === 2 || level === 3) bits.push(window.recDialSay(level));
  }
  if (startTab === "rec") {
    if (startKinds.size) {
      const labels = START_KINDS.filter(([id]) => startKinds.has(id)).map(([, label]) => label);
      if (labels.length) bits.push(labels.join(" and "));
    } else bits.push("All tags");
  }
  if (startTab === "parlays" && typeof recParlaySize === "number" && recParlaySize) bits.push(`${recParlaySize}-leg parlays`);
  if (startTab === "parlays") bits.push(window.recParlayTeams ? "Team props too" : "Player props");
  return bits;
}

function startLineShut() {
  try { return JSON.parse(localStorage.getItem("lineNoteShut") || "[]"); } catch (error) { return []; }
}

function startLineGo(game) {
  const match = String((game && game.match) || "");
  if (!match) return;
  if (document.body.classList.contains("needs-member")) { const join = document.getElementById("gate-join"); if (join) join.click(); return; }
  const desk = document.getElementById("desk");
  if (window.saveNew && desk && !desk.classList.contains("tv-full")) saveNew();
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdMenu) birdMenu("find");
  let tries = 0;
  const wait = setInterval(() => {
    const same = (node) => {
      const name = String(node.textContent || "").split(",")[0];
      return name.startsWith(match) || (typeof findSameGame === "function" && findSameGame(name, match));
    };
    const hit = [...document.querySelectorAll(".find-board .find-games button")].find(same);
    if (!hit && ++tries < 60) return;
    clearInterval(wait);
    if (hit) { hit.click(); return; }
    const board = document.querySelector(".find-board");
    if (board && typeof seekPaintGame === "function") seekPaintGame(board, match, game.sport || "", game.kickoff || "", "");
  }, 150);
}

function startLineSay(games) {
  const text = document.createElement("p");
  const rows = (games || []).filter((game) => game && game.match && game.name).slice(0, 2);
  text.append("New lines on ");
  rows.forEach((game, index) => {
    if (index) text.append(" and ");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "start-line-go";
    go.textContent = game.name;
    go.title = "Open this game";
    go.addEventListener("click", () => startLineGo(game));
    text.append(go);
  });
  text.append(".");
  return text;
}

function startLineNote() {
  const note = document.createElement("div");
  note.className = "start-line-note";
  note.hidden = true;
  fetch("/api/lines", { cache: "no-store" }).then((res) => (res.ok ? res.json() : {})).then((data) => {
    const say = data && data.note;
    const games = data && data.games;
    if (!note.isConnected || !say || startLineShut().includes(say)) return;
    const text = games && games.length ? startLineSay(games) : Object.assign(document.createElement("p"), { textContent: say });
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", () => {
      try { localStorage.setItem("lineNoteShut", JSON.stringify([say, ...startLineShut()].filter((item, index, list) => list.indexOf(item) === index).slice(0, 20))); } catch (error) {}
      note.remove();
    });
    note.append(text, close);
    note.hidden = false;
  }).catch(() => {});
  return note;
}

function startFilterRefresh() {
  const games = typeof leftGames === "function" ? leftGames() : [];
  document.querySelectorAll(".start-filter-say").forEach((line) => {
    const text = line.querySelector("span");
    if (text) text.textContent = `${startFilterBits(games).join(". ")}.`;
    let clear = line.querySelector("button.desk-games-link");
    if (!startFilterChanged()) { if (clear) clear.remove(); return; }
    if (clear) return;
    clear = document.createElement("button");
    clear.type = "button";
    clear.className = "desk-games-link";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => startFiltersClear(line.closest(".find-board") || document.getElementById("desk-glass-in")));
    line.append(clear);
  });
}
window.startFilterRefresh = startFilterRefresh;

function startShow() {
  const home = document.getElementById("desk-games");
  if (home && !home.hidden && typeof homeGamesPaint === "function") { home.dataset.sig = ""; homeGamesPaint(); }
  if (document.querySelector(".find-start")) startPaint(1);
}
window.startShow = startShow;

function startFiltersClear(box) {
  startPickGames.clear();
  startKinds.clear();
  if (typeof recParlaySize === "number") recParlaySize = 0;
  window.recParlayTeams = false;
  const spanChanged = startSpan !== "next";
  startSpan = "next";
  try { localStorage.setItem("startSpan", "next"); } catch (error) {}
  if (spanChanged && typeof homeRecs !== "undefined") homeRecs = null;
  if (typeof homeLeague !== "undefined" && homeLeague) {
    homeLeague = "";
    if (typeof homeLeagueSave === "function") { homeLeagueSave(box); return; }
  }
  startShow();
}

function startFilterChanged() {
  const league = typeof homeLeague === "string" ? homeLeague : "";
  return !!(league || startPickGames.size || startKinds.size || startSpan !== "next" || (startTab === "parlays" && ((typeof recParlaySize === "number" && recParlaySize) || window.recParlayTeams)));
}

function startFilterSay(games, box) {
  const line = document.createElement("p");
  line.className = "start-filter-say";
  const text = document.createElement("span");
  text.textContent = `${startFilterBits(games).join(". ")}.`;
  line.append(text);
  if (startFilterChanged()) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "desk-games-link";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => startFiltersClear(box));
    line.append(clear);
  }
  return line;
}

function startFilterPack(box, leagues, gameBar, board, picks, tabNow) {
  const fold = document.createElement("details");
  fold.className = "start-filter-fold start-filter-pack";
  fold.open = !!startFoldOpen.filters;
  const summary = document.createElement("summary");
  summary.textContent = "Filters";
  fold.append(summary, startSpanBar());
  if (leagues && leagues[0]) fold.append(leagues[0]);
  if (gameBar) fold.append(gameBar);
  if (tabNow === "rec") {
    fold.append(startRandomBar(board, picks));
    if (picks && picks.length) fold.append(startKindBar(picks));
  }
  fold.addEventListener("toggle", () => {
    startFoldOpen.filters = fold.open;
    if (startFiltersMute) { startFiltersMute -= 1; return; }
    startFiltersAuto = false;
  });
  return fold;
}

function startFilterFold(name, row, say) {
  const fold = document.createElement("details");
  fold.className = "start-filter-fold";
  fold.open = !!startFoldOpen[name];
  const summary = document.createElement("summary");
  summary.textContent = say;
  fold.append(summary, row);
  fold.addEventListener("toggle", () => { startFoldOpen[name] = fold.open; });
  return fold;
}

function startRecs(board, box, root) {
  const history = board && board.dataset.page === "history";
  const tab = history ? startHistTab : startTab;
  if (tab !== "rec") {
    const pool = startRecPool(typeof leftGames === "function" ? leftGames() : []);
    return { recs: [], games: [], picks: pool.picks || [], all: pool.picks || [] };
  }
  const left = leftGames().filter((game) => startGameOk(game.match)), when = typeof startWhenSay === "function" ? startWhenSay() : "today";
  const { recs, picks, all } = startRecFeed(board, box, root);
  const games = homeGameRows(left, box).filter((node) => !startFavOnly || !node.startGame || startFavGame(node.startGame.match)).map((node) => {
    if (!node.classList.contains("desk-game") || node.classList.contains("desk-game-live")) return node;
    const copy = node.cloneNode(true), game = node.startGame;
    if (game) copy.addEventListener("click", () => startGameOpen(board, game));
    return copy;
  });
  if (startFavOnly && !games.some((node) => node.startGame)) games.push(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: `None of your teams play ${when}. Uncheck Only my teams for the rest.` }));
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

function startRecStats(opts) {
  const stay = !!(opts && opts.stay);
  const box = document.createElement("div");
  box.className = "find-start-stats";
  box.innerHTML = `<p class="find-start-stats-load quiet">Looking up hit rates.</p>`;
  const escHtml = (text) => (typeof esc === "function" ? esc(text) : String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const rateOf = (hit, of) => (of > 0 ? Math.round((100 * hit) / of) : null);
  // hit-hot / hit-ok / hit-cold — not "hot" alone; desk.css parks .hot as absolute desk spots.
  const toneOf = (pct) => (pct == null ? "hit-empty" : pct >= 55 ? "hit-hot" : pct >= 40 ? "hit-ok" : "hit-cold");
  const row = (name, hit, of, tip, say = "", open) => {
    const pct = rateOf(hit, of);
    const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    const count = `${hit} of ${of}${say}`;
    const tag = open ? "button" : "div";
    return `<${tag}${open ? ` type="button"` : ""} class="hit-rate ${toneOf(pct)}${open ? " hit-rate-open" : ""}" title="${escHtml(tip)}"${open ? ` aria-label="Open Golden Tickets"` : ""}><div class="hit-rate-top"><b>${escHtml(name)}</b><strong>${pct == null ? "—" : `${pct}%`}</strong></div><div class="hit-rate-bar" aria-hidden="true"><i style="width:${width}%"></i></div><span class="hit-rate-count">${escHtml(count)}</span></${tag}>`;
  };
  box.addEventListener("click", (event) => {
    if (stay || !event.target.closest(".hit-rate-open")) return;
    startHistTab = "golden";
    const here = document.querySelector("#desk-glass-in .find-board");
    if (here && here.dataset.page === "history") startPaint(1);
    else if (typeof birdMenu === "function") birdMenu("history");
  });
  const kinds = (bag) => {
    const boxOf = (key) => (bag && bag[key]) || { won: 0, lost: 0 };
    const safe = boxOf("safe"), even = boxOf("balanced");
    return `${row("Safe", safe.won, safe.won + safe.lost, "Recommended at -150 or shorter, all time.")}${row("Balanced", even.won, even.won + even.lost, "Recommended from -149 to +100, all time.")}`;
  };
  fetch("/api/live?all=1", { credentials: "same-origin" }).then((res) => res.json()).then((data) => {
    if (!box.isConnected) return;
    if (typeof liveRecs !== "undefined") liveRecs = data.recs || [];
    let won = 0, lost = 0, all = 0, pace = 0;
    (data.live || []).forEach((game) => {
      if (typeof liveMine !== "function" || typeof liveLegState !== "function") return;
      liveMine(game, liveRecs).forEach((pick) => {
        if (pick.tier === "good") return;
        const { state, level } = liveLegState(game, pick);
        all += 1;
        if (state === "hit") won += 1; else if (state === "lost") lost += 1;
        if (state === "hit" || level === "ahead" || level === "close") pace += 1;
      });
    });
    const tally = data.tally || {}, today = tally.today || { won: 0, lost: 0 }, ever = tally.all || { won: 0, lost: 0 };
    const golden = tally.golden || { won: 0, lost: 0, history: [] };
    const silver = tally.silver || { won: 0, lost: 0, history: [] };
    const bronze = tally.bronze || { won: 0, lost: 0, history: [] };
    startGolden = golden;
    startMetals = { golden, silver, bronze };
    const score = document.createElement("div");
    score.className = "find-start-stats-score";
    score.innerHTML = [
      `<i>How the picks are hitting</i>`,
      row("Live", pace, all, "Recommended bets in games on now that have hit or are on pace to hit", " on pace"),
      row("Today", today.won + won, today.won + today.lost + won + lost, "Recommended bets won today, out of the ones already decided"),
      row("All time", ever.won + won, ever.won + ever.lost + won + lost, "Every recommended bet that has finished"),
      row("Golden Ticket", golden.won, golden.won + golden.lost, "Saved Golden Tickets.", ` · ${startMoney(startGoldenCash(golden))}`, !stay),
      row("Silver Ticket", silver.won, silver.won + silver.lost, "Saved Silver Tickets.", ` · ${startMoney(startGoldenCash(silver))}`, !stay),
      row("Bronze Ticket", bronze.won, bronze.won + bronze.lost, "Saved Bronze Tickets.", ` · ${startMoney(startGoldenCash(bronze))}`, !stay),
      kinds((tally.kinds || {}).all || {}),
    ].join("");
    box.replaceChildren(score);
  }).catch(() => {
    if (box.isConnected) box.innerHTML = `<p class="quiet">Could not load hit rates.</p>`;
  });
  return [box];
}

function startFive(odds, result) {
  const o = Number(odds);
  if (!Number.isFinite(o) || !o) return null;
  const win = Math.round(5 * (o > 0 ? o / 100 : 100 / -o) * 100) / 100;
  if (result === "won") return win;
  if (result === "lost") return -5;
  if (result === "void") return 0;
  return null;
}

function startMoney(n) {
  const value = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(value)) return "";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function startGoldenCash(golden) {
  return ((golden && golden.history) || []).reduce((sum, ticket) => {
    const cash = startFive(ticket.odds, ticket.result);
    return cash == null ? sum : sum + cash;
  }, 0);
}

function startGoldenList() {
  const box = document.createElement("div");
  box.className = "find-start-stats golden-tab";
  const escHtml = (text) => (typeof esc === "function" ? esc(text) : String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const when = (ms) => {
    const at = new Date(ms);
    return Number.isNaN(at.getTime()) ? "" : at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  const price = (odds) => { const n = Number(odds); return Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : ""; };
  const word = { won: "Won", lost: "Lost", void: "Void" };
  const block = (name, bag) => {
    const rows = (bag && bag.history) || [];
    const won = Number(bag && bag.won) || rows.filter((ticket) => ticket.result === "won").length;
    const lost = Number(bag && bag.lost) || rows.filter((ticket) => ticket.result === "lost").length;
    const of = won + lost;
    const pct = of > 0 ? `${Math.round((100 * won) / of)}%` : "—";
    const cash = startGoldenCash(bag);
    const tone = cash > 0 ? "up" : cash < 0 ? "down" : "flat";
    const cards = rows.map((ticket) => {
      const result = ticket.result || "open";
      const hits = Number(ticket.hits), n = Number(ticket.n);
      const recordShown = n > 0 && Number.isFinite(hits) ? Math.round((100 * hits) / n) : null;
      const record = recordShown == null ? "" : `${recordShown}%`;
      const made = startFive(ticket.odds, result);
      const pay = made == null
        ? `$5 profits ${startMoney(startFive(ticket.odds, "won")).replace(/^\+/, "")}`
        : result === "won" ? `$5 won ${startMoney(made)}` : result === "lost" ? `$5 lost ${startMoney(made)}` : `$5 ${startMoney(made)}`;
      const need = typeof findPct === "function" ? findPct(ticket.odds) : "";
      const needN = parseFloat(need);
      const clear = recordShown != null && Number.isFinite(needN) ? Math.round((recordShown - needN) * 10) / 10 : null;
      const clearText = clear == null ? "" : `${clear > 0 ? "+" : ""}${clear.toFixed(1)}%`;
      const meta = [price(ticket.odds), need, ticket.match].filter(Boolean).join(" · ");
      return `<article class="golden-card"><div class="golden-card-top"><b>${escHtml(ticket.label || "")}</b><i class="${escHtml(result)}">${escHtml(word[result] || "Open")}</i></div><p class="golden-card-pay"><span class="golden-card-edge"><b>${escHtml(record)}</b>${clearText ? `<i class="${clear > 0 ? "up" : clear < 0 ? "down" : ""}">${escHtml(clearText)}</i>` : ""}</span><span class="${escHtml(result)}">${escHtml(pay)}</span></p>${meta ? `<p class="golden-card-meta">${escHtml(meta)}</p>` : ""}${ticket.markedAt ? `<p class="golden-card-when">Marked ${escHtml(when(ticket.markedAt))}</p>` : ""}${ticket.how ? `<p class="golden-card-how">${escHtml(ticket.how)}</p>` : ""}</article>`;
    }).join("");
    return `<h3 class="golden-place">${escHtml(name)}</h3><div class="golden-sum"><div><b>${escHtml(pct)}</b><span>${of ? `${won} of ${of}` : "0 settled"}</span></div><div><strong class="${tone}">${escHtml(startMoney(cash))}</strong><span>$5 on each settled ticket</span></div></div>${cards || `<p class="quiet">No ${escHtml(name)} has been marked yet.</p>`}`;
  };
  const paint = (metals) => {
    const bag = metals || {};
    const list = document.createElement("div");
    list.className = "golden-list";
    list.innerHTML = [
      block("Golden Ticket", bag.golden || startGolden),
      block("Silver Ticket", bag.silver),
      block("Bronze Ticket", bag.bronze),
    ].join("");
    box.replaceChildren(list);
  };
  if (startMetals || startGolden) paint(startMetals || { golden: startGolden });
  else box.innerHTML = `<p class="find-start-stats-load quiet">Looking up Golden Tickets.</p>`;
  if (!startMetals) {
    fetch("/api/live?all=1", { credentials: "same-origin" }).then((res) => res.json()).then((data) => {
      const tally = (data && data.tally) || {};
      startGolden = tally.golden || { won: 0, lost: 0, history: [] };
      startMetals = { golden: startGolden, silver: tally.silver || { won: 0, lost: 0, history: [] }, bronze: tally.bronze || { won: 0, lost: 0, history: [] } };
      if (box.isConnected) paint(startMetals);
    }).catch(() => {
      if (box.isConnected) box.innerHTML = `<p class="quiet">Could not load Golden Tickets.</p>`;
    });
  }
  return [box];
}

function startPaint(again) {
  const inlineTd = document.querySelector("#desk-glass-in .find-start .find-list.find-td-board");
  if (startTdOpen() && !inlineTd) return;
  if (startTab !== "td") {
    document.querySelectorAll("#desk-glass-in .find-board.find-td-on").forEach((node) => {
      if (!node.querySelector(":scope > .find-list.find-td-board")) node.classList.remove("find-td-on");
    });
  }
  if (typeof startHomeStrip === "function") startHomeStrip();
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  const spot = startSpot(), board = spot && spot.closest(".find-board");
  if (!spot || !board || typeof homeRecRows !== "function") return;
  const input = board.querySelector("label.find input");
  const history = board.dataset.page === "history";
  const panel = board.dataset.page === "rec" || history;
  if (typeof startNeedsWeek === "function" && startNeedsWeek()) startWeekLoad();
  homeRecsLoad(typeof startNeedsWeek === "function" && startNeedsWeek() ? "week" : "auto"); homeLogosLoad(); homeLeagueSync();
  const box = document.createElement("div");
  box.className = `find-start${panel ? " find-start-panel" : " find-start-quick"}`;
  if (!panel) {
    const quick = typeof quickAddBox === "function" ? quickAddBox(board) : null;
    if (quick) box.append(quick);
    box.hidden = Boolean(input && input.value.trim());
    spot.after(box);
    if (typeof betShotMount === "function") betShotMount();
    if (typeof quickAddPendingOpen === "function") quickAddPendingOpen();
    return;
  }
  if (startTab === "shared" || startTab === "games" || startTab === "stats" || startTab === "golden" || startTab === "stacks") startTab = "rec";
  if (history && startHistTab !== "stats" && startHistTab !== "golden") startHistTab = "stats";
  const tabNow = history ? startHistTab : startTab;
  const tabs = document.createElement("span");
  tabs.className = "desk-games-tabs";
  const { recs, games, picks, all } = startRecs(board, box);
  const goldenN = startMetals ? ["golden", "silver", "bronze"].reduce((sum, key) => sum + (((startMetals[key] || {}).history || []).length), 0) : (startGolden && Array.isArray(startGolden.history) ? startGolden.history.length : null);
  const tabList = history
    ? [["stats", "Hit Rates", null], ["golden", "Golden", goldenN]]
    : [
      ["rec", "Players", typeof recDialCountOf === "function" ? recDialCountOf(picks).all : picks.length],
      ["parlays", "Parlays", typeof recParlayCount === "function" ? recParlayCount(board) : null],
    ];
  tabList.forEach(([id, label, count]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `desk-games-tab${tabNow === id ? " on" : ""}`;
    tab.setAttribute("aria-pressed", String(tabNow === id));
    if (count == null) tab.textContent = label;
    else {
      tab.innerHTML = `${label} <i class="desk-tab-n">${count}</i>`;
      tab.setAttribute("aria-label", `${label} ${count}`);
    }
    tab.addEventListener("click", () => {
      if (history) startHistTab = id;
      else { startTab = id; if (id === "rec" && typeof homeGamesTab !== "undefined") homeGamesTab = id; }
      startPaint(1);
    });
    tabs.append(tab);
  });
  const td = history ? null : startTdButton(board, true);
  if (td) {
    td.classList.remove("find-start-td");
    td.classList.add("desk-games-tab");
    tabs.append(td);
  }
  box.dataset.stacks = startStackKey();
  const row = document.createElement("div");
  row.className = "find-start-row";
  const gamesNow = typeof leftGames === "function" ? leftGames() : [];
  const leagues = typeof homeLeagues === "function" ? homeLeagues(box, gamesNow) : [];
  const gameBar = startGameBar(gamesNow);
  row.append(tabs);
  if (!history && tabNow !== "td") {
    row.append(startFilterSay(gamesNow, box), startFilterPack(box, leagues, gameBar, board, picks, tabNow));
  }
  const lineNote = !history && (tabNow === "rec" || tabNow === "parlays") ? startLineNote() : null;
  const dial = (tabNow === "rec" || tabNow === "parlays") && typeof recDialBar === "function" ? recDialBar(startDialCommit) : null;
  const body = tabNow === "rec"
    ? [...(lineNote ? [lineNote] : []), ...(dial ? [dial] : []), ...recs]
      : tabNow === "parlays"
      ? [...(lineNote ? [lineNote] : []), ...(dial ? [dial] : []), ...(typeof recParlayBody === "function" ? recParlayBody(board) : [])]
      : tabNow === "stats"
        ? startRecStats()
        : tabNow === "td"
          ? [startTdInline(board)]
          : startGoldenList();
  box.append(row, ...body);
  spot.after(box);
  if (tabNow === "rec" && typeof recDialCountPaint === "function") {
    const counts = typeof recDialCountOf === "function" ? recDialCountOf(all) : { golden: 0, all: all.length };
    recDialCountPaint(counts);
  }
  if (tabNow === "parlays" && typeof recDialCountPaint === "function" && typeof recParlayBuild === "function" && typeof recParlayDialCounts === "function") {
    recDialCountPaint(recParlayDialCounts(recParlayBuild(board).rows));
  }
  if (typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 2, { quiet: true });
  const waiting = (typeof startNeedsWeek === "function" && startNeedsWeek() && startWeekLoading) || !homeRecs || homeRecs.loading;
  const shown = box.querySelector("button.desk-rec, .rec-parlay-card, .rec-strategy, .find-start-td-page");
  if (waiting && shown && typeof startWeekLoad === "function" && typeof startNeedsWeek === "function" && startNeedsWeek() && startWeekLoading) startWeekLoad(() => { if (box.isConnected) startPaint((again || 0) + 1); });
  else if (waiting && !shown && (again || 0) < 20) setTimeout(() => { if (box.isConnected) startPaint((again || 0) + 1); }, 600);
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
    if (window.saveStacksOpen) {
      window.saveStacksOpen = false;
      if (typeof showTab === "function") showTab("profile");
      if (typeof showAdminTab === "function") showAdminTab("strategies");
      if (typeof paintAdminStrategies === "function") paintAdminStrategies();
      const host = document.getElementById("admin-strategies");
      if (host) setTimeout(() => host.scrollIntoView({ block: "start" }), 60);
    }
    paintParlayStart.apply(this, arguments); startPlace();
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
function startFiltersTuck(box) {
  box = box || document.getElementById("desk-glass-in");
  if (!box || box.dataset.filterTuck) return;
  box.dataset.filterTuck = "1";
  let touchY = 0;
  const pack = () => box.querySelector(".start-filter-pack");
  const shut = () => { const fold = pack(); if (!fold || !fold.open) return; startFiltersAuto = true; startFoldOpen.filters = false; startFiltersMute += 1; fold.open = false; };
  const open = () => { const fold = pack(); if (!fold || !startFiltersAuto || fold.open) return; startFiltersMute += 1; startFiltersAuto = false; startFoldOpen.filters = true; fold.open = true; };
  box.addEventListener("scroll", () => { if (box.scrollTop > 8) shut(); }, { passive: true });
  box.addEventListener("wheel", (event) => { if (event.deltaY < 0 && box.scrollTop <= 0) open(); }, { passive: true });
  box.addEventListener("touchstart", (event) => { touchY = event.touches[0].clientY; }, { passive: true });
  box.addEventListener("touchmove", (event) => { if (event.touches[0].clientY > touchY + 12 && box.scrollTop <= 0) open(); }, { passive: true });
}
startFiltersTuck();
