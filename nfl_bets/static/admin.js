function planName(plan) {
  if (!plan || plan === "free") return "Free";
  return plan;
}

function loginWhen(stamp) {
  if (!stamp) return "Not yet";
  return typeof when === "function" ? `${when(stamp)} ET` : stamp;
}

function showAdminTab(name) {
  ["members", "rates", "habits", "ignore", "strategy", "reads", "built", "asks", "notes", "laws", "errors"].forEach((id) => {
    const pane = document.getElementById(`admin-${id}`);
    if (pane) pane.hidden = id !== name;
    const button = document.querySelector(`[data-admin-tab="${id}"]`);
    if (button) button.classList.toggle("on", id === name);
  });
}

function paintRefresh() {
  const note = document.getElementById("admin-refresh");
  if (!note) return;
  const board = window.state && window.state.board;
  const seconds = Number(board && board.intervalSeconds) || 600;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const every = minutes === 1 ? "every minute" : `every ${minutes} minutes`;
  const stamp = board && board.updatedAt;
  const pulled = stamp && typeof when === "function" ? ` Last check ${when(stamp)} ET.` : "";
  note.textContent = `FanDuel is checked ${every}.${pulled}`;
  paintBoardErrors((board && board.errors) || []);
}

function paintBoardErrors(errors) {
  const list = document.getElementById("admin-errors");
  const button = document.querySelector('[data-admin-tab="errors"]');
  const rows = (errors || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (button) button.textContent = rows.length ? `Errors (${rows.length})` : "Errors";
  if (!list) return;
  list.innerHTML = rows.length ? rows.map((item) => adminCard(esc(item), "", [])).join("") : "<p>No errors from the last check.</p>";
}

function adminCard(head, gist, lines, extra) {
  const more = (lines || []).map((line) => `<span>${esc(line)}</span>`).join("");
  return `<div class="rec-bet"><b>${head}</b>${gist ? `<p class="rec-gist">${gist}</p>` : ""}${more}${extra || ""}</div>`;
}

function legGistLine(line) {
  return window.legGist ? legGist({ label: line }) : "";
}

function builtSay(row) {
  const when = row.when === "week" ? "This week" : "Today";
  const sports = (row.sports || []).length ? row.sports.join(", ") : "all leagues";
  const kind = { any: "any player prop", yards: "yards", points: "points", assists: "assists", shots: "shots", strikeouts: "strikeouts", hits: "hits" }[row.kind] || "any player prop";
  const aim = { top: "the safest price", safe: "a safe price", good: "a price near −100", payout: "the longest price" }[row.aim] || "the safest price";
  return `${when}, ${sports}, ${kind}, ${row.legs || 3} legs, ${aim}.`;
}

function paintBuilt(payload) {
  const list = document.getElementById("admin-built");
  if (!list) return;
  const rows = (payload && payload.built) || [];
  window.builtTypes = rows;
  if (!rows.length) {
    list.innerHTML = "<p>No one has finished a build yet.</p>";
    return;
  }
  list.innerHTML = `<p class="quiet">These are the bets people finished building.</p>${rows.map((row, index) => {
    const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
    const who = (row.names || []).join(", ") || "Member";
    const times = `${row.count} ${row.count === 1 ? "person has" : "people have"} built this.`;
    const gist = (row.lines || []).map(legGistLine).filter(Boolean).join(", ");
    const said = `${esc(builtSay(row))} ${esc(times)}${gist ? ` ${gist}` : ""}<em>${esc([who, clock].filter(Boolean).join(" · "))}</em>`;
    const share = (row.lines || []).length ? `<button type="button" class="share-bet" data-share="saved" data-share-id="${index}" aria-label="Share this bet"></button>` : "";
    return adminCard(esc(row.title || who), said, row.lines || [], share);
  }).join("")}`;
}

function paintStrategies() {
  const list = document.getElementById("admin-strategy-cards");
  const names = window.CARD_NAMES || {};
  if (!list) return;
  const say = {
    band: "The ticket on today's slate whose price lands between −150 and +100. Shorter prices, like −800, stay off this card.",
    safe2: "Both legs are 75% or better.",
    todayBet: "The parlay on today's slate with the highest chance.",
    mid3: "Every leg is priced from −250 to −400.",
    chalk: "Legs priced from −400 to −700 that multiply to about −180.",
    win4: "Every leg is priced from −150 to −300.",
    four: "Four small yardage prices, each near an 85% chance. Together that is about a coin flip, not an 85% parlay.",
    plusLegs: "Both legs are priced from +100 to +200.",
    plus: "Four small yardage legs aimed at +250. That price is about 29%, so it misses more often than it hits.",
    mix21: "Two favorites and one underdog, each from a different game.",
    hits: "The higher combined chance is the stack that hits more often. A 90% leg is not a 90% parlay.",
    low3: "Three legs priced close to each other, each from a different game.",
    weekThree: "Player props on different days, aimed at −200, so a $5 bet wins about $2.50.",
    yards3: "Three yardage legs, each near an 80% price.",
    weekFive: "Five legs on different days, aimed at −200.",
    ou4: "Two overs and two unders, each from a different game.",
    weekSafe: "Three legs on different days, near −350.",
    alt3: "Three alt lines, each at 85% or better.",
    weekEven: "Three legs on different days, near −100. That is even money, so a $5 bet wins $5.",
    games4: "One player from each of four games.",
    early3: "Legs from games that start before 4:00 PM ET.",
    prime3: "Three legs from games that start at 7:00 PM ET or later.",
    weekend4: "Four legs from Saturday and Sunday games.",
    td2: "Two NFL players, each scoring one anytime touchdown, in a game totaled at 47 or higher.",
    td3: "Three NFL players, each scoring one anytime touchdown, in a game totaled at 47 or higher.",
    pay5: "A $5 bet aimed at winning $5.",
    pay10: "A $5 bet aimed at winning $10.",
    pay15: "A $5 bet aimed at winning $15.",
    pay20: "A $5 bet aimed at winning $20.",
    pay25: "A $5 bet aimed at winning $25.",
    pay50: "A $5 bet aimed at winning $50.",
  };
  const rows = Object.entries(names).flatMap(([id, name]) => id === "hits" ? [["Five near 90% each", say.hits], ["Four near 80% each", say.hits]] : [[name, say[id] || ""]]);
  list.innerHTML = rows.map(([name, line]) => adminCard(esc(name), esc(line))).join("");
}

function paintRates(payload) {
  const list = document.getElementById("admin-rates");
  if (!list) return;
  const rows = (window.rateShare = (payload && payload.rates) || []);
  if (!rows.length) {
    list.innerHTML = "<p>No ratings yet.</p>";
    return;
  }
  list.innerHTML = rows.map((row, index) => {
    const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
    const price = row.american == null || row.american === "" ? "" : (typeof american === "function" ? american(row.american) : String(row.american));
    const stars = `<span class="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star${n <= row.stars ? " on" : ""}" tabindex="-1" aria-hidden="true">★</button>`).join("")}</span>`;
    const gist = (row.lines || []).map((line) => (window.legGist ? legGist({ label: line }) : "")).filter(Boolean).join(", ");
    const lines = (row.lines || []).map((line) => `<span>${esc(line)}</span>`).join("");
    const who = [row.name || "Member", clock].filter(Boolean).join(" · ");
    const serial = typeof betSerial === "function" ? betSerial({ legs: (row.lines || []).map((label) => ({ label })) }) : "";
    const share = (row.lines || []).length ? `<button type="button" class="share-bet" data-share="rate" data-share-id="${index}" aria-label="Share this bet"></button>` : "";
    return `<div class="rec-bet">${share}<b>${esc([serial, price].filter(Boolean).join(" · "))} ${stars}</b><p class="rec-gist">${esc(row.title || "Bet")}${gist ? ` ${gist}` : " That bet is no longer on the record."}<em>${esc(who)}</em></p>${lines}</div>`;
  }).join("");
}

function paintAsks(payload) {
  const list = document.getElementById("admin-ask-list");
  if (!list || !payload || !Array.isArray(payload.asks)) return;
  const rows = payload.asks;
  if (!rows.length) {
    list.innerHTML = "<p>No one has asked for an option that is not on Build a Bet.</p>";
    return;
  }
  list.innerHTML = rows.map((row) => {
    const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
    const missing = row.missing ? [row.missing] : [];
    return adminCard(esc(row.name || "Member"), `${esc(row.said || "")}<em>${esc(clock)}</em>`, missing);
  }).join("");
}

function paintHabits(payload) {
  const list = document.getElementById("admin-habits");
  if (!list || !payload || !Array.isArray(payload.habits)) return;
  const rows = payload.habits;
  list.innerHTML = rows.length ? rows.map((row) => {
    const recent = (row.recent || []).length ? [`Recent answers: ${row.recent.join("; ")}.`] : [];
    return adminCard(esc(row.name || "Member"), `${esc(row.blurb || "")}<em>${esc(row.email || "")}</em>`, recent);
  }).join("") : "<p>No members yet.</p>";
}

function paintAdmin(payload) {
  paintRefresh();
  paintBuilt(payload);
  paintRates(payload);
  paintAsks(payload);
  paintHabits(payload);
  const list = document.getElementById("admin-users");
  if (!list) return;
  const rows = (payload && payload.users) || [];
  if (!rows.length) {
    list.innerHTML = "<p>No members yet.</p>";
    return;
  }
  const admins = rows.filter((row) => row.admin).map((row) => row.name || row.email);
  const line = (row) => {
    const role = row.admin ? "Admin" : "Member";
    const stay = String(row.email || "").toLowerCase() === "bthannan@gmail.com";
    const action = stay ? "" : `<button type="button" class="ghost" data-admin-email="${esc(row.email || "")}" data-admin-on="${row.admin ? "0" : "1"}">${row.admin ? "Remove" : "Make admin"}</button>`;
    return { role, action, row };
  };
  const head = `<p class="quiet">Admins: ${esc(admins.join(", ") || "none")}.</p>`;
  list.innerHTML = head + rows.map((row) => {
    const item = line(row);
    const gist = `${esc(item.row.email || "")}<em>${esc(planName(item.row.plan))} · ${esc(loginWhen(item.row.lastLogin))}</em>`;
    return adminCard(`${esc(item.row.name || "Member")} · ${esc(item.role)}`, gist, [], item.action ? `<p class="pick-save">${item.action}</p>` : "");
  }).join("");
}

async function setAdminRole(email, admin) {
  const note = document.getElementById("admin-role-note");
  if (note) note.textContent = "";
  const response = await fetch("/api/admin/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, admin }),
  });
  const payload = await response.json();
  if (!response.ok) {
    if (note) note.textContent = payload.error || "Could not change that admin.";
    return;
  }
  paintAdmin(payload);
}

function paintIgnore(payload) {
  const rules = document.getElementById("ignore-rules");
  const list = document.getElementById("ignore-list");
  if (!rules || !list) return;
  const rows = (payload && payload.rules) || [];
  rules.innerHTML = rows.map((rule) => (
    adminCard(esc(rule.label), `${esc(rule.onRecord)} still on the record<em>${esc(rule.ignored)} set aside</em>`)
  )).join("");
  const ignored = (payload && payload.ignored) || [];
  list.innerHTML = ignored.length
    ? ignored.map((row) => {
      const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
      const whenLine = [row.result || "open", clock].filter(Boolean).join(" · ");
      return adminCard(esc(row.title || "Bet"), `${esc((row.reasons || []).join(", "))}<em>${esc(whenLine)}</em>`);
    }).join("")
    : "<p>Nothing is set aside yet.</p>";
}

async function loadIgnore() {
  const response = await fetch("/api/admin/ignore", { cache: "no-store" });
  if (!response.ok) return;
  paintIgnore(await response.json());
}

async function deleteIgnored() {
  const note = document.getElementById("ignore-note");
  if (note) note.textContent = "";
  const response = await fetch("/api/admin/ignore", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    if (note) note.textContent = payload.error || "Could not delete those bets.";
    return;
  }
  paintIgnore(payload);
  const left = (payload.rules || []).reduce((sum, rule) => sum + Number(rule.onRecord || 0), 0);
  if (note) note.textContent = left ? `${left} matching bets are still on the record.` : "Matching open bets, wins, and losses are off the record.";
  if (window.startDesk) window.startDesk();
}

async function loadAdmin() {
  const tab = document.getElementById("tab-admin");
  const response = await fetch("/api/admin", { cache: "no-store" });
  if (!response.ok) {
    if (tab) tab.hidden = true;
    return;
  }
  if (tab) tab.hidden = false;
  paintAdmin(await response.json());
  loadIgnore();
}

function bindAdmin() {
  const tabs = document.getElementById("admin-tabs");
  if (!tabs || tabs.dataset.bound) return;
  tabs.dataset.bound = "1";
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-tab]");
    if (button) {
      showAdminTab(button.dataset.adminTab);
      if (button.dataset.adminTab === "built" || button.dataset.adminTab === "asks" || button.dataset.adminTab === "habits" || button.dataset.adminTab === "rates") loadAdmin();
      if (button.dataset.adminTab === "strategy") paintStrategies();
      if (button.dataset.adminTab === "notes") loadNotes().catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
      if (button.dataset.adminTab === "laws" && window.paintLaws) window.paintLaws();
    }
  });
  const del = document.getElementById("ignore-delete");
  if (del) del.addEventListener("click", () => { deleteIgnored().catch((error) => { document.getElementById("ignore-note").textContent = String(error.message || error); }); });
  const admin = document.getElementById("profile-admin");
  if (admin) admin.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    const bet = event.target.closest(".rec-bet");
    if (bet && bet.querySelector(":scope > span")) bet.classList.toggle("open");
  });
  const users = document.getElementById("admin-users");
  if (users) users.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-email]");
    if (!button) return;
    setAdminRole(button.dataset.adminEmail, button.dataset.adminOn === "1").catch((error) => {
      const note = document.getElementById("admin-role-note");
      if (note) note.textContent = String(error.message || error);
    });
  });
}

async function pullCard(id, button) {
  button.disabled = true;
  button.title = "Updating";
  const response = await fetch("/api/admin/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card: id }),
  });
  const payload = await response.json();
  const banner = document.getElementById("banner");
  if (!response.ok || !payload.card) {
    if (banner) {
      banner.hidden = false;
      banner.textContent = payload.error || "FanDuel did not update that bet.";
    }
    button.disabled = false;
    button.title = "Update from FanDuel";
    return;
  }
  if (window.state && window.state.board) window.state.board[id] = payload.card;
  if (banner) banner.hidden = true;
  if (window.render) window.render();
}

function paintNotes(payload) {
  const list = document.getElementById("note-list");
  if (!list) return;
  const rows = (payload && payload.notes) || [];
  list._notes = rows;
  if (window.applyNotes) window.applyNotes(rows);
  list.innerHTML = rows.length ? rows.map((row) => adminCard(esc(row.text), "", [], `<p class="pick-save"><button type="button" data-note-edit="${esc(row.id)}">Edit</button><button type="button" data-note-drop="${esc(row.id)}">Delete</button></p>`)).join("") : "<p>No lines yet.</p>";
}

async function loadNotes() {
  const response = await fetch("/api/notes", { cache: "no-store" });
  paintNotes(await response.json());
}

async function saveNote(body) {
  const response = await fetch("/api/admin/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  const msg = document.getElementById("note-msg");
  if (!response.ok) { if (msg) msg.textContent = payload.error || "That line did not save."; return; }
  if (msg) msg.textContent = "";
  const field = document.getElementById("note-new");
  if (field && body.op === "add") field.value = "";
  paintNotes(payload);
}

document.body.addEventListener("click", (event) => {
  const pull = event.target.closest("[data-pull]");
  if (pull) pullCard(pull.dataset.pull, pull);
  const edit = event.target.closest("[data-note-edit]");
  const drop = event.target.closest("[data-note-drop]");
  const save = event.target.closest("[data-note-save]");
  if (edit) {
    const list = document.getElementById("note-list");
    const row = ((list && list._notes) || []).find((item) => item.id === edit.dataset.noteEdit);
    const card = edit.closest(".rec-bet");
    if (row && card) card.innerHTML = `<p class="pick-save"><input data-note-field="${esc(row.id)}" maxlength="180" value="${esc(row.text)}"><button type="button" data-note-save="${esc(row.id)}">Save</button></p>`;
  }
  if (drop) saveNote({ op: "delete", id: drop.dataset.noteDrop }).catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
  if (save) {
    const field = document.querySelector(`[data-note-field="${save.dataset.noteSave}"]`);
    saveNote({ op: "edit", id: save.dataset.noteSave, text: field ? field.value : "" }).catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
  }
});

const noteAdd = document.getElementById("note-add");
if (noteAdd) noteAdd.addEventListener("click", () => {
  const field = document.getElementById("note-new");
  saveNote({ op: "add", text: field ? field.value : "" }).catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
});

window.loadAdmin = loadAdmin;
window.paintRefresh = paintRefresh;
bindAdmin();
paintStrategies();
