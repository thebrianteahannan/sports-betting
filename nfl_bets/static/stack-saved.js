/** A saved stack in My bets opens to show why it was built: the strategy and each leg's job, or the hedge and what each outcome pays. */

const stackSavedOpen = new Set();

function stackSavedBriefs(group) {
  if ((group.briefs || []).length) return group.briefs;
  const row = typeof STACKS !== "undefined" && STACKS.find((one) => String(group.name || "").endsWith(one[0]));
  return row ? [{ kind: "strategy", about: row[1] }] : [];
}

function stackSavedNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function stackSavedBox(briefs) {
  const box = stackSavedNode("div", "find-saved-brief", "");
  briefs.forEach((brief) => {
    const part = stackSavedNode("div", "find-saved-brief-part", "");
    if (brief.title) part.append(stackSavedNode("b", "", brief.title));
    [brief.about, brief.read, ...(brief.lines || [])].filter(Boolean).forEach((text) => part.append(stackSavedNode("p", "", text)));
    if ((brief.rows || []).length) {
      const table = stackSavedNode("div", "leg-steady-table", "");
      brief.rows.forEach(([say, cash]) => { const line = document.createElement("p"); line.append(stackSavedNode("span", "", say), stackSavedNode("b", /^\+/.test(cash) ? "up" : /^-/.test(cash) ? "down" : "", cash)); table.append(line); });
      part.append(table);
    }
    (brief.legs || []).forEach((leg) => {
      const odds = Number(leg.odds), line = stackSavedNode("p", "find-saved-brief-leg", "");
      line.append(stackSavedNode("b", "", `${leg.label || ""} ${odds > 0 ? `+${odds}` : odds || ""}`.trim()), stackSavedNode("span", "", [[leg.kind, leg.rung].filter(Boolean).join(", "), leg.job, leg.games ? `${leg.hits} of last ${leg.games}` : ""].filter(Boolean).join(" · ")));
      part.append(line);
    });
    box.append(part);
  });
  box.addEventListener("click", (event) => event.stopPropagation());
  return box;
}

function stackSavedStake(row) {
  if (Number(row.stake) > 0) return Number(row.stake);
  const leg = row.legs && row.legs.length === 1 && row.legs[0], odds = leg && Number(leg.odds), tag = odds > 0 ? `(+${odds})` : `(${odds})`;
  const line = leg && ((row.group && row.group.briefs) || []).flatMap((brief) => brief.lines || []).find((text) => text.includes(tag));
  const hit = line && line.match(/\$(\d+(?:\.\d+)?) on it/);
  return hit ? Number(hit[1]) : 0;
}

function stackSavedTicket(list) {
  const row = window.parlayOpenId && list.find((one) => one.id === window.parlayOpenId), stake = row && row.group ? stackSavedStake(row) : 0;
  if (!stake || stake === 5 || typeof legBoostDec !== "function" || typeof legHedgeCash !== "function") return;
  const dec = [...parlayLeg.values()].reduce((product, bet) => product * legBoostDec(bet.odds), 1);
  document.querySelectorAll(".find-tray .find-ticket > b i.pay").forEach((pill) => { pill.textContent = `${legHedgeCash(stake)} profits ${legHedgeCash(stake * (dec - 1))}`; });
}

function stackSavedPaint() {
  const list = typeof saveList === "function" ? saveList() : [];
  stackSavedTicket(list);
  document.querySelectorAll(".find-saved .find-saved-group .find-saved-chip[data-id] > button:first-child").forEach((go) => {
    const row = list.find((one) => one.id === go.parentElement.dataset.id);
    if (!row || go.querySelector(".find-saved-cash") || typeof legBoostDec !== "function" || typeof legHedgeCash !== "function") return;
    const stake = stackSavedStake(row) || 5, dec = (row.legs || []).reduce((product, bet) => product * legBoostDec(bet.odds), 1);
    go.append(stackSavedNode("em", "find-saved-cash", `${legHedgeCash(stake)} → ${legHedgeCash(stake * dec)} (${legHedgeCash(stake * (dec - 1), true)})`));
  });
  document.querySelectorAll(".find-saved .find-saved-group").forEach((wrap) => {
    if (wrap.querySelector(":scope > .find-saved-more")) return;
    const ids = [...wrap.querySelectorAll(".find-saved-chip")].map((chip) => chip.dataset.id), rows = list.filter((row) => row.group && ids.includes(row.id));
    const group = (rows.sort((a, b) => (b.group.briefs || []).length - (a.group.briefs || []).length)[0] || {}).group, briefs = group ? stackSavedBriefs(group) : [];
    if (!briefs.length) return;
    const open = stackSavedOpen.has(group.id), go = stackSavedNode("button", "find-saved-more", open ? "Breakdown ▴" : "Breakdown ▾"), name = wrap.querySelector(":scope > b");
    go.type = "button"; go.setAttribute("aria-expanded", String(open));
    go.addEventListener("click", (event) => { event.stopPropagation(); if (stackSavedOpen.has(group.id)) stackSavedOpen.delete(group.id); else stackSavedOpen.add(group.id); paintParlay(); });
    if (name) name.after(go); else wrap.prepend(go);
    wrap.classList.toggle("find-saved-group-open", open);
    if (open) wrap.append(stackSavedBox(briefs));
  });
}

if (typeof paintParlay === "function") {
  const stackSavedBase = paintParlay;
  paintParlay = function () { stackSavedBase.apply(this, arguments); stackSavedPaint(); };
}
