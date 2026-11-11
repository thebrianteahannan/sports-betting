/** After an NBA game: the script we had going in, how the game went, and why each leg hit or missed. */

const { gameBoxes, group, readBox } = require("./game-boxes");
const { tell } = require("./game-story");
const MEM = new Map();

function n0(value) { return Number.isFinite(value) ? String(Math.round(value)) : ""; }
function n1(value) { return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "") : ""; }
function last(name) { return String(name || "").split(" ").pop(); }
function pct(made, tried) { return tried ? Math.round((100 * made) / tried) : 0; }
function words(text) { return String(text || "").toLowerCase().replace(/\./g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((part) => part && !["jr", "sr", "ii", "iii", "iv"].includes(part)); }
function samePlayer(a, b) { const left = words(a), right = words(b); return Boolean(left.length && right.length && left[left.length - 1] === right[right.length - 1] && left[0][0] === right[0][0]); }

function lineOf(summary, header) {
  const pick = ((summary || {}).pickcenter || [])[0] || {};
  const hit = String(pick.details || "").match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)$/);
  const home = header.find((side) => side.home), away = header.find((side) => !side.home);
  let homeLine = null;
  if (hit && home && away) homeLine = hit[1] === home.abbr ? Number(hit[2]) : hit[1] === away.abbr ? -Number(hit[2]) : null;
  if (/^even|pk|pick/i.test(String(pick.details || ""))) homeLine = 0;
  return { homeLine, total: Number(pick.overUnder) || null };
}

function outsFrom(book, actual) {
  return Object.entries(book || {}).filter(([name, row]) => row.min >= 20 && row.games >= 3 && !actual.people.some((one) => samePlayer(one.name, name) && one.min > 0)).map(([name, row]) => ({ name, pos: row.pos, group: group(row.pos), status: "out", next: "" }));
}

function playersOf(actual, boxes) {
  const out = {};
  actual.teams.forEach((team) => {
    const side = boxes ? [boxes.away, boxes.home].find((row) => row.id === team.id) : null;
    team.people.forEach((one) => {
      const usual = side && Object.entries(side.players).find(([name]) => samePlayer(name, one.name));
      const avg = usual ? usual[1] : {};
      out[one.name] = { team: team.name, starter: one.starter, min: one.min, pts: one.pts, reb: one.reb, ast: one.ast, pf: one.pf, fgm: one.fgm, fga: one.fga, tpm: one.tpm, tpa: one.tpa, avg: { min: avg.min, pts: avg.pts, reb: avg.reb, ast: avg.ast, fga: avg.fga, tpm: avg.tpm, games: avg.games || 0 } };
    });
  });
  return out;
}

function checks(story, game, actual, boxes) {
  const [a, b] = actual.teams, win = a.pts > b.pts ? a : b, lose = win === a ? b : a, margin = win.pts - lose.pts;
  const home = Number(game.spread.homeLine), favHome = Number.isFinite(home) && home < 0, favName = !Number.isFinite(home) || home === 0 ? "" : favHome ? boxes.home.name : boxes.away.name;
  const spread = Math.abs(home), out = [];
  const hot = win.tpa && pct(win.tpm, win.tpa) >= 42, cold = lose.fga && pct(lose.fgm, lose.fga) <= 41;
  const luck = [hot && `the ${last(win.name)} made ${win.tpm} of ${win.tpa} threes`, cold && `the ${last(lose.name)} shot ${pct(lose.fgm, lose.fga)}% from the floor`].filter(Boolean).join(" and ");
  if (margin >= 15 && (!Number.isFinite(spread) || spread < 9)) out.push({ kind: luck ? "odd" : "miss", text: `The line said ${favName ? `${last(favName)} by ${spread}` : "a pick'em"}. It was a ${margin}-point game, and the ${last(win.name)} led by as many as ${win.lead || margin}.${luck ? ` That came from shooting: ${luck}.` : " The matchup numbers did not call for a game this lopsided."}` });
  else if (favName && win.name !== favName) out.push({ kind: margin >= 10 ? "odd" : "held", text: `The ${last(win.name)} won as the underdog, by ${margin}.${luck ? ` ${luck.charAt(0).toUpperCase() + luck.slice(1)}.` : ""}` });
  else out.push({ kind: "held", text: `The ${last(win.name)} won by ${margin}${favName ? ` with the line at ${spread}` : ""}. The margin was about what the line said.` });
  const mid = (boxes.away.pace + boxes.home.pace) / 2, gap = actual.poss - mid;
  if (Math.abs(gap) >= 4) out.push({ kind: Math.abs(gap) >= 7 ? "miss" : "odd", text: `It ran at ${n0(actual.poss)} trips, ${n0(Math.abs(gap))} ${gap > 0 ? "more" : "fewer"} than the ${n0(mid)} these two average. ${gap > 0 ? "More trips meant more shots for everyone." : "Fewer trips meant fewer shots for everyone."}` });
  else out.push({ kind: "held", text: `The pace was what we expected: ${n0(actual.poss)} trips against a ${n0(mid)} average.` });
  (story.watch || []).forEach((one) => {
    const row = actual.teams.flatMap((team) => team.people).find((p) => samePlayer(p.name, one.name));
    const side = [boxes.away, boxes.home].map((team) => Object.entries(team.players).find(([name]) => samePlayer(name, one.name))).find(Boolean);
    if (!row || !side) return;
    const avg = side[1].pts, diff = row.pts - avg;
    out.push({ kind: one.edge ? (diff >= 0 ? "held" : "miss") : (diff <= 0 ? "held" : "miss"), text: `We flagged ${one.name} ${one.edge ? "for a big night" : "for a tough draw"}. He scored ${row.pts} in ${row.min} minutes against his ${n1(avg)} average.` });
  });
  return out;
}

