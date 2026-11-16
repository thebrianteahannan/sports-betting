/** Same-game parlays: yardage ladders, a catches-yards-touchdown mix, and touchdown scorers, each beating FanDuel's price lately. */

const { implied, g, signed, logCache, byLast } = require("./stack-base");
const { count, findPack, teamCount } = require("./stack-read");

const STATS = { "Alt Passing Yds": "Passing yards", "Alt Receiving Yds": "Receiving yards", "Alt Receptions": "Receptions", "Alt Rushing Yds": "Rushing yards" };
const JOBS = {
  "Passing yards": "The throws his receiver needs.",
  "Receiving yards": "Catches on those throws.",
  Receptions: "The catches those throws find.",
  "Rushing yards": "The yards on the ground.",
  Points: "The points that hold the ticket up.",
  Rebounds: "The boards that hold the ticket up.",
  Assists: "The dimes that hold the ticket up.",
  Threes: "The threes that hold the ticket up.",
  "Shots on goal": "The shots that hold the ticket up.",
  Goals: "The goals that hold the ticket up.",
  Hits: "The hits that hold the ticket up.",
  Strikeouts: "The strikeouts that hold the ticket up.",
  "The over": "The game clears that number.",
  "Anytime touchdown": "The score that pays for the ticket.",
  "Anytime goal": "The goal that pays for the ticket.",
  "The spread": "The side that covers.",
  "The under": "The game stays under that number.",
  "The win": "The side that wins the game.",
};
const FLOOR = { "Passing yards": 150, "Receiving yards": 20, Receptions: 3, "Rushing yards": 20 };
const SHARE = 0.8;
const ATD = "Any Time Touchdown Scorer";
const OPEN = new Set(["NFL", "NBA", "WNBA", "NHL", "MLB"]);
const TOTAL_MARKETS = {
  NFL: ["Alternate Total Points", "points"],
  NBA: ["Alternate Total Points", "points"],
  WNBA: ["Alternate Total Points", "points"],
  NHL: ["Alternate Total Goals", "goals"],
  MLB: ["Alternate Total Runs", "runs"],
};
const SPREAD_MARKETS = {
  NFL: "Alternate Spread",
  NBA: "Alternate Spread",
  WNBA: "Alternate Spread",
  NHL: "Alternate Puck Line",
  MLB: "Alternate Run Line",
};
const PLUS_STATS = {
  Points: "Points",
  Rebounds: "Rebounds",
  Assists: "Assists",
  Threes: "Threes",
  "Shots on Goal": "Shots on goal",
  Goals: "Goals",
  Hits: "Hits",
  Strikeouts: "Strikeouts",
};

function split(market) {
  const text = String(market || "");
  const cut = text.indexOf(" - ");
  return cut < 0 ? [text, ""] : [text.slice(0, cut), text.slice(cut + 3)];
}

function rate(read) {
  return read.hits / read.games;
}

function byDesc(a, b) {
  for (let at = 0; at < a.length; at += 1) {
    if (a[at] < b[at]) return 1;
    if (a[at] > b[at]) return -1;
  }
  return 0;
}

