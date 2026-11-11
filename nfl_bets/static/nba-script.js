/** The NBA game script on the game card, under who is projected to win. */

const nbaScriptJobs = new Map();
const scriptRecSigs = new Set((() => { try { return JSON.parse(localStorage.getItem("scriptRecs") || "[]"); } catch (error) { return []; } })());
const scriptRecSig = (legs) => legs.map((leg) => `${leg.label}|${leg.market}|${leg.match}`).sort().join("||");

function scriptRecKeep(bets, game) {
  [bets, bets.stars].filter(Boolean).forEach((set) => (set.groups || []).forEach((group) => (group.parlays || []).forEach((parlay) => scriptRecSigs.add(scriptRecSig(parlay.legs.map((at) => ({ ...set.picks[at], match: game.match })))))));
  try { localStorage.setItem("scriptRecs", JSON.stringify([...scriptRecSigs].slice(-300))); } catch (error) { console.log("[nba-script] could not keep recommended bets", error); }
  if (typeof parlayLeg !== "undefined" && parlayLeg.size && typeof paintParlay === "function") paintParlay();
}

function scriptRecTag() {
  if (typeof parlayLeg === "undefined" || !parlayLeg.size || !scriptRecSigs.has(scriptRecSig([...parlayLeg.values()]))) return;
  document.querySelectorAll(".find-tray .find-ticket > b").forEach((head) => {
    if (head.querySelector("i.rc")) return;
    const tag = document.createElement("i"); tag.className = "rc"; tag.textContent = "Recommended";
    const same = head.querySelector("i.sg"); if (same) same.after(tag); else head.append(tag);
  });
}

function nbaScriptProps(people, match) {
  const rows = [];
  (people || []).forEach((person) => {
    if (person.kind !== "player") return;
    (person.bets || []).forEach((bet) => {
      const text = `${bet.market || ""} ${bet.label || ""}`;
      if (bet.match !== match || !/\d/.test(text) || /under|quarter|qtr|half|each|most|touchdown|1st|first|minutes|double|triple/i.test(text)) return;
      rows.push({ label: bet.label, market: bet.market, odds: bet.odds, who: person.name });
    });
  });
  return rows;
}

function scriptFits(legs, game) {
  const dec = (odds) => (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds), odds = legs.map((leg) => Number(leg.odds)), n = legs.length;
  const total = odds.reduce((sum, odd) => sum * dec(odd), 1), price = total >= 2 ? (total - 1) * 100 : -100 / (total - 1), chance = odds.map((odd) => 1 / dec(odd));
  const all = (test) => odds.every(test), et = new Date(game.kickoff || ""), hour = Number(et.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })), day = et.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short" });
  const fits = [];
  if (n === 2 && chance.every((p) => p >= 0.75)) fits.push("safe2");
  if (n === 3 && all((o) => o >= -400 && o <= -250)) fits.push("mid3");
  if (n === 4 && all((o) => o >= -300 && o <= -150)) fits.push("win4");
  if (n === 2 && all((o) => o >= 100 && o <= 200)) fits.push("plusLegs");
  if (n === 3 && chance.every((p) => p >= 0.85) && legs.every((leg) => /\+|alt/i.test(`${leg.market} ${leg.label}`))) fits.push("alt3");
  if (n >= 2 && n <= 4 && all((o) => o >= -700 && o <= -400) && price >= -230 && price <= -140) fits.push("chalk");
  if (n === 4 && chance.every((p) => p >= 0.75 && p <= 0.85)) fits.push("hits:four");
  if (price >= -150 && price <= 100) fits.push("band");
  if ((n === 2 || n === 3) && hour < 16 && all((o) => o >= -300 && o <= -130)) fits.push("early3");
  if (n === 3 && hour >= 19 && all((o) => o >= -300 && o <= -130)) fits.push("prime3");
  if (n === 4 && /Sat|Sun/.test(day) && all((o) => o >= -260 && o <= -140)) fits.push("weekend4");
  [5, 10, 15, 20, 25, 50].forEach((win) => { if (n >= 2 && Math.abs(total - (1 + win / 5)) <= 0.4) fits.push(`pay${win}`); });
  return fits;
}

function scriptFitRecord(fit) {
  const [card, part] = fit.split(":"), seen = new Map();
  ((window.state && state.board && state.board.archive) || []).forEach((ticket) => {
    if (ticket.card !== card || (ticket.result !== "won" && ticket.result !== "lost") || (part && typeof hitsPart === "function" && hitsPart(ticket) !== part)) return;
    const key = (ticket.legs || []).map((leg) => leg.label).join("|"), when = Date.parse(ticket.settledAt || ticket.offeredAt || ""), price = Number(ticket.american);
    if (!key || !Number.isFinite(price) || (seen.has(key) && seen.get(key).when > when)) return;
    seen.set(key, { when, won: ticket.result === "won", cash: ticket.result === "won" ? 5 * (price > 0 ? price / 100 : 100 / -price) : -5 });
  });
  const rows = [...seen.values()], won = rows.filter((row) => row.won).length;
  return { won, lost: rows.length - won, cash: rows.reduce((sum, row) => sum + row.cash, 0) };
}

