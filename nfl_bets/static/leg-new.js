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

let manageCombineOn = false;
const manageCombine = new Set();

function manageCombineToken(id, key) {
  return `${id || ""}\t${key || ""}`;
}

function manageCombineLegs() {
  const list = typeof saveList === "function" ? saveList() : [];
  const chosen = [];
  const seen = new Set();
  manageCombine.forEach((token) => {
    const cut = token.indexOf("\t");
    const id = token.slice(0, cut);
    const key = token.slice(cut + 1);
    const row = list.find((item) => item.id === id);
    const leg = row && (row.legs || []).find((bet) => (typeof parlayKey === "function" ? parlayKey(bet) : "") === key);
    const mark = leg && (typeof parlayKey === "function" ? parlayKey(leg) : key);
    if (!leg || !mark || seen.has(mark) || chosen.length >= 8) return;
    seen.add(mark);
    chosen.push({ ...leg });
  });
  return chosen;
}

function manageCombineSay() {
  const make = document.querySelector(".manage-combine-make");
  if (!make) return;
  const n = manageCombineLegs().length;
  make.disabled = n < 2;
  make.textContent = n < 2 ? "Pick legs" : `Make a ${n}-leg parlay`;
}

function manageCombineSync() {
  document.querySelectorAll(".manage-board .manage-combine-pick").forEach((box) => {
    const line = box.closest(".find-chose");
    const card = box.closest(".manage-card");
    box.checked = !!(line && card && manageCombine.has(manageCombineToken(card.dataset.id, line.dataset.key)));
  });
  manageCombineSay();
}

function manageCombineFlip(id, key) {
  if (!id || !key) return;
  const token = manageCombineToken(id, key);
  if (manageCombine.has(token)) manageCombine.delete(token);
  else if (manageCombineLegs().length < 8) manageCombine.add(token);
  manageCombineSync();
}

function manageCombineMake() {
  const legs = manageCombineLegs();
  if (legs.length < 2 || typeof saveList !== "function" || typeof saveStore !== "function") return;
  const entry = { id: `p${Date.now()}`, at: Date.now(), stake: 5, legs, picks: [] };
  saveStore([entry, ...saveList()].slice(0, 20));
  manageCombine.clear();
  manageCombineOn = false;
  if (typeof paintParlay === "function") paintParlay();
}

function manageCombinePaint(board) {
  if (!board) return;
  board.classList.toggle("manage-combining", manageCombineOn);
  if (!manageCombineOn) return;
  board.querySelectorAll(".manage-card").forEach((card) => {
    const id = card.dataset.id || "";
    card.querySelectorAll(".find-chose").forEach((line) => {
      const key = line.dataset.key || "";
      if (!key || line.querySelector(".manage-combine-pick")) return;
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "manage-combine-pick";
      const who = (line.querySelector("i.who") || {}).textContent || "this leg";
      box.setAttribute("aria-label", `Add ${who} to the new parlay`);
      box.checked = manageCombine.has(manageCombineToken(id, key));
      box.addEventListener("click", (event) => {
        event.stopPropagation();
        manageCombineFlip(id, key);
      });
      line.prepend(box);
    });
  });
}

function manageCombineMount() {
  document.querySelectorAll(".find-saved-acts").forEach((acts) => {
    if (acts.querySelector(".manage-combine-go")) return;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-saved-quick manage-combine-go";
    go.textContent = manageCombineOn ? "Cancel" : "New parlay";
    go.addEventListener("click", () => {
      manageCombineOn = !manageCombineOn;
      if (!manageCombineOn) manageCombine.clear();
      if (typeof paintParlay === "function") paintParlay();
    });
    const quick = [...acts.querySelectorAll(".find-saved-quick")].find((button) => !button.classList.contains("find-saved-hide"));
    if (quick) quick.before(go);
    else acts.append(go);
    if (!manageCombineOn) return;
    const make = document.createElement("button");
    make.type = "button";
    make.className = "find-saved-quick manage-combine-make";
    make.addEventListener("click", () => manageCombineMake());
    go.after(make);
    manageCombineSay();
  });
  document.querySelectorAll(".manage-board").forEach((board) => manageCombinePaint(board));
}

if (!window.manageCombineBound) {
  window.manageCombineBound = true;
  document.addEventListener("click", (event) => {
    if (!manageCombineOn) return;
    if (event.target.closest("button, a, input, .manage-change, .manage-card-acts")) return;
    const line = event.target.closest(".manage-board .find-chose");
    if (!line) return;
    const card = line.closest(".manage-card");
    if (!card || !line.dataset.key) return;
    event.preventDefault();
    event.stopPropagation();
    manageCombineFlip(card.dataset.id, line.dataset.key);
  }, true);
}

if (typeof manageFill === "function") {
  const manageFillBase = manageFill;
  manageFill = function (board) {
    manageFillBase.apply(this, arguments);
    manageCombinePaint(board);
  };
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
    manageCombineMount();
  };
}

window.legNewClose = legNewClose;
