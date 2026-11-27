// "+ Add a leg" under the parlay opens Quick add in the tray.
// The same add, plus Delete, sits on an editing parlay card.

function manageLegDrop(said, key) {
  if (!said || !key || typeof parlayLeg === "undefined") return;
  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "manage-change manage-leg-drop";
  drop.textContent = "Delete";
  drop.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!parlayLeg.has(key)) return;
    if (parlayLeg.size <= 1) {
      const id = window.parlayOpenId;
      if (id && typeof saveDrop === "function") saveDrop(id);
      return;
    }
    const bet = parlayLeg.get(key);
    parlayLeg.delete(key);
    if (typeof legOwner !== "undefined") legOwner.delete(key);
    if (typeof legSwapOpen !== "undefined") legSwapOpen.delete(key);
    if (typeof legSwapDrill !== "undefined") legSwapDrill.delete(key);
    [...parlayPick.entries()].forEach(([pick, who]) => {
      const owned = String((bet && bet.label) || "").startsWith(who.name);
      const left = [...parlayLeg.values()].some((row) => typeof legOwns === "function" ? legOwns(who, row) : String(row.label || "").startsWith(who.name));
      if (owned && !left) parlayPick.delete(pick);
    });
    if (typeof saveNow === "function") saveNow();
    if (typeof paintParlay === "function") paintParlay();
  });
  const after = said.querySelector(".manage-change-value") || said.querySelector(".manage-change-prop");
  if (after) after.after(drop);
  else said.append(drop);
}

function manageAddLeg(host) {
  if (!host || host.querySelector(":scope > .manage-add-leg")) return;
  const add = document.createElement("button");
  add.type = "button";
  add.className = "manage-change manage-add-leg";
  add.textContent = "+ Add a leg";
  add.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const card = add.closest(".manage-card");
    const had = card && card.querySelector(".manage-add");
    if (card) card.querySelectorAll(".manage-add").forEach((node) => node.remove());
    if (had) return;
    const board = (card && card.closest(".find-board")) || document.querySelector(".find-board");
    const box = document.createElement("div");
    box.className = "manage-add find-new on";
    box.addEventListener("click", (hit) => hit.stopPropagation());
    if (typeof quickAddBox === "function" && board) {
      const quick = quickAddBox(board);
      quick.classList.add("quick-add-leg");
      box.append(quick);
    }
    host.append(box);
  });
  host.append(add);
}
const legNew = { open: false, pick: "", q: "" };

function legNewBox(board) {
  const box = document.createElement("div");
  box.className = "find-new";
  if (!legNew.open) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "find-new-add";
    add.textContent = "+ Add a leg";
    add.addEventListener("click", () => {
      legNew.open = true;
      if (typeof quickAddReset === "function") quickAddReset({ when: true, sport: true });
      legNewPaint();
      const tip = document.querySelector(".find-tray .find-new .quick-add");
      if (tip && typeof quickAddReveal === "function") quickAddReveal(tip);
    });
    box.append(add);
    return box;
  }
  box.classList.add("on");
  const top = document.createElement("div");
  top.className = "find-new-top";
  const title = document.createElement("b");
  title.textContent = "New leg";
  const shut = document.createElement("button");
  shut.type = "button";
  shut.className = "find-new-x";
  shut.setAttribute("aria-label", "Cancel the new leg");
  shut.textContent = "×";
  shut.addEventListener("click", () => {
    legNew.open = false;
    if (typeof quickAddReset === "function") quickAddReset({ when: true, sport: true });
    legNewPaint();
  });
  top.append(title, shut);
  box.append(top);
  if (typeof quickAddBox === "function") {
    const quick = quickAddBox(board);
    quick.classList.add("quick-add-leg");
    box.append(quick);
  } else {
    const none = document.createElement("p");
    none.className = "quiet";
    none.textContent = "Quick add is not ready.";
    box.append(none);
  }
  return box;
}

function legNewPaint() {
  document.querySelectorAll(".find-tray").forEach((tray) => {
    tray.querySelectorAll(":scope > .find-new").forEach((node) => node.remove());
    const board = tray.closest(".find-board");
    if (tray.hidden || !board || !parlayLeg.size) return;
    const box = legNewBox(board), rows = tray.querySelectorAll(":scope > .find-row");
    if (rows.length) rows[rows.length - 1].after(box); else tray.append(box);
  });
}

