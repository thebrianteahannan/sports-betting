/** Chat with friends. A bubble in the corner opens a side panel: your chats, a new one-on-one or group chat, and the conversation with text, bets, stacks, replies, and reactions. Bet cards and sharing live in chat-card.js. */

const CHAT_REACTS = [["like", "👍", "Like"], ["fire", "🔥", "Fire"], ["fade", "👎", "Fade"]];
const CHAT_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>`;
const chat = { on: false, open: false, me: "", rooms: [], view: "list", room: null, msgs: [], reacts: [], reply: null, last: 0, friends: null, note: "", sharing: null, picking: false, shown: 0, sig: "", more: false, people: false, notifyReady: false, notifySnap: null, shot: "" };
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

function chatNotifyWatch() {
  return typeof notifyOn === "function" && notifyOn() && typeof Notification !== "undefined" && Notification.permission === "granted";
}

function chatNotifySnap() {
  const out = {};
  chat.rooms.forEach((room) => {
    out[room.id] = { last: room.last && room.last.id, from: room.last && room.last.from, unread: room.unread || 0 };
  });
  return out;
}

function chatNotifyArm() {
  chat.notifySnap = chatNotifySnap();
  chat.notifyReady = true;
}

function chatNotifyCheck(prev) {
  if (!chat.notifyReady || !prev || !chatNotifyWatch()) return;
  if (document.visibilityState !== "hidden") return;
  if (typeof notifyShow !== "function") return;
  chat.rooms.forEach((room) => {
    const last = room.last;
    if (!last || last.gone || last.from === chat.me) return;
    const before = prev[room.id];
    if (before && before.last && Number(last.id) <= Number(before.last)) return;
    const who = room.group && last.fromName ? String(last.fromName).split(" ")[0] + ": " : "";
    const body = last.bet ? `${who}sent ${last.bet}` : last.shot && !last.body ? `${who}sent a screenshot` : `${who}${last.body || "New message"}`;
    notifyShow({
      title: room.name || "New message",
      body,
      tag: `chat-${room.id}`,
      data: { room: room.id },
      click: () => {
        chatToggle(true);
        const hit = chat.rooms.find((row) => row.id === room.id);
        if (hit) chatEnter(hit);
      },
    });
  });
}

window.chatNotifyArm = chatNotifyArm;

async function chatLoad() {
  const watch = chatNotifyWatch();
  if (chatListBusy || (document.visibilityState === "hidden" && !watch)) return;
  chatListBusy = true;
  const prev = chat.notifySnap;
  try {
    const data = await chatCall("/api/chat");
    chat.on = true; chat.me = data.me; chat.rooms = data.rooms || [];
    if (chat.room && chat.view === "room" && chat.seen) { const row = chat.rooms.find((room) => room.id === chat.room.id); if (row) row.unread = chat.msgs.filter((msg) => !msg.gone && msg.from !== chat.me && msg.id > chat.seen).length; }
    if (chat.view === "list") chat.note = "";
  } catch (error) {
    if (chat.on) chat.note = error.message;
    console.log("[chat] list", error.message);
  } finally { chatListBusy = false; }
  chatNotifyCheck(prev);
  chat.notifySnap = chatNotifySnap();
  chat.notifyReady = true;
  chatBubble();
  if (chat.open && chat.view === "list") chatPaint();
  else if (chat.open) chatReadBar();
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
  const unread = chatUnread(), badge = go.querySelector("b");
  badge.hidden = !unread;
  badge.textContent = unread > 99 ? "99+" : String(unread);
  go.setAttribute("aria-label", unread ? `Chats, ${unread} unread` : "Chats");
  go.classList.toggle("on", chat.open);
}

function chatUnread() {
  return chat.rooms.reduce((n, room) => n + (room.unread || 0), 0);
}

function chatToggle(open = !chat.open) {
  chat.open = open;
  chatPaint();
  chatBubble();
  if (!open) return;
  chatLoad();
  if (chat.view === "room") chatRoomLoad();
}

function chatFitKeys() {
  const box = document.getElementById("chat-panel");
  const view = window.visualViewport;
  if (!box || !view) return;
  const covered = Math.max(0, window.innerHeight - view.offsetTop - view.height);
  const typing = chat.open && covered > 80 && box.contains(document.activeElement);
  box.style.top = typing ? `${view.offsetTop}px` : "";
  box.style.height = typing ? `${view.height}px` : "";
  box.style.bottom = typing ? "auto" : "";
  box.style.width = typing ? `${view.width}px` : "";
}

function chatWatchKeys() {
  if (chatWatchKeys.ready || !window.visualViewport) return;
  chatWatchKeys.ready = true;
  const run = () => chatFitKeys();
  visualViewport.addEventListener("resize", run);
  visualViewport.addEventListener("scroll", run);
  window.addEventListener("focusin", run);
  window.addEventListener("focusout", () => { setTimeout(run, 0); });
}

function chatPanel() {
  let box = document.getElementById("chat-panel");
  if (!box) {
    box = chatNode("aside", "");
    box.id = "chat-panel";
    box.setAttribute("aria-label", "Chats");
    document.body.append(box);
    chatWatchKeys();
  }
  return box;
}

function chatPaint() {
  const box = chatPanel();
  box.hidden = !chat.open;
  document.body.classList.toggle("chat-open", chat.open);
  if (!chat.open) return;
  const key = chat.view === "room" && chat.room ? `room:${chat.room.id}` : chat.view;
  if (chat.view === "room" && box.dataset.view === key) { chatRoomHead(); chatMsgsPaint(); chatReadBar(); return; }
  box.dataset.view = key;
  chat.sig = "";
  box.replaceChildren(...(chat.view === "new" || chat.view === "add" ? chatNewView() : chat.view === "friend" ? chatFriendView() : chat.view === "settings" ? chatSettingsView() : chat.view === "room" ? chatRoomView() : chatListView()));
  if (chat.view === "room") { chatRoomHead(); chatMsgsPaint(true, true); }
  if (chat.view === "settings" && window.paintNotify) paintNotify();
  chatReadBar();
}

function chatReadBar() {
  const box = document.getElementById("chat-panel");
  if (!box || box.hidden) return;
  const n = chatUnread();
  let bar = box.querySelector(".chat-readbar");
  if (!n) { if (bar) bar.remove(); return; }
  if (!bar) { bar = chatNode("div", "chat-readbar"); const head = box.querySelector(".chat-head"); if (head) head.after(bar); else box.prepend(bar); }
  const word = n === 1 ? "1 unread" : `${n} unread`;
  bar.replaceChildren(chatNode("span", "", word), chatButton("Mark all as read", chatMarkAll, "chat-btn"));
}

async function chatMarkAll() {
  const bar = document.querySelector("#chat-panel .chat-readbar button");
  if (bar) bar.disabled = true;
  try {
    await chatCall("/api/chat", { action: "seen" });
    chat.rooms.forEach((room) => { room.unread = 0; });
    if (chat.msgs.length) chat.seen = chat.msgs[chat.msgs.length - 1].id;
    chat.note = "";
  } catch (error) { chat.note = error.message; }
  chatBubble();
  chatPaint();
}

function chatHead(title, back, extra = []) {
  const head = chatNode("div", "chat-head");
  if (back) { const go = chatButton("←", back, "chat-icon"); go.setAttribute("aria-label", "Back"); head.append(go); }
  head.append(chatNode("div", "chat-title", title), ...extra);
  const shut = chatButton("×", () => chatToggle(false), "chat-icon");
  shut.setAttribute("aria-label", "Close chats");
  head.append(shut);
  return head;
}

function chatSettingsGear() {
  const go = chatButton("", () => { chat.view = "settings"; chatPaint(); }, "chat-icon");
  go.setAttribute("aria-label", "Chat settings");
  go.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`;
  return go;
}

