/** Filters for a roster parlay list. Props, profit, and parlays close to a winning strategy. */
function winningKeys() {
  const archive = ((window.state && window.state.board && window.state.board.archive) || []);
  const keys = new Set();
  Object.keys(window.CARD_NAMES || {}).forEach((id) => {
    (id === "hits" ? ["five", "four"] : [""]).forEach((part) => {
      const rows = archive.filter((ticket) => ticket.card === id && (!part || (typeof hitsPart === "function" && hitsPart(ticket) === part)));
      const done = rows.filter((ticket) => ticket.result === "won" || ticket.result === "lost");
      if (done.length < 3) return;
      const hit = done.filter((ticket) => ticket.result === "won").length / done.length * 100;
      const needs = rows.map((ticket) => { const implied = Number(ticket.impliedPct); if (Number.isFinite(implied)) return implied; const price = Number(ticket.american); return price > 0 ? (100 / (price + 100)) * 100 : price < 0 ? (Math.abs(price) / (Math.abs(price) + 100)) * 100 : NaN; }).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      const need = needs.length ? needs[needs.length >> 1] : NaN;
      if (hit > need) keys.add(part ? `${id}|${part}` : id);
    });
  });
  return keys;
}
function siftParlays(list, pending, count) {
  const boxes = [...list.querySelectorAll(".rec-bet")];
  boxes.forEach((box, index) => { box.dataset.i = String(index); });
  const heading = list.querySelector("h3");
  if (!heading || !boxes.length) return;
  const props = document.createElement("details");
  props.className = "find-roster";
  const summary = document.createElement("summary");
  summary.textContent = "Props";
  props.append(summary);
  const book = new Map();
  boxes.forEach((box) => box.querySelectorAll(".rec-gist").forEach((line) => {
    const who = line.dataset.who;
    const key = line.dataset.key;
    if (!who || !key) return;
    if (!book.has(who)) book.set(who, new Map());
    if (!book.get(who).has(key)) book.get(who).set(key, line.dataset.said || line.textContent);
  }));
  book.forEach((legs, who) => {
    const name = document.createElement("p");
    name.className = "quiet";
    name.textContent = who;
    const names = document.createElement("div");
    names.className = "find-names";
    names.dataset.who = who;
    [...legs.entries()].sort((a, b) => findRank(Number(a[0].split("|").pop())) - findRank(Number(b[0].split("|").pop()))).forEach(([key, said]) => {
      const odds = Number(key.split("|").pop());
      const tag = Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : String(odds)) : "";
      const prop = said.toLowerCase().startsWith(who.toLowerCase()) ? said.slice(who.length).trim() : said;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.key = key;
      button.textContent = [tag, prop].filter(Boolean).join(" ");
      button.addEventListener("click", () => {
        const on = button.classList.toggle("on");
        button.setAttribute("aria-pressed", on ? "true" : "false");
        apply();
      });
      names.append(button);
    });
    props.append(name, names);
  });
  const money = document.createElement("label");
  money.className = "find";
  const profit = document.createElement("input");
  profit.type = "number";
  profit.min = "0";
  profit.step = "0.5";
  profit.placeholder = "any";
  profit.inputMode = "decimal";
  profit.addEventListener("input", () => apply());
  const word = document.createElement("span");
  word.textContent = "Profit $";
  money.append(word, profit);
  const row = document.createElement("div");
  row.className = "find-roster";
  const strategy = document.createElement("button");
  strategy.type = "button";
  strategy.textContent = "Close to a winner";
  strategy.addEventListener("click", () => {
    const on = strategy.classList.toggle("on");
    strategy.setAttribute("aria-pressed", on ? "true" : "false");
    apply();
  });
  row.append(strategy);
  const said = document.createElement("p");
  said.className = "find-why";
  said.hidden = true;
  const none = document.createElement("p");
  none.className = "quiet";
  none.hidden = true;
  none.textContent = "None of these fit.";
  heading.after(money, row, said, props, none);
  let at = 0;
  const winners = winningKeys();
  const apply = () => {
    const want = Number(profit.value);
    const nearOn = strategy.classList.contains("on");
    const chosen = new Map();
    props.querySelectorAll(".find-names").forEach((names) => {
      const on = [...names.querySelectorAll("button.on")].map((button) => button.dataset.key);
      if (on.length) chosen.set(names.dataset.who, new Set(on));
    });
    const scored = boxes.map((box) => {
      const propOk = [...box.querySelectorAll(".rec-gist")].every((line) => {
        const set = chosen.get(line.dataset.who);
        return !set || set.has(line.dataset.key);
      });
      const won = Number(box.dataset.won);
      const payOk = !(want > 0) || (Number.isFinite(won) && Math.abs(won - want) <= Math.max(1, want * 0.25));
      let rank = null;
      ((box._card && box._card.near) || []).forEach((item) => {
        const key = item.part ? `${item.id}|${item.part}` : item.id;
        if (!winners.has(key)) return;
        const score = (item.fit ? 0 : 50) + Number(item.miss || 0);
        if (rank == null || score < rank) rank = score;
      });
      return { box, propOk, payOk, rank };
    });
    let shown = 0;
    const keptWhy = new Set();
    scored.forEach((row) => {
      const keep = row.propOk && row.payOk && (!nearOn || row.rank != null);
      row.box._rank = row.rank;
      row.box.classList.toggle("find-off", !keep);
      if (!keep) return;
      shown += 1;
      if (nearOn && row.box._why) keptWhy.add(row.box._why);
    });
    const order = (box) => nearOn ? (box._rank == null ? 99 : box._rank) : (want > 0 ? Math.abs(Number(box.dataset.won) - want) : Number(box.dataset.i));
    boxes.filter((box) => !box.classList.contains("find-off")).sort((a, b) => order(a) - order(b) || Number(a.dataset.i) - Number(b.dataset.i)).forEach((box) => list.append(box));
    const n = boxes.length;
    heading.textContent = shown === n ? (n === 1 ? `1 ${count}-leg parlay` : `${n} ${count}-leg parlays`) : `${shown} of ${n} ${count}-leg parlays`;
    const picks = props.querySelectorAll("button.on").length;
    summary.textContent = picks ? `Props, ${picks} picked` : "Props";
    if (nearOn) { said.hidden = !keptWhy.size; said.textContent = [...keptWhy].join(" "); }
    none.textContent = nearOn ? "None of these are close to a winning strategy." : "None of these fit.";
    none.hidden = shown !== 0 || (nearOn && at < pending.length && !(want > 0) && !chosen.size);
  };
  apply();
  const stamp = markFind.stamp;
  const reasons = new Set();
  const step = () => {
    if (stamp !== markFind.stamp || !list.isConnected) return;
    const end = Math.min(at + 30, pending.length);
    for (; at < end; at += 1) {
      const near = rosterNear(pending[at][1]);
      pending[at][0]._card = pending[at][1];
      pending[at][0]._why = near;
      pending[at][0].classList.toggle("find-near", !!near);
      if (near) reasons.add(near);
    }
    if (!strategy.classList.contains("on")) { said.hidden = !reasons.size; said.textContent = [...reasons].join(" "); }
    if (strategy.classList.contains("on")) apply();
    if (at < pending.length) setTimeout(step, 30);
  };
  if (pending.length) setTimeout(step, 0);
}
const PROP_KINDS = [[/\b(?:pts?|points?).{0,16}(?:rebs?|rebounds?).{0,16}(?:asts?|assists?)\b/, "PRA"], [/\b(?:pts?|points?).{0,16}(?:rebs?|rebounds?)\b/, "Pts + Reb"], [/\b(?:pts?|points?).{0,16}(?:asts?|assists?)\b/, "Pts + Ast"], [/\b(?:rebs?|rebounds?).{0,16}(?:asts?|assists?)\b/, "Reb + Ast"], [/rush\w* \+ receiv|receiv\w* \+ rush|rush\w* and receiv|receiv\w* and rush/, "Rushing and receiving yards"], [/receiving touchdowns?|rec(?:eiving)? touchdowns?/, "Receiving touchdowns"], [/rushing touchdowns?|rush touchdowns?/, "Rushing touchdowns"], [/passing touchdowns?|pass touchdowns?/, "Passing touchdowns"], [/touchdowns?|anytime touchdown/, "Touchdowns"], [/receiving yards?|rec(?:eiving)? yards?/, "Receiving yards"], [/rushing yards?|rush yards?/, "Rushing yards"], [/passing yards?|pass yards?/, "Passing yards"], [/rushing attempts?|carries/, "Rushing attempts"], [/passing attempts?/, "Passing attempts"], [/completions?/, "Completions"], [/interceptions?/, "Interceptions"], [/receptions?/, "Receptions"], [/home runs?/, "Home runs"], [/stolen bases?/, "Stolen bases"], [/strikeouts?/, "Strikeouts"], [/\brbis?\b/, "RBIs"], [/\bruns?\b/, "Runs"], [/\bhits?\b/, "Hits"], [/made threes|threes?|3pt|three pointers?/, "Threes"], [/rebounds?/, "Rebounds"], [/assists?/, "Assists"], [/steals?/, "Steals"], [/blocks?/, "Blocks"], [/points?|\bpts?\b/, "Points"], [/shots on goal|shots?/, "Shots"], [/saves?/, "Saves"], [/goals?/, "Goals"], [/tackles?/, "Tackles"], [/sacks?/, "Sacks"]];
function propKind(text) {
  const low = String(text || "").toLowerCase().replace(/\byds\b/g, "yards").replace(/\btds\b/g, "touchdowns").replace(/\btd\b/g, "touchdown");
  const hit = PROP_KINDS.find(([re]) => re.test(low));
  return hit ? hit[1] : "Other";
}
function kindOn(list) { const on = list && list.querySelector(".find-kinds button.on"); return !!(on && on.dataset.kind); }
function paintScores(holder, game, people, list, hits) {
  const isTd = (bet) => { const text = `${bet.label || ""} ${bet.market || ""}`.toLowerCase(); return /anytime touchdown scorer|any time touchdown scorer/.test(text) && !/half|quarter|\b1st\b|first|last|either|\b[23]\+/.test(text); }, shot = (price) => price < 0 ? Math.abs(price) / (Math.abs(price) + 100) : 100 / (price + 100), best = new Map();
  (people || []).forEach((person) => { if (!person || person.kind !== "player") return; (person.bets || []).forEach((bet) => { if (bet.match !== game.match || bet.kickoff !== game.kickoff || !isTd(bet)) return; const price = Number(bet.odds); if (!price) return; const chance = shot(price); const had = best.get(person.name); if (!had || chance > had.chance) best.set(person.name, { person, chance, odds: price }); }); });
  const picked = [...best.values()].sort((a, b) => b.chance - a.chance);
  if (!picked.length) return;
  const box = document.createElement("details"); box.className = "find-score find-td"; const title = document.createElement("summary"); title.textContent = "Most likely to score a touchdown"; const note = document.createElement("p"); note.className = "find-td-note"; const paintNote = (team) => { const lines = new Map(); picked.forEach((row) => { const extra = teamTd(people, row.person.name, game.match, game.kickoff).replace(/^\n/, ""); if (!extra) return; const key = extra.replace(/, \d+% of those passes go to an RB$/, ""); if (!lines.has(key) || /go to an RB/.test(extra)) lines.set(key, extra); }); const text = [...lines.values()].filter((line) => { const nick = line.split(" ")[0]; return !team || String(team).endsWith(nick); }).join("\n"); if (note.textContent !== text) note.textContent = text; }; const names = document.createElement("div"); names.className = "find-hits"; paintNote(); loadZone(people, names); if (people && people.zoneJob) people.zoneJob.then(() => { if (note.isConnected) paintNote((((match && match.querySelector(".find-side-go.on")) || {}).textContent || "").split(",")[0].trim()); }); const link = document.createElement("button"); link.type = "button"; link.className = "find-all-td"; link.textContent = "See every NFL player most likely to score a touchdown"; const openPlayer = (person) => { const board = holder.closest(".find-board"); const roster = board && board.querySelector(":scope > .find-roster"); showFind(list, hits, person, roster, people || (board && board.people) || [], false, "Touchdowns"); };
  picked.forEach((row, index) => { const button = document.createElement("button"); button.type = "button"; button.dataset.who = row.person.name; button.textContent = `${row.person.name}, ${Number(row.odds) > 0 ? `+${row.odds}` : row.odds}, ${Math.round(row.chance * 100)}%${findCash(row.odds) ? `, $5 profits ${findCash(row.odds)}` : ""}`; if (index >= 5) button.hidden = true; button.addEventListener("click", () => openPlayer(row.person)); names.append(button); });
  link.addEventListener("click", () => { const team = (((match && match.querySelector(".find-side-go.on")) || {}).textContent || "").split(",")[0].trim(); openTdPage(list, people, hits, game, team); });
  if (String(game.sport || "").toUpperCase() === "NFL") names.append(link); box.append(title, note, names); const match = [...holder.querySelectorAll(".find-match")].pop(); if (match) box.style.gridColumn = "1 / -1"; (match || holder).append(box); const showChips = () => { const team = (((match && match.querySelector(".find-side-go.on")) || {}).textContent || "").split(",")[0].trim(); paintNote(team); const rows = [...names.querySelectorAll("button:not(.find-all-td)")]; const panel = match && [...match.querySelectorAll(".find-side")].find((node) => !node.hidden); const have = panel && [...panel.querySelectorAll(".find-roster .find-names button, .find-roster .find-names span")].map((node) => (typeof plainName === "function" ? plainName(node.textContent.replace(/, out$/, "")) : "")); const mine = rows.filter((button) => { const who = typeof plainName === "function" ? plainName(button.dataset.who) : button.dataset.who; return !team || !have || !have.length || have.some((name) => name === who || name.startsWith(`${who} `) || who.startsWith(`${name} `)); }); rows.forEach((button) => { button.hidden = true; }); mine.slice(0, 5).forEach((button) => { button.hidden = false; }); }; if (match) { match.addEventListener("click", (event) => { if (event.target.closest(".find-side-go")) showChips(); }); new MutationObserver(() => { if (match.querySelector(".find-side-go.on")) showChips(); }).observe(match, { childList: true, subtree: true }); }
}
function openTdPage(list, people, hits, game, team) {
  const board = list && list.closest(".find-board"); if (!board) return; const span = board.querySelector(".find-span"); if (span) { span.classList.add("find-picked"); const go = span.querySelector(".find-games-go"); if (go) go.hidden = false; span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); } const holder = board.querySelector(".find-teams"); if (holder) holder.replaceChildren(); if (hits) hits.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on"); const slateOn = !game && board.querySelector(".find-games.find-on"), slateKeys = slateOn && typeof loadedGames === "function" ? new Set(loadedGames(people, slateOn.dataset.span || "today").map((row) => `${row.match}|${row.kickoff}`)) : null;
  const skip = /half|quarter|\b1st\b|first|last|either|\b[23]\+|each quarter|each half/, shot = (price) => price < 0 ? Math.abs(price) / (Math.abs(price) + 100) : 100 / (price + 100), kindOf = (bet) => { const text = `${bet.label || ""} ${bet.market || ""}`.toLowerCase().replace(/\btds\b/g, "touchdowns").replace(/\btd\b/g, "touchdown"); const market = String(bet.market || "").toLowerCase(); if (market === "to score 2+ touchdowns") return "2 Anytime TDs"; if (market === "to score 3+ touchdowns") return "3 Anytime TDs"; if (skip.test(text)) return ""; if (/anytime touchdown scorer|any time touchdown scorer/.test(text)) return "Anytime TD"; const one = /1\+/.test(text) || /over 0\.5/.test(text); if (one && /passing touchdowns?/.test(text)) return "Throwing"; return ""; }, books = new Map();
  (people || []).forEach((person) => { if (!person || person.kind !== "player") return; (person.bets || []).forEach((bet) => { if (String(bet.sport || "").toUpperCase() !== "NFL" || (slateKeys && !slateKeys.has(`${bet.match}|${bet.kickoff}`))) return; const kind = kindOf(bet), price = Number(bet.odds); if (!kind || !price) return; const chance = shot(price), here = !!(game && bet.match === game.match && bet.kickoff === game.kickoff), book = books.get(kind) || new Map(); books.set(kind, book); const had = book.get(person.name); if (here) { if (!had || !had.here || chance > had.chance) book.set(person.name, { person, chance, odds: price, match: bet.match, kickoff: bet.kickoff, here: true }); } else if (!had) book.set(person.name, { person, chance, odds: price, match: bet.match, kickoff: bet.kickoff, here: false }); else if (!had.here && chance > had.chance) { had.chance = chance; had.odds = price; had.match = bet.match; had.kickoff = bet.kickoff; } }); });
  const head = document.createElement("h3"); const picks = document.createElement("div"); picks.className = "find-hits find-td-picks"; const allBox = document.createElement("div"); allBox.className = "find-td-all find-td-page"; let clubs = new Map(); const tagTeams = () => { if (!clubs.size) return; allBox.querySelectorAll("button").forEach((button) => { const who = typeof plainName === "function" ? plainName(button.dataset.who) : ""; const club = clubs.get(who) || ([...clubs].find(([name]) => name.startsWith(`${who} `) || who.startsWith(`${name} `)) || [])[1]; const mine = club ? (!team || (typeof plainName === "function" && plainName(team) === plainName(club))) : (!team && button.dataset.here === "1"); if (club) { const price = Number(button.dataset.odds); const cash = findCash(price); button.textContent = `${button.dataset.who}, ${club.split(/\s+/).pop()}, ${price > 0 ? `+${price}` : price}, ${button.dataset.chance}%${cash ? `, $5 profits ${cash}` : ""}${button.dataset.tds || ""}`; } button.classList.toggle("on", mine); }); }; const paint = (kind) => { head.textContent = kind === "Anytime TD" ? "Most likely to score an anytime touchdown" : kind === "2 Anytime TDs" ? "Most likely to score 2 anytime touchdowns" : kind === "3 Anytime TDs" ? "Most likely to score 3 anytime touchdowns" : "Most likely to throw a touchdown"; allBox.replaceChildren(); const three = books.get("3 Anytime TDs") || new Map(); const rows = [...((books.get(kind) || new Map()).values())].sort((a, b) => b.chance - a.chance); if (!rows.length) { const empty = document.createElement("p"); empty.className = "find-empty"; empty.textContent = `FanDuel has no ${kind.toLowerCase()} touchdown prices up.`; allBox.append(empty); return; } rows.forEach((row) => { const button = document.createElement("button"); button.type = "button"; button.dataset.who = row.person.name; button.dataset.match = row.match || ""; button.dataset.kickoff = row.kickoff || ""; button.dataset.odds = String(row.odds); button.dataset.chance = String(Math.round(row.chance * 100)); if (row.here) button.dataset.here = "1"; button.dataset.tds = teamTd(people, row.person.name, row.match, row.kickoff); button.textContent = `${row.person.name}, ${Number(row.odds) > 0 ? `+${row.odds}` : row.odds}, ${Math.round(row.chance * 100)}%${findCash(row.odds) ? `, $5 profits ${findCash(row.odds)}` : ""}${button.dataset.tds}`; if (row.here && !team) button.classList.add("on"); if (kind === "Anytime TD" && three.has(row.person.name)) button.dataset.three = "1"; button.addEventListener("click", () => { const preset = kind === "Throwing" ? "Passing touchdowns" : "Touchdowns"; showFind(list, hits, row.person, board.querySelector(":scope > .find-roster"), people || board.people || [], false, preset); }); allBox.append(button); }); markTd(allBox); tagTeams(); fillTeam(people, allBox); loadZone(people, allBox); showFew(kind); };
  ["Anytime TD", "2 Anytime TDs", "3 Anytime TDs", "Throwing"].forEach((kind) => { const button = document.createElement("button"); button.type = "button"; button.textContent = kind; if (kind === "Anytime TD") button.classList.add("on"); button.addEventListener("click", () => { picks.querySelectorAll("button").forEach((node) => node.classList.toggle("on", node === button)); paint(kind); }); picks.append(button); }); const few = document.createElement("div"); few.className = "find-td-all find-td-page"; let fewKey = ""; const showFew = (kind) => { if (kind !== "Anytime TD") { few.replaceChildren(); fewKey = ""; return; } const rows = [...allBox.querySelectorAll("button")].filter((button) => button.dataset.three === "1").map((button) => ({ name: button.dataset.who, odds: Number(button.dataset.odds), match: button.dataset.match || "" })); const key = rows.map((row) => `${row.name}|${row.odds}`).join(","); if (!rows.length || key === fewKey) return; fewKey = key; few.replaceChildren(); fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "few", rows }) }).then((res) => res.json()).then((data) => { if (!few.isConnected || fewKey !== key || !data || !Array.isArray(data.picks) || !data.picks.length) return; const title = document.createElement("p"); title.className = "find-why few-head"; title.textContent = "What the price is charging for."; few.append(title); data.picks.forEach((pick) => { const live = [...allBox.querySelectorAll("button")].find((node) => node.dataset.who === pick.name); const price = Number((live && live.dataset.odds) || pick.odds), shown = price > 0 ? `+${price}` : String(price), chance = (live && live.dataset.chance) || ""; const card = document.createElement("div"); card.className = "rec-bet open log-on"; const head = document.createElement("b"); head.innerHTML = [`<i class="px">${esc(shown)}</i>`, chance && `<i class="pct">${esc(chance)}%</i>`, typeof findCash === "function" && findCash(price) && `<i class="pay">${esc(`$5 profits ${findCash(price)}`)}</i>`].filter(Boolean).join(""); const gist = document.createElement("p"); gist.className = "rec-gist"; const spot = (live && live.dataset.match) || ""; gist.innerHTML = `<i class="who">${esc(pick.name)}</i> <i class="prop">Anytime touchdown</i>${spot ? `<em>${esc(spot)}</em>` : ""}`; card.addEventListener("click", () => { const again = [...allBox.querySelectorAll("button")].find((node) => node.dataset.who === pick.name); if (again) again.click(); }); card.append(head, gist); if (window.paintDive) paintDive(card, pick); else { const why = document.createElement("p"); why.className = "find-why"; why.textContent = String(pick.summary || pick.line || ""); card.append(why); } few.append(card); }); }).catch(() => {}); }; list.append(head, picks, few, allBox); paint("Anytime TD"); const glass = document.getElementById("desk-glass-in"); if (glass) glass.scrollTop += head.getBoundingClientRect().top - glass.getBoundingClientRect().top - 8; if (!game) return; const sides = (String(game.match || "").includes(" @ ") ? String(game.match).split(" @ ") : String(game.match || "").split(" v ").reverse()).map((side) => side.replace(/\s*\([^)]*\)/g, "").trim()).filter(Boolean); Promise.all(sides.map((name) => fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name, sport: game.sport || "NFL" }) }).then((res) => res.json()).then((data) => (data.players || []).forEach((row) => { if (typeof plainName === "function") clubs.set(plainName(row && row.name || row), name); })).catch(() => {}))).then(() => { if (allBox.isConnected) tagTeams(); });
}
function teamTd(people, name, match, kickoff) { const fold = (text) => typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase(); if (people && !people.tdBook) { const who = new Map(), line = new Map(); (people || []).forEach((person) => { if (!person || person.kind !== "team") return; (person.bets || []).forEach((bet) => { const market = String(bet.market || ""), spot = `${bet.match}|${bet.kickoff}`; if (/td scorer$|to score a td$/i.test(market)) { const player = fold(bet.label); if (player.split(" ").length > 1 && !/defense|special/.test(player)) who.set(`${player}|${spot}`, person.name); } if (/total points$/i.test(market) && /\bover\s+\d/i.test(bet.label)) { const num = Number((String(bet.label).match(/\bover\s+(\d+(?:\.\d+)?)/i) || [])[1]); if (num) line.set(`${fold(person.name)}|${spot}`, num); } }); }); people.tdBook = { who, line }; } const book = people && people.tdBook; if (!book) return ""; const want = fold(name), spot = `${match}|${kickoff}`; let club = book.who.get(`${want}|${spot}`); if (!club) { for (const [key, value] of book.who) { if (!key.endsWith(`|${spot}`)) continue; const player = key.slice(0, key.length - spot.length - 1); if (player.startsWith(`${want} `) || want.startsWith(`${player} `)) { club = value; break; } } } const num = club && book.line.get(`${fold(club)}|${spot}`); if (!club) return ""; const zoneRow = people.zone && people.zone[fold(club)]; const isBack = zoneRow && Array.isArray(people.backs) && people.backs.some((name) => name === want || name.startsWith(`${want} `) || want.startsWith(`${name} `)); const back = isBack && zoneRow.back != null ? `, ${zoneRow.back}% of those passes go to an RB` : ""; const zone = zoneRow ? `, ${zoneRow.plays} red zone plays a game, ${zoneRow.pass}% pass, ${zoneRow.run}% run${back}` : ""; if (!num) return zone; const tds = Math.round((num / 7) * 10) / 10; return `\n${club.split(/\s+/).pop()} projected ${Number.isInteger(tds) ? tds : tds.toFixed(1)} TDs${zone}`; }
function markTd(box) { if (!box) return; box.querySelectorAll("button").forEach((button) => button.classList.toggle("find-better", button.dataset.three === "1")); } function fillTeam(people, box) { const fold = (text) => typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase(); if (people && !people.tdClub) people.tdClub = new Map(); const apply = (button, team) => { if (!team || !people || !people.tdBook || !button.isConnected) return; people.tdBook.who.set(`${fold(button.dataset.who)}|${button.dataset.match}|${button.dataset.kickoff}`, team); const suffix = teamTd(people, button.dataset.who, button.dataset.match, button.dataset.kickoff); if (!suffix) return; const old = button.dataset.tds || ""; button.dataset.tds = suffix; if (old && old !== suffix && button.textContent.includes(old)) button.textContent = button.textContent.replace(old, suffix); else if (!/projected|red zone plays/.test(button.textContent)) button.textContent += suffix; }; const jobs = []; [...box.querySelectorAll("button")].forEach((button) => { if (button.dataset.tds || !button.dataset.match || /defense/.test(fold(button.dataset.who))) return; const saved = people.tdClub.get(fold(button.dataset.who)); if (saved) { apply(button, saved); return; } jobs.push(fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "club", name: button.dataset.who }) }).then((res) => res.json()).then((data) => { const sides = String(button.dataset.match || "").split(/\s@\s|\sv\s/i).map((side) => fold(side.trim())); const team = ((data && data.clubs) || []).map((club) => club.team).find((team) => sides.some((side) => { const got = fold(team); return got === side || side.endsWith(` ${got}`) || got.endsWith(` ${side}`); })); if (team) people.tdClub.set(fold(button.dataset.who), team); apply(button, team); }).catch(() => {})); }); Promise.all(jobs).then(() => { if (!box.isConnected) return; box.querySelectorAll("button").forEach((button) => button.classList.remove("find-better")); markTd(box); }); } function paintZone(people, box) { if (!people || !people.zone || !box) return; box.querySelectorAll("button").forEach((button) => { if (!button.dataset.who || !button.dataset.match || /red zone plays/.test(button.textContent)) return; const suffix = teamTd(people, button.dataset.who, button.dataset.match, button.dataset.kickoff); if (!suffix || !/red zone plays/.test(suffix)) return; const old = button.dataset.tds || ""; button.dataset.tds = suffix; if (old && button.textContent.includes(old)) button.textContent = button.textContent.replace(old, suffix); else button.textContent += suffix; }); } function loadZone(people, box) { if (!people) return; const done = () => { if (box.isConnected) paintZone(people, box); }; if (people.zone) { done(); return; } if (!people.zoneJob) people.zoneJob = fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "zone" }) }).then((res) => res.json()).then((data) => { const fold = (text) => typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase(); const zone = {}; Object.entries((data && data.teams) || {}).forEach(([name, row]) => { zone[fold(name)] = row; }); people.zone = zone; people.backs = ((data && data.backs) || []).map((name) => fold(name)); }).catch(() => { people.zone = {}; }); people.zoneJob.then(done); }
function paintLeagueTd(group, people, list, hits) { const link = document.createElement("button"); link.type = "button"; link.className = "find-all-td"; link.textContent = "Most likely to score a touchdown"; link.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openTdPage(list, people, hits); }); group.append(link); }
function paintTotal(holder, game, people) {
  const take = (market) => { const rows = []; (people || []).forEach((person) => { if (!person || person.kind !== "team") return; (person.bets || []).forEach((bet) => { if (bet.match !== game.match || bet.kickoff !== game.kickoff || String(bet.market || "").toLowerCase() !== market || rows.some((row) => String(row.label).replace(/\s+spread$/i, "") === String(bet.label).replace(/\s+spread$/i, "") && row.odds === bet.odds)) return; rows.push(bet); }); }); return rows; };
  const sides = (String(game.match || "").includes(" @ ") ? String(game.match).split(" @ ") : String(game.match || "").split(" v ").reverse()).map((side) => side.trim().toLowerCase()), bySide = (rows) => rows.slice().sort((a, b) => sides.findIndex((side) => String(a.label || "").toLowerCase().includes(side)) - sides.findIndex((side) => String(b.label || "").toLowerCase().includes(side)));
  const totals = take("total").filter((bet) => /^(over|under)\b/i.test(bet.label)); const over = totals.find((bet) => /^over\b/i.test(bet.label)); const num = over && (String(over.label).match(/\d+(?:\.\d+)?/) || [])[0]; const under = num && totals.find((bet) => /^under\b/i.test(bet.label) && String(bet.label).includes(num));
  const moneys = bySide(take("moneyline")); const rows = [...bySide(take("spread")), ...moneys, ...[over, under].filter(Boolean)]; if (!rows.length) return;
  const favorite = moneys.reduce((best, bet) => Number(bet.odds) < Number(best.odds) ? bet : best, moneys[0]); const called = favorite && moneys.filter((bet) => Number(bet.odds) === Number(favorite.odds)).length === 1; const box = document.createElement("div"); box.className = "find-score find-lines"; if (called) { const call = document.createElement("p"); call.className = "find-pick"; call.innerHTML = `${esc(String(favorite.label || "").replace(/\s+moneyline$/i, ""))} are projected to win <i class="pct">${esc(findPct(Number(favorite.odds)))}</i>`; box.append(call); } const fold = document.createElement("details"); fold.className = "find-odds find-team-bets"; fold.open = true; fold.style.gridColumn = "1 / -1"; const title = document.createElement("summary"); title.innerHTML = `<b class="find-script-head">Team bets</b>`; fold.append(title); box.append(fold); if (typeof gameLines === "function") gameLines(fold, game, rows); else rows.forEach((bet) => { const price = Number(bet.odds); const tag = price > 0 ? `+${price}` : String(price); const line = document.createElement("p"); line.className = "rec-gist"; line.innerHTML = `<i class="prop">${esc(bet.label)}</i> <i class="px">${esc(tag)}</i> <i class="pct">${esc(findPct(price))}</i> <i class="pay">${esc(findCash(price) ? `$5 profits ${findCash(price)}` : "")}</i>`; fold.append(line); });
  const match = [...holder.querySelectorAll(".find-match")].pop(); const body = match && match.querySelector(".find-body"); if (match && body) match.insertBefore(box, body); else holder.append(box); const crowd = match && match.querySelector(":scope > .find-stacks.find-team-bets, :scope > .find-everyone"); const call = box.querySelector(".find-pick"); if (crowd && call) { const top = document.createElement("div"); top.className = box.className; top.style.gridColumn = "1 / -1"; top.append(call); crowd.before(top); } if (crowd) { (match.querySelector(":scope > .find-everyone") || crowd).before(fold); if (!box.childElementCount) box.remove(); }
}
function siftKinds(list, preset) {
  const rows = [...list.querySelectorAll(":scope > .rec-bet")];
  if (rows.length < 2) return;
  const counts = new Map();
  rows.forEach((row) => { const kind = row.dataset.kind || "Other"; counts.set(kind, (counts.get(kind) || 0) + 1); });
  const details = document.createElement("details");
  details.className = "find-roster find-kinds";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Filter";
  const names = document.createElement("div");
  names.className = "find-names";
  const order = ["Spread", "Moneyline", "Total", "Kicking", ...PROP_KINDS.map((row) => row[1])];
  if (counts.size >= 2) [...counts.keys()].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b))).forEach((kind) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.kind = kind;
    button.textContent = `${kind} ${counts.get(kind)}`;
    button.addEventListener("click", () => {
      const on = !button.classList.contains("on");
      names.querySelectorAll("button").forEach((node) => { node.classList.remove("on"); node.setAttribute("aria-pressed", "false"); });
      if (on) { button.classList.add("on"); button.setAttribute("aria-pressed", "true"); }
      clearTimeout(siftKinds.timer);
      applyKinds();
    });
    names.append(button);
  });
  const band = document.createElement("div");
  band.className = "find-band";
  const field = (word, placeholder, step, key) => {
    const label = document.createElement("label");
    label.className = "find";
    const span = document.createElement("span");
    span.textContent = word;
    const input = document.createElement("input");
    input.type = "number";
    input.placeholder = placeholder;
    input.step = step;
    input.inputMode = "decimal"; input.dataset.key = key; try { localStorage.removeItem("parlay-band-" + key); } catch (error) {}
    input.addEventListener("input", () => { clearTimeout(siftKinds.timer); if (!input.value.trim()) applyKinds(); else siftKinds.timer = setTimeout(applyKinds, 400); });
    label.append(span, input);
    band.append(label);
    return input;
  };
  const oddsInput = field("Odds", "-150", "1", "odds");
  const pctInput = field("%", "75", "0.1", "pct");
  const cashInput = field("$5 profits", "2", "0.01", "cash"); const propInput = typeof propSeekField === "function" ? propSeekField(band, () => applyKinds()) : null; const wipe = document.createElement("button"); wipe.type = "button"; wipe.className = "find-clear"; wipe.textContent = "Clear"; wipe.addEventListener("click", () => { [oddsInput, pctInput, cashInput, propInput].filter(Boolean).forEach((input) => { input.value = ""; }); ["odds", "pct", "cash"].forEach((key) => { try { localStorage.removeItem("parlay-band-" + key); } catch (error) {} }); applyKinds(); }); band.append(wipe); if (typeof bandPick === "function") bandPick(band);
  const none = document.createElement("p");
  none.className = "quiet";
  none.hidden = true;
  none.textContent = "None of these.";
  const applyKinds = () => {
    const picked = names.querySelector("button.on");
    const kind = picked ? picked.dataset.kind : "";
    const odds = Number(oddsInput.value);
    const pct = Number(pctInput.value);
    const cash = Number(cashInput.value);
    const oddsOn = oddsInput.value.trim() !== "" && Number.isFinite(odds) && odds !== 0;
    const pctOn = pctInput.value.trim() !== "" && Number.isFinite(pct);
    const cashOn = cashInput.value.trim() !== "" && Number.isFinite(cash); const seek = propInput ? propInput.value.trim() : "";
    const on = !!kind || oddsOn || pctOn || cashOn || !!seek;
    if (on) { list.classList.remove("find-only-on"); const show = list.querySelector(".find-show"); if (show) show.textContent = "Show all"; }
    let shown = 0;
    list.querySelectorAll(":scope > .rec-bet").forEach((row) => {
      const price = Number(row.dataset.odds);
      const chance = !price ? 0 : price < 0 ? Math.abs(price) / (Math.abs(price) + 100) * 100 : 100 / (price + 100) * 100;
      const won = !price ? 0 : price < 0 ? 500 / -price : price / 20;
      let hide = false;
      if (kind && (row.dataset.kind || "Other") !== kind) hide = true;
      if (oddsOn) hide = hide || (odds < 0 ? !(price <= odds) : !(price >= odds));
      if (pctOn) hide = hide || chance + 1e-9 < pct;
      if (cashOn) hide = hide || won + 1e-9 < cash; if (seek) hide = hide || !propSeekHit(row, seek);
      row.classList.toggle("find-off", hide);
      if (!hide) shown += 1;
    });
    list.querySelectorAll(":scope > .find-market").forEach((head) => { let node = head.nextElementSibling, any = false; while (node && !node.classList.contains("find-market")) { if (node.classList.contains("rec-bet") && !node.classList.contains("find-off")) any = true; node = node.nextElementSibling; } head.classList.toggle("find-off", on && !any); });
    const bits = [kind, oddsOn ? (odds > 0 ? `+${odds}` : String(odds)) : "", pctOn ? `${pct}%` : "", cashOn ? `$${cash}` : "", seek ? `"${seek}"` : ""].filter(Boolean);
    summary.textContent = bits.length ? `Filter, ${bits.join(", ")}` : "Filter";
    none.hidden = !on || shown > 0;
  };
  if (preset) { const button = [...names.querySelectorAll("button")].find((node) => node.dataset.kind === preset); if (button) { button.classList.add("on"); button.setAttribute("aria-pressed", "true"); } } if ((preset && names.querySelector("button.on")) || oddsInput.value || pctInput.value || cashInput.value) applyKinds();
  details.append(summary, names, band, none); if (window.addFindSort) addFindSort(names, list);
  const heading = list.querySelector("h3");
  if (heading) heading.after(details); else list.prepend(details);
}
function loadHistory(row, name) {
  const button = row.querySelector(":scope > .find-read");
  if (!button || !name) return;
  if (button._read) button._read.abort();
  const stop = new AbortController();
  button._read = stop;
  button.textContent = "Reading the log.";
  const gist = (row.querySelector(".rec-gist") || {}).textContent || "";
  const sport = row.dataset.sport || ((row.querySelector(".leg-league") || {}).textContent || "") || ((gist.split("—")[1] || "").split(",")[0] || "").trim();
  const bet = { label: gist, market: row.dataset.market || "", odds: Number(row.dataset.odds), sport };
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name, text: gist, sport, bet }), signal: stop.signal }).then((res) => res.json()).then((data) => { if (button._read !== stop) return; paintHistory(row, button, data || {}, name); }).catch((err) => { if (err && err.name === "AbortError") return; if (button.isConnected) paintHistory(row, button, { why: "The game log did not load." }, name); });
}
function askRead(row, name) {
  if (row.querySelector(".find-read") || row.querySelector(".find-why")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "find-why-go find-read";
  button.textContent = "See the history";
  button.addEventListener("click", () => loadHistory(row, name));
  const leg = row.querySelector(".find-leg");
  if (leg) leg.after(button); else row.append(button);
}
function tuckHist(box, open) { if (!box || !box.querySelector(".find-log")) return; if (open) box.classList.add("log-on"); const had = box.querySelector(".find-hist"); if (had) { had.textContent = box.classList.contains("log-on") ? "Hide the history" : "Show the history"; return; } const button = document.createElement("button"); button.type = "button"; button.className = "find-hist"; button.textContent = box.classList.contains("log-on") ? "Hide the history" : "Show the history"; button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); const on = box.classList.toggle("log-on"); button.textContent = on ? "Hide the history" : "Show the history"; }); box.querySelector(".find-log").before(button); }
window.tuckHist = tuckHist;
const legJobs = []; let legBusy = 0; function pumpLegs() { while (legBusy < 3 && legJobs.length) { legBusy += 1; legJobs.shift()().finally(() => { legBusy -= 1; pumpLegs(); }); } }
function fillLeg(block) { const who = block.dataset.who || "", raw = block.dataset.raw || ""; if (!who || block.querySelector(".find-why, .find-log")) return; const sport = block.dataset.sport || "", odds = Number(block.dataset.odds), bet = { label: raw, market: block.dataset.market || "", odds, sport }; const done = (data) => { const wait = block.querySelector(".find-leg-wait"); if (!wait) return; const said = block.querySelector(".find-why, .find-log, .find-lean") ? "" : (data && data.error) || (findCash(odds) && findPct(odds) ? `$5 profits ${findCash(odds)} at ${odds > 0 ? "+" : ""}${odds}. It has to hit ${findPct(odds)} to break even.` : ""); if (!said) { wait.remove(); return; } wait.className = "find-why"; wait.textContent = said; }; legJobs.push(() => fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: who, text: raw, sport, bet }), signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined }).then((res) => res.json()).then((data) => { if (!data) return done(null); if (data.why) { const why = document.createElement("p"); why.className = "find-why"; why.textContent = data.why; block.append(why); } if (data.spans) { const log = document.createElement("div"); log.className = "find-log"; data.spans.split(". ").forEach((bit) => { const cut = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const title = document.createElement("b"); title.textContent = cut[0]; item.append(title, document.createTextNode(cut.slice(1).join(", ") || "")); log.append(item); }); block.append(log); if (/Last 10,/.test(data.spans) && /Career,/.test(data.spans)) { const go = document.createElement("button"); go.type = "button"; go.className = "find-why-go"; go.textContent = "Why the recent trend?"; go.addEventListener("click", () => { if (go.disabled) return; go.disabled = true; go.textContent = "Reading the trend."; fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: who, text: raw, sport, odds }) }).then((res) => res.json()).then((found) => { const line = document.createElement("p"); line.className = "find-dive find-lean"; line.textContent = found.why || found.error || ""; if (line.textContent) go.replaceWith(line); else { go.disabled = false; go.textContent = "Why the recent trend?"; } }).catch(() => { go.disabled = false; go.textContent = "Why the recent trend?"; }); }); block.append(go); } } if (data.lean) { const lean = document.createElement("p"); const show = /^(Targets|Carries|Passes) /.test(data.lean); lean.className = show ? "find-why" : "find-dive find-lean"; lean.textContent = data.lean; if (show && block.querySelector(".find-why")) block.querySelector(".find-why").after(lean); else block.append(lean); } tuckHist(block); done(data); }).catch(() => done(null))); pumpLegs(); }
function fillOpen(card) { if (!card) return; const past = card.classList.contains("show-past"); card.querySelectorAll(".find-leg-read:not(.read)").forEach((piece) => { const bet = piece.closest(".rec-bet"); if (bet && bet.classList.contains("rec-was") && !past) return; piece.classList.add("read"); fillLeg(piece); }); }
window.fillOpen = fillOpen;
function paintHistory(row, button, data, name) {
  if (data && data.error && !data.why) data = { why: String(data.error) };
  const box = document.createElement("div");
  if (data.why) { const why = document.createElement("p"); why.className = "find-why"; why.textContent = data.why; box.append(why); }
  if (data.spans) {
    const log = document.createElement("div");
    log.className = "find-log";
    data.spans.split(". ").forEach((bit) => { const [label, value] = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const title = document.createElement("b"); title.textContent = label; item.append(title, document.createTextNode(value || "")); log.append(item); });
    box.append(log);
    if (/Last 10,/.test(data.spans) && /Career,/.test(data.spans)) {
      const go = document.createElement("button");
      go.type = "button";
      go.className = "find-why-go";
      go.textContent = "Why the recent trend?";
      go.addEventListener("click", () => {
        if (go.disabled) return;
        go.disabled = true;
        const was = go.textContent;
        go.textContent = "Reading the trend.";
        const gist = (row.querySelector(".rec-gist") || {}).textContent || "";
        const sport = row.dataset.sport || ((row.querySelector(".leg-league") || {}).textContent || "") || ((gist.split("—")[1] || "").split(",")[0] || "").trim();
        fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name, text: gist, sport, odds: Number(row.dataset.odds) || 0 }) }).then((res) => res.json()).then((found) => { const line = document.createElement("p"); line.className = "find-dive find-lean"; line.textContent = found.why || found.error || ""; if (line.textContent) go.replaceWith(line); else { go.disabled = false; go.textContent = was; } }).catch(() => { go.disabled = false; go.textContent = was; });
      });
      box.append(go);
    }
  }
  if (data.lean) { const lean = document.createElement("p"); const show = /^(Targets|Carries|Passes) /.test(data.lean); lean.className = show ? "find-why" : "find-dive find-lean"; lean.textContent = data.lean; if (show && box.querySelector(".find-why")) box.querySelector(".find-why").after(lean); else box.append(lean); }
  if (!box.childNodes.length) { button.textContent = "See the history"; return; }
  tuckHist(box, true); button.replaceWith(box);
}
function parlayHint(legs) {
  const rows = (legs || []).filter((leg) => Number(leg.odds));
  if (!rows.length) return "";
  const note = document.createElement("p");
  note.className = "find-why";
  const say = (text) => { if (text) note.append(document.createTextNode(text)); };
  let said = "";
  if (rows.length >= 2 && typeof rosterScan === "function") {
    const dec = rows.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
    const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
    const main = (rosterScan(rows, price) || [])[0];
    if (main && typeof rosterWho === "function") {
      const label = rosterWho(main.id, main.part, main.name);
      const exp = document.createElement("span"); exp.className = "find-exp"; note.append(exp); exp.append(main.fit ? "Experimental: matches " : "Experimental: close to ");
      const go = document.createElement("button");
      go.type = "button";
      go.className = "find-near";
      go.textContent = label;
      go.addEventListener("click", () => { if (window.openStrategy) openStrategy(main.id, main.part || ""); });
      exp.append(go);
      exp.append(main.fit ? "." : `.${main.why ? ` ${main.why}` : ""}`);
      said = label;
    }
  }
  const next = parlayNext(rows, said);
  if (next) { const more = document.createElement("span"); more.className = "find-exp"; more.textContent = note.childNodes.length ? ` ${next}` : `Experimental: ${next}`; note.append(more); }
  return note.childNodes.length ? note : "";
}
function parlayNext(legs, said) {
  const n = legs.length;
  if (!n || n >= 8) return "";
  const odds = legs.map((leg) => Number(leg.odds));
  const chance = (o) => (o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100));
  const probs = odds.map(chance);
  const games = legs.map((leg) => String(leg.match || leg.gameId || ""));
  const split = games.every(Boolean) && new Set(games).size === n;
  const fresh = split || n === 1;
  const blob = (leg) => `${leg.market || ""} ${leg.label || ""} ${leg.runner || ""}`.toLowerCase();
  const yard = legs.every((leg) => /yd|yard/.test(blob(leg)));
  const alt = legs.every((leg) => /\balt\b|\+/.test(blob(leg)));
  const td = legs.every((leg) => /anytime touchdown scorer|any time touchdown scorer/.test(blob(leg)) && !/half|quarter|\b1st\b|first|last|either|\b[23]\+/.test(blob(leg)));
  const nfl = legs.every((leg) => String(leg.sport || "").toUpperCase() === "NFL");
  const shy = legs.some((leg) => /reception/.test(blob(leg)) && Number((blob(leg).match(/(\d+(?:\.\d+)?)/) || [])[1]) >= 4.5);
  const band = (lo, hi) => odds.every((o) => o >= lo && o <= hi);
  const when = legs.map((leg) => { const t = Date.parse(leg.kickoff || ""); if (!Number.isFinite(t)) return null; return { hour: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(t)), week: new Date(t).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }) }; });
  const timed = when.every(Boolean);
  const side = (leg) => { const text = `${leg.runner || ""} ${leg.label || ""}`; if (/\bover\b/i.test(text) && !/\bunder\b/i.test(text)) return "over"; if (/\bunder\b/i.test(text) && !/\bover\b/i.test(text)) return "under"; return ""; };
  const who = (id, part, name) => (typeof rosterWho === "function" ? rosterWho(id, part, name) : name);
  const ideas = [];
  const offer = (id, part, name, what) => { const label = who(id, part, name); if (!label || said.includes(label)) return; ideas.push({ id, text: `Add ${what} and this parlay would be close to ${label}.` }); };
  if (fresh && n === 1 && probs[0] >= 0.75) offer("safe2", "", "Safe 2-leg, both 75%+", "another leg at 75% or better, from another game,");
  if (fresh && n === 1 && odds[0] >= 100 && odds[0] <= 200) offer("plusLegs", "", "+100 to +200 legs", "another leg from +100 to +200, from another game,");
  if (n === 1 && td && nfl) offer("td2", "", "2 NFL players, 1 anytime TD each", "another NFL anytime touchdown, from another game,");
  if (n === 2 && td && nfl) offer("td3", "", "3 NFL players, 1 anytime TD each", "another NFL anytime touchdown, from another game,");
  if (fresh && n === 2 && band(-400, -250)) offer("mid3", "", "3 legs, −250 to −400", "another leg from −250 to −400, from another game,");
  if (fresh && n === 2 && band(-230, -170)) offer("low3", "", "Low-variance 3-leg", "another leg from −230 to −170, from another game,");
  if (fresh && n === 2 && yard && probs.every((c) => c >= 0.75 && c <= 0.85)) offer("yards3", "", "3 yardage legs near 80% each", "another yardage leg near 80%, from another game,");
  if (fresh && n === 2 && alt && probs.every((c) => c >= 0.85)) offer("alt3", "", "Alt lines, 3 legs, 85%+", "another alt line at 85% or better, from another game,");
  const fav = odds.filter((o) => o >= -300 && o <= -120).length, dog = odds.filter((o) => o >= 100 && o <= 220).length;
  if (fresh && n === 2 && fav === 2) offer("mix21", "", "2 favorites and 1 underdog", "an underdog from +100 to +220, from another game,");
  if (fresh && n === 2 && fav === 1 && dog === 1) offer("mix21", "", "2 favorites and 1 underdog", "another favorite from −300 to −120, from another game,");
  if (fresh && n === 3 && band(-300, -150)) offer("win4", "", "4 legs, −150 to −300", "another leg from −150 to −300, from another game,");
  if (fresh && n === 3 && band(-280, -140)) offer("games4", "", "4 legs, 4 different games", "another leg from −280 to −140, from another game,");
  if (n === 3 && yard && !shy && probs.every((c) => Math.abs(c - 0.85) <= 0.05)) offer("four", "", "Four yardage legs near 85% each", "another yardage leg near 85%, from another game,");
  if (n === 3 && yard && !shy && probs.every((c) => Math.abs(c - 0.8) <= 0.08)) offer("hits", "four", "Four near 80% each", "another yardage leg near 80%, from another game,");
  if (n === 4 && yard && !shy && probs.every((c) => Math.abs(c - 0.9) <= 0.08)) offer("hits", "five", "Five near 90% each", "another yardage leg near 90%, from another game,");
  if (fresh && timed && (n === 1 || n === 2) && when.every((row) => row.hour < 16) && band(-300, -130)) offer("early3", "", "Early slate, 2 to 3 legs", "another leg before 4:00 PM ET, from −300 to −130, from another game,");
  if (fresh && timed && n === 2 && when.every((row) => row.hour >= 19) && band(-300, -130)) offer("prime3", "", "Prime time, 3 legs", "another leg at 7:00 PM ET or later, from −300 to −130, from another game,");
  if (fresh && timed && n === 3 && when.every((row) => row.week === "Sat" || row.week === "Sun") && band(-260, -140)) offer("weekend4", "", "Weekend special, 4 legs", "another Saturday or Sunday leg from −260 to −140, from another game,");
  const overs = legs.filter((leg) => side(leg) === "over").length, unders = legs.filter((leg) => side(leg) === "under").length;
  if (fresh && n === 3 && overs + unders === 3 && Math.abs(overs - unders) === 1 && band(-220, -110)) offer("ou4", "", "2 overs and 2 unders", `one more ${overs < unders ? "over" : "under"} from −220 to −110, from another game,`);
  const order = ["td2", "td3", "ou4", "alt3", "yards3", "four", "hits", "mix21", "low3", "safe2", "mid3", "plusLegs", "early3", "prime3", "weekend4", "win4", "games4"];
  ideas.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return ideas.length ? ideas[0].text : "";
}
function openLeg(person, key) {
  const board = document.querySelector(".find-board");
  const list = board && board.querySelector(".find-list");
  const hits = board && board.querySelector(":scope > .find-hits:not(.find-tray)");
  const roster = board && board.querySelector(":scope > .find-roster");
  if (!list || !hits || !person) return;
  const heading = list.querySelector("h3");
  const shown = heading && heading.childNodes[0] && heading.childNodes[0].textContent.trim() === person.name;
  if (!shown) showFind(list, hits, person, roster, board.people || []);
  const leg = [...list.querySelectorAll(".find-leg")].find((node) => node.dataset.key === key);
  const row = leg && leg.closest(".rec-bet");
  if (!row) return;
  list.querySelectorAll(".rec-bet.find-open").forEach((node) => node.classList.remove("find-open"));
  row.classList.remove("find-off");
  row.classList.add("find-open");
  const glass = document.getElementById("desk-glass-in");
  const tray = document.querySelector(".find-tray");
  if (glass) {
    if (window.gameScrollQuit) gameScrollQuit(); const quit = new AbortController(), watch = new ResizeObserver(() => align()), stop = () => { quit.abort(); watch.disconnect(); }; ["wheel", "touchstart", "pointerdown", "keydown"].forEach((kind) => window.addEventListener(kind, stop, { passive: true, signal: quit.signal }));
    const align = () => { if (!row.isConnected || quit.signal.aborted) return; const shown = tray && !tray.hidden && tray.getClientRects().length; glass.scrollTop += row.getBoundingClientRect().top - (shown ? tray.getBoundingClientRect().bottom : glass.getBoundingClientRect().top) - 8; const fold = shown && !tray.classList.contains("find-shut") && row.getBoundingClientRect().top < tray.getBoundingClientRect().bottom && tray.querySelector(".find-fold"); if (fold) { fold.click(); if (typeof saveAutoShut !== "undefined") { saveAutoShut.add(tray); saveFoldAt = Date.now(); } requestAnimationFrame(align); } };
    align(); requestAnimationFrame(align); watch.observe(list); setTimeout(stop, 4000);
  }
}
function slimTray() {
  const glass = document.getElementById("desk-glass-in");
  if (!glass) return;
  if (!glass.dataset.slim) { glass.dataset.slim = "1"; glass.addEventListener("scroll", slimTray, { passive: true }); }
  const pad = parseFloat(getComputedStyle(glass).paddingTop) || 0;
  document.querySelectorAll(".find-tray").forEach((tray) => {
    if (tray.hidden || !tray.getClientRects().length) { tray.classList.remove("find-slim", "find-full"); tray.style.maxHeight = ""; tray.style.overflowY = ""; tray.style.overscrollBehavior = ""; return; } const many = tray.querySelectorAll(".find-row").length >= 4 || (typeof parlayLeg !== "undefined" && parlayLeg.size >= 4); if (many) { tray.classList.remove("find-slim"); tray.classList.add("find-full"); const room = Math.max(180, glass.clientHeight - Math.max(0, tray.getBoundingClientRect().top - glass.getBoundingClientRect().top) - 8); tray.style.maxHeight = room + "px"; tray.style.overflowY = "auto"; tray.style.overscrollBehavior = ""; return; } tray.classList.remove("find-full"); tray.style.maxHeight = ""; tray.style.overflowY = ""; tray.style.overscrollBehavior = ""; const top = tray.getBoundingClientRect().top - glass.getBoundingClientRect().top - pad;
    const slim = tray.classList.contains("find-slim");
    if (!slim && !tray.classList.contains("find-edit") && glass.scrollTop > 72 && top < 8) tray.classList.add("find-slim");
    else if (slim && glass.scrollTop < 28) tray.classList.remove("find-slim");
  });
}
function paintTrayBuild(tray) {
  const legs = [...parlayLeg.values()];
  const group = [...parlayPick.values()];
  const covered = !group.length || group.every((person) => legs.some((bet) => String(bet.label || "").startsWith(person.name)));
  if (legs.length < 1 || !covered) return;
  const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  const line = document.createElement("div");
  line.className = "find-ticket";
  const head = document.createElement("b");
  const tag = price > 0 ? `+${price}` : String(price);
  head.innerHTML = [tag && `<i class="px">${esc(tag)}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, findCash(price) && `<i class="pay">${esc(`$5 profits ${findCash(price)}`)}</i>`, ((rows) => { const games = rows.map((leg) => String(leg.match || leg.gameId || "")); return games.length > 1 && games.every(Boolean) && new Set(games).size === 1; })(legs) && `<i class="sg">Same game</i>`, typeof gameShortList === "function" && gameShortList(legs) && gameShortList(legs).split(", ").map((game) => `<i class="gm" data-game="${esc(game)}" role="button" title="Open this game">${esc(game)}</i>`).join("")].filter(Boolean).join("");
  const share = document.createElement("button");
  share.type = "button";
  share.className = "share-bet";
  share.dataset.share = "rec";
  const ticket = { title: `${legs.length}-leg parlay`, american: price, impliedPct: findPct(price), legs };
  share.dataset.shareId = String((window.recTickets = window.recTickets || []).push({ ticket, name: ticket.title }) - 1);
  share.setAttribute("aria-label", "Share this bet");
  line.append(head, share);
  const rows = [...tray.querySelectorAll(".find-row")];
  const name = rows[0] && rows[0].querySelector(".find-in");
  if (rows.length === 1 && name) name.before(line);
  else { const say = tray.querySelector(".find-say"); if (say) say.after(line); else if (name) name.before(line); else tray.append(line); }
}
function builtName(bet) { const runner = String(bet.runner || "").trim(); return runner && String(bet.label || "").startsWith(runner) ? runner : String(bet.label || "").split(/\s+—\s+/)[0].replace(/\s+(\d|over|under).*$/i, "").trim(); }
function dressBuilt(box) {
  if (!box) return;
  let tray = box.querySelector(":scope > .find-tray");
  if (!tray) { tray = document.createElement("div"); tray.className = "find-hits find-tray"; tray.hidden = true; const title = box.querySelector("h2"); if (title) title.after(tray); else box.prepend(tray); }
  if (typeof paintParlay === "function") paintParlay();
  const pile = window.builtPile || [], jobs = [];
  [...box.querySelectorAll(":scope > .rec-bet")].forEach((card) => {
    const legs = ((pile[Number(card.dataset.built)] || {}).legs) || [];
    [...card.querySelectorAll(":scope > span[data-drop]")].forEach((node, index) => {
      const bet = legs[index]; if (!bet) return;
      const key = parlayKey(bet);
      if (![...card.querySelectorAll("button.find-leg")].some((btn) => btn.dataset.key === key)) {
        const go = document.createElement("button"); go.type = "button"; go.className = "find-leg"; go.dataset.key = key; go.textContent = parlayLeg.has(key) ? "In the parlay" : "Add this leg"; if (parlayLeg.has(key)) go.classList.add("on");
        go.addEventListener("click", () => { if (parlayLeg.has(key) || parlayLeg.size >= 8) return; parlayLeg.set(key, bet); const name = builtName(bet); if (name && ![...parlayPick.values()].some((person) => person.name === name) && parlayPick.size < 8) parlayPick.set(name.toLowerCase(), { key: name.toLowerCase(), name, kind: "player", bets: pile.flatMap((row) => row.legs || []).filter((item) => builtName(item) === name) }); paintParlay(); });
        node.after(go);
      }
      if ([...card.querySelectorAll(".find-log")].some((log) => log.dataset.key === key) || !builtName(bet)) return;
      jobs.push(() => fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: builtName(bet), text: bet.label || "", sport: bet.sport || "", bet }) }).then((res) => res.json()).then((data) => {
        if (!card.isConnected || !data || !data.spans) return;
        const log = document.createElement("div"); log.className = "find-log"; log.dataset.key = key;
        data.spans.split(". ").forEach((bit) => { const cut = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const title = document.createElement("b"); title.textContent = cut[0]; item.append(title, document.createTextNode(cut.slice(1).join(", ") || "")); log.append(item); });
        const go = [...card.querySelectorAll("button.find-leg")].find((btn) => btn.dataset.key === key); (go || node).after(log);
        if (data.lean && !card.querySelector(".find-dive")) { const lean = document.createElement("p"); const show = /^(Targets|Carries|Passes) /.test(data.lean); lean.className = show ? "find-why" : "find-dive find-lean"; lean.textContent = data.lean; if (show) log.before(lean); else log.after(lean); } tuckHist(card);
      }).catch(() => {}));
    });
  });
  const pump = () => { const job = jobs.shift(); if (job) job().finally(pump); };
  pump(); pump(); pump();
}
window.dressBuilt = dressBuilt;