function build(games, loaded, logs, { end = "over", floor = 0, catches = "Receiving yards", need = 2, share = SHARE } = {}) {
  const nfl = loaded.filter(([game]) => String(game.sport || "") === "NFL");
  if (!nfl.length) return [];
  const cache = logCache();
  const last = byLast(cache, "NFL");
  const picked = [];
  nfl.forEach(([game, legs]) => {
    const match = String(game.match || "");
    const best = new Map();
    const sure = new Map();
    legs.forEach((leg) => {
      const [who, tail] = split(leg.market);
      const stat = STATS[tail];
      const odds = leg.odds;
      const line = /(\d+)\+/.exec(String(leg.runner || ""));
      const safe = Boolean(floor) && odds >= -2500 && implied(odds) >= floor;
      if (!stat || !line || Number(line[1]) < FLOOR[stat] || !((odds >= -500 && odds <= -150) || safe)) return;
      const read = count(String(leg.label || ""), "NFL", cache, last);
      if (!read || read.hits < share * read.games) return;
      const pool = safe ? sure : best;
      const key = `${stat}\u0000${who}`;
      const prev = pool.get(key);
      if (!prev || odds > prev[0].odds) pool.set(key, [leg, read, stat, who]);
    });
    sure.forEach((value, key) => best.set(key, value));
    const teamOf = (who) => String((findPack(who, "NFL", cache, last) || {}).team || "");
    const side = (stat, team) => [...best.values()]
      .filter(([leg, , kind, who]) => kind === stat && teamOf(who) === team && (need < 3 || implied(leg.odds) >= floor))
      .map(([leg, read]) => [stat, leg, read])
      .sort((a, b) => (rate(b[2]) - implied(b[1].odds)) - (rate(a[2]) - implied(a[1].odds)));
    let over = null;
    legs.forEach((leg) => {
      const line = /Over \((\d+(?:\.\d+)?)\)/.exec(String(leg.runner || ""));
      const odds = leg.odds;
      const low = need >= 4 && odds >= -2500 && implied(odds) >= floor;
      if (String(leg.market || "") !== "Alternate Total Points" || !line || !((odds >= -450 && odds <= -150) || low)) return;
      const text = `Over ${g(line[1])} total points`;
      const read = teamCount(text, game, logs);
      if (read && read.hits >= share * read.games && (need < 4 || low) && (!over || odds > over[1].odds)) over = ["The over", { ...leg, label: text }, read];
    });
    const whoOf = (row) => split(row[1].market)[0];
    const scoreOf = (who) => {
      const leg = legs.find((item) => item.market === ATD && String(item.runner || "").trim() === who);
      if (!leg || leg.odds > 150) return null;
      const text = `${who} anytime touchdown`;
      const read = count(text, "NFL", cache, last);
      if (!read || rate(read) <= implied(leg.odds)) return null;
      return ["Anytime touchdown", { ...leg, label: text }, read];
    };
    const cover = (team) => {
      let found = null;
      legs.forEach((leg) => {
        const parsed = /^(.+?)\s+\(([+-]?\d+(?:\.\d+)?)\)$/.exec(String(leg.runner || "").trim());
        const odds = leg.odds;
        if (String(leg.market || "") !== "Alternate Spread" || !parsed || parsed[1] !== team || odds < -500 || odds > -150) return;
        const text = `${team} ${signed(parsed[2])} spread`;
        const read = teamCount(text, game, logs);
        if (read && read.hits >= share * read.games && (!found || odds > found[1].odds)) found = ["The spread", { ...leg, label: text }, read];
      });
      return found;
    };
    const pair = [String(game.homeName || ""), String(game.awayName || "")];
    pair.forEach((team) => {
      const other = pair.find((name) => name !== team) || "";
      const arms = side("Passing yards", team).slice(0, 1);
      const spread = end === "spread" ? cover(team) : null;
      if (!arms.length || (end === "spread" && !spread)) return;
      const runs = side("Rushing yards", team).slice(0, 1).concat(side("Rushing yards", other).slice(0, 1)).slice(0, 2);
      side(catches, team).slice(0, 2).forEach((catchRow) => runs.forEach((run) => {
        if (whoOf(catchRow) === whoOf(run)) return;
        const tail = spread || over || scoreOf(whoOf(run));
        const rows = arms.concat([catchRow, run], tail ? [tail] : []);
        if (floor && (rows.filter((row) => implied(row[1].odds) >= floor).length < need || (need > 2 && rows.length < 4))) return;
        if (share < SHARE && !rows.some((row) => row[2].hits < SHARE * row[2].games)) return;
        const edge = rows.reduce((sum, row) => sum + rate(row[2]) - implied(row[1].odds), 0);
        const bets = rows.map(([stat, leg]) => ({ kind: "Same-game parlay", rung: stat, label: String(leg.label || ""), odds: leg.odds, stake: 5, job: JOBS[stat], game: match }));
        picked.push([-edge, { game: match, bets }]);
      }));
    });
  });
  return picked.sort((a, b) => a[0] - b[0]).map((item) => item[1]);
}

