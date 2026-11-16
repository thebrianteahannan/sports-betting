/** Browser alerts the member opted into. Chat and settled bets use these. */
const NOTIFY_KEY = "pod-notify";

function notifyOn() {
  try { return localStorage.getItem(NOTIFY_KEY) === "1"; } catch (error) { return false; }
}

function notifySet(on) {
  try {
    if (on) localStorage.setItem(NOTIFY_KEY, "1");
    else localStorage.removeItem(NOTIFY_KEY);
  } catch (error) {}
  paintNotify();
}

function notifyIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function notifyHome() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function notifyCan() {
  return typeof Notification !== "undefined";
}

function notifyHow() {
  if (notifyCan()) return "Get a browser alert when someone messages you. Keep this site open — even in the background is enough.";
  if (notifyIos() && !notifyHome()) return "iPhone only allows alerts from the Home Screen app. In Chrome or Safari, add Parlay of the Day to your Home Screen, open it from that icon, then tap Notify me.";
  if (notifyIos()) return "Update iPhone to iOS 16.4 or later, then open Parlay of the Day from your Home Screen and tap Notify me.";
  return "This browser does not support alerts.";
}

function notifyNeed() {
  if (notifyCan()) return "";
  if (notifyIos() && !notifyHome()) return "Add this site to your Home Screen, open it from that icon, then tap Notify me. Chrome and Safari on iPhone both need that step.";
  if (notifyIos()) return "This iPhone build does not allow alerts yet. Update to iOS 16.4 or later.";
  return "This browser does not support alerts.";
}

async function notifyAsk() {
  if (!notifyCan()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try { return await Notification.requestPermission(); } catch (error) { return "denied"; }
}

function notifyShow(opts) {
  if (!notifyOn() || !notifyCan() || Notification.permission !== "granted") return null;
  try {
    const note = new Notification(opts.title || "Parlay of the Day", {
      body: opts.body || "",
      icon: "/logo.png?v=5",
      tag: opts.tag || "pod",
      data: opts.data || {},
    });
    note.onclick = () => {
      try { window.focus(); } catch (error) {}
      if (typeof opts.click === "function") opts.click(note);
      note.close();
    };
    return note;
  } catch (error) {
    console.log("[notify]", error.message);
    return null;
  }
}

function paintNotifyPair(onId, offId, noteId) {
  const onBtn = document.getElementById(onId);
  const offBtn = document.getElementById(offId);
  const note = document.getElementById(noteId);
  if (!onBtn || !offBtn) return;
  const on = notifyOn();
  onBtn.classList.toggle("on", on);
  offBtn.classList.toggle("on", !on);
  onBtn.setAttribute("aria-pressed", String(on));
  offBtn.setAttribute("aria-pressed", String(!on));
  if (!note) return;
  if (!notifyCan()) {
    note.hidden = false;
    note.textContent = notifyNeed();
  } else if (on && Notification.permission === "denied") {
    note.hidden = false;
    note.textContent = "Alerts are blocked for this site. Turn them on in your browser settings.";
  } else if (on && Notification.permission !== "granted") {
    note.hidden = false;
    note.textContent = "Waiting on your browser to allow alerts.";
  } else {
    note.hidden = true;
    note.textContent = "";
  }
}

function paintNotifySay() {
  const how = notifyHow();
  const profile = document.querySelector("#profile-notify > p.quiet:not(#profile-notify-note)");
  if (profile) profile.textContent = how;
  document.querySelectorAll(".chat-settings-say").forEach((node) => { node.textContent = how; });
}

function paintNotify() {
  paintNotifySay();
  paintNotifyPair("profile-notify-on", "profile-notify-off", "profile-notify-note");
  paintNotifyPair("chat-notify-on", "chat-notify-off", "chat-notify-note");
}

async function notifyEnable() {
  if (!notifyCan()) { paintNotify(); return; }
  const perm = await notifyAsk();
  if (perm === "granted") {
    notifySet(true);
    if (typeof chatNotifyArm === "function") chatNotifyArm();
    if (typeof chatLoad === "function") chatLoad();
  } else {
    notifySet(false);
    paintNotify();
  }
}

function notifyDisable() {
  notifySet(false);
}

window.notifyOn = notifyOn;
window.notifyShow = notifyShow;
window.paintNotify = paintNotify;
window.notifyEnable = notifyEnable;
window.notifyDisable = notifyDisable;

const notifyPane = document.getElementById("pane-profile");
if (notifyPane) {
  notifyPane.addEventListener("click", (event) => {
    if (event.target.closest("#profile-notify-on")) notifyEnable();
    if (event.target.closest("#profile-notify-off")) notifyDisable();
  });
}
paintNotify();
