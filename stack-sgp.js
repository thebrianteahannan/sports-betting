/** Same-game parlays: yardage ladders, a catches-yards-touchdown mix, and touchdown scorers, each beating FanDuel's price lately. */

const { implied, g, signed, logCache, byLast } = require("./stack-base");
const { count, findPack, teamCount } = require("./stack-read");

const STATS = { "Alt Passing Yds": "Passing yards", "Alt Receiving Yds": "Receiving yards", "Alt Receptions": "Receptions", "Alt Rushing Yds": "Rushing yards" };
const JOBS = {
  "Passing yards": "The throws his receiver needs.",
  "Receiving yards": "Catches on those throws.",
  Receptions: "The catches those throws find.",
  "Rushing yards": "The yards on the ground.",
  "The over": "The points those yards turn into.",
  "Anytime touchdown": "The carries that end in the end zone.",
  "The spread": "The result those yards build.",
};
const FLOOR = { "Passing yards": 150, "Receiving yards": 20, Receptions: 3, "Rushing yards": 20 };
const SHARE = 0.8;
const ATD = "Any Time Touchdown Scorer";

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

module.exports = { build, mixed, scorers };
