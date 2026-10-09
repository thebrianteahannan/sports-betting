const CHOICE_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
const choice = { sports: ["MLB"], kind: "any", legs: 3, gameId: "", when: "today" };

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
  legs.innerHTML = [2, 3, 4].map((count) => (
    choiceButton(`${count} legs`, choice.legs === count, "data-legs", String(count))
  )).join("");
  const kind = document.getElementById("choice-kind");
  if (kind) kind.value = choice.kind;
  paintGames();
}

function paintGames() {
  const select = document.getElementById("choice-game");
  const board = window.state && window.state.board;
  if (!select || !board) return;
  const games = (board.games || []).filter((game) => {
    if (!choice.sports.includes(game.sport)) return false;
    const kick = Date.parse(game.kickoff || "");
    return Number.isFinite(kick) && choiceWindow(kick);
  });
  games.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const options = [`<option value="">Across these games</option>`].concat(games.map((game) => {
    const clock = typeof when === "function" ? when(game.kickoff) : "";
    const label = `${game.sport} · ${game.match}${clock ? ` · ${clock} ET` : ""}`;
    return `<option value="${String(game.id)}">${esc(label)}</option>`;
  }));
  select.innerHTML = options.join("");
  if ([...select.options].some((option) => option.value === choice.gameId)) select.value = choice.gameId;
  else choice.gameId = "";
}

async function runChoice() {
  const box = document.getElementById("choice-result");
  box.textContent = "Checking FanDuel.";
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(choice),
  });
  const card = await response.json();
  if (!response.ok) {
    box.textContent = card.error || "FanDuel did not answer.";
    return;
  }
  const legs = (card.legs || []).map((leg) => (
    `<li><b>${esc(american(leg.odds))}</b><span>${esc(leg.label)}</span><em>${esc(leg.pct || "")}</em></li>`
  )).join("");
  const kicks = [...new Set((card.legs || []).map((leg) => leg.kickoff).filter(Boolean))];
  const whenLine = kicks.length === 1 ? `<p class="when">${esc(when(kicks[0]))} ET</p>` : "";
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${whenLine}<p>${esc(card.game ? `${card.game}. ` : "")}${esc(card.copy || "")}</p><ol class="chalk-legs">${legs}</ol><p class="quiet">${esc(card.note || "")}</p>`;
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
  }
});

document.getElementById("choice-kind").addEventListener("change", (event) => {
  choice.kind = event.target.value;
});

document.getElementById("choice-game").addEventListener("change", (event) => {
  choice.gameId = event.target.value;
});

document.getElementById("choice-go").addEventListener("click", () => {
  runChoice().catch((error) => {
    document.getElementById("choice-result").textContent = String(error);
  });
});

window.paintChoices = paintChoices;
paintChoices();
