/** Quick add above Recommended: today/week → league → team or player → player → prop → value → current or new bet. */
const quickAdd = { when: "today", sport: "", team: "", player: "", prop: "", value: "", q: "" };

function quickAddReset(keep) {
  const when = keep && keep.when ? quickAdd.when : "today";
  const sport = keep && keep.sport ? quickAdd.sport : "";
  quickAdd.when = when;
  quickAdd.sport = sport;
  quickAdd.team = "";
  quickAdd.player = "";
  quickAdd.prop = "";
  quickAdd.value = "";
  quickAdd.q = "";
}

function quickAddPeople(board) {
  return (board && board.people) || [];
}

function quickAddScope(people, when) {
  if (!when || !people.length) return [];
  const games = typeof loadedGames === "function" ? loadedGames(people, when) : [];
  const keys = new Set((games || []).map((game) => `${game.match}|${game.kickoff}`));
  if (!keys.size) return [];
  return people.map((person) => {
    const bets = (person.bets || []).filter((bet) => keys.has(`${bet.match}|${bet.kickoff}`));
    return bets.length ? { ...person, bets } : null;
  }).filter(Boolean);
}

function quickAddSports(people) {
  return [...new Set(people.flatMap((person) => (person.bets || []).map((bet) => bet.sport).filter(Boolean)))].sort();
}

function quickAddOnSport(bet, sport) {
  return !sport || bet.sport === sport;
}

function quickAddOnTeam(person, teamName, sport) {
  if (!teamName) return true;
  const full = String(teamName || "").toLowerCase(), nick = full.split(/\s+/).pop();
  return (person.bets || []).some((bet) => {
    if (!Number(bet.odds) || !quickAddOnSport(bet, sport)) return false;
    return String(bet.match || "").toLowerCase().split(/ @ | v /).some((side) => {
      const text = side.trim();
      return text === full || (nick.length > 2 && text.endsWith(` ${nick}`)) || text === nick;
    });
  });
}

