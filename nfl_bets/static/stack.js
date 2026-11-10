/** Stack strategies. Each ticket in the stack is a single or a parlay. */

const STACKS = [
  ["Prop ladder", "Six or more clears every rung. The bottom payout has to cover the stake on the rungs above it.", [
    ["Single or parlay", "Top rung", "The highest line. The smallest stake. This is the one a huge night clears."],
    ["Single or parlay", "Middle rung", "The next line up, on the same stat. A smaller stake than the bottom."],
    ["Single or parlay", "Bottom rung", "The lowest over. Size this one so its profit pays for the tickets above it."],
  ]],
  ["Overlapping under", "Two or fewer cashes both unders. A finish in the gap cashes only the higher one.", [
    ["Single or parlay", "Higher under", "The cushion. Its payout has to cover the tighter under when the player lands in the gap."],
    ["Single or parlay", "Lower under", "The tight line. Both cash only when he stays under this number."],
  ]],
  ["Classic middle", "A finish inside the gap wins both. Outside it, one wins and one loses, and the loss is the juice.", [
    ["Single or parlay", "Low side", "The over on the lower line."],
    ["Single or parlay", "High side", "The under on the higher line. The gap between them is the middle."],
  ]],
  ["Live middle", "The same gap, taken after the number moves. Both tickets have to be in before the game ends.", [
    ["Single or parlay", "The ticket you already hold", "The morning number."],
    ["Single or parlay", "The other side, live", "Take it when the move has opened a gap wider than the juice on both sides."],
  ]],
  ["Key-number middle", "A middle that catches 3 or 7. Those are the NFL finishes that land. A middle between 9 and 10 is a different bet.", [
    ["Single", "The number you hold", "A side at -2.5, or a dog at +7."],
    ["Single", "The other side after the move", "The hook that crosses 3 or 7. Skip a hook that only crosses 5 or 8."],
  ]],
  ["Teaser", "One parlay. Both numbers move in your favor. Both legs have to hold.", [
    ["Parlay", "The teased ticket", "A 6-point teaser that crosses 3 and 7. A third leg gives the juice back."],
  ]],
  ["Wong teaser", "A 6-point teaser that starts on 1.5 to 2.5, or 7.5 to 8.5, so the teased number lands past 3 or 7.", [
    ["Parlay", "Two legs", "Favorite -2.5 teased to +3.5, or dog +7.5 teased to +13.5. Two legs, and stop."],
  ]],
  ["Pleaser", "The numbers move against you and the price gets longer. It cashes on a blowout.", [
    ["Parlay", "The pleased ticket", "Favorite -2.5 becomes -8.5. You sold the key numbers for the longer price."],
  ]],
  ["Buying the hook", "Pay juice to cross 3 or 7. Sell the hook on 4, 5, 6, 8, and 9.", [
    ["Single", "The hooked side", "Buy a 3 down to 2.5 when the game lands on 3 often enough to pay for the juice."],
  ]],
  ["Dutching", "Split one stake so any winner in the set pays the same profit. The combined price of the set has to be under 100 percent.", [
    ["Single", "First result", "One player, one horse, one side. Stake it in proportion to its price."],
    ["Single", "Second result", "Same payout if this one wins."],
    ["Single", "Third result", "Leave it off if adding it pushes the set over 100 percent."],
  ]],
  ["Arbitrage", "Two books, two sides, one gap. The profit is there only if both tickets are accepted at those numbers.", [
    ["Single or parlay", "Book A's side", "The price that is too long."],
    ["Single or parlay", "Book B's other side", "Sized so both payouts match. If one book cuts the bet, the other ticket is on its own."],
  ]],
  ["Low-hold shopping", "The same side is -105 in one book and -115 in another. Take the -105.", [
    ["Single or parlay", "The better price", "One ticket. The edge is the juice you did not pay. -105 needs 51.2 percent. -115 needs 53.5 percent."],
  ]],
  ["Round robin", "Every pair is its own parlay. One miss kills the tickets that used it and leaves the other pair.", [
    ["Parlay", "A and B", "A two-leg you would have bet on its own."],
    ["Parlay", "A and C", "The pair that survives if B misses."],
    ["Parlay", "B and C", "The pair that survives if A misses. Three hits pays all three."],
  ]],
  ["If-bet", "The second ticket exists only if the first wins. The stake at risk is the first ticket, not both.", [
    ["Single or parlay", "The opener", "The leg you trust. If it loses, the second ticket is never placed."],
    ["Single or parlay", "The follow", "Placed with what the first one returned. A loss here gives back that profit."],
  ]],
  ["Reverse", "Both orders. A then B, and B then A. Both openers are live.", [
    ["Single or parlay", "A, then B if A wins", "One order."],
    ["Single or parlay", "B, then A if B wins", "The other order. The stake up front is two units."],
  ]],
  ["Hedge", "You already hold a side. The second ticket changes what the night can cost.", [
    ["Single or parlay", "The ticket you hold", "The one already down."],
    ["Single or parlay", "The other side", "Size it so both results leave the number you want to keep. Skip it when that number is worse than letting the ticket ride."],
  ]],
  ["Parlay hedge", "Four of five legs have hit. The last game has not started.", [
    ["Parlay", "The live parlay", "What it pays if the last leg hits."],
    ["Single", "The other side of the last leg", "A plus-money last leg is cheap to hedge. A -300 last leg is expensive."],
  ]],
  ["Future hedge", "The longshot you held in March is a short price in the final.", [
    ["Single", "The future", "The ticket from the spring."],
    ["Single", "The other side, now", "Sized to lock a profit on the season."],
  ]],
  ["Cash-out", "The book offers to buy the ticket back. Their number is a hedge with their juice still in it.", [
    ["Single or parlay", "The ticket", "What you hold."],
    ["Single", "The buyback", "Take it when you would have bet the other side at that price. Leave it when a live hedge you type yourself is a better number."],
  ]],
  ["Flat stake", "The same dollars on every ticket. A $500 bankroll is a $5 or $10 bet, after a win and after a loss.", [
    ["Single or parlay", "Tonight's ticket", "One or two percent. A +400 and a -150 get the same dollars."],
  ]],
  ["Kelly", "The stake is the edge divided by the payout odds, as a fraction of the bankroll.", [
    ["Single or parlay", "The side you have an edge on", "A 55 percent side at even money is a 10 percent stake at full Kelly. Half Kelly is 5 percent. Full Kelly assumes the 55 is real."],
  ]],
  ["Martingale", "Double after a loss. The first win gets back the losses and one unit. A long streak asks for a stake the book will not take.", [
    ["Single or parlay", "The next ticket", "A $5 start is $5, then $10, then $20. Ten losses asks for $5,120. The streak does not owe you a win."],
  ]],
  ["Paroli", "Press only after a win. Three wins, then go back to one unit. A loss goes back to one unit.", [
    ["Single or parlay", "The series", "One unit, then two, then four. The most in action is the profit from the series plus the opening unit."],
  ]],
  ["1-3-2-6", "Four steps, and only after a win. Two wins lock a profit even if the third loses.", [
    ["Single or parlay", "The series", "1, then 3, then 2, then 6. Any loss returns to 1. Stop after the fourth win."],
  ]],
  ["Fibonacci", "After a loss, the next stake is the last two stakes added. After a win, step back two.", [
    ["Single or parlay", "The series", "1, 1, 2, 3, 5, 8. It climbs slower than a double. A long run still reaches a stake the bankroll cannot cover."],
  ]],
  ["Oscar's grind", "The series ends when you are up one unit. Raise by one unit after a win, and only when that raise still fits inside the one-unit gain.", [
    ["Single or parlay", "The series", "A loss repeats the same stake. A finished series is one unit. Then it starts over."],
  ]],
  ["Correlated stack", "Two tickets that rise together are one opinion. The multiplied price treats them as different games.", [
    ["Single or parlay", "The first ticket", "A quarterback's passing yards, or a team total."],
    ["Single or parlay", "The ticket that moves with it", "His receiver's yards, or that team's anytime scorer. The book's same-game price already knows they move together."],
  ]],
  ["Side and the total", "A big favorite and the under can be the same script. A dog and the over can be the other one.", [
    ["Single or parlay", "The side", "The favorite who can pull away, or the dog who keeps it close."],
    ["Single or parlay", "The total", "The under that gets help from a lead, or the over that needs the game to stay live."],
  ]],
  ["Player and the total", "Check the script before you stack them. Two tickets that need different games are a hedge you did not mean to make.", [
    ["Single or parlay", "The player", "A pass-catcher's over needs points. A back's rushing over often needs a lead."],
    ["Single or parlay", "The total or the side", "The game script that gives him those plays."],
  ]],
  ["First touchdown and anytime", "If he scores first, both cash. If he scores later, the anytime has to cover the first-touchdown stake.", [
    ["Single", "Anytime", "The bottom rung. Keep it big enough to pay for the other ticket when he scores later."],
    ["Single", "First touchdown", "The expensive rung. A smaller stake than the anytime."],
  ]],
];

