/** Saved parlays on the search page. Kept on the membership, with this browser as a copy, so several can be built side by side on any device. */

const SAVE_KEY = "pod-saved-parlays", SAVE_WHO = "pod-saved-parlays-who";
window.parlayOpenId = window.parlayOpenId || "";
let saveSendTimer = 0, saveHeld = "";

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
    if (window.parlayOpenId && !parlays.some((row) => row.id === window.parlayOpenId)) { window.parlayOpenId = ""; saveHeld = saveSig([...parlayLeg.values()]); }
    if (document.querySelector(".find-board") && typeof paintParlay === "function") paintParlay();
  } catch (error) { console.log("[parlay-save] could not load", error); }
}

const saveWait = setInterval(() => { if (window.memberReady) { clearInterval(saveWait); saveSync(); } }, 1000);

const saveGoId = (!new URLSearchParams(location.search).get("game") && new URLSearchParams(location.search).get("bet")) || "";
if (saveGoId) {
  window.deskGoing = true;
  history.replaceState(null, "", "/");
  let saveGoTries = 0, saveGoAsked = false;
  const saveGo = setInterval(() => {
    if (++saveGoTries > 80) { clearInterval(saveGo); console.log("[parlay-save] could not open bet", saveGoId); return; }
    if (!window.saveWho || typeof window.birdMenu !== "function") return;
    const board = document.querySelector(".find-board");
    if (!board) { if (!saveGoAsked) { saveGoAsked = true; birdMenu("find"); } return; }
    if (!(board.people || []).length && saveGoTries < 30) return;
    clearInterval(saveGo);
    saveOpen(saveGoId);
    document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (fold) { saveAutoShut.delete(tray); fold.click(); } });
  }, 250);
}

const saveSeek = new URLSearchParams(location.search), saveSeekGame = saveSeek.get("game") || "";
if (document.documentElement.classList.contains("desk-going")) {
  const born = Date.now();
  const reveal = setInterval(() => {
    if (!document.querySelector("#desk-glass-in .find-board") && !(Date.now() - born > 4000 && document.body.classList.contains("needs-member")) && Date.now() - born < 10000) return;
    clearInterval(reveal);
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("desk-going")));
  }, 100);
}
if (saveSeek.get("go") === "find") {
  window.deskGoing = true;
  history.replaceState(null, "", "/");
  const wait = setInterval(() => { if (!window.memberReady || typeof window.birdMenu !== "function") return; clearInterval(wait); birdMenu("find"); }, 250);
}
if (saveSeek.get("from") === "live") document.addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!event.target.closest || !event.target.closest("#desk-back") || !desk || desk.classList.contains("bird-on") || !document.querySelector("#desk-glass-in .find-board")) return;
  event.stopImmediatePropagation(); event.preventDefault(); window.location.href = "/live";
}, true);
if (saveSeekGame) {
  const bet = saveSeek.get("bet") || "", leg = `${saveSeek.get("label") || ""}|${saveSeek.get("market") || ""}`;
  window.deskGoing = true;
  history.replaceState(null, "", "/");
  let seekTries = 0, seekAsked = false, seekOpened = false;
  const seek = setInterval(() => {
    if (++seekTries > 160) { clearInterval(seek); console.log("[parlay-save] could not open game", saveSeekGame); return; }
    if (!window.memberReady || typeof window.birdMenu !== "function") return;
    const board = document.querySelector(".find-board");
    if (!board) { if (!seekAsked) { seekAsked = true; birdMenu("find"); } return; }
    if (!seekOpened) {
      if (!((window.state && state.board && state.board.games) || []).length && seekTries < 120) return;
      if (bet && (!window.saveWho || (!(board.people || []).length && seekTries < 40))) return;
      const hit = [...board.querySelectorAll('.find-games[data-span="today"] button, .find-games button')].find((node) => node.textContent.startsWith(saveSeekGame));
      if (!hit) return;
      seekOpened = true;
      if (bet) { saveOpen(bet); document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (fold) { saveAutoShut.delete(tray); fold.click(); } }); }
      hit.click();
      return;
    }
    const match = board.querySelector(".find-match");
    if (match && leg === "|") { clearInterval(seek); match.style.scrollMarginTop = "5.5rem"; if (typeof gameScrollTo === "function") gameScrollTo(match); else match.scrollIntoView({ block: "start" }); return; }
    const box = board.querySelector(".find-match > .find-bets");
    if (!box) return;
    clearInterval(seek);
    if (typeof scriptRecJump === "function") scriptRecJump(box.parentElement, (info) => String(info.legs || "").split("||").includes(leg)); else box.open = true;
    setTimeout(() => {
      const row = [...box.querySelectorAll(".find-script-leg")].find((node) => node.getClientRects().length && `${node.dataset.label}|${node.dataset.market}` === leg) || box;
      row.classList.add("find-flash"); setTimeout(() => row.classList.remove("find-flash"), 4400);
    }, 900);
  }, 250);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && window.memberReady) saveSync(); });

