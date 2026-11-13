// Search, history and swap buttons on each leg of a recommended parlay. A swap changes only the ticket on that card.

function recLegDeal(legs) {
  const dec = legs.reduce((all, leg) => { const odds = Number(leg.odds); return all * (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds); }, 1);
  const odds = Math.round(dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1));
  return { odds, need: typeof findPct === "function" ? findPct(odds) : "", wins: 5 * (dec - 1) };
}

function recLegFind(card, at) {
  const pick = card.recLegs[at], game = card.recLegGame;
  const person = (card.recLegPeople || []).find((row) => row.kind === "player" && row.name === pick.who);
  const bet = person && (person.bets || []).find((row) => row.label === pick.label && row.market === pick.market && row.match === game.match);
  return bet ? { person, bet } : null;
}

function recLegTools(card, legs, game, people, redo, edit) {
  Object.assign(card, { recLegs: legs, recLegGame: game, recLegPeople: people, recLegRedo: redo, recLegEdit: edit, recLegOpen: null });
  card.querySelectorAll(".find-script-leg").forEach((row, at) => {
    const tools = document.createElement("span"); tools.className = "rec-leg-tools";
    [["seek", `Search for ${legs[at].who}`], ["hist", "Show the history"], ["swap", "Swap for a bet at the same price"]].forEach(([kind, title]) => {
      const button = document.createElement("button"); button.type = "button"; button.className = `rec-leg-${kind}`; button.dataset.at = at; button.title = title; button.setAttribute("aria-label", title);
      tools.append(button);
    });
    row.append(tools);
  });
}

function recLegHist(card, at) {
  const pick = card.recLegs[at], block = document.createElement("div");
  block.className = "find-tray-read log-on rec-leg-box";
  Object.assign(block.dataset, { who: pick.who || "", raw: String(pick.label || "").split(/\s+—\s+/)[0].trim(), market: pick.market || "", odds: String(pick.odds || ""), sport: card.recLegGame.sport || "" });
  const wait = document.createElement("p"); wait.className = "find-leg-wait"; wait.textContent = "Reading the history."; block.append(wait);
  if (typeof fillLeg === "function") fillLeg(block);
  return block;
}

function recLegSwaps(card, at) {
  const found = recLegFind(card, at), box = document.createElement("div");
  box.className = "find-tray-swap rec-leg-box";
  const rows = [];
  if (found) {
    const want = legSwapChance(found.bet.odds), on = new Set(card.recLegs.map((pick) => pick.who)), best = new Map();
    (card.recLegPeople || []).forEach((person) => {
      if (person.kind !== "player" || on.has(person.name)) return;
      (person.bets || []).forEach((bet) => {
        if (bet.match !== found.bet.match || bet.kickoff !== found.bet.kickoff) return;
        const chance = legSwapChance(bet.odds);
        if (!chance || Math.abs(chance - want) > want * 0.06) return;
        const gap = Math.abs(chance - want), had = best.get(person.key);
        if (!had || gap < had.gap) best.set(person.key, { person, bet, gap });
      });
    });
    rows.push(...[...best.values()].sort((a, b) => a.gap - b.gap).slice(0, 6));
  }
  if (!rows.length) { const none = document.createElement("p"); none.textContent = "Nothing else in this game sits at this price."; box.append(none); return box; }
  rows.forEach(({ person, bet }) => {
    const price = Number(bet.odds), go = document.createElement("button");
    go.type = "button"; go.className = "find-swap-go"; go.title = `Trade this leg for ${person.name}`;
    go.innerHTML = [`<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, `<i class="who">${esc(person.name)}</i>`, `<i class="prop">${esc(legSwapWhat(person, bet))}</i>`].filter(Boolean).join("");
    const rec = typeof scriptRecPill === "function" && scriptRecPill(bet);
    if (rec) go.append(rec);
    go.addEventListener("click", () => {
      const next = card.recLegs.slice();
      next[at] = { who: person.name, team: String(person.team || "").split(" ").pop(), pos: person.pos || "", text: legSwapWhat(person, bet), label: bet.label, market: bet.market, odds: bet.odds };
      card.recLegRedo(next);
    });
    const row = document.createElement("div"); row.className = "find-swap-row"; row.append(go); box.append(row);
  });
  return box;
}

function recLegShut(card) {
  card.querySelectorAll(".rec-leg-box").forEach((node) => node.remove());
  card.querySelectorAll(".rec-leg-tools button.on").forEach((node) => node.classList.remove("on"));
  card.recLegOpen = null;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest && event.target.closest(".find-script-ticket .rec-leg-tools button");
  if (!button) return;
  event.stopPropagation();
  const card = button.closest(".find-script-ticket"), at = Number(button.dataset.at), kind = button.className.replace("rec-leg-", "").split(" ")[0];
  if (kind === "seek") { if (typeof legSeek === "function") legSeek(card.recLegs[at].who); return; }
  const same = card.recLegOpen && card.recLegOpen.at === at && card.recLegOpen.kind === kind;
  recLegShut(card);
  if (same) return;
  const box = kind === "hist" ? recLegHist(card, at) : recLegSwaps(card, at);
  button.closest(".find-script-leg").after(box);
  button.classList.add("on");
  card.recLegOpen = { at, kind };
});
