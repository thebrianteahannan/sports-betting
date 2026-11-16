// Once any game in a bet has started, the bet is locked. Legs cannot be removed, swapped for another player, or added.
// The prop on a leg can still change: the number, or another prop for the same player. A wrong line can be corrected after kickoff.
// A leg picked while a locked bet is open starts a new bet instead.

function trayLockStarted(legs) {
  const now = Date.now();
  return (legs || []).some((bet) => Date.parse(bet.kickoff || "") <= now);
}

function trayLockWho(bet) {
  const board = document.querySelector(".find-board");
  const label = String(bet.label || "");
  const named = ((board && board.people) || []).filter((one) => one.kind === "player" && one.name && label.startsWith(one.name)).sort((a, b) => b.name.length - a.name.length)[0];
  if (named) return named.name;
  if (typeof legLoose !== "function") return "";
  const loose = legLoose(bet);
  const game = typeof gameShort === "function" ? gameShort(bet.match) : "";
  return loose.who && loose.who !== game ? loose.who : "";
}

function trayLockFam(bet) {
  const market = String(bet.market || "");
  if (/^(total|alternate total)/i.test(market)) return "total";
  if (/^(spread|alternate spread)/i.test(market)) return "spread";
  if (/^moneyline$/i.test(market)) return "money";
  return "";
}

function trayLockSameLeg(oldBet, next) {
  if (!oldBet || !next || oldBet.match !== next.match || String(oldBet.kickoff || "") !== String(next.kickoff || "")) return false;
  const oldWho = trayLockWho(oldBet), nextWho = trayLockWho(next);
  if (oldWho && oldWho === nextWho) return true;
  const oldFam = trayLockFam(oldBet), nextFam = trayLockFam(next);
  return Boolean(oldFam && oldFam === nextFam && (oldFam === "total" || String(oldBet.label || "").replace(/\s[+-]?\d.*$/, "").trim() === String(next.label || "").replace(/\s[+-]?\d.*$/, "").trim()));
}

function trayLockPropEdit(open) {
  const was = new Map(open.legs.map((bet) => [parlayKey(bet), bet]));
  const removed = [...was.entries()].filter(([key]) => !parlayLeg.has(key));
  const added = [...parlayLeg.entries()].filter(([key]) => !was.has(key));
  if (!removed.length || removed.length !== added.length) return false;
  const pool = added.map(([, bet]) => ({ bet, used: false }));
  return removed.every(([, oldBet]) => {
    const hit = pool.find((row) => !row.used && trayLockSameLeg(oldBet, row.bet));
    if (!hit) return false;
    hit.used = true;
    return true;
  });
}

function trayLockGuard() {
  const open = typeof saveList === "function" && saveList().find((row) => row.id === window.parlayOpenId);
  if (!open || !parlayLeg.size || !trayLockStarted(open.legs)) return;
  const was = new Set(open.legs.map((bet) => parlayKey(bet))), now = [...parlayLeg.keys()];
  if (now.length === was.size && now.every((key) => was.has(key))) return;
  if (trayLockPropEdit(open)) return;
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
    tray.title = locked ? "The game has started. Tap a prop to change it." : "";
  });
  if (locked && typeof legSwapOpen !== "undefined") [...legSwapOpen.entries()].forEach(([key, mode]) => { if (mode !== "line" && mode !== "kind") legSwapOpen.delete(key); });
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
  const hit = event.target.closest && event.target.closest(".find-tray.find-locked :is(.find-chose button.find-out, button.find-leg-swap, button.find-leg-to, .find-in button.find-name, .find-in button.find-out, .find-new-add, .find-undo button, .find-swap-add)");
  if (!hit) return;
  event.stopImmediatePropagation(); event.preventDefault();
}, true);

setInterval(() => { if (typeof parlayLeg !== "undefined" && parlayLeg.size && document.querySelector(".find-tray:not(.find-locked)") && trayLockStarted([...parlayLeg.values()])) trayLockPaint(); }, 30000);
