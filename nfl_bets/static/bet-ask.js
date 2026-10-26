const BET_ASKS = [
  ["out", "Who is out"],
  ["rest", "Rest"],
  ["building", "The building"],
  ["weather", "Wind and rain"],
  ["total", "The total"],
  ["recent", "Recent games"],
  ["rivalry", "Rivalry"],
];

function paintBetAsk(host, bet) {
  const card = host || document.getElementById("rec-open");
  const scope = bet || card;
  if (!card || card.querySelector(".bet-ask")) return;
  const box = document.createElement("div");
  box.className = "bet-ask";
  const brief = !!(host && host.classList.contains("rec-more"));
  box.innerHTML = `${brief ? "" : `<p>Ask the parrot about this game.</p><div class="bet-ask-picks"></div>`}<form><input name="q" placeholder="Or ask your own question" autocomplete="off" maxlength="240"><button type="submit">Ask Parlay the Parrot</button></form><p class="bet-ask-say" hidden></p>`;
  const picks = box.querySelector(".bet-ask-picks");
  if (brief) {
    const facts = document.createElement("div");
    facts.className = "bet-brief";
    box.append(facts);
  }
  (picks ? [...BET_ASKS] : []).forEach(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => askBet(id, label, scope));
    picks.append(button);
  });
  box.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const question = box.querySelector("input").value.trim();
    if (question) askBet("", question, scope);
  });
  const save = card.id === "rec-open" ? card.querySelector(".pick-save") : null;
  if (save) save.before(box);
  else card.append(box);
}

function betTitle(card) {
  const node = card || document.getElementById("rec-open");
  const head = node && (node.querySelector("h2") || node.querySelector(":scope > b"));
  return (head && head.textContent) || "";
}

function betAim(card) {
  const node = card || document.getElementById("rec-open");
  const aim = node && (node.querySelector(".aim") || node.querySelector(".rec-gist em"));
  return (aim && aim.textContent) || "";
}

function betLegs(card) {
  const node = card || document.getElementById("rec-open");
  const row = (window.recTickets || [])[Number(node && node.dataset.rec)];
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
    if (line.startsWith("# ")) {
      row.textContent = line.slice(2);
      row.className = / at /.test(line) ? "bet-ask-game" : "bet-ask-head";
    } else {
      row.textContent = line;
      if (list && line.indexOf(",") === -1 && !/[.]/.test(line) && line.length < 42) row.className = "bet-ask-team";
    }
    say.append(row);
  });
}

function worthFacts(card) {
  const node = card || document.getElementById("rec-open");
  const row = (window.recTickets || [])[Number(node && node.dataset.rec)];
  const ticket = row && row.ticket;
  const price = Number(ticket && ticket.american);
  if (!ticket || !Number.isFinite(price) || !price) return "The price is not on this bet.";
  const raw = Number(node && node.dataset.stake);
  const stake = raw > 0 ? Math.round(raw * 100) / 100 : 5;
  const profit = Math.round(stake * (price > 0 ? price / 100 : 100 / Math.abs(price)) * 100) / 100;
  const back = Math.round((stake + profit) * 100) / 100;
  const implied = Number(ticket.impliedPct);
  const need = Number.isFinite(implied) ? implied : (price > 0 ? (100 / (price + 100)) * 100 : (Math.abs(price) / (Math.abs(price) + 100)) * 100);
  const shown = price > 0 ? `+${price}` : String(price);
  const archive = ((window.state && window.state.board && window.state.board.archive) || []).filter((item) => item.card === ticket.card && (item.result === "won" || item.result === "lost"));
  const rate = typeof recPct === "function" ? recPct(archive, 0) : "—";
  const hit = /%$/.test(String(rate)) ? Number(String(rate).replace("%", "")) : NaN;
  const base = `A $${stake} bet at ${shown} returns $${back.toFixed(2)}, so the profit is $${profit.toFixed(2)} and a miss loses $${stake}. It has to win ${need.toFixed(1)}% of the time to break even.`;
  if (!Number.isFinite(hit)) return base;
  const each = Math.round((hit / 100 * profit - (1 - hit / 100) * stake) * 100) / 100;
  const hundred = Math.round(each * 100 * 100) / 100;
  const side = each >= 0 ? "a profit" : "a loss";
  return `${base} This strategy has hit ${rate} of ${recPct.n} settled bets. That is ${hit >= need ? "above" : "below"} the break-even. Repeating the $${stake} bet expects ${side} of $${Math.abs(each).toFixed(2)} each time, about $${Math.abs(hundred).toFixed(2)} over 100 bets.`;
}

function worthSay(node) {
  let say = node.querySelector(":scope > .worth-say");
  if (say) return say;
  say = document.createElement("p");
  say.className = "bet-ask-say worth-say";
  const copy = node.querySelector(".rec-copy");
  if (copy) copy.after(say);
  else node.append(say);
  return say;
}

