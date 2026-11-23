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

function recDialSay(level, showing) {
  const n = Number(showing);
  const count = Number.isFinite(n) ? ` · ${Math.max(0, Math.round(n))}` : "";
  if (level <= 0) return `Golden Ticket${count}`;
  if (level >= 2) return `All picks${count}`;
  return `+100 to −250${count}`;
}

function recDialShowingOf(level, counts) {
  const golden = Math.max(0, Number(counts && counts.golden) || 0);
  const band = Math.max(0, Number(counts && counts.band) || 0);
  const all = Math.max(0, Number(counts && counts.all) || 0);
  if (level <= 0) return golden;
  if (level >= 2) return all;
  return band;
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
  if (recDial <= 0) return "No Golden Ticket right now. Slide toward More for the rest.";
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
  const showing = recDialShowingPaint(level);
  const say = recDialSay(level, showing);
  document.querySelectorAll("input.rec-dial-range").forEach((box) => {
    if (!(quiet || recDialDrag)) box.value = String(level);
    box.setAttribute("aria-valuenow", String(level));
    box.setAttribute("aria-valuetext", say);
    box.title = say;
  });
}

function recDialShowingPaint(level) {
  const at = level == null ? recDial : Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(level) || 0)));
  let showing = 0;
  document.querySelectorAll(".rec-dial").forEach((bar) => {
    const counts = {
      golden: Number(bar.dataset.golden) || 0,
      band: Number(bar.dataset.band) || 0,
      all: Number(bar.dataset.all) || 0,
    };
    showing = recDialShowingOf(at, counts);
    const now = bar.querySelector(".rec-dial-now");
    if (now) now.textContent = String(showing);
    bar.dataset.showing = String(showing);
    bar.dataset.level = String(at);
  });
  return showing;
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
  document.querySelectorAll(".find-start-recs").forEach((wrap) => {
    if (typeof wrap._recMoreSync === "function") wrap._recMoreSync();
  });
  if (!quiet && typeof opts?.onCommit === "function") opts.onCommit(recDial);
}

function recDialEmptyNote() {
  const line = document.createElement("p");
  line.className = "desk-games-note rec-dial-empty";
  line.hidden = true;
  return line;
}

function recDialCountOf(picks) {
  const rows = picks || [];
  return {
    golden: rows.filter((pick) => pick && pick.golden).length,
    band: rows.filter((pick) => pick && recDialInBand(pick.odds)).length,
    all: rows.length,
  };
}

function recDialCountPaint(counts) {
  const golden = Math.max(0, Number(counts && counts.golden) || 0);
  const band = Math.max(0, Number(counts && counts.band) || 0);
  const all = Math.max(0, Number(counts && counts.all) || 0);
  document.querySelectorAll(".rec-dial").forEach((bar) => {
    const less = bar.querySelector(".rec-dial-less .rec-dial-n");
    const more = bar.querySelector(".rec-dial-more .rec-dial-n");
    if (less) less.textContent = String(golden);
    if (more) more.textContent = String(all);
    bar.dataset.golden = String(golden);
    bar.dataset.band = String(band);
    bar.dataset.all = String(all);
  });
  recDialShowingPaint(recDial);
}

function recDialBar(onCommit) {
  const bar = document.createElement("label");
  bar.className = "rec-dial";
  const less = document.createElement("span");
  less.className = "rec-dial-less";
  less.innerHTML = `Golden Ticket <i class="rec-dial-n">0</i>`;
  const more = document.createElement("span");
  more.className = "rec-dial-more";
  more.innerHTML = `All <i class="rec-dial-n">0</i>`;
  const slide = document.createElement("span");
  slide.className = "rec-dial-slide";
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
  const now = document.createElement("i");
  now.className = "rec-dial-now";
  now.textContent = "0";
  now.setAttribute("aria-hidden", "true");
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
    recDialApply(level, { quiet: true });
  });
  input.addEventListener("change", end);
  slide.append(input, now);
  bar.append(less, slide, more);
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
window.recDialCountOf = recDialCountOf;
window.recDialCountPaint = recDialCountPaint;
window.recDialShowingOf = recDialShowingOf;
window.recDialShowingPaint = recDialShowingPaint;
