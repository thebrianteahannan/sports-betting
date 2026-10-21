const STATE_NAME = Object.fromEntries("AL=Alabama,AK=Alaska,AZ=Arizona,AR=Arkansas,CA=California,CO=Colorado,CT=Connecticut,DE=Delaware,DC=Washington D.C.,FL=Florida,GA=Georgia,HI=Hawaii,ID=Idaho,IL=Illinois,IN=Indiana,IA=Iowa,KS=Kansas,KY=Kentucky,LA=Louisiana,ME=Maine,MD=Maryland,MA=Massachusetts,MI=Michigan,MN=Minnesota,MS=Mississippi,MO=Missouri,MT=Montana,NE=Nebraska,NV=Nevada,NH=New Hampshire,NJ=New Jersey,NM=New Mexico,NY=New York,NC=North Carolina,ND=North Dakota,OH=Ohio,OK=Oklahoma,OR=Oregon,PA=Pennsylvania,RI=Rhode Island,SC=South Carolina,SD=South Dakota,TN=Tennessee,TX=Texas,UT=Utah,VT=Vermont,VA=Virginia,WA=Washington,WV=West Virginia,WI=Wisconsin,WY=Wyoming".split(",").map((row) => row.split("=")));
const STATE_KIND = {
  none: { level: "none", note: "No extra limit on these bets, including college player props." },
  props: { level: "some", note: "College player props stay off because of the state you live in. Spreads, totals, and moneylines can still be bet." },
  home: { level: "some", note: "Bets on in-state college teams stay off. College player props on other teams can still be bet." },
  live: { level: "some", note: "Live college player props stay off. Pre-game college props can still be bet." },
  both: { level: "some", note: "College player props stay off because of the state you live in, and bets on in-state colleges stay off." },
  tourney: { level: "some", note: "College player props stay off because of the state you live in. In-state colleges are limited to tournament games." },
  off: { level: "lot", note: "FanDuel Sportsbook is not offered here, so these lines cannot be placed in this state." },
};
const STATE_GROUP = {
  none: "AR KS KY MI NC WV WY",
  props: "AZ CO LA MD OH PA TN",
  home: "CT DC IA IL MO NJ",
  live: "IN",
  both: "MA NY VA",
  tourney: "VT",
};
const STATE_LAW = {};
Object.entries(STATE_GROUP).forEach(([kind, codes]) => {
  codes.split(" ").forEach((code) => { STATE_LAW[code] = { code, name: STATE_NAME[code], kind, ...STATE_KIND[kind] }; });
});
Object.keys(STATE_NAME).forEach((code) => {
  if (!STATE_LAW[code]) STATE_LAW[code] = { code, name: STATE_NAME[code], kind: "off", ...STATE_KIND.off };
});
STATE_LAW.FL.kind = "props";
STATE_LAW.FL.level = "some";
STATE_LAW.FL.note = "Hard Rock is your sportsbook. We use FanDuel for the odds and prices. Your sportsbook is different, and the numbers are usually close. College player props stay off because of the state you live in.";
const BOOKS = [
  { id: "fanduel", name: "FanDuel", href: "https://sportsbook.fanduel.com/", states: "AZ AR CO CT DC IL IN IA KS KY LA MD MA MI MO NJ NY NC OH PA TN VT VA WV WY" },
  { id: "hardrock", name: "Hard Rock", href: "https://www.hardrock.bet/", states: "AZ CO FL IL IN MI NJ OH TN VA" },
  { id: "draftkings", name: "DraftKings", href: "https://sportsbook.draftkings.com/", states: "AZ AR CO CT DC IL IN IA KS KY LA ME MD MA MI MO NH NJ NY NC OH OR PA TN VT VA WV WY" },
  { id: "betmgm", name: "BetMGM", href: "https://sports.betmgm.com/", states: "AZ CO DC IL IN IA KS KY LA MD MA MI MO NC NJ NV NY OH PA TN VA WV WY" },
  { id: "thescore", name: "theScore", href: "https://www.thescore.bet/", states: "AZ CO DC IA IL IN KS KY LA MA MD MI MO NC NJ NY OH PA TN VA WV" },
];

function booksHere(code) {
  const state = String(code || window.memberState || "").toUpperCase();
  return BOOKS.filter((book) => book.states.split(" ").includes(state));
}

function stateName(code) {
  return (STATE_LAW[String(code || window.memberState || "").toUpperCase()] || {}).name || "your state";
}

function bookLink() {
  const mine = BOOKS.find((book) => book.id === window.memberBook);
  if (mine && booksHere().some((book) => book.id === mine.id)) return mine;
  return booksHere()[0] || BOOKS[0];
}

function fillBookSelect(node) {
  if (!node) return;
  const picked = window.memberBook || "";
  const openIds = new Set(booksHere().map((book) => book.id));
  node.innerHTML = `<option value="">Choose your sportsbook</option>${BOOKS.map((book) => {
    const open = openIds.has(book.id);
    const label = open ? book.name : `${book.name} (not available in your state)`;
    return `<option value="${book.id}"${open ? "" : " disabled"}${open && book.id === picked ? " selected" : ""}>${label}</option>`;
  }).join("")}`;
}

