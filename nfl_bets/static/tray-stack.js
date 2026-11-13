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
        if (shared < 2 && (missing.length || extra.length) && (extra.length || !(typeof stackApart === "function" && stackApart(stack)))) return;
        const score = [missing.length || extra.length ? 0 : 1, shared, -(missing.length + extra.length), -rank];
        const ahead = !best || (() => { for (let at = 0; at < score.length; at += 1) if (score[at] !== best.score[at]) return score[at] > best.score[at]; return false; })();
        if (ahead) best = { score, name: row[0], no: index + 1, missing, extra, apart: typeof stackApart === "function" && stackApart(stack) };
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
    const piece = !fit && best.apart && !best.extra.length;
    if (piece) note.append("This is one bet in the ", go, " stack.");
    else note.append(fit ? "This is " : "This is close to ", go, ".");
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
    if (typeof betFromSay === "function") betFromSay("Strategies");
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
  if (typeof paintFind !== "function" || typeof gameStackData !== "function") return;
  const desk = document.getElementById("desk");
  const onFind = desk && desk.classList.contains("tv-full") && !desk.classList.contains("bird-on") && document.querySelector("#desk-glass-in .find-board");
  window.saveStacksOpen = true;
  if (onFind) paintParlay(); else paintFind();
  gameStackData().then(() => setTimeout(() => {
    const panel = document.querySelector("#desk-glass-in .find-saved-stacks");
    if (!panel) return;
    if (!name) { panel.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    const find = () => [...panel.querySelectorAll(".rec-strategy")].find((node) => node.dataset.name === name);
    if (!find()) panel.querySelectorAll(".find-stack-all").forEach((button) => { if (!panel.querySelector(".find-stack-extra")) button.click(); });
    const block = find();
    if (block) trayStackFocus(panel, block, labels);
  }, 0));
}

function trayStackFocus(panel, block, labels) {
  const show = (node, on) => { node.hidden = !on; node.style.display = on ? "" : "none"; if (on) delete node.dataset.hid; else node.dataset.hid = "1"; };
  panel.querySelectorAll("[data-hid]").forEach((node) => show(node, true));
  panel.querySelectorAll(":scope > .stack-all").forEach((node) => node.remove());
  panel.querySelectorAll(".rec-focus, .stack-mine").forEach((node) => node.classList.remove("rec-focus", "stack-mine"));
  const key = (label) => String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const mine = new Set(labels.map(key));
  const shared = (set) => String(set.dataset.labels || "").split("|").filter((label) => mine.has(key(label))).length;
  const sets = [...block.querySelectorAll(":scope > .stack-set")];
  const pick = sets.slice().sort((a, b) => shared(b) - shared(a))[0];
  const host = block.closest(".find-stack-host");
  panel.querySelectorAll(".find-stack-host").forEach((node) => { if (node !== host) show(node, false); });
  block.parentElement.querySelectorAll(":scope > .rec-strategy").forEach((node) => { if (node !== block) show(node, false); });
  if (pick && shared(pick)) { pick.classList.add("stack-mine"); sets.forEach((set) => { if (set !== pick) show(set, false); }); }
  if (host) host.querySelectorAll(".find-stack-all").forEach((node) => show(node, false));
  block.classList.add("open", "rec-focus");
  const all = document.createElement("button");
  all.type = "button";
  all.className = "stack-all";
  all.textContent = "All strategies";
  all.addEventListener("click", () => { panel.querySelectorAll("[data-hid]").forEach((node) => show(node, true)); all.remove(); });
  panel.prepend(all);
  (pick && shared(pick) ? pick : block).scrollIntoView({ block: "center", behavior: "smooth" });
}
