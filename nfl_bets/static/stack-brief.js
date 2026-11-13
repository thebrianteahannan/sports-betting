/** Strategy bets show as one line per leg, like THE BET. A Breakdown checkbox on each one brings back the full read. Each strategy is tagged Team, Player, or both. */

const STACK_KIND_NAME = { player: /prop ladder|overlapping under|touchdown|yardage|receptions|catches/i, team: /middle|teaser|pleaser|hook|side and the total/i };
const STACK_KIND_SAY = { team: "Team", player: "Player", "player team": "Team + player" };

function stackLegKind(label, game) {
  const text = String(label || "").trim(), sides = String(game || "").split(/\s+@\s+|\s+·\s+/).map((side) => side.trim()).filter(Boolean);
  return /^(over|under)\b/i.test(text) || /\b(spread|moneyline|total points)\b|alternate total|\btotal\s*:/i.test(text) || /\(\s*[+-]?\d/.test(text) || sides.some((side) => text.startsWith(side)) ? "team" : "player";
}

function stackKindOf(name, stacks) {
  const kinds = new Set();
  stacks.forEach((stack) => (stack.bets || []).forEach((bet) => String(bet.label || "").split(" and ").forEach((part) => kinds.add(stackLegKind(part, bet.game || stack.game)))));
  if (!kinds.size && /player and the total/i.test(name)) return "player team";
  if (!kinds.size) Object.entries(STACK_KIND_NAME).forEach(([kind, test]) => { if (!kinds.size && test.test(name)) kinds.add(kind); });
  return [...kinds].sort().join(" ");
}

function stackKindPaint(root) {
  if (!root || typeof gameStackData !== "function") return;
  gameStackData().then((data) => {
    const found = (data && data.found) || {}, near = (data && data.near) || {};
    const blocks = root.matches && root.matches(".rec-strategy") ? [root] : [...root.querySelectorAll(".rec-strategy[data-name]")];
    blocks.forEach((block) => {
      if (block.dataset.kind !== undefined) return;
      const name = block.dataset.name, kind = stackKindOf(name, (found[name] || []).concat(near[name] || []));
      block.dataset.kind = kind;
      const head = block.querySelector(":scope > h3");
      if (!kind || !head) return;
      const tag = document.createElement("i");
      tag.className = `stack-kind k-${kind.replace(" ", "-")}`;
      tag.textContent = STACK_KIND_SAY[kind];
      const count = head.querySelector(".rec-count");
      if (count) count.before(tag); else head.append(tag);
    });
  });
}

let stackKindOn = localStorage.getItem("stackKind") || "";

function stackKindBar(panel) {
  const bar = document.createElement("p");
  bar.className = "stack-kind-bar";
  const paint = () => {
    ["team", "player"].forEach((kind) => panel.classList.toggle(`stack-only-${kind}`, stackKindOn === kind));
    bar.querySelectorAll("button").forEach((chip) => { const on = chip.dataset.kind === stackKindOn; chip.classList.toggle("on", on); chip.setAttribute("aria-pressed", String(on)); });
  };
  [["", "All"], ["team", "Team"], ["player", "Player"]].forEach(([kind, label]) => {
    const chip = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    chip.dataset.kind = kind;
    chip.addEventListener("click", (event) => { event.stopPropagation(); stackKindOn = kind; try { localStorage.setItem("stackKind", kind); } catch (error) { console.log("[stack-brief] could not keep the strategy filter", error); } paint(); });
    bar.append(chip);
  });
  paint();
  return bar;
}

if (typeof gameStackBlock === "function") {
  const gameStackBlockKind = gameStackBlock;
  gameStackBlock = function () { const block = gameStackBlockKind.apply(this, arguments); stackKindPaint(block); return block; };
}
if (typeof paintStack === "function") {
  const paintStackKind = paintStack;
  paintStack = function () { const out = paintStackKind.apply(this, arguments); stackKindPaint(document.getElementById("desk-glass-in")); return out; };
}

if (typeof stackRead === "function") {
  const stackReadBrief = stackRead;
  stackRead = function (set, stack) {
    stackReadBrief.apply(this, arguments);
    if (set.querySelector(":scope .stack-why")) return;
    set.classList.add("stack-brief");
    const line = set.querySelector(":scope > .stack-ticket"), game = String((stack && stack.game) || "");
    if (line && game && !game.includes(" · ") && typeof gameShort === "function") line.insertAdjacentHTML("beforeend", `<i class="stack-game">${esc(gameShort(game))}</i>`);
    const box = document.createElement("label");
    box.className = "stack-why";
    box.innerHTML = `<input type="checkbox"> Breakdown`;
    const input = box.querySelector("input");
    input.addEventListener("change", () => set.classList.toggle("stack-open", input.checked));
    box.addEventListener("click", (event) => event.stopPropagation());
    if (line) line.append(box);
    else { const name = set.querySelector(":scope > .stack-set-name"); if (name) name.after(box); else set.prepend(box); }
  };
}
