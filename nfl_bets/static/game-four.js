/** Recommended / generated 4-leg Anchors and juice on each game page. Best first; regenerate cycles the rest. */

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
  if (juiceKey && key === juiceKey) return "Pays";
  if (/anytime|touchdown|goal/i.test(`${bet.rung || ""} ${bet.label || ""}`)) return "Pays";
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

function gameFourFold(text) {
  const raw = String(text || "").replace(/, out$/i, "");
  return typeof plainName === "function" ? plainName(raw) : raw.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

function gameFourSelected(match) {
  const on = match.querySelector(":scope > .find-side-go.on");
  if (!on) return null;
  const team = on.textContent.replace(/, \d+ bets?.*$/i, "").trim();
  const nick = typeof whereNick === "function" ? whereNick(on.textContent) : team.split(/\s+/).pop();
  const sides = [...match.querySelectorAll(":scope > .find-side-go")];
  const at = sides.indexOf(on);
  const names = new Set();
  const take = (root) => {
    if (!root) return;
    root.querySelectorAll(".find-roster .find-names button, .find-roster .find-names span").forEach((node) => {
      const name = gameFourFold(node.textContent);
      if (name) names.add(name);
    });
  };
  take([...match.querySelectorAll(":scope > .find-body > .find-side")][at]);
  const everyone = match.querySelector(":scope > .find-everyone .find-sides");
  if (everyone) take([...everyone.querySelectorAll(":scope > .find-roster")][at]);
  return { team, nick, names };
}

function gameFourForTeam(stack, side) {
  if (!side) return true;
  const club = String(stack.club || "");
  if (club) {
    const team = side.team.toLowerCase();
    const nick = String(side.nick || side.team.split(/\s+/).pop() || "").toLowerCase();
    const mine = club.toLowerCase();
    return mine === team || Boolean(nick && (mine.endsWith(` ${nick}`) || mine.endsWith(nick)));
  }
  const team = side.team.toLowerCase();
  const nick = String(side.nick || side.team.split(/\s+/).pop() || "").toLowerCase();
  const players = (stack.bets || []).filter((bet) => !gameFourTeam(bet));
  if (!players.length) return false;
  if (side.names && side.names.size) {
    const hit = (label) => {
      const fold = gameFourFold(label);
      const raw = String(label || "").toLowerCase();
      return [...side.names].some((name) => fold.startsWith(name) || raw.startsWith(name));
    };
    if (!players.every((bet) => hit(bet.label))) return false;
  }
  const teamBet = (stack.bets || []).find(gameFourTeam);
  if (teamBet && /^(The spread|The win)$/i.test(String(teamBet.rung || ""))) {
    const label = String(teamBet.label || "").toLowerCase();
    if (!(label.includes(team) || (nick && label.includes(nick)))) return false;
  }
  return true;
}

function gameFourHead(box, recommended, recCount) {
  const head = box.querySelector(".find-script-head");
  if (!head) return;
  const n = Number(recCount) > 0 ? Number(recCount) : 0;
  head.innerHTML = recommended
    ? `Parlay's 4-Legged Friend <i class="find-four-tag">Recommended</i>${n ? `<i class="find-script-count">${n}</i>` : ""}`
    : `Generated 4-leg parlay <i class="find-four-tag find-four-tag-gen">Generated</i>`;
}

function gameFourStakeOf(box) {
  const n = Number(box && box.dataset.stake);
  if (n > 0) return n;
  return typeof parlayStakeOf === "function" ? parlayStakeOf() : 5;
}

function gameFourCashLine(box, price) {
  const american = Number(String(price || "").replace("+", ""));
  const stake = gameFourStakeOf(box);
  const shown = Number.isInteger(stake) ? String(stake) : stake.toFixed(2);
  const pct = typeof findPct === "function" ? findPct(american) : "";
  const cash = typeof findCash === "function" ? findCash(american, stake) : "";
  const bits = [
    price && `<i class="px">${esc(price)}</i>`,
    pct && `<i class="pct">${esc(pct)}</i>`,
    cash && `<i class="pay"><button type="button" class="stake" aria-label="Change the bet size">$${esc(shown)}</button> profits ${esc(cash)}</i>`,
  ].filter(Boolean);
  return bits.length ? `4-leg · ${bits.join("")}` : "4-leg parlay";
}

function gameFourEditStake(button, box, stacks, at, recCount) {
  const pay = button.closest("i.pay");
  if (!pay) return;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "stake";
  input.min = "1";
  input.max = "100000";
  input.step = "1";
  input.setAttribute("aria-label", "Bet size");
  input.value = button.textContent.replace(/[^0-9.]/g, "") || "5";
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    if (!input.isConnected) return;
    const amount = Number(input.value);
    box.dataset.stake = String(Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5);
    gameFourFill(box, stacks, at, recCount);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { input.value = button.textContent; input.blur(); }
  });
  input.addEventListener("blur", finish);
}

