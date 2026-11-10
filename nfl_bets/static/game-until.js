/** Time left before kickoff on a game row, like "Starts in 1d 3h 25m". Zero parts are left off. */

function gameUntilText(kickoff) {
  const left = Date.parse(kickoff || "") - Date.now();
  if (!(left > 0)) return "";
  const mins = Math.floor(left / 60000);
  const parts = [[Math.floor(mins / 1440), "d"], [Math.floor((mins % 1440) / 60), "h"], [mins % 60, "m"]].filter(([n]) => n > 0).map(([n, unit]) => `${n}${unit}`);
  return parts.length ? `Starts in ${parts.join(" ")}` : "Starting now";
}

function gameUntilPaint(tag) {
  const text = gameUntilText(tag.dataset.kick);
  tag.textContent = text;
  tag.hidden = !text;
}

function gameUntil(button, kickoff) {
  if (!button || !kickoff) return;
  const tag = document.createElement("span");
  tag.className = "find-until";
  tag.dataset.kick = kickoff;
  gameUntilPaint(tag);
  button.append(tag);
}

setInterval(() => document.querySelectorAll(".find-until").forEach(gameUntilPaint), 30000);
