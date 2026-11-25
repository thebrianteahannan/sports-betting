/** Whole-row slider. A finger on the words or the bar grabs it, and the thumb follows until you let go. */

function rowSlide(input) {
  if (!input || input.dataset.rowSlide || typeof input.closest !== "function") return;
  input.dataset.rowSlide = "1";
  const row = input.closest(".rec-dial, .live-zoom, .manage-zoom, .bet-acts, .fantasy-zoom") || input.parentElement;
  if (!row) return;
  row.classList.add("row-slide-row");
  const track = document.createElement("span");
  track.className = "row-slide";
  const fill = document.createElement("i");
  const thumb = document.createElement("b");
  track.append(fill, thumb);
  input.after(track);
  track.append(input);
  input.classList.add("row-slide-input");
  const min = () => Number(input.min) || 0;
  const max = () => Number(input.max);
  let edgePx = (thumb.offsetWidth || 32) / 2;
  let spanRect = null;
  const half = () => edgePx;
  const paint = (n) => {
    const lo = min(), hi = Number.isFinite(max()) ? max() : lo;
    const span = hi - lo || 1;
    const at = (Math.min(hi, Math.max(lo, n)) - lo) / span;
    const edge = half();
    fill.style.width = `calc(${edge}px + (100% - ${edge * 2}px) * ${at})`;
    thumb.style.left = `calc(${edge}px + (100% - ${edge * 2}px) * ${at})`;
  };
  const fromX = (x) => {
    const lo = min(), hi = Number.isFinite(max()) ? max() : lo;
    const rect = spanRect || track.getBoundingClientRect();
    const edge = half();
    const inner = Math.max(1, rect.width - edge * 2);
    const clamped = Math.min(rect.right - edge, Math.max(rect.left + edge, x));
    return lo + ((clamped - rect.left - edge) / inner) * (hi - lo);
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  let held = false;
  let pointer = 0;
  let raw = Number(input.value) || 0;
  let sent = Math.round(raw);
  const write = (level, kind) => {
    desc.set.call(input, String(level));
    input.setAttribute("aria-valuenow", String(level));
    input.dispatchEvent(new Event(kind, { bubbles: true }));
  };
  Object.defineProperty(input, "value", {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); if (!held) paint(Number(v)); },
  });
  input.addEventListener("input", () => { if (!held) paint(Number(input.value)); });
  const drop = () => {
    row.removeEventListener("pointermove", move);
    row.removeEventListener("pointerup", up);
    row.removeEventListener("pointercancel", lost);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", lost);
  };
  const move = (event) => {
    if (!held || event.pointerId !== pointer) return;
    if (event.cancelable) event.preventDefault();
    raw = fromX(event.clientX);
    paint(raw);
    const level = Math.round(raw);
    if (level === sent) return;
    sent = level;
    write(level, "input");
  };
  const finish = (level) => {
    held = false;
    spanRect = null;
    drop();
    raw = level;
    sent = level;
    paint(level);
    write(level, "input");
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const up = (event) => {
    if (!held || event.pointerId !== pointer) return;
    finish(Math.round(fromX(event.clientX)));
  };
  const lost = (event) => {
    if (!held || event.pointerId !== pointer) return;
    finish(Math.round(raw));
  };
  row.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const press = event.target.closest && event.target.closest("button, a");
    if (press && press !== row && row.contains(press)) return;
    held = true;
    pointer = event.pointerId;
    edgePx = (thumb.offsetWidth || 32) / 2;
    spanRect = track.getBoundingClientRect();
    try { row.setPointerCapture(event.pointerId); } catch (error) {}
    event.preventDefault();
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", up);
    row.addEventListener("pointercancel", lost);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", lost);
    raw = fromX(event.clientX);
    paint(raw);
    const level = Math.round(raw);
    if (level === sent) return;
    sent = level;
    write(level, "input");
  });
  paint(raw);
}

window.rowSlide = rowSlide;
