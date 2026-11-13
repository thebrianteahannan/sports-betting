/** The player line and the prop numbers, under the name. */

function paintCard(list, heading, person) {
  const sport = String(((person.bets || []).find((bet) => bet && bet.sport) || {}).sport || person.sport || "");
  const box = document.createElement("div");
  box.className = "find-card";
  const wait = document.createElement("p");
  wait.className = "quiet";
  wait.textContent = "Reading the player.";
  box.append(wait);
  heading.after(box);
  if (window.paintLive) paintLive(list, heading, person);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "card", name: person.name, sport }) }).then((res) => res.json()).then((data) => {
    if (!box.isConnected || !data || (!data.line && !(data.stats || []).length)) { box.remove(); return; }
    box.replaceChildren();
    const kinds = box.parentElement && box.parentElement.querySelector(":scope > .find-kinds");
    if (kinds && box.compareDocumentPosition(kinds) & Node.DOCUMENT_POSITION_PRECEDING) kinds.before(box);
    if (data.line) { const line = document.createElement("p"); line.className = "find-why"; line.textContent = data.line; box.append(line); }
    const swing = (tag, tip) => { const pill = document.createElement("i"); pill.className = `find-swing${tag === "Volatile" ? " vol" : ""}`; pill.textContent = tag; pill.title = tip || ""; return pill; };
    if (data.span) { const span = document.createElement("p"); span.className = "quiet"; span.textContent = data.span; if (data.swing) span.append(" ", swing(data.swing.tag, data.swing.tip)); if (data.blowout) { const pill = swing(data.blowout.tag, data.blowout.tip); pill.className = `find-swing find-blow ${data.blowout.kind || "flat"}`; span.append(" ", pill); } box.append(span); }
    const grid = document.createElement("div");
    grid.className = "find-log";
    (data.stats || []).forEach((stat) => { const item = document.createElement("span"); const title = document.createElement("b"); title.textContent = stat.label; item.append(title, document.createTextNode(stat.value || "")); if (stat.tag) item.append(" ", swing(stat.tag, stat.tip)); if (stat.blowTag) { const pill = swing(stat.blowTag, stat.blowTip); pill.className = `find-swing find-blow ${stat.blow}`; item.append(" ", pill); } grid.append(item); });
    if (grid.childNodes.length) box.append(grid);
    if (data.blowout && window.proofTake) proofTake(person.name, data.blowout);
  }).catch(() => { if (box.isConnected) box.remove(); });
}

window.paintCard = paintCard;
