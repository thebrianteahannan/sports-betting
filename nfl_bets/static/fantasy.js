/** Fantasy Sports · Start/Sit from Sleeper + Vegas-implied fantasy points. */

let fantasyState = { user: "", leagues: [], leagueId: "", result: null, openId: "", showVegas: false, wantConnect: false, pulling: false, pullError: "", checks: null, checking: false, checkError: "", pickupSlot: "", matchups: null, matchAsked: false, matching: false, matchError: "" };

const FANTASY_MATCH_MAX = 4;
let fantasyMatchZoom = (() => {
  try {
    const n = Number(localStorage.getItem("fantasyMatchZoom"));
    if (Number.isFinite(n)) return Math.max(0, Math.min(FANTASY_MATCH_MAX, Math.round(n)));
  } catch (error) {}
  return 0;
})();
function fantasyVisit() {
  if (fantasyState.matching) return;
  fantasyState.matchups = null;
  fantasyState.matchAsked = false;
  fantasyState.matchError = "";
}
function fantasyMatchApply(next) {
  fantasyMatchZoom = Math.max(0, Math.min(FANTASY_MATCH_MAX, Math.round(Number(next) || 0)));
  document.querySelectorAll(".fantasy-board").forEach((board) => { board.dataset.matchZoom = String(fantasyMatchZoom); });
  try { localStorage.setItem("fantasyMatchZoom", String(fantasyMatchZoom)); } catch (error) {}
  if (fantasyMatchZoom > 0) fantasyAskMatchups();
}

const FANTASY_ZOOM_MAX = 2;
let fantasyZoom = (() => {
  try {
    const n = Number(localStorage.getItem("fantasyZoom"));
    if (Number.isFinite(n)) return Math.max(0, Math.min(FANTASY_ZOOM_MAX, Math.round(n)));
  } catch (error) {}
  return 0;
})();
function fantasyZoomApply(next) {
  fantasyZoom = Math.max(0, Math.min(FANTASY_ZOOM_MAX, Math.round(Number(next) || 0)));
  document.querySelectorAll(".fantasy-board").forEach((board) => { board.dataset.fantasyZoom = String(fantasyZoom); });
  try { localStorage.setItem("fantasyZoom", String(fantasyZoom)); } catch (error) {}
}

function fantasyZoomBar() {
  const bar = document.createElement("div");
  bar.className = "fantasy-zoom";
  const less = document.createElement("span");
  less.textContent = "Less";
  const more = document.createElement("span");
  more.textContent = "More";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = String(FANTASY_ZOOM_MAX);
  input.step = "1";
  input.value = String(fantasyZoom);
  input.setAttribute("aria-label", "Show more or less on each player");
  input.addEventListener("input", () => fantasyZoomApply(input.value));
  bar.append(less, input, more);
  if (typeof rowSlide === "function") rowSlide(input);
  return bar;
}

function fantasySavedUser() {
  return String(window.memberSleeper || fantasyState.user || "").trim().replace(/^@/, "");
}

