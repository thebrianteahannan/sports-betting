/** Search the board by player or team. Longest price first. */

const parlayPick = new Map(), parlayLeg = new Map(), parlayKey = (bet) => [bet.label, bet.odds, bet.match, bet.kickoff].join("|");

function paintParlay() {
  const count = parlayLeg.size >= 2 ? parlayLeg.size : parlayPick.size, label = count < 2 ? "Build a parlay" : `Build a ${count}-leg parlay`;
  document.querySelectorAll(".find-roster > button.find-parlay").forEach((node) => { node.hidden = parlayPick.size < 2; node.textContent = parlayPick.size < 2 ? "Build a parlay" : `Build a ${parlayPick.size}-leg parlay`; }); document.querySelectorAll(".find-list > button.find-parlay").forEach((node) => { node.textContent = parlayPick.has(node.dataset.key) ? "In the parlay" : "Add to the parlay"; }); document.querySelectorAll("button.find-leg").forEach((node) => { const on = parlayLeg.has(node.dataset.key); node.classList.toggle("on", on); node.textContent = on ? "In the parlay" : "Add this leg"; });
  const tray = document.querySelector(".find-tray");
  if (!tray) return;
  tray.replaceChildren();
  tray.hidden = !parlayPick.size && !parlayLeg.size;
  if (tray.hidden) return;
  const say = document.createElement("p"); say.className = "find-say"; say.textContent = "In the parlay"; tray.append(say); parlayPick.forEach((person) => { const chip = document.createElement("span"); chip.className = "find-in"; const name = document.createElement("button"); name.type = "button"; name.className = "find-name"; name.textContent = person.name; name.addEventListener("click", () => { const board = tray.closest(".find-board"); const list = board && board.querySelector(".find-list"); const hits = board && board.querySelector(":scope > .find-hits:not(.find-tray)"); const roster = board && board.querySelector(":scope > .find-roster"); if (list && hits) showFind(list, hits, person, roster, board.people || []); }); const out = document.createElement("button"); out.type = "button"; out.className = "find-out"; out.textContent = "Take out"; out.addEventListener("click", () => { parlayPick.delete(person.key); document.querySelectorAll(".find-names button").forEach((node) => { if (node.textContent === person.name) { node.classList.remove("on"); node.setAttribute("aria-pressed", "false"); } }); paintParlay(); }); chip.append(name, out); tray.append(chip); }); parlayLeg.forEach((bet, key) => { const chip = document.createElement("span"); chip.className = "find-in"; const name = document.createElement("span"); name.className = "find-name"; name.textContent = String(bet.label || "").split(/\s+—\s+/)[0]; const out = document.createElement("button"); out.type = "button"; out.className = "find-out"; out.textContent = "Take out"; out.addEventListener("click", () => { parlayLeg.delete(key); paintParlay(); }); chip.append(name, out); tray.append(chip); });
  if (parlayPick.size < 2 && parlayLeg.size < 2) return;
  const build = document.createElement("button"); build.type = "button"; build.className = "find-parlay"; build.textContent = label;
  build.addEventListener("click", () => { const list = document.querySelector(".find-board .find-list"); if (!list) return; if (parlayLeg.size >= 2) { const legs = [...parlayLeg.values()]; const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1); const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)); paintRosterParlay(list, [{ american: price, legs }], legs.length); return; } const group = [...parlayPick.values()]; if (group.length > 1) goldBuild(list, group); });
  tray.append(build);
}

function findRank(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return -1;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function findCash(odds) {
  const n = Number(odds);
  if (!n) return "";
  const won = Math.round((n < 0 ? 500 / -n : n / 20) * 100) / 100;
  return `$${Math.abs(won - Math.round(won)) < 0.005 ? Math.round(won) : won.toFixed(2)}`;
}

function findPct(odds) {
  const n = Number(odds);
  if (!n) return "";
  const chance = n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
  return `${(chance * 100).toFixed(1)}%`;
}

let findParts = {};

function loadFind(span) {
  const saved = findParts[span];
  if (saved && saved.data && Date.now() - saved.at < 30 * 60 * 1000) return Promise.resolve(saved.data);
  if (saved && saved.pending) return saved.pending;
  const pending = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "lookup", when: span }) }).then((res) => res.json()).then((data) => { findParts[span] = { at: Date.now(), data }; return data; }).catch((error) => { delete findParts[span]; throw error; });
  findParts[span] = { pending };
  return pending;
}

