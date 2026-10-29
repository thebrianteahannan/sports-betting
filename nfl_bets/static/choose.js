const CHOICE_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA"];
function kindLabel(name) { return name ? name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) : "Any player prop"; }
function kindBucket(name) { const text = String(name || ""); if (/touchdown|2pt conversion/.test(text)) return "Touchdowns"; if (/reception/.test(text)) return "Receptions"; if (/yard/.test(text)) return "Yards"; if (/three/.test(text)) return "Threes"; if (/rebound|assist/.test(text)) return "Rebounds and assists"; if (/shot/.test(text)) return "Shots"; if (/save/.test(text)) return "Saves"; if (/goal/.test(text)) return "Goals"; if (/point/.test(text)) return "Points"; return "Other"; }
function riskWord(stake, profit) { const ratio = profit / stake; return !(profit > 0) ? "" : ratio <= 0.3 ? "Safest" : ratio <= 0.8 ? "Safe" : ratio <= 1.6 ? "Moderate" : ratio <= 3.2 ? "Risky" : "Riskiest"; }
function riskSay(stake, profit) { const bet = stake > 0 ? stake : 5, win = profit > 0 ? profit : 0; if (!(win > 0)) return ""; const cash = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2)); return `${riskWord(bet, win)}. A $${cash(bet)} bet to make $${cash(win)} has to win about ${Math.round(100 * bet / (bet + win))}% of the time.`; }
const choice = window.choice = { shape: "parlay", sports: [], kind: "any", legs: 3, gameIds: [], when: "today", aim: "top", mix: "even", stake: 5, profit: 0 };
const seenBets = {};

function choiceButton(label, on, attr, value, off) {
  return `<button type="button" class="${on ? "on" : ""}" ${off ? "disabled" : ""} ${attr}="${value}">${label}</button>`;
}

function paintChoices() {
  const sports = document.getElementById("choice-sports");
  const legs = document.getElementById("choice-legs");
  const when = document.getElementById("choice-when");
  if (!sports || !legs) return;
  if (when) {
    when.innerHTML = [["today", "Today"], ["week", "This week"]].map(([id, label]) => (
      choiceButton(label, choice.when === id, "data-when", id)
    )).join("");
  }
  sports.innerHTML = liveSports().map((sport) => (
    choiceButton(sport, choice.sports.includes(sport), "data-sport", sport, !sportOn(sport))
  )).join("");
  legs.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
    choiceButton(count === 0 ? "Any number" : count === 1 ? "1 pick" : `${count} picks`, choice.legs === count, "data-legs", String(count))
  )).join("");
  const risk = document.getElementById("choice-risk");
  const go = document.getElementById("choice-go");
  const bet = Number((document.getElementById("choice-stake") || {}).value);
  const want = Number((document.getElementById("choice-profit") || {}).value);
  if (risk) { risk.hidden = !(want > 0); risk.textContent = want > 0 ? riskSay(bet > 0 ? bet : 5, want) : ""; }
  if (go) go.textContent = want > 0 ? "Show that profit" : "Show the bet";
  paintKinds();
  paintGames();
}
const paintForm = paintChoices;

function liveSports() {
  const block = ["props", "both", "tourney", "off"].includes(window.memberLaw || "");
  const found = [...new Set(((window.state && window.state.board && window.state.board.games) || []).map((game) => game.sport).filter(Boolean))];
  const list = found.length ? CHOICE_SPORTS.filter((sport) => found.includes(sport)) : CHOICE_SPORTS;
  return list.filter((sport) => !block || (sport !== "NCAAF" && sport !== "NCAAB"));
}

function sportOn(name) { const games = (window.state && window.state.board && window.state.board.games) || []; return games.some((game) => (!name || game.sport === name) && Number.isFinite(Date.parse(game.kickoff || "")) && choiceWindow(Date.parse(game.kickoff))); }
function chosenSports() { const open = liveSports().filter(sportOn); return choice.sports.length ? choice.sports.filter((sport) => open.includes(sport)) : open; }

function gameRows() {
  const board = window.state && window.state.board; if (!board) return [];
  const sports = new Set(choice.sports.length ? chosenSports() : liveSports());
  return (board.games || []).filter((game) => sports.has(game.sport) && Number.isFinite(Date.parse(game.kickoff || "")) && Date.parse(game.kickoff) > Date.now() && choiceWindow(Date.parse(game.kickoff))).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}