function legNewClose() {
  if (!legNew.open) return;
  legNew.open = false;
  legNewPaint();
}

function manageTurnRows() {
  const list = typeof saveList === "function" ? saveList() : [];
  return list.filter((item) => !item.locked && (typeof manageShown === "function" ? manageShown(item) : true));
}

function manageTurnPlan() {
  const chosen = [];
  const seen = new Set();
  const used = [];
  manageTurnRows().forEach((row) => {
    const fresh = [];
    (row.legs || []).forEach((leg) => {
      const mark = typeof parlayKey === "function" ? parlayKey(leg) : "";
      if (!mark || seen.has(mark)) return;
      fresh.push({ leg: { ...leg }, mark });
    });
    if (!fresh.length || chosen.length + fresh.length > 8) return;
    fresh.forEach((item) => { seen.add(item.mark); chosen.push(item.leg); });
    used.push(row);
  });
  return used.length >= 2 && chosen.length >= 2 ? { legs: chosen, used } : null;
}

function manageTurnMake() {
  const plan = manageTurnPlan();
  if (!plan || typeof saveList !== "function" || typeof saveStore !== "function") return;
  const stake = Math.round(plan.used.reduce((sum, row) => sum + (Number(row.stake) > 0 ? Number(row.stake) : 5), 0) * 100) / 100;
  const entry = { id: `p${Date.now()}`, at: Date.now(), stake, stakeTyped: true, legs: plan.legs, picks: [] };
  const drop = new Set(plan.used.map((row) => row.id));
  saveStore([entry, ...saveList().filter((row) => !drop.has(row.id))].slice(0, 20));
  if (typeof saveOpen === "function") saveOpen(entry.id);
  else if (typeof paintParlay === "function") paintParlay();
}

function manageTurnMount() {
  const plan = manageTurnPlan();
  document.querySelectorAll(".find-saved-acts").forEach((acts) => {
    if (acts.querySelector(".manage-turn")) return;
    if (!plan) return;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-saved-quick manage-turn";
    go.setAttribute("aria-label", "Turn my bets into a parlay");
    const long = document.createElement("span");
    long.className = "manage-turn-long";
    long.textContent = "Turn my bets into a parlay";
    const short = document.createElement("span");
    short.className = "manage-turn-short";
    short.textContent = "Make a parlay";
    go.append(long, short);
    go.addEventListener("click", () => manageTurnMake());
    const quick = [...acts.querySelectorAll(".find-saved-quick")].find((button) => !button.classList.contains("find-saved-hide"));
    if (quick) quick.before(go);
    else acts.append(go);
  });
}

if (typeof paintParlay === "function") {
  const paintParlayNew = paintParlay;
  let manageEditPaint = false;
  paintParlay = function () {
    paintParlayNew.apply(this, arguments);
    legNewPaint();
    if (window.manageEditing && !manageEditPaint && typeof manageRefresh === "function") {
      manageEditPaint = true;
      try { manageRefresh(); } finally { manageEditPaint = false; }
    }
    manageTurnMount();
  };
}

function betCurrentMark(id) {
  if (!id) return;
  window.betCurrent = id;
  try { sessionStorage.setItem("betCurrent", id); } catch (error) {}
}

function betCurrentPick() {
  const id = window.betCurrent || "";
  let stored = "";
  try { stored = sessionStorage.getItem("betCurrent") || ""; } catch (error) {}
  const list = typeof saveList === "function" ? saveList() : [];
  const pick = id || stored;
  if (pick && list.some((row) => row.id === pick)) return pick;
  const newest = list.slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))[0];
  return newest ? newest.id : "";
}

function betCurrentOpen() {
  const id = betCurrentPick();
  if (!id || typeof saveOpen !== "function") return false;
  if (window.parlayOpenId !== id) saveOpen(id);
  return window.parlayOpenId === id;
}

if (typeof saveNow === "function" && !window.betCurrentWrapped) {
  window.betCurrentWrapped = true;
  const betCurrentSave = saveNow;
  saveNow = function () {
    const before = window.parlayOpenId || "";
    const entry = betCurrentSave.apply(this, arguments);
    if (entry && entry.id && entry.id !== before) betCurrentMark(entry.id);
    return entry;
  };
}

window.legNewClose = legNewClose;
window.betCurrentMark = betCurrentMark;
window.betCurrentOpen = betCurrentOpen;