function saveSig(legs) {
  return legs.map((bet) => parlayKey(bet)).sort().join("~");
}

function saveNow() {
  if (!parlayLeg.size) return null;
  const list = saveList();
  const entry = { id: window.parlayOpenId || `p${Date.now()}`, at: Date.now(), legs: [...parlayLeg.values()], picks: [...parlayPick.values()].map(({ bets, ...rest }) => rest) };
  const at = list.findIndex((row) => row.id === entry.id);
  if (at >= 0 && list[at].group) entry.group = list[at].group;
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
  if (parlayLeg.size && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
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
  const known = saveList().flatMap((row) => row.picks || []);
  (entry.legs || []).forEach((bet) => { const label = String(bet.label || ""); if ([...parlayPick.values()].some((one) => one.name && label.startsWith(one.name))) return; const lite = known.find((one) => one.name && label.startsWith(one.name)); if (lite) parlayPick.set(lite.key, people.find((who) => who.key === lite.key) || { ...lite, bets: [] }); });
  (entry.legs || []).forEach((bet) => { const live = people.flatMap((who) => who.bets || []).find((row) => row.label === bet.label && row.market === bet.market && row.match === bet.match) || bet; parlayLeg.set(parlayKey(live), live); });
  window.parlayOpenId = id;
  if (typeof trayRoster === "function") trayRoster();
  paintParlay();
}

let saveDropAt = 0;

function saveDrop(id) {
  if (Date.now() - saveDropAt > 5 * 60 * 1000 && !window.confirm("Delete this saved parlay?")) return;
  saveDropAt = Date.now();
  saveStore(saveList().filter((row) => row.id !== id));
  if (window.parlayOpenId === id) { window.parlayOpenId = ""; parlayPick.clear(); parlayLeg.clear(); if (typeof trayRoster === "function") trayRoster(); }
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
  if (parlayLeg.size || parlayPick.size) document.querySelectorAll(".find-tips").forEach((node) => node.remove());
  else { const board = document.querySelector("#desk-glass-in .find-board"), input = board && board.querySelector("label.find input"); if (board && !board.tipsSeen && board.querySelector(":scope > .find-tray") && !(input && input.value.trim())) { board.tipsSeen = true; setTimeout(saveTips); } }
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
      const edit = ticket.querySelector("button.share-bet");
      if (!same) { if (edit) edit.before(save); else ticket.append(save); }
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
      const last = same ? edit : save;
      if (last) last.before(wipe); else ticket.append(wipe);
      const pin = () => {
        if (!edit || getComputedStyle(edit).position !== "absolute") return;
        if (!same) { save.classList.add("find-save-pin"); save.style.right = `${ticket.clientWidth - edit.offsetLeft + 6}px`; }
        wipe.classList.add("find-save-pin"); wipe.style.right = `${ticket.clientWidth - last.offsetLeft + 6}px`;
        const text = ticket.querySelector(":scope > b");
        if (text && (text.lastElementChild || text).getBoundingClientRect().right - text.getBoundingClientRect().left > wipe.offsetLeft - text.offsetLeft - 6) {
          save.style.top = wipe.style.top = `${edit.offsetHeight + 6}px`; save.style.right = "0px";
          wipe.style.right = same ? "0px" : `${ticket.clientWidth - save.offsetLeft + 6}px`;
          ticket.style.paddingBottom = `${edit.offsetHeight + 8}px`;
        } else ticket.style.paddingRight = `${ticket.clientWidth - wipe.offsetLeft + 6}px`;
      };
      const fold = tray.querySelector(".find-fold");
      if (edit && fold && !edit.getClientRects().length) fold.addEventListener("click", function later() { if (!edit.isConnected || edit.getClientRects().length) { fold.removeEventListener("click", later); if (edit.isConnected) pin(); } });
      else pin();
    }
    const say = !tray.hidden && tray.querySelector(".find-say");
    if (say && !say.querySelector("button.find-close")) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "find-close";
      close.textContent = "×";
      close.setAttribute("aria-label", "Close this parlay"); close.title = "Close this parlay";
      close.addEventListener("click", saveNew);
      say.append(close);
    }
    const old = [...tray.parentElement.querySelectorAll(":scope > .find-saved")]; let box = old.shift(); old.forEach((node) => node.remove());
    if (!box) { box = document.createElement("div"); box.className = "find-saved"; } if (box.nextElementSibling !== tray) tray.before(box);
    box.replaceChildren();
    box.hidden = false; box.classList.toggle("find-saved-gone", !!window.saveGone);
    const back = document.createElement("button"); back.type = "button"; back.className = "find-saved-back"; back.textContent = `My bets (${list.length}) ▾`;
    back.addEventListener("click", () => { window.saveGone = false; paintParlay(); }); box.append(back);
    if (window.saveShut === undefined) window.saveShut = localStorage.getItem("savedShut") === "1";
    box.classList.toggle("find-saved-shut", window.saveShut);
    const head = document.createElement("p"); head.className = "find-say"; head.textContent = "MY BETS";
    const fold = document.createElement("button"); fold.type = "button"; fold.className = "find-fold"; fold.textContent = window.saveShut ? `Show ${list.length} parlay${list.length === 1 ? "" : "s"} ▾` : "Hide ▴";
    fold.addEventListener("click", () => { window.saveShut = !window.saveShut; try { localStorage.setItem("savedShut", window.saveShut ? "1" : "0"); } catch (error) { console.log("[parlay-save] could not keep fold", error); } paintParlay(); });
    const shut = document.createElement("button"); shut.type = "button"; shut.className = "find-close"; shut.textContent = "×"; shut.title = "Close saved parlays"; shut.setAttribute("aria-label", shut.title);
    shut.addEventListener("click", () => { window.saveGone = true; box.classList.add("find-saved-gone"); });
    head.append(fold, shut); box.append(head);
    const stacks = document.createDocumentFragment(), groups = new Map();
    list.forEach((row) => {
      const chip = document.createElement("span");
      chip.className = "find-saved-chip"; chip.dataset.id = row.id;
      chip.classList.toggle("on", row.id === window.parlayOpenId);
      const go = document.createElement("button");
      go.type = "button";
      const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
      const who = (row.picks || []).map((lite) => String(lite.name || "").split(" ").pop()).filter(Boolean);
      const said = who.length ? `${who.slice(0, 2).join(", ")}${row.legs.length > 2 ? ` +${row.legs.length - 2}` : ""}` : row.group && row.legs.length < 3 ? row.legs.map((bet) => String(bet.label || "").replace(/\s+spread$/i, "")).join(", ") : `${row.legs.length} ${row.legs.length === 1 ? "leg" : "legs"}`;
      go.innerHTML = [games && `<i>${esc(games)}</i>`, `<span>${esc(said)}</span>`, savePrice(row.legs) && `<b>${esc(savePrice(row.legs))}</b>`].filter(Boolean).join("");
      go.addEventListener("click", () => { if (row.id === window.parlayOpenId) { saveNew(); return; } saveOpen(row.id); document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (!fold) return; saveAutoShut.delete(tray); fold.click(); }); });
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "find-saved-x";
      drop.textContent = "×";
      drop.setAttribute("aria-label", "Delete this saved parlay");
      drop.addEventListener("click", () => saveDrop(row.id));
      chip.append(go, drop);
      if (!row.group || !row.group.id) { box.append(chip); return; }
      if (!groups.has(row.group.id)) {
        const wrap = document.createElement("span");
        wrap.className = "find-saved-group";
        const name = document.createElement("b");
        name.textContent = row.group.name || "Stack";
        const wipe = document.createElement("button");
        wipe.type = "button";
        wipe.className = "find-saved-x";
        wipe.textContent = "×";
        wipe.setAttribute("aria-label", "Delete this whole stack");
        wipe.addEventListener("click", () => { const ids = saveList().filter((one) => one.group && one.group.id === row.group.id).map((one) => one.id); if (ids.includes(window.parlayOpenId)) { window.parlayOpenId = ""; parlayPick.clear(); parlayLeg.clear(); if (typeof trayRoster === "function") trayRoster(); } saveStore(saveList().filter((one) => !ids.includes(one.id))); paintParlay(); });
        wrap.append(name, wipe);
        groups.set(row.group.id, wrap);
        stacks.append(wrap);
      }
      groups.get(row.group.id).append(chip);
    });
    const fresh = document.createElement("button");
    fresh.type = "button";
    fresh.className = "find-saved-new";
    fresh.textContent = "+ New bet";
    fresh.addEventListener("click", () => { const input = document.querySelector("label.find input"); saveNew(); if (input) input.focus(); if (!parlayLeg.size && !parlayPick.size && !(input && input.value.trim())) saveTips(); });
    head.insertBefore(fresh, fold);
    if (!groups.size) return;
    const top = document.createElement("p");
    top.textContent = "Saved stacks";
    stacks.prepend(top);
    box.insertBefore(stacks, box.querySelector(":scope > .find-saved-stacks"));
  });
}

