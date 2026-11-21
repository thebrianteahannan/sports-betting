/** Fantasy Sports · Start/Sit from Sleeper + Vegas-implied fantasy points. */

let fantasyState = { user: "", leagues: [], leagueId: "", result: null, openId: "", showVegas: false, wantConnect: false, pulling: false, pullError: "" };

const FANTASY_ZOOM_MAX = 2;
let fantasyZoom = (() => {
  try {
    const n = Number(localStorage.getItem("fantasyZoom"));
    if (Number.isFinite(n)) return Math.max(0, Math.min(FANTASY_ZOOM_MAX, Math.round(n)));
  } catch (error) {}
  return 1;
})();
let fantasyZoomDrag = false;

function fantasyZoomApply(next, opts) {
  const quiet = !!(opts && opts.quiet);
  fantasyZoom = Math.max(0, Math.min(FANTASY_ZOOM_MAX, Math.round(Number(next) || 0)));
  document.querySelectorAll(".fantasy-board").forEach((board) => { board.dataset.fantasyZoom = String(fantasyZoom); });
  if (!quiet && !fantasyZoomDrag) {
    document.querySelectorAll("input.fantasy-zoom-range").forEach((box) => {
      box.value = String(fantasyZoom);
      box.setAttribute("aria-valuenow", String(fantasyZoom));
    });
  }
  try { localStorage.setItem("fantasyZoom", String(fantasyZoom)); } catch (error) {}
}

