/** One NFL game script: how the game plays out, from each team's recent box scores and the game details. */

function n1(value) { return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "") : ""; }
function n0(value) { return Number.isFinite(value) ? String(Math.round(value)) : ""; }
function last(name) { return String(name || "").split(" ").pop(); }
function the(name) { return `the ${last(name)}`; }
function The(name) { return `The ${last(name)}`; }
function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; }
function top(rows, n) { return rows.slice().sort((a, b) => b.w - a.w).slice(0, n); }
function pct(x) { return `${Math.round(x * 100)}%`; }
function both(list) {
  if (list.length < 2) return list[0] || "";
  const head = (text) => (text.match(/^the \S+ (?=[a-z])/) || [""])[0];
  return head(list[0]) && head(list[0]) === head(list[1]) ? `${list[0]} and ${list[1].slice(head(list[1]).length)}` : `${list[0]}, while ${list[1]}`;
}

function favOf(game, boxes) {
  const home = Number((game.spread || {}).homeLine);
  const fav = Number.isFinite(home) && home !== 0 ? (home < 0 ? boxes.home : boxes.away) : null;
  return { fav, dog: fav ? (fav === boxes.home ? boxes.away : boxes.home) : null, spread: Math.abs(home) };
}

function gone(outs, team) { return new Set((outs[team] || []).filter((row) => /out|injured/.test(row.status)).map((row) => row.name)); }

function lead(team, key, outSet) {
  return Object.entries(team.players).filter(([name, row]) => !outSet.has(name) && row.games >= 2).sort((a, b) => (b[1][key] || 0) - (a[1][key] || 0))[0] || null;
}

function flow(game, boxes, extra) {
  const out = [], { fav, dog, spread } = favOf(game, boxes), { away, home } = boxes;
  if (fav && spread >= 6.5) {
    out.push({ w: spread / 2, text: `${The(fav.name)} are ${spread}-point favorites. With a lead they lean on the run: ${n1(fav.rushAtt)} carries a game, and ${the(dog.name)} allow ${n0(dog.oppRushYds)} rushing yards. ${The(dog.name)} would be throwing to catch up, which feeds their passing and receiving yards, not their rushing.`, brief: `a ${last(fav.name)} lead turns this into their run game and ${the(dog.name)} throwing` });
  } else if (!fav || spread <= 3) {
    out.push({ w: 2, text: `${fav ? `A ${spread}-point line` : "A pick'em"}. Neither team should have to leave its plan, so both run their usual mix: ${the(away.name)} throw on ${pct(away.passRate)} of plays and ${the(home.name)} on ${pct(home.passRate)}.`, brief: "neither team should have to leave its plan" });
  }
  const line = Number((game.total || {}).line);
  const form = (away.pts + home.allow) / 2 + (home.pts + away.allow) / 2;
  const sky = String(extra.weather || ""), wind = Number((sky.match(/wind (\d+) mph/i) || [])[1]), temp = Number((sky.match(/(-?\d+) degrees/i) || [])[1]), wet = Number((sky.match(/(\d+)% chance/i) || [])[1]);
  const rough = [wind >= 15 && `wind ${wind} mph`, temp <= 32 && `${temp} degrees`, wet >= 50 && `a ${wet}% chance of rain or snow`].filter(Boolean);
  if (rough.length && !/indoor|dome/i.test(sky)) out.push({ w: 2 + rough.length, text: `The forecast has ${rough.join(", ")}. That cuts into deep passing and kicking, and pushes both teams toward the run.`, brief: `the weather (${rough.join(", ")}) pushes both teams toward the run` });
  if (Number.isFinite(line) && Number.isFinite(form) && Math.abs(form - line) >= 4) out.push({ w: Math.abs(form - line) / 2, text: `Their recent games point to about ${n0(form)} points: ${the(away.name)} score ${n1(away.pts)} and allow ${n1(away.allow)}, ${the(home.name)} score ${n1(home.pts)} and allow ${n1(home.allow)}. The total is ${line}, ${n1(Math.abs(form - line))} ${form > line ? "under" : "over"} that.`, brief: `the ${line} total sits ${n1(Math.abs(form - line))} ${form > line ? "under" : "over"} their recent scoring` });
  return out;
}

