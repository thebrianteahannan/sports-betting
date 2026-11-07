/** The player line and the prop numbers, under the name. */

function paintCard(list, heading, person) {
  const sport = String(((person.bets || []).find((bet) => bet && bet.sport) || {}).sport || "");
  const box = document.createElement("div");
  box.className = "find-card";
  const wait = document.createElement("p");
  wait.className = "quiet";
  wait.textContent = "Reading the player.";
  box.append(wait);
  heading.after(box);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "card", name: person.name, sport }) }).then((res) => res.json()).then((data) => {
    if (!box.isConnected || !data || (!data.line && !(data.stats || []).length)) { box.remove(); return; }
    box.replaceChildren();
    if (data.line) { const line = document.createElement("p"); line.className = "find-why"; line.textContent = data.line; box.append(line); }
    if (data.span) { const span = document.createElement("p"); span.className = "quiet"; span.textContent = data.span; box.append(span); }
    const grid = document.createElement("div");
    grid.className = "find-log";
    (data.stats || []).forEach((stat) => { const item = document.createElement("span"); const title = document.createElement("b"); title.textContent = stat.label; item.append(title, document.createTextNode(stat.value || "")); grid.append(item); });
    if (grid.childNodes.length) box.append(grid);
  }).catch(() => { if (box.isConnected) box.remove(); });
}

window.paintCard = paintCard;
