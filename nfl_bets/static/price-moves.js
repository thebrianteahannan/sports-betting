/** Price movement lives on the history page. A Moving tag opens that bet's chart. */

let priceMoveBag = null;
let priceMoveFocus = "";
let priceMoveTab = "deez";
let priceMoveLeague = "";

function priceMovePay(points) {
  const n = Math.abs(Number(points) || 0).toFixed(1);
  return Number(points) > 0 ? `pays ${n} points less` : `pays ${n} points more`;
}

function priceMovePrice(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function priceMoveKey(row) {
  return `${row && row.label || ""}|${row && row.match || ""}`;
}

function priceMoveFold(text) {
  return String(text || "").toLowerCase().replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
}

function priceMoveSame(row, label, match) {
  if (!row || priceMoveFold(row.match) !== priceMoveFold(match)) return false;
  const a = priceMoveFold(row.label);
  const b = priceMoveFold(label);
  return !!a && a === b;
}

function priceMoveLoad() {
  if (priceMoveBag && priceMoveBag.data && Date.now() - priceMoveBag.at < 60000) return Promise.resolve(priceMoveBag.data);
  if (priceMoveBag && priceMoveBag.run && !priceMoveBag.data) return priceMoveBag.run;
  const run = fetch("/api/price-moves", { credentials: "same-origin" }).then((response) => (response.ok ? response.json() : { rows: [] })).catch(() => ({ rows: [] }));
  priceMoveBag = { at: Date.now(), data: null, run };
  return run.then((data) => { priceMoveBag.data = data || { rows: [] }; priceMoveBag.at = Date.now(); return priceMoveBag.data; });
}

function priceMoveImplied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function priceMoveClock(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).replace(",", "");
}

function priceMoveChart(series) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 248");
  svg.setAttribute("class", "price-chart");
  const pts = (series || []).map((point) => ({ t: Number(point.at), y: priceMoveImplied(point.odds), odds: point.odds })).filter((point) => point.y);
  if (pts.length < 2) return svg;
  const t0 = pts[0].t;
  const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const ys = pts.map((point) => point.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const min = lo - 0.012;
  const max = hi + 0.012;
  const xOf = (t) => 78 + ((t - t0) / (t1 - t0)) * 530;
  const yOf = (y) => 36 + (1 - (y - min) / (max - min || 1)) * 150;
  const floor = yOf(min);
  const line = pts.map((point) => `${xOf(point.t)},${yOf(point.y)}`).join(" ");
  const area = `${xOf(pts[0].t)},${floor} ${line} ${xOf(pts[pts.length - 1].t)},${floor}`;
  const fill = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  fill.setAttribute("points", area);
  fill.setAttribute("class", "price-chart-area");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  path.setAttribute("points", line);
  path.setAttribute("class", "price-chart-line");
  svg.append(fill, path);
  const unit = document.createElementNS("http://www.w3.org/2000/svg", "text");
  unit.setAttribute("x", "8");
  unit.setAttribute("y", "18");
  unit.setAttribute("class", "price-chart-axis");
  unit.textContent = "chance";
  svg.append(unit);
  [lo, hi].forEach((y) => {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "8");
    label.setAttribute("y", String(yOf(y) + 4));
    label.setAttribute("class", "price-chart-axis");
    label.textContent = `${Math.round(y * 100)}%`;
    svg.append(label);
  });
  const marks = [pts[0]];
  if (pts.length > 2) {
    const mid = pts[Math.floor((pts.length - 1) / 2)];
    const span = pts[pts.length - 1].t - pts[0].t;
    if (mid.t - pts[0].t > span * 0.28 && pts[pts.length - 1].t - mid.t > span * 0.28) marks.push(mid);
  }
  marks.push(pts[pts.length - 1]);
  marks.forEach((point, index) => {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const edge = index === 0 ? "start" : index === marks.length - 1 ? "end" : "middle";
    label.setAttribute("x", String(xOf(point.t)));
    label.setAttribute("y", "236");
    label.setAttribute("text-anchor", edge);
    label.setAttribute("class", "price-chart-axis");
    label.textContent = `${priceMoveClock(point.t)} ET`;
    svg.append(label);
  });
  pts.forEach((point, index) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(xOf(point.t)));
    dot.setAttribute("cy", String(yOf(point.y)));
    dot.setAttribute("r", "5");
    dot.setAttribute("class", "price-chart-dot");
    const tag = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const edge = index === 0 ? "start" : index === pts.length - 1 ? "end" : "middle";
    tag.setAttribute("x", String(xOf(point.t)));
    tag.setAttribute("y", String(yOf(point.y) - 12));
    tag.setAttribute("text-anchor", edge);
    tag.setAttribute("class", "price-chart-odds");
    tag.textContent = priceMovePrice(point.odds);
    svg.append(dot, tag);
  });
  return svg;
}

