/** Search the board by player, team, or game. Longest price first. */

const parlayPick = new Map(), parlayLeg = new Map(), legOwner = new Map(), parlayKey = (bet) => [bet.label, bet.odds, bet.match, bet.kickoff].join("|");

function legOwns(person, bet) {
  return !!(person && person.name && bet && (String(bet.label || "").startsWith(person.name) || legOwner.get(parlayKey(bet)) === person.name));
}

function legName(bet) {
  const person = [...parlayPick.values()].find((one) => legOwns(one, bet));
  if (person) return person.name;
  const owned = legOwner.get(parlayKey(bet));
  if (owned) return owned;
  const loose = legLoose(bet), who = String(loose.who || "").trim();
  const game = typeof gameShort === "function" ? gameShort(bet.match) : "";
  return who && who !== game && !who.includes("@") ? who : "";
}

function legLoose(bet) {
  const raw = String(bet.label || "").split(/\s+—\s+/)[0].trim();
  const market = String(bet.market || "").replace(/^alt(?:ernate)?\s+/i, "").trim();
  const game = typeof gameShort === "function" ? gameShort(bet.match) : "";
  if (/^(over|under)(\s+[\d.]+)?$/i.test(raw)) return { who: game, prop: `${raw} ${market}`.trim() };
  const cut = raw.match(/^(.*?)\s+(\d+\+.*|(?:over|under)\b.*|anytime\b.*|first\b.*|to\s+(?:win|score|record)\b.*)$/i);
  const name = cut ? cut[1].trim() : "";
  const words = name.split(/\s+/).filter(Boolean);
  if (name && words.length >= 2 && words.length <= 4) return { who: name, prop: cut[2].trim() };
  const plain = raw.split(/\s+/).filter(Boolean);
  if (plain.length >= 2 && plain.length <= 3 && !/\d/.test(raw) && !/\b(over|under|moneyline|spread|total)\b/i.test(raw)) return { who: raw, prop: market };
  return { who: game, prop: raw };
}

function paintParlay() {
  [...legOwner.keys()].forEach((key) => { if (!parlayLeg.has(key)) legOwner.delete(key); });
  document.querySelectorAll(".find-roster > button.find-parlay").forEach((node) => { node.hidden = parlayPick.size < 2; node.textContent = parlayPick.size < 2 ? "Build a parlay" : `Build a ${parlayPick.size}-leg parlay`; }); document.querySelectorAll(".find-list button.find-parlay, .find-profile button.find-parlay").forEach((node) => { const on = parlayPick.has(node.dataset.key); node.textContent = on ? "In the parlay" : "Add to the parlay"; node.disabled = on; }); document.querySelectorAll("button.find-leg").forEach((node) => { const on = parlayLeg.has(node.dataset.key); node.classList.toggle("on", on); node.textContent = on ? "In the parlay" : "Add this leg"; });
  document.querySelectorAll(".find-tray").forEach((tray) => {
  tray.replaceChildren();
  tray.hidden = !parlayPick.size && !parlayLeg.size;
  if (tray.hidden) { tray.classList.remove("find-slim", "find-shut"); return; }
  const say = document.createElement("p"); say.className = "find-say"; say.textContent = "THE BET"; const fold = document.createElement("button"); fold.type = "button"; fold.className = "find-fold"; const folded = () => { const n = parlayLeg.size || parlayPick.size, word = parlayLeg.size || !parlayPick.size ? "leg" : "player"; fold.textContent = tray.classList.contains("find-shut") ? `Show ${n} ${word}${n === 1 ? "" : "s"} ▾` : "Hide ▴"; }; folded(); fold.addEventListener("click", () => { if (tray.classList.toggle("find-shut")) { tray.classList.remove("find-edit"); const edit = tray.querySelector("button.find-edit"); if (edit) { edit.textContent = "Edit props"; edit.classList.remove("on"); } } folded(); }); say.append(fold); tray.append(say); parlayPick.forEach((person) => {
    const row = document.createElement("div"); row.className = "find-row"; const top = document.createElement("div"); top.className = "find-in"; const name = document.createElement("button"); name.type = "button"; name.className = "find-name"; name.textContent = person.name; name.dataset.key = person.key; const out = document.createElement("button"); out.type = "button"; out.className = "find-out"; const bare = ![...parlayLeg.values()].some((bet) => legOwns(person, bet)); out.textContent = bare ? "×" : "Take out"; if (bare) { out.classList.add("find-x"); out.setAttribute("aria-label", `Take out ${person.name}`); } out.addEventListener("click", () => { parlayPick.delete(person.key); [...parlayLeg.entries()].forEach(([key, bet]) => { if (legOwns(person, bet)) { parlayLeg.delete(key); legOwner.delete(key); } }); document.querySelectorAll(".find-names button").forEach((node) => { if (node.textContent === person.name) { node.classList.remove("on"); node.setAttribute("aria-pressed", "false"); } }); paintParlay(); }); top.append(name, out); row.append(top); if (bare) { const hint = document.createElement("button"); hint.type = "button"; hint.className = "find-pick-hint"; const want = typeof shotWant !== "undefined" && shotWant.get(person.key); hint.textContent = want ? `${want.charAt(0).toUpperCase()}${want.slice(1)} · tap to pick the line ▸` : `Tap ${person.name} to pick the bet ▸`; hint.addEventListener("click", () => {
        const glass = document.getElementById("desk-glass-in");
        if (glass) glass.scrollTo({ top: 0, behavior: "smooth" });
        name.click();
      }); row.append(hint); }
    const mine = [...parlayLeg.entries()].filter(([, bet]) => legOwns(person, bet)); mine.forEach(([key, bet]) => { const line = document.createElement("div"); line.className = "find-chose"; line.dataset.key = key; const said = document.createElement("span"); const price = Number(bet.odds); const rest = String(bet.label || "").replace(person.name, "").split(/\s+—\s+/)[0].trim(); const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").trim(); const what = typeof legSwapWhat === "function" ? legSwapWhat(person, bet) : /^most\s/i.test(market) && !/\d/.test(rest) ? market : !rest || /^(over|under)(\s+[\d.]+)?$/i.test(rest) ? [rest, market.replace(/^alt\s+/i, "")].filter(Boolean).join(" ") : rest; said.innerHTML = [`<i class="who">${esc(person.name)}</i>`, what && `<i class="prop">${esc(what)}</i>`, `<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`].filter(Boolean).join(""); const change = document.createElement("button"); change.type = "button"; change.className = "find-out"; change.textContent = "×"; change.setAttribute("aria-label", "Remove this leg"); change.addEventListener("click", () => { parlayLeg.delete(key); legOwner.delete(key); if (![...parlayLeg.values()].some((bet) => legOwns(person, bet))) return out.click(); paintParlay(); }); const hist = document.createElement("button"); hist.type = "button"; hist.className = "find-leg-hist"; hist.dataset.key = key; hist.title = "Show the history"; hist.setAttribute("aria-label", `Show the history for ${person.name}`); line.append(said, hist, change); row.append(line); });
    tray.append(row); });
  parlayLeg.forEach((bet, key) => { if ([...parlayPick.values()].some((person) => legOwns(person, bet))) return; const row = document.createElement("div"); row.className = "find-row find-loose"; const line = document.createElement("div"); line.className = "find-chose"; line.dataset.key = key; const said = document.createElement("span"); const price = Number(bet.odds); const loose = legLoose(bet); said.innerHTML = [loose.who && `<i class="who">${esc(loose.who)}</i>`, `<i class="prop">${esc(loose.prop)}</i>`, `<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`].filter(Boolean).join(""); const out = document.createElement("button"); out.type = "button"; out.className = "find-out"; out.textContent = "×"; out.setAttribute("aria-label", "Remove this leg"); out.addEventListener("click", () => { parlayLeg.delete(key); legOwner.delete(key); paintParlay(); }); line.append(said, out); row.append(line); tray.append(row); });
  if (typeof parlayHint === "function") { const hint = parlayHint([...parlayLeg.values()]); if (hint) { if (hint.nodeType) tray.append(hint); else { const note = document.createElement("p"); note.className = "find-why"; note.textContent = hint; tray.append(note); } } } if (typeof trayStack === "function") trayStack(tray, [...parlayLeg.values()]); if (typeof clubTray === "function") clubTray(tray);
  if (!(parlayPick.size < 2 && parlayLeg.size < 1) && typeof paintTrayBuild === "function") paintTrayBuild(tray);
  if (typeof slimTray === "function") slimTray();
  });
}

function findRank(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return -1;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function findCash(odds, stake) {
  const n = Number(odds), bet = Number(stake) > 0 ? Number(stake) : 5;
  if (!n) return "";
  const won = Math.round(bet * (n < 0 ? 100 / -n : n / 100) * 100) / 100;
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
  const pending = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "lookup", when: span, game: span === "today" && typeof saveSeekGame === "string" ? saveSeekGame : "", gameSport: typeof saveSeek === "object" ? saveSeek.get("sport") || "" : "" }) }).then((res) => res.json()).then((data) => { findParts[span] = { at: Date.now(), data }; return data; }).catch((error) => { delete findParts[span]; throw error; });
  findParts[span] = { pending };
  return pending;
}

