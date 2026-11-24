/** Live tracker page: scores, clocks, and every player's box score line for the games in progress, refreshed every 20 seconds. */

try { sessionStorage.setItem("fromLive", "1"); } catch (error) {}
const liveOpen = new Set((() => { try { return JSON.parse(localStorage.getItem("liveOpen") || "[]"); } catch (error) { return []; } })());
const liveCard = Object.fromEntries(["court", "mine", "off"].map((kind) => [kind, new Set((() => { try { return JSON.parse(localStorage.getItem(`liveCard-${kind}`) || "[]"); } catch (error) { return []; } })())]));
const liveCardClass = { court: "live-court-only", mine: "live-mine-only", off: "live-off-only" };
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

const LIVE_KIND = { safe: ["Safe", "Picked to hit. Judged by how often it wins."], balanced: ["Balanced", "Near even money. Judged by wins and dollars both."], payout: ["Payout", "Picked for the price. Judged by the dollars it makes over many bets."] };
const LIVE_BASIS = { math: ["Math", "His record beats the price."], script: ["Script", "The game script points to it."], both: ["Math + script", "His record beats the price and the game script points to it."] };
const liveKindOf = (odds) => (Number(odds) <= -150 ? "safe" : Number(odds) <= 100 ? "balanced" : "payout");

function liveKindTag(pick) {
  const kind = LIVE_KIND[pick.kind || liveKindOf(pick.odds)], basis = LIVE_BASIS[pick.basis];
  if (pick.tier === "good") return `<i class="bet-kind k-good" title="${liveEsc(`The record clears the price, but ${pick.drop || "it misses a rule"}. It stays off the recommended record.`)}">Good bet</i>`;
  return `<i class="bet-kind k-${pick.kind || liveKindOf(pick.odds)}" title="${liveEsc(`${kind[1]}${basis ? ` ${basis[1]}` : ""}`)}">${liveEsc(`${kind[0]}${basis ? ` · ${basis[0]}` : ""}`)}</i>`;
}

function liveRoleTag(pick) {
  if (!pick || (pick.role !== "solid" && pick.role !== "thin")) return "";
  const solid = pick.role === "solid";
  const tip = solid ? "His minutes and role look locked in." : "His minutes are thin, so the opportunity can vanish.";
  return `<i class="bet-kind k-role-${solid ? "solid" : "thin"}" title="${liveEsc(tip)}">${solid ? "Steady role" : "Thin role"}</i>`;
}

function liveCushionTag(pick) {
  if (!pick || !pick.cushion) return "";
  const n1 = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
  };
  const avg = Number(pick.avg), line = Number(pick.reach), room = Number(pick.cushionRoom), pct = Number(pick.cushionPct);
  const tip = [avg, line, room, pct].every(Number.isFinite)
    ? `Cushion: averages ${n1(avg)} vs line ${n1(line)} (+${n1(room)}, ${Math.round(pct * 100)}%). Soft night can still cash.`
    : "Cushion: he has room above the line, so a soft night can still cash.";
  return `<i class="bet-kind k-cushion" title="${liveEsc(tip)}">Cushion</i>`;
}

function liveTags(pick) {
  if (!pick) return "";
  return `${liveKindTag(pick)}${liveRoleTag(pick)}${liveCushionTag(pick)}`;
}

function liveRecTwin(game, pick) {
  const rows = liveMine(game, liveRecs);
  return rows.find((row) => row.label === pick.label && String(row.market || "") === String(pick.market || ""))
    || rows.find((row) => liveFold(row.who) === liveFold(pick.who) && row.text === pick.text)
    || null;
}

function liveRoot(game, picks, rec, show) {
  if (!picks.length) return "";
  const one = (pick) => {
    const price = Number.isFinite(pick.odds) ? ` ${pick.odds > 0 ? `+${pick.odds}` : pick.odds}` : "";
    const { state, say, level, tip } = liveLegState(game, pick);
    const inner = `<i class="who">${liveEsc(pick.who)}</i><i class="prop">${liveEsc(pick.text)}${liveEsc(price)}</i>${liveTags(rec ? pick : liveRecTwin(game, pick))}${say ? `<i class="now${level ? ` pace-${level}` : ""}"${tip ? ` title="${liveEsc(tip)}"` : ""} data-k="${liveEsc(`${game.id}|${rec ? "rec" : "mine"}|${pick.who}|${pick.text}`)}">${liveEsc(say)}</i>` : ""}`;
    const href = `/?${new URLSearchParams({ game: pick.match, ...(pick.parlay ? { bet: pick.parlay } : {}), label: pick.label, market: pick.market, from: "live" })}`;
    return `<a class="live-mine-leg ${state}${rec || pick.locked ? "" : " live-open"}" href="${liveEsc(href)}" title="Open this bet in Build a bet">${inner}</a>`;
  };
  const groups = [];
  picks.forEach((pick) => { const group = !rec && pick.parlay && groups.find((row) => row.id === pick.parlay); if (group) group.picks.push(pick); else groups.push({ id: pick.parlay, picks: [pick] }); });
  const body = groups.map((group) => { if (group.picks.length < 2) return one(group.picks[0]); const head = liveParlayHead(group.id, group.picks[0].size); const open = !rec && group.picks.every((pick) => !pick.locked); return `<span class="live-parlay${open ? " live-open" : ""}${head.level ? ` pace-${head.level}` : ""}"><em>${liveEsc(head.text)}</em>${group.picks.map(one).join("")}</span>`; }).join("");
  return `<span class="live-mine${rec ? " live-rec" : ""}${show ? " live-rec-show" : ""}"><b>${rec ? "Recommended" : "Rooting for"}</b>${body}</span>`;
}

