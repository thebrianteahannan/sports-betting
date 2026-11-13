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
  const recLegs = new Set([...scriptRecSigs].flatMap((sig) => sig.split("||")));
  if (typeof parlayLeg !== "undefined") document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key, prop = line.querySelector("span i.prop"), bet = key && parlayLeg.get(key);
    if (!prop || !bet) return;
    const pill = line.querySelector(".find-rec-pill") || scriptRecPill(bet) || (recLegs.has(scriptRecSig([bet])) && scriptRecPill({ ...bet, rec: true }));
    if (pill) prop.after(pill);
  });
  if (typeof parlayLeg === "undefined" || !parlayLeg.size || !scriptRecSigs.has(scriptRecSig([...parlayLeg.values()]))) return;
  document.querySelectorAll(".find-tray .find-ticket > b").forEach((head) => {
    if (head.querySelector("i.rc")) return;
    const tag = document.createElement("i"); tag.className = "rc"; tag.textContent = "Recommended";
    const same = head.querySelector("i.sg"); if (same) same.after(tag); else head.append(tag);
  });
}

const scriptRecAll = new Map();
const SCRIPT_KIND = { safe: ["Safe", "Picked to hit. Judged by how often it wins."], balanced: ["Balanced", "Near even money. Judged by wins and dollars both."], payout: ["Payout", "Picked for the price. Judged by the dollars it makes over many bets."] };
const SCRIPT_BASIS = { math: ["Math", "His record beats the price."], script: ["Script", "The game script points to it."], both: ["Math + script", "His record beats the price and the game script points to it."] };

function scriptKindOf(odds) {
  const o = Number(odds);
  return o <= -150 ? "safe" : o <= 100 ? "balanced" : "payout";
}

function scriptKindSay(pick) {
  const key = pick.kind || scriptKindOf(pick.odds), kind = SCRIPT_KIND[key], basis = SCRIPT_BASIS[pick.basis], good = pick.tier === "good";
  return { key: good ? "good" : key, text: good ? `Good bet · ${kind[0]}` : `${kind[0]}${basis ? ` · ${basis[0]}` : ""}`, tip: good ? `The record clears the price, but ${pick.drop || "it misses a rule"}. It stays off the recommended record.` : `${kind[1]}${basis ? ` ${basis[1]}` : ""}` };
}

function scriptKindTag(pick) {
  if (!pick) return "";
  const say = scriptKindSay(pick);
  return `<i class="bet-kind k-${say.key}" title="${esc(say.tip)}">${esc(say.text)}</i>`;
}

function scriptRecPill(bet) {
  const info = bet && scriptRecAll.get(`${bet.label}|${bet.market}`);
  if (!bet || !(bet.rec || info)) return null;
  const say = scriptKindSay({ odds: bet.odds, ...(info || {}) }), good = say.key === "good";
  const pill = document.createElement("i");
  pill.className = `find-rec-pill${good ? " good" : ""}`; pill.textContent = good ? "Good bet" : `Recommended · ${say.text.split(" · ")[0]}`; pill.title = say.tip;
  return pill;
}

function scriptRecMark(match, bets) {
  if (!match) return;
  const fold = (text) => (typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase());
  if (bets) {
    const picks = [bets, bets.stars].filter(Boolean).flatMap((set) => set.picks || []), size = scriptRecAll.size;
    match.scriptRec = { names: new Set(picks.map((pick) => fold(pick.who))), bets: new Set(picks.map((pick) => `${pick.label}|${pick.market}`)) };
    picks.forEach((pick) => scriptRecAll.set(`${pick.label}|${pick.market}`, { kind: pick.kind, basis: pick.basis, tier: pick.tier, drop: pick.drop }));
    if (scriptRecAll.size !== size && document.querySelector(".find-tray .find-tray-swap") && typeof legSwapPaint === "function") legSwapPaint();
  }
  const rec = match.scriptRec;
  if (!rec) return;
  const mark = (chip, on, test) => {
    chip.classList.toggle("find-rec", on);
    const go = chip.querySelector(":scope > button.find-rec-go");
    if (on && !go) {
      const button = document.createElement("button"); button.type = "button"; button.className = "find-rec-go"; button.title = "See Parlay's recommendation"; button.setAttribute("aria-label", button.title);
      button.addEventListener("click", (event) => { event.stopPropagation(); scriptRecJump(match, test); });
      const plus = chip.querySelector(":scope > .find-plus"); if (plus) plus.before(button); else chip.append(button);
    }
    if (!on && go) go.remove();
  };
  match.querySelectorAll(".find-everyone .find-chip").forEach((chip) => { const name = fold(chip.firstElementChild ? chip.firstElementChild.textContent.replace(/, out$/, "") : ""); mark(chip, rec.names.has(name), (info) => String(info.who || "").split("|").some((who) => fold(who) === name)); });
  match.querySelectorAll(".find-line-chip").forEach((chip) => { const key = `${chip.dataset.label}|${chip.dataset.market}`; mark(chip, rec.bets.has(key), (info) => String(info.legs || "").split("||").includes(key)); });
  const board = match.closest(".find-board"), head = board && board.querySelector(".find-list > .find-profile > h3");
  if (!head) return;
  const name = fold(((head.firstChild && head.firstChild.textContent) || "").split(",")[0]), on = rec.names.has(name);
  const tag = head.querySelector(":scope > i.find-rec-tag");
  if (on && !tag) { const pill = document.createElement("i"); pill.className = "find-rec-tag"; pill.textContent = "Recommended"; pill.title = "See Parlay's recommendation with him"; pill.addEventListener("click", (event) => { event.stopPropagation(); scriptRecJump(match, (info) => String(info.who || "").split("|").some((who) => fold(who) === name)); }); head.append(pill); }
  if (!on && tag) tag.remove();
}

