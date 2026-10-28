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