function paintFind() {
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; if (window.birdGreet) birdGreet(); return; }
  if (window.tvPush) tvPush();
  desk.classList.remove("bird-on", "solo", "dug");
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  document.querySelectorAll(".rec-board").forEach((node) => node.remove());
  const board = document.createElement("div");
  board.className = "rec-board find-board";
  board.dataset.page = "find";
  const saved = findParts.today && findParts.today.data && Date.now() - findParts.today.at < 30 * 60 * 1000;
  if (!saved) board.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>Looking up the board.</p></div>`;
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  row.append(board);
  row.scrollTop = 0;
  loadFind("today").then((data) => {
    if (!board.isConnected) return null;
    fillFind(board, data);
    if (!(findParts.week && findParts.week.data)) { const note = document.createElement("p"); note.className = "quiet"; note.textContent = "Looking up the rest of the week."; const week = board.querySelector(".find-week"); if (week) week.append(note); }
    return loadFind("week");
  }).then((more) => {
    if (!more || !board.isConnected || !board.people) return;
    const seen = new Map(board.people.map((person) => [person.key, person]));
    (more.people || []).forEach((person) => { const have = seen.get(person.key); if (!have) { board.people.push(person); return; } const ids = new Set((have.bets || []).map((bet) => `${bet.label}|${bet.odds}|${bet.match}`)); (person.bets || []).forEach((bet) => { if (!ids.has(`${bet.label}|${bet.odds}|${bet.match}`)) have.bets.push(bet); }); });
    setTimeout(() => { if (!board.isConnected || !board.paintSlate) return; board.paintSlate(board.querySelector(".find-week")); const field = board.querySelector("input"); if (field && field.value.trim().length >= 2) field.dispatchEvent(new Event("input")); }, 50);
  }).catch(() => { if (board.isConnected && !board.querySelector("h2")) fillFind(board, {}); });
}

function loadedGames(people, span) {
  const seen = new Map();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  people.forEach((person) => (person.bets || []).forEach((bet) => {
    const kick = Date.parse(bet.kickoff || "");
    const day = new Date(kick).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (!bet.match || !Number.isFinite(kick) || kick <= Date.now() || /^(Hockey|Rugby|Darts|CFL|NCAAB|Cricket|Handball|NCAAF)$/.test(bet.sport || "") || (span === "today" ? day !== today : day <= today || day > end)) return;
    if (!seen.has(`${bet.match}|${bet.kickoff}`)) seen.set(`${bet.match}|${bet.kickoff}`, bet);
  }));
  return [...seen.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

function fillFind(board, data) {
  const load = board.querySelector(".bet-load");
  if (load) load.remove();
  const heading = document.createElement("h2");
  heading.textContent = "Search by player or team.";
  const people = Array.isArray(data.people) ? data.people : [];
  const label = document.createElement("label");
  label.className = "find";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Type a player or team";
  input.autocomplete = "off";
  label.append(input);
  const hits = document.createElement("div");
  hits.className = "find-hits";
  const roster = document.createElement("details"); roster.className = "find-roster"; roster.hidden = true;
  const teams = document.createElement("div"); teams.className = "find-teams"; const tray = document.createElement("div"); tray.className = "find-hits find-tray"; tray.hidden = true;
  const list = document.createElement("div");
  list.className = "find-list";
  board.people = people;
  const today = document.createElement("details"); const week = document.createElement("details"); const span = document.createElement("div"); span.className = "find-span"; const games = document.createElement("button"); games.type = "button"; games.className = "find-games-go"; games.hidden = true; games.setAttribute("aria-label", "Games"); games.addEventListener("click", () => { span.classList.remove("find-picked"); games.hidden = true; (today.classList.contains("find-on") ? today : week).open = true; }); span.append(today, week); heading.append(games);
  const pickSpan = (name) => { const on = name === "today"; today.classList.toggle("find-on", on); week.classList.toggle("find-on", !on); if (today.open !== on) today.open = on; if (week.open === on) week.open = !on; };
  today.className = "find-games find-on"; today.dataset.span = "today"; today.open = true; week.className = "find-games find-week"; week.dataset.span = "week";
  today.addEventListener("toggle", () => { if (today.open) pickSpan("today"); }); week.addEventListener("toggle", () => { if (week.open) pickSpan("week"); });
  board.paintSlate = (box) => {
    if (!box) return;
    const rows = loadedGames(people, box.dataset.span);
    const bySport = new Map();
    rows.forEach((game) => { const sport = game.sport || "Other"; if (!bySport.has(sport)) bySport.set(sport, []); bySport.get(sport).push(game); });
    const head = document.createElement("summary");
    head.textContent = `${box.dataset.span === "today" ? "Today" : "This week"}, ${rows.length} ${rows.length === 1 ? "game" : "games"}`;
    box.replaceChildren(head); box.hidden = rows.length === 0;
    const usa = ["NFL", "NBA", "MLB", "NHL", "WNBA"];
    [...bySport.entries()].sort((a, b) => ((usa.indexOf(a[0]) + 1) || 99) - ((usa.indexOf(b[0]) + 1) || 99) || a[0].localeCompare(b[0])).forEach(([sport, games]) => {
      const group = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${sport}, ${games.length} ${games.length === 1 ? "game" : "games"}`; group.append(summary);
      games.forEach((game) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = [game.match, game.kickoff && typeof window.when === "function" ? `${window.when(game.kickoff)} ET` : ""].filter(Boolean).join(", ");
        button.addEventListener("click", () => {
          hits.replaceChildren(); teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on"); box.open = false; span.classList.add("find-picked"); games.hidden = false; today.open = false; week.open = false;
          paintMatch(teams, game, people, list, hits);
        });
        group.append(button);
      });
      box.append(group);
    });
  };
  board.paintSlate(today);
  board.append(heading, label, hits, tray, span, teams, roster, list); paintParlay();
  let clubStamp = 0;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const stamp = ++clubStamp;
    hits.replaceChildren();
    if (q.length < 2) { if (!list.querySelector(".rec-bet")) list.replaceChildren(); return; } teams.replaceChildren();
    board.querySelectorAll(".find-games").forEach((node) => { node.open = false; });
    people.filter((person) => person.name.toLowerCase().includes(q)).slice(0, 8).forEach((person) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = person.name;
      button.addEventListener("click", () => showFind(list, hits, person, roster, people));
      hits.append(button);
    });
    if (!(findParts.week && findParts.week.data)) { const note = document.createElement("p"); note.className = "quiet"; note.textContent = "Looking up the rest of the week."; hits.append(note); } if (hits.querySelector("button") || q.split(" ").length < 2) return;
    const note = document.createElement("p");
    note.textContent = "Nobody on the board matches that. Player props for that name are not posted yet.";
    hits.append(note);
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "club", name: q }) }).then((res) => res.json()).then((data) => {
      if (stamp !== clubStamp || !hits.isConnected) return;
      const clubs = (data.clubs || []).map((row) => ({ player: row.player, team: people.find((person) => person.kind === "team" && person.name.toLowerCase() === String(row.team || "").toLowerCase() && (person.bets || []).length) })).filter((row) => row.team);
      if (!clubs.length) return;
      hits.replaceChildren();
      const line = document.createElement("p");
      line.textContent = `${clubs[0].player} has no props posted. ${clubs.length === 1 ? `${clubs[0].team.name} has lines.` : "These teams have lines."}`;
      hits.append(line);
      clubs.forEach((row) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = row.team.name;
        button.addEventListener("click", () => showFind(list, hits, row.team, roster, people));
        hits.append(button);
      });
    }).catch(() => {});
  });
  input.focus();
}

