/** Leg roles on the bet card. Anchor holds the bet up, Juice pays for it, Filler is near even money, Dead weight carries more of the risk than the payout. */

const LEG_ROLE = { anchor: ["Anchor", "Holds the bet up."], juice: ["Juice", "Pays for the bet."], filler: ["Filler", "Near even money. Adds some price and real risk."], dead: ["Dead weight", "Carries more of the risk than the payout. Swap it first."] };

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
  if (price) return { id: price.id, name: price.name, kind: "price", rate: price.rate };
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

function metalSay(place, pct) {
  const need = `${Math.round(place.rate * 100)}%`;
  const hit = pct ? ` It has to hit ${pct}.` : "";
  if (place.kind === "clear") return `Clears a ${place.name} Ticket. Hit ${place.record.hits} of ${place.record.n}.`;
  if (place.kind === "short") return `Hit ${place.record.hits} of ${place.record.n}.${hit} A Bronze Ticket has hit ${need} or more.`;
  if (place.kind === "price") return `A ${place.name} price.${hit} A ${place.name} Ticket has hit ${need} or more.`;
  const stop = place.kind === "shorter" ? "−200" : "+200";
  return `${place.kind === "shorter" ? "Shorter" : "Longer"} than a Bronze Ticket.${hit} Bronze stops at ${stop}.`;
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
  const place = metalJudge(price, legs.length === 1 ? metalRecord(legs[0]) : null);
  document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key;
    const row = rows.find((item) => typeof parlayKey === "function" && parlayKey(item.bet) === key);
    const prop = line.querySelector("span i.prop");
    if (!row || !prop) return;
    const legPlace = metalJudge(row.odds, metalRecord(row.bet));
    if (!legPlace) return;
    const tag = document.createElement("i");
    tag.className = `leg-metal m-${legPlace.id}`;
    tag.textContent = metalTagText(legPlace);
    tag.title = metalSay(legPlace, typeof findPct === "function" ? findPct(row.odds) : "");
    const after = [...line.querySelectorAll("span > i.find-rec-pill, span > i.bet-kind")].pop() || prop;
    after.after(tag);
  });
  if (!place) return;
  const pct = typeof findPct === "function" ? findPct(price) : "";
  document.querySelectorAll(".find-tray .find-ticket").forEach((ticket) => {
    const line = document.createElement("p");
    line.className = `leg-metal-say m-${place.id}`;
    line.textContent = metalSay(place, pct);
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
