/** Turns the price-log pass into the actions, the open-to-close trips, and the clocks for the PDF. */

const SHORT = ["1h", "1-3h", "3-6h", "6-12h", "1d", "2d", "week"];

function implied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function american(p) {
  if (!(p > 0) || p >= 1) return null;
  const raw = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
  return Math.round(raw);
}

function priceText(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function pointWord(n) {
  const v = Math.abs(Math.round(n * 10) / 10);
  return `${v} point${v === 1 ? "" : "s"}`;
}

function spoken(prop, side, sport) {
  let name = prop === "Anytime TD" ? "anytime TDs" : String(prop || "").toLowerCase();
  if (sport === "NHL" && prop === "Anytime TD") name = "anytime goals";
  name = name.replace(/\btds\b/g, "TDs");
  return side ? `${side.toLowerCase()} ${name}` : name;
}

function median(list) {
  if (!list.length) return 0;
  const sorted = list.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function byGame(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const list = map.get(row.gameId) || [];
    list.push(row);
    map.set(row.gameId, list);
  });
  return [...map.values()].map((list) => median(list.map((row) => row.points)));
}

function cell(rows) {
  const mids = byGame(rows);
  if (mids.length < 4) return null;
  const points = Math.round(median(mids) * 10) / 10;
  const shorter = mids.filter((mid) => mid >= 0.5).length;
  const longer = mids.filter((mid) => mid <= -0.5).length;
  return { games: mids.length, points, shorter, longer };
}

function rowsFor(steps, trend) {
  return steps.filter((step) => {
    if (step.sport !== trend.sport || step.prop !== trend.prop || step.side !== trend.side) return false;
    if (trend.kind === "kick") return step.hours >= trend.lo && step.hours < trend.hi;
    if (String(trend.id || "").startsWith("h-")) return step.weekday === trend.weekday && step.hour === trend.start;
    return step.weekday === trend.weekday && step.hour >= trend.start && step.hour < trend.end;
  });
}

function holdOf(rows, way) {
  const map = new Map();
  rows.forEach((row) => {
    const list = map.get(row.gameId) || [];
    list.push(row);
    map.set(row.gameId, list);
  });
  let known = 0;
  let held = 0;
  map.forEach((list) => {
    const first = list.slice().sort((a, b) => a.at - b.at)[0];
    if (!first || first.close == null || Number(first.close) === Number(first.odds)) return;
    const from = implied(first.before);
    const to = implied(first.close);
    if (!(from > 0) || !(to > 0)) return;
    known += 1;
    const move = Math.round((to - from) * 1000) / 10;
    if (way === "shorter" ? move >= 0.5 : move <= -0.5) held += 1;
  });
  return { known, held };
}

function centsOf(odds, points) {
  const p = implied(odds);
  const next = p ? american(p + points / 100) : null;
  if (next == null) return 0;
  return next - Number(odds);
}

function tripRead(trips, trend) {
  const rows = trips.filter((row) => row.sport === trend.sport && row.prop === trend.prop && row.side === trend.side && (trend.kind !== "kick" || (row.hours >= trend.lo && row.hours < trend.hi)));
  const found = cell(rows);
  if (!found || Math.abs(found.points) < 0.5) return null;
  const agree = found.points > 0 ? found.shorter : found.longer;
  if (agree < 4 || agree / found.games < 0.75) return null;
  return found;
}

function shape(trips, windows) {
  const sports = [...new Set(trips.map((row) => row.sport))];
  return sports.map((sport) => {
    const mine = trips.filter((row) => row.sport === sport);
    const bars = windows.map(([lo, hi], index) => {
      const found = cell(mine.filter((row) => row.hours >= lo && row.hours < hi));
      return { label: SHORT[index] || "", when: windows[index][2], games: found ? found.games : 0, points: found ? found.points : 0 };
    });
    const peak = bars.reduce((best, bar) => (Math.abs(bar.points) > Math.abs(best.points) ? bar : best), bars[0]);
    let line = "";
    if (peak && peak.games >= 4 && Math.abs(peak.points) >= 0.5) {
      const way = peak.points > 0 ? "shorter" : "longer";
      line = `${sport} prices first seen ${peak.when} finish ${way}, about ${pointWord(peak.points)} across ${peak.games} games.`;
    } else if (bars.some((bar) => bar.games >= 4)) line = `${sport} does not lean one way from the first price to the close. The edge is in the single props.`;
    return { sport, bars, line };
  }).filter((row) => row.bars.some((bar) => bar.games >= 4)).sort((a, b) => {
    const peak = (row) => Math.max(...row.bars.map((bar) => Math.abs(bar.points)));
    return peak(b) - peak(a);
  });
}

