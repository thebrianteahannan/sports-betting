/** Search the board by player or team. Longest price first. */

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

function paintFind() {
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; if (window.birdGreet) birdGreet(); return; }
  desk.classList.remove("bird-on", "solo", "dug");
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  document.querySelectorAll(".rec-board").forEach((node) => node.remove());
  const board = document.createElement("div");
  board.className = "rec-board find-board";
  board.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>Looking up the board.</p></div>`;
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  row.append(board);
  row.scrollTop = 0;
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "lookup" }) })
    .then((res) => res.json())
    .then((data) => fillFind(board, data))
    .catch(() => fillFind(board, {}));
}

function fillFind(board, data) {
  const load = board.querySelector(".bet-load");
  if (load) load.remove();
  const heading = document.createElement("h2");
  heading.textContent = "Search by player or team.";
  const people = Array.isArray(data.people) ? data.people : [];
  const limit = document.createElement("p");
  limit.className = "quiet";
  limit.textContent = "Player props are not always posted yet.";
  const label = document.createElement("label");
  label.className = "find";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Type a player or team";
  input.autocomplete = "off";
  label.append(input);
  const hits = document.createElement("div");
  hits.className = "find-hits";
  const roster = document.createElement("details");
  roster.className = "find-roster";
  roster.hidden = true;
  const list = document.createElement("div");
  list.className = "find-list";
  board.append(heading, limit, label, hits, roster, list);
  let clubStamp = 0;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const stamp = ++clubStamp;
    hits.replaceChildren();
    if (q.length < 2) { if (!list.querySelector(".rec-bet")) list.replaceChildren(); return; }
    people.filter((person) => person.name.toLowerCase().includes(q)).slice(0, 8).forEach((person) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = person.name;
      button.addEventListener("click", () => showFind(list, hits, person, roster, people));
      hits.append(button);
    });
    if (hits.children.length || q.split(" ").length < 2) return;
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
  const stamp = (fillRoster.stamp = (fillRoster.stamp || 0) + 1);
  roster.hidden = true;
  roster.open = false;
  roster.replaceChildren();
  const sport = (team.bets && team.bets[0] && team.bets[0].sport) || "";
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: team.name, sport }) }).then((res) => res.json()).then((data) => {
    if (stamp !== fillRoster.stamp || !roster.isConnected) return;
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
      button.addEventListener("click", () => showFind(list, hits, hit, roster, people, true));
      names.append(button);
    });
    quiet.forEach((name) => { const span = document.createElement("span"); span.textContent = name; names.append(span); });
  }).catch(() => {});
}

function showFind(list, hits, person, roster, people, keep) {
  hits.replaceChildren();
  if (roster && !keep) fillRoster(roster, person, list, hits, people);
  const bets = (person.bets || []).slice().sort((a, b) => findRank(b.odds) - findRank(a.odds));
  list.replaceChildren();
  const heading = document.createElement("h3");
  heading.innerHTML = `${esc(person.name)} <span class="rec-count">${bets.length}</span>`;
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
    head.textContent = [shown, findPct(price), `$5 profits ${findCash(price)}`].filter(Boolean).join(" · ");
    const line = document.createElement("p");
    line.className = "rec-gist";
    const when = bet.kickoff && typeof window.when === "function" ? `${window.when(bet.kickoff)} ET` : "";
    line.textContent = [bet.label, [bet.sport, bet.match, when].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
    row.append(head, line);
    list.append(row);
  });
  if (person.kind === "player") markFind(list, person.name, bets);
}

function markFind(list, name, bets) {
  const stamp = (markFind.stamp = (markFind.stamp || 0) + 1);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "mark", name, bets }) }).then((res) => res.json()).then((data) => {
    if (stamp !== markFind.stamp || !list.isConnected || !data.known) return;
    const marks = Array.isArray(data.marks) ? data.marks : [];
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = marks.length === 1 ? "1 of these is far enough off the count." : marks.length ? `${marks.length} of these are far enough off the count.` : "None of these are far enough off the count.";
    const heading = list.querySelector("h3");
    if (heading) heading.after(note);
    if (!marks.length) return;
    const byIndex = new Map(marks.map((mark) => [Number(mark.index), mark]));
    const marked = [];
    const rest = [];
    [...list.querySelectorAll(".rec-bet")].forEach((row) => {
      const mark = byIndex.get(Number(row.dataset.i));
      if (!mark) { rest.push(row); return; }
      const why = document.createElement("p");
      why.className = "find-why";
      why.textContent = mark.why;
      row.append(why);
      row.dataset.gap = String(mark.gap);
      row.classList.add("find-mark");
      marked.push(row);
    });
    marked.sort((a, b) => Number(b.dataset.gap) - Number(a.dataset.gap));
    const hits = document.createElement("div");
    hits.className = "find-hits";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Show those";
    button.addEventListener("click", () => { const on = list.classList.toggle("find-only-on"); button.textContent = on ? "Show all" : "Show those"; });
    hits.append(button);
    note.after(hits);
    marked.concat(rest).forEach((row) => list.append(row));
  }).catch(() => {});
}

window.paintFind = paintFind;
