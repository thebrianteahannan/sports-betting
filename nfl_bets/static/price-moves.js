/** Price movement lives on the history page. A Moving tag opens that bet's chart. */

let priceMoveBag = null;
let priceMoveFocus = "";
let priceMoveTab = "deez";
let priceMoveLeague = "";
let priceChartN = 0;

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
  return `${date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}

function priceMoveChart(series) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 248");
  svg.setAttribute("class", "price-chart");
  svg.style.touchAction = "pan-y";
  const pts = (series || []).map((point) => ({ t: Number(point.at), y: priceMoveImplied(point.odds), odds: point.odds })).filter((point) => point.y);
  if (pts.length < 2) return svg;
  const ns = "http://www.w3.org/2000/svg";
  const el = (name) => document.createElementNS(ns, name);
  const t0 = pts[0].t;
  const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const minSpan = Math.min(t1 - t0, Math.max(15 * 60 * 1000, (t1 - t0) / 80));
  const clipId = `price-clip-${++priceChartN}`;
  let viewA = t0, viewB = t1, xOf = (t) => t, when = null, drag = null, band = null, wheelOn = false;
  const zoomed = () => viewA > t0 + 1 || viewB < t1 - 1;
  const clamp = (a, b) => {
    const span = Math.max(minSpan, Math.min(t1 - t0, b - a));
    let left = a, right = left + span;
    if (left < t0) { right += t0 - left; left = t0; }
    if (right > t1) { left -= right - t1; right = t1; }
    viewA = Math.max(t0, left);
    viewB = Math.min(t1, right);
  };
  const paint = () => {
    const vis = pts.filter((point) => point.t >= viewA - 1 && point.t <= viewB + 1);
    const use = vis.length ? vis : pts;
    const ys = use.map((point) => point.y);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 0.008) { const mid = (lo + hi) / 2; lo = mid - 0.004; hi = mid + 0.004; }
    const pad = Math.max(0.004, (hi - lo) * 0.55);
    const min = lo - pad * 0.35;
    const max = hi + pad;
    xOf = (t) => 78 + ((t - viewA) / (viewB - viewA || 1)) * 530;
    const yOf = (y) => 36 + (1 - (y - min) / (max - min || 1)) * 150;
    const floor = yOf(min);
    const line = pts.map((point) => `${xOf(point.t)},${yOf(point.y)}`).join(" ");
    svg.replaceChildren();
    const clip = el("clipPath");
    clip.id = clipId;
    const frame = el("rect");
    frame.setAttribute("x", "72");
    frame.setAttribute("y", "20");
    frame.setAttribute("width", "548");
    frame.setAttribute("height", "180");
    clip.append(frame);
    const defs = el("defs");
    defs.append(clip);
    const plot = el("g");
    plot.setAttribute("clip-path", `url(#${clipId})`);
    const fill = el("polygon");
    fill.setAttribute("points", `${xOf(pts[0].t)},${floor} ${line} ${xOf(pts[pts.length - 1].t)},${floor}`);
    fill.setAttribute("class", "price-chart-area");
    const path = el("polyline");
    path.setAttribute("points", line);
    path.setAttribute("class", "price-chart-line");
    plot.append(fill, path);
    const lanes = [-999, -999, -999];
    const tags = [];
    vis.forEach((point) => {
      const x = xOf(point.t), y = yOf(point.y);
      let lane = lanes.findIndex((at) => x - at >= 46);
      if (lane < 0) lane = 2;
      lanes[lane] = x;
      const dot = el("circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "5");
      dot.setAttribute("class", "price-chart-dot");
      const tag = el("text");
      let ly = y - 14 - lane * 13;
      if (ly < 28) ly = y + 16 + lane * 13;
      tag.setAttribute("x", String(x));
      tag.setAttribute("y", String(ly));
      tag.setAttribute("text-anchor", x < 110 ? "start" : x > 560 ? "end" : "middle");
      tag.setAttribute("class", "price-chart-odds");
      tag.textContent = priceMovePrice(point.odds);
      plot.append(dot);
      tags.push(tag);
    });
    svg.append(defs, plot, ...tags);
    const unit = el("text");
    unit.setAttribute("x", "8");
    unit.setAttribute("y", "18");
    unit.setAttribute("class", "price-chart-axis");
    unit.textContent = "chance";
    svg.append(unit);
    const pct = (y) => (hi - lo) < 0.02 ? `${(y * 100).toFixed(1)}%` : `${Math.round(y * 100)}%`;
    [lo, hi].forEach((y) => {
      const label = el("text");
      label.setAttribute("x", "8");
      label.setAttribute("y", String(yOf(y) + 4));
      label.setAttribute("class", "price-chart-axis");
      label.textContent = pct(y);
      svg.append(label);
    });
    when = el("text");
    when.setAttribute("y", "236");
    when.setAttribute("class", "price-chart-axis");
    when.setAttribute("visibility", "hidden");
    svg.append(when);
    const back = el("text");
    back.setAttribute("x", "632");
    back.setAttribute("y", "18");
    back.setAttribute("text-anchor", "end");
    back.setAttribute("class", "price-chart-zoom");
    back.textContent = zoomed() ? "Full chart" : "Drag to zoom";
    back.addEventListener("pointerdown", (event) => { event.stopPropagation(); event.preventDefault(); });
    if (zoomed()) back.addEventListener("click", (event) => { event.stopPropagation(); viewA = t0; viewB = t1; paint(); });
    svg.append(back);
    svg.style.cursor = zoomed() ? "grab" : "crosshair";
  };
  const svgX = (event) => {
    const rect = svg.getBoundingClientRect();
    return rect.width ? ((event.clientX - rect.left) / rect.width) * 640 : 0;
  };
  const nearest = (x) => {
    let best = null, dist = Infinity;
    pts.forEach((point) => {
      if (point.t < viewA || point.t > viewB) return;
      const gap = Math.abs(xOf(point.t) - x);
      if (gap < dist) { dist = gap; best = point; }
    });
    return best;
  };
  const showWhen = (point) => {
    if (!when || !point) return;
    const x = xOf(point.t);
    when.textContent = priceMoveClock(point.t);
    when.setAttribute("x", String(x < 150 ? 8 : x > 490 ? 632 : x));
    when.setAttribute("text-anchor", x < 150 ? "start" : x > 490 ? "end" : "middle");
    when.setAttribute("visibility", "visible");
  };
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    wheelOn = true;
    svg.style.touchAction = "none";
    drag = { x: svgX(event), pan: zoomed(), a: viewA, b: viewB };
    try { svg.setPointerCapture(event.pointerId); } catch (error) {}
    if (drag.pan) svg.style.cursor = "grabbing";
  });
  svg.addEventListener("pointermove", (event) => {
    const x = svgX(event);
    if (!drag) { showWhen(nearest(x)); return; }
    if (drag.pan) { clamp(drag.a + ((drag.x - x) / 530) * (drag.b - drag.a), drag.b + ((drag.x - x) / 530) * (drag.b - drag.a)); paint(); svg.style.cursor = "grabbing"; return; }
    const x0 = Math.max(78, Math.min(drag.x, x)), x1 = Math.min(608, Math.max(drag.x, x));
    if (!band) { band = el("rect"); band.setAttribute("class", "price-chart-band"); band.setAttribute("y", "28"); band.setAttribute("height", "168"); svg.append(band); }
    band.setAttribute("x", String(x0));
    band.setAttribute("width", String(Math.max(0, x1 - x0)));
  });
  const endDrag = (event) => {
    if (!drag) return;
    const x = svgX(event), wasPan = drag.pan, x0 = Math.min(drag.x, x), x1 = Math.max(drag.x, x);
    drag = null;
    if (band) { band.remove(); band = null; }
    if (!wasPan && x1 - x0 >= 16) clamp(viewA + ((Math.max(78, x0) - 78) / 530) * (viewB - viewA), viewA + ((Math.min(608, x1) - 78) / 530) * (viewB - viewA));
    if (!wasPan && x1 - x0 >= 16) paint();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => {
    if (drag) return;
    wheelOn = false;
    svg.style.touchAction = "pan-y";
    if (when) when.setAttribute("visibility", "hidden");
  });
  svg.addEventListener("dblclick", (event) => { event.preventDefault(); viewA = t0; viewB = t1; paint(); });
  svg.addEventListener("wheel", (event) => {
    if (!wheelOn) return;
    event.preventDefault();
    const x = svgX(event);
    const frac = Math.min(1, Math.max(0, (x - 78) / 530));
    const span = viewB - viewA;
    const next = event.deltaY < 0 ? span * 0.72 : span / 0.72;
    const focus = viewA + frac * span;
    clamp(focus - frac * next, focus + (1 - frac) * next);
    paint();
    showWhen(nearest(x));
  }, { passive: false });
  paint();
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
  const news = document.createElement("button");
  const bet = document.createElement("button");
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
  const trend = box.querySelector(":scope > .price-trend");
  box.replaceChildren(...(trend ? [trend] : []), lead, switcher, ...(leagueBar.childElementCount ? [leagueBar] : []), menu, card);
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
  if (typeof priceTrendPaint === "function") priceTrendPaint(box);
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

function priceMoveInline(card) {
  if (!card || typeof manageOddsChart !== "function") return;
  const leg = {
    label: card.dataset.moveLabel || "",
    market: card.dataset.moveMarket || "",
    match: card.dataset.moveMatch || "",
    odds: Number(card.dataset.moveOdds) || 0,
  };
  if (!leg.label) return;
  manageOddsChart(card, [leg]);
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
    window.startMoveTab = true;
    const here = document.querySelector("#desk-glass-in .find-board");
    if (here && here.dataset.page === "rec" && typeof startPaint === "function") { startPaint(1); return; }
    if (typeof paintMoves === "function") paintMoves();
    else window.location.href = "/recommended";
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
window.priceMoveInline = priceMoveInline;
window.manageOddsBind = manageOddsBind;
document.addEventListener("click", priceMoveShut);
