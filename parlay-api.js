/** Saved parlays per member, so a parlay started on one device opens on another. */

const key = (user) => `bets/parlays/${user.id}.json`;

async function parlayList(user, readKey) {
  const data = (await readKey(key(user))) || {};
  return { who: user.id, parlays: Array.isArray(data.parlays) ? data.parlays : [] };
}

async function parlayPut(user, body, readKey, writeKey) {
  const list = (Array.isArray(body.parlays) ? body.parlays : []).filter((row) => row && typeof row.id === "string" && Array.isArray(row.legs)).slice(0, 20);
  if (JSON.stringify(list).length > 400000) throw new Error("Those parlays are too big to save.");
  await writeKey(key(user), { parlays: list, at: Date.now() });
  return { who: user.id, parlays: list };
}

module.exports = { parlayList, parlayPut };
