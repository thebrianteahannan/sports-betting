/** Price movement lives on the history page. A Moving tag opens that bet's chart. */

let priceMoveBag = null;
let priceMoveFocus = "";
let priceMoveTab = "favor";

function priceMovePrice(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function priceMoveKey(row) {
  return `${row && row.label || ""}|${row && row.match || ""}`;
}

function priceMoveSame(row, label, match) {
  if (!row || (row.match || "") !== (match || "")) return false;
  const a = String(row.label || "").toLowerCase().trim();
  const b = String(label || "").toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
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
  if (pts.length > 2) marks.push(pts[Math.floor((pts.length - 1) / 2)]);
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

function priceMoveFavor(row) {
  if (!priceMoveLive(row)) return false;
  const model = Number(row && row.model);
  const series = row && row.series || [];
  if (!(model > 0 && model < 1) || series.length < 2) return false;
  const prev = priceMoveImplied(series[series.length - 2].odds);
  const now = priceMoveImplied(series[series.length - 1].odds);
  if (!prev || !now) return false;
  const closer = Math.abs(now - model) + 0.002 < Math.abs(prev - model);
  const gap = prev - model;
  return closer && gap !== 0 && (now - model) * gap > 0;
}

function priceMoveDraw(box, rows) {
  const shown = priceMoveTab === "all" ? rows : rows.filter(priceMoveTab === "favor" ? priceMoveFavor : priceMoveLive);
  const picked = shown.find((row) => priceMoveKey(row) === priceMoveFocus) || shown[0];
  if (picked) priceMoveFocus = priceMoveKey(picked);
  const lead = document.createElement("p");
  lead.className = "price-move-lead";
  lead.textContent = priceMoveTab === "favor" ? "FanDuel is walking these toward our number. Take the price up now, before they finish." : priceMoveTab === "live" ? "These lines stepped again the same way. The price has not sat down." : "FanDuel prices that moved this week. The big moves are the ones to look at.";
  const switcher = document.createElement("div");
  switcher.className = "price-move-switch";
  [["favor", "In our favor"], ["live", "Still moving"], ["all", "All"]].forEach(([id, label]) => {
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
  const list = document.createElement("div");
  list.className = "price-move-list";
  shown.forEach((row) => {
    const button = document.createElement("button");
    button.type = "button";
    const way = Number(row.points) > 0 ? "shorter" : "longer";
    button.className = `price-move-pick${priceMoveKey(row) === priceMoveFocus ? " on" : ""}`;
    const name = document.createElement("b");
    name.textContent = row.label;
    const move = document.createElement("span");
    move.textContent = `${Math.abs(Number(row.points) || 0).toFixed(1)} points ${way}`;
    button.append(name, move);
    button.addEventListener("click", () => { priceMoveFocus = priceMoveKey(row); priceMoveDraw(box, rows); });
    list.append(button);
  });
  const card = document.createElement("article");
  card.className = "price-move-card";
  if (!picked) {
    const none = document.createElement("p");
    none.className = "desk-games-note";
    none.textContent = priceMoveTab === "favor" ? "No price is walking toward our number right now." : "No line is still walking the same way. The next pull shows which ones step again.";
    box.replaceChildren(lead, switcher, none);
    return;
  }
  const way = Number(picked.points) > 0 ? "shorter" : "longer";
  const head = document.createElement("h3");
  head.textContent = picked.label;
  const where = document.createElement("p");
  where.className = "price-move-where";
  where.textContent = `${picked.match || ""}. ${priceMovePrice(picked.first)} to ${priceMovePrice(picked.last)}. The price is ${Math.abs(Number(picked.points) || 0).toFixed(1)} points ${way}.`;
  const steps = document.createElement("div");
  steps.className = "price-move-steps";
  (picked.steps || []).forEach((step) => {
    const line = document.createElement("p");
    line.textContent = step.text;
    steps.append(line);
  });
  const unit = document.createElement("p");
  unit.className = "price-chart-unit";
  unit.textContent = "The left side is the chance that price implies. The numbers on the line are FanDuel's price. The bottom is when we pulled it.";
  card.append(head, where, priceMoveChart(picked.series), unit, steps);
  box.replaceChildren(lead, switcher, list, card);
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
      const way = Number(row.points) > 0 ? "shorter" : "longer";
      const tip = `FanDuel moved ${Math.abs(Number(row.points) || 0).toFixed(1)} points ${way}, from ${priceMovePrice(row.first)} to ${priceMovePrice(row.last)}.`;
      const tag = document.createElement("i");
      tag.className = "bet-kind k-move";
      tag.textContent = "Moving";
      tag.title = tip;
      tag.dataset.tip = tip;
      how.append(tag);
    });
  });
}

function priceMoveOpen(label, match) {
  const rows = priceMoveBag && priceMoveBag.data && priceMoveBag.data.rows || [];
  const row = rows.find((item) => priceMoveSame(item, label, match));
  priceMoveFocus = row ? priceMoveKey(row) : `${label || ""}|${match || ""}`;
  if (row) priceMoveTab = priceMoveFavor(row) ? "favor" : priceMoveLive(row) ? "live" : "all";
  try { sessionStorage.setItem("price-move", priceMoveFocus); } catch (error) {}
  const here = document.querySelector("#desk-glass-in .find-board");
  if (here && here.dataset.page === "moves" && typeof startPaint === "function") { startPaint(1); return; }
  if (typeof paintMoves === "function") paintMoves();
  else window.location.href = "/movement";
}

window.priceMovePage = priceMovePage;
window.priceMoveMark = priceMoveMark;
window.priceMoveOpen = priceMoveOpen;
