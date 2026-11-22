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
if (saveSeek.get("go") === "rec") {
  window.deskGoing = true;
  const tab = saveSeek.get("tab") || "";
  history.replaceState(null, "", "/");
  const wait = setInterval(() => {
    if (!window.memberReady || typeof window.birdMenu !== "function") return;
    clearInterval(wait);
    if (tab === "stats") startTab = "stats";
    birdMenu("rec");
  }, 250);
}
if (saveSeek.get("go") === "manage") {
  window.deskGoing = true;
  history.replaceState(null, "", "/");
  window.saveGone = false;
  window.saveShut = false;
  const wait = setInterval(() => { if (!window.memberReady || typeof window.birdMenu !== "function") return; clearInterval(wait); birdMenu("find"); }, 250);
}
if (saveSeek.get("td") === "1") {
  window.deskGoing = true;
  history.replaceState(null, "", "/");
  let tdTries = 0, tdAsked = false;
  const waitTd = setInterval(() => {
    if (++tdTries > 160) { clearInterval(waitTd); console.log("[parlay-save] could not open anytime TDs"); return; }
    if (!window.memberReady || typeof window.birdMenu !== "function") return;
    const desk = document.getElementById("desk");
    if (!desk || !desk.classList.contains("tv-full")) { if (typeof goFull === "function") goFull(); return; }
    const board = document.querySelector("#desk-glass-in .find-board");
    if (!board) { if (!tdAsked) { tdAsked = true; birdMenu("find"); } return; }
    if (typeof startTdGo !== "function") return;
    if (!(board.people || []).some((person) => person.kind === "player" && (person.bets || []).length)) return;
    clearInterval(waitTd);
    startTdGo(board);
  }, 250);
}
if (saveSeek.get("from") === "live") document.addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!event.target.closest || !event.target.closest("#desk-back") || !desk || desk.classList.contains("bird-on") || !document.querySelector("#desk-glass-in .find-board")) return;
  event.stopImmediatePropagation(); event.preventDefault(); window.location.href = "/live";
}, true);
function seekPaintGame(board, want, sport, kick, espn) {
  const same = (match) => match === want || (typeof findSameGame === "function" && findSameGame(match, want));
  const posted = ((window.state && state.board && state.board.games) || []).find((row) => row && same(row.match) && (!sport || !row.sport || row.sport === sport));
  let fromBet = null;
  (board.people || []).forEach((person) => (person.bets || []).forEach((row) => {
    if (!row || !row.match || !same(row.match) || (sport && row.sport && row.sport !== sport)) return;
    if (!fromBet || Date.parse(row.kickoff || "") > Date.parse(fromBet.kickoff || "")) fromBet = row;
  }));
  const game = posted
    ? { ...posted, espnId: posted.espnId || espn || "" }
    : fromBet
      ? { ...fromBet, sport: fromBet.sport || sport, kickoff: fromBet.kickoff || kick, espnId: espn || "" }
      : { match: want, sport, kickoff: kick, espnId: espn };
  const teams = board.querySelector(":scope > .find-teams");
  const list = board.querySelector(":scope > .find-list");
  const hits = board.querySelector(":scope > .find-hits:not(.find-tray)");
  const span = board.querySelector(":scope > .find-span");
  if (!teams || !list || typeof paintMatch !== "function") return false;
  if (hits) hits.replaceChildren();
  teams.replaceChildren();
  list.replaceChildren();
  list.classList.remove("find-only-on");
  if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
  paintMatch(teams, game, board.people || [], list, hits, true);
  const shown = teams.querySelector(".find-match");
  if (shown && !shown.querySelector(".find-side-go")) {
    let when = shown.querySelector(".find-when");
    if (!when) { when = document.createElement("p"); when.className = "find-when"; shown.prepend(when); }
    if (game.match && !when.textContent.includes(game.match)) when.textContent = [game.match, when.textContent].filter(Boolean).join(" · ");
    const brief = teams.querySelector(".find-brief");
    if (brief) brief.open = true;
  }
  return true;
}

