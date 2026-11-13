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

function legRoleName(bet) {
  const label = String(bet.label || ""), person = typeof parlayPick !== "undefined" && [...parlayPick.values()].find((one) => one.name && label.startsWith(one.name));
  if (person) return person.name.split(" ").pop();
  return label.includes(":") ? `the ${label.split(":").pop().trim()}` : label;
}

function legRoleSay(rows) {
  const names = (role) => rows.filter((row) => row.role === role).map((row) => legRoleName(row.bet)), join = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0]);
  const anchors = names("anchor"), juice = names("juice"), dead = names("dead");
  return [anchors.length ? `Anchored by ${join(anchors)}.` : "No anchor under it.", juice.length ? `Juiced by ${join(juice)}.` : "Every leg is short. Steady, smaller payout.", dead.length ? `${join(dead)} ${dead.length > 1 ? "carry" : "carries"} risk without the payout.` : ""].filter(Boolean).join(" ");
}

function legRolePaint() {
  if (typeof parlayLeg === "undefined") return;
  document.querySelectorAll(".find-tray .leg-role, .find-tray .leg-role-say").forEach((node) => node.remove());
  const rows = legRoles([...parlayLeg.values()]);
  if (!rows.length) return;
  const byKey = new Map(rows.map((row) => [parlayKey(row.bet), row]));
  document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key, row = key && byKey.get(key), prop = line.querySelector("span i.prop");
    if (!row || !prop) return;
    const tag = document.createElement("i"), [name, tip] = LEG_ROLE[row.role];
    tag.className = `leg-role r-${row.role}`; tag.textContent = name;
    tag.title = `${tip} Our chance ${Math.round(100 * row.chance)}%${row.n ? ` from ${row.hits} of ${row.n}, shrunk toward the price` : " from the price"}.${rows.length > 1 ? ` ${Math.round(100 * row.payShare)}% of the payout, ${Math.round(100 * row.riskShare)}% of the risk.` : ""}`;
    (prop.parentElement.querySelector(":scope > i.who") || prop).before(tag);
  });
  if (rows.length < 2) return;
  const say = legRoleSay(rows);
  document.querySelectorAll(".find-tray .find-ticket").forEach((ticket) => {
    const line = document.createElement("p"); line.className = "leg-role-say"; line.textContent = say;
    ticket.after(line);
  });
}

if (typeof paintParlay === "function") {
  const paintParlayRole = paintParlay;
  paintParlay = function () { paintParlayRole.apply(this, arguments); legRolePaint(); };
}
