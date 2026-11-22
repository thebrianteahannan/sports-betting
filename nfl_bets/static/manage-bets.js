/** Manage My Bets: every saved ticket, lock-as-placed, stake and line edits. */

let manageFilter = "all";
const MANAGE_ZOOM_MAX = 2;
let manageZoom = (() => {
  try {
    const raw = localStorage.getItem("manageZoom");
    const ver = localStorage.getItem("manageZoomVer");
    let n = Number(raw);
    if (Number.isFinite(n)) {
      // v5: list → squares → squares+buttons. Drop old legs/full slides.
      if (ver !== "5") {
        n = Math.min(MANAGE_ZOOM_MAX, Math.round(n));
        localStorage.setItem("manageZoom", String(n));
        localStorage.setItem("manageZoomVer", "5");
      }
      return Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(n)));
    }
  } catch (error) {}
  return MANAGE_ZOOM_MAX;
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
  const board = document.querySelector('.rec-board[data-page="manage"]');
  if (board) paintManage(board);
  document.querySelectorAll(".find-saved .manage-pick").forEach((host) => manageFill(host, { inline: true }));
}

function manageCard(row) {
  const card = document.createElement("article");
  card.className = `manage-card${row.locked ? " locked" : ""}${row.id === window.parlayOpenId ? " on" : ""}`;
  card.dataset.id = row.id;

  const head = document.createElement("header");
  head.className = "manage-card-head";
  const title = document.createElement("h3");
  title.textContent = manageTitle(row);
  const badge = document.createElement("span");
  badge.className = "manage-badge";
  badge.textContent = row.locked ? "Locked" : "Open";
  head.append(title, badge);

  const stake = Number(row.stake) > 0 ? Number(row.stake) : 5;
  const odds = manageOddsSaid(row);
  const win = manageCash(stake, row.legs);
  const games = manageGames(row);
  const legsN = (row.legs || []).length;
  const oddsNum = manageParseOdds(odds);
  const ticketPct = typeof findPct === "function" && oddsNum != null ? findPct(oddsNum) : "";
  const ticketCash = typeof findCash === "function" && oddsNum != null ? findCash(oddsNum, stake) : (win > 0 ? `$${manageMoney(win)}` : "");
  const compactWho = (leg) => {
    const who = String(leg.player || "").trim() || String(leg.label || "").split(/\s+(?:\d|\+|Over\b|Under\b)/i)[0].trim();
    const last = who ? who.split(/\s+/).pop() : "";
    let prop = String(leg.label || "").trim();
    if (who && prop.toLowerCase().startsWith(who.toLowerCase())) prop = prop.slice(who.length).trim();
    prop = prop.replace(/\s+/g, " ").trim();
    const game = typeof gameShort === "function" && leg.match ? gameShort(leg.match) : "";
    return [last || who, prop].filter(Boolean).join(" ") || game || "Leg";
  };
  const line = document.createElement("div");
  line.className = "manage-line";
  const gameParts = String(games || "").split(/\s*[·,]\s*/).map((part) => part.trim()).filter(Boolean);
  const gameSaid = !gameParts.length
    ? ""
    : gameParts.length === 1
      ? gameParts[0]
      : `${gameParts[0]} +${gameParts.length - 1}`;
  const main = document.createElement("span");
  main.className = "manage-line-main";
  main.innerHTML = [
    `<i class="who">${esc(manageTitle(row))}</i>`,
    odds && `<b>${esc(odds)}</b>`,
    `<em>$${esc(manageMoney(stake))}</em>`,
    row.locked ? `<i class="lock">Locked</i>` : "",
  ].filter(Boolean).join("");
  const sub = document.createElement("span");
  sub.className = "manage-line-sub";
  sub.textContent = [legsN > 1 ? `${legsN}-leg` : (legsN === 1 ? "1-leg" : ""), gameSaid].filter(Boolean).join(" · ");
  line.append(main);
  if (sub.textContent) line.append(sub);

  const compact = document.createElement("div");
  compact.className = "manage-compact";
  const top = document.createElement("div");
  top.className = "manage-compact-top";
  top.innerHTML = [
    odds && `<b>${esc(odds)}</b>`,
    ticketPct && `<i class="pct">${esc(ticketPct)}</i>`,
    ticketCash && `<em class="pay">$${esc(String(ticketCash).replace(/^\$/, ""))}</em>`,
    `<span class="n">${legsN}-leg · $${esc(manageMoney(stake))}</span>`,
  ].filter(Boolean).join("");
  const compactLegs = document.createElement("ul");
  compactLegs.className = "manage-compact-legs";
  (row.legs || []).forEach((leg) => {
    const item = document.createElement("li");
    const american = Number(leg.odds) > 0 ? `+${leg.odds}` : String(leg.odds ?? "");
    const pct = typeof findPct === "function" ? findPct(leg.odds) : "";
    const cash = typeof findCash === "function" ? findCash(leg.odds, stake) : "";
    item.innerHTML = `<span class="leg-who">${esc(compactWho(leg))}</span><span class="leg-pay"><b>${esc(american)}</b>${pct ? ` · ${esc(pct)}` : ""}${cash ? ` · ${esc(cash)}` : ""}</span>`;
    compactLegs.append(item);
  });
  compact.append(top, compactLegs);

  const meta = document.createElement("p");
  meta.className = "manage-meta";
  meta.innerHTML = [
    `${legsN}-leg`,
    games && esc(games),
    manageKick(row) && esc(manageKick(row)),
    odds && `<b>${esc(odds)}</b>`,
    `Stake $${esc(manageMoney(stake))}`,
    win > 0 && `To win $${esc(manageMoney(win))}`,
  ].filter(Boolean).join(" · ");

  const stakeRow = document.createElement("label");
  stakeRow.className = "manage-stake";
  stakeRow.innerHTML = `<span>Stake $</span>`;
  const stakeIn = document.createElement("input");
  stakeIn.type = "number";
  stakeIn.min = "0.01";
  stakeIn.step = "0.01";
  stakeIn.value = String(stake);
  stakeIn.addEventListener("change", () => {
    const amount = Math.round(Math.min(Math.max(Number(stakeIn.value) || 5, 0.01), 100000) * 100) / 100;
    stakeIn.value = String(amount);
    if (typeof savePatch === "function") savePatch(row.id, { stake: amount });
    if (row.id === window.parlayOpenId) window.parlayStake = amount;
    manageRefresh();
  });
  stakeRow.append(stakeIn);

  const legs = document.createElement("ul");
  legs.className = "manage-legs";
  (row.legs || []).forEach((leg, index) => {
    const item = document.createElement("li");
    item.className = "manage-leg";
    const top = document.createElement("div");
    top.className = "manage-leg-top";
    const match = document.createElement("span");
    match.className = "manage-leg-match";
    match.textContent = (typeof gameShort === "function" && leg.match ? gameShort(leg.match) : leg.match) || "";
    top.append(match);
    if (leg.market) {
      const market = document.createElement("span");
      market.className = "manage-leg-market";
      market.textContent = `· ${leg.market}`;
      top.append(market);
    }

    if (row.locked) {
      const edits = document.createElement("div");
      edits.className = "manage-leg-edits";
      const labelIn = document.createElement("input");
      labelIn.type = "text";
      labelIn.className = "manage-leg-label";
      labelIn.value = leg.label || "";
      labelIn.setAttribute("aria-label", "Prop / line");
      labelIn.addEventListener("change", () => {
        if (typeof saveLegPatch === "function") saveLegPatch(row.id, index, { label: labelIn.value.trim() || leg.label });
        manageRefresh();
      });
      const oddsIn = document.createElement("input");
      oddsIn.type = "text";
      oddsIn.className = "manage-leg-odds";
      oddsIn.value = Number(leg.odds) > 0 ? `+${leg.odds}` : String(leg.odds ?? "");
      oddsIn.setAttribute("aria-label", "Odds");
      oddsIn.addEventListener("change", () => {
        const n = manageParseOdds(oddsIn.value);
        if (n == null) { oddsIn.value = Number(leg.odds) > 0 ? `+${leg.odds}` : String(leg.odds ?? ""); return; }
        if (typeof saveLegPatch === "function") saveLegPatch(row.id, index, { odds: n });
        manageRefresh();
      });
      edits.append(labelIn, oddsIn);
      item.append(top, edits);
    } else {
      const line = document.createElement("p");
      line.className = "manage-leg-line";
      const american = Number(leg.odds) > 0 ? `+${leg.odds}` : String(leg.odds ?? "");
      line.textContent = [leg.label, american].filter(Boolean).join(" · ");
      item.append(top, line);
    }
    legs.append(item);
  });

  const openBet = () => {
    if (card.closest(".manage-pick")) {
      if (row.id === window.parlayOpenId) {
        if (typeof saveCollapseForBet === "function") saveCollapseForBet();
        if (typeof paintParlay === "function") paintParlay();
        return;
      }
      if (typeof saveOpen === "function") saveOpen(row.id);
      return;
    }
    if (typeof birdMenu === "function") birdMenu("find");
    setTimeout(() => { if (typeof saveOpen === "function") saveOpen(row.id); }, 80);
  };
  const dropBet = () => {
    if (typeof saveDrop === "function") saveDrop(row.id);
    manageRefresh();
  };

  const kill = document.createElement("button");
  kill.type = "button";
  kill.className = "manage-x";
  kill.setAttribute("aria-label", "Delete");
  kill.title = "Delete";
  kill.textContent = "×";
  kill.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropBet();
  });

  const acts = document.createElement("div");
  acts.className = "manage-acts";
  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = row.locked ? "manage-act unlock" : "manage-act lock";
  lock.textContent = row.locked ? "Unlock" : "Lock in";
  lock.addEventListener("click", () => {
    if (row.locked) { if (typeof saveUnlock === "function") saveUnlock(row.id); }
    else if (typeof saveLock === "function") saveLock(row.id);
    manageRefresh();
  });
  const open = document.createElement("button");
  open.type = "button";
  open.className = "manage-act";
  open.textContent = "Open";
  open.addEventListener("click", openBet);
  const track = document.createElement("button");
  track.type = "button";
  track.className = "manage-act";
  track.textContent = "Track";
  track.addEventListener("click", () => { window.location.href = "/live"; });
  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "manage-act danger";
  drop.textContent = "Delete";
  drop.addEventListener("click", dropBet);
  acts.append(lock, open, track, drop);

  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.title = "Open bet";
  card.addEventListener("click", (event) => {
    if (event.target.closest(".manage-x, .manage-acts, .manage-stake, .manage-leg-edits, input, button, label, a")) return;
    const zoom = Number((card.closest(".manage-board") || {}).dataset.manageZoom);
    if (zoom === 0 || zoom === 1) openBet();
  });
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target !== card) return;
    const zoom = Number((card.closest(".manage-board") || {}).dataset.manageZoom);
    if (zoom !== 0 && zoom !== 1) return;
    event.preventDefault();
    openBet();
  });

  card.append(kill, line, head, compact, meta, stakeRow, legs, acts);
  return card;
}

