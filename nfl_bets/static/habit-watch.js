// Pages, time on each page, clicks, and bets, for the admin habit card.
const habitQueue = [];
let habitPage = "", habitAt = Date.now(), habitLast = "", habitSeen = 0;

function habitHereNow() {
  if (document.body.classList.contains("needs-member") || Date.now() - habitSeen < 20000) return;
  habitSeen = Date.now();
  habitPush({ kind: "here", name: "here" });
}

function habitHere() {
  if (document.body.classList.contains("needs-member")) return "";
  const board = document.querySelector("#desk-glass-in .rec-board");
  if (board && board.dataset.page) {
    if (board.dataset.page === "find" && typeof whereFind === "function") return whereFind(board);
    if (board.dataset.page === "bets") return window.recPast ? "Finished bets" : "Experimental strategies";
    const pages = { stack: "Parlay strategies", ones: "One-pick strategies", how: "How's my bet" };
    return pages[board.dataset.page] || board.dataset.page;
  }
  const desk = document.getElementById("desk");
  if (desk && desk.classList.contains("bird-on")) return "Home";
  const titles = { today: "Today's parlay", week: "This week's parlays", build: "Build a bet", how: "How we pick", help: "Gambling help", open: "Our bets", history: "Finished bets", profile: "Your membership", laws: "State rules" };
  return titles[(window.state && state.tab) || ""] || "Home";
}

function habitPush(event) {
  const name = String(event.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) return;
  const last = habitQueue.at(-1);
  if (last && last.kind === event.kind && last.name === name && Date.now() - (last.t || 0) < 12000 && event.kind !== "page") return;
  habitQueue.push({ kind: event.kind, name, ms: Math.max(0, Math.min(30 * 60 * 1000, Number(event.ms) || 0)), part: event.part ? 1 : 0, t: Date.now() });
  if (habitQueue.length > 40) habitQueue.splice(0, habitQueue.length - 40);
}

function habitMark(part) {
  const ms = Date.now() - habitAt;
  if (habitPage && ms >= 3000) habitPush({ kind: "page", name: habitPage, ms, part });
  habitAt = Date.now();
}

function habitLook() {
  const next = habitHere();
  if (next === habitPage) return;
  habitMark(0);
  habitPage = next;
}

function habitSend(bye) {
  if (!habitQueue.length || document.body.classList.contains("needs-member")) return;
  const events = habitQueue.splice(0, 20).map((row) => ({ kind: row.kind, name: row.name, ms: row.ms, part: row.part }));
  const body = JSON.stringify({ slot: "trail", events });
  if (bye) { fetch("/api/taste", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {}); return; }
  if (window.noteTaste) noteTaste("trail", { events });
}

document.addEventListener("click", habitHereNow, true);
document.addEventListener("keydown", (event) => { if (event.target && event.target.type !== "password") habitHereNow(); }, true);

document.addEventListener("click", (event) => {
  if (document.body.classList.contains("needs-member")) return;
  const hit = event.target.closest && event.target.closest("button, a, [role='button'], .tab, summary, .rec-bet, [data-bet-go], .desk-rec-bet");
  if (!hit || hit.closest("#profile-admin, input, textarea, select, #tv-zoom-x, #tv-zoom-open")) return;
  const betGo = hit.closest("[data-bet-go], .desk-rec-bet");
  const card = hit.closest(".rec-bet");
  const title = card && card.querySelector("b");
  const raw = betGo && title ? title.textContent : hit.matches(".rec-bet") && title ? title.textContent : (hit.getAttribute("aria-label") || hit.textContent || "");
  const label = raw.replace(/\s+/g, " ").trim();
  if (!label || label.length < 2 || /^[+–−×]+$/.test(label)) return;
  const key = `${betGo ? "bet" : "click"}:${label.slice(0, 80)}`;
  if (key === habitLast) return;
  habitLast = key;
  habitPush({ kind: betGo ? "bet" : "click", name: label });
}, true);

setInterval(() => { habitLook(); if (habitPage && Date.now() - habitAt >= 60000) habitMark(1); }, 4000);
setInterval(() => habitSend(false), 10000);
document.addEventListener("visibilitychange", () => { if (document.hidden) { habitMark(0); habitPage = ""; habitSend(true); } });
window.addEventListener("pagehide", () => { habitMark(0); habitSend(true); });
