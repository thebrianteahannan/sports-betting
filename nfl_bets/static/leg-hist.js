// The chart icon on a parlay leg opens that bet's history under the leg, inside the parlay.
const legHistOpen = new Set(), legHistBox = new Map();

function legHistClose(key) {
  legHistOpen.delete(key);
  const box = legHistBox.get(key);
  if (box) box.remove();
  legHistPaint();
}

/** One toolbar panel open per leg: hist, swap, add-to menu, or more. */
function legToolsSolo(key, keep) {
  if (!key) return;
  let hist = false, swap = false, menu = false, more = false;
  if (keep !== "hist" && keep !== "line" && legHistOpen.has(key)) {
    legHistOpen.delete(key);
    const box = legHistBox.get(key);
    if (box) box.remove();
    hist = true;
  }
  if (keep !== "swap" && keep !== "line" && typeof legSwapOpen !== "undefined" && legSwapOpen.has(key)) {
    legSwapOpen.delete(key);
    if (typeof legSwapDrill !== "undefined") legSwapDrill.delete(key);
    swap = true;
  }
  if (keep !== "menu" && legMenuKey === key) {
    legMenuKey = "";
    menu = true;
  }
  if (keep !== "more" && typeof legMoreOpen !== "undefined" && legMoreOpen.has(key)) {
    legMoreOpen.delete(key);
    more = true;
  }
  if (hist) legHistPaint();
  if ((swap || more) && typeof legSwapPaint === "function") legSwapPaint();
  if (menu) legMenuPaint();
}
window.legToolsSolo = legToolsSolo;

function legHistFor(key) {
  if (legHistBox.has(key)) return legHistBox.get(key);
  const bet = parlayLeg.get(key) || {};
  const person = [...parlayPick.values()].find((one) => String(bet.label || "").startsWith(one.name));
  const block = document.createElement("div");
  block.className = "find-tray-read log-on";
  Object.assign(block.dataset, { who: person ? person.name : "", raw: String(bet.label || "").split(/\s+—\s+/)[0].trim(), market: bet.market || "", odds: String(bet.odds || ""), sport: bet.sport || "" });
  const bar = document.createElement("div");
  bar.className = "find-hist-bar";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "find-hist-close";
  close.textContent = "Close history";
  close.setAttribute("aria-label", "Close history");
  close.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    legHistClose(key);
  });
  bar.append(close);
  const wait = document.createElement("p");
  wait.className = "find-leg-wait";
  wait.textContent = "Reading the history.";
  block.append(bar, wait);
  legHistBox.set(key, block);
  if (typeof fillLeg === "function") fillLeg(block);
  return block;
}

function legHistPaint() {
  document.querySelectorAll(".find-tray button.find-leg-hist").forEach((button) => {
    const key = button.dataset.key, on = legHistOpen.has(key) && parlayLeg.has(key);
    button.classList.toggle("on", on);
    button.setAttribute("aria-expanded", String(on));
    button.title = on ? "Hide the history" : "Show the history";
    const line = button.closest(".find-chose");
    if (on && line) line.after(legHistFor(key));
    const who = line && line.querySelector("span i.who");
    if (who && !button.parentElement.querySelector("button.find-leg-seek")) {
      const seek = document.createElement("button");
      seek.type = "button";
      seek.className = "find-leg-seek";
      seek.title = `Search for ${who.textContent}`;
      seek.setAttribute("aria-label", seek.title);
      seek.dataset.who = who.textContent;
      button.before(seek);
    }
    if (line && !button.parentElement.querySelector("button.find-leg-to")) {
      const to = document.createElement("button");
      to.type = "button"; to.className = "find-leg-to"; to.dataset.key = key;
      to.title = "Add this leg to another saved parlay"; to.setAttribute("aria-label", to.title);
      button.after(to);
      queueMicrotask(() => { if (to.isConnected && button.isConnected) button.after(to); });
    }
  });
}

function legSeekPerson(name) {
  const want = typeof plainName === "function" ? plainName(name) : String(name || "").toLowerCase();
  if (!want) return null;
  const fromPick = typeof parlayPick !== "undefined" && [...parlayPick.values()].find((one) => plainName(one.name) === want);
  if (fromPick) return fromPick;
  const board = document.querySelector(".find-board");
  return ((board && board.people) || []).find((one) => one.kind === "player" && plainName(one.name) === want) || null;
}

function legSeekPop(name) {
  const person = legSeekPerson(name);
  if (!person || typeof openPlayerPop !== "function") return false;
  const board = document.querySelector(".find-board");
  const list = board && board.querySelector(".find-list");
  openPlayerPop(person, list);
  return true;
}