function liveHurt(game) {
  const hurt = game.hurt || [];
  if (!hurt.length) return "";
  const starters = new Set((game.teams || []).flatMap((team) => team.groups.flatMap((group) => group.rows.filter((row) => row.starter).map((row) => liveFold(row.name)))));
  return `<span class="live-hurt"><b>Injured</b>${hurt.map((one) => `<i title="${liveEsc(one.head)}"><em>${liveEsc(one.name)}</em> ${liveEsc([one.team, starters.has(liveFold(one.name)) ? "starter" : "", one.part.toLowerCase(), one.out ? "ruled out" : one.status].filter(Boolean).join(" · "))}</i>`).join("")}</span>`;
}

function liveRecPicks(game, picks) {
  const mine = new Set(picks.map((pick) => `${liveFold(pick.who)}|${pick.text}`));
  return liveMine(game, liveRecs).filter((pick) => !mine.has(`${liveFold(pick.who)}|${pick.text}`));
}

function liveRecRow(game, picks, show) {
  return liveRoot(game, liveRecPicks(game, picks), true, show);
}

function liveOff(name) {
  return /passing|rushing|receiving/i.test(name);
}

function liveGroup(group, key, many, mine, recs, known) {
  const head = `<tr><th>${liveEsc(many ? group.name : "Player")}</th>${group.labels.map((label) => `<th>${liveEsc(label)}</th>`).join("")}</tr>`;
  const rows = group.rows.map((row) => { const bet = mine.has(liveFold(row.name)), star = bet ? `<svg class="live-star" viewBox="0 0 16 16" width="8" height="8" aria-label="In my bets"><path fill="#e7c15a" d="M8 1.2 9.8 4.9l4.1.6-3 2.9.7 4.1L8 10.6 4.4 12.5l.7-4.1-3-2.9 4.1-.6z"/></svg>` : ""; return `<tr class="${row.on ? "on" : known ? "" : "all"}${row.starter ? " start" : ""}${bet ? " mine" : recs.has(liveFold(row.name)) ? " rec" : ""}"><td><button type="button" class="live-name" data-who="${liveEsc(row.name)}">${liveEsc(row.name)}</button>${row.pos ? `<span class="live-pos">${liveEsc(row.pos)}</span>` : ""}${star}</td>${row.stats.map((stat, at) => `<td data-k="${liveEsc(`${key}|${row.name}|${group.labels[at] || at}`)}">${liveEsc(stat)}</td>`).join("")}</tr>`; }).join("");
  return `<div class="live-table" data-slide="${liveEsc(key)}"${liveOff(group.name) ? ` data-side="off"` : ""}><table>${head}${rows}</table></div>`;
}

function liveGame(game) {
  const away = Number(game.away.score), home = Number(game.home.score), picks = liveMine(game), mine = new Set(picks.map((pick) => liveFold(pick.who))), recs = new Set(liveMine(game, liveRecs).map((pick) => liveFold(pick.who)));
  const known = !game.final && (game.teams || []).some((team) => team.groups.some((group) => group.rows.some((row) => row.on)));
  const teams = (game.teams || []).map((team) => {
    const side = [game.away, game.home].find((row) => row.short === team.short) || {};
    const many = team.groups.length > 1;
    return `<section class="live-team" style="border-left-color: ${liveEsc(side.color || "#3dff6e")}"><h3>${liveEsc(team.name)}</h3>${team.groups.map((group, at) => liveGroup(group, `${game.id}|${team.short}|${at}`, many, mine, recs, known)).join("")}</section>`;
  }).join("");
  const groups = (game.teams || []).flatMap((team) => team.groups || []);
  const split = groups.some((group) => liveOff(group.name)) && groups.some((group) => !liveOff(group.name));
  const box = (kind, say) => `<label class="live-court"><input type="checkbox" data-card="${kind}"${liveCard[kind].has(game.id) ? " checked" : ""}/> ${say}</label>`;
  const bar = teams && (known || picks.length || split) ? `<p class="live-card-bar">${known ? box("court", "In play") : ""}${picks.length ? box("mine", "Only players in my bets") : ""}${split ? box("off", "Offense only") : ""}</p>` : "";
  const body = teams ? `${bar}${teams}` : `<p class="live-note">ESPN has not posted player stats for this game yet.</p>`;
  const match = (liveMine(game, liveRecs)[0] || {}).match || `${game.away.name} @ ${game.home.name}`;
  const page = `/?${new URLSearchParams({ game: match, sport: game.sport, from: "live", ...(game.when ? { kick: game.when } : {}), ...(game.id ? { espn: game.id } : {}) })}`;
  return `<details class="live-game${picks.length ? " has-mine" : ""}${game.final ? " live-final" : ""}${known && liveCard.court.has(game.id) ? " live-court-only" : ""}${picks.length && liveCard.mine.has(game.id) ? " live-mine-only" : ""}${split && liveCard.off.has(game.id) ? " live-off-only" : ""}" data-id="${liveEsc(game.id)}" data-sport="${liveEsc(game.sport)}" data-match="${liveEsc(match)}"${liveZoom > 1 && liveOpen.has(game.id) ? " open" : ""}><summary><span class="live-sport">${liveEsc(game.sport)}</span>${liveSide(game.away, away > home, `${game.id}|away`)}<span class="live-at-sign">@</span>${liveSide(game.home, home > away, `${game.id}|home`)}<span class="live-clock">${liveEsc(game.clock)}</span>${game.last ? `<span class="live-last" data-k="${liveEsc(`${game.id}|last`)}">${liveEsc(game.last)}</span>` : ""}${liveHurt(game)}${liveRoot(game, picks)}${liveRecRow(game, picks)}<a class="live-open" href="${liveEsc(page)}">Open Game Page</a><button type="button" class="live-stats" aria-label="Live stats"></button>${liveCardSlider()}</summary>${body}</details>`;
}

function liveNext(next) {
  if (!next.length) return "";
  return `<h2>Up next today</h2><ul class="live-next">${next.map((game) => `<li class="${liveHasMine(game) ? "has-mine" : ""}"><span class="live-sport">${liveEsc(game.sport)}</span><b>${liveEsc(game.away.short)} @ ${liveEsc(game.home.short)}</b><i>${liveEsc(liveTime(game.when))}</i>${liveRoot(game, liveMine(game))}${liveRecRow(game, liveMine(game))}</li>`).join("")}</ul>`;
}

