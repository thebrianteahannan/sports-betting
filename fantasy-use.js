/** Sleeper usernames that used free Fantasy Start/Sit, and when they checked. */

const KEY = "bets/fantasy-use.json";
let chain = Promise.resolve();

function dayKey(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function weekKeys(now) {
  const keys = [];
  for (let i = 0; i < 7; i += 1) keys.push(dayKey(now - i * 86400000));
  return keys;
}

async function noteNow(readKey, writeKey, name) {
  const user = String(name || "").trim().replace(/^@/, "");
  if (!user || user.length > 40) return;
  const id = user.toLowerCase();
  const data = (await readKey(KEY)) || {};
  const users = data.users && typeof data.users === "object" ? data.users : {};
  const now = Date.now();
  const day = dayKey(now);
  const row = users[id] || { name: user, total: 0, last: "", days: {} };
  row.name = user;
  row.total = (Number(row.total) || 0) + 1;
  row.last = new Date(now).toISOString();
  row.days = row.days && typeof row.days === "object" ? row.days : {};
  row.days[day] = (Number(row.days[day]) || 0) + 1;
  const keep = new Set(weekKeys(now).concat(dayKey(now - 7 * 86400000)));
  Object.keys(row.days).forEach((key) => { if (!keep.has(key)) delete row.days[key]; });
  users[id] = row;
  await writeKey(KEY, { users });
}

function note(readKey, writeKey, name) {
  const run = chain.then(() => noteNow(readKey, writeKey, name));
  chain = run.catch((error) => console.error("fantasy use:", error));
  return run;
}

function list(data) {
  const now = Date.now();
  const today = dayKey(now);
  const week = new Set(weekKeys(now));
  const users = data && data.users && typeof data.users === "object" ? data.users : {};
  return Object.values(users).map((row) => {
    const days = row.days || {};
    let weekN = 0;
    week.forEach((key) => { weekN += Number(days[key]) || 0; });
    return {
      name: row.name || "",
      total: Number(row.total) || 0,
      today: Number(days[today]) || 0,
      week: weekN,
      last: row.last || "",
    };
  }).filter((row) => row.name).sort((a, b) => Date.parse(b.last || 0) - Date.parse(a.last || 0));
}

module.exports = { note, list, KEY };