async function fantasyRemember(user) {
  const name = String(user || "").trim().replace(/^@/, "");
  if (!name || !window.memberCard || document.body.classList.contains("needs-member")) return;
  if (String(window.memberSleeper || "") === name) return;
  try {
    const res = await fetch("/api/sleeper", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sleeper: name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    window.memberSleeper = (data.member && data.member.sleeper) || name;
    if (window.memberCard) window.memberCard.sleeper = window.memberSleeper;
  } catch (error) {}
}

function fantasyEsc(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fantasyOdds(n) {
  const o = Number(n);
  if (!Number.isFinite(o) || !o) return "";
  return o > 0 ? `+${o}` : String(o);
}

function fantasyPts(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

async function fantasyGet(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Could not load (${res.status})`);
  return data;
}

async function fantasyPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Could not load (${res.status})`);
  return data;
}

function fantasyBoard() {
  return document.querySelector('.rec-board[data-page="fantasy"]');
}

function fantasyHead(board) {
  const head = document.createElement("div");
  head.className = "fantasy-head";
  const title = document.createElement("h2");
  title.textContent = "Fantasy Start / Sit";
  head.append(title);
  if (fantasyState.result && !fantasyState.result.error) head.append(fantasyZoomBar());
  board.append(head);
}

async function fantasyPullLeagues(board, user) {
  const name = String(user || "").trim().replace(/^@/, "");
  if (!name) return;
  fantasyState.pulling = true;
  fantasyState.pullError = "";
  paintFantasy(board, { loading: true, loadSay: "Looking up Sleeper…" });
  try {
    const data = await fantasyGet(`/api/fantasy/sleeper?user=${encodeURIComponent(name)}`);
    fantasyState.user = (data.user && data.user.username) || name;
    fantasyState.leagues = data.leagues || [];
    fantasyState.leagueId = "";
    fantasyState.result = null;
    fantasyState.checks = null;
    fantasyState.checkError = "";
    fantasyState.wantConnect = false;
    await fantasyRemember(fantasyState.user);
    paintFantasy(board);
  } catch (error) {
    fantasyState.wantConnect = true;
    fantasyState.pullError = String((error && error.message) || error);
    paintFantasy(board);
  } finally {
    fantasyState.pulling = false;
  }
}

function fantasyConnect(board) {
  if (!fantasyState.user) fantasyState.user = fantasySavedUser();
  const signedIn = !!(window.memberCard && !document.body.classList.contains("needs-member"));
  const box = document.createElement("form");
  box.className = "fantasy-connect";
  box.innerHTML = `
    <p class="fantasy-lead">Paste your Sleeper username. We pull this week’s roster, project points with your league’s scoring from Vegas lines, and fill Start / Sit. Roster is not saved.${signedIn ? " We’ll remember the username on this membership." : ""}</p>
    <label class="fantasy-field">
      <span>Sleeper username</span>
      <input name="user" type="text" autocomplete="username" spellcheck="false" placeholder="yourname" value="${fantasyEsc(fantasyState.user)}">
    </label>
    <button type="submit" class="fantasy-go">Pull leagues</button>
    <p class="fantasy-note quiet">${fantasyEsc(fantasyState.pullError || "")}</p>
  `;
  box.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = box.querySelector('input[name="user"]');
    const note = box.querySelector(".fantasy-note");
    const go = box.querySelector(".fantasy-go");
    const user = String(input.value || "").trim().replace(/^@/, "");
    if (!user) { note.textContent = "Enter a Sleeper username."; return; }
    go.disabled = true;
    note.textContent = "Looking up Sleeper…";
    fantasyState.wantConnect = false;
    await fantasyPullLeagues(board, user);
  });
  board.append(box);
}

function fantasyMatchBar() {
  const bar = document.createElement("div");
  bar.className = "fantasy-zoom fantasy-match-zoom";
  const less = document.createElement("span");
  less.textContent = "Less";
  const more = document.createElement("span");
  more.textContent = "More";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = String(FANTASY_MATCH_MAX);
  range.step = "1";
  range.value = String(fantasyMatchZoom);
  range.setAttribute("aria-label", "Show matchup score, projection, win chance, record, and playoff chance");
  range.addEventListener("input", () => fantasyMatchApply(range.value));
  bar.append(less, range, more);
  if (typeof rowSlide === "function") rowSlide(range);
  return bar;
}

function fantasyMatchLine(id) {
  const row = fantasyState.matchups && fantasyState.matchups[id];
  if (fantasyState.matching && !row) return `<i class="league-match">Checking the score.</i>`;
  if (!row) return "";
  if (row.bye) return `<i class="league-match">No matchup this week.</i>`;
  if (row.error) return `<i class="league-match">Score did not load.</i>`;
  const pts = Number.isFinite(row.pts) ? row.pts.toFixed(1) : "—";
  const opp = Number.isFinite(row.oppPts) ? row.oppPts.toFixed(1) : "—";
  const proj = Number.isFinite(row.proj) ? row.proj.toFixed(1) : "—";
  const win = Number.isFinite(row.win) ? `${row.win}% to win` : "";
  const record = row.record ? `<em class="league-record">${fantasyEsc(row.record)}</em>` : "";
  const playoff = Number.isFinite(row.playoff) ? `<em class="league-playoff">${row.playoff}% playoffs</em>` : "";
  const season = record || playoff ? `<span class="league-season">${record}${playoff}</span>` : "";
  const who = row.bye ? "No matchup this week." : `vs ${row.opponent || "Opponent"}`;
  const score = row.bye ? "" : `<em class="league-pts">${pts}–${opp}</em><em class="league-proj">proj ${proj}</em><em class="league-win">${fantasyEsc(win)}</em>`;
  return `<i class="league-match"><em class="league-who">${fantasyEsc(who)}</em>${score}${season}</i>`;
}