if (saveSeekGame) {
  const bet = saveSeek.get("bet") || "", leg = `${saveSeek.get("label") || ""}|${saveSeek.get("market") || ""}`;
  const seekSport = saveSeek.get("sport") || "", seekKick = saveSeek.get("kick") || "", seekEspn = saveSeek.get("espn") || "";
  window.deskGoing = true;
  history.replaceState(null, "", "/");
  let seekTries = 0, seekAsked = false, seekOpened = false;
  const seek = setInterval(() => {
    if (++seekTries > 160) { clearInterval(seek); console.log("[parlay-save] could not open game", saveSeekGame); return; }
    if (!window.memberReady || typeof window.birdMenu !== "function") return;
    const board = document.querySelector(".find-board");
    if (!board) { if (!seekAsked) { seekAsked = true; birdMenu("find"); } return; }
    if (!seekOpened) {
      if (board.querySelector(".bet-load")) return;
      if (!(board.people || []).length && seekTries < 40) return;
      if (bet && !window.saveWho && seekTries < 40) return;
      const hit = [...board.querySelectorAll(".find-games button")].find((node) => {
        const name = String(node.textContent || "").split(",")[0];
        return String(node.textContent || "").startsWith(saveSeekGame) || (typeof findSameGame === "function" && findSameGame(name, saveSeekGame));
      });
      if (!hit && !((window.state && state.board && state.board.games) || []).length && seekTries < 80 && !seekEspn) return;
      seekOpened = true;
      if (bet) { saveOpen(bet); document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (fold) { saveAutoShut.delete(tray); fold.click(); } }); }
      if (hit) hit.click();
      else seekPaintGame(board, saveSeekGame, seekSport, seekKick, seekEspn);
      return;
    }
    const match = board.querySelector(".find-match");
    if (match && bet) {
      clearInterval(seek);
      const glass = document.getElementById("desk-glass-in");
      let stay = true;
      const stop = () => { stay = false; };
      ["wheel", "touchstart", "keydown"].forEach((kind) => window.addEventListener(kind, stop, { passive: true, once: true }));
      const top = () => { if (stay && glass) glass.scrollTop = 0; };
      top();
      [400, 900, 1600].forEach((ms) => setTimeout(top, ms));
      document.querySelectorAll(".find-tray.find-shut").forEach((tray) => { const fold = tray.querySelector(".find-fold"); if (fold) { saveAutoShut.delete(tray); fold.click(); } });
      return;
    }
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

function parlayStakeOf() {
  const n = Number(window.parlayStake);
  if (n > 0) return n;
  const row = window.parlayOpenId && saveList().find((one) => one.id === window.parlayOpenId);
  return Number(row && row.stake) > 0 ? Number(row.stake) : 5;
}

function parlayStakeSet(amount) {
  window.parlayStake = Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5;
  if (parlayLeg.size) saveNow();
  return window.parlayStake;
}

function saveNow() {
  if (!parlayLeg.size) return null;
  const list = saveList();
  const entry = { id: window.parlayOpenId || `p${Date.now()}`, at: Date.now(), legs: [...parlayLeg.values()], picks: [...parlayPick.values()].map(({ bets, ...rest }) => rest) };
  const at = list.findIndex((row) => row.id === entry.id);
  if (at >= 0 && list[at].group) entry.group = list[at].group;
  if (at >= 0 && list[at].locked) {
    entry.locked = true;
    if (list[at].lockedAt) entry.lockedAt = list[at].lockedAt;
    entry.lockedOdds = list[at].lockedOdds || savePrice(entry.legs) || "";
  }
  const stake = Number(window.parlayStake) > 0 ? Number(window.parlayStake) : (at >= 0 && Number(list[at].stake)) || 5;
  entry.stake = stake;
  window.parlayStake = stake;
  if (at >= 0) list[at] = entry; else list.unshift(entry);
  saveStore(list);
  window.parlayOpenId = entry.id;
  return entry;
}

function savePatch(id, patch) {
  const list = saveList();
  const at = list.findIndex((row) => row.id === id);
  if (at < 0) return null;
  list[at] = { ...list[at], ...patch };
  saveStore(list);
  return list[at];
}

function saveLock(id) {
  const list = saveList();
  const row = list.find((item) => item.id === id);
  if (!row || !(row.legs || []).length) return null;
  row.locked = true;
  row.lockedAt = Date.now();
  row.lockedOdds = savePrice(row.legs) || "";
  saveStore(list);
  return row;
}

function saveUnlock(id) {
  const list = saveList();
  const row = list.find((item) => item.id === id);
  if (!row) return null;
  delete row.locked;
  delete row.lockedAt;
  delete row.lockedOdds;
  saveStore(list);
  return row;
}

function saveLegPatch(id, legIndex, patch) {
  const list = saveList();
  const row = list.find((item) => item.id === id);
  if (!row || !Array.isArray(row.legs) || !row.legs[legIndex]) return null;
  row.legs[legIndex] = { ...row.legs[legIndex], ...patch };
  if (row.locked) row.lockedOdds = savePrice(row.legs) || row.lockedOdds || "";
  saveStore(list);
  return row;
}

window.savePatch = savePatch;
window.saveLock = saveLock;
window.saveUnlock = saveUnlock;
window.saveLegPatch = saveLegPatch;

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
  (entry.picks || []).forEach((lite) => { const bare = String(lite.key || "").replace(/[\s\-–—:]+$/, ""), live = people.find((who) => who.key === lite.key || who.key === bare) || { ...lite, bets: [] }; parlayPick.set(live.key, live); });
  const known = saveList().flatMap((row) => row.picks || []);
  (entry.legs || []).forEach((bet) => { const label = String(bet.label || ""); if ([...parlayPick.values()].some((one) => one.name && label.startsWith(one.name))) return; const lite = known.find((one) => one.name && label.startsWith(one.name)); if (lite) parlayPick.set(lite.key, people.find((who) => who.key === lite.key) || { ...lite, bets: [] }); });
  (entry.legs || []).forEach((bet) => {
    const live = entry.locked ? bet : (people.flatMap((who) => who.bets || []).find((row) => row.label === bet.label && row.market === bet.market && row.match === bet.match) || bet);
    parlayLeg.set(parlayKey(live), live);
  });
  window.parlayOpenId = id;
  window.parlayStake = Number(entry.stake) > 0 ? Number(entry.stake) : 5;
  saveCollapseForBet();
  if (typeof trayRoster === "function") trayRoster();
  paintParlay();
}