function wentLines(game, actual, boxes) {
  const [a, b] = actual.teams, total = a.pts + b.pts, out = [];
  const line = Number(game.total);
  out.push(`${total} points${Number.isFinite(line) && line ? ` against a ${line} total, ${total > line ? "over" : "under"} by ${n1(Math.abs(total - line))}` : ""}.`);
  actual.teams.forEach((team) => {
    const usual = [boxes.away, boxes.home].find((row) => row.id === team.id) || {};
    const bits = [`${team.fgm} of ${team.fga} from the floor (${pct(team.fgm, team.fga)}%)`, `${team.tpm} of ${team.tpa} from three${Number.isFinite(usual.tpa) ? ` (${n0(usual.tpa)} tries a game usually)` : ""}`, `${team.fta} free throws${Number.isFinite(usual.fta) ? ` (${n0(usual.fta)} usually)` : ""}`];
    out.push(`The ${last(team.name)}: ${bits.join(", ")}.`);
  });
  return out;
}

async function reviewGame(leg, summary) {
  const key = `${leg.match}|${leg.kickoff}`;
  if (MEM.has(key)) return MEM.get(key);
  const job = (async () => {
    const comp = (((summary || {}).header || {}).competitions || [])[0] || {};
    const header = (comp.competitors || []).map((side) => ({ name: (side.team || {}).displayName || "", abbr: (side.team || {}).abbreviation || "", home: side.homeAway === "home", score: Number(side.score) }));
    const final = header.slice().sort((x, y) => y.score - x.score).map((side) => `${last(side.name)} ${side.score}`).join(", ");
    if (String(leg.sport).toUpperCase() !== "NBA") return { key, final };
    const actual = readBox(summary, "");
    const away = header.find((side) => !side.home), home = header.find((side) => side.home);
    if (!actual || !away || !home) return { key, final };
    const boxes = await gameBoxes(away.name, home.name, Date.parse(leg.kickoff)).catch(() => null);
    if (!boxes) return { key, final, players: playersOf(actual, null) };
    const odds = lineOf(summary, header);
    const game = { match: leg.match, kickoff: leg.kickoff, sport: "NBA", spread: { homeLine: odds.homeLine }, total: { line: odds.total } };
    const pick = (team) => actual.teams.find((row) => row.id === team.id) || { people: [] };
    const fives = { away: pick(boxes.away).people.filter((one) => one.starter).map((one) => ({ name: one.name, spot: one.pos, group: group(one.pos) })), home: pick(boxes.home).people.filter((one) => one.starter).map((one) => ({ name: one.name, spot: one.pos, group: group(one.pos) })) };
    const outs = { away: outsFrom(boxes.away.players, pick(boxes.away)), home: outsFrom(boxes.home.players, pick(boxes.home)) };
    const story = tell(game, boxes, null, fives, outs);
    const list = checks(story, game, actual, boxes);
    const kinds = list.map((row) => row.kind);
    const verdict = kinds.includes("miss") ? "Where the script went wrong" : kinds.includes("odd") ? "The script held, and something unusual happened" : "The script held";
    const [x, y] = actual.teams;
    return { key, final, script: story.plays, verdict, checks: list, went: wentLines({ total: odds.total }, actual, boxes), players: playersOf(actual, boxes), margin: Math.abs(x.pts - y.pts), outs: [...outs.away, ...outs.home].map((row) => row.name) };
  })().catch((error) => { console.error("game review:", error && error.message); MEM.delete(key); return { key }; });
  MEM.set(key, job);
  if (MEM.size > 200) MEM.delete(MEM.keys().next().value);
  return job;
}

