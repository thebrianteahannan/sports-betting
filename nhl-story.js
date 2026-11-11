/** One NHL game script: how the game plays out, from each team's recent box scores and the game details. */

const { iceGroup } = require("./sport-boxes");

function n1(value) { return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "") : ""; }
function n0(value) { return Number.isFinite(value) ? String(Math.round(value)) : ""; }
function sv(value) { return Number.isFinite(value) ? value.toFixed(3).replace(/^0/, "") : ""; }
function last(name) { return String(name || "").split(" ").pop(); }
function the(name) { return `the ${last(name)}`; }
function The(name) { return `The ${last(name)}`; }
function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; }
function top(rows, n) { return rows.slice().sort((a, b) => b.w - a.w).slice(0, n); }
function odds(n) { return Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : ""; }

function favOf(game, boxes) {
  const s = game.spread || {}, home = Number(s.homeLine);
  const fav = Number.isFinite(home) && home !== 0 ? (home < 0 ? boxes.home : boxes.away) : null;
  return { fav, dog: fav ? (fav === boxes.home ? boxes.away : boxes.home) : null, price: fav ? Number(fav === boxes.home ? s.homeOdds : s.awayOdds) : NaN };
}

function gone(outs, side) { return new Set((outs[side] || []).filter((row) => /out|injured/.test(row.status)).map((row) => row.name)); }

function flow(game, boxes) {
  const out = [], { fav, dog, price } = favOf(game, boxes), { away, home } = boxes;
  if (fav && Number.isFinite(price)) out.push({ w: 2, text: `${The(fav.name)} are favored and ${odds(price)} to win by 2 or more. A late one-goal lead means ${the(dog.name)} pull their goalie, and the empty net is how a lot of one-goal games become two.`, brief: `${the(fav.name)} are favored` });
  const line = Number((game.total || {}).line);
  const form = (away.pts + home.allow) / 2 + (home.pts + away.allow) / 2;
  if (Number.isFinite(line) && Number.isFinite(form) && Math.abs(form - line) >= 0.6) out.push({ w: Math.abs(form - line) * 3, text: `Their recent games point to about ${n1(form)} goals: ${the(away.name)} score ${n1(away.pts)} and allow ${n1(away.allow)}, ${the(home.name)} score ${n1(home.pts)} and allow ${n1(home.allow)}. The total is ${line}, ${n1(Math.abs(form - line))} ${form > line ? "under" : "over"} that.`, brief: `the ${line} total sits ${n1(Math.abs(form - line))} ${form > line ? "under" : "over"} their recent scoring` });
  return out;
}

function shooters(team, outSet, group) {
  return Object.entries(team.players).filter(([name, row]) => !outSet.has(name) && row.games >= 3 && (!group || iceGroup(row.pos) === group)).sort((a, b) => (b[1].shots || 0) - (a[1].shots || 0));
}

function shots(boxes, outs) {
  const out = [], { away, home, base } = boxes;
  [[away, home, "away"], [home, away, "home"]].forEach(([team, foe, side]) => {
    const gap = foe.oppShots - base.oppShots, lead = shooters(team, gone(outs, side))[0];
    if (gap >= 2.5) out.push({ w: gap, text: `${The(foe.name)} allow ${n1(foe.oppShots)} shots a game, ${n1(gap)} over this sample.${lead ? ` ${lead[0]} leads ${the(team.name)} with ${n1(lead[1].shots)} a game, so his shot props get extra looks.` : ""}`, brief: `${the(foe.name)} give up ${n1(foe.oppShots)} shots a game` });
    else if (gap <= -2.5) out.push({ w: -gap, text: `${The(foe.name)} allow only ${n1(foe.oppShots)} shots a game, ${n1(-gap)} under this sample. Shot props on ${the(team.name)} have less room.`, brief: `${the(foe.name)} keep shots down (${n1(foe.oppShots)} allowed)` });
    if (team.shots >= base.shots + 3) out.push({ w: 2, text: `${The(team.name)} put up ${n1(team.shots)} shots a game, ${n1(team.shots - base.shots)} over this sample.`, brief: `${the(team.name)} shoot a lot (${n1(team.shots)} a game)` });
  });
  return out;
}

