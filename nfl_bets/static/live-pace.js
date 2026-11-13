/** Pace on the live page: where each leg is headed given the time left and the score, and how a parlay stands across its games. */

const LIVE_LEN = { NBA: [4, 720], WNBA: [4, 600], NFL: [4, 900], NHL: [3, 1200] };
let liveParlays = new Map();

function liveFrac(game) {
  if (game.final) return 1;
  const len = LIVE_LEN[String(game.sport || "").toUpperCase()], period = Number(game.period) || 0;
  if (!len || !period) return null;
  const [count, secs] = len, left = Math.min(secs, Math.max(0, Number(game.left) || 0));
  const gone = period > count ? count : period - 1 + (1 - left / secs);
  return Math.max(0, Math.min(1, gone / count));
}

function liveSideOf(game, pick) {
  const want = liveFold(pick.who), team = (game.teams || []).find((one) => one.groups.some((group) => group.rows.some((row) => liveFold(row.name) === want)));
  if (team) return team.short === game.home.short ? "home" : team.short === game.away.short ? "away" : "";
  const tail = want.split(" ").pop();
  return tail && liveFold(game.home.name).endsWith(tail) ? "home" : tail && liveFold(game.away.name).endsWith(tail) ? "away" : "";
}

function liveScript(game, pick, frac) {
  const sport = String(game.sport || "").toUpperCase(), side = liveSideOf(game, pick);
  const away = Number(game.away.score) || 0, home = Number(game.home.score) || 0, gap = Math.abs(away - home), ahead = side && gap > 0 && (side === "home") === (home > away);
  if ((sport === "NBA" || sport === "WNBA") && ((frac >= 0.5 && gap >= 25) || (frac >= 0.75 && gap >= 18))) return { factor: 0.5, why: "a blowout, so starters may sit" };
  if (sport === "NFL" && side && frac >= 0.5 && gap >= 10) {
    const rush = /rush/.test(pick.stat), catch_ = /recei|reception|passing|completion/.test(pick.stat);
    if (rush) return ahead ? { factor: 1.15, why: "his team is ahead and will run the clock" } : { factor: 0.8, why: "his team is behind and will throw more" };
    if (catch_) return ahead ? { factor: 0.85, why: "his team is ahead and will run more" } : { factor: 1.15, why: "his team is behind and will throw more" };
  }
  return { factor: 1, why: "" };
}

function livePace(game, pick, now, goal) {
  const frac = liveFrac(game);
  if (frac === null || frac <= 0 || frac >= 1) return null;
  const out = (game.hurt || []).some((one) => one.out && liveFold(one.name) === liveFold(pick.who));
  const trust = Math.min(0.8, frac * 1.5), rate = trust * (now / frac) + (1 - trust) * goal, script = liveScript(game, pick, frac);
  const proj = out ? now : now + rate * (1 - frac) * script.factor;
  let level, read = `on track for about ${Math.round(proj * 10) / 10}`;
  if (goal <= 5) {
    const more = Math.max(0, proj - now), room = pick.under ? Math.floor(pick.need) - now : goal - now;
    let term = Math.exp(-more), upto = 0;
    for (let k = 0; k < Math.max(room, 0); k += 1) { upto += term; term *= more / (k + 1); }
    const chance = pick.under ? upto + term : 1 - upto;
    read = `about ${Math.round(Math.min(0.99, chance) * 100)}% to ${pick.under ? "stay under" : "get there"}`;
    level = chance >= 0.6 ? "ahead" : chance >= 0.35 ? "close" : chance >= 0.2 ? "behind" : "far";
  } else {
    const ratio = pick.under ? pick.need / Math.max(proj, 0.01) : proj / goal;
    level = ratio >= 1.15 ? "ahead" : ratio >= 0.95 ? "close" : ratio >= 0.75 ? "behind" : "far";
  }
  const said = { ahead: "Ahead of pace", close: "On pace", behind: "Behind pace", far: "Way behind" }[level];
  return { level, tip: `${said}: ${read}${out ? " (ruled out)" : script.why ? ` (${script.why})` : ""}` };
}

function liveMoney(game, pick) {
  const side = liveSideOf(game, pick), frac = liveFrac(game);
  if (!side || frac === null) return { state: "", say: "", level: "" };
  const mine = Number(game[side].score) || 0, other = Number(game[side === "home" ? "away" : "home"].score) || 0, gap = mine - other;
  if (game.final) return { state: gap > 0 ? "hit" : "lost", say: gap > 0 ? `Won by ${gap}` : gap < 0 ? `Lost by ${-gap}` : "Tied", level: "" };
  const big = { NFL: 14, NBA: 15, WNBA: 12, NHL: 2 }[String(game.sport || "").toUpperCase()] || 10;
  const level = gap > 0 ? "ahead" : gap === 0 ? "close" : -gap >= big ? "far" : "behind";
  return { state: "", say: gap > 0 ? `Up ${gap}` : gap < 0 ? `Down ${-gap}` : "Tied", level, tip: gap > 0 ? "Winning right now" : gap < 0 ? "Losing right now" : "Tied right now" };
}

function liveLegState(game, pick) {
  if (/moneyline/i.test(pick.market || "")) return liveMoney(game, pick);
  const { now } = liveNow(game, pick);
  if (now === null || pick.need === null) return { state: "", say: "", level: "" };
  const goal = pick.under ? pick.need : pick.plus ? pick.need : Math.floor(pick.need) + 1;
  const state = pick.under ? (now > pick.need ? "lost" : game.final ? "hit" : "") : now >= goal ? "hit" : game.final ? "lost" : "";
  const pace = state ? null : livePace(game, pick, now, goal);
  return { state, say: pick.under ? `${now}, stays under ${pick.need}` : `${now} of ${goal}`, level: pace ? pace.level : "", tip: pace ? pace.tip : "" };
}

function liveParlayCount(legs, games) {
  const row = { hit: 0, ahead: 0, close: 0, behind: 0, far: 0, lost: 0, wait: 0, total: 0 };
  legs.forEach((leg) => {
    row.total += 1;
    const game = games.find((one) => liveMine(one, [leg]).length);
    if (!game) { row.wait += 1; return; }
    const { state, level } = liveLegState(game, liveLegRead(leg));
    if (state) row[state] += 1; else if (level) row[level] += 1; else row.wait += 1;
  });
  return row;
}

function liveParlayTally(games) {
  const sets = new Map();
  liveLegs.forEach((leg) => { if (leg.parlay) sets.set(leg.parlay, [...(sets.get(leg.parlay) || []), leg]); });
  liveParlays = new Map([...sets].map(([id, legs]) => [id, liveParlayCount(legs, games)]));
}

function liveParlaySay(row) {
  const good = row.ahead + row.close, bad = row.behind + row.far;
  const parts = [row.lost && `${row.lost} lost`, row.hit && `${row.hit} hit`, good && `${good} on pace`, bad && `${bad} behind`, row.wait && `${row.wait} to go`].filter(Boolean);
  const level = row.lost ? "lost" : row.far ? "far" : row.behind ? "behind" : row.hit === row.total ? "hit" : row.close ? "close" : row.ahead || row.hit ? "ahead" : "";
  return { parts, level };
}

function liveParlayHead(id, size) {
  const name = size > 1 ? `${size}-leg parlay` : "Parlay", row = liveParlays.get(id);
  if (!row) return { text: name, level: "" };
  const { parts, level } = liveParlaySay(row);
  return { text: [name, ...parts].join(" · "), level };
}
