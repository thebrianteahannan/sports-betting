/** Today's games under the poster when the screen has room, like a phone held upright. Tapping one opens it on the search page. */

let homeGamesList = [], homeGamesAt = 0, homeGamesGuest = null;

function homeGamesLoad() {
  const guest = document.body.classList.contains("needs-member");
  if (guest !== homeGamesGuest) {
    homeGamesGuest = guest;
    homeGamesAt = 0;
    // Keep the last picks on screen while the member feed reloads so the mobile strip is not blank.
    if (homeRecs) homeRecs = { ...homeRecs, at: 0, loading: false };
  }
  if (Date.now() - homeGamesAt < 5 * 60 * 1000) return;
  if (guest) {
    homeGamesAt = Date.now();
    fetch("/api/slate", { cache: "no-store" }).then((reply) => (reply.ok ? reply.json() : { today: [], tomorrow: [] })).then((data) => {
      homeGamesList = Array.isArray(data.today) ? data.today : [];
      homeLater.tomorrow = Array.isArray(data.tomorrow) ? data.tomorrow : [];
      homeLater.at = Date.now();
      homeGamesPaint();
    }).catch((error) => { homeGamesAt = 0; console.log("[home-games] could not load", error); });
    return;
  }
  if (typeof loadFind !== "function") return;
  homeGamesAt = Date.now();
  loadFind("today").then((data) => {
    const people = Array.isArray(data && data.people) ? data.people : [];
    homeGamesList = loadedGames(people, "today");
    if (!startNeedsWeek()) homePickBoard = { span: "today", at: Date.now(), people };
    homeGamesPaint();
  }).catch((error) => { homeGamesAt = 0; console.log("[home-games] could not load", error); });
}

let homeLater = { at: 0, weekAt: 0, loading: false, live: [], done: [], tomorrow: [], week: [] };
const START_WHEN = [["done", "Finished Today"], ["live", "Live"], ["next", "Upcoming Today"], ["tomorrow", "Tomorrow"], ["week", "This Week"]];
let startSpan = START_WHEN.some(([id]) => id === localStorage.getItem("startSpan")) ? localStorage.getItem("startSpan") : "next";
function startNeedsWeek() { return startSpan === "tomorrow" || startSpan === "week"; }
function startKickDay(ms) { return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); }
function startWhenSay() { return { done: "finished today", live: "live", next: "later today", tomorrow: "tomorrow", week: "this week" }[startSpan] || "today"; }
function whenNick(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/).pop(); }
function whenSides(game) {
  if (game && game.match && String(game.match).includes(" @ ")) return String(game.match).split(/\s+@\s+/).map(whenNick);
  const away = game && game.away && game.away.name, home = game && game.home && game.home.name;
  return away && home ? [whenNick(away), whenNick(home)] : [];
}
function whenSame(a, b) {
  const left = whenSides(a), right = whenSides(b);
  return left.length === 2 && right.length === 2 && left[0] === right[0] && left[1] === right[1];
}
function whenBucket(ms, match) {
  if (!Number.isFinite(ms)) return "";
  const now = Date.now(), today = startKickDay(now), day = startKickDay(ms), tomorrow = startKickDay(now + 86400000), end = startKickDay(now + 14 * 86400000);
  const row = { match: match || "" };
  if (day === today && ms > now) return "next";
  if (day === today && (homeLater.live || []).some((game) => whenSame(game, row))) return "live";
  if (day === today && ms <= now) return (homeLater.live || []).length || homeLater.at ? "done" : (ms > now - 4 * 3600000 ? "live" : "done");
  if (day === tomorrow) return "tomorrow";
  if (day > tomorrow && day <= end) return "week";
  return "";
}
window.whenBucket = whenBucket;
let startWeekGames = [], startWeekAt = 0, startWeekLoading = false, startWeekWait = [];

function homeLaterLoad() {
  if (homeLater.loading || Date.now() - homeLater.at < 60 * 1000 || typeof loadFind !== "function") return;
  homeLater.loading = true;
  const day = (at) => new Date(at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }), next = day(Date.now() + 24 * 60 * 60 * 1000);
  const week = Date.now() - homeLater.weekAt < 5 * 60 * 1000 ? Promise.resolve(null) : loadFind("week").then((data) => loadedGames(Array.isArray(data && data.people) ? data.people : [], "week"));
  Promise.all([fetch("/api/live?all=1", { credentials: "same-origin" }).then((reply) => (reply.ok ? reply.json() : null)), week]).then(([live, games]) => {
    homeLater.live = (live && live.live) || [];
    homeLater.done = (live && live.done) || [];
    if (games) {
      homeLater.weekAt = Date.now();
      homeLater.week = games;
      startWeekGames = games;
      startWeekAt = homeLater.weekAt;
      homeLater.tomorrow = games.filter((game) => day(Date.parse(game.kickoff || "")) === next).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    }
  }).catch((error) => console.log("[home-games] could not load live and tomorrow", error)).finally(() => { homeLater.at = Date.now(); homeLater.loading = false; homeGamesPaint(); if (typeof quickAddLiveRefresh === "function") quickAddLiveRefresh(); });
}

function startWeekMerge(board, people) {
  if (!board || !Array.isArray(people) || !people.length) return;
  const live = board.people || [], seen = new Map(live.map((person) => [person.key, person]));
  people.forEach((person) => {
    const have = seen.get(person.key);
    if (!have) { live.push(person); seen.set(person.key, person); return; }
    const ids = new Set((have.bets || []).map((bet) => `${bet.label}|${bet.odds}|${bet.match}`));
    (person.bets || []).forEach((bet) => { if (!ids.has(`${bet.label}|${bet.odds}|${bet.match}`)) have.bets.push(bet); });
  });
  board.people = live;
}

