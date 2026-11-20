/** Recommended dial: Less = Golden Ticket, middle = +100 to −250 (default), More = all recommended.
 * Same drag pattern as Live Less↔More: step any, pointer capture, no rebuild while the thumb moves. */

const REC_DIAL_MAX = 2;
const REC_DIAL_DEFAULT = 1;

let recDial = (() => {
  try {
    const raw = localStorage.getItem("rec-dial");
    if (raw == null || raw === "") return REC_DIAL_DEFAULT;
    const n = Math.round(Number(raw));
    if (n === 0 || n === 1 || n === 2) return n;
  } catch (error) {}
  return REC_DIAL_DEFAULT;
})();

let recDialDrag = false;

function recDialInBand(odds) {
  const o = Number(odds);
  return Number.isFinite(o) && o >= -250 && o <= 100;
}

function recDialSay(level) {
  if (level <= 0) return "Golden Ticket";
  if (level >= 2) return "All picks";
  return "+100 to −250";
}

function recDialSave(level) {
  recDial = Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(level) || 0)));
  window.recDial = recDial;
  try { localStorage.setItem("rec-dial", String(recDial)); } catch (error) {}
  return recDial;
}

function recDialOk(pick) {
  if (!pick) return false;
  if (recDial >= 2) return true;
  if (recDial <= 0) return !!pick.golden;
  return recDialInBand(pick.odds);
}

function recDialEmptySay() {
  if (recDial <= 0) return "No Golden Ticket in +100 to −250 right now. Slide toward More for the rest.";
  if (recDial === 1) return "Nothing in +100 to −250 right now. Slide toward More for the rest.";
  return "No picks are posted yet.";
}

function recDialMark(card, pick) {
  if (!card || !pick) return card;
  if (pick.golden) card.dataset.recGolden = "1";
  else delete card.dataset.recGolden;
  if (recDialInBand(pick.odds)) card.dataset.recBand = "1";
  else delete card.dataset.recBand;
  return card;
}

function recDialHosts() {
  return document.querySelectorAll(".find-start, #desk-games");
}

function recDialSyncInputs(level, quiet) {
  if (quiet || recDialDrag) return;
  document.querySelectorAll("input.rec-dial-range").forEach((box) => {
    box.value = String(level);
    box.setAttribute("aria-valuenow", String(level));
    box.setAttribute("aria-valuetext", recDialSay(level));
    box.title = recDialSay(level);
  });
}

function recDialApply(next, opts) {
  const quiet = !!(opts && opts.quiet);
  const level = Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(next) || 0)));
  recDialSave(level);
  recDialHosts().forEach((box) => { box.dataset.recDial = String(recDial); });
  recDialSyncInputs(recDial, quiet);
  document.querySelectorAll(".rec-dial-empty").forEach((node) => {
    const host = node.closest(".find-start, #desk-games");
    if (!host) return;
    const show = recDial < 2 && !host.querySelector(`.desk-rec${recDial <= 0 ? "[data-rec-golden]" : "[data-rec-band]"}`);
    node.hidden = !show;
    if (show) node.textContent = recDialEmptySay();
  });
  if (!quiet && typeof opts?.onCommit === "function") opts.onCommit(recDial);
}

function recDialEmptyNote() {
  const line = document.createElement("p");
  line.className = "desk-games-note rec-dial-empty";
  line.hidden = true;
  return line;
}

function recDialBar(onCommit) {
  const bar = document.createElement("label");
  bar.className = "rec-dial";
  const less = document.createElement("span");
  less.textContent = "Golden Ticket";
  const more = document.createElement("span");
  more.textContent = "All";
  const input = document.createElement("input");
  input.type = "range";
  input.className = "rec-dial-range";
  input.min = "0";
  input.max = String(REC_DIAL_MAX);
  input.step = "any";
  input.value = String(recDial);
  input.setAttribute("aria-valuemin", "0");
  input.setAttribute("aria-valuemax", String(REC_DIAL_MAX));
  input.setAttribute("aria-valuenow", String(recDial));
  input.setAttribute("aria-valuetext", recDialSay(recDial));
  input.setAttribute("aria-label", "Show more or fewer recommended picks");
  input.title = recDialSay(recDial);
  const end = () => {
    recDialDrag = false;
    const snapped = Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(input.value) || 0)));
    input.value = String(snapped);
    recDialApply(snapped, { onCommit });
  };
  input.addEventListener("pointerdown", (event) => {
    recDialDrag = true;
    try { input.setPointerCapture(event.pointerId); } catch (error) {}
  });
  input.addEventListener("pointerup", end);
  input.addEventListener("pointercancel", end);
  input.addEventListener("lostpointercapture", end);
  input.addEventListener("input", () => {
    recDialDrag = true;
    const level = Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(input.value) || 0)));
    input.setAttribute("aria-valuenow", String(level));
    input.setAttribute("aria-valuetext", recDialSay(level));
    input.title = recDialSay(level);
    recDialApply(level, { quiet: true });
  });
  input.addEventListener("change", end);
  bar.append(less, input, more);
  return bar;
}

window.recDial = recDial;
window.recDialOk = recDialOk;
window.recDialBar = recDialBar;
window.recDialApply = recDialApply;
window.recDialEmptySay = recDialEmptySay;
window.recDialEmptyNote = recDialEmptyNote;
window.recDialInBand = recDialInBand;
window.recDialMark = recDialMark;
window.recDialSave = recDialSave;
window.recDialSay = recDialSay;
