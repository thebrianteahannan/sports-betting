/** Leg roles on the bet card. Anchor holds the bet up, Pays is the leg that pays for it, Filler is near even money, Dead weight carries more of the risk than the payout. */

const LEG_ROLE = { anchor: ["Anchor", "Holds the bet up."], juice: ["Pays", "Pays for the bet."], filler: ["Filler", "Near even money. Adds some price and real risk."], dead: ["Dead weight", "Carries more of the risk than the payout. Swap it first."] };

function legRoleChance(bet) {
  const odds = Number(bet.odds), price = odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
  const id = `${bet.label}|${bet.market}`, info = (typeof legRecAll !== "undefined" && legRecAll.get(id)) || (typeof scriptRecAll !== "undefined" && scriptRecAll.get(id)), hits = Number(info && info.hits), n = Number(info && info.n);
  return n > 0 && Number.isFinite(hits) ? { chance: (hits + 10 * price) / (n + 10), hits, n } : { chance: price };
}

function legRoles(legs) {
  const rows = legs.map((bet) => {
    const odds = Number(bet.odds), read = legRoleChance(bet);
    return { bet, odds, ...read, pay: Math.log(1 + (odds < 0 ? 100 / -odds : odds / 100)), risk: -Math.log(Math.max(read.chance, 0.01)) };
  }).filter((row) => Number.isFinite(row.odds) && row.odds);
  const pay = rows.reduce((sum, row) => sum + row.pay, 0), risk = rows.reduce((sum, row) => sum + row.risk, 0);
  rows.forEach((row) => {
    row.payShare = pay ? row.pay / pay : 0; row.riskShare = risk ? row.risk / risk : 0;
    row.role = row.odds <= -200 && row.chance >= 0.7 ? "anchor" : row.odds > 100 || (rows.length > 1 && row.payShare >= 0.4) ? "juice" : "filler";
    if (rows.length > 1 && row.role !== "anchor" && row.riskShare - row.payShare >= 0.15) row.role = "dead";
  });
  return rows;
}

const METAL_BAR = [
  { id: "golden", name: "Golden", min: -120, max: 120, rate: 0.6 },
  { id: "silver", name: "Silver", min: -150, max: 150, rate: 0.55 },
  { id: "bronze", name: "Bronze", min: -200, max: 200, rate: 0.5 },
];

function metalRecord(bet) {
  const id = `${bet.label}|${bet.market}`;
  const info = (typeof scriptRecAll !== "undefined" && scriptRecAll.get(id)) || (typeof legRecAll !== "undefined" && legRecAll.get(id));
  const hits = Number(info && info.hits), n = Number(info && info.n);
  return n >= 5 && Number.isFinite(hits) ? { hits, n, rate: hits / n } : null;
}

function metalJudge(odds, record) {
  const o = Number(odds);
  if (!Number.isFinite(o) || !o) return null;
  const rate = record && record.rate;
  if (record) {
    const hit = METAL_BAR.find((bar) => o >= bar.min && o <= bar.max && rate >= bar.rate);
    if (hit) return { id: hit.id, name: hit.name, kind: "clear", rate: hit.rate, record };
  }
  const price = METAL_BAR.find((bar) => o >= bar.min && o <= bar.max);
  if (price && record) return { id: "bronze", name: "Bronze", kind: "short", rate: 0.5, record };
  if (price) return { id: "out", name: price.name, kind: "price", rate: price.rate };
  return { id: "out", name: "Bronze", kind: o < -200 ? "shorter" : "longer", rate: 0.5 };
}