async function fantasyAskMatchups() {
  if (fantasyState.matchAsked || fantasyState.matching || !fantasyState.user || !fantasyState.leagues.length) return;
  fantasyState.matchAsked = true;
  fantasyState.matching = true;
  const user = fantasyState.user;
  const board = fantasyBoard();
  try {
    const data = await fantasyPost("/api/fantasy/matchups", { user });
    if (fantasyState.user !== user) return;
    const map = {};
    (data.leagues || []).forEach((row) => { if (row && row.league_id) map[row.league_id] = row; });
    fantasyState.matchups = map;
    fantasyState.matchError = data.error || "";
  } catch (error) {
    if (fantasyState.user !== user) return;
    fantasyState.matchups = {};
    fantasyState.matchError = "Matchups did not load.";
  }
  if (fantasyState.user !== user) return;
  fantasyState.matching = false;
  const live = fantasyBoard();
  if (live && live.isConnected && !fantasyState.result) paintFantasy(live);
  else if (board && board.isConnected && !fantasyState.result) paintFantasy(board);
}

function fantasyLeaguePicker(board) {
  if (!fantasyState.leagues.length) {
    const none = document.createElement("p");
    none.className = "fantasy-empty";
    none.textContent = "No NFL leagues on that Sleeper account for this season.";
    board.append(none);
    return;
  }
  const box = document.createElement("div");
  box.className = "fantasy-leagues";
  const label = document.createElement("p");
  label.className = "fantasy-lead";
  label.textContent = `Leagues for ${fantasyState.user}. Pick one.`;
  box.append(label);
  const check = document.createElement("button");
  check.type = "button";
  check.className = "fantasy-go";
  check.textContent = fantasyState.checking ? "Checking your teams…" : (fantasyState.checks ? "Check again" : "Check my teams");
  check.disabled = !!fantasyState.checking;
  check.addEventListener("click", () => fantasyCheckAll(board));
  const actions = document.createElement("div");
  actions.className = "fantasy-actions";
  actions.append(check);
  const seek = typeof fantasySeekMount === "function" ? fantasySeekMount() : null;
  if (seek) actions.append(seek);
  box.append(actions);
  if (fantasyState.checkError) {
    const note = document.createElement("p");
    note.className = "fantasy-note";
    note.textContent = fantasyState.checkError;
    box.append(note);
  }
  if (fantasyState.checks) {
    const rows = fantasyState.leagues.map((league) => fantasyState.checks[league.league_id]).filter(Boolean);
    const need = rows.filter((row) => (row.tags || []).some((tag) => tag.id !== "miss")).length;
    const missed = rows.filter((row) => (row.tags || []).some((tag) => tag.id === "miss")).length;
    const say = document.createElement("p");
    say.className = "fantasy-lead";
    if (need) say.textContent = `${need} ${need === 1 ? "league needs" : "leagues need"} a move.`;
    else if (missed) say.textContent = "Could not check those leagues.";
    else say.textContent = "Every league is all set.";
    box.append(say);
  }
  box.append(fantasyMatchBar());
  fantasyAskMatchups();
  fantasyState.leagues.forEach((league) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const hit = fantasyState.checks && fantasyState.checks[league.league_id];
    const tags = hit && !hit.skip ? (hit.tags || []) : null;
    const needs = !!(tags && tags.length);
    btn.dataset.league = league.league_id;
    btn.className = `fantasy-league${fantasyState.leagueId === league.league_id ? " on" : ""}${needs ? " needs" : ""}${tags && !needs ? " ready" : ""}`;
    const tagHtml = tags
      ? (needs
        ? `<span class="league-tags">${tags.map((tag) => `<i class="league-tag ${fantasyEsc(tag.id)}">${fantasyEsc(tag.label)}</i>`).join("")}</span>`
        : `<span class="league-tags"><i class="league-tag ok">All set</i></span>`)
      : "";
    btn.innerHTML = `<b>${fantasyEsc(league.name)}</b>${fantasyMatchLine(league.league_id)}${tagHtml}`;
    btn.addEventListener("click", () => fantasyRun(board, league.league_id));
    box.append(btn);
  });
  const again = document.createElement("button");
  again.type = "button";
  again.className = "fantasy-back";
  again.textContent = "Different username";
  again.addEventListener("click", () => {
    fantasyState = {
      user: fantasyState.user,
      leagues: [],
      leagueId: "",
      result: null,
      openId: "",
      showVegas: false,
      wantConnect: true,
      pulling: false,
      pullError: "",
      checks: null,
      checking: false,
      checkError: "",
      pickupSlot: "",
      matchups: null,
      matchAsked: false,
      matching: false,
      matchError: "",
    };
    paintFantasy(board);
  });
  // Keep a change control on the league picker too.
  const change = document.createElement("p");
  change.className = "fantasy-lead";
  change.textContent = `Sleeper: ${fantasyState.user}`;
  box.prepend(change);
  box.append(again);
  board.append(box);
}

