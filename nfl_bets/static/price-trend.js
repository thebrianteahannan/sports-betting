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
  const where = priceTrendWhere(clock);
  const lead = `In ${clock.agree} of ${clock.games} games, ${priceTrendBet(clock)}`;
  const size = priceTrendPoint(clock.points);
  const at = where ? ` ${where}` : "";
  if (clock.faded) return `${lead} move about ${size}${at}, then the price comes back.`;
  if (clock.way === "longer") return `${lead} get about ${size} cheaper${at}. Wait.`;
  return `${lead} cost about ${size} more${at}.${clock.held ? " That price stays." : ""}`;
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
      series: Array.isArray(row.series) ? row.series : [],
      steps: Array.isArray(row.steps) ? row.steps : [],
      clock: true,
      clockLine: text,
      clockWhy: priceTrendWhy(clock),
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

function priceTrendWhere(clock) {
  const text = priceTrendWhen(clock);
  if (!text || /^(in |early )/i.test(text)) return text;
  return `in the ${text}`;
}

function priceTrendKey(clock) {
  return [clock.sport, clock.prop, clock.side, clock.when].join("|");
}

function priceTrendOpenRows(data) {
  const early = (data && data.early) || [];
  const now = (data && data.dive && data.dive.now) || [];
  const clocks = (data && data.dive && data.dive.clocks) || [];
  const rows = [];
  now.forEach((line) => {
    const text = String(line || "");
    const row = early.find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
    if (!row || rows.some((have) => have.row.label === row.label && have.row.match === row.match)) return;
    rows.push({ row, clock: priceTrendHit(row, clocks), ticket: priceTrendOpenLine(text, early).replace(/\s+$/, "") });
  });
  return rows;
}

function priceTrendNames(label) {
  return String(label || "").split(/\s+/).filter((word) => /^[A-Z][a-z]{2,}/.test(word));
}

