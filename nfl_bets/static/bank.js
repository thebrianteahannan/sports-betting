/** Quarter Kelly against the bank. The bank starts at $100 and moves when a bet is locked and settled. */

const BANK_KEY = "pod-bank";

function bankFresh() {
  return { start: 100, cash: 100, out: {}, settled: {}, at: 0 };
}

let bankBook = bankFresh();
let bankNote = "";
let bankSending = null;

function bankMoney(n) {
  const v = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(v)) return "0";
  return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2);
}

function bankOddsNum(odds) {
  if (typeof odds === "number" && Number.isFinite(odds) && odds) return odds;
  const n = Number(String(odds || "").replace(/[−–]/g, "-").replace(/[+$,\s]/g, ""));
  return Number.isFinite(n) && n ? n : 0;
}

function bankMultiple(odds) {
  const n = bankOddsNum(odds);
  if (!n) return 0;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function bankPriceNum(legs) {
  const dec = (legs || []).reduce((p, leg) => {
    const b = bankMultiple(leg && leg.odds);
    return b > 0 ? p * (1 + b) : p;
  }, 1);
  if (!(dec > 1)) return 0;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function bankOutSum(book) {
  return Object.values((book || bankBook).out || {}).reduce((sum, row) => sum + (Number(row.stake) || 0), 0);
}

function bankRoll() {
  return Math.round((Number(bankBook.cash) + bankOutSum(bankBook)) * 100) / 100;
}

function bankKellyCore(p, odds, roll, free) {
  const b = bankMultiple(odds);
  if (!(b > 0) || !(p > 0) || p >= 1) return { full: 0, bet: 0, edge: false };
  const ev = b * p - (1 - p);
  if (!(ev > 0)) return { full: 0, bet: 0, edge: false, ev };
  const fraction = ev / b;
  const full = Math.max(0, Math.round(fraction * roll));
  const quarter = Math.max(0, Math.round(fraction * roll * 0.25));
  const room = Math.max(0, Math.floor(Number(free) || 0));
  return { full, bet: Math.min(quarter, room), quarter, edge: true, ev };
}

function bankKelly(legs) {
  const rows = Array.isArray(legs) ? legs : [];
  if (!rows.length) return null;
  const records = rows.map(bankLegRate);
  if (records.some((row) => !row)) return null;
  const p = records.reduce((prod, row) => prod * row.rate, 1);
  const odds = rows.length === 1 ? bankOddsNum(rows[0].odds) : bankPriceNum(rows);
  return { ...bankKellyCore(p, odds, bankRoll() || 100, bankBook.cash), odds, p, records };
}

const bankCards = new Map();
const bankCardWait = new Set();
let bankCardRefresh = false;

function bankWho(leg) {
  const raw = String((leg && leg.label) || "").split(/\s+—\s+/)[0].trim();
  return String((leg && leg.player) || "").trim() || raw.split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim();
}

function bankGameHit(leg, games) {
  const blob = `${leg.market || ""} ${leg.label || ""}`.toLowerCase();
  const line = Number((blob.match(/\d+(?:\.\d+)?/) || [])[0]);
  const under = /\bunder\b/.test(blob);
  const plus = /\+/.test(blob);
  const count = (pick, did) => {
    const vals = games.map(pick).filter((value) => value != null && Number.isFinite(Number(value)));
    if (vals.length < 5) return null;
    const hits = vals.filter((value) => {
      const n = Number(value);
      if (!Number.isFinite(line)) return n >= 1;
      if (under) return n < line;
      if (plus) return n >= line;
      return n > line;
    }).length;
    return { hits, n: vals.length, did };
  };
  if (/touchdown|anytime|\btd\b/.test(blob)) {
    const qb = games.some((game) => Number(game.passYds) >= 100);
    return count((game) => (qb ? Number(game.rushTd) || 0 : (Number(game.rushTd) || 0) + (Number(game.recTd) || 0)), "scored in");
  }
  if (/three|3pt|3-pt/.test(blob)) return count((game) => game.threes, Number.isFinite(line) ? `made ${line} or more in` : "made them in");
  if (/rebound/.test(blob)) return count((game) => game.reb, "cleared it in");
  if (/assist/.test(blob)) return count((game) => game.ast, "cleared it in");
  if (/point/.test(blob)) return count((game) => game.pts, Number.isFinite(line) ? `cleared ${line} in` : "cleared it in");
  if (/receiv/.test(blob)) return count((game) => /yard/.test(blob) ? game.recYds : game.rec, "cleared it in");
  if (/rush/.test(blob)) return count((game) => game.rushYds, "cleared it in");
  return null;
}

function bankLegRate(leg) {
  const who = bankWho(leg);
  const rec = typeof metalRecord === "function" ? metalRecord(leg) : null;
  if (rec) return { ...rec, who, did: "hit in" };
  const games = (bankCardOf(leg) || {}).games;
  if (!who || !games) return null;
  const hit = bankGameHit(leg, games);
  if (!hit) return null;
  return { hits: hit.hits, n: hit.n, rate: hit.hits / hit.n, who, did: hit.did };
}

function bankCardOf(leg) {
  const who = bankWho(leg);
  return who ? bankCards.get(who.toLowerCase()) || null : null;
}

function bankAskCard(leg) {
  const who = bankWho(leg);
  const key = who.toLowerCase();
  if (!who || bankCards.has(key) || bankCardWait.has(key)) return;
  bankCardWait.add(key);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "card", name: who, sport: leg.sport || "" }) })
    .then((res) => res.json())
    .then((data) => { bankCards.set(key, data || {}); })
    .catch(() => { bankCards.set(key, {}); })
    .finally(() => {
      bankCardWait.delete(key);
      if (bankCardWait.size || bankCardRefresh || typeof manageRefresh !== "function") return;
      bankCardRefresh = true;
      manageRefresh();
      bankCardRefresh = false;
    });
}

