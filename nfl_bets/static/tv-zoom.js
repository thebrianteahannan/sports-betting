function tvZoomOpen() {
  const zoom = document.getElementById("tv-zoom");
  const card = document.getElementById("tv-zoom-card");
  const glass = document.getElementById("desk-glass");
  const desk = document.getElementById("desk");
  if (!zoom || !card || !glass || (desk && desk.classList.contains("tv-full")) || !zoom.hidden) return;
  card.append(glass);
  zoom.hidden = false;
  document.body.classList.add("tv-zoom-on");
}

function tvZoomShut() {
  const zoom = document.getElementById("tv-zoom");
  const glass = document.getElementById("desk-glass");
  const glow = document.getElementById("desk-glow");
  if (!zoom || zoom.hidden || !glass || !glow) return;
  zoom.hidden = true;
  glow.after(glass);
  document.body.classList.remove("tv-zoom-on");
  const open = typeof gateFormOpen === "function" ? gateFormOpen() : (() => { const login = document.getElementById("login-form"), join = document.getElementById("member-form"); return (login && !login.hidden) || (join && !join.hidden); })();
  if (document.body.classList.contains("needs-member") && open && window.showGateMode) showGateMode("pick");
}

window.tvZoomOpen = tvZoomOpen;
window.tvZoomShut = tvZoomShut;

document.getElementById("tv-zoom-open").addEventListener("click", (event) => { event.stopPropagation(); tvZoomOpen(); });
document.getElementById("tv-zoom-x").addEventListener("click", tvZoomShut);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !document.getElementById("tv-zoom").hidden) tvZoomShut(); if (event.key === "Escape") hangShut(); });

const HANG_WAIT = 2 * 60 * 1000;
let hangAt = Date.now(), hangBusy = false;

function hangGuest() {
  return document.body.classList.contains("needs-member");
}

function hangHome() {
  if (document.hidden || !window.memberReady) return false;
  if (document.body.classList.contains("chat-open")) return false;
  if (hangGuest()) {
    // Guests sit in TV zoom on the gate — still nudge them after idle.
    if (typeof gateFormOpen === "function" && gateFormOpen()) return false;
    return true;
  }
  if (document.body.classList.contains("tv-zoom-on")) return false;
  if (document.querySelector("#desk-glass-in .rec-board")) return false;
  const desk = document.getElementById("desk"), profile = document.getElementById("pane-profile");
  if (profile && !profile.hidden && desk && desk.classList.contains("tv-full")) return false;
  return true;
}

