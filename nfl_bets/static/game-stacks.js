/** Parlay strategies that fit one game, shown on that game's search card. */

function gameStackData() {
  const job = window.gameStackJob;
  if (job && Date.now() - job.at < 600000) return job.promise;
  const promise = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "stack" }) })
    .then((res) => res.json())
    .catch(() => ({}));
  window.gameStackJob = { at: Date.now(), promise };
  return promise;
}

function gameStackBlock(row, count, note) {
  const block = document.createElement("section");
  block.className = "rec-strategy";
  block.dataset.name = row.name;
  block.dataset.rank = String(row.rank[0]);
  block.innerHTML = `<h3><span class="rec-no">${row.rank[0]}</span> ST-${String(row.no).padStart(2, "0")} ${esc(row.name)} <span class="rec-count">${esc(count)}</span></h3><p class="rec-history" style="white-space: normal; flex: 1 1 100%; min-width: 0"><span>${esc(row.text)}</span><i class="rec-pay" style="white-space: normal">${esc(row.rank[1])}</i></p>`;
  if (window.stackMore) stackMore(block.querySelector(".rec-history"), row.name);
  if (window.stackGrade) stackGrade(block, row.name);
  row.bets.forEach(([kind, rung, job]) => {
    const bet = document.createElement("div");
    bet.className = "rec-bet";
    bet.innerHTML = `<b><i class="px">${esc(kind)}</i> <i class="pct">${esc(rung)}</i></b><p class="rec-gist"><i class="prop">${esc(job)}</i></p>`;
    block.append(bet);
  });
  row.stacks.forEach((stack) => {
    const set = document.createElement("div");
    set.className = "stack-set";
    set.dataset.labels = (stack.bets || []).map((bet) => String(bet.label || "").replace(/\|/g, " ")).join("|");
    const title = document.createElement("p");
    title.className = "stack-set-name";
    title.textContent = stackName(stack);
    set.append(title);
    stackRead(set, stack);
    stackLegs(stack).forEach((bet) => set.append(stackLeg(bet)));
    block.append(set);
    if (window.stackLabel) stackLabel(set);
  });
  if (!row.stacks.length) stackNote(block, note || "None of the current FanDuel prices fit this shape.");
  return block;
}

function paintGameStacks(holder, game, who = "") {
  const match = holder.classList.contains("find-stack-host") ? holder : [...holder.querySelectorAll(".find-match")].pop();
  if (!match || typeof STACKS === "undefined") return;
  const box = document.createElement("details");
  box.className = "find-score find-stacks";
  box.style.gridColumn = "1 / -1";
  const card = !holder.classList.contains("find-stack-host");
  if (card) box.classList.add("find-team-bets");
  box.innerHTML = `<summary>${card ? `<b class="find-script-head">Strategies</b>` : `<b>Parlay strategies ${who ? `with ${esc(who)}` : "for this game"}</b>`}</summary><p class="quiet">Looking for stacks.</p>`;
  const crowd = card && match.querySelector(":scope > .find-odds.find-team-bets, :scope > .find-everyone");
  if (crowd) crowd.before(box); else match.append(box);
  if (game.match && !holder.classList.contains("find-stack-host")) { box.dataset.match = game.match; if (window.saveStacksOpen && typeof saveStacksSync === "function") saveStacksSync(); }
  box.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea, .stack-grade, .stack-close")) return;
    const head = event.target.closest(".rec-strategy > h3, .rec-strategy > .rec-history");
    if (head) head.parentElement.classList.toggle("open");
  });
  gameStackData().then((data) => {
    if (!box.isConnected) return;
    const found = (data && data.found) || {}, near = (data && data.near) || {}, notes = (data && data.notes) || {};
    const fits = (stack) => (!game.match || stack.game === game.match || (stack.bets || []).some((bet) => bet.game === game.match)) && (!who || (stack.bets || []).some((bet) => String(bet.label || "").toLowerCase().includes(who.toLowerCase())));
    const rows = STACKS.map((row, index) => ({ name: row[0], text: row[1], bets: row[2] || [], no: index + 1, rank: (typeof STACK_RANK !== "undefined" && STACK_RANK[row[0]]) || [99, ""], stacks: (found[row[0]] || []).filter(fits), close: (near[row[0]] || []).filter(fits) }))
      .sort((a, b) => a.rank[0] - b.rank[0]);
    const where = who ? `with ${who}` : game.match ? "for this game" : "on FanDuel now";
    const count = (row) => (row.stacks.length ? `${row.stacks.length} ${where}` : row.close.length ? `${row.close.length} close` : "");
    const live = rows.filter((row) => row.stacks.length || row.close.length);
    const hits = rows.filter((row) => row.stacks.length).length;
    const wait = box.querySelector(".quiet");
    if (!hits) wait.textContent = data && data.error && window.state && state.admin ? data.error : who ? `None of the current FanDuel prices fit a stack with ${who}.` : game.match ? "None of the current FanDuel prices fit a stack in this game." : "None of the current FanDuel prices fit a stack.";
    else { wait.remove(); if (!card) box.querySelector("summary b").append(`, ${hits}`); }
    const board = document.createElement("div");
    board.className = "find-stack-list";
    live.forEach((row) => board.append(gameStackBlock(row, count(row), notes[row.name])));
    box.append(board);
    if (window.closeCalls) closeCalls(board, Object.fromEntries(live.map((row) => [row.name, row.close])));
    const rest = rows.filter((row) => !live.includes(row));
    if (!rest.length) return;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "find-stack-all";
    const label = `Show all ${rows.length} strategies`;
    more.textContent = label;
    more.addEventListener("click", () => {
      const extra = board.querySelectorAll(":scope > .rec-strategy.find-stack-extra");
      if (extra.length) { extra.forEach((node) => node.remove()); more.textContent = label; return; }
      rest.forEach((row) => { const block = gameStackBlock(row, "", notes[row.name]); block.classList.add("find-stack-extra"); board.append(block); });
      board.append(...[...board.querySelectorAll(":scope > .rec-strategy")].sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank)));
      more.textContent = "Show fewer strategies";
    });
    box.append(more);
  });
}

window.paintGameStacks = paintGameStacks;
