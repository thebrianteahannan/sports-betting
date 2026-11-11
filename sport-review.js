/** After an NFL or NHL game: the script we had going in, how the game went, and why each leg hit or missed. */

const { sportBoxes, readSport } = require("./sport-boxes");
const { tellSport } = require("./sport-story");

function n0(value) { return Number.isFinite(value) ? String(Math.round(value)) : ""; }
function n1(value) { return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "") : ""; }
function sv(value) { return Number.isFinite(value) ? value.toFixed(3).replace(/^0/, "") : ""; }
function last(name) { return String(name || "").split(" ").pop(); }
function words(text) { return String(text || "").toLowerCase().replace(/\./g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((part) => part && !["jr", "sr", "ii", "iii", "iv"].includes(part)); }
function samePlayer(a, b) { const left = words(a), right = words(b); return Boolean(left.length && right.length && left[left.length - 1] === right[right.length - 1] && left[0][0] === right[0][0]); }
function usualOf(boxes, team, name) { const side = [boxes.away, boxes.home].find((row) => row.id === team.id); const hit = side && Object.entries(side.players).find(([key]) => samePlayer(key, name)); return hit ? hit[1] : {}; }

function lineOf(sport, summary, header) {
  const pick = ((summary || {}).pickcenter || [])[0] || {};
  const hit = String(pick.details || "").match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)$/);
  const home = header.find((side) => side.home), away = header.find((side) => !side.home);
  let homeLine = null;
  if (hit && home && away) {
    const value = Number(hit[2]), sign = hit[1] === home.abbr ? 1 : hit[1] === away.abbr ? -1 : 0;
    if (sign) homeLine = sport === "NHL" || Math.abs(value) >= 100 ? (value < 0 ? -1.5 : 1.5) * sign : value * sign;
  }
  if (/^even|pk|pick/i.test(String(pick.details || ""))) homeLine = 0;
  return { homeLine, total: Number(pick.overUnder) || null };
}

function outsFrom(sport, side, team) {
  const big = (row) => (sport === "NFL" ? row.passAtt >= 15 || row.tgt >= 4 || row.rushAtt >= 8 : row.toi >= 15);
  return Object.entries(side.players).filter(([name, row]) => row.games >= 3 && big(row) && !team.people.some((one) => samePlayer(one.name, name))).map(([name, row]) => ({ name, pos: row.pos, status: "out", next: "" }));
}

function favName(game, boxes) { const home = Number(game.spread.homeLine); return !Number.isFinite(home) || home === 0 ? "" : home < 0 ? boxes.home.name : boxes.away.name; }

function watchChecks(story, actual, boxes, key, word) {
  return (story.watch || []).map((one) => {
    const team = actual.teams.find((side) => side.people.some((p) => samePlayer(p.name, one.name)));
    const row = team && team.people.find((p) => samePlayer(p.name, one.name)), usual = team ? usualOf(boxes, team, one.name) : {};
    const field = typeof key === "function" ? key(usual) : key;
    if (!row || !Number.isFinite(usual[field])) return null;
    const diff = row[field] - usual[field];
    return { kind: one.edge ? (diff >= 0 ? "held" : "miss") : (diff <= 0 ? "held" : "miss"), text: `We flagged ${one.name} ${one.edge ? "for a big day" : "for a tough draw"}. He had ${row[field]} ${word(field)} against his ${n1(usual[field])} average.` };
  }).filter(Boolean);
}

