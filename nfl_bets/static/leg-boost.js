/** "Add juice" and "Add stability" next to "+ Add a leg". Each lists moves from the bet's own games, checked against each leg's last 10, with what the move does to the payout and the chance. */

const legBoost = { mode: "", asked: new Set() };
const LEG_BOOST = {
  juice: ["Add juice", "Bigger payout. Every leg here clears its price over its last 10."],
  steady: ["Add stability", "Higher chance. Swap the leg dragging it, lower a line, or drop it. The last rows add the cheapest legs on the board."],
};

function legBoostDec(odds) {
  const o = Number(odds);
  return o > 0 ? 1 + o / 100 : 1 + 100 / -o;
}

function legBoostPrice(dec) {
  return dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : String(Math.round(-100 / (dec - 1)));
}

function legBoostTicket(legs) {
  return legs.reduce((sum, bet) => ({ dec: sum.dec * legBoostDec(bet.odds), chance: sum.chance * legRoleChance(bet).chance }), { dec: 1, chance: 1 });
}

function legBoostLoad() {
  const board = document.querySelector(".find-board");
  if (!board || typeof nbaScriptProps !== "function" || typeof scriptRecLearn !== "function") return;
  new Map([...parlayLeg.values()].map((bet) => [`${bet.match}|${bet.kickoff}`, bet])).forEach((bet, key) => {
    if (legBoost.asked.has(key)) return;
    legBoost.asked.add(key);
    const props = nbaScriptProps(board.people, bet.match);
    if (!props.length) return;
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "story", match: bet.match, kickoff: bet.kickoff, props }) })
      .then((res) => res.json())
      .then((data) => { if (data && data.bets) scriptRecLearn(data.bets); if (typeof legRolePaint === "function") legRolePaint(); if (legBoost.mode) legBoostPaint(); })
      .catch((error) => { console.log("[leg-boost] could not read the game", bet.match, error); legBoost.asked.delete(key); });
  });
}

function legBoostPool(legs) {
  const board = document.querySelector(".find-board"), games = legNewGames(), mine = legs.map((bet) => String(bet.label || "")), out = [];
  ((board && board.people) || []).forEach((person) => {
    if (person.kind !== "player" || mine.some((label) => label.startsWith(person.name))) return;
    (person.bets || []).forEach((bet) => {
      if (!games.has(`${bet.match}|${bet.kickoff}`) || parlayLeg.has(parlayKey(bet)) || !Number(bet.odds)) return;
      const read = legRoleChance(bet);
      if (read.n) out.push({ person, bet, ...read });
    });
  });
  return out;
}

function legBoostLines(key, test) {
  const old = parlayLeg.get(key), base = old && legSwapChance(old.odds);
  if (!old || typeof legLineFind !== "function") return [];
  return legLineFind(key).filter((row) => !row.now && row.person && test(legSwapChance(row.bet.odds), base)).map((row) => ({ ...row, ...legRoleChance(row.bet) })).filter((row) => row.n);
}

function legBoostFair(row) {
  const price = legSwapChance(row.bet.odds), odds = Number(row.bet.odds);
  return row.chance > price && (odds < 150 || (row.n >= 10 && row.chance - price >= 0.03));
}

function legBoostJuice(legs) {
  const value = (row) => row.chance * legBoostDec(row.bet.odds) + (typeof scriptRecAll !== "undefined" && /script|both/.test((scriptRecAll.get(`${row.bet.label}|${row.bet.market}`) || {}).basis || "") ? 0.05 : 0);
  const adds = legBoostPool(legs).filter((row) => row.bet.odds > 100 && row.bet.odds <= 400 && legBoostFair(row)).sort((a, b) => value(b) - value(a)).filter((row, at, list) => list.findIndex((one) => one.person === row.person) === at).slice(0, 4).map((row) => ({ ...row, move: "add" }));
  const raises = legRoles(legs).filter((row) => row.role !== "juice").flatMap((row) => {
    const key = parlayKey(row.bet), best = legBoostLines(key, (now, was) => now < was).filter(legBoostFair).sort((a, b) => value(b) - value(a))[0];
    return best ? [{ ...best, move: "raise", old: key }] : [];
  }).slice(0, 2);
  return [...adds, ...raises];
}

function legBoostSteady(legs) {
  const roles = legRoles(legs), weak = roles.filter((row) => row.role !== "anchor").sort((a, b) => (b.riskShare - b.payShare) - (a.riskShare - a.payShare) || a.chance - b.chance)[0];
  const pool = legBoostPool(legs), out = [];
  if (weak) {
    const key = parlayKey(weak.bet), anchor = (row) => row.bet.odds <= -200 && row.chance >= 0.7;
    pool.filter((row) => anchor(row) && row.bet.match === weak.bet.match).sort((a, b) => b.chance * legBoostDec(b.bet.odds) - a.chance * legBoostDec(a.bet.odds)).slice(0, 2).forEach((row) => out.push({ ...row, move: "swap", old: key, was: weak.bet }));
  }
  roles.filter((row) => row.role !== "anchor").forEach((row) => {
    const key = parlayKey(row.bet), best = legBoostLines(key, (now, was) => now > was).filter((one) => one.chance >= row.chance + 0.08).sort((a, b) => legBoostDec(b.bet.odds) - legBoostDec(a.bet.odds))[0];
    if (best) out.push({ ...best, move: "lower", old: key });
  });
  if (legs.length > 1) roles.filter((row) => row.role === "dead").forEach((row) => out.push({ person: null, bet: row.bet, chance: row.chance, move: "drop", old: parlayKey(row.bet) }));
  pool.filter((row) => row.bet.odds <= -300 && row.n >= 10 && row.hits / row.n >= 0.9).sort((a, b) => legBoostDec(b.bet.odds) - legBoostDec(a.bet.odds)).slice(0, 2).forEach((row) => out.push({ ...row, move: "add" }));
  return out;
}

