const memberFetch = window.fetch.bind(window);

function showGateMode(mode) {
  const wait = document.getElementById("gate-wait");
  if (wait) wait.hidden = true;
  document.getElementById("gate-pick").hidden = mode !== "pick";
  document.getElementById("member-form").hidden = mode !== "join";
  document.getElementById("login-form").hidden = mode !== "login";
}

async function paintGateRecord() {
  const line = document.getElementById("gate-record");
  if (!line || line.dataset.ready) return;
  try {
    const response = await memberFetch("/api/record", { cache: "no-store" });
    if (!response.ok) return;
    const row = await response.json();
    const pct = Number(row.pct);
    const won = Number(row.won);
    const lost = Number(row.lost);
    if (!Number.isFinite(pct) || !Number.isFinite(won) || !Number.isFinite(lost)) return;
    line.dataset.ready = "1";
    line.hidden = false;
    line.innerHTML = `Recommended bets have hit <b>${pct.toFixed(1)}%</b>, from ${won} wins and ${lost} losses. <span class="fine">Past results do not promise the next ticket.</span>`;
    window.birdPct = pct.toFixed(1);
  } catch (error) {}
}

function birdBrag() {
  const pct = window.birdPct;
  if (pct == null) return "";
  return `Not to brag or anything, but ${pct}% of my recommended bets are winning. Are you sure you're smarter than a bird?`;
}

async function loadBirdPct() {
  if (window.birdPct != null) return;
  try {
    const response = await memberFetch("/api/record", { cache: "no-store" });
    if (!response.ok) return;
    const row = await response.json();
    const pct = Number(row.pct);
    if (Number.isFinite(pct)) window.birdPct = pct.toFixed(1);
  } catch (error) {}
}
function showGate() {
  document.body.classList.add("needs-member");
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("bird-on");
  paintGateRecord();
  if (window.state) window.state.showLive = false;
  const who = document.getElementById("who");
  if (who) who.hidden = true;
  showGateMode("pick");
  if (window.deskGate) window.deskGate();
}

window.birdBrag = birdBrag;

function showMember(payload) {
  document.body.classList.remove("needs-member");
  const member = payload.member || {};
  const who = document.getElementById("who");
  who.hidden = false;
  if (who.parentElement !== document.body) document.body.append(who);
  const admin = !!member.admin;
  who.innerHTML = `<button type="button" id="member-profile" aria-label="Profile" title="${esc(member.name)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 19c1.5-3.1 4-4.6 7-4.6s5.5 1.5 7 4.6"/></svg></button>`;
  const heading = document.querySelector("#activity h2");
  if (heading) heading.textContent = member.name || "Your membership";
  window.memberName = member.name || "";
  window.memberState = member.state || "";
  window.memberBook = member.book || "";
  if (payload.model) window.askModel = payload.model;
  window.fullAt = member.fullAt || "";
  if (window.applyMember) applyMember(window.memberState);
  window.memberReady = true;
  loadBirdPct();
  const call = document.getElementById("call-name");
  if (call && document.activeElement !== call) call.value = member.name || "";
  const spoken = document.getElementById("bird-line");
  const said = spoken ? spoken.textContent : "";
  const desk = document.getElementById("desk");
  if (desk && desk.classList.contains("bird-on") && (said === "Hey." || said.startsWith("Hey. What") || said.startsWith("What should I call you") || said.startsWith("Which state") || said.startsWith("Which sportsbook"))) birdGreet();
  const adminBox = document.getElementById("profile-admin");
  if (adminBox) adminBox.hidden = !admin;
  const plan = document.getElementById("activity-plan");
  plan.textContent = admin
    ? "Admin. Ratings are kept on this membership."
    : "Free membership. Payments are not turned on. Ratings are kept on this membership.";
  const rows = payload.activity || [];
  window.ratedBuilt = rows.filter((row) => row.kind === "rate" && row.detail && row.detail.built && Number(row.detail.stars) > 0).map((row) => ({
    id: row.id, built: true, title: row.detail.title || "Built bet", american: row.detail.american,
    copy: row.detail.copy || "", legs: row.detail.legs || [], stars: Number(row.detail.stars) || 0, goodAt: row.at, result: "open",
  }));
  if (window.loadReports) window.loadReports();
  if (window.state) {
    window.state.admin = admin;
    window.state.showLive = false;
  }
  if (window.render) window.render();
  if (admin && window.loadAdmin) window.loadAdmin();
}

