/** FanDuel prices a half yard above the lines on a bet. */

const AK = "FhMFpcPWXMeyZxOx";
const cache = new Map();

function whoOf(text) {
  return String(text || "").split(/\d/)[0].replace(/\b(over|under|alt|alternate)\b/ig, " ").replace(/[-:]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function statOf(text) {
  const low = String(text || "").toLowerCase();
  if (/receiv/.test(low) && /yard|\byds?\b/.test(low)) return "receiving";
  if (/rush/.test(low) && /yard|\byds?\b/.test(low)) return "rushing";
  if (/pass/.test(low) && /yard|\byds?\b/.test(low)) return "passing";
  if (/reception/.test(low)) return "receptions";
  if (/rebound/.test(low)) return "rebounds";
  if (/strikeout/.test(low)) return "strikeouts";
  if (/assist/.test(low)) return "assists";
  if (/shot/.test(low)) return "shots";
  if (/point/.test(low)) return "points";
  return "";
}

function scoped(text) {
  return /\b(1st|2nd|3rd|4th)\s+(qtr|quarter|half|period)\b/i.test(String(text || ""));
}

function numOf(value) {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(n);
}

function shown(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function chance(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return "";
  const p = n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
  return `${(p * 100).toFixed(1)}%`;
}

function joinBits(bits) {
  if (bits.length < 2) return bits[0] || "";
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`;
  return `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
}

function priceOf(oddsList, bits) {
  if (!oddsList.length || oddsList.some((odds) => !Number.isFinite(Number(odds)))) return null;
  let decimal = 1;
  oddsList.forEach((odds) => {
    const n = Number(odds);
    decimal *= n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  });
  const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
  return {
    price: shown(american),
    pct: chance(american),
    profit: (Math.round(5 * (decimal - 1) * 100) / 100).toFixed(2),
    bits: joinBits(bits),
  };
}

function retitle(label, from, to, plus) {
  const head = String(label || "").split(" — ")[0];
  const next = plus ? `${numOf(to)}+` : numOf(to);
  const token = `${numOf(from)}+`;
  if (head.includes(token)) return head.replace(token, next);
  return `${head} ${next}`;
}

async function eventPage(id, tab) {
  const url = `https://sbapi.nj.sportsbook.fanduel.com/api/event-page?eventId=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}&_ak=${AK}&timezone=America/New_York`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      Referer: "https://sportsbook.fanduel.com/",
    },
  });
  if (!response.ok) throw new Error("FanDuel did not answer.");
  return response.json();
}

function propTabs(layout) {
  const tabs = (layout && layout.tabs) || {};
  const words = ["prop", "point", "three", "rebound", "assist", "goal", "shot", "batter", "pitcher", "scorer", "hit", "combo"];
  const slugs = [];
  ((layout && layout.tabsDisplayOrder) || []).forEach((id) => {
    const low = String((tabs[id] || {}).title || "").toLowerCase();
    if (!words.some((word) => low.includes(word))) return;
    if (["quarter", "half", "period", "margin", "same game"].some((word) => low.includes(word)) && !low.includes("prop") && !low.includes("player")) return;
    const slug = low.replace(/™/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  });
  return slugs;
}

function readRows(id, data) {
  const rows = [];
  Object.values((data.attachments || {}).markets || {}).forEach((market) => {
    if (!market || String(market.eventId || "") !== String(id)) return;
    if (String(market.marketStatus || "OPEN").toUpperCase() !== "OPEN") return;
    const name = String(market.marketName || "");
    (market.runners || []).forEach((runner) => {
      const runnerName = String(runner.runnerName || "").trim();
      const plus = (runnerName.match(/(\d+(?:\.\d+)?)\+/) || [])[1];
      const raw = (((runner.winRunnerOdds || {}).americanDisplayOdds || {}).americanOdds);
      const odds = Number.parseInt(raw, 10);
      if (!Number.isFinite(odds)) return;
      rows.push({
        market: name,
        runner: runnerName,
        who: whoOf(runnerName),
        stat: statOf(`${name} ${runnerName}`),
        scope: scoped(`${name} ${runnerName}`),
        plus: plus == null ? null : Number(plus),
        handicap: runner.handicap == null ? null : Number(runner.handicap),
        over: /\bover\b/i.test(runnerName),
        odds,
      });
    });
  });
  return rows;
}

async function menu(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 120000) return hit.rows;
  const first = await eventPage(id, "popular");
  const pages = [first];
  const rest = await Promise.all(propTabs(first.layout).map((slug) => eventPage(id, slug).catch(() => null)));
  rest.forEach((page) => { if (page) pages.push(page); });
  const rows = pages.flatMap((page) => readRows(id, page));
  cache.set(id, { at: Date.now(), rows });
  return rows;
}

