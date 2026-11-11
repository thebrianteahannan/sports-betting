/** Grade a saved parlay from ESPN box scores once every game in it is final. */

const PATHS = { NFL: "football/nfl", NBA: "basketball/nba", NHL: "hockey/nhl", MLB: "baseball/mlb", WNBA: "basketball/wnba", NCAAF: "football/college-football", NCAAB: "basketball/mens-college-basketball" };
const { reviewGame, legWhy, teamWhy } = require("./game-review");
const cache = new Map();
const etDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const PART = /quarter|\bqtr\b|half|period|\b(1st|2nd|3rd|4th)\b|\b(first|last|each|most)\b|minutes|\bmin\b|special|correct score|winning at end|race to|odd\/even|margin|yard reception|longest|parlay|&|second goal|third goal|to record/i;

async function getJson(url, keep) {
  const hit = cache.get(url);
  if (hit && (hit.keep || Date.now() - hit.at < 120000)) return hit.data;
  let data = null;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
    data = res.ok ? await res.json() : null;
  } catch (error) { data = null; }
  if (cache.size > 400) cache.clear();
  cache.set(url, { at: Date.now(), data, keep: Boolean(data && keep && keep(data)) });
  return data;
}

function words(text) {
  return String(text || "").toLowerCase().replace(/\./g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((part) => part && !["jr", "sr", "ii", "iii", "iv"].includes(part));
}

function samePlayer(a, b) {
  const left = words(a), right = words(b);
  return Boolean(left.length && right.length && left[left.length - 1] === right[right.length - 1] && left[0][0] === right[0][0]);
}

function teamHit(team, text) {
  const blob = String(text || "").toLowerCase();
  return [team.name, team.nick, team.abbr].some((bit) => bit && bit.length > 1 && new RegExp(`(^|[^a-z])${bit.toLowerCase().replace(/[^a-z0-9 ]/g, "")}([^a-z]|$)`).test(blob.replace(/[^a-z0-9 ]/g, " ")));
}

function game(summary) {
  const comp = (((summary || {}).header || {}).competitions || [])[0] || {};
  const type = (comp.status || {}).type || {};
  const teams = (comp.competitors || []).map((side) => {
    const team = side.team || {};
    return { name: team.displayName || "", nick: team.name || String(team.displayName || "").split(" ").pop(), abbr: team.abbreviation || "", home: side.homeAway === "home", score: Number(side.score) };
  });
  return { final: Boolean(type.completed) || type.state === "post", teams };
}

async function summaryOf(leg) {
  const path = PATHS[String(leg.sport || "").toUpperCase()];
  const kick = Date.parse(leg.kickoff || "");
  const [away, home] = String(leg.match || "").split(/\s@\s/);
  if (!path || !Number.isFinite(kick) || !home) return null;
  const day = etDay.format(kick).replace(/-/g, "");
  const board = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}`);
  const nick = (name) => words(name).pop();
  const event = ((board || {}).events || []).find((row) => {
    const sides = (((row.competitions || [])[0] || {}).competitors || []).map((side) => words((side.team || {}).displayName).pop());
    return sides.includes(nick(away)) && sides.includes(nick(home));
  });
  if (!event) return null;
  return getJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${event.id}`, (data) => game(data).final);
}

function playerRow(summary, name) {
  const stats = {};
  let seen = false;
  for (const team of ((summary || {}).boxscore || {}).players || []) {
    for (const block of team.statistics || []) {
      const keys = block.keys || [];
      const pitch = keys.includes("ERA") || keys.includes("fullInnings.partInnings");
      for (const one of block.athletes || []) {
        if (!samePlayer((one.athlete || {}).displayName, name)) continue;
        if (!one.didNotPlay && (one.stats || []).length) seen = true;
        keys.forEach((key, at) => {
          const num = parseFloat(String((one.stats || [])[at] ?? "").split(/[-/]/)[0]);
          if (Number.isFinite(num)) stats[`${pitch ? "p_" : ""}${key.split(/[-/]/)[0]}`] = num;
        });
      }
    }
  }
  return seen ? stats : null;
}