const STACK_RANK = {
  "Low-hold shopping": [1, "Take -105 instead of -115. That price needs 51.2%. The other needs 53.5%. It applies to every bet."],
  "Arbitrage": [2, "The two prices together pay more than the stake. It dies if one book refuses the bet."],
  "Wong teaser": [3, "Crosses 3 and 7 on both legs. A normal teaser does not."],
  "Key-number middle": [4, "The window is a finish of 3 or 7. That is where NFL games land."],
  "Buying the hook": [5, "Pay the juice only to cross 3 or 7. Sell the hook on 4, 5, 6, 8, and 9."],
  "Live middle": [6, "Take the other side only after the gap is wider than the juice."],
  "Correlated stack": [7, "The card multiplies them as two games. They are one script. The same-game price is the one that knows that."],
  "Kelly": [8, "A 55% side at even money is 5% of the bankroll at half Kelly, not 10. Full Kelly treats a guessed edge as real."],
  "Flat stake": [9, "$5 stays $5. The record is then the prices, not a bigger bet after a win."],
  "Classic middle": [10, "Both win only inside the gap. The ordinary night loses the juice. Take it when that loss is a few cents and the gap is wide."],
  "Prop ladder": [11, "The bottom rung is a cushion only when its profit covers the tickets above it. Otherwise a safe finish is still a loss."],
  "Overlapping under": [12, "The higher under has to pay for the tighter one when he lands in the gap. Same test as the ladder."],
  "Side and the total": [13, "A favorite and the under are one script. A dog and the under need two different games."],
  "Player and the total": [14, "A receiver over and the game over need points. A back over and a blowout need a lead. Opposite scripts are a hedge you did not plan."],
  "First touchdown and anytime": [15, "The anytime has to pay for the first-touchdown ticket when he scores later. The first-touchdown price is usually the fat one."],
  "Parlay hedge": [16, "Hedge a last leg at plus money. A -300 last leg sells the ticket cheap."],
  "Hedge": [17, "Locks a number you want to keep, and gives up the rest of the ticket."],
  "Future hedge": [18, "The same lock, on a ticket you have held all season."],
  "If-bet": [19, "You risk the first ticket only. The price is the same price."],
  "Paroli": [20, "A loss costs one unit. Three wins, then stop. The price is unchanged."],
  "1-3-2-6": [21, "Two wins lock a profit even if the third loses. The price is unchanged."],
  "Dutching": [22, "Every winner pays the same. The set has to be priced under 100%. One book is usually over that."],
  "Reverse": [23, "Both openers are live, so you risk two units. One if-bet risks one."],
  "Teaser": [24, "A 6-point teaser that does not cross 3 and 7 gives the juice back."],
  "Round robin": [25, "Three pairs means three juices. One miss still kills two of the three tickets."],
  "Oscar's grind": [26, "The series wants one unit. A long losing run is a pile of units you win back one at a time."],
  "Fibonacci": [27, "1, 1, 2, 3, 5, 8. Slower than doubling. It still climbs until the bankroll stops."],
  "Pleaser": [28, "You sell 3 and 7 for a longer price. Those are the margins that hit."],
  "Cash-out": [29, "The book buys the ticket at their number. A hedge you type yourself is the better price."],
  "Martingale": [30, "$5 becomes $5,120 after ten losses. The book stops the bet before that win arrives."],
};

