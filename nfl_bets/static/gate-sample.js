/** Free Parlay of the Day (3 anchors + juice) and tonight's free single pick on the sign-up screen. */

function samplePrice(odds) {
  const value = Number(odds);
  if (!Number.isFinite(value)) return "";
  return value > 0 ? `+${value}` : String(value);
}

function sampleWin(odds, stake = 5) {
  const value = Number(odds);
  if (!Number.isFinite(value)) return "";
  return (value > 0 ? (stake * value) / 100 : (stake * 100) / Math.abs(value)).toFixed(2);
}

function sampleWhen(kickoff) {
  return kickoff ? new Date(kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : "";
}

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

function sampleParlayShareText(parlay, price, win, when) {
  const game = [parlay.match, when].filter(Boolean).join(" · ");
  const legs = (parlay.bets || []).map((bet) => `${bet.label} ${samplePrice(bet.odds)}`).join("\n");
  return [
    "Parlay of the Day — free 4-leg (3 anchors + juice)",
    `${price} · $5 wins $${win}.`,
    game,
    "",
    legs,
    "",
    parlay.how || "",
    "",
    `See it and start free: ${location.origin}/`,
  ].filter((line, at, all) => line || (at > 0 && all[at - 1])).join("\n");
}

async function sampleShare(pick) {
  if (!pick) return;
  const odds = Number(pick.odds);
  if (!Number.isFinite(odds)) return;
  const price = samplePrice(odds), win = sampleWin(odds), when = sampleWhen(pick.kickoff);
  const text = pick.bets ? sampleParlayShareText(pick, price, win, when) : sampleShareText(pick, price, win, when);
  const url = `${location.origin}/`;
  try {
    if (navigator.share) {
      await navigator.share({ title: pick.bets ? "Parlay of the Day" : "Tonight's free pick — Parlay of the Day", text, url });
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

function samplePickHtml(pick, more) {
  const odds = Number(pick.odds), price = samplePrice(odds), win = sampleWin(odds), when = sampleWhen(pick.kickoff);
  return `<p class="gate-sample-head">Tonight's free pick</p><p class="gate-sample-bet">${esc(pick.label)} <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p><p class="gate-sample-why">${esc(pick.how || "")}</p><p class="gate-sample-pay">$5 wins $${esc(win)}.</p>${more > 0 ? `<p class="gate-sample-more">${more} more recommended picks tonight. Sign up or sign in to see them.</p>` : ""}<p class="gate-sample-acts"><button type="button" class="gate-sample-share" data-sample-share>Share with a friend</button></p>`;
}

function sampleParlayHtml(parlay) {
  const odds = Number(parlay.odds), price = samplePrice(odds), win = sampleWin(odds), when = sampleWhen(parlay.kickoff);
  const legs = (parlay.bets || []).map((bet) => {
    const role = /touchdown/i.test(`${bet.rung || ""} ${bet.label || ""}`) ? "Juice" : "Anchor";
    return `<li><span class="gate-sample-role">${esc(role)}</span><span class="gate-sample-leg">${esc(bet.label)}</span><b>${esc(samplePrice(bet.odds))}</b></li>`;
  }).join("");
  return `<p class="gate-sample-head">Parlay of the Day</p><p class="gate-sample-bet">4-leg · 3 anchors + juice <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([parlay.match, when].filter(Boolean).join(" · "))}</p><ul class="gate-sample-legs">${legs}</ul><p class="gate-sample-why">${esc(parlay.how || "")}</p><p class="gate-sample-pay">$5 wins $${esc(win)}.</p><p class="gate-sample-acts"><button type="button" class="gate-sample-share" data-sample-share>Share with a friend</button></p>`;
}

function sampleCard(html, payload) {
  const card = document.createElement("div");
  card.className = "gate-sample-card";
  card._samplePick = payload;
  card.innerHTML = html;
  card.addEventListener("click", (event) => {
    const share = event.target.closest("[data-sample-share]");
    if (share) {
      event.stopPropagation();
      sampleShare(card._samplePick).then((state) => sampleShareMark(share, state));
      return;
    }
    gateSampleOpen(card);
  });
  return card;
}

async function gateSamplePaint() {
  const box = document.getElementById("gate-pick");
  if (!box || document.getElementById("gate-sample")) return;
  let data;
  try { const response = await fetch("/api/sample", { cache: "no-store" }); if (!response.ok) return; data = await response.json(); } catch (error) { console.log("[gate-sample] could not load", error); return; }
  const wrap = document.createElement("div");
  wrap.id = "gate-sample";
  const parlay = data && data.parlay, pick = data && data.pick;
  if (parlay && Array.isArray(parlay.bets) && parlay.bets.length && Number.isFinite(Number(parlay.odds))) {
    wrap.append(sampleCard(sampleParlayHtml(parlay), parlay));
  }
  if (pick && Number.isFinite(Number(pick.odds))) {
    wrap.append(sampleCard(samplePickHtml(pick, Number(data.more) || 0), pick));
  }
  if (!wrap.children.length) return;
  box.prepend(wrap);
}

function gateSampleOpen(card) {
  if (document.getElementById("gate-sample-pop")) return;
  const pick = card._samplePick;
  const pop = document.createElement("div");
  pop.id = "gate-sample-pop";
  const title = pick && pick.bets ? "Parlay of the Day" : "Tonight's free pick";
  pop.innerHTML = `<div class="gate-sample-sheet" role="dialog" aria-label="${title}"><button type="button" class="gate-sample-x" aria-label="Close">&times;</button>${card.innerHTML}<p class="gate-sample-go"><button type="button" data-go="gate-join">Start free for 7 days</button><button type="button" class="ghost" data-go="gate-have">Sign in</button></p></div>`;
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
