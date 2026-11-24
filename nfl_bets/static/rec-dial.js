/** Recommended dial: Golden, then Silver, then Bronze, then the other edged bets.
 * Same drag pattern as Live Less↔More: step any, pointer capture, no rebuild while the thumb moves. */

const REC_DIAL_MAX = 3;
const REC_DIAL_DEFAULT = 0;
const REC_TICKET = [
  { name: "golden", min: -120, max: 120, rate: 0.6 },
  { name: "silver", min: -150, max: 150, rate: 0.55 },
  { name: "bronze", min: -200, max: 200, rate: 0.5 },
];

let recDial = (() => {
  try {
    const raw = localStorage.getItem("rec-dial");
    const stops = localStorage.getItem("rec-dial-stops");
    let n = raw == null || raw === "" ? REC_DIAL_DEFAULT : Math.round(Number(raw));
    if (stops !== "5") {
      if (stops !== "4") n = n <= 0 ? 0 : n === 1 ? 2 : 3;
      n = n <= 0 ? 0 : n === 1 ? 2 : 3;
      localStorage.setItem("rec-dial", String(n));
      localStorage.setItem("rec-dial-stops", "5");
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

function recDialTone(level) {
  return ["golden", "silver", "bronze", "edge"][Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(level) || 0)))] || "golden";
}

function recDialSay(level, showing) {
  const n = Number(showing);
  const count = Number.isFinite(n) ? ` · ${Math.max(0, Math.round(n))}` : "";
  if (level <= 0) return `Golden Ticket${count}`;
  if (level === 1) return `Silver Ticket${count}`;
  if (level === 2) return `Bronze Ticket${count}`;
  return `Has an edge${count}`;
}

function recDialShowingOf(level, counts) {
  const golden = Math.max(0, Number(counts && counts.golden) || 0);
  const silver = Math.max(0, Number(counts && counts.silver) || 0);
  const metal = Math.max(0, Number(counts && counts.metal) || 0);
  const close = Math.max(0, Number(counts && counts.close) || 0);
  if (level <= 0) return golden;
  if (level === 1) return golden + silver;
  if (level === 2) return metal;
  return metal + close;
}

function recDialSave(level) {
  recDial = Math.max(0, Math.min(REC_DIAL_MAX, Math.round(Number(level) || 0)));
  window.recDial = recDial;
  try { localStorage.setItem("rec-dial", String(recDial)); } catch (error) {}
  return recDial;
}

function recDialClose(pick) {
  if (!pick || pick.golden || pick.silver || pick.bronze) return false;
  const rate = recDialRate(pick);
  const odds = Number(pick.odds);
  if (rate == null || !Number.isFinite(odds)) return false;
  return REC_TICKET.some((bar) => {
    const priceOff = recDialFit(odds, bar.min, bar.max);
    const short = bar.rate - rate;
    if (short <= 0 && priceOff > 0 && priceOff <= 40) return true;
    return priceOff === 0 && short > 0 && short <= 0.08;
  });
}

function recDialOk(pick) {
  if (!pick) return false;
  if (pick.golden) return true;
  if (recDial >= 1 && pick.silver) return true;
  if (recDial >= 2 && pick.bronze) return true;
  return recDial >= 3 && recDialClose(pick);
}

function recDialPrice(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function recDialRate(pick) {
  const hits = Number(pick && pick.hits);
  const n = Number(pick && pick.n);
  if (!(n >= 5) || !Number.isFinite(hits)) return null;
  return hits / n;
}

function recDialFit(odds, min, max) {
  const o = Number(odds);
  if (!Number.isFinite(o)) return Infinity;
  if (o < min) return min - o;
  if (o > max) return o - max;
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
  const bar = kind === "bronze" ? REC_TICKET[2] : kind === "silver" ? REC_TICKET[1] : REC_TICKET[0];
  const rows = (recDialPicks || []).filter((pick) => pick && pick.label && recDialRate(pick) != null);
  const days = rows.map(recDialDay).filter(Boolean).sort();
  const slate = days[0] || "";
  const here = slate ? rows.filter((pick) => recDialDay(pick) === slate) : rows;
  const hot = here.filter((pick) => recDialRate(pick) >= bar.rate).sort((a, b) => recDialFit(a.odds, bar.min, bar.max) - recDialFit(b.odds, bar.min, bar.max) || recDialRate(b) - recDialRate(a));
  const inside = here.filter((pick) => recDialFit(pick.odds, bar.min, bar.max) === 0).sort((a, b) => recDialRate(b) - recDialRate(a));
  const later = rows.filter((pick) => recDialFit(pick.odds, bar.min, bar.max) === 0 && recDialRate(pick) >= bar.rate && (!slate || recDialDay(pick) !== slate));
  let lead = "No pick on the next slate has 5 games on the record.";
  if (hot[0] && recDialFit(hot[0].odds, bar.min, bar.max) > 0) lead = `${hot[0].label} has hit in ${hot[0].hits} of ${hot[0].n}. The price is ${recDialPrice(hot[0].odds)}.`;
  else if (inside[0]) lead = `${inside[0].label} is ${recDialPrice(inside[0].odds)} and has hit ${Math.round(recDialRate(inside[0]) * 100)}%.`;
  const rule = kind === "bronze"
    ? "A Bronze Ticket is −200 to +200, and it has to have hit 50% or more."
    : kind === "silver"
      ? "A Silver Ticket is −150 to +150, and it has to have hit 55% or more."
      : "A Golden Ticket is −120 to +120, and it has to have hit 60% or more.";
  const next = later[0];
  const after = next ? ` ${next.label} is ${recDialPrice(next.odds)} and has hit in ${next.hits} of ${next.n}${recDialWhen(next) ? ` on ${recDialWhen(next)}` : ""}.` : "";
  return `${lead} ${rule}${after}`;
}

function recDialEmptySay() {
  if (recDial <= 0) return "There is no Golden Ticket bet available right now.";
  if (recDial === 1) return "There is no Silver Ticket bet available right now.";
  if (recDial === 2) return "There is no Bronze Ticket bet available right now.";
  return "Nothing else with an edge right now.";
}

function recDialMark(card, pick) {
  if (!card || !pick) return card;
  if (pick.golden) card.dataset.recGolden = "1";
  else delete card.dataset.recGolden;
  if (pick.silver) card.dataset.recSilver = "1";
  else delete card.dataset.recSilver;
  if (pick.golden || pick.silver || pick.bronze) card.dataset.recMetal = "1";
  else delete card.dataset.recMetal;
  if (recDialClose(pick)) card.dataset.recClose = "1";
  else delete card.dataset.recClose;
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
      silver: Number(bar.dataset.silver) || 0,
      metal: Number(bar.dataset.metal) || 0,
      close: Number(bar.dataset.close) || 0,
    };
    showing = recDialShowingOf(at, counts);
    const now = bar.querySelector(".rec-dial-now");
    if (now) now.textContent = String(showing);
    bar.dataset.showing = String(showing);
    bar.dataset.level = String(at);
    bar.dataset.tone = recDialTone(at);
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
    const seen = (kind) => host.querySelector(`.desk-rec[${kind}], .rec-parlay-card[${kind}]`);
    const hit = recDial <= 0 ? seen("data-rec-golden") : recDial === 1 ? (seen("data-rec-golden") || seen("data-rec-silver")) : recDial === 2 ? seen("data-rec-metal") : (seen("data-rec-metal") || seen("data-rec-close"));
    const show = !hit;
    node.hidden = !show;
    if (show) node.textContent = recDialEmptySay();
  });
  document.querySelectorAll(".find-start-recs").forEach((wrap) => {
    if (typeof wrap._recMoreSync === "function") wrap._recMoreSync();
  });
  document.querySelectorAll("button.rec-dial-next").forEach((node) => {
    node.hidden = recDial >= REC_DIAL_MAX;
    node.textContent = recDialNextSay(recDial);
  });
  if (!quiet && typeof opts?.onCommit === "function") opts.onCommit(recDial);
}

