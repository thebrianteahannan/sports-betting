// The chart icon on a parlay leg opens that bet's history under the leg, inside the parlay.
const legHistOpen = new Set(), legHistBox = new Map();

function legHistFor(key) {
  if (legHistBox.has(key)) return legHistBox.get(key);
  const bet = parlayLeg.get(key) || {};
  const person = [...parlayPick.values()].find((one) => String(bet.label || "").startsWith(one.name));
  const block = document.createElement("div");
  block.className = "find-tray-read log-on";
  Object.assign(block.dataset, { who: person ? person.name : "", raw: String(bet.label || "").split(/\s+—\s+/)[0].trim(), market: bet.market || "", odds: String(bet.odds || ""), sport: bet.sport || "" });
  const wait = document.createElement("p");
  wait.className = "find-leg-wait";
  wait.textContent = "Reading the history.";
  block.append(wait);
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

function legSeek(name) {
  const run = () => {
    const input = document.querySelector(".find-board label.find input");
    if (!input) return false;
    input.value = name;
    input.dispatchEvent(new Event("input"));
    const hits = input.closest(".find-board").querySelector(":scope > .find-hits:not(.find-tray)");
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
  if (seek) legSeek(seek.dataset.who);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest && event.target.closest(".find-tray button.find-leg-hist");
  if (!button) return;
  const key = button.dataset.key;
  if (legHistOpen.has(key)) { legHistOpen.delete(key); const box = legHistBox.get(key); if (box) box.remove(); } else legHistOpen.add(key);
  legHistPaint();
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
  if (!row.legs.some((leg) => parlayKey(leg) === key)) { row.legs.push(bet); row.at = Date.now(); saveStore(list); }
  paintParlay();
  const chip = document.querySelector(`.find-saved-chip[data-id="${CSS.escape(id)}"]`);
  if (chip) { chip.classList.add("find-flash"); setTimeout(() => chip.classList.remove("find-flash"), 2400); }
}

let legMenuKey = "";

function legMenuPaint() {
  document.querySelectorAll(".find-leg-menu").forEach((node) => node.remove());
  const to = legMenuKey && [...document.querySelectorAll(".find-tray button.find-leg-to")].find((node) => node.dataset.key === legMenuKey);
  if (!to) return;
  const others = saveList().filter((row) => row.id !== window.parlayOpenId);
  const menu = document.createElement("div"); menu.className = "find-leg-menu"; menu.dataset.key = legMenuKey;
  menu.innerHTML = others.length ? `<b>Add this leg to</b>${others.map((row) => `<button type="button" data-id="${esc(row.id)}">${esc(legToName(row))}</button>`).join("")}` : `<p>No other saved parlays yet.</p>`;
  to.closest(".find-chose").after(menu);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest) return;
  const pick = event.target.closest(".find-leg-menu button[data-id]");
  if (pick) { const key = legMenuKey; legMenuKey = ""; legTo(key, pick.dataset.id); legMenuPaint(); return; }
  if (event.target.closest(".find-leg-menu")) return;
  const to = event.target.closest(".find-tray button.find-leg-to");
  legMenuKey = to && to.dataset.key !== legMenuKey ? to.dataset.key : "";
  legMenuPaint();
});

if (typeof paintParlay === "function") {
  const paintParlayLegs = paintParlay;
  paintParlay = function () { paintParlayLegs.apply(this, arguments); legHistPaint(); if (legMenuKey) legMenuPaint(); };
}
