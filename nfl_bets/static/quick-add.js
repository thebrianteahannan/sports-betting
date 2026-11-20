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

function quickAddUpcoming(kickoff) {
  const kick = Date.parse(kickoff || "");
  return Number.isFinite(kick) && kick > Date.now();
}

function quickAddScope(people, when) {
  if (!when || !people.length) return [];
  const games = (typeof loadedGames === "function" ? loadedGames(people, when) : []).filter((game) => quickAddUpcoming(game.kickoff));
  const keys = new Set(games.map((game) => `${game.match}|${game.kickoff}`));
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

function quickAddGames(people, sport, when) {
  const rows = typeof loadedGames === "function" ? loadedGames(people, when || quickAdd.when || "today") : [];
  return (rows || []).filter((game) => quickAddUpcoming(game.kickoff) && quickAddOnSport(game, sport) && String(game.match || "").trim())
    .sort((a, b) => Date.parse(a.kickoff || "") - Date.parse(b.kickoff || "") || String(a.match).localeCompare(String(b.match)));
}

function quickAddGameKey(game) {
  return `${game.match}|${game.kickoff || ""}`;
}

function quickAddGameSay(game) {
  if (typeof gameShort === "function") return gameShort(game.match) || game.match;
  return String(game.match || "");
}

function quickAddLogoSrc(name) {
  if (typeof homeLogosLoad === "function") homeLogosLoad();
  const logos = (typeof homeLogos !== "undefined" && homeLogos) || {};
  if (logos[name]) return logos[name];
  const tail = ` ${String(name || "").split(" ").pop()}`, near = Object.keys(logos).filter((key) => key.endsWith(tail));
  return near.length === 1 ? logos[near[0]] : "";
}

function quickAddLogoImg(name) {
  const logo = quickAddLogoSrc(name);
  if (!logo) return "";
  const dark = logo.replace("/500/", "/500-dark/");
  return `<img class="desk-team-logo" src="${esc(dark)}" alt="" loading="lazy"${dark !== logo ? ` onerror="this.onerror=null;this.src='${esc(logo)}'"` : ""}>`;
}

function quickAddGameHtml(game) {
  const sides = String(game.match || "").split(/\s+@\s+/);
  if (sides.length !== 2) return esc(quickAddGameSay(game));
  return sides.map((side) => {
    const code = typeof gameShortTeam === "function" ? gameShortTeam(side) : side;
    return `${quickAddLogoImg(side)}<span>${esc(code)}</span>`;
  }).join(`<i class="at">@</i>`);
}

function quickAddBetRec(bet) {
  if (!bet) return false;
  if (typeof legIsRec === "function" && legIsRec(bet)) return true;
  if (typeof scriptRecAll !== "undefined" && scriptRecAll.has(`${bet.label}|${bet.market}`)) return true;
  const picks = (typeof homeRecs !== "undefined" && homeRecs && homeRecs.picks) || [];
  return picks.some((pick) => pick.label === bet.label && String(pick.market || "") === String(bet.market || ""));
}

function quickAddPersonRec(person, sport, gameKey) {
  return (person.bets || []).some((bet) => quickAddOnPick(bet, sport, gameKey) && quickAddBetRec(bet));
}

function quickAddGameRec(people, game, sport) {
  const key = quickAddGameKey(game);
  return people.some((person) => person.kind === "player" && quickAddPersonRec(person, sport, key));
}

function quickAddPropRec(person, prop, sport, gameKey) {
  return (person.bets || []).some((bet) => {
    if (!quickAddOnPick(bet, sport, gameKey) || !quickAddBetRec(bet)) return false;
    const key = person.kind === "team" ? quickAddTeamPropKey(bet) : (typeof legSwapStat === "function" ? legSwapStat(person, bet) : "");
    return key === prop;
  });
}

function quickAddOnGame(person, gameKey, sport) {
  if (!gameKey) return true;
  const [match, kickoff] = String(gameKey).split("|");
  return (person.bets || []).some((bet) => {
    if (!Number(bet.odds) || !quickAddOnSport(bet, sport)) return false;
    if (match && bet.match !== match) return false;
    if (kickoff && bet.kickoff !== kickoff) return false;
    return true;
  });
}

function quickAddBare(name) {
  const raw = typeof plainName === "function" ? plainName(String(name || "").replace(/, out$/, "")) : String(name || "").toLowerCase();
  return raw.replace(/ (jr|sr|ii|iii|iv|v)$/, "");
}

function quickAddPlayers(people, sport, gameKey) {
  const q = quickAdd.q.trim().toLowerCase();
  return people.filter((person) => {
    if (person.kind !== "player" || /^(any other|no )/i.test(person.name || "")) return false;
    if (q && !person.name.toLowerCase().includes(q)) return false;
    const bets = (person.bets || []).filter((bet) => Number(bet.odds) && quickAddOnSport(bet, sport));
    if (!bets.length) return false;
    return quickAddOnGame(person, gameKey, sport);
  }).sort((a, b) => Number(quickAddPersonRec(b, sport, gameKey)) - Number(quickAddPersonRec(a, sport, gameKey)) || a.name.localeCompare(b.name));
}

function quickAddTeams(people, sport, gameKey) {
  if (!gameKey) return [];
  const q = quickAdd.q.trim().toLowerCase();
  const [match] = String(gameKey).split("|");
  const sides = String(match || "").split(/\s+@\s+/).map((side) => side.trim()).filter(Boolean);
  return people.filter((person) => {
    if (person.kind !== "team") return false;
    if (q && !person.name.toLowerCase().includes(q)) return false;
    if (!sides.some((side) => side === person.name || quickAddClubMatch(side, person.name) || quickAddClubMatch(person.name, side))) return false;
    return (person.bets || []).some((bet) => Number(bet.odds) && quickAddOnPick(bet, sport, gameKey));
  }).sort((a, b) => {
    const ai = sides.findIndex((side) => side === a.name || quickAddClubMatch(side, a.name));
    const bi = sides.findIndex((side) => side === b.name || quickAddClubMatch(side, b.name));
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name);
  });
}

