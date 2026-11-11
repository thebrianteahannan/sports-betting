/** Finished saved parlays leave the saved row and land here, graded from the box score, grouped by day and league. */

window.archiveRows = window.archiveRows || [];
window.archiveOpen = window.archiveOpen || false;
let archiveBusy = false;

async function archiveCheck() {
  if (!window.saveWho || archiveBusy) return;
  archiveBusy = true;
  try {
    const res = await fetch("/api/parlays/archive");
    if (!res.ok) return;
    const { archive, reviews } = await res.json();
    window.archiveRows = Array.isArray(archive) ? archive : [];
    window.archiveReviews = reviews || {};
    const gone = new Set(window.archiveRows.map((row) => row.id)), local = saveList();
    if (local.some((row) => gone.has(row.id))) {
      localStorage.setItem(SAVE_KEY, JSON.stringify(local.filter((row) => !gone.has(row.id))));
      if (gone.has(window.parlayOpenId)) { window.parlayOpenId = ""; parlayPick.clear(); parlayLeg.clear(); if (typeof trayRoster === "function") trayRoster(); }
    }
    if (document.querySelector(".find-board") && typeof paintParlay === "function") paintParlay();
  } catch (error) { console.log("[parlay-archive] could not load", error); } finally { archiveBusy = false; }
}

const archiveWait = setInterval(() => { if (window.saveWho) { clearInterval(archiveWait); archiveCheck(); setInterval(archiveCheck, 5 * 60000); } }, 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") archiveCheck(); });

function archiveDay(day) {
  const date = new Date(`${day}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : day;
}

function archiveTally(rows) {
  const count = (want) => rows.filter((row) => row.done.result === want).length;
  return [["won", "won"], ["lost", "lost"], ["push", "pushed"], ["check", "not graded"]].map(([key, word]) => count(key) && `${count(key)} ${word}`).filter(Boolean).join(" · ");
}

function archiveCard(row) {
  const card = document.createElement("div");
  card.className = `find-done-card ${row.done.result}`;
  const word = { won: "Won", lost: "Lost", push: "Push", check: "Not graded" }[row.done.result] || "";
  const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
  const price = savePrice(row.legs);
  card.innerHTML = `<p class="find-done-head"><b>${esc(word)}</b>${price ? `<i>${esc(price)}</i>` : ""}${games ? `<span>${esc(games)}</span>` : ""}</p>`;
  const list = document.createElement("ul");
  row.legs.forEach((leg) => {
    const item = document.createElement("li");
    item.className = leg.result;
    const mark = { won: "✓", lost: "✗", push: "–", void: "Void", check: "?" }[leg.result] || "?";
    const note = leg.result === "check" ? "Not in the box score" : leg.note;
    item.innerHTML = `<b>${esc(mark)}</b><span>${esc(leg.text || leg.label || "")}</span>${note ? `<em>${esc(note)}</em>` : ""}${leg.why ? `<p class="find-done-why">${esc(leg.why)}</p>` : ""}`;
    list.append(item);
  });
  card.append(list);
  return card;
}

function archiveGame(key, rows) {
  const wrap = document.createElement("div");
  wrap.className = "find-done-game";
  const review = (window.archiveReviews || {})[key] || {};
  const match = key === "many" ? "Parlays across games" : key.split("|")[0];
  wrap.innerHTML = `<p class="find-done-title"><b>${esc(review.final || match)}</b>${review.final ? `<span>${esc(match)}</span>` : ""}<i>${esc(archiveTally(rows))}</i></p>`;
  if (review.script || review.checks) {
    const mark = { held: "✓", miss: "✗", odd: "!" };
    const box = document.createElement("details");
    box.className = "find-done-review";
    box.open = true;
    box.innerHTML = `<summary>${esc(review.verdict || "Game script vs what happened")}</summary>`
      + (review.script && review.script.length ? `<p class="find-done-sub">The script going in</p><p>${esc(review.script.join(" "))}</p>` : "")
      + (review.checks && review.checks.length ? `<p class="find-done-sub">What happened</p><ul>${review.checks.map((row) => `<li class="${esc(row.kind)}"><b>${esc(mark[row.kind] || "")}</b><span>${esc(row.text)}</span></li>`).join("")}</ul>` : "")
      + (review.went && review.went.length ? `<p class="find-done-sub">The box score</p><ul>${review.went.map((line) => `<li><span>${esc(line)}</span></li>`).join("")}</ul>` : "");
    wrap.append(box);
  }
  rows.forEach((row) => wrap.append(archiveCard(row)));
  return wrap;
}

function archivePanel() {
  const panel = document.createElement("div");
  panel.className = "find-done";
  const top = document.createElement("p");
  top.className = "find-done-top";
  top.innerHTML = `<b>Finished bets</b><span>${esc(archiveTally(window.archiveRows.filter((row) => row.done)))}</span><button type="button" class="find-done-x" aria-label="Close finished bets">×</button>`;
  top.querySelector("button").addEventListener("click", () => { window.archiveOpen = false; archivePaint(); });
  panel.append(top);
  const days = new Map();
  window.archiveRows.filter((row) => row.done).forEach((row) => { if (!days.has(row.done.day)) days.set(row.done.day, []); days.get(row.done.day).push(row); });
  [...days.keys()].sort().reverse().forEach((day, index) => {
    const rows = days.get(day), box = document.createElement("details");
    box.open = index === 0;
    box.innerHTML = `<summary><b>${esc(archiveDay(day))}</b><span>${esc(archiveTally(rows))}</span></summary>`;
    const leagues = new Map();
    rows.forEach((row) => { const league = row.done.league || "Other"; if (!leagues.has(league)) leagues.set(league, []); leagues.get(league).push(row); });
    [...leagues.keys()].sort().forEach((league) => {
      const head = document.createElement("p");
      head.className = "find-done-league";
      head.textContent = `${league} · ${archiveTally(leagues.get(league))}`;
      box.append(head);
      const games = new Map();
      leagues.get(league).forEach((row) => { const keys = [...new Set(row.legs.map((leg) => `${leg.match}|${leg.kickoff}`))], key = keys.length === 1 ? keys[0] : "many"; if (!games.has(key)) games.set(key, []); games.get(key).push(row); });
      [...games.keys()].sort((a, b) => (a === "many") - (b === "many") || a.localeCompare(b)).forEach((key) => box.append(archiveGame(key, games.get(key))));
    });
    panel.append(box);
  });
  return panel;
}

function archivePaint() {
  document.querySelectorAll(".find-saved").forEach((box) => {
    box.querySelectorAll(":scope > .find-saved-done, :scope > .find-done").forEach((node) => node.remove());
    if (!window.archiveRows.length) return;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-saved-st find-saved-done";
    go.textContent = window.archiveOpen ? "Hide finished" : `Finished (${window.archiveRows.length})`;
    go.setAttribute("aria-expanded", String(window.archiveOpen));
    go.addEventListener("click", () => { window.archiveOpen = !window.archiveOpen; archivePaint(); });
    const strat = box.querySelector(":scope > .find-saved-st");
    if (strat) strat.after(go); else box.append(go);
    if (window.archiveOpen) box.append(archivePanel());
  });
}

if (typeof paintParlay === "function") {
  const paintParlayKeep = paintParlay;
  paintParlay = function () {
    paintParlayKeep.apply(this, arguments);
    archivePaint();
  };
}