function startWeekFresh(at) {
  return at && Date.now() - at < 5 * 60 * 1000;
}

function startWeekLoad(done) {
  const later = () => { if (done) setTimeout(done, 0); };
  if (!startNeedsWeek()) { later(); return; }
  // An empty list is a finished load. Treating it as "not loaded" reloads the same cached week forever and freezes the tab.
  if (startWeekFresh(startWeekAt)) { later(); return; }
  if (startWeekFresh(homeLater.weekAt)) { startWeekGames = homeLater.week; startWeekAt = homeLater.weekAt; later(); return; }
  if (done) startWeekWait.push(done);
  if (startWeekLoading || typeof loadFind !== "function") return;
  startWeekLoading = true;
  loadFind("week").then((data) => {
    const people = Array.isArray(data && data.people) ? data.people : [];
    startWeekGames = typeof loadedGames === "function" ? loadedGames(people, "week") : [];
    startWeekAt = Date.now();
    homeLater.week = startWeekGames;
    homeLater.weekAt = startWeekAt;
    startWeekMerge(document.querySelector("#desk-glass-in .find-board"), people);
  }).catch(() => {}).finally(() => {
    startWeekLoading = false;
    const wait = startWeekWait.splice(0);
    wait.forEach((fn) => { try { fn(); } catch (error) {} });
  });
}

function startSpanBar() {
  const bar = document.createElement("span");
  bar.className = "find-start-span desk-games-leagues";
  if (!document.body.classList.contains("needs-member")) homeLaterLoad();
  START_WHEN.forEach(([id, label]) => {
    const on = startSpan === id;
    const chip = Object.assign(document.createElement("button"), { type: "button", className: `desk-games-league find-start-when${on ? " on" : ""}`, textContent: label });
    chip.setAttribute("aria-pressed", String(on));
    chip.addEventListener("click", () => {
      if (startSpan === id) return;
      startSpan = id;
      try { localStorage.setItem("startSpan", id); } catch (error) {}
      homeRecs = null;
      if (startNeedsWeek()) startWeekLoad(() => { if (typeof startShow === "function") startShow(); else if (typeof startPaint === "function") startPaint(1); });
      if (typeof startShow === "function") startShow();
      else if (typeof startPaint === "function") startPaint(1);
      else startHomeStrip();
    });
    bar.append(chip);
  });
  return bar;
}

function startPickSpanOk(pick) {
  const kick = Date.parse(pick.kickoff || "");
  if (!Number.isFinite(kick)) return startSpan === "week";
  return whenBucket(kick, pick.match) === startSpan;
}

function startGamesFor(span) {
  const now = Date.now(), today = startKickDay(now), tomorrow = startKickDay(now + 86400000);
  const dayOf = (game) => startKickDay(Date.parse(game.kickoff || game.when || ""));
  const fromLive = (row, final) => ({ match: row.match || `${(row.away && row.away.name) || ""} @ ${(row.home && row.home.name) || ""}`, kickoff: row.when || row.kickoff || "", sport: row.sport || "", clock: row.clock || "", away: row.away, home: row.home, id: row.id, live: !final, final: !!final });
  if (span === "live") return (homeLater.live || []).map((row) => fromLive(row, false));
  if (span === "done") {
    const seen = new Set();
    return (homeLater.done || []).filter((row) => dayOf(row) === today).map((row) => fromLive(row, true)).concat(homeGamesList.filter((game) => dayOf(game) === today && Date.parse(game.kickoff || "") <= now && !(homeLater.live || []).some((row) => whenSame(row, game)))).filter((game) => { const key = game.match; if (!key || seen.has(key)) return false; seen.add(key); return true; });
  }
  if (span === "next") return homeGamesList.filter((game) => dayOf(game) === today && Date.parse(game.kickoff || "") > now);
  if (span === "tomorrow") return (homeLater.tomorrow.length ? homeLater.tomorrow : startWeekGames).filter((game) => dayOf(game) === tomorrow);
  return startWeekGames.filter((game) => dayOf(game) > tomorrow);
}

function leftGames() {
  return startGamesFor(startSpan);
}

function homeLiveRow(game) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "desk-game desk-game-live";
  row.innerHTML = `<span class="desk-game-sport">${esc(game.sport || "")}</span><span class="desk-game-match">${homeTeam(game.away.name)} ${esc(game.away.score)} @ ${homeTeam(game.home.name)} ${esc(game.home.score)}</span><span class="desk-game-when">${esc(game.clock || "")}</span><span class="desk-game-until desk-game-on">Live</span>`;
  row.addEventListener("click", () => { window.location.href = `/live?${new URLSearchParams({ game: game.id })}`; });
  return row;
}

