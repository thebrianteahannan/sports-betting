/** Live tracker page: scores, clocks, and every player's box score line for the games in progress, refreshed every 20 seconds. */

try { sessionStorage.setItem("fromLive", "1"); } catch (error) {}
const liveOpen = new Set((() => { try { return JSON.parse(localStorage.getItem("liveOpen") || "[]"); } catch (error) { return []; } })());
const liveCard = Object.fromEntries(["court", "mine"].map((kind) => [kind, new Set((() => { try { return JSON.parse(localStorage.getItem(`liveCard-${kind}`) || "[]"); } catch (error) { return []; } })())]));
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

function liveRoot(game, picks, rec, show) {
  if (!picks.length) return "";
  const one = (pick) => {
    const price = Number.isFinite(pick.odds) ? ` ${pick.odds > 0 ? `+${pick.odds}` : pick.odds}` : "";
    const { state, say, level, tip } = liveLegState(game, pick);
    const inner = `<i class="who">${liveEsc(pick.who)}</i><i class="prop">${liveEsc(pick.text)}${liveEsc(price)}</i>${rec ? liveKindTag(pick) : ""}${say ? `<i class="now${level ? ` pace-${level}` : ""}"${tip ? ` title="${liveEsc(tip)}"` : ""} data-k="${liveEsc(`${game.id}|${rec ? "rec" : "mine"}|${pick.who}|${pick.text}`)}">${liveEsc(say)}</i>` : ""}`;
    const href = `/?${new URLSearchParams({ game: pick.match, ...(pick.parlay ? { bet: pick.parlay } : {}), label: pick.label, market: pick.market, from: "live" })}`;
    return `<a class="live-mine-leg ${state}" href="${liveEsc(href)}" title="Open this bet in Build a bet">${inner}</a>`;
  };
  const groups = [];
  picks.forEach((pick) => { const group = !rec && pick.parlay && groups.find((row) => row.id === pick.parlay); if (group) group.picks.push(pick); else groups.push({ id: pick.parlay, picks: [pick] }); });
  const body = groups.map((group) => { if (group.picks.length < 2) return one(group.picks[0]); const head = liveParlayHead(group.id, group.picks[0].size); return `<span class="live-parlay${head.level ? ` pace-${head.level}` : ""}"><em>${liveEsc(head.text)}</em>${group.picks.map(one).join("")}</span>`; }).join("");
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

function liveGroup(group, key, many, mine, recs, known) {
  const head = `<tr><th>${liveEsc(many ? group.name : "Player")}</th>${group.labels.map((label) => `<th>${liveEsc(label)}</th>`).join("")}</tr>`;
  const rows = group.rows.map((row) => { const bet = mine.has(liveFold(row.name)), star = bet ? `<svg class="live-star" viewBox="0 0 16 16" width="8" height="8" aria-label="In my bets"><path fill="#e7c15a" d="M8 1.2 9.8 4.9l4.1.6-3 2.9.7 4.1L8 10.6 4.4 12.5l.7-4.1-3-2.9 4.1-.6z"/></svg>` : ""; return `<tr class="${row.on ? "on" : known ? "" : "all"}${row.starter ? " start" : ""}${bet ? " mine" : recs.has(liveFold(row.name)) ? " rec" : ""}"><td><button type="button" class="live-name" data-who="${liveEsc(row.name)}">${liveEsc(row.name)}</button>${row.pos ? `<span class="live-pos">${liveEsc(row.pos)}</span>` : ""}${star}</td>${row.stats.map((stat, at) => `<td data-k="${liveEsc(`${key}|${row.name}|${group.labels[at] || at}`)}">${liveEsc(stat)}</td>`).join("")}</tr>`; }).join("");
  return `<div class="live-table" data-slide="${liveEsc(key)}"><table>${head}${rows}</table></div>`;
}

function liveGame(game) {
  const away = Number(game.away.score), home = Number(game.home.score), picks = liveMine(game), mine = new Set(picks.map((pick) => liveFold(pick.who))), recs = new Set(liveMine(game, liveRecs).map((pick) => liveFold(pick.who)));
  const known = !game.final && (game.teams || []).some((team) => team.groups.some((group) => group.rows.some((row) => row.on)));
  const teams = (game.teams || []).map((team) => {
    const side = [game.away, game.home].find((row) => row.short === team.short) || {};
    const many = team.groups.length > 1;
    return `<section class="live-team" style="border-left-color: ${liveEsc(side.color || "#3dff6e")}"><h3>${liveEsc(team.name)}</h3>${team.groups.map((group, at) => liveGroup(group, `${game.id}|${team.short}|${at}`, many, mine, recs, known)).join("")}</section>`;
  }).join("");
  const box = (kind, say) => `<label class="live-court"><input type="checkbox" data-card="${kind}"${liveCard[kind].has(game.id) ? " checked" : ""}/> ${say}</label>`;
  const bar = teams && (known || picks.length) ? `<p class="live-card-bar">${known ? box("court", "In play") : ""}${picks.length ? box("mine", "Only players in my bets") : ""}</p>` : "";
  const body = teams ? `${bar}${teams}` : `<p class="live-note">ESPN has not posted player stats for this game yet.</p>`;
  const match = (liveMine(game, liveRecs)[0] || {}).match || `${game.away.name} @ ${game.home.name}`;
  const page = `/?${new URLSearchParams({ game: match, sport: game.sport, from: "live" })}`;
  return `<details class="live-game${picks.length ? " has-mine" : ""}${game.final ? " live-final" : ""}${known && liveCard.court.has(game.id) ? " live-court-only" : ""}${picks.length && liveCard.mine.has(game.id) ? " live-mine-only" : ""}" data-id="${liveEsc(game.id)}" data-sport="${liveEsc(game.sport)}" data-match="${liveEsc(match)}"${liveOpen.has(game.id) ? " open" : ""}><summary><span class="live-sport">${liveEsc(game.sport)}</span>${liveSide(game.away, away > home, `${game.id}|away`)}<span class="live-at-sign">@</span>${liveSide(game.home, home > away, `${game.id}|home`)}<span class="live-clock">${liveEsc(game.clock)}</span>${game.last ? `<span class="live-last" data-k="${liveEsc(`${game.id}|last`)}">${liveEsc(game.last)}</span>` : ""}${liveHurt(game)}${liveRoot(game, picks)}${liveRecRow(game, picks)}<a class="live-open" href="${liveEsc(page)}">Open Game Page</a><button type="button" class="live-stats" aria-label="Live stats"></button></summary>${body}</details>`;
}

function liveNext(next) {
  if (!next.length) return "";
  return `<h2>Up next today</h2><ul class="live-next">${next.map((game) => `<li><span class="live-sport">${liveEsc(game.sport)}</span><b>${liveEsc(game.away.short)} @ ${liveEsc(game.home.short)}</b><i>${liveEsc(liveTime(game.when))}</i>${liveRoot(game, liveMine(game))}${liveRecRow(game, liveMine(game))}</li>`).join("")}</ul>`;
}

function liveScore(data) {
  let won = 0, lost = 0, all = 0, pace = 0;
  (data.live || []).forEach((game) => liveMine(game, liveRecs).forEach((pick) => {
    if (pick.tier === "good") return;
    const { state, level } = liveLegState(game, pick);
    all += 1;
    if (state === "hit") won += 1; else if (state === "lost") lost += 1;
    if (state === "hit" || level === "ahead" || level === "close") pace += 1;
  }));
  const tally = data.tally || {}, today = tally.today || { won: 0, lost: 0 }, ever = tally.all || { won: 0, lost: 0 };
  const cell = (name, hit, of, tip, say = "") => `<span title="${liveEsc(tip)}"><b>${name}</b> ${hit} of ${of}${say}${of ? ` · ${Math.round((100 * hit) / of)}%` : ""}</span>`;
  document.getElementById("live-score").innerHTML = `<i>Recommended %<em>'s</em></i>${cell("Live", pace, all, "Recommended bets in games on now that have hit or are on pace to hit", " on pace")}${cell("Today", today.won + won, today.won + today.lost + won + lost, "Recommended bets won today, out of the ones already decided")}${cell("All time", ever.won + won, ever.won + ever.lost + won + lost, "See every recommended bet and how it finished")}${liveKindCells((tally.kinds || {}).all || {}, cell)}`;
  const allCell = document.querySelector("#live-score span:nth-of-type(3)"); if (allCell) allCell.dataset.history = "1";
}

function liveKindCells(kinds, cell) {
  const box = (key) => kinds[key] || { won: 0, lost: 0 };
  const safe = box("safe"), even = box("balanced");
  return `${cell("Safe", safe.won, safe.won + safe.lost, "Recommended at -150 or shorter, all time. Judged by how often they win.")}${cell("Balanced", even.won, even.won + even.lost, "Recommended from -149 to +100, all time.")}`;
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
const liveAsked = new URLSearchParams(location.search).get("span");
let liveLast = null, liveSpan = liveAsked === "week" || liveAsked === "past" || liveAsked === "today" ? liveAsked : "today";
if (liveAsked && !new URLSearchParams(location.search).get("game")) history.replaceState(null, "", location.pathname);
const liveRecOpen = new Set(), liveHistOpen = new Set();
document.addEventListener("toggle", (event) => { const key = event.target.dataset && event.target.dataset.hk; if (key) { if (event.target.open) liveHistOpen.add(key); else liveHistOpen.delete(key); } }, true);

function liveLeagueBar(data, count) {
  const order = ["NBA", "NFL", "NHL", "MLB", "WNBA", "PGA"], have = new Set([...(data.live || []), ...(data.done || []), ...(data.next || []), ...(data.week || [])].map((game) => game.sport));
  const leagues = order.filter((sport) => have.has(sport) || liveLeagues.has(sport));
  const chips = leagues.length < 2 && !liveLeagues.size ? "" : `<button type="button" data-league="" class="${liveLeagues.size ? "" : "on"}">All</button>${leagues.map((sport) => `<button type="button" data-league="${liveEsc(sport)}" class="${liveLeagues.has(sport) ? "on" : ""}">${liveEsc(sport)}</button>`).join("")}`;
  const games = (n) => `${n} ${n === 1 ? "game" : "games"}`, span = (key, label) => `<button type="button" class="${key === "past" ? "live-week-go" : ""}${liveSpan === key ? " on" : ""}" data-week="${key}">${label}, ${games(count[key])}</button>`;
  const go = `${span("past", "Past")}${span("today", "Today")}${(data.week || []).length ? span("week", "This week") : ""}`;
  return chips || go ? `<div class="live-leagues">${chips}${go}</div>` : "";
}

const liveDayKey = (when) => new Date(when).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function liveSoonCard(game) {
  const day = `${new Date(Date.parse(game.kickoff)).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
  const like = { id: `${game.match}|${game.kickoff}`, away: game.away || { name: game.awayName }, home: game.home || { name: game.homeName }, when: game.kickoff }, picks = liveMine(like), recs = liveRecPicks(like, picks).length, open = liveRecOpen.has(like.id);
  const tag = recs ? `<button type="button" class="live-rec-tag${open ? " on" : ""}" data-rec-open="${liveEsc(like.id)}">Recommended<b>${recs}</b></button>` : "";
  const until = typeof gameUntilText === "function" ? gameUntilText(game.kickoff) : "";
  const meta = `<span class="live-meta">${game.total ? `<span class="live-total">O/U ${liveEsc(game.total)}</span>` : ""}${until ? `<span class="find-until live-until" data-kick="${liveEsc(game.kickoff)}">${liveEsc(until)}</span>` : ""}<a class="live-week-game" href="/?${liveEsc(new URLSearchParams({ game: game.match, from: "live" }).toString())}" title="Open this game in Build a bet">Build a bet ›</a></span>`;
  const sides = game.sport === "PGA" ? `<span class="live-side"><b>${liveEsc(game.match || "")}</b></span>` : `${liveSide(like.away, false, `${like.id}|away`)}<span class="live-at-sign">@</span>${liveSide(like.home, false, `${like.id}|home`)}`;
  return `<div class="live-game live-soon${picks.length ? " has-mine" : ""}"><div class="live-head"><span class="live-sport">${liveEsc(game.sport)}</span>${sides}<span class="live-clock live-when">${liveEsc(day)}</span>${tag}${meta}${liveRoot(like, picks)}${liveRecRow(like, picks, open)}</div></div>`;
}

function liveWeekList(week) {
  if (liveSpan !== "week" || !week.length) return "";
  return `<h2>This week, ${week.length} ${week.length === 1 ? "game" : "games"}</h2>${week.map(liveSoonCard).join("")}`;
}

function livePaint(data, quiet) {
  liveLast = data;
  liveParlayTally([...(data.live || []), ...(data.done || [])]);
  const box = document.getElementById("live");
  box.querySelectorAll(".live-table[data-slide]").forEach((node) => liveSlide.set(node.dataset.slide, node.scrollLeft));
  const was = new Map([...box.querySelectorAll("[data-k]")].map((node) => [node.dataset.k, node.textContent])), games = new Set([...box.querySelectorAll(".live-game[data-id]")].map((node) => node.dataset.id)), first = quiet || !box.querySelector(".live-game, h2");
  const keep = (game) => !liveLeagues.size || liveLeagues.has(game.sport), live = (data.live || []).filter(keep), done = (data.done || []).filter(keep);
  const board = (data.week || []).filter(keep), today = liveDayKey(Date.now()), week = board.filter((game) => liveDayKey(game.kickoff) > today), soon = board.filter((game) => liveDayKey(game.kickoff) === today && Date.parse(game.kickoff) > Date.now());
  const next = (data.week || []).length ? (soon.length ? `<h2>Up next today, ${soon.length} ${soon.length === 1 ? "game" : "games"}</h2>${soon.map(liveSoonCard).join("")}` : "") : liveNext((data.next || []).filter(keep));
  const past = done.filter((game) => liveDayKey(game.when) !== today), ended = done.filter((game) => liveDayKey(game.when) === today);
  const final = (day, list) => list.length ? `<h2>Final ${day}, ${list.length} ${list.length === 1 ? "game" : "games"}</h2>${list.map(liveGame).join("")}` : "";
  const hist = ((data.tally || {}).history || []), histIds = new Set(hist.map((row) => String(row.id)));
  const bar = liveLeagueBar(data, { past: past.filter((game) => !histIds.has(String(game.id))).length + hist.length, today: live.length + ended.length + ((data.week || []).length ? soon.length : (data.next || []).filter(keep).length), week: week.length });
  box.innerHTML = liveSpan === "week" && week.length ? `${bar}${liveWeekList(week)}` : liveSpan === "past" ? `${bar}${(final("yesterday", past) + liveHistory(hist)) || `<p class="live-note">No past games to show.</p>`}` : `${bar}${live.length ? `<h2>Live now, ${live.length} ${live.length === 1 ? "game" : "games"}</h2>${live.map(liveGame).join("")}` : `<p class="live-note">No games are live right now.</p>`}${next}<div class="live-today-recap">${liveHistory(hist.filter((row) => liveDayKey(row.kickoff) === today), true)}</div>${final("today", ended)}`;
  box.querySelectorAll(".live-table[data-slide]").forEach((node) => { const left = liveSlide.get(node.dataset.slide); if (left) node.scrollLeft = left; });
  box.querySelectorAll("h2").forEach((head) => head.insertAdjacentHTML("beforeend", `<label class="live-court"><input type="checkbox" class="live-mine-box"${document.body.classList.contains("live-mine-off") ? "" : " checked"}/> My bets</label><label class="live-court live-court-next"><input type="checkbox" class="live-recs-box"${document.body.classList.contains("live-recs-on") ? " checked" : ""}/> Recommended bets</label>`));
  if (!first) {
    box.querySelectorAll("[data-k]").forEach((node) => { if (was.has(node.dataset.k) && was.get(node.dataset.k) !== node.textContent) node.classList.add("live-flash"); });
    box.querySelectorAll(".live-game[data-id]:not(.live-final)").forEach((node) => { if (!games.has(node.dataset.id)) node.classList.add("live-flash"); });
  }
  liveScore(data);
  document.getElementById("live-at").textContent = `Updated ${new Date(data.at || Date.now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  liveWhoPlace();
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
  if (!find() && liveSpan !== "today") { liveSpan = "today"; livePaint(data, true); }
  if (!find() && liveLeagues.size) { liveLeagues.clear(); livePaint(data, true); }
  const game = find();
  if (!game) return;
  game.open = true;
  game.scrollIntoView({ block: "start", behavior: "smooth" });
}

async function liveLoad() {
  try {
    const [res, mine] = await Promise.all([fetch("/api/live?all=1", { credentials: "same-origin" }), fetch("/api/parlays", { credentials: "same-origin" }).then((reply) => (reply.ok ? reply.json() : null)).catch(() => null)]);
    if (res.status === 401) { document.getElementById("live").innerHTML = `<p class="live-note">Sign in on <a href="/">Parlay of the Day</a> to see live games.</p>`; return; }
    if (mine) liveLegs = (mine.parlays || []).flatMap((row) => (row.legs || []).map((leg) => ({ ...leg, parlay: row.id, parlaySize: (row.legs || []).length })));
    const data = await res.json();
    liveRecs = data.recs || [];
    livePaint(data);
    liveFocus(data);
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

document.getElementById("live").addEventListener("change", (event) => {
  const kind = event.target.dataset && event.target.dataset.card, game = kind && event.target.closest(".live-game");
  if (!game) return;
  if (event.target.checked) liveCard[kind].add(game.dataset.id); else liveCard[kind].delete(game.dataset.id);
  game.classList.toggle(kind === "court" ? "live-court-only" : "live-mine-only", event.target.checked);
  try { localStorage.setItem(`liveCard-${kind}`, JSON.stringify([...liveCard[kind]].slice(-40))); } catch (error) { console.log("[live] could not keep the card filter", kind, error); }
});

document.body.classList.toggle("live-recs-on", false);
document.body.classList.toggle("live-mine-off", false);
document.getElementById("live").addEventListener("change", (event) => {
  if (!event.target.matches("input.live-mine-box")) return;
  const on = event.target.checked;
  document.body.classList.toggle("live-mine-off", !on);
  document.querySelectorAll("input.live-mine-box").forEach((box) => { box.checked = on; });
  try { localStorage.setItem("liveMine", on ? "1" : "0"); } catch (error) { console.log("[live] could not keep the My bets checkbox", error); }
});
document.getElementById("live").addEventListener("change", (event) => {
  if (!event.target.matches("input.live-recs-box")) return;
  const on = event.target.checked;
  document.body.classList.toggle("live-recs-on", on);
  document.querySelectorAll("input.live-recs-box").forEach((box) => { box.checked = on; });
  try { localStorage.setItem("liveRecs", on ? "1" : "0"); } catch (error) { console.log("[live] could not keep checkbox", error); }
});

document.getElementById("live").addEventListener("click", (event) => {
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
  const span = event.target.closest("[data-week]");
  if (span) {
    liveSpan = span.dataset.week;
    try { localStorage.setItem("liveSpan", liveSpan); } catch (error) { console.log("[live] could not keep this week", error); }
    if (liveLast) livePaint(liveLast, true);
    return;
  }
  const card = event.target.closest(".live-soon"), go = card && !event.target.closest("a, button") && card.querySelector("a.live-week-game");
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
document.getElementById("live-score").addEventListener("click", (event) => {
  if (event.target.closest("i")) { event.currentTarget.classList.toggle("open"); return; }
  if (!event.target.closest("[data-history]")) return;
  liveSpan = "past";
  try { localStorage.setItem("liveSpan", liveSpan); } catch (error) { console.log("[live] could not keep past", error); }
  if (liveLast) livePaint(liveLast, true);
  const head = document.getElementById("live-history"); if (head) head.scrollIntoView({ block: "start", behavior: "smooth" });
});
fetch("/api/me", { credentials: "same-origin" }).then((res) => (res.ok ? res.json() : null)).then((me) => { const name = me && me.member && me.member.name; if (name) document.getElementById("live-profile").dataset.name = name; }).catch((error) => console.log("[live] could not load profile name", error));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") liveLoad(); });
liveLoad();
setInterval(() => { if (document.visibilityState === "visible") liveLoad(); }, 20000);
