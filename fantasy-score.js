/** Project fantasy points from Vegas player props + a Sleeper league's scoring_settings. */

function implied(odds) {
  const o = Number(odds);
  if (!Number.isFinite(o) || !o) return null;
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

function lineOf(text) {
  const hit = String(text || "").match(/(\d+(?:\.\d+)?)\s*\+/) || String(text || "").match(/\b(?:over|under)\s+(\d+(?:\.\d+)?)\b/i) || String(text || "").match(/(\d+(?:\.\d+)?)/);
  return hit ? Number(hit[1]) : null;
}

function isOver(text) {
  const t = String(text || "").toLowerCase();
  if (/\bunder\b/.test(t)) return false;
  return /\bover\b|\d+\s*\+/.test(t) || !/\bunder\b/.test(t);
}

function classifyProp(bet) {
  const blob = `${bet.market || ""} ${bet.label || ""}`.toLowerCase();
  if (/under|quarter|qtr|half|each|most|1st|first|minutes|double|triple|team total|alt\b|longest/.test(blob)) return null;
  // "20+ Yard Reception" is a catch length, not reception count.
  if (/\d+\s*\+?\s*yard reception|record a \d+\+?\s*yard reception/.test(blob)) return null;
  if (!isOver(blob)) return null;
  const line = lineOf(blob);
  const p = implied(bet.odds);
  if (/anytime|to score a (rushing |receiving )?td|touchdown scorer/.test(blob) && !/pass/.test(blob)) return { key: "anytime_td", line: 1, p, bet };
  if (/pass.*td|td.*pass|passing touchdown/.test(blob)) return { key: "pass_td", line: line ?? 0.5, p, bet };
  if (/rush.*td|td.*rush|rushing touchdown/.test(blob)) return { key: "rush_td", line: line ?? 0.5, p, bet };
  if (/rec.*td|td.*rec|receiving touchdown/.test(blob)) return { key: "rec_td", line: line ?? 0.5, p, bet };
  // Skip combo yards — "passing + rushing" / "rushing + receiving" are not single-stat medians.
  // Use \band\b so names like Loveland do not trip the combo filter.
  const combo = /\+|\&|\band\b/.test(blob);
  if (/pass.*(?:yard|yds?)|passing (?:yard|yds?)/.test(blob) && !combo) return { key: "pass_yd", line, p, bet };
  if (/rush.*(?:yard|yds?)|rushing (?:yard|yds?)/.test(blob) && !combo) return { key: "rush_yd", line, p, bet };
  if (/receiv.*(?:yard|yds?)|receiving (?:yard|yds?)/.test(blob) && !combo) return { key: "rec_yd", line, p, bet };
  if (/(?:total )?receptions?\b|\brecs?\b/.test(blob) && !/yard/.test(blob)) return { key: "rec", line, p, bet };
  return null;
}

function pickLine(rows) {
  if (!rows.length) return null;
  // Prefer a line priced near a coin flip — that's Vegas's median.
  // For receptions, ignore absurd lines left over from yard-catch props.
  const pool = rows[0] && rows[0].key === "rec"
    ? rows.filter((row) => Number(row.line) > 0 && Number(row.line) <= 12)
    : rows;
  const use = pool.length ? pool : rows;
  const ranked = use.slice().sort((a, b) => {
    const da = Math.abs((a.p || 0.5) - 0.5);
    const db = Math.abs((b.p || 0.5) - 0.5);
    return da - db || Number(a.line) - Number(b.line);
  });
  return ranked[0];
}

function expectedFromOver(row) {
  if (!row || !Number.isFinite(Number(row.line))) return null;
  const line = Number(row.line);
  const p = Number(row.p);
  // Over X.5 / X+ at price p ≈ P(stat > line). Median ≈ line when p≈0.5.
  // When the over is heavy favorite, bump expected above the line; underdog, pull under.
  if (!Number.isFinite(p)) return line;
  const bump = (p - 0.5) * Math.max(2, line * 0.08);
  return Math.max(0, line + bump);
}

function expectedTds(row) {
  if (!row) return 0;
  const line = Number(row.line);
  const p = Number(row.p);
  if (Number.isFinite(line) && line >= 1 && Number.isFinite(p)) {
    // "0.5+" / "Over 0.5" style: expected TDs ≈ p + small multi-TD tail.
    return Math.max(0, p * Math.max(line, 1) + Math.max(0, p - 0.55) * 0.35);
  }
  if (Number.isFinite(p)) return Math.max(0, p + Math.max(0, p - 0.5) * 0.4);
  return Number.isFinite(line) ? Math.max(0, line) : 0;
}

function rate(scoring, key, fallback) {
  const n = Number(scoring && scoring[key]);
  return Number.isFinite(n) ? n : fallback;
}

/** Sleeper projections often store KR/PR under def_*; leagues usually score kr_ or pr_ keys. */
const STAT_FALLBACKS = {
  kr_yd: ["def_kr_yd"],
  pr_yd: ["def_pr_yd"],
  kr_td: ["def_kr_td"],
  pr_td: ["def_pr_td"],
  def_kr_yd: ["kr_yd"],
  def_pr_yd: ["pr_yd"],
  def_kr_td: ["kr_td"],
  def_pr_td: ["pr_td"],
};

function statAmount(blob, key) {
  if (!blob || typeof blob !== "object") return null;
  const direct = Number(blob[key]);
  if (Number.isFinite(direct)) return direct;
  for (const alt of (STAT_FALLBACKS[key] || [])) {
    const n = Number(blob[alt]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function returnKeys(scoring) {
  return ["kr_yd", "pr_yd", "kr_td", "pr_td", "def_kr_yd", "def_pr_yd", "def_kr_td", "def_pr_td"]
    .filter((key) => Math.abs(rate(scoring, key, 0)) > 0.0001);
}

function n1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

function statKit(pos, scoring) {
  const role = String(pos || "").toUpperCase();
  const kit = [];
  const want = (key, fallback) => Math.abs(rate(scoring, key, fallback)) > 0.0001;
  if (role === "QB") {
    if (want("pass_yd", 0.04)) kit.push(["pass_yd", "Pass", "Pass yards"]);
    if (want("pass_td", 4)) kit.push(["pass_td", "PaTD", "Pass TDs"]);
    if (want("rush_yd", 0.1)) kit.push(["rush_yd", "Rush", "Rush yards"]);
    if (want("rush_td", 6)) kit.push(["rush_td", "RuTD", "Rush TDs"]);
    return kit;
  }
  if (role === "RB") {
    if (want("rush_yd", 0.1)) kit.push(["rush_yd", "Rush", "Rush yards"]);
    if (want("rush_td", 6)) kit.push(["rush_td", "RuTD", "Rush TDs"]);
    if (want("rec", 1)) kit.push(["rec", "Rec", "Receptions"]);
    if (want("rec_yd", 0.1)) kit.push(["rec_yd", "RecYd", "Rec yards"]);
    if (want("rec_td", 6)) kit.push(["rec_td", "ReTD", "Rec TDs"]);
  } else if (role === "WR" || role === "TE") {
    if (want("rec", 1)) kit.push(["rec", "Rec", "Receptions"]);
    if (want("rec_yd", 0.1)) kit.push(["rec_yd", "RecYd", "Rec yards"]);
    if (want("rec_td", 6)) kit.push(["rec_td", "ReTD", "Rec TDs"]);
    if (want("rush_yd", 0.1)) kit.push(["rush_yd", "Rush", "Rush yards"]);
    if (want("rush_td", 6)) kit.push(["rush_td", "RuTD", "Rush TDs"]);
  } else if (role !== "K" && role !== "DEF" && role !== "DST") {
    // Flex / unknown skill: show the common skill set.
    if (want("rush_yd", 0.1)) kit.push(["rush_yd", "Rush", "Rush yards"]);
    if (want("rec", 1)) kit.push(["rec", "Rec", "Receptions"]);
    if (want("rec_yd", 0.1)) kit.push(["rec_yd", "RecYd", "Rec yards"]);
    if (want("rush_td", 6)) kit.push(["rush_td", "RuTD", "Rush TDs"]);
    if (want("rec_td", 6)) kit.push(["rec_td", "ReTD", "Rec TDs"]);
  }
  // Return yards/TDs when the league scores them (Vegas rarely prices these).
  if (role !== "K" && role !== "DEF" && role !== "DST" && role !== "QB") {
    if (want("kr_yd", 0) || want("def_kr_yd", 0)) kit.push([want("kr_yd", 0) ? "kr_yd" : "def_kr_yd", "KR", "Kick return yards"]);
    if (want("pr_yd", 0) || want("def_pr_yd", 0)) kit.push([want("pr_yd", 0) ? "pr_yd" : "def_pr_yd", "PR", "Punt return yards"]);
    if (want("kr_td", 0) || want("def_kr_td", 0)) kit.push([want("kr_td", 0) ? "kr_td" : "def_kr_td", "KRTD", "Kick return TDs"]);
    if (want("pr_td", 0) || want("def_pr_td", 0)) kit.push([want("pr_td", 0) ? "pr_td" : "def_pr_td", "PRTD", "Punt return TDs"]);
  }
  return kit;
}

function projectPlayer(person, scoring, pos) {
  const bets = ((person && person.bets) || []).filter((bet) => /NFL/i.test(bet.sport || "NFL"));
  const buckets = {
    pass_yd: [], pass_td: [], rush_yd: [], rush_td: [], rec: [], rec_yd: [], rec_td: [], anytime_td: [],
  };
  bets.forEach((bet) => {
    const hit = classifyProp(bet);
    if (!hit || !buckets[hit.key]) return;
    if (hit.line == null && hit.key !== "anytime_td") return;
    buckets[hit.key].push(hit);
  });

  const pick = {
    pass_yd: pickLine(buckets.pass_yd),
    rush_yd: pickLine(buckets.rush_yd),
    rec_yd: pickLine(buckets.rec_yd),
    rec: pickLine(buckets.rec),
    pass_td: pickLine(buckets.pass_td),
    rush_td: pickLine(buckets.rush_td),
    rec_td: pickLine(buckets.rec_td),
    anytime_td: pickLine(buckets.anytime_td),
  };
  const passYd = expectedFromOver(pick.pass_yd);
  const rushYd = expectedFromOver(pick.rush_yd);
  const recYd = expectedFromOver(pick.rec_yd);
  const recs = expectedFromOver(pick.rec);
  const passTd = expectedTds(pick.pass_td);
  const rushTd = expectedTds(pick.rush_td);
  const recTd = expectedTds(pick.rec_td);
  const anytime = expectedTds(pick.anytime_td);

  // Fold anytime TD into the position's main TD bucket when no typed TD line exists.
  let rushTdUse = rushTd;
  let recTdUse = recTd;
  let passTdUse = passTd;
  let rushTdPick = pick.rush_td;
  let recTdPick = pick.rec_td;
  let passTdPick = pick.pass_td;
  const role = String(pos || "").toUpperCase();
  if (anytime > 0) {
    if (role === "QB" && !passTdUse) { passTdUse = anytime * 0.35; passTdPick = pick.anytime_td; }
    else if (role === "RB" && !rushTdUse) { rushTdUse = anytime; rushTdPick = pick.anytime_td; }
    else if ((role === "WR" || role === "TE") && !recTdUse) { recTdUse = anytime; recTdPick = pick.anytime_td; }
    else if (!rushTdUse && !recTdUse) {
      if (role === "RB") { rushTdUse = anytime; rushTdPick = pick.anytime_td; }
      else { recTdUse = anytime; recTdPick = pick.anytime_td; }
    }
  }

  const values = {
    pass_yd: passYd,
    pass_td: passTdUse || null,
    rush_yd: rushYd,
    rush_td: rushTdUse || null,
    rec: recs,
    rec_yd: recYd,
    rec_td: recTdUse || null,
  };
  const oddsOf = {
    pass_yd: pick.pass_yd && pick.pass_yd.bet ? pick.pass_yd.bet.odds : null,
    pass_td: passTdPick && passTdPick.bet ? passTdPick.bet.odds : null,
    rush_yd: pick.rush_yd && pick.rush_yd.bet ? pick.rush_yd.bet.odds : null,
    rush_td: rushTdPick && rushTdPick.bet ? rushTdPick.bet.odds : null,
    rec: pick.rec && pick.rec.bet ? pick.rec.bet.odds : null,
    rec_yd: pick.rec_yd && pick.rec_yd.bet ? pick.rec_yd.bet.odds : null,
    rec_td: recTdPick && recTdPick.bet ? recTdPick.bet.odds : null,
  };
  const ptsOf = {
    pass_yd: (passYd || 0) * rate(scoring, "pass_yd", 0.04),
    pass_td: (passTdUse || 0) * rate(scoring, "pass_td", 4),
    rush_yd: (rushYd || 0) * rate(scoring, "rush_yd", 0.1),
    rush_td: (rushTdUse || 0) * rate(scoring, "rush_td", 6),
    rec: (recs || 0) * rate(scoring, "rec", 1),
    rec_yd: (recYd || 0) * rate(scoring, "rec_yd", 0.1),
    rec_td: (recTdUse || 0) * rate(scoring, "rec_td", 6),
  };

  const kit = statKit(pos, scoring);
  const stats = kit.map(([key, short, label]) => {
    const amount = values[key];
    const pts = amount == null ? 0 : ptsOf[key];
    const odds = Number(oddsOf[key]);
    return {
      key,
      short,
      label,
      amount: amount == null ? null : +Number(amount).toFixed(2),
      pts: amount == null ? null : +Number(pts).toFixed(2),
      odds: Number.isFinite(odds) && odds ? odds : null,
      have: amount != null,
    };
  });

  const parts = stats.filter((row) => row.have).map((row) => ({
    label: row.label,
    amount: row.amount,
    pts: row.pts,
  }));
  const total = parts.reduce((sum, row) => sum + (row.pts || 0), 0);
  const props = bets
    .map((bet) => ({ label: bet.label, odds: bet.odds, market: bet.market, match: bet.match }))
    .filter((bet) => Number.isFinite(Number(bet.odds)))
    .slice(0, 12);

  const why = parts.map((row) => `${row.label} ~${n1(row.amount)} → ${n1(row.pts)} fantasy pts`);
  if (!parts.length) why.push("No Vegas props matched this player yet — projection is thin.");

  return {
    score: +Math.max(0, total).toFixed(1),
    why,
    stats,
    breakdown: parts,
    props,
    prop: null,
    method: "Vegas lines run through your league's scoring settings.",
  };
}

function rankOf(row) {
  const n = Number(row && (row.rankScore != null ? row.rankScore : row.score));
  return Number.isFinite(n) ? n : 0;
}

function flexFit(bench, starter) {
  const have = (starter.fantasy || []).map((p) => String(p).toUpperCase());
  return (bench.fantasy || []).some((pos) => {
    const want = String(pos).toUpperCase();
    if (have.includes(want)) return true;
    const flex = ["RB", "WR", "TE"];
    return flex.includes(want) && have.some((p) => flex.includes(p));
  });
}

function suggestSwaps(optimalStart, currentIds, players) {
  const byId = new Map((players || []).map((row) => [row.id, row]));
  const optimalIds = new Set((optimalStart || []).filter((row) => row && row.id && !row.empty).map((row) => String(row.id)));
  const current = (currentIds || []).map(String).filter((id) => byId.has(id));
  const onBench = (players || []).filter((row) => !current.includes(String(row.id)) && optimalIds.has(String(row.id)) && !row.ir && !row.out && !row.bye && !row.gameLocked);
  // Locked starters stay put — never suggest sitting them.
  const shouldSit = current
    .filter((id) => !optimalIds.has(id))
    .map((id) => byId.get(id))
    .filter((row) => row && !row.gameLocked && !row.ir && !row.bye);
  // Build all legal pairs, then pick the matching with the best total gain.
  // Stops "Smith over Moore" + "Washington over Mayer" when Moore is better than Washington.
  const pairs = [];
  onBench.forEach((bench) => {
    shouldSit.forEach((victim) => {
      if (!flexFit(bench, victim)) return;
      const gain = +(rankOf(bench) - rankOf(victim)).toFixed(1);
      if (gain < 0.4) return;
      // Never sit someone who ranks above the player coming in.
      if (rankOf(victim) >= rankOf(bench)) return;
      pairs.push({ bench, victim, gain });
    });
  });
  pairs.sort((a, b) => b.gain - a.gain || a.victim.name.localeCompare(b.victim.name));
  const usedIn = new Set();
  const usedOut = new Set();
  const swaps = [];
  pairs.forEach((pair) => {
    if (usedIn.has(pair.bench.id) || usedOut.has(pair.victim.id)) return;
    // If this victim still ranks above any other unused incoming, skip — sit the weaker starter instead.
    const strongerThanOtherIns = onBench.some((other) => (
      !usedIn.has(other.id)
      && other.id !== pair.bench.id
      && rankOf(pair.victim) >= rankOf(other)
      && flexFit(other, pair.victim)
    ));
    if (strongerThanOtherIns) return;
    usedIn.add(pair.bench.id);
    usedOut.add(pair.victim.id);
    swaps.push({
      in: { id: pair.bench.id, name: pair.bench.name, pos: pair.bench.pos, score: rankOf(pair.bench) },
      out: { id: pair.victim.id, name: pair.victim.name, pos: pair.victim.pos, score: rankOf(pair.victim) },
      gain: pair.gain,
      text: `Start ${pair.bench.name} over ${pair.victim.name} (+${pair.gain} pts)`,
    });
  });
  return swaps.slice(0, 5);
}

module.exports = { projectPlayer, suggestSwaps, classifyProp, implied, statKit, rate, statAmount, returnKeys, STAT_FALLBACKS };
