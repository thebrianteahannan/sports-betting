/** Manage My Bets: every saved ticket, lock-as-placed, stake and line edits. */

let manageFilter = "all";
const MANAGE_ZOOM_MAX = 1;
let manageZoom = (() => {
  try {
    const raw = localStorage.getItem("manageZoom");
    const ver = localStorage.getItem("manageZoomVer");
    let n = Number(raw);
    if (Number.isFinite(n)) {
      // v6: one line, or that line plus each leg. The middle squares stop is gone.
      if (ver !== "6") {
        n = n >= 1 ? 1 : 0;
        localStorage.setItem("manageZoom", String(n));
        localStorage.setItem("manageZoomVer", "6");
      }
      return Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(n)));
    }
  } catch (error) {}
  return 0;
})();
let manageZoomDrag = false;

function manageZoomApply(next, opts) {
  const quiet = !!(opts && opts.quiet);
  manageZoom = Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(Number(next) || 0)));
  document.querySelectorAll(".manage-board").forEach((board) => { board.dataset.manageZoom = String(manageZoom); });
  if (!quiet && !manageZoomDrag) {
    document.querySelectorAll("input.manage-zoom-range").forEach((box) => {
      box.value = String(manageZoom);
      box.setAttribute("aria-valuenow", String(manageZoom));
    });
  }
  try { localStorage.setItem("manageZoom", String(manageZoom)); } catch (error) {}
}

function manageZoomBar() {
  const bar = document.createElement("label");
  bar.className = "manage-zoom";
  const less = document.createElement("span");
  less.textContent = "Less";
  const more = document.createElement("span");
  more.textContent = "More";
  const input = document.createElement("input");
  input.type = "range";
  input.className = "manage-zoom-range";
  input.min = "0";
  input.max = String(MANAGE_ZOOM_MAX);
  input.step = "any";
  input.value = String(manageZoom);
  input.setAttribute("aria-valuemin", "0");
  input.setAttribute("aria-valuemax", String(MANAGE_ZOOM_MAX));
  input.setAttribute("aria-valuenow", String(manageZoom));
  input.setAttribute("aria-label", "Show more or less on each bet");
  const end = () => {
    manageZoomDrag = false;
    const snapped = Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(Number(input.value) || 0)));
    input.value = String(snapped);
    manageZoomApply(snapped);
  };
  input.addEventListener("pointerdown", (event) => {
    manageZoomDrag = true;
    try { input.setPointerCapture(event.pointerId); } catch (error) {}
  });
  input.addEventListener("pointerup", end);
  input.addEventListener("pointercancel", end);
  input.addEventListener("lostpointercapture", end);
  input.addEventListener("input", () => {
    manageZoomDrag = true;
    const level = Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(Number(input.value) || 0)));
    input.setAttribute("aria-valuenow", String(level));
    manageZoomApply(level, { quiet: true });
  });
  input.addEventListener("change", end);
  bar.append(less, input, more);
  return bar;
}

function manageCash(stake, legs) {
  const dec = (legs || []).reduce((p, leg) => p * (1 + (typeof findRank === "function" ? findRank(leg.odds) : 0)), 1);
  if (!(dec > 1) || !(stake > 0)) return 0;
  return Math.round(stake * (dec - 1) * 100) / 100;
}

function manageOddsSaid(row) {
  if (row.locked && row.lockedOdds) return row.lockedOdds;
  return typeof savePrice === "function" ? savePrice(row.legs || []) : "";
}

function manageMoney(n) {
  return typeof saveMoneySaid === "function" ? saveMoneySaid(n) : String(Math.round((Number(n) || 0) * 100) / 100);
}

function manageKick(row) {
  const kicks = (row.legs || []).map((leg) => leg.kickoff).filter(Boolean).sort();
  if (!kicks.length) return "";
  return typeof window.when === "function" ? `${window.when(kicks[0])} ET` : kicks[0];
}

function manageGames(row) {
  return typeof gameShortList === "function" ? gameShortList(row.legs || []) : [...new Set((row.legs || []).map((leg) => leg.match).filter(Boolean))].join(" · ");
}

function manageTitle(row) {
  return typeof saveChipSaid === "function" ? saveChipSaid(row) : `${(row.legs || []).length}-leg`;
}

