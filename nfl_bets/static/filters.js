const OPEN_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
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
const openFilter = { exact: false, sports: [], cards: [], legs: [], kinds: [], when: [], game: "" };
let openFilterSig = "";

function openTickets() {
  const board = window.state && window.state.board;
  return ((board && board.archive) || []).filter((ticket) => !ticket.result || ticket.result === "open");
}

function legSport(leg) {
  if (OPEN_SPORTS.includes(leg.sport)) return leg.sport;
  const match = String(leg.label || "").match(/—\s*(NFL|MLB|NBA|NHL|WNBA|NCAAF|PGA)\b/);
  return match ? match[1] : "";
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
  const sports = OPEN_SPORTS.filter((sport) => rows.some((ticket) => ticketSports(ticket).has(sport)));
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

const recFilter = { when: "", sports: [], game: "", kind: "", legs: "", aim: "" };
let recFiltersOpen = false;
let recAllOpen = false;
let recPast = false;
const REC_KINDS = [["yards", "Yards"], ["points", "Points"], ["assists", "Assists"], ["shots", "Shots"], ["strikeouts", "Strikeouts"], ["hits", "Hits"]];
const REC_PAY = [["top", "1 safest"], ["safe", "Safe"], ["good", "Good"], ["payout", "Best payout"]];

function recDayKey(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(ms);
}

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
  const known = [...ticketSports(ticket)].filter((name) => OPEN_SPORTS.includes(name));
  if (known.length) return [...new Set(known)];
  const game = String(ticket.game || "").replace(/\s*\([^)]*\)/g, "");
  const sides = game.split(/\s+at\s+|\s+@\s+/i).map((side) => side.trim().split(" ").pop()).filter((word) => word && word.length > 3);
  if (sides.length < 2) return [];
  const hits = ((window.state && window.state.board && window.state.board.games) || []).filter((row) => OPEN_SPORTS.includes(row.sport) && sides.every((word) => String(row.match || "").includes(word)));
  const sports = [...new Set(hits.map((row) => row.sport))];
  return sports.length === 1 ? sports : [];
}

function recLegKind(leg) {
  const text = `${leg.label || ""} ${leg.market || ""}`.toLowerCase();
  if (/yard/.test(text)) return "yards";
  if (/strikeout/.test(text)) return "strikeouts";
  if (/assist/.test(text)) return "assists";
  if (/shot/.test(text)) return "shots";
  if (/\bhits?\b|to record a hit/.test(text)) return "hits";
  if (/point/.test(text)) return "points";
  return "";
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
  if (recFilter.game && ticket.game !== recFilter.game) return false;
  if (recFilter.kind) {
    const kinds = (ticket.legs || []).map(recLegKind);
    if (!kinds.some((kind) => kind === recFilter.kind) || kinds.some((kind) => kind && kind !== recFilter.kind)) return false;
  }
  if (recFilter.legs && String((ticket.legs || []).length) !== recFilter.legs) return false;
  if (recFilter.aim && recFilter.aim !== "top" && recPay(ticket) !== recFilter.aim) return false;
  return true;
}

function recApply(board) {
  const picks = [...board.querySelectorAll(".rec-bet")];
  let shown = picks.filter((bet) => recMatch((window.recTickets[Number(bet.dataset.rec)] || {}).ticket || {}));
  if (recFilter.aim === "top" && shown.length) {
    const best = Math.max(...shown.map((bet) => recChance(window.recTickets[Number(bet.dataset.rec)].ticket)));
    shown = shown.filter((bet) => recChance(window.recTickets[Number(bet.dataset.rec)].ticket) === best);
  }
  const keep = new Set(shown);
  const narrowed = recFilter.when || recFilter.sports.length || recFilter.game || recFilter.kind || recFilter.legs || recFilter.aim;
  picks.forEach((bet) => bet.classList.toggle("rec-off", narrowed && !keep.has(bet)));
  board.querySelectorAll(".rec-strategy").forEach((block) => {
    const live = [...block.querySelectorAll(".rec-bet")].some((bet) => !bet.classList.contains("rec-off"));
    block.classList.toggle("rec-off", narrowed && !live);
  });
  const note = board.querySelector(".rec-none");
  if (note) note.hidden = !narrowed || shown.length > 0;
}