function metalPrice(odds) {
  const n = Number(odds);
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function metalTagText(place) {
  if (place.kind === "clear") return `Clears ${place.name}`;
  if (place.kind === "price") return `${place.name} price`;
  if (place.kind === "short") return "Short of Bronze";
  return place.kind === "shorter" ? "Shorter than bronze" : "Longer than bronze";
}

function metalSay(place, pct, odds) {
  const need = `${Math.round(place.rate * 100)}%`;
  const price = Number.isFinite(Number(odds)) && Number(odds) ? metalPrice(odds) : "";
  const even = price && pct ? ` ${price} breaks even at ${pct}.` : "";
  if (place.kind === "clear") return `Clears a ${place.name} Ticket. Hit ${place.record.hits} of ${place.record.n}.`;
  if (place.kind === "short") return `Hit ${place.record.hits} of ${place.record.n}.${even} A Bronze Ticket needs a ${need} hit rate.`;
  if (place.kind === "price") return "No edge.";
  const stop = place.kind === "shorter" ? "−200" : "+200";
  return `${place.kind === "shorter" ? "Shorter" : "Longer"} than a Bronze Ticket.${even} Bronze stops at ${stop}.`;
}

function metalChance(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function metalWho(bet) {
  const named = (typeof legName === "function" && legName(bet)) || "";
  const source = named && !named.includes("@") ? named : String((bet && bet.label) || "").split(/\d/)[0];
  const words = source.trim().split(/\s+/).filter((word) => word && !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(word));
  return words.length ? words[words.length - 1] : "";
}

const EDGE_TIP = "10 needs −120 to +120, a pulled chance of 60% or more, and 10 points over the price after adding 20 games at 50%. The number is how close this edge gets to that.";
const PRICE_EDGE_TIP = "FanDuel needs at least 3 points fewer hits than the other books, with FanDuel left out and the juice removed.";

function edgePull(hits, n) {
  const h = Number(hits), games = Number(n);
  if (!(games > 0) || !Number.isFinite(h)) return null;
  return { raw: h / games, pulled: (h + 10) / (games + 20) };
}

function matchupUse(pulled, shift) {
  const base = Number(pulled);
  if (!(base > 0 && base < 1)) return null;
  const points = Number(shift);
  if (!Number.isFinite(points) || Math.abs(points) < 0.05) return { pulled: base, used: base, shift: 0 };
  const capped = Math.max(-3, Math.min(3, Math.round(points * 10) / 10));
  const used = Math.round(Math.min(0.99, Math.max(0.01, base + capped / 100)) * 1000) / 1000;
  return { pulled: base, used, shift: capped };
}

function edgeGap(hits, n, need, odds) {
  const pull = edgePull(hits, n);
  let price = null;
  if (odds != null && typeof findPct === "function") {
    const parsed = parseFloat(String(findPct(odds)).replace("%", ""));
    if (parsed > 0 && parsed < 100) price = parsed / 100;
  }
  if (!(price > 0 && price < 1)) {
    const raw = String(need == null ? "" : need).trim();
    const value = Number(raw.replace("%", ""));
    if (raw.includes("%") && value > 0 && value < 100) price = value / 100;
    else if (value > 0 && value < 1) price = value;
  }
  if (!pull || !(price > 0 && price < 1)) return null;
  return { ...pull, price, gap: Math.round((pull.pulled - price) * 1000) / 10 };
}

function edgeClaim(pick, odds) {
  const used = odds != null ? odds : pick && pick.odds;
  const row = pick && edgeGap(pick.hits, pick.n, pick.need, used);
  const fair = Number(pick && pick.fair);
  const books = Number(pick && pick.fairBooks);
  const haveFair = !!(pick && pick.fairEx) && fair > 0 && fair < 1 && books >= 2;
  let price = row ? row.price : null;
  if (!(price > 0 && price < 1)) {
    const n = Number(used);
    if (Number.isFinite(n) && n) price = n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
  }
  if (!row && !haveFair) return null;
  const clear = haveFair && price > 0 && price < 1 ? Math.round((fair - price) * 1000) / 10 : null;
  return { pulled: row ? row.pulled : null, price, fair: haveFair ? fair : null, books: haveFair ? books : 0, clear };
}

function fairLine(pick) {
  const fair = Number(pick && pick.fair);
  const books = Number(pick && pick.fairBooks);
  const odds = Number(pick && pick.odds);
  if (!pick || !pick.fairEx || !(fair > 0 && fair < 1) || !(books >= 2) || !Number.isFinite(odds) || !odds) return "";
  const price = odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
  const gap = Math.round((fair - price) * 1000) / 10;
  const n1 = (value) => (Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1));
  const left = gap > 0.05 ? `This price is ${n1(gap)} points better than those books.` : gap < -0.05 ? `This price is ${n1(Math.abs(gap))} points short of those books.` : `This price lands on those books.`;
  return ` The other books, with FanDuel left out and the juice removed, put it at ${(fair * 100).toFixed(1)}% across ${books} books. ${left}`;
}

function pullClause(n, pulled, used, gap, shift, note) {
  const n1 = (value) => (Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1));
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const move = shift ? ` The ${note || "matchup"} ${shift < 0 ? `takes ${n1(Math.abs(shift))} points off it` : `adds ${n1(shift)} points`}, and the chance we use is ${pct(used)}` : "";
  const head = shift
    ? `${n} games get pulled toward 50% by adding 20 games at that rate, to ${pct(pulled)}.${move}`
    : `${n} games get pulled toward 50% by adding 20 games at that rate, and the chance we use is ${pct(used)}`;
  const hot = Number(n) === 1 ? "That game ran hot" : `Those ${n} games ran hot`;
  if (gap >= 10) return `${head}. That chance sits ${n1(gap)} points above the price. ${hot}, and that is too far from the price to trust.`;
  if (gap >= 3) return `${head}. That chance sits ${n1(gap)} points above the price.`;
  if (gap > 0.05) return `${head}, which sits ${n1(gap)} points above the price.`;
  if (gap < -0.05) return `${head}, which comes up ${n1(Math.abs(gap))} points short of the price.`;
  return `${head}, which lands on the price.`;
}