function mixed(loaded, slack = 0) {
  const nfl = loaded.filter(([game]) => String(game.sport || "") === "NFL");
  if (!nfl.length) return [];
  const cache = logCache();
  const last = byLast(cache, "NFL");
  const picked = [];
  nfl.forEach(([game, legs]) => {
    const match = String(game.match || "");
    const tails = new Map();
    legs.forEach((leg) => {
      const [who, tail] = split(leg.market);
      if (!tails.has(who)) tails.set(who, new Set());
      tails.get(who).add(tail);
    });
    const has = (kinds, list) => list.some((item) => kinds.has(item));
    const throwers = new Set([...tails].filter(([, kinds]) => has(kinds, ["Alt Passing Yds", "Passing Yds"])).map(([who]) => who));
    const backs = new Set([...tails].filter(([who, kinds]) => has(kinds, ["Alt Rushing Yds", "Rushing Yds"]) && !throwers.has(who)).map(([who]) => who));
    const catchers = new Set([...tails].filter(([who, kinds]) => has(kinds, ["Alt Receiving Yds", "Receiving Yds"]) && !throwers.has(who)).map(([who]) => who));
    const wides = new Set([...catchers].filter((who) => !backs.has(who)));
    const pick = (tail, group, low, high) => {
      const rows = [];
      legs.forEach((leg) => {
        let [who, kind] = split(leg.market);
        if (tail === ATD) [who, kind] = [String(leg.runner || "").trim(), String(leg.market || "")];
        const text = tail === ATD ? `${who} anytime touchdown` : String(leg.label || "");
        const odds = leg.odds;
        if (kind !== tail || !group.has(who) || odds < low || odds > high || (tail !== ATD && !` ${text} `.includes(" Over "))) return;
        const read = count(text, "NFL", cache, last);
        if (read && rate(read) > implied(odds) - slack) rows.push([rate(read) - implied(odds), who, text, odds]);
      });
      return rows.sort(byDesc);
    };
    const found = [];
    pick("Total Receptions", backs, -200, 150).slice(0, 2).forEach((back) => pick("Receiving Yds", wides, -200, 150).slice(0, 3).forEach((wide) => pick(ATD, catchers, 150, 500).slice(0, 4).forEach((score) => {
      if (new Set([back[1], wide[1], score[1]]).size < 3 || (slack && ![back, wide, score].some((row) => row[0] <= 0))) return;
      const rows = [["Back receptions", back, "The back's catches out of the backfield."], ["Receiver yards", wide, "The receiver's yards on his main line."], ["Anytime touchdown", score, "The long shot that pays the ticket."]];
      const bets = rows.map(([rung, row, job]) => ({ kind: "Same-game parlay", rung, label: row[2], odds: row[3], stake: 5, job, game: match }));
      found.push([-rows.reduce((sum, row) => sum + row[1][0], 0), { game: match, bets }]);
    })));
    found.sort((a, b) => a[0] - b[0]);
    picked.push(...found.slice(0, 3));
  });
  return picked.sort((a, b) => a[0] - b[0]).map((item) => item[1]);
}

function combos(rows, size, start = 0, head = [], out = []) {
  if (head.length === size) { out.push(head); return out; }
  for (let at = start; at < rows.length; at += 1) combos(rows, size, at + 1, head.concat([rows[at]]), out);
  return out;
}

const SCORE_JOBS = {
  2: ["One of the two touchdowns.", "The other one. Both have to score."],
  3: ["One of the three touchdowns.", "The second one.", "The third one. All three have to score."],
  4: ["One of the four touchdowns.", "The second one.", "The third one.", "The fourth one. All four have to score."],
  5: ["One of the five touchdowns.", "The second one.", "The third one.", "The fourth one.", "The fifth one. All five have to score."],
};

