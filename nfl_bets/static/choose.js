const CHOICE_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
function kindLabel(name) { return name ? name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) : "Any player prop"; }
const AIM_LABEL = { top: "Safest", safe: "Safe", good: "Good", payout: "Big payout" };
const GO_LABEL = { top: "Show the safest", safe: "Show a safe bet", good: "Show a good bet", payout: "Show the best payout" };
const choice = window.choice = { sports: [], kind: "any", legs: 3, gameIds: [], when: "today", aim: "top", mix: "even" };
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
  const aim = document.getElementById("choice-aim");
  const go = document.getElementById("choice-go");
  if (aim) {
    aim.innerHTML = Object.entries(AIM_LABEL).map(([id, label]) => (
      choiceButton(label, choice.aim === id, "data-aim", id)
    )).join("");
  }
  if (go) go.textContent = GO_LABEL[choice.aim] || GO_LABEL.safe;
  paintKinds();
  paintGames();
}
const paintForm = paintChoices;

function liveSports() {
  const block = ["props", "both", "tourney", "off"].includes(window.memberLaw || "");
  const found = [...new Set(((window.state && window.state.board && window.state.board.games) || []).map((game) => game.sport).filter(Boolean))];
  const list = found.length ? CHOICE_SPORTS.filter((sport) => found.includes(sport)).concat(found.filter((sport) => !CHOICE_SPORTS.includes(sport)).sort()) : CHOICE_SPORTS;
  return list.filter((sport) => !block || (sport !== "NCAAF" && sport !== "NCAAB"));
}

function sportOn(name) { const games = (window.state && window.state.board && window.state.board.games) || []; return games.some((game) => (!name || game.sport === name) && Number.isFinite(Date.parse(game.kickoff || "")) && choiceWindow(Date.parse(game.kickoff))); }
function chosenSports() { const open = liveSports().filter(sportOn); return choice.sports.length ? choice.sports.filter((sport) => open.includes(sport)) : open; }

function paintKinds() {
  const kind = document.getElementById("choice-kind");
  if (!kind) return;
  const names = window.askKinds || [];
  if (choice.kind !== "any" && !names.includes(choice.kind)) choice.kind = "any";
  kind.innerHTML = `<option value="any">Any player prop</option>${names.map((name) => `<option value="${name}">${kindLabel(name)}</option>`).join("")}`;
  kind.value = choice.kind;
}

function loadKinds() {
  if (window.askKindsLoading) return;
  window.askKindsLoading = true;
  birdSay("Checking FanDuel.", []);
  const line = document.getElementById("bird-line");
  if (line) { line.classList.add("build"); const title = document.createElement("strong"); title.textContent = "Build Your Own Bet"; line.prepend(title); }
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "kinds", sports: choice.sports, gameIds: choice.gameIds, when: choice.when, college: !["props", "both", "tourney", "off"].includes(window.memberLaw || "") }) }).then((res) => res.json()).then((data) => { window.askKinds = data.kinds || []; }).catch(() => { window.askKinds = []; }).finally(() => { window.askKindsLoading = false; askStep(); });
}

function paintGames() {
  const select = document.getElementById("choice-game");
  const board = window.state && window.state.board;
  if (!select || !board) return;
  const sports = new Set(choice.sports.length ? chosenSports() : liveSports());
  const games = (board.games || []).filter((game) => {
    if (!sports.has(game.sport)) return false;
    const kick = Date.parse(game.kickoff || "");
    return Number.isFinite(kick) && kick > Date.now();
  });
  games.sort((a, b) => Number(choiceWindow(Date.parse(b.kickoff))) - Number(choiceWindow(Date.parse(a.kickoff))) || Date.parse(a.kickoff) - Date.parse(b.kickoff));
  select.innerHTML = games.map((game) => {
    const clock = typeof when === "function" ? when(game.kickoff) : "";
    const label = `${game.sport} · ${game.match}${clock ? ` · ${clock} ET` : ""}`;
    return `<option value="${String(game.id)}"${choiceWindow(Date.parse(game.kickoff)) ? "" : " disabled"}>${esc(label)}</option>`;
  }).join("");
  const wanted = new Set(choice.gameIds);
  [...select.options].forEach((option) => { option.selected = wanted.has(option.value); });
  choice.gameIds = [...select.selectedOptions].map((option) => option.value);
}

