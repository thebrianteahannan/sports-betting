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

function gameUntil(button, kickoff, game, people) {
  if (!button || !kickoff) return;
  const tag = document.createElement("span");
  tag.className = "find-until";
  tag.dataset.kick = kickoff;
  gameUntilPaint(tag);
  button.append(tag);
  if (game) gameEdge(button, game.match);
  const over = game && (people || []).filter((one) => one.kind === "team").flatMap((one) => one.bets || []).find((bet) => bet.market === "Total" && bet.match === game.match && bet.kickoff === game.kickoff && /^over\s/i.test(bet.label || ""));
  const line = over && (String(over.label).match(/\d+(?:\.\d+)?/) || [])[0];
  if (!line) return;
  const total = document.createElement("span");
  total.className = "find-total";
  total.textContent = `O/U ${line}`;
  button.append(total);
}

const GAME_KEY_RATE = { 3: 0.15, 7: 0.09 };

function gameEdgeProfit(stack) {
  const [a, b] = stack.bets || [];
  const line = a && Math.abs(Number((String(a.label).match(/\(?(-\d+(?:\.\d+)?)\)?/) || [])[1]));
  const key = GAME_KEY_RATE[Math.ceil(line)];
  if (!key || !b) return null;
  const chance = (odds) => (odds < 0 ? -odds / (100 - odds) : 100 / (odds + 100));
  const won = (odds) => (odds < 0 ? 500 / -odds : odds / 20);
  const one = chance(a.odds) - key, two = chance(b.odds) - key, rest = (1 - key) / (one + two);
  return { key: Math.ceil(line), profit: key * (won(a.odds) + won(b.odds)) + rest * (one * (won(a.odds) - 5) + two * (won(b.odds) - 5)) };
}

function gameEdge(button, match) {
  if (typeof gameStackData !== "function" || !match) return;
  gameStackData().then((data) => {
    const found = (data && data.found) || {}, grade = typeof STACK_GRADE !== "undefined" ? STACK_GRADE : {};
    const names = Object.keys(found).filter((name) => grade[name] && grade[name][0] === "edge" && found[name].some((stack) => stack.game === match || (stack.bets || []).some((bet) => bet.game === match)));
    if (!names.length || !button.isConnected || button.querySelector(".find-edge")) return;
    const best = (found["Key-number middle"] || []).filter((stack) => stack.game === match).map(gameEdgeProfit).filter(Boolean).sort((x, y) => y.profit - x.profit)[0];
    const edge = document.createElement("span");
    edge.className = `find-edge${best && best.profit < 0 ? " lose" : ""}`;
    edge.textContent = best ? `Edge ${best.profit < 0 ? "-" : "+"}$${Math.abs(best.profit).toFixed(2)}` : "Known edge";
    edge.title = best ? `Middle on ${best.key}: $5 on each side. A win by exactly ${best.key} cashes both. ${best.profit < 0 ? `At these prices it loses $${Math.abs(best.profit).toFixed(2)}` : `Expected profit $${best.profit.toFixed(2)}`} per $10.` : names.join(", ");
    const total = button.querySelector(".find-total");
    if (total) total.after(edge); else button.append(edge);
  });
}

setInterval(() => document.querySelectorAll(".find-until").forEach(gameUntilPaint), 30000);