function paintFind() {
  window.asking = true;
  if (document.body.classList.contains("tv-zoom-on") && typeof tvZoomShut === "function") tvZoomShut();
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; if (window.birdGreet) birdGreet(); return; }
  desk.classList.remove("bird-on"); if (window.tvForce) tvForce(); if (window.tvPush) tvPush();
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
  if (!saved) board.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>Looking up the board.</p></div>`;
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
    setTimeout(() => { if (!board.isConnected || !board.paintSlate) return; board.querySelectorAll(".find-games").forEach((node) => { node.games = null; }); board.people.games = null; board.paintSlate(board.querySelector(".find-week")); const field = board.querySelector("input"); if (field && field.value.trim().length >= 2 && !board.querySelector(".find-match")) field.dispatchEvent(new Event("input")); }, 50);
  }).catch(() => { if (board.isConnected && !board.querySelector("h2")) fillFind(board, {}); });
}

function loadedGames(people, span) {
  const saved = people.games;
  if (saved && saved.n === people.length) return saved[span];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(Date.now()), end = fmt.format(Date.now() + 14 * 24 * 60 * 60 * 1000), now = Date.now(), keep = /^(NFL|NBA|MLB|NHL|WNBA|PGA)$/;
  const buckets = { today: new Map(), week: new Map() };
  people.forEach((person) => (person.bets || []).forEach((bet) => {
    const kick = Date.parse(bet.kickoff || "");
    if (!bet.match || kick !== kick || (kick <= now - 6 * 60 * 60 * 1000 && bet.sport !== "PGA" && !(typeof saveSeekGame === "string" && bet.match === saveSeekGame)) || (bet.sport === "PGA" && kick <= now - 5 * 24 * 60 * 60 * 1000) || !keep.test(bet.sport || "")) return;
    const day = fmt.format(kick), key = `${bet.match}|${bet.kickoff}`;
    const bucket = day === today || kick <= now ? buckets.today : day > today && day <= end ? buckets.week : null;
    if (bucket && !bucket.has(key)) bucket.set(key, bet);
  }));
  const sort = (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff);
  people.games = { n: people.length, today: [...buckets.today.values()].sort(sort), week: [...buckets.week.values()].sort(sort) };
  return people.games[span];
}

function fillFind(board, data) {
  const load = board.querySelector(".bet-load");
  if (load) load.remove();
  const heading = document.createElement("h2");
  heading.textContent = "Build a bet";
  const people = Array.isArray(data.people) ? data.people : [];
  const label = document.createElement("label");
  label.className = "find";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Type a player, team or game";
  input.autocomplete = "off";
  label.append(input);
  const hits = document.createElement("div");
  hits.className = "find-hits";
  const roster = document.createElement("details"); roster.className = "find-roster"; roster.hidden = true;
  const teams = document.createElement("div"); teams.className = "find-teams"; const tray = document.createElement("div"); tray.className = (parlayPick.size || parlayLeg.size) && !window.parlayOpenId ? "find-hits find-tray find-shut" : "find-hits find-tray"; tray.hidden = true;
  const list = document.createElement("div");
  list.className = "find-list";
  board.people = people;
  const today = document.createElement("details"); const week = document.createElement("details"); const span = document.createElement("div"); span.className = "find-span"; const games = document.createElement("button"); games.type = "button"; games.className = "find-games-go"; games.textContent = "The Games"; games.addEventListener("click", () => { window.location.href = "/live"; }); const pickHead = document.createElement("p"); pickHead.className = "find-span-head"; pickHead.textContent = "Or pick a game."; span.append(pickHead, today, week); heading.append(games);
  const pickSpan = (name) => { const on = name === "today"; today.classList.toggle("find-on", on); week.classList.toggle("find-on", !on); if (today.open !== on) today.open = on; if (week.open === on) week.open = !on; };
  today.className = "find-games find-on"; today.dataset.span = "today"; today.open = true; week.className = "find-games find-week"; week.dataset.span = "week";
  today.addEventListener("toggle", () => { if (today.open) pickSpan("today"); }); week.addEventListener("toggle", () => { if (week.open) pickSpan("week"); });
  board.paintSlate = (box) => {
    if (!box) return;
    const rows = box.games = loadedGames(people, box.dataset.span);
    const bySport = new Map();
    rows.forEach((game) => { const sport = game.sport || "Other"; if (!bySport.has(sport)) bySport.set(sport, []); bySport.get(sport).push(game); });
    const head = document.createElement("summary");
    head.textContent = `${box.dataset.span === "today" ? "Today" : "This week"}, ${rows.length} ${rows.length === 1 ? "game" : "games"}`;
    box.replaceChildren(head); box.hidden = rows.length === 0;
    const usa = ["NFL", "NBA", "MLB", "NHL", "WNBA", "PGA"];
    [...bySport.entries()].sort((a, b) => ((usa.indexOf(a[0]) + 1) || 99) - ((usa.indexOf(b[0]) + 1) || 99) || a[0].localeCompare(b[0])).forEach(([sport, games]) => {
      const group = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${sport}, ${games.length} ${games.length === 1 ? "game" : "games"}`; group.append(summary); if (sport === "NFL" && typeof paintLeagueTd === "function") paintLeagueTd(group, people, list, hits);
      games.forEach((game) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = [game.match, game.kickoff && typeof window.when === "function" ? `${window.when(game.kickoff)} ET` : ""].filter(Boolean).join(", "); if (typeof gameUntil === "function") gameUntil(button, game.kickoff, game, people); if (typeof clubSlate === "function") clubSlate(button, game);
        button.addEventListener("click", () => {
          hits.replaceChildren(); teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on"); box.open = false; span.classList.add("find-picked"); games.hidden = false; today.open = false; week.open = false;
          paintMatch(teams, game, people, list, hits, true);
        });
        group.append(button);
      });
      box.append(group);
    });
  };
  board.append(heading, label, hits, tray, span, teams, roster, list); paintParlay(); setTimeout(() => { if (!board.isConnected) return; board.paintSlate(today); week.games = people.games && people.games.week; }, 0);
  let clubStamp = 0;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const stamp = ++clubStamp;
    hits.replaceChildren();
    if (q.length < 2) { list.replaceChildren(); list.classList.remove("find-only-on"); teams.replaceChildren(); roster.stamp = (roster.stamp || 0) + 1; roster.hidden = true; roster.replaceChildren(); const picked = board.querySelector(".find-span"); if (picked) picked.classList.remove("find-picked"); today.open = today.classList.contains("find-on"); week.open = !today.open; return; } teams.replaceChildren();
    board.querySelectorAll(".find-games").forEach((node) => { node.open = false; });
    const words = q.split(" ").filter(Boolean);
    const todayGames = today.games || (today.games = loadedGames(people, "today")), weekGames = week.games || (week.games = loadedGames(people, "week")), todayOn = today.classList.contains("find-on");
    const slate = todayOn ? todayGames : weekGames, keys = new Set(slate.map((game) => `${game.match}|${game.kickoff}`));
    const plays = (person, set) => (person.bets || []).some((bet) => set.has(`${bet.match}|${bet.kickoff}`));
    const want = plainName(q), named = (person) => plainName(person.name).includes(want);
    people.filter((person) => named(person) && plays(person, keys) && !(person.kind === "team" && slate.some((game) => String(game.match || "").includes(person.name) && words.every((word) => String(game.match || "").toLowerCase().includes(word))))).slice(0, 8).forEach((person) => { const button = document.createElement("button"); button.type = "button"; button.textContent = person.name; button.addEventListener("click", () => showFind(list, hits, person, roster, people)); hits.append(button); });
    slate.filter((game) => words.every((word) => String(game.match || "").toLowerCase().includes(word))).slice(0, 8).forEach((game) => { const button = document.createElement("button"); button.type = "button"; button.textContent = [game.match, game.kickoff && window.when ? `${window.when(game.kickoff)} ET` : ""].filter(Boolean).join(", "); button.addEventListener("click", () => { hits.replaceChildren(); teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on"); span.classList.add("find-picked"); games.hidden = false; today.open = false; week.open = false; paintMatch(teams, game, people, list, hits, true); }); hits.append(button); });
    if (!(findParts.week && findParts.week.data)) { const note = document.createElement("p"); note.className = "quiet"; note.textContent = "Looking up the rest of the week."; hits.append(note); }
    const otherGames = todayOn ? weekGames : todayGames, otherKeys = new Set(otherGames.map((game) => `${game.match}|${game.kickoff}`)), otherPeople = people.filter((person) => person.kind === "player" && named(person) && plays(person, otherKeys)), gameWords = (game) => words.every((word) => String(game.match || "").toLowerCase().includes(word));
    const otherHit = !hits.querySelector("button") && (otherPeople.length > 0 || otherGames.some(gameWords));
    if (otherHit && !todayOn && otherPeople.length === 1 && !otherGames.some(gameWords)) showFind(list, hits, otherPeople[0], roster, people);
    else if (otherHit) { const none = document.createElement("p"), who = otherPeople.length === 1 ? otherPeople[0].name : input.value.trim(); none.className = "quiet"; none.style.cssText = "flex:1 0 100%;text-align:center;margin:0"; none.textContent = todayOn ? `No games today for ${who}.` : `No games later this week for ${who}.`; hits.append(none); const ask = document.createElement("button"); ask.type = "button"; ask.dataset.week = "1"; ask.textContent = todayOn ? "Search this week?" : "Search today?"; ask.style.cssText = "flex:1 0 100%;background:transparent;color:#e7c15a"; ask.addEventListener("click", () => { pickSpan(todayOn ? "week" : "today"); input.dispatchEvent(new Event("input")); (todayOn ? week : today).open = true; }); hits.append(ask); }
    const missed = !hits.querySelector("button:not([data-week])") && !list.querySelector("h3") && q.split(" ").length >= 2 && !otherHit;
    if (missed) { const note = document.createElement("p"); note.className = "quiet"; note.textContent = "Nobody on the board matches that. Player props for that name are not posted yet."; hits.append(note); }
    if (q.length < 3) return;
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "club", name: q }) }).then((res) => res.json()).then((data) => {
      if (stamp !== clubStamp || !hits.isConnected) return; data.out = (data.out || []).filter((row) => plainName(row.player) === plainName(q));
      (data.clubs || []).forEach((row) => { const person = people.find((item) => plainName(item.name) === plainName(row.player)); if (!person) return; if (row.pos) person.pos = row.pos; if (row.nick || row.team) person.team = row.nick || row.team; hits.querySelectorAll("button:not([data-week])").forEach((node) => { if (plainName(node.textContent) === plainName(person.name)) node.textContent = [person.name, person.pos, person.team].filter(Boolean).join(", "); }); const head = list.querySelector("h3"); if (head && plainName(head.textContent).startsWith(plainName(person.name))) { const count = head.querySelector(".rec-count"); const spot = [person.pos, person.team].filter(Boolean).join(", "); head.innerHTML = `${esc(person.name)}${spot ? `, ${esc(spot)}` : ""} ${count ? count.outerHTML : ""}`; } });
      (data.out || []).slice(0, 3).reverse().forEach((row) => { const line = document.createElement("p"); line.className = "find-why"; line.style.flex = "1 0 100%"; const note = String(row.note || "").trim(); line.textContent = row.status === "doubtful" ? `${row.player} is doubtful.${note ? ` ${note}` : ""}` : `${row.player} is not playing.${note ? ` ${note}` : ""}`; hits.prepend(line); });
      if ((data.out || []).length) { hits.querySelectorAll(":scope > p.quiet").forEach((node) => { if (/not posted yet/.test(node.textContent || "")) node.remove(); }); const ask = hits.querySelector("[data-week]"); if (ask) ask.remove(); }
      const clubs = (data.clubs || []).map((row) => ({ player: row.player, teamName: row.team || "", pos: row.pos || "", nick: row.nick || "", sport: row.sport || "", team: people.find((person) => person.kind === "team" && person.name.toLowerCase() === String(row.team || "").toLowerCase() && (person.bets || []).length) }));
      if (clubs.length && !hits.querySelector("button") && !list.querySelector("h3") && !(data.out || []).length) { hits.replaceChildren(); clubs.forEach((row) => { const line = document.createElement("p"); line.className = "find-why"; line.style.flex = "1 0 100%"; line.textContent = row.team ? `${row.player} has no props posted. ${row.team.name} has lines.` : `${row.player}, ${row.teamName}. No bets posted.`; hits.append(line); const card = document.createElement("button"); card.type = "button"; card.textContent = row.player; card.addEventListener("click", () => showFind(list, hits, { kind: "player", key: `club:${plainName(row.player)}`, name: row.player, pos: row.pos, team: row.nick || row.teamName, sport: row.sport, bets: [] }, roster, people)); hits.append(card); if (!row.team) return; const button = document.createElement("button"); button.type = "button"; button.textContent = row.team.name; button.addEventListener("click", () => showFind(list, hits, row.team, roster, people)); hits.append(button); }); }
      const only = [...hits.querySelectorAll("button:not([data-week])")]; const found = people.filter((item) => item.kind === "player" && item.team && only.some((node) => plainName(node.textContent.split(",")[0]) === plainName(item.name))); if (found.length && found.every((item) => item.team === found[0].team) && typeof clubTheme === "function") clubTheme(list, found[0]); if (only.length === 1 && !list.querySelector("h3") && !(data.out || []).length) only[0].click();
    }).catch(() => { if (stamp !== clubStamp || !hits.isConnected) return; const only = [...hits.querySelectorAll("button:not([data-week])")]; if (only.length === 1 && !list.querySelector("h3")) only[0].click(); });
  });
}

