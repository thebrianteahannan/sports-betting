/** A spend amount on Recommended becomes one My Bets ticket per pick, on the Slate bets tab. */

const SLATE_CAP = 8;

function slateNeed(odds) {
  const n = Number(odds);
  if (!n) return 0;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function slateChance(pick) {
  const hits = Number(pick && pick.hits), n = Number(pick && pick.n);
  if (!(n >= 5) || !Number.isFinite(hits)) return 0;
  const pull = typeof edgePull === "function" ? edgePull(hits, n) : null;
  const moved = pull && typeof matchupUse === "function" ? matchupUse(pull.pulled, pick.matchupShift) : null;
  return moved ? moved.used : pull ? pull.pulled : hits / n;
}

function slateWeight(p, odds) {
  const n = Number(odds);
  const b = n > 0 ? n / 100 : 100 / Math.abs(n);
  if (!(b > 0) || !(p > 0) || p >= 1) return 0;
  const ev = b * p - (1 - p);
  return ev > 0 ? ev / b : 0;
}

function slateWho(pick) {
  return String((pick && pick.who) || String((pick && pick.label) || "").split(/\s+(?:\d|Over\b|Under\b)/)[0] || "").trim().toLowerCase();
}

function slateMetal(pick) {
  if (pick && pick.golden) return 0;
  if (pick && pick.silver) return 1;
  if (pick && pick.bronze) return 2;
  return 3;
}

function slateDollars(n) {
  const v = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(v)) return "0";
  return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2);
}

