/** Friends and bets they send you. The share card gets a "Send to a friend" button; the saved row gets a Shared panel. */

window.friendsData = window.friendsData || { friends: [], incoming: [], outgoing: [] };
window.sharedItems = window.sharedItems || [];
window.sharedOpen = window.sharedOpen || false;
let friendsBusy = false, shareRaw = null;

async function friendsCall(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "That did not go through.");
  return data;
}

async function friendsLoad() {
  if (!window.saveWho || friendsBusy) return;
  friendsBusy = true;
  try {
    const [friends, shared] = await Promise.all([friendsCall("/api/friends"), friendsCall("/api/shared")]);
    window.friendsData = friends;
    window.sharedItems = shared.items || [];
    if (document.querySelector(".find-board") && typeof paintParlay === "function") paintParlay();
  } catch (error) { console.log("[friends] could not load", error); } finally { friendsBusy = false; }
}

const friendsWait = setInterval(() => { if (window.saveWho) { clearInterval(friendsWait); friendsLoad(); setInterval(friendsLoad, 2 * 60000); } }, 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") friendsLoad(); });

function friendsAgo(at) {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 60) return min <= 1 ? "just now" : `${min} minutes ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function friendsButton(label, fn, cls) {
  const go = document.createElement("button");
  go.type = "button";
  go.className = cls || "find-friends-go";
  go.textContent = label;
  go.addEventListener("click", fn);
  return go;
}

async function friendsAct(body, note) {
  try { window.friendsData = await friendsCall("/api/friends", body); if (note) note.textContent = ""; paintParlay(); } catch (error) { if (note) note.textContent = error.message; }
}

function friendsAdd() {
  const form = document.createElement("form");
  form.className = "find-friends-add";
  form.innerHTML = `<input type="email" placeholder="Friend's email" aria-label="Friend's email" required><button type="submit" class="find-friends-go">Send request</button><p class="find-friends-note"></p>`;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("input"), note = form.querySelector("p");
    try { window.friendsData = await friendsCall("/api/friends", { action: "ask", email: input.value }); input.value = ""; note.textContent = "Request sent. Once they accept, you can send them bets."; paintParlay(); } catch (error) { note.textContent = error.message; }
  });
  return form;
}

function sharedToTray(item) {
  if (typeof saveNew === "function") saveNew();
  const board = document.querySelector(".find-board"), people = (board && board.people) || [];
  item.legs.forEach((bet) => {
    let live = null, owner = null;
    people.some((one) => { const hit = (one.bets || []).find((row) => row.label === bet.label && row.market === bet.market && row.match === bet.match); if (hit) { live = hit; owner = one; } return Boolean(hit); });
    const leg = live || bet;
    parlayLeg.set(parlayKey(leg), leg);
    if (owner && owner.kind === "player" && !parlayPick.has(owner.key)) parlayPick.set(owner.key, owner);
  });
  if (typeof trayRoster === "function") trayRoster();
  window.sharedOpen = false;
  paintParlay();
  document.querySelectorAll(".find-tray.find-shut .find-fold").forEach((fold) => fold.click());
  const tray = document.querySelector(".find-tray:not([hidden])");
  if (tray) tray.scrollIntoView({ block: "start", behavior: "smooth" });
}

function sharedCard(item) {
  const card = document.createElement("div");
  card.className = `find-shared-card${item.seen ? "" : " fresh"}`;
  const price = typeof savePrice === "function" ? savePrice(item.legs) : "";
  const games = typeof gameShortList === "function" ? gameShortList(item.legs) : "";
  const started = item.legs.every((leg) => Date.parse(leg.kickoff || "") < Date.now());
  card.innerHTML = `<p class="find-shared-head"><b>${esc(item.fromName)}</b><span>${esc(friendsAgo(item.at))}</span>${price ? `<i>${esc(price)}</i>` : ""}${games ? `<span>${esc(games)}</span>` : ""}</p>${item.note ? `<p class="find-shared-note">“${esc(item.note)}”</p>` : ""}<ul>${item.legs.map((leg) => `<li><span>${esc(String(leg.label || "").replace(/^Alternate Total \w+:\s*/i, ""))}</span>${Number.isFinite(Number(leg.odds)) ? `<em>${esc(Number(leg.odds) > 0 ? `+${leg.odds}` : String(leg.odds))}</em>` : ""}</li>`).join("")}</ul>`;
  const row = document.createElement("p");
  row.className = "find-shared-do";
  if (started) { const said = document.createElement("span"); said.textContent = "These games have started."; row.append(said); }
  else row.append(friendsButton("Open in my parlay", () => sharedToTray(item)));
  row.append(friendsButton("Remove", async () => { try { window.sharedItems = (await friendsCall("/api/shared", { action: "drop", id: item.id })).items || []; paintParlay(); } catch (error) { console.log("[friends] remove", error); } }, "find-friends-quiet"));
  card.append(row);
  return card;
}

function friendsPanel() {
  const panel = document.createElement("div");
  panel.className = "find-friends";
  const data = window.friendsData, note = document.createElement("p");
  note.className = "find-friends-note";
  const head = (text) => { const p = document.createElement("p"); p.className = "find-friends-sub"; p.textContent = text; return p; };
  if (data.incoming.length) {
    panel.append(head("Friend requests"));
    data.incoming.forEach((one) => { const row = document.createElement("p"); row.className = "find-friends-row"; row.innerHTML = `<span><b>${esc(one.name)}</b> ${esc(one.email)}</span>`; row.append(friendsButton("Accept", () => friendsAct({ action: "accept", id: one.id }, note)), friendsButton("Decline", () => friendsAct({ action: "decline", id: one.id }, note), "find-friends-quiet")); panel.append(row); });
  }
  panel.append(head("Sent to you"));
  if (window.sharedItems.length) window.sharedItems.forEach((item) => panel.append(sharedCard(item)));
  else { const none = document.createElement("p"); none.className = "find-friends-empty"; none.textContent = "When a friend sends you a bet, it lands here."; panel.append(none); }
  panel.append(head(`Friends${data.friends.length ? ` (${data.friends.length})` : ""}`));
  data.friends.forEach((one) => { const row = document.createElement("p"); row.className = "find-friends-row"; row.innerHTML = `<span><b>${esc(one.name)}</b> ${esc(one.email)}</span>`; row.append(friendsButton("Remove", () => { if (window.confirm(`Remove ${one.name} from your friends?`)) friendsAct({ action: "remove", id: one.id }, note); }, "find-friends-quiet")); panel.append(row); });
  data.outgoing.forEach((one) => { const row = document.createElement("p"); row.className = "find-friends-row"; row.innerHTML = `<span><b>${esc(one.name)}</b> has not accepted yet</span>`; row.append(friendsButton("Cancel", () => friendsAct({ action: "cancel", id: one.id }, note), "find-friends-quiet")); panel.append(row); });
  panel.append(friendsAdd(), note);
  return panel;
}

function friendsPaint() {
  document.querySelectorAll(".find-saved").forEach((box) => {
    box.querySelectorAll(":scope > .find-saved-friends, :scope > .find-friends").forEach((node) => node.remove());
    if (!window.saveWho) return;
    const fresh = window.sharedItems.filter((item) => !item.seen).length + window.friendsData.incoming.length;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-saved-st find-saved-friends";
    go.textContent = window.sharedOpen ? "Hide shared" : `Shared${fresh ? ` (${fresh} new)` : ""}`;
    go.setAttribute("aria-expanded", String(window.sharedOpen));
    go.addEventListener("click", () => {
      window.sharedOpen = !window.sharedOpen;
      if (window.sharedOpen && window.sharedItems.some((item) => !item.seen)) friendsCall("/api/shared", { action: "seen" }).then((data) => { window.sharedItems = data.items || []; }).catch(() => {});
      friendsPaint();
    });
    const after = box.querySelector(":scope > .find-saved-done") || box.querySelector(":scope > .find-saved-st");
    if (after) after.after(go); else box.append(go);
    if (window.sharedOpen) box.append(friendsPanel());
  });
}

if (typeof paintParlay === "function") {
  const paintParlayFriends = paintParlay;
  paintParlay = function () {
    paintParlayFriends.apply(this, arguments);
    friendsPaint();
  };
}

function shareSendBox() {
  const view = document.getElementById("share-view");
  const save = view && view.querySelector(".pick-save");
  if (!save) return;
  let go = save.querySelector("#share-card-friend");
  if (!go) { go = friendsButton("Send to a friend", () => shareFriendPick()); go.id = "share-card-friend"; go.className = ""; save.append(go); }
  go.hidden = !window.saveWho || !(shareRaw && shareRaw.legs && shareRaw.legs.length);
  const old = view.querySelector("#share-friends");
  if (old) old.remove();
}

function shareFriendPick() {
  const view = document.getElementById("share-view");
  if (!view) return;
  let box = view.querySelector("#share-friends");
  if (box) { box.remove(); return; }
  box = document.createElement("div");
  box.id = "share-friends";
  const friends = window.friendsData.friends;
  if (!friends.length) {
    box.innerHTML = `<p class="find-friends-sub">Add a friend first</p><p class="find-friends-empty">You can send bets to friends once they accept your request.</p>`;
    box.append(friendsAdd());
  } else {
    box.innerHTML = `<p class="find-friends-sub">Send to</p>${friends.map((one) => `<label class="share-friend"><input type="checkbox" value="${esc(one.id)}"> ${esc(one.name)}</label>`).join("")}<textarea maxlength="280" rows="2" placeholder="Add a note (optional)"></textarea>`;
    const note = document.createElement("p");
    note.className = "find-friends-note";
    box.append(friendsButton("Send", async () => {
      const to = [...box.querySelectorAll("input:checked")].map((input) => input.value);
      try {
        const done = await friendsCall("/api/share", { to, title: shareRaw.title || "", legs: shareRaw.legs, note: box.querySelector("textarea").value });
        note.textContent = `Sent to ${done.sent} ${done.sent === 1 ? "friend" : "friends"}.`;
        box.querySelectorAll("input:checked").forEach((input) => { input.checked = false; });
      } catch (error) { note.textContent = error.message; }
    }), note);
  }
  view.querySelector(".pick-save").after(box);
}

if (typeof openShare === "function") {
  const openShareFriends = openShare;
  openShare = async function (button) {
    const found = typeof shareTicket === "function" ? shareTicket(button) : null;
    shareRaw = !found ? null : found.ticket ? { title: found.label || found.ticket.title || "", legs: found.ticket.legs || [] } : { title: found.saved.title || "", legs: (found.saved.lines || []).map((label) => ({ label })) };
    await openShareFriends.apply(this, arguments);
    shareSendBox();
  };
}