function statOf(sport, text, s) {
  const has = (re) => re.test(text);
  if (/NBA|WNBA|NCAAB/.test(sport)) {
    if (has(/double double|triple double/)) return [s.points, s.rebounds, s.assists, s.steals, s.blocks].filter((n) => n >= 10).length;
    const parts = [has(/\bpts\b|point/) && s.points, has(/\breb|rebound/) && s.rebounds, has(/\bast\b|assist/) && s.assists, has(/three/) && s.threePointFieldGoalsMade, has(/steal/) && s.steals, has(/block/) && s.blocks].filter((n) => n !== false);
    return parts.length ? parts.reduce((a, n) => a + (n || 0), 0) : null;
  }
  if (/NFL|NCAAF/.test(sport)) {
    if (has(/rushing \+ receiving|rush \+ rec/)) return (s.rushingYards || 0) + (s.receivingYards || 0);
    if (has(/passing td|passing touchdown/)) return s.passingTouchdowns || 0;
    if (has(/touchdown|\btd\b/)) return (s.rushingTouchdowns || 0) + (s.receivingTouchdowns || 0);
    if (has(/passing y/)) return s.passingYards || 0;
    if (has(/rushing y/)) return s.rushingYards || 0;
    if (has(/receiving y/)) return s.receivingYards || 0;
    if (has(/reception/)) return s.receptions || 0;
    return null;
  }
  if (sport === "NHL") {
    if (has(/shot/)) return s.shotsTotal || 0;
    if (has(/point/)) return (s.goals || 0) + (s.assists || 0);
    if (has(/assist/)) return s.assists || 0;
    if (has(/goal/)) return s.goals || 0;
    return null;
  }
  if (sport === "MLB") {
    if (has(/strikeout/)) return s.p_strikeouts ?? s.strikeouts ?? null;
    if (has(/home run/)) return s.homeRuns || 0;
    if (has(/\brbi/)) return s.RBIs || 0;
    if (has(/\bhits?\b/)) return s.hits || 0;
    if (has(/\bruns?\b/)) return s.runs || 0;
  }
  return null;
}

