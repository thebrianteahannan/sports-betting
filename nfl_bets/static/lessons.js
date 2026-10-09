function lossLegs(lost) {
  const seen = new Set();
  const rows = [];
  lost.forEach((ticket) => {
    (ticket.legs || []).forEach((leg) => {
      if (leg.result !== "lost") return;
      const key = `${lossHead(leg)}|${leg.line}|${leg.have}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(leg);
    });
  });
  return rows;
}

function lossHead(leg) {
  return String(leg.label || "").split(" — ")[0].trim();
}

function lossSport(leg) {
  if (leg.sport) return leg.sport;
  const tail = String(leg.label || "").split(" — ")[1] || "";
  return tail.split(",")[0].trim();
}

function lossUnit(leg) {
  if (typeof unitOf === "function") return unitOf(leg);
  return "";
}

function whyTicket(ticket) {
  const missed = (ticket.legs || []).filter((leg) => leg.result === "lost");
  if (!missed.length) return "This ticket is marked lost. The box score does not name the leg.";
  const bits = missed.map((leg) => {
    const have = Number(leg.have);
    const line = Number(leg.line);
    const name = lossHead(leg);
    if (!Number.isFinite(have) || !Number.isFinite(line)) return `${name} missed.`;
    const unit = lossUnit(leg);
    const shown = Number.isInteger(have) ? String(have) : String(have);
    let gap = " That finished short of the line.";
    if (have >= line - 1 && have < line) gap = " That finished one short.";
    else if (have < line * 0.5) gap = " That is well under the number.";
    return `${name} finished with ${shown}${unit ? ` ${unit}` : ""}. The line was ${line}.${gap}`;
  });
  const waiting = (ticket.legs || []).some((leg) => !leg.result || leg.result === "open");
  if (waiting) bits.push("The other legs had not decided it. One miss loses the parlay.");
  return bits.join(" ");
}

function generalNotes(lost) {
  const legs = lossLegs(lost);
  if (!legs.length) return "";
  const notes = [];
  const collegeRec = legs.filter((leg) => lossSport(leg) === "NCAAF" && leg.stat === "receivingYards");
  if (collegeRec.length >= 5) {
    const zeros = collegeRec.filter((leg) => Number(leg.have) === 0).length;
    const zeroBit = zeros ? ` ${zeros} of them finished at 0 yards.` : "";
    notes.push(
      `College receiving yards are the miss that shows up most: ${collegeRec.length} different lines.${zeroBit} A college receiver on a cross-sport card is the leg that has been ending the parlay. Leave that leg off, or take a smaller number only when that player is already involved in the game.`
    );
  }
  const wayShort = legs.filter((leg) => {
    const line = Number(leg.line);
    const have = Number(leg.have);
    return line && have < line * 0.5;
  });
  if (wayShort.length >= 8) {
    notes.push(
      `${wayShort.length} lines finished under half the number. A short price on a big line is still a big ask. Prefer the smaller stat, the one a player can clear by more than a yard or two.`
    );
  }
  const close = legs.filter((leg) => {
    const line = Number(leg.line);
    const have = Number(leg.have);
    return line && have >= line - 1 && have < line;
  });
  if (close.length >= 3) {
    notes.push(
      `${close.length} losses finished one short, including rebounds, assists, and a yardage line. A number with no cushion loses when the player stops one short. Prefer a line the stat can clear by more than one.`
    );
  }
  const waiting = lost.filter((ticket) => (
    (ticket.legs || []).some((leg) => leg.result === "lost")
    && (ticket.legs || []).some((leg) => !leg.result || leg.result === "open")
  )).length;
  if (lost.length && waiting / lost.length >= 0.5) {
    notes.push(
      `${waiting} of ${lost.length} lost tickets still had legs that had not been played. One miss ends the parlay. Fewer legs, or legs that start in the same window, keeps one early miss from wiping the ticket.`
    );
  }
  if (!notes.length) return "";
  return `<section class="loss-notes"><h2>How to avoid the next one</h2>${notes.map((note) => `<p>${esc(note)}</p>`).join("")}</section>`;
}

const WIN_REASONS = [
  ["nflRec", "NFL receiving yards"],
  ["hits", "Stack hits"],
  ["chalk", "Near −180"],
];
const CARD_LABELS = {
  hits: "Stack hits",
  todayBet: "Today's best bet",
  chalk: "Near −180",
  four: "Four at 85% each",
  plus: "Safest near +250",
};
const STAT_LABELS = {
  rushingYards: "rushing yards",
  receivingYards: "receiving yards",
  passingYards: "passing yards",
  assists: "assists",
  points: "points",
  rebounds: "rebounds",
  threes: "threes",
  total: "total",
};
const missLeaveOut = new Set();
const winOnly = new Set();
let missKey = "";

function missFeatures(ticket) {
  const found = new Map();
  (ticket.legs || []).forEach((leg) => {
    if (leg.result !== "lost" || !leg.stat) return;
    const sport = lossSport(leg) || "Other";
    const id = `stat:${sport}:${leg.stat}`;
    found.set(id, `${sport} ${STAT_LABELS[leg.stat] || leg.stat}`);
  });
  if (ticket.result === "lost" && CARD_LABELS[ticket.card]) {
    found.set(`card:${ticket.card}`, CARD_LABELS[ticket.card]);
  }
  return found;
}

function topOffenders(decided) {
  const counts = new Map();
  const labels = new Map();
  decided.forEach((ticket) => {
    missFeatures(ticket).forEach((label, id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
      labels.set(id, label);
    });
  });
  return [...counts.entries()]
    .map(([id, count]) => [id, labels.get(id), count])
    .sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]))
    .slice(0, 3);
}

function syncLeaveOut(reasons) {
  const key = reasons.map(([id]) => id).join("|");
  if (key === missKey) return;
  missKey = key;
  missLeaveOut.clear();
}

function missTags(ticket) {
  return new Set(missFeatures(ticket).keys());
}

function missLeftOut(ticket) {
  const tags = missTags(ticket);
  return [...missLeaveOut].some((id) => tags.has(id));
}

function winTags(ticket) {
  const tags = new Set();
  const legs = ticket.legs || [];
  if (legs.length && legs.every((leg) => lossSport(leg) === "NFL" && leg.stat === "receivingYards")) tags.add("nflRec");
  if (ticket.card === "hits") tags.add("hits");
  if (ticket.card === "chalk") tags.add("chalk");
  return tags;
}

function recordKept(ticket) {
  if (missLeftOut(ticket)) return false;
  if (!winOnly.size) return true;
  const tags = winTags(ticket);
  return [...winOnly].some((id) => tags.has(id));
}

function decidedTickets(archive) {
  return archive.filter((ticket) => ticket.result === "won" || ticket.result === "lost");
}

function paintRecordFilters(archive) {
  const decided = decidedTickets(archive);
  const reasons = topOffenders(decided);
  syncLeaveOut(reasons);
  const missCounts = Object.fromEntries(reasons.map(([id, , count]) => [id, count]));
  const winCounts = Object.fromEntries(WIN_REASONS.map(([id]) => [id, 0]));
  decided.forEach((ticket) => {
    winTags(ticket).forEach((id) => { if (winCounts[id] != null) winCounts[id] += 1; });
  });
  const missChips = reasons.map(([id, label]) => (
    `<button type="button" data-miss="${id}" class="${missLeaveOut.has(id) ? "on" : ""}">${esc(label)} ${missCounts[id]}</button>`
  )).join("");
  const winChips = WIN_REASONS.map(([id, label]) => (
    `<button type="button" data-win="${id}" class="${winOnly.has(id) ? "on" : ""}">${esc(label)} ${winCounts[id]}</button>`
  )).join("");
  const html = `<div class="row"><span class="name">Leave out</span>${missChips}<button type="button" data-miss="clear">Clear</button></div><div class="row"><span class="name">Only these</span>${winChips}<button type="button" data-win="clear">Clear</button></div>`;
  ["wins-filters", "losses-filters"].forEach((id) => {
    const box = document.getElementById(id);
    if (box) box.innerHTML = html;
  });
}

function paintWinNotes(archive) {
  const box = document.getElementById("win-notes");
  if (!box) return;
  const decided = decidedTickets(archive);
  const bits = WIN_REASONS.map(([id, label]) => {
    const rows = decided.filter((ticket) => winTags(ticket).has(id));
    const wins = rows.filter((ticket) => ticket.result === "won").length;
    const pct = rows.length ? ((wins / rows.length) * 100).toFixed(1) : "0.0";
    return `<p>${esc(label)}: ${wins} of ${rows.length} decided tickets, ${pct}%.</p>`;
  });
  box.innerHTML = `<section class="loss-notes"><h2>Why these hit</h2>${bits.join("")}</section>`;
}

function applyMissFilter() {
  const archive = ((window.state && window.state.board && window.state.board.archive) || []);
  const won = archive.filter((ticket) => ticket.result === "won");
  const lost = archive.filter((ticket) => ticket.result === "lost");
  const push = archive.filter((ticket) => ticket.result === "push");
  paintRecordFilters(archive);
  paintWinNotes(archive);
  const keptWon = won.filter(recordKept);
  const keptLost = lost.filter(recordKept);
  const decided = keptWon.length + keptLost.length;
  const pct = decided ? `${((keptWon.length / decided) * 100).toFixed(1)}%` : "";
  const left = (won.length - keptWon.length) + (lost.length - keptLost.length);
  const only = winOnly.size ? " Showing only the selected win types." : "";
  const rate = pct
    ? `Win percentage ${pct}, from ${keptWon.length} wins and ${keptLost.length} losses.${left ? ` ${left} left out.` : ""}${only}`
    : "No completed bets yet.";
  const winsScore = document.getElementById("wins-score");
  const lossesScore = document.getElementById("losses-score");
  const pushesScore = document.getElementById("pushes-score");
  const tab = document.getElementById("tab-wins");
  if (winsScore) winsScore.textContent = keptWon.length ? `${keptWon.length} wins. ${rate}` : rate;
  if (lossesScore) lossesScore.textContent = keptLost.length ? `${keptLost.length} losses. ${rate}` : rate;
  if (pushesScore) pushesScore.textContent = `${push.length} pushes. ${rate}`;
  if (tab) tab.textContent = pct ? `Wins ${pct}` : "Wins";
  [["wins-list", won], ["losses-list", lost]].forEach(([id, tickets]) => {
    const list = document.getElementById(id);
    if (!list) return;
    [...list.children].forEach((node, index) => {
      node.hidden = Boolean(tickets[index] && !recordKept(tickets[index]));
    });
  });
}

function bindMissFilters() {
  ["wins-filters", "losses-filters"].forEach((id) => {
    const box = document.getElementById(id);
    if (!box || box.dataset.bound) return;
    box.dataset.bound = "1";
    box.addEventListener("click", (event) => {
      const miss = event.target.closest("[data-miss]");
      const win = event.target.closest("[data-win]");
      const button = miss || win;
      if (!button) return;
      if (miss) {
        if (button.dataset.miss === "clear") missLeaveOut.clear();
        else if (missLeaveOut.has(button.dataset.miss)) missLeaveOut.delete(button.dataset.miss);
        else missLeaveOut.add(button.dataset.miss);
      } else if (button.dataset.win === "clear") winOnly.clear();
      else if (winOnly.has(button.dataset.win)) winOnly.delete(button.dataset.win);
      else winOnly.add(button.dataset.win);
      applyMissFilter();
    });
  });
}

function paintLessons() {
  const board = window.state && window.state.board;
  const lost = ((board && board.archive) || []).filter((ticket) => ticket.result === "lost");
  const box = document.getElementById("loss-notes");
  if (box) box.innerHTML = generalNotes(lost);
  const articles = document.querySelectorAll("#losses-list article");
  lost.forEach((ticket, index) => {
    const article = articles[index];
    if (!article) return;
    let note = article.querySelector(".why");
    if (!note) {
      note = document.createElement("p");
      note.className = "why";
      article.appendChild(note);
    }
    note.textContent = whyTicket(ticket);
  });
  applyMissFilter();
}

const priorPaint = window.paintChoices;
window.paintChoices = function paintAfter() {
  if (priorPaint) priorPaint();
  paintLessons();
};

bindMissFilters();
