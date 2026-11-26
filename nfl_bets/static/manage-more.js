/** The search block is the last Less/More stop in My Bets. */

function manageSearchHost(page) {
  if (!page) return null;
  let host = page.querySelector(".manage-search-keep");
  if (!host) {
    host = document.createElement("div");
    host.className = "manage-search-keep";
    page.append(host);
  }
  return host;
}

function manageSearchTake(profile) {
  const page = document.querySelector(".find-board");
  if (!page || page.dataset.page !== "find") return;
  const host = manageSearchHost(page);
  if (!host || !profile) return;
  host.replaceChildren(profile);
  const pop = document.getElementById("find-profile-pop");
  if (pop) pop.remove();
  if (typeof closePlayerPop === "function" && closePlayerPop.onKey) {
    document.removeEventListener("keydown", closePlayerPop.onKey);
    closePlayerPop.onKey = null;
  }
  host.dataset.from = "search";
  if (typeof manageZoomApply === "function") manageZoomApply(typeof MANAGE_ZOOM_MAX === "number" ? MANAGE_ZOOM_MAX : 3);
}

function manageProfileNames() {
  const rows = typeof saveList === "function" ? saveList() : [];
  const names = [];
  rows.forEach((row) => (row.legs || []).forEach((leg) => {
    const raw = String(leg.label || "").split(/\s+—\s+/)[0].trim();
    const who = String(leg.player || "").trim() || raw.split(/\d/)[0].replace(/\s+(over|under)\b.*$/i, "").trim();
    if (who && !names.includes(who)) names.push(who);
  }));
  return names;
}

function manageProfilePerson(page, name) {
  const fold = typeof plainName === "function" ? plainName(name) : String(name || "").toLowerCase();
  const found = ((page && page.people) || []).find((person) => person.kind === "player" && (typeof plainName === "function" ? plainName(person.name) : String(person.name || "").toLowerCase()) === fold);
  return found || null;
}

function manageProfileFill(host, page, board) {
  if (host.dataset.from === "search" && host.querySelector(".find-profile")) return;
  const names = manageProfileNames();
  const people = names.map((name) => manageProfilePerson(page, name)).filter(Boolean);
  if (names.length && !(page.people || []).length && host.dataset.wait !== "1") {
    host.dataset.wait = "1";
    setTimeout(() => { host.dataset.wait = ""; if (board.isConnected) manageZoomExtra(board); }, 500);
    return;
  }
  if (!people.length) {
    if (!host.childElementCount) host.append(Object.assign(document.createElement("p"), { className: "manage-empty", textContent: "Type a player, team or game." }));
    return;
  }
  const key = people.map((person) => person.key || person.name).join("|");
  if (host.dataset.names === key && host.querySelector(".find-profile")) return;
  host.dataset.names = key;
  host.dataset.from = "bets";
  host.replaceChildren();
  const list = page.querySelector(".find-list");
  people.forEach((person) => {
    const slot = document.createElement("div");
    slot.className = "manage-profile-slot";
    host.append(slot);
    if (typeof openPlayerPop === "function") openPlayerPop(person, list, person.bets, null, slot);
  });
}

let manageWhen = "today";

function manageEtParts(when) {
  const at = when == null ? Date.now() : typeof when === "number" ? when : Date.parse(when);
  if (!Number.isFinite(at)) return null;
  const bag = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(at)).forEach((part) => { if (part.type !== "literal") bag[part.type] = part.value; });
  if (!bag.year || !bag.month || !bag.day) return null;
  return { key: `${bag.year}-${bag.month}-${bag.day}`, weekday: bag.weekday };
}

function manageWhenOk(row) {
  if (manageWhen === "all") return true;
  const now = manageEtParts();
  const days = (row.legs || []).map((leg) => manageEtParts(leg.kickoff)).filter(Boolean).map((part) => part.key);
  if (!now || !days.length) return false;
  if (manageWhen === "today") return days.includes(now.key);
  const left = { Sun: 0, Mon: 6, Tue: 5, Wed: 4, Thu: 3, Fri: 2, Sat: 1 }[now.weekday] || 0;
  const end = manageEtParts(Date.parse(`${now.key}T16:00:00Z`) + left * 86400000);
  return !!end && days.some((key) => key >= now.key && key <= end.key);
}

