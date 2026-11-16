/** TV ticker on the member menu: the parrot's menu, meet Parlay, today's free pick, then "Feeling lazy?", sliding every 12 seconds. */

const tvTick = { at: "menu", timer: 0, pick: null, parlay: null, loading: false, hold: false };
const TV_TICK_SLOTS = ["tv-tick-meet", "tv-tick-state", "tv-tick-askbook", "tv-tick-teams", "tv-tick-day", "tv-tick-pick", "tv-tick-lazy", "tv-tick-steady", "tv-tick-how", "tv-tick-odds", "tv-tick-book", "tv-tick-qr", "tv-tick-law", "tv-tick-risk", "tv-tick-help"];

function tvTickAsks() {
  if (!window.memberReady || document.body.classList.contains("needs-member")) return [];
  const pages = [];
  if (!window.memberState) pages.push("state");
  const books = window.booksHere ? booksHere() : [];
  if (window.memberState && books.length && !books.some((book) => book.id === window.memberBook)) pages.push("askbook");
  if (window.memberTeams === null) pages.push("teams");
  return pages;
}

function tvTickPages() {
  return [...(tvTickGateOn() ? [] : ["menu"]), "meet", ...tvTickAsks(), ...(tvTick.parlay ? ["day"] : []), ...(tvTick.pick ? ["pick"] : []), ...(tvTickGateOn() ? [] : ["lazy"]), "steady", "how", "odds", "book", "qr", ...(tvTickLaw() ? ["law"] : []), "risk", "help"];
}

function tvTickPayload() {
  return tvTick.at === "day" ? tvTick.parlay : tvTick.pick;
}

function tvTickCardHtml(pick, guest) {
  const odds = Number(pick && pick.odds);
  if (!pick || !Number.isFinite(odds)) return "";
  const price = odds > 0 ? `+${odds}` : String(odds);
  const win = (odds > 0 ? (5 * odds) / 100 : (5 * 100) / Math.abs(odds)).toFixed(2);
  const when = pick.kickoff ? new Date(pick.kickoff).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : "";
  const open = guest ? `<p class="gate-sample-more">Sign up or sign in to open the game and the rest of tonight's picks.</p><button type="button" class="tv-tick-open" data-tick-join>Start free for 7 days</button>` : `<button type="button" class="tv-tick-open" data-tick-open>Open the game &#8250;</button>`;
  const more = guest ? `<button type="button" class="tv-tick-more" data-tick-login>Sign in</button>` : `<button type="button" class="tv-tick-more" data-tick-more>View more recommended bets &#8250;</button>`;
  const isParlay = Array.isArray(pick.bets) && pick.bets.length;
  const juiceAt = (() => {
    const rows = Array.isArray(pick.bets) ? pick.bets : [];
    const scored = rows.filter((bet) => /anytime|touchdown|goal/i.test(`${bet.rung || ""} ${bet.label || ""}`));
    const pool = scored.length ? scored : rows.filter((bet) => !/^(The over|The under|The spread|The win)$/i.test(String(bet.rung || "")));
    if (!pool.length) return -1;
    let at = 0;
    pool.forEach((bet, i) => {
      const odds = Number(bet.odds), cur = Number(pool[at].odds);
      const rank = (value) => (value > 0 ? value : 10000 / Math.abs(value || 1));
      if (rank(odds) > rank(cur)) at = i;
    });
    const hit = pool[at];
    return rows.findIndex((bet) => bet === hit || (`${bet.label}|${bet.odds}` === `${hit.label}|${hit.odds}`));
  })();
  const legs = isParlay ? `<ul class="gate-sample-legs">${pick.bets.map((bet, at) => `<li><span class="gate-sample-role">${at === juiceAt || /anytime|touchdown|goal/i.test(`${bet.rung || ""} ${bet.label || ""}`) ? "Juice" : "Anchor"}</span><span class="gate-sample-leg">${esc(bet.label)}</span><b>${esc(Number(bet.odds) > 0 ? `+${bet.odds}` : String(bet.odds))}</b></li>`).join("")}</ul>` : "";
  const head = isParlay ? "Parlay of the Day" : "Today's free pick";
  const bet = isParlay ? `4-leg · 3 players + game bet <b>${esc(price)}</b>` : `${esc(pick.label)} <b>${esc(price)}</b>`;
  return `<div class="tv-tick-stack"><div class="tv-tick-card"><p class="gate-sample-head">${head}</p><p class="gate-sample-bet">${bet}</p><p class="gate-sample-game">${esc([pick.match, when].filter(Boolean).join(" · "))}</p>${legs}<p class="gate-sample-why">${esc(pick.how || "")}</p><p class="gate-sample-pay">$5 wins $${win}.</p><button type="button" class="tv-tick-share" data-tick-share>Share with a friend</button>${open}</div>${more}</div>`;
}

