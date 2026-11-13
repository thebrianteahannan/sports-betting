/** Chat with friends. A bubble in the corner opens a side panel: your chats, a new one-on-one or group chat, and the conversation with text, bets, stacks, replies, and reactions. Bet cards and sharing live in chat-card.js. */

const CHAT_REACTS = [["like", "👍", "Like"], ["fire", "🔥", "Fire"], ["fade", "👎", "Fade"]];
const CHAT_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>`;
const chat = { on: false, open: false, me: "", rooms: [], view: "list", room: null, msgs: [], reacts: [], reply: null, last: 0, friends: null, note: "", sharing: null, picking: false, shown: 0, sig: "" };
let chatListBusy = false, chatRoomBusy = false, chatTicks = 0;

function chatNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function chatButton(label, fn, className) {
  const go = chatNode("button", className || "chat-btn", label);
  go.type = "button";
  go.addEventListener("click", fn);
  return go;
}

async function chatCall(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { chat.on = false; chat.open = false; chatBubble(); chatPaint(); throw new Error("Sign in."); }
  if (!res.ok || data.error) throw new Error(data.error || "That did not go through.");
  return data;
}

function chatAgo(at) {
  const time = Date.parse(at || ""), min = Math.round((Date.now() - time) / 60000);
  if (!time) return "";
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function chatNameOf(id) {
  const one = chat.room && chat.room.members.find((row) => row.id === id);
  return id === chat.me ? "You" : one ? one.name : "";
}

async function chatLoad() {
  if (chatListBusy || document.visibilityState === "hidden") return;
  chatListBusy = true;
  try {
    const data = await chatCall("/api/chat");
    chat.on = true; chat.me = data.me; chat.rooms = data.rooms || [];
    if (chat.view === "list") chat.note = "";
  } catch (error) {
    if (chat.on) chat.note = error.message;
    console.log("[chat] list", error.message);
  } finally { chatListBusy = false; }
  chatBubble();
  if (chat.open && chat.view === "list") chatPaint();
  if (typeof chatTicketButton === "function") chatTicketButton();
}

function chatBubble() {
  let go = document.getElementById("chat-go");
  if (!go) {
    go = chatButton("", () => chatToggle(), "");
    go.id = "chat-go";
    go.setAttribute("aria-label", "Chats");
    go.title = "Chats";
    go.innerHTML = `${CHAT_ICON}<b hidden></b>`;
  }
  const who = document.getElementById("who");
  if (who && go.parentElement !== who) who.prepend(go);
  else if (!who && !go.isConnected) document.body.append(go);
  if (who && !who.dataset.chatWatch) { who.dataset.chatWatch = "1"; new MutationObserver(() => { if (!who.contains(document.getElementById("chat-go"))) chatBubble(); }).observe(who, { childList: true }); }
  go.hidden = !chat.on;
  const inside = chat.open && chat.view === "room" && chat.room, unread = chat.rooms.reduce((n, room) => n + (inside && room.id === chat.room.id ? 0 : room.unread || 0), 0), badge = go.querySelector("b");
  badge.hidden = !unread;
  badge.textContent = unread > 99 ? "99+" : String(unread);
  go.classList.toggle("on", chat.open);
}

function chatToggle(open = !chat.open) {
  chat.open = open;
  chatPaint();
  chatBubble();
  if (!open) return;
  chatLoad();
  if (chat.view === "room") chatRoomLoad();
}

function chatPanel() {
  let box = document.getElementById("chat-panel");
  if (!box) {
    box = chatNode("aside", "");
    box.id = "chat-panel";
    box.setAttribute("aria-label", "Chats");
    document.body.append(box);
  }
  return box;
}

function chatPaint() {
  const box = chatPanel();
  box.hidden = !chat.open;
  document.body.classList.toggle("chat-open", chat.open);
  if (!chat.open) return;
  const key = chat.view === "room" && chat.room ? `room:${chat.room.id}` : chat.view;
  if (chat.view === "room" && box.dataset.view === key) { chatRoomHead(); chatMsgsPaint(); return; }
  box.dataset.view = key;
  chat.sig = "";
  box.replaceChildren(...(chat.view === "new" || chat.view === "add" ? chatNewView() : chat.view === "room" ? chatRoomView() : chatListView()));
  if (chat.view === "room") { chatRoomHead(); chatMsgsPaint(true, true); }
}

function chatHead(title, back, extra = []) {
  const head = chatNode("div", "chat-head");
  if (back) { const go = chatButton("←", back, "chat-icon"); go.setAttribute("aria-label", "Back"); head.append(go); }
  head.append(chatNode("p", "chat-title", title), ...extra);
  const shut = chatButton("×", () => chatToggle(false), "chat-icon");
  shut.setAttribute("aria-label", "Close chats");
  head.append(shut);
  return head;
}

function chatListView() {
  const out = [chatHead("CHATS", null, [chatButton("New chat", () => { chat.view = "new"; chat.friends = null; chatPaint(); }, "chat-btn chat-btn-go")])];
  if (chat.sharing) {
    const bar = chatNode("div", "chat-sharing");
    bar.append(chatNode("span", "", `Pick a chat for ${chat.sharing.name}.`), chatButton("Cancel", () => { chat.sharing = null; chatPaint(); }, "chat-btn chat-btn-quiet"));
    out.push(bar);
  }
  if (chat.note) out.push(chatNode("p", "chat-note", chat.note));
  const list = chatNode("div", "chat-list");
  if (!chat.rooms.length) list.append(chatNode("p", "chat-empty", "Start a chat with a friend and send them tonight's bet."));
  chat.rooms.forEach((room) => {
    const last = room.last, who = !last ? "" : last.from === chat.me ? "You: " : room.group ? `${String(last.fromName || "").split(" ")[0]}: ` : "";
    const text = !last ? "No messages yet" : last.gone ? "Message deleted" : last.bet ? `${who}sent ${last.bet}` : `${who}${last.body}`;
    const row = chatButton("", () => chatEnter(room), `chat-row${room.unread ? " fresh" : ""}`);
    row.append(chatNode("b", "", room.name), chatNode("i", "", last ? chatAgo(last.at) : ""), chatNode("span", "", text));
    if (room.unread) row.append(chatNode("em", "", String(room.unread)));
    list.append(row);
  });
  out.push(list);
  return out;
}

async function chatFriendsLoad() {
  try { chat.friends = (await chatCall("/api/friends")).friends || []; } catch (error) { chat.friends = []; chat.note = error.message; }
  if (chat.view === "new" || chat.view === "add") { chatPanel().dataset.view = ""; chatPaint(); }
}

function chatNewView() {
  const adding = chat.view === "add", body = chatNode("div", "chat-new");
  const head = chatHead(adding ? "Add people" : "New chat", () => { chat.view = adding ? "room" : "list"; chatPaint(); });
  if (!chat.friends) { body.append(chatNode("p", "chat-empty", "Loading your friends.")); chatFriendsLoad(); return [head, body]; }
  const pool = chat.friends.filter((one) => !adding || !chat.room.members.some((row) => row.id === one.id));
  if (!pool.length) {
    body.append(chatNode("p", "chat-empty", adding ? "Every friend you have is already in this chat." : "Add a friend on your profile, then chat with them here."));
    if (!adding && typeof friendsAdd === "function") body.append(friendsAdd());
    return [head, body];
  }
  const name = chatNode("input", "chat-name"), note = chatNode("p", "chat-note");
  name.placeholder = "Group name (optional)"; name.maxLength = 40; name.hidden = true;
  const picked = () => [...body.querySelectorAll("input[type=checkbox]:checked")].map((box) => box.value);
  const go = chatButton(adding ? "Add" : "Start chat", async () => {
    const ids = picked();
    if (!ids.length) return;
    go.disabled = true;
    try {
      const data = await chatCall("/api/chat", adding ? { action: "add", room: chat.room.id, ids } : ids.length === 1 ? { action: "open", id: ids[0] } : { action: "group", ids, name: name.value });
      chatLoad();
      chatEnter(data.room);
    } catch (error) { note.textContent = error.message; go.disabled = false; }
  }, "chat-btn chat-btn-go");
  go.disabled = true;
  const sync = () => { const n = picked().length; go.disabled = !n; name.hidden = adding || n < 2; go.textContent = adding ? "Add" : n > 1 ? "Start group" : "Start chat"; };
  pool.forEach((one) => {
    const label = chatNode("label", "chat-friend"), box = chatNode("input");
    box.type = "checkbox"; box.value = one.id;
    box.addEventListener("change", sync);
    label.append(box, chatNode("span", "", one.name));
    body.append(label);
  });
  body.append(name, go, note);
  return [head, body];
}

function chatEnter(room) {
  const sharing = chat.sharing;
  chat.sharing = null;
  Object.assign(chat, { view: "room", room, msgs: [], reacts: [], reply: null, last: 0, picking: false, shown: 0, note: "" });
  const row = chat.rooms.find((one) => one.id === room.id);
  if (row) row.unread = 0;
  chatPaint();
  chatBubble();
  chatRoomLoad().then(() => { if (sharing) chatSend("", sharing); });
}

async function chatRoomLoad() {
  const room = chat.room;
  if (!room || chatRoomBusy) return;
  chatRoomBusy = true;
  try {
    const data = await chatCall(`/api/chat/room?${new URLSearchParams({ id: room.id, after: chat.last, from: chat.msgs.length ? chat.msgs[0].id : 0 })}`);
    if (!chat.room || chat.room.id !== room.id) return;
    chat.room = { ...chat.room, ...data.room };
    chat.me = data.me || chat.me;
    const have = new Set(chat.msgs.map((msg) => msg.id)), gone = new Set(data.gone || []);
    chat.msgs = chat.msgs.concat((data.messages || []).filter((msg) => !have.has(msg.id)));
    chat.msgs.forEach((msg) => { if (gone.has(msg.id)) Object.assign(msg, { gone: true, body: "", bet: null }); });
    chat.reacts = data.reacts || [];
    chat.last = chat.msgs.length ? chat.msgs[chat.msgs.length - 1].id : 0;
  } catch (error) {
    chat.note = error.message;
    if (/gone/.test(error.message)) { chat.view = "list"; chat.room = null; chatLoad(); }
  } finally { chatRoomBusy = false; }
  if (typeof chatGamesLoad === "function") chatGamesLoad();
  chatPaint();
}

function chatRoomView() {
  const msgs = chatNode("div", "chat-msgs"), pick = chatNode("div", "chat-pick");
  pick.hidden = true;
  return [chatNode("div", "chat-head chat-room-head"), chatNode("p", "chat-note"), msgs, pick, chatComposer()];
}

function chatRoomHead() {
  const spot = document.querySelector("#chat-panel .chat-room-head"), room = chat.room;
  if (!spot || !room) return;
  const sig = JSON.stringify([room.name, room.members]);
  if (spot.dataset.sig === sig) return;
  const extra = [];
  if (room.group) {
    extra.push(chatButton("Add", () => { chat.view = "add"; chat.friends = null; chatPaint(); }, "chat-btn chat-btn-quiet"));
    extra.push(chatButton("Rename", async () => {
      const name = window.prompt("Name this group", room.name);
      if (name == null) return;
      try { chat.room = { ...chat.room, ...(await chatCall("/api/chat", { action: "rename", room: room.id, name })).room }; chatPaint(); chatLoad(); } catch (error) { chat.note = error.message; chatMsgsPaint(true); }
    }, "chat-btn chat-btn-quiet"));
    extra.push(chatButton("Leave", async () => {
      if (!window.confirm(`Leave ${room.name}?`)) return;
      try { await chatCall("/api/chat", { action: "leave", room: room.id }); chat.view = "list"; chat.room = null; chatPaint(); chatLoad(); } catch (error) { chat.note = error.message; chatMsgsPaint(true); }
    }, "chat-btn chat-btn-quiet"));
  }
  const head = chatHead(room.name, () => { chat.view = "list"; chat.room = null; chatPaint(); chatLoad(); }, extra);
  if (room.group) head.querySelector(".chat-title").append(chatNode("i", "", `${room.members.length} people`));
  spot.replaceChildren(...head.childNodes);
  spot.dataset.sig = sig;
}

function chatComposer() {
  const form = chatNode("form", "chat-form"), quote = chatNode("p", "chat-quote"), text = chatNode("textarea");
  quote.hidden = true;
  text.rows = 1; text.maxLength = 500; text.placeholder = "Message"; text.setAttribute("aria-label", "Message");
  const bet = chatButton("Bet", () => { chat.picking = !chat.picking; if (typeof chatPickPaint === "function") chatPickPaint(); }, "chat-btn chat-btn-bet");
  bet.title = "Send a bet or a stack";
  const send = chatNode("button", "chat-btn chat-btn-go", "Send");
  send.type = "submit";
  text.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", (event) => { event.preventDefault(); const body = text.value.trim(); if (!body) return; text.value = ""; chatSend(body, null); });
  form.append(quote, text, bet, send);
  return form;
}

function chatQuotePaint() {
  const quote = document.querySelector("#chat-panel .chat-quote"), msg = chat.reply;
  if (!quote) return;
  quote.hidden = !msg;
  quote.replaceChildren();
  if (!msg) return;
  quote.append(chatNode("span", "", `Replying to ${chatNameOf(msg.from) || msg.fromName}: ${msg.bet ? msg.bet.name : msg.body}`.slice(0, 120)), chatButton("×", () => { chat.reply = null; chatQuotePaint(); }, "chat-icon"));
}

async function chatSend(body, bet) {
  const room = chat.room, reply = chat.reply;
  if (!room) return;
  chat.reply = null;
  chatQuotePaint();
  try {
    await chatCall("/api/chat", { action: "send", room: room.id, body, bet, reply: reply ? reply.id : null });
    chat.note = "";
  } catch (error) { chat.note = error.message; }
  await chatRoomLoad();
  const box = document.querySelector("#chat-panel .chat-msgs");
  if (box) box.scrollTop = box.scrollHeight;
}

async function chatReact(msg, emoji) {
  try {
    const data = await chatCall("/api/chat", { action: "react", room: chat.room.id, message: msg.id, emoji });
    chat.reacts = chat.reacts.filter((row) => row.message !== msg.id).concat(data.reacts || []);
  } catch (error) { chat.note = error.message; }
  chatMsgsPaint(true);
}

async function chatDelete(msg) {
  if (!window.confirm("Delete this message?")) return;
  try {
    await chatCall("/api/chat", { action: "delete", room: chat.room.id, message: msg.id });
    Object.assign(msg, { gone: true, body: "", bet: null });
  } catch (error) { chat.note = error.message; }
  chatMsgsPaint(true);
}

function chatMsgNode(msg, prev) {
  const mine = msg.from === chat.me, row = chatNode("div", `chat-msg${mine ? " mine" : ""}${chat.shown === msg.id ? " show" : ""}`);
  if (!mine && chat.room.group && (!prev || prev.from !== msg.from)) row.append(chatNode("p", "chat-who", msg.fromName));
  const bubble = chatNode("div", "chat-bubble");
  if (msg.reply) {
    const to = chat.msgs.find((one) => one.id === msg.reply);
    bubble.append(chatNode("p", "chat-replied", to ? `${chatNameOf(to.from) || to.fromName}: ${to.gone ? "Message deleted" : to.bet ? to.bet.name : to.body}`.slice(0, 120) : "Earlier message"));
  }
  if (msg.gone) bubble.append(chatNode("p", "chat-gone", "Message deleted"));
  if (msg.bet && typeof chatBetCard === "function") bubble.append(chatBetCard(msg));
  if (msg.body) bubble.append(chatNode("p", "chat-text", msg.body));
  bubble.addEventListener("click", (event) => { if (event.target.closest("button, a, input")) return; chat.shown = chat.shown === msg.id ? 0 : msg.id; chatMsgsPaint(true); });
  row.append(bubble);
  const mineReacts = chat.reacts.filter((one) => one.message === msg.id), tally = chatNode("p", "chat-reacts");
  CHAT_REACTS.forEach(([key, icon, label]) => {
    const who = mineReacts.filter((one) => one.emoji === key);
    if (!who.length) return;
    const chip = chatButton(`${icon} ${who.length}`, () => chatReact(msg, key), `chat-react${who.some((one) => one.user_id === chat.me) ? " on" : ""}`);
    chip.title = `${label}: ${who.map((one) => chatNameOf(one.user_id) || "Former member").join(", ")}`;
    tally.append(chip);
  });
  if (tally.childElementCount) row.append(tally);
  const meta = chatNode("p", "chat-meta");
  meta.append(chatNode("i", "", chatAgo(msg.at)));
  if (!msg.gone) {
    CHAT_REACTS.forEach(([key, icon, label]) => { const go = chatButton(icon, () => chatReact(msg, key), "chat-act"); go.title = label; go.setAttribute("aria-label", label); meta.append(go); });
    meta.append(chatButton("Reply", () => { chat.reply = msg; chatQuotePaint(); const text = document.querySelector("#chat-panel .chat-form textarea"); if (text) text.focus(); }, "chat-act"));
    if (mine) meta.append(chatButton("Delete", () => chatDelete(msg), "chat-act"));
  }
  row.append(meta);
  return row;
}

function chatMsgsPaint(force, toBottom) {
  const box = document.querySelector("#chat-panel .chat-msgs"), note = document.querySelector("#chat-panel .chat-note");
  if (note) { note.textContent = chat.note; note.hidden = !chat.note; }
  if (!box || !chat.room) return;
  const sig = JSON.stringify([chat.msgs.map((msg) => [msg.id, msg.gone]), chat.reacts, chat.shown, typeof chatCardSig === "function" ? chatCardSig() : 0]);
  if (!force && sig === chat.sig) return;
  chat.sig = sig;
  const near = toBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  box.replaceChildren(...chat.msgs.map((msg, at) => chatMsgNode(msg, chat.msgs[at - 1])));
  if (!chat.msgs.length) box.append(chatNode("p", "chat-empty", chat.room.group ? "Say hi to the group, or send the bet you like tonight." : "Say hi, or send the bet you like tonight."));
  if (near) box.scrollTop = box.scrollHeight;
}

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && chat.open) chatToggle(false); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") chatLoad(); });
setInterval(() => {
  chatTicks += 1;
  if (chat.open && chat.view === "room" && document.visibilityState === "visible") chatRoomLoad();
  if (chatTicks % (chat.open ? 2 : 5) === 0) chatLoad();
}, 4000);
setTimeout(chatLoad, 1500);
