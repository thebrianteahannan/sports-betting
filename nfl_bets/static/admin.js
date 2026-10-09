function planName(plan) {
  if (!plan || plan === "free") return "Free";
  return plan;
}

function loginWhen(stamp) {
  if (!stamp) return "No login yet";
  return typeof when === "function" ? `${when(stamp)} ET` : stamp;
}

function showAdminTab(name) {
  ["members", "share", "ignore", "strategy"].forEach((id) => {
    const pane = document.getElementById(`admin-${id}`);
    if (pane) pane.hidden = id !== name;
    const button = document.querySelector(`[data-admin-tab="${id}"]`);
    if (button) button.classList.toggle("on", id === name);
  });
}

function paintAdmin(payload) {
  const list = document.getElementById("admin-users");
  if (!list) return;
  const rows = (payload && payload.users) || [];
  if (!rows.length) {
    list.innerHTML = "<p>No members yet.</p>";
    return;
  }
  const admins = rows.filter((row) => row.admin).map((row) => row.name || row.email);
  const body = rows.map((row) => {
    const role = row.admin ? "Admin" : "Member";
    const stay = String(row.email || "").toLowerCase() === "bthannan@gmail.com";
    const action = stay ? "" : `<button type="button" class="ghost" data-admin-email="${esc(row.email || "")}" data-admin-on="${row.admin ? "0" : "1"}">${row.admin ? "Remove" : "Make admin"}</button>`;
    return `<tr><td>${esc(row.name || "Member")}</td><td>${esc(row.email || "")}</td><td>${esc(planName(row.plan))}</td><td>${esc(role)} ${action}</td><td>${esc(loginWhen(row.lastLogin))}</td></tr>`;
  }).join("");
  list.innerHTML = `<p>Admins: ${esc(admins.join(", ") || "none")}.</p><table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Subscription</th><th>Admin</th><th>Last login</th></tr></thead><tbody>${body}</tbody></table>`;
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
    if (button) showAdminTab(button.dataset.adminTab);
  });
  const del = document.getElementById("ignore-delete");
  if (del) del.addEventListener("click", () => { deleteIgnored().catch((error) => { document.getElementById("ignore-note").textContent = String(error.message || error); }); });
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
  button.textContent = "Updating…";
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
    button.textContent = "Update from FanDuel";
    return;
  }
  if (window.state && window.state.board) window.state.board[id] = payload.card;
  if (banner) banner.hidden = true;
  if (window.render) window.render();
}

document.body.addEventListener("click", (event) => {
  const pull = event.target.closest("[data-pull]");
  if (pull) pullCard(pull.dataset.pull, pull);
});

window.loadAdmin = loadAdmin;
bindAdmin();
