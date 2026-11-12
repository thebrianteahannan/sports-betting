/** Live tracker page: scores, clocks, and every player's box score line for the games in progress, refreshed every 20 seconds. */

const liveOpen = new Set((() => { try { return JSON.parse(localStorage.getItem("liveOpen") || "[]"); } catch (error) { return []; } })());
const liveSlide = new Map();

function liveEsc(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function liveTime(when) {
  const at = Date.parse(when || "");
  return Number.isFinite(at) ? `${new Date(at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "";
}

function liveSide(team, lead, key) {
  return `<span class="live-side${lead ? " lead" : ""}">${team.logo ? `<img src="${liveEsc(team.logo)}" alt=""/>` : ""}<b>${liveEsc(team.short || team.name)}</b><i data-k="${liveEsc(key)}">${liveEsc(team.score)}</i></span>`;
}

let liveLegs = [];
const LIVE_STAT = { points: ["PTS"], rebounds: ["REB"], assists: ["AST"], threes: ["3PT"], "made threes": ["3PT"], steals: ["STL"], blocks: ["BLK"], "pts + reb": ["PTS", "REB"], "pts + ast": ["PTS", "AST"], "reb + ast": ["REB", "AST"], "pts + reb + ast": ["PTS", "REB", "AST"] };

function liveFold(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
}

function liveLegRead(leg) {
  const label = String(leg.label || ""), market = String(leg.market || "");
  const who = label.split(/\s+(?=\d+\+|Over\b|Under\b)/)[0].trim();
  const plus = market.match(/^(\d+)\+\s+(.+)$/), named = market.match(/\s-\s(?:Alt\s+)?(.+)$/), line = label.match(/\b(Over|Under)\s+(\d+(?:\.\d+)?)/i);
  const stat = ((plus && plus[2]) || (named && named[1]) || "").toLowerCase();
  const text = plus ? `${plus[1]}+ ${stat}` : line ? `${line[1]} ${line[2]} ${stat}`.trim() : label.slice(who.length).trim() || market;
  return { who, stat, text, odds: Number(leg.odds), need: plus ? Number(plus[1]) : line ? Number(line[2]) : null, plus: !!plus, under: !!(line && /under/i.test(line[1])) };
}

function liveMine(game) {
  const tail = (name) => liveFold(name).split(" ").pop(), sides = [tail(game.away.name), tail(game.home.name)], seen = new Set();
  return liveLegs.filter((leg) => {
    const teams = String(leg.match || "").split(/ @ | v /).map(tail), id = `${leg.label}|${leg.market}`;
    if (!sides.every((side) => teams.includes(side)) || Math.abs(Date.parse(leg.kickoff || "") - Date.parse(game.when || "")) > 12 * 3600000 || seen.has(id)) return false;
    seen.add(id); return true;
  }).map(liveLegRead);
}

function liveNow(game, pick) {
  const want = liveFold(pick.who), keys = LIVE_STAT[pick.stat];
  for (const team of game.teams || []) for (const group of team.groups) {
    const row = group.rows.find((one) => liveFold(one.name) === want);
    if (!row) continue;
    if (!keys || !keys.every((key) => group.labels.includes(key))) return { row, now: null };
    return { row, now: keys.reduce((sum, key) => sum + (Number(String(row.stats[group.labels.indexOf(key)] || "0").split("-")[0]) || 0), 0) };
  }
  return { row: null, now: null };
}

function liveRoot(game, picks) {
  if (!picks.length) return "";
  return `<span class="live-mine"><b>Rooting for</b>${picks.map((pick) => {
    const { now } = liveNow(game, pick), price = Number.isFinite(pick.odds) ? ` ${pick.odds > 0 ? `+${pick.odds}` : pick.odds}` : "";
    let state = "", say = "";
    if (now !== null && pick.need !== null) {
      if (pick.under) { state = now > pick.need ? "lost" : ""; say = `${now}, stays under ${pick.need}`; }
      else { const goal = pick.plus ? pick.need : Math.floor(pick.need) + 1; state = now >= goal ? "hit" : ""; say = `${now} of ${goal}`; }
    }
    return `<span class="live-mine-leg ${state}"><i class="who">${liveEsc(pick.who)}</i><i class="prop">${liveEsc(pick.text)}${liveEsc(price)}</i>${say ? `<i class="now" data-k="${liveEsc(`${game.id}|mine|${pick.who}|${pick.text}`)}">${liveEsc(say)}</i>` : ""}</span>`;
  }).join("")}</span>`;
}

function liveGroup(group, key, many, mine) {
  const head = `<tr><th>${liveEsc(many ? group.name : "Player")}</th>${group.labels.map((label) => `<th>${liveEsc(label)}</th>`).join("")}</tr>`;
  const rows = group.rows.map((row) => `<tr class="${row.on ? "on" : ""}${row.starter ? " start" : ""}${mine.has(liveFold(row.name)) ? " mine" : ""}"><td><span class="live-name">${liveEsc(row.name)}</span>${row.pos ? `<span class="live-pos">${liveEsc(row.pos)}</span>` : ""}</td>${row.stats.map((stat, at) => `<td data-k="${liveEsc(`${key}|${row.name}|${group.labels[at] || at}`)}">${liveEsc(stat)}</td>`).join("")}</tr>`).join("");
  return `<div class="live-table" data-slide="${liveEsc(key)}"><table>${head}${rows}</table></div>`;
}

function liveGame(game) {
  const away = Number(game.away.score), home = Number(game.home.score), picks = liveMine(game), mine = new Set(picks.map((pick) => liveFold(pick.who)));
  const teams = (game.teams || []).map((team) => {
    const side = [game.away, game.home].find((row) => row.short === team.short) || {};
    const many = team.groups.length > 1;
    return `<section class="live-team" style="border-left-color: ${liveEsc(side.color || "#3dff6e")}"><h3>${liveEsc(team.name)}</h3>${team.groups.map((group, at) => liveGroup(group, `${game.id}|${team.short}|${at}`, many, mine)).join("")}</section>`;
  }).join("");
  const body = teams || `<p class="live-note">ESPN has not posted player stats for this game yet.</p>`;
  return `<details class="live-game${picks.length ? " has-mine" : ""}" data-id="${liveEsc(game.id)}"${liveOpen.has(game.id) ? " open" : ""}><summary><span class="live-sport">${liveEsc(game.sport)}</span>${liveSide(game.away, away > home, `${game.id}|away`)}<span class="live-at-sign">@</span>${liveSide(game.home, home > away, `${game.id}|home`)}<span class="live-clock">${liveEsc(game.clock)}</span>${game.last ? `<span class="live-last" data-k="${liveEsc(`${game.id}|last`)}">${liveEsc(game.last)}</span>` : ""}${liveRoot(game, picks)}</summary>${body}</details>`;
}