function paintStack() {
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
  board.className = "rec-board";
  board.dataset.page = "stack";
  const title = document.createElement("h2");
  title.textContent = "Parlay strategies.";
  board.append(title);
  const filters = document.createElement("div");
  filters.className = "rec-filters"; if (window.stackOpen) filters.classList.add("open");
  window.stackWhen = window.stackWhen || "today";
  window.stackLeagues = window.stackLeagues || [];
  window.stackGames = window.stackGames || [];
  window.stackTeams = window.stackTeams || [];
  window.stackPlayers = window.stackPlayers || [];
  filters.innerHTML = `<div class="rec-head"><span class="rec-tools"><button type="button" class="rec-fold" data-stack-fold>Filters</button><button type="button" class="stack-fit-go">With a bet <span class="n"></span></button></span><span class="rec-sort"><span class="name">Sort</span><button type="button" data-stack-sort="rank">Rank</button><button type="button" data-stack-sort="st">ST number</button><button type="button" data-stack-sort="bets">Bets</button></span></div><div class="row stack-when"><span class="name">When</span><button type="button" data-stack-when="today">Today <span class="n"></span></button><button type="button" data-stack-when="week">This week <span class="n"></span></button></div><div class="row stack-league" hidden><span class="name">League</span></div><div class="row stack-game" hidden><span class="name">Game</span></div><div class="row stack-team" hidden><span class="name">Team</span></div><div class="row stack-player" hidden><span class="name">Player</span></div><div class="row"><button type="button" class="stack-beat-go">Beats the price <span class="n"></span></button></div><p class="stack-none quiet" hidden>None of the current FanDuel prices fit a stack.</p>`;
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    event.stopPropagation(); if (button.dataset.stackFold != null) { window.stackOpen = !window.stackOpen; filters.classList.toggle("open", window.stackOpen); return; }
    if (button.classList.contains("stack-fit-go")) window.stackFit = !window.stackFit;
    else if (button.classList.contains("stack-beat-go")) { window.stackBeats = !window.stackBeats; if (window.stackBeats) window.stackFit = true; }
    else if (button.dataset.stackSort) window.stackSort = button.dataset.stackSort; else if (button.dataset.stackWhen) window.stackWhen = button.dataset.stackWhen;
    else if (button.dataset.stackLeague != null) { const name = button.dataset.stackLeague; window.stackLeagues = !name ? [] : window.stackLeagues.includes(name) ? window.stackLeagues.filter((item) => item !== name) : window.stackLeagues.concat(name); }
    else if (button.dataset.stackGame != null) { const name = button.dataset.stackGame; window.stackGames = !name ? [] : window.stackGames.includes(name) ? window.stackGames.filter((item) => item !== name) : window.stackGames.concat(name); }
    else if (button.dataset.stackTeam != null) window.stackTeams = stackFlip(window.stackTeams, button.dataset.stackTeam);
    else if (button.dataset.stackPlayer != null) window.stackPlayers = stackFlip(window.stackPlayers, button.dataset.stackPlayer);
    if (button.dataset.stackLeague || button.dataset.stackGame || button.dataset.stackTeam || button.dataset.stackPlayer) window.stackFit = true;
    applyStackFit(board);
  });
  board.append(filters);
  STACKS.map((row, index) => ({ row, no: index + 1, rank: STACK_RANK[row[0]] || [99, ""] })).sort((a, b) => a.rank[0] - b.rank[0]).forEach(({ row, no, rank }) => {
    const [name, windowText, bets] = row;
    const block = document.createElement("section");
    block.className = "rec-strategy";
    block.dataset.card = `stack${no}`;
    block.dataset.name = name;
    const heading = document.createElement("h3");
    heading.innerHTML = `<span class="rec-no">${rank[0]}</span> ST-${String(no).padStart(2, "0")} ${esc(name)} <span class="rec-count">${bets.length} bet${bets.length === 1 ? "" : "s"} in the stack</span><span class="stack-fit-count"></span>`;
    block.append(heading);
    const history = document.createElement("p");
    history.className = "rec-history";
    history.innerHTML = `<span>${esc(windowText)}</span><i class="rec-pay">${esc(rank[1])}</i>`;
    block.append(history); if (window.stackMore) stackMore(history, name); if (window.stackGrade) stackGrade(block, name);
    bets.forEach(([kind, rung, job]) => {
      const bet = document.createElement("div");
      bet.className = "rec-bet";
      const head = document.createElement("b");
      head.innerHTML = `<i class="px">${esc(kind)}</i> <i class="pct">${esc(rung)}</i>`;
      const gist = document.createElement("p");
      gist.className = "rec-gist";
      gist.innerHTML = `<i class="prop">${esc(job)}</i>`;
      bet.append(head, gist);
      block.append(bet);
    });
    board.append(block);
  });
  board.addEventListener("click", (event) => {
    if (event.target.closest(".rec-bet, .stack-set")) return;
    const strategy = event.target.closest(".rec-strategy");
    if (strategy) strategy.classList.toggle("open");
  });
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  const wait = document.createElement("div");
  wait.className = "bet-load";
  wait.innerHTML = `<span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>Finding the stacks.</p>`;
  board.append(wait);
  row.append(board);
  row.scrollTop = 0;
  applyStackFit(board);
  fillStacks(board);
}

