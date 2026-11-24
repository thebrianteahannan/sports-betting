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
  if (!rows.length || typeof metalRecord !== "function") return null;
  const records = rows.map((leg) => metalRecord(leg));
  if (records.some((row) => !row)) return null;
  const p = records.reduce((prod, row) => prod * row.rate, 1);
  const odds = rows.length === 1 ? bankOddsNum(rows[0].odds) : bankPriceNum(rows);
  return { ...bankKellyCore(p, odds, bankRoll() || 100, bankBook.cash), odds };
}

function bankSay(kelly, fallback, odds) {
  const price = bankOddsNum((kelly && kelly.odds) || odds);
  const stake = kelly && kelly.edge && kelly.bet > 0 ? kelly.bet : (fallback > 0 ? fallback : 0);
  if (!price || !(stake > 0)) return kelly && !kelly.edge ? "The price has no edge." : "";
  const need = typeof findPct === "function" ? findPct(price) : "";
  const win = typeof findCash === "function" ? findCash(price, stake) : "";
  const bank = bankMoney(bankRoll() || 100);
  if (kelly && kelly.edge && kelly.bet > 0 && need && win) {
    const left = kelly.quarter > kelly.bet ? ` $${bankMoney(kelly.bet)} is what's left.` : "";
    return `Bet $${bankMoney(kelly.bet)} of the $${bank}.${left} It wins ${win}. The hit rate clears the ${need} this price needs.`;
  }
  if (kelly && !kelly.edge) {
    const loss = Math.max(0, Math.round((fallback > 0 ? fallback : stake) * Math.abs(Math.min(0, kelly.ev || 0))));
    if (loss > 0 && need) return `A $${bankMoney(fallback > 0 ? fallback : stake)} bet loses $${bankMoney(loss)}. The price needs ${need}.`;
    return "The price has no edge.";
  }
  if (!need || !win) return "";
  return `Bet $${bankMoney(stake)} of the $${bank}. It wins ${win}. The price needs ${need}.`;
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
    const said = bankSay(kelly, Number(window.parlayStake) || 5, legs.length === 1 ? legs[0].odds : bankPriceNum(legs));
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
  const say = document.createElement("span");
  say.textContent = out > 0 ? ` left to bet. $${bankMoney(out)} is on open bets.` : " left to bet.";
  line.append(name, wrap, say);
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
  const kelly = bankKelly(row.legs || []);
  if (!kelly) bankWatchRecords();
  const stake = typeof saveRowStake === "function" ? saveRowStake(row) : (Number(row.stake) > 0 ? Number(row.stake) : 5);
  const said = bankSay(kelly, stake, bankRowOdds(row));
  if (said) {
    bankStamp(card.querySelector(".manage-fold-line"), said);
    bankStamp(card.querySelector(".manage-legs > .manage-bet-price"), said);
    bankStamp(card.querySelector(".manage-slip-head"), said);
    if (!card.querySelector(".bank-kelly")) bankStamp(card.querySelector(".manage-legs .find-chose > span"), said);
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