let saveDropAt = 0;

function saveDrop(id) {
  if (Date.now() - saveDropAt > 5 * 60 * 1000 && !window.confirm("Delete this saved parlay?")) return;
  saveDropAt = Date.now();
  saveStore(saveList().filter((row) => row.id !== id));
  if (window.parlayOpenId === id) { window.parlayOpenId = ""; window.parlayStake = 5; parlayPick.clear(); parlayLeg.clear(); if (typeof trayRoster === "function") trayRoster(); }
  paintParlay();
}

function saveNew() {
  saveLeave();
  parlayPick.clear(); parlayLeg.clear();
  window.parlayStake = 5;
  if (typeof trayRoster === "function") trayRoster();
  paintParlay();
}

function savePrice(legs) {
  const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
  if (!(dec > 1)) return "";
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  return price > 0 ? `+${price}` : String(price);
}

function saveChipSaid(row) {
  const who = (row.picks || []).map((lite) => String(lite.name || "").replace(/[\s\-–—:]+$/, "").split(" ").pop()).filter(Boolean);
  if (who.length) return `${who.slice(0, 2).join(", ")}${row.legs.length > 2 ? ` +${row.legs.length - 2}` : ""}`;
  if (row.group && row.legs.length < 3) return row.legs.map((bet) => String(bet.label || "").replace(/\s+spread$/i, "")).join(", ");
  return `${row.legs.length} ${row.legs.length === 1 ? "leg" : "legs"}`;
}

function saveMoneySaid(n) {
  const v = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(v)) return "";
  return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2);
}

function saveRowStake(row) {
  return Number(row && row.stake) > 0 ? Number(row.stake) : 5;
}

function saveRowWin(row) {
  const price = savePrice(row.legs || []);
  const n = Number(String(price).replace("+", ""));
  const stake = saveRowStake(row);
  if (!Number.isFinite(n) || !n || !(stake > 0)) return 0;
  return Math.round(stake * (n < 0 ? 100 / -n : n / 100) * 100) / 100;
}

