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
    const sent = (shared.sent || []).map((item) => ({ ...item, mine: true }));
    const same = JSON.stringify([friends, shared.items || [], sent]) === JSON.stringify([window.friendsData, window.sharedItems, window.sharedSent || []]);
    window.friendsData = friends;
    window.sharedItems = shared.items || [];
    window.sharedSent = sent;
    sharedNotify();
    if (same) return;
    const line = document.getElementById("bird-line"), desk = document.getElementById("desk");
    if (line && desk && desk.classList.contains("bird-on") && !window.asking && /^Hey, /.test(line.textContent || "") && window.birdGreet && typeof tvSkip !== "undefined") { tvSkip = true; birdGreet(); tvSkip = false; }
    const glass = document.getElementById("desk-glass-in"), at = glass ? glass.scrollTop : 0;
    if (document.querySelector(".find-board") && typeof paintParlay === "function") { paintParlay(); if (glass) glass.scrollTop = at; }
    else profileShared();
  } catch (error) { console.log("[friends] could not load", error); } finally { friendsBusy = false; }
}

function birdTell(text) {
  const menu = document.getElementById("desk-menu");
  if (!menu || typeof birdPending === "undefined") return;
  if (!text) {
    if (birdPending && birdPending[0] === window.birdTold) { birdPending = null; menu.classList.remove("bird-has", "bird-brag", "say-open"); menu.removeAttribute("data-say"); menu.setAttribute("aria-label", "Recommended bets"); }
    window.birdTold = "";
    return;
  }
  window.birdTold = text; birdPending = [text, []];
  menu.classList.add("bird-has"); menu.classList.remove("say-open", "bird-brag"); menu.dataset.say = text; menu.setAttribute("aria-label", "Parlay has something to say");
}

function sharedNotify() {
  const fresh = window.sharedItems.filter((item) => !item.seen), names = [...new Set(fresh.map((item) => item.fromName))];
  const panel = document.querySelector(".find-start .find-shared-tab"), looking = Boolean(panel && panel.offsetParent);
  const text = !fresh.length || looking ? "" : fresh.length === 1 ? `${names[0]} sent you a bet. Want to see it?` : `${names.length === 1 ? names[0] : "Your friends"} sent you ${fresh.length} bets. Want to see them?`;
  if (text !== (window.birdTold || "")) birdTell(text);
}

function sharedSeen() {
  if (!window.sharedItems.some((item) => !item.seen)) return;
  window.sharedItems = window.sharedItems.map((item) => ({ ...item, seen: true }));
  sharedNotify();
  friendsCall("/api/shared", { action: "seen" }).then((data) => { window.sharedItems = data.items || []; }).catch(() => {});
}

function sharedGo() {
  const fresh = new Set(sharedUnopened().map((item) => String(item.id)));
  window.sharedOpen = true;
  sharedSeen();
  if (!document.querySelector("#desk-glass-in .find-board") && window.birdMenu) birdMenu("find");
  let tries = 0;
  const wait = setInterval(() => {
    const board = document.querySelector("#desk-glass-in .find-board");
    if (!board && ++tries < 40) return;
    clearInterval(wait);
    window.sharedOpen = false;
    if (typeof paintParlay === "function") paintParlay();
    sharedTabGo(fresh);
  }, 150);
}
window.sharedGo = sharedGo;

function sharedUnopened() {
  return window.sharedItems.filter((item) => !item.viewed && item.legs.some((leg) => !(Date.parse(leg.kickoff || "") < Date.now())));
}

window.sharedGreet = function () {
  const fresh = sharedUnopened(), names = [...new Set(fresh.map((item) => item.fromName))];
  if (!fresh.length) return "";
  return fresh.length === 1 ? `${names[0]} sent you a bet. Want to see it?` : `${names.length === 1 ? names[0] : "Your friends"} sent you ${fresh.length} bets. Want to see them?`;
};
window.sharedLabel = function () {
  const fresh = sharedUnopened();
  return fresh.length === 1 ? `See ${fresh[0].fromName}'s bet` : `See the ${fresh.length} bets`;
};

window.sharedOpenFresh = sharedGo;

if (typeof saveNow === "function" && typeof saveLeave === "function") {
  const saveNowShared = saveNow, saveLeaveShared = saveLeave;
  saveNow = function () { const entry = saveNowShared.apply(this, arguments); if (entry && window.sharedViewing) { sharedMark(window.sharedViewing, "saved"); window.sharedViewing = ""; } return entry; };
  saveLeave = function () { const out = saveLeaveShared.apply(this, arguments); window.sharedViewing = ""; return out; };
}

