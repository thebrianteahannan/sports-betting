/** Manage My Bets: every saved ticket, lock-as-placed, stake and line edits. */

let manageFilter = "all";
let manageEditId = "";
const MANAGE_ZOOM_MAX = 3;
function manageZoomStart() {
  return 0;
}
let manageZoom = manageZoomStart();
let manageZoomDrag = false;
const manageCardZoom = new Map();

function manageZoomApply(next, opts) {
  const quiet = !!(opts && opts.quiet);
  manageZoom = Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(Number(next) || 0)));
  const mark = (board) => { if (board) board.dataset.manageZoom = String(manageZoom); };
  document.querySelectorAll(".manage-board").forEach(mark);
  if (opts && opts.board) mark(opts.board);
  manageCardZoom.clear();
  document.querySelectorAll(".manage-card").forEach((card) => {
    card.dataset.manageZoom = String(manageZoom);
    const box = card.querySelector(".manage-card-range");
    if (box) {
      box.value = String(manageZoom);
      box.setAttribute("aria-valuenow", String(manageZoom));
    }
  });
  if (!quiet && !manageZoomDrag) {
    document.querySelectorAll("input.manage-zoom-range").forEach((box) => {
      box.value = String(manageZoom);
      box.setAttribute("aria-valuenow", String(manageZoom));
    });
  }
  try { localStorage.setItem("manageZoom", String(manageZoom)); } catch (error) {}
  if (!(opts && opts.filling)) manageZoomExtras();
}

function manageCardLevel(id) {
  return manageCardZoom.has(id) ? manageCardZoom.get(id) : manageZoom;
}

function manageZoomBar(card) {
  const bar = document.createElement("label");
  bar.className = card ? "manage-zoom manage-card-zoom" : "manage-zoom";
  const level = () => card ? manageCardLevel(card.dataset.id) : manageZoom;
  const less = document.createElement("span");
  less.textContent = "Less";
  const more = document.createElement("span");
  more.textContent = "More";
  const input = document.createElement("input");
  input.type = "range";
  input.className = card ? "manage-card-range" : "manage-zoom-range";
  input.min = "0";
  input.max = String(MANAGE_ZOOM_MAX);
  input.step = "any";
  input.value = String(level());
  input.setAttribute("aria-valuemin", "0");
  input.setAttribute("aria-valuemax", String(MANAGE_ZOOM_MAX));
  input.setAttribute("aria-valuenow", String(level()));
  input.setAttribute("aria-label", card ? "Show more or less on this bet" : "Show more or less on each bet");
  const end = () => {
    manageZoomDrag = false;
    const snapped = Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(Number(input.value) || 0)));
    input.value = String(snapped);
    input.setAttribute("aria-valuenow", String(snapped));
    if (!card) manageZoomApply(snapped);
    else {
      manageCardZoom.set(card.dataset.id, snapped);
      card.dataset.manageZoom = String(snapped);
    }
  };
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("pointerdown", (event) => {
    manageZoomDrag = true;
    event.stopPropagation();
    try { input.setPointerCapture(event.pointerId); } catch (error) {}
  });
  input.addEventListener("pointerup", end);
  input.addEventListener("pointercancel", end);
  input.addEventListener("lostpointercapture", end);
  input.addEventListener("input", () => {
    manageZoomDrag = true;
    const next = Math.max(0, Math.min(MANAGE_ZOOM_MAX, Math.round(Number(input.value) || 0)));
    input.setAttribute("aria-valuenow", String(next));
    if (!card) manageZoomApply(next, { quiet: true });
    else {
      manageCardZoom.set(card.dataset.id, next);
      card.dataset.manageZoom = String(next);
    }
  });
  input.addEventListener("change", end);
  if (card) bar.append(input);
  else bar.append(less, input, more);
  if (typeof rowSlide === "function") rowSlide(input);
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

