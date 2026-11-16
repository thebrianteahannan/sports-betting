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

const TD_KIND = { "Anytime TD": "Anytime touchdown", "2 Anytime TDs": "2+ touchdowns", "3 Anytime TDs": "3+ touchdowns" };
const TD_ROW = /^(.*?), (?:(.+?), )?([+-]?\d+), (\d+%)(?:, (\$5 profits \S+))?([\s\S]*)$/;

function tdStakeOf() {
  return typeof parlayStakeOf === "function" ? parlayStakeOf() : (Number(window.parlayStake) > 0 ? Number(window.parlayStake) : 5);
}

function tdStakeShown(stake) {
  const n = Number(stake) > 0 ? Number(stake) : 5;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function tdPayHtml(odds) {
  const stake = tdStakeOf();
  const cash = typeof findCash === "function" ? findCash(odds, stake) : "";
  if (!cash) return "";
  return `<span class="td-pay"><button type="button" class="stake" aria-label="Change the bet size">$${esc(tdStakeShown(stake))}</button> profits ${esc(cash)}</span>`;
}

function tdRepaintCash() {
  const stake = tdStakeOf();
  const shown = tdStakeShown(stake);
  document.querySelectorAll(".find-list.find-td-board button.td-row .td-pay, .find-list.find-td-board .find-td-few .td-pay").forEach((pay) => {
    const row = pay.closest("button.td-row, .rec-bet");
    const odds = Number((row && (row.dataset.odds || (row.querySelector(".td-px, .px") || {}).textContent)) || 0);
    const cash = typeof findCash === "function" ? findCash(odds, stake) : "";
    if (!cash) return;
    pay.innerHTML = `<button type="button" class="stake" aria-label="Change the bet size">$${esc(shown)}</button> profits ${esc(cash)}`;
  });
}

function tdEditStake(button) {
  const pay = button.closest(".td-pay");
  if (!pay) return;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "stake";
  input.min = "1";
  input.max = "100000";
  input.step = "1";
  input.setAttribute("aria-label", "Bet size");
  input.value = button.textContent.replace(/[^0-9.]/g, "") || "5";
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    if (!input.isConnected) return;
    const amount = Number(input.value);
    if (typeof parlayStakeSet === "function") parlayStakeSet(amount);
    else window.parlayStake = Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5;
    tdRepaintCash();
    if (typeof paintParlay === "function") paintParlay();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { input.value = button.textContent.replace(/[^0-9.]/g, "") || "5"; input.blur(); }
  });
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("blur", finish);
}

function dressTdRow(button) {
  const tab = button.closest(".find-list") && button.closest(".find-list").querySelector(".find-td-picks button.on");
  const short = typeof gameShort === "function" && button.dataset.match ? gameShort(button.dataset.match) : "";
  const best = button.dataset.best === "1";
  const stake = tdStakeShown(tdStakeOf());
  const sig = `v3|${button.dataset.who || ""}|${button.dataset.odds || ""}|${button.dataset.rec || ""}|${best ? "1" : ""}|${stake}|${(tab && tab.textContent) || ""}|${short}|${button.dataset.match || ""}`;
  if (button.dataset.dressed === sig && button.classList.contains("td-row")) return;
  const found = button.textContent.match(TD_ROW);
  if (!found && !button.classList.contains("td-row")) return;
  let name, team, price, pct;
  if (found) {
    [, name, team, price, pct] = found;
    name = String(name || "").replace(/\s*Recommended$/i, "").trim();
  } else {
    name = (button.querySelector(".td-name") || {}).textContent || button.dataset.who || "";
    team = (button.querySelector(".td-team") || {}).textContent || "";
    price = (button.querySelector(".td-px") || {}).textContent || (Number(button.dataset.odds) > 0 ? `+${button.dataset.odds}` : String(button.dataset.odds || ""));
    pct = (button.querySelector(".td-pct") || {}).textContent || (button.dataset.chance ? `${button.dataset.chance}%` : "");
  }
  if (!name || !price) return;
  const kind = TD_KIND[tab ? tab.textContent : ""] || "";
  const pay = tdPayHtml(button.dataset.odds || price);
  const tags = [
    best && `<span class="td-best" aria-label="Best">Best</span>`,
    button.dataset.rec === "1" && `<span class="td-rec">Recommended</span>`,
  ].filter(Boolean).join("");
  const game = short || (!short && team) || "";
  button.innerHTML = `<span class="td-line"><span class="td-main"><span class="td-top"><span class="td-name">${esc(name)}</span>${tags ? `<span class="td-tags">${tags}</span>` : ""}</span>${game ? `<span class="td-game">${esc(game)}</span>` : ""}${kind ? `<span class="td-kind">${esc(kind)}</span>` : ""}</span><span class="td-meta"><span class="td-price"><span class="td-px">${esc(price)}</span><span class="td-pct">${esc(pct)}</span></span>${pay || ""}</span></span>`;
  button.classList.add("td-row");
  button.classList.toggle("find-td-rec", button.dataset.rec === "1");
  button.classList.toggle("find-td-best", best);
  button.dataset.dressed = sig;
  button.removeAttribute("title");
}