function liveHistLabel(pick) {
  const label = String(pick.label || "").replace(/\s+-\s+/, " "), market = String(pick.market || ""), stat = (market.match(/\s-\s(?:Alt\s+)?(.+)$/) || [])[1];
  if (!/\d/.test(label)) return `${label} ${market}`;
  if (/\b(Over|Under)\s+[\d.]+$/i.test(label) && stat) return `${label} ${stat}`;
  return label;
}

function liveHistory(rows, today) {
  const keep = rows || [];
  if (!keep.length) return "";
  const picks = keep.flatMap((row) => row.picks || []), won = picks.filter((pick) => pick.result === "won").length, lost = picks.filter((pick) => pick.result === "lost").length;
  const pay = (odds) => (odds > 0 ? odds / 100 : 100 / Math.abs(odds)) * 5;
  const net = picks.reduce((sum, pick) => sum + (pick.result === "won" ? pay(Number(pick.odds)) : pick.result === "lost" ? -5 : 0), 0);
  const price = (odds) => (Number(odds) > 0 ? `+${Number(odds)}` : String(odds));
  const mark = { won: "✓", lost: "✗", void: "–" };
  const games = keep.map((row) => {
    const day = new Date(Date.parse(row.kickoff)).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
    const tally = (row.picks || []).filter((pick) => pick.result === "won").length, done = (row.picks || []).filter((pick) => pick.result !== "void").length;
    const review = row.review, open = (key) => (liveHistOpen.has(key) ? " open" : ""), check = { held: "✓", miss: "✗", odd: "!" };
    const told = review && (review.script || review.checks) ? `<details class="live-hist-review" data-hk="r:${liveEsc(row.id)}"${open(`r:${row.id}`)}><summary>${liveEsc(review.verdict || "Game script vs what happened")}</summary>${(review.script || []).length ? `<p class="live-hist-sub">The script going in</p><p>${liveEsc(review.script.join(" "))}</p>` : ""}${(review.checks || []).length ? `<p class="live-hist-sub">What happened</p><ul>${review.checks.map((one) => `<li class="${liveEsc(one.kind)}"><b>${check[one.kind] || ""}</b><span>${liveEsc(one.text)}</span></li>`).join("")}</ul>` : ""}${(review.went || []).length ? `<p class="live-hist-sub">The box score</p><ul>${review.went.map((line) => `<li><span>${liveEsc(line)}</span></li>`).join("")}</ul>` : ""}</details>` : "";
    const line = (pick) => `<b>${mark[pick.result] || ""}</b><span>${liveEsc(liveHistLabel(pick))}</span><i>${liveEsc(price(pick.odds))}</i>${Number.isFinite(pick.got) ? `<em>had ${liveEsc(pick.got)}${Number.isFinite(pick.bar) ? `, needed ${liveEsc(pick.bar)}${pick.under ? " or fewer" : ""}` : ""}</em>` : ""}${pick.close ? `<span class="live-close">${liveEsc(pick.short)} short</span>` : ""}`;
    const rows = (row.picks || []).map((pick) => { const key = `p:${row.id}|${pick.label}|${pick.market}`; return `<li class="${liveEsc(pick.result || "")}${pick.close ? " close" : ""}">${pick.why ? `<details data-hk="${liveEsc(key)}"${open(key)}><summary>${line(pick)}</summary><p class="live-hist-why">${liveEsc(pick.why)}</p></details>` : line(pick)}</li>`; }).join("");
    return `<div class="live-hist"><h3><span>${liveEsc(day)}</span> ${liveEsc(row.match)}${review && review.final ? `<em>${liveEsc(review.final)}</em>` : ""}<b>${tally} of ${done}</b></h3>${told}<ul>${rows}</ul></div>`;
  }).join("");
  const near = picks.filter((pick) => pick.close).length;
  const body = `<p class="live-note">$5 on every one: ${net < 0 ? "-" : "+"}$${Math.abs(net).toFixed(2)}.${near ? ` ${near} of the ${lost} losses came up 1 or 2 short. A lower line on those would have hit.` : ""}</p>${games}`;
  if (today) return `<details class="live-today-box" data-hk="today"${liveHistOpen.has("today") ? " open" : ""}><summary><h2>Today's recommended bets, ${won} of ${won + lost} won</h2><span class="live-today-hint">Tap to see the game recaps</span></summary>${body}</details>`;
  return `<h2 id="live-history">Recommended bets, ${won} of ${won + lost} won</h2>${body}`;
}

const liveLeagues = new Set((() => { try { return JSON.parse(localStorage.getItem("liveLeagues") || "[]"); } catch (error) { return []; } })());
const LIVE_WHEN = [["done", "Finished Today"], ["live", "Live"], ["next", "Upcoming Today"], ["tomorrow", "Tomorrow"], ["week", "This Week"]];
const liveAsked = new URLSearchParams(location.search).get("span");
const liveSaved = (() => { try { return localStorage.getItem("liveSpan") || ""; } catch (error) { return ""; } })();
const liveSpanAlias = { past: "done", today: "", week: "week" };
let liveLast = null, liveSpan = LIVE_WHEN.some(([id]) => id === (liveAsked || liveSaved)) ? (liveAsked || liveSaved) : (liveSpanAlias[liveAsked || liveSaved] || ""), liveSpanHeld = Boolean(liveSpan), liveSpanChosen = liveSpanHeld, liveFiltersOpen = false;
if (liveAsked && !new URLSearchParams(location.search).get("game")) history.replaceState(null, "", location.pathname);
const liveRecOpen = new Set(), liveHistOpen = new Set();
document.addEventListener("toggle", (event) => { const key = event.target.dataset && event.target.dataset.hk; if (key) { if (event.target.open) liveHistOpen.add(key); else liveHistOpen.delete(key); } }, true);