function aim(text) {
  const plus = text.match(/(\d+(?:\.\d+)?)\s*\+/), over = text.match(/\bover\s*\(?\s*(\d+(?:\.\d+)?)/i), under = text.match(/\bunder\s*\(?\s*(\d+(?:\.\d+)?)/i);
  if (over) return { side: "over", line: Number(over[1]) };
  if (under) return { side: "under", line: Number(under[1]) };
  if (plus) return { side: "plus", line: Number(plus[1]) };
  return null;
}

function judge(have, want) {
  if (want.side === "plus") return have >= want.line ? "won" : "lost";
  if (have === want.line) return "push";
  return (have > want.line) === (want.side === "over") ? "won" : "lost";
}

function teamLeg(leg, info) {
  const market = String(leg.market || "").trim(), label = String(leg.label || "").trim();
  const rest = label.replace(/^[^:]*:\s*/, ""), head = label.includes(":") ? label.split(":")[0] : "";
  const score = info.teams.map((team) => `${team.abbr || team.nick} ${team.score}`).join(", ");
  if (/^(total|alternate total( points| goals| runs)?|total (points|goals|runs))$/i.test(market)) {
    const want = aim(rest), have = info.teams.reduce((a, team) => a + team.score, 0);
    return want && { result: judge(have, want), have, note: `${have} total, ${score}`, text: `${rest} total` };
  }
  if (/total/i.test(market) && !PART.test(market)) {
    const team = info.teams.find((one) => teamHit(one, head || market)), want = aim(rest);
    if (!team || !want) return null;
    return { result: judge(team.score, want), have: team.score, note: `${team.nick} ${team.score}`, text: `${team.nick} ${rest} team total` };
  }
  if (/^(spread|alternate spread|puck line|alternate puck line|run line|alternate run line)$/i.test(market)) {
    const team = info.teams.find((one) => teamHit(one, label)), num = label.match(/\(?([+-]\d+(?:\.\d+)?)\)?/);
    const other = team && info.teams.find((one) => one !== team);
    if (!team || !other || !num) return null;
    const diff = team.score + Number(num[1]) - other.score;
    return { result: diff > 0 ? "won" : diff < 0 ? "lost" : "push", have: team.score - other.score, note: score, text: label.replace(/\s*spread$/i, "") };
  }
  if (/^moneyline$/i.test(market)) {
    const team = info.teams.find((one) => teamHit(one, label)), other = team && info.teams.find((one) => one !== team);
    if (!team || !other) return null;
    return { result: team.score > other.score ? "won" : team.score < other.score ? "lost" : "push", have: team.score - other.score, note: score, text: `${team.nick} to win` };
  }
  return null;
}

function playerLeg(leg, summary) {
  const label = String(leg.label || "").trim(), market = String(leg.market || "").trim();
  const name = label.includes(" - ") ? label.split(" - ")[0] : label.split(/\s+(?=over\b|under\b|\d)/i)[0];
  const text = `${market} ${label}`.toLowerCase().split(name.toLowerCase()).join(" ");
  const shown = /\d\s*$/.test(label) && market.includes(" - ") ? `${label} ${market.split(" - ").pop().replace(/^alt\s+/i, "")}` : label;
  if (PART.test(text) || !name.trim() || name.includes(":")) return null;
  const sport = String(leg.sport || "").toUpperCase();
  const anytime = /any ?time|to score/.test(text) && /touchdown|\btd\b|goal/.test(text);
  const want = aim(text) || (anytime || /double double|triple double/.test(text) ? { side: "plus", line: 1 } : null);
  if (!want) return null;
  const row = playerRow(summary, name);
  if (!row) return { result: "void", note: "Did not play", text: shown, player: name };
  const have = statOf(sport, text, row);
  if (have == null) return null;
  return { result: judge(have, want), have, note: String(have), text: shown, player: name };
}

async function gradeParlay(row, now = Date.now()) {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  if (!legs.length || legs.some((leg) => !(Date.parse(leg.kickoff || "") < now - 2 * 3600000))) return null;
  const graded = [], reviews = {};
  for (const leg of legs) {
    const summary = await summaryOf(leg), info = game(summary);
    const stale = Date.parse(leg.kickoff) < now - 36 * 3600000;
    if (!info.final && !stale) return null;
    const out = info.final ? (teamLeg(leg, info) || (info.teams.length ? playerLeg(leg, summary) : null)) : null;
    const review = info.final ? await reviewGame(leg, summary) : null;
    if (review && review.key) reviews[review.key] = review;
    const done = { ...leg, result: (out && out.result) || "check", have: out ? out.have : undefined, note: (out && out.note) || "", text: (out && out.text) || String(leg.label || "").replace(/^[^:]*:\s*/, "") };
    done.why = !out || !review ? "" : out.player ? legWhy(done, review, out.player) : teamWhy(done, review);
    graded.push(done);
  }
  const res = graded.map((leg) => leg.result);
  const result = res.includes("lost") ? "lost" : res.includes("check") ? "check" : res.every((one) => one === "push" || one === "void") ? "push" : "won";
  const last = Math.max(...legs.map((leg) => Date.parse(leg.kickoff)));
  const leagues = [...new Set(legs.map((leg) => String(leg.sport || "").toUpperCase()).filter(Boolean))];
  return { ...row, legs: graded, done: { at: now, v: 2, result, day: etDay.format(last), league: leagues.length === 1 ? leagues[0] : "Mixed" }, reviews };
}

module.exports = { gradeParlay };