function homeGamesOpen(game) {
  if (document.body.classList.contains("needs-member")) { const join = document.getElementById("gate-join"); if (join) join.click(); return; }
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
  fetch("/api/logos").then((reply) => reply.json()).then((data) => {
    homeLogos = data || {};
    homeGamesRepaint();
    if (typeof startPaint === "function" && document.querySelector("#desk-glass-in .find-start .quick-add")) startPaint(1);
    const td = document.querySelector("#desk-glass-in .find-list.find-td-board .find-td-all");
    if (td && typeof tdTeamRefresh === "function") tdTeamRefresh(td);
  }).catch((error) => { console.log("[home-games] could not load logos", error); homeLogos = null; });
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
  const when = game.final ? "Final" : (game.kickoff ? `${new Date(game.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "");
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
  const who = item.legs.map((leg) => String(leg.label || "").split(/\s+(?:\d|Over\b|Under\b)/)[0].replace(/[\s\-–—:]+$/, "").split(" ").pop()).filter(Boolean);
  const games = typeof gameShortList === "function" ? gameShortList(item.legs) : "";
  const price = typeof savePrice === "function" ? savePrice(item.legs) : "";
  row.innerHTML = `<span class="desk-game-sport">${esc(games)}</span><span class="desk-game-match">${esc(`${who.slice(0, 2).join(", ")}${who.length > 2 ? ` +${who.length - 2}` : ""}`)}</span><span class="desk-game-when">${esc(`From ${item.fromName}`)}</span><span class="desk-game-until">${esc(price)}</span>`;
  row.addEventListener("click", () => { window.asking = true; if (window.goFull) goFull(); if (window.sharedGo) sharedGo(); });
  return row;
}

let homeGamesTab = "rec", homeRecs = null, homePickBoard = null;

function homePickBoardNow() {
  const live = document.querySelector("#desk-glass-in .find-board");
  if (live && (live.people || []).length) return live;
  if (homePickBoard && (homePickBoard.people || []).length) return homePickBoard;
  return { people: [] };
}

function homePickBoardLoad() {
  if (typeof loadFind !== "function") return;
  const span = startNeedsWeek() ? "week" : "today";
  const live = document.querySelector("#desk-glass-in .find-board");
  if (live && (live.people || []).length) return;
  if (homePickBoard && homePickBoard.span === span && (homePickBoard.loading || ((homePickBoard.people || []).length && Date.now() - homePickBoard.at < 10 * 60 * 1000))) return;
  homePickBoard = { span, loading: true, at: Date.now(), people: (homePickBoard && homePickBoard.span === span && homePickBoard.people) || [] };
  loadFind(span).then((data) => {
    if (!homePickBoard || homePickBoard.span !== span) return;
    homePickBoard = { span, at: Date.now(), people: (data && data.people) || [] };
    const box = document.getElementById("desk-games");
    if (!box || box.hidden || startHomeStrip.busy) { if (box) box.dataset.sig = ""; return; }
    box.dataset.sig = "";
    homeGamesPaint();
  }).catch(() => { if (homePickBoard && homePickBoard.span === span) homePickBoard.loading = false; });
}

function startHomeStrip() {
  const home = document.getElementById("desk-games");
  if (!home || home.hidden || startHomeStrip.busy) return;
  startHomeStrip.busy = true;
  try { homeGamesPaint(); } finally { startHomeStrip.busy = false; }
}

function homeRecsLoad(forceWhen) {
  const guest = document.body.classList.contains("needs-member");
  // Keep "week" once chosen — paint() calls this with no arg and used to wipe it back to tonight.
  const want = forceWhen === "week" || forceWhen === "auto" ? forceWhen : ((homeRecs && homeRecs.want) || "auto");
  if (homeRecs && homeRecs.guest === guest && homeRecs.want === want && (homeRecs.loading || Date.now() - homeRecs.at < 10 * 60 * 1000)) return;
  homeRecs = { loading: true, at: Date.now(), picks: (homeRecs && homeRecs.picks) || [], guest, want };
  const url = guest
    ? (want === "week" ? "/api/top-picks?when=week" : "/api/sample")
    : (want === "week" ? "/api/top-picks?when=week" : "/api/top-picks");
  fetch(url, { credentials: "same-origin", cache: "no-store" }).then((reply) => (reply.ok ? reply.json() : { picks: [] })).then((data) => {
    const stillGuest = document.body.classList.contains("needs-member");
    if (stillGuest !== guest) { homeRecs = null; homeRecsLoad(forceWhen || want); return; }
    // A newer load (e.g. week) started while this one was in flight — drop the stale reply.
    if (!homeRecs || homeRecs.want !== want) return;
    const sample = (data && data.picks && data.picks.length) ? data.picks : (data && data.pick ? [data.pick] : []);
    const golden = (data && data.golden) || sample.find((pick) => pick && pick.golden) || null;
    const silver = (data && data.silver) || sample.find((pick) => pick && pick.silver) || null;
    const bronze = (data && data.bronze) || sample.find((pick) => pick && pick.bronze) || null;
    homeRecs = stillGuest
      ? { at: Date.now(), span: (data && data.span) || (want === "week" ? "week" : "today"), picks: sample, golden, silver, bronze, more: Number(data && data.more) || 0, guest: true, want }
      : { at: Date.now(), span: (data && data.span) || (want === "week" ? "week" : "today"), picks: (data && data.picks) || [], golden, silver, bronze, guest: false, want };
    const box = document.getElementById("desk-games");
    if (box) box.dataset.sig = "";
    homeGamesPaint();
    if (typeof startPaint === "function" && document.querySelector("#desk-glass-in .find-start")) startPaint(1);
    if (typeof manageRefresh === "function") manageRefresh();
  }).catch((error) => { console.log("[home-games] could not load top picks", error); if (homeRecs && homeRecs.want === want) { homeRecs = { at: Date.now(), picks: [], guest: document.body.classList.contains("needs-member"), want }; homeGamesPaint(); } });
}

function homeRecTitle(pick) {
  const label = String(pick.label || "").trim();
  const who = String(pick.who || "").trim();
  const prop = String(pick.text || "").trim();
  // Prefer text — it carries units (e.g. "Over 22.5 points + rebounds"). Label is often bare "Over 22.5".
  if (prop) {
    if (who && !prop.toLowerCase().startsWith(who.toLowerCase())) return `${who} ${prop}`.replace(/\s+/g, " ").trim();
    return prop;
  }
  const market = String(pick.market || "").trim();
  if (market && who && /\bover\s+[\d.]+$/i.test(label)) {
    const unit = market.replace(new RegExp(`^${who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*`, "i"), "").trim();
    if (unit) return `${label} ${unit}`.replace(/\s+/g, " ").trim();
  }
  return label;
}

function homeRecRow(pick, index, opts) {
  const stay = !!(opts && opts.stay);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "desk-game desk-rec";
  card.dataset.moveLabel = pick.label || "";
  card.dataset.moveMarket = pick.market || "";
  card.dataset.moveMatch = pick.match || "";
  card.dataset.moveOdds = String(Number(pick.odds) || "");
  const odds = Number(pick.odds), price = odds > 0 ? `+${odds}` : String(odds);
  const pct = typeof findPct === "function" ? findPct(odds) : String(pick.need || "");
  const cash = typeof findCash === "function" ? findCash(odds) : (Number.isFinite(odds) && odds ? `$${((odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds))).toFixed(2)}` : "");
  const star = homeTeamStar(homeGamesList.find((game) => game.match === pick.match)).trim();
  const span = (homeRecs && homeRecs.span) || "today";
  const guest = document.body.classList.contains("needs-member");
  const golden = !!pick.golden;
  const silver = !!pick.silver;
  const bronze = !!pick.bronze;
  const hot = typeof recDialHot === "function" && recDialHot(pick);
  if (!hot && golden) card.classList.add("desk-rec-golden");
  if (!hot && silver) card.classList.add("desk-rec-silver");
  if (!hot && bronze) card.classList.add("desk-rec-bronze");
  const lead = hot ? "Other recommendations" : golden ? "Golden Ticket" : silver ? "Silver Ticket" : bronze ? "Bronze Ticket" : guest ? `${homePickSport(pick) || "Top"} pick` : index ? `#${index + 1}` : span === "today" ? "Today's free pick" : span === "tomorrow" ? "Tomorrow's top pick" : "Top pick";
  const when = pick.kickoff ? `${span === "week" ? `${new Date(pick.kickoff).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" })} ` : ""}${new Date(pick.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "";
  const side = String(pick.match || "").split(" @ ").find((name) => pick.team && (name === pick.team || name.endsWith(` ${pick.team}`))) || "", logo = (side && homeLogos && homeLogos[side]) || "", dark = logo.replace("/500/", "/500-dark/");
  const hits = Number(pick.hits), games = Number(pick.n);
  const recordShown = games > 0 && Number.isFinite(hits) ? Math.round((100 * hits) / games) : null;
  const record = recordShown == null ? "" : `${recordShown}%`;
  const claim = typeof edgeClaim === "function" ? edgeClaim(pick, odds) : null;
  const clear = claim ? claim.clear : null;
  const clearText = clear == null ? "" : clear > 0.05 ? `${clear.toFixed(1)} better than the books` : clear < -0.05 ? `${Math.abs(clear).toFixed(1)} short of the books` : "Even with the books";
  const edgeTip = typeof PRICE_EDGE_TIP === "string" ? PRICE_EDGE_TIP : "FanDuel needs at least 3 points fewer hits than the other books, with FanDuel left out and the juice removed.";
  const edgeTag = claim && claim.clear >= 3 ? `<i class="desk-rec-edge" title="${esc(edgeTip)}" data-tip="${esc(edgeTip)}">Edge</i>` : "";
  const clearTip = clear == null || !claim || claim.fair == null ? "" : `The other books, with FanDuel left out and the juice removed, put it at ${(claim.fair * 100).toFixed(1)}% across ${claim.books} books. ${price} breaks even at ${pct}.`;
  const pay = [record && `<i class="hit">${esc(record)}</i>`, clearText && `<i class="clear ${clear > 0 ? "up" : clear < 0 ? "down" : ""}"${clearTip ? ` title="${esc(clearTip)}"` : ""}>${esc(clearText)}</i>`, `<i class="px">${esc(price)}</i>`, pct && `<i class="pct">${esc(pct)}</i>`, cash && `<i class="pay">${esc(`$5 profits ${cash}`)}</i>`, star].filter(Boolean).join("");
  const goldenTip = "Golden Ticket: −120 to +120, and it has hit 60% or more.";
  const silverTip = "Silver Ticket: −150 to +150, and it has hit 55% or more.";
  const bronzeTip = "Bronze Ticket: −200 to +200, and it has hit 50% or more.";
  const ticketTag = hot ? "" : golden
    ? `<i class="desk-rec-golden-tag" title="${esc(goldenTip)}" data-tip="${esc(goldenTip)}">Golden Ticket</i>`
    : silver
      ? `<i class="desk-rec-silver-tag" title="${esc(silverTip)}" data-tip="${esc(silverTip)}">Silver Ticket</i>`
      : bronze
        ? `<i class="desk-rec-bronze-tag" title="${esc(bronzeTip)}" data-tip="${esc(bronzeTip)}">Bronze Ticket</i>`
        : "";
  const tags = [ticketTag, edgeTag, typeof scriptKindTag === "function" ? scriptKindTag(pick) : "", typeof scriptRoleTag === "function" ? scriptRoleTag(pick) : "", typeof scriptCushionTag === "function" ? scriptCushionTag(pick) : ""].filter(Boolean).join("");
  card.innerHTML = `<span class="desk-rec-name">${logo ? `<img class="desk-team-logo desk-rec-logo" src="${esc(dark)}" alt="${esc(side)}" loading="lazy"${dark !== logo ? ` onerror="this.onerror=null;this.src='${esc(logo)}'"` : ""}>` : ""}${esc(homeRecTitle(pick))}</span><span class="desk-rec-pay">${pay}</span><span class="desk-rec-how">${lead}${tags}</span><span class="desk-rec-legs">${esc(when)}</span><span class="desk-rec-read">${esc(`${pick.match}. Hit in ${pick.hits} of his last ${pick.n}.`)}</span>`;
  if (typeof manageOddsBind === "function") manageOddsBind(card.querySelector(".desk-rec-pay .px"), [{ label: pick.label || "", market: pick.market || "", match: pick.match || "", odds }], card);
  card.addEventListener("click", (event) => {
    const moving = event.target.closest(".k-move");
    if (moving && card.contains(moving)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof priceMoveInline === "function") priceMoveInline(card);
      return;
    }
    if (event.target.closest(".px, .manage-odds, .manage-price-chart")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const tag = event.target.closest(".bet-kind, .desk-rec-edge, .desk-rec-golden-tag, .desk-rec-silver-tag, .desk-rec-bronze-tag");
    if (tag && card.contains(tag)) {
      event.preventDefault();
      event.stopPropagation();
      deskRecTagWhy(card, tag);
      return;
    }
    if (stay) return;
    if (document.body.classList.contains("needs-member")) { const join = document.getElementById("gate-join"); if (join) join.click(); return; }
    window.location.href = `/?${new URLSearchParams({ game: pick.match, label: pick.label, market: pick.market || "" })}`;
  });
  if (typeof recDialMark === "function") recDialMark(card, pick);
  return card;
}

function deskRecTagWhy(card, tag) {
  const tip = String((tag && (tag.getAttribute("data-tip") || tag.getAttribute("title"))) || "").trim();
  if (!tip || !card) return false;
  let why = card.querySelector(":scope > .desk-rec-tag-why");
  if (why && why.dataset.tip === tip) {
    why.remove();
    card.classList.remove("desk-rec-tip-on");
    return true;
  }
  if (!why) {
    why = document.createElement("span");
    why.className = "desk-rec-tag-why";
    card.append(why);
  }
  card.classList.add("desk-rec-tip-on");
  why.dataset.tip = tip;
  why.textContent = tip;
  return true;
}
window.deskRecTagWhy = deskRecTagWhy;

function homeGamesRepaint() {
  const box = document.getElementById("desk-games");
  if (box) box.dataset.sig = "";
  homeGamesPaint();
}

let homeLeague = "", homeLeagueOpen = false, homeLeagueFrom = null;

function homeLeagueSync() {
  const saved = window.memberLeague;
  if (!saved || saved === homeLeagueFrom) return;
  homeLeagueFrom = saved;
  homeLeague = saved.pick || "";
  homeLeagueOpen = Boolean(saved.open);
}

function homeLeagueSave(box) {
  const next = { pick: homeLeague, open: homeLeagueOpen };
  window.memberLeague = homeLeagueFrom = next;
  if (box) box.dataset.sig = "";
  homeGamesPaint();
  if (typeof startPaint === "function" && document.querySelector(".find-start")) startPaint(1);
  fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ league: next }) }).catch((error) => console.log("[home-games] could not save the league", error));
}

