/** FanDuel prices that fit a stack. A shape that needs a second book is left uncovered. */

const { implied, decimal, pyRound, g, pool, gameLegs, seedLogs } = require("./stack-base");
const { teamLoad, tally } = require("./stack-read");
const { build, mixed, scorers } = require("./stack-sgp");

const SKIP = "We only look at FanDuel, so this one is not covered.";
const NOTES = {
  Arbitrage: SKIP,
  "Low-hold shopping": SKIP,
  "Live middle": "FanDuel shows the current number. The morning number is not on the board, so there is no first ticket to middle against.",
  Teaser: "FanDuel prices a teaser as its own ticket. That price is not on the board we read.",
  "Wong teaser": "FanDuel prices a teaser as its own ticket. That price is not on the board we read.",
  Pleaser: "FanDuel prices a pleaser as its own ticket. That price is not on the board we read.",
  "Cash-out": "FanDuel's cash-out number is not on the board we read.",
  Hedge: "This needs a ticket you already hold. The board has prices, not your open bets.",
  "Parlay hedge": "This needs a parlay you already hold. The board has prices, not your open bets.",
  "Future hedge": "This needs a future you already hold. The board has today's games, not that ticket.",
  "If-bet": "This is the order of two tickets you already like. FanDuel does not post it as a price.",
  Reverse: "This is the order of two tickets you already like. FanDuel does not post it as a price.",
  "Flat stake": "This is the size of a ticket you already like. FanDuel does not post it as a price.",
  Kelly: "This is the size of a ticket you already like. FanDuel does not post it as a price.",
  Martingale: "This is the size of the next ticket after a loss. FanDuel does not post it as a price.",
  Paroli: "This is the size of the next ticket after a win. FanDuel does not post it as a price.",
  "1-3-2-6": "This is the size of the next ticket after a win. FanDuel does not post it as a price.",
  Fibonacci: "This is the size of the next ticket after a loss. FanDuel does not post it as a price.",
  "Oscar's grind": "This is the size of the next ticket in a series. FanDuel does not post it as a price.",
};
const STAT = { pts: "points", reb: "rebounds", ast: "assists", blk: "blocks", stl: "steals" };

const match = (game) => String(game.match || "");
const stack = (game, bets) => ({ game, bets });
const ranked = (picked) => picked.sort((a, b) => a[0] - b[0]).map((item) => item[1]);
const runner = (leg) => String(leg.runner || "");
const num = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
const int = (value) => (num(value) === null || !Number.isInteger(Number(value)) ? null : Number(value));

function coverProfit(odds, stake) {
  const profit = stake * (odds < 0 ? 100 / Math.abs(odds) : odds / 100);
  const shown = Math.abs(profit - pyRound(profit)) < 0.05 ? pyRound(profit) : pyRound(profit, 2);
  return Number.isInteger(shown) ? String(shown) : shown.toFixed(2);
}

function bet(kind, rung, label, odds, stake, job, game) {
  return { kind, rung, label, odds, stake, job: job.replace(new RegExp(`\\$${stake}\\.(?=\\s|$)`), `$$${stake} to win $$${coverProfit(odds, stake)}.`), game };
}

function lineOf(text) {
  const found = /(\d+(?:\.\d+)?)\s*\+/.exec(text) || /\(([+-]?\d+(?:\.\d+)?)\)/.exec(text) || /(?:Over|Under)\s+(\d+(?:\.\d+)?)/i.exec(text);
  return found ? Number(found[1]) : null;
}

function cover(odds, need) {
  const per = odds < 0 ? 100 / Math.abs(odds) : odds / 100;
  return per ? Math.max(5, Math.trunc(need / per + 0.999)) : 5;
}

function totalWord(game) {
  return { NHL: "total goals", MLB: "total runs" }[String(game.sport || "")] || "total points";
}

