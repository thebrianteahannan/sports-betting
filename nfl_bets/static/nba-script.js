/** The NBA game script on the game card, under who is projected to win. */

const nbaScriptJobs = new Map();

function nbaScriptProps(people, match) {
  const rows = [];
  (people || []).forEach((person) => {
    if (person.kind !== "player") return;
    (person.bets || []).forEach((bet) => {
      const text = `${bet.market || ""} ${bet.label || ""}`;
      if (bet.match !== match || !/\d/.test(text) || /under|quarter|qtr|half|each|most|touchdown|1st|first|minutes|double|triple/i.test(text)) return;
      rows.push({ label: bet.label, market: bet.market, odds: bet.odds });
    });
  });
  return rows;
}

function nbaScript(holder, game, people) {
  const full = game && ((window.state && state.board && state.board.games) || []).find((row) => row.match === game.match && row.kickoff === game.kickoff);
  const match = full && /^(NBA|NFL)$/.test(full.sport) && [...holder.querySelectorAll(".find-match")].pop();
  if (!match || match.querySelector(":scope > .find-script")) return;
  const box = document.createElement("div");
  box.className = "find-score find-script";
  box.style.gridColumn = "1 / -1";
  box.innerHTML = `<b class="find-script-head">Game script</b><p class="quiet">${full.sport === "NFL" ? "Reading both offenses." : "Reading both rotations."}</p>`;
  const call = match.querySelector(".find-pick"), top = call && call.parentElement;
  if (top && top.parentElement === match) top.after(box);
  else { const crowd = match.querySelector(":scope > .find-everyone, :scope > .find-body"); if (crowd) crowd.before(box); else match.append(box); }
  const key = `${full.match}|${full.kickoff}`;
  let job = nbaScriptJobs.get(key);
  if (!job) {
    job = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "nba", match: full.match, kickoff: full.kickoff, props: nbaScriptProps(people, full.match) }) }).then((res) => res.json()).catch(() => ({}));
    nbaScriptJobs.set(key, job);
    job.then((data) => { if (!data || !data.summary) nbaScriptJobs.delete(key); });
  }
  job.then((data) => {
    if (!box.isConnected) return;
    if (!data || !data.summary) { box.remove(); return; }
    box.querySelector(".quiet").remove();
    const lead = document.createElement("p");
    lead.className = "find-script-lead";
    lead.textContent = data.summary;
    box.append(lead);
    (data.parts || []).forEach((part) => {
      const block = document.createElement("div");
      block.className = "find-script-part";
      block.innerHTML = `<b>${esc(part.title || "")}</b><p>${esc(part.text || "")}</p>${String(part.proof || "").split("\n").filter(Boolean).map((line) => `<p class="find-script-proof">${esc(line)}</p>`).join("")}`;
      box.append(block);
    });
  });
}

if (typeof paintTotal === "function") {
  const paintTotalBase = paintTotal;
  paintTotal = function (holder, game, people) {
    paintTotalBase.apply(this, arguments);
    nbaScript(holder, game, people);
  };
}
