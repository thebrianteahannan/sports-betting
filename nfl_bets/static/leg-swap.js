// The swap icon on a parlay leg lists bets in the same game at about the same chance, and one tap trades the leg for it.
// Tapping the prop itself lists the other numbers FanDuel has for that player and stat.
// Tapping the player's name lists that player's other stats in the game, each at the line closest to this price.
const legSwapOpen = new Map();

function legSwapChance(odds) {
  const price = Number(odds);
  return price > 0 ? 100 / (price + 100) : price < 0 ? -price / (-price + 100) : 0;
}

function legSwapWhat(person, bet) {
  const rest = String(bet.label || "").replace(person.name, "").split(/\s+—\s+/)[0].trim();
  const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").trim();
  const part = (market.match(/^(1st|2nd|3rd|4th)\s+(qtr|half)\b/i) || [""])[0];
  if (part && rest && !rest.toLowerCase().includes(part.toLowerCase())) return `${part} ${rest}`;
  if (/^most\s/i.test(market) && !/\d/.test(rest)) return market;
  return !rest || /^(over|under)(\s+[\d.]+)?$/i.test(rest) ? [rest, market.replace(/^alt\s+/i, "")].filter(Boolean).join(" ") : rest;
}

function legSwapFind(key) {
  const old = parlayLeg.get(key);
  const board = document.querySelector(".find-board");
  if (!old || !board) return [];
  const want = legSwapChance(old.odds), owner = String(old.label || "");
  const best = new Map();
  (board.people || []).forEach((person) => {
    if (person.kind !== "player" || owner.startsWith(person.name)) return;
    (person.bets || []).forEach((bet) => {
      if (bet.match !== old.match || bet.kickoff !== old.kickoff || parlayLeg.has(parlayKey(bet))) return;
      const chance = legSwapChance(bet.odds);
      if (!chance || Math.abs(chance - want) > want * 0.06) return;
      const gap = Math.abs(chance - want), had = best.get(person.key);
      if (!had || gap < had.gap) best.set(person.key, { person, bet, gap });
    });
  });
  return [...best.values()].sort((a, b) => a.gap - b.gap).slice(0, 6);
}