function stackKeep(set, when, leagues, games = [], teams = [], players = []) {
  if (window.stackBeats && set.dataset.beats !== "1") return false;
  if (when === "today" && set.dataset.span !== "today") return false;
  if (when === "week" && set.dataset.span === "later") return false;
  const sports = String(set.dataset.sport || "").split("|").filter(Boolean);
  const matches = String(set.dataset.games || "").split("|").filter(Boolean);
  if (games.length && !(matches.length && matches.every((match) => games.includes(match)))) return false;
  if (teams.length || players.length) {
    const who = stackWho(set);
    if (players.length && !(who.length && who.every((name) => players.includes(name)))) return false;
    if (teams.length && !(who.length ? who.every((name) => teams.includes(stackTeamOf.get(name))) : matches.length && matches.every((match) => match.split(" @ ").some((side) => teams.includes(side))))) return false;
  }
  return !leagues.length || (sports.length && sports.every((sport) => leagues.includes(sport)));
}

function stackChips(board) {
  const sets = [...board.querySelectorAll(".rec-strategy > .stack-set")];
  const when = window.stackWhen || "today";
  const leagues = window.stackLeagues || [];
  const bets = (rows) => rows.reduce((sum, set) => sum + Number(set.dataset.n || 0), 0);
  const paintWhen = () => board.querySelectorAll("[data-stack-when]").forEach((button) => {
    button.classList.toggle("on", button.dataset.stackWhen === when);
    const n = bets(sets.filter((set) => stackKeep(set, button.dataset.stackWhen, window.stackLeagues || [], window.stackGames || [], window.stackTeams || [], window.stackPlayers || [])));
    button.querySelector(".n").textContent = sets.length ? String(n) : "";
  });
  paintWhen();
  const row = board.querySelector(".stack-league");
  if (!row || !sets.length) return;
  const names = [...new Set(sets.flatMap((set) => String(set.dataset.sport || "").split("|")).filter(Boolean))].sort();
  window.stackLeagues = leagues.filter((name) => names.includes(name));
  row.hidden = names.length < 2; row.style.display = row.hidden ? "none" : "";
  row.querySelectorAll("button").forEach((node) => node.remove());
  [["", "All leagues"]].concat(names.map((name) => [name, name])).forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.stackLeague = value;
    const n = bets(sets.filter((set) => stackKeep(set, when, value ? [value] : [])));
    button.innerHTML = `${esc(label)} <span class="n">${n}</span>`;
    button.classList.toggle("on", value ? window.stackLeagues.includes(value) : !window.stackLeagues.length);
    row.append(button);
  });
  const gameRow = board.querySelector(".stack-game");
  if (!gameRow) return;
  const order = (((window.state && state.board && state.board.games) || [])).slice().sort((a, b) => Date.parse(a.kickoff || "") - Date.parse(b.kickoff || "")).map((game) => game.match);
  const open = sets.filter((set) => stackKeep(set, when, window.stackLeagues));
  const matches = [...new Set(open.flatMap((set) => String(set.dataset.games || "").split("|")).filter(Boolean))].sort((a, b) => ((order.indexOf(a) + 1) || 1e9) - ((order.indexOf(b) + 1) || 1e9) || a.localeCompare(b));
  window.stackGames = (window.stackGames || []).filter((name) => matches.includes(name));
  gameRow.hidden = matches.length < 2; gameRow.style.display = gameRow.hidden ? "none" : "";
  gameRow.querySelectorAll("button").forEach((node) => node.remove());
  [["", "All games"]].concat(matches.map((name) => [name, name])).forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.stackGame = value;
    button.innerHTML = `${esc(label)} <span class="n">${bets(open.filter((set) => stackKeep(set, when, [], value ? [value] : [])))}</span>`;
    button.classList.toggle("on", value ? window.stackGames.includes(value) : !window.stackGames.length);
    gameRow.append(button);
  });
  const teamRow = board.querySelector(".stack-team"), playerRow = board.querySelector(".stack-player");
  if (teamRow && playerRow) {
    const inGames = open.filter((set) => stackKeep(set, when, [], window.stackGames));
    const sides = [...new Set((window.stackGames.length ? window.stackGames : matches).flatMap((match) => match.split(" @ ")))];
    window.stackTeams = (window.stackTeams || []).filter((name) => sides.includes(name));
    stackRosters(board, sides);
    teamRow.hidden = sides.length < 2; teamRow.style.display = teamRow.hidden ? "none" : "";
    stackRow(teamRow, "stackTeam", "All teams", sides, window.stackTeams, (value) => !value ? bets(inGames) : stackAsked.get(value) === "done" ? bets(inGames.filter((set) => stackKeep(set, when, [], [], [value]))) : "");
    const picked = window.stackTeams.length ? window.stackTeams : window.stackGames.length ? sides : [];
    const inTeams = inGames.filter((set) => stackKeep(set, when, [], [], window.stackTeams));
    const names = picked.length ? [...new Set(inTeams.flatMap(stackWho))].filter((name) => picked.includes(stackTeamOf.get(name))).sort() : [];
    if (names.length || !picked.length) window.stackPlayers = (window.stackPlayers || []).filter((name) => names.includes(name));
    playerRow.hidden = !names.length; playerRow.style.display = playerRow.hidden ? "none" : "";
    stackRow(playerRow, "stackPlayer", "All players", names, window.stackPlayers, (value) => bets(inTeams.filter((set) => !value || stackKeep(set, when, [], [], [], [value]))));
  }
  paintWhen();
}

