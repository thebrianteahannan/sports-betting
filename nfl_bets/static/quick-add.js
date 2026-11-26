/** Quick add above Recommended: today/week → league → team or player → player → prop → value → current or new bet. */
const QUICK_WHEN = [["done", "Finished Today"], ["live", "Live"], ["next", "Upcoming Today"], ["tomorrow", "Tomorrow"], ["week", "This Week"]];
const quickAdd = { when: "next", sport: "", team: "", side: "", player: "", prop: "", value: "", q: "" };
let quickAddHideDef = true;
try { quickAddHideDef = localStorage.getItem("quickAddHideDef") !== "0"; } catch (error) {}

function quickAddReset(keep) {
  const when = keep && keep.when ? quickAdd.when : "next";
  const sport = keep && keep.sport ? quickAdd.sport : "";
  quickAdd.when = when;
  quickAdd.sport = sport;
  quickAdd.team = "";
  quickAdd.side = "";
  quickAdd.player = "";
  quickAdd.prop = "";
  quickAdd.value = "";
  quickAdd.q = "";
}

function quickAddPeople(board) {
  return (board && board.people) || [];
}

function quickAddSpan(when) {
  return when === "tomorrow" || when === "week" ? "week" : "today";
}

function quickAddWeekFresh() {
  const part = typeof findParts !== "undefined" && findParts.week;
  return part && part.data && Date.now() - part.at < 30 * 60 * 1000 ? part : null;
}

function quickAddPullWeek(board, paint) {
  if (!board || (quickAdd.when !== "tomorrow" && quickAdd.when !== "week")) return false;
  const part = quickAddWeekFresh();
  if (part && board.people && board.people.quickWeekAt === part.at) return false;
  if (board.quickWeek === "in") return true;
  if (part) {
    if (typeof mergeFindWeek === "function") mergeFindWeek(board, part.data);
    if (board.people) board.people.quickWeekAt = part.at;
    return false;
  }
  if (board.quickWeek === "miss" || typeof loadFind !== "function") return false;
  board.quickWeek = "in";
  loadFind("week").then((more) => {
    board.quickWeek = "";
    if (!board.isConnected) return;
    if (typeof mergeFindWeek === "function") mergeFindWeek(board, more);
    const at = typeof findParts !== "undefined" && findParts.week && findParts.week.at;
    if (board.people && at) board.people.quickWeekAt = at;
    paint();
  }).catch(() => {
    board.quickWeek = "miss";
    if (board.isConnected) paint();
  });
  return true;
}