function priceMoveLive(row) {
  const steps = row && row.steps || [];
  if (steps.length < 2) return false;
  const last = Number(steps[steps.length - 1].points);
  const prev = Number(steps[steps.length - 2].points);
  const at = Number(steps[steps.length - 1].at) || Number(row.at);
  return Boolean(last && prev && (last > 0) === (prev > 0) && Date.now() - at <= 2 * 60 * 60 * 1000);
}

function priceMoveEdge(row) {
  const read = row && row.read;
  if (!read || typeof edgeGap !== "function") return -Infinity;
  const gap = edgeGap(read.hits, read.n, read.need);
  const base = gap ? gap.gap : -Infinity;
  const role = read.role === "solid" ? 1.5 : read.role === "thin" ? -2 : 0;
  return base + (read.cushion ? 0.75 : 0) + role;
}

function priceMoveRoom(row) {
  const model = Number(row && row.model);
  const now = priceMoveImplied(row && row.last);
  if (!(model > 0 && model < 1) || !now) return 0;
  return Math.abs(now - model);
}

function priceMoveName(row) {
  const label = String(row && row.label || "");
  const market = String(row && row.market || "");
  if (!market || /\d/.test(label) || label.toLowerCase().includes(market.toLowerCase())) return label;
  return `${label} ${market}`;
}

function priceMoveDeez(row) {
  const read = row && row.read;
  if (!read || read.tier === "good" || !read.how || read.hot || !(priceMoveEdge(row) > 0)) return false;
  const model = Number(row.model);
  const series = row && row.series || [];
  const steps = row && row.steps || [];
  if (!(model > 0 && model < 1) || series.length < 3 || steps.length < 2) return false;
  const last = Number(steps[steps.length - 1].points);
  const prior = Number(steps[steps.length - 2].points);
  const at = Number(steps[steps.length - 1].at) || Number(row.at);
  if (!last || !prior || (last > 0) !== (prior > 0) || Date.now() - at > 2 * 60 * 60 * 1000) return false;
  const before = priceMoveImplied(series[series.length - 3].odds);
  const prev = priceMoveImplied(series[series.length - 2].odds);
  const now = priceMoveImplied(series[series.length - 1].odds);
  if (!before || !prev || !now || !(now < model) || !(prev < model)) return false;
  const closer = (from, to) => Math.abs(to - model) + 0.002 < Math.abs(from - model);
  return closer(before, prev) && closer(prev, now);
}