function scriptRecInfo(set, parlay) {
  const legs = parlay.legs.map((at) => set.picks[at] || {});
  return { who: legs.map((pick) => pick.who).join("|"), legs: legs.map((pick) => `${pick.label}|${pick.market}`).join("||") };
}

function scriptRecShow(tab) {
  const box = tab.closest(".find-bets"), block = tab.closest(".find-script-bets"), match = tab.closest(".find-match");
  if (match && match.classList.contains("find-game-shut")) { const fold = match.querySelector(":scope > .find-when .find-game-fold"); if (fold) fold.click(); else match.classList.remove("find-game-shut"); }
  box.open = true; block.hidden = false; tab.click();
  const tray = document.querySelector(".find-board .find-tray:not([hidden]):not(.find-shut)"), fold = tray && tray.querySelector(".find-fold");
  if (fold) { fold.click(); if (typeof saveAutoShut !== "undefined") { saveAutoShut.add(tray); saveFoldAt = Date.now(); } }
  block.style.scrollMarginTop = "5.5rem";
  if (window.gameScrollQuit) gameScrollQuit();
  if (typeof gameScrollTo === "function") gameScrollTo(block); else block.scrollIntoView({ block: "start" });
}

function scriptRecJump(match, test) {
  const box = match && match.querySelector(":scope > .find-bets");
  if (!box) return;
  if (match.classList.contains("find-game-shut")) { const fold = match.querySelector(":scope > .find-when .find-game-fold"); if (fold) fold.click(); else match.classList.remove("find-game-shut"); }
  const find = () => [...box.querySelectorAll(":scope > .find-script-bets .find-script-tabs button[data-who]")].find((tab) => test(tab.dataset));
  let tab = find();
  if (!tab && box.scriptBets) {
    const bets = box.scriptBets, group = [bets, bets.stars].filter(Boolean).flatMap((set) => (set.groups || []).filter((row) => (row.parlays || []).some((parlay) => test(scriptRecInfo(set, parlay)))))[0];
    const block = group && [...box.querySelectorAll(":scope > .find-script-bets")].find((node) => node.dataset.team === group.name), check = block && block.querySelector("label.find-script-stars input");
    if (check) { check.click(); tab = find(); }
  }
  if (tab) { scriptRecShow(tab); return; }
  box.open = true; box.style.scrollMarginTop = "5.5rem";
  if (typeof gameScrollTo === "function") gameScrollTo(box);
}

