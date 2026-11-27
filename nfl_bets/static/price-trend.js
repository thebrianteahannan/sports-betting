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

function priceTrendHit(row, clocks) {
  return (clocks || []).find((item) => item.sport === row.sport && item.prop === row.prop && String(item.side || "") === String(row.side || "") && item.when === row.when);
}

function priceTrendBet(clock) {
  return priceTrendName(clock).replace(/\bover\b/, "overs on").replace(/\bunder\b/, "unders on");
}

function priceTrendWhy(clock) {
  if (!clock) return "";
  const when = priceTrendWhen(clock);
  const at = when ? (when.startsWith("in ") ? when : `in the ${when}`) : "";
  const lead = `In ${clock.agree} of ${clock.games} games, ${priceTrendBet(clock)}`;
  const size = priceTrendPoint(clock.points);
  if (clock.faded) return `${lead} move about ${size} ${at}. Then the price goes back.`;
  if (clock.way === "longer") return `${lead} get about ${size} cheaper ${at}. Wait for that number.`;
  const stay = clock.held ? ", and the new price stays" : "";
  return `${lead} cost about ${size} more ${at}${stay}. This one is still the early price.`;
}

function priceTrendTag(clock) {
  if (!clock) return "Price clock";
  let prop = String(clock.prop || "");
  if (prop === "Anytime TD") prop = clock.sport === "NHL" ? "Anytime goals" : "Anytime TDs";
  else if (prop === "Game total") prop = "Game total";
  return `${prop} clock`;
}

function priceTrendTakes(data) {
  const early = (data && data.early) || [];
  const now = (data && data.dive && data.dive.now) || [];
  const clocks = (data && data.dive && data.dive.clocks) || [];
  const rows = [];
  now.forEach((line) => {
    const text = String(line || "").trim();
    const row = early.find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
    if (!row || rows.some((have) => have.label === row.label && have.match === row.match)) return;
    const clock = priceTrendHit(row, clocks);
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
      clockWhy: (data.voice && data.voice.now && data.voice.now[row.label]) || priceTrendWhy(clock),
      clockTag: priceTrendTag(clock),
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

function priceTrendName(clock) {
  let prop = String(clock.prop || "");
  if (prop === "Anytime TD") prop = clock.sport === "NHL" ? "anytime goals" : "anytime TDs";
  else if (prop === "Game total") prop = "the game total";
  else prop = prop.toLowerCase().replace(/\btds\b/g, "TDs");
  return [clock.sport, String(clock.side || "").toLowerCase(), prop].filter(Boolean).join(" ");
}

function priceTrendWhen(clock) {
  const text = String(clock.when || "");
  if (!/ out$/.test(text)) return text;
  const word = clock.sport === "NFL" ? "kickoff" : "the game";
  return `${text.replace(/ out$/, "")} before ${word}`;
}

function priceTrendClockLine(clock, skip) {
  const hit = `${clock.agree} of ${clock.games}`;
  const where = [priceTrendName(clock), priceTrendWhen(clock)].filter(Boolean).join(", ");
  if (skip) return `${where}. ${hit}.`;
  return `${where}. ${hit}, about ${priceTrendPoint(clock.points)}.`;
}

function priceTrendOpenLine(line, early) {
  const text = String(line || "").trim();
  const row = (early || []).find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
  const kick = (text.match(/Kickoff is ([^.]+)/) || [])[1] || "";
  if (!row) return text.replace(/^Take /, "").replace(/ Kickoff is /, " ");
  const price = Number(row.odds);
  const shown = Number.isFinite(price) && price ? (price > 0 ? `+${price}` : `−${Math.abs(price)}`) : "";
  return `${row.label}${shown ? ` at ${shown}` : ""}.${kick ? ` ${kick}.` : ""}`;
}

function priceTrendLead(clocks) {
  const sizes = (clocks || []).filter((row) => row.held && !row.faded).map((row) => Math.abs(Number(row.points))).filter((n) => n).sort((a, b) => a - b);
  if (!sizes.length) return "";
  const span = sizes[0] === sizes[sizes.length - 1] ? `about ${priceTrendPoint(sizes[0])}` : `about ${sizes[0]} to ${priceTrendPoint(sizes[sizes.length - 1])}`;
  return `These move ${span} before the game.`;
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
  const voice = data.voice || {};
  const byMove = (rows) => rows.slice().sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const clockLine = (row, skip) => (voice.clocks && voice.clocks[[row.sport, row.prop, row.side, row.when].join("|")]) || priceTrendClockLine(row, skip);
  const said = voice.lead || priceTrendLead(clocks);
  if (said) {
    const lead = document.createElement("p");
    lead.className = "price-trend-bet";
    lead.textContent = said;
    host.append(lead);
  }
  const openLine = (line) => {
    const text = String(line || "");
    const row = ((data && data.early) || []).find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
    const saidNow = row && voice.now && voice.now[row.label];
    return saidNow || priceTrendOpenLine(line, data && data.early);
  };
  const head = (group, fallback) => (voice.heads && voice.heads[group]) || fallback;
  priceTrendSection(host, head("now", "On the board now"), (dive.now || []).map(openLine));
  priceTrendSection(host, head("bet", "Bet these early. The price drops and stays there."), byMove(clocks.filter((row) => !row.faded && row.way === "shorter" && row.held)).map((row) => clockLine(row)));
  priceTrendSection(host, head("fresh", "Same bets. We have not seen one finish yet."), byMove(clocks.filter((row) => !row.faded && row.way === "shorter" && !row.held)).map((row) => clockLine(row)));
  priceTrendSection(host, head("wait", "Wait. You get a better number."), byMove(clocks.filter((row) => !row.faded && row.way === "longer")).map((row) => clockLine(row)));
  priceTrendSection(host, head("skip", "Skip these. The price moves, then it comes back."), byMove(clocks.filter((row) => row.faded)).map((row) => clockLine(row, true)), "price-trend-skip");
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
