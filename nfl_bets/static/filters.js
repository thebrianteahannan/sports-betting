const OPEN_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF"];
const OPEN_CARDS = [
  ["todayBet", "Today's Best Bet"],
  ["chalk", "Near -180"],
  ["four", "Four at 85%"],
  ["plus", "Safest near +250"],
  ["hits", "Stack hits"],
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
  const match = String(leg.label || "").match(/—\s*(NFL|MLB|NBA|NHL|WNBA|NCAAF)\b/);
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
  const when = OPEN_WHEN.filter(([id]) => rows.some((ticket) => ticketWhen(ticket).includes(id)));
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