function slatePct(n) {
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function slatePrice(odds) {
  const n = Number(odds);
  return n > 0 ? `+${n}` : String(n);
}

function slateKept() {
  return (typeof saveList === "function" ? saveList() : []).filter((row) => !(row && row.slate && !row.locked));
}

function slateRoom() {
  return Math.max(0, 20 - slateKept().length);
}

function slateTaken(pick) {
  const label = String(pick.label || ""), match = String(pick.match || ""), market = String(pick.market || "");
  return slateKept().some((row) => (row.legs || []).some((leg) => leg.label === label && String(leg.match || "") === match && String(leg.market || "") === market));
}

function slatePool() {
  const games = typeof leftGames === "function" ? leftGames() : [];
  const bag = typeof startRecPool === "function" ? startRecPool(games) : { status: "empty", picks: [] };
  const picks = (bag.picks || []).filter((pick) => pick && pick.tier !== "good" && (typeof recDialOk !== "function" || recDialOk(pick)));
  return { status: bag.status || "ok", picks };
}

function slateFit(rows, spend) {
  const dollars = Math.round(spend);
  const list = rows.map((row) => ({ ...row, w: slateWeight(row.p, row.odds) })).filter((row) => row.w > 0);
  if (!list.length || !(dollars >= 1)) return [];
  const sum = list.reduce((total, row) => total + row.w, 0);
  list.forEach((row) => { row.stake = Math.floor(dollars * row.w / sum); });
  let left = dollars - list.reduce((total, row) => total + row.stake, 0);
  list.sort((a, b) => b.w - a.w);
  let at = 0;
  while (left > 0) {
    list[at % list.length].stake += 1;
    left -= 1;
    at += 1;
  }
  return list.filter((row) => row.stake >= 1).sort((a, b) => (b.parlay === true) - (a.parlay === true) || a.metal - b.metal || b.ret - a.ret);
}

function slateParlays(board) {
  if (!board || typeof recParlayBuild !== "function") return [];
  let built = null;
  try { built = recParlayBuild(board); } catch (error) { return []; }
  const rows = [];
  ((built && built.rows) || []).forEach((row) => {
    const picks = (row.legs || []).map((leg) => leg && leg.pick).filter(Boolean);
    if (!row.score || !(row.ours > row.need) || picks.length < 2) return;
    if (typeof recDialOk === "function" && picks.some((pick) => !recDialOk(pick))) return;
    if (picks.some((pick) => slateTaken(pick) || !slateWho(pick))) return;
    const named = typeof recParlayName === "function" ? recParlayName(row.place) : "";
    rows.push({
      picks,
      p: row.ours,
      need: row.need,
      odds: Number(row.price),
      ret: row.ours / row.need - 1,
      gap: Number(row.gap) || 0,
      metal: row.place === "golden" ? 0 : row.place === "silver" ? 1 : row.place === "bronze" ? 2 : 3,
      parlay: true,
      title: named || `${picks.length}-leg parlay`,
    });
  });
  rows.sort((a, b) => b.gap - a.gap || a.picks.length - b.picks.length);
  const seen = new Set();
  const chosen = [];
  rows.forEach((row) => {
    if (chosen.length >= 3) return;
    const whos = row.picks.map(slateWho);
    if (whos.some((who) => seen.has(who))) return;
    whos.forEach((who) => seen.add(who));
    chosen.push(row);
  });
  return chosen;
}

function slateChoose(spend, board) {
  const pool = slatePool();
  if (pool.status === "loading") return { status: "loading", rows: [], spend };
  const amount = Math.round(Number(spend) * 100) / 100;
  if (!(amount >= 1) || amount > 100000) return { status: "amount", rows: [], spend: amount };
  const ranked = [];
  pool.picks.forEach((pick) => {
    if (!slateWho(pick) || slateTaken(pick)) return;
    const p = slateChance(pick);
    const need = slateNeed(pick.odds);
    if (!(p > need) || !(need > 0)) return;
    ranked.push({ pick, picks: [pick], p, need, odds: Number(pick.odds), ret: p / need - 1, metal: slateMetal(pick), parlay: false });
  });
  ranked.sort((a, b) => a.metal - b.metal || b.ret - a.ret);
  const seen = new Set();
  const singles = [];
  ranked.forEach((row) => {
    const who = slateWho(row.pick);
    const key = `${row.pick.label}|${row.pick.market}|${row.pick.match}`;
    if (seen.has(who) || seen.has(key)) return;
    seen.add(who);
    seen.add(key);
    singles.push(row);
  });
  const parlays = slateParlays(board);
  const used = new Set(parlays.flatMap((row) => row.picks.map(slateWho)));
  const tickets = [...parlays, ...singles.filter((row) => !used.has(slateWho(row.pick)))].slice(0, SLATE_CAP);
  const room = slateRoom();
  const fitted = slateFit(tickets, amount).slice(0, room);
  const status = fitted.length ? "ready" : !room ? "full" : (singles.length || parlays.length) ? "small" : "none";
  return { status, rows: fitted, spend: amount, room };
}

function slateHit(board, pick) {
  const hit = typeof startHit === "function" ? startHit(board, pick) : null;
  if (hit && hit.bet) return hit;
  if (typeof recParlayHit === "function") return recParlayHit(board, pick);
  return null;
}

function slateClear() {
  window.parlayOpenId = "";
  window.parlayStake = 5;
  window.parlayStakeTyped = false;
  if (typeof saveHeld !== "undefined") saveHeld = "";
  if (typeof parlayPick !== "undefined") parlayPick.clear();
  if (typeof parlayLeg !== "undefined") parlayLeg.clear();
  if (typeof trayRoster === "function") trayRoster();
}

let slateSeq = 0;

function slateWrite(board, plan) {
  if (typeof saveLeave === "function") saveLeave();
  saveStore(slateKept());
  const saved = [];
  plan.rows.forEach((row) => {
    const picks = row.picks && row.picks.length ? row.picks : [row.pick];
    const hits = picks.map((pick) => slateHit(board, pick)).filter((hit) => hit && hit.bet);
    if (hits.length !== picks.length || typeof parlayKey !== "function" || typeof saveNew !== "function") return;
    saveNew();
    window.parlayOpenId = `s${Date.now().toString(36)}${slateSeq++}`;
    if (typeof parlayStakeSet === "function") parlayStakeSet(row.stake, true);
    else { window.parlayStake = row.stake; window.parlayStakeTyped = true; }
    hits.forEach((hit) => {
      parlayLeg.set(parlayKey(hit.bet), hit.bet);
      if (hit.person && hit.person.key && !parlayPick.has(hit.person.key)) parlayPick.set(hit.person.key, hit.person);
    });
    if (parlayLeg.size !== picks.length) { slateClear(); return; }
    const entry = saveNow();
    if (entry && typeof savePatch === "function") savePatch(entry.id, { slate: true, stake: row.stake, stakeTyped: true });
    if (entry) saved.push(entry.id);
  });
  slateClear();
  if (typeof paintParlay === "function") paintParlay();
  if (typeof whoBetsPaint === "function") whoBetsPaint();
  return saved.length;
}

function slateLine(row) {
  const line = document.createElement("p");
  line.className = "slate-leg";
  const name = (pick) => (typeof homeRecTitle === "function" ? homeRecTitle(pick) : (pick.label || ""));
  const picks = row.picks && row.picks.length ? row.picks : [row.pick];
  const title = row.parlay ? `${row.title || `${picks.length}-leg parlay`} · ${picks.map(name).join(" · ")}` : name(picks[0]);
  const win = typeof findCash === "function" ? findCash(row.odds, row.stake) : "";
  const card = row.parlay ? "Together" : "Card";
  line.innerHTML = `<b>${typeof esc === "function" ? esc(title) : title}</b><i class="px">${esc(slatePrice(row.odds))}</i><i class="pct">${card} ${esc(slatePct(row.p))}</i><i class="pct">Needs ${esc(slatePct(row.need))}</i><i class="pay">Bet $${esc(slateDollars(row.stake))}${win ? `, wins ${esc(win)}` : ""}</i>`;
  return line;
}

function slatePaint(box, board) {
  const input = box.querySelector(".slate-spend");
  const note = box.querySelector(".slate-note");
  const list = box.querySelector(".slate-legs");
  const go = box.querySelector(".slate-add");
  const plan = slateChoose(input.value, board);
  box.plan = plan;
  list.replaceChildren();
  go.disabled = plan.status !== "ready";
  if (plan.status === "loading") { note.textContent = "Recommended bets are still loading."; return; }
  if (plan.status === "amount") { note.textContent = "Enter a spend from $1 up."; return; }
  if (plan.status === "full") { note.textContent = "My Bets is full. Delete a bet to add a slate."; return; }
  if (plan.status === "small") { note.textContent = "These bets clear their prices. That spend is too small for a $1 stake. Raise it."; return; }
  if (plan.status === "none") { note.textContent = "None of these recommended bets have a card above the price."; return; }
  const used = plan.rows.reduce((total, row) => total + row.stake, 0);
  const parlays = plan.rows.filter((row) => row.parlay).length;
  const singles = plan.rows.length - parlays;
  const bit = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const mix = parlays && singles ? `${bit(parlays, "parlay", "parlays")} and ${bit(singles, "single", "singles")}` : parlays ? bit(parlays, "parlay", "parlays") : bit(singles, "single", "singles");
  note.textContent = `$${slateDollars(used)} across ${mix}. A wider gap between the card and the price gets a bigger stake.`;
  plan.rows.forEach((row) => list.append(slateLine(row)));
  if (plan.room < SLATE_CAP && plan.rows.length === plan.room) note.textContent += ` My Bets has room for ${plan.room}.`;
}

function slateClose() {
  const box = document.getElementById("slate-bet");
  if (box) box.remove();
}

function slateOpen(board) {
  if (document.body.classList.contains("needs-member")) {
    const join = document.getElementById("gate-join");
    if (join) join.click();
    return;
  }
  slateClose();
  const spend = typeof manageBankRoll === "function" ? manageBankRoll("today") : (typeof bankRoll === "function" ? bankRoll() : 100);
  const box = document.createElement("div");
  box.id = "slate-bet";
  box.innerHTML = `<div class="slate-card" role="dialog" aria-modal="true" aria-labelledby="slate-title"><button type="button" class="slate-x" aria-label="Close">&times;</button><p id="slate-title" class="slate-head">Build a slate</p><label class="slate-ask">How much do you want to spend? <input class="slate-spend" type="number" min="1" max="100000" step="1" value="${esc(slateDollars(spend > 0 ? spend : 100))}"></label><p class="slate-note"></p><div class="slate-legs"></div><p><button type="button" class="slate-add">Add to My Bets</button></p></div>`;
  box.addEventListener("click", (event) => { if (event.target === box) slateClose(); });
  box.querySelector(".slate-x").addEventListener("click", slateClose);
  box.querySelector(".slate-spend").addEventListener("input", () => slatePaint(box, board));
  box.querySelector(".slate-add").addEventListener("click", () => {
    const plan = box.plan;
    if (!plan || plan.status !== "ready") return;
    const n = slateWrite(board, plan);
    if (!n) return;
    manageWhen = "slate";
    slateClose();
    window.saveGone = false;
    window.saveShut = false;
    try { localStorage.setItem("savedShut", "0"); } catch (error) {}
    if (typeof birdMenu === "function") birdMenu("manage");
  });
  document.body.append(box);
  slatePaint(box, board);
  box.querySelector(".slate-spend").focus();
  box.querySelector(".slate-spend").select();
}

function slateMount() {
  const board = document.querySelector("#desk-glass-in .find-board");
  if (!board || board.dataset.page !== "rec") return;
  const row = board.querySelector(".find-start-row");
  if (!row || row.querySelector(".slate-go")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "slate-go";
  button.textContent = "Build a slate";
  button.addEventListener("click", () => slateOpen(board));
  row.append(button);
}

if (typeof manageWhenOk === "function") {
  const manageWhenOkBase = manageWhenOk;
  manageWhenOk = function (row) {
    const slate = !!(row && row.slate);
    if (typeof manageWhen !== "undefined" && manageWhen === "slate") return slate;
    if (slate && manageWhen !== "all") return false;
    return manageWhenOkBase(row);
  };
}

if (typeof manageFilters === "function") {
  const manageFiltersBase = manageFilters;
  manageFilters = function (box) {
    manageFiltersBase(box);
    const when = box.querySelector(".manage-when");
    if (!when || when.querySelector("[data-slate]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.slate = "1";
    button.className = `manage-filter${typeof manageWhen !== "undefined" && manageWhen === "slate" ? " on" : ""}`;
    button.textContent = "Slate bets";
    button.addEventListener("click", () => {
      manageWhen = "slate";
      if (typeof manageRefresh === "function") manageRefresh();
    });
    when.append(button);
  };
}

if (typeof startPaint === "function") {
  const startPaintBase = startPaint;
  startPaint = function () {
    const out = startPaintBase.apply(this, arguments);
    slateMount();
    return out;
  };
}
