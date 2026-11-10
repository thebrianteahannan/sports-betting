/** Saved parlays on the search page. Kept on the membership, with this browser as a copy, so several can be built side by side on any device. */

const SAVE_KEY = "pod-saved-parlays", SAVE_WHO = "pod-saved-parlays-who";
window.parlayOpenId = window.parlayOpenId || "";
let saveSendTimer = 0;

function saveList() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch (error) { return []; }
}

function saveStore(list) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(list.slice(0, 20))); } catch (error) { console.log("[parlay-save] could not store", error); }
  saveSend(list.slice(0, 20));
}

function saveSend(list) {
  if (!window.saveWho) return;
  clearTimeout(saveSendTimer);
  saveSendTimer = setTimeout(() => fetch("/api/parlays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parlays: list }) }).catch((error) => console.log("[parlay-save] could not send", error)), 300);
}

async function saveSync() {
  try {
    const response = await fetch("/api/parlays");
    if (!response.ok) return;
    const { who, parlays } = await response.json();
    const local = saveList(), owner = localStorage.getItem(SAVE_WHO) || "";
    window.saveWho = who;
    localStorage.setItem(SAVE_WHO, who);
    if (!parlays.length && local.length && (!owner || owner === who)) { saveSend(local); return; }
    if (JSON.stringify(parlays) === JSON.stringify(local)) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(parlays));
    if (window.parlayOpenId && !parlays.some((row) => row.id === window.parlayOpenId)) window.parlayOpenId = "";
    if (document.querySelector(".find-board") && typeof paintParlay === "function") paintParlay();
  } catch (error) { console.log("[parlay-save] could not load", error); }
}

const saveWait = setInterval(() => { if (window.memberReady) { clearInterval(saveWait); saveSync(); } }, 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && window.memberReady) saveSync(); });

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
  (entry.legs || []).forEach((bet) => { const live = people.flatMap((who) => who.bets || []).find((row) => row.label === bet.label && row.market === bet.market && row.match === bet.match) || bet; parlayLeg.set(parlayKey(live), live); });
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
      save.textContent = save.title = same ? "Saved ✓" : open ? "Save changes" : "Save";
      save.classList.toggle("on", Boolean(same));
      save.addEventListener("click", () => { saveNow(); paintParlay(); });
      const edit = ticket.querySelector("button.find-edit");
      if (edit) edit.title = "Edit props";
      if (edit) edit.before(save); else ticket.append(save);
      if (edit && getComputedStyle(edit).position === "absolute") { save.classList.add("find-save-pin"); save.style.right = `${ticket.clientWidth - edit.offsetLeft + 6}px`; }
      const wipe = document.createElement("button");
      wipe.type = "button";
      wipe.className = "find-save find-save-wipe";
      wipe.textContent = "Delete";
      wipe.setAttribute("aria-label", "Delete this whole parlay"); wipe.title = "Delete this parlay";
      wipe.addEventListener("click", () => {
        if (window.parlayOpenId && saveList().some((row) => row.id === window.parlayOpenId) && !window.confirm("Delete this saved parlay?")) return;
        if (window.parlayOpenId) saveStore(saveList().filter((row) => row.id !== window.parlayOpenId));
        window.parlayOpenId = "";
        parlayPick.clear(); parlayLeg.clear();
        if (typeof trayRoster === "function") trayRoster();
        paintParlay();
      });
      save.before(wipe);
      if (save.classList.contains("find-save-pin")) { wipe.classList.add("find-save-pin"); wipe.style.right = `${ticket.clientWidth - save.offsetLeft + 6}px`; }
      const text = ticket.querySelector(":scope > b");
      if (wipe.classList.contains("find-save-pin") && text && (text.lastElementChild || text).getBoundingClientRect().right - text.getBoundingClientRect().left > wipe.offsetLeft - text.offsetLeft - 6) {
        save.style.top = wipe.style.top = `${edit.offsetHeight + 6}px`; save.style.right = "0px";
        wipe.style.right = `${ticket.clientWidth - save.offsetLeft + 6}px`;
        ticket.style.paddingBottom = `${edit.offsetHeight + 8}px`;
      } else if (wipe.classList.contains("find-save-pin")) ticket.style.paddingRight = `${ticket.clientWidth - wipe.offsetLeft + 6}px`;
    }
    const old = [...tray.parentElement.querySelectorAll(":scope > .find-saved")]; let box = old.shift(); old.forEach((node) => node.remove());
    if (!box) { box = document.createElement("div"); box.className = "find-saved"; } if (box.nextElementSibling !== tray) tray.before(box);
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

const saveScrollTop = new WeakMap(), saveAutoShut = new Set(); let saveFoldAt = 0;
function saveReopen(box) {
  if (box.scrollTop > 2 || Date.now() - saveFoldAt < 700) return;
  const shut = [...saveAutoShut].find((node) => node.isConnected && box.contains(node) && node.classList.contains("find-shut")); const fold = shut && shut.querySelector(".find-fold");
  if (fold) { saveAutoShut.delete(shut); fold.click(); }
}
document.addEventListener("wheel", (event) => { const box = event.deltaY < 0 && event.target.closest && event.target.closest("#desk-glass-in"); if (box) saveReopen(box); }, { passive: true });
document.addEventListener("scroll", (event) => {
  const box = event.target === document ? document.scrollingElement : event.target;
  if (!box || !box.querySelector || box.closest(".find-tray")) return;
  const top = box.scrollTop;
  saveReopen(box);
  if (!saveScrollTop.has(box) || top < saveScrollTop.get(box)) { saveScrollTop.set(box, top); return; }
  saveScrollTop.set(box, top);
  const board = box.querySelector(".find-board");
  if (!board || typeof whereFind !== "function" || !whereFind(board).startsWith("Search results")) return;
  const tray = box.querySelector(".find-tray:not([hidden]):not(.find-shut):not(.find-edit)");
  const fold = tray && tray.querySelector(".find-fold");
  if (!fold) return;
  let next = tray.nextElementSibling; while (next && !next.getClientRects().length) next = next.nextElementSibling;
  if (!next) return;
  const rect = tray.getBoundingClientRect(), at = next.getBoundingClientRect().top;
  const past = at <= rect.top + 1, stuck = at < rect.bottom - 1;
  const end = tray.scrollTop + tray.clientHeight >= tray.scrollHeight - 2, long = tray.scrollHeight > tray.clientHeight + 2;
  if (past || (stuck && long && end)) { saveFoldAt = Date.now(); fold.click(); saveAutoShut.add(tray); }
}, true);
document.addEventListener("click", (event) => { const fold = event.target.closest && event.target.closest(".find-fold"); if (!fold) return; if (event.isTrusted) saveAutoShut.delete(fold.closest(".find-tray")); for (let node = fold; node; node = node.parentElement) saveScrollTop.delete(node); }, true);
