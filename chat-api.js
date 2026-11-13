/** Chat between friends: one-on-one and group rooms, text and bet messages, reactions. Rows live in the Supabase tables from docs/chat-tables.sql. */

const crypto = require("crypto");
const { linksOf, friendIds, cleanLeg } = require("./friends-api");
const REACTS = new Set(["like", "fire", "fade"]);
const GROUP_MAX = 20;
const recent = new Map();

function cleanBet(bet) {
  if (!bet || typeof bet !== "object") return null;
  const parts = (Array.isArray(bet.parts) ? bet.parts : []).slice(0, 8).map((part) => ({
    legs: (Array.isArray(part && part.legs) ? part.legs : []).map(cleanLeg).filter((leg) => leg.label).slice(0, 25),
    stake: Math.min(10000, Math.max(0, Math.round(Number(part && part.stake) * 100) / 100)) || 5,
  })).filter((part) => part.legs.length);
  if (!parts.length) return null;
  let briefs = Array.isArray(bet.briefs) ? bet.briefs : [];
  if (JSON.stringify(briefs).length > 12000) briefs = [];
  return { name: String(bet.name || "").trim().slice(0, 80) || (parts.length > 1 ? "Stack" : "Bet"), stack: Boolean(bet.stack) || parts.length > 1, parts, briefs };
}

function slow(id) {
  const now = Date.now(), list = (recent.get(id) || []).filter((at) => now - at < 60000);
  if (list.length >= 20) throw new Error("Slow down a little. Try again in a minute.");
  list.push(now);
  recent.set(id, list);
}

function view(row) {
  return { id: row.id, from: row.from_id, fromName: row.from_name, at: row.at, body: row.gone ? "" : row.body, bet: row.gone ? null : row.bet, reply: row.reply || null, gone: Boolean(row.gone) };
}