function manageShown(row) {
  if (typeof manageFilter !== "undefined" && manageFilter === "locked" && !(row && row.locked)) return false;
  if (typeof manageFilter !== "undefined" && manageFilter === "open" && row && row.locked) return false;
  return manageWhenOk(row);
}

function manageFilters(box) {
  const chip = (parent, label, on, pick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `manage-filter${on ? " on" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => { pick(); if (typeof manageRefresh === "function") manageRefresh(); });
    parent.append(button);
  };
  [["all", "All"], ["locked", "Locked"], ["open", "Still Building"]].forEach(([key, label]) => chip(box, label, manageFilter === key, () => { manageFilter = key; }));
  const when = document.createElement("span");
  when.className = "manage-when";
  [["all", "Any day"], ["today", "Today"], ["week", "This week"]].forEach(([key, label]) => chip(when, label, manageWhen === key, () => { manageWhen = key; }));
  box.append(when);
}

function manageBankSpan(row, span) {
  if (!span || span === "all") return true;
  const saved = manageWhen;
  manageWhen = span;
  const ok = manageWhenOk(row);
  manageWhen = saved;
  return ok;
}

function manageBankPlan(span) {
  const list = typeof saveList === "function" ? saveList() : [];
  const book = typeof bankBook !== "undefined" ? bankBook : {};
  const out = book.out || {};
  const settled = book.settled || {};
  return Math.round(list.reduce((sum, row) => {
    if (!row || settled[row.id] || !manageBankSpan(row, span)) return sum;
    if (out[row.id]) return sum + (Number(out[row.id].stake) || 0);
    if (row.locked) return sum + (typeof saveRowStake === "function" ? saveRowStake(row) : Number(row.stake) || 0);
    const kelly = typeof bankKelly === "function" ? bankKelly(row.legs || []) : null;
    const stake = kelly && kelly.edge && kelly.bet > 0 ? Number(kelly.bet) : (typeof saveRowStake === "function" ? saveRowStake(row) : Number(row.stake) || 0);
    return sum + (Number(stake) || 0);
  }, 0) * 100) / 100;
}

function manageBankTake(span) {
  const list = typeof saveList === "function" ? saveList() : [];
  const book = typeof bankBook !== "undefined" ? bankBook : {};
  const out = book.out || {};
  const settled = book.settled || {};
  return list.reduce((sum, row) => {
    if (!row || settled[row.id] || !manageBankSpan(row, span)) return sum;
    const kelly = typeof bankKelly === "function" ? bankKelly(row.legs || []) : null;
    const saved = typeof saveRowStake === "function" ? saveRowStake(row) : Number(row.stake) || 0;
    const stake = out[row.id] ? Number(out[row.id].stake) || 0 : row.locked ? saved : kelly && kelly.edge && kelly.bet > 0 ? Number(kelly.bet) : saved;
    const win = typeof saveRowWin === "function" ? saveRowWin(row) : 0;
    const profit = saved > 0 ? stake * win / saved : 0;
    const p = kelly && kelly.p > 0 ? kelly.p : 0;
    sum.stake += stake;
    sum.profit += profit;
    if (p) sum.ev += p * profit - (1 - p) * stake;
    return sum;
  }, { stake: 0, profit: 0, ev: 0 });
}

function manageBankTakeSay(span) {
  const take = manageBankTake(span);
  if (!(take.stake > 0)) return "";
  const money = (n) => { const v = Math.round(Number(n) * 100) / 100; return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2); };
  const ev = Math.round(take.ev * 100) / 100;
  return `$${money(take.stake)} in, $${money(take.profit)} profit if all win, expected ${ev < 0 ? "-" : ""}$${money(Math.abs(ev))}`;
}

function manageBankRolls() {
  try { return JSON.parse(localStorage.getItem("pod-bank-rolls") || "") || {}; } catch (error) { return {}; }
}

function manageBankRoll(span) {
  const set = Number(manageBankRolls()[span]);
  if (Number.isFinite(set) && set >= 0) return set;
  return typeof bankRoll === "function" ? bankRoll() : 0;
}

function manageBankRollSet(span, roll) {
  const n = Math.round(Number(roll) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > 1000000) return;
  const rolls = manageBankRolls();
  rolls[span] = n;
  try { localStorage.setItem("pod-bank-rolls", JSON.stringify(rolls)); } catch (error) {}
  if (typeof bankPaint === "function") bankPaint();
}

function manageClubs(rows) {
  if (typeof clubOf === "undefined" || typeof clubAsked === "undefined") return;
  const sides = [];
  (rows || []).forEach((row) => (row.legs || []).forEach((leg) => {
    const sport = String(leg.sport || "");
    String(leg.match || "").split(/ @ | v /).map((side) => side.trim()).filter(Boolean).forEach((side) => {
      const key = `${sport}|${side}`;
      if (clubAsked.has(key)) return;
      clubAsked.add(key);
      sides.push({ sport, side, key });
    });
  }));
  if (!sides.length) return;
  let left = sides.length;
  let grew = false;
  sides.forEach(({ sport, side, key }) => {
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: side, sport }) })
      .then((res) => res.json())
      .then((data) => {
        (data.players || []).forEach((row) => {
          const name = String((row && row.name) || row || "").replace(/, out$/, "");
          if (!name || typeof plainName !== "function") return;
          const bare = plainName(name).replace(/ (jr|sr|ii|iii|iv|v)$/i, "");
          if (!clubOf.has(bare)) grew = true;
          clubOf.set(bare, side);
          if (row && row.pos && typeof clubSpot !== "undefined") clubSpot.set(bare, String(row.pos));
        });
      })
      .catch(() => { clubAsked.delete(key); })
      .finally(() => {
        left -= 1;
        if (left > 0 || !grew || typeof manageRefresh !== "function") return;
        manageRefresh();
      });
  });
}

function manageEdgeTag(pick) {
  if (!pick || typeof edgeClaim !== "function") return "";
  const claim = edgeClaim(pick, pick.odds);
  if (!claim || !(claim.clear >= 3)) return "";
  const tip = typeof PRICE_EDGE_TIP === "string" ? PRICE_EDGE_TIP : "";
  return `<i class="desk-rec-edge" title="${esc(tip)}" data-tip="${esc(tip)}">Edge</i>`;
}

function manageZoomExtra() {}

function manageZoomExtras() {
  document.querySelectorAll(".find-board").forEach((page) => {
    const board = page.querySelector(".find-saved .manage-board");
    const host = page.querySelector(".manage-search-keep");
    if (board) board.querySelectorAll(":scope > .manage-history").forEach((node) => node.remove());
    if (host) page.append(host);
  });
}

function manageStatShort(label) {
  const raw = String(label || "").replace(/\s*\/\s*Game/i, "").trim();
  const known = { points: "Pts", pts: "Pts", assists: "Ast", rebounds: "Reb", "3pters": "3s", "3pt": "3s", "3pm": "3s", minutes: "Min", steals: "Stl", blocks: "Blk", turnovers: "TO", pra: "PRA", carries: "Car", "rec yds": "Rec", receptions: "Recs", targets: "Tgt", "rush yds": "Rush", "pass yds": "Pass", "pass td": "Pass TD", "rush td": "Rush TD" };
  return known[raw.toLowerCase()] || raw;
}

function manageStatOn(leg, label) {
  const text = `${leg && leg.label || ""} ${leg && leg.market || ""}`.toLowerCase();
  const name = String(label || "").toLowerCase();
  if (/any\s*time\s*touchdown|anytime td/.test(text)) return name === "td/game" || name === "rush td/game";
  const rules = [
    [/3\s*\+|three|3-?point|3pt/, "3pters/game"],
    [/pra|points\s*\+\s*reb|pts\s*\+\s*reb/, "pra/game"],
    [/pass(?:ing)?\s*(?:td|touchdown)/, "pass td/game"],
    [/rush(?:ing)?\s*(?:td|touchdown)/, "rush td/game"],
    [/pass(?:ing)?\s*(?:yd|yard)/, "pass yds/game"],
    [/rush(?:ing)?\s*(?:yd|yard)/, "rush yds/game"],
    [/rec(?:eiving)?\s*(?:yd|yard)/, "rec yds/game"],
    [/reception/, "receptions/game"],
    [/target/, "targets/game"],
    [/carr(?:y|ies)|rush(?:ing)?\s*attempt/, "carries/game"],
    [/steal/, "steals/game"],
    [/block/, "blocks/game"],
    [/rebound/, "rebounds/game"],
    [/assist/, "assists/game"],
    [/minute/, "minutes/game"],
    [/\bgoals?\b/, "goals/game"],
    [/\bshots?\b/, "shots/game"],
    [/\bpoints?\b|\bpts\b/, "pts/game"],
  ];
  return rules.some(([re, hit]) => re.test(text) && name === hit);
}

const MANAGE_STAT_GAME = {
  "pts/game": "pts", "assists/game": "ast", "rebounds/game": "reb", "3pters/game": "threes", "minutes/game": "min", "steals/game": "stl", "blocks/game": "blk", "pra/game": "pra",
  "td/game": "td", "rush td/game": "rushTd", "pass td/game": "passTd", "pass yds/game": "passYds", "rush yds/game": "rushYds", "rec yds/game": "recYds", "receptions/game": "rec", "carries/game": "car", "targets/game": "tgt",
  "goals/game": "goals", "points/game": "pts", "shots/game": "shots",
};

function manageStatCount(leg, stat, games) {
  const key = MANAGE_STAT_GAME[String(stat.label || "").toLowerCase()];
  const vals = key && games ? games.map((game) => Number(game[key])).filter((value) => Number.isFinite(value)) : [];
  const on = manageStatOn(leg, stat.label);
  const blob = `${(leg && leg.market) || ""} ${(leg && leg.label) || ""}`.toLowerCase();
  const line = on ? Number((blob.match(/\d+(?:\.\d+)?/) || [])[0]) : NaN;
  const under = on && /\bunder\b/.test(blob);
  const plus = on && /\+/.test(blob);
  if (vals.length >= 3) {
    const hits = vals.filter((n) => {
      if (!Number.isFinite(line)) return n >= 1;
      if (under) return n < line;
      if (plus) return n >= line;
      return n > line;
    }).length;
    const say = Number.isFinite(line) ? `Cleared ${line} in ${hits} of ${vals.length}` : `Showed up in ${hits} of ${vals.length}`;
    return { hits, n: vals.length, say };
  }
  const hits = Number(stat.hits), n = Number(stat.played);
  if (!(n >= 3) || !Number.isFinite(hits)) return null;
  return { hits, n, say: `Showed up in ${hits} of ${n}` };
}

function manageStatLine(kind, label, stats, leg, games) {
  const line = document.createElement("span");
  line.className = `manage-stat-line ${kind}`;
  const name = document.createElement("b");
  name.textContent = label;
  line.append(name);
  stats.forEach((stat) => {
    const bit = document.createElement("span");
    bit.className = "manage-stat";
    if (manageStatOn(leg, stat.label)) bit.classList.add("on");
    bit.append(document.createTextNode(`${manageStatShort(stat.label)} ${stat.value || ""}`.trim()));
    const hit = manageStatCount(leg, stat, games);
    if (hit) {
      const mark = document.createElement("i");
      mark.className = "hit";
      mark.textContent = ` · ${hit.hits}/${hit.n}`;
      mark.title = hit.say;
      bit.append(mark);
    }
    line.append(bit);
  });
  return line;
}

function manageLegNote(leg) {
  if (typeof bankAskCard === "function") bankAskCard(leg);
  const card = typeof bankCardOf === "function" ? bankCardOf(leg) : null;
  if (!card || (!card.line && !(card.stats || []).length)) return null;
  const row = document.createElement("p");
  row.className = "manage-leg-note";
  const how = document.createElement("span");
  how.className = "manage-how";
  how.textContent = [card.line, card.span].filter(Boolean).join(" ");
  row.append(how);
  if (card.blowout && card.blowout.tag) {
    const blow = document.createElement("span");
    blow.className = "manage-blow";
    blow.textContent = card.blowout.tag;
    row.append(blow);
  }
  const stats = card.stats || [];
  const swings = stats.filter((stat) => stat.tag === "Volatile");
  const steady = stats.filter((stat) => stat.tag !== "Volatile");
  if (swings.length) row.append(manageStatLine("vol", "Swings", swings, leg, card.games));
  if (steady.length) row.append(manageStatLine("steady", "Steady", steady, leg, card.games));
  row.addEventListener("click", (event) => event.stopPropagation());
  return row;
}

window.manageLegNote = manageLegNote;

window.manageSearchTake = manageSearchTake;

function manageLegEdit(line, said, leg, at, count) {
  const key = typeof parlayKey === "function" ? parlayKey(leg) : "";
  if (key) line.dataset.key = key;
  const propBtn = document.createElement("button");
  propBtn.type = "button";
  propBtn.className = "manage-change manage-change-prop";
  propBtn.textContent = "Change prop";
  const valBtn = document.createElement("button");
  valBtn.type = "button";
  valBtn.className = "manage-change manage-change-value";
  valBtn.textContent = "Change value";
  const who = said.querySelector("i.who");
  const prop = said.querySelector("i.prop");
  if (who) who.after(propBtn); else said.append(propBtn);
  if (prop) prop.after(valBtn); else said.append(valBtn);
  if (typeof manageLegDrop === "function") manageLegDrop(said, key);
  const pickMode = (mode, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!key || typeof legSwapOpen === "undefined") return;
    if (legSwapOpen.get(key) === mode) { legSwapOpen.delete(key); if (typeof legSwapDrill !== "undefined") legSwapDrill.delete(key); }
    else { legSwapOpen.set(key, mode); if (typeof legSwapDrill !== "undefined") legSwapDrill.delete(key); }
    if (typeof legSwapPaint === "function") legSwapPaint();
    else manageSwapShow();
  };
  propBtn.addEventListener("click", (event) => pickMode("kind", event));
  valBtn.addEventListener("click", (event) => pickMode("line", event));
}

function manageSwapShow() {
  document.querySelectorAll(".manage-card .find-tray-swap[data-manage]").forEach((node) => node.remove());
  document.querySelectorAll(".manage-card.editing .find-chose[data-key]").forEach((line) => {
    if (!line.getClientRects().length) return;
    const key = line.dataset.key;
    const mode = typeof legSwapOpen !== "undefined" && legSwapOpen.get(key);
    line.querySelectorAll(".manage-change").forEach((button) => {
      const on = (button.classList.contains("manage-change-prop") && mode === "kind") || (button.classList.contains("manage-change-value") && mode === "line");
      button.classList.toggle("on", on);
    });
    if (mode !== "kind" && mode !== "line") return;
    if (typeof legSwapBox !== "function") return;
    const box = legSwapBox(key, mode);
    box.dataset.manage = "1";
    box.dataset.key = key;
    line.after(box);
  });
}

function manageLockStake(row) {
  const saved = typeof saveRowStake === "function" ? saveRowStake(row) : Number(row.stake) || 0;
  if (row && row.stakeTyped) return saved;
  const kelly = typeof bankKelly === "function" ? bankKelly(row.legs || []) : null;
  return kelly && kelly.edge && kelly.bet > 0 ? kelly.bet : saved;
}

function manageLockOdds(text) {
  const n = typeof bankOddsNum === "function" ? bankOddsNum(text) : Number(String(text || "").replace(/[−–]/g, "-").replace(/[+$,\s]/g, ""));
  if (!n) return "";
  return n > 0 ? `+${n}` : String(n);
}

function manageLockBonus(got, board) {
  const pay = (text) => { const n = typeof bankOddsNum === "function" ? bankOddsNum(text) : 0; return n > 0 ? n / 100 : n < 0 ? 100 / Math.abs(n) : 0; };
  const a = pay(got), b = pay(board);
  if (!(a > 0) || !(b > 0)) return { bonus: false, say: "" };
  if (a > b + 0.001) return { bonus: true, say: `A bonus is in these odds. They pay more than ${board}.` };
  if (a + 0.001 < b) return { bonus: false, say: `No bonus in these odds. They pay less than ${board}.` };
  return { bonus: false, say: `No bonus in these odds. They match ${board}.` };
}

function manageLockAsk(row) {
  const board = typeof savePrice === "function" ? savePrice(row.legs || []) : "";
  const old = document.querySelector(".manage-lock-pop");
  if (old) old.remove();
  const pop = document.createElement("div");
  pop.className = "manage-lock-pop";
  pop.innerHTML = `<form class="manage-lock-sheet" role="dialog" aria-label="Lock this bet in"><p class="manage-lock-head">Lock this bet in</p><label>Sportsbook<select name="book"></select></label><label>Odds you got<input name="odds" inputmode="text" autocomplete="off"></label><label>Amount you bet<input name="stake" inputmode="decimal" autocomplete="off"></label><p class="manage-lock-bonus"></p><p class="manage-lock-note"></p><p class="manage-lock-do"><button type="button" class="manage-lock-no">Cancel</button><button type="submit" class="manage-lock-yes">Lock it in</button></p></form>`;
  document.body.append(pop);
  const form = pop.querySelector("form");
  if (typeof fillBookSelect === "function") fillBookSelect(form.book);
  form.odds.value = board;
  form.stake.value = String(manageLockStake(row) || "");
  const bonus = form.querySelector(".manage-lock-bonus");
  const note = form.querySelector(".manage-lock-note");
  const paint = () => { const check = manageLockBonus(manageLockOdds(form.odds.value), board); bonus.textContent = check.say; bonus.classList.toggle("on", check.bonus); };
  form.odds.addEventListener("input", paint);
  paint();
  const shut = () => pop.remove();
  form.querySelector(".manage-lock-no").addEventListener("click", shut);
  pop.addEventListener("click", (event) => { if (event.target === pop) shut(); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const odds = manageLockOdds(form.odds.value);
    const stake = Math.round(Number(form.stake.value) * 100) / 100;
    if (!form.book.value) { note.textContent = "Pick the sportsbook."; return; }
    if (!odds) { note.textContent = "Those odds do not look right."; return; }
    if (!(stake > 0)) { note.textContent = "That amount does not look right."; return; }
    const check = manageLockBonus(odds, board);
    if (typeof savePatch === "function") savePatch(row.id, { stake, stakeTyped: true, lockedOdds: odds, lockedBook: form.book.value, lockedBonus: check.bonus });
    if (typeof saveLock === "function") saveLock(row.id);
    shut();
    if (typeof manageRefresh === "function") manageRefresh();
  });
  form.odds.focus();
}

function manageLockBtn(row) {
  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = `manage-lock${row.locked ? " on" : ""}`;
  lock.setAttribute("aria-label", row.locked ? "Unlock this bet" : "Lock this bet in");
  lock.title = lock.getAttribute("aria-label");
  lock.addEventListener("click", (event) => {
    event.stopPropagation();
    if (row.locked) { if (typeof saveUnlock === "function") saveUnlock(row.id); if (typeof manageRefresh === "function") manageRefresh(); return; }
    manageLockAsk(row);
  });
  return lock;
}

window.manageLegEdit = manageLegEdit;
window.manageSwapShow = manageSwapShow;
window.manageLockBtn = manageLockBtn;
