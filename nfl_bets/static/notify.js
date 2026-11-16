/** Browser alerts the member opted into. Chat uses these first; more kinds can plug in later. */
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

function notifyCan() {
  return typeof Notification !== "undefined";
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
    note.textContent = "This browser does not support alerts.";
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

function paintNotify() {
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
