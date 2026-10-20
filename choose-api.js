/** Build a bet on the website. Same rules as the local desk. */

const { addSway } = require("./sway-api");
const AK = "FhMFpcPWXMeyZxOx";
const SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
const KINDS = {
  yards: ["yard", "yd"], points: ["point"], assists: ["assist"], shots: ["shot"],
  strikeouts: ["strikeout"], hits: ["to record a hit", "to hit"],
};
const SKIP = ["spread", "moneyline", "money line", "puck line", "puckline", "run line", "handicap", "total", "alternate total", "alt total", "team to score", "correct score", "exact score", "winning margin", "final score", "first pitch", "pitch result", "kicking"];
const AIM = { safe: -200, good: -100 };
const UNITS = ["shots on goal", "receiving yards", "rushing yards", "passing yards", "receptions", "rebounds", "strikeouts", "assists", "puck line", "run line", "saves", "points", "goals", "shots", "made threes", "threes", "spread", "yards"];

function americanDecimal(odds) {
  const n = Number(odds);
  if (!n) throw new Error("odds cannot be 0");
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}

function impliedProb(odds) {
  const n = Number(odds);
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function fromDecimal(decimal) {
  if (decimal <= 1) return null;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function who(leg) {
  return String(leg.runner || leg.label || "").split(/\d/)[0].trim().toLowerCase();
}

function pinOf(token) {
  const [name, size, word] = String(token || "").toLowerCase().split("|");
  return { name: name.trim(), size: Number(size), word: (word || "").trim() };
}

function pinRank(leg, want) {
  const text = `${leg.market || ""} ${leg.label || ""}`.toLowerCase();
  const miss = want.word && !text.includes(want.word) ? 1000 : 0;
  return miss + Math.abs(sizeOf(leg) - (want.size || sizeOf(leg)));
}

function etParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function etKey(date) {
  const bag = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${bag.year}-${bag.month}-${bag.day}`;
}

function inWindow(iso, span) {
  const kick = Date.parse(iso || "");
  if (!Number.isFinite(kick) || kick <= Date.now()) return false;
  const kickDay = etKey(new Date(kick));
  const nowDay = etKey(new Date());
  if (span !== "week") return kickDay === nowDay;
  return kickDay <= etKey(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
}

function clock(iso) {
  const bag = etParts(new Date(iso));
  if (!bag.weekday) return "";
  return `${bag.weekday} ${bag.month} ${bag.day}, ${bag.hour}:${bag.minute} ${bag.dayPeriod} ET`;
}

function place(game) {
  const match = String(game.match || "");
  if (!match.includes(" @ ")) return match;
  const [away, home] = match.split(" @ ");
  return `${away.trim()} at ${home.trim()}`;
}

function kindOf(market) {
  const text = market.toLowerCase();
  if (text.includes("reception")) return "receptions";
  if (text.includes("rush")) return "rushing";
  if (text.includes("pass")) return "passing";
  if (text.includes("receiv")) return "receiving";
  return "";
}

function unitOf(text) {
  return UNITS.find((word) => new RegExp(`\\b${word}\\b`).test(text)) || "";
}

function legLabel(market, runner) {
  if (["over", "under"].includes(runner.toLowerCase()) || ["over", "unde"].includes(runner.slice(0, 4).toLowerCase())) {
    return `${market}: ${runner}`;
  }
  let text = runner.trim();
  const kind = kindOf(market);
  if (kind && !text.toLowerCase().includes(kind) && /\by(?:ar)?ds?\b/i.test(text)) {
    text = text.replace(/\by(?:ar)?ds?\b/i, `${kind} yards`);
  }
  let norm = market.replace(/\byds\b/ig, "yards").replace(/puckline/ig, "puck line");
  const low = norm.toLowerCase();
  const scope = (low.match(/^(1st|2nd|3rd|4th)\s+(period|half|quarter)/) || [])[0] || "";
  const unit = unitOf(low);
  if (/^\d+(?:\.\d+)?\+$/.test(text)) {
    let whoName = (scope ? norm.slice(scope.length) : norm).replace(/\b(alt|alternate)\b/ig, " ");
    if (unit) whoName = whoName.replace(new RegExp(`\\b${unit}\\b`, "i"), " ");
    whoName = whoName.replace(/[-:]/g, " ").split(/\s+/).filter(Boolean).join(" ");
    text = [whoName, text, unit].filter(Boolean).join(" ");
  } else if (unit && !text.toLowerCase().includes(unit)) {
    const count = !/\d/.test(text) ? ((norm.match(/\d+(?:\.\d+)?\+/) || [])[0] || "") : "";
    text = [text, count, unit].filter(Boolean).join(" ");
  }
  if (scope && !text.toLowerCase().includes(scope)) text = `${text}, ${scope}`;
  return text.split(/\s+/).filter(Boolean).join(" ");
}

async function eventPage(id, tab) {
  const url = `https://sbapi.nj.sportsbook.fanduel.com/api/event-page?eventId=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}&_ak=${AK}&timezone=America/New_York`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      Referer: "https://sportsbook.fanduel.com/",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseLegs(id, data) {
  const attachments = data.attachments || {};
  const markets = attachments.markets || {};
  const live = Object.values(attachments.events || {}).some((event) => event && String(event.eventId || "") === String(id) && event.inPlay);
  const rows = [];
  Object.values(markets).forEach((market) => {
    if (!market || String(market.eventId || "") !== String(id)) return;
    if (String(market.marketStatus || "OPEN").toUpperCase() !== "OPEN") return;
    const name = String(market.marketName || "");
    if (["Regular Season", "Playoff", "Drive 1"].some((skip) => name.includes(skip))) return;
    (market.runners || []).forEach((runner) => {
      const raw = (((runner.winRunnerOdds || {}).americanDisplayOdds || {}).americanOdds);
      const odds = Number.parseInt(raw, 10);
      if (!Number.isFinite(odds) || odds < -2000 || odds > 5000) return;
      const runnerName = String(runner.runnerName || "").trim();
      rows.push({ market: name, runner: runnerName, label: legLabel(name, runnerName), odds });
    });
  });
  return { rows, live };
}

function propTabs(layout) {
  const tabs = (layout && layout.tabs) || {};
  const words = ["prop", "point", "three", "rebound", "assist", "goal", "shot", "batter", "pitcher", "scorer", "hit", "combo"];
  const slugs = [];
  ((layout && layout.tabsDisplayOrder) || []).forEach((id) => {
    const low = String((tabs[id] || {}).title || "").toLowerCase();
    if (!words.some((word) => low.includes(word))) return;
    if (["quarter", "half", "period", "margin", "same game"].some((word) => low.includes(word)) && !low.includes("prop") && !low.includes("player")) return;
    const slug = low.replace(/™/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  });
  return slugs;
}

async function offerLegs(game) {
  if (Array.isArray(game.props) && game.props.length) return { rows: game.props.filter((leg) => leg && typeof leg === "object"), live: !!game.live };
  const first = await eventPage(game.id, "popular");
  const pages = [first];
  const extra = await Promise.all(propTabs(first.layout).map((tab) => eventPage(game.id, tab).catch(() => null)));
  extra.forEach((page) => { if (page) pages.push(page); });
  const rows = [];
  const seen = new Set();
  let live = false;
  pages.forEach((page) => {
    const parsed = parseLegs(game.id, page);
    live = live || parsed.live;
    parsed.rows.forEach((row) => {
      const key = `${row.market}|${row.runner}|${row.odds}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    });
  });
  return { rows, live };
}

function teamLeg(leg, game) {
  const blob = `${leg.runner || ""} ${leg.label || ""}`.toLowerCase();
  return String(game.match || "").split(" @ ").some((part) => { const team = part.split("(")[0].trim().toLowerCase(); const nick = team.split(/\s+/).pop(); return (team && blob.includes(team)) || (nick.length > 3 && blob.includes(nick)); });
}

function fits(leg, kind) {
  const text = `${leg.market || ""} ${leg.runner || ""} ${leg.label || ""}`.toLowerCase();
  const runner = String(leg.runner || "").trim().toLowerCase();
  if (SKIP.some((skip) => text.includes(skip)) || /\d+\s*-\s*\d+/.test(runner) || runner === "yes" || runner === "no" || runner.endsWith(" over") || runner.endsWith(" under")) return false;
  if (text.includes("?") || text.includes("combine") || text.includes("either")) return false;
  if (!/\d/.test(text) && !text.includes("to record a hit") && !text.includes("to score") && !text.includes("scorer") && !text.includes("touchdown")) return false;
  const name = who(leg);
  if (!name || name === "over" || name === "under") return false;
  if (kind === "any") return true;
  return (KINDS[kind] || []).some((word) => text.includes(word));
}

function receivingYards(leg) {
  const text = `${leg.market || ""} ${leg.label || ""}`.toLowerCase();
  return text.includes("receiving") && text.includes("yard");
}

function sizeOf(leg) {
  const match = `${leg.runner || ""} ${leg.label || ""}`.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 999;
}

function catchesToYards(legs, band) {
  const kept = [];
  const seen = new Set();
  band.forEach((leg) => {
    const text = `${leg.market || ""} ${leg.label || ""}`.toLowerCase();
    let chosen = leg;
    if (text.includes("reception") && !text.includes("yard")) {
      const name = who(leg);
      const pool = legs.filter((row) => receivingYards(row) && who(row) === name);
      pool.sort((a, b) => Math.abs(impliedProb(a.odds) - impliedProb(leg.odds)) - Math.abs(impliedProb(b.odds) - impliedProb(leg.odds)));
      const nearest = pool[0];
      if (nearest && Math.abs(impliedProb(nearest.odds) - impliedProb(leg.odds)) <= 0.08 && sizeOf(nearest) <= 55) chosen = nearest;
      else if (nearest) return;
    }
    const token = `${who(chosen)}|${chosen.odds}|${chosen.label}`;
    if (seen.has(token)) return;
    seen.add(token);
    kept.push(chosen);
  });
  return kept;
}

function slate(games, sports, ids, span) {
  const wanted = new Set(ids);
  const buckets = Object.fromEntries(sports.map((sport) => [sport, []]));
  games.forEach((game) => {
    const sport = String(game.sport || "");
    if (!buckets[sport]) return;
    if (wanted.size && !wanted.has(String(game.id || ""))) return;
    if (!inWindow(game.kickoff, span)) return;
    buckets[sport].push(game);
  });
  Object.values(buckets).forEach((rows) => rows.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)));
  const ordered = [];
  while (Object.values(buckets).some((rows) => rows.length)) {
    sports.forEach((sport) => { if (buckets[sport].length) ordered.push(buckets[sport].shift()); });
  }
  return ordered;
}

async function gather(games, kind) {
  const pools = [];
  let trouble = "";
  const queue = games.slice();
  async function worker() {
    while (queue.length) {
      const game = queue.shift();
      try {
        const { rows, live } = await offerLegs(game);
        let kept = rows.filter((leg) => fits(leg, kind) && !teamLeg(leg, game));
        if (kind === "any" || kind === "yards") kept = catchesToYards(rows, kept);
        kept.sort((a, b) => a.odds - b.odds);
        if (kept.length) pools.push([game, kept, live]);
      } catch (error) {
        if (!trouble) trouble = `FanDuel did not answer for ${game.match}.`;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, games.length) }, worker));
  return { pools, trouble };
}

function spaced(rows, width, aim) {
  const sorted = rows.slice().sort((a, b) => a[0].odds - b[0].odds);
  let ordered = aim === "payout" ? sorted.slice().reverse() : sorted;
  if (aim !== "payout") {
    const cap = aim === "good" ? 100 : -110;
    const band = sorted.filter((row) => row[0].odds <= cap);
    const fill = sorted.filter((row) => row[0].odds <= 150);
    ordered = band.length >= width ? band : fill.length ? fill : sorted;
  }
  const kept = [];
  const seen = new Set();
  ordered.some((row) => {
    const player = who(row[0]);
    if (player && !seen.has(player)) { seen.add(player); kept.push(row); }
    return kept.length >= width;
  });
  return kept;
}

function mark(combo) {
  return combo.map((row) => who(row[0])).sort().join("|");
}

function scoreOf(decimal, aim) {
  if (aim === "payout") return -decimal;
  if (aim === "top") return decimal;
  const goal = americanDecimal(AIM[aim]);
  return Math.abs(decimal - goal) + (aim === "good" && decimal < goal ? 10 : 0);
}

function decimalOf(combo) {
  return combo.reduce((decimal, row) => decimal * americanDecimal(row[0].odds), 1);
}

function search(menus, count, aim, split) {
  const found = [];
  function keep(comboScore, combo) {
    const token = mark(combo);
    const prior = found.findIndex((row) => row[2] === token);
    if (prior >= 0) {
      if (comboScore < found[prior][0]) found[prior] = [comboScore, combo.slice(), token];
      found.sort((a, b) => a[0] - b[0]);
      return;
    }
    found.push([comboScore, combo.slice(), token]);
    found.sort((a, b) => a[0] - b[0]);
    found.splice(24);
  }
  function walk(start, need, decimal, players, games, combo) {
    if (need === 0) { keep(scoreOf(decimal, aim), combo); return; }
    if (menus.length - start < need) return;
    for (let index = start; index <= menus.length - need; index += 1) {
      menus[index].forEach((row) => {
        const player = who(row[0]);
        const gameId = String(row[1].id || "");
        if (!player || players.has(player) || (split && games.has(gameId))) return;
        players.add(player);
        combo.push(row);
        if (split) games.add(gameId);
        walk(index + 1, need - 1, decimal * americanDecimal(row[0].odds), players, games, combo);
        combo.pop();
        players.delete(player);
        if (split) games.delete(gameId);
      });
    }
  }
  walk(0, count, 1, new Set(), new Set(), []);
  return found.map((row) => row[1]).filter((combo) => combo.length >= count);
}

function windowOf(ranked, aim) {
  if (!ranked.length) return [];
  const scored = ranked.map((combo) => [scoreOf(decimalOf(combo), aim), combo]);
  const best = scored[0][0];
  return scored.filter((row) => row[0] <= (aim === "payout" ? best * 0.85 : best + 0.4)).map((row) => row[1]);
}

function pick(pools, count, aim, skip, holdList, dropList) {
  const drop = new Set((dropList || []).map((name) => pinOf(name).name).filter(Boolean));
  const asked = (holdList || []).map(pinOf).filter((row) => row.name);
  const hold = [...new Set(asked.map((row) => row.name))];
  const source = drop.size ? pools.map(([game, legs, live]) => [game, legs.filter((leg) => !drop.has(who(leg))), live]) : pools;
  const width = count >= 8 ? 1 : count >= 5 ? 2 : 8;
  const menus = source.map(([game, legs, live]) => spaced(legs.map((leg) => [leg, game, live]), width, aim)).filter((rows) => rows.length);
  hold.forEach((name) => {
    if (menus.some((rows) => rows.some((row) => who(row[0]) === name))) return;
    source.some(([game, legs, live]) => {
      const leg = legs.find((item) => who(item) === name);
      if (!leg) return false;
      menus.push([[leg, game, live]]);
      return true;
    });
  });
  if (hold.length || drop.size) {
    const pins = [];
    const used = new Set();
    hold.forEach((name) => {
      if (used.has(name)) return;
      const want = asked.find((item) => item.name === name);
      let found = null;
      source.some(([game, legs, live]) => {
        const options = legs.filter((item) => who(item) === name);
        if (!options.length) return false;
        options.sort((a, b) => pinRank(a, want) - pinRank(b, want));
        found = [options[0], game, live];
        return true;
      });
      if (!found) return;
      used.add(name);
      pins.push(found);
    });
    const pinGames = new Set(pins.map((row) => String(row[1].id || "")));
    const rest = menus.map((menu) => menu.filter((row) => !used.has(who(row[0])) && !pinGames.has(String(row[1].id || "")))).filter((menu) => menu.length);
    const need = Math.max(0, count - pins.length);
    let rankedHold = need ? search(rest.slice(0, 14), need, aim, true) : [[]];
    if (need && !rankedHold.length) rankedHold = search(rest.flatMap((menu) => menu.map((row) => [row])).slice(0, 24), need, aim, false);
    const combo = pins.concat(rankedHold[0] || []);
    if (combo.length >= count) return { combo: combo.slice(0, count), alts: rankedHold.slice(1, 9).map((rest) => pins.concat(rest).slice(0, count)), only: rankedHold.length === 1, again: false, kept: pins.length === hold.length };
  }
  let ranked = search(menus.slice(0, 14), count, aim, true);
  if (!ranked.length) {
    const flat = menus.flatMap((menu) => menu.map((row) => [row]));
    ranked = search(flat.slice(0, count >= 8 ? 18 : 24), count, aim, false);
  }
  if ((aim === "top" || aim === "payout") && ranked.length) return { combo: ranked[0], alts: ranked.slice(1, 9), only: ranked.length === 1, again: false };
  const fresh = ranked.filter((combo) => !skip.has(mark(combo)));
  if (fresh.length) return { combo: fresh[0], alts: fresh.slice(1, 9), only: ranked.length === 1, again: false };
  if (ranked.length) return { combo: ranked[0], alts: ranked.slice(1, 9), only: ranked.length === 1, again: ranked.length > 1 };
  return { combo: [], alts: [], only: true, again: false };
}

function shown(leg) {
  if (String(leg.market || "").toLowerCase().includes("to record a hit") && !/\d/.test(leg.label || "")) {
    return `${leg.runner || leg.label} 1+ hits`;
  }
  return leg.label || "";
}

function card(combo, sports, kind, count, aim, only) {
  const decimal = decimalOf(combo);
  const american = fromDecimal(decimal);
  const chance = american == null ? null : Math.round(impliedProb(american) * 1000) / 10;
  const profit = Math.round(5 * (decimal - 1) * 100) / 100;
  const games = new Map(combo.map((row) => [String(row[1].id || ""), row[1]]));
  const one = games.size === 1;
  const titleGame = one ? place(games.values().next().value) : sports.join(", ");
  const kindName = kind === "any" ? "player props" : kind;
  const legs = combo.map((row) => {
    let label = shown(row[0]);
    if (!one) label = `${label} — ${row[1].sport}, ${place(row[1])}, ${clock(row[1].kickoff)}`;
    return { market: row[0].market || "", runner: row[0].runner || "", label, odds: row[0].odds, kickoff: row[1].kickoff || "", gameId: String(row[1].id || ""), sport: row[1].sport || "", pct: `${(impliedProb(row[0].odds) * 100).toFixed(1)}%` };
  });
  const name = { top: "Safest", safe: "Safe", good: "Good", payout: "Best payout" }[aim];
  const aimed = { top: "This is the safest price from these props.", safe: "Aimed at -200, so a $5 bet wins about $2.50.", good: "Aimed at -100, so a $5 bet wins $5.", payout: "The longest price from these props, so the payout is the largest." }[aim];
  const signed = american > 0 ? `+${american}` : String(american);
  return {
    title: `${name} ${count}-leg`, game: titleGame, kind: kindName, american, impliedPct: chance, profit,
    copy: `${aimed} ${kindName[0].toUpperCase()}${kindName.slice(1)} that fit ${sports.join(", ")}. The parlay is ${signed}, about ${chance}%. A $5 bet would win $${profit.toFixed(2)}.`,
    note: `${count > 1 && one ? "These legs are in one game, so FanDuel's same-game button can charge a different number." : ""}${only ? " This is the only bet that fits, so it keeps showing up." : ""}`.trim(),
    players: combo.map((row) => who(row[0])), only, again: false, legs,
  };
}

function empty(copy, aim) {
  return { title: { top: "Safest parlay", safe: "Safe parlay", good: "Good parlay", payout: "Best payout" }[aim] || "Safest parlay", game: "", copy, legs: [], note: "" };
}

function miss(pools, sports, count, span) {
  const ready = pools.filter((row) => row[1].length);
  const names = new Set(ready.flatMap((row) => row[1].map(who)).filter(Boolean));
  const when = span === "week" ? "in this window" : "today";
  const league = sports.join(", ");
  if (!ready.length) return `FanDuel has not posted player props for the ${league} games ${when}.`;
  const places = ready.slice(0, 3).map((row) => place(row[0])).join(" and ") + (ready.length > 3 ? ` and ${ready.length - 3} more` : "");
  const noun = names.size === 1 ? "player" : "players";
  if (pools.length === 1) {
    return `The only ${league} game ${when} is ${places}. FanDuel has player props for ${names.size} ${noun} in that game, so a ${count}-leg parlay does not fit yet.`;
  }
  return `FanDuel has player props for ${names.size} ${noun} across ${places}, so a ${count}-leg parlay does not fit yet.`;
}

async function chooseBet(body, board) {
  const asked = Array.isArray(body.sports) ? body.sports.map(String) : [];
  const sports = asked.filter(Boolean);
  const universe = sports.length ? sports : [...new Set((Array.isArray(board.games) ? board.games : []).map((game) => String(game.sport || "")).filter(Boolean))];
  const picked = (universe.length ? universe : SPORTS.slice()).filter((sport) => body.college !== false || (sport !== "NCAAF" && sport !== "NCAAB"));
  const ids = (Array.isArray(body.gameIds) ? body.gameIds : [body.gameId]).map((item) => String(item || "")).filter(Boolean);
  const any = body.legs === 0 || body.legs === "0";
  const count = any ? 0 : Math.min(10, Math.max(1, Number(body.legs) || 3));
  const kind = ["any", "yards", "points", "assists", "shots", "strikeouts", "hits"].includes(body.kind) ? body.kind : "any";
  const aim = ["top", "safe", "good", "payout"].includes(body.aim) ? body.aim : "top";
  const span = body.when === "week" ? "week" : "today";
  const games = slate(Array.isArray(board.games) ? board.games : [], picked, ids, span);
  const safeAim = aim;
  if (!games.length) {
    const rows = Array.isArray(board.games) ? board.games : [];
    const begun = rows.some((game) => { const kick = Date.parse(game.kickoff || ""); return picked.includes(String(game.sport || "")) && Number.isFinite(kick) && kick <= Date.now() && etKey(new Date(kick)) === etKey(new Date()); });
    const later = rows.some((game) => picked.includes(String(game.sport || "")) && Date.parse(game.kickoff || "") > Date.now());
    const todayNote = begun
      ? `Tonight's games have started, so they stay off this bet. ${later ? "This week still has games that have not started." : "Nothing is left this week."}`
      : (sports.length ? `No game in ${sports.join(", ")} is on today.` : "No game is on today.");
    return empty(span === "week" ? (sports.length ? `No game in ${sports.join(", ")} is left this week.` : "No game is left this week.") : todayNote, safeAim);
  }
  const { pools, trouble } = await gather(games.slice(0, 30), kind);
  if (trouble && !pools.length) return empty(trouble, aim);
  const hold = Array.isArray(body.hold) ? body.hold : [];
  const drop = Array.isArray(body.drop) ? body.drop : [];
  const skip = new Set((Array.isArray(body.skip) ? body.skip : []).map(String).filter(Boolean));
  const pickedCombo = any ? [2, 3, 4, 5, 6].map((n) => pick(pools, n, aim, skip, hold, drop)).filter((row) => row.combo.length).sort((a, b) => scoreOf(decimalOf(a.combo), aim) - scoreOf(decimalOf(b.combo), aim))[0] || { combo: [] } : pick(pools, count, aim, skip, hold, drop);
  const used = pickedCombo.combo.length;
  if (!used || (!any && used < count)) return empty(miss(pools, picked, any ? 2 : count, span), aim);
  const built = card(pickedCombo.combo, picked, kind, used, aim, pickedCombo.only);
  built.again = pickedCombo.again;
  built.offers = (pickedCombo.alts || []).slice(0, 8).map((combo) => card(combo, picked, kind, used, aim, false));
  try { const ranked = JSON.parse(require("child_process").execFileSync("python3", ["-m", "nfl_bets.listed"], { input: JSON.stringify({ rows: [built].concat(built.offers || []), games }), encoding: "utf8", timeout: 25000, cwd: __dirname })); ranked.forEach((row, index) => { const host = index ? built.offers[index - 1] : built; if (!host) return; if (row.edge) { host.edge = true; host.why = row.why || ""; } else { delete host.edge; delete host.why; } }); } catch (error) { if (built.offers.length && built.offers.every((offer) => offer.american !== built.american)) { built.edge = true; built.why = { payout: "This parlay pays the most of these.", top: "This parlay has the highest chance of these.", safe: "This is the safest of these.", good: "This is the closest to even money." }[aim]; } }
  if (hold.length && pickedCombo.kept === false) built.note = `${built.note} A leg you wanted to keep did not fit, so this one replaced it too.`.trim();
  await addSway(built.legs, games);
  return built;
}

module.exports = { chooseBet };
