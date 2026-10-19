const CHOICE_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
const KIND_ORDER = ["yards", "points", "assists", "shots", "strikeouts", "hits"];
const KIND_LABELS = {
  yards: "Yards", points: "Points", assists: "Assists", shots: "Shots", strikeouts: "Strikeouts", hits: "Hits",
};
const SPORT_KINDS = {
  NFL: ["yards"], NCAAF: ["yards"], MLB: ["strikeouts", "hits"], NBA: ["points", "assists"],
  WNBA: ["points", "assists"], NHL: ["shots", "points", "assists"], PGA: [],
};
const AIM_LABEL = { top: "1 safest", safe: "Safe", good: "Good", payout: "Best payout" };
const GO_LABEL = { top: "Show the safest", safe: "Show a safe bet", good: "Show a good bet", payout: "Show the best payout" };
const choice = { sports: [], kind: "any", legs: 3, gameIds: [], when: "today", aim: "top" };
const seenBets = {};

function choiceButton(label, on, attr, value) {
  return `<button type="button" class="${on ? "on" : ""}" ${attr}="${value}">${label}</button>`;
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
    choiceButton(sport, choice.sports.includes(sport), "data-sport", sport)
  )).join("");
  legs.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
    choiceButton(count === 1 ? "1 pick" : `${count} picks`, choice.legs === count, "data-legs", String(count))
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

function liveSports() {
  const block = ["props", "both", "tourney", "off"].includes(window.memberLaw || "");
  return CHOICE_SPORTS.filter((sport) => !block || sport !== "NCAAF");
}

function chosenSports() {
  return choice.sports.length ? choice.sports.filter((sport) => liveSports().includes(sport)) : liveSports();
}

function paintKinds() {
  const kind = document.getElementById("choice-kind");
  if (!kind) return;
  const allowed = new Set(chosenSports().flatMap((sport) => SPORT_KINDS[sport] || []));
  const kinds = ["any"].concat(KIND_ORDER.filter((name) => allowed.has(name)));
  if (!kinds.includes(choice.kind)) choice.kind = "any";
  kind.innerHTML = kinds.map((name) => (
    `<option value="${name}">${name === "any" ? "Any player prop" : KIND_LABELS[name]}</option>`
  )).join("");
  kind.value = choice.kind;
}

function paintGames() {
  const select = document.getElementById("choice-game");
  const board = window.state && window.state.board;
  if (!select || !board) return;
  const sports = new Set(chosenSports());
  const games = (board.games || []).filter((game) => {
    if (!sports.has(game.sport)) return false;
    const kick = Date.parse(game.kickoff || "");
    return Number.isFinite(kick) && choiceWindow(kick);
  });
  games.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  select.innerHTML = games.map((game) => {
    const clock = typeof when === "function" ? when(game.kickoff) : "";
    const label = `${game.sport} · ${game.match}${clock ? ` · ${clock} ET` : ""}`;
    return `<option value="${String(game.id)}">${esc(label)}</option>`;
  }).join("");
  const wanted = new Set(choice.gameIds);
  [...select.options].forEach((option) => { option.selected = wanted.has(option.value); });
  choice.gameIds = [...select.selectedOptions].map((option) => option.value);
}

function choiceKey() {
  return JSON.stringify({
    sports: choice.sports, kind: choice.kind, legs: choice.legs,
    gameIds: choice.gameIds, when: choice.when, aim: choice.aim,
  });
}

