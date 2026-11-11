/** The line under a game's two team buttons: whole game, or one team. */

function gameGuidePaint(match, guide) {
  const nick = (button) => (typeof whereNick === "function" ? whereNick(button.textContent) : button.textContent.split(",")[0].trim());
  const on = match.querySelector(":scope > .find-side-go.on");
  const everyone = match.querySelector(":scope > .find-everyone");
  if (everyone) everyone.hidden = !!on;
  if (!on) { guide.textContent = "Everything below is for the whole game. Tap a team to see just that team's bets for this game."; return; }
  const back = document.createElement("button");
  back.type = "button"; back.className = "find-guide-back"; back.textContent = "Back to the whole game";
  back.addEventListener("click", () => on.click());
  guide.replaceChildren(`These are the ${nick(on)} bets for this game. `, back);
  on.setAttribute("aria-label", `${on.textContent}. Close and show the whole game`);
}

function gameEveryone(match, sides, people, list, hits) {
  if (typeof fillRoster !== "function" || !people || !list) return null;
  const teams = sides.map((side) => people.find((item) => item.kind !== "player" && item.name === side.textContent.replace(/, \d+ bets?$/, ""))).filter(Boolean);
  if (teams.length < 2) return null;
  const box = document.createElement("details");
  box.className = "find-everyone find-team-bets"; box.open = true;
  const head = document.createElement("summary");
  head.innerHTML = `<b class="find-script-head">Player bets</b>`;
  const pair = document.createElement("div");
  pair.className = "find-sides";
  box.append(head, pair);
  teams.forEach((team) => {
    const roster = document.createElement("div");
    roster.className = "find-roster find-all";
    pair.append(roster);
    gameClub(roster, team.name, team.sport || ((team.bets || []).find((bet) => bet.sport) || {}).sport || "");
    const name = typeof whereNick === "function" ? whereNick(team.name) : team.name;
    new MutationObserver(() => {
      gameAlign(pair);
      if (typeof scriptRecMark === "function") scriptRecMark(box.closest(".find-match"));
      const top = roster.querySelector(":scope > summary");
      if (!top) return;
      const off = (chip) => (roster.classList.contains("hide-bench") && chip.dataset.bench) || (roster.classList.contains("hide-fringe") && chip.dataset.fringe) || (roster.classList.contains("hide-def") && chip.dataset.def);
      const text = `${name}, ${[...roster.querySelectorAll(".find-chip")].filter((chip) => !off(chip)).length}`;
      if (top.textContent !== text) { top.textContent = text; roster.open = true; }
    }).observe(roster, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    fillRoster(roster, team, list, hits, people);
  });
  return box;
}

function gameAlign(pair) {
  const rosters = [...pair.children], count = new Map();
  const groups = (roster) => [...roster.querySelectorAll(":scope > .find-names > .find-group:not(.find-outs)")];
  const spot = (group) => { const node = group.querySelector("button[data-pos]"); return node ? node.dataset.pos : ""; };
  rosters.forEach((roster) => groups(roster).forEach((group) => count.set(spot(group), (count.get(spot(group)) || 0) + group.querySelectorAll(".find-chip").length)));
  const rows = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b));
  pair.style.gridTemplateRows = `repeat(${rows.length + 2}, auto)`;
  rosters.forEach((roster) => {
    const top = roster.querySelector(":scope > summary"), bar = roster.querySelector(":scope > .find-names > .find-hides");
    if (top) top.style.gridRow = "1";
    if (bar) bar.style.gridRow = "2";
    const own = groups(roster), sorted = own.slice().sort((a, b) => rows.indexOf(spot(a)) - rows.indexOf(spot(b)));
    if (sorted.some((group, at) => group !== own[at])) { if (bar) bar.after(...sorted); else roster.querySelector(":scope > .find-names").prepend(...sorted); }
    sorted.forEach((group) => { group.style.gridRow = String(rows.indexOf(spot(group)) + 3); });
  });
}