function quickAddSideNick(side) {
  return typeof whereNick === "function" ? whereNick(side) : String(side || "").split(" ").pop();
}

function quickAddClubMatch(side, nick) {
  const team = String(nick || "").trim();
  if (!team || !side) return false;
  const mine = quickAddSideNick(side);
  const fold = (text) => String(text || "").toLowerCase();
  return side === team || side.endsWith(` ${team}`) || team === mine || team.endsWith(` ${mine}`) || mine === team
    || fold(side) === fold(team) || fold(side).endsWith(` ${fold(mine)}`) || fold(team).endsWith(` ${fold(mine)}`);
}

function quickAddFold(text) {
  return String(text || "").toLowerCase();
}

function quickAddPersonClub(person, game) {
  const bare = quickAddBare(person && person.name);
  const fromClub = typeof clubOf !== "undefined" && bare ? clubOf.get(bare) : "";
  const nick = String(fromClub || (person && person.team) || "").trim();
  const sidesOf = (match) => String(match || "").split(/\s+@\s+/).map((side) => side.trim()).filter(Boolean);
  if (fromClub && game && game.match) {
    const hit = sidesOf(game.match).find((side) => quickAddFold(side) === quickAddFold(fromClub) || quickAddClubMatch(side, fromClub) || quickAddClubMatch(fromClub, side));
    if (hit) return hit;
    return fromClub;
  }
  if (game && game.match && nick) {
    const hit = sidesOf(game.match).find((side) => quickAddClubMatch(side, nick) || (fromClub && (side === fromClub || quickAddFold(side) === quickAddFold(fromClub))));
    if (hit) return hit;
  }
  if (nick && !/^other$/i.test(nick)) return nick;
  return "";
}

function quickAddPersonPos(person) {
  if (person && person.pos) return String(person.pos).trim();
  const bare = quickAddBare(person && person.name);
  return (typeof clubSpot !== "undefined" && bare && clubSpot.get(bare)) || "";
}

function quickAddPersonSay(person) {
  if (person && person.kind === "team") return person.name;
  const pos = quickAddPersonPos(person);
  return pos ? `${person.name} · ${pos}` : person.name;
}

