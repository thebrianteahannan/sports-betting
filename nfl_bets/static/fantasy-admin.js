/** Admin list of Sleeper usernames that used Fantasy Start/Sit. */

function fantasyUseCard(row) {
  const last = row.last && typeof when === "function" ? `${when(row.last)} ET` : (row.last || "—");
  const gist = `History ${row.total} · Today ${row.today} · Last 7 days ${row.week}`;
  return typeof adminCard === "function"
    ? adminCard(esc(row.name), gist, [`Last check ${last}`])
    : `<div class="rec-bet"><b>${esc(row.name)}</b><p class="rec-gist">${gist}</p><span>Last check ${esc(last)}</span></div>`;
}

async function paintFantasyUse() {
  const list = document.getElementById("admin-fantasy-list");
  if (!list) return;
  list.textContent = "Loading…";
  const response = await fetch("/api/admin/fantasy-use", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { list.textContent = data.error || "Could not load."; return; }
  const rows = data.users || [];
  if (!rows.length) { list.innerHTML = "<p>No Sleeper usernames yet.</p>"; return; }
  list.innerHTML = `<p class="quiet">${rows.length} ${rows.length === 1 ? "username" : "usernames"}. A check is a username lookup, Check my teams, or opening a league.</p>${rows.map(fantasyUseCard).join("")}`;
}

window.paintFantasyUse = paintFantasyUse;