function liveLeagueBar(data, count) {
  const order = ["NBA", "NFL", "NHL", "MLB", "WNBA", "PGA"], have = new Set([...(data.live || []), ...(data.done || []), ...(data.next || []), ...(data.week || [])].map((game) => game.sport));
  const leagues = order.filter((sport) => have.has(sport) || liveLeagues.has(sport));
  const chips = leagues.length < 2 && !liveLeagues.size ? "" : `<button type="button" data-league="" class="${liveLeagues.size ? "" : "on"}">All</button>${leagues.map((sport) => `<button type="button" data-league="${liveEsc(sport)}" class="${liveLeagues.has(sport) ? "on" : ""}">${liveEsc(sport)}</button>`).join("")}`;
  const games = (n) => `${n} ${n === 1 ? "game" : "games"}`;
  const go = LIVE_WHEN.map(([key, label]) => `<button type="button" class="${liveSpan === key ? " on" : ""}" data-week="${key}">${label}, ${games(count[key] || 0)}</button>`).join("");
  return chips || go ? `<div class="live-leagues">${chips}${go}</div>` : "";
}

const LIVE_ZOOM_MAX = 5;
let liveZoom = (() => {
  try {
    const n = Number(localStorage.getItem("liveZoom"));
    if (!Number.isFinite(n)) return LIVE_ZOOM_MAX;
    const scale = localStorage.getItem("liveZoomScale");
    let next = Math.max(0, Math.min(5, Math.round(n)));
    if (scale !== "7") {
      if (scale !== "5") {
        const old = Math.max(0, Math.min(scale === "6" ? 5 : 7, Math.round(n)));
        next = scale === "6"
          ? (old <= 1 ? 0 : old - 1)
          : (old <= 1 ? 0 : old <= 4 ? 1 : old - 3);
      }
      if (next >= 3) next += 1;
      next = Math.max(0, Math.min(LIVE_ZOOM_MAX, next));
      localStorage.setItem("liveZoomScale", "7");
      localStorage.setItem("liveZoom", String(next));
    }
    return Math.max(0, Math.min(LIVE_ZOOM_MAX, next));
  } catch (error) {}
  return LIVE_ZOOM_MAX;
})();

let liveZoomDrag = false;

function livePack(html) {
  return html ? `<div class="live-pack">${html}</div>` : "";
}

function liveZoomApply(next, opts) {
  const quiet = !!(opts && opts.quiet);
  liveZoom = Math.max(0, Math.min(LIVE_ZOOM_MAX, Math.round(Number(next) || 0)));
  document.body.dataset.liveZoom = String(liveZoom);
  const mine = liveZoom >= 2, all = liveZoom >= 3, recs = liveZoom >= 4;
  document.body.classList.toggle("live-mine-off", !mine);
  document.body.classList.toggle("live-all-bets", all);
  document.body.classList.toggle("live-recs-on", recs);
  if (opts && opts.master) {
    liveCardZoom.clear();
    document.querySelectorAll(".live-game[data-card-zoom]").forEach((game) => { delete game.dataset.cardZoom; });
  }
  if (liveZoom <= 1) {
    document.querySelectorAll(".live-game[open]").forEach((game) => {
      game.open = false;
      if (game.dataset.id) liveOpen.delete(game.dataset.id);
    });
    try { localStorage.setItem("liveOpen", JSON.stringify([...liveOpen].slice(-40))); } catch (error) {}
  }
  // While dragging, leave the thumb where the finger is — rewriting value makes it choppy.
  if (!quiet && !liveZoomDrag) {
    document.querySelectorAll("input.live-zoom-range").forEach((box) => { box.value = String(liveZoom); });
  }
  try {
    localStorage.setItem("liveZoom", String(liveZoom));
    localStorage.setItem("liveRecs", recs ? "1" : "0");
  } catch (error) { console.log("[live] could not keep the detail slider", error); }
}

let liveOnlyMine = false;
try { liveOnlyMine = localStorage.getItem("liveOnlyMine") === "1"; } catch (error) {}

function liveCardSlider() {
  return `<label class="live-zoom live-card-zoom"><span>Less</span><input type="range" class="live-card-range" min="0" max="${LIVE_ZOOM_MAX}" step="any" value="${liveZoom}" aria-valuemin="0" aria-valuemax="${LIVE_ZOOM_MAX}" aria-valuenow="${liveZoom}" aria-label="Show more or less on this game"/><span>More</span></label>`;
}

function liveFilterBits() {
  const names = [...liveLeagues];
  const bits = [];
  if (names.length === 1 && liveSpan === "live") bits.push(`Live ${names[0]}`);
  else if (names.length === 1 && liveSpan === "next") bits.push(`Upcoming ${names[0]} today`);
  else if (names.length === 1 && liveSpan === "tomorrow") bits.push(`${names[0]} tomorrow`);
  else if (names.length === 1 && liveSpan === "week") bits.push(`${names[0]} this week`);
  else if (names.length === 1 && liveSpan === "done") bits.push(`${names[0]} that finished today`);
  else {
    if (liveSpan === "live") bits.push("Live");
    else if (liveSpan === "tomorrow") bits.push("Tomorrow");
    else if (liveSpan === "week") bits.push("This week");
    else if (liveSpan === "done") bits.push("Finished today");
    else bits.push("Upcoming today");
    if (names.length > 1) bits.push(names.join(" and "));
    else if (!names.length) bits.push("All leagues");
  }
  bits.push(liveOnlyMine ? "Only your bets" : "All games");
  return bits;
}

let liveBetN = 0;
function liveNav() {
  return `<nav class="live-nav"><a href="/build">Build a bet</a><a href="/history">History</a><a href="/bets">My Bets <b>${liveBetN}</b></a><a href="/recommended">Recommended</a></nav>`;
}
fetch("/api/parlays", { credentials: "same-origin" }).then((res) => res.ok ? res.json() : null).then((data) => {
  liveBetN = data && Array.isArray(data.parlays) ? data.parlays.length : 0;
  const badge = document.querySelector(".live-nav b");
  if (badge) badge.textContent = String(liveBetN);
}).catch(() => {});

