/** Admin only: the price clocks, written on the page. */

function priceTrendBrief(data) {
  let lines;
  if (data && Array.isArray(data.brief) && data.brief.filter(Boolean).length >= 3) lines = data.brief.slice(0, 3);
  else {
    const looked = (data && data.looked) || {};
    const trends = (data && data.trends) || [];
    const early = (data && data.early) || [];
    const count = (n) => Number(n || 0).toLocaleString("en-US");
    const first = `${count(looked.steps)} reprices across ${count(looked.games)} games.`;
    const raw = trends[0] && trends[0].say ? trends[0].say : (data && data.say) || "Nothing has landed on the same clock yet.";
    const bit = String(raw).split(/(?<=[.!?])\s/)[0].trim();
    const second = /[.!?]$/.test(bit) ? bit : `${bit}.`;
    let third = "No open price is still ahead of its clock.";
    if (early[0]) {
      const price = Number(early[0].odds);
      const shown = Number.isFinite(price) && price ? (price > 0 ? `+${price}` : `−${Math.abs(price)}`) : "";
      third = shown ? `${early[0].label} is still ${shown}.` : `${early[0].label} is still the early price.`;
    }
    lines = [first, second, third];
  }
  const now = data && data.dive && Array.isArray(data.dive.now) ? data.dive.now.map((line) => String(line || "").trim()).filter(Boolean) : [];
  if (now.length > 1) lines[2] = `${now.length} prices are still ahead of the clock. ${now.join(" ")}`;
  else if (now.length === 1) lines[2] = now[0];
  return lines;
}

function priceTrendTakes(data) {
  const early = (data && data.early) || [];
  const now = (data && data.dive && data.dive.now) || [];
  const rows = [];
  now.forEach((line) => {
    const text = String(line || "").trim();
    const row = early.find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
    if (!row || rows.some((have) => have.label === row.label && have.match === row.match)) return;
    rows.push({
      label: row.label,
      market: "",
      match: row.match || "",
      kickoff: row.kickoff || "",
      sport: row.sport || "",
      first: row.odds,
      last: row.odds,
      points: 0,
      series: [],
      steps: [],
      clock: true,
      clockLine: text,
    });
  });
  return rows;
}

function priceTrendPoint(n) {
  const v = Math.abs(Math.round(Number(n) * 10) / 10);
  return `${v} point${v === 1 ? "" : "s"}`;
}

function priceTrendSection(host, title, lines, kind) {
  const rows = (lines || []).map((line) => String(line || "").trim()).filter(Boolean);
  if (!rows.length) return;
  const head = document.createElement("p");
  head.className = "price-trend-head";
  head.textContent = title;
  host.append(head);
  rows.forEach((line) => {
    const p = document.createElement("p");
    p.className = kind || "price-trend-bet";
    p.textContent = line;
    host.append(p);
  });
}

function priceTrendClockLine(clock) {
  const hit = `${clock.agree} of ${clock.games}`;
  const size = `about ${priceTrendPoint(clock.points)} ${clock.way === "longer" ? "longer" : "shorter"}`;
  if (clock.faded) return `${clock.title}. ${hit} in the window, and the close gives it back.`;
  if (clock.held) return `${clock.title}. ${hit}, ${size}, and the close still had it.`;
  return `${clock.title}. ${hit}, ${size}. The close has not checked it.`;
}

function priceTrendOpenLine(line, early) {
  const text = String(line || "").trim();
  const row = (early || []).find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
  if (!row) return text.replace(/^Take /, "");
  const price = Number(row.odds);
  const shown = Number.isFinite(price) && price ? (price > 0 ? `+${price}` : `−${Math.abs(price)}`) : "";
  const clock = [row.sport, String(row.side || "").toLowerCase(), String(row.prop || "").toLowerCase()].filter(Boolean).join(" ");
  const kick = (text.match(/Kickoff is ([^.]+)/) || [])[1] || "";
  return [`${row.label}${shown ? ` at ${shown}` : ""}.`, clock && row.when ? `${clock}, ${row.when}.` : "", kick ? `Kickoff ${kick}.` : ""].filter(Boolean).join(" ");
}