async function askBet(attribute, question, card, sayNode) {
  const node = card || document.getElementById("rec-open");
  if (attribute === "worth" && node) {
    const facts = worthFacts(node);
    const say = worthSay(node);
    say.hidden = false;
    say.textContent = facts;
    node.querySelectorAll(".worth-bet").forEach((button) => button.classList.add("on"));
    try {
      const response = await fetch("/api/bet-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attribute: "worth", question, worth: facts, title: betTitle(node), aim: betAim(node), legs: [] }),
      });
      const data = await response.json();
      say.textContent = data.answer || data.error || facts;
    } catch (err) { /* the price math stays on the card */ }
    return;
  }
  let say = sayNode || (node && node.querySelector(".bet-ask > .bet-ask-say"));
  if (node && !say) { say = document.createElement("p"); say.className = "bet-ask-say"; node.append(say); }
  if (!say) return;
  const ai = !attribute;
  say.hidden = false;
  say.textContent = attribute === "all" ? "Checking the games." : ai ? "Asking the parrot." : "Checking the public log.";
  node.querySelectorAll(".bet-ask-picks button, .worth-bet").forEach((button) => {
    button.classList.toggle("on", attribute === "worth" ? button.classList.contains("worth-bet") : attribute && attribute !== "all" && button.textContent === question);
  });
  try {
    const response = await fetch("/api/bet-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribute: attribute === "worth" ? "worth" : attribute, question, worth: attribute === "worth" ? worthFacts(node) : "", title: betTitle(node), aim: betAim(node), legs: betLegs(node) }),
    });
    const data = await response.json();
    showAsk(say, data.answer || data.error || (ai ? "The parrot did not answer." : "That did not come back."));
  } catch (err) {
    say.textContent = ai ? "The parrot did not answer." : "That did not come back.";
  }
}

function showMore(bet) {
  const button = bet.querySelector(".more-bet");
  const open = bet.querySelector(".rec-more");
  if (open) {
    const said = open.querySelector(".bet-ask-say");
    if (said && said.textContent) bet.append(said);
    open.remove();
    if (button) button.textContent = "More Info";
    return;
  }
  const box = document.createElement("div");
  box.className = "rec-more";
  const row = (window.recTickets || [])[Number(bet.dataset.rec)];
  const ticket = row && row.ticket;
  if (ticket && typeof starHtml === "function") {
    const stars = document.createElement("p");
    stars.className = "pick-save";
    stars.innerHTML = starHtml(typeof cardGood === "function" ? cardGood(ticket.card, ticket) : 0, ticket.card, "", "");
    box.append(stars);
  }
  bet.append(box);
  paintBetAsk(box, bet);
  const brief = box.querySelector(".bet-brief");
  if (brief) askBet("all", "", bet, brief);
  const stray = bet.querySelector(":scope > .bet-ask-say");
  const slot = box.querySelector(".bet-ask-say");
  if (stray && slot) slot.replaceWith(stray);
  if (button) button.textContent = "Hide Info";
}

function editStake(button) {
  const bet = button.closest(".rec-bet, #rec-open");
  if (!bet) return;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "stake";
  input.min = "1";
  input.max = "100000";
  input.step = "1";
  input.setAttribute("aria-label", "Bet size");
  input.value = button.textContent.replace(/[^0-9.]/g, "") || "5";
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    if (!input.isConnected) return;
    const amount = Number(input.value);
    const stake = Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5;
    bet.dataset.stake = String(stake);
    const row = (window.recTickets || [])[Number(bet.dataset.rec)];
    const price = Number(row && row.ticket && row.ticket.american);
    const copy = bet.querySelector(".rec-copy");
    if (copy && window.recWin) copy.innerHTML = recWin(price, stake);
    if (bet.querySelector(":scope > .worth-say")) askBet("worth", "Worth Risk?", bet);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { input.value = button.textContent; input.blur(); }
  });
  input.addEventListener("blur", finish);
}

document.addEventListener("click", (event) => {
  const stake = event.target.closest(".rec-copy button.stake");
  if (stake) { editStake(stake); return; }
  const worth = event.target.closest(".rec-board .worth-bet");
  if (worth) { askBet("worth", "Worth Risk?", worth.closest(".rec-bet")); return; }
  const more = event.target.closest(".rec-board .more-bet");
  if (more) showMore(more.closest(".rec-bet"));
});

if (typeof window.openRec === "function") {
  const openRecWas = window.openRec;
  window.openRec = function (index) {
    openRecWas(index);
    const card = document.getElementById("rec-open");
    if (card) card.dataset.rec = String(index);
    paintBetAsk();
  };
}