function say(leg) {
  let text = String(leg.label || leg.runner || "").trim();
  const market = String(leg.market || "");
  if (text && market.includes(" - ") && /\b(?:Over|Under)\s+\d+(?:\.\d+)?$/i.test(text)) {
    const stat = market.slice(market.indexOf(" - ") + 3).trim().replace(/^alt\s+/i, "");
    text = `${text} ${stat.split(/\s+/).filter(Boolean).map((word) => STAT[word.toLowerCase()] || word.toLowerCase()).join(" ")}`;
  }
  return text || market;
}

function grouped(legs, keep) {
  const groups = new Map();
  legs.forEach((leg) => {
    const row = keep(leg);
    if (!row) return;
    if (!groups.has(row[0])) groups.set(row[0], []);
    groups.get(row[0]).push(row.slice(1));
  });
  return groups;
}

function ladders(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const groups = grouped(legs, (leg) => {
      const market = String(leg.market || "");
      const line = lineOf(runner(leg));
      return market.toLowerCase().includes("alt") && line !== null && !runner(leg).toLowerCase().includes("under") ? [market, line, leg] : null;
    });
    groups.forEach((rows, market) => {
      rows.sort((a, b) => a[0] - b[0]);
      for (let at = 0; at < rows.length - 2; at += 1) {
        const window = rows.slice(at, at + 3);
        if (!(window[0][0] < window[1][0] && window[1][0] < window[2][0])) continue;
        const bottom = window[0][1];
        const top = window[2][1];
        if (bottom.odds < -260 || bottom.odds > -110 || top.odds <= 0) continue;
        const score = Math.abs(bottom.odds + 160) + (["period", "qtr", "half"].some((word) => market.toLowerCase().includes(word)) ? 400 : 0);
        const stake = cover(bottom.odds, 10);
        const names = ["Bottom rung", "Middle rung", "Top rung"];
        const jobs = [`$${stake} to win $${coverProfit(bottom.odds, stake)}. That covers the $5 and $5 above it.`, "The next line up. $5.", "The highest line. $5. This is the one a huge night clears."];
        picked.push([score, stack(match(game), window.map((row, index) => bet("Single", names[index], say(row[1]), row[1].odds, index ? 5 : stake, jobs[index], match(game))))]);
      }
    });
  });
  return ranked(picked);
}

function unders(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const groups = grouped(legs, (leg) => {
      const line = runner(leg).toLowerCase().includes("under") ? lineOf(runner(leg)) : null;
      return line === null ? null : [String(leg.market || ""), line, leg];
    });
    groups.forEach((rows) => {
      rows.sort((a, b) => a[0] - b[0]);
      rows.forEach((low, left) => rows.slice(left + 1).forEach((high) => {
        const gap = high[0] - low[0];
        if (gap < 3 || gap > 6 || high[1].odds < -180 || high[1].odds > -105) return;
        const stake = cover(high[1].odds, 5);
        picked.push([Math.abs(gap - 4) + Math.abs(high[1].odds + 120) / 50, stack(match(game), [
          bet("Single", "Higher under", say(high[1]), high[1].odds, stake, `$${stake} to win $${coverProfit(high[1].odds, stake)} on the higher under. Its profit covers the $5 tighter under.`, match(game)),
          bet("Single", "Lower under", say(low[1]), low[1].odds, 5, "The tight line. Both cash only under this number. $5.", match(game)),
        ])]);
      }));
    });
  });
  return ranked(picked);
}

function middles(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    grouped(legs, (leg) => [String(leg.market || ""), leg]).forEach((rows, market) => {
      if (!market.toLowerCase().includes("total")) return;
      const sides = (word) => rows.map(([leg]) => [lineOf(runner(leg)), leg]).filter(([line, leg]) => line !== null && runner(leg).toLowerCase().includes(word));
      const unders = sides("under");
      sides("over").forEach(([overLine, over]) => unders.forEach(([underLine, under]) => {
        const gap = underLine - overLine;
        if (gap < 3 || gap > 8 || over.odds < -170 || under.odds < -170) return;
        picked.push([Math.abs(over.odds + 110) + Math.abs(under.odds + 110) - gap * 20, stack(match(game), [
          bet("Single", "Low side", say(over), over.odds, 5, `Over ${g(overLine)}. $5.`, match(game)),
          bet("Single", "High side", say(under), under.odds, 5, `Under ${g(underLine)}. A finish between them wins both. $5.`, match(game)),
        ])]);
      }));
    });
  });
  return ranked(picked);
}

