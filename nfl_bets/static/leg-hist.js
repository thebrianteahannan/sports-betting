// The chart icon on a parlay leg opens that bet's history under the leg, inside the parlay.
const legHistOpen = new Set(), legHistBox = new Map();

function legHistFor(key) {
  if (legHistBox.has(key)) return legHistBox.get(key);
  const bet = parlayLeg.get(key) || {};
  const person = [...parlayPick.values()].find((one) => String(bet.label || "").startsWith(one.name));
  const block = document.createElement("div");
  block.className = "find-tray-read log-on";
  Object.assign(block.dataset, { who: person ? person.name : "", raw: String(bet.label || "").split(/\s+—\s+/)[0].trim(), market: bet.market || "", odds: String(bet.odds || ""), sport: bet.sport || "" });
  const wait = document.createElement("p");
  wait.className = "find-leg-wait";
  wait.textContent = "Reading the history.";
  block.append(wait);
  legHistBox.set(key, block);
  if (typeof fillLeg === "function") fillLeg(block);
  return block;
}

function legHistPaint() {
  document.querySelectorAll(".find-tray button.find-leg-hist").forEach((button) => {
    const key = button.dataset.key, on = legHistOpen.has(key) && parlayLeg.has(key);
    button.classList.toggle("on", on);
    button.setAttribute("aria-expanded", String(on));
    button.title = on ? "Hide the history" : "Show the history";
    const line = button.closest(".find-chose");
    if (on && line) line.after(legHistFor(key));
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest && event.target.closest(".find-tray button.find-leg-hist");
  if (!button) return;
  const key = button.dataset.key;
  if (legHistOpen.has(key)) { legHistOpen.delete(key); const box = legHistBox.get(key); if (box) box.remove(); } else legHistOpen.add(key);
  legHistPaint();
});

if (typeof paintParlay === "function") {
  const paintParlayLegs = paintParlay;
  paintParlay = function () { paintParlayLegs.apply(this, arguments); legHistPaint(); };
}
