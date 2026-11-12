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
  if (window.saveNew && !document.getElementById("desk").classList.contains("tv-full")) saveNew();
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

let homeLogos = null;

function homeLogosLoad() {
  if (homeLogos) return;
  homeLogos = {};
  fetch("/api/logos").then((reply) => reply.json()).then((data) => { homeLogos = data || {}; homeGamesRepaint(); }).catch((error) => { console.log("[home-games] could not load logos", error); homeLogos = null; });
}

function homeTeam(name) {
  const logos = homeLogos || {}, tail = ` ${String(name).split(" ").pop()}`, near = Object.keys(logos).filter((key) => key.endsWith(tail));
  const logo = logos[name] || (near.length === 1 ? logos[near[0]] : "");
  const dark = logo.replace("/500/", "/500-dark/");
  return `${logo ? `<img class="desk-team-logo" src="${esc(dark)}" alt="" loading="lazy"${dark !== logo ? ` onerror="this.onerror=null;this.src='${esc(logo)}'"` : ""}>` : ""}${esc(name)}`;
}

function homeTeamStar(game) {
  return game && typeof favTeamsHas === "function" && favTeamsHas(game) ? `<b class="desk-team-star" title="One of your teams">★</b> ` : "";
}

function homeGamesRow(game) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "desk-game";
  const when = game.kickoff ? `${new Date(game.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "";
  row.innerHTML = `<span class="desk-game-sport">${esc(game.sport || "")}</span><span class="desk-game-match">${homeTeamStar(game)}${game.match.includes(" @ ") ? game.match.split(" @ ").map(homeTeam).join(" @ ") : esc(game.match)}</span><span class="desk-game-when">${esc(when)}</span>`;
  const until = document.createElement("span");
  until.className = "find-until desk-game-until";
  until.dataset.kick = game.kickoff;
  if (typeof gameUntilPaint === "function") gameUntilPaint(until);
  row.append(until);
  row.addEventListener("click", () => homeGamesOpen(game));
  return row;
}

function homeSharedRow(item) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "desk-game";
  const who = item.legs.map((leg) => String(leg.label || "").split(/\s+(?:\d|Over\b|Under\b)/)[0].split(" ").pop()).filter(Boolean);
  const games = typeof gameShortList === "function" ? gameShortList(item.legs) : "";
  const price = typeof savePrice === "function" ? savePrice(item.legs) : "";
  row.innerHTML = `<span class="desk-game-sport">${esc(games)}</span><span class="desk-game-match">${esc(`${who.slice(0, 2).join(", ")}${who.length > 2 ? ` +${who.length - 2}` : ""}`)}</span><span class="desk-game-when">${esc(`From ${item.fromName}`)}</span><span class="desk-game-until">${esc(price)}</span>`;
  row.addEventListener("click", () => { window.asking = true; if (window.goFull) goFull(); if (window.sharedGo) sharedGo(); });
  return row;
}

let homeGamesTab = "rec", homeRecs = null;

function homeRecsLoad() {
  if (homeRecs && (homeRecs.loading || Date.now() - homeRecs.at < 10 * 60 * 1000)) return;
  homeRecs = { loading: true, at: Date.now(), picks: (homeRecs && homeRecs.picks) || [] };
  fetch("/api/top-picks", { credentials: "same-origin" }).then((reply) => (reply.ok ? reply.json() : { picks: [] })).then((data) => { homeRecs = { at: Date.now(), picks: (data && data.picks) || [] }; homeGamesPaint(); }).catch((error) => { console.log("[home-games] could not load top picks", error); homeRecs = { at: Date.now(), picks: [] }; homeGamesPaint(); });
}

function homeRecRow(pick, index) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "desk-game desk-rec";
  const odds = Number(pick.odds), price = odds > 0 ? `+${odds}` : String(odds), win = (odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds)).toFixed(2);
  const when = pick.kickoff ? `${new Date(pick.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "";
  card.innerHTML = `<span class="desk-rec-name">${homeTeamStar(homeGamesList.find((game) => game.match === pick.match))}${esc(pick.label)} ${esc(price)}</span><span class="desk-rec-how">${index ? `#${index + 1}` : "Today's free pick"}</span><span class="desk-rec-legs">${esc(when)}</span><span class="desk-rec-read">${esc(`${pick.match}. Hit in ${pick.hits} of his last ${pick.n}, the price needs ${pick.need}. $5 wins $${win}.`)}</span>`;
  card.addEventListener("click", () => { window.location.href = `/?${new URLSearchParams({ game: pick.match, label: pick.label, market: pick.market || "" })}`; });
  return card;
}

function homeGamesRepaint() {
  const box = document.getElementById("desk-games");
  if (box) box.dataset.sig = "";
  homeGamesPaint();
}

function homeRecRows() {
  const note = (text) => { const line = document.createElement("p"); line.className = "desk-games-note"; line.textContent = text; return [line]; };
  if (!homeRecs || (homeRecs.loading && !homeRecs.picks.length)) return note("Looking up the picks.");
  return homeRecs.picks.length ? homeRecs.picks.map(homeRecRow) : note("Tonight's picks are not posted yet.");
}

function homeGameRows(games) {
  return games.map(homeGamesRow);
}

function homeGamesTabs(box, games) {
  const tabs = document.createElement("span");
  tabs.className = "desk-games-tabs";
  [["rec", "Recommended"], ["games", `Games ${games.length}`]].forEach(([id, label]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `desk-games-tab${homeGamesTab === id ? " on" : ""}`;
    tab.textContent = label;
    tab.setAttribute("aria-pressed", String(homeGamesTab === id));
    tab.addEventListener("click", () => { homeGamesTab = id; if (id === "rec") homeRecsLoad(); box.dataset.sig = ""; box.scrollTop = 0; homeGamesPaint(); });
    tabs.append(tab);
  });
  return tabs;
}

function homeGamesPaint() {
  const desk = document.getElementById("desk"), bg = document.getElementById("desk-bg"), guide = document.getElementById("bird-guide");
  if (!desk || !bg) return;
  let box = document.getElementById("desk-games");
  if (!box) { box = document.createElement("div"); box.id = "desk-games"; box.hidden = true; desk.append(box); homeGamesGrow(box); }
  const now = Date.now(), games = homeGamesList.filter((game) => Date.parse(game.kickoff || "") > now), fresh = typeof sharedUnopened === "function" ? sharedUnopened() : [];
  const top = Math.ceil(bg.getBoundingClientRect().bottom - desk.getBoundingClientRect().top);
  const show = (fresh.length > 0 || games.length > 0) && !document.body.classList.contains("needs-member") && !desk.classList.contains("tv-full") && Boolean(guide && !guide.hidden) && desk.clientHeight - top >= 160;
  box.hidden = !show;
  document.body.classList.toggle("home-games-on", show);
  if (!show) { box.classList.remove("desk-games-tall"); return; }
  const menu = document.getElementById("desk-menu"), at = box.classList.contains("desk-games-tall") && menu ? Math.ceil(menu.getBoundingClientRect().bottom - desk.getBoundingClientRect().top) + 8 : top;
  box.style.top = `${at}px`;
  document.body.style.setProperty("--home-games-top", `${at + 12}px`);
  if (!fresh.length && homeGamesTab === "rec") homeRecsLoad();
  if (homeGamesTab === "games") homeLogosLoad();
  const sig = `${window.memberName || ""}|${homeGamesTab}|${(window.memberTeams || []).join(",")}|${homeRecs ? `${homeRecs.at}${homeRecs.loading ? "…" : ""}` : ""}|${fresh.length ? `shared:${fresh.map((item) => item.id).join(";")}` : games.map((game) => `${game.match}|${game.kickoff}`).join(";")}`;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const head = document.createElement("p");
  head.className = "desk-games-head";
  const names = [...new Set(fresh.map((item) => item.fromName))];
  const said = document.createElement("span"), who = document.createElement("span");
  said.className = "desk-games-said";
  said.textContent = `${names.length === 1 ? names[0] : "Your friends"} sent you ${fresh.length === 1 ? "a bet" : `${fresh.length} bets`}`;
  who.className = "desk-games-who";
  who.textContent = window.memberName || "";
  head.append(fresh.length ? said : homeGamesTabs(box, games), who);
  box.replaceChildren(head, ...(fresh.length ? fresh.map(homeSharedRow) : homeGamesTab === "rec" ? homeRecRows(games) : homeGameRows(games)));
}

function homeGamesGrow(box) {
  const set = (tall) => { if (box.classList.contains("desk-games-tall") === tall) return; box.classList.toggle("desk-games-tall", tall); homeGamesPaint(); };
  let touchY = 0;
  box.addEventListener("scroll", () => { if (box.scrollTop > 8) set(true); }, { passive: true });
  box.addEventListener("wheel", (event) => { if (event.deltaY < 0 && box.scrollTop <= 0) set(false); }, { passive: true });
  box.addEventListener("touchstart", (event) => { touchY = event.touches[0].clientY; }, { passive: true });
  box.addEventListener("touchmove", (event) => { if (event.touches[0].clientY > touchY + 12 && box.scrollTop <= 0) set(false); }, { passive: true });
}

setInterval(() => { homeGamesLoad(); homeGamesPaint(); }, 500);
