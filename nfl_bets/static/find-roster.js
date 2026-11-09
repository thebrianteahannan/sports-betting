// Roster names with props: grouped by position, most bets first. Defense and bench can be hidden per member.
function rosterGroup(roster, names, lined, rows, team) {
  const bare = (name) => plainName(String(name || "").replace(/, out$/, "")).replace(/ (jr|sr|ii|iii|iv|v)$/, "");
  const info = new Map(rows.filter((row) => row && row.name).map((row) => [bare(row.name), row]));
  if (team && team.name) rows.forEach((row) => { if (row && row.name) clubOf.set(bare(row.name), team.name); });
  const tag = (node, row) => { if (row.def) node.dataset.def = "1"; if (row.bench) node.dataset.bench = "1"; };
  const buttons = [...names.querySelectorAll(":scope > button")];
  const groups = new Map();
  lined.forEach((hit, at) => {
    const button = buttons[at];
    if (!button) return;
    const row = info.get(bare(hit.name)) || {};
    const pos = String(row.pos || "");
    tag(button, row);
    if (pos) button.dataset.pos = pos;
    const count = (hit.bets || []).length;
    const group = groups.get(pos) || { pos, total: 0, list: [] };
    group.total += count;
    group.list.push({ button, count, name: hit.name, hit });
    groups.set(pos, group);
  });
  names.querySelectorAll(":scope > span, :scope > details > span").forEach((span) => tag(span, info.get(bare(span.textContent)) || {}));
  const boxes = [...groups.values()].sort((a, b) => b.total - a.total || a.pos.localeCompare(b.pos)).map((group) => {
    const box = document.createElement("div");
    box.className = "find-group";
    group.list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).forEach((item) => box.append(item.button));
    return box;
  });
  names.prepend(...boxes);
  groups.forEach((group) => group.list.forEach((item) => rosterPlus(item.button, item.hit)));
  const outs = [...names.querySelectorAll(":scope > span.find-absent")];
  if (outs.length) {
    const box = document.createElement("div");
    box.className = "find-group find-outs";
    box.append(...outs);
    if (boxes.length) boxes[boxes.length - 1].after(box); else names.prepend(box);
  }
  const hasDef = rows.some((row) => row && row.def), hasBench = rows.some((row) => row && row.bench);
  const kinds = [];
  if (hasDef || hasBench) kinds.push(hasDef ? ["defense", " Hide defense"] : ["bench", " Hide bench"]);
  if (names.querySelector(":scope > span, :scope > details > span:not(.find-absent)")) kinds.push(["empty", " Hide no-bet players"]);
  if (outs.length) kinds.push(["out", " Hide out players"]);
  if (!kinds.length) return;
  const bar = document.createElement("div");
  bar.className = "find-hides";
  kinds.forEach(([kind, text]) => {
    const label = document.createElement("label");
    label.className = "find-hide";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.kind = kind;
    box.checked = !!(window.memberHide || {})[kind];
    label.append(box, text);
    box.addEventListener("change", () => {
      window.memberHide = { ...(window.memberHide || {}), [kind]: box.checked };
      rosterHide();
      fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hide: window.memberHide }) }).catch(() => {});
    });
    bar.append(label);
  });
  names.prepend(bar);
  rosterHide();
}

const clubOf = new Map();

function rosterPlus(button, person) {
  if (!button || !person || !button.parentElement) return;
  const chip = document.createElement("span");
  chip.className = "find-chip";
  if (button.dataset.def) chip.dataset.def = button.dataset.def;
  if (button.dataset.bench) chip.dataset.bench = button.dataset.bench;
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "find-plus";
  plus.setAttribute("aria-label", `Add ${person.name} to the parlay`);
  plus.addEventListener("click", () => {
    if (parlayPick.has(person.key)) {
      parlayPick.delete(person.key);
      [...parlayLeg.entries()].forEach(([key, bet]) => { if (String(bet.label || "").startsWith(person.name)) parlayLeg.delete(key); });
    } else if (parlayPick.size >= 8) return;
    else parlayPick.set(person.key, person);
    if (typeof trayRoster === "function") trayRoster();
    paintParlay();
  });
  button.replaceWith(chip);
  chip.append(button, plus);
}

function rosterHide() {
  const hide = window.memberHide || {};
  document.querySelectorAll(".find-roster").forEach((roster) => {
    roster.classList.toggle("hide-def", !!hide.defense);
    roster.classList.toggle("hide-bench", !!hide.bench);
    roster.classList.toggle("hide-empty", !!hide.empty);
    roster.classList.toggle("hide-out", !!hide.out);
    roster.querySelectorAll(".find-hide input").forEach((box) => { box.checked = !!hide[box.dataset.kind]; });
  });
}