function tvTickMetKey() {
  const id = window.memberCard && window.memberCard.id;
  return id ? `pod-met-parlay:${id}` : "";
}

function tvTickMetSeen() {
  const key = tvTickMetKey();
  if (!key) return true;
  try { return localStorage.getItem(key) === "1"; } catch (error) { return true; }
}

function tvTickMetMark() {
  const key = tvTickMetKey();
  if (!key) return;
  try { localStorage.setItem(key, "1"); } catch (error) { /* ignore */ }
}

function tvTickMeetFirst() {
  if (tvTick.meeting || tvTickGateOn() || !window.memberReady || !window.memberCard || window.memberCard.board === false || tvTickMetSeen()) return;
  tvTick.meeting = true;
  let tries = 0;
  const go = () => {
    if (tvTickGateOn() || tvTickMetSeen()) { tvTick.meeting = false; return; }
    if (!tvTickOn() || !tvTickBox()) {
      if (++tries > 80) { tvTick.meeting = false; return; }
      setTimeout(go, 200);
      return;
    }
    tvTickRelease();
    if (tvTick.at !== "meet") {
      if (tvTick.at !== "menu") {
        const page = tvTickEl(tvTick.at);
        if (page && page.id !== "bird-guide") page.hidden = true;
        tvTick.at = "menu";
      }
      tvTickShow("meet", 1);
    }
    tvTick.last = "meet";
    tvTickMetMark();
    tvTick.meeting = false;
    tvTickTime();
  };
  setTimeout(go, 500);
}

function tvTickGateOn() {
  const gate = document.getElementById("gate");
  return document.body.classList.contains("needs-member") && !!(gate && gate.parentElement && gate.parentElement.id === "desk-glass-in");
}