function manageNextLine(rows) {
  const line = document.createElement("p");
  line.className = "manage-next";
  const settled = (typeof bankBook !== "undefined" && bankBook.settled) || {};
  const now = Date.now();
  let best = null;
  (rows || []).forEach((row) => {
    if (!row || settled[row.id]) return;
    (row.legs || []).forEach((leg) => {
      const at = Date.parse(leg.kickoff || "");
      if (!(at > now)) return;
      const game = typeof gameShort === "function" && leg.match ? gameShort(leg.match) : "";
      if (!game) return;
      if (!best || at < best.at) best = { at, kick: leg.kickoff, games: new Set([game]) };
      else if (at === best.at) best.games.add(game);
    });
  });
  if (!best) { line.hidden = true; return line; }
  const when = typeof window.when === "function" ? window.when(best.kick) : "";
  line.append(`Next up is ${[...best.games].join(" and ")}${when ? `, ${when} ET. ` : ". "}`);
  const until = document.createElement("span");
  until.className = "find-until";
  until.dataset.kick = best.kick;
  if (typeof gameUntilPaint === "function") gameUntilPaint(until);
  line.append(until);
  return line;
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
  if (!prop || /^(over|under)(\s+[\d.]+)?$/i.test(prop)) {
    const unit = String(leg.market || "").replace(who, "").replace(/^\s*-\s*/, "").replace(/^(alt(?:ernate)?|total|player)\s+/i, "").replace(/^\d+\+\s*/, "").trim().toLowerCase();
    if (unit && unit !== who.toLowerCase() && !prop.toLowerCase().includes(unit)) prop = [prop, unit].filter(Boolean).join(" ");
  }
  if (/any\s*time\s*touchdown/i.test(prop)) prop = "Anytime TD";
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

function managePickOf(leg) {
  if (!leg || typeof homeRecs === "undefined" || !homeRecs) return null;
  const picks = [homeRecs.golden, homeRecs.silver, homeRecs.bronze, ...(homeRecs.picks || [])].filter(Boolean);
  const label = String(leg.label || ""), market = String(leg.market || ""), match = String(leg.match || "");
  const game = (pick) => !match || !pick.match || pick.match === match;
  const hit = picks.find((pick) => pick.label === label && String(pick.market || "") === market && game(pick)) || picks.find((pick) => pick.label === label && game(pick));
  if (hit) return hit;
  const fold = (text) => String(text || "").toLowerCase().replace(/\btouchdowns\b/g, "tds").replace(/\btouchdown\b/g, "td").replace(/\byards\b/g, "yds").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
  const want = fold(`${label} ${market}`).split(" ").filter((word) => word.length > 1 && !/^(over|under|alt|player)$/.test(word));
  return want.length ? picks.find((pick) => game(pick) && want.every((word) => fold(`${pick.label} ${pick.market}`).includes(word))) || null : null;
}

function manageTags(legs) {
  const box = document.createElement("div");
  box.className = "manage-tags";
  const seen = new Set();
  (legs || []).forEach((leg) => {
    const pick = managePickOf(leg);
    if (!pick || seen.has(`${pick.label}|${pick.market}|${pick.match}`)) return;
    seen.add(`${pick.label}|${pick.market}|${pick.match}`);
    const row = document.createElement("p");
    row.className = "manage-tag-row";
    const tags = typeof scriptPickTags === "function" ? scriptPickTags(pick) : "";
    const how = String(pick.how || "").trim();
    const rec = pick.tier === "good" ? "" : `<i class="manage-rec">Recommended</i>`;
    const edge = typeof manageEdgeTag === "function" ? manageEdgeTag(pick) : "";
    row.innerHTML = `${rec}${tags}${edge}${how ? `<span class="manage-how">${esc(how)}</span>` : ""}`;
    if (row.textContent.trim()) box.append(row);
    if (typeof recMoreAttach === "function") recMoreAttach(pick, box);
  });
  if (!box.childElementCount) box.hidden = true;
  box.addEventListener("click", (event) => event.stopPropagation());
  return box;
}

function manageTagsWait(board) {
  if (!board || board.dataset.tagsWait) return;
  if (typeof homeRecs !== "undefined" && homeRecs && !homeRecs.loading) return;
  board.dataset.tagsWait = "1";
  if (typeof homeRecsLoad === "function") homeRecsLoad("auto");
  let tries = 0;
  const wait = setInterval(() => {
    const ready = typeof homeRecs !== "undefined" && homeRecs && !homeRecs.loading;
    if (!board.isConnected || ready || ++tries > 20) {
      clearInterval(wait);
      if (board.isConnected && ready) manageFill(board);
    }
  }, 300);
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

const MANAGE_ROLE = { anchor: "Anchor", juice: "Pays", filler: "Filler", dead: "Dead weight" };

function manageSlipGame(legs) {
  const games = typeof trayLive !== "undefined" && trayLive.games ? trayLive.games : [];
  return games.find((game) => typeof liveMine === "function" && liveMine(game, legs).length) || null;
}

function manageSlipLive(legs) {
  const game = manageSlipGame(legs);
  if (!game) return "";
  const text = game.final ? "Final" : `Live · ${game.clock || ""}`.trim();
  return `<i class="tray-live${game.final ? " done" : ""}">${esc(text)}</i>`;
}

function manageSlipPace(leg) {
  const game = manageSlipGame([leg]);
  if (!game || game.final || typeof liveLegRead !== "function" || typeof liveLegState !== "function") return "";
  const read = liveLegState(game, liveLegRead(leg));
  if (!read || !read.say || !game.id) return "";
  const pace = read.state || (read.level ? `pace-${read.level}` : "");
  return `<a class="manage-pace ${esc(pace)}" href="${esc(`/live?${new URLSearchParams({ game: game.id, only: "1" })}`)}"${read.tip ? ` title="${esc(read.tip)}"` : ""}>${esc(read.say)}</a>`;
}

function manageSlipRec(legs) {
  const pick = (legs || []).map(managePickOf).find(Boolean);
  if (!pick) return "";
  if (pick.golden) return `<i class="rc">Golden Ticket</i>`;
  if (pick.silver) return `<i class="rc">Silver Ticket</i>`;
  if (pick.bronze) return `<i class="rc">Bronze Ticket</i>`;
  if (pick.tier !== "good") return `<i class="rc">Recommended</i>`;
  return "";
}

function manageSpot(who) {
  if (!who || typeof plainName !== "function" || typeof clubOf === "undefined") return "";
  const bare = plainName(who).replace(/ (jr|sr|ii|iii|iv|v)$/i, "");
  const side = clubOf.get(bare) || "";
  const pos = typeof clubSpot !== "undefined" ? (clubSpot.get(bare) || "") : "";
  const nick = side && typeof clubNick === "function" ? clubNick("", side) : "";
  return [pos, nick].filter(Boolean).join(" · ");
}

function manageLegLine(leg, legs, byKey) {
  const bits = manageLegRead(leg);
  const role = byKey && byKey.get(typeof parlayKey === "function" ? parlayKey(leg) : "");
  const pick = managePickOf(leg);
  const spot = manageSpot(bits.who);
  const line = document.createElement("div");
  line.className = "find-chose";
  const said = document.createElement("span");
  said.innerHTML = [
    bits.who && `<i class="who">${esc(bits.who)}</i>`,
    spot && `<i class="spot">${esc(spot)}</i>`,
    bits.game && `<i class="game">${esc(bits.game)}</i>`,
    bits.prop && `<i class="prop">${esc(bits.prop)}</i>`,
    bits.odds && `<i class="px">${esc(bits.odds)}</i>`,
    bits.pct && `<i class="pct">${esc(bits.pct)}</i>`,
    role && MANAGE_ROLE[role.role] && !(legs.length < 2 && role.role === "anchor") && `<i class="leg-role r-${esc(role.role)}">${esc(MANAGE_ROLE[role.role])}</i>`,
    pick && ((typeof scriptGoldenTag === "function" && scriptGoldenTag(pick)) || (pick.tier !== "good" ? `<i class="manage-rec">Recommended</i>` : "")),
    manageSlipPace(leg),
  ].filter(Boolean).join("");
  line.append(said);
  if (typeof manageLegEdit === "function") manageLegEdit(line, said, leg);
  const note = typeof manageLegNote === "function" ? manageLegNote(leg) : null;
  if (note) line.append(note);
  return line;
}

function manageFold(legs, odds, pct, pay, byKey) {
  const fold = document.createElement("div");
  fold.className = "manage-fold";
  const top = document.createElement("div");
  top.className = "manage-fold-line";
  const price = document.createElement("span");
  price.className = "manage-bet-price";
  price.innerHTML = [odds && `<i class="px">${esc(odds)}</i>`, pct && `<i class="pct">${esc(pct)}</i>`, pay && `<i class="pay">${esc(pay)}</i>`].filter(Boolean).join("");
  top.append(price);
  const legsLine = document.createElement("div");
  legsLine.className = "manage-fold-legs";
  legs.forEach((leg) => legsLine.append(manageLegLine(leg, legs, byKey)));
  fold.append(top, legsLine);
  return fold;
}

function manageSlip(row) {
  const slip = document.createElement("div");
  slip.className = "manage-slip";
  const legs = row.legs || [];
  const stake = Number(row.stake) > 0 ? Number(row.stake) : 5;
  const odds = manageOddsSaid(row);
  const oddsNum = manageParseOdds(odds);
  const pct = oddsNum != null && typeof findPct === "function" ? findPct(oddsNum) : "";
  const cash = oddsNum != null && typeof findCash === "function" ? findCash(oddsNum, stake) : "";
  const games = typeof gameShortList === "function" ? gameShortList(legs).split(", ").filter(Boolean) : [];
  const head = document.createElement("b");
  head.className = "manage-slip-head";
  head.innerHTML = [
    odds && `<i class="px">${esc(odds)}</i>`,
    pct && `<i class="pct">${esc(pct)}</i>`,
    cash && `<i class="pay">$${esc(manageMoney(stake))} profits ${esc(cash)}</i>`,
    games.map((game) => `<i class="gm">${esc(game)}</i>`).join(""),
    manageSlipLive(legs),
    manageSlipRec(legs),
  ].filter(Boolean).join("");
  slip.append(head);
  const roles = typeof legRoles === "function" ? legRoles(legs) : [];
  const byKey = new Map(roles.map((item) => [typeof parlayKey === "function" ? parlayKey(item.bet) : "", item]));
  legs.forEach((leg) => slip.append(manageLegLine(leg, legs, byKey)));
  return slip;
}

function manageCard(row, n) {
  const card = document.createElement("article");
  card.className = `manage-card${(row.legs || []).length > 1 ? " parlay" : ""}${row.locked ? " locked" : ""}${row.id === window.parlayOpenId ? " on" : ""}${manageEditId === row.id ? " editing" : ""}`;
  card.dataset.id = row.id;
  card.dataset.manageZoom = String(manageCardLevel(row.id));
  const legs = row.legs || [];
  const stake = Number(row.stake) > 0 ? Number(row.stake) : 5;
  const odds = manageOddsSaid(row);
  const oddsNum = manageParseOdds(odds);
  const pct = oddsNum != null && typeof findPct === "function" ? findPct(oddsNum) : "";
  const cash = oddsNum != null && typeof findCash === "function" ? findCash(oddsNum, stake) : "";
  const pay = cash ? `$${manageMoney(stake)} profits ${cash}` : "";
  const legsBox = document.createElement("div");
  legsBox.className = "manage-legs";
  if (odds || pct || pay) {
    const head = document.createElement("p");
    head.className = "manage-bet-price";
    head.innerHTML = [odds && `<i class="px">${esc(odds)}</i>`, pct && `<i class="pct">${esc(pct)}</i>`, pay && `<i class="pay">${esc(pay)}</i>`].filter(Boolean).join("");
    legsBox.append(head);
  }
  const roles = typeof legRoles === "function" ? legRoles(legs) : [];
  const byKey = new Map(roles.map((item) => [typeof parlayKey === "function" ? parlayKey(item.bet) : "", item]));
  legs.forEach((leg) => legsBox.append(manageLegLine(leg, legs, byKey)));
  legsBox.append(manageTags(legs));
  const fold = legs.length > 1 ? manageFold(legs, odds, pct, pay, byKey) : null;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "manage-open";
  open.textContent = manageEditId === row.id ? "Done" : "Edit";
  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "manage-drop";
  drop.textContent = "×";
  drop.setAttribute("aria-label", "Delete");
  drop.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof saveDrop === "function") saveDrop(row.id);
  });
  const acts = document.createElement("span");
  acts.className = "manage-card-acts";
  acts.append(manageZoomBar(card), open, typeof manageLockBtn === "function" ? manageLockBtn(row) : "", drop);
  const num = document.createElement("b");
  num.className = "manage-n";
  num.textContent = String(n);
  card.append(num, legsBox, acts, manageSlip(row));
  if (fold) card.insertBefore(fold, acts);
  if (typeof bankCard === "function") bankCard(card, row);
  const openBet = () => {
    if (manageEditId && manageEditId !== row.id) {
      manageEditId = "";
      if (typeof legSwapOpen !== "undefined") legSwapOpen.clear();
    }
    if (typeof saveOpen === "function" && row.id !== window.parlayOpenId) saveOpen(row.id);
  };
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.title = "View bet";
  open.addEventListener("click", (event) => {
    event.stopPropagation();
    if (manageEditId === row.id) {
      manageEditId = "";
      if (typeof legSwapOpen !== "undefined") legSwapOpen.clear();
      manageRefresh();
      return;
    }
    manageEditId = row.id;
    if (typeof legSwapOpen !== "undefined") legSwapOpen.clear();
    if (typeof saveOpen === "function" && row.id !== window.parlayOpenId) saveOpen(row.id);
    else manageRefresh();
  });
  card.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, form, .find-tray-swap, .manage-card-zoom")) return;
    openBet();
  });
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target !== card) return;
    event.preventDefault();
    openBet();
  });
  return card;
}