function plainName(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

function fillRoster(roster, team, list, hits, people) {
  const stamp = (roster.stamp = (roster.stamp || 0) + 1);
  roster.hidden = true;
  roster.open = false;
  roster.replaceChildren();
  const sport = (team.bets && team.bets[0] && team.bets[0].sport) || "";
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: team.name, sport }) }).then((res) => res.json()).then((data) => {
    if (stamp !== roster.stamp || !roster.isConnected) return;
    const rows = Array.isArray(data.players) ? data.players : [];
    if (!rows.length) return;
    const summary = document.createElement("summary");
    summary.textContent = "Players";
    const names = document.createElement("div");
    names.className = "find-names";
    roster.replaceChildren(summary, names);
    roster.hidden = false;
    const byName = new Map();
    (people || []).forEach((item) => { if (item.kind === "player" && (item.bets || []).length) byName.set(plainName(item.name), item); });
    const lined = [];
    const quiet = [];
    rows.forEach((name) => { const hit = byName.get(plainName(name)); if (hit) lined.push(hit); else quiet.push(name); });
    const withProps = lined.length === 1 ? "1 has props" : `${lined.length} have props`;
    summary.textContent = `${rows.length} players, ${withProps}`;
    lined.sort((a, b) => a.name.localeCompare(b.name));
    quiet.sort((a, b) => a.localeCompare(b));
    names.replaceChildren();
    lined.forEach((hit) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = hit.name;
      if (parlayPick.has(hit.key)) { button.classList.add("on"); button.setAttribute("aria-pressed", "true"); }
      button.addEventListener("click", () => { const field = document.querySelector(".find-board label.find input"); const boardRoster = list.parentElement && list.parentElement.querySelector(":scope > .find-roster"); if (field) { field.value = hit.name; field.dispatchEvent(new Event("input", { bubbles: true })); } showFind(list, hits, hit, boardRoster || roster, people); });
      names.append(button);
    });
    quiet.forEach((name) => { const span = document.createElement("span"); span.textContent = name; names.append(span); });
    const build = document.createElement("button");
    build.type = "button";
    build.className = "find-parlay";
    build.addEventListener("click", () => { const group = [...parlayPick.values()]; if (group.length < 2) return; goldBuild(list, group); });
    roster.append(build);
    paintParlay();
  }).catch(() => {});
}

function rosterNear(card) {
  const legs = Array.isArray(card.legs) ? card.legs : [];
  if (legs.length < 2) return "";
  const known = typeof recName === "function" ? recName(card) : "";
  if (known) {
    const hits = known === "Five near 90% each" ? "five" : known === "Four near 80% each" ? "four" : "";
    const id = hits ? "hits" : Object.keys(window.CARD_NAMES || {}).find((key) => window.CARD_NAMES[key] === known) || "";
    return `This is the one on the desk. ${rosterWho(id, hits, known)}.`;
  }
  const found = rosterScan(legs, Number(card.american));
  if (!found.length) return "";
  const [main, extra] = found; card.near = found;
  const line = main.fit ? `This matches ${rosterWho(main.id, main.part, main.name)}.` : `This is close to ${rosterWho(main.id, main.part, main.name)}.${main.why ? ` ${main.why}` : ""}`;
  return extra ? `${line} ${extra.fit ? "It also matches" : "It is also close to"} ${rosterWho(extra.id, extra.part, extra.name)}.` : line;
}

function rosterWho(id, part, name) {
  const no = id && typeof strategyNo === "function" ? strategyNo(id, part || "") : "";
  return [no, name].filter(Boolean).join(", ");
}

