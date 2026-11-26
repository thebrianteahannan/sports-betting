/** FanDuel prices from each pull, kept until a week after kickoff. A new price is written when the number changes. */

const KEY = "bets/price-log/";
const WEEK = 7 * 86400000;
const POINTS = 16;
const PROPS = 4000;

const chains = new Map();
const seeded = new Set();
let books = [];

function hold(rows) {
  const next = [];
  (rows || []).forEach((row) => {
    const game = row && row.v ? row.v : row;
    if (game && game.props) next.push(game);
  });
  if (next.length) books = next;
}

function holdOne(book) {
  if (!book || !book.props) return;
  const id = String(book.id || "");
  books = books.filter((game) => String(game.id || "") !== id);
  books.push(book);
}

function implied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function propKey(row) {
  const label = String(row && (row.label || row.runner) || "").trim();
  const odds = Number(row && row.odds);
  if (!label || !Number.isFinite(odds) || !odds) return "";
  return `${label}\u0001${String(row.market || "")}`;
}

function apply(book, game, rows, now) {
  const id = String(game && game.id || "");
  const next = book && typeof book === "object" ? book : { id, props: {} };
  next.id = id;
  next.match = String(game && game.match || next.match || "");
  next.kickoff = String(game && game.kickoff || next.kickoff || "");
  next.sport = String(game && game.sport || next.sport || "");
  if (!next.props || typeof next.props !== "object") next.props = {};
  const seen = new Map();
  (rows || []).forEach((row) => {
    const key = propKey(row);
    if (key) seen.set(key, Number(row.odds));
  });
  let dirty = false;
  seen.forEach((odds, key) => {
    let series = next.props[key];
    if (!series) {
      if (Object.keys(next.props).length >= PROPS) return;
      series = [];
      next.props[key] = series;
    }
    const last = series[series.length - 1];
    if (last && last[0] === odds) return;
    series.push([odds, now]);
    if (series.length > POINTS) next.props[key] = [series[0], ...series.slice(-(POINTS - 1))];
    dirty = true;
  });
  if (!dirty) return { book: next, dirty: false };
  next.at = now;
  return { book: next, dirty: true };
}

