/** "Add juice" and "Add stability" next to "+ Add a leg". Each lists moves from the bet's own games, checked against each leg's last 10, with what the move does to the payout and the chance. */

const LEG_BOOST_SAVE = { keep: "legBoostKeep", game: "legBoostGame", league: "legBoostLeague" };
const legBoost = { mode: "", asked: new Set(), more: false, ...Object.fromEntries(Object.entries(LEG_BOOST_SAVE).map(([key, name]) => [key, (() => { try { return localStorage.getItem(name) === "1"; } catch (error) { return false; } })()])) };
const LEG_BOOST = {
  juice: ["Add juice", "Bigger payout. Recommended and good bets from every game, each clearing its price over its last 10."],
  steady: ["Add stability", "Higher chance. Swap the leg dragging it, lower a line, or drop it. The last rows add anchors from the recommended and good bets."],
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

const legBoostRecs = { at: 0, list: [], job: null, people: null, index: new Map() };

function legBoostRecLoad() {
  if (legBoostRecs.job) return legBoostRecs.job;
  if (Date.now() - legBoostRecs.at < 10 * 60000) return Promise.resolve();
  legBoostRecs.job = fetch("/api/recs").then((res) => res.json()).then((data) => {
    legBoostRecs.list = (data && data.recs) || []; legBoostRecs.at = Date.now();
    legBoostRecs.list.forEach((rec) => {
      const id = `${rec.label}|${rec.market}`;
      if (rec.n && typeof legRecAll !== "undefined") legRecAll.set(id, { hits: rec.hits, n: rec.n });
      if (typeof scriptRecAll !== "undefined" && !scriptRecAll.has(id)) scriptRecAll.set(id, { kind: rec.kind, basis: rec.basis, tier: rec.tier, drop: rec.drop, hits: rec.hits, n: rec.n });
    });
    if (typeof legRolePaint === "function") legRolePaint();
    if (legBoost.mode) legBoostPaint();
  }).catch((error) => console.log("[leg-boost] could not load the recommended bets", error)).finally(() => { legBoostRecs.job = null; });
  return legBoostRecs.job;
}

function legBoostFind(people) {
  if (legBoostRecs.people !== people) {
    legBoostRecs.people = people; legBoostRecs.index = new Map();
    (people || []).forEach((person) => person.kind === "player" && (person.bets || []).forEach((bet) => legBoostRecs.index.set(`${bet.label}|${bet.market}|${bet.match}`, { person, bet })));
  }
  return legBoostRecs.index;
}

function legBoostPool(legs) {
  const board = document.querySelector(".find-board"), index = legBoostFind(board && board.people), mine = legs.map((bet) => String(bet.label || "")), now = Date.now(), seen = new Set(), out = [];
  const games = new Set(legs.map((bet) => bet.match)), sports = new Set(legs.map((bet) => bet.sport).filter(Boolean));
  legBoostRecs.list.forEach((rec) => {
    const hit = index.get(`${rec.label}|${rec.market}|${rec.match}`);
    if (!hit || seen.has(hit) || Date.parse(hit.bet.kickoff || rec.kickoff || "") <= now || !Number(hit.bet.odds) || parlayLeg.has(parlayKey(hit.bet)) || mine.some((label) => label.startsWith(hit.person.name))) return;
    if ((legBoost.game && !games.has(hit.bet.match)) || (legBoost.league && sports.size && !sports.has(hit.bet.sport))) return;
    seen.add(hit);
    const read = legRoleChance(hit.bet);
    if (read.n) out.push({ ...hit, ...read, rec });
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
  const adds = legBoostPool(legs).filter((row) => row.bet.odds > 100 && row.bet.odds <= 400 && legBoostFair(row)).sort((a, b) => value(b) - value(a)).filter((row, at, list) => list.findIndex((one) => one.person === row.person) === at).map((row) => ({ ...row, move: "add" }));
  const raises = legRoles(legs).filter((row) => row.role !== "juice").flatMap((row) => {
    const key = parlayKey(row.bet), best = legBoostLines(key, (now, was) => now < was).filter(legBoostFair).sort((a, b) => value(b) - value(a))[0];
    return best ? [{ ...best, move: "raise", old: key }] : [];
  });
  return [...raises, ...adds];
}

function legBoostSteady(legs) {
  const roles = legRoles(legs), movable = roles.filter((row) => row.role !== "anchor" && !(legBoost.keep && (row.role === "juice" || row.odds > 100)));
  const weak = movable.slice().sort((a, b) => (b.riskShare - b.payShare) - (a.riskShare - a.payShare) || a.chance - b.chance)[0];
  const pool = legBoostPool(legs), out = [];
  if (weak) {
    const key = parlayKey(weak.bet), anchor = (row) => row.bet.odds <= -200 && row.chance >= 0.7;
    pool.filter(anchor).sort((a, b) => b.chance * legBoostDec(b.bet.odds) - a.chance * legBoostDec(a.bet.odds)).filter((row, at, list) => list.findIndex((one) => one.person === row.person) === at).forEach((row) => out.push({ ...row, move: "swap", old: key, was: weak.bet }));
  }
  movable.forEach((row) => {
    const key = parlayKey(row.bet), best = legBoostLines(key, (now, was) => now > was).filter((one) => one.chance >= row.chance + 0.08).sort((a, b) => legBoostDec(b.bet.odds) - legBoostDec(a.bet.odds))[0];
    if (best) out.push({ ...best, move: "lower", old: key });
  });
  if (legs.length > 1) movable.filter((row) => row.role === "dead").forEach((row) => out.push({ person: null, bet: row.bet, chance: row.chance, move: "drop", old: parlayKey(row.bet) }));
  const cheap = legBoost.keep ? (row) => row.bet.odds <= -200 && row.n >= 6 && row.chance >= 0.75 : (row) => row.bet.odds <= -300 && row.n >= 6 && row.chance >= 0.8;
  pool.filter(cheap).sort((a, b) => legBoostDec(b.bet.odds) - legBoostDec(a.bet.odds)).filter((row, at, list) => list.findIndex((one) => one.person === row.person) === at).forEach((row) => out.push({ ...row, move: "add" }));
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
  go.innerHTML = [`<i class="boost-move">${esc(word)}</i>`, `<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, row.person && row.move !== "raise" && row.move !== "lower" && `<i class="who">${esc(row.person.name)}</i>`, `<i class="prop">${esc(what)}</i>`, row.rec && !legs.some((bet) => bet.match === row.bet.match) && typeof gameShort === "function" && `<i class="tm">${esc(gameShort(row.bet.match))}</i>`, row.rec && typeof scriptKindTag === "function" && scriptKindTag({ ...row.rec, odds: row.bet.odds }), row.n && `<i class="boost-rec">${row.hits} of ${row.n}</i>`, role && `<i class="leg-role r-${role.role}">${esc(LEG_ROLE[role.role][0])}</i>`, `<i class="boost-fx">${esc(`Payout ${legBoostPrice(now.dec)} → ${next.length ? legBoostPrice(fx.dec) : "-"} · Chance ${Math.round(100 * now.chance)}% → ${Math.round(100 * fx.chance)}%`)}</i>`].filter(Boolean).join("");
  go.addEventListener("click", () => {
    if (row.move !== "drop" && typeof betFromSay === "function") betFromSay(legBoost.mode === "juice" ? "Juice" : "Stability");
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
  const checks = document.createElement("div"); checks.className = "leg-boost-checks";
  [["game", "Same game only", "Only bets from this bet's games."], ["league", "Same league only", "Only bets from this bet's leagues."], ...(legBoost.mode === "steady" ? [["keep", "Leave the juice", "Keep every Juice and plus-money leg. Steady the bet with the other legs and new anchors."]] : [])].forEach(([key, name, tip]) => {
    const label = document.createElement("label"); label.className = "leg-boost-keep"; label.title = tip;
    label.innerHTML = `<input type="checkbox"${legBoost[key] ? " checked" : ""}/> ${esc(name)}`;
    label.querySelector("input").addEventListener("change", (event) => { legBoost[key] = event.target.checked; legBoost.more = false; try { localStorage.setItem(LEG_BOOST_SAVE[key], legBoost[key] ? "1" : "0"); } catch (error) { console.log("[leg-boost] could not keep the choice", error); } legBoostPaint(); });
    checks.append(label);
  });
  box.append(checks);
  const legs = [...parlayLeg.values()], now = legBoostTicket(legs), rows = legBoost.mode === "juice" ? legBoostJuice(legs) : legBoostSteady(legs);
  const read = legBoostRecs.at || legBoostPool(legs).length, shown = legBoost.more ? rows : rows.slice(0, 10);
  if (rows.length) {
    shown.forEach((row) => box.append(legBoostRow(row, legs, now)));
    if (rows.length > 10) {
      const more = document.createElement("button"); more.type = "button"; more.className = "leg-boost-more";
      more.textContent = legBoost.more ? "Show fewer" : `Show ${rows.length - 10} more`;
      more.addEventListener("click", () => { legBoost.more = !legBoost.more; legBoostPaint(); });
      box.append(more);
    }
  } else {
    const none = document.createElement("p"), cut = legBoost.game ? " in this game" : legBoost.league ? " in this league" : "";
    none.textContent = !read ? "Loading the recommended and good bets." : legBoost.mode === "juice" ? `No recommended or good bet${cut} pays plus money with a last 10 that clears its price.` : legBoost.keep ? `With the juice left in, no recommended or good bet${cut} steadies this one.` : `Every leg is already an anchor, and no recommended or good bet${cut} steadies this one.`;
    box.append(none);
  }
  return box;
}

function legBoostPaint() {
  if (typeof parlayLeg === "undefined") return;
  if (parlayLeg.size) { legBoostLoad(); legBoostRecLoad(); }
  document.querySelectorAll(".find-tray .find-new").forEach((wrap) => {
    wrap.querySelectorAll(":scope > .leg-boost-add, :scope > .leg-boost-box").forEach((node) => node.remove());
    if (wrap.classList.contains("on") || !parlayLeg.size) return;
    Object.entries(LEG_BOOST).forEach(([mode, [name]]) => {
      const go = document.createElement("button");
      go.type = "button"; go.className = `leg-boost-add ${mode}${legBoost.mode === mode ? " on" : ""}`; go.textContent = name;
      go.setAttribute("aria-expanded", String(legBoost.mode === mode));
      go.addEventListener("click", () => { legBoost.mode = legBoost.mode === mode ? "" : mode; legBoost.more = false; legBoostLoad(); legBoostPaint(); });
      wrap.append(go);
    });
    if (legBoost.mode) wrap.append(legBoostBox());
  });
}

if (typeof legNewPaint === "function") {
  const legNewPaintBoost = legNewPaint;
  legNewPaint = function () { legNewPaintBoost.apply(this, arguments); legBoostPaint(); };
}