function homePickSport(pick) {
  if (pick && pick.sport) return pick.sport;
  const game = homeGamesList.find((row) => row.match === pick.match) || ((window.state && state.board && state.board.games) || []).find((row) => row.match === pick.match);
  return (game && game.sport) || "";
}

function homeLeagueList(games) {
  const order = ["NFL", "NBA", "NHL", "MLB", "WNBA", "PGA"];
  return [...new Set([...games.map((game) => game.sport), ...((homeRecs && homeRecs.picks) || []).map(homePickSport)].filter(Boolean))].sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99) || a.localeCompare(b));
}

function homeLeagueClearNote(box, text) {
  const line = document.createElement("p");
  line.className = "desk-games-note";
  line.append(document.createTextNode(`${text} `));
  const go = document.createElement("button");
  go.type = "button";
  go.className = "desk-games-link";
  go.textContent = "Show all sports";
  go.addEventListener("click", () => {
    homeLeague = "";
    if (box) box.scrollTop = 0;
    homeLeagueSave(box || document.getElementById("desk-games") || document.querySelector(".find-start"));
  });
  line.append(go);
  return line;
}

function homeLeagueOn(games) {
  return homeLeagueList(games).includes(homeLeague) ? homeLeague : "";
}

function homeTdChip(games) {
  if (homeGamesTab !== "rec") return null;
  const league = homeLeagueOn(games);
  if (league && league !== "NFL") return null;
  const hasNfl = games.some((game) => String(game.sport || "") === "NFL")
    || ((homeRecs && homeRecs.picks) || []).some((pick) => homePickSport(pick) === "NFL");
  if (!hasNfl) return null;
  const go = document.createElement("button");
  go.type = "button";
  go.className = "desk-games-td";
  go.textContent = "Anytime TDs ›";
  go.title = "See who is most likely to score a touchdown";
  go.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const ready = () => {
      const board = document.querySelector("#desk-glass-in .find-board");
      if (!board || typeof startTdGo !== "function") return null;
      if (!(board.people || []).some((person) => person.kind === "player" && (person.bets || []).length)) return null;
      return board;
    };
    const open = () => {
      const board = ready();
      if (!board) return false;
      startTdGo(board);
      return true;
    };
    if (typeof goFull === "function") goFull();
    if (open()) return;
    let tries = 0, asked = false;
    const wait = setInterval(() => {
      if (open() || ++tries > 100) { clearInterval(wait); return; }
      const desk = document.getElementById("desk");
      if (!desk || !desk.classList.contains("tv-full")) {
        if (typeof goFull === "function") goFull();
        return;
      }
      if (!asked && !document.querySelector("#desk-glass-in .find-board") && typeof birdMenu === "function") {
        asked = true;
        birdMenu("find");
      }
    }, 100);
  });
  return go;
}

