/** One NBA game script: how the game plays out, from the box scores, the game details, and the minutes split. */

const { gameBoxes, group } = require("./game-boxes");
const { gameRead } = require("./game-read");
const MEM = new Map();
const KEEP = 20 * 60 * 1000;

function n1(value) { return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "") : ""; }
function last(name) { return String(name || "").split(" ").pop(); }
function the(name) { return `the ${last(name)}`; }
function The(name) { return `The ${last(name)}`; }

function sectionOf(read, name) { return ((read && read.sections) || []).find((row) => row.name === name) || null; }

function colFor(section, team) {
  const tail = last(team).toLowerCase();
  return ((section && section.cols) || []).find((col) => String(col.title || "").toLowerCase().includes(tail)) || null;
}

function fiveOf(read, team) {
  const col = colFor(sectionOf(read, "Starting five"), team);
  return ((col && col.lines) || []).map((line) => {
    const hit = String(line).match(/^(.+?), (PG|SG|SF|PF|C)(?::\s*(.*))?$/);
    return hit ? { name: hit[1], spot: hit[2], group: hit[2] === "C" ? "C" : /G/.test(hit[2]) ? "G" : "F" } : null;
  }).filter(Boolean);
}

function outsOf(read, team) {
  const col = colFor(sectionOf(read, "Who's out"), team);
  return ((col && col.lines) || []).map((line) => {
    const hit = String(line).match(/^(.+?), ([A-Z]{1,2}), (out|doubtful|questionable|injured reserve)(?: \((.+)\))?$/);
    return hit ? { name: hit[1], pos: hit[2], group: group(hit[2]), status: hit[3], next: hit[4] || "" } : null;
  }).filter(Boolean);
}

function restOf(read, team) {
  const col = colFor(sectionOf(read, "Matchup"), team);
  const line = ((col && col.lines) || []).find((text) => /since the last game/.test(text)) || "";
  return Number((line.match(/(\d+) days? since/) || [])[1]);
}

function favOf(game, boxes) {
  const home = Number((game.spread || {}).homeLine);
  const fav = Number.isFinite(home) && home !== 0 ? (home < 0 ? boxes.home : boxes.away) : null;
  return { fav, dog: fav ? (fav === boxes.home ? boxes.away : boxes.home) : null };
}

function tempo(boxes, game) {
  const out = [], { away, home, base, meet } = boxes;
  const fast = away.pace >= home.pace ? away : home, slow = fast === away ? home : away, gap = fast.pace - slow.pace;
  const { fav, dog } = favOf(game, boxes);
  if (gap >= 1.5) out.push({ w: gap, text: `${The(fast.name)} play at ${n1(fast.pace)} trips a game and ${the(slow.name)} at ${n1(slow.pace)}. The slower team usually sets it, so ${the(fast.name)} props get fewer chances than their average says.`, brief: `${the(fast.name)} want to run (${n1(fast.pace)} trips) and ${the(slow.name)} walk it up (${n1(slow.pace)})` });
  else if (away.pace >= base.pace + 1.5 && home.pace >= base.pace + 1.5) out.push({ w: 3, text: `Both teams run, ${n1(away.pace)} and ${n1(home.pace)} trips against ${n1(base.pace)} in this sample. Extra trips mean extra shots for every counting stat.`, brief: "Both teams run, so the counting stats get extra trips" });
  else if (away.pace <= base.pace - 1.5 && home.pace <= base.pace - 1.5) out.push({ w: 3, text: `Both teams walk it up, ${n1(away.pace)} and ${n1(home.pace)} trips against ${n1(base.pace)} in this sample. The overs need efficiency, not volume.`, brief: "Both teams walk it up, so the overs need efficiency" });
  if (fav && dog && dog.pace > fav.pace + 1) out.push({ w: 2, text: `If ${the(dog.name)} fall behind, they already play faster (${n1(dog.pace)}), so chasing speeds the game up. A ${last(fav.name)} lead lets them walk it up at ${n1(fav.pace)}.`, brief: `a ${last(dog.name)} deficit speeds it up` });
  [[away, home], [home, away]].forEach(([team, foe]) => {
    if (team.fast >= base.fast + 2 && foe.oppFast >= base.oppFast + 2) out.push({ w: 2.5, text: `${The(team.name)} score ${n1(team.fast)} on the break, and ${the(foe.name)} give up ${n1(foe.oppFast)}. Turnovers turn into easy points.`, brief: `${the(team.name)} get out in transition` });
  });
  if (meet.length >= 2) {
    const pace = meet.reduce((sum, box) => sum + box.poss, 0) / meet.length, mid = (away.pace + home.pace) / 2;
    if (Math.abs(pace - mid) >= 2) out.push({ w: Math.abs(pace - mid), text: `Their last ${meet.length} meetings ran at ${n1(pace)} trips, ${pace < mid ? "slower" : "faster"} than the ${n1(mid)} these two average now. When they meet, the game ${pace < mid ? "slows down" : "speeds up"}.`, brief: `their meetings ${pace < mid ? "slow" : "speed"} to ${n1(pace)} trips` });
  }
  return out;
}