function pace(boxes) {
  const out = [], { away, home, base } = boxes;
  if (away.plays >= base.plays + 3 && home.plays >= base.plays + 3) out.push({ w: 3, text: `Both offenses run a lot of plays, ${n1(away.plays)} and ${n1(home.plays)} a game against ${n1(base.plays)} in this sample. More snaps mean more chances for every yardage prop.`, brief: "both offenses run a lot of plays" });
  else if (away.plays <= base.plays - 3 && home.plays <= base.plays - 3) out.push({ w: 3, text: `Both offenses run few plays, ${n1(away.plays)} and ${n1(home.plays)} a game against ${n1(base.plays)} in this sample. The overs need big plays, not volume.`, brief: "both offenses run few plays" });
  const fast = away.plays >= home.plays ? away : home, slow = fast === away ? home : away;
  if (fast.plays - slow.plays >= 5) out.push({ w: (fast.plays - slow.plays) / 2, text: `${The(fast.name)} run ${n1(fast.plays)} plays a game and ${the(slow.name)} ${n1(slow.plays)}. ${The(slow.name)} hold the ball ${n1(slow.top)} minutes a game, which takes snaps away from ${the(fast.name)}.`, brief: `${the(fast.name)} play fast (${n1(fast.plays)} plays) and ${the(slow.name)} slow (${n1(slow.plays)})` });
  return out;
}