function savePackTally(list) {
  const rows = (list || []).filter((row) => (row.legs || []).length);
  return {
    n: rows.length,
    stake: Math.round(rows.reduce((sum, row) => sum + saveRowStake(row), 0) * 100) / 100,
    profit: Math.round(rows.reduce((sum, row) => sum + saveRowWin(row), 0) * 100) / 100,
  };
}

function saveAllShareTicket(rows) {
  const legs = (rows || []).filter((row) => (row.legs || []).length).map((row) => {
    const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
    const price = savePrice(row.legs), n = Number(String(price).replace("+", ""));
    const stake = saveRowStake(row);
    const pct = Number.isFinite(n) && typeof findPct === "function" ? findPct(n) : "";
    const cash = Number.isFinite(n) && n && typeof findCash === "function" ? findCash(n, stake) : "";
    return { label: saveChipSaid(row), odds: Number.isFinite(n) ? n : 0, pct, cash, stake, form: games || (row.legs.length > 1 ? `${row.legs.length}-leg` : ""), kickoff: (row.legs[0] || {}).kickoff || "" };
  });
  const tally = savePackTally(rows);
  return { title: "My bets", american: "", impliedPct: "", legs, card: "mine", pack: true, stake: tally.stake, profit: tally.profit };
}

function savePaint() {
  if (parlayLeg.size || parlayPick.size) document.querySelectorAll(".find-tips").forEach((node) => node.remove());
  else {
    const board = document.querySelector("#desk-glass-in .find-board");
    if (board && !board.tipsSeen && board.querySelector(":scope > .find-tray")) {
      board.tipsSeen = true;
      setTimeout(saveTips);
    }
  }
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
      close.addEventListener("click", () => { saveBetsRest(); saveNew(); });
      say.append(close);
    }
    const board = tray.closest(".find-board");
    if (board && (board.dataset.page === "rec" || board.classList.contains("find-rec-page"))) {
      tray.parentElement.querySelectorAll(":scope > .find-saved").forEach((node) => node.remove());
      return;
    }
    const old = [...tray.parentElement.querySelectorAll(":scope > .find-saved")]; let box = old.shift(); old.forEach((node) => node.remove());
    if (!box) { box = document.createElement("div"); box.className = "find-saved"; } if (box.nextElementSibling !== tray) tray.before(box);
    box.replaceChildren();
    box.hidden = false; box.classList.toggle("find-saved-gone", !!window.saveGone);
    const back = document.createElement("button"); back.type = "button"; back.className = "find-saved-back"; back.textContent = `My bets (${list.length}) ▾`;
    back.addEventListener("click", () => { window.saveGone = false; paintParlay(); }); box.append(back);
    if (window.saveShut === undefined) window.saveShut = localStorage.getItem("savedShut") === "1";
    const betOpen = saveBetOpen(tray);
    if (betOpen && !window.savePeek) window.saveShut = true;
    if (!betOpen) window.savePeek = false;
    const peeking = betOpen && !!window.savePeek;
    const folded = betOpen ? !window.savePeek : !!window.saveShut;
    box.classList.toggle("find-saved-shut", folded);
    box.classList.toggle("find-saved-slim", betOpen || folded);
    box.classList.toggle("find-saved-panel", peeking);
    const head = document.createElement("p"); head.className = "find-say";
    const title = document.createElement("b"); title.className = "find-saved-title"; title.textContent = "MY BETS"; head.append(title);
    const tally = savePackTally(list);
    if (tally.n) {
      const pay = document.createElement("span");
      pay.className = "find-saved-pay";
      pay.innerHTML = `<i class="pay">$${esc(saveMoneySaid(tally.stake))}</i> · profits <i class="pay">$${esc(saveMoneySaid(tally.profit))}</i> if all hit`;
      head.append(pay);
    }
    const fold = document.createElement("button");
    fold.type = "button";
    fold.className = "find-fold";
    fold.textContent = "Pick your bet …";
    fold.addEventListener("click", () => {
      if (betOpen) window.savePeek = !window.savePeek;
      else {
        window.saveShut = !window.saveShut;
        try { localStorage.setItem("savedShut", window.saveShut ? "1" : "0"); } catch (error) { console.log("[parlay-save] could not keep fold", error); }
      }
      paintParlay();
    });
    const quick = document.createElement("button");
    quick.type = "button";
    quick.className = "find-saved-quick";
    quick.textContent = "Quick Add";
    quick.addEventListener("click", () => { if (typeof quickAddOpen === "function") quickAddOpen(); });
    const share = document.createElement("button");
    share.type = "button";
    share.className = "share-bet find-saved-share";
    share.title = "Share all my bets";
    share.setAttribute("aria-label", share.title);
    share.dataset.share = "rec";
    const pack = saveAllShareTicket(list);
    share.dataset.shareId = String((window.recTickets = window.recTickets || []).push({ ticket: pack, name: "My bets" }) - 1);
    share.hidden = !pack.legs.length;
    const shut = document.createElement("button"); shut.type = "button"; shut.className = "find-close"; shut.textContent = "×"; shut.title = "Close saved parlays"; shut.setAttribute("aria-label", shut.title);
    shut.addEventListener("click", () => { saveBetsRest(); paintParlay(); });
    const acts = document.createElement("span");
    acts.className = "find-saved-acts";
    acts.append(fold);
    if (betOpen || folded) acts.append(quick);
    else acts.append(share, shut);
    head.append(acts); box.append(head);
    const bag = document.createElement("div");
    bag.className = "find-saved-list manage-pick";
    if (typeof manageFill === "function") manageFill(bag, { inline: true });
    box.append(bag);
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