const friendsWait = setInterval(() => { if (window.saveWho) { clearInterval(friendsWait); friendsLoad(); setInterval(friendsLoad, 20000); } }, 1000);
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
  form.innerHTML = `<input type="search" placeholder="Find a member by name" aria-label="Find a member by name" autocomplete="off"><div class="find-friends-hits"></div><p class="find-friends-note"></p>`;
  const input = form.querySelector("input"), hits = form.querySelector(".find-friends-hits"), note = form.querySelector("p");
  let timer = 0, asked = 0;
  const look = async () => {
    const q = input.value.trim(), ticket = ++asked;
    if (q.length < 2) { hits.replaceChildren(); note.textContent = ""; return; }
    try {
      const people = (await friendsCall("/api/friends", { action: "find", q })).people || [];
      if (ticket !== asked) return;
      note.textContent = people.length ? "" : "No member by that name yet.";
      hits.replaceChildren(...people.map((one) => {
        const row = document.createElement("div");
        row.className = "find-friends-row";
        row.innerHTML = `<span><b>${esc(one.name)}</b>${one.state ? ` · ${esc(one.state)}` : ""}</span>`;
        const said = { friends: "Friends", sent: "Requested" }[one.status];
        if (said) row.insertAdjacentHTML("beforeend", `<span class="find-friends-tag">${said}</span>`);
        else row.append(friendsButton(one.status === "asked" ? "Accept" : "Add friend", async () => {
          try { window.friendsData = await friendsCall("/api/friends", { action: "ask", id: one.id }); note.textContent = one.status === "asked" ? `You and ${one.name} are friends.` : `Request sent to ${one.name}.`; input.value = ""; hits.replaceChildren(); paintParlay(); } catch (error) { note.textContent = error.message; }
        }));
        return row;
      }));
    } catch (error) { note.textContent = error.message; }
  };
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(look, 250); });
  form.addEventListener("submit", (event) => { event.preventDefault(); clearTimeout(timer); look(); });
  return form;
}

function sharedToTray(item, again) {
  if (!document.querySelector("#desk-glass-in .find-board") && window.birdMenu && !again) {
    if (window.goFull) goFull();
    birdMenu("find");
    let tries = 0;
    const wait = setInterval(() => { if (document.querySelector("#desk-glass-in .find-board") || ++tries > 40) { clearInterval(wait); sharedToTray(item, true); } }, 150);
    return;
  }
  if (typeof saveNew === "function") saveNew();
  const board = document.querySelector(".find-board"), people = (board && board.people) || [];
  item.legs.forEach((bet) => {
    let live = null, owner = null;
    people.some((one) => { const hit = (one.bets || []).find((row) => row.label === bet.label && row.market === bet.market && row.match === bet.match); if (hit) { live = hit; owner = one; } return Boolean(hit); });
    const leg = live || bet;
    parlayLeg.set(parlayKey(leg), leg);
    if (owner && owner.kind === "player" && !parlayPick.has(owner.key)) parlayPick.set(owner.key, owner);
  });
  if (typeof saveSig === "function") saveHeld = saveSig([...parlayLeg.values()]);
  window.sharedViewing = item.mine ? "" : item.id;
  if (!item.mine) sharedMark(item.id, "viewed");
  if (typeof trayRoster === "function") trayRoster();
  window.sharedOpen = false;
  paintParlay();
  document.querySelectorAll(".find-tray.find-shut .find-fold").forEach((fold) => fold.click());
  const tray = document.querySelector(".find-tray:not([hidden])");
  if (tray) tray.scrollIntoView({ block: "start", behavior: "smooth" });
}

function profileShared() {
  const spot = document.getElementById("profile-shared");
  if (!spot || spot.contains(document.activeElement)) return;
  spot.hidden = !window.saveWho;
  if (spot.hidden) return;
  const panel = friendsPanel(), kids = [...panel.children];
  const from = kids.findIndex((node) => node.textContent === "Sent to you"), to = kids.findIndex((node) => node.classList.contains("find-friends-sub") && node.textContent.startsWith("Friends"));
  panel.querySelector(".find-done-top").remove();
  kids.slice(from, to).forEach((node) => node.remove());
  spot.replaceChildren(panel);
}

function sharedChips(box, after) {
  const items = window.sharedItems.concat(window.sharedSent || []).filter((item) => item.legs.some((leg) => !(Date.parse(leg.kickoff || "") < Date.now())));
  if (!items.length) return;
  const head = document.createElement("p");
  head.className = "find-shared-head-row";
  head.textContent = "Shared bets";
  after.after(head, ...items.map(sharedChip));
}

function sharedMark(id, action) {
  const item = window.sharedItems.find((row) => row.id === id);
  if (!item || (action === "viewed" ? item.viewed : item.saved)) return;
  item.seen = item.viewed = true;
  if (action === "saved") item.saved = true;
  friendsCall("/api/shared", { action, id }).catch(() => {});
}

