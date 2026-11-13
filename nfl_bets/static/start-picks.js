/** An empty bet shows the next games and the best picks under the parrot's tips, so a bet starts right here instead of on another page. */

function startGames(board) {
  const now = Date.now(), seen = new Map();
  (board.people || []).forEach((person) => (person.bets || []).forEach((bet) => {
    const at = Date.parse(bet.kickoff || ""), key = `${bet.match}|${bet.kickoff}`;
    if (bet.match && at > now && !seen.has(key)) seen.set(key, { bet, at });
  }));
  return [...seen.values()].sort((a, b) => a.at - b.at).slice(0, 6);
}

function startPicks(board) {
  if (typeof legBoostFind !== "function" || typeof legBoostRecs === "undefined") return [];
  const index = legBoostFind(board.people), now = Date.now(), rows = [];
  legBoostRecs.list.forEach((rec) => {
    const hit = index.get(`${rec.label}|${rec.market}|${rec.match}`);
    if (!hit || !(Date.parse(hit.bet.kickoff || "") > now) || !Number(hit.bet.odds)) return;
    const read = legRoleChance(hit.bet);
    if (read.n) rows.push({ ...hit, ...read, rec, edge: read.chance - legSwapChance(hit.bet.odds) });
  });
  return rows.sort((a, b) => (a.rec.tier === "good") - (b.rec.tier === "good") || b.edge - a.edge).filter((row, at, list) => list.findIndex((one) => one.person === row.person) === at).slice(0, 6);
}

function startOpen(board, bet) {
  const teams = board.querySelector(":scope > .find-teams"), list = board.querySelector(":scope > .find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), span = board.querySelector(":scope > .find-span"), more = board.querySelector(".find-games-go");
  if (!teams || !list || typeof paintMatch !== "function") return;
  if (hits) hits.replaceChildren();
  teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on");
  if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
  if (more) more.hidden = false;
  paintMatch(teams, bet, board.people || [], list, hits, true);
  teams.scrollIntoView({ block: "start", behavior: "smooth" });
}

function startPaint(again) {
  document.querySelectorAll(".find-start").forEach((node) => node.remove());
  const tips = document.querySelector("#desk-glass-in .find-tips"), board = tips && tips.closest(".find-board");
  if (!tips || !board || parlayLeg.size || parlayPick.size) return;
  const box = document.createElement("div"), name = (team) => String(team || "").split(" ").pop();
  box.className = "find-start";
  const games = startGames(board), picks = startPicks(board);
  if (games.length) {
    const part = document.createElement("div"); part.className = "find-start-part"; part.innerHTML = "<b>Up next</b>";
    games.forEach(({ bet }) => {
      const count = typeof legBoostRecs !== "undefined" ? new Set(legBoostRecs.list.filter((rec) => rec.match === bet.match).map((rec) => rec.label)).size : 0;
      const go = document.createElement("button"); go.type = "button"; go.className = "find-start-game";
      go.innerHTML = `<i class="sp">${esc(bet.sport || "")}</i><i class="gm">${esc(String(bet.match).split(/\s+@\s+/).map(name).join(" @ "))}</i><i class="find-until" data-kick="${esc(bet.kickoff)}"></i>${count ? `<i class="ct">${count} pick${count > 1 ? "s" : ""}</i>` : ""}`;
      go.addEventListener("click", () => startOpen(board, bet));
      part.append(go);
    });
    box.append(part);
  }
  const part = document.createElement("div"); part.className = "find-start-part"; part.innerHTML = "<b>Start with a pick</b>";
  picks.forEach((row) => {
    const price = Number(row.bet.odds), go = document.createElement("button"); go.type = "button"; go.className = "find-start-pick"; go.title = "Add to a new bet";
    go.innerHTML = `<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i><i class="who">${esc(row.person.name)}</i><i class="prop">${esc(legSwapWhat(row.person, row.bet))}</i><i class="tm">${esc(gameShort(row.bet.match))}</i>${typeof scriptKindTag === "function" ? scriptKindTag({ ...row.rec, odds: price, kind: scriptKindOf(price) }) : ""}<i class="rec">${row.hits} of ${row.n}</i>`;
    go.addEventListener("click", () => legSwapAdd(row.person, row.bet));
    part.append(go);
  });
  if (!picks.length) { const wait = document.createElement("p"); wait.textContent = typeof legBoostRecs !== "undefined" && legBoostRecs.at ? "No picks are posted for the games ahead yet." : "Loading the picks."; part.append(wait); }
  box.append(part);
  tips.after(box);
  if (typeof gameUntilPaint === "function") box.querySelectorAll(".find-until").forEach(gameUntilPaint);
  if (!again && typeof legBoostRecLoad === "function") legBoostRecLoad().then(() => { if (box.isConnected) startPaint(true); });
}

if (typeof saveTips === "function") {
  const saveTipsStart = saveTips;
  saveTips = function () { saveTipsStart.apply(this, arguments); startPaint(); };
}
if (typeof paintParlay === "function") {
  const paintParlayStart = paintParlay;
  paintParlay = function () { paintParlayStart.apply(this, arguments); if (parlayLeg.size || parlayPick.size) document.querySelectorAll(".find-start").forEach((node) => node.remove()); };
}
document.addEventListener("input", (event) => { if (event.target.closest && event.target.closest("label.find")) document.querySelectorAll(".find-start").forEach((node) => node.remove()); });