function quickAddTeams(people, sport) {
  return people.filter((person) => person.kind === "team" && !/^(any other|no )/i.test(person.name || "") && (person.bets || []).some((bet) => Number(bet.odds) && quickAddOnSport(bet, sport)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function quickAddPlayers(people, sport, teamName) {
  const q = quickAdd.q.trim().toLowerCase();
  return people.filter((person) => {
    if (person.kind !== "player" || /^(any other|no )/i.test(person.name || "")) return false;
    if (q && !person.name.toLowerCase().includes(q)) return false;
    const bets = (person.bets || []).filter((bet) => Number(bet.odds) && quickAddOnSport(bet, sport));
    if (!bets.length) return false;
    return quickAddOnTeam(person, teamName, sport);
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function quickAddPerson(people) {
  return people.find((person) => person.key === quickAdd.player) || null;
}

function quickAddPropList(person, sport) {
  if (!person || typeof legSwapStat !== "function") return [];
  const seen = new Map();
  (person.bets || []).forEach((bet) => {
    if (!Number(bet.odds) || !quickAddOnSport(bet, sport)) return;
    if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(bet))) return;
    const key = legSwapStat(person, bet);
    if (!key || seen.has(key)) return;
    const say = typeof legSwapWhat === "function" ? legSwapWhat(person, bet).replace(/\s+(over|under)\s+[\d.]+/i, "").replace(/\s+[+-]?\d+(?:\.\d+)?$/, "").trim() : key;
    seen.set(key, say || key);
  });
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function quickAddValues(person, sport, prop) {
  if (!person || !prop) return [];
  const want = typeof legSwapChance === "function" ? legSwapChance(-110) : 0.5;
  const best = new Map();
  (person.bets || []).forEach((bet) => {
    if (!Number(bet.odds) || !quickAddOnSport(bet, sport)) return;
    if (typeof legSwapStat === "function" && legSwapStat(person, bet) !== prop) return;
    if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(bet))) return;
    const label = String(bet.label || ""), under = /\bunder\b/i.test(label);
    const line = (label.match(/([\d.]+)\s*$/) || label.match(/\b(?:over|under)\s+([\d.]+)/i) || [])[1] || label;
    const key = `${under ? "u" : "o"}|${line}|${bet.match}|${bet.kickoff}`;
    const chance = typeof legSwapChance === "function" ? legSwapChance(bet.odds) : 0;
    const gap = Math.abs(chance - want), had = best.get(key);
    if (!had || gap < had.gap) best.set(key, { bet, gap, under, line });
  });
  return [...best.values()].sort((a, b) => Number(a.under) - Number(b.under) || a.gap - b.gap);
}

function quickAddChip(label, on, go) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `quick-add-chip${on ? " on" : ""}`;
  chip.textContent = label;
  chip.setAttribute("aria-pressed", String(!!on));
  chip.addEventListener("click", go);
  return chip;
}

function quickAddStep(title, nodes) {
  const step = document.createElement("div");
  step.className = "quick-add-step";
  const head = document.createElement("b");
  head.textContent = title;
  const row = document.createElement("div");
  row.className = "quick-add-picks";
  row.append(...nodes);
  step.append(head, row);
  return step;
}

function quickAddPut(board, fresh) {
  const people = quickAddPeople(board), person = quickAddPerson(people);
  const bet = person && (person.bets || []).find((row) => typeof parlayKey === "function" && parlayKey(row) === quickAdd.value);
  if (!person || !bet) return;
  if (fresh && typeof parlayLeg !== "undefined" && parlayLeg.size && typeof saveNew === "function") saveNew();
  if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && (parlayLeg.has(parlayKey(bet)) || parlayLeg.size >= 8)) return;
  if (typeof legSwapAdd === "function") legSwapAdd(person.kind === "player" ? person : null, bet);
  else {
    parlayLeg.set(parlayKey(bet), bet);
    if (person.kind === "player" && !parlayPick.has(person.key) && parlayPick.size < 8) parlayPick.set(person.key, person);
    if (typeof paintParlay === "function") paintParlay();
  }
  quickAddReset({ when: true, sport: true });
  if (typeof parlayOpenTray === "function") parlayOpenTray();
  if (typeof startPaint === "function") startPaint(1);
}

function quickAddBox(board) {
  const box = document.createElement("div");
  box.className = "quick-add";
  const head = document.createElement("div");
  head.className = "quick-add-head";
  head.innerHTML = `<b>Quick add</b><span>Today or this week → league → team or player → prop → line</span>`;
  box.append(head);

  const paint = (focusSearch) => {
    const keep = focusSearch && typeof focusSearch === "number" ? focusSearch : null;
    const next = quickAddBox(board);
    box.replaceWith(next);
    if (keep == null) return;
    const field = next.querySelector(".quick-add-search");
    if (!field) return;
    field.focus();
    try { field.setSelectionRange(keep, keep); } catch (error) {}
  };

  if (!quickAdd.when) quickAdd.when = "today";
  box.append(quickAddStep("When", [
    quickAddChip("Today", quickAdd.when === "today", () => {
      if (quickAdd.when === "today") return;
      quickAdd.when = "today";
      quickAddReset({ when: true });
      paint();
    }),
    quickAddChip("This week", quickAdd.when === "week", () => {
      if (quickAdd.when === "week") return;
      quickAdd.when = "week";
      quickAddReset({ when: true });
      paint();
    }),
  ]));

  const people = quickAddScope(quickAddPeople(board), quickAdd.when);
  const sports = quickAddSports(people);
  if (!sports.length) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    none.textContent = quickAdd.when === "week" ? "Week props are still loading, or none are posted yet." : "Today’s props are still loading, or none are posted yet.";
    box.append(none);
    return box;
  }
  if (quickAdd.sport && !sports.includes(quickAdd.sport)) quickAddReset({ when: true });
  if (!quickAdd.sport && typeof homeLeague === "string" && homeLeague && sports.includes(homeLeague)) quickAdd.sport = homeLeague;

  box.append(quickAddStep("League", sports.map((sport) => quickAddChip(sport, quickAdd.sport === sport, () => {
    quickAdd.sport = sport;
    quickAdd.team = "";
    quickAdd.player = "";
    quickAdd.prop = "";
    quickAdd.value = "";
    quickAdd.q = "";
    paint();
  }))));

  if (!quickAdd.sport) return box;

  const teams = quickAddTeams(people, quickAdd.sport);
  const teamName = (teams.find((row) => row.key === quickAdd.team) || {}).name || "";
  const who = document.createElement("div");
  who.className = "quick-add-step";
  const whoHead = document.createElement("b");
  whoHead.textContent = quickAdd.team ? "Player" : "Team or player";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "quick-add-search";
  search.placeholder = quickAdd.team ? "Filter players" : "Type a player, or pick a team";
  search.value = quickAdd.q;
  search.addEventListener("input", () => { quickAdd.q = search.value; paint(search.selectionStart); });
  const picks = document.createElement("div");
  picks.className = "quick-add-picks";
  if (!quickAdd.team && !quickAdd.q.trim()) {
    teams.forEach((team) => picks.append(quickAddChip(team.name, false, () => {
      quickAdd.team = team.key;
      quickAdd.player = "";
      quickAdd.prop = "";
      quickAdd.value = "";
      quickAdd.q = "";
      paint();
    })));
  }
  if (quickAdd.team) {
    picks.append(quickAddChip(`◂ ${teamName}`, false, () => {
      quickAdd.team = "";
      quickAdd.player = "";
      quickAdd.prop = "";
      quickAdd.value = "";
      paint();
    }));
  }
  quickAddPlayers(people, quickAdd.sport, teamName).slice(0, quickAdd.q.trim() || quickAdd.team ? 40 : 12).forEach((person) => {
    picks.append(quickAddChip(person.name, quickAdd.player === person.key, () => {
      quickAdd.player = person.key;
      quickAdd.prop = "";
      quickAdd.value = "";
      paint();
    }));
  });
  if (!picks.childElementCount) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    none.textContent = quickAdd.q.trim() ? "No one by that name." : "No players posted.";
    picks.append(none);
  }
  who.append(whoHead, search, picks);
  box.append(who);

  const person = quickAddPerson(people);
  if (!person) return box;

  const props = quickAddPropList(person, quickAdd.sport);
  box.append(quickAddStep("Prop", props.length ? props.map(([key, label]) => quickAddChip(label, quickAdd.prop === key, () => {
    quickAdd.prop = key;
    quickAdd.value = "";
    paint();
  })) : [Object.assign(document.createElement("p"), { className: "quick-add-none", textContent: "No props posted." })]));

  if (!quickAdd.prop) return box;

  const values = quickAddValues(person, quickAdd.sport, quickAdd.prop);
  box.append(quickAddStep("Line", values.length ? values.map((row) => {
    const price = Number(row.bet.odds);
    const what = typeof legSwapWhat === "function" ? legSwapWhat(person, row.bet) : row.bet.label;
    const key = typeof parlayKey === "function" ? parlayKey(row.bet) : "";
    const label = `${what} · ${price > 0 ? `+${price}` : price}${typeof findPct === "function" && findPct(price) ? ` · ${findPct(price)}` : ""}`;
    return quickAddChip(label, quickAdd.value === key, () => { quickAdd.value = key; paint(); });
  }) : [Object.assign(document.createElement("p"), { className: "quick-add-none", textContent: "No lines left for that prop." })]));

  if (!quickAdd.value) return box;

  const acts = document.createElement("div");
  acts.className = "quick-add-acts";
  const current = document.createElement("button");
  current.type = "button";
  current.className = "quick-add-go";
  current.textContent = "Add to Current Bet";
  current.addEventListener("click", () => quickAddPut(board, false));
  const fresh = document.createElement("button");
  fresh.type = "button";
  fresh.className = "quick-add-go new";
  fresh.textContent = "Add to New Bet";
  fresh.addEventListener("click", () => quickAddPut(board, true));
  acts.append(current, fresh);
  box.append(acts);
  return box;
}