function chatSettingsView() {
  const head = chatHead("Settings", () => { chat.view = "list"; chatPaint(); });
  const body = chatNode("div", "chat-settings");
  const say = chatNode("p", "chat-settings-say", "Get a browser alert when someone messages you. Keep this site open in a tab — even in the background is enough.");
  const acts = chatNode("p", "chat-settings-acts");
  const onBtn = chatButton("Notify me", () => { if (window.notifyEnable) notifyEnable(); }, "chat-btn");
  onBtn.id = "chat-notify-on";
  onBtn.setAttribute("aria-pressed", "false");
  const offBtn = chatButton("Off", () => { if (window.notifyDisable) notifyDisable(); }, "chat-btn");
  offBtn.id = "chat-notify-off";
  offBtn.setAttribute("aria-pressed", "true");
  acts.append(onBtn, offBtn);
  const note = chatNode("p", "chat-note");
  note.id = "chat-notify-note";
  note.hidden = true;
  body.append(say, acts, note);
  return [head, body];
}

function chatListView() {
  const out = [chatHead("CHATS", null, [chatButton("Add a friend", () => { chat.view = "friend"; chatPaint(); }, "chat-btn"), chatButton("New chat", () => { chat.view = "new"; chat.friends = null; chatPaint(); }, "chat-btn chat-btn-go"), chatSettingsGear()])];
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
    const text = !last ? "No messages yet" : last.gone ? "Message deleted" : last.bet ? `${who}sent ${last.bet}` : last.shot && !last.body ? `${who}sent a screenshot` : `${who}${last.body}`;
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

function chatFriendView() {
  const head = chatHead("Add a friend", () => { chat.view = "list"; chatPaint(); });
  const body = chatNode("div", "chat-new");
  if (typeof friendsAdd === "function") body.append(friendsAdd());
  else body.append(chatNode("p", "chat-empty", "Friend search is not ready."));
  return [head, body];
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
  Object.assign(chat, { view: "room", room, msgs: [], reacts: [], reply: null, last: 0, seen: 0, reads: [], picking: false, shown: 0, note: "" });
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
    chat.seen = Math.max(chat.seen || 0, Number(data.seen) || 0);
    chat.reads = data.reads || [];
    chat.last = chat.msgs.length ? chat.msgs[chat.msgs.length - 1].id : 0;
  } catch (error) {
    chat.note = error.message;
    if (/gone/.test(error.message)) { chat.view = "list"; chat.room = null; chatLoad(); }
  } finally { chatRoomBusy = false; }
  chatMarkOpen();
  if (typeof chatGamesLoad === "function") chatGamesLoad();
  chatPaint();
}