function plainName(name) {
  return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

function closePlayerPop() {
  const pop = document.getElementById("find-profile-pop");
  if (pop) pop.remove();
  if (closePlayerPop.onKey) {
    document.removeEventListener("keydown", closePlayerPop.onKey);
    closePlayerPop.onKey = null;
  }
}

function profileBetHit(person, board) {
  if (!person || !board) return null;
  const fold = (text) => (typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase());
  const who = fold(person.name);
  const pick = ((typeof homeRecs !== "undefined" && homeRecs && homeRecs.picks) || []).find((row) => fold(row.who || "") === who || fold(row.label || "").startsWith(`${who} `));
  if (pick && typeof startHit === "function") {
    const hit = startHit(board, pick);
    if (hit) return { ...hit, rec: true };
  }
  const people = board.people || [];
  for (const match of board.querySelectorAll(".find-teams .find-match")) {
    const box = match.querySelector(":scope > .find-bets");
    const sets = [box && box.scriptBets, box && box.scriptBets && box.scriptBets.stars].filter(Boolean);
    for (const set of sets) {
      const row = (set.picks || []).find((one) => fold(one.who) === who);
      if (!row || typeof scriptPickHit !== "function") continue;
      const game = { match: row.match || ((person.bets || [])[0] && (person.bets || [])[0].match) || "" };
      const hit = scriptPickHit(row, game, people);
      if (hit) return { ...hit, rec: true };
    }
  }
  return null;
}

function profileBetPick(person) {
  if (!person || person.kind !== "player") return null;
  const name = String(person.name || "");
  if (!name) return null;
  const skip = /half|quarter|\b1st\b|first|last|either|each quarter|each half|in the first|most\s|period|inning/i;
  const chance = (odds) => {
    const price = Number(odds);
    return price > 0 ? 100 / (price + 100) : price < 0 ? -price / (-price + 100) : 0;
  };
  const own = (person.bets || []).filter((bet) => Number(bet.odds) && String(bet.label || "").startsWith(name));
  const rows = own.filter((bet) => !skip.test(`${bet.label || ""} ${bet.market || ""}`) && !/\bunder\b/i.test(bet.label || ""));
  const pool = rows.length ? rows : own;
  if (!pool.length) {
    const any = (person.bets || []).find((bet) => Number(bet.odds));
    return any ? { person, bet: any, rec: false } : null;
  }
  pool.sort((a, b) => Math.abs(chance(a.odds) - 0.524) - Math.abs(chance(b.odds) - 0.524) || findRank(b.odds) - findRank(a.odds));
  return { person, bet: pool[0], rec: false };
}

function parlayOpenTray(scroll) {
  document.querySelectorAll(".find-tray.find-shut").forEach((tray) => {
    const fold = tray.querySelector(".find-fold");
    if (!fold) return;
    if (typeof saveAutoShut !== "undefined") saveAutoShut.delete(tray);
    fold.click();
  });
  if (scroll === false) return null;
  const tray = document.querySelector("#desk-glass-in .find-tray:not([hidden])") || document.querySelector(".find-tray:not([hidden])");
  if (tray) {
    tray.style.scrollMarginTop = "5.5rem";
    tray.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  return tray;
}

const rosterPropDrill = new Map();
let rosterPropRec = localStorage.getItem("rosterPropRec") !== "0";

function rosterPropShut(names) {
  if (!names) return;
  names.querySelectorAll(":scope > .roster-props, :scope > .desk-rec-ask").forEach((node) => node.remove());
}

function rosterPropCats(person) {
  if (!person || typeof legSwapCatKey !== "function") return [];
  const best = new Map();
  (person.bets || []).forEach((bet) => {
    if (!Number(bet.odds) || parlayLeg.has(parlayKey(bet))) return;
    const cat = legSwapCatKey(person, bet), rec = typeof legIsRec === "function" && legIsRec(bet), had = best.get(cat);
    if (!had) best.set(cat, { person, bet, cat, count: 1, rec: !!rec });
    else {
      had.count += 1;
      if (rec && !had.rec) { had.bet = bet; had.rec = true; }
    }
  });
  return [...best.values()].sort((a, b) => Number(b.rec) - Number(a.rec) || (typeof legSwapCatSay === "function" ? legSwapCatSay(a.person, a.bet).localeCompare(legSwapCatSay(b.person, b.bet)) : 0));
}

function rosterPropLines(person, cat) {
  if (!person || !cat || typeof legSwapStat !== "function") return [];
  const under = cat.endsWith("|1"), stat = cat.slice(0, cat.lastIndexOf("|"));
  const num = (bet) => Number((String(bet.label || "").replace(person.name, "").match(/\d+(?:\.\d+)?/) || String(bet.market || "").match(/\d+(?:\.\d+)?/) || [])[0]) || 0;
  const seen = new Set(), rows = [];
  (person.bets || []).forEach((bet) => {
    const id = `${bet.label}|${bet.market}`;
    if (!Number(bet.odds) || seen.has(id) || parlayLeg.has(parlayKey(bet))) return;
    if (legSwapStat(person, bet) !== stat || /\bunder\b/i.test(bet.label || "") !== under) return;
    seen.add(id);
    rows.push({ person, bet });
  });
  return rows.sort((a, b) => num(a.bet) - num(b.bet));
}

function rosterPropRecs(person) {
  if (!person || typeof legIsRec !== "function") return [];
  const best = new Map();
  (person.bets || []).forEach((bet) => {
    if (!Number(bet.odds) || !legIsRec(bet) || parlayLeg.has(parlayKey(bet))) return;
    const cat = typeof legSwapCatKey === "function" ? legSwapCatKey(person, bet) : `${bet.market}|${bet.label}`;
    if (!best.has(cat)) best.set(cat, { person, bet, cat });
  });
  return [...best.values()];
}

function rosterPropAsk(box, hit) {
  box.querySelectorAll(".desk-rec-ask").forEach((node) => node.remove());
  if (!parlayLeg.size) { profileBetPut(hit, false); rosterPropShut(box.parentElement); return; }
  const ask = document.createElement("span");
  ask.className = "desk-rec-ask";
  ask.innerHTML = `<i>You have a bet open.</i><span role="button" tabindex="0" data-bet-go="add">Add to this bet</span><span role="button" tabindex="0" data-bet-go="new">Start a new bet</span>`;
  ask.addEventListener("click", (event) => {
    const go = event.target.closest("[data-bet-go]");
    if (!go) return;
    event.preventDefault();
    event.stopPropagation();
    ask.remove();
    profileBetPut(hit, go.dataset.betGo === "new");
    rosterPropShut(box.parentElement);
  });
  box.append(ask);
}

function rosterPropPaint(box, person) {
  box.replaceChildren();
  const top = document.createElement("div");
  top.className = "find-swap-top";
  const held = document.createElement("span");
  held.className = "find-swap-held";
  held.textContent = person.name;
  const rec = document.createElement("label");
  rec.className = "find-swap-rec";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = rosterPropRec;
  check.addEventListener("change", () => {
    rosterPropRec = check.checked;
    try { localStorage.setItem("rosterPropRec", rosterPropRec ? "1" : "0"); } catch (error) {}
    if (rosterPropRec) rosterPropDrill.delete(person.key);
    rosterPropPaint(box, person);
  });
  rec.append(check, document.createTextNode("Show Recommended"));
  const shut = document.createElement("button");
  shut.type = "button";
  shut.className = "find-swap-x";
  shut.textContent = "Close";
  shut.addEventListener("click", () => { rosterPropDrill.delete(person.key); rosterPropShut(box.parentElement); });
  top.append(held, rec, shut);
  box.append(top);

  const drill = rosterPropDrill.get(person.key) || "";
  const recs = rosterPropRec ? rosterPropRecs(person) : [];
  const useRec = !!(rosterPropRec && recs.length);
  if (drill && !useRec) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "find-swap-back";
    const sample = (person.bets || []).find((bet) => typeof legSwapCatKey === "function" && legSwapCatKey(person, bet) === drill);
    back.textContent = `◂ ${sample && typeof legSwapCatSay === "function" ? legSwapCatSay(person, sample) : "Props"}`;
    back.addEventListener("click", () => { rosterPropDrill.delete(person.key); rosterPropPaint(box, person); });
    box.append(back);
  }

  let rows;
  if (useRec) rows = recs.map((row) => ({ ...row, mode: "line" }));
  else if (drill) rows = rosterPropLines(person, drill).map((row) => ({ ...row, mode: "line" }));
  else rows = rosterPropCats(person).map((row) => ({ ...row, mode: "cat" }));

  if (!rows.length) {
    const none = document.createElement("p");
    none.textContent = useRec ? "No recommended props for this player." : "FanDuel has no props posted for this player.";
    box.append(none);
    return;
  }

  rows.forEach((row) => {
    const { bet, mode, count } = row;
    const price = Number(bet.odds);
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-swap-go";
    if (mode === "cat") {
      go.innerHTML = [`<i class="prop">${esc(typeof legSwapCatSay === "function" ? legSwapCatSay(person, bet) : bet.market)}</i>`, count > 1 && `<i class="pct">${esc(`${count} lines`)}</i>`].filter(Boolean).join("");
      go.addEventListener("click", () => { rosterPropDrill.set(person.key, row.cat); rosterPropPaint(box, person); });
    } else {
      go.innerHTML = [`<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, typeof findPct === "function" && findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, `<i class="prop">${esc(typeof legSwapWhat === "function" ? legSwapWhat(person, bet) : bet.label)}</i>`].filter(Boolean).join("");
      const pill = typeof scriptRecPill === "function" && scriptRecPill(bet);
      if (pill) go.append(pill);
      go.addEventListener("click", () => rosterPropAsk(box, { person, bet, rec: typeof legIsRec === "function" && legIsRec(bet) }));
    }
    const line = document.createElement("div");
    line.className = "find-swap-row";
    line.append(go);
    box.append(line);
  });
}

function rosterOpenProps(person, anchor) {
  if (!person || person.kind !== "player") return;
  const chip = anchor && (anchor.closest(".find-chip") || anchor);
  const names = chip && chip.closest(".find-names");
  if (!names) return;
  const open = names.querySelector(`:scope > .roster-props[data-key="${person.key}"]`);
  rosterPropShut(names);
  if (open) { rosterPropDrill.delete(person.key); return; }
  const box = document.createElement("div");
  box.className = "roster-props find-tray-swap";
  box.dataset.key = person.key;
  chip.after(box);
  rosterPropPaint(box, person);
}

function profileBetPut(hit, fresh) {
  if (!hit || typeof parlayLeg === "undefined" || typeof parlayKey !== "function") return;
  if (fresh && parlayLeg.size && typeof saveNew === "function") saveNew();
  if (parlayLeg.has(parlayKey(hit.bet)) || parlayLeg.size >= 8) {
    closePlayerPop();
    return;
  }
  if (hit.rec && typeof betFromSay === "function") betFromSay("Recommended", fresh);
  if (typeof legSwapAdd === "function") legSwapAdd(hit.person, hit.bet);
  else {
    parlayLeg.set(parlayKey(hit.bet), hit.bet);
    if (hit.person && hit.person.name && typeof legOwner !== "undefined") legOwner.set(parlayKey(hit.bet), hit.person.name);
    if (hit.person && hit.person.kind === "player" && !parlayPick.has(hit.person.key) && parlayPick.size < 8) parlayPick.set(hit.person.key, hit.person);
    if (typeof paintParlay === "function") paintParlay();
  }
  closePlayerPop();
  parlayOpenTray();
}

function profileAskPut(acts, hit) {
  if (!acts || !hit) return;
  const ask = acts.querySelector(".desk-rec-ask");
  if (ask) { ask.remove(); return; }
  if (typeof parlayLeg === "undefined" || !parlayLeg.size) { profileBetPut(hit, false); return; }
  const row = document.createElement("span");
  row.className = "desk-rec-ask";
  row.innerHTML = `<i>You have a bet open.</i><span role="button" tabindex="0" data-bet-go="add">Add to this bet</span><span role="button" tabindex="0" data-bet-go="new">Start a new bet</span>`;
  row.addEventListener("click", (event) => {
    const go = event.target.closest("[data-bet-go]");
    if (!go) return;
    event.preventDefault();
    event.stopPropagation();
    row.remove();
    profileBetPut(hit, go.dataset.betGo === "new");
  });
  acts.after(row);
}

function profileTdBet(person, kind, tip) {
  const tab = String(kind || "");
  if (!/anytime td|touchdowns/i.test(tab)) return null;
  const want2 = /2 anytime/i.test(tab), want3 = /3 anytime/i.test(tab);
  const skip = /half|quarter|\b1st\b|first|last|either|each quarter|each half/;
  const match = tip && tip.match, kickoff = tip && tip.kickoff, odds = tip && Number(tip.odds);
  const rows = (person.bets || []).filter((bet) => {
    if (String(bet.sport || "").toUpperCase() !== "NFL") return false;
    if (match && bet.match !== match) return false;
    if (kickoff && bet.kickoff !== kickoff) return false;
    const market = String(bet.market || "").toLowerCase();
    const text = `${bet.label || ""} ${bet.market || ""}`.toLowerCase().replace(/\btds\b/g, "touchdowns").replace(/\btd\b/g, "touchdown");
    if (want2) return market === "to score 2+ touchdowns";
    if (want3) return market === "to score 3+ touchdowns";
    if (skip.test(text) || /\b[23]\+/.test(text)) return false;
    return /anytime touchdown scorer|any time touchdown scorer/.test(text);
  });
  if (!rows.length) return null;
  const bet = (odds && rows.find((row) => Number(row.odds) === odds)) || rows[0];
  const label = want3 ? "Add 3+ TDs" : want2 ? "Add 2+ TDs" : "Add anytime TD";
  return { person, bet, label };
}

function openPlayerPop(person, list, bets, prefer) {
  if (!person || person.kind !== "player") return null;
  const rows = (bets || person.bets || []).slice().sort((a, b) => findRank(b.odds) - findRank(a.odds));
  const golf = rows.some((bet) => bet.sport === "PGA");
  const key = String(person.key || person.name || "");
  const open = document.getElementById("find-profile-pop");
  if (open && open.dataset.key === key) { closePlayerPop(); return null; }
  closePlayerPop();
  const board = list && list.closest(".find-board");
  const pop = document.createElement("div");
  pop.id = "find-profile-pop";
  pop.dataset.key = key;
  const profile = document.createElement("div");
  profile.className = "find-profile";
  profile.setAttribute("role", "dialog");
  profile.setAttribute("aria-modal", "true");
  profile.setAttribute("aria-label", person.name);
  const x = document.createElement("button");
  x.type = "button";
  x.className = "find-profile-x";
  x.setAttribute("aria-label", "Close");
  x.innerHTML = "&times;";
  x.addEventListener("click", closePlayerPop);
  const heading = document.createElement("h3");
  heading.innerHTML = `${esc(person.name)}${person.pos || person.team ? `, ${esc([person.pos, person.team].filter(Boolean).join(", "))}` : ""} <span class="rec-count">${!rows.length ? "No bets posted" : `${rows.length} available bet${rows.length === 1 ? "" : "s"}`}</span>`;
  profile.append(x, heading);
  if (rows.length && !golf) {
    const acts = document.createElement("span");
    acts.className = "find-profile-acts";
    const preferHit = prefer && prefer.bet ? { person: prefer.person || person, bet: prefer.bet, rec: true } : null;
    const already = preferHit && typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(preferHit.bet));
    const betIt = document.createElement("button");
    betIt.type = "button";
    betIt.className = "find-profile-bet";
    betIt.textContent = already ? "In the parlay" : "Bet it";
    betIt.disabled = !!already;
    betIt.addEventListener("click", () => {
      if (betIt.disabled) return;
      const hit = preferHit || profileBetHit(person, board) || profileBetPick(person);
      if (!hit) return;
      if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(hit.bet))) {
        betIt.textContent = "In the parlay";
        betIt.disabled = true;
        closePlayerPop();
        return;
      }
      profileAskPut(acts, hit);
    });
    const scriptGo = document.createElement("button");
    scriptGo.type = "button";
    scriptGo.className = "find-game-script-go";
    scriptGo.textContent = "View game script";
    scriptGo.addEventListener("click", () => {
      closePlayerPop();
      if (!board) return;
      const bet = (preferHit && preferHit.bet) || rows[0];
      if (!bet || !bet.match) return;
      const want = String(bet.match);
      const findMatch = () => [...board.querySelectorAll(".find-teams .find-match")].find((node) => {
        const sides = [...node.querySelectorAll(":scope > .find-side-go")].map((side) => side.textContent.split(",")[0].trim());
        return sides.length >= 2 && sides.every((side) => want.includes(side));
      });
      let match = findMatch();
      if (!match) {
        if (typeof startOpen === "function") startOpen(board, bet);
        else {
          const teams = board.querySelector(":scope > .find-teams");
          const listNode = board.querySelector(":scope > .find-list");
          const hits = board.querySelector(":scope > .find-hits:not(.find-tray)");
          const span = board.querySelector(":scope > .find-span");
          const more = board.querySelector(".find-games-go");
          if (!teams || !listNode) return;
          if (hits) hits.replaceChildren();
          teams.replaceChildren();
          listNode.replaceChildren();
          listNode.classList.remove("find-only-on");
          if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
          if (more) more.hidden = false;
          paintMatch(teams, bet, board.people || [], listNode, hits, true);
        }
        match = findMatch() || board.querySelector(".find-teams .find-match");
      }
      if (!match) return;
      if (match.classList.contains("find-game-shut")) {
        const fold = match.querySelector(":scope > .find-when .find-game-fold");
        if (fold) fold.click();
        else match.classList.remove("find-game-shut");
      }
      const script = match.querySelector(":scope > .find-script:not(.find-bets)") || match.querySelector(":scope > .find-script");
      if (script) script.open = true;
      const target = script || match;
      target.style.scrollMarginTop = "5.5rem";
      if (typeof gameScrollTo === "function") gameScrollTo(target);
      else target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    acts.append(betIt, scriptGo);
    profile.append(acts);
  }
  pop.append(profile);
  pop.addEventListener("click", (event) => { if (event.target === pop) closePlayerPop(); });
  closePlayerPop.onKey = (event) => { if (event.key === "Escape") closePlayerPop(); };
  document.addEventListener("keydown", closePlayerPop.onKey);
  document.body.append(pop);
  if (window.paintCard && !golf) {
    heading.after = (...nodes) => profile.append(...nodes);
    paintCard(list || profile, heading, person);
  }
  if (typeof scriptRecTag === "function") scriptRecTag();
  if (typeof wherePaint === "function") wherePaint();
  return profile;
}

function showCardInGame(anchor, person) {
  if (!anchor || !person) return false;
  const match = anchor.closest(".find-match");
  if (!match) return false;
  const list = match.closest(".find-board") && match.closest(".find-board").querySelector(".find-list");
  openPlayerPop(person, list);
  return true;
}

function fillRoster(roster, team, list, hits, people) {
  const stamp = (roster.stamp = (roster.stamp || 0) + 1);
  roster.hidden = true;
  roster.open = false;
  roster.replaceChildren();
  const sport = (team.bets && team.bets[0] && team.bets[0].sport) || "";
  Promise.all([fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: team.name, sport }) }).then((res) => res.json()), fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "out" }) }).then((res) => res.json()).catch(() => ({}))]).then(([data, report]) => {
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
    const bare = (name) => plainName(name).replace(/ (jr|sr|ii|iii|iv|v)$/, ""); (people || []).forEach((item) => { if (item.kind === "player" && (item.bets || []).length) byName.set(bare(item.name), item); });
    const lined = [], quiet = [], folded = [];
    rows.forEach((row) => { const name = row && row.name || row; const hit = byName.get(bare(name)); if (hit) lined.push(hit); else if (row && row.fold) folded.push(name); else quiet.push(name); });
    const withProps = lined.length === 1 ? "1 has props" : `${lined.length} have props`;
    const kick = team.bets && team.bets[0] && team.bets[0].kickoff, day = kick ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.parse(kick)) : "", club = plainName(String(team.name || "").replace(/\(.*?\)/g, "")), nick = club.split(" ").pop(), absent = new Set((report.out || []).filter((row) => { const side = plainName(row.team); return (side === club || (nick.length > 3 && side.endsWith(` ${nick}`))) && (!row.back || !day || day < row.back); }).map((row) => plainName(row.player)));
    summary.textContent = `${rows.length} players, ${withProps}${absent.size ? `, ${absent.size} out` : ""}`;
    lined.sort((a, b) => a.name.localeCompare(b.name));
    quiet.sort((a, b) => Number(absent.has(plainName(b))) - Number(absent.has(plainName(a))) || a.localeCompare(b));
    folded.sort((a, b) => a.localeCompare(b));
    names.replaceChildren();
    lined.forEach((hit) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.key = hit.key;
      button.textContent = absent.has(plainName(hit.name)) ? `${hit.name}, out` : hit.name;
      if (parlayPick.has(hit.key)) { button.classList.add("on"); button.setAttribute("aria-pressed", "true"); }
      button.addEventListener("click", () => {
        if (button.closest(".find-everyone")) { rosterOpenProps(hit, button); return; }
        if (showCardInGame(button, hit)) return;
        const field = document.querySelector(".find-board label.find input");
        const boardRoster = list.parentElement && list.parentElement.querySelector(":scope > .find-roster");
        if (field) { field.value = hit.name; field.dispatchEvent(new Event("input", { bubbles: true })); }
        showFind(list, hits, hit, boardRoster || roster, people);
      });
      names.append(button);
    });
    quiet.forEach((name) => { const span = document.createElement("span"); const gone = absent.has(plainName(name)); span.textContent = gone ? `${name}, out` : name; if (gone) span.className = "find-absent"; names.append(span); });
    if (folded.length) { const more = document.createElement("details"); more.style.flex = "1 0 100%"; const sum = document.createElement("summary"); sum.textContent = `Defense and the line, ${folded.length}`; more.append(sum); folded.forEach((name) => { const span = document.createElement("span"); const gone = absent.has(plainName(name)); span.textContent = gone ? `${name}, out` : name; if (gone) span.className = "find-absent"; more.append(span); }); names.append(more); } if (typeof rosterGroup === "function") rosterGroup(roster, names, lined, rows, team);
    const build = document.createElement("button");
    build.type = "button";
    build.className = "find-parlay";
    build.addEventListener("click", () => { const tray = list.closest(".find-board") && list.closest(".find-board").querySelector(".find-tray"); const fold = tray && tray.querySelector(".find-fold"); if (tray && tray.classList.contains("find-shut") && fold) fold.click(); let box = list.parentElement; while (box && box !== document.body && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement; (box && box !== document.body ? box : window).scrollTo({ top: 0, behavior: "smooth" }); });
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
    return `This is the one on the board. ${rosterWho(id, hits, known)}.`;
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
  const fits = rows.filter((row) => row.fit && !row.pay).sort((a, b) => a.miss - b.miss);
  if (fits.length) return fits.slice(0, 2);
  const near = rows.filter((row) => !row.pay && row.miss <= 12).sort((a, b) => a.miss - b.miss);
  const paid = rows.filter((row) => row.pay && row.miss <= 8).sort((a, b) => a.miss - b.miss)[0];
  if (near.length) return paid ? [near[0], paid] : [near[0]];
  return paid ? [paid] : [];
}

function goldBuild(list, group) {
  const board = list.closest(".find-board"), wait = document.createElement("div"); wait.className = "bet-load"; wait.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.webp?v=1" alt=""></span><p></p>`; wait.querySelector("p").textContent = "Picking the legs."; if (board) { board.classList.add("find-wait"); board.append(wait); } const done = () => { if (wait.isConnected) wait.remove(); if (board && !board.querySelector(".bet-load")) board.classList.remove("find-wait"); };
  Promise.all(group.map((person) => { const chosen = [...parlayLeg.values()].filter((bet) => String(bet.label || "").startsWith(person.name)); if (chosen.length) return chosen; const bets = (person.bets || []).filter((bet) => Number(bet.odds)); return fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "mark", name: person.name, bets }) }).then((res) => res.json()).then((data) => { const picked = new Set((data.marks || []).map((mark) => mark.index)); const gold = bets.filter((bet, index) => picked.has(index)); return gold.length ? gold : bets.slice().sort((a, b) => findRank(a.odds) - findRank(b.odds)).slice(0, 12); }).catch(() => bets.slice().sort((a, b) => findRank(a.odds) - findRank(b.odds)).slice(0, 12)); })).then((books) => { done(); if (!list.isConnected) return; paintRosterParlay(list, rosterMix(books.map((bets) => ({ bets }))), group.length); }).catch(done);
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

function openRead(box, card) {
  let hold = box.querySelector(".find-research"); const go = box.querySelector(".find-more");
  if (hold) { hold.hidden = !hold.hidden; if (go) go.textContent = hold.hidden ? "See the read" : "Hide the read"; return; }
  hold = document.createElement("div"); hold.className = "find-research"; box.append(hold); if (go) go.textContent = "Hide the read";
  card.legs.forEach((leg) => { const raw = String(leg.label || "").split(/\s+—\s+/)[0].trim(); const who = leg.player || raw.split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim(); const block = document.createElement("div"); block.className = "find-leg-read"; const when = leg.kickoff && window.when ? `${window.when(leg.kickoff)} ET` : ""; const title = document.createElement("p"); title.className = "rec-gist"; const prop = who && raw.toLowerCase().startsWith(who.toLowerCase()) ? raw.slice(who.length).trim() : raw; const spot = [leg.match, when].filter(Boolean).join(", "); title.innerHTML = `${who ? `<i class="who">${esc(who)}</i>` : ""}${prop ? ` <i class="prop">${esc(prop)}</i>` : ""}${spot ? `<em>${esc(spot)}</em>` : ""}`; if (leg.sport) { const badge = document.createElement("b"); badge.className = "leg-league"; badge.textContent = leg.sport; block.append(badge); } block.append(title); hold.append(block); const bet = { label: raw, market: leg.market || "", odds: Number(leg.odds), sport: leg.sport || "" }; fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: who, text: raw, sport: leg.sport || "", bet }) }).then((res) => res.json()).then((data) => { if (!hold.isConnected || !data) return; if (data.why) { const why = document.createElement("p"); why.className = "find-why"; why.textContent = data.why; block.append(why); } if (data.spans) { const log = document.createElement("div"); log.className = "find-log"; data.spans.split(". ").forEach((bit) => { const cut = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const b = document.createElement("b"); b.textContent = cut[0]; item.append(b, document.createTextNode(cut.slice(1).join(", ") || "")); log.append(item); }); block.append(log); } if (data.lean) { const lean = document.createElement("p"); lean.className = "find-dive find-lean"; lean.textContent = data.lean; block.append(lean); } if (window.tuckHist) tuckHist(block); }).catch(() => {}); });
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
  if (!rows.length) { const note = document.createElement("p"); note.className = "quiet"; note.textContent = "Nothing posted for one of these players."; list.append(note); return; }
  if (cards.total > rows.length) { const more = document.createElement("p"); more.className = "quiet"; more.textContent = `Showing ${rows.length} of ${cards.total}. These are the shortest prices.`; list.append(more); }
  if (rows.every((card) => new Set(card.legs.map((leg) => leg.match || "")).size === 1)) { const note = document.createElement("p"); note.className = "quiet"; note.textContent = "These legs are in one game, so FanDuel's same-game button can charge a different number."; list.append(note); }
  const pending = [];
  rows.forEach((card) => {
    const box = document.createElement("div");
    box.className = "rec-bet open";
    const price = Number(card.american);
    const tag = Number.isFinite(price) ? (price > 0 ? `+${price}` : String(price)) : "";
    const head = document.createElement("b");
    head.innerHTML = [tag && `<i class="px">${esc(tag)}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, tag && findCash(price) && `<i class="pay">${esc(`$5 profits ${findCash(price)}`)}</i>`, ((legs) => { const games = (legs || []).map((leg) => String(leg.match || leg.gameId || "")); return games.length > 1 && games.every(Boolean) && new Set(games).size === 1; })(card.legs) && `<i class="sg">Same game</i>`].filter(Boolean).join("");
    box.append(head); const ticket = { title: `${count}-leg parlay`, american: card.american, impliedPct: findPct(price), legs: card.legs }; const share = document.createElement("button"); share.type = "button"; share.className = "share-bet"; share.dataset.share = "rec"; share.dataset.shareId = String((window.recTickets = window.recTickets || []).push({ ticket, name: ticket.title }) - 1); share.setAttribute("aria-label", "Share this bet"); const more = document.createElement("button"); more.type = "button"; more.className = "find-more"; more.textContent = "See the read"; more.addEventListener("click", () => openRead(box, card)); box.append(share, more);
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

function pgaKind(bet) {
  const market = String(bet.market || "").toLowerCase();
  if (market === "win only" || market.includes("tournament")) return "To win the tournament";
  if (market === "top 5" || market === "top 10" || market === "top 20") return market.replace("t", "T");
  if (market.startsWith("3 ball")) return "3-ball";
  if (market.includes("match")) return "Matchup";
  return bet.market || "Bet";
}

function paintField(holder, game, people, list, hits) {
  const match = document.createElement("div");
  match.className = "find-match find-pga";
  const when = document.createElement("p");
  when.className = "find-when";
  when.textContent = [game.match, game.kickoff && window.when ? `${window.when(game.kickoff)} ET` : ""].filter(Boolean).join(", ");
  const note = document.createElement("p");
  note.className = "quiet";
  note.textContent = "Shortest price first. That is who the book likes for that bet.";
  match.append(when, note);
  if (typeof pgaScript === "function") pgaScript(match, game, people);
  const rows = [];
  people.forEach((person) => { if (person.kind !== "player") return; (person.bets || []).forEach((bet) => { if (bet.match === game.match && bet.kickoff === game.kickoff) rows.push({ person, bet }); }); });
  const groups = new Map();
  rows.forEach((row) => { const name = pgaKind(row.bet); groups.set(name, (groups.get(name) || []).concat(row)); });
  const order = ["To win the tournament", "Top 5", "Top 10", "Top 20", "Matchup", "3-ball"];
  if (!rows.length) { const none = document.createElement("p"); none.className = "quiet"; none.textContent = "No player bets are posted for this tournament yet."; match.append(none); }
  [...groups.keys()].sort((a, b) => ((order.indexOf(a) + 1) || 9) - ((order.indexOf(b) + 1) || 9)).forEach((name) => {
    const group = document.createElement("details");
    group.className = "find-pga-group";
    const head = document.createElement("summary");
    const picks = groups.get(name);
    head.className = "find-pga-head";
    head.textContent = `${name}, ${picks.length}`;
    group.append(head);
    picks.sort((a, b) => findRank(a.bet.odds) - findRank(b.bet.odds)).forEach(({ person, bet }) => {
      const price = Number(bet.odds), shown = price > 0 ? `+${price}` : String(price);
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "find-side-go";
      pick.textContent = `${person.name}, ${shown}`;
      pick.addEventListener("click", () => showFind(list, hits, person, null, people));
      group.append(pick);
    });
    match.append(group);
  });
  holder.append(match);
}

function paintMatch(holder, game, people, list, hits, noted) {
  if (game.sport === "PGA") { paintField(holder, game, people, list, hits); return; }
  const match = document.createElement("div"); match.className = "find-match"; const body = document.createElement("div"); body.className = "find-body"; body.hidden = true;
  (game.match.includes(" @ ") ? game.match.split(" @ ") : game.match.split(" v ").reverse()).map((side) => side.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase()).forEach((side) => {
    const person = people.find((item) => item.name.toLowerCase() === side) || people.find((item) => side.includes(item.name.toLowerCase()) && item.name.length > 3);
    if (!person) return;
    const bets = (person.bets || []).filter((bet) => bet.match === game.match && bet.kickoff === game.kickoff).sort((a, b) => findRank(b.odds) - findRank(a.odds));
    const pick = document.createElement("button"); pick.type = "button"; pick.className = "find-side-go"; pick.textContent = `${person.name}, ${bets.length} ${bets.length === 1 ? "bet" : "bets"}`; const panel = document.createElement("div"); panel.className = "find-side"; panel.hidden = true; const tabs = document.createElement("div"); tabs.className = "find-tabs"; const teamGo = document.createElement("button"); teamGo.type = "button"; teamGo.className = "find-tab"; teamGo.textContent = `Team bets, ${bets.length}`; const playerGo = document.createElement("button"); playerGo.type = "button"; playerGo.className = "find-tab"; playerGo.textContent = "Player bets"; const teamPane = document.createElement("div"); teamPane.className = "find-pane"; teamPane.hidden = true; const playerPane = document.createElement("div"); playerPane.className = "find-pane"; playerPane.hidden = true; const players = document.createElement("details"); players.className = "find-roster"; players.open = true; playerPane.append(players); fillRoster(players, person, list, hits, people); const swap = (pane, go) => { const show = pane.hidden; panel.querySelectorAll(".find-pane").forEach((node) => { node.hidden = true; }); panel.querySelectorAll(".find-tab").forEach((node) => node.classList.remove("on")); pane.hidden = !show; if (show) go.classList.add("on"); }; teamGo.addEventListener("click", () => swap(teamPane, teamGo)); playerGo.addEventListener("click", () => { swap(playerPane, playerGo); if (!playerPane.hidden) players.open = true; }); tabs.append(teamGo, playerGo); panel.append(tabs, teamPane, playerPane);
    const grouped = new Map(); bets.forEach((bet) => { const name = bet.market || "Bets"; const rows = grouped.get(name) || []; rows.push(bet); grouped.set(name, rows); }); grouped.forEach((rows, name) => { const head = document.createElement("p"); head.className = "find-market"; head.textContent = `${name}, ${rows.length} ${rows.length === 1 ? "bet" : "bets"}`; teamPane.append(head); rows.forEach((bet) => { const price = Number(bet.odds); const shown = price > 0 ? `+${price}` : String(price); const row = document.createElement("div"); row.className = "rec-bet open"; row.dataset.odds = String(price || ""); row.dataset.kind = /spread/i.test(name) ? "Spread" : /total/i.test(name) ? "Total" : /moneyline|winner/i.test(name) ? "Moneyline" : /kick/i.test(name) ? "Kicking" : (typeof propKind === "function" ? propKind(`${bet.label} ${name}`) : "Other"); const title = document.createElement("b"); title.textContent = [shown, findPct(price), `$5 profits ${findCash(price)}`].filter(Boolean).join(" · "); const line = document.createElement("p"); line.className = "rec-gist"; line.textContent = bet.label; row.append(title, line); teamPane.append(row); }); }); if (typeof siftKinds === "function") siftKinds(teamPane);
    if (match.querySelector(".find-side-go")) { const at = document.createElement("b"); at.className = "find-at"; at.textContent = "@"; match.append(at); }
    match.append(pick); body.append(panel); pick.addEventListener("click", () => { const show = panel.hidden; match.querySelectorAll(".find-side").forEach((node) => { node.hidden = true; }); match.querySelectorAll(".find-side-go").forEach((node) => node.classList.remove("on")); panel.hidden = !show; body.hidden = !show; if (show) { pick.classList.add("on"); if (playerPane.hidden && teamPane.hidden) swap(playerPane, playerGo); players.open = true; } });
  });
  const stamp = document.createElement("p"); stamp.className = "find-when"; stamp.textContent = game.kickoff && window.when ? `${window.when(game.kickoff)} ET` : ""; if (stamp.textContent) match.append(stamp); if (typeof gameGuide === "function") gameGuide(match, people, list, hits, noted); match.append(body); holder.append(match); if (typeof paintTotal === "function") paintTotal(holder, game, people); if (typeof paintScores === "function") paintScores(holder, game, people, list, hits); if (typeof paintGameStacks === "function") paintGameStacks(holder, game, noted === "shut" ? holder.dataset.who : ""); if (typeof paintGameFour === "function") paintGameFour(holder, game); if (noted) loadGame(holder, game, false); if (noted === true && typeof clubGame === "function") clubGame(holder, game);
}

function loadGame(holder, game, open) {
  const box = document.createElement("details"); box.className = "find-brief find-team-bets"; box.open = !!open; const sum = document.createElement("summary"); sum.innerHTML = `<b class="find-script-head">Game details</b>`; const wait = document.createElement("p"); wait.className = "quiet"; wait.textContent = "Looking up the game."; box.append(sum, wait); const stacks = [...holder.querySelectorAll(".find-match")].pop()?.querySelector(":scope > .find-stacks"); if (stacks) { box.style.gridColumn = "1 / -1"; stacks.before(box); } else holder.append(box);
  const paint = (data) => { if (!box.isConnected || !data) return false; const sections = data.sections || []; if (!data.lead && !sections.length) return false; box.replaceChildren(sum); if (data.lead) { const lead = document.createElement("p"); lead.className = "find-dive"; lead.textContent = data.lead; box.append(lead); } sections.forEach((section) => { const block = document.createElement("div"); block.className = "find-note"; const name = document.createElement("b"); name.textContent = section.name; block.append(name); if (section.script) (section.lines || []).forEach((text) => { const row = document.createElement("p"); row.className = "find-why"; row.textContent = text; block.append(row); }); const cols = section.cols || []; if (cols.length) { const grid = document.createElement("div"); grid.className = "find-cols"; cols.forEach((col) => { const cell = document.createElement("div"); if (col.title) { const title = document.createElement("strong"); title.textContent = col.title; cell.append(title); } (col.lines || []).forEach((text) => { if (/( min\.| of the plays)/.test(text) && /^(Last |This season|Career)/.test(text)) { const log = document.createElement("div"); log.className = "out-min"; text.replace(/\.$/, "").split(". ").forEach((bit) => { const cut = bit.split(", "); const item = document.createElement("span"); const name = document.createElement("b"); name.textContent = cut[0]; item.append(name, document.createTextNode(cut.slice(1).join(", ") || "")); log.append(item); }); cell.append(log); return; } const row = document.createElement("span"); row.textContent = text; cell.append(row); }); grid.append(cell); }); block.append(grid); } (section.script ? [] : (section.lines || [])).forEach((text) => { const row = document.createElement("p"); row.textContent = text; block.append(row); }); if (section.text && !cols.length && !(section.lines || []).length) { const row = document.createElement("p"); row.textContent = section.text; block.append(row); } box.append(block); }); return true; };
  if (window.noteGame) window.noteGame(game).then((data) => { if (!box.dataset.server) paint(data); }).catch(() => { if (!box.dataset.server && !box.querySelector("b") && wait.isConnected) wait.textContent = "The game notes did not load."; });
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "game", match: game.match, sport: game.sport, kickoff: game.kickoff, espnId: game.espnId || "" }) }).then((res) => res.json()).then((data) => { if (paint(data)) box.dataset.server = "1"; else if (!box.querySelector("b") && wait.isConnected) wait.textContent = "The game notes did not load."; }).catch(() => { if (!box.querySelector("b") && wait.isConnected) wait.textContent = "The game notes did not load."; });
}

function showFind(list, hits, person, roster, people, keep, kind, tip) {
  if (person.kind !== "player" || (person.bets || []).some((bet) => bet.sport === "PGA")) closePlayerPop();
  const games = list.parentElement && list.parentElement.querySelector(".find-games");
  if (games) games.open = false;
  hits.replaceChildren(); if (typeof clubTheme === "function") clubTheme(list, person);
  if (roster && !keep) fillRoster(roster, person, list, hits, people);
  const bets = (person.bets || []).slice().sort((a, b) => findRank(b.odds) - findRank(a.odds));
  const golf = bets.some((bet) => bet.sport === "PGA");
  const holder = list.parentElement && list.parentElement.querySelector(".find-teams"); if (holder) { holder.replaceChildren(); holder.dataset.who = person.kind === "player" ? person.name : ""; const span = list.parentElement.querySelector(".find-span"); if (span) { span.classList.add("find-picked"); const go = span.querySelector(".find-games-go"); if (go) go.hidden = false; span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); } const seen = new Set(); bets.forEach((bet) => { const key = `${bet.match}|${bet.kickoff}`; if (!bet.match || seen.has(key)) return; seen.add(key); paintMatch(holder, bet, people, list, hits, "shut"); }); }
  const board = list && list.closest(".find-board"); if (board) board.classList.remove("find-td-on");
  list.replaceChildren(); list.classList.remove("find-only-on", "find-td-board");
  if (person.kind === "player" && !golf) {
    openPlayerPop(person, list, bets, profileTdBet(person, kind, tip));
    return;
  }
  // Team / game search: THE GAME above already has team bets and player bets.
  if (person.kind !== "player") {
    if (!bets.length) {
      const note = document.createElement("p");
      note.textContent = "Nothing posted for that name.";
      list.append(note);
    }
    return;
  }
  const heading = document.createElement("h3");
  heading.innerHTML = `${esc(person.name)}${person.pos || person.team ? `, ${esc([person.pos, person.team].filter(Boolean).join(", "))}` : ""} <span class="rec-count">${!bets.length ? "No bets posted" : `${bets.length} available bet${bets.length === 1 ? "" : "s"}`}</span>`;
  list.append(heading);
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
    head.innerHTML = [shown && `<i class="px">${esc(shown)}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, findCash(price) && `<i class="pay">${esc(`$5 profits ${findCash(price)}`)}</i>`].filter(Boolean).join("") + (bet.sport ? `<b class="leg-league">${esc(bet.sport)}</b>` : "");
    const line = document.createElement("p");
    line.className = "rec-gist";
    const when = bet.kickoff && typeof window.when === "function" ? `${window.when(bet.kickoff)} ET` : "";
    const raw = String(bet.label || "").trim(), rest = raw.replace(person.name, "").trim(), market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").trim(), unit = market.replace(/^(alt|alternate)\s+/i, ""), named = !rest || /^(over|under)$/i.test(rest), hasUnit = /pts|points|rebounds?|\brebs?\b|assists?|\basts?\b|threes?|yards?|goals?|shots?|steals?|blocks?/i.test(rest), said = bet.sport === "PGA" ? raw : !hasUnit && unit ? [person.name || raw, rest, unit].filter(Boolean).join(" ") : (named ? [person.name || raw, [rest, market].filter(Boolean).join(" ")].filter(Boolean).join(" ") : raw);
    const prop = person.name && said.toLowerCase().startsWith(person.name.toLowerCase()) ? said.slice(person.name.length).trim() : said; const spot = [bet.match, when].filter(Boolean).join(", ");
    line.innerHTML = `${person.name ? `<i class="who">${esc(person.name)}</i>` : ""}${prop ? ` <i class="prop">${esc(prop)}</i>` : ""}${spot ? `<em>${esc(spot)}</em>` : ""}`;
    const leg = document.createElement("button"); leg.type = "button"; leg.className = "find-leg"; leg.dataset.key = parlayKey(bet); leg.textContent = parlayLeg.has(leg.dataset.key) ? "In the parlay" : "Add this leg"; if (parlayLeg.has(leg.dataset.key)) leg.classList.add("on"); leg.addEventListener("click", () => { if (parlayLeg.has(leg.dataset.key) || parlayLeg.size >= 8) return; parlayLeg.set(leg.dataset.key, bet); if (person.kind === "player" && !parlayPick.has(person.key) && parlayPick.size < 8) parlayPick.set(person.key, person); paintParlay(); }); const share = document.createElement("button"); share.type = "button"; share.className = "share-bet"; share.dataset.share = "rec"; const ticket = { title: said, american: price, impliedPct: findPct(price), game: bet.match || "", kickoff: bet.kickoff || "", legs: [{ label: said, odds: price, market: bet.market || "", kickoff: bet.kickoff || "" }] }; share.dataset.shareId = String((window.recTickets = window.recTickets || []).push({ ticket, name: said }) - 1); share.setAttribute("aria-label", "Share this bet"); row.append(head, line, leg, share);
    row.dataset.kind = typeof propKind === "function" ? ((full, seen) => full === "PRA" && seen !== "PRA" ? seen : full)(propKind(`${said} ${market}`), propKind(said)) : ""; row.dataset.odds = String(bet.odds || ""); row.dataset.market = market; list.append(row);
  });
  if (typeof siftKinds === "function" && !golf) siftKinds(list, kind); if (person.kind === "player" && !golf) markFind(list, person.name, bets);
}