function scriptRecGo() {
  if (typeof parlayLeg === "undefined" || !parlayLeg.size) return;
  const sig = scriptRecSig([...parlayLeg.values()]);
  const find = () => [...document.querySelectorAll("#desk-glass-in .find-bets .find-script-tabs button")].find((tab) => tab.dataset.sig === sig);
  const flip = () => [...document.querySelectorAll("#desk-glass-in .find-bets")].some((box) => {
    const bets = box.scriptBets, game = box.scriptGame; if (!bets) return false;
    const group = [bets, bets.stars].filter(Boolean).flatMap((set) => (set.groups || []).filter((row) => (row.parlays || []).some((parlay) => scriptRecSig(parlay.legs.map((at) => ({ ...set.picks[at], match: game.match }))) === sig)))[0];
    const block = group && [...box.querySelectorAll(":scope > .find-script-bets")].find((node) => node.dataset.team === group.name), check = block && block.querySelector("label.find-script-stars input");
    if (check) check.click(); return !!check;
  });
  const show = scriptRecShow;
  const now = find() || (flip() && find()); if (now) { show(now); return; }
  const seek = document.querySelector(".find-tray:not([hidden]) button.find-leg-seek"); if (!seek) return;
  seek.click();
  let tries = 0, flipped = false;
  const wait = setInterval(() => { const tab = find() || (!flipped && (flipped = flip()) && find()); if (tab || ++tries > 50) { clearInterval(wait); if (tab) show(tab); } }, 200);
}

document.addEventListener("click", (event) => { if (event.target.closest && event.target.closest(".find-tray .find-ticket > b i.rc")) scriptRecGo(); });

function scriptRecLeg(line) {
  const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key, bet = key && typeof parlayLeg !== "undefined" && parlayLeg.get(key);
  if (!bet) return;
  const want = `${bet.label}|${bet.market}`, test = (info) => String(info.legs || "").split("||").includes(want);
  const hit = () => [...document.querySelectorAll("#desk-glass-in .find-match")].find((match) => match.scriptRec && match.scriptRec.bets.has(want) && match.querySelector(":scope > .find-bets"));
  const now = hit(); if (now) { scriptRecJump(now, test); return; }
  const seek = line.querySelector("button.find-leg-seek"); if (!seek) return;
  seek.click();
  let tries = 0;
  const wait = setInterval(() => { const match = hit(); if (match || ++tries > 50) { clearInterval(wait); if (match) scriptRecJump(match, test); } }, 200);
}

document.addEventListener("click", (event) => { const pill = event.target.closest && event.target.closest(".find-tray .find-chose .find-rec-pill"); if (pill) scriptRecLeg(pill.closest(".find-chose")); });

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
  box.scriptBets = bets; box.scriptGame = game;
  const keep = {};
  const starOn = (name) => (localStorage.getItem(`scriptStars:${name}`) ?? localStorage.getItem("scriptStars")) === "1";
  const stars = (name) => {
    const label = document.createElement("label"); label.className = "find-hide find-script-stars";
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = starOn(name);
    check.addEventListener("change", () => {
      try { localStorage.setItem(`scriptStars:${name}`, check.checked ? "1" : "0"); } catch (error) { console.log("[nba-script] could not keep the stars box", error); }
      const block = label.closest(".find-script-bets"), team = block && block.dataset.team, glass = document.getElementById("desk-glass-in"), at = label.getBoundingClientRect().top;
      fill();
      const again = [...box.querySelectorAll(":scope > .find-script-bets")].find((node) => node.dataset.team === team) || box.querySelector(":scope > .find-script-bets, :scope > .find-script-none");
      const spot = again && (again.querySelector("label.find-script-stars") || again);
      if (glass && spot && glass.contains(spot)) glass.scrollTop += spot.getBoundingClientRect().top - at;
    });
    label.append(check, " Only star players"); return label;
  };
  const fill = () => {
    box.querySelectorAll(":scope > .find-script-bets, :scope > .find-script-none").forEach((node) => node.remove());
    const pick = (name) => (starOn(name) && bets.stars !== undefined ? bets.stars : bets) || { groups: [], picks: [] };
    const names = [...new Set([...(bets.groups || []), ...((bets.stars && bets.stars.groups) || [])].map((group) => group.name))];
    if (!names.length) { const none = document.createElement("p"); none.className = "find-script-why find-script-none"; none.textContent = "No star has a prop tonight whose record clears its price."; box.append(none); return; }
    names.forEach((name) => { const set = pick(name); const group = (set.groups || []).find((row) => row.name === name) || { name, parlays: [] }; const block = scriptBetsBlock({ picks: set.picks || [] }, group, game, people, keep); block.dataset.team = name; if (bets.stars !== undefined) block.querySelector(":scope > .find-script-tabs").append(stars(name)); box.append(block); });
    const match = box.closest(".find-match"); if (match) scriptBetsSide(match, box);
  };
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