function priceMoveDraw(box, rows) {
  const order = ["NFL", "NBA", "NHL", "MLB", "WNBA", "PGA"];
  const leagues = [...new Set(rows.map((row) => row.sport).filter(Boolean))].sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99) || a.localeCompare(b));
  if (priceMoveLeague && !leagues.includes(priceMoveLeague)) priceMoveLeague = "";
  const pool = priceMoveLeague ? rows.filter((row) => row.sport === priceMoveLeague) : rows;
  const shown = priceMoveTab === "all" ? pool.slice() : pool.filter(priceMoveTab === "deez" ? priceMoveDeez : priceMoveLive);
  if (priceMoveTab === "deez") shown.sort((a, b) => priceMoveEdge(b) - priceMoveEdge(a) || priceMoveRoom(b) - priceMoveRoom(a));
  const picked = shown.find((row) => priceMoveKey(row) === priceMoveFocus) || shown[0];
  if (picked) priceMoveFocus = priceMoveKey(picked);
  const lead = document.createElement("p");
  lead.className = "price-move-lead";
  lead.textContent = priceMoveTab === "deez" ? "The price has started toward our number and has not sat down. Get on before it gets there." : priceMoveTab === "live" ? "These lines stepped again the same way. The price has not sat down." : "FanDuel prices that moved this week. The big moves are the ones to look at.";
  const switcher = document.createElement("div");
  switcher.className = "price-move-switch";
  [["deez", "Bet Deez"], ["live", "Still moving"], ["all", "All"]].forEach(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = priceMoveTab === id ? "on" : "";
    button.textContent = label;
    button.addEventListener("click", () => {
      priceMoveTab = id;
      priceMoveDraw(box, rows);
    });
    switcher.append(button);
  });
  const leagueBar = document.createElement("div");
  leagueBar.className = "price-move-switch price-move-leagues";
  if (leagues.length > 1) {
    [["", "All"], ...leagues.map((sport) => [sport, sport])].forEach(([id, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = priceMoveLeague === id ? "on" : "";
      button.textContent = label;
      button.addEventListener("click", () => {
        priceMoveLeague = id;
        priceMoveDraw(box, rows);
      });
      leagueBar.append(button);
    });
  }
  const menu = document.createElement("div");
  menu.className = "price-move-menu";
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "price-move-open";
  const list = document.createElement("div");
  list.className = "price-move-list";
  shown.forEach((row) => {
    const button = document.createElement("button");
    button.type = "button";
    const pay = priceMovePay(row.points);
    button.className = `price-move-pick${priceMoveKey(row) === priceMoveFocus ? " on" : ""}`;
    const name = document.createElement("b");
    name.textContent = priceMoveName(row);
    const move = document.createElement("span");
    const record = priceMoveTab === "deez" && row.read && row.read.n ? `${row.read.hits} of ${row.read.n}. ` : "";
    move.textContent = `${record}${pay.charAt(0).toUpperCase()}${pay.slice(1)}`;
    button.append(name, move);
    button.addEventListener("click", () => { priceMoveFocus = priceMoveKey(row); priceMoveDraw(box, rows); });
    list.append(button);
  });
  opener.addEventListener("click", () => menu.classList.toggle("open"));
  menu.append(opener, list);
  const card = document.createElement("article");
  card.className = "price-move-card";
  if (!picked) {
    const none = document.createElement("p");
    none.className = "desk-games-note";
    const sport = priceMoveLeague;
    none.textContent = priceMoveTab === "deez"
      ? (sport ? `No ${sport} price has started toward our number without sitting down.` : "No price has started toward our number without sitting down.")
      : (sport ? `No ${sport} line is still walking the same way. The next pull shows which ones step again.` : "No line is still walking the same way. The next pull shows which ones step again.");
    box.replaceChildren(lead, switcher, ...(leagueBar.childElementCount ? [leagueBar] : []), none);
    return;
  }
  const pay = priceMovePay(picked.points);
  const openCopy = document.createElement("span");
  const openName = document.createElement("b");
  openName.textContent = priceMoveName(picked);
  const openMove = document.createElement("span");
  openMove.textContent = `${pay.charAt(0).toUpperCase()}${pay.slice(1)}`;
  openCopy.append(openName, openMove);
  opener.append(openCopy);
  const head = document.createElement("h3");
  head.textContent = priceMoveName(picked);
  const where = document.createElement("p");
  where.className = "price-move-where";
  where.textContent = `${picked.match || ""}. ${priceMovePrice(picked.first)} to ${priceMovePrice(picked.last)}. It ${pay}.`;
  const steps = document.createElement("div");
  steps.className = "price-move-steps";
  (picked.steps || []).forEach((step) => {
    const line = document.createElement("p");
    line.textContent = step.text;
    steps.append(line);
  });
  const unit = document.createElement("p");
  unit.className = "price-chart-unit";
  unit.textContent = "Implied chance on the left. FanDuel's price on the line. Pull time on the bottom.";
  const why = priceMoveTab === "deez" && picked.read && picked.read.how ? document.createElement("p") : null;
  if (why) {
    why.className = "price-move-why";
    why.textContent = typeof edgeHow === "function" ? edgeHow(picked.read) : picked.read.how;
  }
  const books = priceMoveTab === "deez" ? document.createElement("p") : null;
  const news = priceMoveTab === "deez" ? document.createElement("button") : null;
  const bet = priceMoveTab === "deez" ? document.createElement("button") : null;
  if (books) {
    books.className = "price-move-note";
    const read = picked.read;
    if (read && read.fairEx && Number(read.fair) > 0) books.textContent = `The other books, with FanDuel left out, have it at ${(Number(read.fair) * 100).toFixed(1)}% across ${read.fairBooks} books.`;
    else if (picked.booksLine) books.textContent = picked.booksLine;
    else {
      books.textContent = "Checking the other books.";
      priceMoveAsk(picked, "books").then((data) => {
        if (!books.isConnected) return;
        picked.booksLine = data.line || "The other books do not have this line.";
        books.textContent = picked.booksLine;
      });
    }
  }
  if (news) {
    news.type = "button";
    news.className = "price-move-news";
    news.textContent = "Why the move?";
    news.addEventListener("click", () => {
      news.disabled = true;
      news.textContent = "Looking.";
      priceMoveAsk(picked, "why").then((data) => {
        const lines = data && data.lines && data.lines.length ? data.lines : [data && data.line || "The check did not come back."];
        const box = document.createElement("div");
        lines.forEach((text) => {
          const line = document.createElement("p");
          line.className = "price-move-note";
          line.textContent = text;
          box.append(line);
        });
        news.replaceWith(box);
      });
    });
  }
  if (bet) {
    bet.type = "button";
    bet.className = "price-move-bet";
    bet.textContent = "Bet it";
    bet.addEventListener("click", () => priceMoveTake(picked, card));
  }
  const acts = bet || news ? document.createElement("div") : null;
  if (acts) {
    acts.className = "price-move-acts";
    if (bet) acts.append(bet);
    if (news) acts.append(news);
  }
  card.append(head, where, ...(why ? [why] : []), ...(books ? [books] : []), ...(acts ? [acts] : []), priceMoveChart(picked.series), unit, steps);
  box.replaceChildren(lead, switcher, ...(leagueBar.childElementCount ? [leagueBar] : []), menu, card);
  const on = box.querySelector(".price-move-pick.on");
  if (on) on.scrollIntoView({ block: "nearest" });
}