function paintManage(keep) {
  window.asking = true;
  if (document.body.classList.contains("tv-zoom-on") && typeof tvZoomShut === "function") tvZoomShut();
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { if (window.goFull) goFull(); }
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; return; }
  desk.classList.remove("bird-on", "solo", "dug");
  if (window.tvForce) tvForce();
  if (window.tvPush) tvPush();
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  if (window.tvTickStay) tvTickStay();
  else {
    const tick = document.getElementById("tv-tick");
    if (tick) tick.hidden = true;
  }
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  let board = keep && keep.isConnected ? keep : null;
  if (!board) {
    document.querySelectorAll(".rec-board").forEach((node) => node.remove());
    board = document.createElement("div");
    board.className = "rec-board find-board manage-board";
    board.dataset.page = "manage";
    const hold = document.getElementById("desk-hold");
    if (hold) [...row.children].forEach((node) => hold.append(node));
    row.append(board);
    row.scrollTop = 0;
  }

  manageFill(board);
}

function manageFill(board, opts) {
  const inline = !!(opts && opts.inline);
  const list = typeof saveList === "function" ? saveList() : [];
  const shown = list.filter((item) => {
    if (manageFilter === "locked") return !!item.locked;
    if (manageFilter === "open") return !item.locked;
    return true;
  });
  board.classList.add("manage-board");
  board.replaceChildren();
  if (!inline) {
    const head = document.createElement("div");
    head.className = "manage-head";
    const title = document.createElement("h2");
    title.textContent = "Manage my bets";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "manage-back";
    back.textContent = "← Build a bet";
    back.addEventListener("click", () => { if (typeof birdMenu === "function") birdMenu("find"); });
    head.append(title, back);
    board.append(head);
  }
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
    if (!inline) {
      const go = document.createElement("button");
      go.type = "button";
      go.className = "manage-act lock";
      go.textContent = "Build a bet";
      go.addEventListener("click", () => { if (typeof birdMenu === "function") birdMenu("find"); });
      none.append(go);
    }
    board.append(none);
    return;
  }
  const bag = document.createElement("div");
  bag.className = "manage-list";
  shown.forEach((item) => bag.append(manageCard(item)));
  board.append(bag);
}

window.paintManage = paintManage;
