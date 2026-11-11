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
  const match = full && /^(NBA|NFL|NHL)$/.test(full.sport) && [...holder.querySelectorAll(".find-match")].pop();
  if (!match || match.querySelector(":scope > .find-script")) return;
  const box = document.createElement("details");
  box.className = "find-score find-script";
  box.style.gridColumn = "1 / -1";
  box.innerHTML = `<summary><b class="find-script-head">Game script</b><p class="quiet">${full.sport === "NFL" ? "Reading both offenses." : full.sport === "NHL" ? "Reading both teams." : "Reading both rotations."}</p></summary>`;
  const sum = box.querySelector("summary");
  const call = match.querySelector(".find-pick"), top = call && call.parentElement;
  if (top && top.parentElement === match) top.after(box);
  else { const crowd = match.querySelector(":scope > .find-everyone, :scope > .find-body"); if (crowd) crowd.before(box); else match.append(box); }
  const key = `${full.match}|${full.kickoff}`, props = nbaScriptProps(people, full.match);
  const ask = (list) => { const id = `${list}|${key}`; let job = nbaScriptJobs.get(id); if (!job) { job = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list, match: full.match, kickoff: full.kickoff, props }) }).then((res) => res.json()).catch(() => ({})); nbaScriptJobs.set(id, job); job.then((data) => { if (!data || !(data.summary || (data.sections || []).length)) nbaScriptJobs.delete(id); }); } return job; };
  const got = { nba: null, story: null, nbaDone: false, storyDone: false };
  const brief = () => holder.querySelector(".find-brief:not(.find-script .find-brief)");
  const adopt = () => { const node = brief(); if (node && box.isConnected) { node.open = false; box.append(node); } };
  setTimeout(adopt, 0);
  const paint = () => {
    if (!box.isConnected) return;
    const nba = got.nba && got.nba.summary ? got.nba : null, story = got.story && (got.story.sections || []).length ? got.story : null;
    if (!nba && !story) { if (got.nbaDone && got.storyDone) { const node = box.querySelector(".find-brief"); if (node) box.before(node); box.remove(); } return; }
    const data = box.querySelector(":scope > .find-brief");
    sum.replaceChildren(sum.firstElementChild);
    [...box.children].forEach((node) => { if (node !== sum && node !== data) node.remove(); });
    const add = (node) => (data ? data.before(node) : box.append(node)); box.classList.toggle("has-story", !!story);
    const short = document.createElement("p"); short.className = "find-script-short";
    if (story && (story.plays || []).length) short.textContent = story.plays.join(" ");
    else if (nba) short.textContent = (nba.parts || []).flatMap((part) => String(part.proof || "").split("\n")).map((line) => line.match(/^(.+?) (Over|Under) ([\d.]+) ([^,]+), ([+-]?\d+):.*?that is (\d+%)\. \S+ needs ([\d.]+%)/)).filter(Boolean).map(([, who, side, num, stat, price, pct, need]) => `${who.trim().split(/\s+/).pop()} ${side} ${num} ${stat.replace(/points/i, "pts")} ${price}: ${pct} here, needs ${need}.`).join(" ");
    if (nba && !(story && (story.plays || []).length)) { const lead = document.createElement("p"); lead.className = "find-script-lead"; lead.textContent = nba.summary; sum.append(lead); }
    if (short.textContent) sum.append(short);
    if (!got.storyDone) { const wait = document.createElement("p"); wait.className = "quiet"; wait.textContent = "Reading the matchups."; sum.append(wait); }
    if (nba && story) { const lead = document.createElement("p"); lead.className = "find-script-lead"; lead.textContent = nba.summary; add(lead); }
    if (story && (story.plays || []).length) { const block = document.createElement("div"); block.className = "find-script-part"; block.innerHTML = `<b>How it plays out</b><p>${esc(story.plays.join(" "))}</p>`; add(block); }
    ((story && story.sections) || []).forEach((part) => { const block = document.createElement("div"); block.className = "find-script-part"; block.innerHTML = `<b>${esc(part.title || "")}</b>${(part.lines || []).map((line) => `<p>${esc(line)}</p>`).join("")}`; add(block); });
    ((nba && nba.parts) || []).forEach((part) => { const block = document.createElement("div"); block.className = "find-script-part"; block.innerHTML = `<b>${esc(part.title || "")}</b><p>${esc(part.text || "")}</p>${String(part.proof || "").split("\n").filter(Boolean).map((line) => `<p class="find-script-proof">${esc(line)}</p>`).join("")}`; add(block); });
  };
  ask("nba").then((data) => { got.nba = data; got.nbaDone = true; paint(); });
  ask("story").then((data) => { got.story = data; got.storyDone = true; paint(); });
}

if (typeof paintTotal === "function") {
  const paintTotalBase = paintTotal;
  paintTotal = function (holder, game, people) {
    paintTotalBase.apply(this, arguments);
    nbaScript(holder, game, people);
  };
}
