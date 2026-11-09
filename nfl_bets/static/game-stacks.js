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

function paintGameStacks(holder, game, who = "") {
  const match = [...holder.querySelectorAll(".find-match")].pop();
  if (!match || typeof STACKS === "undefined") return;
  const box = document.createElement("div");
  box.className = "find-score find-stacks";
  box.style.gridColumn = "1 / -1";
  box.innerHTML = `<b>Parlay strategies ${who ? `with ${esc(who)}` : "for this game"}</b><p class="quiet">Looking for stacks.</p>`;
  match.append(box);
  box.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    const head = event.target.closest(".rec-strategy > h3");
    if (head) head.parentElement.classList.toggle("open");
  });
  gameStackData().then((data) => {
    if (!box.isConnected) return;
    const found = (data && data.found) || {};
    const fits = (stack) => (stack.game === game.match || (stack.bets || []).some((bet) => bet.game === game.match)) && (!who || (stack.bets || []).some((bet) => String(bet.label || "").toLowerCase().includes(who.toLowerCase())));
    const rows = STACKS.map((row, index) => ({ name: row[0], text: row[1], no: index + 1, rank: (typeof STACK_RANK !== "undefined" && STACK_RANK[row[0]]) || [99, ""], stacks: (found[row[0]] || []).filter(fits) }))
      .filter((row) => row.stacks.length)
      .sort((a, b) => a.rank[0] - b.rank[0]);
    const wait = box.querySelector(".quiet");
    if (!rows.length) { wait.textContent = who ? `None of the current FanDuel prices fit a stack with ${who}.` : "None of the current FanDuel prices fit a stack in this game."; return; }
    wait.remove();
    const board = document.createElement("div");
    board.className = "find-stack-list";
    rows.forEach((row) => {
      const block = document.createElement("section");
      block.className = "rec-strategy";
      block.dataset.name = row.name;
      block.innerHTML = `<h3><span class="rec-no">${row.rank[0]}</span> ST-${String(row.no).padStart(2, "0")} ${esc(row.name)} <span class="rec-count">${row.stacks.length} ${who ? `with ${esc(who)}` : "for this game"}</span></h3><p class="rec-history" style="white-space: normal; flex: 1 1 100%; min-width: 0"><span>${esc(row.text)}</span><i class="rec-pay" style="white-space: normal">${esc(row.rank[1])}</i></p>`;
      if (window.stackMore) stackMore(block.querySelector(".rec-history"), row.name);
      row.stacks.forEach((stack) => {
        const set = document.createElement("div");
        set.className = "stack-set";
        const title = document.createElement("p");
        title.className = "stack-set-name";
        title.textContent = stackName(stack);
        set.append(title);
        stackRead(set, stack);
        stackLegs(stack).forEach((bet) => set.append(stackLeg(bet)));
        block.append(set);
      });
      board.append(block);
    });
    box.append(board);
  });
}

window.paintGameStacks = paintGameStacks;