function tvTickOn() { return tvTickMenuOn() || tvTickGateOn(); }

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
  box.innerHTML = `<div id="tv-tick-meet" hidden><div class="tv-talk"><div class="tv-talk-box"><a class="tv-talk-name" href="/guide" data-tick-help><span class="tv-meet-go" aria-hidden="true"><i></i><i></i></span><span class="tv-talk-name-say">Learn How It Works</span><span class="tv-meet-go" aria-hidden="true"><i></i><i></i></span></a><div class="tv-talk-lines"><p class="tv-talk-line" data-say="Howdy! I&apos;m Parlay the Parrot."></p><p class="tv-talk-line" data-say="I run this desk. Tonight&apos;s picks, Build a bet, live counts while the games are on, and a full record of what hit and what missed."></p><p class="tv-talk-line" data-say="Stick with me and I&apos;ll walk you through better tickets — the price, the chance, and the read — so you get sharper every night."></p><p class="tv-talk-line" data-say="Need me later? Tap my face up top. I&apos;m right there whenever you want help."></p></div><span class="tv-talk-acts" hidden><a class="tv-talk-go" href="/guide" data-tick-help>Show me</a><button type="button" class="tv-talk-go" data-tick-start>Get Started</button></span><span class="tv-talk-next" aria-hidden="true">▼</span></div></div></div><div id="tv-tick-state" hidden></div><div id="tv-tick-askbook" hidden></div><div id="tv-tick-teams" hidden></div><div id="tv-tick-day" hidden></div><div id="tv-tick-pick" hidden></div><div id="tv-tick-lazy" hidden></div><div id="tv-tick-steady" hidden><div class="tv-how"><p class="tv-lazy-head">$20 a day adds up</p><p class="tv-steady-row"><span><b>$140</b>a week</span><span><b>$600</b>a month</span><span><b>$7,300</b>a year</span></p><p class="tv-how-say">No lottery tickets. Short prices that cash, one night at a time, and a real number at the end of the year.</p><button type="button" class="tv-how-go" data-tick-more>Find today's $20 &#8250;</button></div></div><div id="tv-tick-how" hidden><div class="tv-how"><p class="tv-lazy-head">This site does a lot</p><p class="tv-how-say">Game scripts. Player trends. Swaps for a leg you don't like. Saved bets. Bets you send a friend. Every pick graded by morning.</p><p class="tv-how-say">Two minutes in the guide and you'll know where all of it is.</p><a class="tv-how-go" href="/guide">How It Works</a></div></div><div id="tv-tick-odds" hidden><div class="tv-how"><p class="tv-lazy-head">Where the odds come from</p><p class="tv-how-say">Every price on this site comes from <span class="tv-how-strong">FanDuel</span>. We check it every 10 minutes, so the numbers are tonight's.</p><p class="tv-how-say">Other sportsbooks post prices that are usually close to FanDuel's, but they might not be the same. Check the number in your own app before you place the bet.</p></div></div><div id="tv-tick-book" hidden><div class="tv-how"><p class="tv-lazy-head">Not a sportsbook</p><p class="tv-how-say">This is not a sportsbook. No bet is placed on this site.</p><p class="tv-how-say">You read the pick here. If you want it, you place it in your own app.</p></div></div><div id="tv-tick-qr" hidden><div class="tv-how"><p class="tv-lazy-head">Send it to a friend</p><img src="/scene/site-qr.svg?v=1" alt="QR code for parlayoftheday.com"><p class="tv-how-say">Double-click the parrot in the top right any time. Your friend scans this and they're in.</p></div></div><div id="tv-tick-law" hidden></div><div id="tv-tick-risk" hidden><div class="tv-how"><p class="tv-lazy-head">Your call, your risk</p><p class="tv-how-say">Everything on this site is betting advice. You choose the bet, you place it, and the result is yours.</p><p class="tv-how-say">Parlay of the Day is not liable or responsible for any losses, or for any bet you make because of this site. You proceed at your own risk.</p><p class="tv-how-say tv-how-strong">Proceed with caution.</p></div></div><div id="tv-tick-help" hidden><div class="tv-how"><p class="tv-lazy-head">When it stops being fun</p><p class="tv-how-say">Gambling can take a paycheck, a week, and the people around you with it. A loss does not get paid back by the next bet. Chasing it is how a small night turns into a problem.</p><p class="tv-how-say">If you or someone you know has a problem, call the gambling hotline. It's free and confidential, any hour.</p><a class="tv-how-go" href="tel:18004262537">Call 1-800-GAMBLER</a></div></div><div class="tv-tick-nav"><button type="button" class="tv-tick-go" data-step="-1" aria-label="Back">&#8249;</button><p class="tv-tick-dots"></p><button type="button" class="tv-tick-go" data-step="1" aria-label="Next">&#8250;</button></div>`;
  box.hidden = true;
  glass.append(box);
  box.addEventListener("click", (event) => {
    const go = event.target.closest(".tv-tick-go");
    if (go) { event.stopPropagation(); if (tvTick.typed) return; tvTick.hold = false; tvTickStep(Number(go.dataset.step)); return; }
    if (event.target.closest("[data-tick-join]")) { event.stopPropagation(); tvTickGateGo("join"); return; }
    if (event.target.closest("[data-tick-login]")) { event.stopPropagation(); tvTickGateGo("login"); return; }
    if (event.target.closest("[data-tick-more]")) { event.stopPropagation(); if (tvTickGateOn()) { tvTickGateGo("login"); return; } if (window.recPageOpen) recPageOpen(); return; }
    const share = event.target.closest("[data-tick-share]");
    const payload = tvTickPayload();
    if (share && payload && window.sampleShare) {
      event.stopPropagation();
      sampleShare(payload).then((state) => { if (window.sampleShareMark) sampleShareMark(share, state); });
      return;
    }
    const open = event.target.closest("[data-tick-open]");
    if (open && payload) { event.stopPropagation(); tvTickOpen(payload); return; }
    if (event.target.closest("[data-tick-state]")) { event.stopPropagation(); const code = (document.getElementById("tv-tick-state-pick") || {}).value; if (code && window.saveState) saveState(code); return; }
    if (event.target.closest("[data-tick-book]")) { event.stopPropagation(); const book = (document.getElementById("tv-tick-book-pick") || {}).value; if (book && window.saveBook) saveBook(book); return; }
    if (event.target.closest("[data-tick-help]")) { event.stopPropagation(); tvTickHelpPoint(); return; }
    if (event.target.closest("[data-tick-start]")) { event.stopPropagation(); tvTickStartDesk(); return; }
    if (event.target.closest("[data-tick-teams]")) { event.stopPropagation(); if (typeof favTeamsOpen === "function") favTeamsOpen(() => {}); return; }
    if (event.target.closest("[data-tick-teams-skip]")) { event.stopPropagation(); if (typeof favTeamsSave === "function") favTeamsSave([]); return; }
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
  if (tvTick.pick || tvTick.parlay || tvTick.loading) return;
  tvTick.loading = true;
  try {
    const res = await fetch("/api/sample", { cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    const parlay = data && data.parlay, single = data && data.pick;
    tvTick.parlay = parlay && Array.isArray(parlay.bets) && parlay.bets.length && Number.isFinite(Number(parlay.odds)) ? parlay : null;
    tvTick.pick = single && Number.isFinite(Number(single.odds)) ? single : null;
    if (!tvTick.parlay && !tvTick.pick) return;
    const guest = tvTickGateOn();
    const day = document.getElementById("tv-tick-day");
    const slot = document.getElementById("tv-tick-pick");
    if (day) day.innerHTML = tvTick.parlay ? tvTickCardHtml(tvTick.parlay, guest) : "";
    if (slot) slot.innerHTML = tvTick.pick ? tvTickCardHtml(tvTick.pick, guest) : "";
    tvTickDots();
  } catch (error) { console.log("[tv-ticker] could not load tonight's pick", error); } finally { tvTick.loading = false; }
}

function tvTickTalkStop() {
  if (tvTick.talkTimer) clearInterval(tvTick.talkTimer);
  tvTick.talkTimer = 0;
  tvTick.talking = false;
}

function tvTickMeetClear() {
  clearTimeout(tvTick.meetTimer);
  tvTick.meetTimer = 0;
}

function tvTickMeetHold() {
  tvTickMeetClear();
  tvTick.hold = true;
}

function tvTickMeetRead() {
  tvTickMeetClear();
  tvTick.hold = true;
  tvTick.meetTimer = setTimeout(() => {
    if (tvTick.at !== "meet" || tvTickFormOn()) return;
    tvTick.hold = false;
    tvTickTime();
  }, 18000);
}

function tvTickHelpPoint() {
  location.href = "/guide";
}

function tvTickStartDesk() {
  tvTickMeetClear();
  tvTickTalkStop();
  tvTick.hold = false;
  if (tvTick.at !== "menu") tvTickShow("menu", -1);
  tvTickTime();
}

function tvTickTalkDone(box) {
  const tip = box && box.querySelector(".tv-talk-next");
  const acts = box && box.querySelector(".tv-talk-acts");
  box.classList.add("tv-talk-done");
  if (tip) tip.classList.add("on");
  if (acts) acts.hidden = false;
  tvTickMeetRead();
}

function tvTickTalk(slot) {
  const box = slot && slot.querySelector(".tv-talk");
  if (!box) return;
  const lines = [...box.querySelectorAll(".tv-talk-line")];
  const tip = box.querySelector(".tv-talk-next");
  const acts = box.querySelector(".tv-talk-acts");
  tvTickTalkStop();
  tvTickMeetHold();
  lines.forEach((line) => { line.textContent = ""; line.classList.remove("on", "done"); });
  if (tip) tip.classList.remove("on");
  if (acts) acts.hidden = true;
  box.classList.remove("tv-talk-done");
  let at = 0, i = 0;
  const say = () => {
    if (at >= lines.length) {
      tvTickTalkStop();
      tvTickTalkDone(box);
      return;
    }
    const line = lines[at];
    const full = String(line.dataset.say || "");
    line.classList.add("on");
    if (i <= full.length) {
      line.textContent = full.slice(0, i);
      i += 1;
      return;
    }
    line.classList.add("done");
    at += 1;
    i = 0;
  };
  tvTick.talking = true;
  tvTick.talkTimer = setInterval(say, 28);
  say();
  box.onclick = (event) => {
    if (event.target.closest("[data-tick-help], [data-tick-start]")) return;
    if (!tvTick.talking) return;
    tvTickTalkStop();
    lines.forEach((line) => {
      line.textContent = String(line.dataset.say || "");
      line.classList.add("on", "done");
    });
    tvTickTalkDone(box);
  };
}

function tvTickAskPaint(slot, id) {
  if (!slot || slot.dataset.ready === id) return;
  slot.dataset.ready = id;
  if (id === "state") {
    slot.innerHTML = `<div class="tv-how"><p class="tv-lazy-head">Which state are you in?</p><p class="tv-how-say">We need it so the site only shows bets you are allowed to place there.</p><select id="tv-tick-state-pick"></select><button type="button" class="tv-how-go" data-tick-state>That's my state</button></div>`;
    if (window.fillStateSelect) fillStateSelect(slot.querySelector("select"));
  } else if (id === "askbook") {
    const place = window.stateName ? stateName() : "your state";
    slot.innerHTML = `<div class="tv-how"><p class="tv-lazy-head">Which sportsbook?</p><p class="tv-how-say">Which sportsbook are you using in ${esc(place)}? These prices are FanDuel's. Another book's number is usually close, and sometimes the same.</p><select id="tv-tick-book-pick"></select><button type="button" class="tv-how-go" data-tick-book>That's my sportsbook</button></div>`;
    if (window.fillBookSelect) fillBookSelect(slot.querySelector("select"));
  } else if (id === "teams") {
    slot.innerHTML = `<div class="tv-how"><p class="tv-lazy-head">Who do you root for?</p><p class="tv-how-say">Pick your teams and I'll keep their picks ready.</p><button type="button" class="tv-how-go" data-tick-teams>Pick my teams</button><button type="button" class="tv-how-skip" data-tick-teams-skip>Skip</button></div>`;
  }
}

function tvTickShow(next, dir) {
  if (tvTickGateOn() && next === "menu") {
    const page = tvTickEl(tvTick.at);
    if (!page || page.id === "bird-guide" || tvTick.at === "menu") return;
    const ms = 600, ease = "cubic-bezier(0.45, 0, 0.2, 1)";
    page.animate([{ transform: "none" }, { transform: `translateX(${-dir * 100}%)` }], { duration: ms, easing: ease }).finished.then(() => { if (tvTick.at === "menu") page.hidden = true; }).catch(() => {});
    tvTick.at = "menu";
    tvTickDots();
    return;
  }
  const inEl = tvTickEl(next), outEl = tvTickEl(tvTick.at);
  if (!inEl || !outEl || next === tvTick.at) return;
  const ms = 600, ease = "cubic-bezier(0.45, 0, 0.2, 1)";
  if (tvTick.at === "meet" && next !== "meet") {
    tvTickMeetClear();
    if (!tvTickFormOn()) tvTick.hold = false;
  }
  if (next === "lazy" && window.tvLazyPaint) tvLazyPaint();
  if (next === "law") tvTickLawPaint(inEl);
  if (next === "state" || next === "askbook" || next === "teams") tvTickAskPaint(inEl, next);
  if (next === "meet") tvTickTalk(inEl);
  if (next !== "menu") inEl.hidden = false;
  inEl.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: "none" }], { duration: ms, easing: ease });
  outEl.animate([{ transform: "none" }, { transform: `translateX(${-dir * 100}%)` }], { duration: ms, easing: ease }).finished.then(() => { if (outEl.id !== "bird-guide" && outEl !== tvTickEl(tvTick.at)) outEl.hidden = true; }).catch(() => {});
  tvTick.at = next;
  if (next !== "menu") tvTick.last = next;
  if (next === "meet") tvTickMetMark();
  tvTickDots();
}

