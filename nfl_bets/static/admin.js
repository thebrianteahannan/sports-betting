function planName(plan) {
  if (!plan || plan === "free") return "Free";
  return plan;
}

function loginWhen(stamp) {
  if (!stamp) return "No login yet";
  return typeof when === "function" ? `${when(stamp)} ET` : stamp;
}

function paintAdmin(payload) {
  const list = document.getElementById("admin-users");
  if (!list) return;
  const rows = (payload && payload.users) || [];
  if (!rows.length) {
    list.innerHTML = "<p>No members yet.</p>";
    return;
  }
  const body = rows.map((row) => `<tr><td>${esc(row.name || "Member")}</td><td>${esc(row.email || "")}</td><td>${esc(planName(row.plan))}</td><td>${esc(loginWhen(row.lastLogin))}</td></tr>`).join("");
  list.innerHTML = `<table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Subscription</th><th>Last login</th></tr></thead><tbody>${body}</tbody></table>`;
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

window.loadAdmin = loadAdmin;