function quickAddScope(people, when) {
  if (!when || !people.length) return [];
  const games = (typeof loadedGames === "function" ? loadedGames(people, quickAddSpan(when)) : []).filter((game) => typeof whenBucket !== "function" || whenBucket(Date.parse(game.kickoff || ""), game.match) === when);
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

function quickAddDoneList(sport) {
  if (typeof startGamesFor !== "function") return [];
  return startGamesFor("done").filter((game) => game && String(game.match || "").trim() && (!sport || game.sport === sport))
    .sort((a, b) => Date.parse(a.kickoff || a.when || "") - Date.parse(b.kickoff || b.when || "") || String(a.match).localeCompare(String(b.match)));
}

function quickAddRosterReady(game, sport) {
  const bag = game && quickAddGameRosters.get(quickAddRosterBag(game, sport));
  if (!bag) return false;
  const sides = quickAddGameSides(game);
  return sides.length > 0 && sides.every((side) => bag.has(side));
}

function quickAddPastPeople(game, sport, have) {
  const bag = game && quickAddGameRosters.get(quickAddRosterBag(game, sport));
  if (!bag) return [];
  const q = quickAdd.q.trim().toLowerCase();
  const seen = new Set((have || []).map((person) => quickAddBare(person.name)));
  const out = [];
  bag.forEach((set) => {
    set.forEach((name) => {
      if (q && !String(name).toLowerCase().includes(q)) return;
      const bare = quickAddBare(name);
      if (!bare || seen.has(bare)) return;
      seen.add(bare);
      out.push({ key: bare, name, kind: "player", bets: [], past: true });
    });
  });
  return out;
}

function quickAddGames(people, sport, when) {
  const want = when || quickAdd.when || "next";
  if (want === "done") return quickAddDoneList(sport);
  if (want === "live" && typeof startGamesFor === "function") {
    return startGamesFor("live").filter((game) => game && String(game.match || "").trim() && quickAddOnSport(game, sport))
      .sort((a, b) => Date.parse(a.kickoff || a.when || "") - Date.parse(b.kickoff || b.when || "") || String(a.match).localeCompare(String(b.match)));
  }
  const rows = typeof loadedGames === "function" ? loadedGames(people, quickAddSpan(want)) : [];
  return (rows || []).filter((game) => quickAddOnSport(game, sport) && String(game.match || "").trim() && (typeof whenBucket !== "function" || whenBucket(Date.parse(game.kickoff || ""), game.match) === want))
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

function quickAddOnSide(person, side, game, people) {
  if (!side) return true;
  const club = quickAddResolveSide(person, game, quickAdd.sport, people) || quickAddPersonClub(person, game);
  if (!club) return false;
  return quickAddClubMatch(side, club) || quickAddClubMatch(club, side) || quickAddFold(side) === quickAddFold(club);
}

function quickAddSideOn(person) {
  if (!quickAdd.side || !person) return false;
  return quickAddClubMatch(quickAdd.side, person.name) || quickAddClubMatch(person.name, quickAdd.side) || quickAddFold(quickAdd.side) === quickAddFold(person.name);
}

function quickAddPlayers(people, sport, gameKey, game, anySide) {
  const q = quickAdd.q.trim().toLowerCase();
  return people.filter((person) => {
    if (person.kind !== "player" || /^(any other|any quarter|either team|both teams|no )/i.test(person.name || "") || /\bto\b/i.test(person.name || "")) return false;
    if (q && !person.name.toLowerCase().includes(q)) return false;
    if (person.past) return anySide ? true : quickAddOnSide(person, quickAdd.side, game, people);
    const bets = (person.bets || []).filter((bet) => Number(bet.odds) && quickAddOnSport(bet, sport));
    if (!bets.length) return false;
    if (!quickAddOnGame(person, gameKey, sport)) return false;
    return anySide ? true : quickAddOnSide(person, quickAdd.side, game, people);
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
  const left = String(side || "").trim();
  const team = String(nick || "").trim();
  if (!left || !team) return false;
  const fold = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const a = fold(left), b = fold(team);
  if (!a || !b) return false;
  if (a === b) return true;
  const nickA = fold(quickAddSideNick(left));
  const nickB = fold(quickAddSideNick(team));
  // Match full name to nickname either way — never test a side against its own nick alone.
  if (nickA && (b === nickA || b.endsWith(` ${nickA}`))) return true;
  if (nickB && (a === nickB || a.endsWith(` ${nickB}`))) return true;
  if (nickA && nickB && nickA === nickB) return true;
  const codeA = typeof gameShortTeam === "function" ? fold(gameShortTeam(left)) : "";
  const codeB = typeof gameShortTeam === "function" ? fold(gameShortTeam(team)) : "";
  if (codeA && b === codeA) return true;
  if (codeB && a === codeB) return true;
  if (codeA && codeB && codeA === codeB) return true;
  return false;
}

function quickAddFold(text) {
  return String(text || "").toLowerCase();
}

function quickAddGameSides(game) {
  return String((game && game.match) || "").split(/\s+@\s+/).map((side) => side.trim()).filter(Boolean);
}

function quickAddSideHit(sides, club) {
  const want = String(club || "").trim();
  if (!want || !sides || !sides.length) return "";
  const hits = sides.filter((side) => quickAddClubMatch(side, want));
  return hits.length === 1 ? hits[0] : "";
}

function quickAddClubLookup(person) {
  const bare = quickAddBare(person && person.name);
  if (!bare) return String((person && person.team) || "").trim();
  // Exact full-name only. Last-name fuzzy parks Josh Allen under Miami when Kaytron Allen is on that roster.
  if (typeof clubOf !== "undefined") {
    const direct = clubOf.get(bare);
    if (direct) return String(direct).trim();
  }
  return String((person && person.team) || "").trim();
}

function quickAddPersonClub(person, game) {
  const sides = quickAddGameSides(game);
  const nick = quickAddClubLookup(person);
  if (sides.length) {
    const hit = quickAddSideHit(sides, nick);
    if (hit) return hit;
  }
  if (nick && !/^other$/i.test(nick)) return nick;
  return "";
}

function quickAddRosterBag(game, sport) {
  return `${sport || ""}|${quickAddGameKey(game || {})}`;
}

function quickAddTdSide(people, person, game) {
  const sides = quickAddGameSides(game);
  if (sides.length !== 2 || !person || !people) return "";
  const want = quickAddBare(person.name);
  if (!want) return "";
  const spot = `${game.match}|${game.kickoff || ""}`;
  if (people.tdBook && people.tdBook.who) {
    let club = people.tdBook.who.get(`${want}|${spot}`);
    if (!club) {
      for (const [key, value] of people.tdBook.who) {
        if (!key.endsWith(`|${spot}`)) continue;
        const player = key.slice(0, key.length - spot.length - 1);
        if (player === want || player.startsWith(`${want} `) || want.startsWith(`${player} `)) {
          club = value;
          break;
        }
      }
    }
    const hit = club ? quickAddSideHit(sides, club) : "";
    if (hit) return hit;
  }
  const hits = [];
  people.forEach((row) => {
    if (!row || row.kind !== "team") return;
    const side = quickAddSideHit(sides, row.name);
    if (!side) return;
    (row.bets || []).forEach((bet) => {
      if (bet.match !== game.match) return;
      if (game.kickoff && bet.kickoff && bet.kickoff !== game.kickoff) return;
      if (!/td scorer$|to score a td$/i.test(String(bet.market || ""))) return;
      const label = quickAddBare(bet.label);
      if (label === want || label.startsWith(`${want} `) || want.startsWith(`${label} `)) hits.push(side);
    });
  });
  const unique = [...new Set(hits)];
  return unique.length === 1 ? unique[0] : "";
}

function quickAddResolveSide(person, game, sport, people) {
  const sides = quickAddGameSides(game);
  if (sides.length !== 2) return quickAddPersonClub(person, game);
  const fromTd = quickAddTdSide(people, person, game);
  if (fromTd) return fromTd;
  const bare = quickAddBare(person && person.name);
  const bag = quickAddGameRosters.get(quickAddRosterBag(game, sport || quickAdd.sport || game.sport));
  if (bag) {
    const ready = sides.every((side) => bag.has(side));
    if (ready) {
      const hits = sides.filter((side) => [...bag.get(side)].some((one) => one === bare || quickAddBare(one) === bare));
      if (hits.length === 1) return hits[0];
      return "";
    }
  }
  return "";
}

const quickAddDefPos = new Set(["CB", "S", "FS", "SS", "DB", "LB", "ILB", "OLB", "MLB", "DT", "DE", "DL", "NT", "EDGE"]);

function quickAddIsDefense(person) {
  if (!person) return false;
  if (/defense|special teams/i.test(person.name || "")) return true;
  return quickAddDefPos.has(String(quickAddPersonPos(person) || "").toUpperCase());
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

function quickAddPlayerGroups(players, sport, gameKey, game, people) {
  const order = quickAddGameSides(game);
  const groups = new Map();
  const loose = [];
  players.forEach((person) => {
    const club = order.length === 2 ? quickAddResolveSide(person, game, sport, people) : quickAddPersonClub(person, game);
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
  if (loose.length && order.length !== 2) {
    loose.sort((a, b) => Number(quickAddPersonRec(b, sport, gameKey)) - Number(quickAddPersonRec(a, sport, gameKey)) || a.name.localeCompare(b.name));
    rows.push({ club: "", people: loose, rec: loose.some((person) => quickAddPersonRec(person, sport, gameKey)) });
  } else if (loose.length && order.length === 2) {
    // Still unknown after roster lookup: keep them off a fake Other card; attach once a side resolves.
    loose.sort((a, b) => Number(quickAddPersonRec(b, sport, gameKey)) - Number(quickAddPersonRec(a, sport, gameKey)) || a.name.localeCompare(b.name));
    rows.push({ club: "", people: loose, rec: loose.some((person) => quickAddPersonRec(person, sport, gameKey)), pending: true });
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
const quickAddGameRosters = new Map();

function quickAddLoadRosters(game, sport, paint) {
  sport = sport || (game && game.sport) || "";
  if (!game || !game.match || !sport) return;
  const gameKey = quickAddRosterBag(game, sport);
  let bag = quickAddGameRosters.get(gameKey);
  if (!bag) {
    bag = new Map();
    quickAddGameRosters.set(gameKey, bag);
  }
  quickAddGameSides(game).forEach((side) => {
    const job = `${gameKey}|${side}`;
    if (quickAddRosterJobs.has(job)) return;
    if (bag.has(side) && bag.get(side).size) return;
    quickAddRosterJobs.add(job);
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: side, sport }) })
      .then((res) => res.json())
      .then((data) => {
        const set = new Set();
        (data.players || []).forEach((row) => {
          const name = String((row && row.name) || row || "").replace(/, out$/, "");
          if (!name) return;
          const bare = quickAddBare(name);
          if (!bare) return;
          set.add(name);
          if (typeof clubOf !== "undefined") clubOf.set(bare, side);
          if (row && row.pos && typeof clubSpot !== "undefined") clubSpot.set(bare, String(row.pos));
        });
        bag.set(side, set);
        // Empty or failed roster must retry — do not treat clubAsked as done.
        if (!set.size) quickAddRosterJobs.delete(job);
        if (typeof paint === "function") paint();
      })
      .catch(() => { quickAddRosterJobs.delete(job); });
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

function quickAddRecPick(bet) {
  if (!bet) return null;
  const stored = typeof scriptRecAll !== "undefined" ? scriptRecAll.get(`${bet.label}|${bet.market}`) : null;
  const picks = (typeof homeRecs !== "undefined" && homeRecs && homeRecs.picks) || [];
  const pick = picks.find((row) => row && row.label === bet.label && String(row.market || "") === String(bet.market || ""));
  if (!stored && !pick) return null;
  return { odds: bet.odds, label: bet.label, market: bet.market, match: bet.match, ...(pick || {}), ...(stored || {}) };
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
  const pick = quickAddRecPick(bet);
  if (pick && typeof scriptKindTag === "function") {
    const good = pick.tier === "good";
    const pill = document.createElement("i");
    pill.className = `find-rec-pill${good ? " good" : ""}`;
    pill.textContent = good ? "Good bet" : "Recommended";
    if (typeof scriptKindSay === "function") pill.title = scriptKindSay(pick).tip;
    inner.append(pill);
    const hold = document.createElement("span");
    hold.innerHTML = [
      scriptKindTag(pick),
      typeof scriptRoleTag === "function" ? scriptRoleTag(pick) : "",
      typeof scriptCushionTag === "function" ? scriptCushionTag(pick) : "",
      typeof scriptGoldenTag === "function" ? scriptGoldenTag(pick) : "",
    ].filter(Boolean).join("");
    [...hold.children].forEach((node) => inner.append(node));
  } else {
    const rec = typeof scriptRecPill === "function" && scriptRecPill(bet);
    if (rec) inner.append(rec);
    else if (quickAddBetRec(bet)) {
      const pill = document.createElement("i");
      pill.className = "find-rec-pill";
      pill.textContent = "Recommended";
      inner.append(pill);
    }
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
    tag.title = "Recommended";
    tag.setAttribute("aria-label", "Recommended");
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

function quickAddLive(game) {
  if (game && (game.final || game.live)) return true;
  const kick = Date.parse((game && game.kickoff) || "");
  return Number.isFinite(kick) && kick <= Date.now();
}

function quickAddLock(person, game, said, odds, fresh) {
  const name = person && person.name ? String(person.name).trim() : "";
  if (!name || !said || !Number.isFinite(odds) || !odds || typeof parlayLeg === "undefined" || typeof parlayKey !== "function") return false;
  if (fresh && parlayLeg.size && typeof saveNew === "function") saveNew();
  else if (!fresh && typeof betCurrentOpen === "function") betCurrentOpen();
  const label = said.toLowerCase().startsWith(name.toLowerCase()) ? said : `${name} ${said}`;
  const bet = { label, market: said, odds, match: (game && game.match) || "", kickoff: (game && game.kickoff) || "", sport: (game && game.sport) || "" };
  const id = parlayKey(bet);
  if (parlayLeg.has(id) || parlayLeg.size >= 8) return false;
  if (typeof parlayPick !== "undefined" && person.key && !parlayPick.has(person.key) && parlayPick.size < 8) parlayPick.set(person.key, person);
  if (typeof legOwner !== "undefined") legOwner.set(id, name);
  if (typeof trayLockHold === "function") trayLockHold(id);
  parlayLeg.set(id, bet);
  if (typeof paintParlay === "function") paintParlay();
  return true;
}

function quickAddLiveForm(person, game) {
  const form = document.createElement("form");
  form.className = "quick-add-live";
  const who = document.createElement("input");
  who.name = "player";
  who.placeholder = "Player";
  who.setAttribute("aria-label", "Player");
  if (person && person.name) who.value = person.name;
  const showWho = !person || person.past || !person.name;
  const prop = document.createElement("input");
  prop.name = "prop";
  prop.placeholder = "Prop you bet";
  prop.setAttribute("aria-label", "Prop you bet");
  const oddsBox = document.createElement("input");
  oddsBox.name = "odds";
  oddsBox.placeholder = "-360";
  oddsBox.setAttribute("aria-label", "The price you got");
  oddsBox.inputMode = "decimal";
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "quick-add-go";
  go.textContent = "Lock it in";
  form.append(...(showWho ? [who] : []), prop, oddsBox, go);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = who.value.trim();
    const said = prop.value.trim();
    const odds = Number(String(oddsBox.value).trim().replace(/^\+/, ""));
    const whoPerson = name ? { ...(person || {}), name, key: (person && person.key) || name.toLowerCase(), kind: "player", bets: (person && person.bets) || [] } : person;
    if (!name || !said || !Number.isFinite(odds) || !odds) return;
    const finish = (fresh) => {
      if (!quickAddLock(whoPerson, game, said, odds, fresh)) return;
      quickAddReset({ when: true, sport: true });
      if (typeof legNewClose === "function") legNewClose();
      if (typeof parlayOpenTray === "function") parlayOpenTray();
    };
    if (typeof parlayLeg !== "undefined" && parlayLeg.size) {
      const acts = document.createElement("div");
      acts.className = "quick-add-acts";
      const current = document.createElement("button");
      current.type = "button";
      current.className = "quick-add-go";
      current.textContent = "Add to Current Bet";
      current.addEventListener("click", () => finish(false));
      const fresh = document.createElement("button");
      fresh.type = "button";
      fresh.className = "quick-add-go new";
      fresh.textContent = "Add to New Bet";
      fresh.addEventListener("click", () => finish(true));
      acts.append(current, fresh);
      form.replaceChildren(acts);
      return;
    }
    finish(false);
  });
  return form;
}

function quickAddPut(board, fresh) {
  const people = quickAddPeople(board), person = quickAddPerson(people);
  const bet = person && (person.bets || []).find((row) => typeof parlayKey === "function" && parlayKey(row) === quickAdd.value);
  if (!person || !bet) return;
  if (fresh && typeof parlayLeg !== "undefined" && parlayLeg.size && typeof saveNew === "function") saveNew();
  else if (!fresh && typeof betCurrentOpen === "function") betCurrentOpen();
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
  head.innerHTML = `<b>Quick add</b><span>When → league → game → team or player → prop → value</span>`;
  box.append(head);

  const paint = (focusSearch) => {
    const keep = focusSearch && typeof focusSearch === "number" ? focusSearch : null;
    const next = quickAddBox(board);
    // Roster callbacks outlive this box — always swap the live Quick Add node.
    const live = box.isConnected ? box : null;
    if (!live || !live.parentNode) return;
    const shot = live.querySelector(":scope > .find-shot-row");
    const leg = live.classList.contains("quick-add-leg");
    live.replaceWith(next);
    if (leg) next.classList.add("quick-add-leg");
    if (shot) {
      const shotHead = next.querySelector(".quick-add-head");
      if (shotHead) shotHead.after(shot);
    }
    if (typeof betShotMount === "function") betShotMount();
    if (keep != null) {
      const field = next.querySelector(".quick-add-search");
      if (!field) return;
      field.focus();
      try { field.setSelectionRange(keep, keep); } catch (error) {}
      return;
    }
    quickAddReveal(next);
  };

  if (!QUICK_WHEN.some(([id]) => id === quickAdd.when)) quickAdd.when = "next";
  box.append(quickAddStep("When", QUICK_WHEN.map(([id, label]) => quickAddChip(label, quickAdd.when === id, () => {
    if (quickAdd.when === id) return;
    quickAdd.when = id;
    quickAddReset({ when: true });
    if (board) board.quickWeek = "";
    paint();
  })), "when"));

  if (quickAddPullWeek(board, paint)) {
    const wait = document.createElement("p");
    wait.className = "quick-add-none";
    wait.textContent = "Looking up the board.";
    box.append(wait);
    return box;
  }
  if (board && board.quickWeek === "miss" && (quickAdd.when === "tomorrow" || quickAdd.when === "week")) {
    const wait = document.createElement("p");
    wait.className = "quick-add-none";
    wait.textContent = "Could not load the rest of the week.";
    box.append(wait);
    return box;
  }

  const all = quickAddPeople(board);
  const people = quickAddScope(all, quickAdd.when);
  const doneGames = quickAdd.when === "done" ? quickAddDoneList("") : [];
  const liveGames = quickAdd.when === "live" && typeof startGamesFor === "function" ? startGamesFor("live") : [];
  const posted = doneGames.length ? doneGames : liveGames;
  const sports = posted.length ? [...new Set(posted.map((game) => game.sport).filter(Boolean))].sort() : quickAddSports(people);
  if (!sports.length) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    const span = quickAddSpan(quickAdd.when);
    const loaded = !!(all.length || (typeof findParts !== "undefined" && findParts[span] && findParts[span].data));
    none.textContent = !loaded
      ? "Looking up the board."
      : "No games on the board.";
    box.append(none);
    return box;
  }
  if (quickAdd.sport && !sports.includes(quickAdd.sport)) quickAddReset({ when: true });

  const clearWho = () => {
    quickAdd.team = "";
    quickAdd.side = "";
    quickAdd.player = "";
    quickAdd.prop = "";
    quickAdd.value = "";
    quickAdd.q = "";
  };
  box.append(quickAddStep("League", [
    quickAddChip("All", !quickAdd.sport, () => { quickAdd.sport = ""; clearWho(); paint(); }),
    ...sports.map((sport) => quickAddChip(sport, quickAdd.sport === sport, () => {
      quickAdd.sport = sport;
      clearWho();
      paint();
    })),
  ], "league"));

  const games = quickAddGames(people, quickAdd.sport, quickAdd.when);
  const game = games.find((row) => quickAddGameKey(row) === quickAdd.team) || null;
  if (quickAdd.side && game) {
    const sides = String(game.match || "").split(/\s+@\s+/).map((side) => side.trim());
    if (!sides.some((side) => quickAddClubMatch(side, quickAdd.side) || quickAddFold(side) === quickAddFold(quickAdd.side))) quickAdd.side = "";
  } else if (quickAdd.side && !game) quickAdd.side = "";
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
  const hide = document.createElement("label");
  hide.className = "quick-add-hide";
  const hideBox = document.createElement("input");
  hideBox.type = "checkbox";
  hideBox.checked = quickAddHideDef;
  hideBox.addEventListener("change", () => {
    quickAddHideDef = hideBox.checked;
    try { localStorage.setItem("quickAddHideDef", hideBox.checked ? "1" : "0"); } catch (error) {}
    paint();
  });
  hide.append(hideBox, " Exclude defense");
  const picks = document.createElement("div");
  picks.className = "quick-add-picks";
  if (!quickAdd.team && !quickAdd.q.trim()) {
    games.map((row) => ({ row, rec: quickAddGameRec(people, row, quickAdd.sport) }))
      .sort((a, b) => Number(b.rec) - Number(a.rec))
      .forEach(({ row, rec }) => {
        picks.append(quickAddChip(quickAddGameSay(row), false, () => {
          quickAdd.team = quickAddGameKey(row);
          quickAdd.side = "";
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
      quickAdd.side = "";
      quickAdd.player = "";
      quickAdd.prop = "";
      quickAdd.value = "";
      paint();
    }, game ? { html: `◂ ${quickAddGameHtml(game)}` } : null));
    quickAddLoadRosters(game, quickAdd.sport, paint);
  }
  const playerCap = quickAdd.team ? 160 : (quickAdd.q.trim() ? 60 : 24);
  const splitTeams = !!(quickAdd.team && game && game.match);
  // Games only, until a game is picked or a name is typed.
  const listed = !quickAdd.team && !quickAdd.q.trim() ? [] : quickAddPlayers(people, quickAdd.sport, quickAdd.team, game, splitTeams);
  const past = (quickAdd.when === "done" || quickAdd.when === "live") && game ? quickAddPastPeople(game, quickAdd.sport, listed) : [];
  const players = listed.concat(past).slice(0, playerCap);
  if (splitTeams) {
    const sides = quickAddGameSides(game);
    const teams = quickAddTeams(people, quickAdd.sport, quickAdd.team);
    if (typeof teamTd === "function" && people && !people.tdBook) teamTd(people, "", game.match, game.kickoff || "");
    const bySide = new Map(sides.map((side) => [side, []]));
    players.forEach((person) => {
      const side = quickAddResolveSide(person, game, quickAdd.sport, people);
      if (side && bySide.has(side)) bySide.get(side).push(person);
    });
    sides.forEach((side) => {
      const card = document.createElement("div");
      card.className = "quick-add-team-card";
      const teamPerson = teams.find((person) => quickAddClubMatch(side, person.name) || quickAddFold(side) === quickAddFold(person.name));
      const on = !!(quickAdd.side && (quickAddClubMatch(side, quickAdd.side) || quickAddFold(side) === quickAddFold(quickAdd.side)));
      const teamChip = quickAddChip(side, on, () => {
        if (on) {
          quickAdd.side = "";
          if (teamPerson && quickAdd.player === teamPerson.key) {
            quickAdd.player = "";
            quickAdd.prop = "";
            quickAdd.value = "";
          }
        } else {
          quickAdd.side = side;
          if (teamPerson) quickAdd.player = teamPerson.key;
          quickAdd.prop = "";
          quickAdd.value = "";
        }
        paint();
      }, {
        rec: teamPerson ? quickAddPersonRec(teamPerson, quickAdd.sport, quickAdd.team) : quickAddGameRec(people, game, quickAdd.sport),
        html: `${quickAddLogoImg(side)}<span>${esc(side)}</span>`,
      });
      card.append(teamChip);
      const row = document.createElement("div");
      row.className = "quick-add-team-picks";
      const sidePlayers = (bySide.get(side) || []).slice().sort((a, b) => Number(quickAddPersonRec(b, quickAdd.sport, quickAdd.team)) - Number(quickAddPersonRec(a, quickAdd.sport, quickAdd.team)) || a.name.localeCompare(b.name));
      sidePlayers.forEach((person) => {
        if (quickAddHideDef && quickAddIsDefense(person)) return;
        const rec = quickAddPersonRec(person, quickAdd.sport, quickAdd.team);
        row.append(quickAddChip(quickAddPersonSay(person), quickAdd.player === person.key, () => {
          quickAdd.side = side;
          quickAdd.player = person.key;
          quickAdd.prop = "";
          quickAdd.value = "";
          paint();
        }, { rec }));
      });
      if (row.childElementCount) card.append(row);
      picks.append(card);
    });
  } else {
    quickAddPlayerGroups(players, quickAdd.sport, quickAdd.team, game, people).forEach((group) => {
      const block = document.createElement("div");
      block.className = "quick-add-team-block";
      const head = quickAddTeamHead(group.club);
      if (head) block.append(head);
      const row = document.createElement("div");
      row.className = "quick-add-team-picks";
      group.people.forEach((person) => {
        if (quickAddHideDef && quickAddIsDefense(person)) return;
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
  }
  if (splitTeams && !players.length && quickAdd.when === "done" && game && !quickAddRosterReady(game, quickAdd.sport)) {
    picks.append(Object.assign(document.createElement("p"), { className: "quick-add-none", textContent: "Looking up the players." }));
  }
  if (!picks.childElementCount) {
    const none = document.createElement("p");
    none.className = "quick-add-none";
    none.textContent = quickAdd.q.trim() ? "No one by that name." : "No games posted.";
    picks.append(none);
  }
  who.append(whoHead, search, ...(quickAdd.team ? [hide] : []), picks);
  box.append(who);

  const person = quickAddPerson(people.concat(past));
  if (!person) {
    if ((quickAdd.when === "done" || quickAdd.when === "live") && game && quickAddLive(game) && quickAddRosterReady(game, quickAdd.sport) && !players.length) {
      box.append(quickAddStep("1. Prop", [quickAddLiveForm(null, game)], "prop"));
    }
    return box;
  }

  const props = quickAddPropList(person, quickAdd.sport, quickAdd.team);
  const propEmpty = props.length ? [] : [quickAddLive(game) ? quickAddLiveForm(person, game) : Object.assign(document.createElement("p"), { className: "quick-add-none", textContent: "No props posted." })];
  box.append(quickAddStep("1. Prop", props.length ? props.map(([key, row]) => quickAddChip(row.label, quickAdd.prop === key, () => {
    quickAdd.prop = key;
    quickAdd.value = "";
    paint();
  }, { rec: row.rec })) : propEmpty, "prop"));

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
    valueStep.append(quickAddLive(game) ? quickAddLiveForm(person, game) : none);
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

function quickAddLiveRefresh() {
  if (quickAdd.when !== "live") return;
  document.querySelectorAll(".manage-add .quick-add, .find-new.on .quick-add").forEach((node) => {
    const board = node.closest(".find-board") || document.querySelector("#desk-glass-in .find-board");
    if (!board || !node.parentNode) return;
    const next = quickAddBox(board);
    if (node.classList.contains("quick-add-leg")) next.classList.add("quick-add-leg");
    node.replaceWith(next);
  });
}

function quickAddOpen() {
  const board = document.querySelector("#desk-glass-in .find-board");
  if (!board || board.dataset.page === "rec" || board.classList.contains("find-rec-page")) return;
  window.quickAddPending = false;
  window.savePeek = false;
  window.saveShut = true;
  try { localStorage.setItem("savedShut", "1"); } catch (error) {}
  quickAddReset();
  const live = board.querySelector(".quick-add");
  if (live) live.replaceWith(quickAddBox(board));
  if (typeof paintParlay === "function") paintParlay();
  if (typeof startPlace === "function") startPlace();
  if (typeof startPaint === "function" && !board.querySelector(".find-start .quick-add")) startPaint();
  const box = board.querySelector(".find-start");
  const add = board.querySelector(".quick-add");
  if (box) {
    box.hidden = false;
    box.classList.add("find-start-open");
  }
  const glass = document.getElementById("desk-glass-in");
  const target = add || box;
  if (!target) return;
  const scroll = () => {
    if (!target.isConnected) return;
    if (glass && glass.contains(target)) {
      glass.scrollTo({ top: Math.max(0, glass.scrollTop + target.getBoundingClientRect().top - glass.getBoundingClientRect().top - 8), behavior: "smooth" });
    } else target.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  requestAnimationFrame(() => requestAnimationFrame(scroll));
}

function quickAddPendingOpen() {
  if (!window.quickAddPending) return;
  const board = document.querySelector('#desk-glass-in .find-board[data-page="find"]');
  if (!board || !board.querySelector(".find-start .quick-add, .find-start-quick .quick-add, .quick-add")) return;
  if (typeof quickAddOpen === "function") quickAddOpen();
}