function gameFourFill(box, stacks, at, recCount) {
  const stack = stacks[at];
  if (!stack) return;
  const recommended = at < recCount;
  gameFourHead(box, recommended, recCount);
  const price = gameFourOdds(stack);
  const juiceKey = gameFourJuiceKey(stack);
  const body = box.querySelector(".find-four-body") || document.createElement("div");
  body.className = "find-four-body";
  const legs = (typeof stackLegs === "function" ? stackLegs(stack) : stack.bets || []).map((bet) => {
    const row = document.createElement("div");
    row.className = "find-four-leg";
    const odds = Number(bet.odds);
    const shown = odds > 0 ? `+${odds}` : String(odds);
    const pct = typeof findPct === "function" ? findPct(odds) : "";
    row.innerHTML = `<i>${esc(gameFourRole(bet, juiceKey))}</i><b>${esc(bet.label || "")}</b><span><i class="px">${esc(shown)}</i>${pct ? `<i class="pct">${esc(pct)}</i>` : ""}</span>`;
    return row;
  });
  const top = document.createElement("p");
  top.className = "find-four-price";
  top.innerHTML = gameFourCashLine(box, price);
  const stakeBtn = top.querySelector("button.stake");
  if (stakeBtn) stakeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    gameFourEditStake(stakeBtn, box, stacks, at, recCount);
  });
  body.replaceChildren(
    top,
    Object.assign(document.createElement("p"), { className: "find-four-why", textContent: "Three short legs hold it. The juice pays." }),
    ...legs,
  );
  if (!body.isConnected) box.append(body);
  const acts = box.querySelector(".find-four-acts") || document.createElement("p");
  acts.className = "find-four-acts";
  const again = Object.assign(document.createElement("button"), { type: "button", className: "find-four-again", textContent: stacks.length > 1 ? `Regenerate (${at + 1} of ${stacks.length})` : "Regenerate" });
  again.disabled = stacks.length < 2;
  again.title = stacks.length < 2 ? "Only one Anchors and juice ticket fits this game right now" : "Show another 4-leg from this template";
  again.addEventListener("click", () => gameFourFill(box, stacks, (at + 1) % stacks.length, recCount));
  const build = Object.assign(document.createElement("button"), { type: "button", className: "find-four-build", textContent: "Add to My Bets" });
  build.addEventListener("click", () => {
    if (typeof stackBuild === "function") stackBuild(stack, 0, "Anchors and juice");
    else if (typeof betFromSay === "function") betFromSay("Anchors and juice", true);
  });
  acts.replaceChildren(again, build);
  if (!acts.isConnected) box.append(acts);
  box.dataset.sig = gameFourSig(stack);
  box.dataset.at = String(at);
  box.dataset.grade = recommended ? "recommended" : "generated";
}

function gameFourNodes(match) {
  return match ? match.querySelectorAll(":scope > .find-four, :scope > .find-bets > .find-four") : [];
}

function gameFourPlace(bets, box) {
  if (!bets || !box) return;
  box.style.gridColumn = "";
  box.open = true;
  const sum = bets.querySelector(":scope > summary");
  if (sum) sum.after(box);
  else bets.prepend(box);
}

function gameFourMount(match, betsNode, stacksNode, recommended = true, recCount = 0) {
  const box = document.createElement("details");
  box.className = "find-four find-team-bets";
  box.open = false;
  box.style.gridColumn = "1 / -1";
  const n = Number(recCount) > 0 ? Number(recCount) : 0;
  box.innerHTML = recommended
    ? `<summary><b class="find-script-head">Parlay's 4-Legged Friend <i class="find-four-tag">Recommended</i>${n ? `<i class="find-script-count">${n}</i>` : ""}</b></summary><p class="find-four-shape">Anchors and juice · 3 players + 1 game bet</p>`
    : `<summary><b class="find-script-head">Generated 4-leg parlay <i class="find-four-tag find-four-tag-gen">Generated</i></b></summary><p class="find-four-shape">Anchors and juice · 3 players + 1 game bet</p>`;
  const bets = betsNode || (match && match.querySelector(":scope > .find-bets"));
  if (bets) gameFourPlace(bets, box);
  else if (stacksNode) stacksNode.before(box);
  else if (match) match.append(box);
  return box;
}