function legWhy(leg, review, player) {
  const p = review && review.players ? Object.entries(review.players).find(([name]) => samePlayer(name, player)) : null;
  if (!p) return "";
  const [name, row] = p, avg = row.avg || {}, first = last(name), out = [];
  const text = `${leg.market || ""} ${leg.label || ""}`.toLowerCase();
  const line = Number((String(leg.text || leg.label || "").match(/(\d+(?:\.\d+)?)/) || [])[1]);
  const box = [/pts|point/.test(text) && `${row.pts} points`, /\breb|rebound/.test(text) && `${row.reb} rebounds`, /\bast\b|assist/.test(text) && `${row.ast} assists`, /three/.test(text) && `${row.tpm} of ${row.tpa} threes`].filter(Boolean);
  const mins = Number.isFinite(avg.min) && Math.abs(row.min - avg.min) >= 3 ? `${row.min} minutes, ${n0(Math.abs(row.min - avg.min))} ${row.min < avg.min ? "under" : "over"} his ${n0(avg.min)} average` : `${row.min} minutes${Number.isFinite(avg.min) ? `, about his ${n0(avg.min)} average` : ""}`;
  out.push(`${first} had ${box.join(", ") || `${row.pts} points`} in ${mins}.`);
  const gap = Number.isFinite(leg.have) && Number.isFinite(line) ? Math.abs(leg.have - line) : NaN;
  if (leg.result === "won") {
    if (Number.isFinite(gap)) out.push(gap ? `Cleared it by ${n1(gap)}.` : "Hit the number exactly.");
    return out.join(" ");
  }
  if (leg.result !== "lost") return out.join(" ");
  const why = [];
  const short = Number.isFinite(avg.min) && row.min <= avg.min - 5;
  if (short && row.pf >= 5) why.push(`Foul trouble: ${row.pf} fouls kept him on the bench.`);
  else if (short && review.margin >= 15 && row.starter) why.push(`The game got away by ${review.margin}, so the starters sat late.`);
  else if (short) why.push(`His minutes were cut.`);
  if (Number.isFinite(avg.fga) && row.fga <= avg.fga - 4) why.push(`He got ${row.fga} shots, ${n0(avg.fga - row.fga)} fewer than his usual ${n0(avg.fga)}.`);
  if (row.fga >= 8 && pct(row.fgm, row.fga) <= 38 && /pts|point|three/.test(text)) why.push(`He shot ${row.fgm} of ${row.fga}.`);
  if (/three/.test(text) && row.tpa && pct(row.tpm, row.tpa) <= 30) why.push(`He went ${row.tpm} of ${row.tpa} from three.`);
  const parts = [[/pts|point/, "points", row.pts, avg.pts], [/\breb|rebound/, "rebounds", row.reb, avg.reb], [/\bast\b|assist/, "assists", row.ast, avg.ast], [/three/, "threes", row.tpm, avg.tpm]].filter(([re, , , mean]) => re.test(text) && Number.isFinite(mean));
  const worst = parts.map(([, word, got, mean]) => ({ word, got, mean, gap: (got - mean) / Math.max(mean, 1) })).sort((x, y) => x.gap - y.gap)[0];
  if (worst && worst.got <= worst.mean - 1.5) why.push(parts.length > 1 ? `His ${worst.word} were the shortfall: ${worst.got} against his ${n1(worst.mean)} average.` : `He averages ${n1(worst.mean)} ${worst.word}.`);
  if (!why.length) why.push(`He got his minutes and his shots. It was an off night, not a bad read.`);
  return out.concat(Number.isFinite(gap) ? [`Missed by ${n1(gap)}.`] : [], why).join(" ");
}

function teamWhy(leg, review) {
  if (!review || !review.went) return "";
  const text = `${leg.market || ""}`.toLowerCase();
  const team = /team total/.test(leg.text || "") && review.went.find((line) => line.startsWith(`The ${String(leg.text).split(" ")[0]}:`));
  if (team) return `${leg.note}. ${team}`;
  if (/total/.test(text)) return [review.went[0]].concat((review.checks || []).filter((row) => /trips/.test(row.text)).map((row) => row.text)).join(" ");
  return (review.checks || [])[0] ? review.checks[0].text : "";
}

module.exports = { reviewGame, legWhy, teamWhy };