function quickAddPlayerGroups(players, sport, gameKey, game) {
  const order = game && game.match
    ? String(game.match).split(/\s+@\s+/).map((side) => side.trim()).filter(Boolean)
    : [];
  const groups = new Map();
  const loose = [];
  players.forEach((person) => {
    const club = quickAddPersonClub(person, game);
    if (!club) { loose.push(person); return; }
    const key = club.toLowerCase();
    if (!groups.has(key)) groups.set(key, { club, people: [] });
    groups.get(key).people.push(person);
  });
  const rows = [...groups.values()].filter((row) => row.people.length);
  rows.forEach((row) => {
    row.people.sort((a, b) => Number(quickAddPersonRec(b, sport, gameKey)) - Number(quickAddPersonRec(a, sport, gameKey)) || a.name.localeCompare(b.name));
    row.rec = row.people.some((person) => quickAddPersonRec(person, sport, gameKey));
  });
  rows.sort((a, b) => {
    const ai = order.findIndex((side) => quickAddClubMatch(side, a.club) || side.toLowerCase() === a.club.toLowerCase());
    const bi = order.findIndex((side) => quickAddClubMatch(side, b.club) || side.toLowerCase() === b.club.toLowerCase());
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return Number(b.rec) - Number(a.rec) || a.club.localeCompare(b.club);
  });
  if (loose.length) {
    loose.sort((a, b) => Number(quickAddPersonRec(b, sport, gameKey)) - Number(quickAddPersonRec(a, sport, gameKey)) || a.name.localeCompare(b.name));
    rows.push({ club: "", people: loose, rec: loose.some((person) => quickAddPersonRec(person, sport, gameKey)) });
  }
  return rows;
}

function quickAddTeamHead(club) {
  if (!club || /^other$/i.test(club)) return null;
  const head = document.createElement("b");
  head.className = "quick-add-team";
  const code = typeof gameShortTeam === "function" ? gameShortTeam(club) : quickAddSideNick(club);
  if (!code || code === "OTH") return null;
  head.innerHTML = `${quickAddLogoImg(club)}<span>${esc(code || club)}</span>`;
  return head;
}

const quickAddRosterJobs = new Set();

function quickAddLoadRosters(game, sport, paint) {
  if (!game || !game.match || !sport) return;
  String(game.match).split(/\s+@\s+/).map((side) => side.trim()).filter(Boolean).forEach((side) => {
    const key = `${sport}|${side}`;
    if (quickAddRosterJobs.has(key) || (typeof clubAsked !== "undefined" && clubAsked.has(key))) return;
    quickAddRosterJobs.add(key);
    if (typeof clubAsked !== "undefined") clubAsked.add(key);
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: side, sport }) })
      .then((res) => res.json())
      .then((data) => {
        (data.players || []).forEach((row) => {
          const name = String((row && row.name) || row || "").replace(/, out$/, "");
          if (!name) return;
          const bare = quickAddBare(name);
          if (typeof clubOf !== "undefined") clubOf.set(bare, side);
          if (row && row.pos && typeof clubSpot !== "undefined") clubSpot.set(bare, String(row.pos));
        });
        if (typeof paint === "function") paint();
      })
      .catch(() => {});
  });
}

function quickAddPerson(people) {
  return people.find((person) => person.key === quickAdd.player) || null;
}

function quickAddOnPick(bet, sport, gameKey) {
  if (!Number(bet.odds) || !quickAddOnSport(bet, sport)) return false;
  if (!gameKey) return true;
  const [match, kickoff] = String(gameKey).split("|");
  if (match && bet.match !== match) return false;
  if (kickoff && bet.kickoff !== kickoff) return false;
  return true;
}

function quickAddPropSay(stat) {
  const raw = String(stat || "").replace(/\bn\+\b/g, "").replace(/\s+/g, " ").trim();
  return raw.replace(/\b\w/g, (c) => c.toUpperCase()) || "Prop";
}

function quickAddTeamPropKey(bet) {
  const market = String(bet.market || "").trim();
  if (/^moneyline$/i.test(market)) return "Moneyline";
  if (/^spread$/i.test(market)) return "Spread";
  if (/^total$/i.test(market)) return "Total";
  if (/^alternate spread$/i.test(market)) return "Alt spread";
  if (/^alternate total/i.test(market)) return "Alt total";
  return market || "Bet";
}