function recChip(group, value, label, on) {
  return `<button type="button" data-rec="${group}" data-value="${esc(value)}" class="${on ? "on" : ""}">${esc(label)}</button>`;
}

function paintRecFilters(board) {
  const rows = listedRecs(board).map((row) => row.ticket);
  const leagues = OPEN_SPORTS.filter((name) => rows.some((ticket) => recLeagues(ticket).includes(name)));
  const kinds = REC_KINDS.filter(([id]) => rows.some((ticket) => (ticket.legs || []).some((leg) => recLegKind(leg) === id)));
  const counts = [...new Set(rows.map((ticket) => (ticket.legs || []).length))].filter(Boolean).sort((a, b) => a - b);
  const games = [...new Set(rows.map((ticket) => ticket.game).filter(Boolean))].sort();
  const on = recFilter.when || recFilter.sports.length || recFilter.game || recFilter.kind || recFilter.legs || recFilter.aim;
  const line = (name, html) => (html ? `<div class="row"><span class="name">${name}</span>${html}</div>` : "");
  const bar = document.createElement("div");
  bar.className = "rec-filters";
  if (recFiltersOpen) bar.classList.add("open");
  bar.innerHTML = [
    `<div class="rec-head"><span class="rec-tools"><button type="button" class="rec-fold${on ? " on" : ""}" data-rec="fold">Filters</button><button type="button" class="rec-past${recPast ? " on" : ""}" data-rec="past">History</button></span><button type="button" class="rec-expand" data-rec="expand">${recAllOpen ? "Collapse all" : "Expand all"}</button></div>`,
    line("When", recChip("when", "today", "Today", recFilter.when === "today") + recChip("when", "week", "This week", recFilter.when === "week")),
    line("League", leagues.map((name) => recChip("sports", name, name, recFilter.sports.includes(name))).join("")),
    line("Game", games.length ? `<select data-rec="game"><option value="">Any game</option>${games.map((game) => `<option value="${esc(game)}"${game === recFilter.game ? " selected" : ""}>${esc(game)}</option>`).join("")}</select>` : ""),
    line("Stat", kinds.map(([id, label]) => recChip("kind", id, label, recFilter.kind === id)).join("")),
    line("Picks", counts.map((count) => recChip("legs", String(count), count === 1 ? "1 pick" : `${count} picks`, recFilter.legs === String(count))).join("")),
    line("Pay", REC_PAY.map(([id, label]) => recChip("aim", id, label, recFilter.aim === id)).join("") + (on ? recChip("clear", "1", "Clear", false) : "")),
  ].join("");
  const note = document.createElement("p");
  note.className = "rec-none";
  note.hidden = true;
  note.textContent = "None of these fit.";
  board.prepend(note);
  board.prepend(bar);
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rec]");
    if (!button || button.dataset.rec === "game") return;
    if (button.dataset.rec === "fold") { recFiltersOpen = !recFiltersOpen; bar.classList.toggle("open", recFiltersOpen); return; }
    if (button.dataset.rec === "past") { recPast = !recPast; window.recPast = recPast; recAllOpen = false; if (window.birdMenu) birdMenu("bets"); return; }
    if (button.dataset.rec === "expand") { recAllOpen = !recAllOpen; board.querySelectorAll(".rec-strategy, .rec-bet").forEach((item) => item.classList.toggle("open", recAllOpen)); button.textContent = recAllOpen ? "Collapse all" : "Expand all"; return; }
    if (button.dataset.rec === "clear") {
      recFilter.when = "";
      recFilter.sports = [];
      recFilter.game = "";
      recFilter.kind = "";
      recFilter.legs = "";
      recFilter.aim = "";
    } else if (button.dataset.rec === "sports") {
      const list = recFilter.sports;
      const index = list.indexOf(button.dataset.value);
      if (index >= 0) list.splice(index, 1);
      else list.push(button.dataset.value);
    } else recFilter[button.dataset.rec] = recFilter[button.dataset.rec] === button.dataset.value ? "" : button.dataset.value;
    bar.remove();
    note.remove();
    paintRecFilters(board);
  });
  bar.addEventListener("change", (event) => {
    if (event.target.dataset.rec !== "game") return;
    recFilter.game = event.target.value;
    bar.remove();
    note.remove();
    paintRecFilters(board);
  });
  recApply(board);
}

window.paintRecFilters = paintRecFilters;
