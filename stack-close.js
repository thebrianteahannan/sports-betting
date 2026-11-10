/** Close calls: FanDuel prices that missed a strategy's cutoffs by a little, and the cutoff each one missed. */

const { implied, g } = require("./stack-base");
const { tally } = require("./stack-read");
const { build, mixed, scorers } = require("./stack-sgp");
const { kit } = require("./stack-shapes");

const { bet, say, lineOf, grouped, cover, coverProfit, signedPair, num, int, totalWord, runner } = kit;
const KEEP = 3;
const REACH = 0.08;
const SHARE = 0.8;
const odd = (value) => (value > 0 ? `+${value}` : String(value));
const pct = (value) => `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
const outside = (value, low, high) => (value < low ? low - value : value > high ? value - high : 0);
const gapOff = (gap, low, high) => (gap < low ? low - gap : gap > high ? gap - high : 0) * 0.02;
const near = (off) => off > 0 && off <= REACH;

function ladders(loaded) {
  const out = [];
  loaded.forEach(([game, legs]) => {
    const match = String(game.match || "");
    grouped(legs, (leg) => {
      const line = lineOf(runner(leg));
      return String(leg.market || "").toLowerCase().includes("alt") && line !== null && !runner(leg).toLowerCase().includes("under") ? [String(leg.market || ""), line, leg] : null;
    }).forEach((rows) => {
      rows.sort((a, b) => a[0] - b[0]);
      for (let at = 0; at < rows.length - 2; at += 1) {
        const window = rows.slice(at, at + 3);
        if (!(window[0][0] < window[1][0] && window[1][0] < window[2][0])) continue;
        const bottom = window[0][1].odds;
        const top = window[2][1].odds;
        const low = outside(implied(bottom), implied(-110), implied(-260));
        const high = top > 0 ? 0 : Math.max(implied(top) - 0.5, 0.005);
        if (!near(low + high)) continue;
        const miss = [];
        if (low) miss.push(`The bottom rung is ${odd(bottom)}. The ladder takes -110 to -260.`);
        if (high) miss.push(`The top rung is ${odd(top)}. The ladder needs it at plus money.`);
        const stake = cover(bottom, 10);
        const names = ["Bottom rung", "Middle rung", "Top rung"];
        const jobs = [`$${stake} to win $${coverProfit(bottom, stake)}. That covers the $5 and $5 above it.`, "The next line up. $5.", "The highest line. $5. This is the one a huge night clears."];
        out.push({ off: low + high, miss: miss.join(" "), game: match, bets: window.map((row, index) => bet("Single", names[index], say(row[1]), row[1].odds, index ? 5 : stake, jobs[index], match)) });
      }
    });
  });
  return out;
}

function unders(loaded) {
  const out = [];
  loaded.forEach(([game, legs]) => {
    const match = String(game.match || "");
    grouped(legs, (leg) => {
      const line = runner(leg).toLowerCase().includes("under") ? lineOf(runner(leg)) : null;
      return line === null ? null : [String(leg.market || ""), line, leg];
    }).forEach((rows) => {
      rows.sort((a, b) => a[0] - b[0]);
      rows.forEach((low, left) => rows.slice(left + 1).forEach((high) => {
        const gap = high[0] - low[0];
        if (gap < 2 || gap > 8) return;
        const wide = gapOff(gap, 3, 6);
        const price = outside(implied(high[1].odds), implied(-105), implied(-180));
        if (!near(wide + price)) return;
        const miss = [];
        if (wide) miss.push(`The two lines are ${g(gap)} apart. The shape takes 3 to 6.`);
        if (price) miss.push(`The higher under is ${odd(high[1].odds)}. The shape takes -105 to -180.`);
        const stake = cover(high[1].odds, 5);
        out.push({ off: wide + price, miss: miss.join(" "), game: match, bets: [
          bet("Single", "Higher under", say(high[1]), high[1].odds, stake, `$${stake} to win $${coverProfit(high[1].odds, stake)} on the higher under. Its profit covers the $5 tighter under.`, match),
          bet("Single", "Lower under", say(low[1]), low[1].odds, 5, "The tight line. Both cash only under this number. $5.", match),
        ] });
      }));
    });
  });
  return out;
}

function middles(loaded) {
  const out = [];
  const cap = implied(-170);
  loaded.forEach(([game, legs]) => {
    const match = String(game.match || "");
    grouped(legs, (leg) => [String(leg.market || ""), leg]).forEach((rows, market) => {
      if (!market.toLowerCase().includes("total")) return;
      const sides = (word) => rows.map(([leg]) => [lineOf(runner(leg)), leg]).filter(([line, leg]) => line !== null && runner(leg).toLowerCase().includes(word));
      const highs = sides("under");
      sides("over").forEach(([overLine, over]) => highs.forEach(([underLine, under]) => {
        const gap = underLine - overLine;
        if (gap < 2 || gap > 10) return;
        const wide = gapOff(gap, 3, 8);
        const lowPrice = Math.max(0, implied(over.odds) - cap);
        const highPrice = Math.max(0, implied(under.odds) - cap);
        if (!near(wide + lowPrice + highPrice)) return;
        const miss = [];
        if (wide) miss.push(`The lines are ${g(gap)} apart. The shape takes 3 to 8.`);
        if (lowPrice) miss.push(`The over is ${odd(over.odds)}. The shape takes -170 or better.`);
        if (highPrice) miss.push(`The under is ${odd(under.odds)}. The shape takes -170 or better.`);
        out.push({ off: wide + lowPrice + highPrice, miss: miss.join(" "), game: match, bets: [
          bet("Single", "Low side", say(over), over.odds, 5, `Over ${g(overLine)}. $5.`, match),
          bet("Single", "High side", say(under), under.odds, 5, `Under ${g(underLine)}. A finish between them wins both. $5.`, match),
        ] });
      }));
    });
  });
  return out;
}

function keys(loaded) {
  const out = [];
  const cap = implied(-220);
  loaded.forEach(([game, legs]) => {
    const match = String(game.match || "");
    const book = new Map();
    legs.forEach((leg) => {
      const parsed = String(leg.market || "") === "Alternate Spread" ? signedPair(runner(leg)) : null;
      if (parsed) book.set(`${parsed[0]}\u0000${parsed[1]}`, leg);
    });
    const teams = [...new Set([...book.keys()].map((key) => key.split("\u0000")[0]))];
    if (teams.length !== 2) return;
    [[-2.5, 3.5, 3], [-6.5, 7.5, 7]].forEach(([favorite, dogLine, key]) => teams.forEach((team) => {
      const left = book.get(`${team}\u0000${favorite}`);
      const right = book.get(`${teams.find((name) => name !== team)}\u0000${dogLine}`);
      if (!left || !right) return;
      const offs = [left, right].map((leg) => Math.max(0, implied(leg.odds) - cap));
      if (!near(offs[0] + offs[1])) return;
      const miss = [left, right].filter((leg, at) => offs[at]).map((leg) => `${say(leg)} is ${odd(leg.odds)}. The shape takes -220 or better.`);
      out.push({ off: offs[0] + offs[1], miss: miss.join(" "), game: match, bets: [
        bet("Single", `Covers a win by ${key}`, say(left), left.odds, 5, `A win by ${key} clears this side. $5.`, match),
        bet("Single", `Also covers a win by ${key}`, say(right), right.odds, 5, `The other side also covers a ${key}-point win. $5.`, match),
      ] });
    }));
  });
  return out;
}

function sideTotal(games) {
  const out = [];
  games.forEach((game) => {
    const match = String(game.match || "");
    const spread = game.spread && typeof game.spread === "object" ? game.spread : {};
    const total = game.total && typeof game.total === "object" ? game.total : {};
    const home = num(spread.homeLine);
    const away = num(spread.awayLine);
    const over = int(total.overOdds);
    const under = int(total.underOdds);
    const line = num(total.line);
    if ([home, away, over, under, line].includes(null)) return;
    const fav = home < 0 ? "home" : "away";
    const margin = Math.abs(home);
    if (margin <= 3 || margin >= 6.5) return;
    const team = String((fav === "home" ? game.homeName : game.awayName) || "");
    const dog = String((fav === "home" ? game.awayName : game.homeName) || "");
    const odds = Math.trunc(Number((fav === "home" ? spread.homeOdds : spread.awayOdds) || 0));
    const dogOdds = Math.trunc(Number((fav === "home" ? spread.awayOdds : spread.homeOdds) || 0));
    if (!team || !odds) return;
    if (margin >= 5) {
      out.push({ off: (6.5 - margin) * 0.02, miss: `The favorite is -${g(margin)}. The favorite-and-under shape takes -6.5 or more.`, game: match, bets: [
        bet("Single", "The favorite", `${team} ${g(fav === "home" ? home : away)}`, odds, 5, "A lead runs the clock. $5.", match),
        bet("Single", "The under", `Under ${g(line)} ${totalWord(game)}`, under, 5, "The clock helps this number. $5.", match),
      ] });
    } else {
      out.push({ off: (margin - 3) * 0.02, miss: `The spread is ${g(margin)}. The dog-and-over shape takes 3 or less.`, game: match, bets: [
        bet("Single", "The dog", `${dog} ${g(fav === "home" ? away : home)}`, dogOdds, 5, "A close game stays live. $5.", match),
        bet("Single", "The over", `Over ${g(line)} ${totalWord(game)}`, over, 5, "Both teams keep throwing. $5.", match),
      ] });
    }
  });
  return out;
}

function score(loaded) {
  const out = [];
  loaded.forEach(([game, legs]) => {
    const match = String(game.match || "");
    const byName = (market) => new Map(legs.filter((leg) => String(leg.market || "") === market).map((leg) => [runner(leg).trim(), leg]));
    const first = byName("1st Touchdown Scorer");
    byName("Any Time Touchdown Scorer").forEach((anyLeg, name) => {
      const firstLeg = first.get(name);
      if (!firstLeg || firstLeg.odds <= 0) return;
      const off = outside(implied(anyLeg.odds), implied(150), implied(-200));
      if (!near(off)) return;
      const stake = cover(anyLeg.odds, 5);
      out.push({ off, miss: `The anytime price is ${odd(anyLeg.odds)}. The shape takes -200 to +150.`, game: match, bets: [
        bet("Single", "Anytime", `${name} anytime touchdown`, anyLeg.odds, stake, `$${stake}. The profit covers the $5 first-touchdown ticket if he scores later.`, match),
        bet("Single", "First touchdown", `${name} first touchdown`, firstLeg.odds, 5, "The expensive rung. $5. Both cash if he scores first.", match),
      ] });
    });
  });
  return out;
}

function hitMiss(stack, share) {
  const short = (stack.bets || []).filter((leg) => leg.games && leg.hits < Math.ceil(share * leg.games));
  stack.off = short.reduce((sum, leg) => sum + (Math.ceil(share * leg.games) - leg.hits) / leg.games, 0);
  stack.miss = short.map((leg) => `${leg.label}: ${leg.hits} of the last ${leg.games}. The shape takes ${Math.ceil(share * leg.games)}.`).join(" ");
}

function priceMiss(stack) {
  const short = (stack.bets || []).filter((leg) => leg.games && leg.hits / leg.games <= implied(leg.odds));
  stack.off = short.reduce((sum, leg) => sum + implied(leg.odds) - leg.hits / leg.games, 0) || 0.001;
  stack.miss = short.map((leg) => `${leg.label}: ${leg.hits} of the last ${leg.games}, ${pct(leg.hits / leg.games)}. FanDuel prices it at ${pct(implied(leg.odds))}.`).join(" ");
}

async function closeCalls(games, loaded, logs, found) {
  const loose = (options) => build(games, loaded, logs, { ...options, share: 0.6 });
  const hits = {
    "Same-game yardage parlay": loose({}),
    "Yardage and the spread": loose({ end: "spread" }),
    "Yardage parlay, 85% legs": loose({ floor: 0.85 }),
    "Yardage parlay, 90% legs": loose({ floor: 0.9 }),
    "Yardage parlay, 75% legs": loose({ floor: 0.75 }),
    "Receptions parlay, 90% legs": loose({ floor: 0.9, catches: "Receptions" }),
    "Yardage parlay, 3 legs at 90%": loose({ floor: 0.9, need: 3 }),
    "Yardage parlay, all 4 at 90%": loose({ floor: 0.9, need: 4 }),
  };
  const prices = {
    "Catches, yards, and a touchdown": mixed(loaded, REACH),
    "Two touchdowns, one game": scorers(loaded, 2, REACH),
    "Three touchdowns, one game": scorers(loaded, 3, REACH),
    "Four touchdowns, one game": scorers(loaded, 4, REACH),
    "Five touchdowns, one game": scorers(loaded, 5, REACH),
  };
  await tally(hits, games);
  await tally(prices, games);
  Object.values(hits).forEach((stacks) => stacks.forEach((stack) => hitMiss(stack, SHARE)));
  Object.values(prices).forEach((stacks) => stacks.forEach(priceMiss));
  const shapes = {
    "Prop ladder": ladders(loaded),
    "Overlapping under": unders(loaded),
    "Classic middle": middles(loaded),
    "Key-number middle": keys(loaded),
    "Side and the total": sideTotal(games),
    "First touchdown and anytime": score(loaded),
  };
  await tally(shapes, games);
  const key = (stack) => (stack.bets || []).map((leg) => leg.label).sort().join("\n");
  const out = {};
  Object.entries({ ...shapes, ...hits, ...prices }).forEach(([name, stacks]) => {
    const taken = new Set((found[name] || []).map(key));
    const seen = new Set();
    const keep = stacks.filter((stack) => stack.miss && !taken.has(key(stack)) && !seen.has(key(stack)) && seen.add(key(stack))).sort((a, b) => a.off - b.off).slice(0, KEEP);
    if (keep.length) out[name] = keep;
  });
  return out;
}

module.exports = { closeCalls };