function shots(boxes) {
  const out = [], { away, home, base } = boxes;
  [[away, home], [home, away]].forEach(([team, foe]) => {
    const three = team.three * 100, mid = base.three * 100;
    if (three >= mid + 2.5 && foe.oppTpa <= base.oppTpa - 2) out.push({ w: 3.5, text: `${The(team.name)} take ${n1(three)}% of their shots from three. ${The(foe.name)} hold opponents to ${n1(foe.oppTpa)} threes a game, ${n1(base.oppTpa - foe.oppTpa)} under this sample. Either ${the(team.name)} get their threes or they have to go inside, and their three-point props ride on which one wins.`, brief: `${the(team.name)} live on threes (${n1(three)}% of their shots) and ${the(foe.name)} take them away` });
    else if (three >= mid + 2.5 && foe.oppTpa >= base.oppTpa + 2) out.push({ w: 3, text: `${The(team.name)} take ${n1(three)}% of their shots from three, and ${the(foe.name)} let opponents take ${n1(foe.oppTpa)}. The threes are there.`, brief: `${the(team.name)} get their threes` });
    if (foe.oppPaint >= base.oppPaint + 4) out.push({ w: (foe.oppPaint - base.oppPaint) / 2, text: `${The(foe.name)} give up ${n1(foe.oppPaint)} in the paint, ${n1(foe.oppPaint - base.oppPaint)} over this sample. ${The(team.name)} score ${n1(team.paint)} there${team.paint >= base.paint ? ", so the inside points have a path" : ", so getting downhill is the adjustment to watch"}.`, brief: `${the(foe.name)} give up ${n1(foe.oppPaint)} in the paint` });
    else if (foe.oppPaint <= base.oppPaint - 4 && team.paint >= base.paint) out.push({ w: 2, text: `${The(team.name)} score ${n1(team.paint)} in the paint, but ${the(foe.name)} give up only ${n1(foe.oppPaint)} there. The inside points are harder to find.`, brief: `${the(foe.name)} wall off the paint (${n1(foe.oppPaint)} allowed)` });
  });
  return out;
}

function fouls(boxes, fives) {
  const out = [], { away, home, base } = boxes;
  [[away, home, fives.away], [home, away, fives.home]].forEach(([team, foe, five]) => {
    const loose = foe.oppFta - base.oppFta;
    if (loose >= 2) out.push({ w: loose, text: `${The(foe.name)} send opponents to the line ${n1(foe.oppFta)} times a game, ${n1(loose)} over this sample. ${The(team.name)} shoot ${n1(team.fta)}.`, brief: `${the(foe.name)} foul (${n1(foe.oppFta)} free throws allowed)` });
    if (loose < 1 && loose > -2) return;
    five.map((one) => ({ one, row: team.players[one.name] })).filter(({ row }) => row && row.fta >= 6).forEach(({ one, row }) => {
      out.push(loose >= 1
        ? { w: 2 + loose / 2, text: `${one.name} gets ${n1(row.fta)} free throws a game, and ${the(foe.name)} allow ${n1(foe.oppFta)}, ${n1(loose)} over this sample. His points have a floor at the line.`, brief: `${last(one.name)}'s free throws give his points a floor` }
        : { w: 1.5 - loose / 2, text: `${one.name} gets ${n1(row.fta)} free throws a game, but ${the(foe.name)} allow only ${n1(foe.oppFta)}, ${n1(-loose)} under this sample. His trips to the line are harder to come by.`, brief: `${the(foe.name)} keep ${last(one.name)} off the line` });
    });
  });
  return out;
}