function priceMoveShow(board, card) {
  const ask = card.querySelector(".desk-rec-ask");
  const acts = card.querySelector(".price-move-acts");
  if (ask && acts) acts.after(ask);
  const tray = board && board.querySelector(":scope > .find-tray");
  const bet = card.querySelector(".price-move-bet");
  if (tray && !tray.hidden) {
    tray.classList.remove("find-shut");
    if (bet && !ask) bet.textContent = "On the slip";
    tray.scrollIntoView({ block: "nearest" });
  } else if (ask) ask.scrollIntoView({ block: "nearest" });
}

function priceMoveTake(picked, card) {
  if (document.body.classList.contains("needs-member")) {
    const join = document.getElementById("gate-join");
    if (join) join.click();
    return;
  }
  const board = card.closest(".find-board");
  const pick = { label: picked.label || "", market: picked.market || "", match: picked.match || "" };
  if (board && typeof startHit === "function") {
    const hit = startHit(board, pick);
    const odds = Number(picked.last);
    if (hit && hit.bet && Number.isFinite(odds) && odds) hit.bet.odds = odds;
  }
  if (typeof startBetAsk !== "function" || !board) return;
  startBetAsk(board, pick, card);
  priceMoveShow(board, card);
  const ask = card.querySelector(".desk-rec-ask");
  if (!ask || ask.dataset.wired) return;
  ask.dataset.wired = "1";
  ask.addEventListener("click", (event) => {
    const go = event.target.closest("[data-bet-go]");
    if (!go || typeof startBetGo !== "function") return;
    card.querySelectorAll(".desk-rec-ask").forEach((node) => node.remove());
    startBetGo(board, pick, go.dataset.betGo);
    priceMoveShow(board, card);
  });
}