function nflChecks(story, game, actual, boxes) {
  const [a, b] = actual.teams, win = a.pts >= b.pts ? a : b, lose = win === a ? b : a, margin = win.pts - lose.pts;
  const fav = favName(game, boxes), spread = Math.abs(Number(game.spread.homeLine)), out = [];
  const luck = lose.to - win.to >= 2 ? `the ${last(lose.name)} turned it over ${lose.to} times to ${win.to}` : "";
  if (fav && win.name !== fav) out.push({ kind: margin >= 10 ? (luck ? "odd" : "miss") : "odd", text: `The ${last(win.name)} won as the underdog, by ${margin}.${luck ? ` That came from turnovers: ${luck}.` : ""}` });
  else if (margin >= (Number.isFinite(spread) ? spread : 0) + 14) out.push({ kind: luck ? "odd" : "miss", text: `The line said ${fav ? `${last(fav)} by ${spread}` : "a pick'em"}. It was a ${margin}-point game.${luck ? ` That came from turnovers: ${luck}.` : " The matchup numbers did not call for a game this lopsided."}` });
  else out.push({ kind: "held", text: `The ${last(win.name)} won by ${margin}${fav ? ` with the line at ${spread}` : ""}. The margin was about what the line said.` });
  if (fav && spread >= 6.5) {
    const dog = actual.teams.find((t) => t.name !== fav), usual = [boxes.away, boxes.home].find((t) => t.id === dog.id) || {};
    if (dog.pts < actual.teams.find((t) => t !== dog).pts) out.push({ kind: dog.passAtt >= (usual.passAtt || 0) ? "held" : "odd", text: `The ${last(dog.name)} trailed and threw ${dog.passAtt} times against their usual ${n0(usual.passAtt)}, with ${dog.rushAtt} carries against ${n0(usual.rushAtt)}.` });
    else out.push({ kind: "miss", text: `The script had the ${last(fav)} ahead and running. They never got there: the ${last(dog.name)} won or kept it close.` });
  }
  const want = boxes.away.plays + boxes.home.plays, got = a.plays + b.plays, gap = got - want;
  if (Math.abs(gap) >= 12) out.push({ kind: Math.abs(gap) >= 20 ? "miss" : "odd", text: `The game had ${got} plays, ${n0(Math.abs(gap))} ${gap > 0 ? "more" : "fewer"} than the ${n0(want)} these two average. ${gap > 0 ? "More snaps meant more yards to go around." : "Fewer snaps meant fewer yards for everyone."}` });
  else out.push({ kind: "held", text: `The volume was what we expected: ${got} plays against a ${n0(want)} average.` });
  return out.concat(watchChecks(story, actual, boxes, (usual) => (usual.rushAtt >= 8 && !(usual.tgt >= 4) ? "rushYds" : "recYds"), (field) => (field === "rushYds" ? "rushing yards" : "receiving yards")));
}

function nhlChecks(story, game, actual, boxes) {
  const [a, b] = actual.teams, win = a.pts >= b.pts ? a : b, lose = win === a ? b : a, margin = win.pts - lose.pts, out = [];
  const fav = favName(game, boxes), keeper = (win.goalies || []).slice().sort((x, y) => y.toi - x.toi)[0];
  const stole = keeper && keeper.sa >= 25 && keeper.sv / keeper.sa >= 0.94 ? `${keeper.name} stopped ${keeper.sv} of ${keeper.sa}` : "";
  const outshot = lose.shots - win.shots >= 10 ? `the ${last(lose.name)} outshot them ${lose.shots} to ${win.shots}` : "";
  const luck = [stole, outshot].filter(Boolean).join(", and ");
  if (fav && win.name !== fav) out.push({ kind: luck ? "odd" : margin >= 3 ? "miss" : "odd", text: `The ${last(win.name)} won as the underdog, ${win.pts}-${lose.pts}.${luck ? ` ${luck.charAt(0).toUpperCase() + luck.slice(1)}.` : ""}` });
  else out.push({ kind: luck ? "odd" : "held", text: `The ${last(win.name)} won ${win.pts}-${lose.pts}${fav ? " as the favorite" : ""}.${luck ? ` ${luck.charAt(0).toUpperCase() + luck.slice(1)}.` : ""}` });
  const want = boxes.away.shots + boxes.home.shots, got = a.shots + b.shots, gap = got - want;
  if (Math.abs(gap) >= 10) out.push({ kind: Math.abs(gap) >= 16 ? "miss" : "odd", text: `The game had ${got} shots, ${n0(Math.abs(gap))} ${gap > 0 ? "more" : "fewer"} than the ${n0(want)} these two average. ${gap > 0 ? "More shots helped every shot prop." : "Fewer shots hurt every shot prop."}` });
  else out.push({ kind: "held", text: `The shot volume was what we expected: ${got} shots against a ${n0(want)} average.` });
  const ppo = a.ppo + b.ppo, ppWant = boxes.away.ppo + boxes.home.ppo;
  if (Number.isFinite(ppWant) && Math.abs(ppo - ppWant) >= 3) out.push({ kind: "odd", text: `There were ${ppo} power plays against the usual ${n0(ppWant)}. ${ppo > ppWant ? "Extra power plays fed the points props." : "Few power plays took points away from the top units."}` });
  return out.concat(watchChecks(story, actual, boxes, "shots", () => "shots"));
}

