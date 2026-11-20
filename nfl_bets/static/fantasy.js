/** Fantasy Sports · Start/Sit from Sleeper + Vegas-implied fantasy points. */

let fantasyState = { user: "", leagues: [], leagueId: "", result: null, openId: "", showVegas: false };

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
  board.append(head);
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
    <p class="fantasy-note quiet"></p>
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
    try {
      const data = await fantasyGet(`/api/fantasy/sleeper?user=${encodeURIComponent(user)}`);
      fantasyState.user = data.user && data.user.username || user;
      fantasyState.leagues = data.leagues || [];
      fantasyState.leagueId = "";
      fantasyState.result = null;
      await fantasyRemember(fantasyState.user);
      paintFantasy(board);
    } catch (error) {
      note.textContent = String((error && error.message) || error);
      go.disabled = false;
    }
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
    fantasyState = { user: fantasyState.user, leagues: [], leagueId: "", result: null, openId: "", showVegas: false };
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

function fantasyFlags(player) {
  const bits = [];
  if (player.matchup && !player.bye) bits.push(player.matchup);
  else if (player.bye) bits.push("Bye");
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
  // Tag = recommendation. Columns = what's currently set on Sleeper.
  if (player && player.shouldStart === true) return { cls: "start", label: "Start" };
  if (player && player.shouldStart === false) return { cls: "sit", label: "Sit" };
  if (kind === "start") return { cls: "start", label: "Start" };
  return { cls: "sit", label: "Sit" };
}

function fantasyRow(player, kind) {
  const row = document.createElement("button");
  row.type = "button";
  const locked = !!(player.locked || player.gameLocked);
  const q = !!(player.questionable || /^questionable$/i.test(player.injury || ""));
  const role = fantasyRoleTag(kind, player);
  const mismatch = (kind === "start" && role.cls === "sit") || (kind === "sit" && role.cls === "start");
  row.className = `fantasy-row ${kind}${fantasyState.openId === player.id ? " open" : ""}${player.bye ? " bye" : ""}${locked ? " locked" : ""}${q ? " questionable" : ""}${mismatch ? " rec-swap" : ""}`;
  const slotLabel = player.slot || (kind === "ir" ? "IR" : kind === "out" ? "OUT" : "BN");
  const slot = `<i class="slot">${fantasyEsc(slotLabel)}</i>`;
  const tag = [player.team, ...fantasyFlags(player)].filter(Boolean).join(" · ");
  row.innerHTML = `
    ${slot}
    <span class="who"><b>${fantasyEsc(player.name || "—")} <i class="role-tag ${role.cls}">${fantasyEsc(role.label)}</i></b>${tag ? `<em>${fantasyEsc(tag)}</em>` : ""}</span>
    ${player.empty ? `<span class="stats mute">Empty</span>` : fantasyStatLine(player)}
    ${fantasyScoreCell(player)}
  `;
  if (!player.empty) {
    row.addEventListener("click", () => {
      fantasyState.openId = fantasyState.openId === player.id ? "" : player.id;
      const board = fantasyBoard();
      if (board) paintFantasy(board);
    });
  } else {
    row.disabled = true;
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

  const start = document.createElement("section");
  start.className = "fantasy-col start";
  start.innerHTML = "<h3>Your lineup</h3>";
  (result.start || []).forEach((player) => {
    start.append(fantasyRow(player, "start"));
    if (fantasyState.openId && fantasyState.openId === player.id) start.append(fantasyProof(player));
  });
  wrap.append(start);

  const sit = document.createElement("section");
  sit.className = "fantasy-col sit";
  sit.innerHTML = "<h3>Your bench</h3>";
  (result.sit || []).forEach((player) => {
    sit.append(fantasyRow(player, "sit"));
    if (fantasyState.openId && fantasyState.openId === player.id) sit.append(fantasyProof(player));
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
      if (fantasyState.openId && fantasyState.openId === player.id) out.append(fantasyProof(player));
    });
    wrap.append(out);
  }

  if ((result.ir || []).length) {
    const ir = document.createElement("section");
    ir.className = "fantasy-col ir";
    ir.innerHTML = "<h3>IR</h3>";
    result.ir.forEach((player) => {
      ir.append(fantasyRow(player, "ir"));
      if (fantasyState.openId && fantasyState.openId === player.id) ir.append(fantasyProof(player));
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
  fantasyHead(board);

  if (opts && opts.loading) {
    const load = document.createElement("div");
    load.className = "bet-load";
    load.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>Projecting the roster.</p>`;
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

  fantasyConnect(board);
}

window.paintFantasy = paintFantasy;