function priceMoveAsk(row, kind) {
  const query = new URLSearchParams({ label: row.label || "", match: row.match || "", market: row.market || "", sport: row.sport || "", kickoff: row.kickoff || "", model: row.model != null ? String(row.model) : "", kind });
  return fetch(`/api/price-look?${query}`, { credentials: "same-origin" }).then((response) => (response.ok ? response.json() : { line: "" })).catch(() => ({ line: "" }));
}

function priceMoveShut(event) {
  document.querySelectorAll(".price-move-menu.open").forEach((menu) => {
    if (!menu.contains(event.target)) menu.classList.remove("open");
  });
}

function priceMovePage() {
  const box = document.createElement("section");
  box.className = "price-moves";
  const note = document.createElement("p");
  note.className = "desk-games-note";
  note.textContent = "Looking up the FanDuel prices.";
  box.append(note);
  try { priceMoveFocus = priceMoveFocus || sessionStorage.getItem("price-move") || ""; } catch (error) {}
  priceMoveLoad().then((data) => {
    if (!box.isConnected) return;
    const rows = (data && data.rows) || [];
    if (!rows.length) {
      note.textContent = data && data.tracked ? "The first prices are in. The next pull shows which ones moved." : "The first FanDuel prices are being written down. The next pull shows which ones moved.";
      return;
    }
    priceMoveDraw(box, rows);
  });
  return box;
}

function priceMoveMark() {
  priceMoveLoad().then((data) => {
    const rows = (data && data.rows) || [];
    document.querySelectorAll("button.desk-rec").forEach((card) => {
      if (card.querySelector(".k-move")) return;
      const row = rows.find((item) => priceMoveSame(item, card.dataset.moveLabel, card.dataset.moveMatch));
      if (!row) return;
      const how = card.querySelector(".desk-rec-how");
      if (!how) return;
      const moved = Math.abs(Number(row.points) || 0);
      const way = Number(row.points) > 0 ? "less" : "more";
      const amount = moved ? moved.toFixed(1).replace(/\.0$/, "") : "";
      const tip = `FanDuel ${priceMovePay(row.points)}, from ${priceMovePrice(row.first)} to ${priceMovePrice(row.last)}.`;
      const tag = document.createElement("i");
      tag.className = "bet-kind k-move";
      tag.textContent = amount ? `Moving ${amount} ${way}` : "Moving";
      tag.title = tip;
      tag.dataset.tip = tip;
      how.append(tag);
    });
  });
}

