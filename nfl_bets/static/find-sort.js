/** Sort a player's bets by chance, by profit, or by prop. */

const FIND_SORTS = [["pct", "%"], ["profit", "Profit"], ["prop", "Prop"]];

function findSortKey() {
  try { return localStorage.getItem("parlay-find-sort") || ""; } catch (error) { return ""; }
}

function findChance(row) {
  const price = Number(row.dataset.odds);
  return !price ? 0 : price < 0 ? -price / (-price + 100) : 100 / (price + 100);
}

function findLine(row) {
  const hit = ((row.querySelector(".prop") || {}).textContent || "").match(/(\d+(?:\.\d+)?)/);
  return hit ? Number(hit[1]) : 0;
}

function sortFind(list) {
  const rows = [...list.querySelectorAll(":scope > .rec-bet")];
  if (rows.length < 2 || list.querySelector(":scope > .find-market")) return;
  const by = findSortKey();
  list.querySelectorAll("[data-find-sort]").forEach((button) => {
    const on = button.dataset.findSort === by;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.style.background = on ? "#3dff6e" : "transparent";
    button.style.color = on ? "#04140c" : "#3dff6e";
  });
  const order = ["Spread", "Moneyline", "Total", "Kicking", ...(typeof PROP_KINDS === "undefined" ? [] : PROP_KINDS.map((row) => row[1]))];
  const kind = (row) => { const at = order.indexOf(row.dataset.kind || ""); return at < 0 ? 99 : at; };
  const part = (row) => Number(/qtr|quarter|half|each|period|inning/i.test(`${row.dataset.market || ""} ${(row.querySelector(".prop") || {}).textContent || ""}`));
  const sorts = {
    pct: (a, b) => findChance(b) - findChance(a),
    profit: (a, b) => findChance(a) - findChance(b),
    prop: (a, b) => kind(a) - kind(b) || (kind(a) === 99 ? String(a.dataset.market || "").localeCompare(String(b.dataset.market || "")) : 0) || part(a) - part(b) || findLine(a) - findLine(b) || findChance(b) - findChance(a),
  };
  const base = (a, b) => Number(b.classList.contains("find-mark")) - Number(a.classList.contains("find-mark")) || Number(b.dataset.gap || 0) - Number(a.dataset.gap || 0) || Number(a.dataset.i) - Number(b.dataset.i);
  rows.sort((a, b) => (sorts[by] ? sorts[by](a, b) : 0) || base(a, b)).forEach((row) => list.append(row));
}

function addFindSort(names, list) {
  const row = document.createElement("div");
  row.className = "find-sort";
  row.style.cssText = "display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin: 0.55rem 0;";
  const name = document.createElement("span");
  name.textContent = "Sort";
  name.style.cssText = "font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #9fb3a8; margin-right: 0.2rem;";
  row.append(name);
  FIND_SORTS.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.findSort = key;
    button.textContent = label;
    button.style.cssText = "width: auto; min-height: 0; margin: 0; padding: 0.3rem 0.8rem; border: 1px solid #3dff6e; border-radius: 999px; font-size: 0.85rem; font-weight: 800; cursor: pointer;";
    button.addEventListener("click", () => {
      const next = findSortKey() === key ? "" : key;
      try { if (next) localStorage.setItem("parlay-find-sort", next); else localStorage.removeItem("parlay-find-sort"); } catch (error) { /* the sort still applies this time */ }
      sortFind(list);
    });
    row.append(button);
  });
  names.after(row);
  sortFind(list);
}

window.sortFind = sortFind;
window.addFindSort = addFindSort;