function recDialNextSay(level) {
  const next = Math.round(Number(level) || 0) + 1;
  if (next <= 1) return "Show the silver ticket";
  if (next === 2) return "Show the bronze ticket";
  return "Show the edge";
}

function recDialNext() {
  const go = document.createElement("button");
  go.type = "button";
  go.className = "rec-dial-next";
  go.textContent = recDialNextSay(recDial);
  go.hidden = recDial >= REC_DIAL_MAX;
  go.addEventListener("click", () => {
    if (recDial >= REC_DIAL_MAX) return;
    recDialApply(recDial + 1);
  });
  return go;
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
  const golden = rows.filter((pick) => pick && pick.golden).length;
  const silver = rows.filter((pick) => pick && pick.silver).length;
  const metal = rows.filter((pick) => pick && (pick.golden || pick.silver || pick.bronze)).length;
  const close = rows.filter((pick) => recDialClose(pick)).length;
  return { golden, silver, metal, close, all: metal + close };
}

function recDialCountPaint(counts) {
  const golden = Math.max(0, Number(counts && counts.golden) || 0);
  const silver = Math.max(0, Number(counts && counts.silver) || 0);
  const metal = Math.max(0, Number(counts && counts.metal) || 0);
  const close = Math.max(0, Number(counts && counts.close) || 0);
  const all = metal + close;
  document.querySelectorAll(".rec-dial").forEach((bar) => {
    const less = bar.querySelector(".rec-dial-less .rec-dial-n");
    const more = bar.querySelector(".rec-dial-more .rec-dial-n");
    if (less) less.textContent = String(golden);
    if (more) more.textContent = String(all);
    bar.dataset.golden = String(golden);
    bar.dataset.silver = String(silver);
    bar.dataset.metal = String(metal);
    bar.dataset.close = String(close);
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
  more.innerHTML = `Has an edge <i class="rec-dial-n">0</i>`;
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
  if (typeof rowSlide === "function") rowSlide(input);
  return bar;
}

window.recDial = recDial;
window.recDialOk = recDialOk;
window.recDialBar = recDialBar;
window.recDialApply = recDialApply;
window.recDialEmptySay = recDialEmptySay;
window.recDialEmptyNote = recDialEmptyNote;
window.recDialNext = recDialNext;
window.recDialInBand = recDialInBand;
window.recDialMark = recDialMark;
window.recDialSave = recDialSave;
window.recDialSay = recDialSay;
window.recDialCountOf = recDialCountOf;
window.recDialCountPaint = recDialCountPaint;
window.recDialShowingOf = recDialShowingOf;
window.recDialShowingPaint = recDialShowingPaint;
