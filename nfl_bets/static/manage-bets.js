/** Manage My Bets: every saved ticket, lock-as-placed, stake and line edits. */

let manageFilter = "all";

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
}

function manageCard(row) {
  const card = document.createElement("article");
  card.className = `manage-card${row.locked ? " locked" : ""}`;
  card.dataset.id = row.id;

  const head = document.createElement("header");
  head.className = "manage-card-head";
  const title = document.createElement("h3");
  title.textContent = manageTitle(row);
  const badge = document.createElement("span");
  badge.className = "manage-badge";
  badge.textContent = row.locked ? "Locked in" : "Open";
  head.append(title, badge);

  const meta = document.createElement("p");
  meta.className = "manage-meta";
  const stake = Number(row.stake) > 0 ? Number(row.stake) : 5;
  const odds = manageOddsSaid(row);
  const win = manageCash(stake, row.legs);
  meta.innerHTML = [
    `${(row.legs || []).length}-leg`,
    manageGames(row) && esc(manageGames(row)),
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
  open.addEventListener("click", () => {
    if (typeof birdMenu === "function") birdMenu("find");
    setTimeout(() => { if (typeof saveOpen === "function") saveOpen(row.id); }, 80);
  });
  const track = document.createElement("button");
  track.type = "button";
  track.className = "manage-act";
  track.textContent = "Track";
  track.addEventListener("click", () => { window.location.href = "/live"; });
  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "manage-act danger";
  drop.textContent = "Delete";
  drop.addEventListener("click", () => {
    if (typeof saveDrop === "function") saveDrop(row.id);
    manageRefresh();
  });
  acts.append(lock, open, track, drop);

  card.append(head, meta, stakeRow, legs, acts);
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

  const list = typeof saveList === "function" ? saveList() : [];
  const shown = list.filter((item) => {
    if (manageFilter === "locked") return !!item.locked;
    if (manageFilter === "open") return !item.locked;
    return true;
  });

  board.replaceChildren();
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

  board.append(head, filters);

  if (!shown.length) {
    const none = document.createElement("div");
    none.className = "manage-empty";
    const say = document.createElement("p");
    say.textContent = list.length ? "Nothing in this filter." : "No bets saved yet.";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "manage-act lock";
    go.textContent = "Build a bet";
    go.addEventListener("click", () => { if (typeof birdMenu === "function") birdMenu("find"); });
    none.append(say, go);
    board.append(none);
    return;
  }

  const bag = document.createElement("div");
  bag.className = "manage-list";
  shown.forEach((item) => bag.append(manageCard(item)));
  board.append(bag);
}

window.paintManage = paintManage;