function fantasyZoomBar() {
  const bar = document.createElement("label");
  bar.className = "fantasy-zoom";
  const less = document.createElement("span");
  less.textContent = "Less";
  const more = document.createElement("span");
  more.textContent = "More";
  const input = document.createElement("input");
  input.type = "range";
  input.className = "fantasy-zoom-range";
  input.min = "0";
  input.max = String(FANTASY_ZOOM_MAX);
  input.step = "any";
  input.value = String(fantasyZoom);
  input.setAttribute("aria-valuemin", "0");
  input.setAttribute("aria-valuemax", String(FANTASY_ZOOM_MAX));
  input.setAttribute("aria-valuenow", String(fantasyZoom));
  input.setAttribute("aria-label", "Show more or less on each player");
  const end = () => {
    fantasyZoomDrag = false;
    const snapped = Math.max(0, Math.min(FANTASY_ZOOM_MAX, Math.round(Number(input.value) || 0)));
    input.value = String(snapped);
    const prev = fantasyZoom;
    fantasyZoomApply(snapped);
    if (snapped !== prev) {
      const board = fantasyBoard();
      if (board) paintFantasy(board);
    }
  };
  input.addEventListener("pointerdown", (event) => {
    fantasyZoomDrag = true;
    try { input.setPointerCapture(event.pointerId); } catch (error) {}
  });
  input.addEventListener("pointerup", end);
  input.addEventListener("pointercancel", end);
  input.addEventListener("lostpointercapture", end);
  input.addEventListener("input", () => {
    fantasyZoomDrag = true;
    const level = Math.max(0, Math.min(FANTASY_ZOOM_MAX, Math.round(Number(input.value) || 0)));
    input.setAttribute("aria-valuenow", String(level));
    fantasyZoomApply(level, { quiet: true });
  });
  input.addEventListener("change", end);
  bar.append(less, input, more);
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
  fantasyState.leagues.forEach((league) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `fantasy-league${fantasyState.leagueId === league.league_id ? " on" : ""}`;
    btn.innerHTML = `<b>${fantasyEsc(league.name)}</b><span>${fantasyEsc(league.status || "in season")}</span>`;
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

async function fantasyRun(board, leagueId, opts) {
  fantasyState.leagueId = leagueId;
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

function fantasyRow(player, kind) {
  const row = document.createElement("button");
  row.type = "button";
  const locked = !!(player.locked || player.gameLocked);
  const q = !!(player.questionable || /^questionable$/i.test(player.injury || ""));
  const role = fantasyRoleTag(kind, player);
  const mismatch = !!(role && ((kind === "start" && role.cls === "sit") || (kind === "sit" && role.cls === "start")));
  row.className = `fantasy-row ${kind}${player.bye ? " bye" : ""}${locked ? " locked" : ""}${q ? " questionable" : ""}${mismatch ? " rec-swap" : ""}`;
  const slotLabel = player.slot || (kind === "ir" ? "IR" : kind === "out" ? "OUT" : "BN");
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
  if (player.empty) {
    row.disabled = true;
  } else if (fantasyZoom < 2) {
    row.addEventListener("click", () => {
      fantasyZoomApply(2);
      const board = fantasyBoard();
      if (board) paintFantasy(board);
    });
  } else {
    row.style.cursor = "default";
  }
  return row;
}

function fantasyShowProof(player) {
  return !!(player && !player.empty && player.id && fantasyZoom >= 2);
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

function fantasyLineup(board, result) {
  const wrap = document.createElement("div");
  wrap.className = "fantasy-lineup";

  const meta = document.createElement("div");
  meta.className = "fantasy-meta";
  meta.innerHTML = `
    <div class="fantasy-meta-top">
      <p><b>${fantasyEsc((result.league && result.league.name) || "League")}</b>
        · ${fantasyEsc((result.owner && (result.owner.team_name || result.owner.display_name)) || fantasyState.user)}
        ${result.week != null ? ` · Wk ${fantasyEsc(result.week)}` : ""}</p>
      <span class="fantasy-meta-acts">
        <button type="button" class="fantasy-back fantasy-reload">Reload</button>
        <button type="button" class="fantasy-back fantasy-league-switch">Pick a different league</button>
      </span>
    </div>
    <p class="fantasy-method">${fantasyEsc(result.method || "Projected fantasy points from Vegas lines using your Sleeper scoring.")}</p>
  `;
  const switchLeague = meta.querySelector(".fantasy-league-switch");
  if (switchLeague) {
    switchLeague.addEventListener("click", () => {
      fantasyState.leagueId = "";
      fantasyState.result = null;
      fantasyState.openId = "";
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

  if ((result.pickups || []).length) {
    const pickups = document.createElement("div");
    pickups.className = "fantasy-pickups";
    pickups.innerHTML = `<h3>Pickups</h3>${result.pickups.map((hole) => {
      const opts = (hole.options || []).map((row) =>
        `<li><b>${fantasyEsc(row.name)}</b> ${fantasyEsc(row.pos)}${row.team ? ` · ${fantasyEsc(row.team)}` : ""} <em>${fantasyEsc(fantasyPts(row.sleeperPts))} pts</em></li>`
      ).join("") || "<li class=\"quiet\">No free agents projecting into this slot right now.</li>";
      return `<div class="fantasy-pickup"><p>${fantasyEsc(hole.why)}</p><ul>${opts}</ul></div>`;
    }).join("")}`;
    wrap.append(pickups);
  }

  const start = document.createElement("section");
  start.className = "fantasy-col start";
  start.innerHTML = "<h3>Your lineup</h3>";
  (result.start || []).forEach((player) => {
    start.append(fantasyRow(player, "start"));
    if (fantasyShowProof(player)) start.append(fantasyProof(player));
  });
  wrap.append(start);

  const sit = document.createElement("section");
  sit.className = "fantasy-col sit";
  sit.innerHTML = "<h3>Your bench</h3>";
  (result.sit || []).forEach((player) => {
    sit.append(fantasyRow(player, "sit"));
    if (fantasyShowProof(player)) sit.append(fantasyProof(player));
  });
  if (!(result.sit || []).length) {
    const none = document.createElement("p");
    none.className = "quiet";
    none.textContent = "Everyone who projects into a slot is starting.";
    sit.append(none);
  }
  wrap.append(sit);

  if ((result.out || []).length) {
    const out = document.createElement("section");
    out.className = "fantasy-col out";
    out.innerHTML = "<h3>Out</h3>";
    result.out.forEach((player) => {
      out.append(fantasyRow(player, "out"));
      if (fantasyShowProof(player)) out.append(fantasyProof(player));
    });
    wrap.append(out);
  }

  if ((result.ir || []).length) {
    const ir = document.createElement("section");
    ir.className = "fantasy-col ir";
    ir.innerHTML = "<h3>IR</h3>";
    result.ir.forEach((player) => {
      ir.append(fantasyRow(player, "ir"));
      if (fantasyShowProof(player)) ir.append(fantasyProof(player));
    });
    wrap.append(ir);
  }

  board.append(wrap);
}

function paintFantasy(keep, opts) {
  window.asking = true;
  if (document.body.classList.contains("tv-zoom-on") && typeof tvZoomShut === "function") tvZoomShut();
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { if (window.goFull) goFull(); }
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; return; }
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
    return;
  }

  if (fantasyState.leagues.length) {
    fantasyLeaguePicker(board);
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
    fantasyState.showVegas = false;
    paintFantasy(board);
    return true;
  }
  return false;
}

window.paintFantasy = paintFantasy;
window.fantasyBack = fantasyBack;