function signedPair(text) {
  const found = /^(.*?)\s+\(([+-]?\d+(?:\.\d+)?)\)$/.exec(text.trim());
  return found ? [found[1].trim(), Number(found[2])] : null;
}

function keys(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const book = new Map();
    legs.forEach((leg) => {
      const parsed = String(leg.market || "") === "Alternate Spread" ? signedPair(runner(leg)) : null;
      if (parsed) book.set(`${parsed[0]}\u0000${parsed[1]}`, leg);
    });
    const teams = [...new Set([...book.keys()].map((key) => key.split("\u0000")[0]))];
    if (teams.length !== 2) return;
    [[-2.5, 3.5, 3], [-6.5, 7.5, 7]].forEach(([favorite, dogLine, key]) => teams.forEach((team) => {
      const other = teams.find((name) => name !== team);
      const left = book.get(`${team}\u0000${favorite}`);
      const right = book.get(`${other}\u0000${dogLine}`);
      if (!left || !right || left.odds < -220 || right.odds < -220) return;
      picked.push([Math.abs(left.odds + 110) + Math.abs(right.odds + 110), stack(match(game), [
        bet("Single", `Covers a win by ${key}`, say(left), left.odds, 5, `A win by ${key} clears this side. $5.`, match(game)),
        bet("Single", `Also covers a win by ${key}`, say(right), right.odds, 5, `The other side also covers a ${key}-point win. $5.`, match(game)),
      ])]);
    }));
  });
  return ranked(picked);
}

function full(leg, tail) {
  const market = String(leg.market || "").toLowerCase();
  return market.endsWith(` - ${tail.toLowerCase()}`) && !market.includes("alt") && !market.includes("qtr") && !market.includes("half") && runner(leg).toLowerCase().includes("over");
}

function hooks(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const spread = game.spread && typeof game.spread === "object" ? game.spread : {};
    const home = num(spread.homeLine);
    const away = num(spread.awayLine);
    if (home === null || away === null) return;
    const favorite = home < 0 ? ["home", home] : ["away", away];
    if (![3.5, 7.5].includes(Math.abs(favorite[1]))) return;
    const bought = favorite[1] < 0 ? favorite[1] + 1 : favorite[1] - 1;
    const team = String((favorite[0] === "home" ? game.homeName : game.awayName) || "");
    const mainOdds = Math.trunc(Number((favorite[0] === "home" ? spread.homeOdds : spread.awayOdds) || 0));
    const alt = legs.find((leg) => { const parsed = String(leg.market || "") === "Alternate Spread" && signedPair(runner(leg)); return parsed && parsed[0] === team && parsed[1] === bought; });
    if (!alt || !mainOdds) return;
    const key = Math.abs(favorite[1]) === 3.5 ? 3 : 7;
    picked.push([Math.abs(alt.odds - mainOdds), stack(match(game), [
      bet("Single", "The posted number", `${team} ${g(favorite[1])}`, mainOdds, 5, `A win by ${key} loses this number.`, match(game)),
      bet("Single", "The hook", say(alt), alt.odds, 5, `Bought to ${g(bought)}. A win by ${key} covers. $5.`, match(game)),
    ])]);
  });
  return ranked(picked);
}

function dutch(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const rows = legs.filter((leg) => String(leg.market || "") === "1st Touchdown Scorer").sort((a, b) => a.odds - b.odds);
    const chosen = [];
    let chance = 0;
    for (const leg of rows) {
      if (chance + implied(leg.odds) >= 1) break;
      chosen.push(leg);
      chance += implied(leg.odds);
    }
    if (chosen.length < 2 || chance <= 0) return;
    const raw = chosen.map((leg) => 1 / decimal(leg.odds));
    const scale = 15 / raw.reduce((sum, part) => sum + part, 0);
    const stakes = raw.map((part) => Math.max(1, pyRound(part * scale)));
    picked.push([chance, stack(match(game), chosen.map((leg, index) => bet("Single", `First touchdown ${index + 1}`, say(leg), leg.odds, stakes[index], `$${stakes[index]}.`, match(game))))]);
  });
  return ranked(picked);
}

