/** The search block is the last Less/More stop in My Bets. */

function manageSearchHost(page) {
  if (!page) return null;
  let host = page.querySelector(".manage-search-keep");
  if (!host) {
    host = document.createElement("div");
    host.className = "manage-search-keep";
    page.append(host);
  }
  return host;
}

function manageSearchTake(profile) {
  const page = document.querySelector(".find-board");
  if (!page || page.dataset.page !== "find") return;
  const host = manageSearchHost(page);
  if (!host || !profile) return;
  host.replaceChildren(profile);
  const pop = document.getElementById("find-profile-pop");
  if (pop) pop.remove();
  if (typeof closePlayerPop === "function" && closePlayerPop.onKey) {
    document.removeEventListener("keydown", closePlayerPop.onKey);
    closePlayerPop.onKey = null;
  }
  if (typeof manageZoomApply === "function") manageZoomApply(typeof MANAGE_ZOOM_MAX === "number" ? MANAGE_ZOOM_MAX : 5);
}

function manageZoomExtra(board) {
  const page = board.closest(".find-board");
  const last = typeof MANAGE_ZOOM_MAX === "number" ? MANAGE_ZOOM_MAX : 5;
  if (typeof manageZoom === "undefined" || manageZoom !== last) return;
  const host = manageSearchHost(page);
  if (!host) return;
  if (!host.childElementCount) host.append(Object.assign(document.createElement("p"), { className: "manage-empty", textContent: "Type a player, team or game." }));
  if (host.parentElement !== board) board.append(host);
}

function manageZoomExtras() {
  const last = typeof MANAGE_ZOOM_MAX === "number" ? MANAGE_ZOOM_MAX : 5;
  document.querySelectorAll(".find-board").forEach((page) => {
    const board = page.querySelector(".find-saved .manage-board");
    const host = page.querySelector(".manage-search-keep");
    if (board) board.querySelectorAll(":scope > .manage-history").forEach((node) => node.remove());
    if (host && (typeof manageZoom === "undefined" || manageZoom !== last)) page.append(host);
    if (board && typeof manageZoom !== "undefined" && manageZoom >= last) manageZoomExtra(board);
  });
}

window.manageSearchTake = manageSearchTake;

function manageLegEdit(line, said, leg) {
  const key = typeof parlayKey === "function" ? parlayKey(leg) : "";
  if (key) line.dataset.key = key;
  const propBtn = document.createElement("button");
  propBtn.type = "button";
  propBtn.className = "manage-change manage-change-prop";
  propBtn.textContent = "Change prop";
  const valBtn = document.createElement("button");
  valBtn.type = "button";
  valBtn.className = "manage-change manage-change-value";
  valBtn.textContent = "Change value";
  const who = said.querySelector("i.who");
  const prop = said.querySelector("i.prop");
  if (who) who.after(propBtn); else said.append(propBtn);
  if (prop) prop.after(valBtn); else said.append(valBtn);
  const pickMode = (mode, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!key || typeof legSwapOpen === "undefined") return;
    if (legSwapOpen.get(key) === mode) { legSwapOpen.delete(key); if (typeof legSwapDrill !== "undefined") legSwapDrill.delete(key); }
    else { legSwapOpen.set(key, mode); if (typeof legSwapDrill !== "undefined") legSwapDrill.delete(key); }
    if (typeof legSwapPaint === "function") legSwapPaint();
    else manageSwapShow();
  };
  propBtn.addEventListener("click", (event) => pickMode("kind", event));
  valBtn.addEventListener("click", (event) => pickMode("line", event));
}

function manageSwapShow() {
  document.querySelectorAll(".manage-card .find-tray-swap[data-manage]").forEach((node) => node.remove());
  document.querySelectorAll(".manage-card.editing .find-chose[data-key]").forEach((line) => {
    if (!line.getClientRects().length) return;
    const key = line.dataset.key;
    const mode = typeof legSwapOpen !== "undefined" && legSwapOpen.get(key);
    line.querySelectorAll(".manage-change").forEach((button) => {
      const on = (button.classList.contains("manage-change-prop") && mode === "kind") || (button.classList.contains("manage-change-value") && mode === "line");
      button.classList.toggle("on", on);
    });
    if (mode !== "kind" && mode !== "line") return;
    if (typeof legSwapBox !== "function") return;
    const box = legSwapBox(key, mode);
    box.dataset.manage = "1";
    box.dataset.key = key;
    line.after(box);
  });
}

window.manageLegEdit = manageLegEdit;
window.manageSwapShow = manageSwapShow;