function homeLeagueCounts(games) {
  const by = { "": 0 };
  homeLeagueList(games).forEach((league) => { by[league] = 0; });
  if (typeof startRecPool === "function") {
    const all = startRecPool(games, { league: "" });
    if (all.status === "ok") {
      by[""] = (all.picks || []).length;
      homeLeagueList(games).forEach((league) => {
        by[league] = (all.picks || []).filter((pick) => (typeof homePickSport === "function" ? homePickSport(pick) : pick.sport) === league).length;
      });
    }
    return by;
  }
  const picks = ((homeRecs && homeRecs.picks) || []).slice();
  [homeRecs && homeRecs.bronze, homeRecs && homeRecs.silver, homeRecs && homeRecs.golden].filter(Boolean).forEach((ticket) => {
    if (!picks.some((pick) => pick && pick.label === ticket.label && pick.match === ticket.match)) picks.unshift(ticket);
  });
  picks.forEach((pick) => {
    if (!pick) return;
    by[""] += 1;
    const sport = typeof homePickSport === "function" ? homePickSport(pick) : pick.sport;
    if (sport && Object.prototype.hasOwnProperty.call(by, sport)) by[sport] += 1;
  });
  return by;
}

function homeLeagues(box, games) {
  const leagues = homeLeagueList(games), on = homeLeagueOn(games);
  if (!leagues.length) return [];
  const onHome = box && box.id === "desk-games";
  const showCounts = onHome ? homeGamesTab === "rec" : (homeGamesTab === "rec" || (typeof startTab === "string" && startTab === "rec"));
  const counts = showCounts ? homeLeagueCounts(games) : null;
  const row = document.createElement("span");
  row.className = "desk-games-leagues";
  ["", ...leagues].forEach((league) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `desk-games-league${league === on ? " on" : ""}`;
    const n = counts && Number(counts[league] || 0);
    if (!league && counts) {
      chip.innerHTML = `All <i class="desk-tab-n">${n}</i>`;
      chip.setAttribute("aria-label", `All ${n}`);
    } else chip.textContent = league || "All";
    chip.setAttribute("aria-pressed", String(league === on));
    chip.addEventListener("click", () => { homeLeague = league; box.scrollTop = 0; homeLeagueSave(box); });
    row.append(chip);
  });
  return [row];
}

