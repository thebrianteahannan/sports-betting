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

let homeGamesTab = "games", homeRecs = null;

function homeRecsLoad() {
  if (typeof gameStackData !== "function" || (homeRecs && (homeRecs.loading || Date.now() - homeRecs.at < 10 * 60 * 1000))) return;
  homeRecs = { loading: true, at: Date.now(), found: (homeRecs && homeRecs.found) || {} };
  gameStackData().then((data) => { homeRecs = { at: Date.now(), found: (data && data.found) || {} }; homeGamesPaint(); });
}

function homeRecsFor(game) {
  const grade = typeof STACK_GRADE !== "undefined" ? STACK_GRADE : {};
  const fits = (stack) => stack.game === game.match || (stack.bets || []).some((bet) => bet.game === game.match);
  return Object.entries(homeRecs.found)
    .filter(([name]) => !grade[name] || grade[name][0] !== "lose")
    .map(([name, stacks]) => ({ name, score: (grade[name] && grade[name].score) || 0, stack: stacks.filter(fits).sort((a, b) => Number(Boolean(b.beats)) - Number(Boolean(a.beats)))[0] }))
    .filter((row) => row.stack)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function homeRecRow(row) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "desk-game desk-rec";
  const grade = typeof STACK_GRADE !== "undefined" && STACK_GRADE[row.name], tier = grade && typeof STACK_TIER !== "undefined" ? STACK_TIER[grade[0]] : null;
  const no = typeof STACKS !== "undefined" ? STACKS.findIndex((item) => item[0] === row.name) + 1 : 0, legs = (row.stack.bets || []).length;
  const name = (typeof stackName === "function" && stackName({ ...row.stack, game: "" })) || row.name;
  card.innerHTML = `<span class="desk-rec-name">${esc(name)}</span><span class="desk-rec-how"${tier ? ` style="color: ${tier[1]}"` : ""}>${esc(row.name)}</span><span class="desk-rec-legs">${legs} ${legs === 1 ? "bet" : "bets"}</span>${row.stack.read ? `<span class="desk-rec-read">${esc(row.stack.read)}</span>` : ""}`;
  card.addEventListener("click", () => { window.asking = true; if (window.goFull) goFull(); if (typeof stackBuild === "function") stackBuild(row.stack, 0, `${no ? `ST-${String(no).padStart(2, "0")} ` : ""}${row.name}`); });
  return card;
}

let homeRecMine = false;
try { homeRecMine = localStorage.getItem("home-rec-mine") === "1"; } catch (error) { homeRecMine = false; }

function homeGamesRepaint() {
  const box = document.getElementById("desk-games");
  if (box) box.dataset.sig = "";
  homeGamesPaint();
}

function homeRecBar() {
  const bar = document.createElement("p"), mine = document.createElement("button"), has = (window.memberTeams || []).length > 0;
  bar.className = "desk-rec-bar";
  mine.type = "button";
  mine.className = `desk-rec-mine${homeRecMine && has ? " on" : ""}`;
  mine.textContent = "★ My teams";
  mine.setAttribute("aria-pressed", String(homeRecMine && has));
  const set = (on) => { homeRecMine = on; try { localStorage.setItem("home-rec-mine", on ? "1" : "0"); } catch (error) { console.log("[home-games] could not keep the filter", error); } homeGamesRepaint(); };
  mine.addEventListener("click", () => { if (!has && typeof favTeamsOpen === "function") favTeamsOpen(() => set((window.memberTeams || []).length > 0)); else set(!homeRecMine); });
  bar.append(mine);
  if (has && typeof favTeamsOpen === "function") {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "desk-rec-edit";
    edit.textContent = "Edit teams";
    edit.addEventListener("click", () => favTeamsOpen(homeGamesRepaint));
    bar.append(edit);
  }
  return bar;
}

function homeRecRows(games) {
  const note = (text) => { const line = document.createElement("p"); line.className = "desk-games-note"; line.textContent = text; return [line]; };
  const bar = homeRecBar(), mine = homeRecMine && (window.memberTeams || []).length > 0 && typeof favTeamsHas === "function";
  if (!homeRecs || homeRecs.loading) return [bar, ...note("Looking up the picks.")];
  if (mine) games = games.filter(favTeamsHas);
  if (mine && !games.length) return [bar, ...note("Your teams are off today. Tap My teams to see every game.")];
  const rows = games.flatMap((game) => {
    const picks = homeRecsFor(game);
    if (!picks.length) return [];
    const head = document.createElement("p");
    head.className = "desk-rec-game";
    head.textContent = [game.match, game.kickoff ? `${new Date(game.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : ""].filter(Boolean).join(", ");
    return [head, ...picks.map(homeRecRow)];
  });
  return [bar, ...(rows.length ? rows : note(mine ? "Nothing fits your teams' prices yet." : "Nothing fits today's prices yet."))];
}

function homeMineGames(games) {
  return homeRecMine && (window.memberTeams || []).length > 0 && typeof favTeamsHas === "function" ? games.filter(favTeamsHas) : games;
}

function homeGameRows(games) {
  const mine = homeMineGames(games), line = document.createElement("p");
  if (mine.length || mine === games) return [homeRecBar(), ...mine.map(homeGamesRow)];
  line.className = "desk-games-note"; line.textContent = "Your teams are off today. Tap My teams to see every game.";
  return [homeRecBar(), line];
}

function homeGamesTabs(box, games) {
  const tabs = document.createElement("span");
  tabs.className = "desk-games-tabs";
  [["games", `Games ${homeMineGames(games).length}`], ["rec", "Recommended"]].forEach(([id, label]) => {
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
  if (!box) { box = document.createElement("div"); box.id = "desk-games"; box.hidden = true; desk.append(box); }
  const now = Date.now(), games = homeGamesList.filter((game) => Date.parse(game.kickoff || "") > now), fresh = typeof sharedUnopened === "function" ? sharedUnopened() : [];
  const top = Math.ceil(bg.getBoundingClientRect().bottom - desk.getBoundingClientRect().top);
  const show = (fresh.length > 0 || games.length > 0) && !document.body.classList.contains("needs-member") && !desk.classList.contains("tv-full") && Boolean(guide && !guide.hidden) && desk.clientHeight - top >= 160;
  box.hidden = !show;
  document.body.classList.toggle("home-games-on", show);
  if (!show) return;
  box.style.top = `${top}px`;
  document.body.style.setProperty("--home-games-top", `${top + 12}px`);
  if (!fresh.length && homeGamesTab === "rec") homeRecsLoad();
  const sig = `${window.memberName || ""}|${homeGamesTab}|${homeRecMine ? "mine" : ""}:${(window.memberTeams || []).join(",")}|${homeRecs ? `${homeRecs.at}${homeRecs.loading ? "…" : ""}` : ""}|${fresh.length ? `shared:${fresh.map((item) => item.id).join(";")}` : games.map((game) => `${game.match}|${game.kickoff}`).join(";")}`;
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

setInterval(() => { homeGamesLoad(); homeGamesPaint(); }, 500);