function parlay(left, right) {
  const price = decimal(left) * decimal(right);
  return price >= 2 ? pyRound((price - 1) * 100) : pyRound(-100 / (price - 1));
}

function robin(games) {
  const chosen = [];
  const seen = new Set();
  games.forEach((game) => {
    const spread = game.spread && typeof game.spread === "object" ? game.spread : {};
    let best = null;
    [["away", "awayLine", "awayOdds"], ["home", "homeLine", "homeOdds"]].forEach(([side, lineKey, oddsKey]) => {
      const line = num(spread[lineKey]);
      const odds = int(spread[oddsKey]);
      if (line === null || odds === null) return;
      const team = String((side === "away" ? game.awayName : game.homeName) || "");
      if (team && (!best || Math.abs(odds + 110) < best[0])) best = [Math.abs(odds + 110), `${team} ${g(line)}`, odds, match(game)];
    });
    if (!best || seen.has(best[3])) return;
    seen.add(best[3]);
    chosen.push(best.slice(1));
  });
  if (chosen.length < 3) return [];
  const bets = [];
  chosen.forEach((left, at) => chosen.slice(at + 1).forEach((right) => {
    bets.push(bet("Parlay", `Pair ${bets.length + 1}`, `${left[0]} and ${right[0]}`, parlay(left[1], right[1]), 5, "One miss kills this pair and leaves the other pair. $5.", `${left[2]} · ${right[2]}`));
  }));
  return [stack("One side from each game, the price closer to -110", bets)];
}

function correlated(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const receiving = legs.filter((leg) => full(leg, "Receiving Yds"));
    legs.filter((leg) => full(leg, "Passing Yds")).forEach((quarter) => receiving.forEach((catchLeg) => {
      picked.push([Math.abs(quarter.odds + 110) + Math.abs(catchLeg.odds + 110), stack(match(game), [
        bet("Single", "Passing yards", say(quarter), quarter.odds, 5, "The throws. $5.", match(game)),
        bet("Single", "Receiving yards", say(catchLeg), catchLeg.odds, 5, "The catches on those throws. Same game, so the card's multiplied price treats them as two games. $5.", match(game)),
      ])]);
    }));
  });
  return ranked(picked);
}

function sideTotal(games) {
  const picked = [];
  games.forEach((game) => {
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
    const team = String((fav === "home" ? game.homeName : game.awayName) || "");
    const odds = Math.trunc(Number((fav === "home" ? spread.homeOdds : spread.awayOdds) || 0));
    const dog = String((fav === "home" ? game.awayName : game.homeName) || "");
    const dogOdds = Math.trunc(Number((fav === "home" ? spread.awayOdds : spread.homeOdds) || 0));
    if (!team || !odds) return;
    if (margin >= 6.5) {
      picked.push([-margin, stack(match(game), [
        bet("Single", "The favorite", `${team} ${g(fav === "home" ? home : away)}`, odds, 5, "A lead runs the clock. $5.", match(game)),
        bet("Single", "The under", `Under ${g(line)} ${totalWord(game)}`, under, 5, "The clock helps this number. $5.", match(game)),
      ])]);
    } else if (margin <= 3) {
      picked.push([margin, stack(match(game), [
        bet("Single", "The dog", `${dog} ${g(fav === "home" ? away : home)}`, dogOdds, 5, "A close game stays live. $5.", match(game)),
        bet("Single", "The over", `Over ${g(line)} ${totalWord(game)}`, over, 5, "Both teams keep throwing. $5.", match(game)),
      ])]);
    }
  });
  return ranked(picked);
}

