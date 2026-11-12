/** The words in the middle of the top bar: where the user is. */

const WHERE_TABS = { today: "Today's parlay", week: "This week's parlays", build: "Build your own bet", how: "How we pick", help: "Gambling help", open: "Our bets", history: "Finished bets", profile: "Your membership", laws: "State rules" };
const WHERE_PAGES = { stack: "Parlay strategies", ones: "One-pick strategies", how: "How's my bet" };

function whereNick(team) {
  const name = String(team || "").split(",")[0].replace(/\s*\([^)]*\)/g, "").trim();
  const all = typeof CLUB_COLORS === "object" ? Object.values(CLUB_COLORS).flatMap((table) => Object.keys(table)) : [];
  return all.filter((nick) => name === nick || name.endsWith(` ${nick}`)).sort((a, b) => b.length - a.length)[0] || name;
}

function whereFind(board) {
  const who = board.querySelector(".find-list > h3 .rec-count, .find-list > .find-profile > h3 .rec-count");
  if (who) return `Search results for ${who.parentElement.firstChild.textContent.split(",")[0].trim()}`;
  const match = [...board.querySelectorAll(".find-teams .find-match")].pop();
  const sides = match ? [...match.querySelectorAll(":scope > .find-side-go")].map((side) => whereNick(side.textContent)) : [];
  if (sides.length === 2) return `Search results for ${sides[0]} @ ${sides[1]} game`;
  return "Search for a player, team or game";
}

function whereText() {
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) return "";
  const guide = document.getElementById("bird-guide");
  if (desk.classList.contains("bird-on") && guide && !guide.hidden) return "Home";
  const board = document.querySelector("#desk-glass-in .rec-board");
  if (board && board.dataset.page) {
    if (board.dataset.page === "find") return whereFind(board);
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
      const row = document.getElementById("desk-glass-in");
      const input = document.querySelector(".find-board > label.find input");
      if (row) row.scrollTo({ top: 0, behavior: "smooth" });
      if (input) { input.focus({ preventScroll: true }); input.select(); }
    });
    desk.append(go);
  }
  const row = document.getElementById("desk-glass-in");
  const label = desk.classList.contains("tv-full") && document.querySelector("#desk-glass-in .find-board > label.find");
  const up = !!(label && row && label.getBoundingClientRect().bottom < row.getBoundingClientRect().top + 80);
  go.hidden = !up;
  desk.classList.toggle("find-up", up);
}

(() => {
  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; wherePaint(); findWipe(); findUpPaint(); if (typeof betShotMount === "function") betShotMount(); }); };
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
