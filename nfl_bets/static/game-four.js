/** Recommended 4-leg Anchors and juice on each NFL game page. Best first; regenerate cycles the rest. */

function gameFourSig(stack) {
  return (stack.bets || []).map((bet) => `${bet.label}|${bet.odds}`).sort().join("~");
}

function gameFourOdds(stack) {
  const legs = stack.bets || [];
  if (legs.length < 2 || typeof findRank !== "function") return "";
  const dec = legs.reduce((sum, leg) => sum * (1 + findRank(leg.odds)), 1);
  if (!(dec > 1)) return "";
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  return price > 0 ? `+${price}` : String(price);
}

function gameFourRole(bet) {
  return /touchdown/i.test(`${bet.rung || ""} ${bet.label || ""}`) ? "Juice" : "Anchor";
}

function gameFourFill(box, stacks, at) {
  const stack = stacks[at];
  if (!stack) return;
  const price = gameFourOdds(stack);
  const body = box.querySelector(".find-four-body") || document.createElement("div");
  body.className = "find-four-body";
  const legs = (typeof stackLegs === "function" ? stackLegs(stack) : stack.bets || []).map((bet) => {
    const row = document.createElement("div");
    row.className = "find-four-leg";
    const odds = Number(bet.odds);
    const shown = odds > 0 ? `+${odds}` : String(odds);
    row.innerHTML = `<i>${esc(gameFourRole(bet))}</i><b>${esc(bet.label || "")}</b><span>${esc(shown)}</span>`;
    return row;
  });
  body.replaceChildren(
    Object.assign(document.createElement("p"), { className: "find-four-price", textContent: price ? `4-leg · ${price}` : "4-leg parlay" }),
    Object.assign(document.createElement("p"), { className: "find-four-why", textContent: "Three short player lines hold it. The touchdown pays." }),
    ...legs,
  );
  if (!body.isConnected) box.append(body);
  const acts = box.querySelector(".find-four-acts") || document.createElement("p");
  acts.className = "find-four-acts";
  const again = Object.assign(document.createElement("button"), { type: "button", className: "find-four-again", textContent: stacks.length > 1 ? `Regenerate (${at + 1} of ${stacks.length})` : "Regenerate" });
  again.disabled = stacks.length < 2;
  again.title = stacks.length < 2 ? "Only one Anchors and juice ticket fits this game right now" : "Show another 4-leg from this template";
  again.addEventListener("click", () => gameFourFill(box, stacks, (at + 1) % stacks.length));
  const build = Object.assign(document.createElement("button"), { type: "button", className: "find-four-build", textContent: "Add to My Bets" });
  build.addEventListener("click", () => {
    if (typeof stackBuild === "function") stackBuild(stack, 0, "Anchors and juice");
    else if (typeof betFromSay === "function") betFromSay("Anchors and juice", true);
  });
  acts.replaceChildren(again, build);
  if (!acts.isConnected) box.append(acts);
  box.dataset.sig = gameFourSig(stack);
  box.dataset.at = String(at);
}

function paintGameFour(holder, game) {
  if (!game || !game.match || String(game.sport || "").toUpperCase() !== "NFL") return;
  const match = holder.classList.contains("find-match") ? holder : [...holder.querySelectorAll(".find-match")].pop();
  if (!match) return;
  match.querySelectorAll(":scope > .find-four").forEach((node) => node.remove());
  const box = document.createElement("div");
  box.className = "find-four find-team-bets";
  box.style.gridColumn = "1 / -1";
  box.innerHTML = `<p class="find-script-head">Recommended 4-leg parlay <i class="find-four-tag">Recommended</i></p><p class="find-four-shape">Anchors and juice · 3 anchors + 1 juice</p><p class="quiet">Looking for the best ticket.</p>`;
  const stacks = match.querySelector(":scope > .find-stacks");
  const bets = match.querySelector(":scope > .find-bets");
  if (bets) bets.before(box);
  else if (stacks) stacks.before(box);
  else match.append(box);
  if (typeof gameStackData !== "function") {
    box.querySelector(".quiet").textContent = "Could not load Anchors and juice.";
    return;
  }
  gameStackData().then((data) => {
    if (!box.isConnected) return;
    const wait = box.querySelector(".quiet");
    const fits = (row) => row.game === game.match || (row.bets || []).some((bet) => bet.game === game.match);
    const found = (((data && data.found) || {})["Anchors and juice"] || []).filter(fits);
    const near = (((data && data.near) || {})["Anchors and juice"] || []).filter(fits);
    const seen = new Set();
    const stacks = [...found, ...near].filter((row) => {
      const sig = gameFourSig(row);
      if (!sig || seen.has(sig) || (row.bets || []).length < 4) return false;
      seen.add(sig);
      return true;
    });
    if (!stacks.length) { box.remove(); return; }
    if (wait) wait.remove();
    gameFourFill(box, stacks, 0);
  }).catch(() => {
    if (!box.isConnected) return;
    const wait = box.querySelector(".quiet");
    if (wait) wait.textContent = "Could not load Anchors and juice.";
  });
}

window.paintGameFour = paintGameFour;