function scorers(loaded, size = 2, slack = 0) {
  const nfl = loaded.filter(([game]) => String(game.sport || "") === "NFL");
  if (!nfl.length) return [];
  const cache = logCache();
  const last = byLast(cache, "NFL");
  const picked = [];
  nfl.forEach(([game, legs]) => {
    const match = String(game.match || "");
    const live = [];
    legs.forEach((leg) => {
      const who = String(leg.runner || "").trim();
      if (leg.market !== ATD || leg.odds < -250 || leg.odds > 300) return;
      const text = `${who} anytime touchdown`;
      const read = count(text, "NFL", cache, last);
      if (read && rate(read) > implied(leg.odds) - slack) live.push([rate(read) - implied(leg.odds), text, leg.odds]);
    });
    live.sort(byDesc);
    const sum = (group) => group.reduce((total, row) => total + row[0], 0);
    combos(live, size).filter((group) => !slack || group.some((row) => row[0] <= 0)).sort((a, b) => sum(b) - sum(a)).slice(0, 3).forEach((group) => {
      const bets = group.map((row, index) => ({ kind: "Same-game parlay", rung: "Anytime touchdown", label: row[1], odds: row[2], stake: 5, job: SCORE_JOBS[size][index], game: match }));
      picked.push([-sum(group), { game: match, bets }]);
    });
  });
  return picked.sort((a, b) => a[0] - b[0]).map((item) => item[1]);
}

function plusStat(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (PLUS_STATS[text]) return PLUS_STATS[text];
  const low = text.toLowerCase();
  if (low === "pts" || low === "points") return "Points";
  if (low === "reb" || low === "rebounds") return "Rebounds";
  if (low === "ast" || low === "assists") return "Assists";
  if (low === "threes" || low === "3-pointers" || low === "made threes") return "Threes";
  if (low === "shots on goal" || low === "shots") return "Shots on goal";
  if (low === "goals") return "Goals";
  if (low === "hits") return "Hits";
  if (low === "strikeouts" || low === "ks") return "Strikeouts";
  return "";
}

function readPackedPlayer(leg, sport) {
  const market = String(leg.market || "");
  const runner = String(leg.runner || "").trim();
  const odds = Number(leg.odds);
  if (!Number.isFinite(odds) || /period|quarter|half|minute|first basket|method|correct score|parlay|team total|alt total pts|alt total goals/i.test(market)) return null;
  if (sport === "NFL" && market === ATD) {
    if (!runner || odds > 200 || odds < -250) return null;
    const label = `${runner} anytime touchdown`;
    return { who: runner, rung: "Anytime touchdown", bar: 1, label, odds, juice: true, leg: { ...leg, label } };
  }
  if (sport === "NHL" && /^Anytime Goal Scorer$/i.test(market)) {
    if (!runner || odds > 300 || odds < -250) return null;
    const label = `${runner} anytime goal`;
    return { who: runner, rung: "Anytime goal", bar: 1, label, odds, juice: true, leg: { ...leg, label } };
  }
  const [whoSplit, tail] = split(market);
  if (STATS[tail]) {
    const line = /(\d+)\+/.exec(runner);
    const rung = STATS[tail];
    if (!line || Number(line[1]) < (FLOOR[rung] || 0)) return null;
    return { who: whoSplit.trim(), rung, bar: Number(line[1]), label: String(leg.label || ""), odds, juice: false, leg };
  }
  const plus = /^(\d+)\+\s+(.+)$/i.exec(market);
  if (!plus || !runner) return null;
  const rung = plusStat(plus[2]);
  if (!rung || /\+|reb \+|pts \+|ast \+/i.test(plus[2])) return null;
  const bar = Number(plus[1]);
  const label = String(leg.label || `${runner} ${bar}+ ${rung.toLowerCase()}`);
  const juice = (sport === "NBA" || sport === "WNBA") ? rung === "Points" && bar >= 20 : rung === "Goals";
  return { who: runner, rung, bar, label, odds, juice, leg: { ...leg, label } };
}

function softTeamRead(who, verb, odds) {
  const p = implied(odds);
  return { who, verb, hits: Math.round(p * 10), games: 10, soft: true };
}

