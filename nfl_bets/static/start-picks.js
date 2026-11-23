/** Build a bet keeps Quick add. Recommended / Games / Strategies live on the Recommended page. */

let startTab = "rec", startBack = null, startUndo = null, startRandomAt = null, startGolden = null, startMetals = null;
let startFavOnly = localStorage.getItem("startFavOnly") === "1";
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
  if (pick && pick.golden) tips.push({ label: "Golden Ticket", tip: "Golden Ticket: even money at the book, and it has hit 60% or more." });
  if (pick && pick.silver) tips.push({ label: "Silver Ticket", tip: "Silver Ticket: the next even-money pick that has hit 60% or more." });
  if (pick && pick.bronze) tips.push({ label: "Bronze Ticket", tip: "Bronze Ticket: the third even-money pick that has hit 60% or more." });
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

function startRandomAdd(board, legs, stake) {
  if (!legs.length) return;
  const had = parlayLeg.size > 0;
  if (had && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
  const prior = had ? window.parlayOpenId || "" : "", ids = new Set(saveList().map((row) => row.id));
  saveNew();
  if (typeof parlayStakeSet === "function") parlayStakeSet(stake);
  else window.parlayStake = Number(stake) > 0 ? Number(stake) : 5;
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

function startDialCommit() {
  // Dial already filtered the list with CSS while dragging — do not rebuild the board (that made the thumb choppy).
  startRandomSync();
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
  const info = Object.assign(document.createElement("span"), { className: "desk-rec-info", textContent: "More info", title: "More info" });
  info.setAttribute("role", "button");
  info.setAttribute("aria-expanded", "false");
  actions.append(
    Object.assign(document.createElement("span"), { className: "desk-rec-bet", textContent: "Bet it", title: "Bet it" }),
    info,
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
    if (event.target.closest(".desk-rec-info")) { startCard(board, pick, card); return; }
    if (event.target.closest(".desk-rec-ask, .desk-rec-more, .desk-rec-go, .desk-rec-tag-why")) return;
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
  if (typeof recDial === "number" && recDial < 3 && !moreMatch) {
    more.hidden = false;
    more.textContent = "Slide toward All for more picks.";
    more.dataset.scroll = "0";
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
      : Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: startKinds.size ? "No picks match these filters. Tap Clear for the rest." : startFavOnly ? "None of your teams have a pick. Uncheck Only my teams for the rest." : `No picks ${when}.` });
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

function startRecs(board, box, root) {
  const left = leftGames(), when = typeof startWhenSay === "function" ? startWhenSay() : "today";
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

function startRecStats() {
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
    if (!event.target.closest(".hit-rate-open")) return;
    startTab = "golden";
    startPaint(1);
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
      row("Golden Ticket", golden.won, golden.won + golden.lost, "Open the saved Golden Tickets.", ` · ${startMoney(startGoldenCash(golden))}`, true),
      row("Silver Ticket", silver.won, silver.won + silver.lost, "Open the saved Silver Tickets.", ` · ${startMoney(startGoldenCash(silver))}`, true),
      row("Bronze Ticket", bronze.won, bronze.won + bronze.lost, "Open the saved Bronze Tickets.", ` · ${startMoney(startGoldenCash(bronze))}`, true),
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
  if (startTdOpen()) return;
  if (typeof startHomeStrip === "function") startHomeStrip();
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  const spot = startSpot(), board = spot && spot.closest(".find-board");
  if (!spot || !board || typeof homeRecRows !== "function") return;
  const input = board.querySelector("label.find input");
  const panel = board.dataset.page === "rec";
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
  if (startTab === "shared") startTab = "rec";
  const tabs = document.createElement("span");
  tabs.className = "desk-games-tabs";
  const { recs, games, picks, all } = startRecs(board, box);
  const gameN = games.filter((node) => node.classList.contains("desk-game")).length;
  [
    ["rec", "Players", picks.length],
    ["games", "Games", gameN],
    ["stacks", "Strategies", null],
    ["stats", "Hit Rates", null],
    ["golden", "Golden", startMetals ? ["golden", "silver", "bronze"].reduce((sum, key) => sum + (((startMetals[key] || {}).history || []).length), 0) : (startGolden && Array.isArray(startGolden.history) ? startGolden.history.length : null)],
  ].forEach(([id, label, count]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `desk-games-tab${startTab === id ? " on" : ""}`;
    tab.setAttribute("aria-pressed", String(startTab === id));
    if (count == null) tab.textContent = label;
    else {
      tab.innerHTML = `${label} <i class="desk-tab-n">${count}</i>`;
      tab.setAttribute("aria-label", `${label} ${count}`);
    }
    tab.addEventListener("click", () => { startTab = id; if ((id === "rec" || id === "games") && typeof homeGamesTab !== "undefined") homeGamesTab = id; startPaint(1); });
    tabs.append(tab);
  });
  const td = startTdButton(board);
  if (td) {
    td.classList.remove("find-start-td");
    td.classList.add("desk-games-tab");
    tabs.append(td);
  }
  box.dataset.stacks = startStackKey();
  const row = document.createElement("div");
  row.className = "find-start-row";
  const leagues = typeof homeLeagues === "function" ? homeLeagues(box, leftGames()) : [];
  row.append(tabs);
  if (startTab !== "stats" && startTab !== "golden") {
    row.append(startSpanBar(), ...leagues);
    if (startTab === "rec") row.append(startRandomBar(board, picks));
    if ((window.memberTeams || []).length || startFavOnly) row.append(startFavBox());
  }
  const dial = startTab === "rec" && typeof recDialBar === "function" ? recDialBar(startDialCommit) : null;
  const body = startTab === "rec"
    ? [...(dial ? [dial] : []), ...(all.length ? [startKindBar(all)] : []), ...recs]
    : startTab === "stacks"
      ? startStacks()
      : startTab === "stats"
        ? startRecStats()
        : startTab === "golden"
          ? startGoldenList()
          : games;
  box.append(row, ...body);
  spot.after(box);
  if (startTab === "rec" && typeof recDialCountPaint === "function") {
    const counts = typeof recDialCountOf === "function" ? recDialCountOf(all) : { golden: 0, all: all.length };
    recDialCountPaint(counts);
  }
  if (typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 2, { quiet: true });
  const waiting = (typeof startNeedsWeek === "function" && startNeedsWeek() && startWeekLoading) || !homeRecs || homeRecs.loading;
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
    if (window.saveStacksOpen) {
      window.saveStacksOpen = false;
      startTab = "stacks";
      document.querySelectorAll(".find-start").forEach((node) => node.remove());
      if (typeof paintRec === "function" && !document.querySelector('#desk-glass-in .find-board[data-page="rec"]')) {
        paintRec();
        return;
      }
    }
    paintParlayStart.apply(this, arguments); startPlace();
    const box = document.querySelector("#desk-glass-in .find-start-panel");
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