function hangDay(when) {
  return new Date(when).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function hangPick(data) {
  const today = hangDay(Date.now());
  const soon = (data.week || []).filter((game) => hangDay(game.kickoff) === today && Date.parse(game.kickoff) > Date.now()).length;
  const later = (data.week || []).filter((game) => hangDay(game.kickoff) > today).length;
  if ((data.live || []).length) return { span: "today", text: "Check out the games playing live right now." };
  if (soon) return { span: "today", text: "Check out the other games coming up today." };
  if (later) return { span: "week", text: "Check out the games for the rest of the week." };
  return null;
}

function hangGuestJoin(mode) {
  if (window.showGateMode) showGateMode(mode || "join");
  else if (window.tvZoomOpen) tvZoomOpen();
}

function hangOpen(pick) {
  const box = document.getElementById("hang"), go = document.getElementById("hang-go"), lazy = document.getElementById("hang-lazy"), die = document.getElementById("hang-die");
  if (!box || !go || !pick) return;
  const guest = hangGuest();
  const say = box.querySelector(".hang-say");
  if (say) say.textContent = guest ? "Sign in to track your bets and every game live." : "Track your bets and every game live.";
  go.textContent = guest ? "Start free for 7 days — I'll walk you through tonight's picks." : pick.text;
  go.dataset.span = pick.span;
  go.dataset.guest = guest ? "1" : "";
  box.querySelectorAll('[data-hang="mine"], [data-hang="chat"]').forEach((btn) => { btn.hidden = guest; });
  if (lazy) lazy.classList.remove("rolled");
  const out = lazy && lazy.querySelector(".tv-lazy-out");
  if (out) out.replaceChildren();
  if (die) { die.disabled = false; die.innerHTML = tvLazyFace(5); }
  const chats = box.querySelector('[data-hang="chat"]'), unread = typeof chatUnread === "function" ? chatUnread() : 0;
  if (chats && !guest) chats.textContent = unread ? `Messages (${unread})` : "Messages";
  box.hidden = false;
  document.body.classList.add("hang-on");
  try { sessionStorage.setItem("hang-shut", "1"); } catch (error) {}
  // Land a recommended bet on the die so the card isn't empty.
  if (die && window.tvLazyRoll) {
    const held = window.tvTick ? tvTick.hold : false;
    tvLazyRoll(die).then(() => { if (window.tvTick) tvTick.hold = held; });
  }
}

function hangShut() {
  const box = document.getElementById("hang");
  if (!box || box.hidden) return;
  box.hidden = true;
  document.body.classList.remove("hang-on");
  try { sessionStorage.setItem("hang-shut", "1"); } catch (error) {}
}

async function hangLook() {
  if (hangBusy || !hangHome()) return;
  try { if (sessionStorage.getItem("hang-shut")) return; } catch (error) { return; }
  hangBusy = true;
  hangAt = Date.now();
  try {
    if (hangGuest()) {
      if (hangHome()) hangOpen({ span: "today", text: "Start free for 7 days — I'll walk you through tonight's picks." });
      return;
    }
    const res = await fetch("/api/live?all=1", { credentials: "same-origin" });
    if (!res.ok || !hangHome()) return;
    const pick = hangPick(await res.json());
    if (pick && hangHome()) hangOpen(pick);
  } catch (error) { console.log("[hang] could not look", error); }
  finally { hangBusy = false; }
}

function hangGames() {
  const span = document.getElementById("hang-go").dataset.span === "week" ? "week" : "today";
  window.location.href = `/live?span=${span}`;
}

function hangMine() {
  window.saveGone = false;
  window.saveShut = false;
  let tries = 0;
  const wait = setInterval(() => {
    const box = document.querySelector("#desk-glass-in .find-saved");
    if (!box && ++tries < 40) return;
    clearInterval(wait);
    if (!box || typeof paintParlay !== "function") return;
    paintParlay();
    const saved = document.querySelector("#desk-glass-in .find-saved");
    if (saved) saved.scrollIntoView({ block: "start" });
  }, 150);
}

function hangAct(kind) {
  hangShut();
  if (hangGuest()) {
    hangGuestJoin(kind === "games" ? "login" : "join");
    return;
  }
  if (kind === "games") { hangGames(); return; }
  if (kind === "chat") { if (typeof chatToggle === "function") chatToggle(true); return; }
  window.asking = true;
  if (document.body.classList.contains("tv-zoom-on")) tvZoomShut();
  if (window.goFull) goFull();
  if (kind === "mine") {
    window.saveGone = false;
    window.saveShut = false;
    if (window.birdMenu) birdMenu("manage");
    return;
  }
  if (kind === "rec" && window.birdMenu) birdMenu("rec");
  else if (window.birdMenu) birdMenu("find");
}

document.getElementById("hang-x").addEventListener("click", (event) => { event.stopPropagation(); hangShut(); });
document.getElementById("hang-go").addEventListener("click", () => {
  if (document.getElementById("hang-go").dataset.guest === "1") { hangShut(); hangGuestJoin("join"); return; }
  hangGames();
});
document.getElementById("hang-card").addEventListener("click", (event) => {
  if (event.target.closest("#hang-die, #hang-lazy .tv-lazy-again")) {
    const die = document.getElementById("hang-die"), held = tvTick.hold;
    tvLazyRoll(die).then(() => { tvTick.hold = held; });
    return;
  }
  if (event.target.closest("[data-lazy-join]")) { hangShut(); hangGuestJoin("join"); return; }
  if (event.target.closest("[data-lazy-login]")) { hangShut(); hangGuestJoin("login"); return; }
  if (event.target.closest("[data-lazy-open]") && tvLazy.pick) { hangShut(); tvTickOpen(tvLazy.pick); return; }
  if (event.target.closest("[data-lazy-add]") && tvLazy.pick) { hangShut(); tvLazyAdd(tvLazy.pick); return; }
  const act = event.target.closest("[data-hang]");
  if (act) hangAct(act.dataset.hang);
});
["pointerdown", "keydown", "wheel"].forEach((name) => document.addEventListener(name, (event) => {
  if (event.target.closest && event.target.closest("#hang")) return;
  hangAt = Date.now();
}, true));
setInterval(() => { if (hangHome() && Date.now() - hangAt >= HANG_WAIT) hangLook(); else if (!hangHome()) hangAt = Date.now(); }, 15000);
window.hangLook = hangLook;
