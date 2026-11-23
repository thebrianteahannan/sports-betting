/** Admin tries a few sliders. The finger ones follow the touch and do not jump until you let go. */

function slideTryBox(name, why) {
  const box = document.createElement("div");
  box.className = "slide-try";
  const title = document.createElement("p");
  title.className = "slide-try-name";
  title.textContent = name;
  const note = document.createElement("p");
  note.className = "slide-try-why";
  note.textContent = why;
  const read = document.createElement("p");
  read.className = "slide-try-read";
  read.textContent = "On 2";
  box.append(title, note, read);
  return { box, read };
}

function slideNative(name, why, kind, step) {
  const { box, read } = slideTryBox(name, why);
  const row = document.createElement("label");
  row.className = `slide-try-row slide-try-${kind}`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "5";
  input.step = step;
  input.value = "2";
  input.setAttribute("aria-label", name);
  row.append(Object.assign(document.createElement("span"), { textContent: "Less" }), input, Object.assign(document.createElement("span"), { textContent: "More" }));
  box.insertBefore(row, read);
  const say = () => { read.textContent = step === "any" ? `Holding ${Number(input.value).toFixed(2)}` : `On ${input.value}`; };
  input.addEventListener("input", say);
  input.addEventListener("change", () => { read.textContent = `On ${Math.round(Number(input.value))}`; });
  row.addEventListener("pointerdown", (event) => {
    if (event.target === input) return;
    read.textContent = `Missed. On ${Math.round(Number(input.value))}`;
  });
  return box;
}

function slideFinger(name, why, wide) {
  const { box, read } = slideTryBox(name, why);
  const row = document.createElement("div");
  row.className = `slide-try-row slide-try-finger${wide ? " slide-try-wide" : ""}`;
  const track = document.createElement("div");
  track.className = "slide-try-track";
  track.append(document.createElement("i"), document.createElement("b"));
  row.append(Object.assign(document.createElement("span"), { textContent: "Less" }), track, Object.assign(document.createElement("span"), { textContent: "More" }));
  box.insertBefore(row, read);
  const fill = track.querySelector("i");
  const thumb = track.querySelector("b");
  let value = 2;
  const paint = (n, held, lost) => {
    const at = (n / 5) * 100;
    fill.style.width = `${at}%`;
    thumb.style.left = `${at}%`;
    read.textContent = lost ? `Finger lost. On ${Math.round(n)}` : held ? `Holding ${n.toFixed(2)}` : `On ${Math.round(n)}`;
  };
  const fromX = (x, snap) => {
    const rect = track.getBoundingClientRect();
    const width = rect.width || 1;
    const clamped = Math.min(rect.right, Math.max(rect.left, x));
    const raw = ((clamped - rect.left) / width) * 5;
    value = snap ? Math.round(raw) : raw;
    return value;
  };
  const grab = wide ? row : track;
  let holding = false;
  let pointer = 0;
  const move = (event) => {
    if (!holding || event.pointerId !== pointer) return;
    if (event.cancelable) event.preventDefault();
    paint(fromX(event.clientX, false), true, false);
  };
  const drop = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", lost);
  };
  const up = (event) => {
    if (!holding || event.pointerId !== pointer) return;
    holding = false;
    drop();
    paint(fromX(event.clientX, true), false, false);
  };
  const lost = (event) => {
    if (!holding || event.pointerId !== pointer) return;
    holding = false;
    drop();
    value = Math.round(value);
    paint(value, false, true);
  };
  grab.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    holding = true;
    pointer = event.pointerId;
    try { grab.setPointerCapture(event.pointerId); } catch (error) {}
    event.preventDefault();
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", lost);
    paint(fromX(event.clientX, false), true, false);
  });
  paint(2, false, false);
  return box;
}

function sliderTry() {
  const pane = document.getElementById("admin-sliders");
  if (!pane || pane.dataset.built) return;
  pane.dataset.built = "1";
  pane.append(
    slideNative("The one on the site", "Small thumb. A finger next to it can miss.", "site", "1"),
    slideNative("Bigger thumb", "The phone's own slider, with a thumb you can hit.", "fat", "any"),
    slideFinger("Follows your finger", "The bar tracks your finger. It lands on a number when you let go.", false),
    slideFinger("The whole row", "A finger on the words or the bar grabs it.", true)
  );
}
window.sliderTry = sliderTry;
