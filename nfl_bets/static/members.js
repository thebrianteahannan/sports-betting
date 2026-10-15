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

function showMember(payload) {
  document.body.classList.remove("needs-member");
  const member = payload.member || {};
  const who = document.getElementById("who");
  who.hidden = false;
  const admin = !!member.admin;
  who.innerHTML = `<button type="button" id="hard-refresh" aria-label="Reload the page" title="Reload"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.2-5.8"/><path d="M21 4v5h-5"/></svg></button><button type="button" id="member-profile" aria-label="Profile" title="${esc(member.name)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 19c1.5-3.1 4-4.6 7-4.6s5.5 1.5 7 4.6"/></svg></button>`;
  const heading = document.querySelector("#activity h2");
  if (heading) heading.textContent = member.name || "Your membership";
  window.memberName = member.name || "";
  window.memberState = member.state || "";
  window.memberBook = member.book || "";
  if (window.applyMember) applyMember(window.memberState);
  window.memberReady = true;
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
    ? "Admin. Ratings and saved picks are kept on this membership."
    : "Free membership. Payments are not turned on. Ratings and saved picks are kept on this membership.";
  const list = document.getElementById("activity-list");
  const rows = payload.activity || [];
  list.innerHTML = rows.length
    ? rows.map(activityLine).join("")
    : "<p>No ratings or saved picks yet.</p>";
  if (window.loadReports) window.loadReports();
  if (window.state) {
    window.state.admin = admin;
    window.state.showLive = false;
  }
  if (window.render) window.render();
  if (admin && window.loadAdmin) window.loadAdmin();
}

const CARD_NAMES = {
  band: "Best bet of the day",
  todayBet: "Today's Best Bet",
  chalk: "Near −180",
  four: "Four at 85% each",
  plus: "Safest near +250",
  hits: "Which stack hits more",
  weekThree: "Good 3-leg",
  weekFive: "Good 5-leg",
  weekSafe: "Super safe",
};

function activityLine(row) {
  const detail = row.detail || {};
  const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
  const what = detail.group || CARD_NAMES[detail.card] || "a ticket";
  if (row.kind === "rate") return `<p>Rated ${esc(what)} ${esc(detail.stars)} stars. ${esc(clock)}</p>`;
  if (row.kind === "save") return `<p>Saved ${esc(what)}. ${esc(clock)}</p>`;
  return "";
}

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
  if (event.target.closest("#hard-refresh")) hardRefresh();
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
  birdSay(`Hey, ${called}. What are you trying to do today?`, [["today", "View Our Recommended Bets"], ["quiz", "Build Your Own Bet"]]);
}

function birdLaw() {
  const note = window.lawNote ? lawNote() : "";
  if (!note) return false;
  window.asking = true;
  birdSay(note, [["today", "View Our Recommended Bets"], ["quiz", "Build Your Own Bet"]]);
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
  if (row) {
    row.innerHTML = books.map((book) => `<button type="button" data-book="${book.id}">${book.name}</button>`).join("");
    row.querySelectorAll("[data-book]").forEach((button) => button.addEventListener("click", () => saveBook(button.dataset.book)));
  }
  return true;
}

async function saveBook(raw) {
  const book = String(raw || "").trim().toLowerCase();
  if (!book) return;
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

document.getElementById("bird-guide").addEventListener("click", (event) => {
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