function sharedState(one) {
  return one.saved ? ["saved", "Saved"] : one.viewed ? ["viewed", "Viewed"] : ["new", "Not opened"];
}

function sharedChip(item) {
  const chip = document.createElement("span");
  chip.className = "find-saved-chip find-shared-chip";
  if (!item.mine) chip.dataset.shared = item.id;
  const go = document.createElement("button");
  go.type = "button";
  const games = typeof gameShortList === "function" ? gameShortList(item.legs) : "";
  const who = item.legs.map((leg) => String(leg.label || "").split(/\s+(?:\d|Over\b|Under\b)/)[0].split(" ").pop()).filter(Boolean);
  const names = new Map(window.friendsData.friends.map((one) => [one.id, one.name]));
  const from = item.mine ? `To ${item.to.map((one) => names.get(one.id) || "a friend").join(", ")}` : item.fromName;
  const said = `${from}: ${who.slice(0, 2).join(", ")}${who.length > 2 ? ` +${who.length - 2}` : ""}`;
  const price = typeof savePrice === "function" ? savePrice(item.legs) : "";
  const marks = (item.mine ? item.to : [item]).map((one) => { const [cls, word] = sharedState(one); return `<em class="st-${cls}">${esc(item.mine && item.to.length > 1 ? `${names.get(one.id) || "Friend"}: ${word}` : word)}</em>`; }).join("");
  go.innerHTML = [games && `<i>${esc(games)}</i>`, `<span>${esc(said)}</span>`, price && `<b>${esc(price)}</b>`, marks].filter(Boolean).join("");
  go.title = item.note ? `“${item.note}”` : item.mine ? "A bet you sent" : `From ${item.fromName}`;
  go.addEventListener("click", () => { if (!item.mine) sharedSeen(); sharedToTray(item); });
  if (item.mine) {
    const unsend = document.createElement("button");
    unsend.type = "button"; unsend.className = "find-saved-x"; unsend.textContent = "×"; unsend.setAttribute("aria-label", "Delete this bet you sent");
    unsend.addEventListener("click", async () => {
      const who = item.to.map((one) => names.get(one.id) || "your friend").join(", ");
      if (!window.confirm(`Delete this bet? ${who} won't see it anymore.`)) return;
      try { const data = await friendsCall("/api/shared", { action: "unsend", id: item.id }); window.sharedItems = data.items || []; window.sharedSent = (data.sent || []).map((row) => ({ ...row, mine: true })); paintParlay(); } catch (error) { console.log("[friends] unsend", error); }
    });
    chip.append(go, unsend);
    return chip;
  }
  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "find-saved-x";
  drop.textContent = "×";
  drop.setAttribute("aria-label", "Remove this shared bet");
  drop.addEventListener("click", async () => { try { window.sharedItems = (await friendsCall("/api/shared", { action: "drop", id: item.id })).items || []; paintParlay(); } catch (error) { console.log("[friends] remove", error); } });
  chip.append(go, drop);
  return chip;
}

function friendsPanel() {
  const panel = document.createElement("div");
  panel.className = "find-friends";
  const data = window.friendsData, note = document.createElement("p");
  note.className = "find-friends-note";
  const head = (text) => { const p = document.createElement("p"); p.className = "find-friends-sub"; p.textContent = text; return p; };
  const top = document.createElement("p"), count = window.sharedItems.length;
  top.className = "find-done-top";
  top.innerHTML = `<b>Shared bets</b>${count ? `<span>${count} from friends</span>` : ""}<button type="button" class="find-done-x" aria-label="Close shared bets">×</button>`;
  top.querySelector("button").addEventListener("click", () => { window.sharedOpen = false; friendsPaint(); });
  panel.append(top);
  if (data.incoming.length) {
    panel.append(head("Friend requests"));
    data.incoming.forEach((one) => { const row = document.createElement("p"); row.className = "find-friends-row"; row.innerHTML = `<span><b>${esc(one.name)}</b>${one.state ? ` · ${esc(one.state)}` : ""}</span>`; row.append(friendsButton("Accept", () => friendsAct({ action: "accept", id: one.id }, note)), friendsButton("Decline", () => friendsAct({ action: "decline", id: one.id }, note), "find-friends-quiet")); panel.append(row); });
  }
  panel.append(head("Sent to you"));
  if (window.sharedItems.length) { const row = document.createElement("div"); row.className = "find-shared-chips"; row.append(...window.sharedItems.map(sharedChip)); panel.append(row); }
  if ((window.sharedSent || []).length) { panel.append(head("You sent")); const row = document.createElement("div"); row.className = "find-shared-chips"; row.append(...window.sharedSent.map(sharedChip)); panel.append(row); }
  else { const none = document.createElement("p"); none.className = "find-friends-empty"; none.textContent = "When a friend sends you a bet, it lands here."; panel.append(none); }
  panel.append(head(`Friends${data.friends.length ? ` (${data.friends.length})` : ""}`));
  data.friends.forEach((one) => { const row = document.createElement("p"); row.className = "find-friends-row"; row.innerHTML = `<span><b>${esc(one.name)}</b>${one.state ? ` · ${esc(one.state)}` : ""}</span>`; row.append(friendsButton("Remove", () => { if (window.confirm(`Remove ${one.name} from your friends?`)) friendsAct({ action: "remove", id: one.id }, note); }, "find-friends-quiet")); panel.append(row); });
  data.outgoing.forEach((one) => { const row = document.createElement("p"); row.className = "find-friends-row"; row.innerHTML = `<span><b>${esc(one.name)}</b> has not accepted yet</span>`; row.append(friendsButton("Cancel", () => friendsAct({ action: "cancel", id: one.id }, note), "find-friends-quiet")); panel.append(row); });
  panel.append(friendsAdd(), note);
  return panel;
}