function gameClub(roster, name, sport) {
  const club = typeof clubPalette === "function" && clubPalette(name, sport || "");
  if (club) Object.entries({ chip: club.c1, "chip-ink": "#ffffff", pick: club.c2, "pick-ink": club.ink2, "pick-shadow": "none", card: club.card, line: club.line, edge: club.edge }).forEach(([key, value]) => roster.style.setProperty(`--club-${key}`, value));
}

function gameLines(fold, game, rows) {
  const chip = (bet, text) => {
    const price = Number(bet.odds), key = parlayKey(bet);
    const wrap = document.createElement("span"); wrap.className = "find-chip find-line-chip"; wrap.dataset.key = key; wrap.dataset.label = bet.label; wrap.dataset.market = bet.market;
    const main = document.createElement("button"); main.type = "button"; main.textContent = `${text} ${price > 0 ? `+${price}` : price}`; main.dataset.pos = findPct(price); main.title = findCash(price) ? `$5 profits ${findCash(price)}` : "";
    main.classList.toggle("on", parlayLeg.has(key));
    const plus = document.createElement("button"); plus.type = "button"; plus.className = "find-plus"; plus.setAttribute("aria-label", `Add ${bet.label} to the parlay`);
    const flip = () => { if (parlayLeg.has(key)) parlayLeg.delete(key); else if (parlayLeg.size < 8) parlayLeg.set(key, bet); else return; paintParlay(); };
    main.addEventListener("click", flip); plus.addEventListener("click", flip);
    wrap.append(main, plus);
    return wrap;
  };
  const block = (title, sport, name) => {
    const roster = document.createElement("div"); roster.className = "find-roster find-all";
    if (name) gameClub(roster, name, sport);
    const head = document.createElement("summary"); head.textContent = title;
    const names = document.createElement("div"); names.className = "find-names";
    roster.append(head, names);
    return { roster, head, names };
  };
  const kinds = ["spread", "moneyline"], pair = document.createElement("div"); pair.className = "find-sides";
  String(game.match || "").split(/ @ | v /).map((side) => side.trim()).filter(Boolean).forEach((side) => {
    const mine = rows.filter((bet) => kinds.includes(String(bet.market || "").toLowerCase()) && String(bet.label || "").toLowerCase().startsWith(side.toLowerCase()));
    if (!mine.length) return;
    const { roster, head, names } = block(typeof whereNick === "function" ? whereNick(side) : side, game.sport, side);
    head.style.gridRow = "1";
    kinds.forEach((kind, at) => {
      const bets = mine.filter((bet) => String(bet.market || "").toLowerCase() === kind);
      if (!bets.length) return;
      const group = document.createElement("div"); group.className = "find-group"; group.style.gridRow = String(at + 2);
      bets.forEach((bet) => group.append(chip(bet, kind === "moneyline" ? "Win" : String(bet.label).slice(side.length).replace(/\s+spread$/i, "").trim())));
      names.append(group);
    });
    pair.append(roster);
  });
  pair.style.gridTemplateRows = "repeat(3, auto)";
  if (pair.childElementCount) fold.append(pair);
  setTimeout(() => { if (typeof scriptRecMark === "function") scriptRecMark(fold.closest(".find-match")); }, 0);
  const totals = rows.filter((bet) => /^(over|under)\b/i.test(String(bet.label || "")));
  if (!totals.length) return;
  const { roster, names } = block("Game total");
  roster.classList.add("find-line-total");
  const group = document.createElement("div"); group.className = "find-group";
  totals.forEach((bet) => group.append(chip(bet, String(bet.label))));
  names.append(group);
  fold.append(roster);
}

if (typeof paintParlay === "function") {
  const paintParlayLines = paintParlay;
  paintParlay = function () { paintParlayLines.apply(this, arguments); document.querySelectorAll(".find-line-chip").forEach((chip) => { if (chip.firstElementChild) chip.firstElementChild.classList.toggle("on", parlayLeg.has(chip.dataset.key)); }); };
}