function rosterScan(legs, price) {
  const n = legs.length;
  const odds = legs.map((leg) => Number(leg.odds));
  if (odds.some((o) => !Number.isFinite(o) || !o)) return [];
  const chance = (o) => (o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100));
  const probs = odds.map(chance);
  const blob = (leg) => `${leg.market || ""} ${leg.label || ""} ${leg.runner || ""}`.toLowerCase();
  const games = legs.map((leg) => String(leg.match || leg.gameId || ""));
  const split = games.every(Boolean) && new Set(games).size === n;
  const same = games.every(Boolean) && new Set(games).size === 1;
  const when = legs.map((leg) => {
    const t = Date.parse(leg.kickoff || "");
    if (!Number.isFinite(t)) return null;
    return {
      day: new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      hour: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(t)),
      week: new Date(t).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }),
    };
  });
  const timed = when.every(Boolean);
  const days = timed && new Set(when.map((row) => row.day)).size === n;
  const yard = legs.every((leg) => /yd|yard/.test(blob(leg)));
  const alt = legs.every((leg) => /\balt\b|\+/.test(blob(leg)));
  const td = legs.every((leg) => /anytime touchdown scorer|any time touchdown scorer/.test(blob(leg)) && !/half|quarter|\b1st\b|first|last|either|\b[23]\+/.test(blob(leg)));
  const nfl = legs.every((leg) => String(leg.sport || "").toUpperCase() === "NFL");
  const shy = legs.some((leg) => /reception/.test(blob(leg)) && Number((blob(leg).match(/(\d+(?:\.\d+)?)/) || [])[1]) >= 4.5);
  const gap = (lo, hi) => Math.max(0, ...odds.map((o) => (o < lo ? lo - o : o > hi ? o - hi : 0)));
  const under = (need) => Math.max(0, ...probs.map((c) => Math.max(0, need - c) * 100));
  const side = (leg) => /^over\b/i.test(leg.runner || "") ? "over" : /^under\b/i.test(leg.runner || "") ? "under" : "";
  const won = Number.isFinite(price) && price ? Math.round(5 * (price > 0 ? price / 100 : 100 / Math.abs(price)) * 100) / 100 : NaN;
  const game = same ? "The legs are in one game." : "";
  const rows = [];
  const put = (id, name, part, fit, near, why, miss, pay) => { if (fit || near) rows.push({ id, name, part, fit: !!fit, why: fit ? "" : why, miss: fit ? 0 : miss, pay: !!pay }); };
  const both = (bits) => { const said = bits.filter(Boolean).map((bit) => bit.replace(/\.$/, "")); return said.length < 2 ? (said[0] ? `${said[0]}.` : "") : `${said[0]}, and ${said[1][0].toLowerCase()}${said[1].slice(1)}.`; };
  const short = probs.filter((c) => c < 0.75).length;
  put("safe2", "Safe 2-leg, both 75%+", "", n === 2 && split && under(0.75) === 0, n === 2 && under(0.75) <= 8, both([short > 1 ? "Both legs are under 75%." : short ? "One leg is under 75%." : "", game]), under(0.75) + (split ? 0 : 4));
  put("mid3", "3 legs, −250 to −400", "", n === 3 && split && gap(-400, -250) === 0, n === 3 && gap(-440, -210) <= 40, both([gap(-400, -250) ? "One leg is outside −250 to −400." : "", game]), gap(-400, -250) / 5 + (split ? 0 : 4));
  put("win4", "4 legs, −150 to −300", "", n === 4 && split && gap(-300, -150) === 0, n === 4 && gap(-340, -110) <= 40, both([gap(-300, -150) ? "One leg is outside −150 to −300." : "", game]), gap(-300, -150) / 5 + (split ? 0 : 4));
  put("plusLegs", "+100 to +200 legs", "", n === 2 && split && gap(100, 200) === 0, n === 2 && gap(60, 240) <= 40 && odds.every((o) => o > 0), both([gap(100, 200) ? "One leg is outside +100 to +200." : "", game]), gap(100, 200) / 5 + (split ? 0 : 4));
  const fav = odds.filter((o) => o >= -300 && o <= -120).length, dog = odds.filter((o) => o >= 100 && o <= 220).length;
  const favWide = odds.filter((o) => o >= -340 && o <= -100).length, dogWide = odds.filter((o) => o >= 70 && o <= 260).length;
  put("mix21", "2 favorites and 1 underdog", "", n === 3 && split && fav === 2 && dog === 1, n === 3 && favWide === 2 && dogWide === 1, both([fav === 2 && dog === 1 ? "" : "The prices are a little outside the favorite and underdog window.", game]), (fav === 2 && dog === 1 ? 0 : 6) + (split ? 0 : 4));
  const spread = Math.max(...odds) - Math.min(...odds);
  put("low3", "Low-variance 3-leg", "", n === 3 && split && gap(-230, -170) === 0 && spread <= 60, n === 3 && split && gap(-260, -140) <= 30 && spread <= 90, gap(-230, -170) ? "The prices are a little further apart." : "", gap(-230, -170) / 5 + Math.max(0, spread - 60) / 10);
  put("yards3", "3 yardage legs near 80% each", "", n === 3 && split && yard && probs.every((c) => c >= 0.75 && c <= 0.85), n === 3 && yard && probs.every((c) => c >= 0.67 && c <= 0.9), both([probs.some((c) => c < 0.75 || c > 0.85) ? "One leg is off an 80% price." : "", game]), Math.max(...probs.map((c) => Math.abs(c - 0.8) * 100)) + (split ? 0 : 4));
  const overs = legs.filter((leg) => side(leg) === "over").length, unders = legs.filter((leg) => side(leg) === "under").length;
  put("ou4", "2 overs and 2 unders", "", n === 4 && split && overs === 2 && unders === 2 && gap(-220, -110) === 0, n === 4 && overs === 2 && unders === 2 && gap(-260, -100) <= 40, both([gap(-220, -110) ? "One price is outside −220 to −110." : "", game]), gap(-220, -110) / 5 + (split ? 0 : 4));
  put("alt3", "Alt lines, 3 legs, 85%+", "", n === 3 && split && alt && under(0.85) === 0, n === 3 && alt && under(0.85) <= 8, both([under(0.85) ? "One leg is under 85%." : "", game]), under(0.85) + (split ? 0 : 4));
  put("games4", "4 legs, 4 different games", "", n === 4 && split && gap(-280, -140) === 0, n === 4 && gap(-320, -100) <= 40, both([gap(-280, -140) ? "One leg is outside −280 to −140." : "", split ? "" : "The legs are not four different games."]), gap(-280, -140) / 5 + (split ? 0 : 6));
  put("early3", "Early slate, 2 to 3 legs", "", timed && (n === 2 || n === 3) && when.every((row) => row.hour < 16) && split && gap(-300, -130) === 0, timed && (n === 2 || n === 3) && when.every((row) => row.hour < 16) && gap(-340, -100) <= 40, both([gap(-300, -130) ? "One leg is outside −300 to −130." : "", game]), gap(-300, -130) / 5 + (split ? 0 : 4));
  put("prime3", "Prime time, 3 legs", "", timed && n === 3 && when.every((row) => row.hour >= 19) && split && gap(-300, -130) === 0, timed && n === 3 && when.every((row) => row.hour >= 19) && gap(-340, -100) <= 40, both([gap(-300, -130) ? "One leg is outside −300 to −130." : "", game]), gap(-300, -130) / 5 + (split ? 0 : 4));
  put("weekend4", "Weekend special, 4 legs", "", timed && n === 4 && when.every((row) => row.week === "Sat" || row.week === "Sun") && split && gap(-260, -140) === 0, timed && n === 4 && when.every((row) => row.week === "Sat" || row.week === "Sun") && gap(-300, -100) <= 40, both([gap(-260, -140) ? "One leg is outside −260 to −140." : "", game]), gap(-260, -140) / 5 + (split ? 0 : 4));
  put("td2", "2 NFL players, 1 anytime TD each", "", n === 2 && td && nfl, n === 2 && td, nfl ? "" : "One leg is not NFL.", nfl ? 4 : 8);
  put("td3", "3 NFL players, 1 anytime TD each", "", n === 3 && td && nfl, n === 3 && td, nfl ? "" : "One leg is not NFL.", nfl ? 4 : 8);
  put("chalk", "−400 to −700 legs, near −180", "", n >= 2 && n <= 4 && gap(-700, -400) === 0 && Number.isFinite(price) && Math.abs(price + 180) <= 40, n >= 2 && n <= 4 && gap(-740, -360) <= 40 && Number.isFinite(price) && Math.abs(price + 180) <= 80, gap(-700, -400) ? "One leg is outside −400 to −700." : "The parlay price is a little off −180.", gap(-700, -400) / 5 + (Number.isFinite(price) ? Math.abs(price + 180) / 10 : 9));
  put("four", "Four yardage legs near 85% each", "", n === 4 && yard && !shy && probs.every((c) => Math.abs(c - 0.85) <= 0.05), n === 4 && yard && !shy && probs.every((c) => Math.abs(c - 0.85) <= 0.08), "One leg is off an 85% price.", Math.max(...probs.map((c) => Math.abs(c - 0.85) * 100)));
  put("plus", "Four yardage legs near +250", "", n === 4 && yard && !shy && Number.isFinite(price) && Math.abs(price - 250) <= 40 && probs.every((c) => Math.abs(c - 0.73) <= 0.12), n === 4 && yard && !shy && Number.isFinite(price) && Math.abs(price - 250) <= 80 && probs.every((c) => Math.abs(c - 0.73) <= 0.16), "The parlay price is a little off +250.", Number.isFinite(price) ? Math.abs(price - 250) / 10 : 9);
  put("hits", "Five near 90% each", "five", n === 5 && yard && !shy && probs.every((c) => Math.abs(c - 0.9) <= 0.08), n === 5 && yard && !shy && probs.every((c) => Math.abs(c - 0.9) <= 0.12), "One leg is off a 90% price.", Math.max(...probs.map((c) => Math.abs(c - 0.9) * 100)));
  put("hits", "Four near 80% each", "four", n === 4 && yard && !shy && probs.every((c) => Math.abs(c - 0.8) <= 0.08), n === 4 && yard && !shy && probs.every((c) => Math.abs(c - 0.8) <= 0.12), "One leg is off an 80% price.", Math.max(...probs.map((c) => Math.abs(c - 0.8) * 100)));
  [[5, "pay5"], [10, "pay10"], [15, "pay15"], [20, "pay20"], [25, "pay25"], [50, "pay50"]].forEach(([target, id]) => {
    const off = Math.abs(won - target);
    put(id, `A $5 bet wins $${target}`, "", n >= 2 && n <= 4 && off <= 1.25, false, "", 0, true);
  });
  [["weekThree", "3 legs, different days, near −200", 3, -200], ["weekFive", "5 legs, different days, near −200", 5, -200], ["weekSafe", "3 legs, different days, near −350", 3, -350], ["weekEven", "3 legs, different days, near −100", 3, -100]].forEach(([id, name, count, aim]) => {
    const off = Number.isFinite(price) ? Math.abs(price - aim) : 99;
    put(id, name, "", n === count && days && off <= 40, n === count && days && off <= 80, "The price is a little off the one this strategy aims at.", off / 5);
  });
  const fits = rows.filter((row) => row.fit).sort((a, b) => a.pay - b.pay || a.miss - b.miss);
  if (fits.length) return fits.slice(0, 2);
  const near = rows.filter((row) => !row.pay && row.miss <= 12).sort((a, b) => a.miss - b.miss);
  const paid = rows.filter((row) => row.pay && row.miss <= 8).sort((a, b) => a.miss - b.miss)[0];
  if (near.length) return paid ? [near[0], paid] : [near[0]];
  return paid ? [paid] : [];
}

