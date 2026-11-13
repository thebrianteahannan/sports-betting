/** "Feeling lazy?" on the TV ticker: roll the die and the parrot picks one of the best recommended bets, leaning toward your teams. */

const tvLazy = { picks: null, span: "today", at: 0, last: "", pick: null };
const TV_LAZY_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function tvLazyFace(n) {
  return `<span class="tv-lazy-face">${[...Array(9)].map((_, index) => `<i${TV_LAZY_PIPS[n].includes(index) ? ' class="on"' : ""}></i>`).join("")}</span>`;
}

function tvLazyPaint() {
  const slot = document.getElementById("tv-tick-lazy");
  if (!slot || slot.dataset.ready) return;
  slot.dataset.ready = "1";
  slot.innerHTML = `<div class="tv-lazy"><p class="tv-lazy-head">Feeling lazy?</p><p class="tv-lazy-ask">As lazy as a parrot? Roll the die. I'll hand you one of the best bets on the board.</p><button type="button" class="tv-lazy-die" aria-label="Roll the die">${tvLazyFace(5)}</button><p class="tv-lazy-again">Roll again</p><div class="tv-lazy-out"></div></div>`;
  slot.addEventListener("click", (event) => {
    const die = event.target.closest(".tv-lazy-die, .tv-lazy-again");
    if (die) { event.stopPropagation(); tvLazyRoll(slot.querySelector(".tv-lazy-die")); return; }
    if (event.target.closest("[data-lazy-open]") && tvLazy.pick && window.tvTickOpen) { event.stopPropagation(); tvTickOpen(tvLazy.pick); }
    if (event.target.closest("[data-lazy-add]") && tvLazy.pick) { event.stopPropagation(); tvLazyAdd(tvLazy.pick); }
  });
}

function tvLazyAdd(pick) {
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdMenu) birdMenu("find");
  let tries = 0;
  const wait = setInterval(() => {
    const board = document.querySelector("#desk-glass-in .find-board"), give = ++tries > 80;
    if (!give && (!board || !(board.people || []).length || typeof legBoostFind !== "function")) return;
    const index = board ? legBoostFind(board.people) : new Map();
    const hit = index.get(`${pick.label}|${pick.market}|${pick.match}`) || [...index.values()].find((row) => row.bet.label === pick.label && row.bet.match === pick.match);
    if (!hit && !give) return;
    clearInterval(wait);
    if (!hit) { if (window.tvTickOpen) tvTickOpen(pick); return; }
    if (parlayLeg.size) saveNew();
    legSwapAdd(hit.person, hit.bet);
    saveNow(); paintParlay();
    const glass = document.getElementById("desk-glass-in");
    if (glass) glass.scrollTop = 0;
  }, 150);
}

async function tvLazyLoad() {
  if (tvLazy.picks && Date.now() - tvLazy.at < 10 * 60000) return;
  try {
    const res = await fetch("/api/lazy-pick", { cache: "no-store" });
    const data = res.ok ? await res.json() : {};
    tvLazy.picks = Array.isArray(data.picks) ? data.picks : [];
    tvLazy.span = data.span || "today";
    tvLazy.at = Date.now();
  } catch (error) { console.log("[tv-lazy] could not load the picks", error); tvLazy.picks = tvLazy.picks || []; }
}

function tvLazyChoose() {
  const all = tvLazy.picks || [];
  const picks = all.length > 1 ? all.filter((pick) => `${pick.label}|${pick.match}` !== tvLazy.last) : all;
  if (!picks.length) return null;
  const games = (window.state && state.board && state.board.games) || [];
  const fav = (pick) => typeof favTeamsHas === "function" && favTeamsHas(games.find((game) => game.match === pick.match) || { match: pick.match });
  const edge = (pick) => Math.max(1, (pick.hits / pick.n) * 100 - parseFloat(pick.need) || 1);
  const weights = picks.map((pick) => Math.sqrt(edge(pick)) * (fav(pick) ? 2.5 : 1));
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  const pick = picks.find((row, index) => (roll -= weights[index]) < 0) || picks[0];
  tvLazy.last = `${pick.label}|${pick.match}`;
  pick.fav = fav(pick);
  return pick;
}

function tvLazyCard(pick) {
  const odds = Number(pick.odds), price = odds > 0 ? `+${odds}` : String(odds), win = (odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds)).toFixed(2);
  const when = pick.kickoff ? new Date(pick.kickoff).toLocaleString("en-US", { timeZone: "America/New_York", ...(tvLazy.span === "week" ? { weekday: "short" } : {}), hour: "numeric", minute: "2-digit" }) + " ET" : "";
  return `<div class="tv-tick-card"><p class="gate-sample-head">${tvLazy.span === "week" ? "This week's" : "Tonight's"} lazy pick${pick.fav ? " · one of your teams" : ""}</p><p class="gate-sample-bet">${esc(pick.label)} <b>${esc(price)}</b></p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p><p class="gate-sample-why">${esc(pick.how || "")}</p><p class="gate-sample-pay">$5 wins $${win}.</p><button type="button" class="tv-tick-open" data-lazy-open>Open the game &#8250;</button><button type="button" class="tv-tick-open tv-tick-add" data-lazy-add>+ Add to my bets</button></div>`;
}

async function tvLazyRoll(die) {
  if (!die || die.disabled) return;
  const lazy = die.closest(".tv-lazy"), out = lazy.querySelector(".tv-lazy-out");
  die.disabled = true;
  tvTick.hold = true;
  out.replaceChildren();
  lazy.classList.remove("rolled");
  const load = tvLazyLoad();
  const flick = setInterval(() => { die.innerHTML = tvLazyFace(1 + Math.floor(Math.random() * 6)); }, 85);
  const spin = die.animate([
    { transform: "translate(0, 0) rotate(0deg) scale(1)" },
    { transform: "translate(-38%, -55%) rotate(-200deg) scale(1.15)", offset: 0.25 },
    { transform: "translate(30%, -20%) rotate(-430deg) scale(0.95)", offset: 0.5 },
    { transform: "translate(-12%, -30%) rotate(-610deg) scale(1.08)", offset: 0.75 },
    { transform: "translate(0, 0) rotate(-720deg) scale(1)" },
  ], { duration: 1400, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
  await Promise.all([spin.finished.catch(() => {}), load]);
  clearInterval(flick);
  die.innerHTML = tvLazyFace(1 + Math.floor(Math.random() * 6));
  die.animate([{ transform: "scale(1.25)" }, { transform: "scale(0.92)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" });
  die.disabled = false;
  tvLazy.pick = tvLazyChoose();
  lazy.classList.add("rolled");
  out.innerHTML = tvLazy.pick ? tvLazyCard(tvLazy.pick) : `<p class="tv-lazy-none">Tonight's picks are not posted yet.</p>`;
  out.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "ease-out" });
}

window.tvLazyPaint = tvLazyPaint;
