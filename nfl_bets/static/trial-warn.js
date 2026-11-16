/** Once a day in the last 3 days of a free trial: remind them the board closes soon. */
function trialWarnDay() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function trialWarnDaysLeft(iso) {
  const end = Date.parse(iso || "");
  if (!Number.isFinite(end) || end <= Date.now()) return 0;
  const stamp = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const a = Date.parse(`${stamp(Date.now())}T12:00:00`);
  const b = Date.parse(`${stamp(end)}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function trialWarnKey(member) {
  return `pod-trial-warn:${member && (member.id || member.email) || ""}`;
}

function trialWarnSeen(member) {
  try { return localStorage.getItem(trialWarnKey(member)) === trialWarnDay(); } catch (error) { return false; }
}

function trialWarnMark(member) {
  try { localStorage.setItem(trialWarnKey(member), trialWarnDay()); } catch (error) {}
}

function trialWarnShut() {
  const box = document.getElementById("trial-warn");
  if (box) box.hidden = true;
  document.body.classList.remove("trial-warn-on");
}

function trialWarnOpen(days, member) {
  const box = document.getElementById("trial-warn");
  const title = document.getElementById("trial-warn-title");
  const say = document.getElementById("trial-warn-say");
  const when = document.getElementById("trial-warn-when");
  if (!box || !title || !say) return;
  const label = days === 1 ? "1 day left on your free trial" : `${days} days left on your free trial`;
  title.textContent = label;
  say.textContent = days === 1
    ? "Tomorrow the free board closes. VIP Pass keeps tonight's picks, Build a bet, and the live counts for $19.99 a month."
    : "VIP Pass keeps tonight's picks, Build a bet, and the live counts after the trial. $19.99 a month.";
  if (when) {
    const end = window.billingWhen ? billingWhen(member.trialEndsAt) : "";
    when.textContent = end ? `Trial ends ${end}.` : "";
    when.hidden = !end;
  }
  trialWarnMark(member);
  box.hidden = false;
  document.body.classList.add("trial-warn-on");
}

function trialWarnBusy() {
  if (document.body.classList.contains("needs-member")) return true;
  if (document.body.classList.contains("hang-on")) return true;
  const hang = document.getElementById("hang");
  if (hang && !hang.hidden) return true;
  if (window.tvTick && tvTick.at === "meet") return true;
  return false;
}

let trialWarnLooking = false;

function trialWarnMaybe(member) {
  if (!member || member.admin || member.plan === "pro" || !member.trial || member.board === false) return;
  const days = trialWarnDaysLeft(member.trialEndsAt);
  if (days < 1 || days > 3) return;
  if (trialWarnSeen(member) || trialWarnLooking) return;
  trialWarnLooking = true;
  let tries = 0;
  const wait = setInterval(() => {
    if (++tries > 40) { clearInterval(wait); trialWarnLooking = false; return; }
    if (trialWarnBusy()) return;
    if (trialWarnSeen(member)) { clearInterval(wait); trialWarnLooking = false; return; }
    clearInterval(wait);
    trialWarnLooking = false;
    trialWarnOpen(days, member);
  }, 700);
}

window.trialWarnMaybe = trialWarnMaybe;
window.trialWarnShut = trialWarnShut;

const trialWarnBox = document.getElementById("trial-warn");
if (trialWarnBox) {
  trialWarnBox.addEventListener("click", (event) => {
    if (event.target === trialWarnBox || event.target.closest("#trial-warn-x") || event.target.closest("[data-trial-warn='later']")) {
      trialWarnShut();
      return;
    }
    if (event.target.closest("[data-trial-warn='pay']")) {
      trialWarnShut();
      if (window.openBilling) {
        openBilling("/api/billing/checkout", { plan: "pro" }).catch((error) => {
          const note = document.getElementById("billing-note");
          if (note) note.textContent = error.message;
          else alert(error.message || "Billing could not open.");
        });
      } else if (window.goFull && typeof showTab === "function") {
        goFull();
        showTab("profile");
      }
    }
  });
}