function quickAddPropList(person, sport, gameKey) {
  if (!person) return [];
  const seen = new Map();
  if (person.kind === "team") {
    (person.bets || []).forEach((bet) => {
      if (!quickAddOnPick(bet, sport, gameKey)) return;
      if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(bet))) return;
      const key = quickAddTeamPropKey(bet);
      if (!key) return;
      const had = seen.get(key), rec = quickAddBetRec(bet);
      if (!had) seen.set(key, { label: key, rec });
      else if (rec) had.rec = true;
    });
    const order = ["Moneyline", "Spread", "Total", "Alt spread", "Alt total"];
    return [...seen.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || Number(b[1].rec) - Number(a[1].rec) || a[1].label.localeCompare(b[1].label));
  }
  if (typeof legSwapStat !== "function") return [];
  (person.bets || []).forEach((bet) => {
    if (!quickAddOnPick(bet, sport, gameKey)) return;
    if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(bet))) return;
    const key = legSwapStat(person, bet);
    if (!key) return;
    const had = seen.get(key), rec = quickAddBetRec(bet);
    if (!had) seen.set(key, { label: quickAddPropSay(key), rec });
    else if (rec) had.rec = true;
  });
  return [...seen.entries()].sort((a, b) => Number(b[1].rec) - Number(a[1].rec) || a[1].label.localeCompare(b[1].label));
}

function quickAddLineNum(person, bet) {
  return Number((String(bet.label || "").replace(person.name, "").match(/\d+(?:\.\d+)?/) || String(bet.market || "").match(/\d+(?:\.\d+)?/) || [])[0]) || 0;
}

function quickAddValues(person, sport, prop, gameKey) {
  if (!person || !prop) return [];
  const seen = new Set(), rows = [];
  (person.bets || []).forEach((bet) => {
    if (!quickAddOnPick(bet, sport, gameKey)) return;
    const key = person.kind === "team" ? quickAddTeamPropKey(bet) : (typeof legSwapStat === "function" ? legSwapStat(person, bet) : "");
    if (key !== prop) return;
    if (typeof parlayKey === "function" && typeof parlayLeg !== "undefined" && parlayLeg.has(parlayKey(bet))) return;
    const id = typeof parlayKey === "function" ? parlayKey(bet) : `${bet.label}|${bet.odds}|${bet.match}`;
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ person, bet, under: /\bunder\b/i.test(bet.label || ""), num: quickAddLineNum(person, bet) });
  });
  return rows.sort((a, b) => Number(quickAddBetRec(b.bet)) - Number(quickAddBetRec(a.bet)) || a.num - b.num || Number(a.under) - Number(b.under) || Number(a.bet.odds) - Number(b.bet.odds));
}

