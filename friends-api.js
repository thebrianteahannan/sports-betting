/** Friends and shared bets. A bet can only be sent to someone who has accepted a friend request. */

const crypto = require("crypto");
const LINKS = "bets/friends.json";
const inboxKey = (id) => `bets/shared/${id}.json`;

function pairOf(a, b) { return [a, b].sort().join("|"); }

async function linksOf(readKey) {
  const data = (await readKey(LINKS)) || {};
  return Array.isArray(data.links) ? data.links : [];
}

function who(users, id) {
  const user = users.find((row) => row.id === id);
  return user ? { id: user.id, name: String(user.name || "").trim() || String(user.email || "").split("@")[0], state: user.state || "" } : null;
}

function friendIds(links, me) {
  return links.filter((row) => row.status === "friends" && (row.a === me || row.b === me)).map((row) => (row.a === me ? row.b : row.a));
}

async function friendsView(user, readKey, loadMembers) {
  const [links, data] = await Promise.all([linksOf(readKey), loadMembers()]);
  const mine = links.filter((row) => row.a === user.id || row.b === user.id);
  const other = (row) => (row.a === user.id ? row.b : row.a);
  const list = (rows) => rows.map((row) => who(data.users, other(row))).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name));
  return {
    friends: list(mine.filter((row) => row.status === "friends")),
    incoming: list(mine.filter((row) => row.status === "pending" && row.from !== user.id)),
    outgoing: list(mine.filter((row) => row.status === "pending" && row.from === user.id)),
  };
}

async function friendsPost(user, body, readKey, writeKey, loadMembers) {
  const links = await linksOf(readKey), data = await loadMembers();
  const action = String(body.action || "");
  if (action === "find") {
    const q = String(body.q || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (q.length < 2) return { people: [] };
    const status = (id) => { const row = links.find((one) => one.key === pairOf(user.id, id)); return !row ? "" : row.status === "friends" ? "friends" : row.from === user.id ? "sent" : "asked"; };
    const people = data.users.filter((row) => row.id !== user.id && String(row.name || "").toLowerCase().includes(q))
      .sort((x, y) => String(x.name).toLowerCase().indexOf(q) - String(y.name).toLowerCase().indexOf(q) || String(x.name).localeCompare(String(y.name)))
      .slice(0, 8).map((row) => ({ id: row.id, name: String(row.name || "").trim(), state: row.state || "", status: status(row.id) }));
    return { people };
  }
  if (action === "ask") {
    const them = data.users.find((row) => row.id === String(body.id || ""));
    if (!them) throw new Error("Pick a member from the list.");
    if (them.id === user.id) throw new Error("That is you.");
    const key = pairOf(user.id, them.id), row = links.find((one) => one.key === key);
    if (row && row.status === "friends") throw new Error(`You are already friends with ${who(data.users, them.id).name}.`);
    if (row && row.from !== user.id) { row.status = "friends"; row.at = Date.now(); }
    else if (!row) links.push({ key, a: user.id, b: them.id, from: user.id, status: "pending", at: Date.now() });
  } else {
    const id = String(body.id || ""), key = pairOf(user.id, id), at = links.findIndex((one) => one.key === key);
    if (at < 0) throw new Error("That request is gone.");
    if (action === "accept" && links[at].status === "pending" && links[at].from !== user.id) { links[at].status = "friends"; links[at].at = Date.now(); }
    else if (action === "decline" || action === "remove" || action === "cancel") links.splice(at, 1);
    else throw new Error("Unknown action.");
  }
  await writeKey(LINKS, { links, at: Date.now() });
  return friendsView(user, readKey, loadMembers);
}

function cleanLeg(leg) {
  const out = {};
  ["label", "market", "match", "sport", "kickoff"].forEach((key) => { if (leg && leg[key] != null) out[key] = String(leg[key]).slice(0, 200); });
  if (leg && Number.isFinite(Number(leg.odds))) out.odds = Number(leg.odds);
  return out;
}

async function shareSend(user, body, readKey, writeKey) {
  const links = await linksOf(readKey), friends = new Set(friendIds(links, user.id));
  const to = (Array.isArray(body.to) ? body.to : [body.to]).map(String).filter(Boolean);
  const legs = (Array.isArray(body.legs) ? body.legs : []).map(cleanLeg).filter((leg) => leg.label).slice(0, 25);
  if (!to.length) throw new Error("Pick a friend to send it to.");
  if (to.some((id) => !friends.has(id))) throw new Error("You can only send bets to your friends.");
  if (!legs.length) throw new Error("This bet has no legs to send.");
  const item = { id: crypto.randomBytes(6).toString("hex"), from: user.id, fromName: String(user.name || "").trim() || String(user.email || "").split("@")[0], at: Date.now(), title: String(body.title || "").slice(0, 80), note: String(body.note || "").slice(0, 280), legs, seen: false };
  for (const id of to) {
    const box = (await readKey(inboxKey(id))) || {};
    const items = [item].concat(Array.isArray(box.items) ? box.items : []).slice(0, 100);
    await writeKey(inboxKey(id), { items, at: Date.now() });
  }
  return { sent: to.length };
}

async function sentList(user, readKey) {
  const ids = friendIds(await linksOf(readKey), user.id), byId = new Map();
  const boxes = await Promise.all(ids.map((id) => readKey(inboxKey(id))));
  boxes.forEach((box, at) => (Array.isArray((box || {}).items) ? box.items : []).filter((row) => row.from === user.id).forEach((row) => {
    const one = byId.get(row.id) || { id: row.id, at: row.at, title: row.title, note: row.note, legs: row.legs, to: [] };
    one.to.push({ id: ids[at], seen: Boolean(row.seen) });
    byId.set(row.id, one);
  }));
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

async function sharedList(user, readKey) {
  const [box, sent] = await Promise.all([readKey(inboxKey(user.id)), sentList(user, readKey)]);
  return { items: Array.isArray((box || {}).items) ? box.items : [], sent };
}

async function sharedPost(user, body, readKey, writeKey) {
  const box = (await readKey(inboxKey(user.id))) || {};
  let items = Array.isArray(box.items) ? box.items : [];
  if (body.action === "seen") items = items.map((row) => ({ ...row, seen: true }));
  else if (body.action === "drop") items = items.filter((row) => row.id !== String(body.id || ""));
  await writeKey(inboxKey(user.id), { items, at: Date.now() });
  return { items };
}

module.exports = { friendsView, friendsPost, shareSend, sharedList, sharedPost };
