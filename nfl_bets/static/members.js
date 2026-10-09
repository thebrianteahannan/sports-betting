const memberFetch = window.fetch.bind(window);

function showGate() {
  document.body.classList.add("needs-member");
  const who = document.getElementById("who");
  if (who) who.hidden = true;
}

function showMember(payload) {
  document.body.classList.remove("needs-member");
  const member = payload.member || {};
  const who = document.getElementById("who");
  who.hidden = false;
  who.innerHTML = `${esc(member.name)} · Free membership <button type="button" class="ghost" id="member-out">Sign out</button>`;
  const plan = document.getElementById("activity-plan");
  plan.textContent = "Free membership. Payments are not turned on. Ratings and saved picks are kept on this membership.";
  const list = document.getElementById("activity-list");
  const rows = payload.activity || [];
  list.innerHTML = rows.length
    ? rows.map(activityLine).join("")
    : "<p>No ratings or saved picks yet.</p>";
}

const CARD_NAMES = {
  todayBet: "Today's Best Bet",
  chalk: "Near −180",
  four: "Four at 85% each",
  plus: "Safest near +250",
  hits: "Which stack hits more",
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

async function sendMember(path, extra) {
  const error = document.getElementById("member-error");
  error.textContent = "";
  const body = {
    name: document.getElementById("member-name").value,
    email: document.getElementById("member-email").value,
    password: document.getElementById("member-pass").value,
  };
  const response = await memberFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign(body, extra || {})),
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

document.getElementById("who").addEventListener("click", (event) => {
  if (event.target.id === "member-out") signOut();
});
document.getElementById("member-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMember("/api/join");
});
document.getElementById("member-login").addEventListener("click", () => sendMember("/api/login"));

bootMember();