function stackFlip(list, name) { return !name ? [] : list.includes(name) ? list.filter((item) => item !== name) : list.concat(name); }

function stackRow(row, key, all, names, on, count) {
  row.querySelectorAll("button").forEach((node) => node.remove());
  [["", all]].concat(names.map((name) => [name, name])).forEach(([value, label]) => { const button = document.createElement("button"); button.type = "button"; button.dataset[key] = value; button.innerHTML = `${esc(label)} <span class="n">${count(value)}</span>`; button.classList.toggle("on", value ? on.includes(value) : !on.length); row.append(button); });
}

const stackRoster = new Map(), stackTeamOf = new Map(), stackAsked = new Map();
function stackNorm(text) { return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim(); }

function stackWho(set) {
  if (set.whoAt === stackRoster.size) return set.who;
  set.whoAt = stackRoster.size;
  set.who = [...new Set(String(set.dataset.labels || "").split("|").map((label) => { const words = stackNorm(label).split(" "); for (let n = 4; n >= 2; n -= 1) { const name = stackRoster.get(words.slice(0, n).join(" ")); if (name) return name; } return ""; }).filter(Boolean))];
  return set.who;
}

function stackRosters(board, sides) {
  const games = (window.state && state.board && state.board.games) || [];
  sides.filter((side) => !stackAsked.has(side)).forEach((side) => {
    stackAsked.set(side, "wait");
    const game = games.find((row) => String(row.match || "").split(" @ ").includes(side));
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: side, sport: (game && game.sport) || "" }) }).then((res) => res.json()).then((data) => {
      (data.players || []).forEach((row) => { const name = String((row && row.name) || row || "").trim(); const key = stackNorm(name); if (!key || stackTeamOf.has(name)) return; stackTeamOf.set(name, side); stackRoster.set(key, name); stackRoster.set(key.replace(/ (jr|sr|ii|iii|iv)$/, ""), name); });
    }).catch(() => {}).finally(() => { stackAsked.set(side, "done"); clearTimeout(stackRosters.wait); stackRosters.wait = setTimeout(() => { if (board.isConnected) applyStackFit(board); }, 250); });
  });
}