function mismatches(boxes, fives, outs) {
  const out = [], { away, home, base, meet } = boxes;
  [[away, home, fives.away, outs.home], [home, away, fives.home, outs.away]].forEach(([team, foe, five, gone]) => {
    five.forEach((one) => {
      const slot = foe.slots[one.group], mid = base.slots[one.group];
      if (!slot || !mid || !Number.isFinite(slot.pts) || slot.n < 5) return;
      const gap = slot.pts - mid.pts, board = slot.reb - mid.reb;
      const hole = gone.find((row) => row.group === one.group && /out|injured/.test(row.status) && (foe.players[row.name] || {}).min >= 24);
      const label = { G: "guards", F: "forwards", C: "centers" }[one.group];
      const row = team.players[one.name] || {};
      const vs = meet.map((box) => (box.teams.find((side) => side.id === team.id) || { people: [] }).people.find((p) => p.name === one.name)).filter((p) => p && p.min > 0);
      const seen = vs.length ? vs.reduce((sum, p) => sum + p.pts, 0) / vs.length : NaN;
      const hist = vs.length >= 2 ? ` In ${vs.length} recent meetings he scored ${vs.map((p) => p.pts).join(", ")}${Number.isFinite(row.pts) ? `, against his ${n1(row.pts)} now` : ""}.` : "";
      if (gap >= 2.5 || board >= 1.5 || (hole && gap > -1)) {
        out.push({ w: Math.max(gap, board * 1.5) + (hole ? 3 : 0), text: `${one.name} has the matchup. Starting ${label} score ${n1(slot.pts)} and grab ${n1(slot.reb)} against ${the(foe.name)}, against ${n1(mid.pts)} and ${n1(mid.reb)} in this sample.${hole ? ` ${hole.name} is out, so ${hole.next || "a backup"} guards him.` : ""}${hist} A big night has a path.`, edge: true, say: `Watch ${one.name}: ${the(foe.name)} give up ${n1(slot.pts)} points a night to starting ${label}${gap > 0.5 ? `, ${n1(gap)} more than usual` : ""}${hole ? `, and ${hole.name} is out` : ""}.` });
      } else if (gap <= -2.5) {
        const beat = Number.isFinite(seen) && vs.length >= 2 && Number.isFinite(row.pts) && seen >= row.pts + 3;
        out.push({ w: beat ? 1 : -gap, text: `${one.name} has the hard draw. Starting ${label} score ${n1(slot.pts)} against ${the(foe.name)}, against ${n1(mid.pts)} in this sample.${hist}${beat ? " He has beaten this team anyway." : ""}`, say: beat ? `${one.name} draws a tough defense, but he has averaged ${n1(seen)} against ${the(foe.name)} lately.` : `${one.name} has a tough draw: ${the(foe.name)} hold starting ${label} to ${n1(slot.pts)} points a night.` });
      } else if (vs.length >= 3 && Number.isFinite(row.pts) && Math.abs(seen - row.pts) >= 5) {
        out.push({ w: Math.min(3, Math.abs(seen - row.pts) / 3), text: `${one.name} against ${the(foe.name)}: ${n1(seen)} a game in ${vs.length} recent meetings (${vs.map((p) => p.pts).join(", ")}), against his ${n1(row.pts)} now.`, say: `Watch ${one.name}: ${n1(seen)} a game against ${the(foe.name)} lately, versus ${n1(row.pts)} this season.` });
      }
    });
  });
  return out;
}

function minutes(read, boxes, outs) {
  const out = [];
  [boxes.away, boxes.home].forEach((team) => {
    (team === boxes.away ? outs.away : outs.home).filter((row) => /out|injured/.test(row.status)).forEach((row) => {
      const was = team.players[row.name], next = row.next && team.players[row.next];
      if (!was || was.min < 20) return;
      out.push({ w: was.min / 8, text: `${row.name} is out, ${n1(was.min)} minutes a game.${row.next ? ` ${row.next} is next at his spot${next ? ` and plays ${n1(next.min)} now` : ""}${next && next.min < 24 ? ", so his props carry more minutes" : ""}.` : ""}`, brief: `${row.name} is out${row.next && next && next.min < 24 ? `, so ${row.next} gets his minutes` : ""}` });
    });
    if (restOf(read, team.name) === 1) out.push({ w: 2, text: `${The(team.name)} played last night. On the second night of a back-to-back, a lopsided game is when the stars sit.`, brief: `${the(team.name)} are on a back-to-back` });
  });
  return out;
}