function gameLabel(game) { const clock = typeof when === "function" ? when(game.kickoff) : ""; return `${choice.sports.length === 1 ? "" : `${game.sport} · `}${game.match}${clock ? `, ${clock}` : ""}`; }
function paintGames() {
  const box = document.getElementById("choice-games"); if (!box) return;
  const rows = gameRows(), live = new Set(rows.map((game) => String(game.id)));
  choice.gameIds = choice.gameIds.map(String).filter((id) => live.has(id));
  const q = String(paintGames.q || "").trim().toLowerCase(), picked = new Set(choice.gameIds), one = choice.sports.length === 1;
  const shown = rows.filter((game) => picked.has(String(game.id)) || (q.length >= 2 && `${game.sport} ${game.match}`.toLowerCase().includes(q)) || (!q && one && rows.length <= 40));
  box.innerHTML = choiceButton("Any game", !picked.size, "data-game", "") + `<input type="search" placeholder="Find a team" value="${esc(q)}" autocomplete="off">` + shown.map((game) => choiceButton(esc(gameLabel(game)), picked.has(String(game.id)), "data-game", String(game.id))).join("");
  const input = box.querySelector("input"); if (input) input.addEventListener("input", () => { const caret = input.selectionStart; paintGames.q = input.value; paintGames(); const next = box.querySelector("input"); if (next) { next.focus(); try { next.setSelectionRange(caret, caret); } catch (error) {} } });
}
function kindCat(name) { return typeof propKind === "function" ? propKind(name) : kindBucket(name); }
function paintKinds() {
  const box = document.getElementById("choice-kinds"); if (!box) return;
  const names = window.askKinds || [];
  if (!names.length) { if (!window.askKindsLoading) loadKinds(); box.innerHTML = choiceButton("Any player prop", true, "data-kind", "any"); return; }
  if (choice.kind !== "any" && !names.includes(choice.kind)) choice.kind = "any";
  const order = typeof PROP_KINDS === "undefined" ? [] : PROP_KINDS.map((row) => row[1]);
  const groups = [...new Set(names.map(kindCat))].sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
  const open = groups.includes(paintKinds.open) ? paintKinds.open : "";
  const kids = open ? names.filter((name) => kindCat(name) === open) : [];
  box.innerHTML = choiceButton("Any player prop", choice.kind === "any", "data-kind", "any") + groups.map((name) => choiceButton(name, open === name || (choice.kind !== "any" && kindCat(choice.kind) === name), "data-kind", `group:${name}`)).join("") + (kids.length > 1 ? `<span class="choice-break"></span>${kids.map((name) => choiceButton(kindLabel(name), choice.kind === name, "data-kind", name)).join("")}` : "");
}
function loadKinds() {
  const key = `${choice.when}|${choice.sports.slice().sort().join(",")}|${choice.gameIds.join(",")}`;
  if (window.askKinds && window.askKindsKey === key) return;
  if (window.askKindsLoading) return;
  window.askKindsLoading = true; window.askKindsKey = key;
  if (window.asking && ask && ask[0] === "kind") { birdSay("Checking FanDuel.", []); const line = document.getElementById("bird-line"); if (line) { line.classList.add("build"); const title = document.createElement("strong"); title.textContent = "Build Your Own Bet"; line.prepend(title); } }
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "kinds", sports: choice.sports, gameIds: choice.gameIds, when: choice.when, college: !["props", "both", "tourney", "off"].includes(window.memberLaw || "") }) }).then((res) => res.json()).then((data) => { if (window.askKindsKey === key) window.askKinds = data.kinds || []; }).catch(() => { if (window.askKindsKey === key) window.askKinds = []; }).finally(() => { window.askKindsLoading = false; const now = `${choice.when}|${choice.sports.slice().sort().join(",")}|${choice.gameIds.join(",")}`; if (window.askKindsKey !== now) { window.askKinds = null; loadKinds(); return; } if (window.asking && ask && ask[0] === "kind") askStep(); else paintKinds(); });
}

function choiceKey() {
  return JSON.stringify({
    shape: choice.shape, sports: choice.sports, kind: choice.kind, legs: choice.legs, hold: choice.hold || [],
    gameIds: choice.gameIds, when: choice.when, aim: choice.aim, mix: choice.mix, stake: choice.stake, profit: choice.profit,
  });
}

function recName(row) {
  const mark = (legs) => (legs || []).map((leg) => String(leg.label || "").split(" — ")[0].trim().toLowerCase()).filter(Boolean).sort().join("|");
  const want = mark(row.legs); const names = window.CARD_NAMES || {}; const now = Date.now();
  const hit = want && ((window.state && state.board && state.board.archive) || []).find((ticket) => ticket.card && names[ticket.card] && (!ticket.result || ticket.result === "open") && [ticket.legs].concat((ticket.groups || []).map((group) => group.legs)).some((legs) => mark(legs) === want) && ![ticket.kickoff, ...(ticket.legs || []).concat(...(ticket.groups || []).map((group) => group.legs || [])).map((leg) => leg.kickoff)].some((iso) => Number.isFinite(Date.parse(iso || "")) && Date.parse(iso) <= now));
  return !hit ? "" : hit.card === "hits" ? (String(hit.title || "").toLowerCase().includes("four near 80") ? "Four near 80% each" : "Five near 90% each") : names[hit.card];
}

