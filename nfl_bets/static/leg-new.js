// "+ Add a leg" under the parlay opens Quick add in the tray.
// The same add, plus Move up and Move down, sits on an editing parlay card.

function manageLegShift(key, dir) {
  if (!key || typeof parlayLeg === "undefined" || !parlayLeg.has(key)) return;
  const entries = [...parlayLeg.entries()];
  const at = entries.findIndex(([id]) => id === key);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= entries.length) return;
  const [row] = entries.splice(at, 1);
  entries.splice(to, 0, row);
  parlayLeg.clear();
  entries.forEach(([id, bet]) => parlayLeg.set(id, bet));
  if (typeof saveNow === "function") saveNow();
  if (typeof paintParlay === "function") paintParlay();
}

function manageLegMoves(said, key, at, count) {
  if (!(count > 1) || !said) return;
  const move = (dir, event) => {
    event.preventDefault();
    event.stopPropagation();
    manageLegShift(key, dir);
  };
  const place = (button) => {
    const after = said.querySelector(".manage-move") || said.querySelector(".manage-change-value") || said.querySelector(".manage-change-prop");
    if (after) after.after(button);
    else said.append(button);
  };
  if (at > 0) {
    const up = document.createElement("button");
    up.type = "button";
    up.className = "manage-change manage-move";
    up.textContent = "Move up";
    up.addEventListener("click", (event) => move(-1, event));
    place(up);
  }
  if (at < count - 1) {
    const down = document.createElement("button");
    down.type = "button";
    down.className = "manage-change manage-move";
    down.textContent = "Move down";
    down.addEventListener("click", (event) => move(1, event));
    place(down);
  }
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

if (typeof paintParlay === "function") {
  const paintParlayNew = paintParlay;
  let manageEditPaint = false;
  paintParlay = function () {
    paintParlayNew.apply(this, arguments);
    legNewPaint();
    if (!window.manageEditing || manageEditPaint || typeof manageRefresh !== "function") return;
    manageEditPaint = true;
    try { manageRefresh(); } finally { manageEditPaint = false; }
  };
}

window.legNewClose = legNewClose;