function edgeHow(pick) {
  let how = String((pick && pick.how) || "").trim();
  const row = pick && edgeGap(pick.hits, pick.n, pick.need, pick.odds);
  if (!row) return pick && pick.fairEx ? `${how}${fairLine(pick)}`.trim() : how;
  const moved = matchupUse(row.pulled, pick.matchupShift);
  const used = moved ? moved.used : row.pulled;
  const gap = Math.round((used - row.price) * 1000) / 10;
  const clause = pullClause(pick.n, row.pulled, used, gap, moved && moved.shift, pick.matchupNote);
  const block = /\d+ games get pulled toward 50% by adding 20 games at that rate[\s\S]*?(?=\s+The other books|\s+The script backs|\s+The matchup works|\s+He starts|\s+His minutes|\s+Cushion:|$)/;
  if (block.test(how)) how = how.replace(block, clause);
  else if (!/pulled toward 50%/.test(how)) {
    if (/clears the price by [\d.]+ percentage points/.test(how)) how = how.replace(/,?\s*so his record clears the price by [\d.]+ percentage points\.?/, `. ${clause}`);
    else how = how ? `${how} ${clause}` : clause;
  }
  how = how.replace(/ The other books, with the juice removed, put it at [\d.]+% across \d+ books\.(?: The pulled record (?:clears that by [\d.]+ points|comes up [\d.]+ points short of that|lands on that)\.)?/g, "");
  how = how.replace(/ The other books, with FanDuel left out and the juice removed, put it at [\d.]+% across \d+ books\.(?: This price is [\d.]+ points (?:better than|short of) those books\.| This price lands on those books\.)?/g, "");
  if (pick.fairEx) how = `${how}${fairLine(pick)}`.trim();
  return how;
}

function metalEdgePrice(odds) {
  const out = Math.max(0, Math.abs(Number(odds)) - 120);
  if (out <= 0) return 10;
  if (out <= 30) return 10 - (out / 30) * 3;
  if (out <= 80) return 7 - ((out - 30) / 50) * 3;
  return Math.max(1, 4 - ((out - 80) / 80) * 3);
}

function metalEdgeRate(rate) {
  const short = Math.max(0, 0.6 - Number(rate));
  if (short <= 0) return 10;
  if (short <= 0.05) return 10 - (short / 0.05) * 3;
  if (short <= 0.1) return 7 - ((short - 0.05) / 0.05) * 3;
  return Math.max(1, 4 - ((short - 0.1) / 0.1) * 3);
}

function metalEdge(gap, odds, rate) {
  if (!Number.isFinite(gap) || gap < 0.5) return null;
  const o = Number(odds);
  const r = Number(rate);
  if (!Number.isFinite(o) || !o || !Number.isFinite(r)) return Math.max(1, Math.min(9, Math.round(gap)));
  if (o >= -120 && o <= 120 && r >= 0.6 && gap >= 10) return 10;
  if (o >= -120 && o <= 120 && r >= 0.6) return Math.max(8, Math.min(9, Math.round(8 + gap / 10)));
  return Math.max(1, Math.min(9, Math.round(Math.min(metalEdgePrice(o), metalEdgeRate(r)))));
}

function metalEdgeId(score, odds, rate) {
  const o = Number(odds);
  const r = Number(rate);
  if (Number.isFinite(o) && o && Number.isFinite(r)) {
    const hit = METAL_BAR.find((bar) => o >= bar.min && o <= bar.max && r >= bar.rate);
    return hit ? hit.id : "bronze";
  }
  if (score >= 8) return "golden";
  if (score >= 5) return "silver";
  return "bronze";
}