function liveNext(next) {
  if (!next.length) return "";
  return `<h2>Up next</h2><ul class="live-next">${next.map((game) => `<li><span class="live-sport">${liveEsc(game.sport)}</span><b>${liveEsc(game.away.short)} @ ${liveEsc(game.home.short)}</b><i>${liveEsc(liveTime(game.when))}</i></li>`).join("")}</ul>`;
}

function livePaint(data) {
  const box = document.getElementById("live");
  box.querySelectorAll(".live-table[data-slide]").forEach((node) => liveSlide.set(node.dataset.slide, node.scrollLeft));
  const was = new Map([...box.querySelectorAll("[data-k]")].map((node) => [node.dataset.k, node.textContent])), games = new Set([...box.querySelectorAll(".live-game[data-id]")].map((node) => node.dataset.id)), first = !box.querySelector(".live-game, h2");
  const live = data.live || [];
  box.innerHTML = `${live.length ? `<h2>Live now, ${live.length} ${live.length === 1 ? "game" : "games"}</h2>${live.map(liveGame).join("")}` : `<p class="live-note">No games are live right now.</p>`}${liveNext(data.next || [])}`;
  box.querySelectorAll(".live-table[data-slide]").forEach((node) => { const left = liveSlide.get(node.dataset.slide); if (left) node.scrollLeft = left; });
  if (!first) {
    box.querySelectorAll("[data-k]").forEach((node) => { if (was.has(node.dataset.k) && was.get(node.dataset.k) !== node.textContent) node.classList.add("live-flash"); });
    box.querySelectorAll(".live-game[data-id]").forEach((node) => { if (!games.has(node.dataset.id)) node.classList.add("live-flash"); });
  }
  document.getElementById("live-at").textContent = `Updated ${new Date(data.at || Date.now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
}

async function liveLoad() {
  try {
    const [res, mine] = await Promise.all([fetch("/api/live", { credentials: "same-origin" }), fetch("/api/parlays", { credentials: "same-origin" }).then((reply) => (reply.ok ? reply.json() : null)).catch(() => null)]);
    if (res.status === 401) { document.getElementById("live").innerHTML = `<p class="live-note">Sign in on <a href="/">Parlay of the Day</a> to see live games.</p>`; return; }
    if (mine) liveLegs = (mine.parlays || []).flatMap((row) => row.legs || []);
    livePaint(await res.json());
  } catch (error) {
    console.log("[live] could not load", error);
    document.getElementById("live-at").textContent = "Could not reach the live feed. Trying again.";
  }
}

document.addEventListener("toggle", (event) => {
  const game = event.target.closest && event.target.closest(".live-game");
  if (!game) return;
  if (game.open) liveOpen.add(game.dataset.id); else liveOpen.delete(game.dataset.id);
  try { localStorage.setItem("liveOpen", JSON.stringify([...liveOpen].slice(-40))); } catch (error) { console.log("[live] could not keep open games", error); }
}, true);

const liveCourt = document.getElementById("live-court");
liveCourt.checked = localStorage.getItem("liveCourt") === "1";
document.body.classList.toggle("live-court-only", liveCourt.checked);
liveCourt.addEventListener("change", () => {
  document.body.classList.toggle("live-court-only", liveCourt.checked);
  try { localStorage.setItem("liveCourt", liveCourt.checked ? "1" : "0"); } catch (error) { console.log("[live] could not keep on-court choice", error); }
});

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") liveLoad(); });
liveLoad();
setInterval(() => { if (document.visibilityState === "visible") liveLoad(); }, 20000);
