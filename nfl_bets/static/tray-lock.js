// A started or finished game can still take a player. Type the price you got and lock it in.
// The open ticket can still be corrected: change the prop, type the price, or take a leg off.

let trayLockWas = null;
const trayLockAsk = new Set();
const legLock = new Set();

function legLockId(bet) {
  return [bet.label, bet.market, bet.match, bet.kickoff].join("|");
}

function legLockOn(bet) {
  return !!(bet && legLock.has(legLockId(bet)));
}

function legLockUse(legs) {
  legLock.clear();
  (legs || []).forEach((bet) => { if (bet && bet.held) legLock.add(legLockId(bet)); });
}

function legLockFlip(key) {
  const bet = parlayLeg.get(key);
  if (!bet) return;
  const id = legLockId(bet);
  if (legLock.has(id)) legLock.delete(id);
  else legLock.add(id);
  if (typeof saveNow === "function") saveNow();
  paintParlay();
}

function legDrop(key) {
  const bet = parlayLeg.get(key);
  if (legLockOn(bet)) return false;
  parlayLeg.delete(key);
  if (typeof legOwner !== "undefined") legOwner.delete(key);
  return true;
}

function legLockButtons() {
  if (!parlayLeg.size) { legLock.clear(); return; }
  document.querySelectorAll(".find-chose[data-key]").forEach((line) => {
    const key = line.dataset.key;
    const out = line.querySelector(":scope > button.find-out");
    if (out && !line.querySelector(":scope > button.find-leg-lock")) {
      const lock = document.createElement("button");
      lock.type = "button";
      lock.className = "find-leg-lock";
      lock.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        legLockFlip(line.dataset.key);
      });
      out.before(lock);
    }
    const on = legLockOn(parlayLeg.get(key));
    const lock = line.querySelector(":scope > button.find-leg-lock");
    if (lock) {
      lock.classList.toggle("on", on);
      lock.title = on ? "Locked in" : "Lock this leg in";
      lock.setAttribute("aria-label", lock.title);
      lock.setAttribute("aria-pressed", String(on));
    }
    if (out) {
      out.disabled = on;
      out.title = on ? "Locked in" : "";
    }
  });
}

window.legLockOn = legLockOn;
window.legLockUse = legLockUse;
window.legDrop = legDrop;

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
  const keys = [...parlayLeg.keys()];
  if (!trayLockWas) trayLockWas = new Set(keys);
  const added = keys.filter((key) => !trayLockWas.has(key)).map((key) => [key, parlayLeg.get(key)]);
  const finish = () => { trayLockWas = new Set(parlayLeg.keys()); };
  const open = typeof saveList === "function" && saveList().find((row) => row.id === window.parlayOpenId);
  if (open && parlayLeg.size && trayLockStarted(open.legs)) {
    const was = new Set(open.legs.map((bet) => parlayKey(bet)));
    const kept = [...was].every((key) => parlayLeg.has(key));
    const same = keys.length === was.size && keys.every((key) => was.has(key));
    if (same || !added.length || trayLockPropEdit(open)) { finish(); return; }
    if (kept) {
      added.forEach(([key, bet]) => { if (trayLockStarted([bet])) trayLockAsk.add(key); });
      finish();
      return;
    }
    console.log("[tray-lock] bet is locked, putting it back");
    const people = (document.querySelector(".find-board") || {}).people || [];
    parlayLeg.clear(); open.legs.forEach((bet) => parlayLeg.set(parlayKey(bet), bet));
    (open.picks || []).forEach((lite) => { if (!parlayPick.has(lite.key)) parlayPick.set(lite.key, people.find((who) => who.key === lite.key) || { ...lite, bets: [] }); });
    window.trayUndo = null;
    finish();
    return;
  }
  added.forEach(([key, bet]) => { if (bet && trayLockStarted([bet])) trayLockAsk.add(key); });
  finish();
}