function pathOf(trips, trend, windows) {
  return windows.map(([lo, hi], index) => {
    const found = cell(trips.filter((row) => row.sport === trend.sport && row.prop === trend.prop && row.side === trend.side && row.hours >= lo && row.hours < hi));
    return { label: SHORT[index] || "", games: found ? found.games : 0, points: found ? found.points : 0 };
  });
}

function clockOf(trend, steps, trips, windows) {
  const name = `${trend.sport} ${spoken(trend.prop, trend.side, trend.sport)}`;
  const rows = rowsFor(steps, trend);
  const hold = holdOf(rows, trend.way);
  const trip = tripRead(trips, trend);
  const tripWay = trip && trip.points > 0 ? "shorter" : "longer";
  const conflict = !!(trip && tripWay !== trend.way);
  const stayed = hold.known >= 4 && hold.held / hold.known > 0.5;
  const faded = !conflict && hold.known >= 4 && !stayed;
  const edge = trip ? trip.points : (trend.way === "shorter" ? Math.abs(trend.points) : -Math.abs(trend.points));
  const cents = centsOf(-110, edge);
  const money = cents ? ` At −110 that is about ${Math.abs(cents)} cents ${cents < 0 ? "shorter" : "longer"}.` : "";
  let stay = "";
  if (hold.known >= 4) {
    stay = hold.held / hold.known > 0.5
      ? ` The close stayed ${trend.way} in ${hold.held} of ${hold.known} games with a later price.`
      : ` The close gave the move back in ${hold.known - hold.held} of ${hold.known} games with a later price.`;
  }
  const tripLine = trip ? ` From the first price to the close, ${trip.games} games finish ${tripWay}, about ${pointWord(trip.points)}.` : "";
  let action = `Bet ${name} before that window.`;
  if (conflict) action = tripWay === "shorter" ? `Bet ${name} early. The window moves the other way, and the close is what pays.` : `Wait on ${name}. The window moves, and the close goes longer.`;
  else if (faded) action = `Leave ${name} alone. The window moves and the close gives it back.`;
  else if (trend.way === "longer") action = `Wait on ${name}. Waiting pays more on these.`;
  else if (!stayed) action = `Bet ${name} before that window. The log does not have enough later prices to see the close.`;
  return {
    title: `${name}, ${trend.when}`,
    way: conflict ? tripWay : trend.way,
    agree: trend.agree,
    games: trend.games,
    points: trend.points,
    faded,
    held: stayed,
    conflict,
    action,
    line: `${name} move ${trend.way} ${trend.when}. ${trend.agree} of ${trend.games} games, about ${pointWord(trend.points)}.${money}${stay}${tripLine}`,
    path: pathOf(trips, trend, windows || []),
    sport: trend.sport,
    prop: trend.prop,
    side: trend.side,
  };
}

function names(list) {
  const seen = [];
  list.forEach((row) => {
    const name = `${row.sport} ${spoken(row.prop, row.side, row.sport)}`;
    if (!seen.includes(name)) seen.push(name);
  });
  if (seen.length === 1) return seen[0];
  if (seen.length === 2) return `${seen[0]} and ${seen[1]}`;
  if (seen.length <= 4) return `${seen.slice(0, -1).join(", ")}, and ${seen[seen.length - 1]}`;
  return `${seen.slice(0, 3).join(", ")}, and ${seen.length - 3} more`;
}

