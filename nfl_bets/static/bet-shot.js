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

function shotFits(bet, leg, rest) {
  const line = leg.line;
  const plus = rest.match(/(\d+(?:\.\d+)?)\+/);
  if (plus) { const n = Number(plus[1]); return line != null && leg.side !== "under" && (n === line || n === line + 0.5); }
  const ou = rest.match(/\b(over|under)\b\s*\(?(-?\d+(?:\.\d+)?)/i);
  if (ou) { const n = Number(ou[2]); return line != null && ou[1].toLowerCase() === leg.side && (n === line || (leg.side === "over" && n === line - 0.5)); }
  return line == null && !/\d/.test(rest);
}

function shotBest(rows, leg) {
  const want = shotOdds(leg.odds);
  return rows.slice().sort((a, b) => (want == null ? 0 : Math.abs(Number(a.odds) - want) - Math.abs(Number(b.odds) - want)))[0] || null;
}

function shotPlayer(people, leg) {
  const name = plainName(leg.player);
  const person = name && people.find((who) => who.kind === "player" && plainName(who.name) === name);
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

function shotTeam(people, leg, game) {
  const name = plainName(leg.player);
  const team = name && people.find((who) => who.kind === "team" && (plainName(who.name) === name || plainName(who.name).endsWith(` ${name}`)));
  const market = String(leg.market || "").toLowerCase();
  const plain = (bet) => !SHOT_PART.test(`${bet.label} ${bet.market}`.toLowerCase());
  let rows = [];
  if (team && /win|moneyline/.test(market)) rows = team.bets.filter((bet) => /^moneyline$/i.test(bet.market) && bet.label === team.name);
  else if (team && /spread/.test(market)) rows = team.bets.filter((bet) => /spread/i.test(bet.market) && plain(bet) && Number(((bet.label || "").match(/\(([+-]?\d+(?:\.\d+)?)\)/) || [])[1]) === leg.line);
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

function shotLine(bet) {
  const label = String(bet.label || "");
  const hit = label.match(/(\d+(?:\.\d+)?)\+/) || label.match(/\b(?:over|under)\b\s*\(?(-?\d+(?:\.\d+)?)/i) || label.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  return hit ? Number(hit[1]) : null;
}

function shotNear(people, leg, game) {
  const name = plainName(leg.player), market = String(leg.market || "").toLowerCase(), side = String(leg.side || "").toLowerCase();
  const plain = (bet) => !SHOT_PART.test(`${bet.label} ${bet.market}`.toLowerCase());
  const person = name && people.find((who) => who.kind === "player" && plainName(who.name) === name);
  let pool = [];
  if (person) {
    const sig = shotSig(leg.market);
    pool = (person.bets || []).filter((bet) => plain(bet) && shotSig(`${String(bet.label || "").replace(person.name, "")} ${String(bet.market || "").replace(person.name, "")}`) === sig).map((bet) => ({ person, bet }));
  } else {
    const team = name && people.find((who) => who.kind === "team" && (plainName(who.name) === name || plainName(who.name).endsWith(` ${name}`)));
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
        trayStackDo(`Added ${bet.label}.`, () => { if (person) parlayPick.set(person.key, person); parlayLeg.set(parlayKey(bet), bet); });
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
  card.innerHTML = `<img alt=""><div class="find-shot-wait-text"><b><i class="find-shot-spin"></i><span></span></b><small></small><div class="find-shot-bar"><i></i></div></div>`;
  card.querySelector("img").src = url;
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
    step(say) { clearInterval(timer); text.textContent = say; bar.style.width = "100%"; },
    done() { clearInterval(timer); URL.revokeObjectURL(url); card.remove(); if (label) label.textContent = "Paste a bet"; },
  };
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
    const response = await fetch("/api/how", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "I could not read a bet on that screenshot.");
    const split = Array.isArray(data.bets) && data.bets.length > 1 && new Set(data.bets.map((bet) => ((bet.legs || [])[0] || {}).stake).filter(Boolean)).size > 1;
    const bets = split ? data.bets : [{ legs: data.legs || [] }];
    const legs = (bets[0].legs || []).filter((leg) => leg && (leg.player || leg.market)).slice(0, 8);
    if (!legs.length) throw new Error("I could not read a bet on that screenshot.");
    wait.step(`Found ${legs.length} ${legs.length === 1 ? "leg" : "legs"}. Building your parlay`);
    await new Promise((done) => setTimeout(done, 350));
    const people = board.people || [];
    const rows = legs.map((leg) => ({ leg, hit: shotPlayer(people, leg) }));
    rows.forEach((row) => { if (!row.hit) row.hit = shotTeam(people, row.leg, shotGame(people, row.leg, rows.filter((one) => one.hit).map((one) => one.hit))); });
    const found = rows.filter((row) => row.hit).map((row) => row.hit), missed = rows.filter((row) => !row.hit).map((row) => row.leg);
    if (found.length) {
      trayStackDo(`Read ${found.length} ${found.length === 1 ? "leg" : "legs"} from the screenshot.`, () => {
        parlayPick.clear(); parlayLeg.clear();
        found.forEach(({ person, bet }) => { if (person) parlayPick.set(person.key, person); parlayLeg.set(parlayKey(bet), bet); });
      });
    }
    const say = (leg) => [leg.player, leg.side && leg.line != null ? `${leg.side} ${leg.line}` : "", leg.market].filter(Boolean).join(" ");
    const more = bets.length > 1 ? " That screenshot has more than one bet. This is the top one." : "";
    shotNote(board, missed.length ? `Not on the board right now: ${missed.map(say).join(", ")}.${more}` : more.trim());
    shotNearPaint(board, missed.map((leg) => ({ text: say(leg), near: shotNear(people, leg, shotGame(people, leg, found)) })));
    const tray = board.querySelector(":scope > .find-tray");
    if (tray && !tray.hidden) tray.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    shotNote(board, error.message || "I could not read a bet on that screenshot.");
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
    const head = board.querySelector(":scope > h2");
    if (head) head.after(row); else board.prepend(row);
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
  const board = document.querySelector(".find-board");
  const head = board && board.querySelector(":scope > h2");
  if (!head || head.querySelector(".find-shot")) return;
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
  const games = head.querySelector(".find-games-go");
  if (games) games.before(go, file); else head.append(go, file);
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