function manageParseOdds(text) {
  const raw = String(text || "").trim().replace(/^\+/, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function manageRefresh() {
  document.querySelectorAll(".find-saved .manage-pick").forEach((host) => manageFill(host));
}

function manageAmerican(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : String(n);
}

function manageLegRead(leg) {
  const raw = String(leg.label || "").split(/\s+—\s+/)[0].trim();
  const who = String(leg.player || "").trim() || raw.split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim();
  let prop = raw;
  if (who && prop.toLowerCase().startsWith(who.toLowerCase())) prop = prop.slice(who.length).trim();
  if (prop.toLowerCase() === who.toLowerCase()) prop = "";
  const game = typeof gameShort === "function" && leg.match ? gameShort(leg.match) : String(leg.match || "");
  const when = leg.kickoff && typeof window.when === "function" ? `${window.when(leg.kickoff)} ET` : "";
  return {
    who,
    prop,
    game,
    when,
    odds: manageAmerican(leg.odds),
    pct: typeof findPct === "function" ? findPct(leg.odds) : "",
  };
}

function manageReadLine(bits, pay, mark) {
  const line = document.createElement("p");
  line.className = "manage-read";
  line.innerHTML = [
    bits.odds && `<i class="px">${esc(bits.odds)}</i>`,
    bits.pct && `<i class="pct">${esc(bits.pct)}</i>`,
    bits.who && `<i class="who">${esc(bits.who)}</i>`,
    bits.prop && `<i class="prop">${esc(bits.prop)}</i>`,
    bits.game && `<em class="game">${esc(bits.game)}</em>`,
    bits.when && `<em class="when">${esc(bits.when)}</em>`,
    pay && `<i class="pay">${esc(pay)}</i>`,
    mark && `<i class="mk">${esc(mark)}</i>`,
  ].filter(Boolean).join("");
  return line;
}

function manageCard(row) {
  const card = document.createElement("article");
  card.className = `manage-card${row.locked ? " locked" : ""}${row.id === window.parlayOpenId ? " on" : ""}`;
  card.dataset.id = row.id;
  const legs = row.legs || [];
  const stake = Number(row.stake) > 0 ? Number(row.stake) : 5;
  const odds = manageOddsSaid(row);
  const oddsNum = manageParseOdds(odds);
  const pct = oddsNum != null && typeof findPct === "function" ? findPct(oddsNum) : "";
  const cash = oddsNum != null && typeof findCash === "function" ? findCash(oddsNum, stake) : "";
  const pay = cash ? `$${manageMoney(stake)} profits ${cash}` : "";
  const bits = legs.length === 1
    ? manageLegRead(legs[0])
    : { who: manageTitle(row), prop: legs.length ? `${legs.length}-leg` : "", game: manageGames(row), when: manageKick(row), odds, pct };
  if (legs.length === 1) { bits.odds = odds || bits.odds; bits.pct = pct || bits.pct; }
  const more = document.createElement("div");
  more.className = "manage-more";
  if (legs.length > 1) legs.forEach((leg) => more.append(manageReadLine(manageLegRead(leg))));
  const open = document.createElement("button");
  open.type = "button";
  open.className = "manage-open";
  open.textContent = "Open";
  card.append(manageReadLine(bits, pay, row.locked ? "Locked" : ""), more, open);
  const openBet = () => {
    if (row.id === window.parlayOpenId) {
      if (typeof saveCollapseForBet === "function") saveCollapseForBet();
      if (typeof paintParlay === "function") paintParlay();
      return;
    }
    if (typeof saveOpen === "function") saveOpen(row.id);
  };
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.title = "Open bet";
  card.addEventListener("click", openBet);
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target !== card) return;
    event.preventDefault();
    openBet();
  });
  return card;
}


function manageFill(board) {
  const list = typeof saveList === "function" ? saveList() : [];
  const shown = list.filter((item) => {
    if (manageFilter === "locked") return !!item.locked;
    if (manageFilter === "open") return !item.locked;
    return true;
  });
  board.classList.add("manage-board");
  board.replaceChildren();
  const filters = document.createElement("div");
  filters.className = "manage-filters";
  [["all", "All"], ["locked", "Locked"], ["open", "Open"]].forEach(([key, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `manage-filter${manageFilter === key ? " on" : ""}`;
    chip.textContent = label;
    chip.addEventListener("click", () => { manageFilter = key; manageRefresh(); });
    filters.append(chip);
  });
  filters.append(manageZoomBar());
  board.append(filters);
  manageZoomApply(manageZoom, { quiet: true });
  if (!shown.length) {
    const none = document.createElement("div");
    none.className = "manage-empty";
    const say = document.createElement("p");
    say.textContent = list.length ? "Nothing in this filter." : "No bets saved yet.";
    none.append(say);
    board.append(none);
    return;
  }
  const bag = document.createElement("div");
  bag.className = "manage-list";
  shown.forEach((item) => bag.append(manageCard(item)));
  board.append(bag);
}

