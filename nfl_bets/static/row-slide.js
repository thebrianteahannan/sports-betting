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
  const paint = (n) => {
    const lo = min(), hi = Number.isFinite(max()) ? max() : lo;
    const span = hi - lo || 1;
    const at = ((Math.min(hi, Math.max(lo, n)) - lo) / span) * 100;
    fill.style.width = `${at}%`;
    thumb.style.left = `${at}%`;
  };
  const fromX = (x) => {
    const lo = min(), hi = Number.isFinite(max()) ? max() : lo;
    const rect = track.getBoundingClientRect();
    const width = rect.width || 1;
    const clamped = Math.min(rect.right, Math.max(rect.left, x));
    return lo + ((clamped - rect.left) / width) * (hi - lo);
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
    if (event.target.closest && event.target.closest("button, a")) return;
    held = true;
    pointer = event.pointerId;
    try { row.setPointerCapture(event.pointerId); } catch (error) {}
    event.preventDefault();
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
