const OPEN_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "NCAAB", "PGA", "Golf", "Soccer", "Tennis", "UFC", "MMA", "CFL", "Football", "Basketball", "Baseball", "Hockey", "Boxing", "Cricket", "Rugby", "Darts", "Table tennis", "Handball", "eSports"];
const OPEN_CARDS = [
  ["band", "−150 to +100 window"],
  ["todayBet", "Highest chance parlay today"],
  ["chalk", "−400 to −700 legs, near −180"],
  ["four", "Four yardage legs near 85% each"],
  ["plus", "Four yardage legs near +250"],
  ["hits", "Five near 90% vs four near 80%"],
  ["weekThree", "3 legs, different days, near −200"],
  ["weekFive", "5 legs, different days, near −200"],
  ["weekSafe", "3 legs, different days, near −350"],
  ["weekEven", "3 legs, different days, near −100"],
  ["safe2", "Safe 2-leg, both 75%+"],
  ["mid3", "3 legs, −250 to −400"],
  ["win4", "4 legs, −150 to −300"],
  ["plusLegs", "+100 to +200 legs"],
  ["mix21", "2 favorites and 1 underdog"],
  ["low3", "Low-variance 3-leg"],
  ["yards3", "3 yardage legs near 80% each"],
  ["ou4", "2 overs and 2 unders"],
  ["alt3", "Alt lines, 3 legs, 85%+"],
  ["games4", "4 legs, 4 different games"],
  ["early3", "Early slate, 2 to 3 legs"],
  ["prime3", "Prime time, 3 legs"],
  ["weekend4", "Weekend special, 4 legs"], ["td2", "2 NFL players, 1 TD each"], ["td3", "3 NFL players, 1 TD each"],
];
const OPEN_KINDS = [
  ["yards", "Yards"],
  ["points", "Points"],
  ["assists", "Assists"],
  ["rebounds", "Rebounds"],
  ["shots", "Shots"],
  ["saves", "Saves"],
  ["strikeouts", "Strikeouts"],
  ["threes", "Threes"],
  ["totals", "Totals"],
  ["spreads", "Spreads"],
];
const OPEN_WHEN = [
  ["live", "Live"],
  ["later", "Not started"],
  ["ahead", "A leg won"],
];
function keptLeagues(next) { try { if (arguments.length) localStorage.setItem("parlay-leagues", JSON.stringify(next)); else return JSON.parse(localStorage.getItem("parlay-leagues") || "[]").filter((name) => typeof name === "string"); } catch (error) {} return []; }
const openFilter = { exact: false, sports: keptLeagues(), cards: [], legs: [], kinds: [], when: [], game: "" };
let openFilterSig = "";

function openTickets() {
  const board = window.state && window.state.board;
  return ((board && board.archive) || []).filter((ticket) => !ticket.result || ticket.result === "open");
}

function legSport(leg) {
  if (leg.sport) return leg.sport;
  const match = String(leg.label || "").match(/—\s*([^,]+),/);
  return match ? match[1].trim() : "";
}

function sportsIn(names) {
  const found = [...names].filter(Boolean);
  const rest = found.filter((name) => !OPEN_SPORTS.includes(name)).sort();
  return OPEN_SPORTS.filter((name) => found.includes(name)).concat(rest);
}

function legKinds(leg) {
  const text = `${leg.label || ""} ${leg.market || ""}`.toLowerCase();
  const kinds = [];
  if (/yard|receiving|rushing|passing/.test(text)) kinds.push("yards");
  if (/point/.test(text)) kinds.push("points");
  if (/assist/.test(text)) kinds.push("assists");
  if (/rebound/.test(text)) kinds.push("rebounds");
  if (/shot/.test(text)) kinds.push("shots");
  if (/save/.test(text)) kinds.push("saves");
  if (/strikeout/.test(text)) kinds.push("strikeouts");
  if (/three/.test(text)) kinds.push("threes");
  if (/total/.test(text)) kinds.push("totals");
  if (/spread|puck line|run line|handicap/.test(text)) kinds.push("spreads");
  return kinds;
}

function ticketSports(ticket) {
  return new Set((ticket.legs || []).map(legSport).filter(Boolean));
}

function ticketKinds(ticket) {
  return [...new Set((ticket.legs || []).flatMap(legKinds))];
}

function legWhen(leg) {
  const tags = [];
  if (leg.result === "won") tags.push("ahead");
  const kick = Date.parse(leg.kickoff || "");
  const started = Number.isFinite(kick) && kick <= Date.now();
  const counting = leg.have != null && leg.have !== "";
  tags.push(started || counting ? "live" : "later");
  return tags;
}

