/** Finished saved parlays leave the saved row and land here, graded from the box score, grouped by day and league. */

window.archiveRows = window.archiveRows || [];
window.archiveOpen = window.archiveOpen || false;
let archiveBusy = false;
const ARCHIVE_TOLD_KEY = "pod-archive-told";
const ARCHIVE_SEED_KEY = "pod-archive-seed";

function archiveToldLoad() {
  try { return JSON.parse(localStorage.getItem(ARCHIVE_TOLD_KEY) || "{}") || {}; } catch (error) { return {}; }
}

function archiveToldSave(map) {
  try { localStorage.setItem(ARCHIVE_TOLD_KEY, JSON.stringify(map)); } catch (error) {}
}

function archiveNotifyLabel(row) {
  const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
  const sum = (row.legs || []).map((leg) => leg.text || leg.label || "").filter(Boolean).slice(0, 3).join(" · ");
  return String(games || sum || "Your bet").slice(0, 120);
}

function archiveNotify(rows) {
  const told = archiveToldLoad();
  const seeded = localStorage.getItem(ARCHIVE_SEED_KEY) === "1";
  const fresh = [];
  (rows || []).forEach((row) => {
    const result = row && row.done && row.done.result;
    if (result !== "won" && result !== "lost") return;
    if (told[row.id] === result) return;
    if (seeded) fresh.push(row);
    told[row.id] = result;
  });
  archiveToldSave(told);
  if (!seeded) {
    try { localStorage.setItem(ARCHIVE_SEED_KEY, "1"); } catch (error) {}
    return;
  }
  if (!fresh.length) return;
  if (typeof notifyOn !== "function" || !notifyOn()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (typeof notifyShow !== "function") return;
  fresh.forEach((row) => {
    notifyShow({
      title: row.done.result === "won" ? "Bet hit" : "Bet missed",
      body: archiveNotifyLabel(row),
      tag: `bet-${row.id}`,
      data: { bet: row.id },
      click: () => {
        if (typeof goFull === "function") goFull();
        if (typeof showTab === "function") showTab("profile");
        const box = document.getElementById("profile-history");
        if (box) box.scrollIntoView({ block: "start" });
      },
    });
  });
}

async function archiveCheck() {
  if (!window.saveWho || archiveBusy) return;
  archiveBusy = true;
  try {
    const res = await fetch("/api/parlays/archive");
    if (!res.ok) return;
    const { archive, reviews } = await res.json();
    window.archiveRows = Array.isArray(archive) ? archive : [];
    window.archiveReviews = reviews || {};
    archiveNotify(window.archiveRows);
    if (typeof bankLoad === "function") bankLoad();
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

const archiveOpenKeys = new Set();

function archiveKeep(node, key) {
  if (archiveOpenKeys.has(key)) node.open = true;
  node.addEventListener("toggle", () => { if (node.open) archiveOpenKeys.add(key); else archiveOpenKeys.delete(key); });
}

function archiveUnit(leg) {
  const text = String(leg.text || leg.label || "");
  const hit = text.match(/\d+(?:\.\d+)?\s*\+?\s+([a-z][a-z ]{2,30})$/i);
  if (hit) return hit[1].replace(/\s+/g, " ").trim();
  if (/touchdown|\btd\b/i.test(text)) return "touchdowns";
  if (/reception/i.test(text)) return "receptions";
  return "";
}

function archiveGot(leg) {
  if (!leg || leg.result === "check") return "";
  if (leg.result === "void") return leg.note || "Did not play";
  const note = String(leg.note || "").trim();
  if (note && !/^-?\d+(?:\.\d+)?$/.test(note)) return note;
  const n = Number(leg.have != null && leg.have !== "" ? leg.have : note);
  if (!Number.isFinite(n)) return "";
  const said = Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  let unit = archiveUnit(leg);
  if (unit && Math.abs(n - 1) < 0.05 && /s$/.test(unit) && !/ss$/.test(unit)) unit = unit.slice(0, -1);
  return `had ${said}${unit ? ` ${unit}` : ""}`;
}

function archiveCard(row) {
  const card = document.createElement("details");
  card.className = `find-done-card ${row.done.result}`;
  archiveKeep(card, `card:${row.id}`);
  const word = { won: "Won", lost: "Lost", push: "Push", check: "Not graded" }[row.done.result] || "";
  const games = typeof gameShortList === "function" ? gameShortList(row.legs) : "";
  const price = savePrice(row.legs);
  const sum = row.legs.map((leg) => leg.text || leg.label || "").filter(Boolean).join(" · ");
  const got = row.legs.map(archiveGot).filter(Boolean).join(" · ");
  card.innerHTML = `<summary class="find-done-head"><b>${esc(word)}</b>${price ? `<i>${esc(price)}</i>` : ""}${games ? `<span>${esc(games)}</span>` : ""}${sum ? `<em class="find-done-sum">${esc(sum)}</em>` : ""}${got ? `<em class="find-done-got">${esc(got)}</em>` : ""}</summary>`;
  const list = document.createElement("ul");
  row.legs.forEach((leg) => {
    const item = document.createElement("li");
    item.className = leg.result;
    const mark = { won: "✓", lost: "✗", push: "–", void: "Void", check: "?" }[leg.result] || "?";
    const note = leg.result === "check" ? "Not in the box score" : archiveGot(leg);
    item.innerHTML = `<b>${esc(mark)}</b><span>${esc(leg.text || leg.label || "")}</span>${note ? `<em>${esc(note)}</em>` : ""}${leg.why ? `<p class="find-done-why">${esc(leg.why)}</p>` : ""}`;
    list.append(item);
  });
  card.append(list);
  return card;
}

function archiveGame(key, rows, day) {
  const wrap = document.createElement("details");
  wrap.className = "find-done-game";
  archiveKeep(wrap, `game:${day}|${key}`);
  const review = (window.archiveReviews || {})[key] || {};
  const match = key === "many" ? "Parlays across games" : key.split("|")[0];
  wrap.innerHTML = `<summary class="find-done-title"><b>${esc(review.final || match)}</b>${review.final ? `<span>${esc(match)}</span>` : ""}<i>${esc(archiveTally(rows))}</i></summary>`;
  if (review.script || review.checks) {
    const mark = { held: "✓", miss: "✗", odd: "!" };
    const box = document.createElement("details");
    box.className = "find-done-review";
    archiveKeep(box, `review:${day}|${key}`);
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
  top.innerHTML = `<b>Bet history</b><span>${esc(archiveTally(window.archiveRows.filter((row) => row.done)))}</span>`;
  panel.append(top);
  const days = new Map();
  window.archiveRows.filter((row) => row.done).forEach((row) => { if (!days.has(row.done.day)) days.set(row.done.day, []); days.get(row.done.day).push(row); });
  [...days.keys()].sort().reverse().forEach((day) => {
    const rows = days.get(day), box = document.createElement("details");
    archiveKeep(box, `day:${day}`);
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
      [...games.keys()].sort((a, b) => (a === "many") - (b === "many") || a.localeCompare(b)).forEach((key) => box.append(archiveGame(key, games.get(key), day)));
    });
    panel.append(box);
  });
  return panel;
}

function archivePaint() {
  document.querySelectorAll(".find-saved").forEach((box) => {
    box.querySelectorAll(":scope > .find-saved-done, :scope > p.find-say > .find-saved-done, :scope > .find-done").forEach((node) => node.remove());
  });
  const host = document.getElementById("profile-history");
  if (!host) return;
  host.replaceChildren();
  const done = window.archiveRows.filter((row) => row.done);
  if (!done.length) {
    host.innerHTML = `<p class="find-done-top"><b>Bet history</b></p><p class="quiet">No finished bets.</p>`;
    return;
  }
  host.append(archivePanel());
}

if (typeof paintParlay === "function") {
  const paintParlayKeep = paintParlay;
  paintParlay = function () {
    paintParlayKeep.apply(this, arguments);
    archivePaint();
  };
}