function scriptFitLine(legs, game) {
  const names = window.CARD_NAMES || {};
  const lines = scriptFits(legs, game).map((fit) => {
    const name = fit === "hits:four" ? "Four near 80% each" : names[fit] || fit, rec = scriptFitRecord(fit), n = rec.won + rec.lost;
    if (!n) return `It fits "${name}".`;
    const money = `$5 on every ticket is ${rec.cash >= 0 ? "up" : "down"} $${Math.abs(rec.cash).toFixed(2)}`;
    return `It fits "${name}", which is ${rec.won}-${rec.lost} (${((rec.won / n) * 100).toFixed(1)}%). ${money}${n >= 10 ? `, so that is a ${rec.cash >= 0 ? "winning" : "losing"} strategy` : ""}.`;
  });
  return lines.length ? lines.join(" ") : "It does not fit any of the site's strategies.";
}

function scriptBetsBox(bets, game, people) {
  const box = document.createElement("details"); box.className = "find-score find-script find-bets"; box.style.gridColumn = "1 / -1";
  box.innerHTML = `<summary><b class="find-script-head">Parlay's Recommended Bets</b></summary>`;
  const fill = () => {
    box.querySelectorAll(":scope > .find-script-bets, :scope > .find-script-none").forEach((node) => node.remove());
    const set = localStorage.getItem("scriptStars") === "1" && bets.stars !== undefined ? bets.stars : bets;
    if (!set || !(set.groups || []).length) { const none = document.createElement("p"); none.className = "find-script-why find-script-none"; none.textContent = "No star has a prop tonight whose record clears its price. Uncheck the box for the rest of the roster."; box.append(none); return; }
    set.groups.forEach((group) => { const block = scriptBetsBlock(set, group, game, people); block.dataset.team = group.name; box.append(block); });
    const match = box.closest(".find-match"); if (match) scriptBetsSide(match, box);
  };
  if (bets.stars !== undefined) {
    const label = document.createElement("label"); label.className = "find-hide find-script-stars";
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = localStorage.getItem("scriptStars") === "1";
    check.addEventListener("change", () => { try { localStorage.setItem("scriptStars", check.checked ? "1" : "0"); } catch (error) { console.log("[nba-script] could not keep the stars box", error); } fill(); });
    label.append(check, " Only star players"); box.append(label);
  }
  fill();
  return box;
}

function scriptBetsSide(match, box) {
  const on = match.querySelector(":scope > .find-side-go.on"), team = on ? on.textContent.replace(/, \d+ bets?.*$/, "").trim().toLowerCase() : "";
  const blocks = [...box.querySelectorAll(":scope > .find-script-bets")];
  const mine = team ? blocks.filter((block) => block.dataset.team !== "Both teams" && team.endsWith(block.dataset.team.toLowerCase())) : [];
  blocks.forEach((block) => { block.hidden = mine.length ? !mine.includes(block) : false; });
}

function scriptClub(game, team) {
  const full = team && (String(game.match || "").split(/ @ | v /).map((side) => side.trim()).find((side) => side.endsWith(team)) || team);
  const pair = full && typeof clubPair === "function" ? clubPair(game.sport, full) : null;
  if (!pair || typeof clubColor !== "function") return null;
  const glow = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  const bright = glow(pair[0]) >= glow(pair[1]) ? pair[0] : pair[1];
  return { color: clubColor(game.sport, full) || pair[0], text: glow(bright) >= 110 ? bright : "#f4f7fb" };
}

function scriptClubStyle(game, team) {
  const club = scriptClub(game, team);
  return club ? ` style="border-left-color: ${club.color}; background: linear-gradient(90deg, ${club.color}66, ${club.color}1f 75%)"` : "";
}