function applyStackFit(board) {
  const on = !!window.stackFit;
  const button = board.querySelector(".stack-fit-go");
  if (button) button.classList.toggle("on", on);
  stackChips(board);
  const when = window.stackWhen || "today";
  const leagues = window.stackLeagues || [];
  const games = window.stackGames || [], teams = window.stackTeams || [], players = window.stackPlayers || [];
  const gameSports = (((window.state && state.board && state.board.games) || [])).filter((game) => games.includes(game.match) || String(game.match || "").split(" @ ").some((side) => teams.includes(side))).map((game) => game.sport);
  let live = 0, beat = 0;
  let waiting = false;
  board.querySelectorAll(".rec-strategy").forEach((block) => {
    if (!block.dataset.fit) waiting = true;
    if (block.dataset.fit && block.dataset.fit !== "note") {
      const sets = [...block.querySelectorAll(":scope > .stack-set")];
      let shown = 0;
      sets.forEach((set) => { set.hidden = !stackKeep(set, when, leagues, games, teams, players); set.style.display = set.hidden ? "none" : ""; if (!set.hidden) shown += Number(set.dataset.n || 0); if (!set.hidden && set.dataset.beats === "1") beat += 1; });
      block.dataset.fit = shown ? "1" : "0"; block.dataset.shown = String(shown);
      const fit = block.querySelector(".stack-fit-count");
      if (fit) fit.textContent = shown === 1 ? "1 bet fulfills it" : `${shown} bets fulfill it`;
      const empty = block.querySelector(".stack-empty");
      if (empty) empty.style.display = shown ? "none" : "";
    }
    if (block.dataset.fit === "1") live += 1;
    const nflOnly = ["Key-number middle", "Teaser", "Wong teaser", "Pleaser", "Buying the hook", "First touchdown and anytime", "Same-game yardage parlay", "Yardage and the spread", "Two touchdowns, one game", "Three touchdowns, one game", "Four touchdowns, one game", "Five touchdowns, one game", "Catches, yards, and a touchdown"].includes(block.dataset.name) || /^(Yardage|Receptions) parlay, /.test(block.dataset.name);
    block.hidden = (on && block.dataset.fit !== "1") || (nflOnly && ((leagues.length > 0 && !leagues.includes("NFL")) || ((games.length > 0 || teams.length > 0) && !gameSports.includes("NFL"))));
    block.style.display = block.hidden ? "none" : "";
  });
  const count = button && button.querySelector(".n");
  if (count) count.textContent = live ? String(live) : "";
  const beats = board.querySelector(".stack-beat-go");
  if (beats) { beats.classList.toggle("on", !!window.stackBeats); beats.querySelector(".n").textContent = waiting ? "" : String(beat); }
  const empty = board.querySelector(".stack-none");
  if (empty) empty.hidden = !(on && !waiting && !live);
  board.classList.toggle("stack-fit", on); if (window.stackOrder) stackOrder(board); if (window.trayStackOnly) trayStackOnly(board);
}

