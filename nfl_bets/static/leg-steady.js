/** Stability beyond adding legs: split the ticket, a round robin, pull an anchor out, legs that fight, spread the game risk, and swaps for hurt players and for the player taking an injured teammate's work. */

const legSteady = { hurtKey: "", hurt: null, job: null };

function legSteadyFold(name) {
  return typeof plainName === "function" ? plainName(name) : String(name || "").toLowerCase();
}

function legSteadyNames(bets) {
  const list = bets.map(legRoleName);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] || "";
}

function legSteadyHurtLoad(legs) {
  const names = [...new Set(legs.map(legHedgeWho).filter(Boolean).map((one) => one.name))], games = [...new Set(legs.map((bet) => bet.match).filter(Boolean))], key = `${names.join("|")}~${games.join("|")}`;
  if (!games.length || key === legSteady.hurtKey || legSteady.job) return;
  legSteady.job = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "hurt", names, games }) })
    .then((res) => res.json())
    .then((data) => { legSteady.hurtKey = key; legSteady.hurt = data || null; if (legBoost.mode === "steady") legBoostPaint(); })
    .catch((error) => console.log("[leg-steady] could not read the injury report", error))
    .finally(() => { legSteady.job = null; });
}

function legSteadyRows(legs) {
  const out = [], board = legHedgeBoard(), hurt = legSteady.hurt || {}, taken = new Set(legs.map(parlayKey)), fold = legSteadyFold;
  const movable = legRoles(legs).filter((row) => row.role !== "anchor" && !(legBoost.keep && (row.role === "juice" || row.odds > 100)));
  const mates = (team) => new Set(((hurt.teams || {})[team] || []).map(fold)), sick = new Set((hurt.hurt || []).map((row) => fold(row.player)));
  const sameStat = (bet, person) => { const owner = legHedgeWho(bet); return owner ? (person.bets || []).filter((one) => one.match === bet.match && one.kickoff === bet.kickoff && Number(one.odds) && !taken.has(parlayKey(one)) && legSwapStat(person, one) === legSwapStat(owner, bet) && /\bunder\b/i.test(one.label || "") === /\bunder\b/i.test(bet.label || "")).map((one) => ({ person, bet: one, ...legRoleChance(one) })) : []; };
  const near = (rows, chance) => rows.filter((row) => row.chance >= chance - 0.05).sort((a, b) => Math.abs(a.chance - chance) - Math.abs(b.chance - chance))[0];
  (hurt.hurt || []).forEach((row) => {
    const leg = legs.find((bet) => { const owner = legHedgeWho(bet); return owner && fold(owner.name) === fold(row.player); });
    if (!leg) return;
    const team = mates(row.team), best = near(board.filter((one) => one.kind === "player" && !sick.has(fold(one.name)) && (!team.size || team.has(fold(one.name)))).flatMap((one) => sameStat(leg, one)), legRoleChance(leg).chance);
    if (best) out.push({ ...best, move: "swap", old: parlayKey(leg), was: leg, why: `${row.player.split(" ").pop()} is ${row.status}` });
  });
  (hurt.gone || []).forEach((row) => {
    const team = mates(row.team), spot = fold(row.spot);
    board.filter((one) => one.kind === "player" && team.has(fold(one.name)) && spot.includes(fold(one.name)) && !legs.some((bet) => legHedgeWho(bet) === one)).forEach((person) => legs.forEach((leg) => {
      const owner = legHedgeWho(leg);
      if (!owner || !team.has(fold(owner.name)) || out.some((one) => one.old === parlayKey(leg))) return;
      const best = near(sameStat(leg, person), legRoleChance(leg).chance - 0.1);
      if (best) out.push({ ...best, move: "swap", old: parlayKey(leg), was: leg, why: `Takes ${row.player.split(" ").pop()}'s work` });
    }));
  });
  if (legs.length > 2) {
    const worst = movable.filter((row) => row.role !== "dead" && row.riskShare - row.payShare >= 0.05).sort((a, b) => (b.riskShare - b.payShare) - (a.riskShare - a.payShare))[0];
    if (worst) out.push({ person: null, bet: worst.bet, chance: worst.chance, move: "drop", old: parlayKey(worst.bet), why: "Most risk for the least payout" });
  }
  if (legs.length >= 3 && !legBoost.game) {
    const count = new Map();
    legs.forEach((bet) => count.set(bet.match, (count.get(bet.match) || 0) + 1));
    const [heavy, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    const weak = n >= 3 && n / legs.length >= 0.6 && movable.filter((row) => row.bet.match === heavy).sort((a, b) => a.chance - b.chance)[0];
    const best = weak && legBoostPool(legs).filter((row) => row.bet.match !== heavy && row.chance >= weak.chance).sort((a, b) => b.chance * legBoostDec(b.bet.odds) - a.chance * legBoostDec(a.bet.odds))[0];
    if (best) out.push({ ...best, move: "swap", old: parlayKey(weak.bet), was: weak.bet, why: `${n} legs ride on ${typeof gameShort === "function" ? gameShort(heavy) : heavy}` });
  }
  return out;
}

function legSteadyCut(bets) {
  const gone = bets.map((bet) => String(bet.label || ""));
  bets.forEach((bet) => parlayLeg.delete(parlayKey(bet)));
  [...parlayPick.entries()].forEach(([pick, who]) => { if (gone.some((label) => label.startsWith(who.name)) && ![...parlayLeg.values()].some((row) => String(row.label || "").startsWith(who.name))) parlayPick.delete(pick); });
  paintParlay();
}

function legSteadyMove(bets) {
  const tags = new Map(bets.map((bet) => [parlayKey(bet), typeof betFrom !== "undefined" ? betFrom.get(parlayKey(bet)) : ""]));
  legSteadyCut(bets);
  legHedgeSave(bets, "Stability", tags);
}

function legSteadyFx(legs, next) {
  const now = legBoostTicket(legs), fx = legBoostTicket(next);
  return `Chance ${legHedgePct(now.chance)} → ${legHedgePct(fx.chance)}. $5 profits ${legHedgeCash(LEG_HEDGE_STAKE * (now.dec - 1))} → ${legHedgeCash(LEG_HEDGE_STAKE * (fx.dec - 1))}.`;
}

function legSteadyFights(legs) {
  const out = [], used = new Set(), wins = (bet) => (/^moneyline$/i.test(bet.market || "") ? String(bet.label || "") : /^(alternate )?spread$/i.test(bet.market || "") ? (String(bet.label || "").match(/^(.*?)\s-\d+(?:\.\d+)?/) || [])[1] || "" : "");
  const total = (bet) => (/^(alternate )?total( points| goals)?$/i.test(bet.market || "") ? legHedgeWay(bet) : ""), player = (bet) => (legHedgeWho(bet) ? legHedgeWay(bet) : "");
  const why = (a, b) => {
    if (wins(a) && wins(b) && wins(a) !== wins(b)) return `${wins(a)} and ${wins(b)} can't both win.`;
    if (total(a) === "down" && player(b) === "up") return `The under needs a slow game. ${legRoleName(b)} needs a big one.`;
    if (total(a) === "up" && player(b) === "down") return `The over needs points. ${legRoleName(b)}'s under needs a quiet night.`;
    if (total(a) === "up" && total(b) === "down") return "The over and the under pull against each other.";
    return "";
  };
  legs.forEach((a, i) => legs.slice(i + 1).forEach((b) => {
    if (a.match !== b.match || used.has(a) || used.has(b) || out.length >= 3) return;
    const say = why(a, b) || why(b, a);
    if (!say) return;
    used.add(a); used.add(b);
    const drop = legRoleChance(a).chance <= legRoleChance(b).chance ? a : b, next = legs.filter((bet) => bet !== drop);
    out.push(legHedgeCard("These two fight", [say, `Drop ${legRoleName(drop)}: ${legSteadyFx(legs, next)}`], [`Drop ${legRoleName(drop)}`, () => legBoostDrop(parlayKey(drop))]));
  }));
  return out;
}

function legSteadySplit(legs) {
  if (legs.length < 4) return null;
  const A = [], B = [], half = LEG_HEDGE_STAKE / 2;
  legs.map((bet) => ({ bet, ...legRoleChance(bet) })).sort((a, b) => b.chance - a.chance).forEach((row, at) => (at % 4 === 0 || at % 4 === 3 ? A : B).push(row.bet));
  const a = legBoostTicket(A), b = legBoostTicket(B), now = legBoostTicket(legs);
  return legHedgeCard("Split it in two", [`${legSteadyNames(A)} in one parlay, ${legSteadyNames(B)} in the other. $2.50 on each.`, `Chance of a payout ${legHedgePct(now.chance)} → ${legHedgePct(1 - (1 - a.chance) * (1 - b.chance))}. All hit ${legHedgeCash(LEG_HEDGE_STAKE * (now.dec - 1), true)} → ${legHedgeCash(half * (a.dec + b.dec) - LEG_HEDGE_STAKE, true)}. One hits: ${legHedgeCash(half * a.dec - LEG_HEDGE_STAKE, true)} or ${legHedgeCash(half * b.dec - LEG_HEDGE_STAKE, true)}.`], ["Split it", () => legSteadyMove(B)]);
}

function legSteadyRobin(legs) {
  const n = legs.length;
  if (n < 3 || n > 8) return null;
  const rows = legs.map((bet) => ({ dec: legBoostDec(bet.odds), chance: legRoleChance(bet).chance })), each = LEG_HEDGE_STAKE / n, now = legBoostTicket(legs);
  const miss = rows.map((row) => each * now.dec / row.dec - LEG_HEDGE_STAKE), all = rows.reduce((sum, row) => sum + each * now.dec / row.dec, 0) - LEG_HEDGE_STAKE;
  const any = now.chance + rows.reduce((sum, row) => sum + (1 - row.chance) * now.chance / row.chance, 0), low = Math.min(...miss), high = Math.max(...miss);
  const one = Math.abs(high - low) < 0.01 ? legHedgeCash(low, true) : `${legHedgeCash(low, true)} to ${legHedgeCash(high, true)}`;
  return legHedgeCard(`Round robin by ${n - 1}s`, [`${n} parlays of ${n - 1} legs, ${legHedgeCash(each)} each. One leg can miss and a parlay still pays. On FanDuel it is Round robin, by ${n - 1}s.`, `Chance of a payout ${legHedgePct(now.chance)} → ${legHedgePct(any)}. All hit ${legHedgeCash(LEG_HEDGE_STAKE * (now.dec - 1), true)} → ${legHedgeCash(all, true)}. One miss ${one}.`]);
}

function legSteadyPull(legs) {
  if (legs.length < 2) return null;
  const anchor = legRoles(legs).filter((row) => row.role === "anchor").sort((a, b) => legBoostDec(a.bet.odds) - legBoostDec(b.bet.odds))[0];
  if (!anchor) return null;
  const name = legRoleName(anchor.bet);
  return legHedgeCard(`Pull ${name} out`, [`Rest of the bet: ${legSteadyFx(legs, legs.filter((bet) => bet !== anchor.bet))}`, `${name} on its own: $5 profits ${legHedgeCash(LEG_HEDGE_STAKE * (legBoostDec(anchor.bet.odds) - 1))} and hits ${legHedgePct(anchor.chance)}.`], ["Make it its own bet", () => legSteadyMove([anchor.bet])]);
}

function legSteadyCards() {
  const legs = [...parlayLeg.values()];
  if (!legs.length) return null;
  const wrap = document.createElement("div"), hedge = legHedgeCards(legs), shape = [...legSteadyFights(legs), legSteadySplit(legs), legSteadyRobin(legs), legSteadyPull(legs)].filter(Boolean);
  const sub = (text) => { const p = document.createElement("p"); p.className = "leg-steady-sub"; p.textContent = text; return p; };
  wrap.className = "leg-steady";
  if (legHedge.said && Date.now() - legHedge.said.at < 8000) { const said = document.createElement("p"); said.className = "leg-steady-said"; said.textContent = legHedge.said.text; wrap.append(said); }
  if (hedge.lock) wrap.append(hedge.lock);
  if (shape.length) wrap.append(sub("Reshape the bet"), ...shape);
  if (hedge.rest.length) wrap.append(sub("Hedge it"), ...hedge.rest);
  return wrap.childElementCount ? wrap : null;
}

if (typeof legBoostSteady === "function") {
  const legSteadyBase = legBoostSteady;
  legBoostSteady = function (legs) {
    legSteadyHurtLoad(legs);
    const mine = legSteadyRows(legs), id = (row) => `${row.move}|${row.old}|${row.bet ? parlayKey(row.bet) : ""}`, seen = new Set(mine.map(id));
    return [...mine, ...legSteadyBase.apply(this, arguments).filter((row) => !seen.has(id(row)))];
  };
}

if (typeof legBoostRow === "function") {
  const legSteadyRowBase = legBoostRow;
  legBoostRow = function (row) {
    const go = legSteadyRowBase.apply(this, arguments), fx = go.querySelector("i.boost-fx");
    if (row.why && fx) { const tag = document.createElement("i"); tag.className = "boost-why"; tag.textContent = row.why; fx.before(tag); }
    return go;
  };
}

if (typeof legBoostBox === "function") {
  const legSteadyBoxBase = legBoostBox;
  legBoostBox = function () {
    const box = legSteadyBoxBase.apply(this, arguments), checks = box.querySelector(".leg-boost-checks"), cards = legBoost.mode === "steady" && legSteadyCards();
    if (cards && checks) {
      checks.after(cards);
      const first = box.querySelector("button.leg-boost-go");
      if (first) { const p = document.createElement("p"); p.className = "leg-steady-sub"; p.textContent = "Change a leg"; first.before(p); }
    }
    return box;
  };
}

if (typeof legBoostPaint === "function") {
  const legSteadyPaintBase = legBoostPaint;
  legBoostPaint = function () {
    legSteadyPaintBase.apply(this, arguments);
    if (typeof parlayLeg === "undefined" || !parlayLeg.size || !legHedgeLast([...parlayLeg.values()])) return;
    document.querySelectorAll(".find-tray .find-new button.leg-boost-add.steady").forEach((go) => { const tag = document.createElement("i"); tag.className = "leg-steady-ready"; tag.textContent = "Hedge ready"; go.append(tag); });
  };
}

if (typeof trayLivePaint === "function") {
  const legSteadyLiveBase = trayLivePaint;
  trayLivePaint = function () {
    legSteadyLiveBase.apply(this, arguments);
    const typing = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("leg-steady-price");
    if (!typing && typeof legBoostPaint === "function") legBoostPaint();
  };
}