function homeWeekNote(box, league) {
  const line = document.createElement("p");
  line.className = "desk-games-note";
  const go = document.createElement("button");
  go.type = "button";
  go.className = "desk-games-link";
  go.textContent = league ? `See ${league} for the week` : "See this week's picks";
  go.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    homeRecs = null;
    if (box) { box.dataset.sig = ""; box.scrollTop = 0; }
    homeRecsLoad("week");
    homeGamesPaint();
  });
  line.append(document.createTextNode(league ? `No ${league} picks tonight. ` : "No picks tonight. "), go);
  return line;
}

function homeRecRows(games, box) {
  const note = (text) => { const line = document.createElement("p"); line.className = "desk-games-note"; line.textContent = text; return [line]; };
  if (!homeRecs || (homeRecs.loading && !homeRecs.picks.length)) return note("Looking up the picks.");
  if (!homeRecs.picks.length) {
    if ((homeRecs.want || "auto") !== "week") return [homeWeekNote(box, "")];
    return note("No picks are posted yet.");
  }
  const league = homeLeagueOn(games), span = homeRecs.span || "today";
  // Keep the full featured set in the DOM so the dial can hide/show with CSS (like Live Less↔More).
  const featured = typeof corrHomeFeatured === "function" ? corrHomeFeatured(homeRecs.picks) : homeRecs.picks.slice();
  [homeRecs.bronze, homeRecs.silver, homeRecs.golden].filter(Boolean).forEach((ticket) => {
    if (!featured.some((pick) => pick && pick.label === ticket.label && pick.match === ticket.match)) featured.unshift(ticket);
  });
  const pool = featured
    .map((pick, index) => [pick, index])
    .filter(([pick]) => !league || homePickSport(pick) === league);
  const rows = pool.slice(0, 5);
  const head = span === "today" ? [] : [Object.assign(document.createElement("p"), { className: "desk-games-note desk-games-label", textContent: span === "tomorrow" ? "Tomorrow" : "Coming up" })];
  const guestMore = document.body.classList.contains("needs-member") && homeRecs.more > 0 ? [homeMoreNote()] : [];
  const memberMore = !document.body.classList.contains("needs-member") && homeRecs.picks.filter((pick) => !league || homePickSport(pick) === league).length > 5
    ? [Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: "Parlay's cut is up top. Open Build a bet for the rest of the board." })]
    : [];
  const empty = typeof recDialEmptyNote === "function" ? [recDialEmptyNote()] : [];
  if (rows.length) return [...head, ...empty, ...rows.map(([pick, index]) => homeRecRow(pick, index)), ...guestMore, ...memberMore];
  const when = span === "today" ? "tonight" : span === "tomorrow" ? "tomorrow" : "this week";
  if ((homeRecs.want || "auto") !== "week" && (span === "today" || !homeRecs.picks.length)) return [homeWeekNote(box, league || ""), ...guestMore];
  return [...(league ? [homeLeagueClearNote(box, `No ${league} picks ${when}.`)] : note(`No picks ${when}.`)), ...guestMore];
}