function chatMarkOpen() {
  if (!chat.open || chat.view !== "room" || !chat.room || document.visibilityState === "hidden") return;
  const top = chat.msgs.reduce((n, msg) => msg.gone ? n : Math.max(n, msg.id || 0), 0);
  if (!top || top <= (chat.seen || 0) || !chat.msgs.some((msg) => !msg.gone && msg.from !== chat.me && msg.id > (chat.seen || 0))) return;
  const id = chat.room.id;
  chat.seen = top;
  const row = chat.rooms.find((room) => room.id === id);
  if (row) row.unread = 0;
  chatCall("/api/chat", { action: "seen", room: id }).catch((error) => console.log("[chat] could not mark the chat read", error));
  chatBubble();
}

function chatRoomView() {
  const msgs = chatNode("div", "chat-msgs"), pick = chatNode("div", "chat-pick");
  pick.hidden = true;
  return [chatNode("div", "chat-head chat-room-head"), chatNode("p", "chat-note"), msgs, pick, chatComposer()];
}

function chatRoomHead() {
  const spot = document.querySelector("#chat-panel .chat-room-head"), room = chat.room;
  if (!spot || !room) return;
  const sig = JSON.stringify([room.name, room.members, chat.more, chat.people]);
  if (spot.dataset.sig === sig) return;
  const extra = [];
  if (room.group) {
    const more = chatButton("···", (event) => { event.stopPropagation(); chat.more = !chat.more; chat.people = false; chatRoomHead(); }, "chat-icon");
    more.setAttribute("aria-label", "Chat options");
    more.setAttribute("aria-expanded", chat.more ? "true" : "false");
    extra.push(more);
  }
  const head = chatHead(room.name, () => { chat.more = false; chat.people = false; chat.view = "list"; chat.room = null; chatPaint(); chatLoad(); }, extra);
  if (room.group) {
    const who = chatButton(`${room.members.length} ${room.members.length === 1 ? "person" : "people"}`, (event) => { event.stopPropagation(); chat.people = !chat.people; chat.more = false; chatRoomHead(); }, "chat-people");
    who.setAttribute("aria-expanded", chat.people ? "true" : "false");
    head.querySelector(".chat-title").append(who);
  }
  spot.replaceChildren(...head.childNodes);
  if (room.group && chat.more) spot.append(chatMoreMenu(room));
  if (room.group && chat.people) spot.append(chatPeopleList(room));
  spot.dataset.sig = sig;
}