function tvTickAuto(dir = 1) {
  if (tvTick.typed) return;
  const pages = tvTickPages().filter((id) => id !== "menu");
  if (!pages.length) return;
  if (tvTick.at !== "menu" && !tvTickGateOn()) {
    const from = pages.indexOf(tvTick.at);
    tvTickShow("menu", dir);
    if (dir < 0) tvTick.last = pages[(from - 1 + pages.length) % pages.length];
    return;
  }
  if (tvTickGateOn() && tvTick.at !== "menu") {
    const at = pages.indexOf(tvTick.at);
    tvTickShow(dir > 0 ? pages[(at + 1) % pages.length] : pages[(at - 1 + pages.length) % pages.length], dir);
    return;
  }
  const at = pages.indexOf(tvTick.last);
  tvTickShow(dir > 0 ? pages[(at + 1) % pages.length] : pages[at < 0 ? pages.length - 1 : at], dir);
}

function tvTickStep(dir) {
  tvTickAuto(dir);
  tvTickTime();
}

function tvTickTime() {
  clearInterval(tvTick.timer);
  const ms = tvTick.at === "meet" ? 28000 : 12000;
  tvTick.timer = setInterval(() => { if (tvTickOn() && !tvTick.hold && !tvTick.talking && document.visibilityState === "visible") tvTickAuto(); }, ms);
}