function packedTeamBets(game, legs, logs, sport, share, floor) {
  const pair = [String(game.homeName || ""), String(game.awayName || "")];
  const spreadMarket = SPREAD_MARKETS[sport] || "Alternate Spread";
  const [totalMarket, unit] = TOTAL_MARKETS[sport] || ["Alternate Total Points", "points"];
  const out = [];
  const keep = (row, hard) => {
    if (!row) return;
    if (hard && row[2].soft) return;
    out.push(row);
  };
  const cover = (teamName, soft) => {
    let found = null;
    legs.forEach((leg) => {
      const parsed = /^(.+?)\s+\(([+-]?\d+(?:\.\d+)?)\)$/.exec(String(leg.runner || "").trim());
      const odds = leg.odds;
      if (![spreadMarket, "Spread"].includes(String(leg.market || "")) || !parsed || parsed[1] !== teamName || odds < -500 || odds > -150) return;
      if (implied(odds) < floor) return;
      const text = `${teamName} ${signed(parsed[2])} spread`;
      const read = teamCount(text, game, logs) || (soft ? softTeamRead(teamName, `covered ${signed(parsed[2])}`, odds) : null);
      if (read && (read.soft || read.hits >= share * read.games) && (!found || odds > found[1].odds || (found[2].soft && !read.soft))) found = ["The spread", { ...leg, label: text }, read, ""];
    });
    return found;
  };
  const total = (word, soft) => {
    let found = null;
    legs.forEach((leg) => {
      const market = String(leg.market || "");
      if (![totalMarket, "Total Points", "Total Goals", "Total Runs", "Total"].includes(market) && !/^Alternate Total /i.test(market)) return;
      const line = new RegExp(`${word} \\((\\d+(?:\\.\\d+)?)\\)`, "i").exec(String(leg.runner || "")) || new RegExp(`${word} (\\d+(?:\\.\\d+)?)`, "i").exec(String(leg.runner || ""));
      const odds = leg.odds;
      if (!line || odds < -500 || odds > -150) return;
      if (implied(odds) < floor) return;
      const text = `${word} ${g(line[1])} total ${unit}`;
      const read = teamCount(text, game, logs) || (soft ? softTeamRead(`${pair.filter(Boolean).map((name) => name.split(/\s+/).pop()).join(" and ")} games`, `${word.toLowerCase()} ${g(line[1])}`, odds) : null);
      if (read && (read.soft || read.hits >= share * read.games) && (!found || odds > found[1].odds || (found[2].soft && !read.soft))) found = [word === "Under" ? "The under" : "The over", { ...leg, label: text }, read, ""];
    });
    return found;
  };
  const money = (teamName, soft) => {
    let found = null;
    const rows = (logs[`${sport}|${teamName}`] || []).slice(0, 10);
    const hard = rows.length >= 5 ? rows.filter((row) => row.for > row.against).length : null;
    legs.forEach((leg) => {
      const odds = leg.odds;
      if (String(leg.market || "") !== "Moneyline" || String(leg.runner || "").trim() !== teamName || odds < -500 || odds > -150) return;
      if (implied(odds) < floor) return;
      const text = `${teamName} to win`;
      let read = null;
      if (hard !== null && hard >= share * rows.length) read = { who: teamName, verb: "won", hits: hard, games: rows.length };
      else if (soft) read = softTeamRead(teamName, "won", odds);
      if (read && (!found || odds > found[1].odds || (found[2].soft && !read.soft))) found = ["The win", { ...leg, label: text }, read, ""];
    });
    return found;
  };
  pair.forEach((teamName) => {
    [cover(teamName, false), money(teamName, false)].filter(Boolean).forEach((row) => keep(row, true));
  });
  [total("Over", false), total("Under", false)].filter(Boolean).forEach((row) => keep(row, true));
  if (!out.length) {
    pair.forEach((teamName) => {
      [cover(teamName, true), money(teamName, true)].filter(Boolean).forEach((row) => out.push(row));
    });
    [total("Over", true), total("Under", true)].filter(Boolean).forEach((row) => out.push(row));
  }
  return out.sort((a, b) => Number(!!a[2].soft) - Number(!!b[2].soft) || (rate(b[2]) - implied(b[1].odds)) - (rate(a[2]) - implied(a[1].odds)));
}