function liveFilterBar(bar, filters) {
  const bits = liveFilterBits();
  const clear = liveLeagues.size || liveOnlyMine || liveSpanChosen ? ` <button type="button" data-live-clear>Clear</button>` : "";
  const say = `<p class="live-filter-say">${liveEsc(bits.join(". "))}.${clear}</p>`;
  return `${say}<details class="live-filter-fold"${liveFiltersOpen ? " open" : ""}><summary>Filters</summary>${bar}${filters}</details>${liveZoomBar()}`;
}

function liveFiltersClear() {
  liveLeagues.clear();
  liveOnlyMine = false;
  liveSpan = "";
  liveSpanHeld = false;
  liveSpanChosen = false;
  try {
    localStorage.removeItem("liveSpan");
    localStorage.setItem("liveLeagues", "[]");
    localStorage.setItem("liveOnlyMine", "0");
  } catch (error) {}
  if (liveLast) livePaint(liveLast, true);
}

function liveZoomBar() {
  return `<p class="live-filters live-zoom-bar"><label class="live-zoom"><span>Less</span><input type="range" class="live-zoom-range" min="0" max="${LIVE_ZOOM_MAX}" step="any" value="${liveZoom}" aria-valuemin="0" aria-valuemax="${LIVE_ZOOM_MAX}" aria-valuenow="${liveZoom}" aria-label="Show more or less on each game"/><span>More</span></label></p>`;
}

function liveFilters() {
  const mine = liveOnlyMine ? " checked" : "";
  return `<p class="live-filters"><label class="live-court"><input type="checkbox" class="live-mine-box"${mine}/> Show only my bets</label></p>`;
}

