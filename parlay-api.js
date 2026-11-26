/** Saved parlays per member, so a parlay started on one device opens on another. */

const { gradeParlay } = require("./parlay-grade");
const key = (user) => `bets/parlays/${user.id}.json`;
const doneKey = (user) => `bets/parlays/${user.id}-done.json`;
const reviewKey = (user) => `bets/parlays/${user.id}-reviews.json`;

async function parlayList(user, readKey) {
  const data = (await readKey(key(user))) || {};
  return { who: user.id, parlays: Array.isArray(data.parlays) ? data.parlays : [] };
}

async function parlayPut(user, body, readKey, writeKey) {
  const done = new Set((((await readKey(doneKey(user))) || {}).parlays || []).map((row) => row.id));
  const list = (Array.isArray(body.parlays) ? body.parlays : []).filter((row) => row && typeof row.id === "string" && Array.isArray(row.legs) && !done.has(row.id)).slice(0, 20);
  if (JSON.stringify(list).length > 400000) throw new Error("Those parlays are too big to save.");
  await writeKey(key(user), { parlays: list, at: Date.now() });
  return { who: user.id, parlays: list };
}

async function parlayArchive(user, readKey, writeKey) {
  const live = (await readKey(key(user))) || {}, old = (await readKey(doneKey(user))) || {}, told = (await readKey(reviewKey(user))) || {};
  const list = Array.isArray(live.parlays) ? live.parlays : [], kept = Array.isArray(old.parlays) ? old.parlays : [];
  const reviews = told.reviews && typeof told.reviews === "object" ? told.reviews : {};
  const fresh = [];
  const take = (graded) => { Object.entries(graded.reviews || {}).forEach(([at, review]) => { const { players, ...lean } = review; reviews[at] = lean; }); delete graded.reviews; fresh.push(graded); };
  for (const row of list.concat(kept.filter((one) => !one.done || one.done.v !== 2))) {
    try { const graded = await gradeParlay(row); if (graded) take(graded); } catch (error) { console.error("parlay grade:", error && error.message); }
  }
  const gone = new Set(fresh.map((row) => row.id)), archive = fresh.concat(kept.filter((row) => !gone.has(row.id))).slice(0, 500);
  if (fresh.length) {
    const keep = Object.keys(reviews).slice(-150), lean = {};
    keep.forEach((at) => { lean[at] = reviews[at]; });
    await writeKey(doneKey(user), { parlays: archive, at: Date.now() });
    await writeKey(reviewKey(user), { reviews: lean, at: Date.now() });
    if (list.some((row) => gone.has(row.id))) await writeKey(key(user), { parlays: list.filter((row) => !gone.has(row.id)), at: Date.now() });
  }
  for (const row of fresh) {
    const result = row && row.done && row.done.result;
    if (!row || !row.locked || !["won", "lost", "push"].includes(result)) continue;
    try { await bankPut(user, { action: "settle", id: row.id, result }, readKey, writeKey); } catch (error) { console.error("bank settle:", error && error.message); }
  }
  const games = new Set(archive.flatMap((row) => row.legs.map((leg) => `${leg.match}|${leg.kickoff}`)));
  const shown = {};
  Object.entries(reviews).forEach(([at, review]) => { if (games.has(at)) shown[at] = review; });
  return { who: user.id, archive, reviews: shown, gone: [...gone] };
}

const bankKey = (user) => `bets/bank/${user.id}.json`;

function bankMoney(n) {
  const v = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(v)) return "0";
  return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2);
}

function bankFresh() {
  return { start: 100, cash: 100, out: {}, settled: {}, at: 0 };
}

function bankRead(data) {
  const row = data && typeof data === "object" ? data : {};
  const cash = Number(row.cash);
  const start = Number(row.start);
  const out = {};
  Object.entries(row.out && typeof row.out === "object" ? row.out : {}).forEach(([id, item]) => {
    const stake = Math.round(Number(item && item.stake) * 100) / 100;
    const odds = Number(item && item.odds);
    if (!id || !(stake > 0) || !Number.isFinite(odds) || !odds) return;
    out[String(id).slice(0, 80)] = { stake, odds };
  });
  const settled = {};
  Object.entries(row.settled && typeof row.settled === "object" ? row.settled : {}).forEach(([id, item]) => {
    const result = item && item.result;
    if (!id || !["won", "lost", "push"].includes(result)) return;
    settled[String(id).slice(0, 80)] = { result, at: Number(item.at) || 0 };
  });
  return {
    start: Number.isFinite(start) && start >= 0 ? start : 100,
    cash: Number.isFinite(cash) ? Math.round(cash * 100) / 100 : 100,
    out,
    settled,
    at: Number(row.at) || 0,
  };
}

function bankProfit(stake, odds) {
  const n = Number(odds);
  const bet = Number(stake);
  if (!Number.isFinite(n) || !n || !(bet > 0)) return 0;
  return Math.round(bet * (n < 0 ? 100 / -n : n / 100) * 100) / 100;
}

function bankPrice(legs) {
  const dec = (Array.isArray(legs) ? legs : []).reduce((p, leg) => {
    const n = Number(leg && leg.odds);
    if (!Number.isFinite(n) || !n) return p;
    return p * (1 + (n > 0 ? n / 100 : 100 / Math.abs(n)));
  }, 1);
  if (!(dec > 1)) return 0;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function bankApply(book, body) {
  const next = bankRead(book);
  const action = String(body && body.action || "");
  const id = String(body && body.id || "").slice(0, 80);
  if (action === "set") {
    const cash = Number(body.cash);
    if (!Number.isFinite(cash) || cash < 0 || cash > 1000000) throw new Error("That bank does not look right.");
    next.cash = Math.round(cash * 100) / 100;
    next.at = Date.now();
    return next;
  }
  if (!id) throw new Error("That bet is missing.");
  if (next.settled[id]) return next;
  if (action === "lock") {
    if (next.out[id]) return next;
    const stake = Math.round(Number(body.stake) * 100) / 100;
    const odds = Number(body.odds);
    if (!(stake > 0) || !Number.isFinite(odds) || !odds) throw new Error("That stake does not look right.");
    next.cash = Math.round((next.cash - stake) * 100) / 100;
    next.out[id] = { stake, odds };
    next.at = Date.now();
    return next;
  }
  if (action === "unlock") {
    const open = next.out[id];
    if (!open) return next;
    next.cash = Math.round((next.cash + open.stake) * 100) / 100;
    delete next.out[id];
    next.at = Date.now();
    return next;
  }
  if (action === "settle") {
    const result = body.result;
    if (!["won", "lost", "push"].includes(result)) throw new Error("That result does not look right.");
    const open = next.out[id];
    if (!open) return next;
    if (result === "won") next.cash = Math.round((next.cash + open.stake + bankProfit(open.stake, open.odds)) * 100) / 100;
    if (result === "push") next.cash = Math.round((next.cash + open.stake) * 100) / 100;
    delete next.out[id];
    next.settled[id] = { result, at: Date.now() };
    next.at = Date.now();
    return next;
  }
  throw new Error("That bank move does not look right.");
}

async function bankGet(user, readKey) {
  return bankRead((await readKey(bankKey(user))) || bankFresh());
}

async function bankPut(user, body, readKey, writeKey) {
  const book = bankApply(await bankGet(user, readKey), body || {});
  await writeKey(bankKey(user), book);
  return book;
}

module.exports = { parlayList, parlayPut, parlayArchive, bankGet, bankPut, bankApply, bankPrice, bankFresh };
