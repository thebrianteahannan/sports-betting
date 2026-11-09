/** Saved parlays on the search page. Kept in this browser so several can be built side by side. */

const SAVE_KEY = "pod-saved-parlays";
window.parlayOpenId = window.parlayOpenId || "";

function saveList() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch (error) { return []; }
}

function saveStore(list) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(list.slice(0, 20))); } catch (error) { console.log("[parlay-save] could not store", error); }
}

function saveSig(legs) {
  return legs.map((bet) => parlayKey(bet)).sort().join("~");
}

function saveNow() {
  if (!parlayLeg.size) return null;
  const list = saveList();
  const entry = { id: window.parlayOpenId || `p${Date.now()}`, at: Date.now(), legs: [...parlayLeg.values()], picks: [...parlayPick.values()].map(({ bets, ...rest }) => rest) };
  const at = list.findIndex((row) => row.id === entry.id);
  if (at >= 0) list[at] = entry; else list.unshift(entry);
  saveStore(list);
  window.parlayOpenId = entry.id;
  return entry;
}

function saveDetach() {
  const open = saveList().find((row) => row.id === window.parlayOpenId);
  if (open && parlayLeg.size && saveSig(open.legs) !== saveSig([...parlayLeg.values()])) saveNow();
  window.parlayOpenId = "";
}

function saveLeave() {
  if (parlayLeg.size) saveNow();
  window.parlayOpenId = "";
}

function saveOpen(id) {
  const entry = saveList().find((row) => row.id === id);
  if (!entry || id === window.parlayOpenId) return;
  saveLeave();
  const board = document.querySelector(".find-board");
  const people = (board && board.people) || [];
  parlayPick.clear(); parlayLeg.clear();
  (entry.picks || []).forEach((lite) => { const live = people.find((who) => who.key === lite.key) || { ...lite, bets: [] }; parlayPick.set(live.key, live); });
  (entry.legs || []).forEach((bet) => { const live = people.flatMap((who) => who.bets || []).find((row) => row.label === bet.label && row.match === bet.match) || bet; parlayLeg.set(parlayKey(live), live); });
  window.parlayOpenId = id;
  if (typeof trayRoster === "function") trayRoster();
  paintParlay();
}

function saveDrop(id) {
  saveStore(saveList().filter((row) => row.id !== id));
  if (window.parlayOpenId === id) window.parlayOpenId = "";
  paintParlay();
}

function saveNew() {
  saveLeave();
  parlayPick.clear(); parlayLeg.clear();
  if (typeof trayRoster === "function") trayRoster();
  paintParlay();
}

function savePrice(legs) {
  const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
  if (!(dec > 1)) return "";
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  return price > 0 ? `+${price}` : String(price);
}

function savePaint() {
  const list = saveList();
  const open = list.find((row) => row.id === window.parlayOpenId);
  const same = open && saveSig(open.legs) === saveSig([...parlayLeg.values()]);
  document.querySelectorAll(".find-tray").forEach((tray) => {
    const ticket = tray.querySelector(".find-ticket");
    if (ticket && parlayLeg.size && !tray.querySelector("button.find-save")) {
      const save = document.createElement("button");
      save.type = "button";
      save.className = "find-save";
      save.textContent = same ? "Saved ✓" : open ? "Save changes" : "Save";
      save.classList.toggle("on", Boolean(same));
      save.addEventListener("click", () => { saveNow(); paintParlay(); });
      const edit = ticket.querySelector("button.find-edit");
      if (edit) edit.before(save); else ticket.append(save);
      if (edit && getComputedStyle(edit).position === "absolute") { save.classList.add("find-save-pin"); save.style.right = `${ticket.clientWidth - edit.offsetLeft + 6}px`; }
      const wipe = document.createElement("button");
      wipe.type = "button";
      wipe.className = "find-save find-save-wipe";
      wipe.textContent = "Delete";
      wipe.setAttribute("aria-label", "Delete this whole parlay");
      wipe.addEventListener("click", () => {
        if (!wipe.classList.contains("sure")) { wipe.classList.add("sure"); wipe.textContent = "Delete?"; setTimeout(() => { if (wipe.isConnected) { wipe.classList.remove("sure"); wipe.textContent = "Delete"; } }, 3000); return; }
        if (window.parlayOpenId) saveStore(saveList().filter((row) => row.id !== window.parlayOpenId));
        window.parlayOpenId = "";
        parlayPick.clear(); parlayLeg.clear();
        if (typeof trayRoster === "function") trayRoster();
        paintParlay();
      });
      save.before(wipe);
      if (save.classList.contains("find-save-pin")) { wipe.classList.add("find-save-pin"); wipe.style.right = `${ticket.clientWidth - save.offsetLeft + 6}px`; }
    }
    let box = tray.previousElementSibling;
    if (!box || !box.classList.contains("find-saved")) { box = document.createElement("div"); box.className = "find-saved"; tray.before(box); }
    box.replaceChildren();
    box.hidden = !list.length && !parlayLeg.size;
    if (box.hidden) return;
    if (list.length) { const head = document.createElement("p"); head.textContent = "Saved parlays"; box.append(head); }
    list.forEach((row) => {
      const chip = document.createElement("span");
      chip.className = "find-saved-chip";
      chip.classList.toggle("on", row.id === window.parlayOpenId);
      const go = document.createElement("button");
      go.type = "button";
      const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
      const who = (row.picks || []).map((lite) => String(lite.name || "").split(" ").pop()).filter(Boolean);
      const said = who.length ? `${who.slice(0, 2).join(", ")}${row.legs.length > 2 ? ` +${row.legs.length - 2}` : ""}` : `${row.legs.length} ${row.legs.length === 1 ? "leg" : "legs"}`;
      go.innerHTML = [games && `<i>${esc(games)}</i>`, `<span>${esc(said)}</span>`, savePrice(row.legs) && `<b>${esc(savePrice(row.legs))}</b>`].filter(Boolean).join("");
      go.addEventListener("click", () => saveOpen(row.id));
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "find-saved-x";
      drop.textContent = "×";
      drop.setAttribute("aria-label", "Delete this saved parlay");
      drop.addEventListener("click", () => saveDrop(row.id));
      chip.append(go, drop);
      box.append(chip);
    });
    if (parlayLeg.size) {
      const fresh = document.createElement("button");
      fresh.type = "button";
      fresh.className = "find-saved-new";
      fresh.textContent = "+ New parlay";
      fresh.addEventListener("click", saveNew);
      box.append(fresh);
    }
  });
}

if (typeof paintParlay === "function") {
  const paintParlayBase = paintParlay;
  paintParlay = function () { paintParlayBase.apply(this, arguments); savePaint(); };
}