function bankPct(rate) {
  const v = Math.round(Number(rate) * 1000) / 10;
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

function bankHitSay(kelly) {
  const records = kelly.records || [];
  const bits = records.map((row) => `${row.who} ${row.did} ${row.hits} of ${row.n}`);
  const list = bits.length < 2 ? (bits[0] || "") : bits.length === 2 ? `${bits[0]} and ${bits[1]}` : `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
  const odds = Number(kelly.odds);
  const need = odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
  const together = bits.length > 1 ? ` Together that is ${bankPct(kelly.p)}%` : ` That is ${bankPct(kelly.p)}%`;
  return `${list}.${together}, and the price needs ${bankPct(need)}%.`;
}

function bankSay(kelly, fallback) {
  if (!kelly || !(kelly.records || []).length) return "";
  const roll = bankMoney(bankRoll() || 100);
  const why = bankHitSay(kelly);
  if (kelly.edge && kelly.bet > 0) return `Bet $${bankMoney(kelly.bet)} of the $${roll}. ${why} A quarter of that edge is $${bankMoney(kelly.bet)}.`;
  if (kelly.edge) return `${why} The edge on the $${roll} is $${bankMoney(kelly.full)}. A quarter of that is under $1.`;
  const stake = fallback > 0 ? fallback : 0;
  const loss = stake > 0 ? Math.max(0, Math.round(stake * Math.abs(Math.min(0, kelly.ev || 0)))) : 0;
  if (loss > 0) return `${why} A $${bankMoney(stake)} repeat loses $${bankMoney(loss)}.`;
  return why;
}

function bankStoreLocal(book) {
  bankBook = book || bankFresh();
  try { localStorage.setItem(BANK_KEY, JSON.stringify(bankBook)); } catch (error) {}
}

function bankReadLocal() {
  try { return JSON.parse(localStorage.getItem(BANK_KEY) || ""); } catch (error) { return null; }
}

function bankApplyLocal(body) {
  const next = {
    start: Number(bankBook.start) >= 0 ? Number(bankBook.start) : 100,
    cash: Number(bankBook.cash) >= 0 ? Number(bankBook.cash) : 100,
    out: { ...(bankBook.out || {}) },
    settled: { ...(bankBook.settled || {}) },
    at: Date.now(),
  };
  const id = String(body.id || "").slice(0, 80);
  if (body.action === "set") {
    const cash = Number(body.cash);
    if (!Number.isFinite(cash) || cash < 0) throw new Error("That bank does not look right.");
    next.cash = Math.round(cash * 100) / 100;
    return next;
  }
  if (next.settled[id]) return next;
  if (body.action === "lock") {
    if (next.out[id]) return next;
    const stake = Math.round(Number(body.stake) * 100) / 100;
    const odds = bankOddsNum(body.odds);
    if (!(stake > 0) || !odds) throw new Error("That stake does not look right.");
    if (stake > next.cash + 0.001) throw new Error(`That stake is more than the $${bankMoney(next.cash)} still free.`);
    next.cash = Math.round((next.cash - stake) * 100) / 100;
    next.out[id] = { stake, odds };
    return next;
  }
  if (body.action === "unlock") {
    const open = next.out[id];
    if (!open) return next;
    next.cash = Math.round((next.cash + open.stake) * 100) / 100;
    delete next.out[id];
    return next;
  }
  if (body.action === "settle") {
    const open = next.out[id];
    if (!open || !["won", "lost", "push"].includes(body.result)) return next;
    const profit = Math.round(open.stake * bankMultiple(open.odds) * 100) / 100;
    if (body.result === "won") next.cash = Math.round((next.cash + open.stake + profit) * 100) / 100;
    if (body.result === "push") next.cash = Math.round((next.cash + open.stake) * 100) / 100;
    delete next.out[id];
    next.settled[id] = { result: body.result, at: Date.now() };
    return next;
  }
  return next;
}

async function bankAct(body) {
  const prev = JSON.parse(JSON.stringify(bankBook));
  try { bankStoreLocal(bankApplyLocal(body)); } catch (error) { bankNote = error.message; bankPaint(); throw error; }
  bankNote = "";
  bankPaint();
  if (!window.saveWho) return bankBook;
  const job = fetch("/api/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The bank did not save.");
      return data;
    });
  bankSending = job;
  try {
    const data = await job;
    if (bankSending === job) bankStoreLocal(data);
  } catch (error) {
    if (bankSending === job) bankStoreLocal(prev);
    bankNote = error.message || "The bank did not save.";
    throw error;
  } finally {
    if (bankSending === job) bankSending = null;
    bankPaint();
  }
  return bankBook;
}

async function bankLoad() {
  const local = bankReadLocal();
  if (local && local.cash != null) bankBook = { ...bankFresh(), ...local, out: local.out || {}, settled: local.settled || {} };
  if (!window.saveWho) { bankPaint(); return bankBook; }
  try {
    const res = await fetch("/api/bank");
    if (!res.ok) { bankPaint(); return bankBook; }
    const data = await res.json();
    if (local && Number(local.at) > Number(data.at || 0)) return bankBook;
    bankStoreLocal(data);
  } catch (error) {}
  bankPaint();
  return bankBook;
}

function bankRowOdds(row) {
  if (row && row.lockedOdds) return bankOddsNum(row.lockedOdds);
  if (typeof savePrice === "function") return bankOddsNum(savePrice(row && row.legs || []));
  return bankPriceNum(row && row.legs || []);
}

function bankCanLock(stake, id) {
  if (bankBook.out && bankBook.out[id]) return true;
  if (bankBook.settled && bankBook.settled[id]) return true;
  const bet = Number(stake);
  if (bet > Number(bankBook.cash) + 0.001) {
    bankNote = `That stake is more than the $${bankMoney(bankBook.cash)} still free.`;
    bankPaint();
    return false;
  }
  bankNote = "";
  return true;
}

function bankSpend(row) {
  if (!row || (bankBook.settled && bankBook.settled[row.id]) || (bankBook.out && bankBook.out[row.id])) return Promise.resolve(bankBook);
  const stake = typeof saveRowStake === "function" ? saveRowStake(row) : Number(row.stake) || 5;
  return bankAct({ action: "lock", id: row.id, stake, odds: bankRowOdds(row) }).catch((error) => {
    if (typeof saveUnlock === "function") saveUnlock(row.id, { quiet: true });
    bankNote = error.message;
    if (typeof paintParlay === "function") paintParlay();
    else bankPaint();
  });
}

function bankReturn(id) {
  if (!id || !bankBook.out || !bankBook.out[id]) return Promise.resolve(bankBook);
  return bankAct({ action: "unlock", id }).catch((error) => { bankNote = error.message; bankPaint(); });
}

function bankSettle(id, result) {
  return bankAct({ action: "settle", id, result }).catch((error) => { bankNote = error.message; bankPaint(); });
}

function bankFillStake() {
  if (typeof parlayLeg === "undefined" || !parlayLeg.size) return;
  const open = window.parlayOpenId && typeof saveList === "function" && saveList().find((row) => row.id === window.parlayOpenId);
  if (window.parlayStakeTyped || (open && open.stakeTyped) || (open && open.locked)) return;
  const kelly = bankKelly([...parlayLeg.values()]);
  if (!kelly || !kelly.edge || !(kelly.bet > 0)) return;
  window.parlayStake = kelly.bet;
}

function bankPaintTicket() {
  document.querySelectorAll(".find-tray .bank-kelly, .find-tray .bank-note").forEach((node) => node.remove());
  if (typeof parlayLeg === "undefined" || !parlayLeg.size) return;
  const kelly = bankKelly([...parlayLeg.values()]);
  document.querySelectorAll(".find-tray .find-ticket").forEach((ticket) => {
    if (bankNote) {
      const note = document.createElement("p");
      note.className = "bank-note";
      note.textContent = bankNote;
      ticket.after(note);
    }
    const legs = [...parlayLeg.values()];
    legs.forEach(bankAskCard);
    const said = bankSay(kelly, Number(window.parlayStake) || 5);
    if (!said) return;
    const line = document.createElement("p");
    line.className = "bank-kelly";
    line.textContent = said;
    ticket.after(line);
  });
}

function bankBar() {
  const line = document.createElement("p");
  line.className = "bank-line";
  const field = document.createElement("input");
  field.type = "number";
  field.min = "0";
  field.step = "1";
  field.className = "bank-cash";
  field.setAttribute("aria-label", "Bankroll left to bet");
  field.value = bankMoney(bankBook.cash);
  field.addEventListener("click", (event) => event.stopPropagation());
  field.addEventListener("change", () => {
    const cash = Number(field.value);
    bankAct({ action: "set", cash }).catch(() => { field.value = bankMoney(bankBook.cash); });
  });
  const name = document.createElement("b");
  name.className = "bank-name";
  name.textContent = "Bankroll";
  const wrap = document.createElement("span");
  wrap.className = "bank-cash-wrap";
  const buck = document.createElement("span");
  buck.className = "bank-buck";
  buck.textContent = "$";
  wrap.append(buck, field);
  const out = bankOutSum(bankBook);
  line.append(name, wrap);
  if (out > 0) {
    const say = document.createElement("span");
    say.textContent = ` $${bankMoney(out)} is on open bets.`;
    line.append(say);
  }
  if (bankNote) {
    const note = document.createElement("span");
    note.className = "bank-note";
    note.textContent = bankNote;
    line.append(note);
  }
  return line;
}

function bankStamp(parent, text) {
  if (!parent || parent.querySelector(":scope > .bank-kelly")) return;
  const bit = document.createElement("i");
  bit.className = "bank-kelly";
  bit.textContent = text;
  parent.append(bit);
}

let bankRecWait = 0;
function bankWatchRecords() {
  if (bankRecWait) return;
  let tries = 0;
  bankRecWait = setInterval(() => {
    const ready = typeof scriptRecAll !== "undefined" && scriptRecAll.size;
    if (ready || ++tries > 20 || !document.querySelector(".manage-board")) {
      clearInterval(bankRecWait);
      bankRecWait = 0;
      if (ready && typeof manageRefresh === "function") manageRefresh();
    }
  }, 500);
}

function bankCard(card, row) {
  if (!card || !row) return;
  const legs = row.legs || [];
  legs.forEach(bankAskCard);
  const kelly = bankKelly(legs);
  if (!kelly) bankWatchRecords();
  const stake = typeof saveRowStake === "function" ? saveRowStake(row) : (Number(row.stake) > 0 ? Number(row.stake) : 5);
  const said = bankSay(kelly, stake);
  if (said) {
    const fold = card.querySelector(".manage-fold-line");
    const price = card.querySelector(".manage-legs > .manage-bet-price");
    bankStamp(fold, said);
    bankStamp(price, said);
    bankStamp(card.querySelector(".manage-slip-head"), said);
    if (!fold && !price) bankStamp(card.querySelector(".manage-legs .find-chose > span"), said);
  }
  const done = bankBook.settled && bankBook.settled[row.id];
  if (done) {
    const mark = document.createElement("p");
    mark.className = `bank-result r-${done.result}`;
    mark.textContent = done.result === "won" ? "Won" : done.result === "lost" ? "Lost" : "Push";
    card.append(mark);
    return;
  }
  if (!row.locked || !bankBook.out || !bankBook.out[row.id]) return;
  const marks = document.createElement("span");
  marks.className = "bank-marks";
  [["won", "Won"], ["lost", "Lost"], ["push", "Push"]].forEach(([result, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bank-mark r-${result}`;
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      bankSettle(row.id, result);
    });
    marks.append(button);
  });
  card.append(marks);
}