function watchTdRows() {
  const glass = document.getElementById("desk-glass-in") || document.body;
  let style = document.getElementById("td-row-style");
  if (!style) { style = document.createElement("style"); style.id = "td-row-style"; document.head.append(style); }
  const row = ".rec-board .find-list .find-td-page > button.td-row, .rec-board .find-list .find-td-page > .td-pick-wrap > button.td-row";
  style.textContent = `${row}, #desk.tv-full #desk-glass ${row} { display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 0.35rem 0.5rem; width: 100%; min-height: 0; margin: 0; padding: 0.42rem 0.2rem; border: 0; border-bottom: 1px solid rgba(61, 255, 110, 0.16); border-radius: 0; background: transparent; box-shadow: none; color: #f4f7fb; font-family: "Outfit", sans-serif; font-size: 0.92rem; line-height: 1.2; text-align: left; white-space: nowrap; cursor: pointer; }
${row}:hover, #desk.tv-full #desk-glass ${row}:hover { background: rgba(61, 255, 110, 0.06); }
${row}.find-better, #desk.tv-full #desk-glass ${row}.find-better { border-color: transparent; box-shadow: none; }
${row}.find-td-best, #desk.tv-full #desk-glass ${row}.find-td-best { box-shadow: inset 3px 0 0 #e7c15a; }
${row}.on, #desk.tv-full #desk-glass ${row}.on { background: rgba(61, 255, 110, 0.1); }
${row} .td-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #fff; font-weight: 800; }
${row} .td-team, ${row} .td-game, ${row} .td-kind { flex: 0 1 auto; max-width: 28%; overflow: hidden; text-overflow: ellipsis; color: #8b97a3; font-size: 0.82rem; font-weight: 600; }
${row} .td-kind { color: #3dff6e; }
${row} .td-best, ${row} .td-rec { flex: none; padding: 0.08rem 0.35rem; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
${row} .td-best { background: #e7c15a; color: #07090e; }
${row} .td-rec { background: transparent; color: #e7c15a; box-shadow: inset 0 0 0 1px #e7c15a; }
${row} .td-meta { flex: none; display: inline-flex; align-items: baseline; gap: 0.4rem; margin-left: auto; }
${row} .td-px { color: #3dff6e; font-weight: 800; }
${row} .td-pct { color: #e7c15a; font-weight: 700; }
@media (max-width: 699px) {
  ${row} .td-team, ${row} .td-kind { display: none; }
  ${row} .td-game { max-width: 34%; }
}`;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; glass.querySelectorAll(".find-list .find-td-page > button, .find-list .find-td-page > .td-pick-wrap > button").forEach(dressTdRow); });
  }).observe(glass, { childList: true, subtree: true, characterData: true });
}
watchTdRows();

document.addEventListener("click", (event) => {
  const stake = event.target.closest && event.target.closest(".find-list.find-td-board .td-pay button.stake");
  if (!stake) return;
  event.preventDefault();
  event.stopPropagation();
  tdEditStake(stake);
}, true);
