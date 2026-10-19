const HALF_KEYS = {
  week: "weekThree", week5: "weekFive", safe: "weekSafe", even: "weekEven",
  best: "band", today: "todayBet", chalk: "chalk", four: "four", plus: "plus", hits: "hits",
};

function halfEsc(text) {
  return String(text ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function halfGame(leg, data) {
  const own = String(leg.gameId || "");
  if (own) return own;
  const games = (window.state && window.state.board && window.state.board.games) || [];
  const text = `${leg.match || ""} ${leg.label || ""} ${data.game || ""}`.toLowerCase().replace(/\s+at\s+/g, " @ ");
  const hit = games.find((game) => {
    const match = String(game.match || "").toLowerCase();
    if (!match) return false;
    if (text.includes(match)) return true;
    const parts = match.split(" @ ");
    return parts.length === 2 && text.includes(parts[0]) && text.includes(parts[1]);
  });
  return hit ? String(hit.id) : String(data.gameId || "");
}

function halfLegs(card) {
  let data = null;
  const board = window.state && window.state.board;
  if (card.id === "choice-result") data = { legs: window.builtLegs || [] };
  else if (card.id === "rec-open") data = window.recTicket || { legs: [] };
  else if (board && HALF_KEYS[card.id]) data = board[HALF_KEYS[card.id]];
  if (!data) return [];
  const rows = [...(data.legs || [])];
  (data.groups || []).forEach((group) => rows.push(...(group.legs || [])));
  return rows.filter((leg) => /(\d+(?:\.\d+)?)\+/.test(`${leg.runner || ""} ${leg.label || ""}`)).map((leg) => ({
    market: leg.market || "",
    runner: leg.runner || "",
    label: leg.label || "",
    odds: leg.odds,
    gameId: halfGame(leg, data),
  }));
}

function halfMoney(row) {
  const n = Number(row);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function halfLine(odds, label, pct) {
  if (odds == null || !label) return "";
  return `<li><b>${halfEsc(halfMoney(odds))}</b><span>${halfEsc(label)}</span><em>${halfEsc(pct || "")}</em></li>`;
}

function halfSay(pack, lead) {
  if (!pack) return "";
  return `${lead} ${pack.bits} multiply to ${pack.price}, about ${pack.pct}. A $5 bet would win $${pack.profit}.`;
}

function halfView(payload) {
  const names = payload.rows.map((row) => `<p class="half-name">${halfEsc(row.half)}</p>`).join("");
  const note = payload.missing ? `<p class="quiet">FanDuel does not list these half yards.</p>` : "";
  const lines = payload.rows.map((row) => [
    row.halfOdds != null ? halfLine(row.halfOdds, row.half, row.halfPct) : "",
    halfLine(row.hereOdds, row.here, row.herePct),
    halfLine(row.nextOdds, row.next, row.nextPct),
  ].join("")).join("");
  const now = halfSay(payload.now, "On FanDuel,");
  const next = payload.missing ? halfSay(payload.next, "The next lines FanDuel lists,") : halfSay(payload.half, "On FanDuel,");
  return `<p class="half-title">Half a yard more</p>${names}${note}<ol>${lines}</ol>${now ? `<p>${halfEsc(now)}</p>` : ""}${next ? `<p>${halfEsc(next)}</p>` : ""}`;
}

async function toggleHalf(card, button) {
  const open = card.querySelector(":scope > .half-box");
  if (open) {
    open.remove();
    button.classList.remove("on");
    button.setAttribute("aria-pressed", "false");
    return;
  }
  const legs = halfLegs(card);
  button.classList.add("on");
  button.setAttribute("aria-pressed", "true");
  const box = document.createElement("div");
  box.className = "half-box";
  box.textContent = "Checking FanDuel.";
  const list = card.querySelector(":scope > ol");
  if (list) list.insertAdjacentElement("afterend", box);
  else card.append(box);
  try {
    const response = await fetch("/api/half", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legs }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "FanDuel did not answer.");
    box.innerHTML = halfView(payload);
  } catch (error) {
    box.textContent = error.message || "FanDuel did not answer.";
  }
}

function paintHalf() {
  document.querySelectorAll("#desk-glass .chalk").forEach((card) => {
    if (card.querySelector(":scope > .half-go") || !halfLegs(card).length) return;
    const title = card.querySelector(":scope > h2") || card.querySelector("h2");
    if (!title) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "half-go";
    button.textContent = "Half a yard more";
    button.setAttribute("aria-pressed", "false");
    const edit = card.querySelector(":scope > .leg-edit");
    if (edit) edit.insertAdjacentElement("afterend", button);
    else title.insertAdjacentElement("afterend", button);
    button.addEventListener("click", () => toggleHalf(card, button));
  });
}

function bootHalf() {
  const glass = document.getElementById("desk-glass");
  if (!glass || glass.dataset.half) return;
  glass.dataset.half = "on";
  paintHalf();
  new MutationObserver(() => paintHalf()).observe(glass, { childList: true, subtree: true });
}

bootHalf();
window.paintHalf = paintHalf;
