/** Parlays tab: 2 to 5 leg tickets built from the recommended picks, rated on the edge scale. */

let recParlaySize = 0;
let recParlayMade = { key: "", rows: [], best: null };

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

function recParlayEdge(gap) {
  if (typeof metalEdge === "function") return metalEdge(gap);
  if (!Number.isFinite(gap) || gap < 0.5) return null;
  return Math.max(1, Math.min(10, Math.round(gap)));
}

function recParlayPlace(score) {
  if (!score) return "out";
  if (typeof metalEdgeId === "function") return metalEdgeId(score);
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

function recParlayPool(board) {
  if (typeof startRecPool !== "function") return [];
  const pool = startRecPool(typeof leftGames === "function" ? leftGames() : []);
  return (pool.picks || []).map((pick) => {
    const hits = Number(pick.hits), n = Number(pick.n), book = recParlayChance(pick.odds);
    if (!(n >= 5) || !Number.isFinite(hits) || book == null) return null;
    const rate = hits / n;
    const gap = (rate - book) * 100;
    if (!(gap > 0)) return null;
    return { pick, rate, book, gap, who: recParlayWho(pick) };
  }).filter(Boolean).sort((a, b) => b.gap - a.gap).slice(0, 14);
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
  const score = recParlayEdge(gap);
  if (!score) return { price, need, ours, gap, score: null, place: "out", legs };
  return { price, need, ours, gap, score, place: recParlayPlace(score), legs };
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

function recParlayWalk(pool, n, take) {
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
  return { rows: out.slice(0, take), best };
}

function recParlayRanked(board) {
  const pool = recParlayPool(board);
  const key = pool.map((leg) => `${leg.pick.label}|${leg.pick.odds}|${leg.pick.hits}`).join("~");
  if (recParlayMade.key === key) return recParlayMade;
  let rows = [];
  let best = null;
  [2, 3, 4, 5].forEach((n) => {
    if (pool.length < n) return;
    const found = recParlayWalk(pool, n, 8);
    rows = rows.concat(found.rows);
    if (found.best && (!best || found.best.gap > best.gap)) best = found.best;
  });
  rows.sort((a, b) => b.gap - a.gap || a.legs.length - b.legs.length);
  const spots = ["golden", "silver", "bronze"];
  rows.forEach((row, at) => { row.place = spots[at] || "edge"; });
  if (rows.length > 24) rows = rows.slice(0, 24);
  recParlayMade = { key, rows, best, pool };
  return recParlayMade;
}

function recParlayBuild(board) {
  const made = recParlayRanked(board);
  const rows = recParlaySize ? made.rows.filter((row) => row.legs.length === recParlaySize) : made.rows;
  return { ...made, rows };
}

function recParlayCount(board) {
  return recParlayBuild(board).rows.length;
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
  const price = row.price > 0 ? `+${row.price}` : String(row.price);
  const need = `${(row.need * 100).toFixed(1)}%`;
  const ours = `${(row.ours * 100).toFixed(1)}%`;
  const cash = typeof findCash === "function" ? findCash(row.price) : "";
  const games = row.legs.map((leg) => String(leg.pick.match || ""));
  const same = games.every(Boolean) && new Set(games).size === 1;
  const head = document.createElement("p");
  head.className = "rec-parlay-head";
  const name = recParlayName(row.place);
  head.innerHTML = `<i class="rec-parlay-mark m-${row.place}">Edge ${row.score}</i>${name ? `<b>${name}</b>` : ""}<span>${row.legs.length} legs</span>`;
  const pay = document.createElement("p");
  pay.className = "rec-parlay-pay";
  pay.innerHTML = `<i class="px">${price}</i><i class="pct">${need}</i>${cash ? `<i class="pay">$5 profits ${cash}</i>` : ""}<i class="hit">We have it at ${ours}</i>`;
  const why = document.createElement("p");
  why.className = "rec-parlay-why";
  why.textContent = `${same ? "Same game. " : ""}${row.gap.toFixed(1)} points over FanDuel's ${need}.`;
  const list = document.createElement("ul");
  list.className = "rec-parlay-legs";
  row.legs.forEach((leg) => {
    const item = document.createElement("li");
    const shown = Number(leg.pick.odds) > 0 ? `+${leg.pick.odds}` : String(leg.pick.odds);
    const title = typeof homeRecTitle === "function" ? homeRecTitle(leg.pick) : `${leg.who} ${leg.pick.text || leg.pick.label || ""}`;
    item.textContent = `${title} ${shown}, hit ${leg.pick.hits} of ${leg.pick.n}`;
    list.append(item);
  });
  const go = document.createElement("button");
  go.type = "button";
  go.className = "rec-parlay-bet";
  go.textContent = "Bet it";
  go.addEventListener("click", () => {
    if (document.body.classList.contains("needs-member")) {
      const join = document.getElementById("gate-join");
      if (join) join.click();
      return;
    }
    const legs = row.legs.map((leg) => (typeof startHit === "function" ? startHit(board, leg.pick) : null));
    if (legs.some((leg) => !leg) || typeof startRandomAdd !== "function") return;
    if (!startRandomAdd(board, legs, 5, true)) return;
    go.textContent = "Added to My Bets";
    go.disabled = true;
    go.classList.add("on");
  });
  card.append(head, pay, why, list, go);
  return card;
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
    button.addEventListener("click", () => { recParlaySize = n; if (typeof startPaint === "function") startPaint(1); });
    sizes.append(button);
  });
  const note = document.createElement("p");
  note.className = "rec-parlay-note";
  note.textContent = "Golden is the best parlay. Silver is second. Bronze is third.";
  box.append(sizes, note);
  const made = recParlayBuild(board);
  if (!made.pool.length) {
    box.append(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: "A parlay ticket needs two recommended picks that have hit more often than FanDuel's price." }));
    return [box];
  }
  if (!made.rows.length) {
    const miss = made.best;
    const say = !miss
      ? "None of these parlays clear a Bronze parlay."
      : miss.gap < 0
        ? `The best ${miss.legs.length}-leg sits ${Math.abs(miss.gap).toFixed(1)} points under FanDuel's ${(miss.need * 100).toFixed(1)}%. A Bronze parlay needs 1 point over.`
        : `The best ${miss.legs.length}-leg is ${miss.gap.toFixed(1)} points over FanDuel's ${(miss.need * 100).toFixed(1)}%. A Bronze parlay needs 1 point over.`;
    box.append(Object.assign(document.createElement("p"), { className: "desk-games-note", textContent: say }));
    return [box];
  }
  const list = document.createElement("div");
  list.className = "rec-parlay-list";
  made.rows.forEach((row) => list.append(recParlayCard(board, row)));
  box.append(list);
  return [box];
}
