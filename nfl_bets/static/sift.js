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

const PROP_KINDS = [[/rush\w* \+ receiv|receiv\w* \+ rush|rush\w* and receiv|receiv\w* and rush/, "Rushing and receiving yards"], [/receiving touchdowns?|rec(?:eiving)? touchdowns?/, "Receiving touchdowns"], [/rushing touchdowns?|rush touchdowns?/, "Rushing touchdowns"], [/passing touchdowns?|pass touchdowns?/, "Passing touchdowns"], [/touchdowns?|anytime touchdown/, "Touchdowns"], [/receiving yards?|rec(?:eiving)? yards?/, "Receiving yards"], [/rushing yards?|rush yards?/, "Rushing yards"], [/passing yards?|pass yards?/, "Passing yards"], [/rushing attempts?|carries/, "Rushing attempts"], [/passing attempts?/, "Passing attempts"], [/completions?/, "Completions"], [/interceptions?/, "Interceptions"], [/receptions?/, "Receptions"], [/home runs?/, "Home runs"], [/stolen bases?/, "Stolen bases"], [/strikeouts?/, "Strikeouts"], [/\brbis?\b/, "RBIs"], [/\bruns?\b/, "Runs"], [/\bhits?\b/, "Hits"], [/made threes|threes?|3pt|three pointers?/, "Threes"], [/rebounds?/, "Rebounds"], [/assists?/, "Assists"], [/steals?/, "Steals"], [/blocks?/, "Blocks"], [/points?|\bpts?\b/, "Points"], [/shots on goal|shots?/, "Shots"], [/saves?/, "Saves"], [/goals?/, "Goals"], [/tackles?/, "Tackles"], [/sacks?/, "Sacks"]];

function propKind(text) {
  const low = String(text || "").toLowerCase().replace(/\byds\b/g, "yards").replace(/\btds\b/g, "touchdowns").replace(/\btd\b/g, "touchdown");
  const hit = PROP_KINDS.find(([re]) => re.test(low));
  return hit ? hit[1] : "Other";
}

function siftKinds(list) {
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
  const order = PROP_KINDS.map((row) => row[1]);
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
  const field = (word, placeholder, step) => {
    const label = document.createElement("label");
    label.className = "find";
    const span = document.createElement("span");
    span.textContent = word;
    const input = document.createElement("input");
    input.type = "number";
    input.placeholder = placeholder;
    input.step = step;
    input.inputMode = "decimal";
    input.addEventListener("input", () => { clearTimeout(siftKinds.timer); if (!input.value.trim()) applyKinds(); else siftKinds.timer = setTimeout(applyKinds, 400); });
    label.append(span, input);
    band.append(label);
    return input;
  };
  const oddsInput = field("Odds", "-150", "1");
  const pctInput = field("%", "75", "0.1");
  const cashInput = field("$5 profits", "2", "0.01");
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
    const cashOn = cashInput.value.trim() !== "" && Number.isFinite(cash);
    const on = !!kind || oddsOn || pctOn || cashOn;
    if (on) { list.classList.remove("find-only-on"); const show = list.querySelector(".find-show"); if (show) show.textContent = "Show those"; }
    let shown = 0;
    rows.forEach((row) => {
      const price = Number(row.dataset.odds);
      const chance = !price ? 0 : price < 0 ? Math.abs(price) / (Math.abs(price) + 100) * 100 : 100 / (price + 100) * 100;
      const won = !price ? 0 : price < 0 ? 500 / -price : price / 20;
      let hide = false;
      if (kind && (row.dataset.kind || "Other") !== kind) hide = true;
      if (oddsOn) hide = hide || (odds < 0 ? !(price <= odds) : !(price >= odds));
      if (pctOn) hide = hide || chance + 1e-9 < pct;
      if (cashOn) hide = hide || won + 1e-9 < cash;
      row.classList.toggle("find-off", hide);
      if (!hide) shown += 1;
    });
    const bits = [kind, oddsOn ? (odds > 0 ? `+${odds}` : String(odds)) : "", pctOn ? `${pct}%` : "", cashOn ? `$${cash}` : ""].filter(Boolean);
    summary.textContent = bits.length ? `Filter, ${bits.join(", ")}` : "Filter";
    none.hidden = !on || shown > 0;
  };
  details.append(summary, names, band, none);
  const heading = list.querySelector("h3");
  if (heading) heading.after(details);
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
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name, text: gist, sport, bet }), signal: stop.signal }).then((res) => res.json()).then((data) => { if (button._read !== stop) return; paintHistory(row, button, data || {}, name); }).catch((err) => { if (err && err.name === "AbortError") return; if (button.isConnected) button.textContent = "See the history"; });
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
function fillLeg(block) { const who = block.dataset.who || "", raw = block.dataset.raw || ""; if (!who || block.querySelector(".find-why, .find-log")) return; const sport = block.dataset.sport || "", odds = Number(block.dataset.odds), bet = { label: raw, market: block.dataset.market || "", odds, sport }; legJobs.push(() => fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: who, text: raw, sport, bet }) }).then((res) => res.json()).then((data) => { if (!block.isConnected || !data) return; if (data.why) { const why = document.createElement("p"); why.className = "find-why"; why.textContent = data.why; block.append(why); } if (data.spans) { const log = document.createElement("div"); log.className = "find-log"; data.spans.split(". ").forEach((bit) => { const cut = bit.replace(/\.$/, "").split(", "); const item = document.createElement("span"); const title = document.createElement("b"); title.textContent = cut[0]; item.append(title, document.createTextNode(cut.slice(1).join(", ") || "")); log.append(item); }); block.append(log); if (/Last 10,/.test(data.spans) && /Career,/.test(data.spans)) { const go = document.createElement("button"); go.type = "button"; go.className = "find-why-go"; go.textContent = "Why the recent trend?"; go.addEventListener("click", () => { if (go.disabled) return; go.disabled = true; go.textContent = "Reading the trend."; fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: who, text: raw, sport, odds }) }).then((res) => res.json()).then((found) => { const line = document.createElement("p"); line.className = "find-dive find-lean"; line.textContent = found.why || found.error || "The log is too short to split the last 10 from the career."; go.replaceWith(line); }).catch(() => { go.disabled = false; go.textContent = "Why the recent trend?"; }); }); block.append(go); } } if (data.lean) { const lean = document.createElement("p"); lean.className = "find-dive find-lean"; lean.textContent = data.lean; block.append(lean); } tuckHist(block); }).catch(() => {})); pumpLegs(); }
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
        fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name, text: gist, sport, odds: Number(row.dataset.odds) || 0 }) }).then((res) => res.json()).then((found) => { const line = document.createElement("p"); line.className = "find-dive find-lean"; line.textContent = found.why || found.error || "The log is too short to split the last 10 from the career."; go.replaceWith(line); }).catch(() => { go.disabled = false; go.textContent = was; });
      });
      box.append(go);
    }
  }
  if (data.lean) { const lean = document.createElement("p"); lean.className = "find-dive find-lean"; lean.textContent = data.lean; box.append(lean); }
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
      say(main.fit ? "This matches " : "This is close to ");
      const go = document.createElement("button");
      go.type = "button";
      go.className = "find-near";
      go.textContent = label;
      go.addEventListener("click", () => { if (window.openStrategy) openStrategy(main.id, main.part || ""); });
      note.append(go);
      say(main.fit ? "." : `.${main.why ? ` ${main.why}` : ""}`);
      said = label;
    }
  }
  const next = parlayNext(rows, said);
  if (next) { if (note.childNodes.length) say(" "); say(next); }
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
    const top = row.getBoundingClientRect().top - glass.getBoundingClientRect().top + glass.scrollTop;
    const stick = tray ? tray.offsetHeight : 0;
    glass.scrollTop = Math.max(0, top - stick - 8);
  }
}