async function fantasyCheckAll(board) {
  if (fantasyState.checking || !fantasyState.user) return;
  const refresh = !!fantasyState.checks;
  fantasyState.checking = true;
  fantasyState.checkError = "";
  paintFantasy(board);
  try {
    const data = await fantasyPost("/api/fantasy/league-check", { user: fantasyState.user, refresh });
    const checks = {};
    (data.leagues || []).forEach((row) => { checks[row.league_id] = row; });
    fantasyState.checks = checks;
  } catch (error) {
    fantasyState.checkError = String((error && error.message) || error);
  } finally {
    fantasyState.checking = false;
    paintFantasy(board);
  }
}

function fantasyStamp(data) {
  const line = (rows) => (rows || []).map((player) => (player && player.id) || `empty:${player && player.slot}`).join(",");
  if (!data) return "";
  return [line(data.start), line(data.sit), line(data.out), line(data.taxi), line(data.ir)].join("#");
}

let fantasyWatchToken = 0;

function fantasyArmWatch() {
  const token = ++fantasyWatchToken;
  const leagueId = fantasyState.leagueId;
  setTimeout(() => fantasyQuietRefresh(token, leagueId), 15000);
}

async function fantasyQuietRefresh(token, leagueId) {
  if (token !== fantasyWatchToken) return;
  if (!fantasyState.result || fantasyState.result.error || fantasyState.leagueId !== leagueId) return;
  const board = fantasyBoard();
  if (!board) return;
  try {
    const data = await fantasyPost("/api/fantasy/start-sit", { user: fantasyState.user, leagueId, watch: true });
    if (token !== fantasyWatchToken || fantasyState.leagueId !== leagueId) return;
    if (fantasyStamp(data) !== fantasyStamp(fantasyState.result)) {
      fantasyState.result = data;
      paintFantasy(board);
      return;
    }
    fantasyState.result.received = data.received;
    const received = board.querySelector(".fantasy-received");
    if (received) received.textContent = fantasyReceived(data.received);
  } catch (error) {}
  if (token === fantasyWatchToken) fantasyArmWatch();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (!fantasyState.result || fantasyState.result.error || !fantasyState.leagueId) return;
  fantasyQuietRefresh(fantasyWatchToken, fantasyState.leagueId);
});

async function fantasyRun(board, leagueId, opts) {
  fantasyState.leagueId = leagueId;
  fantasyState.pickupSlot = "";
  fantasyState.result = null;
  fantasyState.openId = "";
  fantasyState.showVegas = false;
  paintFantasy(board, { loading: true });
  try {
    const body = { user: fantasyState.user, leagueId };
    if (opts && opts.refresh) body.refresh = true;
    const data = await fantasyPost("/api/fantasy/start-sit", body);
    fantasyState.result = data;
    paintFantasy(board);
  } catch (error) {
    fantasyState.result = { error: String((error && error.message) || error) };
    paintFantasy(board);
  }
}

function fantasyStatLine(player) {
  const rows = Array.isArray(player.stats) ? player.stats : [];
  if (!rows.length) return `<span class="stats mute">No Vegas stats yet</span>`;
  return `<span class="stats">${rows.map((row) => {
    const val = row.have && row.amount != null ? fantasyPts(row.amount) : "—";
    const juice = row.have && row.odds != null ? fantasyOdds(row.odds) : "";
    const lean = row.have && row.odds != null ? (Number(row.odds) < 0 ? "fav" : "dog") : "";
    return `<i><b>${fantasyEsc(row.short)}</b> ${fantasyEsc(val)}${juice ? `<em class="juice ${lean}">${fantasyEsc(juice)}</em>` : ""}</i>`;
  }).join("")}</span>`;
}