function chatMoreMenu(room) {
  const menu = chatNode("div", "chat-menu");
  menu.append(chatButton("Add", () => { chat.more = false; chat.view = "add"; chat.friends = null; chatPaint(); }, "chat-menu-go"));
  menu.append(chatButton("Rename", async () => {
    chat.more = false;
    const name = window.prompt("Name this group", room.name);
    if (name == null) { chatRoomHead(); return; }
    try { chat.room = { ...chat.room, ...(await chatCall("/api/chat", { action: "rename", room: room.id, name })).room }; chatPaint(); chatLoad(); } catch (error) { chat.note = error.message; chatMsgsPaint(true); }
  }, "chat-menu-go"));
  menu.append(chatButton("Leave", async () => {
    chat.more = false;
    if (!window.confirm(`Leave ${room.name}?`)) { chatRoomHead(); return; }
    try { await chatCall("/api/chat", { action: "leave", room: room.id }); chat.view = "list"; chat.room = null; chatPaint(); chatLoad(); } catch (error) { chat.note = error.message; chatMsgsPaint(true); }
  }, "chat-menu-go"));
  return menu;
}

function chatPeopleList(room) {
  const box = chatNode("div", "chat-people-list");
  const you = room.members.find((one) => one.id === chat.me), rest = room.members.filter((one) => one.id !== chat.me);
  [you, ...rest].filter(Boolean).forEach((one) => box.append(chatNode("p", "", one.id === chat.me ? `${one.name} (you)` : one.name)));
  return box;
}

function chatShotPaint() {
  const form = document.querySelector("#chat-panel .chat-form"), hold = form && form.querySelector(".chat-shot");
  if (!hold) return;
  hold.replaceChildren();
  hold.hidden = !chat.shot;
  if (!chat.shot) return;
  const img = chatNode("img", "chat-shot-img");
  img.src = chat.shot;
  img.alt = "Screenshot ready to send";
  hold.append(img, chatButton("×", () => { chat.shot = ""; chatShotPaint(); }, "chat-icon"));
}

async function chatShotTake(file) {
  if (!file || typeof howsFit !== "function") return;
  try {
    chat.shot = await howsFit(file);
    chat.note = "";
    chatShotPaint();
  } catch (error) { chat.note = error.message; chatMsgsPaint(true); }
}

function chatComposer() {
  const form = chatNode("form", "chat-form"), quote = chatNode("p", "chat-quote"), shot = chatNode("div", "chat-shot"), text = chatNode("textarea");
  quote.hidden = true;
  shot.hidden = true;
  text.rows = 1; text.maxLength = 500; text.placeholder = "Message or paste a screenshot"; text.setAttribute("aria-label", "Message");
  text.autocomplete = "off"; text.autocapitalize = "sentences"; text.enterKeyHint = "send";
  const bet = chatButton("Bet", () => { chat.picking = !chat.picking; if (typeof chatPickPaint === "function") chatPickPaint(); }, "chat-btn chat-btn-bet");
  bet.title = "Send a bet or a stack";
  const send = chatNode("button", "chat-btn chat-btn-go", "Send");
  send.type = "submit";
  text.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  text.addEventListener("paste", (event) => {
    const files = typeof howsFiles === "function" ? howsFiles(event.clipboardData) : [];
    if (!files.length) return;
    event.preventDefault();
    chatShotTake(files[0]);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = text.value.trim(), image = chat.shot;
    if (!body && !image) return;
    text.value = "";
    chat.shot = "";
    chatShotPaint();
    chatSend(body, null, image);
  });
  form.append(quote, shot, text, bet, send);
  return form;
}

function chatQuotePaint() {
  const quote = document.querySelector("#chat-panel .chat-quote"), msg = chat.reply;
  if (!quote) return;
  quote.hidden = !msg;
  quote.replaceChildren();
  if (!msg) return;
  quote.append(chatNode("span", "", `Replying to ${chatNameOf(msg.from) || msg.fromName}: ${msg.bet ? msg.bet.name : msg.body || (msg.shot ? "Screenshot" : "")}`.slice(0, 120)), chatButton("×", () => { chat.reply = null; chatQuotePaint(); }, "chat-icon"));
}

