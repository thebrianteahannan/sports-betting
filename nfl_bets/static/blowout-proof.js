/** "Blowout proof" on an NBA over: he still clears it in his own blowouts, at 75% or better and at least as often as the price needs. */

const proofData = new Map(), proofAsked = new Set();
const PROOF_KINDS = [
  [/(pts|points).{0,20}(reb|rebounds).{0,20}(ast|assists)|\bpra\b/i, ["pts", "reb", "ast"]],
  [/(pts|points).{0,20}(reb|rebounds)/i, ["pts", "reb"]],
  [/(pts|points).{0,20}(ast|assists)/i, ["pts", "ast"]],
  [/(reb|rebounds).{0,20}(ast|assists)/i, ["reb", "ast"]],
  [/threes|3-?pointers?/i, ["threes"]],
  [/\b(reb|rebounds?)\b/i, ["reb"]],
  [/\b(ast|assists?)\b/i, ["ast"]],
  [/\b(pts|points?)\b/i, ["pts"]],
];

function proofOf(name, market, prop, odds) {
  const data = proofData.get(name);
  const text = `${market || ""} ${prop || ""}`;
  if (!data || !Array.isArray(data.blow) || data.blow.length < 3 || /\bunder\b|quarter|half|1st|first|double|triple|minutes/i.test(text)) return null;
  const kind = PROOF_KINDS.find(([pattern]) => pattern.test(text));
  const bar = String(prop || "").replace(name, "").match(/(\d+(?:\.\d+)?)/) || String(market || "").replace(name, "").match(/(\d+(?:\.\d+)?)/);
  const price = Number(odds);
  if (!kind || !bar || !price) return null;
  const line = Number(bar[1]), over = /\bover\b/i.test(prop);
  const total = (game) => kind[1].reduce((sum, key) => sum + (Number(game[key]) || 0), 0);
  const made = (game) => (over ? total(game) > line : total(game) >= line);
  const hits = data.blow.filter(made).length, n = data.blow.length;
  const need = price < 0 ? -price / (-price + 100) : 100 / (price + 100);
  if (hits / n < Math.max(0.75, need)) return null;
  const avg = data.blow.reduce((sum, game) => sum + total(game), 0) / n;
  const rest = (data.rest || []).filter(made).length;
  return `He cleared it in ${hits} of ${n} blowouts, ${avg.toFixed(1)} a game there, and in ${rest} of ${(data.rest || []).length} other games. ${price > 0 ? `+${price}` : price} needs ${(need * 100).toFixed(1)}%.`;
}

function proofPill(tip) {
  const pill = document.createElement("i");
  pill.className = "find-proof";
  pill.textContent = "Blowout proof";
  pill.title = tip;
  return pill;
}

function proofList(root) {
  (root || document).querySelectorAll(".rec-bet").forEach((row) => {
    const who = row.querySelector(".rec-gist i.who"), prop = row.querySelector(".rec-gist i.prop"), head = row.querySelector(":scope > b");
    if (!who || !prop || !head || head.querySelector(".find-proof")) return;
    const tip = proofOf(who.textContent, row.dataset.market, prop.textContent, row.dataset.odds);
    if (!tip) return;
    const league = head.querySelector(".leg-league");
    if (league) league.before(proofPill(tip)); else head.append(proofPill(tip));
  });
}

function proofTray() {
  document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), prop = line.querySelector("span i.prop"), who = line.querySelector("span i.who");
    const bet = hist && typeof parlayLeg !== "undefined" ? parlayLeg.get(hist.dataset.key) : null;
    if (!bet || !prop || !who || bet.sport !== "NBA" || line.querySelector(".find-proof")) return;
    if (!proofData.has(who.textContent)) { proofAsk(who.textContent, bet.sport); return; }
    const tip = proofOf(who.textContent, bet.market, bet.label, bet.odds);
    if (tip) prop.after(proofPill(tip));
  });
}

function proofScript(root) {
  (root || document).querySelectorAll(".find-script-leg[data-who]").forEach((line) => {
    const who = line.dataset.who, prop = line.querySelector("i.prop");
    if (!prop || line.querySelector(".find-proof")) return;
    if (!proofData.has(who)) { proofAsk(who, "NBA"); return; }
    const tip = proofOf(who, line.dataset.market, line.dataset.label, line.dataset.odds);
    if (tip) prop.after(proofPill(tip));
  });
}

function proofAsk(name, sport) {
  if (proofAsked.has(name)) return;
  proofAsked.add(name);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "card", name, sport }) })
    .then((res) => res.json())
    .then((data) => proofTake(name, data && data.blowout))
    .catch(() => {});
}

function proofTake(name, blowout) {
  proofData.set(name, blowout || {});
  proofAsked.add(name);
  const list = document.querySelector(".find-board .find-list");
  if (list) {
    proofList(list);
    if (!list.proofWatch) { list.proofWatch = new MutationObserver(() => proofList(list)); list.proofWatch.observe(list, { childList: true, subtree: true }); }
  }
  proofTray();
  proofScript();
  if (document.querySelector(".find-tray .find-tray-swap") && typeof legSwapPaint === "function") legSwapPaint();
}

window.proofTake = proofTake;

if (typeof paintParlay === "function") {
  const paintParlayProof = paintParlay;
  paintParlay = function () { paintParlayProof.apply(this, arguments); proofTray(); };
}