async function runChoice() {
  const box = document.getElementById("choice-result");
  const key = choiceKey(); document.getElementById("choice-stars")?.remove();
  document.getElementById("choice-again").hidden = (document.getElementById("chooser").classList.add("built"), true);
  if (window.memberLaw === "off" && !(window.booksHere && booksHere().some((book) => book.id !== "fanduel"))) { box.textContent = "No sportsbook on this desk is offered in your state, so this bet cannot be placed there."; return; }
  box.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot.png" alt=""></span><p>Picking the legs.</p></div>`;
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sports: choice.sports, kind: choice.kind, legs: choice.legs,
      gameIds: choice.gameIds, when: choice.when, aim: choice.aim, skip: seenBets[key] || [], hold: choice.hold || [], drop: choice.drop || [], college: !["props", "both", "tourney", "off"].includes(window.memberLaw || ""),
    }),
  });
  const card = await response.json();
  if (!response.ok) {
    box.textContent = card.error || "FanDuel did not answer.";
    return;
  }
  const mark = (card.players || []).slice().sort().join("|");
  if (mark) seenBets[key] = card.only || card.again ? [mark] : (seenBets[key] || []).concat(mark).slice(-24);
  if (window.noteTaste && (card.legs || []).length) noteTaste("found", { title: card.title || "", when: choice.when, aim: choice.aim || "top", kind: choice.kind, sports: [...new Set((card.legs || []).map((leg) => leg.sport).filter(Boolean))] });
  const legs = (window.builtLegs = card.legs || []).map((leg) => {
    const sway = [leg.fact, leg.sway, String(leg.form || "").replace(/^In form:\s*/i, ""), leg.weather].filter(Boolean).join(" ");
    const fact = sway ? `<span class="quiet">${esc(sway)}</span>` : "";
    const who = esc(String(leg.runner || leg.label || "").split(/\d/)[0].trim().toLowerCase());
    const line = esc((String(leg.label || "").match(/(\d+(?:\.\d+)?)/) || [])[1] || "");
    const word = esc((String(leg.label || "").toLowerCase().match(/shots|threes|assists|rebounds|points|yards|receptions|strikeouts|hits|goals|saves/) || [])[0] || "");
    return `<li data-drop="${who}" data-line="${line}" data-word="${word}"><b>${esc(american(leg.odds))}</b><span>${esc(String(leg.label || "").split(" — ")[0])}${fact}<span class="leg-more">${String(leg.label || "").includes(" — ") ? ` — ${esc(String(leg.label).split(" — ").slice(1).join(" — "))}` : ""}</span></span><em>${esc(leg.pct || "")}</em></li>`;
  }).join("");
  const kicks = [...new Set((card.legs || []).map((leg) => leg.kickoff).filter(Boolean))];
  const whenLine = kicks.length === 1 ? `<p class="when">${esc(when(kicks[0]))} ET</p>` : "";
  const stars = (card.legs || []).length ? `<span class="stars" id="choice-stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" data-built-star="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</span>` : "";
  const note = String(card.note || "").replace(/(?:Each leg is (?:a different game|on a different day, in a different game)|These (?:legs|four) are in different games), so (?:FanDuel prices this as |this is )a regular parlay\.?\s*/g, "").trim();
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${whenLine}<p>${esc(card.game ? `${card.game}. ` : "")}${esc(card.copy || "")}</p><ol class="chalk-legs">${legs}</ol>${note ? `<p class="quiet">${esc(note)}</p>` : ""}`;
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

function etDay(ms) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { key: `${bag.year}-${bag.month}-${bag.day}`, weekday: bag.weekday };
}

function choiceWindow(kick) {
  const now = Date.now();
  if (kick <= now) return false;
  const kickDay = etDay(kick);
  const nowDay = etDay(now);
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
  choice.aim = aim || "";
  choice.hold = [];
  choice.drop = [];
  window.asking = true;
  ask = ["when", "sport", "game", "kind", "legs"];
  if (!aim) ask.push("aim");
  birdBump();
  askStep();
}

function askAnswer(token) {
  if (!ask) return;
  const cut = token.indexOf(":");
  const key = token.slice(0, cut);
  const value = token.slice(cut + 1);
  if (key === "when") choice.when = value;
  else if (key === "sport") choice.sports = value ? [value] : [];
  else if (key === "kind") choice.kind = value;
  else if (key === "legs") choice.legs = Number(value);
  else if (key === "game") choice.gameIds = value ? [value] : [];
  else if (key === "aim") choice.aim = value;
  ask.shift();
  paintChoices();
  askStep();
}

function askButtons(step) {
  if (step === "when") {
    const lead = choice.aim === "safe"
      ? "Five dollars wins about $2.50. "
      : choice.aim === "payout"
        ? "A bigger payout loses more often. "
        : "";
    return [`${lead}Today, or this week?`, [["ask", "Today", "when:today"], ["ask", "This week", "when:week"]]];
  }
  if (step === "sport") {
    return ["Which league? All of them is fine.", [["ask", "All of them", "sport:"]].concat(liveSports().map((name) => ["ask", name, `sport:${name}`]))];
  }
  if (step === "game") {
    const opts = [...document.querySelectorAll("#choice-game option")];
    if (opts.length < 1 || opts.length > 32) return null;
    return ["Any game, or one of these?", [["ask", "Any game", "game:"]].concat(opts.map((opt) => ["ask", opt.textContent, `game:${opt.value}`]))];
  }
  if (step === "kind") {
    const opts = [...document.querySelectorAll("#choice-kind option")];
    if (opts.length < 2) return null;
    return ["Any stat, or one of these?", opts.map((opt) => ["ask", opt.textContent, `kind:${opt.value}`])];
  }
  if (step === "legs") {
    return ["How many picks?", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ["ask", n === 1 ? "1 pick" : `${n} picks`, `legs:${n}`])];
  }
  if (step === "aim") {
    return ["How do you want this to pay? Safest wins the most. On Safe, five dollars wins about $2.50. Good wins about as often as it loses. Best payout pays the most, and it loses more often.", [["ask", "1 safest", "aim:top"], ["ask", "Safe", "aim:safe"], ["ask", "Good", "aim:good"], ["ask", "Best payout", "aim:payout"]]];
  }
  return null;
}

function askStep() {
  if (!ask) return;
  while (ask.length) {
    if (ask[0] === "game" || ask[0] === "kind") paintChoices();
    const next = askButtons(ask[0]);
    if (!next) { ask.shift(); continue; }
    birdSay(next[0], next[1]);
    const line = document.getElementById("bird-line");
    if (line) {
      line.classList.add("build");
      const title = document.createElement("strong");
      title.textContent = "Build Your Own Bet";
      line.prepend(title);
    }
    return;
  }
  askGo();
}

function askGo() {
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

window.askStart = askStart;
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
  const ol = card.querySelector(":scope > ol");
  return ol ? [...ol.children].filter((li) => li.dataset.drop) : [];
}

function editCard(node) {
  return node.closest("#choice-again, #choice-result") ? document.getElementById("choice-result") : node.closest(".chalk");
}

function paintEdits() {
  const link = `<button type="button" class="leg-edit">Edit this bet</button>`;
  document.querySelectorAll("#desk-glass .chalk > .pick-save").forEach((bar) => {
    const card = editCard(bar);
    if (!card || card.querySelector(".leg-edit") || !cardLegs(card).length) return;
    const title = card.querySelector(":scope > h2") || card.querySelector("h2");
    if (!title) return;
    card.classList.remove("editing");
    title.insertAdjacentHTML("afterend", link);
  });
  if (window.paintDig) paintDig();
}

function armCard(card, on) {
  card.classList.toggle("editing", on);
  cardLegs(card).forEach((li) => {
    let box = li.querySelector(".leg-check");
    if (on && !box) {
      box = document.createElement("input");
      box.type = "checkbox";
      box.className = "leg-check";
      const span = li.querySelector("span");
      if (span) span.prepend(box);
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
  if (ol) ol.insertAdjacentElement("beforebegin", button);
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
      const hit = (li.querySelector(".leg-more")?.textContent || "").match(/—\s*(NFL|MLB|NBA|NHL|WNBA|NCAAF|PGA)\b/);
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

window.paintChoices = paintChoices;
window.paintEdits = paintEdits;
paintChoices();

function recLeg(leg) {
  const odds = Number(leg.odds);
  const tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : "";
  const parts = String(leg.label || "").split(" — ");
  const who = esc(String(leg.player || parts[0] || "").split(/\d/)[0].trim().toLowerCase());
  const line = esc((String(parts[0]).match(/(\d+(?:\.\d+)?)/) || [])[1] || "");
  const word = esc((String(parts[0]).toLowerCase().match(/shots|threes|assists|rebounds|points|yards|receptions|strikeouts|hits|goals|saves|touchdowns/) || [])[0] || "");
  const clock = !recLeg.one && leg.kickoff && typeof when === "function" && !/\d{1,2}:\d{2}\s*[AP]M/i.test(leg.label || "") ? ` · ${when(leg.kickoff)} ET` : "";
  const more = `${parts.length > 1 ? ` — ${esc(parts.slice(1).join(" — "))}` : ""}${esc(clock)}`;
  return `<li data-drop="${who}" data-line="${line}" data-word="${word}"><b>${esc(tag)}</b><span>${esc(parts[0])}<span class="leg-more">${more}</span></span><em>${esc(leg.pct || "")}</em></li>`;
}

function recWin(price) {
  if (!Number.isFinite(price) || !price) return "";
  const decimal = price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
  return `. A $5 bet would win $${(Math.round(5 * (decimal - 1) * 100) / 100).toFixed(2)}.`;
}

function openRec(index) {
  const row = (window.recTickets || [])[Number(index)];
  if (!row) return;
  const ticket = row.ticket; window.recKeep = { strategies: [...document.querySelectorAll("#bird-picks .rec-strategy.open")].map((node) => `${node.dataset.card}|${node.dataset.part || ""}`), bets: [...document.querySelectorAll("#bird-picks .rec-bet.open")].map((node) => node.dataset.key), scroll: (document.getElementById("bird-guide") || {}).scrollTop || 0 };
  const card = document.getElementById("rec-open") || document.createElement("section");
  card.id = "rec-open";
  card.className = "chalk";
  const price = Number(ticket.american);
  const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
  const pct = ticket.impliedPct != null && ticket.impliedPct !== "" ? `${ticket.impliedPct}%` : "";
  const sports = [...new Set((ticket.legs || []).map((leg) => leg.sport).filter(Boolean))].join(", ");
  const bits = (ticket.legs || []).map((leg) => String(leg.pct || "").trim()).filter(Boolean);
  const legsLine = bits.length > 1 ? `The legs are ${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}` : "";
  const priceLine = shown && pct ? `The parlay is ${shown}, about ${pct}${recWin(price)}` : "";
  const copy = [sports, [ticket.game, (recLeg.one = (ticket.legs || []).length > 1 && new Set((ticket.legs || []).map((leg) => leg.gameId || leg.match || "").filter(Boolean)).size === 1, recLeg.one) && typeof when === "function" && ((ticket.legs || []).find((leg) => leg.kickoff) || {}).kickoff ? `${when((ticket.legs || []).find((leg) => leg.kickoff).kickoff)} ET` : ""].filter(Boolean).join(", "), legsLine, priceLine].filter(Boolean).join(". ");
  const stars = typeof starHtml === "function" ? starHtml(typeof cardGood === "function" ? cardGood(ticket.card, ticket) : 0, ticket.card, "", "") : "";
  card.innerHTML = `<h2>${esc(row.name || ticket.title || "This bet")}</h2><p>${esc(copy)}</p><ol>${(ticket.legs || []).map(recLeg).join("")}</ol><p class="pick-save">${stars}</p>`;
  card.hidden = false;
  const glass = document.getElementById("desk-glass-in");
  if (glass && !glass.contains(card)) glass.append(card);
  const desk = document.getElementById("desk");
  if (desk) { desk.classList.add("solo", "has-back"); desk.classList.remove("bird-on", "dug"); }
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
  if (!window.recOpen) return false;
  window.recOpen = false;
  const card = document.getElementById("rec-open");
  if (card) { card.classList.remove("solo-on"); card.hidden = true; }
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("solo", "dug");
  if (window.birdMenu) birdMenu("bets");
  return true;
}
window.recBack = recBack;