function takeMoney() { const stake = document.getElementById("choice-stake"), profit = document.getElementById("choice-profit"); const bet = Number(stake && stake.value), want = Number(profit && profit.value); choice.stake = bet > 0 ? Math.min(100000, Math.round(bet * 100) / 100) : (choice.stake || 5); choice.profit = profit && String(profit.value).trim() !== "" && want > 0 ? Math.round(want * 100) / 100 : 0; if (choice.profit > 0) choice.aim = "pay"; else if (choice.aim === "pay") choice.aim = "top"; }
function moneySay(price) { const bet = choice.stake > 0 ? choice.stake : 5; if (!Number.isFinite(price) || !price) return ""; const won = Math.round(bet * (price > 0 ? price / 100 : 100 / Math.abs(price)) * 100) / 100; const cash = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2)); return `${choice.profit > 0 ? `${riskWord(bet, choice.profit)}. ` : ""}A $${cash(bet)} bet would win $${cash(won)}.${choice.profit > 0 ? ` You wanted about $${cash(choice.profit)} profit.` : ""}`; }
async function runChoice() { takeMoney();
  const box = document.getElementById("choice-result");
  const key = choiceKey(); document.getElementById("choice-stars")?.remove();
  document.getElementById("choice-again").hidden = (document.getElementById("chooser").classList.add("built"), true);
  if (window.memberLaw === "off" && !(window.booksHere && booksHere().some((book) => book.id !== "fanduel"))) { box.textContent = "No sportsbook on this desk is offered in your state, so this bet cannot be placed there."; return; }
  box.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>${choice.shape === "single" && !(choice.hold || []).length ? "Looking through the counts." : "Picking the legs."}</p></div>`;
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shape: choice.shape || "parlay", sports: choice.sports, kind: choice.kind, legs: choice.legs,
      gameIds: choice.gameIds, when: choice.when, aim: choice.aim, mix: choice.mix || "even", stake: choice.stake || 5, profit: choice.profit || 0, skip: seenBets[key] || [], hold: choice.hold || [], drop: choice.drop || [], college: !["props", "both", "tourney", "off"].includes(window.memberLaw || ""),
    }),
  });
  const card = await response.json();
  if (!response.ok) {
    box.textContent = card.error || "FanDuel did not answer.";
    return;
  }
  const mark = (card.players || []).slice().sort().join("|");
  if (mark) seenBets[key] = card.only || card.again ? [mark] : (seenBets[key] || []).concat(mark).slice(-24);
  if (window.noteTaste && (card.legs || []).length) noteTaste("found", { title: card.title || "", when: choice.when, aim: choice.aim || "top", kind: choice.kind, legs: choice.legs, sports: choice.sports.slice(), lines: (card.legs || []).slice(0, 8).map((leg) => String(leg.label || "").slice(0, 120)) });
  const pile = (window.builtPile = [card].concat(card.offers || []).filter((row) => (row.legs || []).length).sort((a, b) => (b.edge === true) - (a.edge === true)));
  if (pile.length > 1 && !pile.some((row) => row.edge) && pile.slice(1).every((row) => row.american !== card.american)) { card.edge = true; card.why = { payout: "This parlay pays the most of these.", top: "This parlay has the highest chance of these.", safe: "This is the safest of these.", good: "This is the closest to even money.", pay: "This parlay is the closest to the profit you asked for." }[choice.aim]; }
  window.builtLegs = card.legs || [];
  const bets = pile.map((row, index) => { const price = Number(row.american); const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : ""; const pct = row.impliedPct != null && row.impliedPct !== "" ? `${row.impliedPct}%` : ""; const same = (row.same = recName(row)); const head = [shown, pct, row.edge && choice.shape !== "single" ? "Better" : "", same ? "Recommended" : ""].filter(Boolean).join(" · "); const lines = (row.legs || []).map((leg) => { const odds = Number(leg.odds); const tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : ""; const who = esc(String(leg.runner || leg.label || "").split(/\d/)[0].trim().toLowerCase()); const line = esc((String(leg.label || "").match(/(\d+(?:\.\d+)?)/) || [])[1] || ""); const word = esc((String(leg.label || "").toLowerCase().match(/shots|threes|assists|rebounds|points|yards|receptions|strikeouts|hits|goals|saves/) || [])[0] || ""); const parts = String(leg.label || "").split(/\s+—\s+/); const head = parts[0] || ""; const where = parts.slice(1).join(" — "); const market = String(leg.market || "").split(/\s+-\s+/).pop().replace(/^Either Player\s*/i, "").trim(); const title = typeof recThing === "function" ? recThing(head, market) : head, say = title.match(/^(.*?)\s+(to\s+.+)$/i), cut = !say && title.match(/^(.*?)(?:\s*:\s*|\s+)((?:\d+(?:\.\d+)?\+|[+-]\d|over\b|under\b).+)$/i), year = !say && !cut && title.match(/^(.*?)(,\s*.+)$/), named = say && say[1] ? `<i>${esc(say[1])}</i> ${esc(say[2])}` : cut && cut[1] ? `<i>${esc(cut[1])}</i> ${esc(cut[2])}` : year && year[1] ? `<i>${esc(year[1])}</i>${esc(year[2])}` : `<i>${esc(title)}</i>`; return `<span data-drop="${who}" data-line="${line}" data-word="${word}"><b>${named}</b><i>${esc([tag, leg.pct, where].filter(Boolean).join(" · "))}</i></span>`; }).join(""); return `<div class="rec-bet${index ? "" : " open"}${row.edge ? " rec-edge" : ""}" data-built="${index}"><button type="button" class="share-bet" data-share="built" data-share-id="${index}" aria-label="Share this bet"></button><b>${esc(head)}</b><p class="rec-gist">${row.why ? `<em>${esc(row.why)}</em>` : ""}${same ? `<em class="rec-known">${esc(`This is already a recommended bet, ${same}.`)}</em>` : ""}</p>${lines}${moneySay(price) ? `<p class="rec-copy">${esc(moneySay(price))}</p>` : ""}</div>`; }).join("");
  const stars = (card.legs || []).length ? `<span class="stars" id="choice-stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" data-built-star="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</span>` : "";
  const note = String(card.note || "").replace(/(?:Each leg is (?:a different game|on a different day, in a different game)|These (?:legs|four) are in different games), so (?:FanDuel prices this as |this is )a regular parlay\.?\s*/g, "").trim();
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${bets}${note ? `<p class="quiet">${esc(note)}</p>` : ""}`;
  if (stars) {
    const again = document.getElementById("choice-again"); again.hidden = (again.insertAdjacentHTML("afterbegin", stars), false);
    document.getElementById("choice-stars").addEventListener("click", (event) => {
      const star = event.target.closest("[data-built-star]");
      if (star) saveBuilt(card, Number(star.dataset.builtStar), star.parentElement);
    });
  }
  if (window.paintWeather) paintWeather(); paintEdits(); if (typeof dressBuilt === "function") dressBuilt(box);
}

async function saveBuilt(card, stars, host) {
  const response = await fetch("/api/archive/good", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      built: true, stars, title: card.title, american: card.american, copy: card.copy,
      when: choice.when, sports: choice.sports, kind: choice.kind, aim: choice.aim,
      legs: (card.legs || []).slice(0, 10).map((leg) => ({ label: String(leg.label || ""), odds: leg.odds, pct: String(leg.pct || "") })),
    }),
  });
  const payload = await response.json();
  if (!response.ok || !host) return;
  const n = Number(payload.stars) || 0;
  host.querySelectorAll("[data-built-star]").forEach((button) => button.classList.toggle("on", Number(button.dataset.builtStar) <= n));
}

const etDays = new Map();
const etFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
function etDay(ms) {
  const hit = etDays.get(ms);
  if (hit) return hit;
  const bag = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const day = { key: `${bag.year}-${bag.month}-${bag.day}`, weekday: bag.weekday };
  etDays.set(ms, day);
  return day;
}

function choiceWindow(kick) {
  const now = Date.now();
  if (kick <= now) return false;
  const kickDay = etDay(kick);
  const nowDay = etDay(now - (now % 60000));
  if (choice.when !== "week") return kickDay.key === nowDay.key;
  const horizon = etDay(now + 14 * 24 * 60 * 60 * 1000);
  return kickDay.key <= horizon.key;
}

let ask = null;

function askStart(aim) {
  choice.sports = [];
  choice.kind = "any";
  choice.legs = 3;
  choice.gameIds = [];
  choice.when = "today";
  choice.aim = aim || ""; choice.shape = "parlay"; choice.mix = "even"; choice.stake = 5; choice.profit = aim === "safe" ? 2.5 : aim === "payout" ? 20 : 0; choice.needProfit = false; const stakeBox = document.getElementById("choice-stake"); const profitBox = document.getElementById("choice-profit"); if (stakeBox) stakeBox.value = "5"; if (profitBox) profitBox.value = choice.profit ? String(choice.profit) : "";
  choice.hold = [];
  choice.drop = [];
  window.asking = true; window.askPast = []; window.askFree = !aim; askButtons.group = "";
  ask = window.askSteps = ["shape", "when", "sport", "game", "kind", "legs", "money", "risk", "mix"];
  birdBump();
  askStep();
}

function askAnswer(token) {
  if (!ask) return;
  const cut = token.indexOf(":");
  const key = token.slice(0, cut); const value = token.slice(cut + 1); if (key === "back") { if (window.askBack) askBack(); return; }
  if (key === "when") { choice.when = value; window.askKinds = null; window.askPlayers = null; window.askPlayersStamp = 0; askButtons.group = ""; }
  else if (key === "sport") { const open = liveSports().filter(sportOn); if (value !== "go") { choice.sports = value ? (choice.sports.includes(value) ? choice.sports.filter((name) => name !== value) : choice.sports.concat(value)) : open.slice(); window.askKinds = null; window.askPlayers = null; window.askPlayersStamp = 0; askButtons.group = ""; askStep(); return; } if (open.length && choice.sports.length === open.length) choice.sports = []; window.askKinds = null; window.askPlayers = null; window.askPlayersStamp = 0; askButtons.group = ""; }
  else if (key === "kind") { if (value === "groups" || value.startsWith("group:")) { askButtons.group = value.startsWith("group:") ? value.slice(6) : ""; askStep(); return; } choice.kind = value || "any"; askButtons.group = ""; window.askPlayers = null; window.askPlayersStamp = 0; }
  else if (key === "legs") choice.legs = Number(value);
  else if (key === "game") { choice.gameIds = value ? [value] : []; window.askKinds = null; window.askPlayers = null; window.askPlayersStamp = 0; askButtons.group = ""; } else if (key === "shape") { choice.shape = value === "single" ? "single" : "parlay"; choice.legs = choice.shape === "single" ? 1 : 3; }
  else if (key === "money") { const row = document.getElementById("bird-picks"); const stake = Number(row && (row.querySelector("[name=stake]") || {}).value); const profit = value === "any" ? 0 : Number(row && (row.querySelector("[name=profit]") || {}).value); choice.stake = stake > 0 ? Math.min(100000, Math.round(stake * 100) / 100) : 5; choice.profit = profit > 0 ? Math.round(profit * 100) / 100 : 0; const stakeBox = document.getElementById("choice-stake"); const profitBox = document.getElementById("choice-profit"); if (stakeBox) stakeBox.value = String(choice.stake); if (profitBox) profitBox.value = choice.profit ? String(choice.profit) : ""; if (choice.profit > 0) choice.aim = "pay"; else if (choice.aim === "pay") choice.aim = ""; } else if (key === "aim") choice.aim = value; else if (key === "mix") choice.mix = value;
  if (key === "money" && value !== "any" && !(choice.profit > 0)) { choice.needProfit = true; askStep(); return; }
  if (key === "money") choice.needProfit = false;
  window.askPast.push(ask[0]); ask.shift();
  askStep();
}

function askButtons(step) {
  if (step === "when") return ["Today, or this week?", ["today", "week"].map((span) => { const saved = choice.when; choice.when = span; const on = sportOn(""); choice.when = saved; return ["ask", span === "today" ? "Today" : "This week", `when:${span}`, on ? "" : "off"]; })];
  if (step === "sport") {
    const open = liveSports().filter(sportOn), every = open.length && choice.sports.length === open.length, picked = (name) => every || (!!choice.sports.length && choice.sports.includes(name));
    return ["Which leagues? Tap a few, or all of them.", [["ask", "All of them", "sport:", open.length ? (!choice.sports.length || every ? "on" : "") : "off"], ["ask", "Use these", "sport:go", open.length ? "" : "off"]].concat(liveSports().map((name) => ["ask", name, `sport:${name}`, sportOn(name) ? (picked(name) ? "on" : "") : "off"]))];
  }
  if (step === "game") {
    const rows = gameRows();
    if (!rows.length || rows.length > 32) return null;
    return ["Any game, or one of these?", [["ask", "Any game", "game:"]].concat(rows.map((game) => ["ask", gameLabel(game), `game:${game.id}`]))];
  }
  if (step === "kind") {
    const names = window.askKinds || [];
    if (!names.length) return null;
    const order = ["Touchdowns", "Goals", "Points", "Yards", "Receptions", "Rebounds and assists", "Threes", "Shots", "Saves", "Other"];
    const buckets = order.filter((name) => names.some((item) => kindBucket(item) === name));
    const group = buckets.includes(askButtons.group) ? askButtons.group : "";
    if (!group && buckets.length > 1) return ["What kind of stat?", [["ask", "Any player prop", "kind:any"]].concat(buckets.map((name) => ["ask", name, `kind:group:${name}`]))];
    const rows = names.filter((name) => !group || kindBucket(name) === group);
    return [group ? `${group}. Which one?` : "Any stat, or one of these?", [["ask", group ? "All stats" : "Any player prop", group ? "kind:groups" : "kind:any"]].concat(rows.map((name) => ["ask", kindLabel(name), `kind:${name}`]))];
  }
  if (step === "shape") return ["One pick, or a parlay?", [["ask", "One pick", "shape:single"], ["ask", "Parlay", "shape:parlay"]]];
  if (step === "legs") { const need = (choice.hold || []).length; if (choice.shape === "single") return null; const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => n >= need); return ["How many picks?", (need <= 6 ? [["ask", "Any number", "legs:0"]] : []).concat(nums.map((n) => ["ask", `${n} picks`, `legs:${n}`]))]; }
  if (step === "money") return [choice.needProfit ? "Type the profit you want off that bet." : "How much do you want to bet, and how much profit do you want off it?", [["ask", "Use this", "money:go"], ["ask", "Any profit", "money:any"]]];
  if (step === "risk") { const said = riskSay(choice.stake, choice.profit); return said ? [said, [["ask", "Find it", "risk:go"]]] : null; }
  if (step === "mix") return choice.legs === 1 ? null : ["Same chance on every leg, or let one stand out?", [["ask", "Any", "mix:any"], ["ask", "Same chance", "mix:even"], ["ask", "One safer", "mix:safer"], ["ask", "One longer", "mix:long"]]];
  return null;
}

function askSoFar() {
  const past = window.askPast || [], hit = choice.gameIds[0] && ((window.state && state.board && state.board.games) || []).find((game) => String(game.id) === String(choice.gameIds[0])), words = { shape: choice.shape === "single" ? "One pick" : "Parlay", when: choice.when === "week" ? "This week" : "Today", sport: choice.sports.length ? choice.sports.join(", ") : "All leagues", game: hit ? gameLabel(hit) : "Any game", kind: choice.kind && choice.kind !== "any" ? kindLabel(choice.kind) : "Any player prop", legs: choice.legs ? `${choice.legs} picks` : "Any number", money: choice.profit > 0 ? `$${choice.stake} bet, $${choice.profit} profit` : `$${choice.stake || 5} bet, any profit`, risk: riskWord(choice.stake, choice.profit), mix: { any: "Any", even: "Same chance", safer: "One safer", long: "One longer" }[choice.mix] || "" };
  return ["shape", "when", "sport", "game", "kind", "legs", "money", "risk", "mix"].filter((step) => past.includes(step)).map((step) => words[step]).filter(Boolean).join(", ");
}
function askStep() {
  if (!(ask = ask || window.askSteps)) return; if (!ask.length) return askGo();
  while (ask.length) {
    if (ask[0] === "kind" && !window.askKinds) { loadKinds(); return; }
    if (ask[0] === "game" || ask[0] === "kind") paintForm();
    const next = askButtons(ask[0]);
    if (!next) { ask.shift(); continue; }
    birdSay(next[0], next[1]);
    if (ask[0] === "money") { const row = document.getElementById("bird-picks"); if (row) { const bet = document.createElement("label"); bet.className = "money"; bet.innerHTML = `Bet $<input name="stake" type="number" min="1" step="1" value="${choice.stake || 5}" inputmode="decimal">`; const win = document.createElement("label"); win.className = "money"; win.innerHTML = `Profit $<input name="profit" type="number" min="0" step="1" value="${choice.profit || ""}" placeholder="any" inputmode="decimal">`; row.prepend(win); row.prepend(bet); const paint = () => { const stake = Number((row.querySelector("[name=stake]") || {}).value); const profit = Number((row.querySelector("[name=profit]") || {}).value); const node = [...(document.getElementById("bird-line") || { childNodes: [] }).childNodes].find((child) => child.nodeType === 3); if (node) node.textContent = riskSay(stake, profit) || (choice.needProfit ? "Type the profit you want off that bet." : "How much do you want to bet, and how much profit do you want off it?"); }; row.querySelectorAll("input").forEach((input) => { input.addEventListener("keydown", (event) => { if (event.key === "Enter") askAnswer("money:go"); }); input.addEventListener("input", paint); }); paint(); } }
    const line = document.getElementById("bird-line");
    if (line) {
      line.classList.add("build");
      const title = document.createElement("strong"); title.textContent = "Build Your Own Bet"; line.prepend(title);
      const sofar = askSoFar(); if (sofar) { const note = document.createElement("em"); note.textContent = `So far: ${sofar}`; title.after(note); }
    }
    return;
  }
  askGo();
}

function askGo() {
  paintForm();
  if (window.noteTaste) noteTaste("quiz", { when: choice.when, sports: choice.sports.slice(), kind: choice.kind, legs: choice.legs, aim: choice.aim || "top" });
  window.asking = false;
  ask = null;
  window.askShow = true;
  birdLand();
  showTab("build");
  window.askShow = false;
  runChoice().catch((error) => {
    const box = document.getElementById("choice-result");
    if (box) box.textContent = String(error);
  });
}

window.askStart = askStart; window.askStep = askStep;
window.askAnswer = askAnswer;


document.getElementById("chooser").addEventListener("click", (event) => {
  const when = event.target.closest("[data-when]");
  if (when) {
    choice.when = when.dataset.when; window.askKinds = null; paintKinds.open = "";
    paintChoices();
    return;
  }
  const sport = event.target.closest("[data-sport]");
  if (sport) {
    const name = sport.dataset.sport;
    choice.sports = choice.sports.includes(name)
      ? choice.sports.filter((item) => item !== name)
      : choice.sports.concat(name);
    window.askKinds = null; paintKinds.open = "";
    paintChoices();
    return;
  }
  const game = event.target.closest("[data-game]");
  if (game) {
    const id = game.dataset.game;
    choice.gameIds = id ? (choice.gameIds.includes(id) ? choice.gameIds.filter((item) => item !== id) : choice.gameIds.concat(id)) : [];
    paintChoices();
    return;
  }
  const kind = event.target.closest("[data-kind]");
  if (kind) {
    const value = kind.dataset.kind;
    if (value === "any") { choice.kind = "any"; paintKinds.open = ""; }
    else if (value.startsWith("group:")) { const name = value.slice(6); const kids = (window.askKinds || []).filter((item) => kindCat(item) === name); if (kids.length <= 1) { choice.kind = kids[0] || "any"; paintKinds.open = ""; } else paintKinds.open = paintKinds.open === name ? "" : name; }
    else choice.kind = value;
    paintChoices();
    return;
  }
  const legs = event.target.closest("[data-legs]");
  if (legs) {
    choice.legs = Number(legs.dataset.legs);
    paintChoices();
    return;
  }
  const aim = event.target.closest("[data-aim]");
  if (aim) {
    choice.aim = aim.dataset.aim;
    paintChoices();
  }
});

document.getElementById("choice-go").addEventListener("click", () => {
  runChoice().catch((error) => {
    document.getElementById("choice-result").textContent = String(error);
  });
});
["choice-stake", "choice-profit"].forEach((id) => document.getElementById(id)?.addEventListener("input", paintChoices));

function legName(li) {
  return li.dataset.drop || "";
}

function legWho(li) {
  const name = legName(li);
  if (!name) return "";
  return [name, li.dataset.line || "", li.dataset.word || ""].filter((part, index) => index < 2 || part).join("|");
}

function cardLegs(card) {
  const shown = card.id === "choice-result" ? [...card.querySelectorAll(":scope > .rec-edge span[data-drop]")] : [];
  if (shown.length) return shown;
  const ol = card.querySelector(":scope > ol");
  return ol ? [...ol.children].filter((li) => li.dataset.drop) : [];
}

function editCard(node) {
  return node.closest("#choice-again, #choice-result") ? document.getElementById("choice-result") : node.closest(".chalk");
}

function paintEdits() {
  if (window.paintDig) paintDig();
}

function armCard(card, on) {
  card.classList.toggle("editing", on);
  if (on && card.id === "choice-result") card.querySelector(".rec-edge")?.classList.add("open");
  cardLegs(card).forEach((li) => {
    let box = li.querySelector(".leg-check");
    if (on && !box) {
      box = document.createElement("input");
      box.type = "checkbox";
      box.className = "leg-check";
      (li.querySelector("span") || li).prepend(box);
    }
    if (!on && box) box.remove();
  });
  const go = card.querySelector(".leg-swap");
  if (!on) { if (go) go.remove(); return; }
  if (go) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "leg-swap";
  button.disabled = true;
  button.textContent = "Similar bet, without the ones you checked";
  const ol = card.querySelector(":scope > ol");
  if (ol) ol.insertAdjacentElement("beforebegin", button); else card.querySelector(".rec-edge")?.append(button);
}

function swapCard(card) {
  const lis = cardLegs(card);
  const dropped = lis.filter((li) => li.querySelector(".leg-check:checked"));
  const drop = dropped.map(legName).filter(Boolean);
  const hold = lis.filter((li) => !dropped.includes(li)).map(legWho).filter(Boolean);
  if (!drop.length) return;
  if (card.id !== "choice-result") {
    const id = card.id || "";
    const sports = [...new Set(lis.map((li) => {
      const hit = (li.querySelector(".leg-more")?.textContent || "").match(/—\s*([^,]+),/);
      return hit ? hit[1] : "";
    }).filter(Boolean))];
    choice.sports = sports;
    choice.kind = "any";
    choice.gameIds = [];
    choice.when = ["week", "week5", "safe", "even"].includes(id) ? "week" : "today";
    choice.aim = { today: "payout", plus: "payout", best: "good", even: "good", four: "top", hits: "top" }[id] || "safe";
  }
  choice.legs = lis.length;
  choice.hold = hold;
  choice.drop = drop;
  armCard(card, false);
  const edit = (card.id === "choice-result" ? document.getElementById("choice-again") : card).querySelector(".leg-edit");
  if (edit) edit.classList.remove("on");
  const desk = document.getElementById("desk");
  if (desk && desk.classList.contains("bird-on") && window.birdLand) birdLand();
  if (typeof showTab === "function") showTab("build");
  runChoice().catch((error) => {
    const box = document.getElementById("choice-result");
    if (box) box.textContent = String(error);
  });
}

document.addEventListener("click", (event) => {
  const built = event.target.closest("#choice-result .rec-bet");
  if (built && !event.target.closest("button")) { if (window.openBuilt) openBuilt(built.dataset.built); return; }
  const edit = event.target.closest(".leg-edit");
  if (edit) {
    const card = editCard(edit);
    if (!card) return;
    const on = !card.classList.contains("editing");
    armCard(card, on);
    edit.classList.toggle("on", on);
    return;
  }
  const swap = event.target.closest(".leg-swap");
  if (swap) swapCard(editCard(swap));
});

document.addEventListener("change", (event) => {
  const box = event.target.closest(".leg-check");
  if (!box) return;
  const card = editCard(box);
  const go = card && card.querySelector(".leg-swap");
  if (go) go.disabled = !card.querySelector(".leg-check:checked");
});

window.legGist = (leg) => { const raw = String(leg.label || "").split(/,|\s+—\s+/)[0].trim(); const bit = typeof recThing === "function" ? recThing(raw, leg.market) : raw; if (!bit) return ""; const cut = bit.match(/^(.*?)(?:\s*:\s*|\s+)((?:\d+(?:\.\d+)?\+|[+-]\d|over\b|under\b).+)$/i); const say = !cut && bit.match(/^(.*?)\s+(to\s+.+)$/i); return cut ? `<i>${esc(cut[1])}</i> ${esc(cut[2])}` : say ? `<i>${esc(say[1])}</i> ${esc(say[2])}` : `<i>${esc(bit)}</i>`; };
window.recWin = recWin; window.paintChoices = paintChoices; window.paintEdits = paintEdits;
paintChoices();

function recLeg(leg) {
  const parts = String(leg.label || "").split(" — ");
  const who = esc(String(leg.player || parts[0] || "").split(/\d/)[0].trim().toLowerCase());
  const line = esc((String(parts[0]).match(/(\d+(?:\.\d+)?)/) || [])[1] || "");
  const word = esc((String(parts[0]).toLowerCase().match(/shots|threes|assists|rebounds|points|yards|receptions|strikeouts|hits|goals|saves|touchdowns/) || [])[0] || "");
  return `<li class="rec-leg" data-drop="${who}" data-line="${line}" data-word="${word}">${recLine(leg)}</li>`;
}

function recWin(price, stake) {
  const bet = Number(stake) > 0 ? Math.round(Number(stake) * 100) / 100 : 5;
  if (!Number.isFinite(price) || !price) return "";
  const profit = Math.round(bet * (price > 0 ? price / 100 : 100 / Math.abs(price)) * 100) / 100;
  const shown = Number.isInteger(bet) ? String(bet) : bet.toFixed(2);
  return `A <button type="button" class="stake" aria-label="Change the bet size">$${shown}</button> bet would become $${(bet + profit).toFixed(2)} with a profit of $${profit.toFixed(2)}.`;
}

function openRec(index) {
  const row = (window.recTickets || [])[Number(index)];
  if (!row) return;
  const ticket = row.ticket; window.recKeep = { strategies: [...document.querySelectorAll(".rec-board .rec-strategy.open")].map((node) => `${node.dataset.card}|${node.dataset.part || ""}`), bets: [...document.querySelectorAll(".rec-board .rec-bet.open")].map((node) => node.dataset.key), scroll: (document.getElementById("desk-glass-in") || {}).scrollTop || 0 };
  const card = document.getElementById("rec-open") || document.createElement("section");
  card.id = "rec-open";
  card.className = "chalk";
  const price = Number(ticket.american);
  const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
  const pct = ticket.impliedPct != null && ticket.impliedPct !== "" ? `${ticket.impliedPct}%` : "";
  const copy = window.recBlurb ? recBlurb(ticket, shown, pct, price) : "";
  const stars = typeof starHtml === "function" ? starHtml(typeof cardGood === "function" ? cardGood(ticket.card, ticket) : 0, ticket.card, "", "") : "";
  card.innerHTML = `<h2>${esc([row.name || ticket.title || "This bet", shown, pct].filter(Boolean).join(" · "))}${ticket.same ? " · Recommended" : ""}</h2>${copy ? `<p class="rec-copy">${copy}</p>` : ""}${ticket.same ? `<p>This is already a recommended bet, ${esc(ticket.same)}.</p>` : ""}${ticket.why ? `<p class="aim">${esc(ticket.why)}</p>` : ""}<ol>${(ticket.legs || []).map(recLeg).join("")}</ol><p class="pick-save">${stars}<button type="button" class="share-bet" data-share="rec" data-share-id="${index}" aria-label="Share this bet"></button></p>`;
  card.hidden = false;
  const glass = document.getElementById("desk-glass-in");
  if (glass && !glass.contains(card)) glass.append(card);
  const desk = document.getElementById("desk");
  if (desk) { desk.classList.add("solo", "has-back", "dug"); desk.classList.remove("bird-on"); }
  document.querySelectorAll(".solo-on").forEach((node) => node.classList.remove("solo-on"));
  card.classList.add("solo-on");
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  window.recOpen = true;
  if (window.paintEdits) paintEdits();
  if (glass) glass.scrollTop = 0;
}
window.openRec = openRec;
function recBack() {
  const card = document.getElementById("rec-open");
  if (!window.recOpen && !(card && card.classList.contains("solo-on"))) return false;
  window.recOpen = false;
  if (card) { card.classList.remove("solo-on"); card.hidden = true; }
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("solo", "dug");
  if (window.builtBack) { window.builtBack = false; const glass = document.getElementById("desk-glass-in"); if (glass && window.builtKeep) glass.scrollTop = window.builtKeep.scroll || 0; return true; }
  return !!(document.querySelector("#desk-glass-in .rec-board") || (document.getElementById("chooser") || {}).classList.contains("built"));
}
window.recBack = recBack;