function passRun(boxes, outs) {
  const out = [], { away, home, base } = boxes;
  [[away, home, "away"], [home, away, "home"]].forEach(([team, foe, side]) => {
    const qb = lead(team, "passAtt", gone(outs, side)), back = lead(team, "rushAtt", gone(outs, side));
    const pass = foe.oppPassYds - base.oppPassYds, rush = foe.oppRushYds - base.oppRushYds;
    if (pass >= 25) out.push({ w: pass / 10, text: `${The(foe.name)} allow ${n0(foe.oppPassYds)} passing yards a game, ${n0(pass)} over this sample.${qb ? ` ${qb[0]} throws for ${n0(qb[1].passYds)} a game, so his yards have room.` : ""}`, brief: `${the(foe.name)} give up ${n0(foe.oppPassYds)} passing yards a game` });
    else if (pass <= -25) out.push({ w: -pass / 12, text: `${The(foe.name)} allow only ${n0(foe.oppPassYds)} passing yards a game, ${n0(-pass)} under this sample.${qb ? ` ${qb[0]} throws for ${n0(qb[1].passYds)} a game; this is a harder day to get there.` : ""}`, brief: `${the(foe.name)} shut down the pass (${n0(foe.oppPassYds)} allowed)` });
    if (rush >= 20) out.push({ w: rush / 8, player: back && back[0], bare: `${The(foe.name)} allow ${n0(foe.oppRushYds)} rushing yards a game, ${n0(rush)} over this sample.`, text: `${The(foe.name)} allow ${n0(foe.oppRushYds)} rushing yards a game, ${n0(rush)} over this sample.${back ? ` ${back[0]} gets ${n1(back[1].rushAtt)} carries for ${n0(back[1].rushYds)} yards.` : ""}`, brief: `${the(foe.name)} give up ${n0(foe.oppRushYds)} rushing yards a game` });
    else if (rush <= -20) out.push({ w: -rush / 10, player: back && back[0], bare: `${The(foe.name)} allow only ${n0(foe.oppRushYds)} rushing yards a game, ${n0(-rush)} under this sample.`, text: `${The(foe.name)} allow only ${n0(foe.oppRushYds)} rushing yards a game, ${n0(-rush)} under this sample.${back ? ` ${back[0]} averages ${n0(back[1].rushYds)}; the ground is harder here.` : ""}`, brief: `${the(foe.name)} stop the run (${n0(foe.oppRushYds)} allowed)` });
    if (foe.sacks >= base.sacks + 0.8 && team.sacked >= base.sacked) out.push({ w: 2 + foe.sacks - base.sacks, text: `${The(foe.name)} get ${n1(foe.sacks)} sacks a game, and ${the(team.name)} give up ${n1(team.sacked)}. Pressure cuts into ${qb ? `${qb[0]}'s` : "the"} passing yards.`, brief: `${the(foe.name)} pass rush meets a line that gives up sacks` });
    if (team.to >= base.to + 0.6 && foe.takes >= base.takes + 0.4) out.push({ w: 2, text: `${The(team.name)} turn it over ${n1(team.to)} times a game, and ${the(foe.name)} take it away ${n1(foe.takes)} times. Short fields help ${the(foe.name)} score.`, brief: `${the(team.name)} give the ball away` });
  });
  return out;
}

function matchups(boxes, outs) {
  const out = [], { away, home, base, meet } = boxes;
  const label = { WR: "wide receivers", TE: "tight ends", RB: "running backs" }, edge = { WR: 20, TE: 12, RB: 20 };
  [[away, home, "away"], [home, away, "home"]].forEach(([team, foe, side]) => {
    const outSet = gone(outs, side);
    ["WR", "TE", "RB"].forEach((key) => {
      const slot = foe.slots[key], mid = base.slots[key];
      if (!slot || !mid || slot.n < 3) return;
      const field = key === "RB" ? "rushYds" : "recYds", use = key === "RB" ? "rushAtt" : "tgt";
      const gap = slot[field] - mid[field];
      const pick = Object.entries(team.players).filter(([name, row]) => row.pos === key && !outSet.has(name) && row.games >= 2).sort((a, b) => (b[1][use] || 0) - (a[1][use] || 0))[0];
      if (!pick || (pick[1][use] || 0) < (key === "RB" ? 8 : 4)) return;
      const [name, row] = pick, kind = key === "RB" ? "rushing" : "receiving";
      const seen = meet.map((box) => (box.teams.find((t) => t.id === team.id) || { people: [] }).people.find((p) => p.name === name)).filter(Boolean);
      const hist = seen.length >= 2 ? ` In ${seen.length} recent meetings he had ${seen.map((p) => p[field]).join(", ")} ${kind} yards.` : "";
      const usual = key === "RB" ? `He gets ${n1(row.rushAtt)} carries for ${n0(row.rushYds)} yards.` : `He averages ${n0(row.recYds)} yards on ${n1(row.tgt)} targets.`;
      if (gap >= edge[key]) out.push({ w: gap / edge[key] * 2.5, edge: true, text: `${name} has the matchup. ${The(foe.name)} give up ${n0(slot[field])} ${kind} yards a game to ${label[key]}, against ${n0(mid[field])} in this sample. ${usual}${hist}`, say: `Watch ${name}: ${the(foe.name)} give up ${n0(slot[field])} ${kind} yards a game to ${label[key]}, ${n0(gap)} more than usual.` });
      else if (gap <= -edge[key]) out.push({ w: -gap / edge[key] * 2, text: `${name} has the hard draw. ${The(foe.name)} hold ${label[key]} to ${n0(slot[field])} ${kind} yards a game, against ${n0(mid[field])} in this sample. ${usual}${hist}`, say: `${name} has a tough draw: ${the(foe.name)} hold ${label[key]} to ${n0(slot[field])} ${kind} yards a game.` });
    });
  });
  return out;
}

function missing(boxes, outs) {
  const out = [];
  [["away", boxes.away], ["home", boxes.home]].forEach(([side, team]) => {
    (outs[side] || []).filter((row) => /out|injured/.test(row.status)).forEach((row) => {
      const was = team.players[row.name];
      if (!was) return;
      const load = was.passAtt >= 15 ? `${n1(was.passAtt)} throws` : was.tgt >= 4 ? `${n1(was.tgt)} targets` : was.rushAtt >= 8 ? `${n1(was.rushAtt)} carries` : "";
      if (!load) return;
      const next = row.next && team.players[row.next];
      const nextLoad = next ? (was.passAtt >= 15 ? `${n1(next.passAtt)} throws` : was.tgt >= 4 ? `${n1(next.tgt)} targets` : `${n1(next.rushAtt)} carries`) : "";
      out.push({ w: (was.passAtt >= 15 ? 6 : 2) + (was.tgt || 0) / 3 + (was.rushAtt || 0) / 6, text: `${row.name} is out, ${load} a game.${row.next ? ` ${row.next} is next at his spot${nextLoad ? ` and has ${nextLoad} a game now` : ""}.` : ""}`, brief: `${row.name} is out${row.next ? `, so ${row.next} steps in` : ""}` });
    });
    if (Number.isFinite(team.rest) && team.rest <= 5) out.push({ w: 1.5, text: `${The(team.name)} are on a short week, ${n0(team.rest)} days after their last game.`, brief: `${the(team.name)} are on a short week` });
    else if (Number.isFinite(team.rest) && team.rest >= 12) out.push({ w: 1, text: `${The(team.name)} come off a bye, ${n0(team.rest)} days since their last game.` });
  });
  return out;
}

function history(boxes, game, extra) {
  const out = [], meet = boxes.meet;
  if (meet.length) {
    const margins = meet.map((box) => Math.abs(box.teams[0].pts - box.teams[1].pts));
    const list = meet.map((box) => { const win = box.teams[0].pts >= box.teams[1].pts ? box.teams[0] : box.teams[1], lose = win === box.teams[0] ? box.teams[1] : box.teams[0]; return `${last(win.name)} ${win.pts}-${lose.pts}`; }).join(", ");
    const close = margins.filter((m) => m <= 7).length, blown = margins.filter((m) => m >= 14).length;
    out.push({ w: 2, text: `Last ${meet.length} meetings: ${list}. ${close} of ${meet.length} were one-score games.${close * 2 >= meet.length ? " These two keep it close, so both offenses stay on script into the fourth quarter." : blown * 2 >= meet.length ? " These two have gotten away from each other, which is when the leader runs out the clock." : ""}` });
    const line = Number((game.total || {}).line), avgPts = meet.reduce((sum, box) => sum + box.teams[0].pts + box.teams[1].pts, 0) / meet.length;
    if (Number.isFinite(line) && Math.abs(avgPts - line) >= 6) out.push({ w: 1.5, text: `Those meetings averaged ${n1(avgPts)} points. The total is ${line}.` });
  }
  if (extra.coach) out.push({ w: 0.5, text: extra.coach });
  return out;
}

function plays(groups, game, boxes) {
  const { fav, dog, spread } = favOf(game, boxes), meet = boxes.meet, n = meet.length;
  const close = meet.filter((box) => Math.abs(box.teams[0].pts - box.teams[1].pts) <= 7).length;
  const past = n >= 2 && close * 2 >= n ? `${fav && spread >= 6.5 ? ". Still" : ", and"} ${close} of their last ${n} meetings were one-score games` : "";
  const first = !fav ? `This is a pick'em${past}.` : spread <= 3 ? `This should be close: ${the(fav.name)} are ${spread}-point favorites${past}.` : spread < 6.5 ? `${The(fav.name)} are ${spread}-point favorites${past}.` : `${The(fav.name)} are ${spread}-point favorites, so a lead turns this into their run game and ${the(dog.name)} throwing to catch up${past}.`;
  const style = top([...(groups["Game flow"] || []).filter((row) => /weather/.test(row.brief || "")), ...(groups["Passing and rushing"] || []), ...(groups.Pace || [])].filter((row) => row.brief), 2).map((row) => row.brief);
  const second = style.length ? `${cap(both(style))}.` : "";
  const watch = top((groups.Matchups || []).filter((row) => row.edge), 1)[0] || top((groups.Matchups || []).filter((row) => row.say), 1)[0];
  const out = top(groups["Who's out"] || [], 1)[0];
  return [first, second, watch ? watch.say : out ? out.text.split(/(?<=\.)\s/)[0] : ""].filter(Boolean);
}

function tellNfl(game, boxes, extra = {}) {
  const outs = extra.outs || { away: [], home: [] };
  const groups = { "Game flow": flow(game, boxes, extra), "Matchups": matchups(boxes, outs), "Passing and rushing": passRun(boxes, outs), "Pace": pace(boxes), "Who's out": missing(boxes, outs), "History": history(boxes, game, extra) };
  const named = new Set((groups.Matchups || []).map((row) => (row.text.match(/^(.+?) has the/) || [])[1]).filter(Boolean));
  const sections = Object.entries(groups).map(([title, rows]) => ({ title, lines: top(rows, 4).map((row) => (row.player && named.has(row.player) ? row.bare : row.text)) })).filter((row) => row.lines.length);
  const watch = top((groups.Matchups || []).filter((row) => row.say), 2).map((row) => ({ name: (row.say.match(/^(?:Watch )?([^:]+?)(?::| has)/) || [])[1] || "", edge: !!row.edge }));
  return { plays: plays(groups, game, boxes), sections, watch };
}

module.exports = { tellNfl };
