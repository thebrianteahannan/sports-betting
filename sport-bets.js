/** Recommended NFL and NHL props and parlays: which posted overs each player's recent games clear, and what the other team allows. */

const { goodProps, ticketsFrom } = require("./script-bets");
const { iceGroup, footGroup } = require("./sport-boxes");

const STATS = {
  NFL: [
    [/rushing \+ receiving/i, ["rushYds", "recYds"], "rushing + receiving yards"],
    [/passing yds|passing yards/i, ["passYds"], "passing yards"],
    [/passing tds/i, ["passTd"], "passing touchdowns"],
    [/receiving yds|receiving yards/i, ["recYds"], "receiving yards"],
    [/receptions/i, ["rec"], "receptions"],
    [/rushing yds|rushing yards/i, ["rushYds"], "rushing yards"],
  ],
  NHL: [
    [/shots on goal/i, ["shots"], "shots on goal"],
    [/points/i, ["goals", "ast"], "points"],
    [/assists/i, ["ast"], "assists"],
    [/goals/i, ["goals"], "goals"],
  ],
};
const MIN = { NFL: 4, NHL: 5 };
const WHO = { WR: "wide receivers", TE: "tight ends", RB: "running backs", F: "forwards", D: "defensemen" };

function last(name) { return String(name || "").split(" ").pop(); }
function fold(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
function nice(value, sport) { return sport === "NFL" ? String(Math.round(value)) : (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, ""); }

function readProp(sport, row) {
  const market = String(row.market || ""), label = String(row.label || "");
  if (/period|quarter|half|yard reception|under/i.test(`${market} ${label}`)) return null;
  const hit = STATS[sport].find(([test]) => test.test(market)) || STATS[sport].find(([test]) => test.test(label));
  if (!hit) return null;
  const plus = label.match(/(\d+)\+/) || market.match(/(\d+)\+/), over = label.match(/Over (\d+(?:\.\d+)?)/);
  const need = plus ? Number(plus[1]) : over ? Math.floor(Number(over[1])) + 1 : 0;
  if (!need) return null;
  return { need, stat: hit[2], keys: hit[1], word: hit[2], text: plus ? `${need}+ ${hit[2]}` : `Over ${over[1]} ${hit[2]}` };
}

function reasons(sport, foe, base, row) {
  const out = [], hard = [], against = {}, tail = last(foe.name);
  const check = (key, have, usual, step, noun, who) => {
    if (!Number.isFinite(have) || !Number.isFinite(usual)) return;
    const gap = have - usual;
    if (gap <= -step) { hard.push(key); against[key] = `The ${tail} hold ${who || "opponents"} to ${nice(have, sport)} ${noun} a game, ${nice(-gap, sport)} under usual.`; }
    else if (gap >= step) out.push({ uses: key, w: gap / step, text: `The ${tail} allow ${nice(have, sport)} ${noun} a game${who ? ` to ${who}` : ""}, ${nice(gap, sport)} more than usual.` });
  };
  if (sport === "NFL") {
    const group = footGroup(row.pos), slot = (foe.slots || {})[group] || {}, mid = (base.slots || {})[group] || {};
    if (WHO[group]) { check("recYds", slot.recYds, mid.recYds, 12, "receiving yards", WHO[group]); check("rec", slot.rec, mid.rec, 1.2, "catches", WHO[group]); }
    check("rushYds", foe.oppRushYds, base.oppRushYds, 15, "rushing yards");
    check("passYds", foe.oppPassYds, base.oppPassYds, 20, "passing yards");
  } else {
    const group = iceGroup(row.pos), slot = (foe.slots || {})[group] || {}, mid = (base.slots || {})[group] || {};
    check("shots", slot.shots, mid.shots, group === "D" ? 1 : 2, "shots on goal", WHO[group]);
    check("goals", foe.allow, base.allow, 0.4, "goals");
    check("ast", foe.allow, base.allow, 0.4, "goals");
  }
  return { hard, against, list: out.sort((a, b) => b.w - a.w) };
}

function sportBets(sport, boxes, outs, props) {
  if (!boxes || !STATS[sport] || !Array.isArray(props) || !props.length) return null;
  const { away, home, base } = boxes;
  const byWho = new Map();
  props.forEach((row) => {
    const prop = readProp(sport, row);
    if (!prop || !row.who) return;
    const key = fold(row.who);
    if (!byWho.has(key)) byWho.set(key, []);
    byWho.get(key).push({ prop, odds: Number(row.odds), label: row.label, market: row.market });
  });
  const picks = [];
  [[away, home, (outs && outs.away) || []], [home, away, (outs && outs.home) || []]].forEach(([team, foe, gone]) => {
    Object.entries(team.players || {}).forEach(([name, row]) => {
      if (row.games < MIN[sport] || gone.some((item) => fold(item.name) === fold(name) && /out|doubtful|injured/.test(item.status))) return;
      const rows = byWho.get(fold(name));
      if (!rows) return;
      const read = reasons(sport, foe, base, row);
      const tag = { who: name, team: last(team.name), pos: row.pos || "" };
      const strict = goodProps(rows, row.log || [], read, false).map((prop) => ({ ...tag, ...prop }));
      const loose = goodProps(rows, row.log || [], read, true).map((prop) => ({ ...tag, ...prop }));
      if (strict.length || loose.length) picks.push({ team: tag.team, strict, loose });
    });
  });
  return ticketsFrom(picks, away, home);
}

module.exports = { sportBets };
