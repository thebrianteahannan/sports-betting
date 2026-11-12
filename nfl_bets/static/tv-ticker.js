/** TV ticker on the member menu: the parrot's menu, then tonight's free pick, sliding every 12 seconds. */

const tvTick = { at: 0, timer: 0, pick: null, loading: false };

function tvTickMenuOn() {
  const desk = document.getElementById("desk"), guide = document.getElementById("bird-guide");
  return !!(desk && guide && desk.classList.contains("bird-on") && !guide.hidden && guide.querySelector("#bird-picks button[data-menu]") && !document.body.classList.contains("needs-member"));
}

function tvTickBox() {
  let box = document.getElementById("tv-tick");
  if (box) return box;
  const glass = document.getElementById("desk-glass");
  if (!glass) return null;
  box = document.createElement("div");
  box.id = "tv-tick";
  box.innerHTML = `<div id="tv-tick-pick" hidden></div><div class="tv-tick-nav"><button type="button" class="tv-tick-go" data-step="-1" aria-label="Back">&#8249;</button><p class="tv-tick-dots"><i class="on"></i><i></i></p><button type="button" class="tv-tick-go" data-step="1" aria-label="Next">&#8250;</button></div>`;
  box.hidden = true;
  glass.append(box);
  box.addEventListener("click", (event) => {
    const go = event.target.closest(".tv-tick-go");
    if (go) { event.stopPropagation(); tvTickStep(Number(go.dataset.step)); return; }
    const open = event.target.closest("[data-tick-open]");
    if (open && tvTick.pick) { event.stopPropagation(); tvTickOpen(tvTick.pick); }
  });
  return box;
}

function tvTickOpen(pick) {
  const leg = `${pick.label}|${pick.market || ""}`;
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdMenu) birdMenu("find");
  let tries = 0, opened = false;
  const wait = setInterval(() => {
    if (++tries > 120) { clearInterval(wait); console.log("[tv-ticker] could not open the pick", pick.match); return; }
    const board = document.querySelector(".find-board");
    if (!board) return;
    if (!opened) {
      const hit = [...board.querySelectorAll(".find-games button")].find((node) => node.textContent.startsWith(pick.match));
      if (hit) { opened = true; hit.click(); }
      return;
    }
    const rowOf = () => [...board.querySelectorAll(".find-match > .find-bets .find-script-leg")].find((node) => `${node.dataset.label}|${node.dataset.market}` === leg);
    const box = board.querySelector(".find-match > .find-bets");
    if (!box || (!rowOf() && tries < 80)) return;
    clearInterval(wait);
    if (typeof scriptRecJump === "function") scriptRecJump(box.parentElement, (info) => String(info.legs || "").split("||").includes(leg)); else box.open = true;
    setTimeout(() => {
      const row = [...board.querySelectorAll(".find-match > .find-bets .find-script-leg")].find((node) => node.getClientRects().length && `${node.dataset.label}|${node.dataset.market}` === leg) || board.querySelector(".find-match > .find-bets");
      if (!row) return;
      row.classList.add("find-flash"); setTimeout(() => row.classList.remove("find-flash"), 4400);
    }, 900);
  }, 150);
}

async function tvTickLoad() {
  if (tvTick.pick || tvTick.loading) return;
  tvTick.loading = true;
  try {
    const res = await fetch("/api/sample", { cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    const pick = data && data.pick, odds = Number(pick && pick.odds);
    if (!pick || !Number.isFinite(odds)) return;
    tvTick.pick = pick;
    const price = odds > 0 ? `+${odds}` : String(odds), win = (odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds)).toFixed(2);
    const when = pick.kickoff ? new Date(pick.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : "";
    const slot = document.getElementById("tv-tick-pick");
    if (slot) slot.innerHTML = `<div class="tv-tick-card"><p class="gate-sample-head">Tonight's free pick</p><p class="gate-sample-bet">${esc(pick.label)} <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p><p class="gate-sample-why">${esc(pick.how)}</p><p class="gate-sample-pay">$5 wins $${win}.</p><button type="button" class="tv-tick-open" data-tick-open>Open the game &#8250;</button></div>`;
  } catch (error) { console.log("[tv-ticker] could not load tonight's pick", error); } finally { tvTick.loading = false; }
}

function tvTickShow(next, dir) {
  const guide = document.getElementById("bird-guide"), slot = document.getElementById("tv-tick-pick");
  if (!guide || !slot || next === tvTick.at) return;
  const inEl = next === 1 ? slot : guide, outEl = next === 1 ? guide : slot, ms = 600, ease = "cubic-bezier(0.45, 0, 0.2, 1)";
  slot.hidden = false;
  inEl.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: "none" }], { duration: ms, easing: ease });
  outEl.animate([{ transform: "none" }, { transform: `translateX(${-dir * 100}%)` }], { duration: ms, easing: ease }).finished.then(() => { if (tvTick.at === 0) slot.hidden = true; }).catch(() => {});
  tvTick.at = next;
  document.querySelectorAll("#tv-tick .tv-tick-dots i").forEach((dot, index) => dot.classList.toggle("on", index === next));
}

function tvTickStep(dir) {
  if (!tvTick.pick) return;
  tvTickShow((tvTick.at + dir + 2) % 2, dir);
  tvTickTime();
}

function tvTickTime() {
  clearInterval(tvTick.timer);
  tvTick.timer = setInterval(() => { if (tvTickMenuOn() && tvTick.pick && document.visibilityState === "visible") tvTickStep(1); }, 12000);
}

function tvTickWatch() {
  const box = tvTickBox();
  if (!box) return;
  const on = tvTickMenuOn() && !!tvTick.pick;
  if (tvTickMenuOn()) tvTickLoad();
  if (on && box.hidden) { box.hidden = false; tvTickTime(); }
  if (!on && !box.hidden) {
    box.hidden = true; clearInterval(tvTick.timer);
    const slot = document.getElementById("tv-tick-pick");
    if (slot) slot.hidden = true;
    tvTick.at = 0;
    document.querySelectorAll("#tv-tick .tv-tick-dots i").forEach((dot, index) => dot.classList.toggle("on", index === 0));
  }
}

setInterval(tvTickWatch, 500);
