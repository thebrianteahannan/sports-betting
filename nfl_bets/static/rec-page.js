/** Full list of tonight's recommended bets, opened from the TV ticker. Reuses the bottom panel's pick cards and league filter. */

let recPageTimer = 0;

function recPagePaint(box) {
  const list = box.querySelector(".rec-page-list"), now = Date.now(), games = homeGamesList.filter((game) => Date.parse(game.kickoff || "") > now);
  const sig = `${homeLeagueOn(games)}|${homeLeagueOpen}|${homeRecs ? `${homeRecs.at}${homeRecs.loading ? "…" : ""}` : ""}|${games.length}|${homeLogos ? Object.keys(homeLogos).length : 0}`;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const head = box.querySelector(".rec-page-filter");
  head.replaceChildren(...homeLeagues(box, games));
  list.replaceChildren(...homeRecRows(games));
}

function recPageClose() {
  const box = document.getElementById("rec-page");
  if (box) box.remove();
  clearInterval(recPageTimer);
  document.removeEventListener("keydown", recPageKey);
}

function recPageKey(event) { if (event.key === "Escape") recPageClose(); }

function recPageOpen() {
  recPageClose();
  const box = document.createElement("div");
  box.id = "rec-page";
  box.innerHTML = `<div class="rec-page-card"><p class="rec-page-head"><span>Recommended bets</span><button type="button" class="rec-page-close" aria-label="Close">&times;</button></p><p class="rec-page-filter"></p><div class="rec-page-list"></div></div>`;
  box.querySelector(".rec-page-close").addEventListener("click", recPageClose);
  box.addEventListener("click", (event) => { if (event.target === box) recPageClose(); });
  document.body.append(box);
  document.addEventListener("keydown", recPageKey);
  homeRecsLoad();
  homeLogosLoad();
  recPagePaint(box);
  recPageTimer = setInterval(() => recPagePaint(box), 300);
}