function priceText(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function pctText(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function whenText(at) {
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function modelOf(pick) {
  if (!pick) return null;
  const { edgePull, matchupUse } = require("./bet-kind");
  const pull = edgePull(pick.hits, pick.n);
  if (!pull) return null;
  const moved = matchupUse(pull.pulled, pick.matchupShift);
  return moved ? moved.used : pull.pulled;
}

function readOf(pick) {
  if (!pick || pick.tier === "good" || !pick.how) return null;
  const { ranHot } = require("./bet-kind");
  return {
    tier: pick.tier || "rec",
    hits: pick.hits,
    n: pick.n,
    need: pick.need,
    odds: pick.odds,
    how: pick.how,
    role: pick.role || "",
    cushion: !!pick.cushion,
    hot: ranHot(pick),
    matchupShift: Number(pick.matchupShift) || 0,
    matchupNote: pick.matchupNote || "",
    fair: pick.fairEx ? Number(pick.fair) : null,
    fairEx: !!pick.fairEx,
    fairBooks: pick.fairBooks || null,
  };
}

function stepSay(prev, next, kickoff, ctx, prior) {
  const from = implied(prev[0]);
  const to = implied(next[0]);
  const points = Math.round((to - from) * 1000) / 10;
  if (!points) return null;
  const pay = `Pays ${Math.abs(points).toFixed(1)} points ${points > 0 ? "less" : "more"}.`;
  const fair = ctx && Number(ctx.fair);
  const model = ctx && Number(ctx.model);
  const haveFair = fair > 0 && fair < 1;
  const haveModel = model > 0 && model < 1;
  const booksNear = haveFair && Math.abs(to - fair) + 0.002 < Math.abs(from - fair);
  const oursNear = haveModel && Math.abs(to - model) + 0.002 < Math.abs(from - model);
  let cause = "";
  if (haveFair && haveModel) {
    if (booksNear && oursNear) cause = `Toward our ${pctText(model)} and the books at ${pctText(fair)}.`;
    else if (booksNear) cause = `Toward the books at ${pctText(fair)}, away from our ${pctText(model)}.`;
    else if (oursNear) cause = `Toward our ${pctText(model)}, away from the books at ${pctText(fair)}.`;
    else cause = `Away from our ${pctText(model)} and the books at ${pctText(fair)}.`;
  } else if (haveFair) cause = booksNear ? `Toward the books at ${pctText(fair)}.` : `Away from the books at ${pctText(fair)}.`;
  else if (haveModel) cause = oursNear ? `Toward our ${pctText(model)}.` : `Away from our ${pctText(model)}.`;
  else if (prior) cause = prior > 0 === points > 0 ? "" : "Turned.";
  return {
    at: next[1],
    odds: next[0],
    points,
    text: `${whenText(next[1])}. ${priceText(prev[0])} to ${priceText(next[0])}. ${pay}${cause ? ` ${cause}` : ""}`,
  };
}

function sameBet(move, pick) {
  if (!move || !pick || (move.match || "") !== (pick.match || "")) return false;
  const a = String(move.label || "").toLowerCase().trim();
  const b = String(pick.label || "").toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

function stepsOf(series, game, ctx) {
  const steps = [];
  let prior = 0;
  for (let i = 1; i < series.length; i += 1) {
    const step = stepSay(series[i - 1], series[i], game.kickoff, ctx, prior);
    if (!step) continue;
    steps.push(step);
    prior = step.points;
  }
  return steps;
}

function moveOf(label, series, game) {
  if (!series || series.length < 2) return null;
  const first = series[0][0];
  const last = series[series.length - 1][0];
  const prev = series[series.length - 2][0];
  const open = implied(first);
  const shut = implied(last);
  const prior = implied(prev);
  if (!(open > 0) || !(shut > 0) || !(prior > 0)) return null;
  if (Math.abs(first) > 400 || Math.abs(last) > 400) return null;
  const points = Math.round((shut - open) * 1000) / 10;
  const step = Math.round((shut - prior) * 1000) / 10;
  if (Math.abs(points) < 1) return null;
  const name = label.split("\u0001")[0];
  return {
    label: name,
    market: label.split("\u0001")[1] || "",
    match: game.match || "",
    kickoff: game.kickoff || "",
    sport: game.sport || "",
    first,
    last,
    points,
    step,
    n: series.length,
    at: series[series.length - 1][1],
    trend: points === 0 || step === 0 ? false : points > 0 === step > 0,
  };
}

async function write(game, rows, at) {
  const id = String(game && game.id || "");
  if (!id) return;
  const now = Number(at) || Date.now();
  const kick = Date.parse(game && game.kickoff || "");
  const { kv } = require("./live-recs");
  if (Number.isFinite(kick) && now - kick > WEEK) {
    await kv(`?k=eq.${encodeURIComponent(KEY + id)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
    return;
  }
  const found = await kv(`?k=eq.${encodeURIComponent(KEY + id)}&select=v`);
  const saved = found && found[0] && found[0].v;
  const made = apply(saved, game, rows, now);
  holdOne(made.book);
  if (!made.dirty) return;
  await kv("", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { k: KEY + id, v: made.book } });
}

function note(game, rows, at) {
  const id = String(game && game.id || "");
  if (!id || !Array.isArray(rows) || !rows.length) return Promise.resolve();
  const run = (chains.get(id) || Promise.resolve()).then(() => write(game, rows, at));
  const safe = run.catch((error) => console.error("price log failed:", game && game.match, error));
  chains.set(id, safe);
  return safe;
}

async function seed(board) {
  const games = ((board && board.games) || []).filter((game) => game && game.id);
  const { kv } = require("./live-recs");
  let n = 0;
  for (const game of games) {
    const id = String(game.id);
    if (seeded.has(id) || n >= 8) continue;
    const have = await kv(`?k=eq.${encodeURIComponent(KEY + id)}&select=k`);
    if (have && have.length) { seeded.add(id); continue; }
    const found = await kv(`?k=eq.${encodeURIComponent(`bets/props/${id}`)}&select=v`);
    const saved = found && found[0] && found[0].v;
    const rows = saved && saved.rows;
    if (!Array.isArray(rows) || !rows.length) continue;
    seeded.add(id);
    n += 1;
    await note(game, rows, saved.at);
  }
}

async function prune() {
  const { kv } = require("./live-recs");
  const rows = await kv(`?k=like.${encodeURIComponent(KEY)}*&select=k,v`);
  hold(rows);
  const now = Date.now();
  for (const row of rows || []) {
    const kick = Date.parse(row && row.v && row.v.kickoff || "");
    const at = Number(row && row.v && row.v.at);
    const old = (Number.isFinite(kick) && now - kick > WEEK) || (!Number.isFinite(kick) && Number.isFinite(at) && now - at > WEEK);
    if (!old || !row.k) continue;
    books = books.filter((game) => game !== row.v);
    await kv(`?k=eq.${encodeURIComponent(row.k)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  }
}

async function movers() {
  const { kv, recsList } = require("./live-recs");
  const picks = await recsList().catch(() => []);
  const rows = await kv(`?k=like.${encodeURIComponent(KEY)}*&select=v`);
  hold(rows);
  const now = Date.now();
  const bag = [];
  let tracked = 0;
  (rows || []).forEach((row) => {
    const game = row && row.v;
    if (!game || !game.props) return;
    const kick = Date.parse(game.kickoff || "");
    if (Number.isFinite(kick) && kick <= now) return;
    Object.entries(game.props).forEach(([label, series]) => {
      if (series && series.length) tracked += 1;
      const move = moveOf(label, series, game);
      if (move) bag.push({ move, series, game });
    });
  });
  bag.sort((a, b) => Number(b.move.trend) - Number(a.move.trend) || Math.abs(b.move.points) - Math.abs(a.move.points) || b.move.at - a.move.at);
  const seen = new Set();
  const kept = [];
  bag.forEach((item, index) => {
    const pick = (picks || []).find((row) => sameBet(item.move, row));
    if (index >= 24 && !pick) return;
    const key = `${item.move.label}|${item.move.match}`;
    if (seen.has(key)) return;
    seen.add(key);
    const exact = pick && String(item.move.label || "").toLowerCase().trim() === String(pick.label || "").toLowerCase().trim();
    const ctx = pick ? { fair: pick.fairEx ? Number(pick.fair) : null, model: modelOf(pick) } : null;
    item.move.series = item.series.map(([odds, at]) => ({ odds, at }));
    item.move.steps = stepsOf(item.series, item.game, ctx);
    if (ctx && ctx.model) item.move.model = ctx.model;
    if (exact) {
      const read = readOf(pick);
      if (read) item.move.read = read;
    }
    kept.push(item.move);
  });
  return { tracked, rows: kept };
}

async function tick(board) {
  await seed(board).catch((error) => console.error("price log seed failed:", error));
  await prune().catch((error) => console.error("price log prune failed:", error));
}

function historyFold(text) {
  return String(text || "").toLowerCase().replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
}

function historyWho(text) {
  return historyFold(text).split(/\d/)[0].replace(/\s+(over|under)\b.*$/, "").replace(/\s+[—-].*$/, "").trim();
}

function historyLine(text) {
  const hit = String(text || "").match(/\d+(?:\.\d+)?/);
  return hit ? Number(hit[0]) : null;
}

async function history(want) {
  const who = historyWho(want && want.label);
  const market = historyFold(want && want.market);
  const match = historyFold(want && want.match);
  const line = historyLine(`${want && want.label || ""} ${want && want.market || ""}`);
  if (!who) return { series: [] };
  let best = null;
  books.forEach((game) => {
    if (!game || !game.props) return;
    const gameMatch = historyFold(game.match);
    if (match && gameMatch && match !== gameMatch && !gameMatch.includes(match) && !match.includes(gameMatch)) return;
    Object.entries(game.props).forEach(([key, series]) => {
      const parts = String(key).split("\u0001");
      if (historyWho(parts[0]) !== who) return;
      const kind = historyFold(parts[1] || "");
      if (market && kind && kind !== market && !kind.includes(market) && !market.includes(kind)) return;
      const theirs = historyLine(parts[0]);
      if (line != null && theirs != null && Math.abs(line - theirs) > 1) return;
      const score = (series || []).length + (market && kind ? 20 : 0) + (line != null && theirs != null ? 10 : 0);
      if (!best || score > best.score) best = { score, series: series || [] };
    });
  });
  return { series: ((best && best.series) || []).map(([odds, at]) => ({ odds, at })) };
}

function prime() {
  const { kv } = require("./live-recs");
  return kv(`?k=like.${encodeURIComponent(KEY)}*&select=v`).then((rows) => { hold(rows); }).catch(() => {});
}

module.exports = { note, movers, tick, apply, moveOf, stepSay, history, prime };
