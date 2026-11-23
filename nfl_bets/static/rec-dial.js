/** Recommended dial: Golden, then Golden/Silver/Bronze, then +100 to −250, then all.
 * Same drag pattern as Live Less↔More: step any, pointer capture, no rebuild while the thumb moves. */

const REC_DIAL_MAX = 3;
const REC_DIAL_DEFAULT = 2;

let recDial = (() => {
  try {
    const raw = localStorage.getItem("rec-dial");
    const stops = localStorage.getItem("rec-dial-stops");
    let n = raw == null || raw === "" ? 1 : Math.round(Number(raw));
    if (stops !== "4") {
      n = n <= 0 ? 0 : n === 1 ? 2 : 3;
      localStorage.setItem("rec-dial", String(n));
      localStorage.setItem("rec-dial-stops", "4");
    }
    if (n === 0 || n === 1 || n === 2 || n === 3) return n;
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
  if (level === 1) return `Golden, Silver, and Bronze${count}`;
  if (level >= 3) return `All picks${count}`;
  return `+100 to −250${count}`;
}

function recDialShowingOf(level, counts) {
  const golden = Math.max(0, Number(counts && counts.golden) || 0);
  const metal = Math.max(0, Number(counts && counts.metal) || 0);
  const band = Math.max(0, Number(counts && counts.band) || 0);
  const all = Math.max(0, Number(counts && counts.all) || 0);
  if (level <= 0) return golden;
  if (level === 1) return metal;
  if (level >= 3) return all;
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
  if (recDial >= 3) return true;
  if (recDial <= 0) return !!pick.golden;
  if (recDial === 1) return !!(pick.golden || pick.silver || pick.bronze);
  return recDialInBand(pick.odds);
}

function recDialPrice(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function recDialEven(odds) {
  const o = Number(odds);
  return Number.isFinite(o) && o >= -120 && o <= 120;
}

function recDialRate(pick) {
  const hits = Number(pick && pick.hits);
  const n = Number(pick && pick.n);
  if (!(n >= 5) || !Number.isFinite(hits)) return null;
  return hits / n;
}

function recDialGap(odds) {
  const o = Number(odds);
  if (o < -120) return -120 - o;
  if (o > 120) return o - 120;
  return 0;
}

function recDialDay(pick) {
  const at = Date.parse(pick && pick.kickoff);
  if (!Number.isFinite(at)) return "";
  return new Date(at - 6 * 3600000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function recDialWhen(pick) {
  const at = Date.parse(pick && pick.kickoff);
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
}

let recDialPicks = [];

function recDialWhy(kind) {
  const rows = (recDialPicks || []).filter((pick) => pick && pick.label && recDialRate(pick) != null);
  const days = rows.map(recDialDay).filter(Boolean).sort();
  const slate = days[0] || "";
  const here = slate ? rows.filter((pick) => recDialDay(pick) === slate) : rows;
  const hot = here.filter((pick) => recDialRate(pick) >= 0.6).sort((a, b) => recDialGap(a.odds) - recDialGap(b.odds) || recDialRate(b) - recDialRate(a));
  const even = here.filter((pick) => recDialEven(pick.odds)).sort((a, b) => recDialRate(b) - recDialRate(a));
  const later = rows.filter((pick) => recDialEven(pick.odds) && recDialRate(pick) >= 0.6 && (!slate || recDialDay(pick) !== slate));
  let lead = "No pick on the next slate has 5 games on the record.";
  if (hot[0] && recDialGap(hot[0].odds) > 0) lead = `${hot[0].label} has hit in ${hot[0].hits} of ${hot[0].n}, but the price is ${recDialPrice(hot[0].odds)}.`;
  else if (even[0]) lead = `${even[0].label} is ${recDialPrice(even[0].odds)}, but that has hit ${Math.round(recDialRate(even[0]) * 100)}%.`;
  const rule = kind === "metals"
    ? "A Golden, Silver, or Bronze ticket has to be between −120 and +120, and it has to have hit 60% or more."
    : "A Golden Ticket has to be between −120 and +120, and it has to have hit 60% or more.";
  const next = later[0];
  const after = next ? ` ${next.label} is ${recDialPrice(next.odds)} and has hit in ${next.hits} of ${next.n}${recDialWhen(next) ? ` on ${recDialWhen(next)}` : ""}.` : "";
  return `${lead} ${rule}${after}`;
}

function recDialEmptySay() {
  if (recDial <= 0) return recDialWhy("golden");
  if (recDial === 1) return recDialWhy("metals");
  if (recDial === 2) return "Nothing in +100 to −250 right now. Slide toward More for the rest.";
  return "No picks are posted yet.";
}

function recDialMark(card, pick) {
  if (!card || !pick) return card;
  if (pick.golden) card.dataset.recGolden = "1";
  else delete card.dataset.recGolden;
  if (pick.golden || pick.silver || pick.bronze) card.dataset.recMetal = "1";
  else delete card.dataset.recMetal;
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
      metal: Number(bar.dataset.metal) || 0,
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
    const mark = recDial <= 0 ? "[data-rec-golden]" : recDial === 1 ? "[data-rec-metal]" : "[data-rec-band]";
    const show = recDial < 3 && !host.querySelector(`.desk-rec${mark}`);
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
  recDialPicks = rows;
  return {
    golden: rows.filter((pick) => pick && pick.golden).length,
    metal: rows.filter((pick) => pick && (pick.golden || pick.silver || pick.bronze)).length,
    band: rows.filter((pick) => pick && recDialInBand(pick.odds)).length,
    all: rows.length,
  };
}

function recDialCountPaint(counts) {
  const golden = Math.max(0, Number(counts && counts.golden) || 0);
  const metal = Math.max(0, Number(counts && counts.metal) || 0);
  const band = Math.max(0, Number(counts && counts.band) || 0);
  const all = Math.max(0, Number(counts && counts.all) || 0);
  document.querySelectorAll(".rec-dial").forEach((bar) => {
    const less = bar.querySelector(".rec-dial-less .rec-dial-n");
    const more = bar.querySelector(".rec-dial-more .rec-dial-n");
    if (less) less.textContent = String(golden);
    if (more) more.textContent = String(all);
    bar.dataset.golden = String(golden);
    bar.dataset.metal = String(metal);
    bar.dataset.band = String(band);
    bar.dataset.all = String(all);
  });
  recDialShowingPaint(recDial);
  document.querySelectorAll(".rec-dial-empty").forEach((node) => {
    if (node.hidden) return;
    node.textContent = recDialEmptySay();
  });
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