function markFind(list, name, bets) {
  const stamp = (markFind.stamp = (markFind.stamp || 0) + 1), wait = document.createElement("div"), board = list.closest(".find-board"); wait.className = "find-looking"; wait.innerHTML = `<img src="/scene/parrot-head.webp?v=1" alt=""><p></p>`; wait.querySelector("p").textContent = `Looking up ${name}.`; const top = list.querySelector("h3"); if (top) top.after(wait); else list.prepend(wait);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "mark", name, bets }) }).then((res) => res.json()).then((data) => {
    if (wait.isConnected) wait.remove(); if (board && !board.querySelector(".bet-load")) board.classList.remove("find-wait"); if (stamp !== markFind.stamp || !list.isConnected || !data.known) return;
    const marks = Array.isArray(data.marks) ? data.marks : [];
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = marks.length === 1 ? `On 1 of these, ${name} has done it more often than the price says.` : marks.length ? `On ${marks.length} of these, ${name} has done it more often than the price says.` : `None of these show ${name} doing it more often than the price says.`;
    const heading = list.querySelector("h3");
    if (heading) heading.after(note);
    if (!marks.length) { [...list.querySelectorAll(".rec-bet")].forEach((row) => { if (typeof askRead === "function") askRead(row, name); }); return; } const shared = [...new Set(marks.flatMap((mark) => mark.notes || []))].filter((line) => marks.filter((mark) => (mark.notes || []).includes(line)).length * 2 >= marks.length);
    const byIndex = new Map(marks.map((mark) => [Number(mark.index), mark]));
    const marked = [];
    const rest = [];
    [...list.querySelectorAll(".rec-bet")].forEach((row) => {
      const mark = byIndex.get(Number(row.dataset.i));
      if (!mark) { if (typeof askRead === "function") askRead(row, name); rest.push(row); return; }
      const why = document.createElement("p");
      why.className = "find-why";
      why.textContent = mark.why;
      row.append(why); if (mark.spans) { const log = document.createElement("div"); log.className = "find-log"; mark.spans.split(". ").forEach((bit) => { const [label, value] = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const name = document.createElement("b"); name.textContent = label; item.append(name, document.createTextNode(value || "")); log.append(item); }); row.append(log); if (mark.lean) { const lean = document.createElement("p"); const show = /^(Targets|Carries|Passes) /.test(mark.lean); lean.className = show ? "find-why" : "find-dive find-lean"; lean.textContent = mark.lean; if (show) why.after(lean); else row.append(lean); } } const own = (mark.notes || []).filter((line) => !shared.includes(line)); if (own.length) { const dive = document.createElement("p"); dive.className = "find-dive"; dive.textContent = own.join(" · "); row.append(dive); }
      if (window.tuckHist) tuckHist(row); row.dataset.gap = String(mark.gap);
      row.classList.add("find-mark");
      marked.push(row);
    });
    marked.sort((a, b) => Number(b.dataset.gap) - Number(a.dataset.gap));
    const button = document.createElement("button");
    button.type = "button"; button.className = "find-show";
    const filtering = typeof kindOn === "function" && kindOn(list); if (!filtering) list.classList.add("find-only-on"); button.textContent = "Show all";
    button.addEventListener("click", () => { const all = button.textContent === "Show all"; if (all) { list.classList.remove("find-only-on"); list.querySelectorAll(".find-kinds .find-names button.on").forEach((chip) => chip.click()); const wipe = list.querySelector(".find-kinds .find-clear"); if (wipe) wipe.click(); } else list.classList.add("find-only-on"); button.textContent = all ? `Show the ${marked.length}` : "Show all"; });
    if (heading) heading.append(button); if (shared.length) { const once = document.createElement("p"); once.className = "find-dive"; once.textContent = shared.join(" · "); note.after(once); }
    marked.concat(rest).forEach((row) => list.append(row)); if (window.sortFind) sortFind(list);
  }).catch(() => { if (wait.isConnected) wait.remove(); if (board && !board.querySelector(".bet-load")) board.classList.remove("find-wait"); });
}

window.paintFind = paintFind;