const liveDayKey = (when) => new Date(when).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function liveSoonCard(game) {
  const kick = Date.parse(game.kickoff), liveNow = game.sport === "PGA" && Number.isFinite(kick) && kick <= Date.now();
  const day = liveNow ? "Live" : `${new Date(kick).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
  const like = { id: `${game.match}|${game.kickoff}`, away: game.away || { name: game.awayName }, home: game.home || { name: game.homeName }, when: game.kickoff }, picks = liveMine(like), recs = liveRecPicks(like, picks).length, open = liveRecOpen.has(like.id);
  const tag = recs ? `<button type="button" class="live-rec-tag${open ? " on" : ""}" data-rec-open="${liveEsc(like.id)}" aria-label="${recs} recommended" title="${recs} recommended"><img src="/scene/parrot-head-tight.webp?v=1" alt=""><b>${recs}</b></button>` : "";
  const until = liveNow ? "" : (typeof gameUntilText === "function" ? gameUntilText(game.kickoff) : "");
  const meta = `<span class="live-meta">${game.total ? `<span class="live-total">O/U ${liveEsc(game.total)}</span>` : ""}${until ? `<span class="find-until live-until" data-kick="${liveEsc(game.kickoff)}">${liveEsc(until)}</span>` : ""}${game.lines ? `<span class="live-lines">${liveEsc(game.lines)}</span>` : ""}<a class="live-week-game" href="/?${liveEsc(new URLSearchParams({ game: game.match, from: "live" }).toString())}" title="Open this game in Build a bet">Build a bet ›</a></span>`;
  const sides = game.sport === "PGA" ? `<span class="live-side"><b>${liveEsc(game.match || "")}</b></span>` : `${liveSide(like.away, false, `${like.id}|away`)}<span class="live-at-sign">@</span>${liveSide(like.home, false, `${like.id}|home`)}`;
  return `<div class="live-game live-soon${liveNow ? " live-pga-on" : ""}${picks.length ? " has-mine" : ""}" data-id="${liveEsc(like.id)}"><div class="live-head"><span class="live-sport">${liveEsc(game.sport)}</span>${sides}<span class="live-clock live-when">${liveEsc(day)}</span>${tag}${meta}${liveRoot(like, picks)}${liveRecRow(like, picks, open)}${liveCardSlider()}</div></div>`;
}

function liveWeekList(week) {
  if (liveSpan !== "week" || !week.length) return "";
  return `<h2>This week, ${week.length} ${week.length === 1 ? "game" : "games"}</h2>${livePack(week.map(liveSoonCard).join(""))}`;
}

function liveHasMine(game) {
  const like = {
    id: game.id || `${game.match || ""}|${game.kickoff || game.when || ""}`,
    away: game.away || { name: game.awayName },
    home: game.home || { name: game.homeName },
    when: game.when || game.kickoff,
  };
  return liveMine(like).length > 0;
}

function liveOnly(list) {
  return liveOnlyMine ? (list || []).filter(liveHasMine) : (list || []);
}

function livePaint(data, quiet) {
  liveLast = data;
  liveParlayTally([...(data.live || []), ...(data.done || [])]);
  const box = document.getElementById("live");
  box.querySelectorAll(".live-table[data-slide]").forEach((node) => liveSlide.set(node.dataset.slide, node.scrollLeft));
  const was = new Map([...box.querySelectorAll("[data-k]")].map((node) => [node.dataset.k, node.textContent])), games = new Set([...box.querySelectorAll(".live-game[data-id]")].map((node) => node.dataset.id)), first = quiet || !box.querySelector(".live-game, h2");
  const keep = (game) => !liveLeagues.size || liveLeagues.has(game.sport);
  const liveAll = (data.live || []).filter(keep), doneAll = (data.done || []).filter(keep);
  const board = (data.week || []).filter(keep), today = liveDayKey(Date.now()), tomorrowKey = liveDayKey(Date.now() + 24 * 60 * 60 * 1000);
  const pgaOn = (game) => game.sport === "PGA" && Date.parse(game.kickoff) <= Date.now();
  const pgaAll = board.filter((game) => pgaOn(game) && liveDayKey(game.kickoff) === today);
  const soonAll = board.filter((game) => liveDayKey(game.kickoff) === today && Date.parse(game.kickoff) > Date.now());
  const nextAll = (data.week || []).length ? [] : (data.next || []).filter(keep);
  const endedAll = doneAll.filter((game) => liveDayKey(game.when) === today);
  const tomorrowAll = board.filter((game) => !pgaOn(game) && liveDayKey(game.kickoff) === tomorrowKey);
  const laterAll = board.filter((game) => !pgaOn(game) && liveDayKey(game.kickoff) > tomorrowKey);
  const live = liveOnly(liveAll), pgaLive = liveOnly(pgaAll), soon = liveOnly(soonAll), ended = liveOnly(endedAll), tomorrow = liveOnly(tomorrowAll), later = liveOnly(laterAll);
  const upcoming = (data.week || []).length ? soon : liveOnly(nextAll);
  const none = `<p class="live-note">None of these games are in your bets.</p>`;
  const say = (n) => `${n} ${n === 1 ? "game" : "games"}`;
  const empty = (mine, all, text) => (mine && all.length ? none : `<p class="live-note">${text}</p>`);
  const final = (day, list) => list.length ? `<h2>Finished ${day}, ${say(list.length)}</h2>${livePack(list.map(liveGame).join(""))}` : "";
  const hist = ((data.tally || {}).history || []);
  const liveCount = live.length + pgaLive.length;
  if (!liveSpanHeld) {
    const liveN = liveAll.length + pgaAll.length, nextN = (data.week || []).length ? soonAll.length : nextAll.length;
    liveSpan = liveN ? "live" : nextN ? "next" : endedAll.length ? "done" : tomorrowAll.length ? "tomorrow" : "week";
    liveSpanHeld = true;
  }
  const bar = liveLeagueBar(data, { done: endedAll.length, live: liveAll.length + pgaAll.length, next: (data.week || []).length ? soonAll.length : nextAll.length, tomorrow: tomorrowAll.length, week: laterAll.length });
  const filters = liveFilters();
  const recap = liveOnlyMine ? "" : `<div class="live-today-recap">${liveHistory(hist.filter((row) => liveDayKey(row.kickoff) === today), true)}</div>`;
  const liveBody = liveCount ? `<h2>Live now, ${say(liveCount)}</h2>${livePack(live.map(liveGame).join("") + pgaLive.map(liveSoonCard).join(""))}` : empty(liveOnlyMine, liveAll.concat(pgaAll), "No games are live right now.");
  const nextBody = upcoming.length ? `<h2>Upcoming today, ${say(upcoming.length)}</h2>${livePack(upcoming.map(liveSoonCard).join(""))}` : empty(liveOnlyMine, (data.week || []).length ? soonAll : nextAll, "No games left today.");
  const doneBody = `${final("today", ended)}${recap}` || empty(liveOnlyMine, endedAll, "No games have finished today.");
  const tomorrowBody = tomorrow.length ? `<h2>Tomorrow, ${say(tomorrow.length)}</h2>${livePack(tomorrow.map(liveSoonCard).join(""))}` : empty(liveOnlyMine, tomorrowAll, "No games tomorrow.");
  const weekBody = later.length ? `<h2>This week, ${say(later.length)}</h2>${livePack(later.map(liveSoonCard).join(""))}` : empty(liveOnlyMine, laterAll, "No games the rest of this week.");
  const body = { done: doneBody, live: liveBody, next: nextBody, tomorrow: tomorrowBody, week: weekBody }[liveSpan] || liveBody;
  box.innerHTML = `${liveFilterBar(bar, filters)}${body}`;
  box.querySelectorAll("input.live-zoom-range, input.live-card-range").forEach((node) => { if (typeof rowSlide === "function") rowSlide(node); });
  box.querySelectorAll(".live-table[data-slide]").forEach((node) => { const left = liveSlide.get(node.dataset.slide); if (left) node.scrollLeft = left; });
  if (!first) {
    box.querySelectorAll("[data-k]").forEach((node) => { if (was.has(node.dataset.k) && was.get(node.dataset.k) !== node.textContent) node.classList.add("live-flash"); });
    box.querySelectorAll(".live-game[data-id]:not(.live-final)").forEach((node) => { if (!games.has(node.dataset.id)) node.classList.add("live-flash"); });
  }
  box.querySelectorAll(".live-game[data-id]").forEach((node) => {
    const level = liveCardZoom.get(node.dataset.id);
    if (level == null) return;
    node.dataset.cardZoom = String(level);
    const range = node.querySelector("input.live-card-range");
    if (range) { range.value = String(level); range.setAttribute("aria-valuenow", String(level)); }
  });
  document.getElementById("live-at").textContent = `Updated ${new Date(data.at || Date.now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  liveWhoPlace();
}

const liveCardZoom = new Map();

function liveZoomLift(game) {
  const id = game && game.dataset.id;
  if (!id) return;
  if (liveCardZoom.has(id)) { liveCardZoom.delete(id); delete game.dataset.cardZoom; return; }
  const level = Math.min(LIVE_ZOOM_MAX, liveZoom + 1);
  if (level === liveZoom) return;
  liveCardZoom.set(id, level);
  game.dataset.cardZoom = String(level);
  const range = game.querySelector("input.live-card-range");
  if (range) { range.value = String(level); range.setAttribute("aria-valuenow", String(level)); }
}

function liveCardMove(game, box) {
  if (!game || !box) return;
  const level = Math.max(0, Math.min(LIVE_ZOOM_MAX, Math.round(Number(box.value) || 0)));
  box.setAttribute("aria-valuenow", String(level));
  game.dataset.cardZoom = String(level);
  if (game.dataset.id) liveCardZoom.set(game.dataset.id, level);
}

function liveCardSnap(game, box) {
  if (!game || !box) return;
  const level = Math.max(0, Math.min(LIVE_ZOOM_MAX, Math.round(Number(box.value) || 0)));
  box.value = String(level);
  box.setAttribute("aria-valuenow", String(level));
  if (level === liveZoom) { if (game.dataset.id) liveCardZoom.delete(game.dataset.id); delete game.dataset.cardZoom; return; }
  if (game.dataset.id) liveCardZoom.set(game.dataset.id, level);
  game.dataset.cardZoom = String(level);
}

const liveWhoOpen = new Set();
const liveWhoCache = new Map();

function liveWhoId(game, name) {
  return `${game}|${liveFold(name)}`;
}

function liveWhoHtml(data) {
  if (!data || (!data.line && !(data.stats || []).length && !data.span)) return `<p class="span">No history for this player yet.</p>`;
  const stats = (data.stats || []).map((stat) => `<span><b>${liveEsc(stat.label)}</b>${liveEsc(stat.value || "")}</span>`).join("");
  return `${data.line ? `<p>${liveEsc(data.line)}</p>` : ""}${data.span ? `<p class="span">${liveEsc(data.span)}</p>` : ""}${stats ? `<div class="log">${stats}</div>` : ""}`;
}

function liveWhoShow(button) {
  const game = button.closest(".live-game");
  const row = button.closest("tr");
  if (!game || !row || row.nextElementSibling && row.nextElementSibling.classList.contains("live-player-row")) return;
  const key = `${game.dataset.sport}|${liveFold(button.dataset.who)}`;
  const hold = document.createElement("tr");
  hold.className = `${row.className} live-player-row`.trim();
  const cell = document.createElement("td");
  cell.colSpan = row.children.length;
  const box = document.createElement("div");
  box.className = "live-player-hist";
  box.innerHTML = liveWhoCache.has(key) ? liveWhoHtml(liveWhoCache.get(key)) : `<p class="span">Reading the history.</p>`;
  cell.append(box);
  hold.append(cell);
  row.classList.add("live-open");
  row.after(hold);
  if (liveWhoCache.has(key) || liveWhoCache.has(`${key}|wait`)) return;
  liveWhoCache.set(`${key}|wait`, 1);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ list: "card", name: button.dataset.who, sport: game.dataset.sport }) }).then((res) => res.json()).then((data) => {
    liveWhoCache.set(key, data || {});
    liveWhoCache.delete(`${key}|wait`);
    document.querySelectorAll("button.live-name").forEach((node) => {
      const card = node.closest(".live-game");
      if (!card || `${card.dataset.sport}|${liveFold(node.dataset.who)}` !== key) return;
      const next = node.closest("tr") && node.closest("tr").nextElementSibling;
      const hist = next && next.querySelector(".live-player-hist");
      if (hist) hist.innerHTML = liveWhoHtml(data);
    });
  }).catch(() => { liveWhoCache.delete(`${key}|wait`); if (box.isConnected) box.innerHTML = `<p class="span">The history did not load.</p>`; });
}

