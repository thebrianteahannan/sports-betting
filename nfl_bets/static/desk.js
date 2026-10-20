const LAPTOP = [[6, 636], [178, 678], [156, 798], [4, 756]];
const NOTE = [[356, 778], [584, 751], [600, 882], [371, 909]];
const NOTE_URL = [[353, 766], [559, 740], [561, 756], [355, 782]];
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
  const url = document.getElementById("desk-url");
  if (url && url.clientWidth) url.style.transform = quadMatrix(url.clientWidth, url.clientHeight, NOTE_URL);
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
    y: visH > 1024 ? visH / 2 : Math.min(Math.max(y, Math.min(visH / 2, midY)), Math.max(1024 - visH / 2, midY)),
    scale,
    ox: box ? box.ox : 0,
    oy: box ? box.oy : 0,
    sw: w,
    sh: h,
  };
}

function shot() {
  const { w, h } = viewSize();
  if (document.getElementById("desk")?.classList.contains("tv-full")) return place(0, 0, Math.max(w / 959, h / 1024) * (w / h > 959 / 1024 ? 1.2 : 1));
  return place(480, 512, Math.min(w / 959, h / 1024));
}

function setMenu(on) {
  const desk = document.getElementById("desk");
  const btn = document.getElementById("desk-menu");
  if (!desk || !btn) return;
  desk.classList.toggle("menu-open", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-expanded", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Close the menu" : "Open the menu");
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
  cam = shot();
  apply();
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

let noteLines = ["I already picked tonight."];
let noteTick = 0;
function noteHtml(text) {
  return String(text || "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch])).replace(/\*([^*]+)\*/g, "<b>$1</b>");
}
function paintNote() {
  const box = document.getElementById("desk-note-in");
  if (!box || box.dataset.live) return;
  box.dataset.live = "1";
  box.innerHTML = `<p class="note-reason" id="note-reason"></p>`;
  const line = document.getElementById("note-reason");
  const show = () => {
    const text = noteLines[noteTick++ % noteLines.length] || "";
    line.innerHTML = noteHtml(text);
    line.classList.toggle("hint", text.length > 70);
    line.classList.remove("pop");
    void line.offsetWidth;
    line.classList.add("pop");
  };
  show();
  window.setInterval(show, 4500);
  fetch("/api/notes", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
    const rows = ((payload && payload.notes) || []).map((row) => String(row.text || "").trim()).filter(Boolean);
    if (rows.length) { noteLines = rows; noteTick = 0; show(); }
  }).catch(() => {});
}
window.applyNotes = (rows) => { const next = (rows || []).map((row) => String(row.text || "").trim()).filter(Boolean); if (next.length) noteLines = next; };

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
  const menu = document.getElementById("desk-menu");
  if (menu) menu.addEventListener("click", (event) => {
    event.stopPropagation();
    if (window.goFull) goFull();
    if (menu.classList.contains("bird-has") && event.clientX < menu.getBoundingClientRect().left) { if (window.matchMedia("(hover: none), (pointer: coarse)").matches) menu.classList.toggle("say-open"); return; }
    if (birdPending) { const pending = birdPending; birdPending = null; menu.classList.remove("bird-has", "bird-brag", "say-open"); menu.removeAttribute("data-say"); menu.setAttribute("aria-label", "Ask Parlay the Parrot"); if (!(window.birdBragGo && birdBragGo(pending[0]))) birdSay(pending[0], pending[1]); return; }
    if (window.askBet) askBet("general");
  });
  document.addEventListener("click", (event) => {
    if (menu && !event.target.closest("#desk-menu")) menu.classList.remove("say-open");
    const desk = document.getElementById("desk");
    if (!desk || !desk.classList.contains("menu-open")) return;
    if (event.target.closest("#desk-dock")) {
      if (event.target.closest("[data-tab], [data-quiz], [data-parrot], #member-profile, #hard-refresh")) setMenu(false);
      return;
    }
    setMenu(false);
  });
  paintNote();
  startGuide();
  const back = document.getElementById("desk-back");
  if (back) back.addEventListener("click", tvBack);
  const go = document.getElementById("choice-go");
  if (go) go.addEventListener("click", tvPush);
  const home = document.getElementById("desk-home");
  if (home) home.addEventListener("click", () => { tvStack = []; tvPaint(); tvSkip = true; birdOn = true; birdHeld = true; if (window.birdGreet) birdGreet(); else birdSay("Hey. What are you trying to do today?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"], ["parrot", "Ask Parlay the Parrot"]]); tvSkip = false; birdBump(); });
}
const BIRD_WAIT = 18000;
const BIRD_NUDGES = [
  ["Hey, want to find a bet you want to make?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"], ["parrot", "Ask Parlay the Parrot"]]],
  ["Hey, try a safer bet. Five dollars wins about $2.50. It still loses sometimes. It just loses less often than the ones that pay a lot.", [["quiz", "Try Safe Bet", "safe"]]],
  ["Hey, a safer bet is a smaller win. A bigger payout is more fun to talk about with friends, and it loses more often.", [["quiz", "Build a higher payout", "payout"]]],
  ["Best Bets of the Week puts each pick on a different day. Want a look?", [["week", "Best Bets of the Week"]]],
  ["Tonight's bet is ready. Want a look?", [["today", "Show tonight's bet"]]],
  ["", [["menu", "View Our Recommended Bets", "bets"]], "brag"],
  ["Gambling can really ruin people's lives. Only bet money you can afford to lose. If you need help, call 1‑800‑GAMBLER.", []],
];
let birdTimer = 0; let birdNudge = 0; let birdPending = null;
let birdOn = false;
let birdHeld = false;

