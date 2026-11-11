// "+ Add a leg" under the parlay opens a blank leg. Pick a player or team from the parlay's games, then pick a prop.
const legNew = { open: false, pick: "", q: "" };

function legNewGames() {
  return new Set([...parlayLeg.values()].map((bet) => `${bet.match}|${bet.kickoff}`));
}

function legNewPeople(board) {
  const games = legNewGames(), inGame = (bet) => games.has(`${bet.match}|${bet.kickoff}`), count = (person) => (person.bets || []).filter(inGame).length;
  return (board.people || []).filter((person) => (person.kind === "player" || person.kind === "team") && !/^(any other|no )/i.test(person.name || "") && count(person))
    .sort((a, b) => (a.kind === "team" ? 0 : 1) - (b.kind === "team" ? 0 : 1) || count(b) - count(a) || a.name.localeCompare(b.name));
}

function legNewProps(person) {
  const games = legNewGames(), team = person.kind === "team", want = legSwapChance(-110), best = new Map();
  (person.bets || []).forEach((bet) => {
    const chance = legSwapChance(bet.odds);
    if (!chance || !games.has(`${bet.match}|${bet.kickoff}`) || parlayLeg.has(parlayKey(bet)) || (team && /alt/i.test(bet.market || ""))) return;
    const group = team ? `${bet.market}|${String(bet.label || "").replace(/\s*spread\b/i, "").replace(/[+-]?\d+(?:\.\d+)?/g, "#")}` : `${legSwapStat(person, bet)}|${/\bunder\b/i.test(bet.label || "")}|${bet.match}`;
    const gap = Math.abs(chance - want), had = best.get(group);
    if (!had || gap < had.gap) best.set(group, { bet, gap });
  });
  const part = (bet) => (/\b(1st|2nd|3rd|4th)\s+(qtr|half|quarter)\b|first \d+ minutes|(each|every) quarter|first basket/i.test(`${bet.market} ${bet.label}`) ? 4 : 0);
  const main = (bet) => (team ? (["Moneyline", "Spread", "Total"].indexOf(bet.market) + 4) % 4 : /\bunder\b/i.test(bet.label || "") ? 1 : 0);
  return [...best.values()].sort((a, b) => part(a.bet) + main(a.bet) - part(b.bet) - main(b.bet) || a.gap - b.gap).map((row) => row.bet);
}

function legNewWho(list, people) {
  const q = legNew.q.trim().toLowerCase();
  list.replaceChildren(...people.filter((person) => !q || person.name.toLowerCase().includes(q)).map((person) => {
    const go = document.createElement("button");
    go.type = "button";
    go.className = person.kind === "team" ? "find-new-pick team" : "find-new-pick";
    go.textContent = person.name;
    go.addEventListener("click", () => { legNew.pick = person.key; legNewPaint(); });
    return go;
  }));
  if (!list.children.length) { const none = document.createElement("p"); none.textContent = "No one in this game by that name."; list.append(none); }
}

function legNewBox(board) {
  const box = document.createElement("div");
  box.className = "find-new";
  if (!legNew.open) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "find-new-add";
    add.textContent = "+ Add a leg";
    add.addEventListener("click", () => { legNew.open = true; legNew.pick = ""; legNew.q = ""; legNewPaint(); const field = document.querySelector(".find-tray .find-new input"); if (field) field.focus(); });
    box.append(add);
    return box;
  }
  box.classList.add("on");
  const people = legNewPeople(board), person = people.find((one) => one.key === legNew.pick);
  const top = document.createElement("div");
  top.className = "find-new-top";
  const title = document.createElement("b");
  title.textContent = person ? person.name : "New leg";
  const shut = document.createElement("button");
  shut.type = "button";
  shut.className = "find-new-x";
  shut.setAttribute("aria-label", "Cancel the new leg");
  shut.textContent = "×";
  shut.addEventListener("click", () => { legNew.open = false; legNew.pick = ""; legNewPaint(); });
  top.append(title);
  if (person) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "find-new-back";
    back.textContent = "Change";
    back.addEventListener("click", () => { legNew.pick = ""; legNewPaint(); });
    top.append(back);
  }
  top.append(shut);
  box.append(top);
  if (!person) {
    const field = document.createElement("input");
    field.type = "search";
    field.placeholder = "Pick a player or team, or type a name";
    field.value = legNew.q;
    const list = document.createElement("div");
    list.className = "find-new-who";
    field.addEventListener("input", () => { legNew.q = field.value; legNewWho(list, people); });
    legNewWho(list, people);
    box.append(field, list);
    return box;
  }
  const props = document.createElement("div");
  props.className = "find-tray-swap";
  const bets = legNewProps(person);
  if (!bets.length) { const none = document.createElement("p"); none.textContent = `FanDuel has nothing else posted for ${person.name} in this game.`; props.append(none); }
  bets.forEach((bet) => {
    const price = Number(bet.odds);
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-swap-go";
    go.title = "Add to the parlay";
    go.innerHTML = [`<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, typeof findPct === "function" && findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, `<i class="prop">${esc(person.kind === "team" ? (/\d/.test(legGameWhat(bet)) ? legGameWhat(bet) : `${legGameWhat(bet)} · ${bet.market}`) : legSwapWhat(person, bet))}</i>`].filter(Boolean).join("");
    go.addEventListener("click", () => { legNew.open = false; legNew.pick = ""; legSwapAdd(person.kind === "player" ? person : null, bet); });
    props.append(go);
  });
  box.append(props);
  return box;
}

function legNewPaint() {
  document.querySelectorAll(".find-tray").forEach((tray) => {
    tray.querySelectorAll(":scope > .find-new").forEach((node) => node.remove());
    const board = tray.closest(".find-board");
    if (tray.hidden || !board || !parlayLeg.size) return;
    const box = legNewBox(board), rows = tray.querySelectorAll(":scope > .find-row");
    if (rows.length) rows[rows.length - 1].after(box); else tray.append(box);
  });
}

if (typeof paintParlay === "function") {
  const paintParlayNew = paintParlay;
  paintParlay = function () { paintParlayNew.apply(this, arguments); legNewPaint(); };
}
