/** One of tonight's recommended picks on the sign-up screen, so visitors see what a membership gets them. */

function sampleShareText(pick, price, win, when) {
  const game = [pick.match, when].filter(Boolean).join(" · ");
  const lines = [
    "Tonight's free pick from Parlay of the Day",
    `${pick.label} ${price}`,
    game,
    pick.how || "",
    `$5 wins $${win}.`,
    "",
    `See it and start free: ${location.origin}/`,
  ].filter((line, at, all) => line || (at > 0 && all[at - 1]));
  return lines.join("\n");
}

async function sampleShare(pick) {
  if (!pick) return;
  const odds = Number(pick.odds);
  if (!Number.isFinite(odds)) return;
  const price = odds > 0 ? `+${odds}` : String(odds);
  const win = (odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds)).toFixed(2);
  const when = pick.kickoff ? new Date(pick.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : "";
  const text = sampleShareText(pick, price, win, when);
  const url = `${location.origin}/`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Tonight's free pick — Parlay of the Day", text, url });
      return "shared";
    }
  } catch (error) {
    if (error && error.name === "AbortError") return "cancel";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (error) {
    console.log("[gate-sample] share copy failed", error);
    return "";
  }
}

function sampleShareMark(btn, state) {
  if (!btn) return;
  const was = btn.dataset.say || btn.textContent;
  if (!btn.dataset.say) btn.dataset.say = was;
  if (state === "copied") btn.textContent = "Copied";
  else if (state === "shared") btn.textContent = "Sent";
  else return;
  clearTimeout(btn._sampleShareTimer);
  btn._sampleShareTimer = setTimeout(() => { btn.textContent = btn.dataset.say; }, 1600);
}

window.sampleShare = sampleShare;
window.sampleShareMark = sampleShareMark;

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
  card._samplePick = pick;
  card.innerHTML = `<p class="gate-sample-head">Tonight's free pick</p><p class="gate-sample-bet">${esc(pick.label)} <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p><p class="gate-sample-why">${esc(pick.how)}</p><p class="gate-sample-pay">$5 wins $${win}.</p>${data.more > 0 ? `<p class="gate-sample-more">${data.more} more recommended picks tonight. Sign up or sign in to see them.</p>` : ""}<p class="gate-sample-acts"><button type="button" class="gate-sample-share" data-sample-share>Share with a friend</button></p>`;
  card.addEventListener("click", (event) => {
    const share = event.target.closest("[data-sample-share]");
    if (share) {
      event.stopPropagation();
      sampleShare(card._samplePick).then((state) => sampleShareMark(share, state));
      return;
    }
    gateSampleOpen(card);
  });
  box.prepend(card);
}

function gateSampleOpen(card) {
  if (document.getElementById("gate-sample-pop")) return;
  const pick = card._samplePick;
  const pop = document.createElement("div");
  pop.id = "gate-sample-pop";
  pop.innerHTML = `<div class="gate-sample-sheet" role="dialog" aria-label="Tonight's free pick"><button type="button" class="gate-sample-x" aria-label="Close">&times;</button>${card.innerHTML}<p class="gate-sample-go"><button type="button" data-go="gate-join">Start free for 7 days</button><button type="button" class="ghost" data-go="gate-have">Sign in</button></p></div>`;
  const shut = () => { pop.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (event) => { if (event.key === "Escape") shut(); };
  pop.addEventListener("click", (event) => {
    const share = event.target.closest("[data-sample-share]");
    if (share) {
      sampleShare(pick).then((state) => sampleShareMark(share, state));
      return;
    }
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
