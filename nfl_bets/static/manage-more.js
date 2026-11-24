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
  if (typeof manageZoomApply === "function") manageZoomApply(typeof MANAGE_ZOOM_MAX === "number" ? MANAGE_ZOOM_MAX : 5);
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

function manageStatLine(kind, label, stats, leg) {
  const line = document.createElement("span");
  line.className = `manage-stat-line ${kind}`;
  const name = document.createElement("b");
  name.textContent = label;
  line.append(name);
  stats.forEach((stat) => {
    const bit = document.createElement("span");
    bit.className = "manage-stat";
    if (manageStatOn(leg, stat.label)) bit.classList.add("on");
    bit.textContent = `${manageStatShort(stat.label)} ${stat.value || ""}`.trim();
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
  if (swings.length) row.append(manageStatLine("vol", "Swings", swings, leg));
  if (steady.length) row.append(manageStatLine("steady", "Steady", steady, leg));
  row.addEventListener("click", (event) => event.stopPropagation());
  return row;
}

window.manageLegNote = manageLegNote;

window.manageSearchTake = manageSearchTake;

function manageLegEdit(line, said, leg) {
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

window.manageLegEdit = manageLegEdit;
window.manageSwapShow = manageSwapShow;
