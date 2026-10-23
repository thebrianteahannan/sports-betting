const BET_ASKS = [
  ["out", "Who is out"],
  ["rest", "Rest"],
  ["building", "The building"],
  ["weather", "Wind and rain"],
  ["total", "The total"],
  ["recent", "Recent games"],
  ["rivalry", "Rivalry"],
  ["worth", "Worth Risk?"],
];

function paintBetAsk() {
  const card = document.getElementById("rec-open");
  if (!card || card.querySelector(".bet-ask")) return;
  const box = document.createElement("div");
  box.className = "bet-ask";
  box.innerHTML = `<p>Ask the parrot about this game.</p><div class="bet-ask-picks"></div><form><input name="q" placeholder="Or ask your own question" autocomplete="off" maxlength="240"><button type="submit">Look it up</button></form><p class="bet-ask-say" hidden></p>`;
  const picks = box.querySelector(".bet-ask-picks");
  BET_ASKS.forEach(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => askBet(id, label));
    picks.append(button);
  });
  box.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const question = box.querySelector("input").value.trim();
    if (question) askBet("", question);
  });
  const save = card.querySelector(".pick-save");
  if (save) save.before(box);
  else card.append(box);
}

function betTitle() {
  const card = document.getElementById("rec-open");
  return (card && card.querySelector("h2") && card.querySelector("h2").textContent) || "";
}

function betAim() {
  const card = document.getElementById("rec-open");
  return (card && card.querySelector(".aim") && card.querySelector(".aim").textContent) || "";
}

function betLegs() {
  const card = document.getElementById("rec-open");
  const row = (window.recTickets || [])[Number(card && card.dataset.rec)];
  const ticket = row && row.ticket;
  return ((ticket && ticket.legs) || []).map((leg) => ({
    label: leg.label || "",
    sport: leg.sport || "",
    gameId: leg.gameId || "",
  }));
}

function showAsk(say, text) {
  const lines = String(text || "").split("\n").filter(Boolean);
  const list = lines.some((line) => /, (out|doubtful|questionable)$/.test(line));
  say.replaceChildren();
  lines.forEach((line) => {
    const row = document.createElement("span");
    row.textContent = line;
    if (list && line.indexOf(",") === -1 && / at /.test(line)) row.className = "bet-ask-game";
    else if (list && line.indexOf(",") === -1) row.className = "bet-ask-team";
    say.append(row);
  });
}

function worthFacts() {
  const card = document.getElementById("rec-open");
  const row = (window.recTickets || [])[Number(card && card.dataset.rec)];
  const ticket = row && row.ticket;
  const price = Number(ticket && ticket.american);
  if (!ticket || !Number.isFinite(price) || !price) return "The price is not on this bet.";
  const stake = 5;
  const profit = Math.round(stake * (price > 0 ? price / 100 : 100 / Math.abs(price)) * 100) / 100;
  const back = Math.round((stake + profit) * 100) / 100;
  const implied = Number(ticket.impliedPct);
  const need = Number.isFinite(implied) ? implied : (price > 0 ? (100 / (price + 100)) * 100 : (Math.abs(price) / (Math.abs(price) + 100)) * 100);
  const shown = price > 0 ? `+${price}` : String(price);
  const archive = ((window.state && window.state.board && window.state.board.archive) || []).filter((item) => item.card === ticket.card && (item.result === "won" || item.result === "lost"));
  const rate = typeof recPct === "function" ? recPct(archive, 0) : "—";
  const hit = /%$/.test(String(rate)) ? Number(String(rate).replace("%", "")) : NaN;
  const base = `A $${stake} bet at ${shown} returns $${back.toFixed(2)}, so the profit is $${profit.toFixed(2)} and a miss loses $${stake}. It has to win ${need.toFixed(1)}% of the time to break even.`;
  if (!Number.isFinite(hit)) return `${base} This strategy has no settled bets yet, so the long run is not known.`;
  const each = Math.round((hit / 100 * profit - (1 - hit / 100) * stake) * 100) / 100;
  const hundred = Math.round(each * 100 * 100) / 100;
  const side = each >= 0 ? "a profit" : "a loss";
  return `${base} This strategy has hit ${rate} of ${recPct.n} settled bets. That is ${hit >= need ? "above" : "below"} the break-even. Repeating the $${stake} bet expects ${side} of $${Math.abs(each).toFixed(2)} each time, about $${Math.abs(hundred).toFixed(2)} over 100 bets.`;
}

async function askBet(attribute, question) {
  const card = document.getElementById("rec-open");
  const say = card && card.querySelector(".bet-ask-say");
  if (!say) return;
  const ai = !attribute || attribute === "worth";
  say.hidden = false;
  say.textContent = ai ? "Asking the parrot." : "Checking the public log.";
  card.querySelectorAll(".bet-ask-picks button").forEach((button) => {
    button.classList.toggle("on", attribute && button.textContent === question);
  });
  try {
    const response = await fetch("/api/bet-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribute: attribute === "worth" ? "worth" : attribute, question, worth: attribute === "worth" ? worthFacts() : "", title: betTitle(), aim: betAim(), legs: betLegs() }),
    });
    const data = await response.json();
    showAsk(say, data.answer || data.error || (ai ? "The parrot did not answer." : "That did not come back."));
  } catch (err) {
    say.textContent = ai ? "The parrot did not answer." : "That did not come back.";
  }
}

if (typeof window.openRec === "function") {
  const openRecWas = window.openRec;
  window.openRec = function (index) {
    openRecWas(index);
    const card = document.getElementById("rec-open");
    if (card) card.dataset.rec = String(index);
    paintBetAsk();
  };
}