function tvTickWatch() {
  const box = tvTickBox();
  if (!box) return;
  const on = tvTickOn();
  if (on) tvTickLoad();
  if (on && tvTickFormOn()) { if (!tvTick.hold) tvTickStay(); }
  else if (on && tvTick.hold) tvTickRelease();
  const pages = tvTickPages().join(",");
  if (pages !== tvTick.pages) {
    const prev = tvTick.pages;
    tvTick.pages = pages;
    if (prev && tvTick.at !== "menu" && !tvTickPages().includes(tvTick.at)) {
      if (tvTickGateOn()) {
        const first = tvTickPages()[0] || "meet";
        const out = tvTickEl(tvTick.at), inn = tvTickEl(first);
        if (out) out.hidden = true;
        if (inn) inn.hidden = false;
        tvTick.at = first;
        tvTick.last = first;
        tvTickDots();
      } else tvTickShow("menu", -1);
    } else tvTickDots();
  }
  if (on && tvTickFormOn()) box.hidden = true;
  else if (on && box.hidden) {
    box.hidden = false;
    if (tvTickGateOn() && tvTick.at === "menu") {
      const first = tvTickPages()[0] || "meet";
      const el = tvTickEl(first);
      if (el) { el.hidden = false; tvTick.at = first; tvTick.last = first; }
    }
    tvTickDots();
    tvTickTime();
  }
  if (!on && !box.hidden) {
    box.hidden = true; clearInterval(tvTick.timer);
    TV_TICK_SLOTS.forEach((id) => { const slot = document.getElementById(id); if (slot) slot.hidden = true; });
    tvTickTalkStop();
    tvTickMeetClear();
    tvTick.at = "menu"; tvTick.hold = false; tvTick.typed = false;
    box.classList.remove("tv-tick-quiet");
    tvTickDots();
  }
}

