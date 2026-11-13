// Once any game in a bet has started, the bet is locked. Its legs cannot be removed, swapped, renumbered or added to.
// A leg picked while a locked bet is open starts a new bet instead.

function trayLockStarted(legs) {
  const now = Date.now();
  return (legs || []).some((bet) => Date.parse(bet.kickoff || "") <= now);
}

function trayLockGuard() {
  const open = typeof saveList === "function" && saveList().find((row) => row.id === window.parlayOpenId);
  if (!open || !parlayLeg.size || !trayLockStarted(open.legs)) return;
  const was = new Set(open.legs.map((bet) => parlayKey(bet))), now = [...parlayLeg.keys()];
  if (now.length === was.size && now.every((key) => was.has(key))) return;
  const added = [...parlayLeg.entries()].filter(([key]) => !was.has(key)), kept = [...was].every((key) => parlayLeg.has(key));
  const named = (person, legs) => legs.some((bet) => person.name && String(bet.label || "").startsWith(person.name));
  if (kept && added.length) {
    console.log("[tray-lock] bet is locked, starting a new bet with", added.length, "leg(s)");
    window.parlayOpenId = "";
    parlayLeg.clear(); added.forEach(([key, bet]) => parlayLeg.set(key, bet));
    [...parlayPick.entries()].forEach(([key, person]) => { if (named(person, open.legs) && !named(person, [...parlayLeg.values()])) parlayPick.delete(key); });
    return;
  }
  console.log("[tray-lock] bet is locked, putting it back");
  const people = (document.querySelector(".find-board") || {}).people || [];
  parlayLeg.clear(); open.legs.forEach((bet) => parlayLeg.set(parlayKey(bet), bet));
  (open.picks || []).forEach((lite) => { if (!parlayPick.has(lite.key)) parlayPick.set(lite.key, people.find((who) => who.key === lite.key) || { ...lite, bets: [] }); });
  window.trayUndo = null;
}

function trayLockPaint() {
  const locked = trayLockStarted([...parlayLeg.values()]);
  document.querySelectorAll(".find-tray").forEach((tray) => {
    tray.classList.toggle("find-locked", locked);
    tray.title = locked ? "A game in this bet has started, so the bet is locked." : "";
  });
  if (locked && typeof legSwapOpen !== "undefined") legSwapOpen.clear();
}

if (typeof paintParlay === "function") {
  const paintParlayLock = paintParlay;
  paintParlay = function () { trayLockGuard(); paintParlayLock.apply(this, arguments); trayLockPaint(); };
}

if (typeof legTo === "function") {
  const legToOpen = legTo;
  legTo = function (key, id) {
    const row = saveList().find((one) => one.id === id);
    if ((row && trayLockStarted(row.legs)) || trayLockStarted([parlayLeg.get(key)].filter(Boolean))) { console.log("[tray-lock] locked, not adding", key, "to", id); return; }
    legToOpen.apply(this, arguments);
  };
}

if (typeof legMenuPaint === "function") {
  const legMenuOpen = legMenuPaint;
  legMenuPaint = function () {
    legMenuOpen.apply(this, arguments);
    const locked = new Set(saveList().filter((row) => trayLockStarted(row.legs)).map((row) => row.id));
    document.querySelectorAll(".find-leg-menu button[data-id]").forEach((button) => { if (locked.has(button.dataset.id)) button.remove(); });
  };
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest && event.target.closest(".find-tray.find-locked :is(.find-chose button.find-out, button.find-leg-swap, button.find-leg-to, .find-chose i.prop[data-key], .find-chose i.who[data-key], .find-in button.find-name, .find-in button.find-out, .find-new-add, .find-undo button)");
  if (!hit) return;
  event.stopImmediatePropagation(); event.preventDefault();
}, true);

setInterval(() => { if (typeof parlayLeg !== "undefined" && parlayLeg.size && document.querySelector(".find-tray:not(.find-locked)") && trayLockStarted([...parlayLeg.values()])) trayLockPaint(); }, 30000);
