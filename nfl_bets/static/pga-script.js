/** Tournament script on the PGA card. The scoreboard says who the round points to. The price says who the book still likes. */

function pgaPlain(name) {
  return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function pgaUnder(n) {
  if (n < 0) return `${Math.abs(n)} under`;
  if (n > 0) return `${n} over`;
  return "even";
}

function pgaLast(name) {
  const words = String(name || "").split(/\s+/).filter((word) => !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(word));
  return words.pop() || name;
}

function pgaJoin(names) {
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function pgaState(detail) {
  const text = String(detail || "").trim();
  const round = (text.match(/round\s+\d+/i) || [""])[0].replace(/^round/i, "Round");
  if (/suspended/i.test(text)) return `${round || "Play"} is suspended. The next round has not started.`;
  if (/final/i.test(text)) return "The tournament is over.";
  if (round && /complete/i.test(text)) return `${round} is complete.`;
  return text ? (text.endsWith(".") ? text : `${text}.`) : "";
}

function pgaBook(people, game) {
  const book = new Map();
  (people || []).forEach((person) => {
    if (!person || person.kind !== "player") return;
    const bets = (person.bets || []).filter((bet) => bet.match === game.match && bet.kickoff === game.kickoff);
    if (bets.length) book.set(pgaPlain(person.name), { person, bets });
  });
  return book;
}

function pgaWin(row) {
  return (row.bets || []).find((bet) => /win only/i.test(bet.market) || /to win the tournament/i.test(bet.label));
}

function pgaBall(row) {
  return (row.bets || []).find((bet) => /^3 ball/i.test(bet.market) || /3-ball/i.test(bet.label));
}

function pgaField(players, book) {
  return (players || []).map((row) => ({ ...row, ...(book.get(pgaPlain(row.name)) || {}) })).filter((row) => row.score != null);
}

function pgaSay(row) {
  return (row.person && row.person.name) || row.name;
}

function pgaGroup(row, field) {
  const bet = pgaBall(row);
  const cut = bet && String(bet.market || "").split(" - ").pop();
  if (!cut) return [];
  return cut.split("/").map((bit) => bit.trim()).filter(Boolean).map((bit) => {
    const hit = field.find((one) => pgaPlain(pgaSay(one)).includes(pgaPlain(bit)));
    return hit ? pgaLast(pgaSay(hit)) : bit;
  });
}

function pgaMoney(odds) {
  const n = Number(odds);
  return n > 0 ? `+${n}` : String(n);
}

function pgaWorth(odds) {
  const cash = typeof findCash === "function" ? findCash(odds) : "";
  const need = typeof findPct === "function" ? findPct(odds) : "";
  return [cash && `$5 wins ${cash}`, need && `It has to happen ${need} of the time`].filter(Boolean).join(". ");
}

function pgaReads(field) {
  const priced = field.filter((row) => row.person);
  if (!priced.length) return { lines: [], picks: [] };
  const lead = Math.min(...priced.map((row) => row.score));
  const leader = priced.filter((row) => row.score === lead).sort((a, b) => (a.rounds.at(-1) ?? 0) - (b.rounds.at(-1) ?? 0))[0];
  const back = priced.filter((row) => row.score === lead + 1).sort((a, b) => a.score - b.score || pgaPlain(pgaSay(a)).localeCompare(pgaPlain(pgaSay(b))));
  const lines = [];
  const state = pgaState(field.state);
  if (state) lines.push(state);
  const rounds = (leader.rounds || []).map(pgaUnder);
  lines.push(`${pgaSay(leader)} leads at ${pgaUnder(leader.score)}.${rounds.length ? ` His rounds are ${pgaJoin(rounds)}.` : ""}`);
  if (back.length) lines.push(`${pgaJoin(back.map(pgaSay))} ${back.length > 1 ? "are" : "is"} one back.`);
  const group = pgaGroup(leader, priced);
  if (group.length > 1) lines.push(`${pgaJoin(group)} go out together.`);
  const mover = back.filter(pgaWin).sort((a, b) => (a.rounds.at(-1) ?? 0) - (b.rounds.at(-1) ?? 0))[0];
  const picks = [];
  const last = (row) => row.rounds.at(-1);
  if (mover && pgaWin(mover) && last(mover) < last(leader)) {
    const bet = pgaWin(mover);
    const leadBet = pgaWin(leader);
    picks.push({ person: mover.person, bet, why: `One shot back, at ${pgaUnder(mover.score)}. His last round was ${pgaUnder(last(mover))}. ${pgaLast(pgaSay(leader))} leads, and his last round was ${pgaUnder(last(leader))}. ${pgaWorth(bet.odds)}.${leadBet ? ` ${pgaLast(pgaSay(leader))} is still ${pgaMoney(leadBet.odds)}.` : ""}` });
    const ball = pgaBall(mover);
    const withThem = pgaGroup(leader, priced).filter((name) => name !== pgaLast(pgaSay(mover)));
    const same = ball && withThem.length && pgaPlain(ball.market).includes(pgaPlain(pgaLast(pgaSay(leader))));
    if (same) {
      const book = priced.filter((row) => pgaBall(row) && pgaBall(row).market === ball.market).sort((a, b) => (typeof findRank === "function" ? findRank(pgaBall(a).odds) - findRank(pgaBall(b).odds) : 0))[0];
      const short = book && book !== mover && pgaBall(book) ? ` ${pgaLast(pgaSay(book))} is still the short price, at ${pgaMoney(pgaBall(book).odds)}.` : "";
      picks.push({ person: mover.person, bet: ball, why: `He goes out with ${pgaJoin(withThem)}. This is the low round, not the trophy. His last round was ${pgaUnder(last(mover))}. ${pgaLast(pgaSay(leader))}'s was ${pgaUnder(last(leader))}. ${pgaWorth(ball.odds)}.${short}` });
    }
  } else if (leader && pgaWin(leader)) {
    const bet = pgaWin(leader);
    picks.push({ person: leader.person, bet, why: `He leads at ${pgaUnder(leader.score)}. His last round was ${pgaUnder(last(leader))}. ${pgaWorth(bet.odds)}.` });
  }
  return { lines, picks };
}

function pgaScript(match, game, people) {
  if (!game || game.sport !== "PGA") return;
  const box = document.createElement("details");
  box.className = "find-script pga-script";
  box.open = true;
  box.innerHTML = `<summary><b class="find-script-head">Tournament script</b></summary><p class="quiet">Reading the tournament.</p>`;
  match.append(box);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "pga" }) }).then((res) => res.json()).then((data) => {
    if (!box.isConnected) return;
    const field = pgaField(data.players, pgaBook(people, game));
    field.state = data.detail;
    const read = pgaReads(field);
    box.replaceChildren();
    const sum = document.createElement("summary");
    sum.innerHTML = `<b class="find-script-head">Tournament script</b>`;
    box.append(sum);
    if (!read.lines.length) { const miss = document.createElement("p"); miss.className = "quiet"; miss.textContent = "The tournament board did not load."; box.append(miss); return; }
    const lead = document.createElement("p");
    lead.className = "find-why";
    lead.textContent = read.lines.join(" ");
    box.append(lead);
    const hold = document.createElement("div");
    hold.className = "find-script-bets";
    read.picks.forEach((pick) => {
      const row = document.createElement("div");
      row.className = "find-script-pick";
      const price = pgaMoney(pick.bet.odds);
      const title = document.createElement("p");
      title.innerHTML = `<strong>${esc(pick.bet.label)}, ${esc(price)}.</strong>`;
      const why = document.createElement("p");
      why.className = "find-script-why";
      why.innerHTML = `<em>Why:</em> ${esc(pick.why)}`;
      row.append(title, why);
      if (typeof scriptPickPlus === "function") scriptPickPlus(row, { who: pick.person.name, label: pick.bet.label, market: pick.bet.market, text: pick.bet.label }, game, people);
      hold.append(row);
    });
    if (hold.childElementCount) box.append(hold);
  }).catch(() => {
    const wait = box.querySelector(".quiet");
    if (wait) wait.textContent = "The tournament board did not load.";
  });
}