function scriptBetsBlock(bets, group, game, people, keep = {}) {
  const money = (odds) => (odds > 0 ? `+${odds}` : String(odds));
  const who = (pick) => `<span class="find-script-who" data-who="${esc(pick.who)}" title="Search ${esc(pick.who)}">${esc(pick.who)}</span> (${esc([pick.pos, pick.team].filter(Boolean).join(", "))})`;
  const mine = bets.picks.filter((pick) => pick.team === group.name);
  const block = document.createElement("div"); block.className = "find-script-part find-script-bets";
  const club = group.name !== "Both teams" && scriptClub(game, group.name);
  if (club) { block.classList.add("find-script-club"); block.style.borderLeftColor = club.color; block.style.backgroundImage = `linear-gradient(90deg, ${club.color}4d, ${club.color}12 80%)`; }
  block.innerHTML = `<b${club ? ` style="color: ${club.text}"` : ""}>${esc(group.name)}</b>${mine.map((pick) => `<div class="find-script-pick"${club ? "" : scriptClubStyle(game, pick.team)}><p><strong>${who(pick)} ${esc(pick.text)}, ${money(pick.odds)}.</strong> ${scriptKindTag(pick)}</p><p class="find-script-why"><em>Why:</em> ${esc(pick.how || `Hit in ${pick.hits} of his last ${pick.n}. Needs ${pick.need}.`)}</p></div>`).join("")}`;
  const tabs = document.createElement("div"); tabs.className = "find-script-tabs";
  const card = document.createElement("div"); card.className = "find-script-ticket";
  const show = (parlay, edit) => {
    tabs.querySelectorAll("button").forEach((node) => node.classList.toggle("on", Number(node.dataset.size) === parlay.size));
    const legs = edit || parlay.legs.map((at) => bets.picks[at]), deal = edit && typeof recLegDeal === "function" ? recLegDeal(legs) : parlay;
    const top = `<div class="find-script-top"><i class="px">${money(deal.odds)}</i><i class="pct">${esc(deal.need)}</i><i class="pay">$5 profits $${deal.wins.toFixed(2)}</i>${scriptKindTag({ kind: scriptKindOf(deal.odds) })}${parlay.size > 1 ? `<i class="sg">Same game</i>` : ""}</div>`;
    const rows = legs.map((pick) => `<div class="find-script-leg" data-who="${esc(pick.who)}" data-label="${esc(pick.label)}" data-market="${esc(pick.market)}" data-odds="${esc(pick.odds)}"${scriptClubStyle(game, pick.team)}><i class="px">${money(pick.odds)}</i><i class="pct">${esc(typeof findPct === "function" ? findPct(pick.odds) : "")}</i><i class="who">${esc(pick.who)}</i><i class="tm">${esc([pick.team, pick.pos].filter(Boolean).join(" · "))}</i><i class="prop">${esc(pick.text)}</i>${scriptKindTag(pick)}</div>`).join("");
    card.innerHTML = `${top}${rows}${parlay.how && !edit ? `<p class="find-script-why"><em>Why:</em> ${esc(parlay.how)}</p>` : ""}${parlay.size > 1 ? `<p class="find-script-proof">FanDuel prices same-game parlays itself, so the slip can pay less than this.</p>` : ""}`;
    if (typeof recLegTools === "function") recLegTools(card, legs, game, people, (next) => show(parlay, next), edit);
    if (game.sport === "NBA" && typeof proofScript === "function") proofScript(card);
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
      if (tray && typeof saveAutoShut !== "undefined") saveAutoShut.delete(tray);
      if (tray && tray.classList.contains("find-shut") && fold) fold.click();
      const glass = document.getElementById("desk-glass-in");
      if (glass) glass.scrollTo({ top: 0, behavior: "smooth" });
    });
    card.append(go);
  };
  const sizes = [...new Set([...(group.name === "Both teams" ? [2, 3, 4] : [1, 2, 3, 4]), ...group.parlays.map((parlay) => parlay.size)])].sort((a, b) => a - b);
  sizes.forEach((size) => {
    const parlay = group.parlays.find((row) => row.size === size), tab = document.createElement("button"); tab.type = "button"; tab.dataset.size = size; tab.textContent = size === 1 ? "Single" : `${size} legs`;
    if (parlay) { tab.dataset.sig = scriptRecSig(parlay.legs.map((at) => ({ ...bets.picks[at], match: game.match }))); Object.assign(tab.dataset, scriptRecInfo(bets, parlay)); }
    if (parlay) tab.addEventListener("click", (event) => { event.preventDefault(); keep[group.name] = size; show(parlay); }); else { tab.disabled = true; tab.title = "Not enough bets clear their price for this size"; }
    tabs.append(tab);
  });
  block.append(tabs);
  if (group.parlays.length) { block.append(card); show(group.parlays.find((parlay) => parlay.size === keep[group.name]) || group.parlays[0]); }
  else { const none = document.createElement("p"); none.className = "find-script-why"; none.textContent = mine.length ? "Nothing here makes the recommended list tonight. The good bets above still clear their price." : "No star here has a prop tonight whose record clears its price."; block.append(none); }
  return block;
}

