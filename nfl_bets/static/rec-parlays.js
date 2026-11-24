/** Parlays tab: 2 to 5 leg tickets built from the recommended picks, rated on the edge scale. */

let recParlaySize = 0;
window.recParlayTeams = false;
let recParlayMade = { key: "", rows: [], best: null };
let recParlayBuilt = { key: "", value: null };
let recParlayStrats = [];

function recParlayRank(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function recParlayChance(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function recParlayEdge(gap, price, ours) {
  if (typeof metalEdge === "function") return metalEdge(gap, price, ours);
  if (!Number.isFinite(gap) || gap < 0.5) return null;
  return Math.max(1, Math.min(9, Math.round(gap)));
}

function recParlayPlace(score, price, ours) {
  if (!score) return "out";
  if (typeof metalEdgeId === "function") return metalEdgeId(score, price, ours);
  if (score >= 8) return "golden";
  if (score >= 5) return "silver";
  return "bronze";
}

function recParlayWho(pick) {
  const who = String(pick.who || "").trim();
  if (who) return who;
  const cut = String(pick.label || "").split(/\s+(?:\d|Over\b|Under\b|Any)/)[0].trim();
  return cut || "This pick";
}

function recParlayLegs(board) {
  if (typeof startRecPool !== "function") return [];
  const pool = startRecPool(typeof leftGames === "function" ? leftGames() : []);
  return (pool.picks || []).map((pick) => {
    const hits = Number(pick.hits), n = Number(pick.n), book = recParlayChance(pick.odds);
    if (!(n >= 5) || !Number.isFinite(hits) || book == null) return null;
    const rate = hits / n;
    const gap = (rate - book) * 100;
    if (!(gap > 0)) return null;
    return { pick, rate, book, gap, who: recParlayWho(pick) };
  }).filter(Boolean).sort((a, b) => b.gap - a.gap);
}

function recParlayPools(legs) {
  const byLeague = new Map();
  const byGame = new Map();
  legs.forEach((leg) => {
    const sport = typeof homePickSport === "function" ? homePickSport(leg.pick) : "";
    const match = String(leg.pick.match || "");
    if (!byLeague.has(sport)) byLeague.set(sport, []);
    byLeague.get(sport).push(leg);
    if (!byGame.has(match)) byGame.set(match, []);
    byGame.get(match).push(leg);
  });
  const pools = [];
  byGame.forEach((group) => { if (group.length >= 2) pools.push(group); });
  byLeague.forEach((group) => { if (group.length >= 2) pools.push(group); });
  return pools;
}

function recParlayPrice(legs) {
  const dec = legs.reduce((p, leg) => {
    const rank = recParlayRank(leg.pick.odds);
    return rank == null ? NaN : p * (1 + rank);
  }, 1);
  if (!Number.isFinite(dec) || dec <= 1) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function recParlayScore(legs) {
  const price = recParlayPrice(legs);
  const need = recParlayChance(price);
  if (need == null) return null;
  const ours = legs.reduce((p, leg) => p * leg.rate, 1);
  const gap = Math.round((ours - need) * 1000) / 10;
  const score = recParlayEdge(gap, price, ours);
  if (!score) return { price, need, ours, gap, score: null, place: "out", legs };
  return { price, need, ours, gap, score, place: recParlayPlace(score, price, ours), legs };
}

function recParlayOk(legs) {
  const seen = new Set();
  for (const leg of legs) {
    const id = `${leg.who}|${leg.pick.market || ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
  }
  if (typeof corrCheck === "function") {
    const hit = corrCheck(legs.map((leg) => leg.pick));
    if (hit && (hit.rate === "conflict" || hit.rate === "low")) return false;
  }
  return true;
}

function recParlayWalk(pool, n) {
  const out = [];
  let best = null;
  const chosen = [];
  const walk = (start) => {
    if (chosen.length === n) {
      if (!recParlayOk(chosen)) return;
      const row = recParlayScore(chosen.slice());
      if (!row) return;
      if (!best || row.gap > best.gap) best = row;
      if (row.score) out.push(row);
      return;
    }
    for (let i = start; i < pool.length; i += 1) {
      chosen.push(pool[i]);
      walk(i + 1);
      chosen.pop();
    }
  };
  walk(0);
  out.sort((a, b) => b.gap - a.gap);
  return { rows: out, best };
}

function recParlayGames() {
  const games = typeof leftGames === "function" ? leftGames() : [];
  const league = typeof homeLeagueOn === "function" ? homeLeagueOn(games) : "";
  return new Set(games.filter((game) => (!league || game.sport === league) && (typeof startGameOk !== "function" || startGameOk(game.match))).map((game) => game.match).filter(Boolean));
}

function recParlayRecorded(bet) {
  const label = String((bet && bet.label) || "");
  if (/\b(quarter|qtr|half|period|inning)\b/i.test(label)) return false;
  const n = Number(bet && bet.games);
  const hits = Number(bet && bet.hits);
  return n >= 5 && Number.isFinite(hits);
}

function recParlayStackRow(name, stack, tier) {
  const bets = stack.bets || [];
  if (bets.length < 2 || bets.length > 5) return null;
  const no = typeof STACKS === "undefined" ? 0 : STACKS.findIndex((row) => row[0] === name) + 1;
  const legs = bets.map((bet) => {
    const n = Number(bet.games);
    const hits = Number(bet.hits);
    const book = recParlayChance(bet.odds);
    const recorded = recParlayRecorded(bet);
    return {
      who: recParlayWho({ label: bet.label }),
      rate: recorded ? hits / n : (book == null ? 0 : book),
      pick: { label: bet.label, odds: bet.odds, market: bet.market || "", match: bet.game || stack.game || "", hits: recorded ? hits : null, n: recorded ? n : null, text: bet.label },
    };
  });
  const scored = tier === "pick" ? recParlayScore(legs) : null;
  if (tier === "pick" && !(scored && scored.score)) return null;
  const price = recParlayPrice(legs);
  const row = scored || { price, need: recParlayChance(price), ours: null, gap: 0, score: null, place: "known", legs };
  row.strategy = name;
  row.no = no;
  row.read = stack.read || "";
  row.known = tier === "edge";
  if (row.known) row.place = "known";
  return row;
}

function recParlayIsParlay(name) {
  const row = typeof STACKS === "undefined" ? null : STACKS.find((item) => item[0] === name);
  const tickets = row && row[2];
  if (!tickets || !tickets.length) return true;
  return tickets.some((ticket) => /parlay/i.test(ticket[0] || ""));
}

function recParlayStrategies(data) {
  const found = (data && data.found) || {};
  const rows = [];
  Object.entries(found).forEach(([name, stacks]) => {
    if (!recParlayIsParlay(name)) return;
    const grade = typeof STACK_GRADE === "undefined" ? null : STACK_GRADE[name];
    const tier = grade ? grade[0] : "";
    if (tier !== "edge" && tier !== "pick") return;
    const live = (stacks || []).filter((stack) => {
      const names = [stack.game, ...(stack.bets || []).map((bet) => bet.game)].filter(Boolean);
      if (typeof startFavOnly !== "undefined" && startFavOnly && typeof startFavGame === "function" && names.length && !names.some(startFavGame)) return false;
      return names.length && names.every((match) => recParlayLegOn({ pick: { match, kickoff: stack.kickoff || "" } }));
    });
    const fits = tier === "edge" ? live : live.filter((stack) => stack.beats);
    fits.map((stack) => recParlayStackRow(name, stack, tier)).filter(Boolean).forEach((row) => rows.push(row));
  });
  return rows;
}

function recParlayStamp(rows) {
  rows.sort((a, b) => (Number(b.gap) || 0) - (Number(a.gap) || 0) || (b.known === a.known ? 0 : b.known ? -1 : 1) || a.legs.length - b.legs.length);
  const spots = ["golden", "silver", "bronze"];
  let ticket = 0;
  rows.forEach((row) => {
    if (row.score) row.place = spots[ticket++] || "edge";
    else row.place = row.known ? "known" : "edge";
  });
  const known = rows.filter((row) => row.known && row.place === "known");
  const rest = rows.filter((row) => !known.includes(row));
  const tickets = rest.filter((row) => row.place === "golden" || row.place === "silver" || row.place === "bronze");
  const others = rest.filter((row) => !tickets.includes(row));
  return [...tickets, ...known, ...others];
}

function recParlayJoin(rows) {
  const keyOf = (row) => row.legs.map((leg) => String(leg.pick.label || "").toLowerCase()).sort().join("~");
  const merged = rows.slice();
  const have = new Map(merged.map((row) => [keyOf(row), row]));
  recParlayStrats.forEach((row) => {
    const prior = have.get(keyOf(row));
    if (prior) {
      prior.strategy = row.strategy;
      prior.no = row.no;
      prior.read = row.read;
      prior.known = row.known || prior.known;
      return;
    }
    have.set(keyOf(row), row);
    merged.push(row);
  });
  return recParlayStamp(merged);
}

function recParlayRanked(board) {
  const all = recParlayLegs(board);
  const key = all.map((leg) => `${leg.pick.label}|${leg.pick.odds}|${leg.pick.hits}|${leg.pick.match}`).join("~");
  if (recParlayMade.key !== key) {
    let raw = [];
    let best = null;
    const seen = new Set();
    recParlayPools(all).forEach((pool) => {
      const use = pool.length > 8 ? pool.slice(0, 8) : pool;
      [2, 3, 4, 5].forEach((n) => {
        if (use.length < n) return;
        const found = recParlayWalk(use, n);
        found.rows.slice(0, 3).forEach((row) => {
          const id = row.legs.map((leg) => String(leg.pick.label || "").toLowerCase()).sort().join("~");
          if (seen.has(id)) return;
          seen.add(id);
          raw.push(row);
        });
        if (found.best && (!best || found.best.gap > best.gap)) best = found.best;
      });
    });
    recParlayMade = { key, raw, best, pool: all };
  }
  return recParlayMade;
}

function recParlayTeamLeg(leg) {
  const pick = (leg && leg.pick) || {};
  const label = String(pick.label || pick.text || "");
  if (typeof stackLegKind === "function" && stackLegKind(label, pick.match || "") === "team") return true;
  return /\b(alt(?:ernate)?\s+total|team total|total pts|total points|moneyline|spread)\b/i.test(label);
}

function recParlayTeamRow(row) {
  const legs = (row && row.legs) || [];
  return legs.length > 0 && legs.every(recParlayTeamLeg);
}

function recParlayKick(pick) {
  const kick = Date.parse(pick && pick.kickoff || "");
  if (Number.isFinite(kick)) return kick;
  const match = String((pick && pick.match) || "");
  const lists = [typeof homeGamesList !== "undefined" ? homeGamesList : [], typeof startWeekGames !== "undefined" ? startWeekGames : [], (window.state && state.board && state.board.games) || []];
  const game = lists.flat().find((row) => row && row.match === match);
  return game ? Date.parse(game.kickoff || "") : NaN;
}

function recParlayLegOn(leg) {
  const pick = (leg && leg.pick) || {};
  const match = String(pick.match || "");
  if (!match) return false;
  const games = recParlayGames();
  if (games.has(match)) return true;
  const kick = recParlayKick(pick);
  if (!Number.isFinite(kick) || typeof whenBucket !== "function") return false;
  if (whenBucket(kick, match) !== (typeof startSpan === "string" ? startSpan : "next")) return false;
  const league = typeof homeLeague === "string" ? homeLeague : "";
  if (league && typeof homePickSport === "function") {
    const sport = homePickSport(pick);
    if (sport && sport !== league) return false;
  }
  return true;
}

function recParlayFit(row) {
  if (recParlaySize && (row.legs || []).length !== recParlaySize) return false;
  if (!window.recParlayTeams && recParlayTeamRow(row)) return false;
  return true;
}

function recParlayBuild(board) {
  const made = recParlayRanked(board);
  const games = typeof startPickGames !== "undefined" ? [...startPickGames].sort().join(",") : "";
  const key = `${made.key}|${(recParlayStrats || []).length}|${typeof startSpan === "string" ? startSpan : ""}|${typeof homeLeague === "string" ? homeLeague : ""}|${games}|${typeof startFavOnly !== "undefined" && startFavOnly ? 1 : 0}`;
  if (recParlayBuilt.key === key && recParlayBuilt.value) return recParlayBuilt.value;
  const rows = recParlayJoin(made.raw || []).filter((row) => (row.legs || []).every(recParlayLegOn));
  const value = { ...made, rows };
  recParlayBuilt = { key, value };
  return value;
}

function recParlayCount(board) {
  return recParlayDialCounts(recParlayBuild(board).rows.filter(recParlayFit)).all;
}

function recParlayName(place) {
  if (place === "golden") return "Golden parlay";
  if (place === "silver") return "Silver parlay";
  if (place === "bronze") return "Bronze parlay";
  return "";
}

function recParlayCard(board, row) {
  const card = document.createElement("article");
  card.className = `rec-parlay-card m-${row.place}`;
  card.dataset.legs = String((row.legs || []).length);
  card.dataset.team = recParlayTeamRow(row) ? "1" : "";
  card.dataset.place = row.place || "";
  if (row.place === "golden") card.dataset.recGolden = "1";
  if (row.place === "silver") card.dataset.recSilver = "1";
  if (row.place === "golden" || row.place === "silver" || row.place === "bronze") card.dataset.recMetal = "1";
  if (row.place === "known") card.dataset.recClose = "1";
  const price = Number.isFinite(row.price) ? (row.price > 0 ? `+${row.price}` : String(row.price)) : "";
  const need = `${(row.need * 100).toFixed(1)}%`;
  const ours = `${(row.ours * 100).toFixed(1)}%`;
  const cash = row.score && typeof findCash === "function" ? findCash(row.price) : "";
  const games = row.legs.map((leg) => String(leg.pick.match || ""));
  const named = [...new Set(games.filter(Boolean))];
  const same = games.every(Boolean) && named.length === 1;
  const game = named.length === 1 ? named[0] : (typeof gameShortList === "function" ? gameShortList(named.map((match) => ({ match }))) : named.join(", "));
  const head = document.createElement("p");
  head.className = "rec-parlay-head";
  const name = recParlayName(row.place);
  const strategy = row.strategy ? `${row.no ? `ST-${String(row.no).padStart(2, "0")} ` : ""}${row.strategy}` : "";
  head.innerHTML = `<i class="rec-parlay-mark m-${row.place}">${row.place === "known" ? "Known edge" : `Edge ${row.score}`}</i>${name ? `<b>${name}</b>` : ""}${strategy ? `<b>${strategy}</b>` : ""}<span>${row.legs.length} legs</span>`;
  if (game) head.append(Object.assign(document.createElement("b"), { textContent: game }));
  const pay = document.createElement("p");
  pay.className = "rec-parlay-pay";
  if (row.place !== "known") pay.innerHTML = `${price ? `<i class="px">${price}</i>` : ""}${row.score ? `<i class="pct">${need}</i>` : ""}${cash ? `<i class="pay">$5 profits ${cash}</i>` : ""}${row.score ? `<i class="hit">We have it at ${ours}</i>` : ""}`;
  const why = document.createElement("p");
  why.className = "rec-parlay-why";
  const knownSay = row.read || (typeof STACK_GRADE !== "undefined" && STACK_GRADE[row.strategy] && STACK_GRADE[row.strategy][1]) || "Known edge.";
  const where = game ? `${game}. ` : (same ? "Same game. " : "");
  why.textContent = row.place === "known" ? `${where}${knownSay}` : `${where}${Number(row.gap) ? `${row.gap.toFixed(1)} points over FanDuel's ${need}.` : ""}`;
  const list = document.createElement("ul");
  list.className = "rec-parlay-legs";
  row.legs.forEach((leg) => {
    const item = document.createElement("li");
    const shown = Number(leg.pick.odds) > 0 ? `+${leg.pick.odds}` : String(leg.pick.odds);
    const title = typeof homeRecTitle === "function" ? homeRecTitle(leg.pick) : `${leg.who} ${leg.pick.text || leg.pick.label || ""}`;
    item.textContent = Number(leg.pick.n) >= 5 ? `${title} ${shown}, hit ${leg.pick.hits} of ${leg.pick.n}` : `${title} ${shown}`;
    list.append(item);
  });
  const go = document.createElement("button");
  go.type = "button";
  go.className = "rec-parlay-bet";
  go.textContent = "Bet it";
  go.addEventListener("click", () => {
    if (go.classList.contains("on")) {
      if (typeof birdMenu === "function") birdMenu("manage");
      else if (typeof paintFind === "function") { window.saveGone = false; window.saveShut = false; paintFind(); }
      return;
    }
    if (document.body.classList.contains("needs-member")) {
      const join = document.getElementById("gate-join");
      if (join) join.click();
      return;
    }
    const legs = row.legs.map((leg) => recParlayHit(board, leg.pick));
    if (legs.some((leg) => !leg) || typeof startRandomAdd !== "function") return;
    if (!startRandomAdd(board, legs, 5, true)) return;
    go.textContent = "Added to My Bets";
    go.classList.add("on");
  });
  card.append(head, ...(pay.innerHTML ? [pay] : []), why, list, go);
  return card;
}

function recParlayHit(board, pick) {
  const hit = typeof startHit === "function" ? startHit(board, pick) : null;
  if (hit) return hit;
  const label = String(pick.label || "").toLowerCase();
  const match = String(pick.match || "");
  const person = (board.people || []).find((who) => (who.bets || []).some((bet) => String(bet.label || "").toLowerCase() === label && (!match || bet.match === match)));
  const bet = person && person.bets.find((row) => String(row.label || "").toLowerCase() === label && (!match || row.match === match));
  if (person && bet) return { person, bet };
  return { person: { key: label, name: recParlayWho(pick), bets: [] }, bet: { label: pick.label, odds: pick.odds, market: pick.market || "", match } };
}

function recParlayDialCounts(rows) {
  const golden = rows.filter((row) => row.place === "golden").length;
  const silver = rows.filter((row) => row.place === "silver").length;
  const metal = rows.filter((row) => row.place === "golden" || row.place === "silver" || row.place === "bronze").length;
  const close = rows.filter((row) => row.place === "known").length;
  return { golden, silver, metal, close, all: metal + close };
}

function recParlayTune(box) {
  if (!box) return;
  box.dataset.legs = String(recParlaySize || 0);
  box.dataset.teams = window.recParlayTeams ? "1" : "";
  const shown = [...box.querySelectorAll(".rec-parlay-card")].filter((card) => (!recParlaySize || card.dataset.legs === String(recParlaySize)) && (window.recParlayTeams || card.dataset.team !== "1"));
  const counts = recParlayDialCounts(shown.map((card) => ({ place: card.dataset.place })));
  const tab = document.querySelector(".desk-games-tab.on .desk-tab-n");
  if (tab && tab.parentElement && tab.parentElement.textContent.startsWith("Parlays")) tab.textContent = String(counts.all);
  if (typeof recDialCountPaint === "function") recDialCountPaint(counts);
  if (typeof startFilterRefresh === "function") startFilterRefresh();
  const empty = box.querySelector(":scope > .rec-parlay-empty");
  if (empty) empty.remove();
  if (!shown.length && !box.querySelector(":scope > .rec-dial-empty")) {
    const note = document.createElement("p");
    note.className = "desk-games-note rec-parlay-empty";
    note.textContent = recParlaySize ? `There are no ${recParlaySize}-leg recommended parlays.` : "No parlays at this leg count.";
    box.append(note);
  }
  if (typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 0, { quiet: true });
}

function recParlayPaint(board, box) {
  box.querySelectorAll(":scope > .rec-parlay-list, :scope > .desk-games-note:not(.rec-dial-empty), :scope > .rec-parlay-empty").forEach((node) => node.remove());
  const made = recParlayBuild(board);
  const shown = made.rows.filter(recParlayFit);
  box.dataset.legs = String(recParlaySize || 0);
  box.dataset.teams = window.recParlayTeams ? "1" : "";
  const counts = recParlayDialCounts(shown);
  if (typeof recDialCountPaint === "function") recDialCountPaint(counts);
  const tab = document.querySelector(".desk-games-tab.on .desk-tab-n");
  if (tab && tab.parentElement && tab.parentElement.textContent.startsWith("Parlays")) tab.textContent = String(counts.all);
  if (!made.rows.length) {
    const say = made.pool.length ? "None of these parlays clear a ticket, and no strategy on the board is a known edge or a good pick that beats the price." : "A parlay needs two recommended picks that beat FanDuel, or a strategy that is already a known edge.";
    box.append(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: say }));
    return;
  }
  const list = document.createElement("div");
  list.className = "rec-parlay-list";
  made.rows.filter((row) => row.place === "golden" || row.place === "silver" || row.place === "bronze" || row.place === "known").forEach((row) => list.append(recParlayCard(board, row)));
  box.append(list);
  const next = box.querySelector("button.rec-dial-next") || (typeof recDialNext === "function" ? recDialNext() : null);
  if (next) box.append(next);
  if (typeof recDialApply === "function") recDialApply(typeof recDial === "number" ? recDial : 2, { quiet: true });
}

function recParlayBody(board) {
  const box = document.createElement("div");
  box.className = "rec-parlay";
  const sizes = document.createElement("span");
  sizes.className = "find-start-random rec-parlay-sizes";
  sizes.append(Object.assign(document.createElement("i"), { textContent: "Legs" }));
  [[0, "All"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]].forEach(([n, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (recParlaySize === n) button.className = "on";
    button.addEventListener("click", () => {
      recParlaySize = n;
      sizes.querySelectorAll("button").forEach((node) => { if (node !== team) node.classList.toggle("on", node === button); });
      recParlayTune(box);
    });
    sizes.append(button);
  });
  const team = document.createElement("button");
  team.type = "button";
  team.textContent = "Team props";
  if (window.recParlayTeams) team.className = "on";
  team.addEventListener("click", () => {
    window.recParlayTeams = !window.recParlayTeams;
    team.classList.toggle("on", !!window.recParlayTeams);
    recParlayTune(box);
  });
  sizes.append(team);
  const note = document.createElement("p");
  note.className = "rec-parlay-note";
  note.textContent = "Golden is the best parlay. Silver is second. Bronze is third. A known-edge strategy is included. One that needs a good pick is included when the legs beat the price.";
  box.append(sizes, note);
  if (typeof recDialEmptyNote === "function") box.append(recDialEmptyNote());
  recParlayPaint(board, box);
  if (typeof gameStackData === "function") {
    gameStackData().then((data) => {
      if (!box.isConnected) return;
      recParlayStrats = recParlayStrategies(data);
      recParlayPaint(board, box);
    });
  }
  return [box];
}
