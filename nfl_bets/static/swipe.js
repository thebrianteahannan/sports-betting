const SWIPE_KEY = "nfl-bets-swipes";
let swipeUndo = null;
let swipeDrag = null;

function swipeVotes() {
  try {
    const rows = JSON.parse(localStorage.getItem(SWIPE_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function swipeSave(rows) {
  localStorage.setItem(SWIPE_KEY, JSON.stringify(rows.slice(0, 200)));
}

function swipeKey(card) {
  return `${card.id}|${(card.legs || []).map((leg) => `${leg.label}|${leg.odds}`).join("||")}`;
}

function suggestions() {
  const board = window.state && window.state.board;
  if (!board) return [];
  const cards = [];
  const add = (id, card, extra) => {
    const legs = (extra && extra.legs) || card.legs || [];
    if (!legs.length) return;
    const row = {
      id,
      title: (extra && extra.title) || card.title || id,
      game: (extra && extra.game) || card.game || "",
      legs,
      kickoff: (legs[0] && legs[0].kickoff) || card.kickoff || "",
      pct: (extra && extra.pct) || card.impliedPct || "",
    };
    row.key = swipeKey(row);
    cards.push(row);
  };
  add("todayBet", board.todayBet || {});
  ["chalk", "four", "plus"].forEach((id) => add(id, board[id] || {}));
  const hits = board.hits || {};
  (hits.groups || []).forEach((group) => add("hits", hits, {
    title: group.title || "Stack",
    game: hits.game || "",
    legs: group.legs || [],
    pct: group.pct || "",
  }));
  const voted = new Set(swipeVotes().map((row) => row.key));
  return cards.filter((card) => !voted.has(card.key));
}

function paintDeck() {
  if (swipeDrag) return;
  const card = document.getElementById("deck-card");
  const score = document.getElementById("swipe-score");
  if (!card) return;
  const rows = swipeVotes();
  const liked = rows.filter((row) => row.direction === "like").length;
  const passed = rows.filter((row) => row.direction === "pass").length;
  if (score) score.textContent = `Liked ${liked}. Passed ${passed}.`;
  const next = suggestions()[0];
  card.dataset.key = next ? next.key : "";
  card.style.transform = "";
  const like = document.getElementById("deck-like");
  const pass = document.getElementById("deck-pass");
  if (like) like.style.opacity = "0";
  if (pass) pass.style.opacity = "0";
  const undo = document.getElementById("deck-undo");
  if (undo) undo.disabled = !swipeUndo;
  if (!next) {
    card.innerHTML = "<p>You're caught up. Liked and passed cards stay out of the pile.</p>";
    return;
  }
  const whenLine = next.kickoff && typeof when === "function" ? `<p class="when">${esc(when(next.kickoff))} ET</p>` : "";
  const legs = next.legs.map((leg) => (
    `<li><b>${esc(american(leg.odds))}</b><span>${esc(leg.label)}</span><em>${esc(leg.pct || "")}</em></li>`
  )).join("");
  const pct = next.pct ? ` · ${esc(String(next.pct).includes("%") ? next.pct : `${next.pct}%`)}` : "";
  card.innerHTML = `<h3>${esc(next.title)}${pct}</h3><p class="quiet">${esc(next.game)}</p>${whenLine}<ol class="chalk-legs">${legs}</ol>`;
}

function commitSwipe(direction) {
  const next = suggestions()[0];
  if (!next) return;
  const rows = swipeVotes().filter((row) => row.key !== next.key);
  rows.unshift({ key: next.key, direction, title: next.title, at: new Date().toISOString() });
  swipeSave(rows);
  swipeUndo = next;
  const card = document.getElementById("deck-card");
  const dest = direction === "like" ? "120%" : "-120%";
  if (card) card.style.transform = `translateX(${dest}) rotate(${direction === "like" ? 12 : -12}deg)`;
  window.setTimeout(paintDeck, 180);
}

function bindDeck() {
  const card = document.getElementById("deck-card");
  if (!card || card.dataset.bound) return;
  card.dataset.bound = "1";
  card.addEventListener("pointerdown", (event) => {
    swipeDrag = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener("pointermove", (event) => {
    if (!swipeDrag) return;
    swipeDrag.dx = event.clientX - swipeDrag.x;
    swipeDrag.dy = event.clientY - swipeDrag.y;
    if (Math.abs(swipeDrag.dx) < Math.abs(swipeDrag.dy)) return;
    card.style.transform = `translateX(${swipeDrag.dx}px) rotate(${swipeDrag.dx / 18}deg)`;
    document.getElementById("deck-like").style.opacity = String(Math.min(1, Math.max(0, swipeDrag.dx / 70)));
    document.getElementById("deck-pass").style.opacity = String(Math.min(1, Math.max(0, -swipeDrag.dx / 70)));
  });
  const finish = () => {
    if (!swipeDrag) return;
    const dx = swipeDrag.dx;
    const dy = swipeDrag.dy;
    swipeDrag = null;
    if (Math.abs(dx) < Math.abs(dy)) {
      card.style.transform = "";
      return;
    }
    if (dx > 48) commitSwipe("like");
    else if (dx < -48) commitSwipe("pass");
    else paintDeck();
  };
  card.addEventListener("pointerup", finish);
  card.addEventListener("pointercancel", finish);
  document.getElementById("deck-like-btn").addEventListener("click", () => commitSwipe("like"));
  document.getElementById("deck-pass-btn").addEventListener("click", () => commitSwipe("pass"));
  document.getElementById("deck-undo").addEventListener("click", () => {
    if (!swipeUndo) return;
    swipeSave(swipeVotes().filter((row) => row.key !== swipeUndo.key));
    swipeUndo = null;
    paintDeck();
  });
}

const priorSwipePaint = window.paintChoices;
window.paintChoices = function paintWithSwipe() {
  if (priorSwipePaint) priorSwipePaint();
  paintDeck();
};

bindDeck();
paintDeck();