function playerTotal(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const total = game.total && typeof game.total === "object" ? game.total : {};
    const over = int(total.overOdds);
    const line = num(total.line);
    if (over === null || line === null) return;
    legs.filter((leg) => full(leg, "Receiving Yds")).forEach((catchLeg) => {
      picked.push([Math.abs(catchLeg.odds + 110), stack(match(game), [
        bet("Single", "The receiver", say(catchLeg), catchLeg.odds, 5, "The catches need points. $5.", match(game)),
        bet("Single", "The over", `Over ${g(line)} ${totalWord(game)}`, over, 5, "The game script that gives him those plays. $5.", match(game)),
      ])]);
    });
  });
  return ranked(picked);
}

function score(loaded) {
  const picked = [];
  loaded.forEach(([game, legs]) => {
    const byName = (market) => new Map(legs.filter((leg) => String(leg.market || "") === market).map((leg) => [runner(leg).trim(), leg]));
    const first = byName("1st Touchdown Scorer");
    byName("Any Time Touchdown Scorer").forEach((anyLeg, name) => {
      const firstLeg = first.get(name);
      if (!firstLeg || anyLeg.odds < -200 || anyLeg.odds > 150 || firstLeg.odds <= 0) return;
      const stake = cover(anyLeg.odds, 5);
      picked.push([Math.abs(anyLeg.odds + 110), stack(match(game), [
        bet("Single", "Anytime", `${name} anytime touchdown`, anyLeg.odds, stake, `$${stake}. The profit covers the $5 first-touchdown ticket if he scores later.`, match(game)),
        bet("Single", "First touchdown", `${name} first touchdown`, firstLeg.odds, 5, "The expensive rung. $5. Both cash if he scores first.", match(game)),
      ])]);
    });
  });
  return ranked(picked);
}

async function findStacks(board) {
  const now = Date.now();
  const games = (Array.isArray((board || {}).games) ? board.games : []).filter((game) => game && typeof game === "object" && Date.parse(String(game.kickoff || "")) > now);
  const loaded = (await pool(games, 6, async (game) => {
    try { return [game, (await gameLegs(String(game.id || ""))).filter((leg) => Number.isInteger(leg.odds))]; } catch (error) { return [game, []]; }
  })).filter(([, legs]) => legs.length);
  await seedLogs(loaded);
  const logs = await teamLoad(games);
  const yardage = (options) => build(games, loaded, logs, options);
  const found = {
    "Prop ladder": ladders(loaded),
    "Overlapping under": unders(loaded),
    "Classic middle": middles(loaded),
    "Key-number middle": keys(loaded),
    "Buying the hook": hooks(loaded),
    Dutching: dutch(loaded),
    "Round robin": robin(games),
    "Correlated stack": correlated(loaded),
    "Side and the total": sideTotal(games),
    "Player and the total": playerTotal(loaded),
    "First touchdown and anytime": score(loaded),
    "Same-game yardage parlay": yardage({}),
    "Yardage and the spread": yardage({ end: "spread" }),
    "Yardage parlay, 85% legs": yardage({ floor: 0.85 }),
    "Yardage parlay, 90% legs": yardage({ floor: 0.9 }),
    "Yardage parlay, 75% legs": yardage({ floor: 0.75 }),
    "Receptions parlay, 90% legs": yardage({ floor: 0.9, catches: "Receptions" }),
    "Yardage parlay, 3 legs at 90%": yardage({ floor: 0.9, need: 3 }),
    "Yardage parlay, all 4 at 90%": yardage({ floor: 0.9, need: 4 }),
    "Catches, yards, and a touchdown": mixed(loaded),
    "Two touchdowns, one game": scorers(loaded),
    "Three touchdowns, one game": scorers(loaded, 3),
    "Four touchdowns, one game": scorers(loaded, 4),
    "Five touchdowns, one game": scorers(loaded, 5),
  };
  await tally(found, games);
  return { found: Object.fromEntries(Object.entries(found).filter(([, value]) => value.length)), notes: NOTES };
}

module.exports = { findStacks };