function legLineFind(key) {
  const old = parlayLeg.get(key);
  const board = document.querySelector(".find-board");
  if (!old || !board) return [];
  const person = (board.people || []).find((one) => one.kind === "player" && String(old.label || "").startsWith(one.name));
  if (!person) return [];
  const stat = (bet) => { const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").replace(/^alt\s+/i, "").trim().toLowerCase(); return /^(any time touchdown scorer|to score \d+\+ touchdowns)$/.test(market) ? "touchdowns" : market; };
  const under = (bet) => /\bunder\b/i.test(bet.label || "");
  const num = (bet) => Number((String(bet.label || "").replace(person.name, "").match(/\d+(?:\.\d+)?/) || String(bet.market || "").match(/\d+(?:\.\d+)?/) || [])[0]) || (stat(bet) === "touchdowns" ? 1 : 0);
  const seen = new Set(), same = (bet) => bet.label === old.label && bet.market === old.market;
  return (person.bets || []).filter((bet) => {
    const id = `${bet.label}|${bet.market}`;
    if (bet.match !== old.match || bet.kickoff !== old.kickoff || stat(bet) !== stat(old) || under(bet) !== under(old) || !Number(bet.odds) || seen.has(id)) return false;
    if (!same(bet) && parlayLeg.has(parlayKey(bet))) return false;
    seen.add(id);
    return true;
  }).map((bet) => ({ person, bet, now: same(bet) })).sort((a, b) => num(a.bet) - num(b.bet));
}

function legKindFind(key) {
  const old = parlayLeg.get(key);
  const board = document.querySelector(".find-board");
  if (!old || !board) return [];
  const person = (board.people || []).find((one) => one.kind === "player" && String(old.label || "").startsWith(one.name));
  if (!person) return [];
  const stat = (bet) => { const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").replace(/^(alt|total)\s+/i, "").trim().toLowerCase(); return /^(any time touchdown scorer|to score \d+\+ touchdowns)$/.test(market) ? "touchdowns" : market; };
  const want = legSwapChance(old.odds), best = new Map();
  (person.bets || []).forEach((bet) => {
    if (bet.match !== old.match || bet.kickoff !== old.kickoff || stat(bet) === stat(old) || parlayLeg.has(parlayKey(bet))) return;
    const chance = legSwapChance(bet.odds);
    if (!chance) return;
    const gap = Math.abs(chance - want), had = best.get(stat(bet));
    if (!had || gap < had.gap) best.set(stat(bet), { person, bet, gap });
  });
  return [...best.values()].sort((a, b) => a.gap - b.gap);
}

function legSwapTrade(key, person, bet) {
  const old = parlayLeg.get(key);
  if (!old) return;
  legSwapOpen.delete(key);
  parlayLeg.delete(key);
  parlayLeg.set(parlayKey(bet), bet);
  if (!parlayPick.has(person.key)) parlayPick.set(person.key, person);
  [...parlayPick.entries()].forEach(([pick, who]) => { if (![...parlayLeg.values()].some((row) => String(row.label || "").startsWith(who.name))) parlayPick.delete(pick); });
  paintParlay();
}

function legSwapAdd(person, bet) {
  parlayLeg.set(parlayKey(bet), bet);
  if (!parlayPick.has(person.key)) parlayPick.set(person.key, person);
  paintParlay();
}

function legSwapBox(key, mode) {
  const box = document.createElement("div");
  box.className = "find-tray-swap";
  const rows = mode === "line" ? legLineFind(key) : mode === "kind" ? legKindFind(key) : legSwapFind(key);
  if (!rows.some((row) => !row.now)) { const none = document.createElement("p"); none.textContent = mode === "line" ? "FanDuel has no other numbers on this prop." : mode === "kind" ? "FanDuel has no other props for this player in this game." : "Nothing else in this game sits at this price."; box.append(none); return box; }
  rows.forEach(({ person, bet, now }) => {
    const price = Number(bet.odds);
    const go = document.createElement("button");
    go.type = "button";
    go.className = now ? "find-swap-go now" : "find-swap-go";
    go.title = now ? "In the parlay" : mode === "line" ? "Change to this number" : mode === "kind" ? "Change to this prop" : `Trade this leg for ${person.name}`;
    go.innerHTML = [`<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, typeof findPct === "function" && findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, mode === "swap" && `<i class="who">${esc(person.name)}</i>`, `<i class="prop">${esc(legSwapWhat(person, bet))}</i>`].filter(Boolean).join("");
    go.addEventListener("click", () => { if (now) { legSwapOpen.delete(key); legSwapPaint(); } else legSwapTrade(key, person, bet); });
    const row = document.createElement("div");
    row.className = "find-swap-row";
    row.append(go);
    if (!now) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "find-swap-add";
      add.title = "Add to the parlay";
      add.setAttribute("aria-label", "Add to the parlay");
      add.addEventListener("click", () => legSwapAdd(person, bet));
      row.append(add);
    }
    box.append(row);
  });
  return box;
}

function legSwapPaint() {
  document.querySelectorAll(".find-tray button.find-leg-hist").forEach((hist) => {
    const key = hist.dataset.key;
    let swap = hist.parentElement.querySelector("button.find-leg-swap");
    if (!swap) {
      swap = document.createElement("button");
      swap.type = "button";
      swap.className = "find-leg-swap";
      swap.dataset.key = key;
      swap.setAttribute("aria-label", "Show other bets at this price");
      hist.after(swap);
    }
    const mode = parlayLeg.has(key) ? legSwapOpen.get(key) : "", on = mode === "swap";
    swap.classList.toggle("on", on);
    swap.setAttribute("aria-expanded", String(on));
    swap.title = on ? "Hide the swaps" : "Swap for a bet at the same price";
    const line = hist.closest(".find-chose");
    const prop = line && line.querySelector("span i.prop");
    if (prop) { prop.dataset.key = key; prop.title = mode === "line" ? "Hide the other numbers" : "Change the number"; prop.classList.toggle("on", mode === "line"); }
    const who = line && line.querySelector("span i.who");
    if (who && String((parlayLeg.get(key) || {}).label || "").startsWith(who.textContent)) { who.dataset.key = key; who.title = mode === "kind" ? "Hide the other props" : "Other props for this player"; who.classList.toggle("on", mode === "kind"); }
    document.querySelectorAll(".find-tray .find-tray-swap").forEach((box) => { if (box.dataset.key === key) box.remove(); });
    if (mode && line) { const box = legSwapBox(key, mode); box.dataset.key = key; line.after(box); }
  });
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest && event.target.closest(".find-tray button.find-leg-swap, .find-tray .find-chose i.prop[data-key], .find-tray .find-chose i.who[data-key]");
  if (!hit) return;
  const key = hit.dataset.key, mode = hit.matches("i.prop") ? "line" : hit.matches("i.who") ? "kind" : "swap";
  if (legSwapOpen.get(key) === mode) legSwapOpen.delete(key); else legSwapOpen.set(key, mode);
  legSwapPaint();
});

if (typeof paintParlay === "function") {
  const paintParlaySwaps = paintParlay;
  paintParlay = function () { paintParlaySwaps.apply(this, arguments); legSwapPaint(); };
}