function ticketWhen(ticket) {
  const legs = ticket.legs || [];
  const tags = [];
  if (legs.some((leg) => leg.result === "won")) tags.push("ahead");
  const kick = Date.parse(ticket.kickoff || (legs.find((leg) => leg.kickoff) || {}).kickoff || "");
  const started = Number.isFinite(kick) && kick <= Date.now();
  const counting = legs.some((leg) => leg.have != null && leg.have !== "");
  tags.push(started || counting ? "live" : "later");
  return tags;
}

function matchesOpen(ticket) {
  const legs = ticket.legs || [];
  const sports = ticketSports(ticket);
  if (openFilter.sports.length) {
    const exactSports = openFilter.exact && legs.length && legs.every((leg) => openFilter.sports.includes(legSport(leg)));
    const anySport = openFilter.sports.some((sport) => sports.has(sport));
    if (!(openFilter.exact ? exactSports : anySport)) return false;
  }
  if (openFilter.cards.length && !openFilter.cards.includes(ticket.card)) return false;
  const count = String(legs.length);
  if (openFilter.legs.length && !openFilter.legs.includes(count)) return false;
  if (openFilter.kinds.length) {
    const exactKinds = openFilter.exact && legs.length && legs.every((leg) => legKinds(leg).some((kind) => openFilter.kinds.includes(kind)));
    const anyKind = openFilter.kinds.some((kind) => ticketKinds(ticket).includes(kind));
    if (!(openFilter.exact ? exactKinds : anyKind)) return false;
  }
  const when = ticketWhen(ticket);
  if (openFilter.when.length && !openFilter.when.some((tag) => when.includes(tag))) return false;
  if (openFilter.game && ticket.game !== openFilter.game) return false;
  return true;
}

function chip(group, value, label, on) {
  return `<button type="button" class="${on ? "on" : ""}" data-filter="${group}" data-value="${value}">${label}</button>`;
}

function drawOpenFilters(rows) {
  const box = document.getElementById("open-filters");
  if (!box) return;
  const sports = sportsIn(rows.flatMap((ticket) => [...ticketSports(ticket)]).concat(((window.state && window.state.board && window.state.board.games) || []).map((game) => game.sport)));
  const cards = OPEN_CARDS.filter(([id]) => rows.some((ticket) => ticket.card === id));
  const legCounts = ["2", "3", "4", "5"].filter((count) => rows.some((ticket) => String((ticket.legs || []).length) === count));
  const kinds = OPEN_KINDS.filter(([id]) => rows.some((ticket) => ticketKinds(ticket).includes(id)));
  const when = OPEN_WHEN.filter(([id]) => (id !== "live" || (window.state && window.state.showLive)) && rows.some((ticket) => ticketWhen(ticket).includes(id)));
  const games = [...new Set(rows.map((ticket) => ticket.game).filter(Boolean))].sort();
  const sig = [sports, cards.map((row) => row[0]), legCounts, kinds.map((row) => row[0]), when.map((row) => row[0]), games].join("|");
  if (sig === openFilterSig) return;
  openFilterSig = sig;
  const row = (name, html) => (html ? `<div class="row"><span class="name">${name}</span>${html}</div>` : "");
  const gameOptions = [`<option value="">All games</option>`].concat(games.map((game) => (
    `<option value="${esc(game)}"${game === openFilter.game ? " selected" : ""}>${esc(game)}</option>`
  ))).join("");
  const clear = Object.values(openFilter).some((value) => (Array.isArray(value) ? value.length : value))
    ? chip("clear", "1", "Clear", false)
    : "";
  box.innerHTML = [
    row("Match", chip("exact", "1", "Exact", openFilter.exact)),
    row("League", sports.map((sport) => chip("sports", sport, sport, openFilter.sports.includes(sport))).join("")),
    row("Card", cards.map(([id, label]) => chip("cards", id, label, openFilter.cards.includes(id))).join("")),
    row("Legs", legCounts.map((count) => chip("legs", count, count, openFilter.legs.includes(count))).join("")),
    row("Status", when.map(([id, label]) => chip("when", id, label, openFilter.when.includes(id))).join("") + clear),
    row("Prop", kinds.map(([id, label]) => chip("kinds", id, label, openFilter.kinds.includes(id))).join("")),
    row("Game", `<select id="open-game">${gameOptions}</select>`),
  ].join("");
}

function legMatches(leg) {
  const picked = openFilter.sports.length || openFilter.kinds.length || openFilter.when.length;
  if (!picked) return false;
  if (openFilter.sports.length && !openFilter.sports.includes(legSport(leg))) return false;
  if (openFilter.kinds.length && !legKinds(leg).some((kind) => openFilter.kinds.includes(kind))) return false;
  if (openFilter.when.length && !openFilter.when.some((tag) => legWhen(leg).includes(tag))) return false;
  return true;
}