function legSeek(name) {
  if (legSeekPop(name)) return;
  const run = () => {
    const input = document.querySelector(".find-board label.find input");
    if (!input) return false;
    input.value = name;
    input.dispatchEvent(new Event("input"));
    const hits = input.closest(".find-board").querySelector(":scope > .find-hits:not(.find-tray)");
    const week = hits && !hits.querySelector("button:not([data-week])") && hits.querySelector("button[data-week]");
    if (week) week.click();
    const picks = hits ? [...hits.querySelectorAll("button:not([data-week])")] : [];
    const pick = picks.find((node) => plainName(node.textContent.split(",")[0]) === plainName(name)) || (picks.length === 1 ? picks[0] : null);
    if (pick) pick.click();
    const board = input.closest(".find-board"), list = board.querySelector(":scope > .find-list"), target = list && list.childNodes.length ? list : input;
    const glass = document.getElementById("desk-glass-in"), tray = board.querySelector(".find-tray"), fold = tray && !tray.hidden && !tray.classList.contains("find-shut") && tray.querySelector(".find-fold");
    if (fold) { fold.click(); if (typeof saveAutoShut !== "undefined") { saveAutoShut.add(tray); saveFoldAt = Date.now(); } }
    if (pick) return true;
    if (!glass || !glass.contains(target)) { target.scrollIntoView({ block: "start", behavior: "smooth" }); return true; }
    const stuck = tray && !tray.hidden && tray.getClientRects().length ? tray.offsetHeight : 0;
    glass.scrollTo({ top: glass.scrollTop + target.getBoundingClientRect().top - glass.getBoundingClientRect().top - stuck - 8, behavior: "smooth" });
    return true;
  };
  if (run()) return;
  if (window.paintFind) paintFind();
  let tries = 0;
  const wait = setInterval(() => { if (run() || ++tries > 40) clearInterval(wait); }, 150);
}

document.addEventListener("click", (event) => {
  const seek = event.target.closest && event.target.closest(".find-tray button.find-leg-seek");
  if (!seek) return;
  const hist = seek.parentElement && seek.parentElement.querySelector("button.find-leg-hist");
  if (hist && hist.dataset.key) legToolsSolo(hist.dataset.key, "seek");
  if (!legSeekPop(seek.dataset.who)) legSeek(seek.dataset.who);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest && event.target.closest(".find-tray button.find-leg-hist");
  if (!button) return;
  const key = button.dataset.key;
  if (legHistOpen.has(key)) legHistClose(key);
  else { legToolsSolo(key, "hist"); legHistOpen.add(key); legHistPaint(); }
});

function legToName(row) {
  const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
  const who = (row.picks || []).map((lite) => String(lite.name || "").split(" ").pop()).filter(Boolean);
  const said = who.length ? `${who.slice(0, 2).join(", ")}${row.legs.length > 2 ? ` +${row.legs.length - 2}` : ""}` : `${row.legs.length} ${row.legs.length === 1 ? "leg" : "legs"}`;
  return [games, said, savePrice(row.legs)].filter(Boolean).join("  ");
}

function legTo(key, id) {
  const bet = parlayLeg.get(key), list = saveList(), row = list.find((one) => one.id === id);
  if (!bet || !row) return;
  const person = [...parlayPick.values()].find((one) => one.name && String(bet.label || "").startsWith(one.name));
  if (person && !(row.picks || []).some((one) => one.key === person.key)) { const { bets, ...lite } = person; row.picks = [...(row.picks || []), lite]; }
  if (!row.legs.some((leg) => parlayKey(leg) === key)) { row.legs.push(bet); row.at = Date.now(); saveStore(list); }
  paintParlay();
  const chip = document.querySelector(`.find-saved-chip[data-id="${CSS.escape(id)}"]`);
  if (chip) { chip.classList.add("find-flash"); setTimeout(() => chip.classList.remove("find-flash"), 2400); }
}

let legMenuKey = "";

function legMenuPaint() {
  document.querySelectorAll(".find-leg-menu").forEach((node) => node.remove());
  document.querySelectorAll(".find-tray button.find-leg-to").forEach((node) => {
    const on = node.dataset.key === legMenuKey;
    node.classList.toggle("on", on);
    node.setAttribute("aria-expanded", String(on));
  });
  const to = legMenuKey && [...document.querySelectorAll(".find-tray button.find-leg-to")].find((node) => node.dataset.key === legMenuKey);
  if (!to) return;
  const others = saveList().filter((row) => row.id !== window.parlayOpenId);
  const menu = document.createElement("div"); menu.className = "find-leg-menu"; menu.dataset.key = legMenuKey;
  menu.innerHTML = others.length
    ? `<b>Add this leg to</b>${others.map((row) => `<button type="button" data-id="${esc(row.id)}">${esc(legToName(row))}</button>`).join("")}<button type="button" class="find-leg-menu-close" aria-label="Close">Close</button>`
    : `<p>No other saved parlays yet.</p><button type="button" class="find-leg-menu-close" aria-label="Close">Close</button>`;
  to.closest(".find-chose").after(menu);
}

function legMenuClose() {
  if (!legMenuKey) return;
  legMenuKey = "";
  legMenuPaint();
}

document.addEventListener("click", (event) => {
  if (!event.target.closest) return;
  const shut = event.target.closest(".find-leg-menu button.find-leg-menu-close");
  if (shut) {
    event.preventDefault();
    event.stopPropagation();
    legMenuClose();
    return;
  }
  const pick = event.target.closest(".find-leg-menu button[data-id]");
  if (pick) { const key = legMenuKey; legMenuKey = ""; legTo(key, pick.dataset.id); legMenuPaint(); return; }
  if (event.target.closest(".find-leg-menu")) return;
  const to = event.target.closest(".find-tray button.find-leg-to");
  const next = to && to.dataset.key !== legMenuKey ? to.dataset.key : "";
  if (next === legMenuKey) return;
  legMenuKey = next;
  if (legMenuKey) legToolsSolo(legMenuKey, "menu");
  legMenuPaint();
  if (typeof legSwapPaint === "function") legSwapPaint();
  legHistPaint();
});

if (typeof paintParlay === "function") {
  const paintParlayLegs = paintParlay;
  paintParlay = function () { paintParlayLegs.apply(this, arguments); legHistPaint(); if (legMenuKey) legMenuPaint(); };
}