function tvTickGateGo(mode) {
  tvTickStay();
  if (window.goFull) goFull();
  if (window.showGateMode) showGateMode(mode);
}

function tvTickRest() {
  TV_TICK_SLOTS.forEach((id) => { const slot = document.getElementById(id); if (slot) slot.hidden = true; });
  tvTickTalkStop();
  tvTickMeetClear();
  tvTick.at = "menu";
  tvTickDots();
}

function tvTickFormOn() {
  if (!tvTickGateOn()) return false;
  const login = document.getElementById("login-form"), join = document.getElementById("member-form");
  return (login && !login.hidden) || (join && !join.hidden);
}

function tvTickRelease() {
  tvTick.hold = false;
  tvTick.typed = false;
  const box = document.getElementById("tv-tick");
  if (box) { box.classList.remove("tv-tick-quiet"); if (tvTickOn() && !tvTickFormOn()) box.hidden = false; }
  if (tvTickOn() && !tvTickFormOn()) tvTickTime();
}

function tvTickStay() {
  tvTick.typed = true;
  tvTick.hold = true;
  document.querySelectorAll("#tv-tick [id^='tv-tick-']").forEach((slot) => slot.getAnimations().forEach((anim) => anim.cancel()));
  tvTickRest();
  const box = document.getElementById("tv-tick");
  if (box) { box.classList.add("tv-tick-quiet"); box.hidden = true; }
}

window.tvTickRest = tvTickRest;
window.tvTickStay = tvTickStay;
window.tvTickRelease = tvTickRelease;
window.tvTickMeetFirst = tvTickMeetFirst;

document.addEventListener("input", (event) => {
  const field = event.target.closest && event.target.closest("#login-form input, #member-form input, #member-form select");
  if (!field || !String(field.value || "").length || !tvTickGateOn() || tvTick.hold) return;
  tvTickStay();
});

setInterval(tvTickWatch, 500);