function priceMoveOpen(label, match) {
  const go = (rows) => {
    const row = (rows || []).find((item) => priceMoveSame(item, label, match));
    priceMoveFocus = row ? priceMoveKey(row) : `${label || ""}|${match || ""}`;
    if (row) {
      priceMoveTab = priceMoveDeez(row) ? "deez" : priceMoveLive(row) ? "live" : "all";
      priceMoveLeague = row.sport || "";
    }
    try { sessionStorage.setItem("price-move", priceMoveFocus); } catch (error) {}
    const here = document.querySelector("#desk-glass-in .find-board");
    if (here && here.dataset.page === "moves" && typeof startPaint === "function") { startPaint(1); return; }
    if (typeof paintMoves === "function") paintMoves();
    else window.location.href = "/movement";
  };
  const ready = priceMoveBag && priceMoveBag.data && priceMoveBag.data.rows;
  if (ready) { go(ready); return; }
  priceMoveLoad().then((data) => go((data && data.rows) || [])).catch(() => go([]));
}

function manageParlayPrice(oddsList) {
  const dec = oddsList.reduce((prod, odds) => {
    const n = Number(odds);
    if (!Number.isFinite(n) || !n || !prod) return 0;
    const b = n > 0 ? n / 100 : 100 / Math.abs(n);
    return b > 0 ? prod * (1 + b) : 0;
  }, 1);
  if (!(dec > 1)) return 0;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function manageParlaySeries(legs, packs) {
  const tracks = (legs || []).map((leg, index) => {
    const points = (((packs[index] && packs[index].series) || []))
      .map((point) => ({ at: Number(point.at), odds: Number(point.odds) }))
      .filter((point) => point.odds && point.at)
      .sort((a, b) => a.at - b.at);
    return { points, now: Number(leg.odds) || 0 };
  });
  const times = [...new Set(tracks.flatMap((track) => track.points.map((point) => point.at)))].sort((a, b) => a - b);
  const series = [];
  times.forEach((at) => {
    const odds = tracks.map((track) => {
      let held = null;
      track.points.forEach((point) => { if (point.at <= at) held = point.odds; });
      if (held != null) return held;
      return track.points.length ? null : track.now;
    });
    if (odds.some((n) => !n)) return;
    const price = manageParlayPrice(odds);
    if (!price) return;
    const last = series[series.length - 1];
    if (last && last.odds === price) return;
    series.push({ at, odds: price });
  });
  return series;
}

function manageOddsPull(leg) {
  const q = new URLSearchParams({ label: leg.label || "", market: leg.market || "", match: leg.match || "" });
  return fetch(`/api/price-history?${q}`, { credentials: "same-origin" }).then((res) => (res.ok ? res.json() : { series: [] })).catch(() => ({ series: [] }));
}

function manageOddsChart(host, legs) {
  if (!host) return;
  const had = host.querySelector(":scope > .manage-price-chart");
  host.querySelectorAll(":scope > .manage-price-chart").forEach((node) => node.remove());
  if (had) return;
  const box = document.createElement("div");
  box.className = "manage-price-chart";
  box.addEventListener("click", (event) => event.stopPropagation());
  const note = document.createElement("p");
  note.className = "price-chart-unit";
  host.append(box);
  Promise.all((legs || []).map(manageOddsPull)).then((packs) => {
    if (!box.isConnected) return;
    const series = (legs || []).length > 1 ? manageParlaySeries(legs, packs) : ((packs[0] && packs[0].series) || []);
    box.replaceChildren();
    if (series.length < 2) {
      note.textContent = "The price has not moved.";
      box.append(note);
      return;
    }
    box.append(priceMoveChart(series));
  }).catch(() => {
    if (!box.isConnected) return;
    note.textContent = "The price did not come back.";
    box.replaceChildren(note);
  });
}

function manageOddsBind(node, legs, host) {
  if (!node || !(legs || []).length) return;
  node.classList.add("manage-odds");
  node.title = "Price history";
  node.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    manageOddsChart(host || node.parentElement, legs);
  });
}

window.priceMovePage = priceMovePage;
window.priceMoveMark = priceMoveMark;
window.priceMoveOpen = priceMoveOpen;
window.manageOddsBind = manageOddsBind;
document.addEventListener("click", priceMoveShut);