function saveStacks(box) {
  const go = document.createElement("button");
  go.type = "button";
  go.className = "find-saved-st";
  go.textContent = window.saveStacksOpen ? "Hide strategies" : "Strategies";
  go.setAttribute("aria-expanded", String(Boolean(window.saveStacksOpen)));
  go.addEventListener("click", () => { window.saveStacksOpen = !window.saveStacksOpen; paintParlay(); });
  box.append(go);
  if (!window.saveStacksOpen || typeof paintGameStacks !== "function") return;
  const picked = saveStacksPicked(), teams = document.querySelector("#desk-glass-in .find-teams");
  if (teams && !teams.stackWatch) {
    teams.stackWatch = true;
    new MutationObserver(() => { const panel = window.saveStacksPanel; if (window.saveStacksOpen && panel && panel.isConnected && panel.dataset.picked !== saveStacksPicked()) saveStacksSync(); }).observe(teams, { childList: true, subtree: true });
  }
  const games = picked ? [picked] : [...new Set([...parlayLeg.values()].map((bet) => bet.match).filter(Boolean))];
  const key = `${picked ? "pick:" : ""}${games.join("|")}`, kept = window.saveStacksPanel;
  if (kept && kept.dataset.key === key) { box.append(kept); return; }
  const panel = document.createElement("div");
  panel.className = "find-saved-stacks";
  panel.dataset.key = key;
  panel.dataset.picked = picked;
  if (!games.length) {
    const host = document.createElement("div");
    host.className = "find-stack-host";
    panel.append(host);
    paintGameStacks(host, { match: "" });
    const open = host.querySelector("details");
    if (open) { open.open = true; open.querySelector("summary b").textContent = "Parlay strategies for every game"; }
  }
  games.forEach((match) => {
    const host = document.createElement("div");
    host.className = "find-stack-host";
    panel.append(host);
    paintGameStacks(host, { match });
    const open = host.querySelector("details");
    if (!open) return;
    open.open = true;
    if (games.length > 1) open.querySelector("summary b").textContent = `Parlay strategies for ${typeof gameShort === "function" ? gameShort(match) : match}`;
  });
  window.saveStacksPanel = panel;
  box.append(panel);
}