function priceTrendBets(data) {
  const groups = new Map();
  priceTrendOpenRows(data).forEach((item) => {
    const key = item.clock ? priceTrendKey(item.clock) : item.row.label;
    const bag = groups.get(key) || { clock: item.clock, key, tickets: [], names: [] };
    bag.tickets.push(item.ticket);
    priceTrendNames(item.row.label).forEach((name) => { if (!bag.names.includes(name)) bag.names.push(name); });
    groups.set(key, bag);
  });
  const voice = data && data.voice;
  return [...groups.values()].map((bag) => {
    const why = bag.clock ? priceTrendWhy(bag.clock) : "";
    const line = `${bag.tickets.join(" ")} ${why}`.trim();
    const said = voice && voice.v === 2 && voice.bets && voice.bets[bag.key];
    if (!said || bag.names.some((name) => !said.includes(name)) || (bag.clock && !said.includes(`${bag.clock.agree} of ${bag.clock.games}`))) return line;
    return said;
  });
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

function priceTrendFill(host, data) {
  host.replaceChildren();
  const dive = data && data.dive;
  const lines = priceTrendBrief(data);
  if (!lines[0] && !(dive && dive.clocks && dive.clocks.length)) { host.remove(); return; }
  const summary = document.createElement("summary");
  summary.textContent = "Price Movement Recommendations";
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
  const voice = data.voice && data.voice.v === 2 ? data.voice : {};
  const used = new Set(priceTrendOpenRows(data).map((item) => item.clock && priceTrendKey(item.clock)).filter(Boolean));
  const lineFor = (row, group) => {
    const said = voice[group] && voice[group][priceTrendKey(row)];
    const own = priceTrendWhy(row);
    if (!said || !said.includes(`${row.agree} of ${row.games}`)) return own;
    return said;
  };
  const byMove = (rows) => rows.slice().sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  priceTrendSection(host, "Bet these", priceTrendBets(data));
  priceTrendSection(host, "Wait", byMove(clocks.filter((row) => !row.faded && row.way === "longer")).map((row) => lineFor(row, "wait")));
  priceTrendSection(host, "These prices stay", byMove(clocks.filter((row) => !row.faded && row.way === "shorter" && row.held && !used.has(priceTrendKey(row)))).map((row) => lineFor(row, "stay")));
  priceTrendSection(host, "So far", byMove(clocks.filter((row) => !row.faded && row.way === "shorter" && !row.held && !used.has(priceTrendKey(row)))).map((row) => lineFor(row, "soon")));
  priceTrendSection(host, "Skip", byMove(clocks.filter((row) => row.faded)).map((row) => lineFor(row, "skip")), "price-trend-skip");
}

let priceTrendHold = null;

function priceTrendLoad() {
  if (priceTrendHold && priceTrendHold.data && Date.now() - priceTrendHold.at < 60000) return Promise.resolve(priceTrendHold.data);
  if (priceTrendHold && priceTrendHold.run) return priceTrendHold.run;
  const run = fetch("/api/price-trends", { credentials: "same-origin" }).then((response) => (response.ok ? response.json() : null)).catch(() => null).then((data) => {
    priceTrendHold = { at: Date.now(), data, run: null };
    return data;
  });
  priceTrendHold = { at: Date.now(), data: null, run };
  return run;
}

function priceTrendFold(text) {
  return String(text || "").toLowerCase().replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
}

function priceTrendGame(text) {
  return priceTrendFold(text).replace(/\s*@\s*/g, "@");
}

function priceTrendNum(text) {
  const hit = String(text || "").match(/\d+(?:\.\d+)?/);
  return hit ? hit[0] : "";
}

function priceTrendFamily(leg) {
  const text = `${(leg && leg.market) || ""} ${(leg && leg.label) || ""}`.toLowerCase().replace(/\byds\b/g, "yards").replace(/\btds\b/g, "touchdowns");
  if (/\b(alt|qtr|quarter|half|first|last|either|most|combine|each)\b/.test(text)) return "";
  if (/\bspread\b|\bhandicap\b|\bmoneyline\b|\bmoney line\b/.test(text)) return "";
  if (/\bteam total\b/.test(text)) return "Team total";
  if (/\btotal points\b/.test(text)) return "Game total";
  if (/any ?time touchdown|to score/.test(text)) return "Anytime TD";
  if (/passing yards/.test(text)) return "Passing yards";
  if (/rushing yards/.test(text)) return "Rushing yards";
  if (/receiving yards/.test(text)) return "Receiving yards";
  if (/receptions/.test(text)) return "Receptions";
  if (/passing touchdowns/.test(text)) return "Passing TDs";
  if (/rushing attempts|\bcarries\b/.test(text)) return "Carries";
  if (/threes|3-pointers|\b3pt/.test(text)) return "Threes";
  if (/\brebounds\b/.test(text) && !/\bpoints\b/.test(text)) return "Rebounds";
  if (/\bassists\b/.test(text) && !/\bpoints\b/.test(text)) return "Assists";
  if (/\bpoints\b/.test(text) && !/[+]/.test(text)) return "Points";
  if (/\bshots\b/.test(text)) return "Shots";
  if (/\bgoals\b/.test(text)) return "Goals";
  if (/\bsaves\b/.test(text)) return "Saves";
  return "";
}

function priceTrendSide(leg) {
  const text = `${(leg && leg.label) || ""} ${(leg && leg.market) || ""}`;
  if (/\bunder\b/i.test(text)) return "Under";
  if (/\bover\b/i.test(text)) return "Over";
  return "";
}

function priceTrendLegIs(leg, row) {
  if (!leg || !row || !row.label) return false;
  const game = priceTrendGame(leg.match);
  const theirs = priceTrendGame(row.match);
  if (game && theirs && game !== theirs) return false;
  if (leg.sport && row.sport && String(leg.sport).toUpperCase() !== String(row.sport).toUpperCase()) return false;
  const label = priceTrendFold(`${leg.label || ""} ${leg.market || ""}`);
  const name = priceTrendFold(row.label);
  if (!name) return false;
  const mine = priceTrendNum(label);
  const line = priceTrendNum(name);
  if (mine && line && mine !== line) return false;
  const prop = priceTrendFamily(leg);
  const side = priceTrendSide(leg);
  const rowProp = row.prop || "";
  const rowSide = String(row.side || "");
  if (prop && rowProp && prop !== rowProp) return false;
  if (side && rowSide && side !== rowSide) return false;
  if (label === name || label.includes(name)) return true;
  const who = priceTrendFold(leg.player || "");
  if (!who || !name.includes(who)) return false;
  return !!prop && prop === rowProp && side === rowSide;
}

function priceTrendClockIs(leg, clock) {
  if (!leg || !clock) return false;
  const sport = String(leg.sport || "").toUpperCase();
  if (!sport || sport !== String(clock.sport || "").toUpperCase()) return false;
  const prop = priceTrendFamily(leg);
  if (!prop || prop !== clock.prop) return false;
  return priceTrendSide(leg) === String(clock.side || "");
}

function priceTrendCall(leg, data) {
  if (!leg || !data) return null;
  const open = priceTrendOpenRows(data).find((item) => priceTrendLegIs(leg, item.row));
  if (open) {
    const where = open.clock ? priceTrendWhere(open.clock) : "";
    if (Number(open.row.wait) > 0) return { kind: "wait", say: where ? `Wait to lock it in. The window opens ${where}.` : "Wait to lock it in. The window has not opened." };
    const why = open.clock ? priceTrendWhy(open.clock).replace(/\s*That price stays\.$/, "") : "";
    return { kind: "now", say: why ? `Lock it in now. ${why}` : "Lock it in now. This price has not moved." };
  }
  const clocks = (data.dive && data.dive.clocks) || [];
  const wait = clocks.filter((row) => !row.faded && row.way === "longer" && priceTrendClockIs(leg, row)).sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0];
  if (!wait) return null;
  return { kind: "wait", say: `Wait to lock it in. ${priceTrendWhy(wait).replace(/\s*Wait\.$/, "")}` };
}

function priceTrendPaint(box) {
  if (!box || box.querySelector(".price-trend")) return;
  const go = () => {
    if (!(window.memberAdmin || (window.state && window.state.admin))) return false;
    if (box.querySelector(".price-trend")) return true;
    priceTrendLoad().then((data) => {
      if (!box.isConnected || box.querySelector(".price-trend")) return;
      const dive = data && data.dive;
      if (!(dive && dive.clocks && dive.clocks.length) && !((data && data.trends) || []).length) return;
      const host = document.createElement("details");
      host.className = "price-trend";
      box.prepend(host);
      priceTrendFill(host, data);
      const moves = host.closest(".price-moves");
      if (!moves) return;
      moves.priceClocks = priceTrendTakes(data);
      if (moves.priceRows && typeof priceMoveDraw === "function") priceMoveDraw(moves, moves.priceRows);
    });
    return true;
  };
  if (!go()) setTimeout(() => { if (box.isConnected && !box.querySelector(".price-trend")) go(); }, 1500);
}

window.priceTrendPaint = priceTrendPaint;
window.priceTrendTakes = priceTrendTakes;
window.priceTrendLoad = priceTrendLoad;
window.priceTrendCall = priceTrendCall;