function fantasyScoreCell(player) {
  if (player.empty) return `<span class="score"><b>—</b></span>`;
  const live = player.livePts != null && Number.isFinite(Number(player.livePts));
  const primary = live ? fantasyPts(player.livePts) : fantasyPts(player.score);
  const primaryCls = live ? "live" : "vegas";
  const primaryTag = live ? "live" : "veg";
  const slp = player.sleeperPts != null && Number.isFinite(Number(player.sleeperPts)) ? fantasyPts(player.sleeperPts) : "—";
  return `<span class="score"><b class="${primaryCls}">${fantasyEsc(primary)}</b><i>${primaryTag}</i><b class="slp">${fantasyEsc(slp)}</b><i>slp</i></span>`;
}

function fantasyPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return `${Math.round(v)}%`;
}

function fantasyMatchBits(player) {
  const bits = [];
  if (player.team) bits.push(player.team);
  if (player.matchup && !player.bye) bits.push(player.matchup);
  else if (player.bye) bits.push("Bye");
  return bits;
}

function fantasyMetaBits(player) {
  const bits = [];
  if (player.locked || player.gameLocked) bits.push("Locked");
  if (player.ir) bits.push("IR");
  else if (player.out) bits.push(player.injury || "Out");
  else if (player.questionable || /^questionable$/i.test(player.injury || "")) bits.push("Questionable");
  else if (player.injury && !/active|normal/i.test(player.injury)) bits.push(player.injury);
  const own = fantasyPct(player.ownPct);
  const start = fantasyPct(player.startPct);
  if (own) bits.push(`${own} own`);
  if (start) bits.push(`${start} start`);
  return bits;
}

function fantasyRoleTag(kind, player) {
  if (kind === "out") return { cls: "out", label: "Out" };
  if (kind === "ir") return { cls: "ir", label: "IR" };
  // Only flag an action. Cards stay in the Sleeper column they already occupy.
  if (kind === "start" && player && player.shouldStart === false) return { cls: "sit", label: "Sit" };
  if (kind === "sit" && player && player.shouldStart === true) return { cls: "start", label: "Start" };
  return null;
}

function fantasyHole(player, pickups) {
  if (!player) return null;
  const slot = String(player.slot || "").toUpperCase();
  if (!slot) return null;
  const holes = (pickups || []).filter((row) => String(row.slot || "").toUpperCase() === slot);
  if (player.empty) return holes.find((row) => !row.holding) || null;
  return holes.find((row) => row.holding && row.holding === player.name) || null;
}

function fantasyFillKey(player, index) {
  return `${String((player && player.slot) || "").toUpperCase()}:${index}`;
}

function fantasyTogglePickup(key) {
  fantasyState.pickupSlot = fantasyState.pickupSlot === key ? "" : key;
  const board = fantasyBoard();
  if (board) paintFantasy(board);
}

function fantasyPickupList(hole) {
  const box = document.createElement("div");
  box.className = "fantasy-pickups fantasy-pickup-pop";
  const opts = (hole.options || []).map((row) =>
    `<li><b>${fantasyEsc(row.name)}</b> ${fantasyEsc(row.pos)}${row.team ? ` · ${fantasyEsc(row.team)}` : ""} <em>${fantasyEsc(fantasyPts(row.sleeperPts))} pts</em></li>`
  ).join("") || "<li class=\"quiet\">No free agents projecting into this slot right now.</li>";
  box.innerHTML = `<p>${fantasyEsc(hole.why)}</p><ul>${opts}</ul>`;
  return box;
}

function fantasySlotLabel(slot, kind) {
  const raw = String(slot || (kind === "ir" ? "IR" : kind === "taxi" ? "TAXI" : kind === "out" ? "OUT" : "BN")).toUpperCase();
  if (raw === "SUPER_FLEX") return "SUPER";
  return raw;
}

function fantasyTogglePlayer(id) {
  const next = String(id || "");
  fantasyState.openId = fantasyState.openId === next ? "" : next;
  fantasyState.showVegas = false;
  const board = fantasyBoard();
  if (board) paintFantasy(board);
}

