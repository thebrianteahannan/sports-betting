/** Paste a screenshot of a bet on the search page. Its legs become the parlay in the tray. */

const SHOT_STATS = [[/pass/, "pass"], [/receiv/, "recv"], [/rush/, "rush"], [/reception|catches/, "catch"], [/yard|\byds?\b/, "yd"], [/touchdown|\btds?\b/, "td"], [/point|\bpts\b/, "pt"], [/rebound|\brebs?\b/, "reb"], [/assist|\basts?\b/, "ast"], [/three|3-?pt|3pm/, "three"], [/shots? on goal|\bsog\b/, "sog"], [/strikeout/, "k"], [/save/, "save"], [/\bhits?\b/, "hit"], [/block/, "blk"], [/steal/, "stl"], [/attempt/, "att"], [/completion/, "cmp"], [/interception/, "int"], [/longest/, "long"], [/total bases/, "tb"], [/home run/, "hr"], [/\brbis?\b/, "rbi"]];
const SHOT_PART = /\b(1st|2nd|3rd|4th|first|second|third|fourth)\b|qtr|quarter|half|each|inning|period/;

function shotSig(text) {
  const low = String(text || "").toLowerCase();
  return SHOT_STATS.filter(([test]) => test.test(low)).map(([, name]) => name).sort().join(",");
}

function shotOdds(text) {
  const n = Number(String(text || "").replace(/[−–]/g, "-").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) && n ? n : null;
}

function shotTdKind(text) {
  const low = String(text || "").toLowerCase().replace(/\btds\b/g, "touchdowns").replace(/\btd\b/g, "touchdown");
  if (!/touchdown/.test(low) || /rush|receiv|pass/.test(low)) return "";
  if (/\blast\b/.test(low)) return "last";
  if (/any\s*time|anytime/.test(low)) return "anytime";
  if (/\b(first|1st)\b/.test(low) && !/half|quarter/.test(low)) return "first";
  const plus = low.match(/(?:to score\s*)?(\d+)\+\s*touchdown/) || low.match(/to score\s*(\d+)\+/);
  if (plus) return `${Number(plus[1])}+`;
  if (/touchdown scorer/.test(low)) return "anytime";
  return "td";
}

function shotTdWant(leg) {
  const market = String(leg.market || "");
  const kind = shotTdKind(market);
  if (kind === "anytime" || kind === "first" || kind === "last") return kind;
  if (kind === "td") {
    const line = leg.line == null || leg.line === "" ? null : Number(leg.line);
    if (line != null && Number.isFinite(line) && line >= 2) return `${Math.round(line)}+`;
    return "anytime";
  }
  if (/^\d+\+$/.test(kind)) return kind;
  return "";
}

function shotNorm(leg) {
  if (!leg) return leg;
  const want = shotTdWant(leg);
  if (want === "anytime") return { ...leg, market: "anytime touchdown", side: "", line: null };
  if (want === "first") return { ...leg, market: "first touchdown", side: "", line: null };
  const more = want && want.match(/^(\d+)\+$/);
  if (more) return { ...leg, market: `to score ${more[1]}+ touchdowns`, side: "over", line: Number(more[1]) };
  return leg;
}

