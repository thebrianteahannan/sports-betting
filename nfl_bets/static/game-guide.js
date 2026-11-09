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
  box.className = "find-everyone"; box.open = true;
  const head = document.createElement("summary");
  head.textContent = "Players with bets";
  box.append(head);
  teams.forEach((team) => {
    const roster = document.createElement("details");
    roster.className = "find-roster find-all";
    box.append(roster);
    const club = typeof clubPalette === "function" && clubPalette(team.name, team.sport || ((team.bets || []).find((bet) => bet.sport) || {}).sport || "");
    if (club) Object.entries({ chip: club.c1, "chip-ink": "#ffffff", pick: club.c2, "pick-ink": club.ink2, "pick-shadow": "none", card: club.card, line: club.line, edge: club.edge }).forEach(([key, value]) => roster.style.setProperty(`--club-${key}`, value));
    const name = typeof whereNick === "function" ? whereNick(team.name) : team.name;
    new MutationObserver(() => {
      const top = roster.querySelector(":scope > summary");
      if (!top) return;
      const text = `${name}, ${roster.querySelectorAll(".find-chip").length}`;
      if (top.textContent !== text) { top.textContent = text; roster.open = true; }
    }).observe(roster, { childList: true, subtree: true });
    fillRoster(roster, team, list, hits, people);
  });
  return box;
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
  const go = (smooth) => { if (!moved && node.isConnected) node.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }); };
  setTimeout(() => go(true), 60);
  [800, 1600, 3000].forEach((ms) => setTimeout(() => go(false), ms));
  setTimeout(() => quit.abort(), 3100);
}

function gameGuide(match, people, list, hits, noted) {
  if (!match || match.querySelectorAll(":scope > .find-side-go").length < 2) return;
  const guide = document.createElement("p");
  guide.className = "find-guide";
  const sides = [...match.querySelectorAll(":scope > .find-side-go")];
  sides[sides.length - 1].after(guide);
  const everyone = gameEveryone(match, sides, people, list, hits);
  if (everyone) { guide.after(everyone); if (noted === "shut") everyone.open = false; }
  gameGuidePaint(match, guide);
  match.addEventListener("click", (event) => { const side = event.target.closest(".find-side-go"); if (!side || !match.contains(side) || side.parentElement !== match) return; sides.forEach((node) => node.removeAttribute("aria-label")); gameGuidePaint(match, guide); });
}