function markMatchingLegs(list, shown) {
  const narrowed = openFilter.sports.length || openFilter.kinds.length || openFilter.when.length;
  list.classList.toggle("leg-focus", Boolean(narrowed));
  if (!narrowed) return;
  shown.forEach((ticket, index) => {
    const rows = [...list.children[index].querySelectorAll("ol > li:not(.split)")];
    (ticket.legs || []).forEach((leg, legIndex) => {
      if (legMatches(leg) && rows[legIndex]) rows[legIndex].classList.add("leg-hit");
    });
  });
}

function applyOpenFilter(rows) {
  const shown = rows.filter(matchesOpen);
  const list = document.getElementById("open-list");
  const score = document.getElementById("open-score");
  if (list) {
    list.innerHTML = shown.map((ticket) => pickRow(ticket, true)).join("");
    markMatchingLegs(list, shown);
  }
  if (!score) return;
  if (!rows.length) score.textContent = "No open bets yet.";
  else if (shown.length === rows.length) score.textContent = `${rows.length} open. Each one is waiting on a box score.`;
  else score.textContent = shown.length ? `Showing ${shown.length} of ${rows.length} open bets.` : "No open bets match these filters.";
}

function paintOpenFilters() {
  if (!(window.state && window.state.showLive)) openFilter.when = openFilter.when.filter((id) => id !== "live");
  const rows = openTickets();
  drawOpenFilters(rows);
  applyOpenFilter(rows);
}

function bindOpenFilters() {
  const box = document.getElementById("open-filters");
  if (!box || box.dataset.bound) return;
  box.dataset.bound = "1";
  box.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    if (button.dataset.filter === "clear") {
      openFilter.exact = false;
      openFilter.sports = [];
      openFilter.cards = [];
      openFilter.legs = [];
      openFilter.kinds = [];
      openFilter.when = [];
      openFilter.game = "";
    } else if (button.dataset.filter === "exact") {
      openFilter.exact = !openFilter.exact;
    } else {
      const list = openFilter[button.dataset.filter];
      const value = button.dataset.value;
      const index = list.indexOf(value);
      if (index >= 0) list.splice(index, 1);
      else list.push(value);
    }
    if (button.dataset.filter === "clear" || button.dataset.filter === "sports") keptLeagues(openFilter.sports);
    openFilterSig = "";
    paintOpenFilters();
  });
  box.addEventListener("change", (event) => {
    if (event.target.id !== "open-game") return;
    openFilter.game = event.target.value;
    applyOpenFilter(openTickets());
  });
}

const priorOpenPaint = window.paintChoices;
window.paintChoices = function paintWithFilters() {
  if (priorOpenPaint) priorOpenPaint();
  paintOpenFilters();
};

bindOpenFilters();

const recFilter = { when: "", sports: keptLeagues(), game: "", kind: "", legs: "", aim: "", find: "" };
let recFiltersOpen = false;
let recAllOpen = false;
let recPast = false;
let recSort = "1";
let recSortHigh = true;
const REC_PAY = [["top", "Safest"], ["safe", "Safe"], ["good", "Good"], ["payout", "Big payout"]];
let recKinds = [], recKindsKey = "";

function recDayKey(ms) { return (recDayKey.fmt || (recDayKey.fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }))).format(ms); }

function recSpan(ticket) {
  const now = Date.now();
  const today = recDayKey(now);
  const past = !!window.recPast;
  const end = recDayKey(now + (past ? -14 : 14) * 86400000);
  const source = past && ticket.settledAt ? [ticket.settledAt] : [ticket.kickoff, ...(ticket.legs || []).map((leg) => leg.kickoff)];
  const days = [...new Set(source.map((iso) => Date.parse(iso || "")).filter((ms) => Number.isFinite(ms) && (past ? ms <= now : ms > now)).map(recDayKey))];
  if (!days.length) return ["weekThree", "weekFive", "weekSafe", "weekEven"].includes(ticket.card) ? "week" : "today";
  if (days.every((day) => day === today)) return "today";
  return days.every((day) => past ? day >= end : day <= end) ? "week" : "later";
}

