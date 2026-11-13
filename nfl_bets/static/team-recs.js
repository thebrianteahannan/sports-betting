/** Recommended team bets inside a game: the parrot on the spread, moneyline, and total chips, and a Team bets block in Parlay's Recommended Bets. */

function teamRecLines(people, match) {
  const rows = [];
  (people || []).forEach((person) => {
    if (person.kind !== "team") return;
    (person.bets || []).forEach((bet) => { if (bet.match === match && /^(spread|moneyline|total)$/i.test(bet.market || "")) rows.push({ label: bet.label, market: bet.market, odds: bet.odds }); });
  });
  return [...new Map(rows.map((row) => [`${row.label}|${row.market}`, row])).values()];
}

function teamRecAdd(pick, game, people) {
  let bet = null;
  (people || []).some((person) => person.kind === "team" && (bet = (person.bets || []).find((row) => row.label === pick.label && row.market === pick.market && row.match === game.match)));
  if (!bet || typeof parlayLeg === "undefined") return;
  const key = parlayKey(bet);
  if (!parlayLeg.has(key) && parlayLeg.size >= 8) return;
  if (typeof betFromSay === "function") betFromSay("Game script");
  parlayLeg.set(key, bet);
  paintParlay();
}

function teamRecBlock(lines, game, people) {
  const money = (odds) => (odds > 0 ? `+${odds}` : String(odds));
  const block = document.createElement("div");
  block.className = "find-script-part find-team-recs";
  block.innerHTML = `<b>Team bets</b>${lines.map((pick) => `<div class="find-script-pick" data-who="${esc(pick.who || "")}" data-legs="${esc(`${pick.label}|${pick.market}`)}"${pick.who ? scriptClubStyle(game, pick.team) : ""}><p><strong>${esc(pick.team)} ${esc(pick.text)}, ${money(pick.odds)}.</strong> ${scriptKindTag(pick)}</p><p class="find-script-why"><em>Why:</em> ${esc(pick.how)}</p></div>`).join("")}`;
  block.querySelectorAll(".find-script-pick").forEach((row, at) => {
    const go = document.createElement("button");
    go.type = "button"; go.className = "find-script-add"; go.textContent = "Add to bet";
    go.addEventListener("click", () => teamRecAdd(lines[at], game, people));
    row.append(go);
  });
  return block;
}

if (typeof scriptRecLearn === "function") {
  const scriptRecLearnTeam = scriptRecLearn;
  scriptRecLearn = function (bets) {
    const picks = scriptRecLearnTeam.apply(this, arguments), lines = (bets && bets.lines) || [];
    lines.forEach((pick) => scriptRecAll.set(`${pick.label}|${pick.market}`, { kind: pick.kind, basis: pick.basis, tier: pick.tier, hits: pick.hits, n: pick.n }));
    return picks.concat(lines);
  };
}

if (typeof scriptBetsBox === "function") {
  const scriptBetsBoxTeam = scriptBetsBox;
  scriptBetsBox = function (bets, game, people) {
    const box = scriptBetsBoxTeam.apply(this, arguments), lines = (bets && bets.lines) || [];
    if (lines.length) box.querySelector(":scope > summary").after(teamRecBlock(lines, game, people));
    return box;
  };
}

if (typeof scriptRecJump === "function") {
  const scriptRecJumpTeam = scriptRecJump;
  scriptRecJump = function (match, test) {
    const box = match && match.querySelector(":scope > .find-bets");
    const row = box && [...box.querySelectorAll(":scope > .find-team-recs > .find-script-pick")].find((node) => test(node.dataset));
    if (!row) return scriptRecJumpTeam.apply(this, arguments);
    if (match.classList.contains("find-game-shut")) { const fold = match.querySelector(":scope > .find-when .find-game-fold"); if (fold) fold.click(); else match.classList.remove("find-game-shut"); }
    box.open = true;
    row.style.scrollMarginTop = "8.5rem";
    if (window.gameScrollQuit) gameScrollQuit();
    if (typeof gameScrollTo === "function") gameScrollTo(row); else row.scrollIntoView({ block: "start" });
    row.classList.remove("find-flash"); void row.offsetWidth; row.classList.add("find-flash");
    setTimeout(() => row.classList.remove("find-flash"), 2400);
  };
}