function birdSay(text, picks) {
  const box = document.getElementById("bird-guide");
  const line = document.getElementById("bird-line");
  const row = document.getElementById("bird-picks");
  if (!box || !line || !row) return;
  const desk = document.getElementById("desk");
  if (document.body.classList.contains("needs-member")) {
    box.hidden = true;
    if (desk) desk.classList.remove("bird-on");
    return;
  }
  if (!tvSkip && desk && !desk.classList.contains("bird-on")) tvPush();
  if (desk) { desk.classList.add("bird-on"); tvPaint(); }
  line.textContent = text; line.classList.toggle("warn", /ruin people's lives/i.test(text)); line.classList.toggle("pow", text === "Squawk!!!");
  row.replaceChildren();
  (picks || []).forEach(([tab, label, aim]) => {
    const button = document.createElement("button");
    button.type = "button";
    if (tab === "quiz" || tab === "ask" || tab === "menu" || tab === "parrot") button.dataset[tab] = aim || "";
    else { button.dataset.tab = tab; if (aim) button.dataset.aim = aim; }
    button.textContent = label;
    row.append(button);
  });
  box.hidden = false;
  const head = document.getElementById("desk-head");
  if (!head) return;
  head.classList.remove("bird-talk");
  void head.offsetWidth;
  head.classList.add("bird-talk");
}

function birdBump() {
  clearTimeout(birdTimer);
  if (document.body.classList.contains("needs-member") || window.asking) return;
  birdTimer = setTimeout(() => {
    if (document.body.classList.contains("needs-member") || window.asking) return;
    const nudge = BIRD_NUDGES[birdNudge % BIRD_NUDGES.length];
    birdNudge += 1;
    const text = nudge[2] === "brag" && window.birdBrag ? birdBrag() : nudge[0];
    if (text) { birdPending = [text, nudge[1]]; const menu = document.getElementById("desk-menu"); if (menu) { menu.classList.add("bird-has"); menu.classList.remove("say-open"); menu.classList.toggle("bird-brag", nudge[2] === "brag"); menu.dataset.say = text; menu.setAttribute("aria-label", "Parlay has something to say"); } }
    birdBump();
  }, BIRD_WAIT);
}

window.birdQuiet = () => clearTimeout(birdTimer);

function birdHide() {
  const desk = document.getElementById("desk"); const box = document.getElementById("bird-guide"); const head = document.getElementById("desk-head");
  if (desk) desk.classList.remove("bird-on"); if (box) box.hidden = true; if (head) head.classList.remove("bird-talk"); tvPaint();
}

function birdLand() {
  const desk = document.getElementById("desk");
  if (!window.askShow && desk && desk.classList.contains("bird-on")) tvPush();
  tvSeen = true; birdOn = true; birdHeld = true; window.asking = false; birdHide(); birdBump();
}

function startGuide() {
  const hello = () => {
    birdOn = true;
    birdHeld = false;
    window.squawkUntil = Date.now() + 900; birdSay("Squawk!!!", []);
    setTimeout(() => {
      if (!birdOn || birdHeld || window.asking || document.body.classList.contains("needs-member")) return;
      if (window.birdGreet) birdGreet(); else birdSay("Hey. What are you trying to do today?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"], ["parrot", "Ask Parlay the Parrot"]]);
    }, 900);
    birdBump();
  };
  if (!document.body.classList.contains("needs-member")) hello();
  else { const watch = new MutationObserver(() => { if (document.body.classList.contains("needs-member")) return; watch.disconnect(); hello(); }); watch.observe(document.body, { attributes: true, attributeFilter: ["class"] }); }
  document.addEventListener("pointerdown", birdBump);
  document.addEventListener("keydown", birdBump);
  document.addEventListener("click", (event) => {
    const stay = event.target.closest("[data-stay]");
    if (stay) { while (tvStack.length && tvStack.at(-1).bird) tvStack.pop(); tvBack(); return; }
    const quiz = event.target.closest("[data-quiz]");
    if (quiz && window.askStart) { if (window.goFull) goFull(); askStart(quiz.dataset.quiz); return; }
    const asked = event.target.closest("#bird-guide [data-ask]");
    if (asked && window.askAnswer) { askAnswer(asked.dataset.ask); return; }
    const tab = event.target.closest("[data-tab], #member-profile");
    if (!tab || !birdOn || tab.dataset.tab === "build") return;
    birdLand();
  });
}