async function chatSend(body, bet, shot) {
  const room = chat.room, reply = chat.reply;
  if (!room) return;
  chat.reply = null;
  chatQuotePaint();
  try {
    await chatCall("/api/chat", { action: "send", room: room.id, body, bet, shot: shot || undefined, reply: reply ? reply.id : null });
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
    Object.assign(msg, { gone: true, body: "", bet: null, shot: null });
  } catch (error) { chat.note = error.message; }
  chatMsgsPaint(true);
}

function chatStateOf(msg) {
  if (!msg || msg.gone) return "";
  if (msg.from === chat.me) {
    const others = ((chat.room && chat.room.members) || []).filter((one) => one.id !== chat.me);
    const read = others.length && others.every((one) => (chat.reads || []).some((row) => row.id === one.id && row.last >= msg.id));
    return read ? "Read" : "Unread";
  }
  return msg.id > (chat.seen || 0) ? "Unread" : "Read";
}

function chatMsgNode(msg, prev) {
  const mine = msg.from === chat.me, state = chatStateOf(msg), row = chatNode("div", `chat-msg${mine ? " mine" : ""}${state === "Unread" ? " unread" : ""}${chat.shown === msg.id ? " show" : ""}`);
  if (!mine && chat.room.group && (!prev || prev.from !== msg.from)) row.append(chatNode("p", "chat-who", msg.fromName));
  const bubble = chatNode("div", "chat-bubble");
  if (msg.reply) {
    const to = chat.msgs.find((one) => one.id === msg.reply);
    bubble.append(chatNode("p", "chat-replied", to ? `${chatNameOf(to.from) || to.fromName}: ${to.gone ? "Message deleted" : to.bet ? to.bet.name : to.body || (to.shot ? "Screenshot" : "")}`.slice(0, 120) : "Earlier message"));
  }
  if (msg.gone) bubble.append(chatNode("p", "chat-gone", "Message deleted"));
  if (msg.bet && typeof chatBetCard === "function") bubble.append(chatBetCard(msg));
  if (msg.shot && msg.shot.id) {
    const img = chatNode("img", "chat-photo");
    img.src = `/api/chat/shot?id=${encodeURIComponent(msg.shot.id)}`;
    img.alt = "Screenshot";
    img.loading = "lazy";
    img.addEventListener("click", (event) => { event.stopPropagation(); window.open(img.src, "_blank", "noopener"); });
    bubble.append(img);
  }
  if (msg.body) bubble.append(chatNode("p", "chat-text", msg.body));
  bubble.addEventListener("click", (event) => { if (event.target.closest("button, a, input, img")) return; chat.shown = chat.shown === msg.id ? 0 : msg.id; chatMsgsPaint(true); });
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
  if (state) meta.append(chatNode("i", `chat-state ${state === "Unread" ? "unread" : "read"}`, state));
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
  const sig = JSON.stringify([chat.msgs.map((msg) => [msg.id, msg.gone, msg.shot && msg.shot.id]), chat.reacts, chat.shown, chat.seen, chat.reads, typeof chatCardSig === "function" ? chatCardSig() : 0]);
  if (!force && sig === chat.sig) return;
  chat.sig = sig;
  const near = toBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  box.replaceChildren(...chat.msgs.map((msg, at) => chatMsgNode(msg, chat.msgs[at - 1])));
  if (!chat.msgs.length) box.append(chatNode("p", "chat-empty", chat.room.group ? "Say hi to the group, or send the bet you like tonight." : "Say hi, or send the bet you like tonight."));
  if (near) box.scrollTop = box.scrollHeight;
}

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && chat.open) chatToggle(false); });
document.addEventListener("click", (event) => {
  if (!chat.more && !chat.people) return;
  if (event.target.closest && event.target.closest(".chat-menu, .chat-people-list, .chat-people, [aria-label='Chat options']")) return;
  chat.more = false;
  chat.people = false;
  if (chat.view === "room") chatRoomHead();
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") chatLoad(); });
setInterval(() => {
  chatTicks += 1;
  if (chat.open && chat.view === "room" && document.visibilityState === "visible") chatRoomLoad();
  const every = chat.open ? 2 : (chatNotifyWatch() ? 3 : 5);
  if (chatTicks % every === 0) chatLoad();
}, 4000);
setTimeout(chatLoad, 1500);