function wentLines(sport, total, actual, boxes) {
  const [a, b] = actual.teams, sum = a.pts + b.pts, out = [];
  out.push(`${sum} ${sport === "NFL" ? "points" : "goals"}${Number.isFinite(total) && total ? ` against a ${total} total, ${sum > total ? "over" : "under"} by ${n1(Math.abs(sum - total))}` : ""}.`);
  actual.teams.forEach((team) => {
    const usual = [boxes.away, boxes.home].find((row) => row.id === team.id) || {};
    if (sport === "NFL") out.push(`The ${last(team.name)}: ${team.passYds} passing yards on ${team.passAtt} throws, ${team.rushYds} rushing on ${team.rushAtt} carries, ${team.to} turnover${team.to === 1 ? "" : "s"} (usually ${n0(usual.passYds)} passing and ${n0(usual.rushYds)} rushing).`);
    else { const g = (team.goalies || []).slice().sort((x, y) => y.toi - x.toi)[0]; out.push(`The ${last(team.name)}: ${team.shots} shots (${n1(usual.shots)} usually), ${team.ppg} of ${team.ppo} on the power play${g ? `, and ${g.name} stopped ${g.sv} of ${g.sa}` : ""}.`); }
  });
  return out;
}

function playersOf(sport, actual, boxes) {
  const out = {};
  actual.teams.forEach((team) => team.people.forEach((one) => { out[one.name] = { team: team.name, ...one, avg: usualOf(boxes, team, one.name) }; }));
  return out;
}

async function reviewSport(leg, summary, key, final) {
  const sport = String(leg.sport || "").toUpperCase(), actual = readSport(sport, summary || {}, "");
  const comp = (((summary || {}).header || {}).competitions || [])[0] || {};
  const header = (comp.competitors || []).map((side) => ({ name: (side.team || {}).displayName || "", abbr: (side.team || {}).abbreviation || "", home: side.homeAway === "home" }));
  const away = header.find((side) => !side.home), home = header.find((side) => side.home);
  if (!actual || !away || !home) return { key, final };
  const boxes = await sportBoxes(sport, away.name, home.name, leg.kickoff, Date.parse(leg.kickoff)).catch(() => null);
  if (!boxes) return { key, final };
  const odds = lineOf(sport, summary, header);
  const game = { match: leg.match, kickoff: leg.kickoff, sport, spread: { homeLine: odds.homeLine }, total: { line: odds.total } };
  const pick = (side) => actual.teams.find((row) => row.id === side.id) || { people: [] };
  const outs = { away: outsFrom(sport, boxes.away, pick(boxes.away)), home: outsFrom(sport, boxes.home, pick(boxes.home)) };
  const story = tellSport(sport, game, boxes, { outs });
  const list = sport === "NFL" ? nflChecks(story, game, actual, boxes) : nhlChecks(story, game, actual, boxes);
  const kinds = list.map((row) => row.kind);
  const verdict = kinds.includes("miss") ? "Where the script went wrong" : kinds.includes("odd") ? "The script held, and something unusual happened" : "The script held";
  const teams = actual.teams.map((team) => { const usual = [boxes.away, boxes.home].find((row) => row.id === team.id) || {}; return { name: team.name, pts: team.pts, rz: team.rz, goalies: team.goalies, passAtt: team.passAtt, rushAtt: team.rushAtt, usualPass: usual.passAtt, usualRush: usual.rushAtt }; });
  return { key, final, sport, script: story.plays, verdict, checks: list, went: wentLines(sport, odds.total, actual, boxes), players: playersOf(sport, actual, boxes), teams, margin: Math.abs(actual.teams[0].pts - actual.teams[1].pts), outs: [...outs.away, ...outs.home].map((row) => row.name) };
}

