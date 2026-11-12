/** One of tonight's recommended picks on the sign-up screen, so visitors see what a membership gets them. */

async function gateSamplePaint() {
  const box = document.getElementById("gate-pick");
  if (!box || document.getElementById("gate-sample")) return;
  let data;
  try { const response = await fetch("/api/sample", { cache: "no-store" }); if (!response.ok) return; data = await response.json(); } catch (error) { console.log("[gate-sample] could not load", error); return; }
  const pick = data && data.pick, odds = Number(pick && pick.odds);
  if (!pick || !Number.isFinite(odds)) return;
  const price = odds > 0 ? `+${odds}` : String(odds), win = (odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds)).toFixed(2);
  const when = pick.kickoff ? new Date(pick.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : "";
  const card = document.createElement("div");
  card.id = "gate-sample";
  card.innerHTML = `<p class="gate-sample-head">Tonight's free pick</p><p class="gate-sample-bet">${esc(pick.label)} <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p><p class="gate-sample-why">${esc(pick.how)}</p><p class="gate-sample-pay">$5 wins $${win}.</p>${data.more > 0 ? `<p class="gate-sample-more">${data.more} more picks tonight. Free membership opens them.</p>` : ""}`;
  card.addEventListener("click", () => gateSampleOpen(card));
  box.prepend(card);
}

function gateSampleOpen(card) {
  if (document.getElementById("gate-sample-pop")) return;
  const pop = document.createElement("div");
  pop.id = "gate-sample-pop";
  pop.innerHTML = `<div class="gate-sample-sheet" role="dialog" aria-label="Tonight's free pick"><button type="button" class="gate-sample-x" aria-label="Close">&times;</button>${card.innerHTML}<p class="gate-sample-go"><button type="button" data-go="gate-join">Create a free membership</button><button type="button" class="ghost" data-go="gate-have">I already have one</button></p></div>`;
  const shut = () => { pop.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (event) => { if (event.key === "Escape") shut(); };
  pop.addEventListener("click", (event) => {
    const go = event.target.closest("[data-go]");
    if (go) { shut(); const target = document.getElementById(go.dataset.go); if (target) target.click(); return; }
    if (event.target === pop || event.target.closest(".gate-sample-x")) shut();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(pop);
}

document.addEventListener("DOMContentLoaded", gateSamplePaint);
document.addEventListener("click", (event) => {
  if (!event.target.closest || !event.target.closest("#desk-back")) return;
  const form = document.getElementById("member-form"), desk = document.getElementById("desk");
  if (form && !form.hidden && desk && desk.classList.contains("tv-full") && window.showGateMode) setTimeout(() => showGateMode("pick"), 0);
}, true);
