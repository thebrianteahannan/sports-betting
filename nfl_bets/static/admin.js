function planName(plan) {
  if (!plan || plan === "free") return "Free";
  return plan;
}

function loginWhen(stamp) {
  if (!stamp) return "Not yet";
  return typeof when === "function" ? `${when(stamp)} ET` : stamp;
}

function showAdminTab(name) {
  ["members", "rates", "habits", "ignore", "strategy", "reads", "docs", "built", "asks", "card", "notes", "laws"].forEach((id) => {
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
}

function builtLine(line) {
  const parts = String(line || "").split(" — ");
  const where = parts.length > 1 ? `<span>${esc(parts.slice(1).join(" — "))}</span>` : "";
  return `<p class="built-leg"><b>${esc(parts[0] || "")}</b>${where}</p>`;
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
  const made = new Set(((payload && payload.strategies) || []).map((row) => row.key));
  if (!rows.length) {
    list.innerHTML = "<p>No one has finished a build yet.</p>";
    return;
  }
  list.innerHTML = `<p class="quiet">These are the bets people finished building.</p>${rows.map((row) => {
    const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
    const who = (row.names || []).join(", ") || "Member";
    const times = `${row.count} ${row.count === 1 ? "person has" : "people have"} built this.`;
    const lines = (row.lines || []).map(builtLine).join("");
    const action = made.has(row.key) ? `<p class="quiet">This is a strategy.</p>` : `<p class="pick-save"><button type="button" data-make-strategy="${esc(row.key)}">Make this a strategy</button></p>`;
    return `<article class="report-card"><p><b>${esc(who)}</b> · ${esc(clock)}</p><p>${esc(builtSay(row))} ${esc(times)}</p>${row.title ? `<p>${esc(row.title)}</p>` : ""}${lines}${action}</article>`;
  }).join("")}`;
}

function paintPicked(payload) {
  const list = document.getElementById("admin-picked");
  if (!list) return;
  const rows = (payload && payload.strategies) || [];
  if (!rows.length) { list.innerHTML = ""; return; }
  list.innerHTML = `<h2>Picked from built bets</h2>${rows.map((row) => {
    const lines = (row.lines || []).map(builtLine).join("");
    return `<article class="report-card"><p><b>${esc(builtSay(row))}</b></p>${row.title ? `<p>${esc(row.title)}</p>` : ""}${lines}</article>`;
  }).join("")}`;
}

function paintRates(payload) {
  const list = document.getElementById("admin-rates");
  if (!list) return;
  const rows = (payload && payload.rates) || [];
  if (!rows.length) {
    list.innerHTML = "<p>No ratings yet.</p>";
    return;
  }
  list.innerHTML = rows.map((row) => {
    const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
    const price = row.american == null || row.american === "" ? "" : ` ${typeof american === "function" ? american(row.american) : row.american}`;
    const lines = (row.lines || []).map(builtLine).join("") || "<p>That bet is no longer on the record.</p>";
    const stars = `${row.stars} star${row.stars === 1 ? "" : "s"}`;
    return `<article class="report-card"><p><b>${esc(row.name || "Member")}</b> · ${esc(stars)} · ${esc(clock)}</p><p>${esc(row.title || "Bet")}${esc(String(price))}</p>${lines}</article>`;
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
    return `<article class="report-card"><p><b>${esc(row.name || "Member")}</b> · ${esc(clock)}</p><p>${esc(row.said || "")}</p><p class="quiet">${esc(row.missing || "")}</p></article>`;
  }).join("");
}

function paintHabits(payload) {
  const list = document.getElementById("admin-habits");
  if (!list || !payload || !Array.isArray(payload.habits)) return;
  const rows = payload.habits;
  list.innerHTML = rows.length ? rows.map((row) => {
    const recent = (row.recent || []).length ? `<p class="quiet">Recent answers: ${esc(row.recent.join("; "))}.</p>` : "";
    return `<article class="report-card"><p><b>${esc(row.name || "Member")}</b> · ${esc(row.email || "")}</p><p>${esc(row.blurb || "")}</p>${recent}</article>`;
  }).join("") : "<p>No members yet.</p>";
}

function paintAdmin(payload) {
  paintRefresh();
  paintBuilt(payload);
  paintPicked(payload);
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
  const head = `<p>Admins: ${esc(admins.join(", ") || "none")}.</p>`;
  if (window.matchMedia("(max-width: 760px)").matches) {
    list.innerHTML = head + rows.map((row) => {
      const item = line(row);
      return `<article class="report-card"><p><b>${esc(item.row.name || "Member")}</b> · ${esc(item.role)} ${item.action}</p><p>${esc(item.row.email || "")}</p><p class="quiet">${esc(planName(item.row.plan))} · ${esc(loginWhen(item.row.lastLogin))}</p></article>`;
    }).join("");
    return;
  }
  const body = rows.map((row) => {
    const item = line(row);
    return `<tr><td>${esc(item.row.name || "Member")}</td><td>${esc(item.row.email || "")}</td><td>${esc(planName(item.row.plan))}</td><td>${esc(item.role)} ${item.action}</td><td>${esc(loginWhen(item.row.lastLogin))}</td></tr>`;
  }).join("");
  list.innerHTML = `${head}<table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Subscription</th><th>Admin</th><th>Last on site</th></tr></thead><tbody>${body}</tbody></table>`;
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
    `<p><b>${esc(rule.label)}</b> · ${esc(rule.onRecord)} still on the record · ${esc(rule.ignored)} set aside</p>`
  )).join("");
  const ignored = (payload && payload.ignored) || [];
  list.innerHTML = ignored.length
    ? ignored.map((row) => {
      const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
      return `<article class="report-card"><p><b>${esc(row.title || "Bet")}</b> · ${esc(row.result || "open")}${clock ? ` · ${esc(clock)}` : ""}</p><p>${esc((row.reasons || []).join(", "))}</p></article>`;
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
      if (button.dataset.adminTab === "built" || button.dataset.adminTab === "asks" || button.dataset.adminTab === "habits" || button.dataset.adminTab === "rates" || button.dataset.adminTab === "strategy") loadAdmin();
      if (button.dataset.adminTab === "notes") loadNotes().catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
      if (button.dataset.adminTab === "laws" && window.paintLaws) window.paintLaws();
      if (button.dataset.adminTab === "card" && window.fillShareCards) window.fillShareCards();
    }
  });
  const del = document.getElementById("ignore-delete");
  if (del) del.addEventListener("click", () => { deleteIgnored().catch((error) => { document.getElementById("ignore-note").textContent = String(error.message || error); }); });
  const built = document.getElementById("admin-built");
  if (built) built.addEventListener("click", (event) => {
    const button = event.target.closest("[data-make-strategy]");
    const row = button && (window.builtTypes || []).find((item) => item.key === button.dataset.makeStrategy);
    if (!row || !window.noteTaste) return;
    button.disabled = true;
    noteTaste("strategy", row).then(() => loadAdmin());
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
  list.innerHTML = rows.length ? rows.map((row) => `<article class="report-card"><p>${esc(row.text)}</p><p class="pick-save"><button type="button" data-note-edit="${esc(row.id)}">Edit</button><button type="button" data-note-drop="${esc(row.id)}">Delete</button></p></article>`).join("") : "<p>No lines yet.</p>";
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
    const card = edit.closest("article");
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
