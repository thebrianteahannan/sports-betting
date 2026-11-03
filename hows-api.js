/** Read a pasted bet and say which strategy it is. */

const { readShot } = require("./slip-api");

const HOW = `Read this bet slip. A parlay is one ticket with several legs. Separate bets on the same screenshot are a stack: give each bet its own ticket number, starting at 1.
A team to win: player is the team, market is "to win", side is "win", line is null.
A spread: market is "spread", line is the points with the sign, side is "spread".
A total: market is "total", side is over or under, line is the number.
A player prop: player is the person, market is only the stat, side is over or under, line is the number. odds is that leg's price. stake is that ticket's dollars, repeated on each leg of the ticket. Use "" when a number is not printed.
kind is single, parlay, same game parlay, teaser, round robin, or stack.
{"book":"","kind":"parlay","odds":"+264","stake":"$15.00","payout":"$40.00","legs":[{"ticket":1,"player":"Saquon Barkley","market":"rushing yards","side":"over","line":24.5,"odds":"-114","stake":"$15.00","match":"Eagles @ Commanders","sport":"NFL"}]}`;

const NOS = { safe2: "S-02", mid3: "S-04", chalk: "S-05", win4: "S-06", four: "S-07", plusLegs: "S-08", plus: "S-09", mix21: "S-10", five: "S-11", hits: "S-12", low3: "S-13", weekThree: "S-14", yards3: "S-15", weekFive: "S-16", ou4: "S-17", weekSafe: "S-18", alt3: "S-19", weekEven: "S-20", games4: "S-21", td2: "S-25", td3: "S-26", pay5: "S-27", pay10: "S-28", pay15: "S-29", pay20: "S-30", pay25: "S-31", pay50: "S-32" };

function american(text) {
  const raw = String(text || "").replace(/[−–]/g, "-").replace(/[^\d.+-]/g, "");
  const n = Number(raw);
  return raw && Number.isFinite(n) && n ? Math.round(n) : null;
}

