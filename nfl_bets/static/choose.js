const CHOICE_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF"];
const choice = { sports: ["MLB"], kind: "any", legs: 3, gameId: "" };

function choiceButton(label, on, attr, value) {
  return `<button type="button" class="${on ? "on" : ""}" ${attr}="${value}">${label}</button>`;
}

function paintChoices() {
  const sports = document.getElementById("choice-sports");
  const legs = document.getElementById("choice-legs");
  if (!sports || !legs) return;
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
  const now = Date.now();
  const games = (board.games || []).filter((game) => {
    if (!choice.sports.includes(game.sport)) return false;
    const kick = Date.parse(game.kickoff || "");
    return Number.isFinite(kick) && kick > now - 3 * 60 * 60 * 1000 && kick < now + 36 * 60 * 60 * 1000;
  });
  const options = [`<option value="">Best game in the pick</option>`].concat(games.map((game) => (
    `<option value="${String(game.id)}">${game.sport} · ${game.match}</option>`
  )));
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
  const whenLine = card.legs && card.legs[0] && card.legs[0].kickoff ? `<p class="when">${esc(when(card.legs[0].kickoff))} ET</p>` : "";
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${whenLine}<p>${esc(card.game ? `${card.game}. ` : "")}${esc(card.copy || "")}</p><ol class="chalk-legs">${legs}</ol><p class="quiet">${esc(card.note || "")}</p>`;
}

document.getElementById("chooser").addEventListener("click", (event) => {
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
