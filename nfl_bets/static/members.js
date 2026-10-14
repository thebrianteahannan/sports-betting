const memberFetch = window.fetch.bind(window);

function showGateMode(mode) {
  document.getElementById("gate-pick").hidden = mode !== "pick";
  document.getElementById("member-form").hidden = mode !== "join";
  document.getElementById("login-form").hidden = mode !== "login";
}

function showGate() {
  document.body.classList.add("needs-member");
  if (window.state) window.state.showLive = false;
  const who = document.getElementById("who");
  if (who) who.hidden = true;
  showGateMode("pick");
  if (window.deskGate) window.deskGate();
}

function showMember(payload) {
  document.body.classList.remove("needs-member");
  const member = payload.member || {};
  const who = document.getElementById("who");
  who.hidden = false;
  const admin = !!member.admin;
  who.innerHTML = `<button type="button" id="hard-refresh" aria-label="Reload the page" title="Reload"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.2-5.8"/><path d="M21 4v5h-5"/></svg></button><button type="button" id="member-profile" aria-label="Profile" title="${esc(member.name)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 19c1.5-3.1 4-4.6 7-4.6s5.5 1.5 7 4.6"/></svg></button>`;
  const heading = document.querySelector("#activity h2");
  if (heading) heading.textContent = member.name || "Your membership";
  const adminBox = document.getElementById("profile-admin");
  if (adminBox) adminBox.hidden = !admin;
  const plan = document.getElementById("activity-plan");
  plan.textContent = admin
    ? "Admin. Ratings and saved picks are kept on this membership."
    : "Free membership. Payments are not turned on. Ratings and saved picks are kept on this membership.";
  const list = document.getElementById("activity-list");
  const rows = payload.activity || [];
  list.innerHTML = rows.length
    ? rows.map(activityLine).join("")
    : "<p>No ratings or saved picks yet.</p>";
  if (window.loadReports) window.loadReports();
  if (window.state) {
    window.state.admin = admin;
    window.state.showLive = false;
  }
  if (window.render) window.render();
  if (admin && window.loadAdmin) window.loadAdmin();
}

const CARD_NAMES = {
  band: "Best bet of the day",
  todayBet: "Today's Best Bet",
  chalk: "Near −180",
  four: "Four at 85% each",
  plus: "Safest near +250",
  hits: "Which stack hits more",
  weekThree: "Good 3-leg",
  weekFive: "Good 5-leg",
  weekSafe: "Super safe",
};

function activityLine(row) {
  const detail = row.detail || {};
  const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
  const what = detail.group || CARD_NAMES[detail.card] || "a ticket";
  if (row.kind === "rate") return `<p>Rated ${esc(what)} ${esc(detail.stars)} stars. ${esc(clock)}</p>`;
  if (row.kind === "save") return `<p>Saved ${esc(what)}. ${esc(clock)}</p>`;
  return "";
}

async function refreshActivity() {
  const response = await memberFetch("/api/me", { cache: "no-store" });
  if (!response.ok) return;
  showMember(await response.json());
}

async function sendMember(path, fields, errorId) {
  const error = document.getElementById(errorId);
  error.textContent = "";
  const body = {};
  Object.entries(fields).forEach(([key, id]) => {
    body[key] = document.getElementById(id).value;
  });
  const response = await memberFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    error.textContent = payload.error || "Could not open the membership.";
    return;
  }
  showMember(payload.activity ? payload : { member: payload.member, activity: [] });
  if (window.startDesk) window.startDesk();
}

async function signOut() {
  await memberFetch("/api/logout", { method: "POST" });
  if (window.state && window.state.timer) clearTimeout(window.state.timer);
  showGate();
}

async function bootMember() {
  const response = await memberFetch("/api/me", { cache: "no-store" });
  if (!response.ok) {
    showGate();
    return;
  }
  showMember(await response.json());
  if (window.startDesk) window.startDesk();
}

window.fetch = async function memberAwareFetch(url, options) {
  const response = await memberFetch(url, options);
  const target = String(url);
  if (response.status === 401 && target.startsWith("/api/") && !target.startsWith("/api/me")) showGate();
  if (response.ok && (target === "/api/archive/good" || target === "/api/picks")) refreshActivity();
  return response;
};

async function hardRefresh() {
  const stamp = Date.now();
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    await fetch("/?fresh=" + stamp, { cache: "reload" });
  } catch (error) {}
  location.replace(location.pathname + "?fresh=" + stamp);
}

document.getElementById("who").addEventListener("click", (event) => {
  if (event.target.closest("#hard-refresh")) hardRefresh();
  if (event.target.closest("#member-profile")) showTab("profile");
});
document.getElementById("pane-profile").addEventListener("click", (event) => {
  if (event.target.closest("#member-out")) signOut();
});
document.getElementById("gate-join").addEventListener("click", () => showGateMode("join"));
document.getElementById("gate-have").addEventListener("click", () => showGateMode("login"));
document.getElementById("join-signin").addEventListener("click", () => showGateMode("login"));
document.getElementById("login-join").addEventListener("click", () => showGateMode("join"));
document.getElementById("member-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMember("/api/join", {
    name: "member-name",
    email: "member-email",
    password: "member-pass",
  }, "member-error");
});
document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMember("/api/login", {
    email: "login-email",
    password: "login-pass",
  }, "login-error");
});

bootMember();