function quickAddLineButton(person, bet, on, go) {
  const price = Number(bet.odds);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `quick-add-line${on ? " on" : ""}${quickAddBetRec(bet) ? " rec" : ""}`;
  button.setAttribute("aria-pressed", String(!!on));
  const what = person.kind === "team"
    ? (typeof legGameWhat === "function" ? legGameWhat(bet) : bet.label)
    : (typeof legSwapWhat === "function" ? legSwapWhat(person, bet) : bet.label);
  const cash = typeof findCash === "function" ? findCash(price) : "";
  const inner = document.createElement("span");
  inner.className = "quick-add-line-in";
  inner.innerHTML = [
    `<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`,
    typeof findPct === "function" && findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`,
    cash && `<i class="pay">${esc(`$5 profits ${cash}`)}</i>`,
    `<i class="prop">${esc(what)}</i>`,
  ].filter(Boolean).join("");
  button.append(inner);
  const rec = typeof scriptRecPill === "function" && scriptRecPill(bet);
  if (rec) inner.append(rec);
  else if (quickAddBetRec(bet)) {
    const pill = document.createElement("i");
    pill.className = "find-rec-pill";
    pill.textContent = "Recommended";
    inner.append(pill);
  }
  if (bet.sport === "NBA" && person.kind !== "team" && typeof proofOf === "function" && typeof proofPill === "function") {
    const tip = proofOf(person.name, bet.market, bet.label, bet.odds);
    if (tip) inner.append(proofPill(tip));
  }
  button.addEventListener("click", go);
  return button;
}

function quickAddChip(label, on, go, opts) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `quick-add-chip${on ? " on" : ""}${opts && opts.rec ? " rec" : ""}`;
  chip.setAttribute("aria-pressed", String(!!on));
  if (opts && opts.html) chip.innerHTML = opts.html;
  else chip.textContent = label;
  if (opts && opts.rec) {
    const tag = document.createElement("i");
    tag.className = "qa-rec";
    tag.textContent = opts.recText || "R";
    chip.append(tag);
  }
  chip.addEventListener("click", go);
  return chip;
}

function quickAddStep(title, nodes, key) {
  const step = document.createElement("div");
  step.className = "quick-add-step";
  if (key) step.dataset.quick = key;
  const head = document.createElement("b");
  head.textContent = title;
  const row = document.createElement("div");
  row.className = "quick-add-picks";
  row.append(...nodes);
  step.append(head, row);
  return step;
}

function quickAddReveal(box) {
  if (!box || !box.isConnected) return;
  const tip = box.querySelector(quickAdd.value ? ".quick-add-acts" : quickAdd.prop ? "[data-quick='value']" : quickAdd.player ? "[data-quick='prop']" : quickAdd.sport ? "[data-quick='who']" : "[data-quick='league']") || box;
  const glass = document.getElementById("desk-glass-in");
  const go = () => {
    if (!tip.isConnected) return;
    if (!glass || !glass.contains(tip)) {
      tip.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    const tray = document.querySelector("#desk-glass-in .find-board > .find-tray:not([hidden])");
    const inTray = !!(tray && tray.contains(tip));
    // Tip lives in the sticky tray — scrolling glass for "above cover" yanks the page up.
    if (inTray) {
      const room = glass.getBoundingClientRect().bottom - 16;
      const tipRect = tip.getBoundingClientRect();
      if (tipRect.bottom <= room) return;
      glass.scrollTo({ top: glass.scrollTop + (tipRect.bottom - room), behavior: "smooth" });
      return;
    }
    const shown = tray && tray.getClientRects().length;
    const cover = (shown ? tray.getBoundingClientRect().bottom : glass.getBoundingClientRect().top) + 8;
    const tipRect = tip.getBoundingClientRect();
    const room = glass.getBoundingClientRect().bottom - 16;
    let delta = 0;
    if (tipRect.bottom > room) {
      const clear = room - cover;
      delta = tipRect.height > clear ? tipRect.top - cover : tipRect.bottom - room;
    } else if (tipRect.top < cover) {
      delta = tipRect.top - cover;
    }
    if (Math.abs(delta) < 4) return;
    glass.scrollTo({ top: glass.scrollTop + delta, behavior: "smooth" });
  };
  requestAnimationFrame(() => requestAnimationFrame(go));
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
  if (typeof legNewClose === "function") legNewClose();
  if (typeof parlayOpenTray === "function") parlayOpenTray();
  if (typeof startPaint === "function") startPaint(1);
}

function quickAddBox(board) {
  const box = document.createElement("div");
  box.className = "quick-add";
  const head = document.createElement("div");
  head.className = "quick-add-head";
  head.innerHTML = `<b>Quick add</b><span>Today or this week → league → game → team or player → prop → value</span>`;
  box.append(head);

  const paint = (focusSearch) => {
    const keep = focusSearch && typeof focusSearch === "number" ? focusSearch : null;
    const next = quickAddBox(board);
    box.replaceWith(next);
    if (keep != null) {
      const field = next.querySelector(".quick-add-search");
      if (!field) return;
      field.focus();
      try { field.setSelectionRange(keep, keep); } catch (error) {}
      return;
    }
    quickAddReveal(next);
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
  ], "when"));

  const all = quickAddPeople(board);
  const people = quickAddScope(all, quickAdd.when);
  const sports = quickAddSports(people);
  if (!sports.length) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    const loaded = !!(all.length || (typeof findParts !== "undefined" && findParts[quickAdd.when] && findParts[quickAdd.when].data));
    none.textContent = !loaded
      ? "Looking up the board."
      : quickAdd.when === "week"
        ? "No games left this week that haven’t started."
        : "No games left today that haven’t started.";
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
  })), "league"));

  if (!quickAdd.sport) return box;

  const games = quickAddGames(people, quickAdd.sport, quickAdd.when);
  const game = games.find((row) => quickAddGameKey(row) === quickAdd.team) || null;
  const who = document.createElement("div");
  who.className = "quick-add-step";
  who.dataset.quick = "who";
  const whoHead = document.createElement("b");
  whoHead.textContent = quickAdd.team ? "Team or player" : "Game or player";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "quick-add-search";
  search.placeholder = quickAdd.team ? "Filter teams or players" : "Type a player, or pick a game";
  search.value = quickAdd.q;
  search.addEventListener("input", () => { quickAdd.q = search.value; paint(search.selectionStart); });
  const picks = document.createElement("div");
  picks.className = "quick-add-picks";
  if (!quickAdd.team && !quickAdd.q.trim()) {
    games.map((row) => ({ row, rec: quickAddGameRec(people, row, quickAdd.sport) }))
      .sort((a, b) => Number(b.rec) - Number(a.rec))
      .forEach(({ row, rec }) => {
        picks.append(quickAddChip(quickAddGameSay(row), false, () => {
          quickAdd.team = quickAddGameKey(row);
          quickAdd.player = "";
          quickAdd.prop = "";
          quickAdd.value = "";
          quickAdd.q = "";
          paint();
        }, { html: quickAddGameHtml(row), rec }));
      });
  }
  if (quickAdd.team) {
    picks.append(quickAddChip(`◂ ${game ? quickAddGameSay(game) : "Games"}`, false, () => {
      quickAdd.team = "";
      quickAdd.player = "";
      quickAdd.prop = "";
      quickAdd.value = "";
      paint();
    }, game ? { html: `◂ ${quickAddGameHtml(game)}` } : null));
    quickAddLoadRosters(game, quickAdd.sport, () => { if (box.isConnected) paint(); });
    const teams = quickAddTeams(people, quickAdd.sport, quickAdd.team);
    if (teams.length) {
      const gameBlock = document.createElement("div");
      gameBlock.className = "quick-add-team-block";
      const gameHead = document.createElement("b");
      gameHead.className = "quick-add-team";
      gameHead.textContent = "Game";
      const gameRow = document.createElement("div");
      gameRow.className = "quick-add-team-picks";
      teams.forEach((person) => {
        const rec = quickAddPersonRec(person, quickAdd.sport, quickAdd.team);
        gameRow.append(quickAddChip(quickAddPersonSay(person), quickAdd.player === person.key, () => {
          quickAdd.player = person.key;
          quickAdd.prop = "";
          quickAdd.value = "";
          paint();
        }, { rec, html: `${quickAddLogoImg(person.name)}<span>${esc(person.name)}</span>` }));
      });
      gameBlock.append(gameHead, gameRow);
      picks.append(gameBlock);
    }
  }
  const playerCap = quickAdd.q.trim() || quickAdd.team ? 60 : 24;
  const players = quickAddPlayers(people, quickAdd.sport, quickAdd.team).slice(0, playerCap);
  quickAddPlayerGroups(players, quickAdd.sport, quickAdd.team, game).forEach((group) => {
    const block = document.createElement("div");
    block.className = "quick-add-team-block";
    const head = quickAddTeamHead(group.club);
    if (head) block.append(head);
    const row = document.createElement("div");
    row.className = "quick-add-team-picks";
    group.people.forEach((person) => {
      const rec = quickAddPersonRec(person, quickAdd.sport, quickAdd.team);
      row.append(quickAddChip(quickAddPersonSay(person), quickAdd.player === person.key, () => {
        quickAdd.player = person.key;
        quickAdd.prop = "";
        quickAdd.value = "";
        paint();
      }, { rec }));
    });
    block.append(row);
    picks.append(block);
  });
  if (!picks.childElementCount) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    none.textContent = quickAdd.q.trim() ? "No one by that name." : "No games posted.";
    picks.append(none);
  }
  who.append(whoHead, search, picks);
  box.append(who);

  const person = quickAddPerson(people);
  if (!person) return box;

  const props = quickAddPropList(person, quickAdd.sport, quickAdd.team);
  box.append(quickAddStep("1. Prop", props.length ? props.map(([key, row]) => quickAddChip(row.label, quickAdd.prop === key, () => {
    quickAdd.prop = key;
    quickAdd.value = "";
    paint();
  }, { rec: row.rec })) : [Object.assign(document.createElement("p"), { className: "quick-add-none", textContent: "No props posted." })], "prop"));

  if (!quickAdd.prop) return box;

  const values = quickAddValues(person, quickAdd.sport, quickAdd.prop, quickAdd.team);
  const valueStep = document.createElement("div");
  valueStep.className = "quick-add-step";
  valueStep.dataset.quick = "value";
  const valueHead = document.createElement("b");
  valueHead.textContent = "2. Value";
  valueStep.append(valueHead);
  if (!values.length) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    none.textContent = "No lines left for that prop.";
    valueStep.append(none);
  } else {
    const lines = document.createElement("div");
    lines.className = "quick-add-lines";
    values.forEach((row) => {
      const key = typeof parlayKey === "function" ? parlayKey(row.bet) : "";
      lines.append(quickAddLineButton(person, row.bet, quickAdd.value === key, () => { quickAdd.value = key; paint(); }));
    });
    valueStep.append(lines);
  }
  box.append(valueStep);

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
