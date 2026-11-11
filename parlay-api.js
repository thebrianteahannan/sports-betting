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
  const games = new Set(archive.flatMap((row) => row.legs.map((leg) => `${leg.match}|${leg.kickoff}`)));
  const shown = {};
  Object.entries(reviews).forEach(([at, review]) => { if (games.has(at)) shown[at] = review; });
  return { who: user.id, archive, reviews: shown, gone: [...gone] };
}

module.exports = { parlayList, parlayPut, parlayArchive };