function goldBuild(list, group) {
  const board = list.closest(".find-board"), wait = document.createElement("div"); wait.className = "bet-load"; wait.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p></p>`; wait.querySelector("p").textContent = "Picking the legs."; if (board) { board.classList.add("find-wait"); board.append(wait); } const done = () => { if (wait.isConnected) wait.remove(); if (board && !board.querySelector(".bet-load")) board.classList.remove("find-wait"); };
  Promise.all(group.map((person) => { const bets = (person.bets || []).filter((bet) => Number(bet.odds)); return fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "mark", name: person.name, bets }) }).then((res) => res.json()).then((data) => { const picked = new Set((data.marks || []).map((mark) => mark.index)); return bets.filter((bet, index) => picked.has(index)); }).catch(() => []); })).then((books) => { done(); if (!list.isConnected) return; paintRosterParlay(list, rosterMix(books.map((bets) => ({ bets }))), group.length); }).catch(done);
}

function rosterMix(group) {
  let books = group.map((person) => (person.bets || []).filter((bet) => Number(bet.odds)).sort((a, b) => findRank(a.odds) - findRank(b.odds)));
  if (books.some((rows) => !rows.length)) return [];
  const full = books.reduce((n, rows) => n * rows.length, 1);
  if (full > 8000) { const keep = Math.max(2, Math.floor(8000 ** (1 / books.length))); books = books.map((rows) => rows.slice(0, keep)); }
  let sets = [[]];
  books.forEach((rows) => { const next = []; sets.forEach((set) => rows.forEach((bet) => next.push(set.concat(bet)))); sets = next; });
  const cards = sets.map((legs) => { const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1); const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)); return { american: price, legs }; }).filter((card) => Number.isFinite(card.american)).sort((a, b) => findRank(a.american) - findRank(b.american)); cards.total = full; return cards;
}

function paintRosterParlay(list, cards, count) {
  markFind.stamp = (markFind.stamp || 0) + 1;
  const games = list.parentElement && list.parentElement.querySelector(".find-games");
  if (games) games.open = false;
  list.replaceChildren(); list.classList.remove("find-only-on");
  const rows = Array.isArray(cards) ? cards : [];
  const heading = document.createElement("h3");
  heading.textContent = rows.length ? `${rows.length === 1 ? `1 ${count}-leg parlay` : `${rows.length} ${count}-leg parlays`}` : "No parlay";
  list.append(heading);
  if (!rows.length) {
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = "One of these players has no gold line.";
    list.append(note);
    return;
  }
  if (cards.total > rows.length) {
    const more = document.createElement("p");
    more.className = "quiet";
    more.textContent = `Showing ${rows.length} of ${cards.total}. These are the shortest prices.`;
    list.append(more);
  }
  const oneGame = rows.every((card) => new Set(card.legs.map((leg) => leg.match || "")).size === 1);
  if (oneGame) {
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = "These legs are in one game, so FanDuel's same-game button can charge a different number.";
    list.append(note);
  }
  const pending = [];
  rows.forEach((card) => {
    const box = document.createElement("div");
    box.className = "rec-bet open";
    const price = Number(card.american);
    const tag = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
    const head = document.createElement("b");
    head.textContent = [tag, findPct(price), tag ? `$5 profits ${findCash(price)}` : ""].filter(Boolean).join(" · ");
    box.append(head);
    pending.push([box, card]);
    const keys = [];
    card.legs.forEach((leg) => {
      const odds = Number(leg.odds);
      const legTag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : "";
      const raw = String(leg.label || "").split(/\s+—\s+/)[0].trim();
      const said = typeof recThing === "function" ? recThing(raw, leg.market || "") : raw;
      const line = document.createElement("p");
      line.className = "rec-gist";
      line.dataset.key = `${raw}|${odds}`;
      line.dataset.who = raw.split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim();
      line.dataset.said = said;
      line.textContent = [legTag, findPct(odds), legTag ? `$5 profits ${findCash(odds)}` : "", said].filter(Boolean).join(" · ");
      box.append(line);
      keys.push(line.dataset.key);
    });
    box.dataset.keys = keys.join("~");
    box.dataset.won = String(Math.round((price < 0 ? 500 / -price : price / 20) * 100) / 100);
    list.append(box);
  });
  if (typeof siftParlays === "function") siftParlays(list, pending, count);
  const hold = list.parentElement && list.parentElement.querySelector(".find-teams"); if (hold) { hold.querySelectorAll(".find-body").forEach((node) => { node.hidden = true; }); hold.querySelectorAll(".find-side-go").forEach((node) => node.classList.remove("on")); } heading.scrollIntoView({ block: "start" });
}

function paintMatch(holder, game, people, list, hits) {
  const match = document.createElement("div"); match.className = "find-match"; const body = document.createElement("div"); body.className = "find-body"; body.hidden = true;
  (game.match.includes(" @ ") ? game.match.split(" @ ") : game.match.split(" v ").reverse()).map((side) => side.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase()).forEach((side) => {
    const person = people.find((item) => item.name.toLowerCase() === side) || people.find((item) => side.includes(item.name.toLowerCase()) && item.name.length > 3);
    if (!person) return;
    const bets = (person.bets || []).filter((bet) => bet.match === game.match && bet.kickoff === game.kickoff).sort((a, b) => findRank(b.odds) - findRank(a.odds));
    const pick = document.createElement("button"); pick.type = "button"; pick.className = "find-side-go"; pick.textContent = `${person.name}, ${bets.length} ${bets.length === 1 ? "bet" : "bets"}`; const panel = document.createElement("div"); panel.className = "find-side"; panel.hidden = true; const tabs = document.createElement("div"); tabs.className = "find-tabs"; const teamGo = document.createElement("button"); teamGo.type = "button"; teamGo.className = "find-tab"; teamGo.textContent = `Team bets, ${bets.length}`; const playerGo = document.createElement("button"); playerGo.type = "button"; playerGo.className = "find-tab"; playerGo.textContent = "Player bets"; const teamPane = document.createElement("div"); teamPane.className = "find-pane"; teamPane.hidden = true; const playerPane = document.createElement("div"); playerPane.className = "find-pane"; playerPane.hidden = true; const players = document.createElement("details"); players.className = "find-roster"; players.open = true; playerPane.append(players); fillRoster(players, person, list, hits, people); const swap = (pane, go) => { const show = pane.hidden; panel.querySelectorAll(".find-pane").forEach((node) => { node.hidden = true; }); panel.querySelectorAll(".find-tab").forEach((node) => node.classList.remove("on")); pane.hidden = !show; if (show) go.classList.add("on"); }; teamGo.addEventListener("click", () => swap(teamPane, teamGo)); playerGo.addEventListener("click", () => { swap(playerPane, playerGo); if (!playerPane.hidden) players.open = true; }); tabs.append(teamGo, playerGo); panel.append(tabs, teamPane, playerPane);
    const grouped = new Map(); bets.forEach((bet) => { const name = bet.market || "Bets"; const rows = grouped.get(name) || []; rows.push(bet); grouped.set(name, rows); }); grouped.forEach((rows, name) => { const head = document.createElement("p"); head.className = "find-market"; head.textContent = `${name}, ${rows.length} ${rows.length === 1 ? "bet" : "bets"}`; teamPane.append(head); rows.forEach((bet) => { const price = Number(bet.odds); const shown = price > 0 ? `+${price}` : String(price); const row = document.createElement("div"); row.className = "rec-bet open"; const title = document.createElement("b"); title.textContent = [shown, findPct(price), `$5 profits ${findCash(price)}`].filter(Boolean).join(" · "); const line = document.createElement("p"); line.className = "rec-gist"; line.textContent = bet.label; row.append(title, line); teamPane.append(row); }); });
    if (match.querySelector(".find-side-go")) { const at = document.createElement("b"); at.className = "find-at"; at.textContent = "@"; match.append(at); }
    match.append(pick); body.append(panel); pick.addEventListener("click", () => { const show = panel.hidden; match.querySelectorAll(".find-side").forEach((node) => { node.hidden = true; }); match.querySelectorAll(".find-side-go").forEach((node) => node.classList.remove("on")); panel.hidden = !show; body.hidden = !show; if (show) { pick.classList.add("on"); players.open = true; } });
  });
  const stamp = document.createElement("p"); stamp.className = "find-when"; stamp.textContent = game.kickoff && window.when ? `${window.when(game.kickoff)} ET` : ""; if (stamp.textContent) match.append(stamp); match.append(body); holder.append(match);
}

function showFind(list, hits, person, roster, people, keep) {
  const games = list.parentElement && list.parentElement.querySelector(".find-games");
  if (games) games.open = false;
  hits.replaceChildren();
  if (roster && !keep) fillRoster(roster, person, list, hits, people);
  const bets = (person.bets || []).slice().sort((a, b) => findRank(b.odds) - findRank(a.odds));
  const holder = list.parentElement && list.parentElement.querySelector(".find-teams"); if (holder) { holder.replaceChildren(); const span = list.parentElement.querySelector(".find-span"); if (span) { span.classList.add("find-picked"); const go = span.querySelector(".find-games-go"); if (go) go.hidden = false; span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); } const seen = new Set(); bets.forEach((bet) => { const key = `${bet.match}|${bet.kickoff}`; if (!bet.match || seen.has(key)) return; seen.add(key); paintMatch(holder, bet, people, list, hits); }); }
  list.replaceChildren(); list.classList.remove("find-only-on");
  const heading = document.createElement("h3");
  heading.innerHTML = `${esc(person.name)} <span class="rec-count">${bets.length}</span>`;
  list.append(heading);
  if (person.kind === "player") { const add = document.createElement("button"); add.type = "button"; add.className = "find-parlay"; add.dataset.key = person.key; add.textContent = parlayPick.has(person.key) ? "In the parlay" : "Add to the parlay"; add.addEventListener("click", () => { if (parlayPick.has(person.key)) parlayPick.delete(person.key); else if (parlayPick.size < 8) parlayPick.set(person.key, person); document.querySelectorAll(".find-names button").forEach((node) => { if (node.textContent === person.name) { const on = parlayPick.has(person.key); node.classList.toggle("on", on); node.setAttribute("aria-pressed", on ? "true" : "false"); } }); paintParlay(); }); list.append(add); }
  if (!bets.length) {
    const note = document.createElement("p");
    note.textContent = "Nothing posted for that name.";
    list.append(note);
    return;
  }
  bets.forEach((bet, index) => {
    const price = Number(bet.odds);
    const shown = price > 0 ? `+${price}` : String(price);
    const row = document.createElement("div");
    row.className = "rec-bet open";
    row.dataset.i = String(index);
    const head = document.createElement("b");
    head.textContent = [shown, findPct(price), `$5 profits ${findCash(price)}`].filter(Boolean).join(" · ");
    const line = document.createElement("p");
    line.className = "rec-gist";
    const when = bet.kickoff && typeof window.when === "function" ? `${window.when(bet.kickoff)} ET` : "";
    line.textContent = [bet.label, [bet.sport, bet.match, when].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
    const leg = document.createElement("button"); leg.type = "button"; leg.className = "find-leg"; leg.dataset.key = parlayKey(bet); leg.textContent = parlayLeg.has(leg.dataset.key) ? "In the parlay" : "Add this leg"; if (parlayLeg.has(leg.dataset.key)) leg.classList.add("on"); leg.addEventListener("click", () => { if (parlayLeg.has(leg.dataset.key) || parlayLeg.size >= 8) return; parlayLeg.set(leg.dataset.key, bet); paintParlay(); }); row.append(head, line, leg);
    list.append(row);
  });
  if (person.kind === "player") markFind(list, person.name, bets);
}

function markFind(list, name, bets) {
  const stamp = (markFind.stamp = (markFind.stamp || 0) + 1), wait = document.createElement("div"), board = list.closest(".find-board"); wait.className = "bet-load"; wait.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p></p>`; wait.querySelector("p").textContent = `Looking up ${name}.`; if (board) { board.classList.add("find-wait"); board.append(wait); }
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "mark", name, bets }) }).then((res) => res.json()).then((data) => {
    if (wait.isConnected) wait.remove(); if (board && !board.querySelector(".bet-load")) board.classList.remove("find-wait"); if (stamp !== markFind.stamp || !list.isConnected || !data.known) return;
    const marks = Array.isArray(data.marks) ? data.marks : [];
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = marks.length === 1 ? `On 1 of these, ${name} has done it more often than the price says.` : marks.length ? `On ${marks.length} of these, ${name} has done it more often than the price says.` : `None of these show ${name} doing it more often than the price says.`;
    const heading = list.querySelector("h3");
    if (heading) heading.after(note);
    if (!marks.length) return; const shared = [...new Set(marks.flatMap((mark) => mark.notes || []))].filter((line) => marks.filter((mark) => (mark.notes || []).includes(line)).length * 2 >= marks.length);
    const byIndex = new Map(marks.map((mark) => [Number(mark.index), mark]));
    const marked = [];
    const rest = [];
    [...list.querySelectorAll(".rec-bet")].forEach((row) => {
      const mark = byIndex.get(Number(row.dataset.i));
      if (!mark) { rest.push(row); return; }
      const why = document.createElement("p");
      why.className = "find-why";
      why.textContent = mark.why;
      row.append(why); if (mark.spans) { const log = document.createElement("div"); log.className = "find-log"; mark.spans.split(". ").forEach((bit) => { const [label, value] = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const name = document.createElement("b"); name.textContent = label; item.append(name, document.createTextNode(value || "")); log.append(item); }); row.append(log); if (mark.lean) { const lean = document.createElement("p"); lean.className = "find-dive"; lean.textContent = mark.lean; row.append(lean); } } const own = (mark.notes || []).filter((line) => !shared.includes(line)); if (own.length) { const dive = document.createElement("p"); dive.className = "find-dive"; dive.textContent = own.join(" · "); row.append(dive); }
      row.dataset.gap = String(mark.gap);
      row.classList.add("find-mark");
      marked.push(row);
    });
    marked.sort((a, b) => Number(b.dataset.gap) - Number(a.dataset.gap));
    const hits = document.createElement("div");
    hits.className = "find-hits";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Show all"; list.classList.add("find-only-on");
    button.addEventListener("click", () => { const on = list.classList.toggle("find-only-on"); button.textContent = on ? "Show all" : "Show those"; });
    hits.append(button);
    note.after(hits); if (shared.length) { const once = document.createElement("p"); once.className = "find-dive"; once.textContent = shared.join(" · "); const add = list.querySelector(":scope > button.find-parlay"); (add || hits).after(once); }
    marked.concat(rest).forEach((row) => list.append(row));
  }).catch(() => { if (wait.isConnected) wait.remove(); if (board && !board.querySelector(".bet-load")) board.classList.remove("find-wait"); });
}

window.paintFind = paintFind;