function metalEdgeRead(gap, odds, rate) {
  const score = metalEdge(gap, odds, rate);
  return { score, id: score ? metalEdgeId(score, odds, rate) : "out" };
}

function metalCount(n) {
  return ["", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] || String(n);
}

function metalJuiceSay(row) {
  const bet = row.bet || {};
  const loose = typeof legLoose === "function" ? legLoose(bet) : { who: "", prop: "" };
  const blob = `${bet.label || ""} ${bet.market || ""}`;
  let who = loose.who && !String(loose.who).includes("@") ? loose.who : "";
  if (!who) {
    const cut = String(bet.label || "").match(/^(.+?)\s+(?:\d+\+|any\s*time|anytime|over\b|under\b|first\b)/i);
    who = cut ? cut[1].trim() : "";
  }
  const last = who.split(/\s+/).filter((word) => word && !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(word)).pop() || "";
  const low = blob.toLowerCase();
  const what = /touchdown/.test(low) ? "anytime touchdown" : /receiv/.test(low) ? "receiving yards" : /rush/.test(low) ? "rushing yards" : /pass/.test(low) ? "passing yards" : /total|points/.test(low) ? "the total" : "";
  if (what === "the total") return "The total";
  if (last && what) return `${last}'s ${what}`;
  return last ? `${last}'s leg` : "The paying leg";
}

function metalScriptSay(rows, odds, need) {
  const games = rows.map((row) => String((row.bet && (row.bet.match || row.bet.gameId)) || ""));
  if (!(games.length === rows.length && games.every(Boolean) && new Set(games).size === 1)) return null;
  const juice = rows.filter((row) => row.role === "juice");
  const anchors = rows.filter((row) => row.role === "anchor");
  if (juice.length !== 1 || anchors.length < 2 || anchors.length + juice.length !== rows.length) return null;
  const payChance = metalChance(juice[0].odds);
  if (payChance == null || payChance < need + 0.05) return null;
  const gap = Math.round((payChance - need) * 1000) / 10;
  const chances = anchors.map((row) => metalChance(row.odds)).filter((n) => n != null);
  const low = Math.round(Math.min(...chances) * 100);
  const high = Math.round(Math.max(...chances) * 100);
  const band = low === high ? `${low}%` : `${low}% to ${high}%`;
  const text = `Same game. ${metalJuiceSay(juice[0])} pays it, priced at ${(payChance * 100).toFixed(1)}%. The other ${metalCount(anchors.length)} are anchors at ${band}. ${metalPrice(odds)} only has to hit ${(need * 100).toFixed(1)}%.`;
  return { ...metalEdgeRead(gap, odds, payChance), text };
}

function metalParlaySay(rows, odds) {
  const need = metalChance(odds);
  if (rows.length < 2 || need == null) return null;
  const script = metalScriptSay(rows, odds, need);
  if (script) return script;
  const ours = rows.map((row) => {
    const book = metalChance(row.odds);
    const pull = row.n >= 5 && Number.isFinite(row.hits) ? edgePull(row.hits, row.n) : null;
    const have = pull ? pull.pulled : book;
    return { book, have, who: metalWho(row.bet), lift: book != null && have != null && Math.abs(have - book) >= 0.005 };
  }).filter((row) => row.have != null);
  if (ours.length < 2) return null;
  const built = ours.reduce((p, row) => p * row.have, 1);
  const gap = Math.round((built - need) * 1000) / 10;
  const builtPct = `${(built * 100).toFixed(1)}%`;
  const even = `${(need * 100).toFixed(1)}%`;
  const names = ours.filter((row) => row.lift).map((row) => row.who).filter(Boolean);
  const who = names.length > 2 ? "The recommended legs put" : names.length === 2 ? `${names[0]} and ${names[1]} put` : names.length === 1 ? `${names[0]}'s record puts` : "";
  const over = gap > 0 ? `${gap.toFixed(1)} points over FanDuel's ${even}` : gap < 0 ? `${Math.abs(gap).toFixed(1)} points under FanDuel's ${even}` : `even with FanDuel's ${even}`;
  const line = who ? `${who} it at ${builtPct}, ${over}.` : `We have it at ${builtPct}, ${over}.`;
  return { ...metalEdgeRead(gap, odds, built), text: line };
}

