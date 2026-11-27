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

function reachSay(way, side, prop) {
  const more = side === "Under" ? way !== "shorter" : way === "shorter";
  const word = more ? "more likely" : "less likely";
  if (!side && /td|goal/i.test(String(prop))) return `${word} to score`;
  if (/total/i.test(String(prop))) return `${word} to clear`;
  return `${word} to reach it`;
}

function treat(way, side, prop) {
  const bit = reachSay(way, side, prop);
  return /total/i.test(String(prop)) ? `They treat the total as ${bit}.` : `They treat the player as ${bit}.`;
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
      line = `${sport} prices first seen ${peak.when} move about ${pointWord(peak.points)} across ${peak.games} games.`;
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
  const readWay = conflict ? tripWay : trend.way;
  const money = cents ? ` At −110 that is about ${Math.abs(cents)} cents.` : "";
  let stay = "";
  if (hold.known >= 4) {
    stay = hold.held / hold.known > 0.5
      ? ` The close still had that read in ${hold.held} of ${hold.known} games with a later price.`
      : ` The close gave that read back in ${hold.known - hold.held} of ${hold.known} games with a later price.`;
  }
  const tripLine = trip ? ` From the first price to the close, ${trip.games} games treat it as ${reachSay(tripWay, trend.side, trend.prop)}, about ${pointWord(trip.points)}.` : "";
  let action = `Bet ${name} before that window. ${treat(readWay, trend.side, trend.prop)}`;
  if (conflict) action = `${tripWay === "shorter" ? `Bet ${name} early.` : `Wait on ${name}.`} ${treat(tripWay, trend.side, trend.prop)}`;
  else if (faded) action = `Leave ${name} alone. The window makes that read, and the close gives it back.`;
  else if (trend.way === "longer") action = `Wait on ${name}. ${treat(trend.way, trend.side, trend.prop)} The number gets better if you wait.`;
  else if (!stayed) action = `Bet ${name} before that window. ${treat(trend.way, trend.side, trend.prop)} The log does not have enough later prices to see the close.`;
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
    line: `${name}, ${trend.when}. ${treat(trend.way, trend.side, trend.prop)} ${trend.agree} of ${trend.games} games, about ${pointWord(trend.points)}.${money}${stay}${tripLine}`,
    path: pathOf(trips, trend, windows || []),
    sport: trend.sport,
    prop: trend.prop,
    side: trend.side,
    when: trend.when,
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

function clockKey(row) {
  return `${row.sport}|${row.prop}|${row.side}|${row.when || ""}|${row.way}`;
}

function sinceSay(at) {
  const time = Number(at);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function recordOf(past, clocks) {
  const spans = Array.isArray(past) ? past : [];
  const seen = new Map();
  spans.forEach((span) => {
    (span.clocks || []).forEach((row) => {
      const id = clockKey(row);
      const have = seen.get(id) || { n: 0, spans: 0, from: span.from };
      have.n += span.n || 1;
      have.spans += 1;
      if (span.from < have.from) have.from = span.from;
      seen.set(id, have);
    });
  });
  const lasted = [];
  const fresh = [];
  (clocks || []).forEach((row) => {
    const have = seen.get(clockKey(row));
    if (have) lasted.push({ row, have });
    else fresh.push(row);
  });
  return { lasted, fresh };
}

function recordSay(past, clocks) {
  const spans = Array.isArray(past) ? past : [];
  if (!spans.length) return ["This pass starts the record. A read becomes an edge when it comes back the same way on a later pass."];
  const passes = spans.reduce((sum, span) => sum + (span.n || 1), 0);
  const from = Math.min(...spans.map((span) => span.from));
  const { lasted, fresh } = recordOf(spans, clocks);
  const lines = [`${passes} ${passes === 1 ? "pass" : "passes"} on the record since ${sinceSay(from)} ET.`];
  lasted.forEach(({ row, have }) => {
    const stay = have.spans > 1
      ? `It has come back ${have.spans} times since ${sinceSay(have.from)} ET, across ${have.n} passes.`
      : `It has stayed through ${have.n} ${have.n === 1 ? "pass" : "passes"} since ${sinceSay(have.from)} ET.`;
    lines.push(`${row.title}. ${stay}`);
  });
  if (!lasted.length) lines.push("No earlier read is still here. These lines are new this pass.");
  else if (fresh.length) lines.push(`${fresh.length} ${fresh.length === 1 ? "line is" : "lines are"} new this pass.`);
  return lines;
}

function briefOf(looked, clocks, now, past) {
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
  const spans = Array.isArray(past) ? past : [];
  const record = recordOf(spans, clocks);
  const lasting = record.lasted.map((item) => item.row).filter((row) => !row.faded);
  const bet = (spans.length ? lasting : takes).filter((row) => row.way === "shorter" && row.held);
  const named = bet.length ? bet : (spans.length ? lasting.filter((row) => row.way === "shorter") : takes);
  const waitRows = spans.length ? lasting.filter((row) => row.way === "longer") : waits;
  const grouped = (list, lead) => {
    const bag = new Map();
    list.forEach((row) => {
      const bit = treat(row.way, row.side, row.prop);
      const rows = bag.get(bit) || [];
      rows.push(row);
      bag.set(bit, rows);
    });
    return [...bag.entries()].map(([bit, rows]) => `${lead} ${names(rows)}. ${bit}`).join(" ");
  };
  let second = "No clock is strong enough to bet ahead of.";
  if (!spans.length) second = "This pass starts the record. A read becomes an edge when it comes back the same way on a later pass.";
  else if (named.length || waitRows.length) {
    const sinceAt = Math.min(...record.lasted.filter((item) => !item.row.faded).map((item) => item.have.from));
    second = `${[named.length ? grouped(named, "Bet") : "", waitRows.length ? grouped(waitRows, "Wait on") : ""].filter(Boolean).join(" ")} That read has stayed since ${sinceSay(sinceAt)} ET.`;
  } else if (clocks.length) second = "No earlier read is still here. These lines are new this pass.";
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

function build({ steps, trips, trends, early, looked, near, windows, past }) {
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
  const spans = Array.isArray(past) ? past : [];
  const record = recordOf(spans, clocks);
  const lastedKeys = new Set(record.lasted.map((item) => clockKey(item.row)));
  if (spans.length) {
    clocks.forEach((row) => {
      const hit = record.lasted.find((item) => clockKey(item.row) === clockKey(row));
      if (!hit) {
        row.action = "New this pass. This read has to come back before it is an edge.";
        return;
      }
      const stay = hit.have.spans > 1
        ? `This read has come back ${hit.have.spans} times since ${sinceSay(hit.have.from)} ET.`
        : `This read has stayed through ${hit.have.n} ${hit.have.n === 1 ? "pass" : "passes"} since ${sinceSay(hit.have.from)} ET.`;
      row.action = `${row.action} ${stay}`;
    });
  }
  const liveKey = new Set(clocks.filter((row) => !row.faded && row.way === "shorter" && (!spans.length || lastedKeys.has(clockKey(row)))).map((row) => row.title.split(",")[0]));
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
    brief: briefOf(looked || {}, clocks, now, spans),
    now: now.slice(0, 8),
    waits,
    leaves,
    sports,
    lean,
    record: recordSay(spans, clocks),
    clocks,
    miss: near || "",
    read: "A pass runs about every 10 minutes. The top line uses reads that have stayed or come back on a later pass. A reprice counts at 1 point or more, before kickoff. A clock needs 4 games, 75 percent the same way, and two different dates when it is a weekday. The line says whether FanDuel treats the player as more or less likely to reach the prop. Gray means the close gave that read back. A point is one percentage point of the price.",
  };
}

module.exports = { build };
