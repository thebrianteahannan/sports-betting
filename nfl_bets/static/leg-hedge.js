/** Stability hedges on the $5 ticket: lock the last leg, a plan for the leg that starts last, a bet on the other game script, and a safe side bet that covers the stake. */

const LEG_HEDGE_STAKE = 5;
const legHedge = { price: new Map(), said: null };

function legHedgeCash(n, sign) {
  const v = Math.round(Math.abs(n) * 100) / 100, text = `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
  return sign && v ? `${n < 0 ? "-" : "+"}${text}` : text;
}

function legHedgeOdds(odds) {
  const n = Number(odds);
  return n > 0 ? `+${n}` : String(n);
}

function legHedgePct(chance) {
  return `${Math.round(100 * chance)}%`;
}

function legHedgeBoard() {
  const board = document.querySelector(".find-board");
  return (board && board.people) || [];
}

function legHedgeWho(bet) {
  return legHedgeBoard().find((one) => one.kind === "player" && String(bet.label || "").startsWith(one.name)) || null;
}

function legHedgeName(bet) {
  const label = String(bet.label || "");
  return /^(over|under)\b/i.test(label) && typeof gameShort === "function" && gameShort(bet.match) ? `${label} in ${gameShort(bet.match)}` : label;
}

function legHedgeWay(bet) {
  const label = String(bet.label || "");
  if (legHedgeWho(bet)) return /\bunder\b/i.test(label) ? "down" : "up";
  if (/^(alternate )?total( points| goals)?$/i.test(bet.market || "")) return /\bunder\b/i.test(label) ? "down" : /\bover\b/i.test(label) ? "up" : "";
  return "";
}

function legHedgeOther(bet) {
  const label = String(bet.label || ""), side = (one) => (String(one.label || "").match(/\b(over|under)\b/i) || [""])[0].toLowerCase(), num = (one) => Number((String(one.label || "").match(/[+-]?\d+(?:\.\d+)?/g) || []).pop());
  const fits = (one) => one.match === bet.match && one.kickoff === bet.kickoff && Number(one.odds) && one.label !== label;
  const want = side(bet) === "over" ? "under" : side(bet) === "under" ? "over" : "", person = legHedgeWho(bet);
  if (person) return (want && (person.bets || []).find((one) => fits(one) && side(one) === want && num(one) === num(bet) && legSwapStat(person, one) === legSwapStat(person, bet))) || null;
  const pool = [...new Map(legHedgeBoard().filter((one) => one.kind === "team").flatMap((one) => one.bets || []).filter((one) => fits(one) && one.market === bet.market).map((one) => [one.label, one])).values()];
  if (want) {
    const head = (one) => String(one.label || "").split(/\b(?:over|under)\b/i)[0];
    return pool.find((one) => side(one) === want && num(one) === num(bet) && head(one) === head(bet)) || null;
  }
  const parts = (one) => { const hit = String(one.label || "").match(/^(.*?)\s([+-]\d+(?:\.\d+)?)(.*)$/); return hit && { team: hit[1], n: Number(hit[2]), tail: hit[3] }; }, mine = parts(bet);
  if (mine) return pool.find((one) => { const it = parts(one); return it && it.team !== mine.team && it.n === -mine.n && it.tail === mine.tail; }) || null;
  if (/^moneyline$/i.test(bet.market || "")) { const rest = pool.filter((one) => !/\d/.test(one.label || "")); return rest.length === 1 ? rest[0] : null; }
  return null;
}

function legHedgeState(bet) {
  if (typeof trayLive === "undefined" || typeof liveLegState !== "function") return "";
  const game = trayLive.games.find((one) => liveMine(one, [bet]).length);
  return game ? liveLegState(game, liveLegRead(bet)).state || "on" : "";
}

function legHedgeLast(legs) {
  if (legs.length < 2) return null;
  const states = legs.map(legHedgeState), open = legs.filter((bet, at) => states[at] !== "hit");
  if (states.includes("lost") || open.length !== 1) return null;
  const other = legHedgeOther(open[0]);
  return other ? { last: open[0], other, hits: legs.length - 1 } : null;
}

function legHedgePlan(legs) {
  if (legs.length < 2 || legs.some((bet) => legHedgeState(bet))) return null;
  const at = (bet) => Date.parse(bet.kickoff || "") || 0, late = legs.slice().sort((a, b) => at(b) - at(a));
  if (!(at(late[0]) > at(late[1]))) return null;
  const other = legHedgeOther(late[0]);
  return other ? { last: late[0], other } : null;
}

function legHedgeLock(dec, odds) {
  const h = legBoostDec(odds), full = LEG_HEDGE_STAKE * dec / h, half = full / 2, win = LEG_HEDGE_STAKE * (dec - 1);
  return { full, lock: win - full, half, halfHit: win - half, halfMiss: half * (h - 1) - LEG_HEDGE_STAKE };
}

function legHedgeCard(title, lines, go) {
  const card = document.createElement("div"), head = document.createElement("b");
  card.className = "leg-steady-card"; head.textContent = title; card.append(head);
  lines.filter(Boolean).forEach((line) => {
    if (typeof line !== "string") { card.append(line); return; }
    const p = document.createElement("p"); p.textContent = line; card.append(p);
  });
  if (go) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "leg-steady-go"; button.textContent = go[0];
    button.addEventListener("click", () => go[1](card));
    card.append(button);
  }
  return card;
}

function legHedgeTable(rows) {
  const table = document.createElement("div");
  table.className = "leg-steady-table";
  rows.forEach(([say, cash]) => {
    const line = document.createElement("p");
    line.innerHTML = `<span>${esc(say)}</span><b class="${cash > 0.004 ? "up" : cash < -0.004 ? "down" : ""}">${esc(legHedgeCash(cash, true))}</b>`;
    table.append(line);
  });
  return table;
}

function legHedgeBrief(card) {
  const lines = [...card.querySelectorAll(":scope > p")].map((p) => { const input = p.querySelector("input"); return input ? `${p.textContent}${input.value}` : p.textContent; }).filter(Boolean);
  const rows = [...card.querySelectorAll(".leg-steady-table p")].map((p) => [p.querySelector("span").textContent, p.querySelector("b").textContent]);
  return { kind: "hedge", title: card.querySelector(":scope > b").textContent, lines, rows };
}

function legHedgeSave(bets, say, tags, stack) {
  if (!bets.length) return;
  const brief = stack && stack.card ? legHedgeBrief(stack.card) : null;
  if (parlayLeg.size) saveNow();
  const home = window.parlayOpenId || "", held = saveList(), base = held.find((row) => row.id === home), group = stack && base ? { ...(base.group || { id: `g${Date.now()}`, name: stack.name }), briefs: [...((base.group && base.group.briefs) || []), ...(brief ? [brief] : [])] } : null;
  if (group) { held.forEach((row) => { if (row === base || (row.group && row.group.id === group.id)) row.group = group; }); saveStore(held); }
  saveNew();
  bets.forEach((bet) => {
    const key = parlayKey(bet), person = legHedgeWho(bet);
    parlayLeg.set(key, bet);
    if (person && !parlayPick.has(person.key)) parlayPick.set(person.key, person);
    if (typeof betFrom !== "undefined") betFrom.set(key, (tags && tags.get(key)) || say);
  });
  paintParlay();
  const made = saveNow();
  if (group && made) { const list = saveList(), row = list.find((one) => one.id === made.id); if (row) { row.group = group; if (stack.stake) row.stake = Math.round(stack.stake * 100) / 100; saveStore(list); } }
  if (home) saveOpen(home);
  legHedge.said = { text: group ? `Saved ${legHedgeName(bets[0])} with this ticket as the ${group.name} stack in My bets.` : `Saved ${bets.length > 1 ? `a ${bets.length}-leg bet` : legHedgeName(bets[0])} as its own bet in My bets.`, at: Date.now() };
  legBoostPaint();
}

function legHedgeLockCard(pick, dec) {
  const key = parlayKey(pick.other), input = document.createElement("input"), full = document.createElement("p"), half = document.createElement("p"), at = document.createElement("p");
  input.type = "text"; input.inputMode = "numeric"; input.className = "leg-steady-price"; input.title = "Type the price FanDuel shows now.";
  input.value = legHedgeOdds(legHedge.price.get(key) || pick.other.odds);
  const fill = () => {
    const odds = Number(String(input.value).replace(/[^\d+-]/g, ""));
    if (!odds || Math.abs(odds) < 100) return;
    legHedge.price.set(key, odds);
    const m = legHedgeLock(dec, odds);
    full.textContent = `Bet ${legHedgeCash(m.full)} on it and you ${m.lock >= 0 ? `take home ${legHedgeCash(m.lock, true)}` : `lose ${legHedgeCash(-m.lock)}`} either way.`;
    half.textContent = `Or bet ${legHedgeCash(m.half)}: ${legRoleName(pick.last)} hits ${legHedgeCash(m.halfHit, true)}, misses ${legHedgeCash(m.halfMiss, true)}.`;
  };
  input.addEventListener("input", fill);
  fill();
  at.className = "leg-steady-at"; at.append(`${legHedgeName(pick.other)} at `, input);
  return legHedgeCard("Lock it in", [`${pick.hits} legs are in. Only ${legHedgeName(pick.last)} is left.`, at, full, half], ["Save as a stack", (card) => legHedgeSave([pick.other], "Stability", null, { name: "Last-leg hedge", card, stake: legHedgeLock(dec, legHedge.price.get(key) || pick.other.odds).full })]);
}

function legHedgeScript(legs) {
  const games = new Map(), out = [], teams = legHedgeBoard().filter((one) => one.kind === "team").flatMap((one) => one.bets || []);
  legs.forEach((bet) => { const way = legHedgeWay(bet); if (!way) return; const row = games.get(bet.match) || { up: 0, down: 0 }; row[way] += 1; games.set(bet.match, row); });
  games.forEach((row, match) => {
    const want = row.up >= 2 && !row.down ? "under" : row.down >= 2 && !row.up ? "over" : "";
    const bet = want && teams.find((one) => one.match === match && /^total( points| goals)?$/i.test(one.market || "") && new RegExp(`^${want}\\b`, "i").test(one.label || "") && Number(one.odds) && !parlayLeg.has(parlayKey(one)));
    if (bet) out.push({ match, want, n: want === "under" ? row.up : row.down, bet });
  });
  return out;
}

function legHedgeCover(legs) {
  const games = new Set(legs.map((bet) => bet.match));
  return legBoostPool(legs).filter((row) => Number(row.bet.odds) <= -250 && row.n >= 6 && row.chance >= 0.8).sort((a, b) => games.has(a.bet.match) - games.has(b.bet.match) || b.chance - a.chance)[0] || null;
}

function legHedgeOutcomes(win, stake, gain, name) {
  return [["Both hit", win + gain * stake], [`${name} hits, ticket misses`, gain * stake - LEG_HEDGE_STAKE], [`Ticket hits, ${name.toLowerCase()} misses`, win - stake], ["Both miss", -(LEG_HEDGE_STAKE + stake)]];
}

function legHedgeCards(legs) {
  const now = legBoostTicket(legs), win = LEG_HEDGE_STAKE * (now.dec - 1), rest = [], last = legHedgeLast(legs), plan = !last && legHedgePlan(legs);
  if (plan) {
    const m = legHedgeLock(now.dec, plan.other.odds);
    if (m.lock > 0) rest.push(legHedgeCard("Hedge plan", [`${legHedgeName(plan.last)} starts last. If the other ${legs.length - 1} hit first, bet ${legHedgeCash(m.full)} on ${legHedgeName(plan.other)} (${legHedgeOdds(plan.other.odds)}) and take home ${legHedgeCash(m.lock, true)} either way.`]));
  }
  legHedgeScript(legs).forEach((row) => {
    const h = legBoostDec(row.bet.odds), stake = LEG_HEDGE_STAKE / (h - 1);
    rest.push(legHedgeCard("Hedge the game script", [`Your ${row.n} ${typeof gameShort === "function" ? gameShort(row.match) : row.match} legs need a ${row.want === "under" ? "high" : "low"}-scoring game. ${legHedgeName(row.bet)} (${legHedgeOdds(row.bet.odds)}) pays if it goes the other way. ${legHedgeCash(stake)} on it wins back the $5 ticket.`, legHedgeTable(legHedgeOutcomes(win, stake, h - 1, "Hedge"))], ["Save as a stack", (card) => legHedgeSave([row.bet], "Stability", null, { name: "Game script hedge", card, stake })]));
  });
  const cover = legHedgeCover(legs);
  if (cover) {
    const h = legBoostDec(cover.bet.odds), stake = LEG_HEDGE_STAKE / (h - 1);
    rest.push(legHedgeCard("Cover the stake", [`${cover.person.name} ${legSwapWhat(cover.person, cover.bet)} (${legHedgeOdds(cover.bet.odds)}) hit ${cover.hits} of ${cover.n}. ${legHedgeCash(stake)} on it wins $5, the cost of this ticket.`, legHedgeTable(legHedgeOutcomes(win, stake, h - 1, "Safe bet"))], ["Save as a stack", (card) => legHedgeSave([cover.bet], "Stability", null, { name: "Cover the stake", card, stake })]));
  }
  return { lock: last ? legHedgeLockCard(last, now.dec) : null, rest };
}