function slimTray() {
  const glass = document.getElementById("desk-glass-in");
  if (!glass) return;
  if (!glass.dataset.slim) { glass.dataset.slim = "1"; glass.addEventListener("scroll", slimTray, { passive: true }); }
  const pad = parseFloat(getComputedStyle(glass).paddingTop) || 0;
  document.querySelectorAll(".find-tray").forEach((tray) => {
    if (tray.hidden || !tray.getClientRects().length) { tray.classList.remove("find-slim"); return; }
    const top = tray.getBoundingClientRect().top - glass.getBoundingClientRect().top - pad;
    const slim = tray.classList.contains("find-slim");
    if (!slim && glass.scrollTop > 72 && top < 8) tray.classList.add("find-slim");
    else if (slim && glass.scrollTop < 28) tray.classList.remove("find-slim");
  });
}

function paintTrayBuild(tray) {
  const legs = [...parlayLeg.values()];
  const group = [...parlayPick.values()];
  const covered = !group.length || group.every((person) => legs.some((bet) => String(bet.label || "").startsWith(person.name)));
  if (legs.length < 2 || !covered) return;
  const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  const line = document.createElement("div");
  line.className = "find-ticket";
  const head = document.createElement("b");
  const tag = price > 0 ? `+${price}` : String(price);
  head.innerHTML = [tag && `<i class="px">${esc(tag)}</i>`, findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, findCash(price) && `<i class="pay">${esc(`$5 profits ${findCash(price)}`)}</i>`, ((rows) => { const games = rows.map((leg) => String(leg.match || leg.gameId || "")); return games.length > 1 && games.every(Boolean) && new Set(games).size === 1; })(legs) && `<i class="sg">Same game</i>`].filter(Boolean).join("");
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
        if (data.lean && !card.querySelector(".find-dive")) { const lean = document.createElement("p"); lean.className = "find-dive find-lean"; lean.textContent = data.lean; log.after(lean); } tuckHist(card);
      }).catch(() => {}));
    });
  });
  const pump = () => { const job = jobs.shift(); if (job) job().finally(pump); };
  pump(); pump(); pump();
}
window.dressBuilt = dressBuilt;