function nbaScript(holder, game, people) {
  const full = game && (((window.state && state.board && state.board.games) || []).find((row) => row.match === game.match && row.kickoff === game.kickoff) || (Date.parse(game.kickoff) <= Date.now() ? game : null));
  const match = full && /^(NBA|NFL|NHL)$/.test(full.sport) && [...holder.querySelectorAll(".find-match")].pop();
  if (!match || match.querySelector(":scope > .find-script")) return;
  const box = document.createElement("details");
  box.className = "find-score find-script";
  box.style.gridColumn = "1 / -1";
  box.innerHTML = `<summary><b class="find-script-head">Game script</b><p class="quiet">${full.sport === "NFL" ? "Reading both offenses." : full.sport === "NHL" ? "Reading both teams." : "Reading both rotations."}</p></summary>`;
  const sum = box.querySelector("summary");
  const call = match.querySelector(".find-pick"), top = call && call.parentElement;
  if (top && top.parentElement === match) top.after(box);
  else { const crowd = match.querySelector(":scope > .find-stacks.find-team-bets, :scope > .find-odds.find-team-bets, :scope > .find-everyone, :scope > .find-body"); if (crowd) crowd.before(box); else match.append(box); }
  const key = `${full.match}|${full.kickoff}`, props = nbaScriptProps(people, full.match);
  const ask = (list) => { const id = `${list}|${key}|${list === "story" ? props.length : ""}`; let job = nbaScriptJobs.get(id); if (!job) { job = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list, match: full.match, kickoff: full.kickoff, props }) }).then((res) => res.json()).catch(() => ({})); nbaScriptJobs.set(id, job); job.then((data) => { if (!data || !(data.summary || (data.sections || []).length)) nbaScriptJobs.delete(id); }); } return job; };
  const got = { nba: null, story: null, nbaDone: false, storyDone: false };
  const brief = () => holder.querySelector(".find-brief:not(.find-script .find-brief)");
  const adopt = () => { const node = brief(); if (node && box.isConnected) { node.open = false; node.style.gridColumn = "1 / -1"; box.after(node); } };
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
    if (story && story.bets && (story.bets.groups || []).length) { const fresh = scriptBetsBox(story.bets, full, people); scriptRecKeep(story.bets, full); scriptRecMark(match, story.bets); fresh.open = !!(oldBets && oldBets.open); if (oldBets) oldBets.replaceWith(fresh); else { const next = box.nextElementSibling; (next && next.classList.contains("find-brief") ? next : box).after(fresh); } scriptBetsSide(match, fresh); }
    ((nba && nba.parts) || []).forEach((part) => { const block = document.createElement("div"); block.className = "find-script-part"; block.innerHTML = `<b>${esc(part.title || "")}</b><p>${esc(part.text || "")}</p>${String(part.proof || "").split("\n").filter(Boolean).map((line) => `<p class="find-script-proof">${esc(line)}</p>`).join("")}`; add(block); });
  };
  ask("nba").then((data) => { got.nba = data; got.nbaDone = true; paint(); });
  ask("story").then((data) => { got.story = data; got.storyDone = true; paint(); });
  match.addEventListener("click", (event) => { if (!event.target.closest(".find-side-go")) return; setTimeout(() => { const bets = match.querySelector(":scope > .find-bets"); if (bets) scriptBetsSide(match, bets); }, 0); });
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest(".find-script-bets .find-script-who, .find-script-leg[data-who] i.who"), board = hit && hit.closest(".find-board");
  if (!board || typeof showFind !== "function") return;
  const name = hit.dataset.who || hit.closest("[data-who]").dataset.who, person = (board.people || []).find((row) => row.kind === "player" && row.name === name);
  const list = board.querySelector(".find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), roster = board.querySelector(":scope > .find-roster"), field = board.querySelector("label.find input");
  if (!person || !list || !hits) return;
  event.stopPropagation();
  if (field) { field.value = person.name; field.dispatchEvent(new Event("input", { bubbles: true })); }
  showFind(list, hits, person, roster, board.people);
});

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
