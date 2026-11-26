/** The words in the middle of the top bar: where the user is. */

const WHERE_TABS = { today: "Today's parlay", week: "This week's parlays", build: "Build your own bet", how: "How we pick", help: "Gambling help", open: "Our bets", history: "Finished bets", profile: "Your membership", laws: "State rules" };
const WHERE_PAGES = { stack: "Parlay strategies", ones: "One-pick strategies", how: "How's my bet" };

function whereNick(team) {
  const name = String(team || "").split(",")[0].replace(/\s*\([^)]*\)/g, "").trim();
  const all = typeof CLUB_COLORS === "object" ? Object.values(CLUB_COLORS).flatMap((table) => Object.keys(table)) : [];
  return all.filter((nick) => name === nick || name.endsWith(` ${nick}`)).sort((a, b) => b.length - a.length)[0] || name;
}

function whereFind() {
  return "Build a bet";
}

function whereText() {
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) return "";
  const guide = document.getElementById("bird-guide");
  if (desk.classList.contains("bird-on") && guide && !guide.hidden) return "Home";
  const board = document.querySelector("#desk-glass-in .rec-board");
  if (board && board.dataset.page) {
    if (board.dataset.page === "find") return whereFind(board);
    if (board.dataset.page === "rec") return "Recommended";
    if (board.dataset.page === "bets") return window.recPast ? "Finished bets, by strategy" : "Experimental strategies";
    return WHERE_PAGES[board.dataset.page] || "";
  }
  const tab = window.state && state.tab;
  const chooser = document.getElementById("chooser");
  if (tab === "build" && chooser && chooser.classList.contains("built")) return "Your bet";
  return WHERE_TABS[tab] || "";
}

function wherePaint() {
  const desk = document.getElementById("desk");
  if (!desk) return;
  let where = document.getElementById("desk-where");
  if (!where) { where = document.createElement("p"); where.id = "desk-where"; where.setAttribute("aria-live", "polite"); desk.append(where); }
  const text = whereText();
  if (where.textContent === text) return;
  where.replaceChildren();
  if (text) { const span = document.createElement("span"); span.textContent = text; where.append(span); }
}

function findWipe() {
  document.querySelectorAll(".find-board > label.find:not(.find-wiped)").forEach((label) => {
    const input = label.querySelector("input");
    if (!input) return;
    label.classList.add("find-wiped");
    const wipe = document.createElement("button");
    wipe.type = "button";
    wipe.className = "find-wipe";
    wipe.textContent = "×";
    wipe.setAttribute("aria-label", "Clear the search");
    wipe.addEventListener("click", (event) => { event.preventDefault(); input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); });
    label.prepend(wipe);
  });
}

function findUpPaint() {
  const desk = document.getElementById("desk");
  if (!desk) return;
  let go = document.getElementById("desk-find-go");
  if (!go) {
    go = document.createElement("button");
    go.type = "button"; go.id = "desk-find-go"; go.hidden = true;
    go.setAttribute("aria-label", "Back to the search box");
    go.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    go.addEventListener("click", () => {
      const board = document.querySelector("#desk-glass-in .find-board");
      if (!board || board.dataset.page !== "find") {
        if (typeof birdMenu === "function") birdMenu("find");
        else if (typeof paintFind === "function") paintFind();
        return;
      }
      const row = document.getElementById("desk-glass-in");
      const input = board.querySelector(":scope > label.find input");
      if (row) row.scrollTo({ top: 0, behavior: "smooth" });
      if (input) { input.focus({ preventScroll: true }); input.select(); }
    });
    desk.append(go);
  }
  const row = document.getElementById("desk-glass-in");
  const board = document.querySelector("#desk-glass-in .find-board");
  const onBuild = board && board.dataset.page === "find";
  const label = onBuild && board.querySelector(":scope > label.find");
  go.setAttribute("aria-label", onBuild ? "Search" : "Build a bet");
  const away = desk.classList.contains("tv-full") && !!(label && row && label.getBoundingClientRect().bottom < row.getBoundingClientRect().top + 80);
  go.hidden = !(desk.classList.contains("tv-full") && board);
  desk.classList.toggle("find-up", away);
}

const DESK_NAV = [["find", "Build a bet", "find"], ["manage", "My Bets", "manage"], ["rec", "Recommended", "rec"], ["live", "The Games", "live"]];
const DESK_HERE = { "/build": "find", "/recommended": "rec", "/history": "history", "/movement": "moves", "/bets": "manage", "/strategies": "bets" };

function deskNavPaint() {
  const desk = document.getElementById("desk");
  if (!desk) return;
  const show = desk.classList.contains("tv-full") && !document.body.classList.contains("needs-member");
  let nav = document.getElementById("desk-nav");
  if (!show) { if (nav) nav.hidden = true; desk.classList.remove("has-nav"); return; }
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "desk-nav";
    nav.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-go]");
      if (button && typeof birdMenu === "function") birdMenu(button.dataset.go);
    });
    desk.append(nav);
  }
  nav.hidden = false;
  const here = DESK_HERE[location.pathname] || "";
  const count = typeof saveList === "function" ? saveList().length : 0;
  const html = DESK_NAV.filter((item) => item[0] !== here).map((item) => `<button type="button" data-go="${item[2]}">${item[1]}${item[0] === "manage" ? ` <b>${count}</b>` : ""}</button>`).join("");
  if (nav.innerHTML !== html) nav.innerHTML = html;
  desk.classList.add("has-nav");
}

(() => {
  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; wherePaint(); findWipe(); findUpPaint(); deskNavPaint(); if (typeof betShotMount === "function") betShotMount(); }); };
  document.addEventListener("scroll", queue, { capture: true, passive: true });
  const start = () => {
    const desk = document.getElementById("desk");
    if (!desk) return;
    new MutationObserver(queue).observe(desk, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
    desk.addEventListener("scroll", () => { if (desk.scrollTop && desk.classList.contains("tv-full")) desk.scrollTop = 0; });
    queue();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