function bankPaint() {
  document.querySelectorAll(".manage-board .bank-line").forEach((node) => {
    const fresh = bankBar();
    node.replaceWith(fresh);
  });
  bankPaintTicket();
  if (typeof manageRefresh === "function" && document.querySelector(".manage-board")) manageRefresh();
}

if (typeof window !== "undefined") {
  if (typeof paintParlay === "function") {
    const bankPaintParlay = paintParlay;
    paintParlay = function () {
      bankFillStake();
      bankPaintParlay.apply(this, arguments);
      bankPaintTicket();
    };
  }
  window.bankKelly = bankKelly;
  window.bankCanLock = bankCanLock;
  window.bankSpend = bankSpend;
  window.bankReturn = bankReturn;
  window.bankBar = bankBar;
  window.bankCard = bankCard;
  window.bankCardOf = bankCardOf;
  window.bankAskCard = bankAskCard;
  window.bankWho = bankWho;
  window.bankLoad = bankLoad;
  const kept = bankReadLocal();
  if (kept && kept.cash != null) bankBook = { ...bankFresh(), ...kept, out: kept.out || {}, settled: kept.settled || {} };
  const bankWait = setInterval(() => {
    if (!window.saveWho) return;
    clearInterval(bankWait);
    bankLoad();
  }, 800);
}

if (typeof module !== "undefined" && module.exports) module.exports = { bankKellyCore, bankFresh };