function recLeagues(ticket) {
  const known = [...ticketSports(ticket)].filter(Boolean);
  if (known.length) return [...new Set(known)];
  const game = String(ticket.game || "").replace(/\s*\([^)]*\)/g, "");
  const sides = game.split(/\s+at\s+|\s+@\s+/i).map((side) => side.trim().split(" ").pop()).filter((word) => word && word.length > 3);
  if (sides.length < 2) return [];
  const hits = ((window.state && window.state.board && window.state.board.games) || []).filter((row) => row.sport && sides.every((word) => String(row.match || "").includes(word)));
  const sports = [...new Set(hits.map((row) => row.sport))];
  return sports.length === 1 ? sports : [];
}

function recLegKind(leg) {
  const market = String(leg.market || "");
  const source = /^game specials/i.test(market) ? String(leg.runner || leg.label || "").replace(/^.*?(?=\d)/, "") : market.split(" - ").pop();
  const scope = (market.toLowerCase().match(/\b(\d+(?:st|nd|rd|th)\s+drive)\b/) || [])[1] || "";
  let text = `${scope} ${source}`.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(alt|alternate)\b/g, " ").replace(/\d+(?:\.\d+)?\s*\+/g, " ").replace(/\b(player to record|player to score|player to hit|to record|to score|to hit|a|an|the)\b/g, " ").replace(/\byds\b/g, "yards").replace(/\btds\b/g, "touchdowns").replace(/\btd\b/g, "touchdown").replace(/\bpts\b/g, "points").replace(/\breb\b/g, "rebounds").replace(/\bast\b/g, "assists").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim().replace(/^(record|score)\s+/, "");
  if (text === "hit") text = "hits"; else if (text.endsWith(" hit")) text = `${text.slice(0, -3)}hits`;
  return /^(popular|passing|receiving|rushing)$/.test(text) ? "" : text;
}
function recKindGames() { const game = recFilter.game && ((window.state && window.state.board && window.state.board.games) || []).find((row) => row.match === recFilter.game); return game && game.id ? [String(game.id)] : []; }
function recEnsureKinds(board) {
  const sports = recFilter.sports.slice().sort(), when = recFilter.when === "today" ? "today" : "week", gameIds = recKindGames(), key = `${when}|${sports.join(",")}|${gameIds.join(",")}`;
  if (key === recKindsKey) return;
  recKindsKey = key; recKinds = [];
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "kinds", sports: recFilter.sports, gameIds, when, college: !["props", "both", "tourney", "off"].includes(window.memberLaw || "") }) }).then((res) => res.json()).then((data) => {
    if (recKindsKey !== key || !board.isConnected) return;
    recKinds = data.kinds || []; if (recFilter.kind && !recKinds.includes(recFilter.kind)) recFilter.kind = "";
    const bar = board.querySelector(".rec-filters"), note = board.querySelector(".rec-none"); if (bar) bar.remove(); if (note) note.remove(); paintRecFilters(board);
  }).catch(() => { if (recKindsKey === key) recKindsKey = ""; });
}

function recPay(ticket) {
  const price = Number(ticket.american);
  if (!Number.isFinite(price)) return "";
  if (price >= 150) return "payout";
  if (price > -150) return "good";
  if (price > -300) return "safe";
  return "top";
}

function recChance(ticket) {
  const pct = Number(ticket.impliedPct);
  if (Number.isFinite(pct)) return pct;
  const price = Number(ticket.american);
  return Number.isFinite(price) ? -price : 0;
}

function listedRecs(board) {
  return [...board.querySelectorAll(".rec-bet")].map((bet) => (window.recTickets || [])[Number(bet.dataset.rec)]).filter(Boolean);
}

function recMatch(ticket) {
  const span = recSpan(ticket);
  if (recFilter.when === "today" && span !== "today") return false;
  if (recFilter.when === "week" && span !== "today" && span !== "week") return false;
  const leagues = recLeagues(ticket);
  if (recFilter.sports.length && (!leagues.length || leagues.some((name) => !recFilter.sports.includes(name)))) return false;
  if (recFilter.game && !recGameHit(ticket, recFilter.game)) return false;
  if (recFilter.kind) {
    const kinds = (ticket.legs || []).map(recLegKind);
    if (!kinds.some((kind) => kind === recFilter.kind) || kinds.some((kind) => kind && kind !== recFilter.kind)) return false;
  }
  if (recFilter.legs && String((ticket.legs || []).length) !== recFilter.legs) return false;
  if (recFilter.aim && recFilter.aim !== "top" && recPay(ticket) !== recFilter.aim) return false;
  return recHit(ticket, recFilter.find);
}

