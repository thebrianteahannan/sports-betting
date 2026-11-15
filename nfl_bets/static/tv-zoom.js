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
  const login = document.getElementById("login-form"), join = document.getElementById("member-form");
  if (document.body.classList.contains("needs-member") && ((login && !login.hidden) || (join && !join.hidden)) && window.showGateMode) showGateMode("pick");
}

window.tvZoomOpen = tvZoomOpen;
window.tvZoomShut = tvZoomShut;

document.getElementById("tv-zoom-open").addEventListener("click", (event) => { event.stopPropagation(); tvZoomOpen(); });
document.getElementById("tv-zoom-x").addEventListener("click", tvZoomShut);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !document.getElementById("tv-zoom").hidden) tvZoomShut(); if (event.key === "Escape") hangShut(); });

const HANG_WAIT = 2 * 60 * 1000;
let hangAt = Date.now(), hangBusy = false;

function hangHome() {
  if (document.hidden || document.body.classList.contains("needs-member") || !window.memberReady) return false;
  if (document.body.classList.contains("tv-zoom-on") || document.body.classList.contains("chat-open")) return false;
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

function hangOpen(pick) {
  const box = document.getElementById("hang"), go = document.getElementById("hang-go");
  if (!box || !go || !pick) return;
  go.textContent = pick.text;
  go.dataset.span = pick.span;
  box.hidden = false;
  document.body.classList.add("hang-on");
  try { sessionStorage.setItem("hang-shut", "1"); } catch (error) {}
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
    const res = await fetch("/api/live?all=1", { credentials: "same-origin" });
    if (!res.ok || !hangHome()) return;
    const pick = hangPick(await res.json());
    if (pick && hangHome()) hangOpen(pick);
  } catch (error) { console.log("[hang] could not look", error); }
  finally { hangBusy = false; }
}

document.getElementById("hang-x").addEventListener("click", (event) => { event.stopPropagation(); hangShut(); });
document.getElementById("hang-go").addEventListener("click", () => {
  const span = document.getElementById("hang-go").dataset.span === "week" ? "week" : "today";
  window.location.href = `/live?span=${span}`;
});
["pointerdown", "keydown", "wheel"].forEach((name) => document.addEventListener(name, (event) => {
  if (event.target.closest && event.target.closest("#hang")) return;
  hangAt = Date.now();
}, true));
setInterval(() => { if (hangHome() && Date.now() - hangAt >= HANG_WAIT) hangLook(); else if (!hangHome()) hangAt = Date.now(); }, 15000);
window.hangLook = hangLook;
