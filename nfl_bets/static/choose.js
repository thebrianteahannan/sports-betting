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
  sports.innerHTML = CHOICE_SPORTS.map((sport) => (
    choiceButton(sport, choice.sports.includes(sport), "data-sport", sport)
  )).join("");
  legs.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
    choiceButton(count === 1 ? "1 leg" : `${count} legs`, choice.legs === count, "data-legs", String(count))
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

function chosenSports() {
  return choice.sports.length ? choice.sports : CHOICE_SPORTS;
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
  const key = choiceKey(); document.getElementById("choice-save")?.remove();
  document.getElementById("choice-again").hidden = (document.getElementById("chooser").classList.add("built"), false);
  box.textContent = "Checking FanDuel.";
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sports: choice.sports, kind: choice.kind, legs: choice.legs,
      gameIds: choice.gameIds, when: choice.when, aim: choice.aim, skip: seenBets[key] || [], hold: choice.hold || [], drop: choice.drop || [],
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
  const save = (card.legs || []).length ? `<button type="button" class="ghost" id="choice-save" aria-label="Save this bet" title="Save this bet"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg></button>` : "";
  const note = String(card.note || "").replace(/These legs are in different games, so this is a regular parlay\.?\s*/g, "").trim();
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${whenLine}<p>${esc(card.game ? `${card.game}. ` : "")}${esc(card.copy || "")}</p><ol class="chalk-legs">${legs}</ol>${note ? `<p class="quiet">${esc(note)}</p>` : ""}`;
  if (save) document.getElementById("choice-again").insertAdjacentHTML("afterbegin", save); if (window.paintWeather) paintWeather(); paintEdits();
  const button = document.getElementById("choice-save");
  if (button) button.addEventListener("click", () => saveBuilt(card, button));
}

async function saveBuilt(card, button) {
  button.disabled = true;
  const response = await fetch("/api/choose/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: card.title, american: card.american, copy: card.copy,
      when: choice.when, sports: choice.sports, kind: choice.kind, aim: choice.aim,
      legs: (card.legs || []).slice(0, 10),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    button.disabled = false;
    button.title = payload.error || "Could not save.";
    return;
  }
  button.title = "Saved";
  button.setAttribute("aria-label", "Saved");
  button.classList.add("on");
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

const ASK_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
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
      ? "Safe aims at −200, so a $5 bet wins about $2.50. It can still miss. "
      : choice.aim === "payout"
        ? "The long price misses more often. It can still miss. "
        : "";
    return [`${lead}Today, or this week?`, [["ask", "Today", "when:today"], ["ask", "This week", "when:week"]]];
  }
  if (step === "sport") {
    return ["Which league? All of them is fine.", [["ask", "All of them", "sport:"]].concat(ASK_SPORTS.map((name) => ["ask", name, `sport:${name}`]))];
  }
  if (step === "game") {
    const opts = [...document.querySelectorAll("#choice-game option")];
    if (opts.length < 1 || opts.length > 32) return null;
    return ["Any game, or one of these?", [["ask", "Any game", "game:"]].concat(opts.map((opt) => ["ask", opt.textContent, `game:${opt.value}`]))];
  }
  if (step === "kind") {
    const opts = [...document.querySelectorAll("#choice-kind option")];
    if (opts.length < 2) return null;
    return ["Any player prop, or one stat?", opts.map((opt) => ["ask", opt.textContent, `kind:${opt.value}`])];
  }
  if (step === "legs") {
    return ["How many legs?", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ["ask", n === 1 ? "1 leg" : `${n} legs`, `legs:${n}`])];
  }
  if (step === "aim") {
    return ["How should I aim the price? 1 safest is the highest chance and stays the same. Safe aims at −200. Good aims at −100. Best payout is the longest price, so it misses more often.", [["ask", "1 safest", "aim:top"], ["ask", "Safe", "aim:safe"], ["ask", "Good", "aim:good"], ["ask", "Best payout", "aim:payout"]]];
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
  const icon = `<button type="button" class="ghost leg-edit" aria-label="Edit this bet" title="Edit this bet"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`;
  document.querySelectorAll("#desk-glass .chalk > .pick-save").forEach((bar) => {
    if (bar.querySelector(".leg-edit")) return;
    const card = editCard(bar);
    if (!card || !cardLegs(card).length) return;
    card.classList.remove("editing");
    const anchor = bar.querySelector("[data-save], [data-unsave], #choice-save");
    if (anchor) anchor.insertAdjacentHTML("afterend", icon);
    else bar.insertAdjacentHTML("afterbegin", icon);
  });
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
  button.textContent = "Similar bet, without the checked legs";
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
    choice.when = ["week", "week5", "safe"].includes(id) ? "week" : "today";
    choice.aim = { today: "payout", plus: "payout", best: "good", four: "top", hits: "top" }[id] || "safe";
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
