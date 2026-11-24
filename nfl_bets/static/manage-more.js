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