function history(read, boxes, game) {
  const out = [], meet = boxes.meet;
  const coach = (((sectionOf(read, "Coaches") || {}).lines) || [])[0];
  if (meet.length) {
    const margins = meet.map((box) => Math.abs(box.teams[0].pts - box.teams[1].pts));
    const list = meet.map((box) => { const win = box.teams[0].pts > box.teams[1].pts ? box.teams[0] : box.teams[1], lose = win === box.teams[0] ? box.teams[1] : box.teams[0]; return `${last(win.name)} ${win.pts}-${lose.pts}`; }).join(", ");
    const close = margins.filter((m) => m <= 5).length, blown = margins.filter((m) => m >= 15).length;
    const why = close * 2 >= meet.length ? " These two keep it close, which keeps the starters on the floor late." : blown * 2 >= meet.length ? " These two have gotten away from each other, which is when the starters sit." : "";
    out.push({ w: 2, text: `Last ${meet.length} meetings: ${list}. ${close} of ${meet.length} finished within 5.${why}`, brief: close * 2 >= meet.length ? `${close} of their last ${meet.length} meetings finished within 5` : blown * 2 >= meet.length ? `${blown} of their last ${meet.length} meetings got away by 15` : "" });
    const line = Number(game.total && game.total.line);
    if (Number.isFinite(line)) {
      const avg = meet.reduce((sum, box) => sum + box.teams[0].pts + box.teams[1].pts, 0) / meet.length;
      if (Math.abs(avg - line) >= 6) out.push({ w: 1.5, text: `Those meetings averaged ${n1(avg)} points. Tonight's total is ${line}, so the book expects a ${avg < line ? "looser" : "tighter"} game than their history.` });
    }
  }
  if (coach) out.push({ w: 0.5, text: coach });
  return out;
}

function top(rows, n) { return rows.slice().sort((a, b) => b.w - a.w).slice(0, n); }
function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; }

function plays(groups, game, boxes) {
  const { away, home, base, meet } = boxes, { fav } = favOf(game, boxes), spread = Math.abs(Number((game.spread || {}).homeLine));
  const margins = meet.map((box) => Math.abs(box.teams[0].pts - box.teams[1].pts)), n = meet.length;
  const close = margins.filter((m) => m <= 5).length, blown = margins.filter((m) => m >= 15).length;
  const tight = !fav || spread <= 3.5;
  const past = n >= 2 && close * 2 >= n ? `${tight ? "and" : "though"} ${close} of their last ${n} meetings were within 5 points` : n >= 2 && blown * 2 >= n ? `${tight ? "though" : "and"} ${blown} of their last ${n} meetings were blowouts` : "";
  const first = !fav ? `This is a pick'em${past ? `, ${past}` : ""}.` : spread <= 3.5 ? `This should be close: ${the(fav.name)} are only ${spread}-point favorites${past ? `, ${past}` : ""}.` : spread < 9 ? `${The(fav.name)} are ${spread}-point favorites${past ? `, ${past}` : ""}.` : `${The(fav.name)} are ${spread}-point favorites, so this can get away early and send the starters to the bench${past ? `, ${past}` : ""}.`;
  const fast = away.pace >= home.pace ? away : home, slow = fast === away ? home : away;
  const mid = (away.pace + home.pace) / 2, met = n >= 2 ? meet.reduce((sum, box) => sum + box.poss, 0) / n : NaN, drift = met - mid;
  let pace = fast.pace - slow.pace >= 1.5 ? `${the(fast.name)} want to run and ${the(slow.name)} want to slow it down` : away.pace >= base.pace + 1.5 && home.pace >= base.pace + 1.5 ? "both teams like to run, so there are extra possessions to go around" : away.pace <= base.pace - 1.5 && home.pace <= base.pace - 1.5 ? "both teams like to grind it out, so possessions are scarce" : "";
  if (Math.abs(drift) >= 2) pace = pace ? `${pace}, but their meetings run ${drift < 0 ? "slow" : "fast"}` : `their meetings run ${drift < 0 ? "slower" : "faster"} than either team usually plays`;
  let style = "";
  [[away, home], [home, away]].forEach(([team, foe]) => {
    if (style) return;
    const three = team.three - base.three >= 0.025;
    if (three && foe.oppTpa <= base.oppTpa - 2) style = `${the(team.name)} live on the three, but ${the(foe.name)} are good at taking it away${foe.oppPaint >= base.oppPaint + 4 ? " and give up plenty inside" : ""}`;
    else if (three && foe.oppTpa >= base.oppTpa + 2) style = `${the(team.name)} live on the three, and ${the(foe.name)} give up plenty of them`;
  });
  if (!style) [[away, home], [home, away]].forEach(([team, foe]) => { if (!style && foe.oppPaint >= base.oppPaint + 4) style = `${the(foe.name)} give up a lot of points in the paint`; });
  const second = pace && style ? (pace.length + style.length > 150 ? `${cap(pace)}. ${cap(style)}.` : `${cap(pace)}, while ${style}.`) : pace || style ? `${cap(pace || style)}.` : "";
  const watch = top((groups.Mismatches || []).filter((row) => row.edge), 1)[0] || top((groups.Mismatches || []).filter((row) => row.say), 1)[0];
  const gone = top(groups.Minutes || [], 1)[0];
  return [first, second, watch ? watch.say : gone ? gone.text.split(/(?<=\.)\s/)[0] : ""].filter(Boolean);
}