function power(boxes, outs) {
  const out = [], { away, home, base } = boxes;
  [[away, home, "away"], [home, away, "home"]].forEach(([team, foe, side]) => {
    const loose = foe.pen - base.pen, unit = Object.entries(team.players).filter(([name, row]) => !gone(outs, side).has(name) && row.games >= 3).sort((a, b) => (b[1].pptoi || 0) - (a[1].pptoi || 0)).slice(0, 2).map(([name]) => name);
    if (loose >= 0.6) out.push({ w: 2 + loose * 2, text: `${The(foe.name)} give up ${n1(foe.pen)} power plays a game, ${n1(loose)} over this sample. ${The(team.name)} score on ${Math.round((team.pp || 0) * 100)}% of theirs.${unit.length ? ` ${unit.join(" and ")} get the most power-play time, which helps their points.` : ""}`, brief: `${the(foe.name)} take penalties (${n1(foe.pen)} power plays allowed)` });
    if (Number.isFinite(team.pp) && Number.isFinite(foe.pk) && team.pp >= base.pp + 0.06 && foe.pk <= base.pk - 0.04) out.push({ w: 3, text: `${The(team.name)} power play scores ${Math.round(team.pp * 100)}% of the time, and ${the(foe.name)} kill only ${Math.round(foe.pk * 100)}% of penalties.`, brief: `${the(team.name)} power play meets a weak penalty kill` });
  });
  return out;
}

function goalies(boxes) {
  const out = [];
  [[boxes.away, boxes.home], [boxes.home, boxes.away]].forEach(([team, foe]) => {
    const list = team.goalies || [], one = list[0], starts = list.reduce((s, g) => s + g.starts, 0);
    if (!one || !starts) return;
    const tired = Number.isFinite(team.rest) && team.rest < 1.5;
    if (tired) out.push({ w: 4, text: `${The(team.name)} played yesterday. On the second night of a back-to-back the backup usually starts${list[1] ? `: ${list[1].name} has ${list[1].starts} of the last ${starts} starts (${sv(list[1].pct)})` : ""}.`, brief: `${the(team.name)} are on a back-to-back, so their backup likely starts` });
    else if (one.starts / starts < 0.7 && list[1]) out.push({ w: 2, text: `${The(team.name)} have split the net: ${one.name} ${one.starts} starts (${sv(one.pct)}), ${list[1].name} ${list[1].starts} (${sv(list[1].pct)}).` });
    if (Number.isFinite(one.pct) && one.pct <= 0.885 && one.starts >= 3) out.push({ w: 2.5, text: `${one.name} has stopped ${sv(one.pct)} of shots in his last ${one.starts} starts. ${The(foe.name)} shooters have a softer target.`, brief: `${one.name} has been leaky (${sv(one.pct)})` });
    else if (Number.isFinite(one.pct) && one.pct >= 0.925 && one.starts >= 3) out.push({ w: 2.5, text: `${one.name} has stopped ${sv(one.pct)} of shots in his last ${one.starts} starts. Goals are harder to find for ${the(foe.name)}.`, brief: `${one.name} is hot (${sv(one.pct)})` });
  });
  return out;
}

function matchups(boxes, outs) {
  const out = [], { away, home, base, meet } = boxes;
  [[away, home, "away"], [home, away, "home"]].forEach(([team, foe, side]) => {
    ["F", "D"].forEach((group) => {
      const slot = foe.slots[group], mid = base.slots[group];
      if (!slot || !mid || !Number.isFinite(slot.shots)) return;
      const gap = slot.shots - mid.shots, need = group === "F" ? 2 : 1.2, label = group === "F" ? "forwards" : "defensemen";
      const pick = shooters(team, gone(outs, side), group)[0];
      if (!pick || pick[1].shots < 2) return;
      const [name, row] = pick;
      const seen = meet.map((box) => (box.teams.find((t) => t.id === team.id) || { people: [] }).people.find((p) => p.name === name)).filter(Boolean);
      const hist = seen.length >= 2 ? ` In ${seen.length} recent meetings he had ${seen.map((p) => p.shots).join(", ")} shots.` : "";
      if (gap >= need) out.push({ w: gap / need * 2.5, edge: true, text: `${name} has the matchup. ${The(foe.name)} give up ${n1(slot.shots)} shots a game to ${label}, against ${n1(mid.shots)} in this sample. He averages ${n1(row.shots)} shots in ${n1(row.toi)} minutes.${hist}`, say: `Watch ${name}: ${the(foe.name)} give up ${n1(slot.shots)} shots a game to ${label}, ${n1(gap)} more than usual.` });
      else if (gap <= -need) out.push({ w: -gap / need * 2, text: `${name} has the hard draw. ${The(foe.name)} hold ${label} to ${n1(slot.shots)} shots a game, against ${n1(mid.shots)} in this sample. He averages ${n1(row.shots)}.${hist}`, say: `${name} has a tough draw: ${the(foe.name)} hold ${label} to ${n1(slot.shots)} shots a game.` });
    });
  });
  return out;
}