function dollars(text) {
  const n = Number(String(text || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function bucks(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  const shown = Math.round(n * 100) / 100;
  return Number.isInteger(shown) ? `$${shown}` : `$${shown.toFixed(2)}`;
}

function tag(odds) {
  return Number.isFinite(odds) ? (odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`) : "";
}

function winOn(stake, odds) {
  if (!stake || !Number.isFinite(odds)) return 0;
  return stake * (odds < 0 ? 100 / Math.abs(odds) : odds / 100);
}

function chance(odds) {
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

function who(leg) {
  return String(leg.player || "").trim().toLowerCase();
}

function stat(leg) {
  return String(leg.market || "").trim().toLowerCase();
}

function game(leg) {
  return String(leg.match || "").trim().toLowerCase();
}

function lineOf(leg) {
  if (leg.line == null || leg.line === "") return null;
  const n = Number(String(leg.line).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function sideOf(leg) {
  const text = `${leg.side || ""} ${leg.market || ""}`;
  if (/\bunder\b/i.test(text)) return "under";
  if (/\bover\b|\+/i.test(text)) return "over";
  return String(leg.side || "").toLowerCase();
}

function band(odds, lo, hi) {
  return odds.every((n) => n >= lo && n <= hi);
}

function yard(leg) {
  return /yard|\byds?\b/.test(stat(leg));
}

function td(leg) {
  return /anytime|any time/.test(stat(leg)) && /td|touchdown/.test(stat(leg));
}

function buckets(legs) {
  const map = new Map();
  legs.forEach((leg) => {
    const key = Number(leg.ticket) || 1;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(leg);
  });
  return [...map.values()];
}

function card(no, name, line, lead) {
  return { no, name, line, lead: !!lead };
}

function ladder(tickets) {
  if (tickets.length < 3 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]);
  if (!legs.every((leg) => who(leg) && who(leg) === who(legs[0]) && stat(leg) === stat(legs[0]) && sideOf(leg) === "over")) return null;
  const lines = legs.map(lineOf);
  if (lines.some((n) => n == null) || new Set(lines).size !== lines.length) return null;
  const order = legs.slice().sort((a, b) => lineOf(a) - lineOf(b));
  const stakes = order.map((leg) => dollars(leg.stake));
  const odds = american(order[0].odds);
  if (!stakes.every((n) => n > 0) || !odds) return card("ST-01", "Prop ladder", `This is a ladder on ${order[0].player} ${order[0].market}. The bottom payout has to cover the rungs above it.`, true);
  const profit = winOn(stakes[0], odds);
  const above = stakes.slice(1).reduce((sum, n) => sum + n, 0);
  const line = profit + 0.05 >= above
    ? `Keep it. The bottom rung wins ${bucks(profit)}. That covers the ${bucks(above)} on the rungs above it.`
    : `Leave it. The bottom rung wins ${bucks(profit)}. The rungs above it cost ${bucks(above)}.`;
  return card("ST-01", "Prop ladder", line, true);
}

function unders(tickets) {
  if (tickets.length !== 2 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]);
  if (!legs.every((leg) => sideOf(leg) === "under" && stat(leg) === stat(legs[0]))) return null;
  const [low, high] = legs.slice().sort((a, b) => lineOf(a) - lineOf(b));
  const gap = lineOf(high) - lineOf(low);
  if (!(gap >= 2)) return null;
  const odds = american(high.odds);
  const stake = dollars(high.stake);
  const other = dollars(low.stake);
  if (!odds || !stake || !other) return card("ST-02", "Overlapping under", "Two unders on the same number. The higher under has to pay for the tighter one.", true);
  const profit = winOn(stake, odds);
  const line = profit + 0.05 >= other
    ? `Keep it. The higher under wins ${bucks(profit)}. That covers the ${bucks(other)} tighter under.`
    : `Leave it. The higher under wins ${bucks(profit)}. The tighter under costs ${bucks(other)}.`;
  return card("ST-02", "Overlapping under", line, true);
}

function middle(tickets) {
  if (tickets.length !== 2 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]);
  const over = legs.find((leg) => sideOf(leg) === "over");
  const under = legs.find((leg) => sideOf(leg) === "under");
  if (!over || !under || stat(over) !== stat(under)) return null;
  const gap = lineOf(under) - lineOf(over);
  if (!(gap >= 2)) return null;
  const prices = [american(over.odds), american(under.odds)];
  const juicy = prices.some((n) => !n || n < -150);
  const line = juicy
    ? `Leave it. The two sides are ${prices.map(tag).join(" and ")}. The gap has to hit often enough to pay for that juice.`
    : `Keep it. A finish between ${lineOf(over)} and ${lineOf(under)} wins both. Outside it, one side pays for the juice.`;
  return card("ST-03", "Classic middle", line, true);
}

function keys(tickets) {
  if (tickets.length !== 2 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]).filter((leg) => /spread/.test(stat(leg)));
  if (legs.length !== 2) return null;
  const lines = legs.map(lineOf);
  const neg = lines.find((n) => n < 0);
  const pos = lines.find((n) => n > 0);
  if (neg == null || pos == null || Math.abs(pos - (Math.abs(neg) + 1)) > 0.01) return null;
  const key = Math.abs(neg) + 0.5;
  if (key !== 3 && key !== 7) return null;
  const prices = legs.map((leg) => american(leg.odds));
  const short = prices.some((n) => !n || n < -200);
  const line = short
    ? `Leave it. A win by ${key} cashes both sides, and both prices are shorter than −200.`
    : `Keep it. A win by ${key} cashes both sides.`;
  return card("ST-05", "Key-number middle", line, true);
}

function hook(tickets) {
  if (tickets.length !== 2 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]);
  if (!legs.every((leg) => /spread/.test(stat(leg)) && who(leg) === who(legs[0]))) return null;
  const lines = legs.map(lineOf).sort((a, b) => a - b);
  if (lines.some((n) => n == null) || Math.abs(lines[1] - lines[0] - 1) > 0.01) return null;
  const crossed = [3, 7].find((n) => (lines[0] < n && lines[1] > n) || (lines[0] < -n && lines[1] > -n));
  if (!crossed) return null;
  const prices = legs.map((leg) => tag(american(leg.odds))).filter(Boolean).join(" and ");
  return card("ST-09", "Buying the hook", `Keep it. The hook crosses ${crossed}${prices ? ` at ${prices}` : ""}.`, true);
}

function score(tickets) {
  if (tickets.length !== 2 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]);
  if (who(legs[0]) !== who(legs[1]) || !who(legs[0])) return null;
  const any = legs.find((leg) => td(leg));
  const first = legs.find((leg) => /first/.test(stat(leg)) && /td|touchdown/.test(stat(leg)));
  if (!any || !first) return null;
  const odds = american(any.odds);
  const stake = dollars(any.stake);
  const other = dollars(first.stake);
  if (!odds || !stake || !other) return card("ST-30", "First touchdown and anytime", "The anytime has to pay for the first-touchdown ticket when he scores later.", true);
  const profit = winOn(stake, odds);
  const line = profit + 0.05 >= other
    ? `Keep it. The anytime wins ${bucks(profit)}. That covers the ${bucks(other)} first-touchdown ticket when he scores later.`
    : `Leave it. The anytime wins ${bucks(profit)}. The first-touchdown ticket costs ${bucks(other)}.`;
  return card("ST-30", "First touchdown and anytime", line, true);
}

function pair(legs, read) {
  const rows = [];
  const same = legs.every((leg) => game(leg) && game(leg) === game(legs[0]));
  if (!same || legs.length < 2) return rows;
  const pass = legs.find((leg) => /pass/.test(stat(leg)) && /yard|\byds?\b/.test(stat(leg)) && sideOf(leg) === "over");
  const catcher = legs.find((leg) => /receiv|rec\b/.test(stat(leg)) && /yard|\byds?\b/.test(stat(leg)) && sideOf(leg) === "over");
  const sgp = /same game/i.test(String(read.kind || ""));
  if (pass && catcher) {
    rows.push(card("ST-27", "Correlated stack", sgp
      ? "Keep it. FanDuel priced the passing yards and the receiving yards as one game."
      : "Leave it. The parlay price multiplies the passing yards and the receiving yards as two games.", true));
  }
  const spread = legs.find((leg) => /spread/.test(stat(leg)));
  const total = legs.find((leg) => /total/.test(stat(leg)) && /over|under/.test(sideOf(leg)));
  if (spread && total) {
    const favorite = lineOf(spread) < 0;
    const under = sideOf(total) === "under";
    const agree = favorite ? under : !under;
    rows.push(card("ST-28", "Side and the total", agree
      ? `Keep it. ${favorite ? "A favorite and the under" : "A dog and the over"} are one script.`
      : `Leave it. ${favorite ? "A favorite and the over" : "A dog and the under"} need two different games.`, !rows.length));
  }
  const receiver = legs.find((leg) => /receiv/.test(stat(leg)) && sideOf(leg) === "over");
  const gameTotal = legs.find((leg) => /total/.test(stat(leg)));
  if (receiver && gameTotal && !pass) {
    const over = sideOf(gameTotal) === "over";
    rows.push(card("ST-29", "Player and the total", over
      ? "Keep it. The catches and the over need points."
      : "Leave it. The catches need points and the under needs the game to stay quiet.", !rows.length));
  }
  return rows;
}

function dutch(tickets) {
  if (tickets.length < 3 || tickets.some((rows) => rows.length !== 1)) return null;
  const legs = tickets.map((rows) => rows[0]);
  if (new Set(legs.map(stat)).size !== 1 || new Set(legs.map(who)).size !== legs.length) return null;
  const prices = legs.map((leg) => american(leg.odds));
  if (prices.some((n) => !n)) return null;
  const pct = Math.round(prices.reduce((sum, n) => sum + chance(n), 0) * 100);
  if (/first/.test(stat(legs[0])) && /td|touchdown/.test(stat(legs[0]))) {
    return card("ST-10", "Dutching", `Leave it. These ${legs.length} are ${pct}% of the first touchdown. The rest of the field loses all of them.`, true);
  }
  const line = pct >= 100
    ? `Leave it. The set is ${pct}%. A winner still loses money.`
    : `The set is ${pct}%. Any of them pays about the same.`;
  return card("ST-10", "Dutching", line, true);
}

function robin(tickets) {
  if (tickets.length !== 3 || tickets.some((rows) => rows.length !== 2)) return null;
  const names = tickets.flat().map((leg) => `${who(leg)}|${stat(leg)}|${lineOf(leg)}`);
  const counts = new Map();
  names.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
  if (counts.size !== 3 || [...counts.values()].some((n) => n !== 2)) return null;
  return card("ST-13", "Round robin", "Leave it. Three pairs means three juices. One miss still kills two of the three tickets.", true);
}

function teaser(read, legs) {
  if (!/teaser/i.test(String(read.kind || ""))) return null;
  const lines = legs.filter((leg) => /spread/.test(stat(leg))).map(lineOf).filter((n) => n != null);
  const wong = lines.length >= 2 && lines.every((n) => n >= 3.5) && lines.some((n) => n >= 7);
  return card(wong ? "ST-07" : "ST-06", wong ? "Wong teaser" : "Teaser", wong
    ? "Keep it. Both numbers land past 3 and 7."
    : "Leave it. A teaser that does not cross 3 and 7 gives the juice back.", true);
}

function plays(legs, price) {
  const odds = legs.map((leg) => american(leg.odds));
  if (odds.some((n) => !n)) return [];
  const probs = odds.map(chance);
  const games = legs.map(game);
  const split = games.every(Boolean) && new Set(games).size === legs.length;
  const n = legs.length;
  const shy = legs.some((leg) => /reception/.test(stat(leg)) && lineOf(leg) >= 4.5);
  const rows = [];
  const add = (id, name, fit) => { if (fit) rows.push(card(NOS[id], name, `Keep it. This matches ${NOS[id]}, ${name}.`, !rows.length)); };
  add("safe2", "Safe 2-leg, both 75%+", n === 2 && split && probs.every((c) => c >= 0.75));
  add("mid3", "3 legs, −250 to −400", n === 3 && split && band(odds, -400, -250));
  add("win4", "4 legs, −150 to −300", n === 4 && split && band(odds, -300, -150));
  add("plusLegs", "+100 to +200 legs", n === 2 && split && band(odds, 100, 200));
  const fav = odds.filter((o) => o >= -300 && o <= -120).length;
  const dog = odds.filter((o) => o >= 100 && o <= 220).length;
  add("mix21", "2 favorites and 1 underdog", n === 3 && split && fav === 2 && dog === 1);
  const spread = Math.max(...odds) - Math.min(...odds);
  add("low3", "Low-variance 3-leg", n === 3 && split && band(odds, -230, -170) && spread <= 60);
  add("yards3", "3 yardage legs near 80% each", n === 3 && split && legs.every(yard) && probs.every((c) => c >= 0.75 && c <= 0.85));
  const overs = legs.filter((leg) => sideOf(leg) === "over").length;
  const unders = legs.filter((leg) => sideOf(leg) === "under").length;
  add("ou4", "2 overs and 2 unders", n === 4 && split && overs === 2 && unders === 2 && band(odds, -220, -110));
  add("alt3", "Alt lines, 3 legs, 85%+", n === 3 && split && legs.every((leg) => /\+/.test(`${leg.line || ""} ${leg.market || ""}`)) && probs.every((c) => c >= 0.85));
  add("games4", "4 legs, 4 different games", n === 4 && split && band(odds, -280, -140));
  const nfl = legs.every((leg) => String(leg.sport || "").toUpperCase() === "NFL");
  add("td2", "2 NFL players, 1 anytime TD each", n === 2 && nfl && legs.every(td));
  add("td3", "3 NFL players, 1 anytime TD each", n === 3 && nfl && legs.every(td));
  add("chalk", "−400 to −700 legs, near −180", n >= 2 && n <= 4 && band(odds, -700, -400) && Number.isFinite(price) && Math.abs(price + 180) <= 40);
  add("four", "Four yardage legs near 85% each", n === 4 && legs.every(yard) && !shy && probs.every((c) => Math.abs(c - 0.85) <= 0.05));
  add("plus", "Four yardage legs near +250", n === 4 && legs.every(yard) && !shy && Number.isFinite(price) && Math.abs(price - 250) <= 40);
  add("five", "Five near 90% each", n === 5 && legs.every(yard) && !shy && probs.every((c) => Math.abs(c - 0.9) <= 0.08));
  add("hits", "Four near 80% each", n === 4 && legs.every(yard) && !shy && probs.every((c) => Math.abs(c - 0.8) <= 0.08));
  const won = Number.isFinite(price) ? Math.round(winOn(5, price) * 100) / 100 : NaN;
  [[5, "pay5", "A $5 bet wins $5"], [10, "pay10", "A $5 bet wins $10"], [15, "pay15", "A $5 bet wins $15"], [20, "pay20", "A $5 bet wins $20"], [25, "pay25", "A $5 bet wins $25"], [50, "pay50", "A $5 bet wins $50"]].forEach(([target, id, name]) => {
    add(id, name, n >= 2 && n <= 4 && Number.isFinite(won) && Math.abs(won - target) <= 1.25);
  });
  const days = legs.map((leg) => String(leg.when || "")).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const apart = days.length === n && new Set(days).size === n;
  [["weekThree", "3 legs, different days, near −200", 3, -200], ["weekFive", "5 legs, different days, near −200", 5, -200], ["weekSafe", "3 legs, different days, near −350", 3, -350], ["weekEven", "3 legs, different days, near −100", 3, -100]].forEach(([id, name, count, aim]) => {
    add(id, name, n === count && apart && Number.isFinite(price) && Math.abs(price - aim) <= 40);
  });
  if (rows.length) return rows;
  if (Number.isFinite(price) && price >= -150 && price <= 100 && split) return [card("S-01", "−150 to +100 window", `Keep it. The ticket is ${tag(price)}, inside the −150 to +100 window. $5 wins ${bucks(winOn(5, price))}.`, true)];
  if (Number.isFinite(price) && split) return [card("", "", `Leave it. The ticket is ${tag(price)}. $5 wins ${bucks(winOn(5, price))}. The night window is −150 to +100.`, true)];
  return [];
}

function shape(read, tickets) {
  const kind = String(read.kind || "").toLowerCase();
  if (/same game/.test(kind)) return "Same-game parlay";
  if (/teaser/.test(kind)) return "Teaser";
  if (/round/.test(kind)) return "Round robin";
  if (tickets.length > 1) return `A stack of ${tickets.length} tickets`;
  const legs = tickets[0] || [];
  if (legs.length <= 1) return "A single";
  if (legs.every((leg) => game(leg) && game(leg) === game(legs[0]))) return "Same-game parlay";
  return `A ${legs.length}-leg parlay`;
}

function plain(read, tickets, price) {
  const legs = tickets.length === 1 ? tickets[0] : [];
  if (legs.length === 1) {
    const leg = legs[0];
    const odds = american(leg.odds) || price;
    const stake = dollars(leg.stake) || dollars(read.stake);
    const what = td(leg) ? `${leg.player} anytime touchdown` : [leg.player, sideOf(leg) === "win" ? "to win" : sideOf(leg), lineOf(leg), leg.market].filter((bit) => bit != null && bit !== "").join(" ");
    const paid = winOn(stake, odds);
    return `${what} at ${tag(odds) || "the printed price"}.${stake && paid ? ` ${bucks(stake)} wins ${bucks(paid)}.` : ""}`;
  }
  if (Number.isFinite(price)) return `The ticket is ${tag(price)}. $5 wins ${bucks(winOn(5, price))}.`;
  return "The screenshot has the legs. The price was not printed.";
}

function judge(read) {
  const legs = (Array.isArray(read && read.legs) ? read.legs : []).filter((leg) => leg && (leg.player || leg.market));
  const tickets = buckets(legs);
  const quoted = american(read && read.odds);
  const one = tickets.length === 1 ? tickets[0] : [];
  const multiplied = one.length > 1 && one.every((leg) => american(leg.odds)) ? one.reduce((dec, leg) => {
    const odds = american(leg.odds);
    return dec * (odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds));
  }, 1) : null;
  const parlayPrice = quoted || (multiplied >= 2 ? Math.round((multiplied - 1) * 100) : multiplied ? Math.round(-100 / (multiplied - 1)) : null);
  const found = [];
  [ladder(tickets), unders(tickets), middle(tickets), keys(tickets), hook(tickets), score(tickets), dutch(tickets), robin(tickets), teaser(read || {}, legs)].forEach((row) => { if (row) found.push(row); });
  if (!found.some((row) => row.lead) && tickets.length > 1 && tickets.every((rows) => rows.length === 1)) found.push(...pair(tickets.map((rows) => rows[0]), read || {}));
  if (one.length > 1 && !/teaser/i.test(String((read && read.kind) || ""))) {
    const same = pair(one, read || {});
    const split = one.every((leg) => game(leg)) && new Set(one.map(game)).size === one.length;
    found.push(...same);
    if (split && !same.length) found.push(...plays(one, parlayPrice));
    if (!split && !same.length) found.push(card("", "", "Leave it. The legs are in one game. The parlay price multiplies them as separate games.", true));
  }
  const lead = found.find((row) => row.lead) || found[0];
  return {
    book: (read && read.book) || "",
    odds: (read && read.odds) || "",
    stake: (read && read.stake) || "",
    payout: (read && read.payout) || "",
    kind: shape(read || {}, tickets),
    verdict: (lead && lead.line) || plain(read || {}, tickets, parlayPrice),
    strategies: found.filter((row) => row.no).map(({ no, name, line }) => ({ no, name, line })),
    legs: legs.map((leg) => ({
      player: String(leg.player || ""), market: String(leg.market || ""), side: sideOf(leg), line: lineOf(leg),
      odds: tag(american(leg.odds)) || String(leg.odds || ""), stake: bucks(dollars(leg.stake)), match: String(leg.match || ""), ticket: Number(leg.ticket) || 1,
    })),
  };
}

async function howsPost(body) {
  const image = String((body && body.image) || "").split(",").pop();
  const blob = Buffer.from(image, "base64");
  const mime = blob[0] === 0x89 ? "image/png" : blob[0] === 0xff ? "image/jpeg" : blob[0] === 0x52 ? "image/webp" : "";
  if (!mime || blob.length < 32 || blob.length > 6 * 1024 * 1024) throw new Error("Paste a screenshot of the bet.");
  return judge(await readShot(image, mime, HOW));
}

module.exports = { howsPost, judge };
