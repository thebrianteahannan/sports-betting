// The parlay tray names the ST strategy its legs belong to, and the legs that would finish it.
function trayStack(tray, legs) {
  const stamp = (tray.stackStamp = (tray.stackStamp || 0) + 1);
  trayUndoLine(tray);
  const rows = (legs || []).filter((leg) => leg && leg.label && Number(leg.odds));
  if (!rows.length || typeof gameStackData !== "function" || typeof STACKS === "undefined") return;
  const key = (label) => String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const mine = new Set(rows.map((leg) => key(leg.label)));
  gameStackData().then((data) => {
    if (stamp !== tray.stackStamp || !tray.isConnected) return;
    const found = (data && data.found) || {};
    let best = null;
    STACKS.forEach((row, index) => {
      const rank = ((typeof STACK_RANK !== "undefined" && STACK_RANK[row[0]]) || [99])[0];
      (found[row[0]] || []).forEach((stack) => {
        const bets = stack.bets || [];
        const theirs = new Set(bets.map((bet) => key(bet.label)));
        const shared = [...mine].filter((label) => theirs.has(label)).length;
        if (!shared) return;
        const missing = bets.filter((bet) => !mine.has(key(bet.label)));
        const extra = rows.filter((leg) => !theirs.has(key(leg.label)));
        const score = [missing.length || extra.length ? 0 : 1, shared, -(missing.length + extra.length), -rank];
        const ahead = !best || (() => { for (let at = 0; at < score.length; at += 1) if (score[at] !== best.score[at]) return score[at] > best.score[at]; return false; })();
        if (ahead) best = { score, name: row[0], no: index + 1, missing, extra };
      });
    });
    tray.querySelectorAll(":scope > .find-st").forEach((node) => node.remove());
    if (!best) return;
    const note = document.createElement("p");
    note.className = "find-why find-st";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "find-near";
    go.textContent = `ST-${String(best.no).padStart(2, "0")}, ${best.name}`;
    go.addEventListener("click", () => trayStackOpen(best.name, rows.map((leg) => leg.label)));
    const list = (items) => items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
    const fit = !best.missing.length && !best.extra.length;
    const join = (nodes) => nodes.flatMap((node, at) => (at === 0 ? [node] : [at === nodes.length - 1 ? " and " : ", ", node]));
    const act = (text, run) => { const button = document.createElement("button"); button.type = "button"; button.className = "find-near find-do"; button.textContent = text; button.addEventListener("click", run); return button; };
    note.append(fit ? "This is " : "This is close to ", go, ".");
    if (!fit && best.extra.length && best.extra.length <= 2) note.append(" Take out ", ...join(best.extra.map((leg) => act(String(leg.label).split(/\s+—\s+/)[0], () => trayStackDrop(leg)))), ".");
    const hint = tray.querySelector(":scope > .find-undo") || tray.querySelector(":scope > .find-why");
    if (hint) hint.before(note); else tray.append(note);
  });
}

const trayLegsKey = () => [...parlayLeg.keys()].sort().join("\n");

function trayStackDo(text, change) {
  const before = { pick: new Map(parlayPick), leg: new Map(parlayLeg), text };
  change();
  before.after = trayLegsKey();
  window.trayUndo = before;
  trayRoster();
  paintParlay();
}

function trayStackAdd(tray, bet) {
  if (parlayLeg.size >= 8) return;
  const board = tray.closest(".find-board");
  const people = (board && board.people) || [];
  const same = (a, b) => String(a || "").toLowerCase().replace(/\s+/g, " ").trim() === String(b || "").toLowerCase().replace(/\s+/g, " ").trim();
  const exact = (row) => same(row.label, bet.label) && Number(row.odds) === Number(bet.odds);
  const person = people.find((who) => who.kind === "player" && (who.bets || []).some(exact)) || people.find((who) => who.kind === "player" && (who.bets || []).some((row) => same(row.label, bet.label)));
  const real = person ? person.bets.find(exact) || person.bets.find((row) => same(row.label, bet.label)) : { ...bet, match: bet.match || bet.game };
  trayStackDo(`Added ${bet.label}.`, () => {
    if (person && !parlayPick.has(person.key)) parlayPick.set(person.key, person);
    parlayLeg.set(parlayKey(real), real);
  });
}

function trayStackDrop(leg) {
  const entry = [...parlayLeg.entries()].find(([, bet]) => bet === leg);
  if (!entry) return;
  trayStackDo(`Took out ${String(leg.label).split(/\s+—\s+/)[0]}.`, () => {
    parlayLeg.delete(entry[0]);
    [...parlayPick.entries()].forEach(([key, person]) => { if (String(leg.label || "").startsWith(person.name) && ![...parlayLeg.values()].some((bet) => String(bet.label || "").startsWith(person.name))) parlayPick.delete(key); });
  });
}

function trayUndoLine(tray) {
  tray.querySelectorAll(":scope > .find-undo").forEach((node) => node.remove());
  const undo = window.trayUndo;
  if (!undo || undo.after !== trayLegsKey()) { window.trayUndo = null; return; }
  const line = document.createElement("p");
  line.className = "find-why find-undo";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "find-near";
  back.textContent = "Undo";
  back.addEventListener("click", () => {
    window.trayUndo = null;
    parlayPick.clear(); undo.pick.forEach((value, key) => parlayPick.set(key, value));
    parlayLeg.clear(); undo.leg.forEach((value, key) => parlayLeg.set(key, value));
    trayRoster();
    paintParlay();
  });
  line.append(`${undo.text} `, back);
  const hint = tray.querySelector(":scope > .find-why");
  if (hint) hint.before(line); else tray.append(line);
}

function trayRoster() {
  const names = new Set([...parlayPick.values()].map((person) => person.name));
  document.querySelectorAll(".find-names button").forEach((node) => { const on = names.has(node.textContent); node.classList.toggle("on", on); node.setAttribute("aria-pressed", on ? "true" : "false"); });
}

function trayStackOpen(name, labels = []) {
  if (typeof paintStack !== "function") return;
  window.stackFit = false;
  window.stackBeats = false;
  paintStack();
  const block = [...document.querySelectorAll(".rec-board[data-page=\"stack\"] .rec-strategy")].find((node) => node.dataset.name === name);
  if (!block) return;
  block.classList.add("open", "rec-focus");
  const board = block.closest(".rec-board");
  const filters = board.querySelector(".rec-filters");
  if (filters) filters.after(block);
  block.scrollIntoView({ block: "nearest" });
  const key = (label) => String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const mine = new Set(labels.map(key));
  let tries = 0;
  const mark = () => {
    if (!block.isConnected) return;
    if (!block.dataset.fit && tries++ < 60) { setTimeout(mark, 300); return; }
    const shared = (set) => String(set.dataset.labels || "").split("|").filter((label) => mine.has(key(label))).length;
    const set = [...block.querySelectorAll(".stack-set")].sort((a, b) => shared(b) - shared(a))[0];
    if (!set || !shared(set)) return;
    set.classList.add("stack-mine");
    if (set.hidden && set.dataset.span !== "later" && window.stackWhen !== "week") { window.stackWhen = "week"; applyStackFit(board); }
    set.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  mark();
}
