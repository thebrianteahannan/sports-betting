/** TV ticker on the member menu: the parrot's menu, tonight's free pick, then "Feeling lazy?", sliding every 12 seconds. */

const tvTick = { at: "menu", timer: 0, pick: null, loading: false, hold: false };

function tvTickPages() { return ["menu", ...(tvTick.pick ? ["pick"] : []), "lazy"]; }

function tvTickEl(id) { return document.getElementById(id === "menu" ? "bird-guide" : id === "pick" ? "tv-tick-pick" : "tv-tick-lazy"); }

function tvTickDots() {
  const dots = document.querySelector("#tv-tick .tv-tick-dots");
  if (dots) dots.innerHTML = tvTickPages().map((id) => `<i${id === tvTick.at ? ' class="on"' : ""}></i>`).join("");
}

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
  box.innerHTML = `<div id="tv-tick-pick" hidden></div><div id="tv-tick-lazy" hidden></div><div class="tv-tick-nav"><button type="button" class="tv-tick-go" data-step="-1" aria-label="Back">&#8249;</button><p class="tv-tick-dots"></p><button type="button" class="tv-tick-go" data-step="1" aria-label="Next">&#8250;</button></div>`;
  box.hidden = true;
  glass.append(box);
  box.addEventListener("click", (event) => {
    const go = event.target.closest(".tv-tick-go");
    if (go) { event.stopPropagation(); tvTick.hold = false; tvTickStep(Number(go.dataset.step)); return; }
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
    tvTickDots();
  } catch (error) { console.log("[tv-ticker] could not load tonight's pick", error); } finally { tvTick.loading = false; }
}

function tvTickShow(next, dir) {
  const inEl = tvTickEl(next), outEl = tvTickEl(tvTick.at);
  if (!inEl || !outEl || next === tvTick.at) return;
  const ms = 600, ease = "cubic-bezier(0.45, 0, 0.2, 1)";
  if (next === "lazy" && window.tvLazyPaint) tvLazyPaint();
  if (next !== "menu") inEl.hidden = false;
  inEl.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: "none" }], { duration: ms, easing: ease });
  outEl.animate([{ transform: "none" }, { transform: `translateX(${-dir * 100}%)` }], { duration: ms, easing: ease }).finished.then(() => { if (outEl.id !== "bird-guide" && outEl !== tvTickEl(tvTick.at)) outEl.hidden = true; }).catch(() => {});
  tvTick.at = next;
  tvTickDots();
}

function tvTickStep(dir) {
  const pages = tvTickPages(), at = Math.max(0, pages.indexOf(tvTick.at));
  tvTickShow(pages[(at + dir + pages.length) % pages.length], dir);
  tvTickTime();
}

function tvTickTime() {
  clearInterval(tvTick.timer);
  tvTick.timer = setInterval(() => { if (tvTickMenuOn() && !tvTick.hold && document.visibilityState === "visible") tvTickStep(1); }, 12000);
}

function tvTickWatch() {
  const box = tvTickBox();
  if (!box) return;
  const on = tvTickMenuOn();
  if (on) tvTickLoad();
  if (on && box.hidden) { box.hidden = false; tvTickDots(); tvTickTime(); }
  if (!on && !box.hidden) {
    box.hidden = true; clearInterval(tvTick.timer);
    ["tv-tick-pick", "tv-tick-lazy"].forEach((id) => { const slot = document.getElementById(id); if (slot) slot.hidden = true; });
    tvTick.at = "menu"; tvTick.hold = false;
    tvTickDots();
  }
}

setInterval(tvTickWatch, 500);