function gameAddLine(add, bets) {
  const seen = new Map();
  (bets || []).forEach((bet) => { if (bet.match && !seen.has(`${bet.match}|${bet.kickoff}`)) seen.set(`${bet.match}|${bet.kickoff}`, bet); });
  if (!seen.size) return add;
  const nick = (side) => (typeof whereNick === "function" ? whereNick(side) : side);
  const line = document.createElement("p");
  line.className = "find-game-line";
  line.style.scrollMarginTop = "5.5rem";
  [...seen.values()].forEach((bet, at) => {
    const sides = bet.match.includes(" @ ") ? bet.match.split(" @ ") : null;
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = [sides ? `${nick(sides[0])} @ ${nick(sides[1])}` : bet.match, bet.kickoff && window.when ? `${window.when(bet.kickoff)} ET` : ""].filter(Boolean).join(", ");
    go.addEventListener("click", () => {
      const holder = add.closest(".find-board") && add.closest(".find-board").querySelector(".find-teams");
      const card = holder && holder.querySelectorAll(".find-match")[at];
      if (card) { card.style.scrollMarginTop = "5.5rem"; card.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    line.append(go);
  });
  add.before(line);
  return line;
}

function gameScrollTo(node) {
  const quit = new AbortController();
  let moved = false;
  ["wheel", "touchstart", "pointerdown", "keydown"].forEach((kind) => window.addEventListener(kind, () => { moved = true; quit.abort(); }, { passive: true, signal: quit.signal }));
  window.gameScrollQuit = () => { moved = true; quit.abort(); };
  const glass = document.getElementById("desk-glass-in"), board = node.closest(".find-board");
  const go = () => {
    if (moved || !node.isConnected) return;
    if (!glass || !glass.contains(node)) { node.scrollIntoView({ block: "start" }); return; }
    const top = glass.scrollTop + node.getBoundingClientRect().top - glass.getBoundingClientRect().top - (parseFloat(getComputedStyle(node).scrollMarginTop) || 0);
    if (Math.abs(top - glass.scrollTop) > 1) glass.scrollTop = top;
  };
  const watch = new ResizeObserver(() => go());
  if (board) watch.observe(board);
  setTimeout(go, 60);
  [800, 1600, 3000].forEach((ms) => setTimeout(go, ms));
  setTimeout(() => { quit.abort(); watch.disconnect(); }, 3100);
}

function findBlankOpen() {
  const board = document.querySelector('#desk-glass-in .rec-board[data-page="find"]'), span = board && board.querySelector(".find-span"), input = board && board.querySelector("label.find input");
  if (!span || span.classList.contains("find-picked") || (input && input.value.trim()) || board.querySelector(".find-match, .find-list > *")) return;
  const today = span.querySelector(".find-games:not(.find-week)"), week = span.querySelector(".find-week");
  const box = today && !today.hidden && today.querySelector(":scope > details") ? today : week;
  if (!box || !box.querySelector(":scope > details")) return;
  box.open = true;
  box.querySelectorAll(":scope > details").forEach((group) => { group.open = true; });
}

function gameGuide(match, people, list, hits, noted) {
  if (!match || match.querySelectorAll(":scope > .find-side-go").length < 2) return;
  const guide = document.createElement("p");
  guide.className = "find-guide";
  const sides = [...match.querySelectorAll(":scope > .find-side-go")];
  sides[sides.length - 1].after(guide);
  const everyone = gameEveryone(match, sides, people, list, hits);
  if (everyone) { guide.after(everyone); const stacks = match.querySelector(":scope > .find-stacks"); if (stacks) everyone.before(stacks); }
  gameGuidePaint(match, guide);
  match.addEventListener("click", (event) => { const side = event.target.closest(".find-side-go"); if (!side || !match.contains(side) || side.parentElement !== match) return; sides.forEach((node) => node.removeAttribute("aria-label")); gameGuidePaint(match, guide); });
}