function metalOneSay(row) {
  const need = metalChance(row.odds);
  const pull = row.n >= 5 && Number.isFinite(row.hits) ? edgePull(row.hits, row.n) : null;
  if (!pull || need == null) return null;
  const gap = Math.round((pull.pulled - need) * 1000) / 10;
  const even = `${(need * 100).toFixed(1)}%`;
  const over = gap > 0 ? `${gap.toFixed(1)} points over FanDuel's ${even}` : gap < 0 ? `${Math.abs(gap).toFixed(1)} points under FanDuel's ${even}` : `even with FanDuel's ${even}`;
  return { ...metalEdgeRead(gap, row.odds, pull.pulled), text: `Hit ${row.hits} of ${row.n}. Pulled to ${(pull.pulled * 100).toFixed(1)}%, ${over}.` };
}

function metalPaint(rows) {
  document.querySelectorAll(".find-tray .leg-metal, .find-tray .leg-metal-say").forEach((node) => node.remove());
  if (!rows.length) return;
  const legs = rows.map((row) => row.bet);
  const price = typeof findRank === "function" ? (() => {
    const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
    if (!Number.isFinite(dec) || dec <= 1) return null;
    return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  })() : Number(legs[0] && legs[0].odds);
  const parlay = rows.length >= 2 ? metalParlaySay(rows, price) : rows.length === 1 ? metalOneSay(rows[0]) : null;
  const place = parlay ? null : metalJudge(price, legs.length === 1 ? metalRecord(legs[0]) : null);
  document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key;
    const row = rows.find((item) => typeof parlayKey === "function" && parlayKey(item.bet) === key);
    const prop = line.querySelector("span i.prop");
    if (!row || !prop) return;
    const legPlace = metalJudge(row.odds, metalRecord(row.bet));
    if (!legPlace || (parlay && legPlace.kind !== "clear")) return;
    const tag = document.createElement("i");
    tag.className = `leg-metal m-${legPlace.id}`;
    tag.textContent = metalTagText(legPlace);
    tag.title = metalSay(legPlace, typeof findPct === "function" ? findPct(row.odds) : "", row.odds);
    const after = [...line.querySelectorAll("span > i.find-rec-pill, span > i.bet-kind")].pop() || prop;
    after.after(tag);
  });
  if (!place && !parlay) return;
  const pct = typeof findPct === "function" ? findPct(price) : "";
  document.querySelectorAll(".find-tray .find-ticket").forEach((ticket) => {
    const line = document.createElement("p");
    const told = parlay || { id: place.id, text: metalSay(place, pct, price) };
    line.className = `leg-metal-say m-${told.id}`;
    if (parlay) {
      const mark = document.createElement("i");
      mark.className = `leg-edge m-${told.id}`;
      mark.textContent = parlay.score ? `Edge ${parlay.score}` : "No edge";
      mark.title = EDGE_TIP;
      line.append(mark, document.createTextNode(` ${told.text}`));
    } else line.textContent = told.text;
    const role = ticket.parentElement && ticket.parentElement.querySelector(":scope > .leg-role-say");
    if (role) role.after(line);
    else ticket.after(line);
  });
}

function legRolePaint() {
  if (typeof parlayLeg === "undefined") return;
  document.querySelectorAll(".find-tray .leg-role, .find-tray .leg-role-say").forEach((node) => node.remove());
  const rows = legRoles([...parlayLeg.values()]);
  if (!rows.length) return;
  const byKey = new Map(rows.map((row) => [parlayKey(row.bet), row]));
  document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key, row = key && byKey.get(key), prop = line.querySelector("span i.prop");
    if (!row || !prop || (rows.length < 2 && row.role === "anchor")) return;
    const tag = document.createElement("i"), [name, tip] = LEG_ROLE[row.role];
    tag.className = `leg-role r-${row.role}`; tag.textContent = name;
    tag.title = `${tip} Our chance ${Math.round(100 * row.chance)}%${row.n ? ` from ${row.hits} of ${row.n}, shrunk toward the price` : " from the price"}.${rows.length > 1 ? ` ${Math.round(100 * row.payShare)}% of the payout, ${Math.round(100 * row.riskShare)}% of the risk.` : ""}`;
    (prop.parentElement.querySelector(":scope > i.who") || prop).before(tag);
  });
  metalPaint(rows);
}

if (typeof paintParlay === "function") {
  const paintParlayRole = paintParlay;
  paintParlay = function () { paintParlayRole.apply(this, arguments); legRolePaint(); };
}
