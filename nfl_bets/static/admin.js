function planName(plan) {
  if (!plan || plan === "free") return "Free";
  return plan;
}

function loginWhen(stamp) {
  if (!stamp) return "Not yet";
  return typeof when === "function" ? `${when(stamp)} ET` : stamp;
}

function showAdminTab(name) {
  ["members", "habits", "notes", "laws", "errors"].forEach((id) => {
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

async function loadAdmin() {
  const tab = document.getElementById("tab-admin");
  const response = await fetch("/api/admin", { cache: "no-store" });
  if (!response.ok) {
    if (tab) tab.hidden = true;
    return;
  }
  if (tab) tab.hidden = false;
  paintAdmin(await response.json());
}

function bindAdmin() {
  const tabs = document.getElementById("admin-tabs");
  if (!tabs || tabs.dataset.bound) return;
  tabs.dataset.bound = "1";
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-tab]");
    if (button) {
      if (button.dataset.adminTab === "experimental") { if (window.birdMenu) birdMenu("bets"); return; }
      showAdminTab(button.dataset.adminTab);
      if (button.dataset.adminTab === "habits") loadAdmin();
      if (button.dataset.adminTab === "notes") loadNotes().catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
      if (button.dataset.adminTab === "laws" && window.paintLaws) window.paintLaws();
    }
  });
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

async function shelveStrategy(card, part) {
  if (shelveStrategy.busy) return;
  shelveStrategy.busy = true;
  const key = part ? `${card}|${part}` : card;
  const has = ((window.state && state.board && state.board.shelved) || []).includes(key);
  try {
    const response = await fetch("/api/admin/shelve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card, part, on: !has }) });
    const payload = await response.json();
    if (!response.ok) return;
    if (window.state && state.board) state.board.shelved = payload.cards || [];
    if (window.birdMenu) birdMenu("bets");
  } finally { shelveStrategy.busy = false; }
}
window.shelveStrategy = shelveStrategy;
window.loadAdmin = loadAdmin;
window.paintRefresh = paintRefresh;
bindAdmin();