const CARD_NAMES = {
  band: "−150 to +100 window",
  todayBet: "Highest chance parlay today",
  chalk: "−400 to −700 legs, near −180",
  four: "Four yardage legs near 85% each",
  plus: "Four yardage legs near +250",
  hits: "Five near 90% vs four near 80%",
  weekThree: "3 legs, different days, near −200",
  weekFive: "5 legs, different days, near −200",
  weekSafe: "3 legs, different days, near −350",
};

async function refreshActivity() {
  const response = await memberFetch("/api/me", { cache: "no-store" });
  if (!response.ok) return;
  showMember(await response.json());
}

async function sendMember(path, fields, errorId) {
  const error = document.getElementById(errorId);
  error.textContent = "";
  const body = {};
  Object.entries(fields).forEach(([key, id]) => {
    body[key] = document.getElementById(id).value;
  });
  const response = await memberFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    error.textContent = payload.error || "Could not open the membership.";
    return;
  }
  if (window.state) window.state.tab = "today";
  showMember(payload.activity ? payload : { member: payload.member, activity: [] });
  if (window.startDesk) window.startDesk();
  const home = document.getElementById("desk-home");
  if (home) home.click();
}

async function signOut() {
  await memberFetch("/api/logout", { method: "POST" });
  if (window.state && window.state.timer) clearTimeout(window.state.timer);
  showGate();
}

async function bootMember() {
  const response = await memberFetch("/api/me", { cache: "no-store" });
  if (!response.ok) {
    showGate();
    return;
  }
  showMember(await response.json());
  if (window.startDesk) window.startDesk();
}

window.fetch = async function memberAwareFetch(url, options) {
  const response = await memberFetch(url, options);
  const target = String(url);
  if (response.status === 401 && target.startsWith("/api/") && !target.startsWith("/api/me")) showGate();
  if (response.ok && (target === "/api/archive/good" || target === "/api/picks")) refreshActivity();
  return response;
};

async function hardRefresh() {
  const stamp = Date.now();
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    await fetch("/?fresh=" + stamp, { cache: "reload" });
  } catch (error) {}
  location.replace(location.pathname + "?fresh=" + stamp);
}

document.getElementById("who").addEventListener("click", (event) => {
  if (event.target.closest("#member-profile")) showTab("profile");
});
function calledName() {
  return String(window.memberName || "").trim().split(/\s+/)[0];
}

