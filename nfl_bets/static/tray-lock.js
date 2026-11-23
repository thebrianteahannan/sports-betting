// Once any game in a bet has started, picking a new player starts a new bet.
// The open ticket can still be corrected: change the prop, type the price you actually got, or take a leg off.

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
    const hit = pool.find((row) => !row.used && (trayLockSameLeg(oldBet, row.bet) || (oldBet.match === row.bet.match && String(oldBet.kickoff || "") === String(row.bet.kickoff || ""))));
    if (!hit) return false;
    hit.used = true;
    return true;
  });
}

function trayLockGuard() {
  const open = typeof saveList === "function" && saveList().find((row) => row.id === window.parlayOpenId);
  if (!open || !parlayLeg.size || !trayLockStarted(open.legs)) return;
  const was = new Set(open.legs.map((bet) => parlayKey(bet))), now = [...parlayLeg.keys()];
  const added = [...parlayLeg.entries()].filter(([key]) => !was.has(key)), kept = [...was].every((key) => parlayLeg.has(key));
  if (now.length === was.size && now.every((key) => was.has(key))) return;
  if (!added.length) return;
  if (trayLockPropEdit(open)) return;
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
  const lockTip = "The game has started. Tap the prop to change it, or take a leg off.";
  document.querySelectorAll(".find-tray").forEach((tray) => {
    tray.classList.toggle("find-locked", locked);
    tray.title = locked ? lockTip : "";
    tray.querySelectorAll(".find-chose button.find-out, .find-chose button.find-leg-swap, .find-chose button.find-leg-to").forEach((button) => {
      if (locked) button.title = lockTip;
      else if (button.classList.contains("find-out")) button.removeAttribute("title");
      else if (button.classList.contains("find-leg-to")) button.title = "Add this leg to another saved parlay";
      else if (button.classList.contains("find-leg-swap")) button.title = button.classList.contains("on") ? "Hide the swaps" : "Swap for a bet at the same price";
    });
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
  const hit = event.target.closest && event.target.closest(".find-tray.find-locked :is(button.find-leg-to, .find-in button.find-name, .find-in button.find-out, .find-new-add, .find-undo button, .find-swap-add)");
  if (!hit) return;
  event.stopImmediatePropagation(); event.preventDefault();
}, true);

function trayLockEdit(box, key) {
  const old = typeof parlayLeg !== "undefined" && parlayLeg.get(key);
  if (!box || !old || !trayLockStarted([old])) return;
  const who = trayLockWho(old);
  const raw = String(old.label || "").split(/\s+—\s+/)[0].trim();
  const prop = who && raw.toLowerCase().startsWith(who.toLowerCase()) ? raw.slice(who.length).trim() : raw;
  const form = document.createElement("form");
  form.className = "find-lock-edit";
  const propBox = document.createElement("input");
  propBox.name = "prop";
  propBox.setAttribute("aria-label", "The prop you bet");
  propBox.placeholder = "The prop you bet";
  propBox.value = prop;
  const oddsBox = document.createElement("input");
  oddsBox.name = "odds";
  oddsBox.setAttribute("aria-label", "The price you bet");
  oddsBox.placeholder = "Price";
  oddsBox.inputMode = "decimal";
  oddsBox.value = Number(old.odds) > 0 ? `+${old.odds}` : String(old.odds || "");
  const go = document.createElement("button");
  go.type = "submit";
  go.textContent = "Use this";
  form.append(propBox, oddsBox, go);
  form.addEventListener("click", (event) => event.stopPropagation());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const said = propBox.value.trim();
    const odds = Number(String(oddsBox.value).trim().replace(/^\+/, ""));
    if (!said || !Number.isFinite(odds) || !odds) return;
    const label = who && !said.toLowerCase().startsWith(who.toLowerCase()) ? `${who} ${said}` : said;
    const next = { ...old, label, odds, market: said };
    parlayLeg.delete(key);
    parlayLeg.set(parlayKey(next), next);
    if (typeof legSwapOpen !== "undefined") legSwapOpen.delete(key);
    paintParlay();
  });
  box.append(form);
}

setInterval(() => { if (typeof parlayLeg !== "undefined" && parlayLeg.size && document.querySelector(".find-tray:not(.find-locked)") && trayLockStarted([...parlayLeg.values()])) trayLockPaint(); }, 30000);