function packed(games, loaded, logs, { share = SHARE, floor = 0.85 } = {}) {
  const cache = logCache();
  const picked = [];
  const bySport = new Map();
  loaded.forEach((row) => {
    const sport = String(row[0].sport || "");
    if (!OPEN.has(sport)) return;
    if (!bySport.has(sport)) bySport.set(sport, []);
    bySport.get(sport).push(row);
  });
  bySport.forEach((rows, sport) => {
    const last = byLast(cache, sport);
    rows.forEach(([game, legs]) => {
      const match = String(game.match || "");
      const players = new Map();
      legs.forEach((leg) => {
        const row = readPackedPlayer(leg, sport);
        if (!row) return;
        const odds = row.odds;
        if (!((odds >= -500 && odds <= -150) || (odds >= -2500 && implied(odds) >= floor) || (row.juice && odds >= -250 && odds <= 300))) return;
        let read = count(row.label, sport, cache, last);
        if (!read && !row.juice && implied(odds) >= floor) {
          const p = implied(odds);
          read = { who: row.who, verb: "priced short", hits: Math.round(p * 10), games: 10, soft: true };
        }
        if (!read && row.juice && odds >= -140 && odds <= 250) {
          const p = implied(odds);
          read = { who: row.who, verb: "priced as juice", hits: Math.max(1, Math.round(p * 10)), games: 10, soft: true };
        }
        if (!read) return;
        if (!read.soft && read.hits < share * read.games) return;
        if (read.soft && row.juice && odds > -150 && odds < 100 && read.hits < share * read.games) return;
        if (!row.juice && implied(odds) < floor && odds > -500) return;
        if (row.juice && !read.soft && rate(read) <= implied(odds)) return;
        const key = `${row.rung}\u0000${row.who}`;
        const prev = players.get(key);
        if (!prev || (prev.read.soft && !read.soft) || ((!!prev.read.soft === !!read.soft) && odds > prev.odds)) players.set(key, { ...row, read });
      });
      const teamBets = packedTeamBets(game, legs, logs, sport, share, floor).slice(0, 4);
      if (!teamBets.length) return;
      const pool = [...players.values()];
      const anchors = pool.filter((row) => !row.juice && implied(row.odds) >= floor).sort((a, b) => (rate(b.read) - implied(b.odds)) - (rate(a.read) - implied(a.odds))).slice(0, 10);
      const juices = pool.filter((row) => row.juice || (implied(row.odds) < floor && row.odds <= 300 && rate(row.read) > implied(row.odds)))
        .sort((a, b) => (rate(b.read) - implied(b.odds)) - (rate(a.read) - implied(a.odds))).slice(0, 8);
      if (anchors.length < 2 || !juices.length) return;
      for (let i = 0; i < anchors.length; i += 1) {
        for (let j = i + 1; j < anchors.length; j += 1) {
          const a = anchors[i], b = anchors[j];
          if (a.who === b.who && a.rung === b.rung) continue;
          juices.forEach((juice) => {
            if ((juice.who === a.who && juice.rung === a.rung) || (juice.who === b.who && juice.rung === b.rung)) return;
            teamBets.forEach((teamBet) => {
              const rows = [
                [a.rung, a.leg, a.read, a.who],
                [b.rung, b.leg, b.read, b.who],
                teamBet,
                [juice.rung, juice.leg, juice.read, juice.who],
              ];
              if (rows.filter((row) => implied(row[1].odds) >= floor).length < 3) return;
              const names = new Set([a.who, b.who, juice.who].filter(Boolean));
              const juiceIn = names.has(juice.who) && (juice.who === a.who || juice.who === b.who);
              const edge = rows.reduce((sum, row) => sum + rate(row[2]) - implied(row[1].odds), 0);
              const bets = rows.map(([rung, leg]) => ({ kind: "Same-game parlay", rung, label: String(leg.label || ""), odds: leg.odds, stake: 5, job: JOBS[rung] || "Holds the bet up.", game: match }));
              picked.push([names.size - (juiceIn ? 0.5 : 0), -edge, { game: match, bets, kickoff: game.kickoff || "", sport }]);
            });
          });
        }
      }
    });
  });
  const ranked = picked.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((item) => item[2]);
  const kept = [];
  const seen = new Map();
  ranked.forEach((stack) => {
    const key = String(stack.game || "");
    const n = seen.get(key) || 0;
    if (n >= 8) return;
    seen.set(key, n + 1);
    kept.push(stack);
  });
  return kept;
}

module.exports = { build, mixed, scorers, packed };
