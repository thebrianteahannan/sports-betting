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
}

const priorPaint = window.paintChoices;
window.paintChoices = function paintAfter() {
  if (priorPaint) priorPaint();
  paintLessons();
};
