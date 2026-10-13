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
  legs.innerHTML = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
    choiceButton(`${count} legs`, choice.legs === count, "data-legs", String(count))
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
  const key = choiceKey();
  box.textContent = "Checking FanDuel.";
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sports: choice.sports, kind: choice.kind, legs: choice.legs,
      gameIds: choice.gameIds, when: choice.when, aim: choice.aim, skip: seenBets[key] || [],
    }),
  });
  const card = await response.json();
  if (!response.ok) {
    box.textContent = card.error || "FanDuel did not answer.";
    return;
  }
  const mark = (card.players || []).slice().sort().join("|");
  if (mark) seenBets[key] = card.only || card.again ? [mark] : (seenBets[key] || []).concat(mark).slice(-8);
  const legs = (card.legs || []).map((leg) => {
    const sway = [leg.fact, leg.sway].filter(Boolean).join(" ");
    const fact = sway ? `<br><span class="quiet">${esc(sway)}</span>` : "";
    return `<li><b>${esc(american(leg.odds))}</b><span>${esc(leg.label)}${fact}</span><em>${esc(leg.pct || "")}</em></li>`;
  }).join("");
  const kicks = [...new Set((card.legs || []).map((leg) => leg.kickoff).filter(Boolean))];
  const whenLine = kicks.length === 1 ? `<p class="when">${esc(when(kicks[0]))} ET</p>` : "";
  const save = (card.legs || []).length ? `<p class="pick-save"><button type="button" id="choice-save">Save this bet</button></p>` : "";
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${whenLine}<p>${esc(card.game ? `${card.game}. ` : "")}${esc(card.copy || "")}</p><ol class="chalk-legs">${legs}</ol><p class="quiet">${esc(card.note || "")}</p>${save}`;
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
    button.textContent = payload.error || "Could not save.";
    return;
  }
  button.textContent = "Saved";
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
  if (kick < now - 3 * 60 * 60 * 1000) return false;
  const kickDay = etDay(kick);
  const nowDay = etDay(now);
  if (choice.when !== "week") return kickDay.key === nowDay.key;
  const horizon = etDay(now + 14 * 24 * 60 * 60 * 1000);
  return kickDay.key <= horizon.key;
}

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

window.paintChoices = paintChoices;
paintChoices();
