/** Filters for a roster parlay list. Props, profit, and a strategy match. */

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
  strategy.textContent = "Close to a strategy";
  strategy.addEventListener("click", () => {
    const on = strategy.classList.toggle("on");
    strategy.setAttribute("aria-pressed", on ? "true" : "false");
    apply();
  });
  row.append(strategy);
  const none = document.createElement("p");
  none.className = "quiet";
  none.hidden = true;
  none.textContent = "None of these fit.";
  heading.after(money, row, props, none);
  let at = 0;
  const apply = () => {
    const want = Number(profit.value);
    const nearOn = strategy.classList.contains("on");
    const chosen = new Map();
    props.querySelectorAll(".find-names").forEach((names) => {
      const on = [...names.querySelectorAll("button.on")].map((button) => button.dataset.key);
      if (on.length) chosen.set(names.dataset.who, new Set(on));
    });
    let shown = 0;
    boxes.forEach((box) => {
      const propOk = [...box.querySelectorAll(".rec-gist")].every((line) => {
        const set = chosen.get(line.dataset.who);
        return !set || set.has(line.dataset.key);
      });
      const won = Number(box.dataset.won);
      const payOk = !(want > 0) || (Number.isFinite(won) && Math.abs(won - want) <= Math.max(1, want * 0.25));
      const nearOk = !nearOn || box.classList.contains("find-near");
      const keep = propOk && payOk && nearOk;
      box.classList.toggle("find-off", !keep);
      if (keep) shown += 1;
    });
    const rank = (box) => want > 0 ? Math.abs(Number(box.dataset.won) - want) : Number(box.dataset.i);
    boxes.filter((box) => !box.classList.contains("find-off")).sort((a, b) => rank(a) - rank(b) || Number(a.dataset.i) - Number(b.dataset.i)).forEach((box) => list.append(box));
    const n = boxes.length;
    heading.textContent = shown === n ? (n === 1 ? `1 ${count}-leg parlay` : `${n} ${count}-leg parlays`) : `${shown} of ${n} ${count}-leg parlays`;
    const picks = props.querySelectorAll("button.on").length;
    summary.textContent = picks ? `Props, ${picks} picked` : "Props";
    none.hidden = shown !== 0 || (nearOn && at < pending.length && !(want > 0) && !chosen.size);
  };
  apply();
  const stamp = markFind.stamp;
  const step = () => {
    if (stamp !== markFind.stamp || !list.isConnected) return;
    const end = Math.min(at + 30, pending.length);
    for (; at < end; at += 1) {
      const near = rosterNear(pending[at][1]);
      pending[at][0].classList.toggle("find-near", !!near);
      if (!near) continue;
      const line = document.createElement("p");
      line.className = "find-why";
      line.textContent = near;
      pending[at][0].querySelector("b").after(line);
    }
    if (strategy.classList.contains("on")) apply();
    if (at < pending.length) setTimeout(step, 30);
  };
  if (pending.length) setTimeout(step, 0);
}