function trayLockPrice(line, key) {
  const old = parlayLeg.get(key);
  if (!old) { trayLockAsk.delete(key); return; }
  const form = document.createElement("form");
  form.className = "find-lock-edit";
  const oddsBox = document.createElement("input");
  oddsBox.name = "odds";
  oddsBox.setAttribute("aria-label", "The price you got");
  oddsBox.placeholder = "Price you got, like -360";
  oddsBox.inputMode = "decimal";
  oddsBox.value = Number(old.odds) > 0 ? `+${old.odds}` : String(old.odds || "");
  const go = document.createElement("button");
  go.type = "submit";
  go.textContent = "Lock it in";
  form.append(oddsBox, go);
  form.addEventListener("click", (event) => event.stopPropagation());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const odds = Number(String(oddsBox.value).trim().replace(/^\+/, ""));
    if (!Number.isFinite(odds) || !odds) return;
    const next = { ...old, odds };
    const id = parlayKey(next);
    parlayLeg.delete(key);
    parlayLeg.set(id, next);
    if (typeof legOwner !== "undefined" && legOwner.has(key)) { legOwner.set(id, legOwner.get(key)); legOwner.delete(key); }
    if (trayLockWas) { trayLockWas.delete(key); trayLockWas.add(id); }
    trayLockAsk.delete(key);
    paintParlay();
  });
  line.append(form);
}

function trayLockPaint() {
  legLockButtons();
  const locked = trayLockStarted([...parlayLeg.values()]);
  const lockTip = "The game has started. Type the price you got, or take a leg off.";
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
  document.querySelectorAll(".find-chose[data-key]").forEach((line) => {
    if (!trayLockAsk.has(line.dataset.key) || line.querySelector(".find-lock-edit")) return;
    trayLockPrice(line, line.dataset.key);
  });
}

function trayLockHold(id) {
  if (trayLockWas && id) trayLockWas.add(id);
}

function trayLockPast(match, game) {
  if (!match || !game || !(game.final || trayLockStarted([game]))) return;
  const form = document.createElement("form");
  form.className = "find-lock-edit find-past-add";
  const who = document.createElement("input");
  who.name = "player";
  who.placeholder = "Player";
  who.setAttribute("aria-label", "Player");
  const prop = document.createElement("input");
  prop.name = "prop";
  prop.placeholder = "Prop you bet";
  prop.setAttribute("aria-label", "Prop you bet");
  const oddsBox = document.createElement("input");
  oddsBox.name = "odds";
  oddsBox.placeholder = "-360";
  oddsBox.setAttribute("aria-label", "The price you got");
  oddsBox.inputMode = "decimal";
  const go = document.createElement("button");
  go.type = "submit";
  go.textContent = "Lock it in";
  form.append(who, prop, oddsBox, go);
  form.addEventListener("click", (event) => event.stopPropagation());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = who.value.trim();
    const said = prop.value.trim();
    const odds = Number(String(oddsBox.value).trim().replace(/^\+/, ""));
    if (!name || !said || !Number.isFinite(odds) || !odds || typeof parlayLeg === "undefined") return;
    const label = said.toLowerCase().startsWith(name.toLowerCase()) ? said : `${name} ${said}`;
    const bet = { label, market: said, odds, match: game.match || "", kickoff: game.kickoff || "", sport: game.sport || "" };
    const id = parlayKey(bet);
    if (parlayLeg.has(id) || parlayLeg.size >= 8) return;
    const keyName = name.toLowerCase();
    if (typeof parlayPick !== "undefined" && !parlayPick.has(keyName) && parlayPick.size < 8) parlayPick.set(keyName, { key: keyName, name, kind: "player", bets: [] });
    if (typeof legOwner !== "undefined") legOwner.set(id, name);
    if (trayLockWas) trayLockWas.add(id);
    parlayLeg.set(id, bet);
    paintParlay();
    who.value = "";
    prop.value = "";
    oddsBox.value = "";
  });
  match.append(form);
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