function recApply(board) {
  const picks = [...board.querySelectorAll(".rec-bet")];
  let shown = picks.filter((bet) => recMatch((window.recTickets[Number(bet.dataset.rec)] || {}).ticket || {}));
  if (recFilter.aim === "top" && shown.length) {
    const best = Math.max(...shown.map((bet) => recChance(window.recTickets[Number(bet.dataset.rec)].ticket)));
    shown = shown.filter((bet) => recChance(window.recTickets[Number(bet.dataset.rec)].ticket) === best);
  }
  const keep = new Set(shown);
  const narrowed = recFilter.when || recFilter.sports.length || recFilter.game || recFilter.kind || recFilter.legs || recFilter.aim || recFilter.find.trim();
  picks.forEach((bet) => bet.classList.toggle("rec-off", narrowed && !keep.has(bet)));
  board.querySelectorAll(".rec-strategy").forEach((block) => {
    const bets = [...block.querySelectorAll(".rec-bet")].filter((bet) => !bet.classList.contains("rec-off"));
    block.classList.toggle("rec-off", narrowed && !bets.length);
    const count = block.querySelector(".rec-count");
    if (count) count.textContent = bets.length;
  });
  const note = board.querySelector(".rec-none");
  if (note) note.hidden = !narrowed || shown.length > 0;
}

function recChip(group, value, label, on) {
  return `<button type="button" data-rec="${group}" data-value="${esc(value)}" class="${on ? "on" : ""}">${esc(label).replace(/ (\d+)$/, ' <span class="n">$1</span>')}</button>`;
}

function recOrder(board) {
  const blocks = [...board.querySelectorAll(".rec-strategy")];
  blocks.forEach((block, index) => { if (block.dataset.order == null) block.dataset.order = String(index); });
  const index = recSort === "" ? NaN : Number(recSort);
  blocks.sort((a, b) => {
    if (!Number.isFinite(index)) return Number(a.dataset.order) - Number(b.dataset.order);
    const left = parseFloat((a.dataset.rates || "").split(",")[index]);
    const right = parseFloat((b.dataset.rates || "").split(",")[index]);
    const aOk = Number.isFinite(left);
    const bOk = Number.isFinite(right);
    if (aOk !== bOk) return aOk ? -1 : 1;
    if (left === right) return Number(a.dataset.order) - Number(b.dataset.order);
    return recSortHigh ? right - left : left - right;
  });
  blocks.forEach((block) => {
    board.append(block);
    const rate = parseFloat((block.dataset.rates || "").split(",")[index]);
    block.classList.toggle("rec-cold", Number.isFinite(index) && Number.isFinite(rate) && rate < 65);
    block.querySelectorAll(".rec-history span").forEach((mark) => mark.classList.toggle("on", mark.dataset.rate === recSort));
  });
}

function recGameOptions(rows) {
  const sports = recFilter.sports;
  if (!sports.length) return [...new Set(rows.map((ticket) => ticket.game).filter(Boolean))].sort();
  const now = Date.now();
  const past = !!window.recPast;
  const today = recDayKey(now);
  const end = recDayKey(now + (past ? -14 : 14) * 86400000);
  const listed = ((window.state && window.state.board && window.state.board.games) || []).filter((game) => {
    if (!game || !game.match || !sports.includes(game.sport)) return false;
    const kick = Date.parse(game.kickoff || "");
    if (!Number.isFinite(kick)) return false;
    const day = recDayKey(kick);
    if (past) return kick <= now && day >= end;
    if (kick <= now) return false;
    if (recFilter.when === "today") return day === today;
    return day <= end;
  }).sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff))).map((game) => game.match);
  const extra = rows.filter((ticket) => ticket.game && !listed.includes(ticket.game) && recLeagues(ticket).some((sport) => sports.includes(sport))).map((ticket) => ticket.game);
  return [...new Set(listed.concat(extra))];
}

function recGameHit(ticket, name) {
  if (ticket.game === name) return true;
  const game = ((window.state && window.state.board && window.state.board.games) || []).find((row) => row.match === name);
  const id = game ? String(game.id || "") : "";
  if (id && (ticket.legs || []).some((leg) => String(leg.gameId || "") === id)) return true;
  const sides = String(name).replace(/\s*\([^)]*\)/g, "").split(/\s+at\s+|\s+@\s+|\s+v\s+|\s+vs\.?\s+/i).map((side) => side.trim().split(/\s+/).pop()).filter((word) => word && word.length > 3);
  const text = [ticket.game].concat((ticket.legs || []).map((leg) => `${leg.label || ""} ${leg.match || ""}`)).join(" ");
  return sides.length >= 2 && sides.every((word) => text.includes(word));
}

