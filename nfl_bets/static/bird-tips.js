/** The parrot's bubble: asks if you need help, and a tap opens the guide. */
const BIRD_TIPS = [
  { id: "help", text: "Need help? Tap me and I'll show you around.", go: () => { location.href = "/guide"; } },
];

function birdUsed() {
  try { return new Set(JSON.parse(localStorage.getItem("birdUsed") || "[]")); } catch (error) { return new Set(); }
}

function birdLearn(id) {
  const used = birdUsed();
  if (used.has(id)) return;
  used.add(id);
  try { localStorage.setItem("birdUsed", JSON.stringify([...used])); } catch (error) { console.log("[bird-tips] could not save", error); }
}

function birdShown(selector) {
  return [...document.querySelectorAll(selector)].find((node) => node.getClientRects().length) || null;
}

function birdWait(selector, done, fail, tries = 20) {
  const node = birdShown(selector);
  if (node) done(node);
  else if (tries) setTimeout(() => birdWait(selector, done, fail, tries - 1), 150);
  else if (fail) fail();
}

function birdPoint(selector) {
  const node = birdShown(selector) || birdShown(".find-tray button.find-leg-more");
  if (!node) return false;
  node.scrollIntoView({ block: "center", behavior: "smooth" });
  const glow = "0 0 0 5px rgba(61, 255, 110, 0.95), 0 0 18px rgba(61, 255, 110, 0.8)";
  node.animate([{ boxShadow: "0 0 0 0 rgba(61, 255, 110, 0)" }, { boxShadow: glow }, { boxShadow: "0 0 0 0 rgba(61, 255, 110, 0)" }], { duration: 900, iterations: 4 });
  return true;
}

function birdTip() {
  const used = birdUsed(), start = Number(localStorage.getItem("birdTipAt")) || 0;
  for (const near of [true, false]) {
    for (let step = 0; step < BIRD_TIPS.length; step += 1) {
      const at = (start + step) % BIRD_TIPS.length, tip = BIRD_TIPS[at];
      if (used.has(tip.id) || Boolean(tip.when) !== near || (tip.when && !birdShown(tip.when))) continue;
      localStorage.setItem("birdTipAt", String(at + 1));
      return tip.text;
    }
  }
  return "";
}

function birdTipGo(text) {
  const tip = BIRD_TIPS.find((row) => row.text === text);
  if (!tip) return false;
  if (tip.go) tip.go();
  else birdPoint(tip.point || tip.when);
  return true;
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target && target.closest) BIRD_TIPS.forEach((tip) => { if (tip.hit && target.closest(tip.hit)) birdLearn(tip.id); });
  setTimeout(() => { if (document.getElementById("site-qr")) birdLearn("qr"); }, 60);
}, true);
window.addEventListener("paste", () => { if (document.querySelector(".find-board")) birdLearn("shot"); }, true);
window.addEventListener("load", () => {
  const point = sessionStorage.getItem("birdPoint");
  if (!point) return;
  sessionStorage.removeItem("birdPoint");
  birdWait(point, () => birdPoint(point));
});
window.birdTip = birdTip;
window.birdTipGo = birdTipGo;