function birdGreet() {
  if (!window.memberReady || document.body.classList.contains("needs-member") || !window.birdSay) return;
  const called = calledName();
  if (!called) { birdAskName(); return; }
  if (!window.memberState) { birdAskState(); return; }
  if (birdAskBook()) return;
  if (birdLaw()) return;
  window.asking = false;
  birdSay(`Hey, ${called}. What are you trying to do today?`, [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"], ["parrot", "Ask Parlay the Parrot"]]);
}

function birdLaw() {
  const note = window.lawNote ? lawNote() : "";
  if (!note) return false;
  if (window.lawMarkToday) lawMarkToday();
  window.asking = true;
  birdSay(note, []);
  const row = document.getElementById("bird-picks");
  if (row) {
    row.innerHTML = `<button type="button" id="bird-law-go">Continue</button>`;
    document.getElementById("bird-law-go").addEventListener("pointerdown", (event) => {
      event.preventDefault();
      window.lawShut = window.memberState || "";
      birdGreet();
    });
  }
  return true;
}

function birdAskState() {
  window.asking = true;
  birdSay("Which state are you in? We need it so the desk only shows bets you are allowed to place there.", []);
  const row = document.getElementById("bird-picks");
  if (!row || !window.fillStateSelect) return;
  row.innerHTML = `<select id="bird-state"></select><button type="button" id="bird-state-go">That's my state</button>`;
  fillStateSelect(document.getElementById("bird-state"));
  document.getElementById("bird-state-go").addEventListener("click", () => saveState(document.getElementById("bird-state").value));
}

function birdAskBook() {
  const books = window.booksHere ? booksHere() : [];
  if (!books.length || books.some((book) => book.id === window.memberBook)) return false;
  window.asking = true;
  const place = window.stateName ? stateName() : "your state";
  birdSay(`Which sportsbook are you using in ${place}? These prices are FanDuel's. Another book's number is usually close, and sometimes the same.`, []);
  const row = document.getElementById("bird-picks");
  const all = window.bookRoster ? bookRoster() : books;
  const openIds = new Set(books.map((book) => book.id));
  if (row) {
    row.innerHTML = all.map((book) => {
      const open = openIds.has(book.id);
      const label = open ? book.name : `${book.name} (not available in your state)`;
      return `<button type="button" data-book="${book.id}"${open ? "" : " disabled"}>${label}</button>`;
    }).join("");
    row.querySelectorAll("[data-book]:not([disabled])").forEach((button) => button.addEventListener("click", () => saveBook(button.dataset.book)));
  }
  return true;
}

async function saveBook(raw) {
  const book = String(raw || "").trim().toLowerCase();
  if (!book || (window.booksHere && !booksHere().some((item) => item.id === book))) return;
  const response = await memberFetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return;
  window.memberBook = (payload.member && payload.member.book) || "";
  if (window.fillBookSelect) fillBookSelect(document.getElementById("call-book"));
  if (window.render) window.render();
  const said = (document.getElementById("bird-line") || {}).textContent || "";
  if (said.startsWith("Which sportsbook")) birdGreet();
}

async function saveState(raw) {
  const state = String(raw || "").trim().toUpperCase();
  if (!state) return;
  const response = await memberFetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return;
  window.memberState = (payload.member && payload.member.state) || "";
  if (window.applyMember) applyMember(window.memberState);
  if (window.render) window.render();
  const said = (document.getElementById("bird-line") || {}).textContent || "";
  if (said.startsWith("Which state")) birdGreet();
}

function birdAskName() {
  window.asking = true;
  birdSay("What should I call you?", []);
  const row = document.getElementById("bird-picks");
  if (!row) return;
  row.innerHTML = `<input id="bird-name" maxlength="40" placeholder="Your name" autocomplete="nickname"><button type="button" id="bird-name-go">That's me</button>`;
  document.getElementById("bird-name").addEventListener("keydown", (event) => { if (event.key === "Enter") saveCalledName(event.target.value); });
  document.getElementById("bird-name-go").addEventListener("click", () => saveCalledName(document.getElementById("bird-name").value));
}

async function saveCalledName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (name && name.length < 2) return;
  const response = await memberFetch("/api/name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return;
  window.memberName = (payload.member && payload.member.name) || "";
  const heading = document.querySelector("#activity h2");
  if (heading) heading.textContent = window.memberName || "Your membership";
  const call = document.getElementById("call-name");
  if (call) call.value = window.memberName;
  const who = document.querySelector("#member-profile");
  if (who) who.title = window.memberName;
  if (window.memberName) birdGreet();
  else birdAskName();
}

function birdMenu(kind) {
  if (kind !== "bets") return;
  window.asking = true;
  if (window.birdQuiet) birdQuiet();
  birdSay("Recommended bets, by strategy.", []);
  const row = document.getElementById("bird-picks");
  if (!row) return;
  const board = document.createElement("div");
  board.className = "rec-board";
  const archive = ((window.state && window.state.board && window.state.board.archive) || []);
  const now = Date.now();
  const live = (ticket) => ![ticket.kickoff, ...(ticket.legs || []).map((leg) => leg.kickoff)].some((iso) => {
    const stamp = Date.parse(iso || "");
    return Number.isFinite(stamp) && stamp <= now;
  });
  const strategies = Object.entries(CARD_NAMES).flatMap(([id, name]) => (
    id === "hits" ? [["hits", "Five near 90% each", "five"], ["hits", "Four near 80% each", "four"]] : [[id, name, ""]]
  ));
  const filled = [];
  const empty = [];
  strategies.forEach(([id, name, part]) => {
    const block = document.createElement("section");
    block.className = "rec-strategy";
    const heading = document.createElement("h3");
    heading.textContent = name;
    block.append(heading);
    const seen = new Set();
    const hitsPart = (ticket) => { const mark = String(ticket.title || "").toLowerCase().split("·").pop(); return mark.includes("five near 90") ? "five" : mark.includes("four near 80") ? "four" : ((ticket.legs || []).length >= 5 ? "five" : "four"); };
    archive.filter((ticket) => ticket.card === id && (!part || hitsPart(ticket) === part) && (!ticket.result || ticket.result === "open") && ticket.legs && ticket.legs.length && live(ticket))
      .sort((a, b) => String(b.offeredAt || "").localeCompare(String(a.offeredAt || "")))
      .forEach((ticket) => {
        const key = `${ticket.american}|${ticket.legs.map((leg) => leg.label).join("|")}`;
        if (seen.has(key)) return;
        seen.add(key);
        const bet = document.createElement("div");
        bet.className = "rec-bet";
        const price = Number(ticket.american);
        const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
        const pct = ticket.impliedPct != null && ticket.impliedPct !== "" ? `${ticket.impliedPct}%` : "";
        const head = document.createElement("b");
        head.textContent = [shown, pct].filter(Boolean).join(" · ") || name;
        bet.append(head);
        ticket.legs.forEach((leg) => {
          const line = document.createElement("span");
          const odds = Number(leg.odds);
          const tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : "";
          line.textContent = [tag, leg.label].filter(Boolean).join(" ");
          bet.append(line);
        });
        block.append(bet);
      });
    if (!block.querySelector(".rec-bet")) {
      const note = document.createElement("p");
      note.textContent = "None you can place right now.";
      block.append(note);
      empty.push(block);
    } else filled.push(block);
  });
  filled.forEach((block) => board.append(block));
  empty.forEach((block) => board.append(block));
  row.append(board);
}

function goFull() {
  const desk = document.getElementById("desk");
  const full = document.getElementById("desk-full");
  if (full && desk && !desk.classList.contains("tv-full")) full.click();
}
window.goFull = goFull;

function openRecommended(id) {
  goFull();
  window.asking = false;
  if (window.birdQuiet) birdQuiet();
  window.digOn = false;
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("bird-on", "dug");
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const head = document.getElementById("desk-head");
  if (head) head.classList.remove("bird-talk");
  const card = document.getElementById(id);
  const week = id === "week" || id === "week5" || id === "safe";
  if (typeof showTab === "function") showTab(week ? "week" : "today");
  const glass = document.getElementById("desk-glass-in");
  if (card && glass && !glass.contains(card)) glass.append(card);
  if (card) { card.hidden = false; card.scrollIntoView({ block: "start" }); }
}

window.birdMenu = birdMenu;

document.getElementById("bird-guide").addEventListener("click", (event) => {
  const menu = event.target.closest("[data-menu]");
  if (menu) { goFull(); birdMenu(menu.dataset.menu); return; }
  const parrot = event.target.closest("[data-parrot]");
  if (parrot && window.askBet) { goFull(); askBet("general"); return; }
  if (!event.target.closest("#bird-picks button")) return;
  const line = (document.getElementById("bird-line") || {}).textContent || "";
  const note = window.lawNote ? lawNote() : "";
  if (note && line === note) window.lawShut = window.memberState || "";
});
document.getElementById("pane-profile").addEventListener("click", (event) => {
  if (event.target.closest("#member-out")) signOut();
  if (event.target.closest("#call-save")) saveCalledName(document.getElementById("call-name").value);
  if (event.target.closest("#state-save")) saveState(document.getElementById("call-state").value);
  if (event.target.closest("#book-save")) saveBook(document.getElementById("call-book").value);
  if (event.target.closest("#hard-refresh")) hardRefresh();
});
document.getElementById("pane-laws").addEventListener("click", (event) => {
  if (event.target.closest("#laws-save")) saveState(document.getElementById("laws-state").value);
});
window.birdGreet = birdGreet;
function noteTaste(kind, detail) {
  memberFetch("/api/taste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot: kind, ...(detail || {}) }) }).catch(() => {});
}
window.noteTaste = noteTaste;
document.getElementById("gate-join").addEventListener("click", () => showGateMode("join"));
document.getElementById("gate-have").addEventListener("click", () => showGateMode("login"));
document.getElementById("join-signin").addEventListener("click", () => showGateMode("login"));
document.getElementById("login-join").addEventListener("click", (event) => { event.preventDefault(); showGateMode("join"); });
document.getElementById("member-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMember("/api/join", {
    name: "member-name",
    email: "member-email",
    password: "member-pass",
    state: "member-state",
  }, "member-error");
});
document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMember("/api/login", {
    email: "login-email",
    password: "login-pass",
  }, "login-error");
});

bootMember();

let askEar = null;
function hearAsk(box) {
  const mic = document.getElementById("bet-mic");
  const Hear = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!mic) return;
  if (askEar) { try { askEar.stop(); } catch (error) { askEar = null; } }
  if (!Hear) { mic.hidden = true; return; }
  mic.addEventListener("click", () => {
    if (askEar) { try { askEar.stop(); } catch (error) { askEar = null; } return; }
    const ear = new Hear();
    askEar = ear;
    ear.lang = "en-US";
    ear.interimResults = true;
    ear.onresult = (event) => {
      box.value = [...event.results].map((row) => row[0].transcript).join(" ").trim();
    };
    const done = () => { if (askEar === ear) askEar = null; mic.classList.remove("on"); mic.textContent = "Speak"; };
    ear.onend = done;
    ear.onerror = done;
    mic.classList.add("on");
    mic.textContent = "Stop";
    try { ear.start(); } catch (error) { done(); }
  });
}
window.hearAsk = hearAsk;