function createChat(sb, readKey, loadMembers) {
  const q = encodeURIComponent;
  const nameOf = (users, id) => { const user = users.find((row) => row.id === id); return user ? String(user.name || "").trim() || String(user.email || "").split("@")[0] : "Former member"; };

  async function call(pathname, options) {
    try { return await sb(pathname, options); } catch (error) {
      if (/Supabase 404/.test(String(error && error.message))) throw new Error("Chat is not set up yet.");
      throw error;
    }
  }

  async function roomOf(user, id) {
    const rows = await call(`chat_rooms?id=eq.${q(id)}&select=*`), room = Array.isArray(rows) && rows[0];
    if (!room || !room.members.includes(user.id)) throw new Error("That chat is gone.");
    return room;
  }

  function roomView(room, users, me) {
    const members = room.members.map((id) => ({ id, name: nameOf(users, id) })), others = members.filter((one) => one.id !== me);
    return { id: room.id, group: !room.pair, name: room.name || others.map((one) => one.name).join(", ") || "Just you", members, lastAt: room.last_at };
  }

  async function list(user) {
    const [rooms, data] = await Promise.all([call(`chat_rooms?members=cs.${q(`{${user.id}}`)}&order=last_at.desc&limit=60&select=*`), loadMembers()]);
    if (!rooms.length) return { me: user.id, rooms: [] };
    const ids = rooms.map((room) => room.id).join(",");
    const [msgs, reads] = await Promise.all([
      call(`chat_messages?room=in.(${q(ids)})&order=id.desc&limit=400&select=id,room,from_id,from_name,body,at,gone,bet_name:bet->>name`),
      call(`chat_reads?user_id=eq.${q(user.id)}&select=room,last`),
    ]);
    const seen = new Map(reads.map((row) => [row.room, Number(row.last)]));
    return {
      me: user.id,
      rooms: rooms.map((room) => {
        const mine = msgs.filter((row) => row.room === room.id), last = mine[0];
        return {
          ...roomView(room, data.users, user.id),
          last: last ? { id: last.id, from: last.from_id, fromName: last.from_name, body: last.gone ? "" : last.body, bet: last.gone ? "" : last.bet_name || "", gone: Boolean(last.gone), at: last.at } : null,
          unread: mine.filter((row) => row.id > (seen.get(room.id) || 0) && row.from_id !== user.id && !row.gone).length,
        };
      }),
    };
  }

  async function read(user, id, after, from) {
    const [room, data] = await Promise.all([roomOf(user, id), loadMembers()]);
    const n = Math.max(0, Number(after) || 0);
    const messages = n
      ? await call(`chat_messages?room=eq.${q(id)}&id=gt.${n}&order=id.asc&limit=200&select=*`)
      : (await call(`chat_messages?room=eq.${q(id)}&order=id.desc&limit=80&select=*`)).reverse();
    const low = Math.min(Number(from) || Infinity, ...messages.map((row) => row.id));
    const [reacts, gone] = Number.isFinite(low)
      ? await Promise.all([call(`chat_reacts?room=eq.${q(id)}&message=gte.${low}&select=message,user_id,emoji`), call(`chat_messages?room=eq.${q(id)}&id=gte.${low}&gone=eq.true&select=id`)])
      : [[], []];
    const top = messages.length ? messages[messages.length - 1].id : 0;
    if (top) await call("chat_reads", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { room: id, user_id: user.id, last: top } });
    return { me: user.id, room: roomView(room, data.users, user.id), messages: messages.map(view), reacts, gone: gone.map((row) => row.id) };
  }

  async function post(user, body) {
    const action = String(body.action || ""), data = await loadMembers();
    const friends = new Set(friendIds(await linksOf(readKey), user.id));
    const make = async (members, pair, name) => {
      const row = { id: crypto.randomBytes(8).toString("hex"), name, members, pair, made_by: user.id };
      const made = await call("chat_rooms", { method: "POST", body: row });
      return roomView((made && made[0]) || row, data.users, user.id);
    };
    if (action === "open") {
      const them = String(body.id || "");
      if (!friends.has(them)) throw new Error("You can only chat with friends.");
      const pair = [user.id, them].sort().join("|"), find = async () => (await call(`chat_rooms?pair=eq.${q(pair)}&select=*`))[0];
      const had = await find();
      if (had) return { room: roomView(had, data.users, user.id) };
      try { return { room: await make([user.id, them], pair, "") }; } catch (error) { const now = await find(); if (now) return { room: roomView(now, data.users, user.id) }; throw error; }
    }
    if (action === "group") {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((id) => id && id !== user.id);
      if (ids.length < 2) throw new Error("Pick at least two friends for a group.");
      if (ids.some((id) => !friends.has(id))) throw new Error("You can only add friends.");
      if (ids.length >= GROUP_MAX) throw new Error(`A group holds up to ${GROUP_MAX} people.`);
      return { room: await make([user.id, ...ids], null, String(body.name || "").trim().slice(0, 40)) };
    }
    const room = await roomOf(user, String(body.room || ""));
    const touch = () => call(`chat_rooms?id=eq.${q(room.id)}`, { method: "PATCH", prefer: "return=minimal", body: { last_at: new Date().toISOString() } });
    if (action === "send") {
      const text = String(body.body || "").trim().slice(0, 500), bet = cleanBet(body.bet);
      if (!text && !bet) throw new Error("Type a message.");
      slow(user.id);
      const made = await call("chat_messages", { method: "POST", body: { room: room.id, from_id: user.id, from_name: nameOf(data.users, user.id), body: text, bet, reply: Number(body.reply) || null } });
      await touch();
      return { message: view(made[0]) };
    }
    if (action === "react") {
      const id = Number(body.message), emoji = String(body.emoji || "");
      if (!id || !REACTS.has(emoji)) throw new Error("Pick a reaction.");
      if (!(await call(`chat_messages?id=eq.${id}&room=eq.${q(room.id)}&select=id`)).length) throw new Error("That message is gone.");
      const had = await call(`chat_reacts?message=eq.${id}&user_id=eq.${q(user.id)}&select=emoji`);
      if (had[0] && had[0].emoji === emoji) await call(`chat_reacts?message=eq.${id}&user_id=eq.${q(user.id)}`, { method: "DELETE", prefer: "return=minimal" });
      else await call("chat_reacts", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { message: id, room: room.id, user_id: user.id, emoji } });
      return { reacts: await call(`chat_reacts?message=eq.${id}&select=message,user_id,emoji`) };
    }
    if (action === "delete") {
      await call(`chat_messages?id=eq.${Number(body.message) || 0}&room=eq.${q(room.id)}&from_id=eq.${q(user.id)}`, { method: "PATCH", prefer: "return=minimal", body: { gone: true, body: "", bet: null } });
      return { ok: true };
    }
    if (room.pair) throw new Error("That only works in a group.");
    if (action === "rename") {
      await call(`chat_rooms?id=eq.${q(room.id)}`, { method: "PATCH", prefer: "return=minimal", body: { name: String(body.name || "").trim().slice(0, 40) } });
      return { room: roomView({ ...room, name: String(body.name || "").trim().slice(0, 40) }, data.users, user.id) };
    }
    if (action === "add") {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((id) => !room.members.includes(id));
      if (ids.some((id) => !friends.has(id))) throw new Error("You can only add friends.");
      const members = [...room.members, ...ids];
      if (members.length > GROUP_MAX) throw new Error(`A group holds up to ${GROUP_MAX} people.`);
      await call(`chat_rooms?id=eq.${q(room.id)}`, { method: "PATCH", prefer: "return=minimal", body: { members } });
      return { room: roomView({ ...room, members }, data.users, user.id) };
    }
    if (action === "leave") {
      const members = room.members.filter((id) => id !== user.id);
      if (!members.length) await call(`chat_rooms?id=eq.${q(room.id)}`, { method: "DELETE", prefer: "return=minimal" });
      else await call(`chat_rooms?id=eq.${q(room.id)}`, { method: "PATCH", prefer: "return=minimal", body: { members } });
      return { left: true };
    }
    throw new Error("Unknown action.");
  }

  return { list, read, post };
}

module.exports = { createChat };