function choiceKey() {
  return JSON.stringify({
    sports: choice.sports, kind: choice.kind, legs: choice.legs,
    gameIds: choice.gameIds, when: choice.when, aim: choice.aim, mix: choice.mix,
  });
}

function recName(row) {
  const mark = (legs) => (legs || []).map((leg) => String(leg.label || "").split(" — ")[0].trim().toLowerCase()).filter(Boolean).sort().join("|");
  const want = mark(row.legs); const names = window.CARD_NAMES || {}; const now = Date.now();
  const hit = want && ((window.state && state.board && state.board.archive) || []).find((ticket) => ticket.card && names[ticket.card] && (!ticket.result || ticket.result === "open") && [ticket.legs].concat((ticket.groups || []).map((group) => group.legs)).some((legs) => mark(legs) === want) && ![ticket.kickoff, ...(ticket.legs || []).concat(...(ticket.groups || []).map((group) => group.legs || [])).map((leg) => leg.kickoff)].some((iso) => Number.isFinite(Date.parse(iso || "")) && Date.parse(iso) <= now));
  return !hit ? "" : hit.card === "hits" ? (String(hit.title || "").toLowerCase().includes("four near 80") ? "Four near 80% each" : "Five near 90% each") : names[hit.card];
}

async function runChoice() {
  const box = document.getElementById("choice-result");
  const key = choiceKey(); document.getElementById("choice-stars")?.remove();
  document.getElementById("choice-again").hidden = (document.getElementById("chooser").classList.add("built"), true);
  if (window.memberLaw === "off" && !(window.booksHere && booksHere().some((book) => book.id !== "fanduel"))) { box.textContent = "No sportsbook on this desk is offered in your state, so this bet cannot be placed there."; return; }
  box.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>Picking the legs.</p></div>`;
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sports: choice.sports, kind: choice.kind, legs: choice.legs,
      gameIds: choice.gameIds, when: choice.when, aim: choice.aim, mix: choice.mix || "even", skip: seenBets[key] || [], hold: choice.hold || [], drop: choice.drop || [], college: !["props", "both", "tourney", "off"].includes(window.memberLaw || ""),
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
  if (pile.length > 1 && !pile.some((row) => row.edge) && pile.slice(1).every((row) => row.american !== card.american)) { card.edge = true; card.why = { payout: "This parlay pays the most of these.", top: "This parlay has the highest chance of these.", safe: "This is the safest of these.", good: "This is the closest to even money." }[choice.aim]; }
  window.builtLegs = card.legs || [];
  const bets = pile.map((row, index) => { const price = Number(row.american); const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : ""; const pct = row.impliedPct != null && row.impliedPct !== "" ? `${row.impliedPct}%` : ""; const same = (row.same = recName(row)); const head = [shown, pct, row.edge ? "Better" : "", same ? "Recommended" : ""].filter(Boolean).join(" · "); const lines = (row.legs || []).map((leg) => { const odds = Number(leg.odds); const tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : ""; const who = esc(String(leg.runner || leg.label || "").split(/\d/)[0].trim().toLowerCase()); const line = esc((String(leg.label || "").match(/(\d+(?:\.\d+)?)/) || [])[1] || ""); const word = esc((String(leg.label || "").toLowerCase().match(/shots|threes|assists|rebounds|points|yards|receptions|strikeouts|hits|goals|saves/) || [])[0] || ""); const parts = String(leg.label || "").split(/\s+—\s+/); const head = parts[0] || ""; const where = parts.slice(1).join(" — "); const market = String(leg.market || "").split(/\s+-\s+/).pop().replace(/^Either Player\s*/i, "").trim(); const title = market && /\s+or\s+|\s+&\s+/i.test(head) && !head.toLowerCase().includes(market.toLowerCase()) ? `${head} · ${market}` : head; return `<span data-drop="${who}" data-line="${line}" data-word="${word}"><b>${esc(title)}</b><i>${esc([tag, leg.pct, where].filter(Boolean).join(" · "))}</i></span>`; }).join(""); return `<div class="rec-bet${index ? "" : " open"}${row.edge ? " rec-edge" : ""}" data-built="${index}"><button type="button" class="share-bet" data-share="built" data-share-id="${index}" aria-label="Share this bet"></button><b>${esc(head)}</b><p class="rec-gist">${row.why ? `<em>${esc(row.why)}</em>` : ""}${same ? `<em class="rec-known">${esc(`This is already a recommended bet, ${same}.`)}</em>` : ""}</p>${lines}${window.recBlurb ? `<p class="rec-copy">${esc(recBlurb(row, shown, pct, price))}</p>` : ""}</div>`; }).join("");
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
  if (window.paintWeather) paintWeather(); paintEdits();
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
  choice.aim = aim || ""; choice.mix = "even";
  choice.hold = [];
  choice.drop = [];
  window.asking = true; window.askPast = []; window.askFree = !aim;
  ask = window.askSteps = ["when", "sport", "game", "kind", "legs"].concat(aim ? ["mix"] : ["aim", "mix"]);
  birdBump();
  askStep();
}

function askAnswer(token) {
  if (!ask) return;
  const cut = token.indexOf(":");
  const key = token.slice(0, cut); const value = token.slice(cut + 1); if (key === "back") { if (window.askBack) askBack(); return; }
  if (key === "when") { choice.when = value; window.askKinds = null; }
  else if (key === "sport") { choice.sports = value ? [value] : []; window.askKinds = null; }
  else if (key === "kind") choice.kind = value;
  else if (key === "legs") choice.legs = Number(value);
  else if (key === "game") { choice.gameIds = value ? [value] : []; window.askKinds = null; }
  else if (key === "aim") choice.aim = value; else if (key === "mix") choice.mix = value;
  window.askPast.push(ask[0]); ask.shift();
  askStep();
}

function askButtons(step) {
  if (step === "when") {
    const lead = choice.aim === "safe"
      ? "Five dollars wins about $2.50. "
      : choice.aim === "payout"
        ? "A bigger payout loses more often. "
        : "";
    return [`${lead}Today, or this week?`, ["today", "week"].map((span) => { const saved = choice.when; choice.when = span; const on = sportOn(""); choice.when = saved; return ["ask", span === "today" ? "Today" : "This week", `when:${span}`, on ? "" : "off"]; })];
  }
  if (step === "sport") {
    const open = liveSports().some(sportOn);
    return ["Which league? All of them is fine.", [["ask", "All of them", "sport:", open ? "" : "off"]].concat(liveSports().map((name) => ["ask", name, `sport:${name}`, sportOn(name) ? "" : "off"]))];
  }
  if (step === "game") {
    const opts = [...document.querySelectorAll("#choice-game option")];
    const play = opts.filter((opt) => !opt.disabled).length;
    if (!opts.length || play > 32) return null;
    return ["Any game, or one of these?", [["ask", "Any game", "game:", play ? "" : "off"]].concat(opts.map((opt) => ["ask", opt.textContent, `game:${opt.value}`, opt.disabled ? "off" : ""]))];
  }
  if (step === "kind") {
    const opts = [...document.querySelectorAll("#choice-kind option")];
    if (opts.length < 2) return null;
    return ["Any stat, or one of these?", opts.map((opt) => ["ask", opt.textContent, `kind:${opt.value}`, opt.disabled ? "off" : ""])];
  }
  if (step === "legs") {
    return ["How many picks?", [["ask", "Any number", "legs:0"]].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ["ask", n === 1 ? "1 pick" : `${n} picks`, `legs:${n}`]))];
  }
  if (step === "aim") {
    return ["How do you want this to pay? Safest wins the most. On Safe, five dollars wins about $2.50. Good wins about as often as it loses. Big payout pays the most, and it loses more often.", [["ask", "Safest", "aim:top"], ["ask", "Safe", "aim:safe"], ["ask", "Good", "aim:good"], ["ask", "Big payout", "aim:payout"]]];
  }
  if (step === "mix") return choice.legs === 1 ? null : ["Same chance on every leg, or let one stand out?", [["ask", "Same chance", "mix:even"], ["ask", "One safer", "mix:safer"], ["ask", "One longer", "mix:long"]]];
  return null;
}

function askSoFar() {
  const past = window.askPast || [], game = choice.gameIds[0] && document.querySelector(`#choice-game option[value="${CSS.escape(choice.gameIds[0])}"]`), words = { when: choice.when === "week" ? "This week" : "Today", sport: choice.sports[0] || "All leagues", game: game ? game.textContent : "Any game", kind: choice.kind && choice.kind !== "any" ? kindLabel(choice.kind) : "Any player prop", legs: choice.legs ? (choice.legs === 1 ? "1 pick" : `${choice.legs} picks`) : "Any number", aim: AIM_LABEL[choice.aim] || "", mix: { even: "Same chance", safer: "One safer", long: "One longer" }[choice.mix] || "" };
  return [...new Set((!window.askFree && words.aim ? ["aim"] : []).concat(["when", "sport", "game", "kind", "legs", "aim", "mix"].filter((step) => past.includes(step))))].map((step) => words[step]).filter(Boolean).join(", ");
}
function askStep() {
  if (!(ask = ask || window.askSteps)) return; if (!ask.length) return askGo();
  while (ask.length) {
    if (ask[0] === "kind" && !window.askKinds) { loadKinds(); return; }
    if (ask[0] === "game" || ask[0] === "kind") paintForm();
    const next = askButtons(ask[0]);
    if (!next) { ask.shift(); continue; }
    birdSay(next[0], next[1]);
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
  window.askShow = false;
  showTab("build");
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
    choice.when = when.dataset.when;
    paintChoices();
    return;
  }
  const sport = event.target.closest("[data-sport]");
  if (sport) {
    const name = sport.dataset.sport;
    choice.sports = choice.sports.includes(name)
      ? choice.sports.filter((item) => item !== name)
      : choice.sports.concat(name);
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

document.getElementById("choice-kind").addEventListener("change", (event) => {
  choice.kind = event.target.value;
});

document.getElementById("choice-game").addEventListener("change", (event) => {
  choice.gameIds = [...event.target.selectedOptions].map((option) => option.value);
});

document.getElementById("choice-go").addEventListener("click", () => {
  runChoice().catch((error) => {
    document.getElementById("choice-result").textContent = String(error);
  });
});

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

window.legGist = (leg) => { const bit = String(leg.label || "").split(/,|\s+—\s+/)[0].trim(); if (!bit) return ""; const cut = bit.match(/^(.*?)(?:\s*:\s*|\s+)((?:\d+(?:\.\d+)?\+|[+-]\d|over\b|under\b).+)$/i); const say = !cut && bit.match(/^(.*?)\s+(to\s+.+)$/i); const prop = !cut && !say && /\s+or\s+|\s+&\s+/i.test(bit) ? String(leg.market || "").split(/\s+-\s+/).pop().replace(/^Either Player\s*/i, "").trim() : ""; return cut ? `<i>${esc(cut[1])}</i> ${esc(cut[2])}` : say ? `<i>${esc(say[1])}</i> ${esc(say[2])}` : prop ? `<i>${esc(bit)}</i> ${esc(prop)}` : `<i>${esc(bit)}</i>`; };
window.recWin = recWin; window.paintChoices = paintChoices; window.paintEdits = paintEdits;
paintChoices();

function recLeg(leg) {
  const odds = Number(leg.odds);
  const tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : "";
  const parts = String(leg.label || "").split(" — ");
  const who = esc(String(leg.player || parts[0] || "").split(/\d/)[0].trim().toLowerCase());
  const line = esc((String(parts[0]).match(/(\d+(?:\.\d+)?)/) || [])[1] || "");
  const word = esc((String(parts[0]).toLowerCase().match(/shots|threes|assists|rebounds|points|yards|receptions|strikeouts|hits|goals|saves|touchdowns/) || [])[0] || "");
  const clock = !recLeg.one && leg.kickoff && typeof when === "function" && !/\d{1,2}:\d{2}\s*[AP]M/i.test(leg.label || "") ? ` · ${when(leg.kickoff)} ET` : "";
  const more = `${parts.length > 1 ? ` — ${esc(parts.slice(1).join(" — "))}` : ""}${esc(clock)}${!parts[1] && !clock && leg.match ? ` · ${esc(leg.match)}` : ""}`;
  return `<li data-drop="${who}" data-line="${line}" data-word="${word}"><b>${esc(tag)}</b><span>${esc(parts[0])}<span class="leg-more">${more}</span>${(read => read ? `<span class="quiet">${esc(read)}</span>` : "")([leg.fact, leg.sway, String(leg.form || "").replace(/^In form:\s*/i, ""), leg.weather].filter(Boolean).join(" "))}${typeof legOdds === "function" ? legOdds(leg) : ""}</span><em>${esc(leg.pct || "")}</em></li>`;
}

function recWin(price) {
  if (!Number.isFinite(price) || !price) return "";
  const decimal = price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
  const profit = Math.round(5 * (decimal - 1) * 100) / 100;
  return `A $5 bet would become $${(5 + profit).toFixed(2)} with a profit of $${profit.toFixed(2)}.`;
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
  recLeg.one = (ticket.legs || []).length > 1 && new Set((ticket.legs || []).map((leg) => leg.gameId || leg.match || "").filter(Boolean)).size === 1;
  const copy = window.recBlurb ? recBlurb(ticket, shown, pct, price) : "";
  const stars = typeof starHtml === "function" ? starHtml(typeof cardGood === "function" ? cardGood(ticket.card, ticket) : 0, ticket.card, "", "") : "";
  card.innerHTML = `<h2>${esc([row.name || ticket.title || "This bet", shown, pct].filter(Boolean).join(" · "))}${ticket.same ? " · Recommended" : ""}</h2>${copy ? `<p>${esc(copy)}</p>` : ""}${ticket.same ? `<p>This is already a recommended bet, ${esc(ticket.same)}.</p>` : ""}${ticket.why ? `<p class="aim">${esc(ticket.why)}</p>` : ""}<ol>${(ticket.legs || []).map(recLeg).join("")}</ol><p class="pick-save">${stars}<button type="button" class="share-bet" data-share="rec" data-share-id="${index}" aria-label="Share this bet"></button></p>`;
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
  if (!window.recOpen && !(document.getElementById("rec-open") || {}).classList.contains("solo-on")) return false;
  window.recOpen = false;
  const card = document.getElementById("rec-open");
  if (card) { card.classList.remove("solo-on"); card.hidden = true; }
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("solo", "dug");
  if (window.builtBack) { window.builtBack = false; const glass = document.getElementById("desk-glass-in"); if (glass && window.builtKeep) glass.scrollTop = window.builtKeep.scroll || 0; return true; }
  if (window.birdMenu) birdMenu("bets");
  return true;
}
window.recBack = recBack;
