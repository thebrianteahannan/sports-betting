const LAPTOP = [[6, 636], [178, 678], [156, 798], [4, 756]];
const NOTE = [[356, 778], [584, 751], [600, 882], [371, 909]];
const PANES = {
  today: ["best"],
  week: ["week", "week5", "safe"],
  build: ["chooser"],
  open: ["pane-open"],
  how: ["pane-how"],
  history: ["pane-history"],
  profile: ["pane-profile"],
};

let cam = { x: 620, y: 430, scale: 1 };
let shown = "";
let tweenId = 0;

function viewSize() {
  const desk = document.getElementById("desk");
  if (desk && desk.clientWidth > 0 && desk.clientHeight > 0) {
    return { w: desk.clientWidth, h: desk.clientHeight };
  }
  const view = window.visualViewport;
  return {
    w: view ? view.width : window.innerWidth,
    h: view ? view.height : window.innerHeight,
  };
}

function solve8(rows) {
  const m = rows.map((row) => row.slice());
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    const swap = m[col];
    m[col] = m[pivot];
    m[pivot] = swap;
    const div = m[col][col] || 1e-8;
    for (let cell = col; cell < 9; cell += 1) m[col][cell] /= div;
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let cell = col; cell < 9; cell += 1) m[row][cell] -= factor * m[col][cell];
    }
  }
  return m.map((row) => row[8]);
}