function scriptBetsBlock(bets, group, game, people) {
  const money = (odds) => (odds > 0 ? `+${odds}` : String(odds));
  const who = (pick) => `${esc(pick.who)} (${esc([pick.pos, pick.team].filter(Boolean).join(", "))})`;
  const mine = bets.picks.filter((pick) => pick.team === group.name);
  const block = document.createElement("div"); block.className = "find-script-part find-script-bets";
  const club = group.name !== "Both teams" && scriptClub(game, group.name);
  if (club) { block.classList.add("find-script-club"); block.style.borderLeftColor = club.color; block.style.backgroundImage = `linear-gradient(90deg, ${club.color}4d, ${club.color}12 80%)`; }
  block.innerHTML = `<b${club ? ` style="color: ${club.text}"` : ""}>${esc(group.name)}</b>${mine.map((pick) => `<div class="find-script-pick"${club ? "" : scriptClubStyle(game, pick.team)}><p><strong>${who(pick)} ${esc(pick.text)}, ${money(pick.odds)}.</strong></p><p class="find-script-why"><em>Why:</em> ${esc(pick.how || `Hit in ${pick.hits} of his last ${pick.n}. Needs ${pick.need}.`)}</p></div>`).join("")}`;
  const tabs = document.createElement("div"); tabs.className = "find-script-tabs";
  const card = document.createElement("div"); card.className = "find-script-ticket";
  const show = (parlay) => {
    tabs.querySelectorAll("button").forEach((node) => node.classList.toggle("on", Number(node.dataset.size) === parlay.size));
    const legs = parlay.legs.map((at) => bets.picks[at]);
    const top = `<div class="find-script-top"><i class="px">${money(parlay.odds)}</i><i class="pct">${esc(parlay.need)}</i><i class="pay">$5 profits $${parlay.wins.toFixed(2)}</i>${parlay.size > 1 ? `<i class="sg">Same game</i>` : ""}</div>`;
    const rows = legs.map((pick) => `<div class="find-script-leg"${scriptClubStyle(game, pick.team)}><i class="px">${money(pick.odds)}</i><i class="pct">${esc(typeof findPct === "function" ? findPct(pick.odds) : "")}</i><i class="who">${esc(pick.who)}</i><i class="tm">${esc([pick.team, pick.pos].filter(Boolean).join(" · "))}</i><i class="prop">${esc(pick.text)}</i></div>`).join("");
    card.innerHTML = `${top}${rows}${parlay.how ? `<p class="find-script-why"><em>Why:</em> ${esc(parlay.how)}</p>` : ""}${parlay.size > 1 ? `<p class="find-script-proof">FanDuel prices same-game parlays itself, so the slip can pay less than this.</p>` : ""}`;
    const go = document.createElement("button"); go.type = "button"; go.className = "find-script-add"; go.textContent = "Build it";
    go.addEventListener("click", () => {
      if (typeof parlayLeg === "undefined") return;
      const found = legs.map((pick) => {
        const person = (people || []).find((row) => row.kind === "player" && row.name === pick.who);
        const bet = person && (person.bets || []).find((row) => row.label === pick.label && row.market === pick.market && row.match === game.match);
        return bet && { bet, person };
      }).filter(Boolean);
      if (!found.length) return;
      if (typeof saveLeave === "function") saveLeave();
      window.saveStacksOpen = false;
      parlayLeg.clear(); parlayPick.clear();
      found.forEach(({ bet, person }) => { parlayLeg.set(parlayKey(bet), bet); if (parlayPick.size < 8) parlayPick.set(person.key, person); });
      if (typeof saveNow === "function") saveNow();
      if (typeof paintParlay === "function") paintParlay();
      const tray = go.closest(".find-board") && go.closest(".find-board").querySelector(".find-tray:not([hidden])"), fold = tray && tray.querySelector(".find-fold");
      if (tray && tray.classList.contains("find-shut") && fold) fold.click();
      if (tray) tray.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    card.append(go);
  };
  group.parlays.forEach((parlay) => { const tab = document.createElement("button"); tab.type = "button"; tab.dataset.size = parlay.size; tab.textContent = parlay.size === 1 ? "Single" : `${parlay.size} legs`; tab.addEventListener("click", (event) => { event.preventDefault(); show(parlay); }); tabs.append(tab); });
  if (group.parlays.length) { block.append(tabs, card); show(group.parlays[0]); }
  return block;
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
    const oldBets = box.parentElement && box.parentElement.querySelector(":scope > .find-bets");
    if (story && story.bets && (story.bets.groups || []).length) { const fresh = scriptBetsBox(story.bets, full, people); scriptRecKeep(story.bets, full); fresh.open = !!(oldBets && oldBets.open); if (oldBets) oldBets.replaceWith(fresh); else box.after(fresh); scriptBetsSide(match, fresh); }
    ((nba && nba.parts) || []).forEach((part) => { const block = document.createElement("div"); block.className = "find-script-part"; block.innerHTML = `<b>${esc(part.title || "")}</b><p>${esc(part.text || "")}</p>${String(part.proof || "").split("\n").filter(Boolean).map((line) => `<p class="find-script-proof">${esc(line)}</p>`).join("")}`; add(block); });
  };
  ask("nba").then((data) => { got.nba = data; got.nbaDone = true; paint(); });
  ask("story").then((data) => { got.story = data; got.storyDone = true; paint(); });
  match.addEventListener("click", (event) => { if (!event.target.closest(".find-side-go")) return; setTimeout(() => { const bets = match.querySelector(":scope > .find-bets"); if (bets) scriptBetsSide(match, bets); }, 0); });
}

if (typeof paintParlay === "function") {
  const paintParlayRec = paintParlay;
  paintParlay = function () { paintParlayRec.apply(this, arguments); scriptRecTag(); };
}

if (typeof paintTotal === "function") {
  const paintTotalBase = paintTotal;
  paintTotal = function (holder, game, people) {
    paintTotalBase.apply(this, arguments);
    nbaScript(holder, game, people);
  };
}