function liveWhoPlace() {
  document.querySelectorAll("button.live-name").forEach((button) => {
    const game = button.closest(".live-game");
    if (game && liveWhoOpen.has(liveWhoId(game.dataset.id, button.dataset.who))) liveWhoShow(button);
  });
}

let liveFocusId = new URLSearchParams(location.search).get("game") || "";

function liveFocus(data) {
  if (!liveFocusId) return;
  const id = liveFocusId, find = () => document.querySelector(`.live-game[data-id="${CSS.escape(id)}"]`);
  liveFocusId = "";
  history.replaceState(null, "", location.pathname);
  if (!find()) { liveSpanHeld = true; ["live", "next", "done", "tomorrow", "week"].some((span) => { if (liveSpan === span) return false; liveSpan = span; livePaint(data, true); return find(); }); }
  if (!find() && liveLeagues.size) { liveLeagues.clear(); livePaint(data, true); }
  const game = find();
  if (!game) return;
  game.open = true;
  game.scrollIntoView({ block: "start", behavior: "smooth" });
}

let liveLoading = null;

function liveLegsFrom(mine) {
  liveLegs = (mine.parlays || []).flatMap((row) => (row.legs || []).map((leg) => ({ ...leg, parlay: row.id, parlaySize: (row.legs || []).length, locked: !!row.locked })));
}

async function liveLoad() {
  if (liveLoading) return liveLoading;
  liveLoading = liveFetch().finally(() => { liveLoading = null; });
  return liveLoading;
}