function fantasyRow(player, kind, hole) {
  const row = document.createElement("button");
  row.type = "button";
  const locked = !!(player.locked || player.gameLocked);
  const q = !!(player.questionable || /^questionable$/i.test(player.injury || ""));
  const role = fantasyRoleTag(kind, player);
  const mismatch = !!(role && ((kind === "start" && role.cls === "sit") || (kind === "sit" && role.cls === "start")));
  row.className = `fantasy-row ${kind}${player.bye ? " bye" : ""}${locked ? " locked" : ""}${q ? " questionable" : ""}${mismatch ? " rec-swap" : ""}${hole ? " needs-fill" : ""}`;
  const slotLabel = fantasySlotLabel(player.slot, kind);
  const slot = `<i class="slot">${fantasyEsc(slotLabel)}</i>`;
  const match = fantasyMatchBits(player).join(" · ");
  const meta = fantasyMetaBits(player).join(" · ");
  const roleHtml = role ? ` <i class="role-tag ${role.cls}">${fantasyEsc(role.label)}</i>` : "";
  row.innerHTML = `
    ${slot}
    <span class="who">
      <b>${fantasyEsc(player.name || "—")}${roleHtml}</b>
      ${match ? `<em class="match">${fantasyEsc(match)}</em>` : ""}
      ${meta ? `<em class="meta">${fantasyEsc(meta)}</em>` : ""}
    </span>
    ${player.empty ? `<span class="stats mute">Empty</span>` : fantasyStatLine(player)}
    ${fantasyScoreCell(player)}
  `;
  if (hole) {
    row.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      fantasyTogglePickup(row.dataset.fill);
    });
  } else if (player.empty) {
    row.disabled = true;
  } else {
    row.addEventListener("click", () => {
      fantasyTogglePlayer(player.id);
    });
  }
  return row;
}

function fantasyProof(player) {
  const box = document.createElement("div");
  box.className = "fantasy-proof";
  const whys = (player.why || []).map((line) => `<li>${fantasyEsc(line)}</li>`).join("") || "<li>No Vegas lines matched this player yet.</li>";
  const props = (player.props || []).map((bet) => {
    const odds = fantasyOdds(bet.odds);
    return `<li><b>${fantasyEsc(odds)}</b> ${fantasyEsc(bet.label)}${bet.match ? ` <i>${fantasyEsc(bet.match)}</i>` : ""}</li>`;
  }).join("");
  box.innerHTML = `
    <p class="fantasy-proof-head">${fantasyEsc(player.name)} · ${fantasyEsc(fantasyPts(player.score))} projected pts</p>
    <p class="fantasy-proof-method">${fantasyEsc(player.method || "Vegas lines through your league scoring.")}</p>
    <ul class="fantasy-whys">${whys}</ul>
    <button type="button" class="fantasy-vegas-toggle">${fantasyState.showVegas ? "Hide Vegas lines" : "Show Vegas lines"}</button>
    ${fantasyState.showVegas && props ? `<ul class="fantasy-props">${props}</ul>` : ""}
    ${fantasyState.showVegas && !props ? `<p class="quiet">No FanDuel props on the board for him this week.</p>` : ""}
  `;
  const toggle = box.querySelector(".fantasy-vegas-toggle");
  if (toggle) {
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      fantasyState.showVegas = !fantasyState.showVegas;
      const board = fantasyBoard();
      if (board) paintFantasy(board);
    });
  }
  return box;
}

