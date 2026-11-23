/** Recommended page: picks, games, and strategies — moved off Build a bet. */

function paintRec(page) {
  const history = page === "history";
  if (typeof pageUrl === "function") pageUrl(history ? "history" : "rec");
  window.asking = true;
  if (document.body.classList.contains("tv-zoom-on") && typeof tvZoomShut === "function") tvZoomShut();
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { if (window.goFull) goFull(); }
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; return; }
  desk.classList.remove("bird-on", "solo", "dug");
  if (window.tvForce) tvForce();
  if (window.tvPush) tvPush();
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  if (window.tvTickStay) tvTickStay();
  else {
    const tick = document.getElementById("tv-tick");
    if (tick) tick.hidden = true;
  }
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  document.querySelectorAll(".rec-board").forEach((node) => node.remove());
  const board = document.createElement("div");
  board.className = "rec-board find-board find-rec-page";
  board.dataset.page = history ? "history" : "rec";
  if (history) board.classList.add("find-hist-page");
  const saved = findParts.today && findParts.today.data && Date.now() - findParts.today.at < 30 * 60 * 1000;
  if (!saved) board.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>Looking up the board.</p></div>`;
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  row.append(board);
  row.scrollTop = 0;
  loadFind("today").then((data) => {
    if (!board.isConnected) return null;
    fillFind(board, data);
    if (!(findParts.week && findParts.week.data)) {
      const note = document.createElement("p");
      note.className = "quiet";
      note.textContent = "Looking up the rest of the week.";
      const week = board.querySelector(".find-week");
      if (week) week.append(note);
    }
    return loadFind("week");
  }).then((more) => {
    if (!more || !board.isConnected || !board.people) return;
    const seen = new Map(board.people.map((person) => [person.key, person]));
    (more.people || []).forEach((person) => {
      const have = seen.get(person.key);
      if (!have) { board.people.push(person); return; }
      const ids = new Set((have.bets || []).map((bet) => `${bet.label}|${bet.odds}|${bet.match}`));
      (person.bets || []).forEach((bet) => { if (!ids.has(`${bet.label}|${bet.odds}|${bet.match}`)) have.bets.push(bet); });
    });
    setTimeout(() => {
      if (!board.isConnected || !board.paintSlate) return;
      board.querySelectorAll(".find-games").forEach((node) => { node.games = null; });
      board.people.games = null;
      board.paintSlate(board.querySelector(".find-week"));
      if (typeof startPaint === "function") startPaint(1);
    }, 50);
  }).catch(() => { if (board.isConnected && !board.querySelector("h2")) fillFind(board, {}); });
}

function paintHistory() {
  paintRec("history");
}

function recPageOpen() {
  if (typeof paintRec === "function") paintRec();
}

window.paintRec = paintRec;
window.paintHistory = paintHistory;
window.recPageOpen = recPageOpen;