function friendsPaint() {
  document.querySelectorAll(".find-saved").forEach((box) => {
    box.querySelectorAll(":scope > .find-saved-friends, :scope > .find-saved-live, :scope > .find-friends, :scope > .find-shared-head-row, :scope > .find-shared-chip").forEach((node) => node.remove());
    if (!window.saveWho) return;
    const fresh = window.sharedItems.filter((item) => !item.seen).length + window.friendsData.incoming.length;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-saved-st find-saved-friends";
    go.textContent = `Shared bets${fresh ? ` (${fresh} new)` : ""}`;
    go.addEventListener("click", () => sharedGo());
    const after = box.querySelector(":scope > .find-saved-done") || box.querySelector(":scope > .find-saved-st");
    if (after) after.after(go); else box.append(go);
  });
  profileShared();
}

const liveSpanWatch = typeof ResizeObserver === "function" ? new ResizeObserver(() => liveSpanPaint()) : null;
function liveSpanPaint() {
  document.querySelectorAll(".rec-board .find-span").forEach((span) => {
    let go = span.querySelector(":scope > .find-span-live");
    if (!go) {
      go = document.createElement("a"); go.className = "find-span-live"; go.href = "/live"; go.textContent = "Live"; go.title = "Live stats for the games being played";
      span.append(go);
      span.querySelectorAll(":scope > .find-games").forEach((box) => { if (liveSpanWatch) liveSpanWatch.observe(box); });
    }
    const chip = span.querySelector(":scope > .find-games:not(.find-on) > summary"), at = span.getBoundingClientRect(), spot = chip && chip.getBoundingClientRect();
    go.hidden = !spot || !spot.width;
    if (go.hidden) return;
    go.style.right = `${at.right - spot.left + 8}px`; go.style.top = `${spot.top - at.top}px`; go.style.height = `${spot.height}px`;
  });
}
document.addEventListener("toggle", (event) => { if (event.target.closest && event.target.closest(".find-span")) requestAnimationFrame(liveSpanPaint); }, true);

if (typeof paintParlay === "function") {
  const paintParlayFriends = paintParlay;
  paintParlay = function () {
    paintParlayFriends.apply(this, arguments);
    friendsPaint();
    liveSpanPaint();
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
        const sent = `Sent to ${done.sent} ${done.sent === 1 ? "friend" : "friends"}.`, under = document.getElementById("share-card-note");
        friendsLoad();
        if (done.sent && under) { under.textContent = sent; box.remove(); return; }
        note.textContent = sent;
        box.querySelectorAll("input:checked").forEach((input) => { input.checked = false; });
      } catch (error) { note.textContent = error.message; }
    }), note);
  }
  view.querySelector(".pick-save").after(box);
}

document.addEventListener("click", (event) => {
  const box = document.getElementById("share-friends");
  if (box && event.target.isConnected && !box.contains(event.target) && !event.target.closest("#share-card-friend")) box.remove();
});

if (typeof openShare === "function") {
  const openShareFriends = openShare;
  openShare = async function (button) {
    const found = typeof shareTicket === "function" ? shareTicket(button) : null;
    shareRaw = !found ? null : found.ticket ? { title: found.label || found.ticket.title || "", legs: found.ticket.legs || [] } : { title: found.saved.title || "", legs: (found.saved.lines || []).map((label) => ({ label })) };
    await openShareFriends.apply(this, arguments);
    shareSendBox();
  };
}
