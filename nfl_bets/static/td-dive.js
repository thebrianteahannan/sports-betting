function paintDive(card, pick) {
  const why = document.createElement("p");
  why.className = "find-why";
  why.textContent = pick.summary || pick.line || "";
  why.addEventListener("click", (event) => event.stopPropagation());
  card.append(why);
  (pick.parts || []).forEach((part) => {
    const block = document.createElement("div");
    block.className = "td-part";
    const title = document.createElement("b");
    title.textContent = part.title || "";
    const text = document.createElement("p");
    text.textContent = part.text || "";
    block.append(title, text);
    if (part.proof) {
      const proof = document.createElement("p");
      proof.className = "td-proof";
      proof.textContent = part.proof;
      block.append(proof);
    }
    block.addEventListener("click", (event) => event.stopPropagation());
    card.append(block);
  });
}
window.paintDive = paintDive;

const TD_KIND = { "Anytime TD": "Anytime touchdown", "2 Anytime TDs": "2+ touchdowns", "3 Anytime TDs": "3+ touchdowns", "Throwing": "Passing touchdown" };
const TD_ROW = /^(.*?), (?:(.+?), )?([+-]?\d+), (\d+%)(?:, (\$5 profits \S+))?([\s\S]*)$/;

function dressTdRow(button) {
  const text = button.textContent;
  if (button.dataset.dressed === text) return;
  const found = text.match(TD_ROW);
  if (!found) return;
  const [, name, team, price, pct, pay, rest] = found;
  const tab = button.closest(".find-list") && button.closest(".find-list").querySelector(".find-td-picks button.on");
  const sep = '<span class="td-sep">, </span>';
  button.innerHTML = [`<span class="td-name">${esc(name)}</span><span class="td-kind" data-kind="${esc(TD_KIND[tab ? tab.textContent : ""] || "")}"></span>`, team && `${sep}<span class="td-team">${esc(team)}</span>`, `${sep}<span class="td-px">${esc(price)}</span>`, `${sep}<span class="td-pct">${esc(pct)}</span>`, pay && `${sep}<span class="td-pay">${esc(pay)}</span>`, '<span class="td-break"></span>', button.dataset.match && `<span class="td-game" data-game="${esc(button.dataset.match)}"></span>`, rest && `<span class="td-line">${esc(rest)}</span>`].filter(Boolean).join("");
  button.classList.add("td-row");
  button.dataset.dressed = button.textContent;
}

function watchTdRows() {
  const glass = document.getElementById("desk-glass-in") || document.body;
  if (!document.getElementById("td-row-style")) {
    const style = document.createElement("style");
    style.id = "td-row-style";
    const row = ".rec-board .find-list .find-td-page > button.td-row";
    style.textContent = `${row}, #desk.tv-full #desk-glass ${row} { display: flex; flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 0.15rem 0.6rem; margin: 0 0 0.45rem; padding: 0.6rem 0.75rem; border: 1px solid #1e3a2a; border-radius: 12px; background: #07140f; color: #f4f7fb; font-family: "Outfit", sans-serif; font-size: 1rem; white-space: normal; }
${row}.find-better, #desk.tv-full #desk-glass ${row}.find-better { border-color: #e7c15a; color: #f4f7fb; box-shadow: none; }
${row}.on, #desk.tv-full #desk-glass ${row}.on, ${row}.on.find-better, #desk.tv-full #desk-glass ${row}.on.find-better { background: #0d2a19; border-color: #3dff6e; color: #f4f7fb; box-shadow: none; }
${row} .td-sep { display: none; }
${row} .td-px { order: 1; color: #3dff6e; font-weight: 800; }
${row} .td-pct { order: 1; color: #e7c15a; }
${row} .td-pay { order: 1; color: #3dff6e; }
${row} .td-break { order: 2; flex-basis: 100%; height: 0; }
${row} .td-name { order: 3; color: #fff; font-weight: 800; }
${row} .td-kind { order: 3; color: #3dff6e; }
${row} .td-kind::before { content: attr(data-kind); }
${row} .td-team { order: 3; color: #9aa8b5; font-weight: 600; }
${row} .td-game { order: 4; flex-basis: 100%; color: #d5deea; font-weight: 700; }
${row} .td-game::before { content: attr(data-game); }
${row} .td-line { order: 5; flex-basis: 100%; color: #9aa8b5; font-size: 0.85em; font-weight: 600; }`;
    document.head.append(style);
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; glass.querySelectorAll(".find-list .find-td-page > button").forEach(dressTdRow); });
  }).observe(glass, { childList: true, subtree: true, characterData: true });
}
watchTdRows();