function briefOf(looked, clocks, now) {
  const count = (n) => Number(n || 0).toLocaleString("en-US");
  const live = clocks.filter((row) => !row.faded);
  const proven = live.filter((row) => row.held);
  const takes = live.filter((row) => row.way === "shorter");
  const waits = live.filter((row) => row.way === "longer");
  const sized = (proven.length ? proven : live).map((row) => Math.abs(row.points)).sort((a, b) => a - b);
  const span = !sized.length ? "" : sized[0] === sized[sized.length - 1] ? `about ${pointWord(sized[0])}` : `about ${sized[0]} to ${pointWord(sized[sized.length - 1])}`;
  const first = span
    ? `${count(looked.steps)} reprices across ${count(looked.games)} games. The clocks that ${proven.length ? "hold" : "repeat"} move the price ${span}.`
    : `${count(looked.steps)} reprices across ${count(looked.games)} games. Nothing has landed on the same clock yet.`;
  const bet = takes.filter((row) => row.held);
  const named = bet.length ? bet : takes;
  let second = "No clock is strong enough to bet ahead of.";
  if (named.length && waits.length) second = `Bet ${names(named)} before the window. Wait on ${names(waits)}.`;
  else if (named.length) second = `Bet ${names(named)} before the window.`;
  else if (waits.length) second = `Wait on ${names(waits)}. The price gets longer into that window.`;
  else if (clocks.length) second = "Those windows move and the close gives them back.";
  let third = "No open price is still ahead of its clock.";
  if (now.length > 1) third = `${now.length} prices are still ahead of the clock. ${now[0]}`;
  else if (now[0]) third = now[0];
  else if (clocks.length && !live.length) third = "Leave those clocks alone.";
  return [first, second, third];
}

function kickSay(kickoff) {
  const at = Date.parse(kickoff || "");
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function build({ steps, trips, trends, early, looked, near, windows }) {
  const boards = windows || [];
  const empty = ["The price log is still filling in.", "The next pass looks for a clock.", "No open price is still ahead of its clock."];
  if (!steps || !steps.length) return { brief: empty, now: [], waits: [], leaves: [], sports: [], clocks: [], miss: near || "", read: "" };
  const clocks = (trends || []).map((trend) => clockOf(trend, steps, trips || [], boards)).filter((row) => row.line);
  clocks.sort((a, b) => Number(a.faded) - Number(b.faded) || Number(a.way !== "shorter") - Number(b.way !== "shorter") || Number(b.held) - Number(a.held) || Math.abs(b.points) - Math.abs(a.points));
  const sports = shape(trips || [], boards);
  const flat = sports.filter((row) => /does not lean/.test(row.line));
  let lean = "";
  if (sports.length && flat.length === sports.length) {
    const list = sports.map((row) => row.sport);
    const who = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
    lean = `${who} ${list.length === 1 ? "does" : "do"} not lean one way from the first price to the close. The edge is in the single props.`;
    sports.forEach((row) => { row.line = ""; });
  }
  const liveKey = new Set(clocks.filter((row) => !row.faded && row.way === "shorter").map((row) => row.title.split(",")[0]));
  const now = [];
  (early || []).forEach((row) => {
    const name = `${row.sport} ${spoken(row.prop, row.side, row.sport)}`;
    if (row.prop && !liveKey.has(name)) return;
    const price = priceText(row.odds);
    const when = kickSay(row.kickoff);
    now.push(`Take ${row.label}${price ? ` at ${price}` : ""}.${when ? ` Kickoff is ${when} ET.` : ""}`);
  });
  const waits = clocks.filter((row) => !row.faded && row.way === "longer").map((row) => row.action);
  const leaves = clocks.filter((row) => row.faded).map((row) => row.action);
  return {
    brief: briefOf(looked || {}, clocks, now),
    now: now.slice(0, 8),
    waits,
    leaves,
    sports,
    lean,
    clocks,
    miss: near || "",
    read: "A reprice counts at 1 point or more, before kickoff. A clock needs 4 games, 75 percent the same way, and two different dates when it is a weekday. Green gets shorter. Red gets longer. Gray moved, then the close gave it back. A point is one percentage point of the price.",
  };
}

module.exports = { build };
