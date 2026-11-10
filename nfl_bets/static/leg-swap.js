// The swap icon on a parlay leg lists bets in the same game at about the same chance, and one tap trades the leg for it.
// Tapping the prop itself lists the other numbers FanDuel has for that player and stat.
// Tapping the player's name lists that player's other stats in the game, each at the line closest to this price.
// Tapping a player's name on his tray row lists one line per stat, and one tap adds it.
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
  if ((/^most\s/i.test(market) && !/\d/.test(rest)) || /\b(in the first \d+ minutes|in each quarter)\b/i.test(market)) return market;
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

function legSwapStat(person, bet) {
  const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").replace(/^(alt|total)\s+/i, "").trim().toLowerCase();
  if (/^(any time touchdown scorer|to score \d+\+ touchdowns)$/.test(market)) return "touchdowns";
  return market.replace(/\d+\+/g, "n+").replace(/^n\+\s+/, "").replace(/^made threes$/, "threes");
}

function legLineFind(key) {
  const old = parlayLeg.get(key);
  const board = document.querySelector(".find-board");
  if (!old || !board) return [];
  const person = (board.people || []).find((one) => one.kind === "player" && String(old.label || "").startsWith(one.name));
  if (!person) return [];
  const stat = (bet) => legSwapStat(person, bet);
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
  const stat = (bet) => legSwapStat(person, bet);
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

function legWhoFind(key) {
  const person = parlayPick.get(key.replace(/^who:/, ""));
  if (!person) return [];
  const mine = [...parlayLeg.values()].find((bet) => String(bet.label || "").startsWith(person.name));
  const want = mine ? legSwapChance(mine.odds) : legSwapChance(-110), best = new Map();
  (person.bets || []).forEach((bet) => {
    const chance = legSwapChance(bet.odds);
    if (!chance || parlayLeg.has(parlayKey(bet))) return;
    const group = `${legSwapStat(person, bet)}|${/\bunder\b/i.test(bet.label || "")}|${bet.match}|${bet.kickoff}`;
    const gap = Math.abs(chance - want), had = best.get(group);
    if (!had || gap < had.gap) best.set(group, { person, bet, gap });
  });
  const rank = ({ bet }) => (/^(1st|2nd|3rd|4th)\s+(qtr|half|quarter)\b|\b(first \d+ minutes|each quarter|first basket)\b/i.test(String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "")) ? 2 : 0) + (/\bunder\b/i.test(bet.label || "") ? 1 : 0);
  return [...best.values()].sort((a, b) => rank(a) - rank(b) || a.gap - b.gap);
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
  const rows = mode === "who" ? legWhoFind(key) : mode === "line" ? legLineFind(key) : mode === "kind" ? legKindFind(key) : legSwapFind(key);
  if (!rows.some((row) => !row.now)) { const none = document.createElement("p"); none.textContent = mode === "who" ? "FanDuel has no props posted for this player." : mode === "line" ? "FanDuel has no other numbers on this prop." : mode === "kind" ? "FanDuel has no other props for this player in this game." : "Nothing else in this game sits at this price."; box.append(none); return box; }
  rows.forEach(({ person, bet, now }) => {
    const price = Number(bet.odds);
    const go = document.createElement("button");
    go.type = "button";
    go.className = now ? "find-swap-go now" : "find-swap-go";
    go.title = now ? "In the parlay" : mode === "who" ? "Add to the parlay" : mode === "line" ? "Change to this number" : mode === "kind" ? "Change to this prop" : `Trade this leg for ${person.name}`;
    go.innerHTML = [`<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, typeof findPct === "function" && findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, mode === "swap" && `<i class="who">${esc(person.name)}</i>`, `<i class="prop">${esc(legSwapWhat(person, bet))}</i>`].filter(Boolean).join("");
    go.addEventListener("click", () => { if (mode === "who") { legSwapOpen.delete(key); legSwapAdd(person, bet); } else if (now) { legSwapOpen.delete(key); legSwapPaint(); } else legSwapTrade(key, person, bet); });
    const row = document.createElement("div");
    row.className = "find-swap-row";
    row.append(go);
    if (!now && mode !== "who") {
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
  document.querySelectorAll(".find-tray .find-in button.find-name[data-key]").forEach((name) => {
    const key = `who:${name.dataset.key}`, on = legSwapOpen.get(key) === "who";
    name.classList.toggle("on", on);
    name.setAttribute("aria-expanded", String(on));
    name.title = on ? "Hide his props" : "Show his props";
    document.querySelectorAll(".find-tray .find-tray-swap").forEach((box) => { if (box.dataset.key === key) box.remove(); });
    if (on) { const box = legSwapBox(key, "who"); box.dataset.key = key; name.closest(".find-in").after(box); }
  });
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest && event.target.closest(".find-tray button.find-leg-swap, .find-tray .find-chose i.prop[data-key], .find-tray .find-chose i.who[data-key], .find-tray .find-in button.find-name[data-key]");
  if (!hit) return;
  const name = hit.matches("button.find-name");
  const key = name ? `who:${hit.dataset.key}` : hit.dataset.key, mode = name ? "who" : hit.matches("i.prop") ? "line" : hit.matches("i.who") ? "kind" : "swap";
  if (legSwapOpen.get(key) === mode) legSwapOpen.delete(key); else legSwapOpen.set(key, mode);
  legSwapPaint();
});

if (typeof paintParlay === "function") {
  const paintParlaySwaps = paintParlay;
  paintParlay = function () { paintParlaySwaps.apply(this, arguments); legSwapPaint(); };
}
