/** Today's games under the poster when the screen has room, like a phone held upright. Tapping one opens it on the search page. */

let homeGamesList = [], homeGamesAt = 0;

function homeGamesLoad() {
  if (document.body.classList.contains("needs-member") || typeof loadFind !== "function" || Date.now() - homeGamesAt < 5 * 60 * 1000) return;
  homeGamesAt = Date.now();
  loadFind("today").then((data) => {
    homeGamesList = loadedGames(Array.isArray(data && data.people) ? data.people : [], "today");
    homeGamesPaint();
  }).catch((error) => { homeGamesAt = 0; console.log("[home-games] could not load", error); });
}

function homeGamesOpen(game) {
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdMenu) birdMenu("find");
  let tries = 0;
  const wait = setInterval(() => {
    const hit = [...document.querySelectorAll('.find-board .find-games[data-span="today"] button')].find((node) => node.textContent.startsWith(game.match));
    if (!hit && ++tries < 60) return;
    clearInterval(wait);
    if (hit) hit.click();
  }, 150);
}

function homeGamesRow(game) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "desk-game";
  const when = game.kickoff ? `${new Date(game.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "";
  row.innerHTML = `<span class="desk-game-sport">${esc(game.sport || "")}</span><span class="desk-game-match">${esc(game.match)}</span><span class="desk-game-when">${esc(when)}</span>`;
  const until = document.createElement("span");
  until.className = "find-until desk-game-until";
  until.dataset.kick = game.kickoff;
  if (typeof gameUntilPaint === "function") gameUntilPaint(until);
  row.append(until);
  row.addEventListener("click", () => homeGamesOpen(game));
  return row;
}

function homeGamesPaint() {
  const desk = document.getElementById("desk"), bg = document.getElementById("desk-bg"), guide = document.getElementById("bird-guide");
  if (!desk || !bg) return;
  let box = document.getElementById("desk-games");
  if (!box) { box = document.createElement("div"); box.id = "desk-games"; box.hidden = true; desk.append(box); }
  const now = Date.now(), games = homeGamesList.filter((game) => Date.parse(game.kickoff || "") > now);
  const top = Math.ceil(bg.getBoundingClientRect().bottom - desk.getBoundingClientRect().top);
  const show = games.length > 0 && !document.body.classList.contains("needs-member") && !desk.classList.contains("tv-full") && Boolean(guide && !guide.hidden) && desk.clientHeight - top >= 160;
  box.hidden = !show;
  if (!show) return;
  box.style.top = `${top}px`;
  const sig = games.map((game) => `${game.match}|${game.kickoff}`).join(";");
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const head = document.createElement("p");
  head.className = "desk-games-head";
  head.textContent = `Today's games, ${games.length}`;
  box.replaceChildren(head, ...games.map(homeGamesRow));
}

setInterval(() => { homeGamesLoad(); homeGamesPaint(); }, 500);