function recSay() {
  const sports = recFilter.sports, league = sports.length > 1 ? `${sports.slice(0, -1).join(", ")} and ${sports.at(-1)}` : (sports[0] || ""), picks = recFilter.legs === "1" ? "1-pick" : recFilter.legs ? `${recFilter.legs}-pick` : "", pay = { safe: "safe", good: "good", payout: "best-paying" }[recFilter.aim] || "";
  const bits = [pay, picks, league, recFilter.kind || ""].filter(Boolean).join(" "), time = recFilter.when === "today" ? " from today" : recFilter.when === "week" ? " from this week" : "", game = `${recFilter.game ? ` for ${recFilter.game}` : ""}${recFilter.find.trim() ? ` for ${recFilter.find.trim()}` : ""}`;
  const order = `Parlay the Parrot picked these strategies, ${recSortHigh ? "highest" : "lowest"} ${["today", "this week", "this month", "this year"][Number(recSort)] || "this week"} first.`;
  const tail = `${bits ? `${bits} ` : ""}${recPast ? "finished bets" : "bets"}${time}${game}`;
  if (recFilter.aim === "top") return `The safest of these ${tail}. ${order}`;
  if (!recFilter.when && !sports.length && !recFilter.game && !recFilter.kind && !recFilter.legs && !pay && !recFilter.find.trim()) return `${recPast ? "Every finished bet" : "Every bet you can place"}. ${order}`;
  return `${tail.charAt(0).toUpperCase()}${tail.slice(1)}. ${order}`;
}
function recWho(ticket) {
  const bag = new Set(), add = (name, team) => { let text = String(name || "").replace(/\s*\([^)]*\)/g, "").split(/\n|—/)[0].trim(); if (!team) text = text.split(",")[0].replace(/\s+\d.*$/, "").replace(/\s+(over|under|to|by)\b.*$/i, "").trim(); if (text && !/^(over|under|yes|no)$/i.test(text)) bag.add(text); };
  (ticket.legs || []).forEach((leg) => { add(leg.player || String(leg.label || "").split(",")[0]); String(leg.match || ticket.game || "").split(/\s+at\s+|\s+@\s+|\s+v\s+|\s+vs\.?\s+/i).forEach((side) => add(side, true)); });
  return [...bag];
}
function recHit(ticket, query) { const q = String(query || "").trim().toLowerCase(); return !q || recWho(ticket).some((name) => name.toLowerCase().includes(q)); }
function recHints(list, query) {
  const q = String(query || "").trim().toLowerCase(), names = q ? [...new Set(list.flatMap(recWho))] : [];
  return names.filter((name) => name.toLowerCase().startsWith(q)).concat(names.filter((name) => { const low = name.toLowerCase(); return !low.startsWith(q) && low.includes(q); })).slice(0, 8);
}

