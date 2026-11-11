/** Props and parlays that follow the NBA game script: who the script likes, which posted over his last 10 clear, and 1 to 4 leg tickets from them. */

const STATS = {
  points: ["pts"], rebounds: ["reb"], assists: ["ast"], threes: ["tpm"], "made threes": ["tpm"],
  "pts + reb": ["pts", "reb"], "pts + ast": ["pts", "ast"], "pts + reb + ast": ["pts", "reb", "ast"], "reb + ast": ["reb", "ast"],
};
const WORDS = { points: "points", rebounds: "rebounds", assists: "assists", threes: "threes", "made threes": "threes", "pts + reb": "points + rebounds", "pts + ast": "points + assists", "pts + reb + ast": "points + rebounds + assists", "reb + ast": "rebounds + assists" };
const KINDS = "Points|Rebounds|Assists|Made Threes|Threes|Pts \\+ Reb \\+ Ast|Pts \\+ Reb|Pts \\+ Ast|Reb \\+ Ast";

function n1(value) { return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "") : ""; }
function last(name) { return String(name || "").split(" ").pop(); }
function fold(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
function dec(odds) { const o = Number(odds); return o > 0 ? 1 + o / 100 : 1 + 100 / -o; }
function american(value) { return value >= 2 ? Math.round((value - 1) * 100) : -Math.round(100 / (value - 1)); }
function pct(value) { return `${(Math.round(value * 1000) / 10).toFixed(1)}%`; }

function readProp(row) {
  const market = String(row.market || ""), label = String(row.label || "");
  let hit = market.match(new RegExp(`^(\\d+)\\+ (${KINDS})$`, "i"));
  if (hit) { const stat = hit[2].toLowerCase(); return { need: Number(hit[1]), stat, text: `${hit[1]}+ ${WORDS[stat]}` }; }
  hit = market.match(new RegExp(` - (${KINDS})$`, "i"));
  const over = label.match(/ Over (\d+(?:\.\d+)?)/);
  if (hit && over) { const stat = hit[1].toLowerCase(); return { need: Math.floor(Number(over[1])) + 1, stat, text: `Over ${over[1]} ${WORDS[stat]}` }; }
  return null;
}

function reasons(team, foe, base, one, outs, both) {
  const out = [], slot = foe.slots[one.group] || {}, mid = base.slots[one.group] || {}, row = team.players[one.name] || {};
  const label = { G: "guards", F: "forwards", C: "centers" }[one.group] || "starters";
  const loose = foe.oppFta - base.oppFta, hard = [];
  if (one.starter && slot.n >= 5) [["pts", 1.5, "points"], ["reb", 0.7, "rebounds"], ["ast", 0.5, "assists"]].forEach(([key, step, word]) => {
    const gap = slot[key] - mid[key];
    if (!Number.isFinite(gap)) return;
    if (gap <= -step) hard.push(key);
    else if (gap >= step) out.push({ uses: key, w: gap / step, text: `The ${last(foe.name)} allow ${n1(slot[key])} ${word} a night to starting ${label}, ${n1(gap)} more than usual.` });
  });
  const threes = foe.oppTpa - base.oppTpa, paint = foe.oppPaint - base.oppPaint;
  if (threes <= -2) hard.push("tpm");
  else if (threes >= 2) out.push({ uses: "tpm", w: threes / 1.5, text: `The ${last(foe.name)} let opponents take ${n1(foe.oppTpa)} threes a game, ${n1(threes)} more than usual.` });
  if (paint >= 4 && one.group !== "G") out.push({ uses: "pts", w: paint / 3, text: `The ${last(foe.name)} give up ${n1(foe.oppPaint)} points in the paint, ${n1(paint)} more than usual.` });
  if (row.fta >= 6 && loose >= 1) out.push({ uses: "pts", w: 2 + loose / 2, text: `He gets ${n1(row.fta)} free throws a game and the ${last(foe.name)} allow ${n1(loose)} more than usual. His points have a floor.` });
  const gone = outs.find((item) => item.next === one.name && /out|injured/.test(item.status) && (team.players[item.name] || {}).min >= 20);
  if (gone) out.push({ uses: "", w: 3, text: `${gone.name} is out, and his ${n1(team.players[gone.name].min)} minutes go to ${last(one.name)}.` });
  if (both) out.push({ uses: "", w: 1, text: "Both teams run, so every counting stat gets extra trips." });
  return { hard, list: out.sort((a, b) => b.w - a.w) };
}

function goodProps(rows, log, read, loose) {
  const found = [];
  rows.forEach(({ prop, odds, label, market }) => {
    const keys = STATS[prop.stat];
    if (!keys || !Number.isFinite(Number(odds)) || odds < -500 || odds > 250) return;
    if (keys.some((key) => read.hard.includes(key))) return;
    const why = read.list.find((item) => !item.uses || keys.includes(item.uses));
    const sums = log.map((game) => keys.reduce((sum, key) => sum + (Number(game[key]) || 0), 0)), hits = sums.filter((value) => value >= prop.need).length;
    const chance = (hits + 0.5) / (log.length + 1), need = 1 / dec(odds), edge = chance - need;
    if (hits / log.length < (loose ? 0.55 : 0.6) || edge < (loose ? 0 : 0.02)) return;
    const score = edge + 0.25 * chance + (why ? 0.1 + Math.min(why.w, 4) * 0.02 : 0);
    found.push({ text: prop.text, stat: prop.stat, reach: prop.need, avg: sums.reduce((a, b) => a + b, 0) / sums.length, odds: Number(odds), label, market, hits, n: log.length, chance, need, edge, score, why: why ? why.text : "" });
  });
  return found.sort((a, b) => b.score - a.score);
}

function sign(odds) { return odds > 0 ? `+${odds}` : String(odds); }

function howPick(pick) {
  const rate = pick.hits / pick.n;
  return `He averages ${n1(pick.avg)} ${WORDS[pick.stat]} over his last ${pick.n} games and reached ${pick.reach} in ${pick.hits} of them (${Math.round(rate * 100)}%). At ${sign(pick.odds)} the bet needs ${pct(pick.need)}, so his record clears the price by ${n1((rate - pick.need) * 100)} percentage points.${pick.why ? ` The script backs it: ${pick.why}` : ""}`;
}

function howTicket(legs, kind, teams) {
  const name = (pick) => last(pick.who), rec = (pick) => `${name(pick)} ${pick.hits} of ${pick.n}`;
  const edged = legs.filter((pick) => pick.why).length;
  const edge = edged ? ` ${edged === legs.length ? "Every leg" : `${edged} of the ${legs.length} legs`} also ${edged === legs.length || edged === 1 ? "has" : "have"} a matchup edge from the script.` : "";
  if (legs.length === 1) return `Of the ${legs[0].team} props, ${name(legs[0])}'s record beats its price by the most: ${legs[0].hits} of ${legs[0].n} against the ${pct(legs[0].need)} the price needs.${legs[0].why ? " The script backs it too." : ""}`;
  if (kind === "both") return `${name(legs[0])} has the most reliable ${legs[0].team} prop and ${name(legs[1])} the most reliable ${legs[1].team} prop${legs.length > 2 ? `, then ${legs.slice(2).map(rec).join(" and ")} add the next best records from either side` : ""}. Every leg's record clears its own break-even.${edge}`;
  return `The ${legs.length} ${teams} props with the best hit records: ${legs.map(rec).join(", ")}. Every leg's record clears its own break-even.${edge}`;
}

function ticket(legs) {
  const price = legs.reduce((sum, leg) => sum * dec(leg.odds), 1);
  return { odds: american(price), wins: Math.round(5 * (price - 1) * 100) / 100, need: pct(1 / price) };
}

function scriptBets(game, boxes, fives, outs, props) {
  if (!boxes || !Array.isArray(props) || !props.length) return null;
  const { away, home, base } = boxes;
  const both = away.pace >= base.pace + 1.5 && home.pace >= base.pace + 1.5;
  const byWho = new Map();
  props.forEach((row) => { const prop = readProp(row); if (!prop || !row.who) return; const key = fold(row.who); if (!byWho.has(key)) byWho.set(key, []); byWho.get(key).push({ prop, odds: Number(row.odds), label: row.label, market: row.market }); });
  const picks = [];
  [[away, home, fives.away, outs.away], [home, away, fives.home, outs.home]].forEach(([team, foe, five, gone]) => {
    const starters = new Set(five.map((one) => one.name));
    Object.entries(team.players).forEach(([name, row]) => {
      if (row.games < 6 || row.min < 20 || gone.some((item) => item.name === name && /out|doubtful|injured/.test(item.status))) return;
      const rows = byWho.get(fold(name));
      if (!rows) return;
      const one = five.find((item) => item.name === name) || { name, group: /C/.test(row.pos || "") ? "C" : /G/.test(row.pos || "") ? "G" : "F" };
      one.starter = starters.has(name);
      const read = reasons(team, foe, base, one, gone, both);
      const tag = { who: name, team: last(team.name), pos: one.spot || row.pos || "" };
      const strict = goodProps(rows, row.log || [], read, false).map((prop) => ({ ...tag, ...prop }));
      const loose = goodProps(rows, row.log || [], read, true).map((prop) => ({ ...tag, ...prop }));
      if (strict.length || loose.length) picks.push({ team: tag.team, strict, loose });
    });
  });
  const rank = (a, b) => (b.why ? 1 : 0) - (a.why ? 1 : 0) || b.score - a.score;
  const sure = (rows) => rows.slice().sort((a, b) => b.chance - a.chance);
  const teams = [away, home].map((team) => {
    const mine = picks.filter((pick) => pick.team === last(team.name));
    let rows = mine.filter((pick) => pick.strict.length).map((pick) => pick.strict[0]).sort(rank);
    if (rows.length < 4) rows = rows.concat(mine.filter((pick) => !pick.strict.length).map((pick) => pick.loose[0]).sort(rank));
    if (rows.length < 4) mine.forEach((pick) => { const first = pick.strict[0] || pick.loose[0], more = (pick.strict.length > 1 ? pick.strict : pick.loose).find((prop) => prop.stat !== first.stat && !STATS[prop.stat].some((key) => STATS[first.stat].includes(key))); if (more && rows.length < 4) rows.push(more); });
    return rows.slice(0, 5);
  });
  const top = teams.flat();
  if (!top.length) return null;
  const build = (legs, kind, teamName) => ({ size: legs.length, legs: legs.map((pick) => top.indexOf(pick)), how: howTicket(legs, kind, teamName), ...ticket(legs) });
  const groups = teams.map((rows, side) => {
    if (!rows.length) return null;
    const single = rows.slice().sort((a, b) => (b.chance - b.need) - (a.chance - a.need))[0], teamName = last([away, home][side].name);
    return { name: teamName, parlays: [1, 2, 3, 4].filter((size) => size <= rows.length).map((size) => build(size === 1 ? [single] : sure(rows).slice(0, size), "team", teamName)) };
  }).filter(Boolean);
  if (teams[0].length && teams[1].length) {
    const lead = [sure(teams[0])[0], sure(teams[1])[0]], rest = sure(top).filter((pick) => !lead.includes(pick));
    groups.push({ name: "Both teams", parlays: [2, 3, 4].filter((size) => size <= top.length).map((size) => build(lead.concat(rest.slice(0, size - 2)), "both")) });
  }
  return { picks: top.map(({ chance, score, edge, avg, reach, ...rest }) => ({ ...rest, how: howPick({ ...rest, avg, reach }), need: pct(rest.need) })), groups };
}

module.exports = { scriptBets, readProp };