function footWhy(leg, review, name, row) {
  const avg = row.avg || {}, first = last(name), text = `${leg.market || ""} ${leg.label || ""}`.toLowerCase(), out = [], why = [];
  const kind = /rush(ing)? \+ rec|rush \+ rec/.test(text) ? "both" : /passing/.test(text) ? "pass" : /rushing|carries/.test(text) ? "rush" : /receiving|reception/.test(text) ? "rec" : /touchdown|\btd\b/.test(text) ? "td" : "rec";
  const mine = (review.teams || []).find((t) => t.name === row.team), foe = (review.teams || []).find((t) => t.name !== row.team);
  const lead = mine && foe ? mine.pts - foe.pts : 0;
  if (kind === "pass") out.push(`${first} threw for ${row.passYds} yards on ${row.passAtt} attempts${Number.isFinite(avg.passYds) ? `, against his ${n0(avg.passYds)} on ${n1(avg.passAtt)}` : ""}.`);
  else if (kind === "rush") out.push(`${first} ran ${row.rushAtt} times for ${row.rushYds} yards${Number.isFinite(avg.rushAtt) ? `, against his ${n1(avg.rushAtt)} carries for ${n0(avg.rushYds)}` : ""}.`);
  else if (kind === "td") out.push(`${first} had ${row.rushAtt} carries and ${row.tgt} targets, and ${row.rushTd + row.recTd ? `scored ${row.rushTd + row.recTd}` : "did not score"}.`);
  else out.push(`${first} caught ${row.rec} of ${row.tgt} targets for ${row.recYds} yards${kind === "both" ? ` and ran for ${row.rushYds}` : ""}${Number.isFinite(avg.tgt) ? `. He averages ${n1(avg.rec)} catches on ${n1(avg.tgt)} targets for ${n0(avg.recYds)}` : ""}.`);
  const line = Number((String(leg.text || leg.label || "").match(/(\d+(?:\.\d+)?)/) || [])[1]);
  const gap = Number.isFinite(leg.have) && Number.isFinite(line) ? Math.abs(leg.have - line) : NaN;
  if (leg.result === "won") return out.concat(Number.isFinite(gap) && kind !== "td" ? [gap ? `Cleared it by ${n1(gap)}.` : "Hit the number exactly."] : []).join(" ");
  if (leg.result !== "lost") return out.join(" ");
  if ((kind === "rec" || kind === "both") && Number.isFinite(avg.tgt) && row.tgt <= avg.tgt - 2) why.push(`He got ${row.tgt} targets, ${n0(avg.tgt - row.tgt)} fewer than usual.`);
  if ((kind === "rush" || kind === "both") && Number.isFinite(avg.rushAtt) && row.rushAtt <= avg.rushAtt - 4) why.push(`He got ${row.rushAtt} carries, ${n0(avg.rushAtt - row.rushAtt)} fewer than usual.`);
  if (kind === "pass" && Number.isFinite(avg.passAtt) && row.passAtt <= avg.passAtt - 6) why.push(`He threw ${n0(avg.passAtt - row.passAtt)} fewer passes than usual.`);
  if (lead >= 14 && (kind === "pass" || kind === "rec") && mine.passAtt <= mine.usualPass - 4) why.push(`The ${last(row.team)} led by ${lead}, so they ran the clock: ${mine.passAtt} throws against their usual ${n0(mine.usualPass)}.`);
  if (lead <= -14 && kind === "rush" && mine.rushAtt <= mine.usualRush - 4) why.push(`The ${last(row.team)} trailed by ${-lead}, so they threw: ${mine.rushAtt} carries against their usual ${n0(mine.usualRush)}.`);
  if (kind === "rec" && row.tgt >= 4 && row.rec / row.tgt <= 0.5) why.push(`He caught only ${row.rec} of ${row.tgt}.`);
  if (kind === "rush" && row.rushAtt >= 8 && row.rushYds / row.rushAtt <= 3) why.push(`He averaged ${n1(row.rushYds / row.rushAtt)} yards a carry.`);
  if (kind === "td" && mine && mine.rz) why.push(`The ${last(row.team)} got to the red zone ${mine.rz[1]} time${mine.rz[1] === 1 ? "" : "s"} and scored touchdowns on ${mine.rz[0]}.`);
  const usual = kind === "pass" ? avg.passYds : kind === "rush" ? avg.rushYds : kind === "both" ? avg.rushYds + avg.recYds : /reception/.test(text) && !/yds|yards/.test(text) ? avg.rec : avg.recYds;
  if (!why.length && kind !== "td" && Number.isFinite(usual) && Number.isFinite(leg.have) && leg.have >= usual) why.push(`That beat his ${n1(usual)} average. The line asked for more than he usually gets.`);
  else if (!why.length && kind !== "td" && Number.isFinite(usual) && Number.isFinite(line) && line > usual) why.push(`The line was ${line}, above his ${n1(usual)} average.`);
  if (!why.length) why.push("He got his usual work. It was an off day, not a bad read.");
  return out.concat(Number.isFinite(gap) && kind !== "td" ? [`Missed by ${n1(gap)}.`] : [], why).join(" ");
}