async function build(body, board) {
  const game = ((board && board.games) || []).find((row) => row.match === body.match && row.kickoff === body.kickoff);
  if (game && (game.sport === "NFL" || game.sport === "NHL")) return require("./sport-story").buildSport(game, board, body.props);
  if (!game || game.sport !== "NBA") return { sections: [] };
  const [boxes, read] = await Promise.all([
    gameBoxes(game.awayName, game.homeName).catch(() => null),
    gameRead({ match: game.match, kickoff: game.kickoff, sport: game.sport, espnId: game.espnId || "", noLead: true }, board).catch(() => null),
  ]);
  if (!boxes) return { sections: [] };
  const fives = { away: fiveOf(read, boxes.away.name), home: fiveOf(read, boxes.home.name) };
  const outs = { away: outsOf(read, boxes.away.name), home: outsOf(read, boxes.home.name) };
  const story = tell(game, boxes, read, fives, outs);
  try { story.bets = require("./script-bets").scriptBets(game, boxes, fives, outs, body.props); } catch (error) { console.error("script bets failed:", error); }
  return story;
}

function tell(game, boxes, read, fives, outs) {
  const groups = { "Mismatches": mismatches(boxes, fives, outs), "Tempo": tempo(boxes, game), "Threes and the paint": shots(boxes), "Fouls and free throws": fouls(boxes, fives), "Minutes": minutes(read, boxes, outs), "History": history(read, boxes, game) };
  const sections = Object.entries(groups).map(([title, rows]) => ({ title, lines: top(rows, 4).map((row) => row.text) })).filter((row) => row.lines.length);
  const watch = top((groups.Mismatches || []).filter((row) => row.say), 2).map((row) => ({ name: (row.say.match(/^(?:Watch )?([^:]+?)(?::| draws| has)/) || [])[1] || "", edge: !!row.edge }));
  return { plays: plays(groups, game, boxes), sections, watch };
}

function gameStory(body, board) {
  const key = `${body.match}|${body.kickoff}`, count = Array.isArray(body.props) ? body.props.length : 0;
  const kept = Date.now() >= Date.parse(body.kickoff || "") && require("./live-recs").recStory(body.match, body.kickoff);
  if (kept) return Promise.resolve({ ...kept, pregame: true });
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < KEEP && count <= hit.count) return hit.promise;
  const promise = build(body, board).then((data) => { if (!data.sections.length) MEM.delete(key); if (data.bets) require("./live-recs").recRecord(body.match, body.kickoff, data); return data; }).catch(() => { MEM.delete(key); return { sections: [] }; });
  MEM.set(key, { at: Date.now(), promise, count });
  return promise;
}

module.exports = { gameStory, tell };