function homeMoreNote() {
  if (!document.body.classList.contains("needs-member")) return Object.assign(document.createElement("p"), { className: "desk-games-note", hidden: true });
  const line = document.createElement("p");
  line.className = "desk-games-note";
  const link = (label, mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "desk-games-link";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (window.tvTickStay) tvTickStay(); else if (window.tvTickRest) tvTickRest();
      if (window.goFull) goFull();
      if (window.showGateMode) showGateMode(mode);
    });
    return button;
  };
  line.append(link("Sign up", "join"), " or ", link("Sign in", "login"), " to see the rest.");
  return line;
}

function homeGameRows(games, box) {
  const league = homeLeagueOn(games), rows = games.filter((game) => !league || game.sport === league), when = startWhenSay();
  if (rows.length) return rows.map((game) => game.live ? homeLiveRow(game) : homeGamesRow(game));
  return [league ? homeLeagueClearNote(box, `No ${league} games ${when}.`) : Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: `No games ${when}.` })];
}

function homeGamesLeft() {
  const now = Date.now();
  return homeGamesList.some((game) => { const kick = Date.parse(game.kickoff || ""); return kick > now || (game.sport === "PGA" && kick > now - 5 * 24 * 60 * 60 * 1000); });
}

function startStrip(box) {
  const tab = homeGamesTab === "games" ? "games" : "rec";
  const board = homePickBoardNow();
  const built = startRecs(board, box, box);
  const gameNodes = built.games, picks = built.picks, all = built.all, recs = built.recs;
  const head = document.createElement("div");
  head.className = "desk-games-head";
  const tabs = document.createElement("span");
  tabs.className = "desk-games-tabs";
  const gameN = gameNodes.filter((node) => node.classList.contains("desk-game")).length;
  [["rec", "Recommended", picks.length], ["games", "Games", gameN]].forEach(([id, label, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `desk-games-tab${tab === id ? " on" : ""}`;
    button.innerHTML = `${label} <i class="desk-tab-n">${count}</i>`;
    button.setAttribute("aria-pressed", String(tab === id));
    button.setAttribute("aria-label", `${label} ${count}`);
    button.addEventListener("click", () => {
      if (homeGamesTab === id) return;
      homeGamesTab = id;
      if (typeof startTab !== "undefined") startTab = id;
      box.dataset.sig = "";
      box.scrollTop = 0;
      homeGamesPaint();
    });
    tabs.append(button);
  });
  head.append(tabs);
  const gamesNow = typeof leftGames === "function" ? leftGames() : [];
  if (typeof startFilterSay === "function" && typeof startFilterPack === "function") {
    const leagues = typeof homeLeagues === "function" ? homeLeagues(box, gamesNow) : [];
    const gameBar = typeof startGameBar === "function" ? startGameBar(gamesNow) : null;
    head.append(startFilterSay(gamesNow, box), startFilterPack(box, leagues, gameBar, board, picks, tab === "rec" ? "rec" : "games"));
  } else {
    head.append(startSpanBar());
    const leagues = homeLeagues(box, gamesNow);
    if (leagues.length) head.append(...leagues);
    if (tab === "rec" && typeof startRandomBar === "function") {
      const random = startRandomBar(board, picks);
      if (random) head.append(random);
    }
  }
  if (tab === "rec") {
    const live = document.querySelector("#desk-glass-in .find-board");
    const td = (live && (live.people || []).length && typeof startTdButton === "function" && startTdButton(live)) || homeTdChip(leftGames());
    if (td) head.append(td);
  }
  const dial = tab === "rec" && typeof recDialBar === "function" ? recDialBar(typeof startDialCommit === "function" ? startDialCommit : null) : null;
  const body = tab === "games" ? gameNodes : [...(dial ? [dial] : []), ...recs];
  box.replaceChildren(head, ...body);
  if (tab === "rec" && typeof recDialCountPaint === "function") recDialCountPaint(typeof recDialCountOf === "function" ? recDialCountOf(all) : { golden: 0, all: all.length });
  if (typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 2, { quiet: true });
  if (tab === "rec" && typeof priceMoveMark === "function") priceMoveMark();
}

function homeGamesTabs(box, games) {
  const tabs = document.createElement("span");
  tabs.className = "desk-games-tabs";
  const league = homeLeagueOn(games);
  [["rec", "Recommended"], ["games", `Games ${games.filter((game) => !league || game.sport === league).length}`]].forEach(([id, label]) => {
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
  const desk = document.getElementById("desk"), bg = document.getElementById("desk-bg");
  if (!desk || !bg) return;
  let box = document.getElementById("desk-games");
  if (!box) { box = document.createElement("div"); box.id = "desk-games"; box.hidden = true; desk.append(box); homeGamesGrow(box); }
  if (typeof startFiltersTuck === "function") startFiltersTuck(box);
  const guest = document.body.classList.contains("needs-member");
  const now = Date.now(), open = (game) => { const kick = Date.parse(game.kickoff || ""); return kick > now || (game.sport === "PGA" && kick > now - 5 * 24 * 60 * 60 * 1000); }, left = homeGamesList.filter(open), fresh = typeof sharedUnopened === "function" ? sharedUnopened() : [];
  if (!left.length && !guest) homeLaterLoad();
  const games = left.length ? left : [...homeLater.live.map((game) => ({ match: `${game.away.name} @ ${game.home.name}`, kickoff: game.when, sport: game.sport })), ...homeLater.tomorrow];
  if (homeGamesTab === "rec" && (!homeRecs || homeRecs.guest !== guest)) homeRecsLoad();
  void bg.offsetWidth;
  const top = Math.ceil(bg.getBoundingClientRect().bottom - desk.getBoundingClientRect().top);
  const hasRec = homeGamesTab === "rec" && homeRecs && (homeRecs.picks.length || homeRecs.loading);
  const show = (fresh.length > 0 || games.length > 0 || hasRec) && !desk.classList.contains("tv-full") && desk.clientHeight - top >= 100;
  const wasHidden = box.hidden;
  box.hidden = !show;
  document.body.classList.toggle("home-games-on", show);
  if (!show) { box.classList.remove("desk-games-tall"); return; }
  const menu = document.getElementById("desk-menu"), at = box.classList.contains("desk-games-tall") && menu ? Math.ceil(menu.getBoundingClientRect().bottom - desk.getBoundingClientRect().top) + 8 : top;
  box.style.top = `${at}px`;
  document.body.style.setProperty("--home-games-top", `${at + 12}px`);
  if (!fresh.length) {
    if (startNeedsWeek()) startWeekLoad();
    if (!guest) homeLaterLoad();
    homeRecsLoad(startNeedsWeek() ? "week" : "auto");
    homePickBoardLoad();
  }
  homeLogosLoad();
  homeLeagueSync();
  const kinds = typeof startKinds !== "undefined" ? [...startKinds].sort().join(",") : "";
  const favOn = typeof startFavOnly !== "undefined" && startFavOnly ? "f" : "";
  const peopleN = homePickBoard && (homePickBoard.people || []).length;
  const gamesPick = typeof startPickGames !== "undefined" ? [...startPickGames].sort().join(",") : "";
  const sig = `${homeLeagueOpen}|${homeLeague}|${homeGamesTab}|${startSpan}|${gamesPick}|${startWeekLoading ? "w" : ""}|${startWeekAt}|${favOn}|${kinds}|${peopleN}|${(window.memberTeams || []).join(",")}|${homeRecs ? `${homeRecs.at}${homeRecs.loading ? "…" : ""}:${(homeRecs.picks || []).length}` : ""}|${fresh.length ? `shared:${fresh.map((item) => item.id).join(";")}` : games.map((game) => `${game.match}|${game.kickoff}`).join(";")}${left.length ? "" : `|${homeLater.at}`}`;
  if (box.dataset.sig === sig) { if (wasHidden) homeGamesWake(box); return; }
  box.dataset.sig = sig;
  if (!fresh.length && typeof startRecs === "function") { startStrip(box); homeGamesWake(box); return; }
  const head = document.createElement("p");
  head.className = "desk-games-head";
  const names = [...new Set(fresh.map((item) => item.fromName))];
  const said = document.createElement("span");
  said.className = "desk-games-said";
  said.textContent = `${names.length === 1 ? names[0] : "Your friends"} sent you ${fresh.length === 1 ? "a bet" : `${fresh.length} bets`}`;
  const leagues = fresh.length ? [] : homeLeagues(box, games);
  const td = !fresh.length && homeTdChip(games);
  if (td && leagues[0]) leagues[0].append(td);
  else if (td) {
    const row = document.createElement("span");
    row.className = "desk-games-leagues";
    row.append(td);
    leagues.push(row);
  }
  head.append(fresh.length ? said : homeGamesTabs(box, games), ...leagues);
  box.replaceChildren(head, ...(fresh.length ? fresh.map(homeSharedRow) : homeGamesTab === "rec" ? homeRecRows(games, box) : homeGameRows(games, box)));
  if (homeGamesTab === "rec" && typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 2, { quiet: true });
  homeGamesWake(box);
}

function homeGamesWake(box) {
  const at = box.scrollTop;
  box.style.overflowY = "hidden";
  void box.offsetHeight;
  requestAnimationFrame(() => { box.style.overflowY = ""; box.scrollTop = at; });
}

function homeGamesGrow(box) {
  const set = (tall) => {
    if (box.classList.contains("desk-games-tall") === tall) return;
    box.classList.toggle("desk-games-tall", tall); homeGamesPaint();
    if (!tall) return;
    box.style.overflowY = "hidden"; box.scrollTop = 0;
    setTimeout(() => { box.style.overflowY = ""; box.scrollTop = 0; }, 80);
  };
  let touchY = 0;
  box.addEventListener("scroll", () => { if (box.scrollTop > 8) set(true); }, { passive: true });
  box.addEventListener("wheel", (event) => { if (event.deltaY < 0 && box.scrollTop <= 0) set(false); }, { passive: true });
  box.addEventListener("touchstart", (event) => { touchY = event.touches[0].clientY; }, { passive: true });
  box.addEventListener("touchmove", (event) => { if (event.touches[0].clientY > touchY + 12 && box.scrollTop <= 0) set(false); }, { passive: true });
}

setInterval(() => { homeGamesLoad(); homeGamesPaint(); }, 500);