function iceWhy(leg, review, name, row) {
  const avg = row.avg || {}, first = last(name), text = `${leg.market || ""} ${leg.label || ""}`.toLowerCase(), why = [];
  const shotLeg = /shot/.test(text);
  const out = [`${first} had ${shotLeg ? `${row.shots} shot${row.shots === 1 ? "" : "s"}` : `${row.goals} goal${row.goals === 1 ? "" : "s"} and ${row.ast} assist${row.ast === 1 ? "" : "s"} on ${row.shots} shot${row.shots === 1 ? "" : "s"}`} in ${n0(row.toi)} minutes${Number.isFinite(avg.toi) ? `, against his ${n1(avg.shots)} shots in ${n0(avg.toi)}` : ""}.`];
  const line = Number((String(leg.text || leg.label || "").match(/(\d+(?:\.\d+)?)/) || [])[1]);
  const gap = Number.isFinite(leg.have) && Number.isFinite(line) ? Math.abs(leg.have - line) : NaN;
  if (leg.result === "won") return out.concat(Number.isFinite(gap) && shotLeg ? [gap ? `Cleared it by ${n1(gap)}.` : "Hit the number exactly."] : []).join(" ");
  if (leg.result !== "lost") return out.join(" ");
  if (Number.isFinite(avg.toi) && row.toi <= avg.toi - 3) why.push(row.pim >= 4 ? `He sat ${row.pim} penalty minutes.` : review.margin >= 3 ? `The game got away by ${review.margin}, so his minutes were cut.` : "His ice time was cut.");
  if (Number.isFinite(avg.shots) && row.shots <= avg.shots - 1.5) why.push(`He got ${row.shots} shots, ${n1(avg.shots - row.shots)} fewer than usual.`);
  const other = (review.teams || []).find((t) => t.name !== row.team), keeper = other && (other.goalies || []).slice().sort((x, y) => y.toi - x.toi)[0];
  if (!shotLeg && keeper && keeper.sa && keeper.sv / keeper.sa >= 0.93) why.push(`${keeper.name} stopped ${keeper.sv} of ${keeper.sa} (${sv(keeper.sv / keeper.sa)}).`);
  const usual = shotLeg ? avg.shots : /goal/.test(text) && !/point/.test(text) ? avg.goals : avg.goals + avg.ast;
  if (!why.length && Number.isFinite(usual) && Number.isFinite(leg.have) && leg.have >= usual) why.push(`That beat his ${n1(usual)} average. The line asked for more than he usually gets.`);
  else if (!why.length && Number.isFinite(usual) && Number.isFinite(line) && line > usual) why.push(`The line was ${line}, above his ${n1(usual)} average.`);
  if (!why.length) why.push("He got his ice time and his shots. It was an off night, not a bad read.");
  return out.concat(Number.isFinite(gap) && shotLeg ? [`Missed by ${n1(gap)}.`] : [], why).join(" ");
}

function sportWhy(leg, review, player) {
  const hit = review && review.players ? Object.entries(review.players).find(([name]) => samePlayer(name, player)) : null;
  if (!hit) return "";
  return review.sport === "NFL" ? footWhy(leg, review, hit[0], hit[1]) : iceWhy(leg, review, hit[0], hit[1]);
}

module.exports = { reviewSport, sportWhy };