function recTally(rows, key, value) {
  if (recTally.rows !== rows) {
    recTally.rows = rows; const fact = rows.map((ticket) => ({ ticket, span: recSpan(ticket), leagues: [...new Set(recLeagues(ticket))], legs: String((ticket.legs || []).length), pay: recPay(ticket), chance: recChance(ticket) })); const keep = (row, skip) => (skip === "when" || ((recFilter.when !== "today" || row.span === "today") && (recFilter.when !== "week" || row.span === "today" || row.span === "week"))) && (skip === "sports" || !recFilter.sports.length || (row.leagues.length && row.leagues.every((name) => recFilter.sports.includes(name)))) && (skip === "game" || !recFilter.game || recGameHit(row.ticket, recFilter.game)) && (skip === "legs" || !recFilter.legs || row.legs === recFilter.legs) && (skip === "aim" || !recFilter.aim || recFilter.aim === "top" || row.pay === recFilter.aim) && (skip === "kind" || !recFilter.kind || ((row.kinds || (row.kinds = (row.ticket.legs || []).map(recLegKind))).includes(recFilter.kind) && row.kinds.every((kind) => !kind || kind === recFilter.kind)) && recHit(row.ticket, recFilter.find)); const hit = (skip) => { const list = fact.filter((row) => keep(row, skip)); if (!(recFilter.aim === "top" && skip !== "aim" && list.length)) return list; const best = Math.max(...list.map((row) => row.chance)); return list.filter((row) => row.chance === best); };
    const bag = { when: {}, sports: {}, game: {}, kind: {}, legs: {}, aim: {} }, add = (group, id) => { group[id] = (group[id] || 0) + 1; }, open = paintRecFilters.shut || {}; hit("when").forEach((row) => add(bag.when, row.span)); bag.when.week = (bag.when.today || 0) + (bag.when.week || 0); hit("sports").forEach((row) => { if (row.leagues.length === 1) add(bag.sports, row.leagues[0]); }); hit("legs").forEach((row) => { add(bag.legs, row.legs); add(bag.legs, ""); }); hit("aim").forEach((row) => { if (row.pay) add(bag.aim, row.pay); }); const aimed = hit("aim"); if (aimed.length) bag.aim.top = aimed.filter((row) => row.chance === Math.max(...aimed.map((row) => row.chance))).length; if (open.Prop === false || recFilter.kind) hit("kind").forEach((row) => { const names = [...new Set((row.kinds || (row.kinds = (row.ticket.legs || []).map(recLegKind))).filter(Boolean))]; if (names.length === 1) add(bag.kind, names[0]); add(bag.kind, ""); }); const wanted = open.Game === false ? (recTally.games || []) : (recFilter.game ? [recFilter.game] : []), found = hit("game"); bag.game[""] = found.length; if (wanted.length) { const byName = new Map(((window.state && window.state.board && window.state.board.games) || []).filter((game) => game && game.match).map((game) => [game.match, String(game.id || "")])); const sides = new Map(wanted.map((name) => [name, String(name).replace(/\s*\([^)]*\)/g, "").split(/\s+at\s+|\s+@\s+|\s+v\s+|\s+vs\.?\s+/i).map((side) => side.trim().split(/\s+/).pop()).filter((word) => word && word.length > 3)])); found.forEach((row) => { const text = [row.ticket.game].concat((row.ticket.legs || []).map((leg) => `${leg.label || ""} ${leg.match || ""}`)).join(" "); const ids = new Set((row.ticket.legs || []).map((leg) => String(leg.gameId || ""))); wanted.forEach((name) => { const id = byName.get(name) || ""; const bits = sides.get(name) || []; if (row.ticket.game === name || (id && ids.has(id)) || (bits.length >= 2 && bits.every((word) => text.includes(word)))) add(bag.game, name); }); }); } recTally.bag = bag;
  }
  return (recTally.bag[key] || {})[value] || 0;
}
function paintRecFilters(board) {
  if (recFiltersOpen) recEnsureKinds(board);
  const rows = listedRecs(board).map((row) => row.ticket);
  const leagues = sportsIn(rows.flatMap((ticket) => recLeagues(ticket)).concat(((window.state && window.state.board && window.state.board.games) || []).map((game) => game.sport)));
  const games = recGameOptions(rows); recTally.games = games;
  if (recFilter.game && !games.includes(recFilter.game)) recFilter.game = "";
  const on = recFilter.when || recFilter.sports.length || recFilter.game || recFilter.kind || recFilter.legs || recFilter.aim || recFilter.find.trim();
  const line = (name, html, fold) => (html ? `<div class="row${fold ? ` fold${(paintRecFilters.shut || (paintRecFilters.shut = {}))[name] === false ? "" : " tuck"}` : ""}"><span class="name">${name}</span>${html}</div>` : "");
  const bar = document.createElement("div");
  bar.className = "rec-filters";
  if (recFiltersOpen) bar.classList.add("open");
  bar.innerHTML = [
    `<div class="rec-head"><span class="rec-tools"><button type="button" class="rec-fold${on ? " on" : ""}" data-rec="fold">Filters</button><button type="button" class="rec-past${recPast ? " on" : ""}" data-rec="past">History</button>${on ? recChip("clear", "1", "Clear", false) : ""}</span><button type="button" class="rec-expand" data-rec="expand">${recAllOpen ? "Collapse all" : "Expand all"}</button></div>`,
    `<label class="rec-find"><input type="search" placeholder="Player or team" value="${esc(recFilter.find)}" autocomplete="off"><span class="rec-hints" hidden></span></label>`,
    `<div class="rec-sort"><span class="name">Sort</span>${["Day", "Week", "Month", "Year"].map((label, index) => recChip("sort", String(index), recSort === String(index) ? `${label} ${recSortHigh ? "↓" : "↑"}` : label, recSort === String(index))).join("")}</div>`,
    line("When", recChip("when", "today", `Today ${recTally(rows, "when", "today")}`, recFilter.when === "today") + recChip("when", "week", `This week ${recTally(rows, "when", "week")}`, recFilter.when === "week")),
    line("League", leagues.map((name) => recChip("sports", name, `${name} ${recTally(rows, "sports", name)}`, recFilter.sports.includes(name))).join(""), true),
    line("Game", recChip("game", "", `Any game ${recTally(rows, "game", "")}`, !recFilter.game) + games.map((game) => recChip("game", game, `${game} ${recTally(rows, "game", game)}`, recFilter.game === game)).join(""), true),
    line("Prop", recChip("kind", "", `Any player prop ${recTally(rows, "kind", "")}`, !recFilter.kind) + recKinds.map((name) => recChip("kind", name, `${name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())} ${recTally(rows, "kind", name)}`, recFilter.kind === name)).join(""), true),
    line("Legs", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => recChip("legs", count ? String(count) : "", `${count ? (count === 1 ? "1 pick" : `${count} picks`) : "Any number"} ${recTally(rows, "legs", count ? String(count) : "")}`, count ? recFilter.legs === String(count) : !recFilter.legs)).join(""), true),
    line("Pay", REC_PAY.map(([id, label]) => recChip("aim", id, `${label} ${recTally(rows, "aim", id)}`, recFilter.aim === id)).join("")),
    `<p class="rec-say">${esc(recSay())}</p>`,
  ].join("");
  const note = document.createElement("p");
  note.className = "rec-none";
  note.hidden = true;
  note.textContent = "None of these fit.";
  board.prepend(note);
  board.prepend(bar);
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rec]");
    if (event.target.closest(".row.fold .name")) { const row = event.target.closest(".row"); row.classList.toggle("tuck"); (paintRecFilters.shut = paintRecFilters.shut || {})[row.querySelector(".name").textContent] = row.classList.contains("tuck"); if (!row.classList.contains("tuck")) { bar.remove(); note.remove(); paintRecFilters(board); } return; }
    if (!button) return;
    if (button.dataset.rec === "fold") { recFiltersOpen = !recFiltersOpen; bar.classList.toggle("open", recFiltersOpen); if (recFiltersOpen) recEnsureKinds(board); return; }
    if (button.dataset.rec === "past") { recPast = !recPast; window.recPast = recPast; recAllOpen = false; if (window.birdMenu) birdMenu("bets"); return; }
    if (button.dataset.rec === "sort") { if (recSort === button.dataset.value) recSortHigh = !recSortHigh; else { recSort = button.dataset.value; recSortHigh = true; } bar.remove(); note.remove(); paintRecFilters(board); return; }
    if (button.dataset.rec === "expand") { recAllOpen = !recAllOpen; board.querySelectorAll(".rec-strategy, .rec-bet").forEach((item) => item.classList.toggle("open", recAllOpen)); button.textContent = recAllOpen ? "Collapse all" : "Expand all"; return; }
    if (button.dataset.rec === "clear") { recFilter.when = ""; recFilter.sports = []; recFilter.game = ""; recFilter.kind = ""; recFilter.legs = ""; recFilter.aim = ""; recFilter.find = ""; } else if (button.dataset.rec === "sports") {
      const list = recFilter.sports;
      const index = list.indexOf(button.dataset.value);
      if (index >= 0) list.splice(index, 1);
      else list.push(button.dataset.value);
    } else recFilter[button.dataset.rec] = recFilter[button.dataset.rec] === button.dataset.value ? "" : button.dataset.value;
    if (button.dataset.rec === "clear" || button.dataset.rec === "sports") keptLeagues(recFilter.sports);
    bar.remove();
    note.remove();
    paintRecFilters(board);
  });
  const box = bar.querySelector(".rec-find input"), menu = bar.querySelector(".rec-hints"), applyFind = () => { recFilter.find = box.value; const fold = bar.querySelector(".rec-fold"); if (fold) fold.classList.toggle("on", !!(recFilter.when || recFilter.sports.length || recFilter.game || recFilter.kind || recFilter.legs || recFilter.aim || recFilter.find.trim())); const say = bar.querySelector(".rec-say"); if (say) say.textContent = recSay(); const names = recHints(rows, box.value); menu.innerHTML = names.map((name) => `<button type="button" data-hint="${esc(name)}">${esc(name)}</button>`).join(""); menu.hidden = !names.length; recApply(board); };
  box.addEventListener("input", applyFind); box.addEventListener("blur", () => setTimeout(() => { menu.hidden = true; }, 120)); box.addEventListener("keydown", (event) => { const picks = [...menu.querySelectorAll("button")]; let index = picks.findIndex((node) => node.classList.contains("on")); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!picks.length) return; index = event.key === "ArrowDown" ? (index + 1) % picks.length : (index <= 0 ? picks.length - 1 : index - 1); picks.forEach((node, at) => node.classList.toggle("on", at === index)); } else if (event.key === "Enter") { if (index >= 0) { event.preventDefault(); box.value = picks[index].dataset.hint; applyFind(); } menu.hidden = true; } else if (event.key === "Escape") menu.hidden = true; });
  menu.addEventListener("mousedown", (event) => { const pick = event.target.closest("[data-hint]"); if (!pick) return; event.preventDefault(); box.value = pick.dataset.hint; applyFind(); menu.hidden = true; });
  recApply(board);
  recOrder(board);
}

window.paintRecFilters = paintRecFilters;