function saveBetOpen(tray) {
  return !!(tray && !tray.hidden && !tray.classList.contains("find-shut") && (typeof parlayLeg !== "undefined" && parlayLeg.size || typeof parlayPick !== "undefined" && parlayPick.size));
}

function saveBetsRest() {
  window.saveGone = false;
  window.savePeek = false;
  window.saveShut = true;
  try { localStorage.setItem("savedShut", "1"); } catch (error) { console.log("[parlay-save] could not keep fold", error); }
}

function saveCollapseForBet() {
  saveBetsRest();
}

window.saveCollapseForBet = saveCollapseForBet;
window.saveBetOpen = saveBetOpen;
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
  if (!board || typeof whereFind !== "function") return;
  const tray = box.querySelector(".find-tray:not([hidden]):not(.find-shut):not(.find-edit)");
  const fold = tray && tray.querySelector(".find-fold");
  if (!fold) return;
  let next = tray.nextElementSibling; while (next && !next.getClientRects().length) next = next.nextElementSibling;
  if (!next) return;
  const start = next.classList.contains("find-start");
  if (!start && !board.querySelector(".find-teams .find-match, .find-list > h3")) return;
  const rect = tray.getBoundingClientRect(), at = next.getBoundingClientRect().top;
  const past = at <= rect.top + 1, stuck = at < rect.bottom - 1;
  const end = tray.scrollTop + tray.clientHeight >= tray.scrollHeight - 2, long = tray.scrollHeight > tray.clientHeight + 2;
  if (past || (stuck && (start || (long && end)))) { saveFoldAt = Date.now(); fold.click(); saveAutoShut.add(tray); }
}, true);
document.addEventListener("click", (event) => {
  const go = event.target.closest && event.target.closest(".find-games-go");
  if (!go || !window.saveStacksOpen) return;
  window.saveStacksOpen = false;
  paintParlay();
  setTimeout(() => { const span = document.querySelector("#desk-glass-in .find-span"); if (span) span.scrollIntoView({ block: "start", behavior: "smooth" }); }, 50);
});
document.addEventListener("click", (event) => { const fold = event.target.closest && event.target.closest(".find-fold"); if (!fold) return; if (event.isTrusted) saveAutoShut.delete(fold.closest(".find-tray")); for (let node = fold; node; node = node.parentElement) saveScrollTop.delete(node); }, true);

document.addEventListener("click", (event) => {
  if (!window.savePeek) return;
  const tip = event.target;
  // Fold rebuilds MY BETS mid-click; the button is detached so .find-saved closest fails.
  if (tip && tip.closest && (tip.closest(".find-saved") || tip.closest(".find-fold"))) return;
  if (tip && tip.classList && tip.classList.contains("find-fold")) return;
  window.savePeek = false;
  if (typeof paintParlay === "function") paintParlay();
});

function saveTips() {
  document.querySelectorAll(".find-tips").forEach((node) => node.remove());
}