function gameFourAdopt(match, bets) {
  if (!match || !bets) return;
  const four = [...gameFourNodes(match)].find((node) => node.parentElement !== bets) || bets.querySelector(":scope > .find-four");
  if (four) gameFourPlace(bets, four);
}

function gameFourShow(match, game, found, near) {
  if (!match || !match.isConnected) return;
  const side = gameFourSelected(match);
  const uniq = (rows, teamOnly) => {
    const seen = new Set();
    return rows.filter((row) => {
      const sig = gameFourSig(row);
      if (!sig || seen.has(sig) || !gameFourFits(row)) return false;
      if (teamOnly && !gameFourForTeam(row, side)) return false;
      seen.add(sig);
      return true;
    });
  };
  const take = (teamOnly) => {
    const hard = uniq(found, teamOnly).filter((row) => !row.closest);
    const soft = [...uniq(found, teamOnly).filter((row) => row.closest), ...uniq(near, teamOnly)]
      .filter((row) => !hard.some((hit) => gameFourSig(hit) === gameFourSig(row)));
    return { hard, soft };
  };
  let { hard: rec, soft: gen } = take(true);
  // Team filter can wipe the slate — fall back to the closest whole-game ticket.
  if (!(rec.length || gen.length) && side) ({ hard: rec, soft: gen } = take(false));
  const list = [...rec, ...gen];
  gameFourNodes(match).forEach((node) => node.remove());
  const betsNode = match.querySelector(":scope > .find-bets");
  const stacksNode = match.querySelector(":scope > .find-stacks");
  if (!list.length) {
    const empty = gameFourMount(match, betsNode, stacksNode, false);
    empty.append(Object.assign(document.createElement("p"), { className: "quiet", textContent: "Looking for the closest Anchors and juice ticket…" }));
    if (!match._gameFourRetry) {
      match._gameFourRetry = 1;
      if (typeof gameStackData === "function") {
        gameStackData(true).then((data) => {
          if (!match.isConnected) return;
          const fits = (row) => row.game === game.match || (row.bets || []).some((bet) => bet.game === game.match);
          const againFound = (((data && data.found) || {})["Anchors and juice"] || []).filter(fits);
          const againNear = (((data && data.near) || {})["Anchors and juice"] || []).filter(fits);
          match._gameFour = { game, found: againFound, near: againNear };
          gameFourShow(match, game, againFound, againNear);
        }).catch(() => {});
      }
    } else {
      empty.querySelector(".quiet").textContent = "Still waiting on a close Anchors and juice ticket for this game.";
    }
    return;
  }
  const box = gameFourMount(match, betsNode, stacksNode, rec.length > 0, rec.length);
  gameFourFill(box, list, 0, rec.length);
}

function paintGameFour(holder, game) {
  if (!game || !game.match || !/^(NFL|NBA|WNBA|NHL|MLB)$/i.test(String(game.sport || ""))) return;
  const match = holder.classList.contains("find-match") ? holder : [...holder.querySelectorAll(".find-match")].pop();
  if (!match || typeof gameStackData !== "function") return;
  gameFourNodes(match).forEach((node) => node.remove());
  match._gameFourRetry = 0;
  gameStackData().then((data) => {
    if (!match.isConnected) return;
    const fits = (row) => row.game === game.match || (row.bets || []).some((bet) => bet.game === game.match);
    const found = (((data && data.found) || {})["Anchors and juice"] || []).filter(fits);
    const near = (((data && data.near) || {})["Anchors and juice"] || []).filter(fits);
    match._gameFour = { game, found, near };
    gameFourShow(match, game, found, near);
    if (!match.dataset.fourBound) {
      match.dataset.fourBound = "1";
      match.addEventListener("click", (event) => {
        if (!event.target.closest(".find-side-go") || event.target.closest(".find-side-go").parentElement !== match) return;
        const job = match._gameFour;
        if (!job) return;
        setTimeout(() => gameFourShow(match, job.game, job.found, job.near), 0);
        setTimeout(() => gameFourShow(match, job.game, job.found, job.near), 400);
      });
    }
  }).catch(() => {
    if (!match.isConnected) return;
    gameFourNodes(match).forEach((node) => node.remove());
    const box = gameFourMount(match, match.querySelector(":scope > .find-bets"), match.querySelector(":scope > .find-stacks"), false);
    box.append(Object.assign(document.createElement("p"), { className: "quiet", textContent: "Could not load Anchors and juice." }));
  });
}

window.paintGameFour = paintGameFour;
window.gameFourPlace = gameFourPlace;
window.gameFourAdopt = gameFourAdopt;