function matchLeg(leg, rows) {
  const text = `${leg.market || ""} ${leg.runner || ""} ${leg.label || ""}`;
  const who = whoOf(leg.runner || leg.label || "");
  const stat = statOf(text);
  const scope = scoped(text);
  const plus = Number((String(leg.runner || leg.label || "").match(/(\d+(?:\.\d+)?)\+/) || [])[1]);
  const head = String(leg.label || leg.runner || "").split(" — ")[0];
  if (!who || !Number.isFinite(plus)) {
    return { half: head, skip: true };
  }
  const pool = rows.filter((row) => row.plus != null && row.who === who && row.stat === stat && row.scope === scope);
  const here = pool.find((row) => row.plus === plus);
  const next = pool.filter((row) => row.plus > plus).sort((a, b) => a.plus - b.plus)[0];
  const halfRow = pool.find((row) => row.plus === plus + 0.5) || rows.find((row) => (
    row.over && row.who === who && row.stat === stat && row.scope === scope && row.handicap === plus + 0.5
  ));
  const hereOdds = here ? here.odds : Number(leg.odds);
  return {
    half: retitle(head, plus, plus + 0.5, false),
    halfOdds: halfRow ? halfRow.odds : null,
    halfPct: halfRow ? chance(halfRow.odds) : "",
    here: retitle(head, plus, plus, true),
    hereOdds: Number.isFinite(hereOdds) ? hereOdds : null,
    herePct: chance(hereOdds),
    hereBit: `${numOf(plus)}+`,
    next: next ? retitle(head, plus, next.plus, true) : "",
    nextOdds: next ? next.odds : null,
    nextPct: next ? chance(next.odds) : "",
    nextBit: next ? `${numOf(next.plus)}+` : "",
  };
}

async function halfBet(body) {
  const legs = (Array.isArray(body.legs) ? body.legs : []).filter((leg) => leg && typeof leg === "object").slice(0, 12);
  if (!legs.length) throw new Error("That bet has no lines.");
  const ids = [...new Set(legs.map((leg) => String(leg.gameId || "")).filter(Boolean))];
  if (!ids.length) throw new Error("This bet has no FanDuel game to check.");
  const menus = new Map();
  await Promise.all(ids.map(async (id) => { menus.set(id, await menu(id)); }));
  const rows = legs.map((leg) => matchLeg(leg, menus.get(String(leg.gameId || "")) || []));
  const kept = rows.filter((row) => !row.skip);
  if (!kept.length) throw new Error("These lines have no number to move up by half a yard.");
  const missing = kept.some((row) => row.halfOdds == null);
  const now = priceOf(kept.map((row) => row.hereOdds), kept.map((row) => row.hereBit));
  const next = kept.every((row) => row.nextOdds != null) ? priceOf(kept.map((row) => row.nextOdds), kept.map((row) => row.nextBit)) : null;
  const half = kept.every((row) => row.halfOdds != null) ? priceOf(kept.map((row) => row.halfOdds), kept.map((row) => (row.half.match(/(\d+(?:\.\d+)?)/) || [])[1] || "half")) : null;
  return { rows: kept, missing, now, next, half };
}

module.exports = { halfBet };
