/** One-pick strategies, laid out like the parlay list. */

function paintOnes() {
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; if (window.birdGreet) birdGreet(); return; }
  if (window.tvPush) tvPush();
  desk.classList.remove("bird-on", "solo", "dug");
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  document.querySelectorAll(".rec-board").forEach((node) => node.remove());
  const board = document.createElement("div");
  board.className = "rec-board ones-board";
  board.dataset.page = "ones";
  board.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>Looking through the counts.</p></div>`;
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  row.append(board);
  row.scrollTop = 0;
  fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list: "ones" }),
  }).then((res) => res.json()).then((data) => fillOnes(board, data)).catch(() => fillOnes(board, {}));
}

function fillOnes(board, data) {
  const load = board.querySelector(".bet-load");
  if (load) load.remove();
  const title = document.createElement("h2");
  title.textContent = "One pick bets, by strategy.";
  board.append(title);
  window.recTickets = [];
  const strategies = Array.isArray(data.strategies) ? data.strategies : [];
  const filled = [];
  const empty = [];
  strategies.forEach((row) => {
    const block = document.createElement("section");
    block.className = "rec-strategy";
    block.dataset.card = row.id || "";
    const bets = Array.isArray(row.bets) ? row.bets : [];
    const heading = document.createElement("h3");
    heading.innerHTML = `${esc(row.name || "")} <span class="rec-count">${bets.length}</span>`;
    block.append(heading);
    const history = document.createElement("p");
    history.className = "rec-history";
    history.innerHTML = `<span>${bets.length} live, 0 in history</span><i class="rec-pay">${esc(row.gist || "")}</i>`;
    block.append(history);
    bets.forEach((ticket) => {
      const price = Number(ticket.american);
      const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
      const pct = ticket.impliedPct != null && ticket.impliedPct !== "" ? `${ticket.impliedPct}%` : "";
      const won = Number.isFinite(price) && price ? Math.round((price < 0 ? 500 / -price : price / 20) * 100) / 100 : NaN;
      const cash = Number.isFinite(won) ? `$${Math.abs(won - Math.round(won)) < 0.005 ? Math.round(won) : won.toFixed(2)}` : "";
      const bet = document.createElement("div");
      bet.className = "rec-bet";
      bet.dataset.rec = String((window.recTickets = window.recTickets || []).push({ ticket, name: row.name || "" }) - 1);
      const head = document.createElement("b");
      head.textContent = [shown, pct, cash ? `$5 profits ${cash}` : ""].filter(Boolean).join(" · ");
      const gist = document.createElement("p");
      gist.className = "rec-gist";
      gist.innerHTML = ticket.why ? `<em>${esc(ticket.why)}</em>` : "";
      bet.append(head);
      if (gist.innerHTML) bet.append(gist);
      bet.insertAdjacentHTML("beforeend", `${(ticket.legs || []).map((leg) => recLine(leg)).join("")}`);
      const copy = document.createElement("p");
      copy.className = "rec-copy";
      copy.innerHTML = window.recWin ? recWin(price) : "";
      if (copy.textContent) bet.append(copy);
      block.append(bet);
    });
    if (!bets.length) {
      const note = document.createElement("p");
      note.textContent = "None you can place right now.";
      block.append(note);
      empty.push(block);
    } else filled.push(block);
  });
  filled.forEach((block) => board.append(block));
  empty.forEach((block) => board.append(block));
  if (!board.querySelector(".rec-strategy")) {
    const note = document.createElement("p");
    note.textContent = "None you can place right now.";
    board.append(note);
  }
  board.addEventListener("click", (event) => {
    if (event.target.closest(".rec-bet")) return;
    const strategy = event.target.closest(".rec-strategy");
    if (strategy) strategy.classList.toggle("open");
  });
}

window.paintOnes = paintOnes;
