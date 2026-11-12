/** The parrot's bubble tips: one feature at a time, skipping anything this person has already used on this device. */
const BIRD_TIPS = [
  { id: "name", when: ".find-tray .find-chose i.who[data-key]", hit: ".find-tray .find-chose i.who[data-key], .find-tray .find-in button.find-name", text: "Tap a player's name in your bet to swap him to another prop." },
  { id: "prop", when: ".find-tray .find-chose i.prop[data-key]", hit: ".find-tray .find-chose i.prop[data-key]", text: "Tap the prop in your bet to move the number up or down." },
  { id: "hist", when: ".find-tray .find-chose", hit: "button.find-leg-hist", point: "button.find-leg-hist", text: "Tap the chart on a leg to see how he's done in his recent games." },
  { id: "swap", when: ".find-tray .find-chose", hit: "button.find-leg-swap", point: "button.find-leg-swap", text: "Tap the arrows on a leg and I'll find other bets at the same price." },
  { id: "to", when: ".find-tray .find-chose", hit: "button.find-leg-to", point: "button.find-leg-to", text: "Tap the list button on a leg to put it in another saved bet too." },
  { id: "seek", when: ".find-tray .find-chose", hit: "button.find-leg-seek", point: "button.find-leg-seek", text: "Tap the magnifier on a leg to pull up everything on that player." },
  { id: "share", when: ".find-tray button.share-bet", hit: "button.share-bet, #share-card-friend", text: "Tap the share arrow on your bet to send it straight to a friend." },
  { id: "recgo", when: "button.find-rec-go", hit: "button.find-rec-go", text: "See my face next to a player? Tap it and I'll tell you why I like him." },
  { id: "plus", when: ".find-roster .find-names .find-chip:not(.find-line-chip) > button.find-plus", hit: ".find-roster .find-names .find-chip:not(.find-line-chip) > button.find-plus", text: "Tap the + on a player to throw him in your bet now. Pick his prop later." },
  { id: "profile", hit: "#member-profile, #live-profile", text: "Tap the little person in the corner. Your record and your settings live in your profile.", go: () => { const me = document.getElementById("member-profile"); if (me) me.click(); } },
  { id: "qr", text: "Double-tap me and I'll put a QR code on the TV. Your friends scan it and they're in.", go: () => { if (window.siteQrShow) siteQrShow(); } },
  { id: "shot", hit: ".find-shot, .find-shot-box", text: "Friend sent you a screenshot of a bet? Tap here, paste it, and I'll build it for you.", go: () => { if (window.birdMenu) birdMenu("find"); birdWait(".find-shot", () => birdPoint(".find-shot")); } },
  { id: "games", hit: ".find-games summary, .find-games-go, .desk-games-tab, .desk-game, .live-leagues button", text: "Every game today and this week is on The Games. Tap here and I'll take you.", go: () => { if (window.birdMenu) birdMenu("live"); } },
  { id: "history", hit: ".find-saved-done, #live-score [data-history], .rec-hist", text: "Want to know how your old bets went? Tap here and I'll show you what hit and what missed.", go: () => { if (window.birdMenu) birdMenu("find"); birdWait(".find-saved-done", (done) => done.click(), () => { localStorage.setItem("liveSpan", "past"); location.href = "/live"; }); } },
  { id: "recs", hit: "#live-recs", text: "On The Games, flip on Recommended bets and my picks show up on every game.", go: () => { sessionStorage.setItem("birdPoint", ".live-court:has(#live-recs)"); location.href = "/live"; } },
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