function stackName(stack) {
  const first = String((stack.bets && stack.bets[0] && stack.bets[0].label) || "");
  const core = first.replace(/\s+\d+(?:\.\d+)?\+(?:\s+|$)/, " ").replace(/\s+/g, " ").trim();
  const game = stack.game || "";
  if (!core) return game;
  if (!game || core.toLowerCase().includes(game.toLowerCase())) return core;
  return `${game}. ${core}`;
}

function stackMoney(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : String(n);
}

function stackLeg(bet) {
  const node = document.createElement("div");
  node.className = "rec-bet stack-leg";
  const chance = typeof findPct === "function" ? findPct(bet.odds) : "";
  const seen = bet.games ? `<i class="seen${bet.hits / bet.games > parseFloat(chance) / 100 ? " up" : ""}">${bet.hits} of last ${bet.games}</i>` : "";
  node.innerHTML = `<b><i class="prop">${esc(bet.label || "")}</i><i class="odds">${esc(stackMoney(bet.odds))}</i>${chance ? `<i class="chance">${esc(chance)}</i>` : ""}${seen}</b><p class="rec-gist"><i class="pct">${esc([bet.kind || "Single", bet.rung].filter(Boolean).join(", "))}</i> ${esc(bet.job || "")}</p>`;
  return node;
}

function stackLegs(stack) { const bets = (stack.bets || []).slice(); return bets.some((bet) => /^bottom rung$/i.test(bet.rung || "")) ? bets.reverse() : bets; }

function stackRead(set, stack) { if (window.stackTicket) stackTicket(set, stack); if (stack.read) set.insertAdjacentHTML("beforeend", `<p class="stack-read${stack.beats ? " up" : ""}">${esc(stack.read)}</p>`); }

function recDay(ms) { return (recDay.fmt || (recDay.fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }))).format(ms); }

function stackNote(block, text) {
  const bet = document.createElement("div");
  bet.className = "rec-bet";
  const gist = document.createElement("p");
  gist.className = "rec-gist";
  gist.innerHTML = `<i class="prop">${esc(text)}</i>`;
  bet.append(gist);
  block.append(bet);
}