let tvStack = [];
let tvSkip = false;
let tvSeen = false;
function tvShot() {
  const desk = document.getElementById("desk");
  if (desk && desk.classList.contains("bird-on")) {
    const picks = [...document.querySelectorAll("#bird-picks button")].filter((b) => !b.dataset.stay && !b.dataset.rec).map((b) => ["quiz" in b.dataset ? "quiz" : "ask" in b.dataset ? "ask" : "parrot" in b.dataset ? "parrot" : b.dataset.tab, b.textContent, b.dataset.quiz || b.dataset.ask || b.dataset.parrot || b.dataset.aim || ""]);
    return { bird: 1, text: document.getElementById("bird-line").textContent, picks };
  }
  const tab = (window.state && state.tab) || "today";
  const chooser = document.getElementById("chooser");
  return { tab, built: tab === "build" && !!(chooser && chooser.classList.contains("built")) };
}
function tvSame(a, b) {
  return !!a && !!b && !!a.bird === !!b.bird && (a.bird ? a.text === b.text : a.tab === b.tab && !!a.built === !!b.built);
}
function tvPaint() {
  const desk = document.getElementById("desk"); desk.classList.toggle("has-back", tvStack.length > 0 || desk.classList.contains("bird-on"));
}
function tvPush() {
  if (tvSkip) return;
  const shot = tvShot();
  if ((shot.bird && !shot.picks.length) || tvSame(shot, tvStack.at(-1))) return;
  tvStack.push(shot);
  if (tvStack.length > 12) tvStack.shift();
  tvPaint();
}
function tvUnbuild() {
  const chooser = document.getElementById("chooser");
  if (!chooser) return;
  chooser.classList.remove("built");
  const again = document.getElementById("choice-again");
  const box = document.getElementById("choice-result");
  if (again) again.hidden = true;
  if (box) box.textContent = "";
}
function tvBack() {
  const prev = tvStack.pop();
  if (!prev) { window.asking = false; birdHide(); return; }
  tvPaint();
  tvSkip = true;
  if (prev.bird) birdSay(prev.text, prev.picks);
  else { window.asking = false; birdHide(); if (!prev.built) tvUnbuild(); showTab(prev.tab); }
  tvSkip = false;
}
const goTab = showTab;
showTab = (name) => {
  const desk = document.getElementById("desk"); if (desk) desk.classList.remove("solo");
  if (window.legStarted && !window.keepStarted && window.state && window.state.board) { const map = { best: "band", today: "todayBet", week: "weekThree", week5: "weekFive", safe: "weekSafe", even: "weekEven", chalk: "chalk", four: "four", plus: "plus", hits: "hits" }; Object.keys(map).forEach((id) => { const card = document.getElementById(id); const data = window.state.board[map[id]]; if (card && data && window.legStarted(data)) card.hidden = true; }); }
  if (!tvSkip && !(desk && desk.classList.contains("bird-on"))) {
    const here = tvShot();
    if (!tvSame(here, { tab: name, built: name === "build" && here.built })) { tvSeen = true; tvPush(); }
  }
  goTab(name);
};

window.deskFrame = deskFrame;
window.deskGate = showGateScene;
window.birdSay = birdSay;
bootDesk();
