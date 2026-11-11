/** Favorite teams, saved on the account as "LEAGUE|Nickname". The parrot asks once; the home Recommended list can show only these teams. */

let favLeague = "";

function favTeamsHas(game) {
  const sport = String((game && game.sport) || "").toUpperCase(), sides = String((game && game.match) || "").split(/ @ | v /).map((side) => side.trim());
  return (window.memberTeams || []).some((key) => {
    const [league, nick] = key.split("|");
    return league === sport && sides.some((side) => side === nick || side.endsWith(` ${nick}`));
  });
}

async function favTeamsSave(list) {
  try {
    const response = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teams: list }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return false;
    window.memberTeams = Array.isArray(payload.member && payload.member.teams) ? payload.member.teams : list;
    return true;
  } catch (error) { console.log("[fav-teams] could not save", error); return false; }
}

function favTeamsOpen(done) {
  if (typeof CLUB_COLORS === "undefined") return;
  const old = document.getElementById("fav-teams");
  if (old) old.remove();
  const pick = new Set(window.memberTeams || []), leagues = Object.keys(CLUB_COLORS);
  if (!leagues.includes(favLeague)) favLeague = (leagues.find((league) => [...pick].some((key) => key.startsWith(`${league}|`))) || leagues[0]);
  const box = document.createElement("div");
  box.id = "fav-teams";
  box.innerHTML = `<div class="fav-teams-card" role="dialog" aria-label="Your teams"><p class="fav-teams-head">Your teams</p><p class="fav-teams-say">Tap the teams you root for. Recommended can show just their games.</p><div class="fav-teams-leagues"></div><div class="fav-teams-list"></div><p class="fav-teams-do"><button type="button" class="fav-teams-skip">Not now</button><button type="button" class="fav-teams-save">Save my teams</button></p></div>`;
  const tabs = box.querySelector(".fav-teams-leagues"), list = box.querySelector(".fav-teams-list"), save = box.querySelector(".fav-teams-save");
  const paint = () => {
    tabs.replaceChildren(...leagues.map((league) => {
      const tab = document.createElement("button"), n = [...pick].filter((key) => key.startsWith(`${league}|`)).length;
      tab.type = "button";
      tab.className = `fav-teams-league${league === favLeague ? " on" : ""}`;
      tab.textContent = n ? `${league} ${n}` : league;
      tab.addEventListener("click", () => { favLeague = league; paint(); });
      return tab;
    }));
    list.replaceChildren(...Object.entries(CLUB_COLORS[favLeague]).sort(([a], [b]) => a.localeCompare(b)).map(([nick, colors]) => {
      const key = `${favLeague}|${nick}`, team = document.createElement("button");
      team.type = "button";
      team.className = `fav-teams-team${pick.has(key) ? " on" : ""}`;
      team.style.setProperty("--fav", colors[0]);
      team.textContent = nick;
      team.setAttribute("aria-pressed", String(pick.has(key)));
      team.addEventListener("click", () => { if (!pick.delete(key)) pick.add(key); paint(); });
      return team;
    }));
    save.textContent = pick.size ? `Save ${pick.size} ${pick.size === 1 ? "team" : "teams"}` : "Save my teams";
  };
  const close = () => box.remove();
  box.addEventListener("click", (event) => { if (event.target === box) close(); });
  box.querySelector(".fav-teams-skip").addEventListener("click", async () => { if (window.memberTeams === null) await favTeamsSave([]); close(); if (done) done(false); });
  save.addEventListener("click", async () => { save.disabled = true; const ok = await favTeamsSave([...pick]); save.disabled = false; if (!ok) return; close(); if (done) done(true); });
  paint();
  document.body.append(box);
}

function favTeamsProfile() {
  const spot = document.getElementById("call-teams");
  if (!spot) return;
  const leagues = new Map();
  (window.memberTeams || []).forEach((key) => { const [league, nick] = key.split("|"); if (!leagues.has(league)) leagues.set(league, []); leagues.get(league).push(nick); });
  const text = leagues.size ? [...leagues].map(([league, nicks]) => `${league}: ${nicks.join(", ")}`).join(" · ") : "No teams picked yet.";
  if (spot.textContent !== text) spot.textContent = text;
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("#teams-edit")) return;
  favTeamsOpen(() => { favTeamsProfile(); if (typeof homeGamesRepaint === "function") homeGamesRepaint(); });
});
setInterval(favTeamsProfile, 1000);

window.birdAskTeams = function () {
  if (window.memberTeams !== null || typeof CLUB_COLORS === "undefined") return false;
  window.asking = true;
  birdSay("Who do you root for? Pick your teams and I'll keep their picks ready.", []);
  const row = document.getElementById("bird-picks");
  if (!row) return true;
  const next = () => { const said = (document.getElementById("bird-line") || {}).textContent || ""; if (said.startsWith("Who do you root for") && window.birdGreet) birdGreet(); };
  row.innerHTML = `<button type="button" id="bird-teams-go">Pick my teams</button><button type="button" id="bird-teams-skip">Skip</button>`;
  document.getElementById("bird-teams-go").addEventListener("click", () => favTeamsOpen(next));
  document.getElementById("bird-teams-skip").addEventListener("click", async () => { await favTeamsSave([]); next(); });
  return true;
};