function stateOptions(selected) {
  const rows = Object.values(STATE_LAW).sort((a, b) => a.name.localeCompare(b.name));
  return `<option value="">Choose your state</option>${rows.map((row) => `<option value="${row.code}"${row.code === selected ? " selected" : ""}>${row.name}</option>`).join("")}`;
}

function fillStateSelect(node, selected) {
  if (!node) return;
  node.innerHTML = stateOptions(selected || window.memberState || "");
}

function lawDay() {
  return `${window.memberState || ""}:${new Date().toLocaleDateString("en-CA")}`;
}

function lawNote() {
  const row = STATE_LAW[window.memberState || ""];
  let seen = false;
  try { seen = localStorage.getItem("parlay-law-day") === lawDay(); } catch (error) { seen = false; }
  if (!row || window.lawShut === window.memberState || seen) return "";
  const other = booksHere().filter((book) => book.id !== "fanduel");
  if (row.kind === "off" && other.length) return `${row.name}: FanDuel Sportsbook is not offered. You can place these FanDuel prices on ${other.map((book) => book.name).join(", ")}. The number is usually close, and sometimes the same. Check it before you bet.`;
  if (row.level === "none") return "";
  const book = BOOKS.find((item) => item.id === window.memberBook);
  const extra = book && book.id !== "fanduel" && !row.note.includes("usually close") ? ` ${book.name} is your sportsbook. We use FanDuel for the odds and prices. Your sportsbook is different, and the numbers are usually close.` : "";
  return `${row.name}: ${row.note}${extra}`;
}

function blockCollege(card) {
  if (!["props", "both", "tourney", "off"].includes(window.memberLaw || "")) return false;
  const legs = [...(card.legs || []), ...((card.groups || []).flatMap((group) => group.legs || []))];
  return legs.some((leg) => /NCAA/.test(`${leg.sport || ""} ${leg.label || ""}`));
}

function applyMember(code) {
  const row = STATE_LAW[String(code || "").toUpperCase()];
  window.memberState = row ? row.code : "";
  window.memberLaw = row ? row.kind : "";
  ["member-state", "call-state", "laws-state"].forEach((id) => fillStateSelect(document.getElementById(id), window.memberState));
  fillBookSelect(document.getElementById("call-book"));
  if (document.getElementById("pane-laws") && !document.getElementById("pane-laws").hidden) paintLaws();
}

let lawsMap = "";
function paintLaws() {
  const map = document.getElementById("laws-map");
  const you = document.getElementById("laws-you");
  const detail = document.getElementById("laws-detail");
  if (!map || !you || !detail) return;
  const mine = STATE_LAW[window.memberState || ""];
  you.textContent = mine ? `Your state is ${mine.name}.` : "Your state is not set yet. Set it on your membership.";
  fillStateSelect(document.getElementById("laws-state"), window.memberState);
  const show = (code) => {
    const row = STATE_LAW[code];
    if (!row) return;
    detail.textContent = `${row.name}. ${row.note}`;
    map.querySelectorAll("[data-code]").forEach((node) => node.classList.toggle("on", node.dataset.code === code.toLowerCase()));
  };
  const draw = () => {
    map.querySelectorAll("path, circle").forEach((node) => {
      const code = (node.getAttribute("class") || "").toLowerCase().split(/\s+/).find((bit) => STATE_LAW[bit.toUpperCase()] && !bit.includes("-"));
      if (!code) return;
      const row = STATE_LAW[code.toUpperCase()];
      node.dataset.law = row.level;
      node.dataset.code = code;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", row.name);
      if (mine && code === mine.code.toLowerCase()) node.classList.add("you");
    });
    if (mine) show(mine.code); else detail.textContent = "Click a state to read its rule.";
  };
  if (lawsMap) { map.innerHTML = lawsMap; draw(); return; }
  fetch("/us-map.svg").then((response) => response.text()).then((text) => { lawsMap = text; map.innerHTML = text; draw(); }).catch(() => { map.textContent = "The map did not load."; });
}

document.getElementById("laws-map").addEventListener("click", (event) => {
  const node = event.target.closest("[data-code]");
  if (!node) return;
  const row = STATE_LAW[node.dataset.code.toUpperCase()];
  const detail = document.getElementById("laws-detail");
  if (row && detail) detail.textContent = `${row.name}. ${row.note}`;
  document.querySelectorAll("#laws-map [data-code]").forEach((item) => item.classList.toggle("on", item === node || item.dataset.code === node.dataset.code));
});

const priorTab = showTab;
showTab = (name) => { priorTab(name); if (name === "laws") paintLaws(); };
window.lawNote = lawNote;
window.lawMarkToday = () => { try { localStorage.setItem("parlay-law-day", lawDay()); } catch (error) {} };
document.getElementById("banner-x").addEventListener("click", () => {
  window.lawShut = window.memberState || "";
  document.getElementById("banner").hidden = true;
  document.getElementById("banner-x").hidden = true;
});
window.paintLaws = paintLaws;
window.blockCollege = blockCollege;
window.applyMember = applyMember;
window.fillStateSelect = fillStateSelect;
window.booksHere = booksHere;
window.bookRoster = () => BOOKS.slice();
window.bookLink = bookLink;
window.fillBookSelect = fillBookSelect;
window.stateName = stateName;
fillStateSelect(document.getElementById("member-state"));
fillStateSelect(document.getElementById("call-state"));
fillBookSelect(document.getElementById("call-book"));
