/** Recommended 4-leg Anchors and juice on each game page. Best first; regenerate cycles the rest. */

function gameFourSig(stack) {
  return (stack.bets || []).map((bet) => `${bet.label}|${bet.odds}`).sort().join("~");
}

function gameFourTeam(bet) {
  return /^(The over|The under|The spread|The win)$/i.test(String(bet && bet.rung || ""));
}

function gameFourFits(stack) {
  const bets = stack && stack.bets || [];
  if (bets.length !== 4) return false;
  const team = bets.filter(gameFourTeam);
  return team.length === 1 && bets.length - team.length === 3;
}

function gameFourOdds(stack) {
  const legs = stack.bets || [];
  if (legs.length < 2 || typeof findRank !== "function") return "";
  const dec = legs.reduce((sum, leg) => sum * (1 + findRank(leg.odds)), 1);
  if (!(dec > 1)) return "";
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  return price > 0 ? `+${price}` : String(price);
}

function gameFourRole(bet, juiceKey) {
  const key = `${bet.label}|${bet.odds}`;
  if (juiceKey && key === juiceKey) return "Juice";
  if (/anytime|touchdown|goal/i.test(`${bet.rung || ""} ${bet.label || ""}`)) return "Juice";
  if (/^(The over|The under|The spread|The win)$/i.test(String(bet.rung || ""))) return "Anchor";
  return "Anchor";
}

function gameFourJuiceKey(stack) {
  const legs = stack.bets || [];
  const scored = legs.filter((bet) => /anytime|touchdown|goal/i.test(`${bet.rung || ""} ${bet.label || ""}`));
  const pool = scored.length ? scored : legs.filter((bet) => !/^(The over|The under|The spread|The win)$/i.test(String(bet.rung || "")));
  if (!pool.length) return "";
  let best = pool[0];
  pool.forEach((bet) => {
    const odds = Number(bet.odds), cur = Number(best.odds);
    if ((odds > 0 ? odds : 10000 / Math.abs(odds || 1)) > (cur > 0 ? cur : 10000 / Math.abs(cur || 1))) best = bet;
  });
  return `${best.label}|${best.odds}`;
}

function gameFourFill(box, stacks, at) {
  const stack = stacks[at];
  if (!stack) return;
  const price = gameFourOdds(stack);
  const juiceKey = gameFourJuiceKey(stack);
  const body = box.querySelector(".find-four-body") || document.createElement("div");
  body.className = "find-four-body";
  const legs = (typeof stackLegs === "function" ? stackLegs(stack) : stack.bets || []).map((bet) => {
    const row = document.createElement("div");
    row.className = "find-four-leg";
    const odds = Number(bet.odds);
    const shown = odds > 0 ? `+${odds}` : String(odds);
    row.innerHTML = `<i>${esc(gameFourRole(bet, juiceKey))}</i><b>${esc(bet.label || "")}</b><span>${esc(shown)}</span>`;
    return row;
  });
  body.replaceChildren(
    Object.assign(document.createElement("p"), { className: "find-four-price", textContent: price ? `4-leg · ${price}` : "4-leg parlay" }),
    Object.assign(document.createElement("p"), { className: "find-four-why", textContent: "Three short legs hold it. The juice pays." }),
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

function gameFourMount(match, betsNode, stacksNode) {
  const box = document.createElement("div");
  box.className = "find-four find-team-bets";
  box.style.gridColumn = "1 / -1";
  box.innerHTML = `<p class="find-script-head">Recommended 4-leg parlay <i class="find-four-tag">Recommended</i></p><p class="find-four-shape">Anchors and juice · 3 players + 1 game bet</p>`;
  if (betsNode) betsNode.before(box);
  else if (stacksNode) stacksNode.before(box);
  else match.append(box);
  return box;
}

function paintGameFour(holder, game) {
  if (!game || !game.match || !/^(NFL|NBA|WNBA|NHL|MLB)$/i.test(String(game.sport || ""))) return;
  const match = holder.classList.contains("find-match") ? holder : [...holder.querySelectorAll(".find-match")].pop();
  if (!match || typeof gameStackData !== "function") return;
  match.querySelectorAll(":scope > .find-four").forEach((node) => node.remove());
  const stacksNode = match.querySelector(":scope > .find-stacks");
  const betsNode = match.querySelector(":scope > .find-bets");
  gameStackData().then((data) => {
    if (!match.isConnected) return;
    const fits = (row) => row.game === game.match || (row.bets || []).some((bet) => bet.game === game.match);
    const found = (((data && data.found) || {})["Anchors and juice"] || []).filter(fits);
    const near = (((data && data.near) || {})["Anchors and juice"] || []).filter(fits);
    const seen = new Set();
    const list = [...found, ...near].filter((row) => {
      const sig = gameFourSig(row);
      if (!sig || seen.has(sig) || !gameFourFits(row)) return false;
      seen.add(sig);
      return true;
    });
    match.querySelectorAll(":scope > .find-four").forEach((node) => node.remove());
    if (!list.length) {
      const empty = gameFourMount(match, match.querySelector(":scope > .find-bets"), match.querySelector(":scope > .find-stacks"));
      empty.append(Object.assign(document.createElement("p"), { className: "quiet", textContent: "No Anchors and juice ticket fits this game right now." }));
      return;
    }
    const box = gameFourMount(match, match.querySelector(":scope > .find-bets"), match.querySelector(":scope > .find-stacks"));
    gameFourFill(box, list, 0);
  }).catch(() => {
    if (!match.isConnected) return;
    match.querySelectorAll(":scope > .find-four").forEach((node) => node.remove());
    const box = gameFourMount(match, match.querySelector(":scope > .find-bets"), match.querySelector(":scope > .find-stacks"));
    box.append(Object.assign(document.createElement("p"), { className: "quiet", textContent: "Could not load Anchors and juice." }));
  });
}

window.paintGameFour = paintGameFour;