function missing(boxes, outs) {
  const out = [];
  [["away", boxes.away], ["home", boxes.home]].forEach(([side, team]) => {
    (outs[side] || []).filter((row) => /out|injured/.test(row.status)).forEach((row) => {
      const was = team.players[row.name];
      if (!was || was.toi < 15) return;
      const next = row.next && team.players[row.next];
      out.push({ w: was.toi / 6 + (was.pptoi || 0), text: `${row.name} is out, ${n1(was.toi)} minutes a night${was.pptoi >= 2 ? ` with ${n1(was.pptoi)} on the power play` : ""}.${row.next ? ` ${row.next} is next${next ? ` and plays ${n1(next.toi)} minutes now` : ""}, so his ice time goes up.` : ""}`, brief: `${row.name} is out${row.next ? `, so ${row.next} gets his minutes` : ""}` });
    });
  });
  return out;
}

function history(boxes, game, extra) {
  const out = [], meet = boxes.meet;
  if (meet.length) {
    const margins = meet.map((box) => Math.abs(box.teams[0].pts - box.teams[1].pts));
    const list = meet.map((box) => { const win = box.teams[0].pts >= box.teams[1].pts ? box.teams[0] : box.teams[1], lose = win === box.teams[0] ? box.teams[1] : box.teams[0]; return `${last(win.name)} ${win.pts}-${lose.pts}`; }).join(", ");
    const one = margins.filter((m) => m <= 1).length;
    out.push({ w: 2, text: `Last ${meet.length} meetings: ${list}. ${one} of ${meet.length} were decided by one goal.` });
    const line = Number((game.total || {}).line), goals = meet.reduce((sum, box) => sum + box.teams[0].pts + box.teams[1].pts, 0) / meet.length;
    if (Number.isFinite(line) && Math.abs(goals - line) >= 1) out.push({ w: 1.5, text: `Those meetings averaged ${n1(goals)} goals. The total is ${line}.` });
  }
  if (extra.coach) out.push({ w: 0.5, text: extra.coach });
  return out;
}

function plays(groups, game, boxes) {
  const { fav, price } = favOf(game, boxes), meet = boxes.meet, n = meet.length;
  const one = meet.filter((box) => Math.abs(box.teams[0].pts - box.teams[1].pts) <= 1).length;
  const past = n >= 2 && one * 2 >= n ? `, and ${one} of their last ${n} meetings were one-goal games` : "";
  const first = !fav ? `This is a toss-up${past}.` : Number.isFinite(price) && price <= 130 ? `${The(fav.name)} are heavy favorites, ${odds(price)} to win by 2${past}.` : `${The(fav.name)} are favored${past}.`;
  const style = top([...(groups.Shots || []), ...(groups["Power play"] || []), ...(groups.Goalies || [])].filter((row) => row.brief), 2).map((row) => row.brief);
  const head = (text) => (text.match(/^the \S+ (?=[a-z])/) || [""])[0];
  const second = !style.length ? "" : style.length > 1 && head(style[0]) && head(style[0]) === head(style[1]) ? `${cap(style[0])} and ${style[1].slice(head(style[1]).length)}.` : `${cap(style.join(", while "))}.`;
  const watch = top((groups.Matchups || []).filter((row) => row.edge), 1)[0] || top((groups.Matchups || []).filter((row) => row.say), 1)[0];
  const gone = top(groups["Who's out"] || [], 1)[0];
  return [first, second, watch ? watch.say : gone ? gone.text.split(/(?<=\.)\s/)[0] : ""].filter(Boolean);
}

function tellNhl(game, boxes, extra = {}) {
  const outs = extra.outs || { away: [], home: [] };
  const groups = { "Game flow": flow(game, boxes), "Matchups": matchups(boxes, outs), "Shots": shots(boxes, outs), "Power play": power(boxes, outs), "Goalies": goalies(boxes), "Who's out": missing(boxes, outs), "History": history(boxes, game, extra) };
  const sections = Object.entries(groups).map(([title, rows]) => ({ title, lines: top(rows, 4).map((row) => row.text) })).filter((row) => row.lines.length);
  const watch = top((groups.Matchups || []).filter((row) => row.say), 2).map((row) => ({ name: (row.say.match(/^(?:Watch )?([^:]+?)(?::| has)/) || [])[1] || "", edge: !!row.edge }));
  return { plays: plays(groups, game, boxes), sections, watch };
}

module.exports = { tellNhl };
