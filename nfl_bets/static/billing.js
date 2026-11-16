/** One paid membership: the VIP Pass at $19.99 a month. */
const BILLING_PLANS = [
  { id: "pro", name: "VIP Pass", price: "$19.99 a month" },
];
const VIP_LINE = "The parrot picks. You watch it land. You still place the bet.";
const VIP_OFFER = [
  "Today's card and this week's, with the price and what $5 wins.",
  "A live count on each leg while the game is on.",
  "Build a bet, or change a prop when you picked the wrong one.",
  "The wins, the losses, and every ticket still open.",
  "Send a bet to a friend, or read the one they send back.",
];

function billingKey(member) {
  if (!member || member.plan !== "pro") return "";
  return "pro";
}

function billingWhen(iso) {
  const time = Date.parse(iso || "");
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" }).format(new Date(time));
}

function paintBilling(member) {
  const line = document.getElementById("activity-plan");
  const box = document.getElementById("billing-plans");
  if (!line || !box) return;
  const key = billingKey(member);
  if (key && member.subStatus === "past_due") line.textContent = "Your card didn't go through. Update it and the VIP Pass stays on.";
  else if (key) line.textContent = billingWhen(member.periodEnd) ? "You're on the VIP Pass. It runs through " + billingWhen(member.periodEnd) + "." : "You're on the VIP Pass.";
  else if (member.admin) line.textContent = "Admin. The board stays open.";
  else if (member.trial && billingWhen(member.trialEndsAt)) line.textContent = (member.beta ? "Beta trial" : "Free trial") + " through " + billingWhen(member.trialEndsAt) + ". Then $19.99 a month.";
  else if (member.board === false) line.textContent = "Your free trial is over. Get the VIP Pass to keep the board.";
  else line.textContent = "Free membership. The board is open.";
  const manage = member.billing ? `<button type="button" id="billing-manage">Manage billing</button>` : "";
  const offer = `<div class="vip-offer"><p>${esc(VIP_LINE)}</p><ul>${VIP_OFFER.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`;
  box.innerHTML = BILLING_PLANS.map((plan) => {
    const on = plan.id === key;
    return `<button type="button" data-plan="${plan.id}"${on ? " disabled" : ""}><b>${esc(plan.name)}</b> · ${esc(plan.price)}</button>`;
  }).join("") + manage + offer;
}

async function openBilling(path, body) {
  const note = document.getElementById("billing-note");
  if (note) note.textContent = path === "/api/billing/portal" ? "Opening your billing page." : "Opening checkout.";
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Billing could not open.");
  if (data.url) { location.href = data.url; return; }
  if (data.same && note) { note.textContent = "That's already your plan."; return; }
  if (data.switched) { if (note) note.textContent = "Plan updated."; if (window.refreshActivity) refreshActivity(); }
}

function billingBack() {
  const flag = new URLSearchParams(location.search).get("billing");
  if (!flag) return;
  const wait = setInterval(() => {
    if (flag !== "cancel" && !window.memberReady) return;
    clearInterval(wait);
    if (typeof showTab === "function") showTab("profile");
    if (window.goFull) goFull();
    const note = document.getElementById("billing-note");
    if (flag === "cancel" && note) note.textContent = "Checkout closed. Nothing was charged.";
    if (flag === "wait" && note) note.textContent = "Still confirming the payment. Refresh in a moment.";
    history.replaceState({}, "", location.pathname);
  }, 200);
  setTimeout(() => clearInterval(wait), 8000);
}

window.paintBilling = paintBilling;
window.openBilling = openBilling;
document.getElementById("pane-profile").addEventListener("click", (event) => {
  const plan = event.target.closest("[data-plan]");
  const manage = event.target.closest("#billing-manage");
  if (!plan && !manage) return;
  openBilling(manage ? "/api/billing/portal" : "/api/billing/checkout", manage ? {} : { plan: plan.dataset.plan }).catch((error) => {
    const note = document.getElementById("billing-note");
    if (note) note.textContent = error.message;
  });
});
if (window.memberCard) paintBilling(window.memberCard);
billingBack();
