function reportCard(row, admin) {
  const clock = row.at && typeof when === "function" ? `${when(row.at)} ET` : "";
  const state = row.decision === "use" ? "Use this" : row.decision === "skip" ? "Skip" : "New";
  const actions = admin && !row.decision
    ? `<p class="pick-save"><button type="button" data-report-use="${esc(row.id)}">Use this</button><button type="button" class="ghost" data-report-skip="${esc(row.id)}">Skip</button></p>`
    : "";
  return `<article class="report-card"><p><b>${esc(row.name || "Member")}</b> · ${esc(state)} · ${esc(clock)}</p><p>${esc(row.strategy)}</p><p>${esc(row.story)}</p><img class="report-shot" alt="Screenshot of the winning bet" src="/api/reports/shot?id=${esc(row.id)}">${actions}</article>`;
}

function paintReports(payload) {
  const review = document.getElementById("report-review");
  const mine = document.getElementById("report-mine");
  if (!review || !mine) return;
  const rows = (payload && payload.reports) || [];
  const admin = Boolean(payload && payload.admin);
  review.hidden = !admin;
  review.querySelector("#report-queue").innerHTML = rows.length
    ? rows.map((row) => reportCard(row, admin)).join("")
    : "<p>No reports yet.</p>";
  const own = rows.filter((row) => row.mine);
  mine.innerHTML = own.length
    ? own.map((row) => reportCard(row, false)).join("")
    : "<p>You have not sent a win in yet.</p>";
}

async function loadReports() {
  const response = await fetch("/api/reports", { cache: "no-store" });
  if (!response.ok) return;
  paintReports(await response.json());
}

async function sendReport(event) {
  event.preventDefault();
  const error = document.getElementById("report-error");
  error.textContent = "";
  const file = document.getElementById("report-shot").files[0];
  if (!file) {
    error.textContent = "Add a screenshot of the winning bet.";
    return;
  }
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That screenshot could not be read."));
    reader.readAsDataURL(file);
  });
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      strategy: document.getElementById("report-strategy").value,
      story: document.getElementById("report-story").value,
      image,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    error.textContent = payload.error || "Could not send that.";
    return;
  }
  document.getElementById("report-form").reset();
  loadReports();
}

async function markReport(id, decision) {
  const response = await fetch("/api/reports/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, decision }),
  });
  if (response.ok) loadReports();
}

function bindReports() {
  const form = document.getElementById("report-form");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";
  form.addEventListener("submit", (event) => { sendReport(event).catch((error) => { document.getElementById("report-error").textContent = String(error.message || error); }); });
  document.getElementById("report-review").addEventListener("click", (event) => {
    const use = event.target.closest("[data-report-use]");
    const skip = event.target.closest("[data-report-skip]");
    if (use) markReport(use.dataset.reportUse, "use");
    if (skip) markReport(skip.dataset.reportSkip, "skip");
  });
}

window.loadReports = loadReports;
bindReports();