async function liveFetch(again) {
  const legsJob = fetch("/api/parlays", { credentials: "same-origin", signal: AbortSignal.timeout(8000) }).then((reply) => (reply.ok ? reply.json() : null)).catch(() => null);
  try {
    const res = await fetch("/api/live?all=1", { credentials: "same-origin", signal: AbortSignal.timeout(8000) });
    if (res.status === 401) { document.getElementById("live").innerHTML = `<p class="live-note">Sign in on <a href="/">Parlay of the Day</a> to see live games.</p>`; return; }
    if (!res.ok) throw new Error(`live ${res.status}`);
    const data = await res.json();
    const mine = await Promise.race([legsJob, new Promise((resolve) => setTimeout(() => resolve(null), 200))]);
    if (mine) liveLegsFrom(mine);
    liveRecs = data.recs || [];
    livePaint(data);
    liveFocus(data);
    if (!mine) legsJob.then((got) => { if (!got || !liveLast) return; liveLegsFrom(got); livePaint(liveLast, true); });
  } catch (error) {
    if (!again) return liveFetch(true);
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

document.getElementById("live").addEventListener("change", (event) => {
  const kind = event.target.dataset && event.target.dataset.card, game = kind && event.target.closest(".live-game");
  if (!game) return;
  if (event.target.checked) liveCard[kind].add(game.dataset.id); else liveCard[kind].delete(game.dataset.id);
  if (!liveCardClass[kind]) return;
  game.classList.toggle(liveCardClass[kind], event.target.checked);
  try { localStorage.setItem(`liveCard-${kind}`, JSON.stringify([...liveCard[kind]].slice(-40))); } catch (error) { console.log("[live] could not keep the card filter", kind, error); }
});

document.body.classList.remove("live-mine-games");
liveZoomApply(liveZoom);
document.getElementById("live").addEventListener("pointerdown", (event) => {
  if (event.target.matches("input.live-card-range")) { try { event.target.setPointerCapture(event.pointerId); } catch (error) {} return; }
  if (!event.target.matches("input.live-zoom-range")) return;
  liveZoomDrag = true;
  try { event.target.setPointerCapture(event.pointerId); } catch (error) {}
});
const liveZoomEnd = (event) => {
  const cardRange = event.target && event.target.matches && event.target.matches("input.live-card-range");
  if (cardRange) { liveCardSnap(cardRange.closest(".live-game"), cardRange); return; }
  const fromTop = event.target && event.target.matches && event.target.matches("input.live-zoom-range");
  if (!fromTop && !liveZoomDrag) return;
  const box = fromTop ? event.target : document.querySelector("#live input.live-zoom-range");
  liveZoomDrag = false;
  if (!box) return;
  const snapped = Math.max(0, Math.min(LIVE_ZOOM_MAX, Math.round(Number(box.value) || 0)));
  box.value = String(snapped);
  box.setAttribute("aria-valuenow", String(snapped));
  liveZoomApply(snapped, { master: true });
};
document.getElementById("live").addEventListener("pointerup", liveZoomEnd);
document.getElementById("live").addEventListener("pointercancel", liveZoomEnd);
document.getElementById("live").addEventListener("lostpointercapture", (event) => {
  if (event.target.matches("input.live-zoom-range")) liveZoomEnd(event);
});
document.getElementById("live").addEventListener("input", (event) => {
  if (event.target.matches("input.live-card-range")) { liveCardMove(event.target.closest(".live-game"), event.target); return; }
  if (!event.target.matches("input.live-zoom-range")) return;
  liveZoomDrag = true;
  const level = Math.max(0, Math.min(LIVE_ZOOM_MAX, Math.round(Number(event.target.value) || 0)));
  event.target.setAttribute("aria-valuenow", String(level));
  liveZoomApply(level, { quiet: true, master: true });
});
document.getElementById("live").addEventListener("change", (event) => {
  if (event.target.matches("input.live-card-range")) { liveCardSnap(event.target.closest(".live-game"), event.target); return; }
  if (event.target.matches("input.live-zoom-range")) {
    liveZoomEnd(event);
    return;
  }
  if (!event.target.matches("input.live-mine-box")) return;
  liveOnlyMine = event.target.checked;
  try { localStorage.setItem("liveOnlyMine", liveOnlyMine ? "1" : "0"); } catch (error) {}
  if (liveLast) livePaint(liveLast, true);
});

document.getElementById("live").addEventListener("toggle", (event) => {
  if (event.target.classList && event.target.classList.contains("live-filter-fold")) liveFiltersOpen = event.target.open;
}, true);

document.getElementById("live").addEventListener("click", (event) => {
  if (event.target.closest("[data-live-clear]")) { liveFiltersClear(); return; }
  if (event.target.closest(".live-card-zoom")) { event.preventDefault(); event.stopPropagation(); return; }
  const who = event.target.closest("button.live-name");
  if (who) {
    const game = who.closest(".live-game"), row = who.closest("tr"), id = game && liveWhoId(game.dataset.id, who.dataset.who);
    const next = row && row.nextElementSibling;
    if (next && next.classList.contains("live-player-row")) { next.remove(); if (row) row.classList.remove("live-open"); liveWhoOpen.delete(id); return; }
    if (id) liveWhoOpen.add(id);
    liveWhoShow(who);
    return;
  }
  const recTag = event.target.closest("[data-rec-open]");
  if (recTag) {
    const id = recTag.dataset.recOpen;
    if (liveRecOpen.has(id)) liveRecOpen.delete(id); else liveRecOpen.add(id);
    if (liveLast) livePaint(liveLast, true);
    return;
  }
  const lifted = liveZoom === 0 && event.target.closest(".live-game");
  if (lifted && !event.target.closest("a, button, input, label")) {
    event.preventDefault();
    liveZoomLift(lifted);
    return;
  }
  const span = event.target.closest("[data-week]");
  if (span) {
    liveSpan = span.dataset.week;
    liveSpanHeld = true;
    liveSpanChosen = true;
    try { localStorage.setItem("liveSpan", liveSpan); } catch (error) { console.log("[live] could not keep this week", error); }
    if (liveLast) livePaint(liveLast, true);
    return;
  }
  const card = event.target.closest(".live-soon"), go = card && !event.target.closest("a, button, .live-card-zoom") && card.querySelector("a.live-week-game");
  if (go) { window.location.href = go.href; return; }
  const page = event.target.closest("a.live-open");
  if (page) { event.preventDefault(); window.location.href = page.href; return; }
  const stats = event.target.closest(".live-game > summary .live-stats");
  if (stats) { event.preventDefault(); stats.closest(".live-game").open = !stats.closest(".live-game").open; return; }
  const chip = event.target.closest("[data-league]");
  if (!chip) return;
  const sport = chip.dataset.league;
  if (!sport) liveLeagues.clear(); else if (liveLeagues.has(sport)) liveLeagues.delete(sport); else liveLeagues.add(sport);
  try { localStorage.setItem("liveLeagues", JSON.stringify([...liveLeagues])); } catch (error) { console.log("[live] could not keep leagues", error); }
  if (liveLast) livePaint(liveLast, true);
});
fetch("/api/me", { credentials: "same-origin" }).then((res) => (res.ok ? res.json() : null)).then((me) => { const name = me && me.member && me.member.name; if (name) document.getElementById("live-profile").dataset.name = name; }).catch((error) => console.log("[live] could not load profile name", error));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") liveLoad(); });
liveLoad();
setInterval(() => { if (document.visibilityState === "visible") liveLoad(); }, 20000);
