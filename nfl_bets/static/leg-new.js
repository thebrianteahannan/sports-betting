// "+ Add a leg" under the parlay opens Quick add in the tray.
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
  paintParlay = function () { paintParlayNew.apply(this, arguments); legNewPaint(); };
}

window.legNewClose = legNewClose;