function priceTrendLead(clocks) {
  const sizes = (clocks || []).filter((row) => row.held && !row.faded).map((row) => Math.abs(Number(row.points))).filter((n) => n).sort((a, b) => a - b);
  if (!sizes.length) return "A clock is a window where the same prop moves the same way.";
  const span = sizes[0] === sizes[sizes.length - 1] ? `about ${priceTrendPoint(sizes[0])}` : `about ${sizes[0]} to ${priceTrendPoint(sizes[sizes.length - 1])}`;
  return `The reads that have held move the price ${span}.`;
}

function priceTrendFill(host, data) {
  host.replaceChildren();
  const dive = data && data.dive;
  const lines = priceTrendBrief(data);
  if (!lines[0] && !(dive && dive.clocks && dive.clocks.length)) { host.remove(); return; }
  const summary = document.createElement("summary");
  summary.textContent = "Price clocks";
  host.append(summary);
  if (!dive) {
    lines.forEach((line) => {
      const p = document.createElement("p");
      p.className = "price-trend-bet";
      p.textContent = line;
      host.append(p);
    });
    priceTrendSection(host, "Clocks", ((data && data.trends) || []).map((row) => row.say));
    const early = ((data && data.early) || []).map((row) => row.say);
    priceTrendSection(host, "Still the early price", early.length ? early : ["No open price is still ahead of its clock."]);
    return;
  }
  const clocks = dive.clocks || [];
  const byMove = (rows) => rows.slice().sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const lead = document.createElement("p");
  lead.className = "price-trend-bet";
  lead.textContent = priceTrendLead(clocks);
  host.append(lead);
  priceTrendSection(host, "Still the early price", (dive.now || []).map((line) => priceTrendOpenLine(line, data && data.early)));
  priceTrendSection(host, "Bet these before the window", byMove(clocks.filter((row) => !row.faded && row.way === "shorter" && row.held)).map(priceTrendClockLine));
  priceTrendSection(host, "Bet these too. The close has not checked them.", byMove(clocks.filter((row) => !row.faded && row.way === "shorter" && !row.held)).map(priceTrendClockLine));
  priceTrendSection(host, "Wait. The price gets better.", byMove(clocks.filter((row) => !row.faded && row.way === "longer")).map(priceTrendClockLine));
  priceTrendSection(host, "Leave these. The close gives them back.", byMove(clocks.filter((row) => row.faded)).map(priceTrendClockLine), "price-trend-skip");
}

function priceTrendPaint(box) {
  if (!box || box.querySelector(".price-trend")) return;
  const go = () => {
    if (!(window.memberAdmin || (window.state && window.state.admin))) return false;
    const host = document.createElement("details");
    host.className = "price-trend";
    const head = document.createElement("summary");
    head.textContent = "Price clocks";
    const wait = document.createElement("p");
    wait.className = "price-trend-clock";
    wait.textContent = "Looking through the price log.";
    host.append(head, wait);
    box.prepend(host);
    fetch("/api/price-trends", { credentials: "same-origin" }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (host.isConnected) priceTrendFill(host, data);
      const moves = host.closest(".price-moves");
      if (!moves) return;
      moves.priceClocks = priceTrendTakes(data);
      if (moves.priceRows && typeof priceMoveDraw === "function") priceMoveDraw(moves, moves.priceRows);
    }).catch(() => {});
    return true;
  };
  if (!go()) setTimeout(() => { if (box.isConnected && !box.querySelector(".price-trend")) go(); }, 1500);
}

window.priceTrendPaint = priceTrendPaint;
window.priceTrendTakes = priceTrendTakes;