function fillStacks(board) {
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "stack" }) })
    .then((res) => res.json())
    .then((data) => {
      const wait = board.querySelector(".bet-load");
      if (wait) wait.remove();
      if (!board.isConnected || !data) return; if (data.error && window.state && state.admin) board.insertAdjacentHTML("afterbegin", `<p class="quiet" style="color: #ff8a8a">${esc(data.error)}</p>`);
      const games = new Map((((window.state && state.board && state.board.games) || [])).map((game) => [game.match, game]));
      const today = recDay(Date.now());
      const end = recDay(Date.now() + 7 * 86400000);
      board.querySelectorAll(".rec-strategy").forEach((block) => {
        const name = block.dataset.name;
        const note = data.notes && data.notes[name];
        const stacks = (data.found && data.found[name]) || [];
        if (note) { block.dataset.fit = "note"; const fit = block.querySelector(".stack-fit-count"); if (fit) fit.textContent = "0 bets fulfill it"; stackNote(block, note); return; }
        block.dataset.fit = "0";
        stackNote(block, "None of the current FanDuel prices fit this shape.");
        block.lastElementChild.classList.add("stack-empty");
        stacks.forEach((stack) => {
          const set = document.createElement("div");
          set.className = "stack-set";
          const hit = [...new Set([stack.game].concat((stack.bets || []).map((bet) => bet.game)))].map((match) => games.get(match)).filter(Boolean);
          const days = [...new Set(hit.map((game) => Date.parse(game.kickoff || "")).filter((ms) => Number.isFinite(ms)).map(recDay))];
          set.dataset.sport = [...new Set(hit.map((game) => String(game.sport || "")).filter(Boolean))].join("|");
          set.dataset.games = hit.map((game) => game.match).join("|");
          set.dataset.labels = (stack.bets || []).map((bet) => String(bet.label || "").replace(/\|/g, " ")).join("|");
          set.dataset.span = !days.length ? "week" : days.every((day) => day === today) ? "today" : days.every((day) => day <= end) ? "week" : "later";
          set.dataset.n = String((stack.bets || []).length);
          set.dataset.beats = stack.beats ? "1" : "0";
          const name = document.createElement("p");
          name.className = "stack-set-name";
          name.textContent = stackName(stack);
          set.append(name);
          stackRead(set, stack);
          stackLegs(stack).forEach((bet) => set.append(stackLeg(bet)));
          block.append(set); if (window.stackLabel) stackLabel(set);
        });
      });
      applyStackFit(board); if (window.closeCalls) closeCalls(board, data.near || {});
    })
    .catch(() => { const wait = board.querySelector(".bet-load"); if (wait) wait.remove(); });
}

window.STACK_BUILD = ["Prop ladder", "Overlapping under", "Classic middle", "Key-number middle", "Buying the hook", "Dutching", "Round robin", "Correlated stack", "Side and the total", "Player and the total", "First touchdown and anytime"];

async function showStackBuild() {
  const box = document.getElementById("choice-result");
  const chooser = document.getElementById("chooser");
  if (chooser) chooser.classList.add("built");
  const again = document.getElementById("choice-again");
  if (again) again.hidden = true;
  if (!box) return;
  const name = (window.choice && choice.stack) || "A stack";
  box.innerHTML = `<div class="bet-load"><span class="bet-bird"><img src="/scene/parrot-head.png?v=4" alt=""></span><p>Finding the stack.</p></div>`;
  try {
    const response = await fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "stack" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "FanDuel did not answer.");
    if (!box.isConnected) return;
    const note = data.notes && data.notes[name];
    const stacks = (data.found && data.found[name]) || [];
    box.innerHTML = `<h2>${esc(name)}</h2>`;
    if (note) { box.insertAdjacentHTML("beforeend", `<p class="quiet">${esc(note)}</p>`); return; }
    if (!stacks.length) { box.insertAdjacentHTML("beforeend", `<p class="quiet">None of the current FanDuel prices fit this shape.</p>`); return; }
    stacks.forEach((stack) => {
      const set = document.createElement("div");
      set.className = "stack-set";
      const title = document.createElement("p");
      title.className = "stack-set-name";
      title.textContent = stackName(stack);
      set.append(title);
      stackRead(set, stack);
      stackLegs(stack).forEach((bet) => set.append(stackLeg(bet)));
      box.append(set);
    });
  } catch (error) {
    if (box.isConnected) box.textContent = error.message;
  }
}

window.paintStack = paintStack;
window.showStackBuild = showStackBuild;
