/** TV ticker on the member menu: the parrot's menu, tonight's free pick, then "Feeling lazy?", sliding every 12 seconds. */

const tvTick = { at: "menu", timer: 0, pick: null, loading: false, hold: false };

function tvTickPages() { return ["menu", ...(tvTick.pick ? ["pick"] : []), "lazy", "steady", "how", "odds", ...(tvTickLaw() ? ["law"] : []), "risk", "help"]; }

function tvTickLaw() { return window.lawText ? lawText() : ""; }

function tvTickLawPaint(slot) {
  const text = tvTickLaw(), cut = text.indexOf(": ");
  slot.innerHTML = `<div class="tv-how"><p class="tv-lazy-head">Betting in ${esc(cut > 0 ? text.slice(0, cut) : "your state")}</p><p class="tv-how-say">${esc(cut > 0 ? text.slice(cut + 2) : text)}</p></div>`;
}

function tvTickEl(id) { return document.getElementById(id === "menu" ? "bird-guide" : `tv-tick-${id}`); }

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
  box.innerHTML = `<div id="tv-tick-pick" hidden></div><div id="tv-tick-lazy" hidden></div><div id="tv-tick-steady" hidden><div class="tv-how"><p class="tv-lazy-head">$20 a day adds up</p><p class="tv-steady-row"><span><b>$140</b>a week</span><span><b>$600</b>a month</span><span><b>$7,300</b>a year</span></p><p class="tv-how-say">No lottery tickets. Short prices that cash, one night at a time, and a real number at the end of the year.</p><button type="button" class="tv-how-go" data-tick-more>Find today's $20 &#8250;</button></div></div><div id="tv-tick-how" hidden><div class="tv-how"><p class="tv-lazy-head">This site does a lot</p><p class="tv-how-say">Game scripts. Player trends. Swaps for a leg you don't like. Saved bets. Bets you send a friend. Every pick graded by morning.</p><p class="tv-how-say">Two minutes in the guide and you'll know where all of it is.</p><a class="tv-how-go" href="/guide">How It Works</a></div></div><div id="tv-tick-odds" hidden><div class="tv-how"><p class="tv-lazy-head">Where the odds come from</p><p class="tv-how-say">Every price on this site comes from <span class="tv-how-strong">FanDuel</span>. We check it every 10 minutes, so the numbers are tonight's.</p><p class="tv-how-say">Other sportsbooks post prices that are usually close to FanDuel's, but they might not be the same. Check the number in your own app before you place the bet.</p></div></div><div id="tv-tick-law" hidden></div><div id="tv-tick-risk" hidden><div class="tv-how"><p class="tv-lazy-head">Your call, your risk</p><p class="tv-how-say">Everything on this site is betting advice. You choose the bet, you place it, and the result is yours.</p><p class="tv-how-say">Parlay of the Day is not liable or responsible for any losses, or for any bet you make because of this site. You proceed at your own risk.</p><p class="tv-how-say tv-how-strong">Proceed with caution.</p></div></div><div id="tv-tick-help" hidden><div class="tv-how"><p class="tv-lazy-head">When it stops being fun</p><p class="tv-how-say">Gambling can take a paycheck, a week, and the people around you with it. A loss does not get paid back by the next bet. Chasing it is how a small night turns into a problem.</p><p class="tv-how-say">If you or someone you know has a problem, call the gambling hotline. It's free and confidential, any hour.</p><a class="tv-how-go" href="tel:18004262537">Call 1-800-GAMBLER</a></div></div><div class="tv-tick-nav"><button type="button" class="tv-tick-go" data-step="-1" aria-label="Back">&#8249;</button><p class="tv-tick-dots"></p><button type="button" class="tv-tick-go" data-step="1" aria-label="Next">&#8250;</button></div>`;
  box.hidden = true;
  glass.append(box);
  box.addEventListener("click", (event) => {
    const go = event.target.closest(".tv-tick-go");
    if (go) { event.stopPropagation(); tvTick.hold = false; tvTickStep(Number(go.dataset.step)); return; }
    if (event.target.closest("[data-tick-more]") && window.recPageOpen) { event.stopPropagation(); recPageOpen(); return; }
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
    if (slot) slot.innerHTML = `<div class="tv-tick-stack"><div class="tv-tick-card"><p class="gate-sample-head">Tonight's free pick</p><p class="gate-sample-bet">${esc(pick.label)} <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p><p class="gate-sample-why">${esc(pick.how)}</p><p class="gate-sample-pay">$5 wins $${win}.</p><button type="button" class="tv-tick-open" data-tick-open>Open the game &#8250;</button></div><button type="button" class="tv-tick-more" data-tick-more>View more recommended bets &#8250;</button></div>`;
    tvTickDots();
  } catch (error) { console.log("[tv-ticker] could not load tonight's pick", error); } finally { tvTick.loading = false; }
}

function tvTickShow(next, dir) {
  const inEl = tvTickEl(next), outEl = tvTickEl(tvTick.at);
  if (!inEl || !outEl || next === tvTick.at) return;
  const ms = 600, ease = "cubic-bezier(0.45, 0, 0.2, 1)";
  if (next === "lazy" && window.tvLazyPaint) tvLazyPaint();
  if (next === "law") tvTickLawPaint(inEl);
  if (next !== "menu") inEl.hidden = false;
  inEl.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: "none" }], { duration: ms, easing: ease });
  outEl.animate([{ transform: "none" }, { transform: `translateX(${-dir * 100}%)` }], { duration: ms, easing: ease }).finished.then(() => { if (outEl.id !== "bird-guide" && outEl !== tvTickEl(tvTick.at)) outEl.hidden = true; }).catch(() => {});
  tvTick.at = next;
  if (next !== "menu") tvTick.last = next;
  tvTickDots();
}

function tvTickAuto(dir = 1) {
  const pages = tvTickPages().filter((id) => id !== "menu"), at = pages.indexOf(tvTick.last);
  if (tvTick.at !== "menu") {
    const from = pages.indexOf(tvTick.at);
    tvTickShow("menu", dir);
    if (dir < 0) tvTick.last = pages[(from - 1 + pages.length) % pages.length];
    return;
  }
  tvTickShow(dir > 0 ? pages[(at + 1) % pages.length] : pages[at < 0 ? pages.length - 1 : at], dir);
}

function tvTickStep(dir) {
  tvTickAuto(dir);
  tvTickTime();
}

function tvTickTime() {
  clearInterval(tvTick.timer);
  tvTick.timer = setInterval(() => { if (tvTickMenuOn() && !tvTick.hold && document.visibilityState === "visible") tvTickAuto(); }, 12000);
}

function tvTickWatch() {
  const box = tvTickBox();
  if (!box) return;
  const on = tvTickMenuOn();
  if (on) tvTickLoad();
  if (on && box.hidden) { box.hidden = false; tvTickDots(); tvTickTime(); }
  if (!on && !box.hidden) {
    box.hidden = true; clearInterval(tvTick.timer);
    ["tv-tick-pick", "tv-tick-lazy", "tv-tick-steady", "tv-tick-how", "tv-tick-odds", "tv-tick-law", "tv-tick-risk", "tv-tick-help"].forEach((id) => { const slot = document.getElementById(id); if (slot) slot.hidden = true; });
    tvTick.at = "menu"; tvTick.hold = false;
    tvTickDots();
  }
}

setInterval(tvTickWatch, 500);
