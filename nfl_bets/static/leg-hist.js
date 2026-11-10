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
    const who = line && line.querySelector("span i.who");
    if (who && !button.parentElement.querySelector("button.find-leg-seek")) {
      const seek = document.createElement("button");
      seek.type = "button";
      seek.className = "find-leg-seek";
      seek.title = `Search for ${who.textContent}`;
      seek.setAttribute("aria-label", seek.title);
      seek.dataset.who = who.textContent;
      button.before(seek);
    }
  });
}

function legSeek(name) {
  const run = () => {
    const input = document.querySelector(".find-board label.find input");
    if (!input) return false;
    input.value = name;
    input.dispatchEvent(new Event("input"));
    const hits = input.closest(".find-board").querySelector(":scope > .find-hits:not(.find-tray)");
    const picks = hits ? [...hits.querySelectorAll("button:not([data-week])")] : [];
    const pick = picks.find((node) => plainName(node.textContent.split(",")[0]) === plainName(name)) || (picks.length === 1 ? picks[0] : null);
    if (pick) pick.click();
    const list = input.closest(".find-board").querySelector(":scope > .find-list");
    (list && list.childNodes.length ? list : input).scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  };
  if (run()) return;
  if (window.paintFind) paintFind();
  let tries = 0;
  const wait = setInterval(() => { if (run() || ++tries > 40) clearInterval(wait); }, 150);
}

document.addEventListener("click", (event) => {
  const seek = event.target.closest && event.target.closest(".find-tray button.find-leg-seek");
  if (seek) legSeek(seek.dataset.who);
});

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