function quadMatrix(width, height, quad) {
  const src = [[0, 0], [width, 0], [width, height], [0, height]];
  const rows = [];
  src.forEach(([x, y], index) => {
    const [u, v] = quad[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  const h = solve8(rows);
  return `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
}

function warp() {
  const glass = document.getElementById("desk-glass");
  const glow = document.getElementById("desk-glow");
  const note = document.getElementById("desk-note");
  const laptop = document.getElementById("desk-laptop");
  if (!glass || !glass.clientWidth) return;
  glass.style.transform = "none";
  if (glow) glow.style.transform = "none";
  if (note && note.clientWidth) note.style.transform = quadMatrix(note.clientWidth, note.clientHeight, NOTE);
  if (laptop && laptop.clientWidth) laptop.style.transform = quadMatrix(laptop.clientWidth, laptop.clientHeight, LAPTOP);
}

function place(x, y, scale, box) {
  const full = viewSize();
  const w = box ? box.w : full.w;
  const h = box ? box.h : full.h;
  const visW = w / scale;
  const visH = h / scale;
  const midX = 959 / 2;
  const midY = 1024 / 2;
  return {
    x: Math.min(Math.max(x, Math.min(visW / 2, midX)), Math.max(959 - visW / 2, midX)),
    y: Math.min(Math.max(y, Math.min(visH / 2, midY)), Math.max(1024 - visH / 2, midY)),
    scale,
    ox: box ? box.ox : 0,
    oy: box ? box.oy : 0,
    sw: w,
    sh: h,
  };
}

function shot() {
  const { w, h } = viewSize();
  return place(480, 512, Math.min(w / 959, h / 1024));
}

function toggleTv() {
  const desk = document.getElementById("desk");
  const glass = document.getElementById("desk-glass");
  const glow = document.getElementById("desk-glow");
  const btn = document.getElementById("desk-full");
  if (!desk || !glass || !glow) return;
  const on = desk.classList.toggle("tv-full");
  if (on) desk.insertBefore(glass, document.getElementById("desk-dock"));
  else glow.after(glass);
  if (!btn) return;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Close the TV" : "Make the TV full screen");
}

function apply() {
  const world = document.getElementById("desk-world");
  if (!world) return;
  const { w, h } = viewSize();
  const sw = cam.sw || w;
  const sh = cam.sh || h;
  const ox = cam.ox || 0;
  const oy = cam.oy || 0;
  world.style.transform = `translate(${ox + sw / 2 - cam.x * cam.scale}px, ${oy + sh / 2 - cam.y * cam.scale}px) scale(${cam.scale})`;
}

function tween(target) {
  const { w, h } = viewSize();
  const from = {
    x: cam.x,
    y: cam.y,
    scale: cam.scale,
    ox: cam.ox || 0,
    oy: cam.oy || 0,
    sw: cam.sw || w,
    sh: cam.sh || h,
  };
  const start = performance.now();
  const token = ++tweenId;
  function step(now) {
    if (token !== tweenId) return;
    const k = Math.min(1, (now - start) / 420);
    const ease = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
    cam.x = from.x + (target.x - from.x) * ease;
    cam.y = from.y + (target.y - from.y) * ease;
    cam.scale = from.scale + (target.scale - from.scale) * ease;
    cam.ox = from.ox + ((target.ox || 0) - from.ox) * ease;
    cam.oy = from.oy + ((target.oy || 0) - from.oy) * ease;
    cam.sw = from.sw + ((target.sw || w) - from.sw) * ease;
    cam.sh = from.sh + ((target.sh || h) - from.sh) * ease;
    apply();
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function mount(name) {
  const glass = document.getElementById("desk-glass-in");
  const hold = document.getElementById("desk-hold");
  const ids = PANES[name] || PANES.today;
  [...glass.children].forEach((node) => hold.append(node));
  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (node) glass.append(node);
  });
  const chooser = document.getElementById("chooser");
  if (chooser && name !== "build") hold.append(chooser);
  glass.classList.remove("arrive");
  void glass.offsetWidth;
  glass.classList.add("arrive");
}

const NOTE_REASONS = [
  "See the <b>chance</b>, not just the juice.",
  "A <b>$5</b> night that stays a $5 night.",
  "Every leg gets a <b>different day</b>.",
  "You place it. We <b>never send</b> it.",
  "The short prices <b>stay off</b> the card.",
  "The slate is <b>already picked</b>.",
  "Have the fun. <b>Keep the wallet.</b>",
  "Know what the <b>number</b> means.",
];
let noteTick = 0;
let noteTimer = 0;

function paintNote() {
  const box = document.getElementById("desk-note-in");
  if (!box || box.dataset.live) return;
  box.dataset.live = "1";
  box.innerHTML = `<p class="note-kicker">Why Parlay of the Day?</p><p class="note-reason" id="note-reason"></p>`;
  const line = document.getElementById("note-reason");
  const show = () => {
    line.innerHTML = NOTE_REASONS[noteTick % NOTE_REASONS.length];
    noteTick += 1;
    line.classList.remove("pop");
    void line.offsetWidth;
    line.classList.add("pop");
  };
  show();
  noteTimer = window.setInterval(show, 2600);
}

function countUps(root) {
  root.querySelectorAll("em").forEach((el) => {
    const match = String(el.textContent).match(/^(\d+(?:\.\d+)?)%/);
    if (!match) return;
    const target = Number(match[1]);
    const rest = el.textContent.slice(match[0].length);
    const start = performance.now();
    function step(now) {
      const k = Math.min(1, (now - start) / 700);
      const eased = 1 - (1 - k) ** 3;
      const shown = target % 1 ? (target * eased).toFixed(1) : String(Math.round(target * eased));
      el.textContent = `${shown}%${rest}`;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

const SQUAWK = "Think you're smarter than a bird? Sign up and find out!!";
let squawkTimer = 0;

function squawk() {
  const line = document.getElementById("gate-line");
  if (!line || squawkTimer) return;
  line.setAttribute("aria-label", SQUAWK);
  let i = 0;
  let hold = 0;
  function step() {
    if (!document.body.classList.contains("needs-member")) {
      squawkTimer = 0;
      return;
    }
    if (i < SQUAWK.length) {
      i += 1;
      line.textContent = SQUAWK.slice(0, i);
      squawkTimer = window.setTimeout(step, SQUAWK[i - 1] === " " ? 34 : 24);
      return;
    }
    hold += 1;
    if (hold < 32) {
      squawkTimer = window.setTimeout(step, 70);
      return;
    }
    i = 0;
    hold = 0;
    line.textContent = "";
    squawkTimer = window.setTimeout(step, 260);
  }
  step();
}

function showGateScene() {
  const glass = document.getElementById("desk-glass-in");
  const gate = document.getElementById("gate");
  const hold = document.getElementById("desk-hold");
  if (!glass || !gate) return;
  warp();
  [...glass.children].forEach((node) => {
    if (node !== gate) hold.append(node);
  });
  glass.append(gate);
  shown = "gate";
  cam = shot("gate");
  apply();
  const wait = document.getElementById("gate-wait");
  const line = document.getElementById("gate-line");
  if (wait && !wait.hidden) {
    if (line) line.textContent = "The parrot is eating crackers.";
    return;
  }
  squawk();
}

function deskFrame(name) {
  const desk = document.getElementById("desk");
  if (!desk || document.body.classList.contains("needs-member")) return;
  warp();
  mount(name);
  paintNote();
  countUps(document.getElementById("desk-glass-in"));
  const target = shot(name);
  if (shown === name) return;
  shown = name;
  tween(target);
}

function bootDesk() {
  warp();
  if (document.body.classList.contains("needs-member")) showGateScene();
  else {
    cam = shot("today");
    apply();
  }
  const refit = () => {
    const name = shown || (document.body.classList.contains("needs-member") ? "gate" : "today");
    cam = shot(name);
    apply();
  };
  window.addEventListener("resize", refit);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", refit);
  const full = document.getElementById("desk-full");
  if (full) full.addEventListener("click", toggleTv);
  paintNote();
}

window.deskFrame = deskFrame;
window.deskGate = showGateScene;
bootDesk();
