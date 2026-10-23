const memberFetch = window.fetch.bind(window);

function showGateMode(mode) {
  const wait = document.getElementById("gate-wait"); if (wait) wait.hidden = true;
  document.getElementById("gate-pick").hidden = mode !== "pick"; document.getElementById("member-form").hidden = mode !== "join"; document.getElementById("login-form").hidden = mode !== "login";
  if (mode === "join") bornRange(document.getElementById("member-born"));
}

async function paintGateRecord() {
  const line = document.getElementById("gate-record");
  if (!line || line.dataset.ready) return;
  try {
    const response = await memberFetch("/api/record", { cache: "no-store" });
    if (!response.ok) return;
    const row = await response.json(), pct = Number(row.pct), won = Number(row.won), lost = Number(row.lost);
    if (!Number.isFinite(pct) || !Number.isFinite(won) || !Number.isFinite(lost)) return;
    line.dataset.ready = "1";
    line.hidden = false;
    line.innerHTML = `Recommended bets have hit <b>${pct.toFixed(1)}%</b>, from ${won} wins and ${lost} losses. <span class="fine">Past results do not promise the next ticket.</span>`;
    window.birdPct = pct.toFixed(1);
  } catch (error) {}
}

function birdBrag() {
  const archive = ((window.state && window.state.board && window.state.board.archive) || []);
  const picks = Object.entries(CARD_NAMES).flatMap(([id, name]) => (id === "hits" ? [["hits", "Five near 90% each", "five"], ["hits", "Four near 80% each", "four"]] : [[id, name, ""]])).flatMap(([id, name, part]) => {
    const done = archive.filter((ticket) => ticket.card === id && (ticket.result === "won" || ticket.result === "lost") && (!part || hitsPart(ticket) === part));
    const rates = [7, 30].map((span) => ({ span: span === 7 ? "week" : "month", pct: parseFloat(recPct(done, Date.now() - 86400000 * span)), n: recPct.n })).filter((row) => row.n >= 5 && row.pct >= 75).sort((a, b) => b.pct - a.pct);
    return rates[0] ? [{ id, name, part, span: rates[0].span, pct: rates[0].pct }] : [];
  }).sort((a, b) => b.pct - a.pct);
  if (!picks.length) { window.birdHot = null; return ""; }
  const hot = picks[window.birdTurn || 0]; window.birdTurn = ((window.birdTurn || 0) + 1) % picks.length;
  return (window.birdHot = Object.assign(hot, { text: `Not to brag, but ${hot.name} hit ${hot.pct.toFixed(1)}% this ${hot.span}.` })).text;
}
function birdBragGo(text) {
  const hot = window.birdHot; if (!hot || hot.text !== text) return false;
  if (window.goFull) goFull(); birdMenu("bets");
  const block = [...document.querySelectorAll(".rec-board .rec-strategy")].find((node) => node.dataset.card === hot.id && (node.dataset.part || "") === hot.part);
  if (block) { block.classList.add("open"); block.scrollIntoView({ block: "start" }); }
  return true;
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

window.birdBrag = birdBrag; window.birdBragGo = birdBragGo; window.recBlurb = recBlurb;

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
  window.memberBorn = member.born || "";
  window.memberState = member.state || "";
  window.memberBook = member.book || "";
  window.fullAt = member.fullAt || "";
  if (window.applyMember) applyMember(window.memberState);
  window.memberReady = true;
  const call = document.getElementById("call-name");
  if (call && document.activeElement !== call) call.value = member.name || "";
  const spoken = document.getElementById("bird-line");
  const said = spoken ? spoken.textContent : "";
  const desk = document.getElementById("desk");
  if (desk && desk.classList.contains("bird-on") && ((said === "Squawk!!!" && Date.now() > (window.squawkUntil || 0)) || said.startsWith("Hey. What") || said.startsWith("What should I call you") || said.startsWith("When were you born") || said.startsWith("Which state") || said.startsWith("Which sportsbook"))) birdGreet();
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

const CARD_NAMES = window.CARD_NAMES = {
  band: "−150 to +100 window", safe2: "Safe 2-leg, both 75%+",
  todayBet: "Highest chance parlay today", mid3: "3 legs, −250 to −400",
  chalk: "−400 to −700 legs, near −180", win4: "4 legs, −150 to −300",
  four: "Four yardage legs near 85% each", plusLegs: "+100 to +200 legs",
  plus: "Four yardage legs near +250", mix21: "2 favorites and 1 underdog",
  hits: "Five near 90% vs four near 80%", low3: "Low-variance 3-leg",
  weekThree: "3 legs, different days, near −200", yards3: "3 yardage legs near 80% each",
  weekFive: "5 legs, different days, near −200", ou4: "2 overs and 2 unders",
  weekSafe: "3 legs, different days, near −350", alt3: "Alt lines, 3 legs, 85%+",
  weekEven: "3 legs, different days, near −100", games4: "4 legs, 4 different games", early3: "Early slate, 2 to 3 legs", prime3: "Prime time, 3 legs", weekend4: "Weekend special, 4 legs", td2: "2 NFL players, 1 anytime TD each", td3: "3 NFL players, 1 anytime TD each",
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
  const desk = document.getElementById("desk"); const full = document.getElementById("desk-full"); if (desk && full && desk.classList.contains("tv-full")) full.click();
  if (typeof showTab === "function") showTab("today");
  const home = document.getElementById("desk-home");
  if (home) home.click();
}

async function signOut() {
  await memberFetch("/api/logout", { method: "POST" });
  if (window.state && window.state.timer) clearTimeout(window.state.timer);
  location.replace("/");
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

document.getElementById("who").addEventListener("click", (event) => {
  if (event.target.closest("#member-profile")) { goFull(); showTab("profile"); }
});
function calledName() {
  return String(window.memberName || "").trim().split(/\s+/)[0];
}

function birdGreet() {
  if (!window.memberReady || document.body.classList.contains("needs-member") || !window.birdSay) return;
  const called = calledName();
  if (!called) return birdAskName();
  if (!window.memberBorn) return birdAskBorn(); if (!window.memberState) return birdAskState(); if (birdAskBook() || birdLaw()) return;
  window.asking = false;
  birdSay(`Hey, ${called}. What are you trying to do today?`, [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"]]);
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

function bornRange(input) {
  if (!input) return;
  const now = new Date(), stamp = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  input.max = stamp(new Date(now.getFullYear() - 21, now.getMonth(), now.getDate()));
  input.min = stamp(new Date(now.getFullYear() - 120, now.getMonth(), now.getDate()));
}
function birdAskBorn() {
  window.asking = true;
  birdSay("When were you born? You have to be 21 to use this desk.", []);
  const row = document.getElementById("bird-picks");
  if (!row) return;
  row.innerHTML = `<input id="bird-born" type="date" autocomplete="bday"><button type="button" id="bird-born-go">That's my birthday</button><p id="bird-born-error"></p>`;
  const field = row.querySelector("#bird-born");
  bornRange(field);
  field.addEventListener("keydown", (event) => { if (event.key === "Enter") saveBorn(field.value); });
  row.querySelector("#bird-born-go").addEventListener("click", () => saveBorn(field.value));
}
async function saveBorn(raw) {
  const born = String(raw || ""), error = document.getElementById("bird-born-error");
  if (!born) { if (error) error.textContent = "Enter your date of birth."; return; }
  const response = await memberFetch("/api/born", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ born }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { if (error) error.textContent = payload.error || "Enter your date of birth."; return; }
  window.memberBorn = (payload.member && payload.member.born) || "";
  if (((document.getElementById("bird-line") || {}).textContent || "").startsWith("When were you born")) birdGreet();
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

function hitsPart(ticket) {
  const mark = String(ticket.title || "").toLowerCase().split("·").pop();
  return mark.includes("five near 90") ? "five" : mark.includes("four near 80") ? "four" : ((ticket.legs || []).length >= 5 ? "five" : "four");
}

function recPct(rows, since) {
  const seen = new Map();
  rows.forEach((ticket) => {
    const when = Date.parse(ticket.settledAt || ticket.offeredAt || "");
    const key = (ticket.legs || []).map((leg) => leg.label).join("|");
    const prior = seen.get(key);
    if (key && Number.isFinite(when) && when >= since && (!prior || when >= prior.when)) seen.set(key, { when, won: ticket.result === "won" });
  });
  const list = [...seen.values()]; recPct.n = list.length;
  return list.length ? `${((list.filter((row) => row.won).length / list.length) * 100).toFixed(1)}%` : "—";
}

function weekPay(rows, since) {
  const seen = new Map();
  rows.forEach((ticket) => {
    const when = Date.parse(ticket.settledAt || ticket.offeredAt || "");
    const key = (ticket.legs || []).map((leg) => leg.label).join("|");
    const price = Number(ticket.american);
    const pay = price < 0 ? 500 / -price : price > 0 ? price / 20 : NaN;
    const prior = seen.get(key);
    if (key && Number.isFinite(when) && when >= since && Number.isFinite(pay) && (!prior || when >= prior.when)) seen.set(key, { when, pay });
  });
  const list = [...seen.values()].map((row) => row.pay).sort((a, b) => a - b);
  return list.length ? Math.round(list[list.length >> 1]) : 0;
}
window.recPct = recPct; window.weekPay = weekPay; window.hitsPart = hitsPart;
function recThing(head, market) {
  const text = String(head || ""), raw = String(market || "").split(/\s+-\s+/).pop().replace(/\s+\d+$/, "").trim(), first = text.split("\n")[0], who = first.replace(/\s+(yes|no)$/i, "");
  if (!raw) return text;
  const phrase = (raw.toLowerCase().startsWith(who.toLowerCase()) ? raw.slice(who.length).trim() : raw).replace(/^player\s+/i, "").replace(/^team\s+/i, "").replace(/(\d+)\s+or\s+more\b/i, "$1+").replace(/\s+/g, " ").trim().toLowerCase();
  const words = phrase.split(/[^a-z0-9+]+/).filter((word) => word.length > 2 && !/^(the|and|for|player|team|record|have|more|than|yes|no|alt|alternate|betting|combo)$/.test(word));
  const nums = phrase.match(/\d+(?:\.\d+)?\+?/g) || [], said = text.toLowerCase().replace(/\byards?\b/g, "yd").replace(/\byds\b/g, "yd").replace(/\bpoints?\b/g, "pt").replace(/\bpts\b/g, "pt").replace(/\brebounds?\b/g, "reb").replace(/\bassists?\b/g, "ast").replace(/\btouchdowns?\b/g, "td").replace(/\btds\b/g, "td");
  if (!phrase || !words.length || (words.every((word) => said.includes(word.replace(/yards?/g, "yd").replace(/yds/g, "yd").replace(/points?/g, "pt").replace(/pts/g, "pt").replace(/rebounds?/g, "reb").replace(/assists?/g, "ast").replace(/touchdowns?/g, "td").replace(/tds/g, "td"))) && nums.every((num) => text.includes(num)))) return text;
  const lowFirst = first.toLowerCase(), hole = nums.find((num) => !text.includes(num)), tail = (first.match(/\S+$/) || [""])[0].toLowerCase(), known = hole && words.every((word) => said.includes(word.replace(/yards?/g, "yd").replace(/yds/g, "yd").replace(/points?/g, "pt").replace(/pts/g, "pt").replace(/rebounds?/g, "reb").replace(/assists?/g, "ast"))) && words.some((word) => tail.startsWith(word.slice(0, 4)) || word.startsWith(tail.slice(0, 4))); let extra = phrase; if (!known) phrase.split(" ").forEach((word, i, all) => { const lead = all.slice(0, i + 1).join(" "); if (lowFirst.endsWith(lead)) extra = all.slice(i + 1).join(" "); });
  return text.replace(first, known ? `${first.replace(/\s+\S+$/, "")} ${hole} ${first.match(/\S+$/)[0]}`.replace(/\s+/g, " ").trim() : extra ? `${extra === phrase && /\s/.test(first) && phrase.split(/[^a-z0-9+]+/).includes(tail) ? first.replace(/\s+\S+$/, "") : first} ${extra}`.replace(/\s+/g, " ").trim() : first);
}
function recBlurb(ticket, shown, pct, price) { return shown && pct && window.recWin ? recWin(price) : ""; }

function recLine(leg) {
  const odds = Number(leg.odds), tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : "";
  const parts = String(leg.label || "").split(/\s+—\s+/), head = parts[0] || "";
  const where = parts.slice(1).join(" — ") || [leg.sport, leg.match, leg.kickoff && typeof when === "function" ? `${when(leg.kickoff)} ET` : ""].filter(Boolean).join(" · ") || "";
  const market = String(leg.market || "").split(/\s+-\s+/).pop().replace(/^Either Player\s*/i, "").replace(/\s+\d+$/, "").trim(), low = head.toLowerCase(), race = market.match(/^race to\s+(\d+(?:\.\d+)?)\s+(.+)$/i), bare = market.match(/^(\d+(?:\.\d+)?\+?)\s+([a-z].+)$/i), unit = (market.match(/\b(points|tries|goals)\b/i) || [])[1], filled = race && !/race to/.test(low) ? `${head.replace(/\s+(points|tries|goals)$/i, "")} race to ${race[1]} ${race[2].toLowerCase()}` : bare && !/\d/.test(head) ? `${head} ${bare[1]} ${bare[2].toLowerCase()}` : /winning margin/i.test(market) && !/win by|\bby\s+\d|margin/i.test(low) ? head.replace(/(\d+(?:\.\d+)?\+)$/, "to win by $1") : unit && !low.includes(unit.toLowerCase()) && /\d/.test(head) ? `${head} ${unit.toLowerCase()}` : recThing(head, market);
  const title = market && /\s+or\s+|\s+&\s+/i.test(filled) && !filled.toLowerCase().includes(market.toLowerCase()) ? `${filled} · ${market}` : filled, lines = title.split("\n"), say = lines.length < 2 && title.match(/^(.*?)\s+((?:to|race to)\s+.+)$/i), cut = lines.length < 2 && !say && title.match(/^(.*?)(?:\s*:\s*|\s+)((?:\d+(?:\.\d+)?\+|[+-]\d|over\b|under\b).+)$/i), year = lines.length < 2 && !say && !cut && title.match(/^(.*?)(,\s*.+)$/), pace = year && /per game|a game|no games/.test(year[2]), named = lines.length > 1 ? `<i>${esc(lines[0])}</i>${lines.slice(1).map((line) => `<em>${esc(line)}</em>`).join("")}` : say && say[1] ? `<i>${esc(say[1])}</i> ${esc(say[2])}` : cut && cut[1] ? `<i>${esc(cut[1])}</i> ${esc(cut[2])}` : pace ? `<i>${esc(year[1])}</i><em>${esc(year[2].replace(/^,\s*/, ""))}</em>` : year && year[1] ? `<i>${esc(year[1])}</i>${esc(year[2])}` : `<i>${esc(title)}</i>`;
  return `<span><b>${named}</b><i>${esc([tag, leg.pct, where].filter(Boolean).join(" · "))}</i></span>`;
}

function birdMenu(kind) {
  if (kind !== "bets") return;
  window.asking = true; if (window.goFull) goFull(); if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk"); if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; if (window.birdGreet) birdGreet(); return; }
  desk.classList.remove("bird-on", "solo", "dug"); window.recOpen = false; const guide = document.getElementById("bird-guide"); if (guide) guide.hidden = true;
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  document.querySelectorAll(".rec-board").forEach((node) => node.remove());
  const board = document.createElement("div"); board.className = "rec-board"; board.insertAdjacentHTML("afterbegin", `<h2>${window.recPast ? "Finished bets, by strategy." : "Recommended bets, by strategy."}</h2>`);
  const archive = ((window.state && window.state.board && window.state.board.archive) || []);
  const now = Date.now();
  const day = 86400000;
  const past = !!window.recPast;
  board.addEventListener("click", (event) => {
    const bet = event.target.closest(".rec-bet");
    if (bet) return;
    const strategy = event.target.closest(".rec-strategy");
    if (strategy) strategy.classList.toggle("open");
  });
  window.recTickets = [];
  const strategies = Object.entries(CARD_NAMES).flatMap(([id, name]) => (
    id === "hits" ? [["hits", "Five near 90% each", "five"], ["hits", "Four near 80% each", "four"]] : [[id, name, ""]]
  ));
  const filled = [];
  const empty = [];
  strategies.forEach(([id, name, part]) => {
    const block = document.createElement("section");
    block.className = "rec-strategy"; block.dataset.card = id; block.dataset.part = part;
    const heading = document.createElement("h3");
    heading.innerHTML = `${name} <span class="rec-count"></span>`;
    block.append(heading);
    const done = archive.filter((ticket) => ticket.card === id && (ticket.result === "won" || ticket.result === "lost") && (!part || hitsPart(ticket) === part));
    const history = document.createElement("p");
    history.className = "rec-history";
    const rates = [day, day * 7, day * 30, day * 365].map((span) => recPct(done, now - span));
    history.innerHTML = rates.map((text, index) => `<span data-rate="${index}">${text}</span>`).join("");
    block.dataset.rates = rates.map((text) => parseFloat(text)).join(",");
    block.append(history);
    const seen = new Set();
    const live = (ticket) => ![ticket.kickoff, ...(ticket.legs || []).map((leg) => leg.kickoff)].some((iso) => Number.isFinite(Date.parse(iso || "")) && Date.parse(iso || "") <= now);
    archive.filter((ticket) => ticket.card === id && (!part || hitsPart(ticket) === part) && ticket.legs && ticket.legs.length && !(window.blockCollege && blockCollege(ticket)) && (past ? (ticket.result === "won" || ticket.result === "lost") : ((!ticket.result || ticket.result === "open") && live(ticket))))
      .sort((a, b) => (past ? 0 : ((b.edge === true) - (a.edge === true) || (b.why ? 1 : 0) - (a.why ? 1 : 0))) || String((past ? b.settledAt : b.offeredAt) || "").localeCompare(String((past ? a.settledAt : a.offeredAt) || "")))
      .forEach((ticket) => {
        const key = `${past ? ticket.settledAt : ticket.american}|${ticket.result || ""}|${ticket.legs.map((leg) => leg.label).join("|")}`;
        if (seen.has(key)) return;
        seen.add(key);
        const bet = document.createElement("div");
        bet.className = ticket.edge ? "rec-bet rec-edge" : "rec-bet"; bet.dataset.key = key;
        if (ticket.result === "won" || ticket.result === "lost") bet.classList.add(ticket.result);
        bet.dataset.rec = String((window.recTickets = window.recTickets || []).push({ ticket, name }) - 1);
        const price = Number(ticket.american);
        const shown = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
        const pct = ticket.impliedPct != null && ticket.impliedPct !== "" ? `${ticket.impliedPct}%` : "";
        const mark = ticket.result === "won" ? "Won" : ticket.result === "lost" ? "Lost" : ticket.edge ? "Better" : "";
        const head = document.createElement("b");
        head.textContent = [shown, pct, mark, name].filter(Boolean).join(" · ");
        const gist = document.createElement("p");
        gist.className = "rec-gist";
        gist.innerHTML = ticket.why ? `<em>${esc(ticket.why)}</em>` : "";
        const copy = document.createElement("p");
        copy.className = "rec-copy";
        copy.innerHTML = recBlurb(ticket, shown, pct, price);
        bet.append(head); if (gist.innerHTML) bet.append(gist); bet.insertAdjacentHTML("beforeend", `${ticket.legs.map(recLine).join("")}<button type="button" class="worth-bet" aria-label="Worth the risk?">Worth the risk?</button><button type="button" class="share-bet" data-share="rec" data-share-id="${bet.dataset.rec}" aria-label="Share this bet"></button>`); if (copy.textContent) bet.append(copy); bet.insertAdjacentHTML("beforeend", `<button type="button" class="more-bet">More Info</button>`);
        block.append(bet);
      });
    heading.querySelector(".rec-count").textContent = seen.size;
    if (!block.querySelector(".rec-bet")) {
      const note = document.createElement("p");
      note.textContent = past ? "None finished yet." : "None you can place right now.";
      block.append(note);
      empty.push(block);
    } else filled.push(block);
  });
  filled.forEach((block) => board.append(block));
  empty.forEach((block) => board.append(block));
  if (window.paintRecFilters) paintRecFilters(board); const title = board.querySelector("h2"); if (title) board.prepend(title);
  const hold = document.getElementById("desk-hold"); if (hold) [...row.children].forEach((node) => hold.append(node)); row.append(board); if (window.recKeep) { const keep = window.recKeep; window.recKeep = null; board.querySelectorAll(".rec-strategy").forEach((node) => node.classList.toggle("open", keep.strategies.includes(`${node.dataset.card}|${node.dataset.part || ""}`))); board.querySelectorAll(".rec-bet").forEach((node) => node.classList.toggle("open", keep.bets.includes(node.dataset.key))); row.scrollTop = keep.scroll; } else row.scrollTop = 0;
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
window.birdGreet = birdGreet;
function noteTaste(kind, detail) {
  return memberFetch("/api/taste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot: kind, ...(detail || {}) }) }).catch(() => {});
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
    born: "member-born",
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
