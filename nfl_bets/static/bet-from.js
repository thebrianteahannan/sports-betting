/** Each bet remembers where its legs came from (Strategies, Recommended, a friend, or built by hand) and the bet card says it. */

const betFrom = new Map();
let betFromNext = null, betFromOpen = null;

function betFromSay(say, all) {
  betFromNext = { say, all: Boolean(all), at: Date.now() };
}

function betFromTag() {
  if (typeof parlayLeg === "undefined") return;
  if (betFromOpen && window.parlayOpenId === betFromOpen.id) {
    const saved = betFromOpen.from || {};
    betFrom.clear();
    parlayLeg.forEach((bet, key) => betFrom.set(key, saved[key] || ""));
    betFromOpen = null;
  }
  [...betFrom.keys()].forEach((key) => { if (!parlayLeg.has(key)) betFrom.delete(key); });
  const next = betFromNext && Date.now() - betFromNext.at < 5000 ? betFromNext : null;
  parlayLeg.forEach((bet, key) => { if (!betFrom.has(key) || (next && next.all)) betFrom.set(key, next ? next.say : "you"); });
  if (next && parlayLeg.size) betFromNext = null;
}

function betFromText() {
  const says = [...new Set([...parlayLeg.keys()].map((key) => betFrom.get(key)).filter(Boolean))].sort((a, b) => (a === "you") - (b === "you"));
  if (!says.length) return "";
  if (says.length === 1 && says[0] === "you") return "Built by you";
  return `From ${says.join(" + ")}`;
}

function betFromPill() {
  document.querySelectorAll(".find-tray .find-ticket > b").forEach((head) => {
    head.querySelectorAll(":scope > i.fr").forEach((node) => node.remove());
    const text = betFromText();
    if (!text) return;
    const pill = document.createElement("i");
    pill.className = "fr";
    pill.textContent = text;
    const pay = head.querySelector(":scope > i.pay");
    if (pay) pay.after(pill); else head.append(pill);
  });
}

if (typeof saveNow === "function") {
  const betFromSaveBase = saveNow;
  saveNow = function () {
    betFromTag();
    const entry = betFromSaveBase.apply(this, arguments);
    if (!entry) return entry;
    entry.from = Object.fromEntries([...betFrom].filter(([key, say]) => say && parlayLeg.has(key)));
    const list = saveList(), row = list.find((one) => one.id === entry.id);
    if (row && JSON.stringify(row.from || {}) !== JSON.stringify(entry.from)) { row.from = entry.from; saveStore(list); }
    return entry;
  };
}

if (typeof saveOpen === "function") {
  const betFromOpenBase = saveOpen;
  saveOpen = function (id) {
    const entry = saveList().find((row) => row.id === id);
    if (entry && id !== window.parlayOpenId) betFromOpen = entry;
    return betFromOpenBase.apply(this, arguments);
  };
}

if (typeof paintParlay === "function") {
  const betFromPaintBase = paintParlay;
  paintParlay = function () {
    betFromTag();
    betFromPaintBase.apply(this, arguments);
    betFromPill();
  };
}
