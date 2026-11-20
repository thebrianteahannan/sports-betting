/** Fantasy Sports · Start/Sit from a Sleeper roster + our NFL prop desk. */

let fantasyState = { user: "", leagues: [], leagueId: "", result: null, openId: "" };

function fantasyEsc(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fantasyOdds(n) {
  const o = Number(n);
  if (!Number.isFinite(o) || !o) return "";
  return o > 0 ? `+${o}` : String(o);
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
  title.textContent = "Start / Sit";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "fantasy-back";
  back.textContent = "← Recommended";
  back.addEventListener("click", () => { if (typeof birdMenu === "function") birdMenu("rec"); });
  head.append(title, back);
  board.append(head);
}

function fantasyConnect(board) {
  const box = document.createElement("form");
  box.className = "fantasy-connect";
  box.innerHTML = `
    <p class="fantasy-lead">Paste your Sleeper username. We pull this week’s roster, score it with the prop desk, and fill your slots. Roster is not saved.</p>
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
    fantasyState = { user: fantasyState.user, leagues: [], leagueId: "", result: null, openId: "" };
    paintFantasy(board);
  });
  box.append(again);
  board.append(box);
}

async function fantasyRun(board, leagueId) {
  fantasyState.leagueId = leagueId;
  fantasyState.result = null;
  fantasyState.openId = "";
  paintFantasy(board, { loading: true });
  try {
    const data = await fantasyPost("/api/fantasy/start-sit", { user: fantasyState.user, leagueId });
    fantasyState.result = data;
    paintFantasy(board);
  } catch (error) {
    fantasyState.result = { error: String((error && error.message) || error) };
    paintFantasy(board);
  }
}

function fantasyRow(player, kind) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `fantasy-row ${kind}${fantasyState.openId === player.id ? " open" : ""}`;
  const slot = player.slot ? `<i class="slot">${fantasyEsc(player.slot)}</i>` : "";
  const prop = player.prop
    ? `<span class="prop">${fantasyEsc(player.prop.label)}${player.prop.odds != null ? ` · ${fantasyEsc(fantasyOdds(player.prop.odds))}` : ""}</span>`
    : `<span class="prop mute">No prop match</span>`;
  const injury = player.injury || (/out|ir/i.test(player.status || "") ? player.status : "");
  row.innerHTML = `
    ${slot}
    <span class="who"><b>${fantasyEsc(player.name)}</b><em>${fantasyEsc([player.pos || (player.fantasy || [])[0], player.team, injury].filter(Boolean).join(" · "))}</em></span>
    <span class="score">${fantasyEsc(player.empty ? "—" : player.score)}</span>
    ${prop}
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
  const whys = (player.why || []).map((line) => `<li>${fantasyEsc(line)}</li>`).join("") || "<li>No prop desk read yet.</li>";
  const props = (player.props || []).map((bet) => {
    const odds = fantasyOdds(bet.odds);
    return `<li><b>${fantasyEsc(odds)}</b> ${fantasyEsc(bet.label)}${bet.match ? ` <i>${fantasyEsc(bet.match)}</i>` : ""}</li>`;
  }).join("");
  box.innerHTML = `
    <p class="fantasy-proof-head">${fantasyEsc(player.name)} · score ${fantasyEsc(player.score)}</p>
    <ul class="fantasy-whys">${whys}</ul>
    ${props ? `<ul class="fantasy-props">${props}</ul>` : ""}
  `;
  return box;
}

function fantasyLineup(board, result) {
  const wrap = document.createElement("div");
  wrap.className = "fantasy-lineup";

  const meta = document.createElement("div");
  meta.className = "fantasy-meta";
  meta.innerHTML = `
    <p><b>${fantasyEsc((result.league && result.league.name) || "League")}</b>
      · ${fantasyEsc((result.owner && (result.owner.team_name || result.owner.display_name)) || fantasyState.user)}
      ${result.week != null ? ` · Week ${fantasyEsc(result.week)}` : ""}</p>
    <p class="quiet">${fantasyEsc(result.note || "Roster is not saved.")}</p>
  `;
  wrap.append(meta);

  const start = document.createElement("section");
  start.className = "fantasy-col start";
  start.innerHTML = "<h3>Start</h3>";
  (result.start || []).forEach((player) => {
    start.append(fantasyRow(player, "start"));
    if (fantasyState.openId && fantasyState.openId === player.id) start.append(fantasyProof(player));
  });
  wrap.append(start);

  const sit = document.createElement("section");
  sit.className = "fantasy-col sit";
  sit.innerHTML = "<h3>Sit</h3>";
  (result.sit || []).forEach((player) => {
    sit.append(fantasyRow(player, "sit"));
    if (fantasyState.openId && fantasyState.openId === player.id) sit.append(fantasyProof(player));
  });
  if (!(result.sit || []).length) {
    const none = document.createElement("p");
    none.className = "quiet";
    none.textContent = "Everyone who scored a slot is starting.";
    sit.append(none);
  }
  wrap.append(sit);

  const swap = document.createElement("button");
  swap.type = "button";
  swap.className = "fantasy-back";
  swap.textContent = "Pick another league";
  swap.addEventListener("click", () => {
    fantasyState.leagueId = "";
    fantasyState.result = null;
    fantasyState.openId = "";
    paintFantasy(board);
  });
  wrap.append(swap);
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
    load.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>Scoring the roster.</p>`;
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