function legBoostDrop(key) {
  const old = parlayLeg.get(key);
  if (!old) return;
  parlayLeg.delete(key);
  [...parlayPick.entries()].forEach(([pick, who]) => { if (String(old.label || "").startsWith(who.name) && ![...parlayLeg.values()].some((row) => String(row.label || "").startsWith(who.name))) parlayPick.delete(pick); });
  paintParlay();
}

function legBoostRow(row, legs, now) {
  const next = row.move === "add" ? [...legs, row.bet] : row.move === "drop" ? legs.filter((bet) => parlayKey(bet) !== row.old) : [...legs.filter((bet) => parlayKey(bet) !== row.old), row.bet];
  const fx = legBoostTicket(next), role = row.move === "drop" ? null : legRoles(next).find((one) => one.bet === row.bet), price = Number(row.bet.odds), was = parlayLeg.get(row.old);
  const word = { add: "Add", raise: "Raise to", lower: "Lower to", drop: "Drop", swap: `Swap ${was ? legRoleName(was) : ""} for` }[row.move];
  const what = row.person ? legSwapWhat(row.person, row.bet) : String(row.bet.label || "");
  const go = document.createElement("button");
  go.type = "button"; go.className = "find-swap-go leg-boost-go";
  go.innerHTML = [`<i class="boost-move">${esc(word)}</i>`, `<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, row.person && row.move !== "raise" && row.move !== "lower" && `<i class="who">${esc(row.person.name)}</i>`, `<i class="prop">${esc(what)}</i>`, row.n && `<i class="boost-rec">${row.hits} of ${row.n}</i>`, role && `<i class="leg-role r-${role.role}">${esc(LEG_ROLE[role.role][0])}</i>`, `<i class="boost-fx">${esc(`Payout ${legBoostPrice(now.dec)} → ${next.length ? legBoostPrice(fx.dec) : "-"} · Chance ${Math.round(100 * now.chance)}% → ${Math.round(100 * fx.chance)}%`)}</i>`].filter(Boolean).join("");
  go.addEventListener("click", () => {
    legBoost.mode = "";
    if (row.move === "add") legSwapAdd(row.person, row.bet);
    else if (row.move === "drop") legBoostDrop(row.old);
    else legSwapTrade(row.old, row.person, row.bet);
  });
  return go;
}

function legBoostBox() {
  const box = document.createElement("div"), [title, say] = LEG_BOOST[legBoost.mode];
  box.className = "find-tray-swap leg-boost-box";
  const head = document.createElement("p"); head.className = "leg-boost-head"; head.innerHTML = `<b>${esc(title)}</b> ${esc(say)}`;
  box.append(head);
  const legs = [...parlayLeg.values()], now = legBoostTicket(legs), rows = legBoost.mode === "juice" ? legBoostJuice(legs) : legBoostSteady(legs);
  const games = [...new Set(legs.map((bet) => `${bet.match}|${bet.kickoff}`))], read = legs.some((bet) => legRoleChance(bet).n) || legBoostPool(legs).length;
  if (rows.length) rows.forEach((row) => box.append(legBoostRow(row, legs, now)));
  else {
    const none = document.createElement("p");
    none.textContent = !read ? `Reading the last 10 games in ${games.length > 1 ? "these games" : "this game"}.` : legBoost.mode === "juice" ? "Nothing in these games pays plus money with a last 10 that clears its price." : "Every leg is already an anchor, and nothing steadier is posted in these games.";
    box.append(none);
  }
  return box;
}

function legBoostPaint() {
  if (typeof parlayLeg === "undefined") return;
  if (parlayLeg.size) legBoostLoad();
  document.querySelectorAll(".find-tray .find-new").forEach((wrap) => {
    wrap.querySelectorAll(":scope > .leg-boost-add, :scope > .leg-boost-box").forEach((node) => node.remove());
    if (wrap.classList.contains("on") || !parlayLeg.size) return;
    Object.entries(LEG_BOOST).forEach(([mode, [name]]) => {
      const go = document.createElement("button");
      go.type = "button"; go.className = `leg-boost-add ${mode}${legBoost.mode === mode ? " on" : ""}`; go.textContent = name;
      go.setAttribute("aria-expanded", String(legBoost.mode === mode));
      go.addEventListener("click", () => { legBoost.mode = legBoost.mode === mode ? "" : mode; legBoostLoad(); legBoostPaint(); });
      wrap.append(go);
    });
    if (legBoost.mode) wrap.append(legBoostBox());
  });
}

if (typeof legNewPaint === "function") {
  const legNewPaintBoost = legNewPaint;
  legNewPaint = function () { legNewPaintBoost.apply(this, arguments); legBoostPaint(); };
}