function saveStacksPicked() {
  const box = [...document.querySelectorAll("#desk-glass-in .find-teams .find-stacks[data-match]")].pop();
  return box ? box.dataset.match : "";
}

function saveStacksSync() {
  const box = document.querySelector("#desk-glass-in .find-saved");
  const go = box && box.querySelector(":scope > .find-saved-st");
  if (!go) return;
  const old = box.querySelector(":scope > .find-saved-stacks"), spot = document.createComment(""), temp = document.createElement("div");
  if (old) old.replaceWith(spot); else box.append(spot);
  saveStacks(temp);
  const [fresh, panel] = [...temp.children];
  go.replaceWith(fresh);
  if (panel) spot.replaceWith(panel); else spot.remove();
}

if (typeof paintParlay === "function") {
  const paintParlayBase = paintParlay;
  paintParlay = function () {
    paintParlayBase.apply(this, arguments);
    const sig = saveSig([...parlayLeg.values()]), open = saveList().find((row) => row.id === window.parlayOpenId);
    if (parlayLeg.size && sig !== saveHeld && (!open || saveSig(open.legs) !== sig)) { saveHeld = ""; saveNow(); }
    savePaint();
  };
}

const saveScrollTop = new WeakMap(), saveAutoShut = new Set(); let saveFoldAt = 0;
function saveReopen(box) {
  if (box.scrollTop > 2 || Date.now() - saveFoldAt < 700 || (box !== document.scrollingElement && !/auto|scroll/.test(getComputedStyle(box).overflowY))) return;
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
document.addEventListener("click", (event) => {
  const go = event.target.closest && event.target.closest(".find-games-go");
  if (!go || !window.saveStacksOpen) return;
  window.saveStacksOpen = false;
  paintParlay();
  setTimeout(() => { const span = document.querySelector("#desk-glass-in .find-span"); if (span) span.scrollIntoView({ block: "start", behavior: "smooth" }); }, 50);
});
document.addEventListener("click", (event) => { const fold = event.target.closest && event.target.closest(".find-fold"); if (!fold) return; if (event.isTrusted) saveAutoShut.delete(fold.closest(".find-tray")); for (let node = fold; node; node = node.parentElement) saveScrollTop.delete(node); }, true);

let saveTipTimer = 0;
const SAVE_TIPS = ["Search a player, team or game in <b data-tip=\"search\">the box up top</b>.", "Want a game? Tap <b data-tip=\"games\">The Games</b> and pick one.", "Got a bet already? Tap <b data-tip=\"paste\">Paste a bet</b> and drop in a screenshot from your betting app or from a friend."];

function saveTips() {
  clearTimeout(saveTipTimer); document.querySelectorAll(".find-tips").forEach((node) => node.remove());
  const tray = document.querySelector("#desk-glass-in .find-board > .find-tray");
  if (!tray) return;
  const tips = document.createElement("div"); tips.className = "find-tips"; tips.innerHTML = `<img src="/scene/parrot-head-tight.webp?v=1" alt=""><div></div>`; tray.after(tips);
  const say = tips.lastElementChild; let line = 0, at = 0, row = null;
  const step = () => {
    if (!tips.isConnected) return;
    const html = SAVE_TIPS[line], text = html.replace(/<[^>]+>/g, "");
    if (!row) { row = document.createElement("p"); say.append(row); }
    at += 1; row.textContent = text.slice(0, at);
    if (at < text.length) { saveTipTimer = setTimeout(step, 22); return; }
    row.innerHTML = html; row = null; at = 0; line += 1;
    if (line < SAVE_TIPS.length) saveTipTimer = setTimeout(step, 450); else tips.classList.add("done");
  };
  step();
}

document.addEventListener("click", (event) => {
  const tip = event.target.closest && event.target.closest(".find-tips [data-tip]");
  if (!tip) return;
  const want = tip.dataset.tip, go = document.querySelector(want === "games" ? "#desk-glass-in .find-games-go" : want === "paste" ? "#desk-glass-in .find-shot" : "#desk-glass-in label.find input");
  if (go && want === "search") go.focus(); else if (go) go.click();
});
document.addEventListener("input", (event) => { if (event.target.closest && event.target.closest("label.find")) document.querySelectorAll(".find-tips").forEach((node) => node.remove()); });