function fantasyReceived(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Sleeper sent this roster at ${time}.`;
}

function fantasyLineup(board, result) {
  const wrap = document.createElement("div");
  wrap.className = "fantasy-lineup";

  const meta = document.createElement("div");
  meta.className = "fantasy-meta";
  meta.innerHTML = `
    <div class="fantasy-meta-top">
      <p class="fantasy-league-name">${fantasyEsc((result.league && result.league.name) || "League")}</p>
      <span class="fantasy-meta-acts">
        <button type="button" class="fantasy-back fantasy-reload">Reload</button>
        <button type="button" class="fantasy-back fantasy-league-switch">Pick a different league</button>
      </span>
    </div>
    <p class="fantasy-roster-who">${fantasyEsc((result.owner && (result.owner.team_name || result.owner.display_name)) || fantasyState.user)}${result.week != null ? ` · Wk ${fantasyEsc(result.week)}` : ""}</p>
    <p class="fantasy-method">${fantasyEsc(result.method || "Projected fantasy points from Vegas lines using your Sleeper scoring.")}</p>
    ${result.received ? `<p class="fantasy-received">${fantasyEsc(fantasyReceived(result.received))}</p>` : ""}
  `;
  const switchLeague = meta.querySelector(".fantasy-league-switch");
  if (switchLeague) {
    switchLeague.addEventListener("click", () => {
      fantasyState.leagueId = "";
      fantasyState.result = null;
      fantasyState.openId = "";
      fantasyState.pickupSlot = "";
      fantasyState.showVegas = false;
      paintFantasy(board);
    });
  }
  const reload = meta.querySelector(".fantasy-reload");
  if (reload) {
    reload.addEventListener("click", () => {
      if (!fantasyState.leagueId) return;
      fantasyRun(board, fantasyState.leagueId, { refresh: true });
    });
  }
  wrap.append(meta);

  if ((result.swaps || []).length) {
    const swaps = document.createElement("div");
    swaps.className = "fantasy-swaps";
    swaps.innerHTML = `<h3>Swaps</h3>${result.swaps.map((row) => `<p><b>Start ${fantasyEsc(row.in.name)}</b> over ${fantasyEsc(row.out.name)} <em>+${fantasyEsc(fantasyPts(row.gain))} pts</em></p>`).join("")}`;
    wrap.append(swaps);
  }

  const addPlayer = (col, player, kind) => {
    const index = kind === "start" ? (result.start || []).indexOf(player) : -1;
    const hole = kind === "start" ? fantasyHole(player, result.pickups) : null;
    const key = hole ? fantasyFillKey(player, index) : "";
    const row = fantasyRow(player, kind, hole);
    if (key) row.dataset.fill = key;
    if (player.id && String(fantasyState.openId) === String(player.id)) row.classList.add("open");
    col.append(row);
    if (key && fantasyState.pickupSlot === key) col.append(fantasyPickupList(hole));
    if (!player.empty && player.id) {
      const proof = fantasyProof(player);
      if (String(fantasyState.openId) === String(player.id)) proof.classList.add("open");
      col.append(proof);
    }
  };

  // Less: starters in roster order, then bench, out, taxi, and IR. One player a line.
  const spots = document.createElement("div");
  spots.className = "fantasy-spots";
  const list = document.createElement("div");
  list.className = "fantasy-pos-cards";
  const breakBefore = (label) => {
    const rule = document.createElement("div");
    rule.className = "fantasy-break";
    rule.textContent = label;
    list.append(rule);
  };
  (result.start || []).forEach((player) => addPlayer(list, player, "start"));
  if ((result.sit || []).length) breakBefore("Bench");
  (result.sit || []).forEach((player) => addPlayer(list, player, "sit"));
  if ((result.out || []).length) breakBefore("Out");
  (result.out || []).forEach((player) => addPlayer(list, player, "out"));
  if ((result.taxi || []).length) breakBefore("Taxi");
  (result.taxi || []).forEach((player) => addPlayer(list, player, "taxi"));
  if ((result.ir || []).length) breakBefore("IR");
  (result.ir || []).forEach((player) => addPlayer(list, player, "ir"));
  spots.append(list);
  wrap.append(spots);

  const split = document.createElement("div");
  split.className = "fantasy-split";

  const start = document.createElement("section");
  start.className = "fantasy-col start";
  start.innerHTML = "<h3>Your lineup</h3>";
  (result.start || []).forEach((player) => addPlayer(start, player, "start"));
  split.append(start);

  const sit = document.createElement("section");
  sit.className = "fantasy-col sit";
  sit.innerHTML = "<h3>Your bench</h3>";
  (result.sit || []).forEach((player) => addPlayer(sit, player, "sit"));
  if (!(result.sit || []).length) {
    const none = document.createElement("p");
    none.className = "quiet";
    none.textContent = "Everyone who projects into a slot is starting.";
    sit.append(none);
  }
  split.append(sit);

  if ((result.out || []).length) {
    const out = document.createElement("section");
    out.className = "fantasy-col out";
    out.innerHTML = "<h3>Out</h3>";
    result.out.forEach((player) => addPlayer(out, player, "out"));
    split.append(out);
  }

  if ((result.taxi || []).length) {
    const taxi = document.createElement("section");
    taxi.className = "fantasy-col taxi";
    taxi.innerHTML = "<h3>Taxi</h3>";
    result.taxi.forEach((player) => addPlayer(taxi, player, "taxi"));
    split.append(taxi);
  }

  if ((result.ir || []).length) {
    const ir = document.createElement("section");
    ir.className = "fantasy-col ir";
    ir.innerHTML = "<h3>IR</h3>";
    result.ir.forEach((player) => addPlayer(ir, player, "ir"));
    split.append(ir);
  }

  wrap.append(split);
  board.append(wrap);
}

function paintFantasy(keep, opts) {
  if (!keep) fantasyVisit();
  window.asking = true;
  if (document.body.classList.contains("tv-zoom-on") && typeof tvZoomShut === "function") tvZoomShut();
  const desk = document.getElementById("desk");
  const guest = document.body.classList.contains("needs-member");
  if (guest) { if (desk && !desk.classList.contains("tv-full") && window.toggleTv) toggleTv(); }
  else if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  if (!desk || !desk.classList.contains("tv-full")) { if (!guest && window.goFull) goFull(); }
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; return; }
  if (location.pathname !== "/fantasy") history.pushState({ page: "fantasy" }, "", "/fantasy");
  desk.classList.remove("bird-on", "solo", "dug");
  if (window.tvForce) tvForce();
  if (window.tvPush) tvPush();
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  if (window.tvTickStay) tvTickStay();
  else {
    const tick = document.getElementById("tv-tick");
    if (tick) tick.hidden = true;
  }
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  let board = keep && keep.isConnected && keep.dataset && keep.dataset.page === "fantasy" ? keep : null;
  if (!board) {
    document.querySelectorAll(".rec-board").forEach((node) => node.remove());
    board = document.createElement("div");
    board.className = "rec-board find-board fantasy-board";
    board.dataset.page = "fantasy";
    const hold = document.getElementById("desk-hold");
    if (hold) [...row.children].forEach((node) => hold.append(node));
    row.append(board);
    row.scrollTop = 0;
  }

  board.replaceChildren();
  board.dataset.fantasyZoom = String(fantasyZoom);
  board.dataset.matchZoom = String(fantasyMatchZoom);
  fantasyHead(board);

  if (opts && opts.loading) {
    const load = document.createElement("div");
    load.className = "bet-load";
    load.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>${fantasyEsc((opts && opts.loadSay) || "Projecting the roster.")}</p>`;
    board.append(load);
    return;
  }

  if (fantasyState.result && fantasyState.result.error) {
    const err = document.createElement("p");
    err.className = "fantasy-empty";
    err.textContent = fantasyState.result.error;
    board.append(err);
    fantasyLeaguePicker(board);
    return;
  }

  if (fantasyState.result) {
    fantasyLineup(board, fantasyState.result);
    fantasyArmWatch();
    return;
  }

  if (fantasyState.leagues.length) {
    fantasyLeaguePicker(board);
    if (!fantasyState.checks && !fantasyState.checking) fantasyCheckAll(board);
    return;
  }

  const saved = fantasySavedUser();
  if (saved && !fantasyState.wantConnect) {
    fantasyState.user = fantasyState.user || saved;
    if (!fantasyState.pulling) fantasyPullLeagues(board, saved);
    else {
      const load = document.createElement("div");
      load.className = "bet-load";
      load.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>Looking up Sleeper…</p>`;
      board.append(load);
    }
    return;
  }

  fantasyConnect(board);
}

function fantasyBack() {
  const board = fantasyBoard();
  if (!board || !board.isConnected) return false;
  // From a loaded lineup, go back to league pick — do not leave Fantasy.
  if (fantasyState.result || fantasyState.leagueId) {
    fantasyState.leagueId = "";
    fantasyState.result = null;
    fantasyState.openId = "";
    fantasyState.pickupSlot = "";
    fantasyState.showVegas = false;
    paintFantasy(board);
    return true;
  }
  return false;
}

window.paintFantasy = paintFantasy;
window.fantasyBack = fantasyBack;
window.fantasyGo = function fantasyGo() { paintFantasy(); return true; };

function fantasyFromUrl() {
  if (location.pathname !== "/fantasy") return;
  const open = (n) => {
    if (document.body.classList.contains("needs-member") || !document.getElementById("desk")) {
      if (n < 40) setTimeout(() => open(n + 1), 200);
      return;
    }
    paintFantasy();
  };
  setTimeout(() => open(0), 200);
}
fantasyFromUrl();

window.addEventListener("popstate", () => {
  const open = document.querySelector('.rec-board[data-page="fantasy"]');
  if (location.pathname === "/fantasy") { if (!open) paintFantasy(); return; }
  if (!open) return;
  fantasyState.result = null;
  fantasyState.leagueId = "";
  const back = document.getElementById("desk-back");
  if (back) back.click();
});

function fantasyLeave() {
  if (location.pathname === "/fantasy") history.replaceState({ page: "home" }, "", "/");
  if (!document.body.classList.contains("needs-member")) return;
  if (window.memberCard) {
    if (window.showGateMode) showGateMode(window.memberCard.mustChangePass ? "pass" : "trial");
    if (window.deskGate) window.deskGate();
    return;
  }
  if (window.showGate) showGate();
}

const fantasyHome = document.getElementById("desk-home");
if (fantasyHome) fantasyHome.addEventListener("click", fantasyLeave);