function manageFill(board) {
  const page = board.closest(".find-board");
  const kept = page && page.querySelector(".manage-search-keep");
  if (kept) page.append(kept);
  const list = typeof saveList === "function" ? saveList() : [];
  if (typeof manageClubs === "function") manageClubs(list);
  const shown = list.filter((item) => typeof manageShown === "function" ? manageShown(item) : true);
  board.classList.add("manage-board");
  board.replaceChildren();
  const filters = document.createElement("div");
  filters.className = "manage-filters";
  if (typeof manageFilters === "function") manageFilters(filters);
  filters.append(manageZoomBar());
  board.append(filters);
  if (typeof bankBar === "function") board.append(bankBar());
  board.append(manageNextLine(shown));
  manageZoomApply(manageZoom, { quiet: true, board, filling: true });
  if (!shown.length) {
    const none = document.createElement("div");
    none.className = "manage-empty";
    const say = document.createElement("p");
    say.textContent = list.length ? "Nothing in this filter." : "No bets saved yet.";
    none.append(say);
    if (!list.length) {
      const start = document.createElement("button");
      start.type = "button";
      start.className = "manage-start";
      start.textContent = "Start a new bet";
      start.addEventListener("click", () => { if (typeof quickAddOpen === "function") quickAddOpen(); });
      none.append(start);
    }
    board.append(none);
    manageZoomExtra(board);
    return;
  }
  const bag = document.createElement("div");
  bag.className = "manage-list";
  shown.forEach((item, at) => bag.append(manageCard(item, at + 1)));
  board.append(bag);
  manageTagsWait(board);
  if (typeof trayLive !== "undefined" && trayLive.at) board.dataset.liveAt = String(trayLive.at);
  if (typeof trayLiveLoad === "function") trayLiveLoad();
  manageZoomExtra(board);
}