function shotFits(bet, leg, rest) {
  const wantTd = shotTdWant(leg), haveTd = shotTdKind(`${rest} ${bet.market || ""}`);
  if (wantTd || haveTd) return wantTd === haveTd || (wantTd === "anytime" && haveTd === "anytime");
  const line = leg.line;
  const plus = rest.match(/(\d+(?:\.\d+)?)\+/);
  if (plus) { const n = Number(plus[1]); return line != null && leg.side !== "under" && (n === line || n === line + 0.5); }
  const ou = rest.match(/\b(over|under)\b\s*\(?(-?\d+(?:\.\d+)?)/i);
  if (ou) { const n = Number(ou[2]); return line != null && ou[1].toLowerCase() === leg.side && (n === line || (leg.side === "over" && n === line - 0.5)); }
  return (line == null || (line === 0.5 && leg.side !== "under")) && !/\d/.test(rest);
}

function shotBest(rows, leg) {
  const want = shotOdds(leg.odds);
  return rows.slice().sort((a, b) => (want == null ? 0 : Math.abs(Number(a.odds) - want) - Math.abs(Number(b.odds) - want)))[0] || null;
}

function shotBits(raw) {
  return String(raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function shotPerson(people, raw, leg) {
  const bits = shotBits(raw);
  if (!bits.length) return null;
  const players = (people || []).filter((who) => who && who.kind === "player");
  const partsOf = (who) => plainName(who.name).split(" ").filter(Boolean);
  const pick = (hits) => {
    if (hits.length <= 1) return hits[0] || null;
    const want = leg && shotSig(leg.market);
    const priced = want ? hits.filter((who) => (who.bets || []).some((bet) => shotSig(`${bet.label || ""} ${bet.market || ""}`) === want)) : [];
    return (priced.length === 1 ? priced : hits)[0];
  };
  const exact = players.find((who) => plainName(who.name) === bits.join(" "));
  if (exact) return exact;
  if (bits.length >= 2 && bits[0].length === 1) {
    const last = bits.slice(1).join(" ");
    const hits = players.filter((who) => { const parts = partsOf(who); return parts.length >= 2 && parts[0][0] === bits[0] && parts.slice(1).join(" ") === last; });
    if (hits.length) return pick(hits);
  }
  if (bits.length === 1 && bits[0].length > 3) {
    const hits = players.filter((who) => { const parts = partsOf(who); return parts.length >= 2 && parts[0][0] === bits[0][0] && parts.slice(1).join(" ") === bits[0].slice(1); });
    if (hits.length) return pick(hits);
  }
  if (bits.length === 1 && bits[0].length > 2) {
    const hits = players.filter((who) => partsOf(who).pop() === bits[0]);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function shotPlayer(people, leg) {
  leg = shotNorm(leg);
  const person = shotPerson(people, leg.player, leg);
  if (!person) return null;
  const sig = shotSig(leg.market), part = SHOT_PART.test(String(leg.market).toLowerCase());
  const rows = (person.bets || []).filter((bet) => {
    const rest = String(bet.label || "").replace(person.name, "").trim();
    const text = `${rest} ${String(bet.market || "").replace(person.name, "")}`.toLowerCase();
    if (SHOT_PART.test(text) !== part) return false;
    if (shotSig(text) !== sig) return false;
    return shotFits(bet, leg, rest);
  });
  const bet = shotBest(rows, leg);
  return bet ? { person, bet } : null;
}

function shotTeamOf(people, leg) {
  const words = plainName(leg.player).split(" ").filter(Boolean), teams = people.filter((who) => who.kind === "team");
  for (let k = words.length; k > 0; k -= 1) {
    const tail = words.slice(-k).join(" "), head = words.slice(0, -k).join(" ");
    let hits = teams.filter((who) => { const full = plainName(who.name); return full === tail || full.endsWith(` ${tail}`); });
    if (hits.length > 1 && head) {
      const city = (who) => plainName(who.name).slice(0, -tail.length).trim();
      const near = hits.filter((who) => city(who).startsWith(head) || city(who).split(" ").map((word) => word[0]).join("") === head.replace(/ /g, ""));
      if (near.length) hits = near;
    }
    if (hits.length > 1 && leg.match) {
      const sides = String(leg.match).split(/\s+(?:@|at|vs\.?|v)\s+/i).map((side) => plainName(side).split(" ").pop()).filter(Boolean);
      const near = hits.filter((who) => (who.bets || []).some((bet) => sides.every((side) => plainName(bet.match).includes(side))));
      if (near.length) hits = near;
    }
    if (hits.length) return hits[0];
  }
  return null;
}

function shotTeam(people, leg, game) {
  const team = shotTeamOf(people, leg);
  const market = String(leg.market || "").toLowerCase();
  const plain = (bet) => !SHOT_PART.test(`${bet.label} ${bet.market}`.toLowerCase());
  let rows = [];
  if (team && /win|moneyline/.test(market)) rows = team.bets.filter((bet) => /^moneyline$/i.test(bet.market) && bet.label === team.name);
  else if (team && /spread/.test(market)) rows = team.bets.filter((bet) => /spread/i.test(bet.market) && plain(bet) && Number(((bet.label || "").match(/\(([+-]?\d+(?:\.\d+)?)\)/) || [])[1]) === leg.line).sort((a, b) => /^spread$/i.test(b.market) - /^spread$/i.test(a.market));
  else if (team && /total/.test(market)) rows = team.bets.filter((bet) => /total/i.test(bet.market) && plain(bet) && shotFits(bet, leg, String(bet.label).split(":").pop()));
  else if (/total/.test(market) && game) rows = people.filter((who) => who.kind === "team").flatMap((who) => who.bets.filter((bet) => bet.match === game && /^(total|alternate total points?)$/i.test(bet.market) && shotFits(bet, leg, bet.label)));
  const bet = shotBest(rows, leg);
  if (!bet) return null;
  return { person: team && bet.label.startsWith(team.name) ? team : null, bet };
}

function shotGame(people, leg, found) {
  const sides = String(leg.match || "").split(/\s+(?:@|at|vs\.?|v)\s+/i).map(plainName).filter(Boolean);
  if (sides.length === 2) {
    const bet = people.filter((who) => who.kind === "team").flatMap((who) => who.bets).find((row) => { const match = plainName(row.match); return sides.every((side) => match.includes(side.split(" ").pop())); });
    if (bet) return bet.match;
  }
  return (found[0] && found[0].bet.match) || "";
}

const shotWant = new Map();

function shotWho(people, leg) {
  return shotPerson(people, leg.player, leg) || shotTeamOf(people, leg);
}

function shotWantHit(person, bet) {
  const want = shotWant.get(person.key), sig = want && shotSig(want);
  return Boolean(sig) && shotSig(`${String(bet.label || "").replace(person.name, "")} ${String(bet.market || "").replace(person.name, "")}`) === sig;
}

function shotLine(bet) {
  const label = String(bet.label || "");
  const hit = label.match(/(\d+(?:\.\d+)?)\+/) || label.match(/\b(?:over|under)\b\s*\(?(-?\d+(?:\.\d+)?)/i) || label.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  return hit ? Number(hit[1]) : null;
}

function shotNear(people, leg, game) {
  leg = shotNorm(leg);
  const name = plainName(leg.player), market = String(leg.market || "").toLowerCase(), side = String(leg.side || "").toLowerCase();
  const wantTd = shotTdWant(leg);
  const plain = (bet) => !SHOT_PART.test(`${bet.label} ${bet.market}`.toLowerCase());
  const person = shotPerson(people, leg.player, leg);
  let pool = [];
  if (person) {
    const sig = shotSig(leg.market);
    pool = (person.bets || []).filter((bet) => {
      const rest = `${String(bet.label || "").replace(person.name, "")} ${String(bet.market || "").replace(person.name, "")}`;
      if (!plain(bet) || shotSig(rest) !== sig) return false;
      if (wantTd && shotTdKind(rest) !== wantTd) return false;
      return true;
    }).map((bet) => ({ person, bet }));
  } else {
    const team = name && shotTeamOf(people, leg);
    const kind = /spread/.test(market) ? /spread/i : /total/.test(market) ? /total/i : null;
    if (team && kind) pool = (team.bets || []).filter((bet) => kind.test(bet.market) && plain(bet)).map((bet) => ({ person: String(bet.label).startsWith(team.name) ? team : null, bet }));
    else if (kind && game) pool = people.filter((who) => who.kind === "team").flatMap((who) => (who.bets || []).filter((bet) => bet.match === game && /^(total|alternate total points?)$/i.test(bet.market)).map((bet) => ({ person: null, bet })));
  }
  const want = shotOdds(leg.odds), seen = new Set();
  const own = (bet) => ((String(bet.label).match(/\b(over|under)\b/i) || [])[1] || (/\d\+/.test(bet.label) ? "over" : "")).toLowerCase();
  const score = ({ bet }) => (leg.line == null ? 0 : Math.abs(shotLine(bet) - leg.line)) + (want == null ? 0 : Math.abs(Number(bet.odds) - want) / 10000);
  return pool.filter(({ bet }) => { const key = parlayKey(bet); if (seen.has(key) || parlayLeg.has(key)) return false; seen.add(key); return true; })
    .filter(({ bet }) => (leg.line == null || shotLine(bet) != null) && !(side && own(bet) && own(bet) !== side))
    .sort((a, b) => score(a) - score(b)).slice(0, 3)
    .sort((a, b) => (shotLine(a.bet) ?? 0) - (shotLine(b.bet) ?? 0));
}

function shotNearPaint(board, misses) {
  board.querySelectorAll(":scope > .find-shot-near").forEach((node) => node.remove());
  let at = board.querySelector(":scope > .find-shot-note");
  if (!at) return;
  misses.forEach(({ text, near }) => {
    if (!near.length) return;
    const box = document.createElement("div");
    box.className = "find-shot-near";
    const head = document.createElement("p");
    head.textContent = `Closest to ${text}:`;
    box.append(head);
    near.forEach(({ person, bet }) => {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.innerHTML = `<span>${esc(bet.label)}</span><b>${esc(american(bet.odds))}</b>`;
      pick.addEventListener("click", () => {
        trayStackDo(`Added ${bet.label}.`, () => { if (typeof betFromSay === "function") betFromSay("Pasted bet"); if (person) parlayPick.set(person.key, person); parlayLeg.set(parlayKey(bet), bet); });
        box.remove();
      });
      box.append(pick);
    });
    at.after(box);
    at = box;
  });
}

function shotNote(board, text) {
  let note = board.querySelector(":scope > .find-shot-note");
  if (!note) { note = document.createElement("p"); note.className = "find-why find-shot-note"; const tray = board.querySelector(":scope > .find-tray"); if (tray) tray.before(note); else board.append(note); }
  note.textContent = text;
  note.hidden = !text;
}

function shotWait(board, file, go) {
  const card = document.createElement("div");
  card.className = "find-shot-wait";
  card.setAttribute("role", "status");
  const url = URL.createObjectURL(file);
  card.innerHTML = `<img alt=""><div class="find-shot-wait-text"><b><i class="find-shot-spin"></i><span></span></b><small></small><div class="find-shot-bar"><i></i></div></div><button type="button" class="find-shot-stop">Stop</button>`;
  card.querySelector("img").src = url;
  const stop = new AbortController();
  card.querySelector(".find-shot-stop").addEventListener("click", () => { stop.abort(); card.hidden = true; });
  const text = card.querySelector("b span"), time = card.querySelector("small"), bar = card.querySelector(".find-shot-bar i");
  const head = board.querySelector(":scope > .find-shot-row:not([hidden])") || board.querySelector(":scope > h2");
  if (head) head.after(card); else board.prepend(card);
  const label = go && go.querySelector("span");
  if (label) label.textContent = "Reading…";
  const steps = [[0, "Looking at your screenshot"], [3, "Reading each leg and price"], [9, "Long slips take a few more seconds"], [18, "Almost there"]];
  const start = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - start) / 1000);
    text.textContent = steps.filter(([at]) => sec >= at).pop()[1];
    time.textContent = `${sec}s`;
    bar.style.width = `${Math.round(92 * (1 - Math.exp(-sec / 8)))}%`;
  };
  tick();
  const timer = setInterval(tick, 500);
  const rect = card.getBoundingClientRect();
  if (rect.top < 80 || rect.bottom > window.innerHeight) card.scrollIntoView({ behavior: "smooth", block: "center" });
  return {
    signal: stop.signal,
    step(say) { clearInterval(timer); text.textContent = say; bar.style.width = "100%"; },
    done() { clearInterval(timer); URL.revokeObjectURL(url); card.remove(); if (label) label.textContent = "Paste a bet"; },
  };
}

function shotTickets(data) {
  if (Array.isArray(data.bets) && data.bets.length > 1) return data.bets.map((bet) => ({ legs: bet.legs || [] }));
  const legs = (data && data.legs) || [];
  const by = new Map();
  legs.forEach((leg) => {
    const key = Number(leg && leg.ticket) || 1;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(leg);
  });
  if (by.size > 1) return [...by.values()].map((rows) => ({ legs: rows }));
  return [{ legs }];
}

function shotStakeOf(legs, fallback) {
  const rows = [...(legs || []), { stake: fallback }];
  for (const leg of rows) {
    const n = Number(String(leg.stake || "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(Math.min(n, 100000) * 100) / 100;
  }
  return 5;
}

function shotLoose(leg) {
  const player = String(leg.player || "").replace(/\s+/g, " ").trim();
  const market = String(leg.market || "").replace(/\s+/g, " ").trim();
  const side = String(leg.side || "").toLowerCase();
  const line = leg.line == null || leg.line === "" ? null : Number(leg.line);
  const odds = shotOdds(leg.odds);
  if (!player || !market) return null;
  const named = player !== player.toUpperCase() || !/[A-Z]/.test(player) ? player : player.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
  let prop = /any\s*time\s*touchdown/i.test(market) ? "Anytime TD" : /first\s*touchdown/i.test(market) ? "First TD" : market;
  if (line != null && Number.isFinite(line) && !/win|moneyline|spread|touchdown/i.test(market)) prop = `${side === "under" ? "Under" : "Over"} ${line} ${market}`;
  const bet = { label: `${named} ${prop}`.replace(/\s+/g, " ").trim(), odds: odds || "", market, match: String(leg.match || "").trim(), kickoff: typeof manageLegKick === "function" ? manageLegKick(leg) : "", sport: String(leg.sport || "").trim() };
  return bet.label ? bet : null;
}

function shotMatch(people, raw) {
  const legs = (raw || []).filter((leg) => leg && (leg.player || leg.market)).map(shotNorm).slice(0, 8);
  const rows = legs.map((leg) => ({ leg, hit: shotPlayer(people, leg) }));
  rows.forEach((row) => { if (!row.hit) row.hit = shotTeam(people, row.leg, shotGame(people, row.leg, rows.filter((one) => one.hit).map((one) => one.hit))); });
  const found = rows.filter((row) => row.hit).map((row) => row.hit), missed = rows.filter((row) => !row.hit).map((row) => row.leg);
  const drafts = [];
  missed.forEach((leg) => {
    const person = shotWho(people, leg);
    if (!person || found.some((hit) => hit.person && hit.person.key === person.key) || drafts.some((one) => one.person.key === person.key)) return;
    drafts.push({ person, leg });
    if (leg.market) shotWant.set(person.key, String(leg.market).trim());
  });
  const loose = missed.filter((leg) => !drafts.some((one) => one.leg === leg)).map(shotLoose).filter(Boolean);
  return { legs, found, drafts, missed, loose };
}

function shotLoad(found, drafts, label, loose) {
  parlayPick.clear();
  parlayLeg.clear();
  if (typeof betFromSay === "function") betFromSay(label || "Pasted bet", true);
  found.forEach(({ person, bet }) => { if (person) parlayPick.set(person.key, person); parlayLeg.set(parlayKey(bet), bet); });
  drafts.forEach(({ person }) => parlayPick.set(person.key, person));
  (loose || []).forEach((bet) => { parlayLeg.set(parlayKey(bet), bet); const who = typeof legLoose === "function" ? legLoose(bet).who : ""; if (who && typeof legOwner !== "undefined") legOwner.set(parlayKey(bet), who); });
}

async function shotRead(board, file) {
  const go = board.querySelector(".find-shot");
  if (!file || (go && go.disabled)) return;
  if (go) { go.disabled = true; go.classList.add("busy"); }
  shotNote(board, "");
  shotNearPaint(board, []);
  const wait = shotWait(board, file, go);
  try {
    const image = typeof howsFit === "function" ? await howsFit(file) : await new Promise((done) => { const reader = new FileReader(); reader.onload = () => done(String(reader.result || "")); reader.readAsDataURL(file); });
    if (wait.signal.aborted) return;
    const response = await fetch("/api/how", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }), signal: wait.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { console.log("[bet-shot] read failed", response.status, data); throw new Error(data.error || `I could not read a bet on that screenshot. The server answered ${response.status}.`); }
    const tickets = shotTickets(data);
    const people = board.people || [];
    shotWant.clear();
    const matched = tickets.map((bet) => ({ stake: shotStakeOf(bet.legs, data.stake), ...shotMatch(people, bet.legs) })).filter((row) => row.found.length || row.drafts.length || (row.loose || []).length);
    if (!matched.length) { console.log("[bet-shot] no legs in reply", data); throw new Error("I read that screenshot but found no player or team legs on it."); }
    const legsTotal = matched.reduce((sum, row) => sum + row.found.length + row.drafts.length + (row.loose || []).length, 0);
    wait.step(matched.length > 1 ? `Found ${matched.length} bets. Saving them in My bets` : `Found ${legsTotal} ${legsTotal === 1 ? "leg" : "legs"}. Building your parlay`);
    await new Promise((done) => setTimeout(done, 350));
    if (wait.signal.aborted) return;
    if (parlayLeg.size && typeof saveSig === "function" && typeof saveHeld !== "undefined" && saveSig([...parlayLeg.values()]) !== saveHeld && typeof saveNow === "function") saveNow();
    const group = matched.length > 1 ? { id: `g${Date.now()}`, name: "Pasted bets" } : null;
    let first = "", openFound = [], openMissed = [];
    matched.forEach((row, index) => {
      window.parlayOpenId = "";
      window.parlayStake = row.stake;
      const label = matched.length > 1 ? `Pasted bet ${index + 1}` : "Pasted bet";
      if (matched.length === 1) {
        if (typeof saveDetach === "function") saveDetach();
        trayStackDo(`Read ${row.found.length + row.drafts.length + (row.loose || []).length} ${row.found.length + row.drafts.length + (row.loose || []).length === 1 ? "leg" : "legs"} from the screenshot.`, () => shotLoad(row.found, row.drafts, label, row.loose));
      } else {
        shotLoad(row.found, row.drafts, label, row.loose);
        if (typeof trayRoster === "function") trayRoster();
      }
      const made = typeof saveNow === "function" ? saveNow() : null;
      if (made && typeof saveList === "function" && typeof saveStore === "function") {
        first = first || made.id;
        const list = saveList(), entry = list.find((one) => one.id === made.id);
        if (entry) {
          entry.stake = row.stake;
          const ticket = shotOdds(data.odds);
          if (ticket && !(entry.legs || []).some((leg) => Number(leg.odds))) entry.slipOdds = ticket > 0 ? `+${ticket}` : String(ticket);
          if (group) entry.group = group;
          saveStore(list);
        }
      }
      if (!index) { openFound = row.found; openMissed = row.missed; }
    });
    if (matched.length > 1 && first && typeof saveOpen === "function") saveOpen(first);
    else if (matched.length > 1 && typeof paintParlay === "function") paintParlay();
    const say = (leg) => { const market = String(leg.market || ""), line = leg.line != null && /spread/i.test(market) && leg.line > 0 ? `+${leg.line}` : leg.line; return [leg.player, leg.side && leg.line != null ? (market.toLowerCase().includes(String(leg.side).toLowerCase()) ? line : `${leg.side} ${line}`) : "", market].filter(Boolean).join(" "); };
    const drafts = matched.flatMap((row) => row.drafts);
    const missed = matched.flatMap((row) => row.missed);
    const found = matched.flatMap((row) => row.found);
    const lost = missed.filter((leg) => !drafts.some((one) => one.leg === leg) && !(matched.flatMap((row) => row.loose || []).some((bet) => String(bet.label || "").startsWith(String(leg.player || "")))));
    const more = matched.length > 1 ? ` Saved ${matched.length} bets from that screenshot${group ? " in My stacks" : ""}.` : "";
    const told = [drafts.length && `FanDuel doesn't have ${drafts.map(({ leg }) => say(leg)).join(", ")} at that number. ${drafts.length === 1 ? "It's" : "They're"} in your bet. Pick the line.`, lost.length && `Not on the board right now: ${lost.map(say).join(", ")}.`].filter(Boolean).join(" ");
    shotNote(board, `${told}${more}`.trim());
    shotNearPaint(board, (matched.length > 1 ? openMissed : missed).map((leg) => ({ text: say(leg), near: shotNear(people, leg, shotGame(people, leg, matched.length > 1 ? openFound : found)) })));
    const tray = board.querySelector(":scope > .find-tray");
    if (tray && !tray.hidden) tray.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (!wait.signal.aborted) shotNote(board, error.message || "I could not read a bet on that screenshot.");
  } finally {
    wait.done();
    if (go) { go.disabled = false; go.classList.remove("busy"); }
  }
}

function shotBox(board) {
  let row = board.querySelector(":scope > .find-shot-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "find-shot-row";
    const box = document.createElement("div");
    box.className = "find-shot-box";
    box.contentEditable = "true";
    box.tabIndex = 0;
    box.setAttribute("role", "textbox");
    box.setAttribute("aria-label", "Paste the screenshot here");
    box.dataset.say = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "Press ⌘V to paste the screenshot here" : "Press Ctrl+V to paste the screenshot here";
    box.addEventListener("paste", (event) => {
      const files = typeof howsFiles === "function" ? howsFiles(event.clipboardData) : [];
      console.log("[bet-shot] paste box, images:", files.length, "types:", [...((event.clipboardData && event.clipboardData.types) || [])]);
      if (!files.length) return;
      event.preventDefault();
      row.hidden = true;
      shotRead(board, files[0]);
    });
    box.addEventListener("input", () => {
      const img = box.querySelector("img");
      box.textContent = "";
      if (!img) return;
      fetch(img.src).then((response) => response.blob()).then((blob) => { row.hidden = true; shotRead(board, new File([blob], "screenshot.png", { type: blob.type || "image/png" })); }).catch((error) => console.log("[bet-shot] pasted image could not be read", error));
    });
    box.addEventListener("keydown", (event) => { if (event.key === "Escape") row.hidden = true; else if (!event.metaKey && !event.ctrlKey) event.preventDefault(); });
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "find-shot-pick";
    pick.textContent = "Choose a file";
    pick.addEventListener("click", () => { const file = board.querySelector(".find-shot-file"); if (file) file.click(); });
    row.append(box, pick);
    const quick = board.querySelector(".find-start .quick-add-head");
    const head = board.querySelector(":scope > h2");
    if (quick) quick.after(row); else if (head) head.after(row); else board.prepend(row);
  }
  row.hidden = false;
  row.querySelector(".find-shot-box").focus();
}

function shotPick(board) {
  const read = navigator.clipboard && navigator.clipboard.read;
  if (!read) { console.log("[bet-shot] clipboard.read is not available"); shotBox(board); return; }
  read.call(navigator.clipboard).then(async (items) => {
    console.log("[bet-shot] clipboard types:", items.map((item) => item.types));
    for (const item of items) {
      const type = (item.types || []).find((name) => String(name).startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      shotRead(board, new File([blob], "screenshot.png", { type: blob.type || type }));
      return;
    }
    shotBox(board);
  }).catch((error) => { console.log("[bet-shot] clipboard.read failed:", String(error)); shotBox(board); });
}

function betShotMount() {
  const board = document.querySelector("#desk-glass-in .find-board") || document.querySelector(".find-board");
  if (!board || board.dataset.page === "rec" || board.classList.contains("find-rec-page")) return;
  const head = board.querySelector(".find-start .quick-add-head");
  if (!head || head.querySelector(".find-shot")) return;
  board.querySelectorAll("h2 .find-shot, h2 .find-shot-file").forEach((node) => node.remove());
  const go = document.createElement("button");
  go.type = "button";
  go.className = "find-shot";
  go.title = "Paste a screenshot of a bet";
  go.setAttribute("aria-label", "Paste a screenshot of a bet");
  go.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Paste a bet</span>`;
  const file = document.createElement("input");
  file.type = "file"; file.accept = "image/*"; file.hidden = true; file.className = "find-shot-file";
  file.addEventListener("change", () => { const pick = file.files && file.files[0]; file.value = ""; if (pick) shotRead(board, pick); });
  go.addEventListener("click", () => shotPick(board));
  head.append(go, file);
}

window.addEventListener("paste", (event) => {
  const board = document.querySelector(".find-board");
  if (event.defaultPrevented || !board || !board.isConnected || typeof howsFiles !== "function") return;
  const files = howsFiles(event.clipboardData);
  console.log("[bet-shot] page paste, images:", files.length);
  if (!files.length) return;
  event.preventDefault();
  shotRead(board, files[0]);
});
