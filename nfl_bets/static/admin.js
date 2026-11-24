function planName(row) {
  if (!row || typeof row === "string") return row === "pro" ? "Paid" : "Free";
  if (row.admin) return "Admin";
  if (row.plan === "pro") return "Paid";
  if (row.trial) return row.beta ? "Beta trial" : "Free trial";
  return "Trial over";
}

function planLeftSay(row) {
  if (!row || row.admin) return "";
  const iso = row.plan === "pro" ? row.periodEnd : row.trialEndsAt;
  const end = Date.parse(iso || "");
  if (!Number.isFinite(end)) return "";
  const stamp = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const a = Date.parse(`${stamp(Date.now())}T12:00:00`);
  const b = Date.parse(`${stamp(end)}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const days = Math.round((b - a) / 86400000);
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return row.plan === "pro" ? "expires today" : "ends today";
  const ago = Math.abs(days);
  if (ago === 1) return row.plan === "pro" ? "expired yesterday" : "ended yesterday";
  return row.plan === "pro" ? `expired ${ago} days ago` : `ended ${ago} days ago`;
}

function loginWhen(stamp) {
  if (!stamp) return "Not yet";
  return typeof when === "function" ? `${when(stamp)} ET` : stamp;
}

function showAdminTab(name) {
  ["members", "notes", "laws", "errors", "fantasy", "sliders", "strategies"].forEach((id) => {
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

function landPoint(node, svg) {
  const spot = node.getBBox();
  const cols = 9;
  const rows = 9;
  const hits = [];
  for (let i = 1; i < cols; i += 1) {
    for (let j = 1; j < rows; j += 1) {
      const x = spot.x + (spot.width * i) / cols;
      const y = spot.y + (spot.height * j) / rows;
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      if (node.isPointInFill(pt)) hits.push({ x, y, i, j });
    }
  }
  if (!hits.length) return null;
  let best = hits[0];
  let score = -1;
  hits.forEach((hit) => {
    let near = 0;
    hits.forEach((other) => {
      if (Math.abs(other.i - hit.i) <= 1 && Math.abs(other.j - hit.j) <= 1) near += 1;
    });
    if (near > score) { score = near; best = hit; }
  });
  return best;
}

function watchMapCount(map) {
  if (map._countWait) return;
  const wait = new ResizeObserver(() => {
    if (labelOnlineMap(map)) { wait.disconnect(); map._countWait = null; }
  });
  map._countWait = wait;
  wait.observe(map);
}

function labelOnlineMap(map) {
  const svg = map && map.querySelector("svg");
  if (!map || !svg) return false;
  const counts = window.onlineCounts || {};
  map.querySelectorAll("[data-code]").forEach((node) => {
    node.dataset.count = String(counts[String(node.dataset.code || "").toUpperCase()] || 0);
  });
  const width = svg.getBoundingClientRect().width;
  if (!width) { watchMapCount(map); return false; }
  if (map._countWait) { map._countWait.disconnect(); map._countWait = null; }
  svg.querySelectorAll("text").forEach((node) => node.remove());
  const view = svg.viewBox.baseVal.width || 959;
  const scale = width / view;
  const best = new Map();
  map.querySelectorAll("[data-code]").forEach((node) => {
    const count = Number(node.dataset.count) || 0;
    if (!count) return;
    const spot = node.getBoundingClientRect();
    const area = spot.width * spot.height;
    const prior = best.get(node.dataset.code);
    if (!prior || area > prior.area) best.set(node.dataset.code, { node, count, spot });
  });
  best.forEach((item) => {
    if (item.spot.width < 14 || item.spot.height < 10) return;
    const point = landPoint(item.node, svg);
    if (!point) return;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const px = Math.max(11, Math.min(16, item.spot.width * 0.34));
    text.setAttribute("x", point.x);
    text.setAttribute("y", point.y);
    text.style.fontSize = `${px / scale}px`;
    text.textContent = String(item.count);
    svg.append(text);
  });
  return true;
}

window.labelOnlineMap = labelOnlineMap;

function paintOnline(online) {
  const box = document.getElementById("admin-online");
  if (!box || !online) return;
  const rows = online.states || [];
  const total = Number(online.total) || 0;
  const none = Number(online.none) || 0;
  const say = total === 0 ? "Nobody is on the site." : total === 1 ? "1 person on the site." : `${total} people on the site.`;
  const where = rows.map((row) => `${window.stateName ? stateName(row.code) : row.code} ${row.count}`);
  if (none) where.push(none === 1 ? "1 with no state" : `${none} with no state`);
  window.onlineCounts = Object.fromEntries(rows.map((row) => [String(row.code || "").toUpperCase(), Number(row.count) || 0]));
  const key = `${say}|${where.join(",")}`;
  if (box.dataset.key === key && box.querySelector("svg")) {
    labelOnlineMap(document.getElementById("admin-online-map"));
    labelOnlineMap(document.getElementById("bird-map"));
    return;
  }
  box.dataset.key = key;
  box.innerHTML = `<p class="quiet" id="admin-online-say"></p><div id="admin-online-map"></div><p class="quiet" id="admin-online-where"></p>`;
  document.getElementById("admin-online-say").textContent = say;
  document.getElementById("admin-online-where").textContent = where.length ? `${where.join(". ")}.` : "";
  if (!box.dataset.bound) {
    box.dataset.bound = "1";
    box.addEventListener("click", (event) => {
      const hit = event.target.closest("[data-code]");
      if (!hit) return;
      box.querySelectorAll("[data-code]").forEach((node) => node.classList.toggle("on", node.dataset.code === hit.dataset.code));
    });
  }
  if (!window.mountUsMap) return;
  mountUsMap(document.getElementById("admin-online-map"), () => {
    const map = document.getElementById("admin-online-map");
    if (!map) return;
    map.querySelectorAll("[data-code]").forEach((node) => {
      const code = node.dataset.code.toUpperCase();
      const count = (window.onlineCounts || {})[code] || 0;
      const name = window.stateName ? stateName(code) : code;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", count ? `${name}, ${count}` : name);
    });
    labelOnlineMap(map);
    labelOnlineMap(document.getElementById("bird-map"));
  });
}

let adminHabits = [];
let showAllHabits = false;

function memberSpan(rows) {
  const now = Date.now();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = day.format(now);
  const week = now - 7 * 86400000;
  const month = now - 30 * 86400000;
  const year = now - 365 * 86400000;
  let todayN = 0, weekN = 0, monthN = 0, yearN = 0;
  rows.forEach((row) => {
    const then = Date.parse(row.lastLogin || "");
    if (!Number.isFinite(then)) return;
    if (day.format(then) === today) todayN += 1;
    if (then >= week) weekN += 1;
    if (then >= month) monthN += 1;
    if (then >= year) yearN += 1;
  });
  const n = rows.length;
  return `${n} ${n === 1 ? "member" : "members"}. ${todayN} logged in today. ${weekN} in the last week. ${monthN} in the last month. ${yearN} in the last year.`;
}

function paintAdmin(payload) {
  paintRefresh();
  paintOnline(payload && payload.online);
  if (payload && Array.isArray(payload.habits)) adminHabits = payload.habits;
  const list = document.getElementById("admin-users");
  if (!list) return;
  const rows = (payload && payload.users) || [];
  if (!rows.length) {
    list.innerHTML = "<p>No members yet.</p>";
    return;
  }
  const habits = new Map(adminHabits.map((row) => [String(row.email || "").toLowerCase(), row]));
  const admins = rows.filter((row) => row.admin).map((row) => row.name || row.email);
  const line = (row) => {
    const role = row.admin ? "Admin" : "Member";
    const stay = ["bthannan@gmail.com", "parlayoftheday11@gmail.com"].includes(String(row.email || "").toLowerCase());
    const roleActs = stay ? "" : `<button type="button" class="ghost" data-admin-email="${esc(row.email || "")}" data-admin-on="${row.admin ? "0" : "1"}">${row.admin ? "Remove" : "Make admin"}</button><button type="button" class="ghost" data-admin-drop="${esc(row.email || "")}" data-admin-name="${esc(row.name || "this member")}">Delete</button>`;
    const passAct = `<button type="button" class="ghost" data-admin-pass="${esc(row.email || "")}" data-admin-name="${esc(row.name || "this member")}">Reset password</button>`;
    const action = `${passAct}${roleActs}`;
    return { role, action, row };
  };
  const head = `<p class="quiet">${esc(memberSpan(rows))}</p><label class="admin-habits-all"><input type="checkbox" id="admin-habits-all"${showAllHabits ? " checked" : ""}> Show all habits</label><p class="quiet">Admins: ${esc(admins.join(", ") || "none")}.</p>`;
  list.innerHTML = head + rows.map((row) => {
    const item = line(row);
    const habit = habits.get(String(row.email || "").toLowerCase());
    const lines = [];
    if (habit && habit.blurb) String(habit.blurb).split("\n").forEach((line) => { const text = line.trim(); if (text) lines.push(text); });
    if (habit && (habit.recent || []).length) lines.push(`Recent answers: ${habit.recent.join("; ")}.`);
    if (item.row.mustChangePass) lines.push("Waiting on a new password after the temp reset.");
    const left = planLeftSay(item.row);
    const gist = `${esc(item.row.email || "")}<em>${esc(planName(item.row))}${left ? ` · ${esc(left)}` : ""} · ${esc(loginWhen(item.row.lastLogin))}</em>`;
    return adminCard(`${esc(item.row.name || "Member")} · ${esc(item.role)}`, gist, lines, item.action ? `<p class="pick-save">${item.action}</p>` : "");
  }).join("");
  if (showAllHabits) list.querySelectorAll(".rec-bet").forEach((card) => { if (card.querySelector(":scope > span")) card.classList.add("open"); });
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

async function dropMember(email) {
  const note = document.getElementById("admin-role-note");
  if (note) note.textContent = "";
  const response = await fetch("/api/admin/drop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json();
  if (!response.ok) {
    if (note) note.textContent = payload.error || "Could not delete that member.";
    return;
  }
  paintAdmin(payload);
}

async function resetMemberPass(email, password) {
  const note = document.getElementById("admin-role-note");
  if (note) note.textContent = "";
  const response = await fetch("/api/admin/pass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    if (note) note.textContent = payload.error || "Could not reset that password.";
    return;
  }
  paintAdmin(payload);
  if (note) note.textContent = `Temp password set for ${payload.email || email}. Tell them that password, then they choose a new one on first sign-in.`;
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
  paintAdminHistory();
  watchHere();
}

function paintAdminStrategies() {
  const host = document.getElementById("admin-strategies");
  if (!host || typeof startStacks !== "function") return;
  host.replaceChildren(...startStacks());
}

function paintAdminHistory() {
  const host = document.getElementById("admin-history");
  if (!host || typeof startRecStats !== "function") return;
  const stats = startRecStats({ stay: true });
  const golden = typeof startGoldenList === "function" ? startGoldenList() : [];
  host.replaceChildren(...stats, ...golden);
}

function watchHere() {
  if (document.body.dataset.hereWatch) return;
  document.body.dataset.hereWatch = "1";
  setInterval(() => {
    const admin = document.getElementById("profile-admin");
    const members = document.getElementById("admin-members");
    if (!admin || admin.hidden || !members || members.hidden || document.body.classList.contains("needs-member")) return;
    fetch("/api/admin/here", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).then((online) => { if (online) paintOnline(online); }).catch(() => {});
  }, 20000);
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
      if (button.dataset.adminTab === "notes") loadNotes().catch((error) => { const msg = document.getElementById("note-msg"); if (msg) msg.textContent = String(error.message || error); });
      if (button.dataset.adminTab === "laws" && window.paintLaws) window.paintLaws();
      if (button.dataset.adminTab === "fantasy" && window.paintFantasyUse) paintFantasyUse();
      if (button.dataset.adminTab === "sliders" && window.sliderTry) window.sliderTry();
      if (button.dataset.adminTab === "strategies") paintAdminStrategies();
    }
  });
  const admin = document.getElementById("profile-admin");
  if (admin) admin.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    const bet = event.target.closest(".rec-bet");
    if (bet && bet.querySelector(":scope > span")) bet.classList.toggle("open");
  });
  const users = document.getElementById("admin-users");
  if (users) users.addEventListener("change", (event) => {
    if (event.target.id !== "admin-habits-all") return;
    showAllHabits = event.target.checked;
    users.querySelectorAll(".rec-bet").forEach((card) => {
      if (card.querySelector(":scope > span")) card.classList.toggle("open", showAllHabits);
    });
  });
  if (users) users.addEventListener("click", (event) => {
    const drop = event.target.closest("[data-admin-drop]");
    if (drop) {
      const row = drop.closest(".pick-save");
      const email = drop.dataset.adminDrop;
      const name = drop.dataset.adminName || email;
      if (row) row.innerHTML = `<span>Delete ${esc(name)}? This membership goes away.</span><button type="button" class="ghost" data-admin-drop-yes="${esc(email)}">Yes, delete</button><button type="button" class="ghost" data-admin-drop-no>Cancel</button>`;
      return;
    }
    const yes = event.target.closest("[data-admin-drop-yes]");
    if (yes) {
      dropMember(yes.dataset.adminDropYes).catch((error) => {
        const note = document.getElementById("admin-role-note");
        if (note) note.textContent = String(error.message || error);
      });
      return;
    }
    if (event.target.closest("[data-admin-drop-no]")) { loadAdmin().catch(() => {}); return; }
    const pass = event.target.closest("[data-admin-pass]");
    if (pass) {
      const row = pass.closest(".pick-save");
      const email = pass.dataset.adminPass;
      const name = pass.dataset.adminName || email;
      if (row) {
        row.innerHTML = `<span>Temp password for ${esc(name)}</span><input type="text" class="admin-temp-pass" data-admin-pass-input="${esc(email)}" autocomplete="off" minlength="8" placeholder="At least 8 characters"><button type="button" class="ghost" data-admin-pass-yes="${esc(email)}">Set temp password</button><button type="button" class="ghost" data-admin-pass-no>Cancel</button>`;
        const field = row.querySelector("[data-admin-pass-input]");
        if (field) field.focus();
      }
      return;
    }
    const passYes = event.target.closest("[data-admin-pass-yes]");
    if (passYes) {
      const row = passYes.closest(".pick-save");
      const field = row && row.querySelector("[data-admin-pass-input]");
      const password = field ? String(field.value || "") : "";
      resetMemberPass(passYes.dataset.adminPassYes, password).catch((error) => {
        const note = document.getElementById("admin-role-note");
        if (note) note.textContent = String(error.message || error);
      });
      return;
    }
    if (event.target.closest("[data-admin-pass-no]")) { loadAdmin().catch(() => {}); return; }
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
window.paintAdminStrategies = paintAdminStrategies;
window.paintRefresh = paintRefresh;
bindAdmin();
