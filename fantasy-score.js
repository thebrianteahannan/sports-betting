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
  if (!isOver(blob)) return null;
  const line = lineOf(blob);
  const p = implied(bet.odds);
  if (/anytime|to score a (rushing |receiving )?td|touchdown scorer/.test(blob) && !/pass/.test(blob)) return { key: "anytime_td", line: 1, p, bet };
  if (/pass.*td|td.*pass|passing touchdown/.test(blob)) return { key: "pass_td", line: line ?? 0.5, p, bet };
  if (/rush.*td|td.*rush|rushing touchdown/.test(blob)) return { key: "rush_td", line: line ?? 0.5, p, bet };
  if (/rec.*td|td.*rec|receiving touchdown/.test(blob)) return { key: "rec_td", line: line ?? 0.5, p, bet };
  if (/pass.*(?:yard|yds?)|passing (?:yard|yds?)/.test(blob)) return { key: "pass_yd", line, p, bet };
  if (/rush.*(?:yard|yds?)|rushing (?:yard|yds?)/.test(blob)) return { key: "rush_yd", line, p, bet };
  if (/receiv.*(?:yard|yds?)|receiving (?:yard|yds?)/.test(blob)) return { key: "rec_yd", line, p, bet };
  if (/reception|\brecs?\b/.test(blob)) return { key: "rec", line, p, bet };
  return null;
}

function pickLine(rows) {
  if (!rows.length) return null;
  // Prefer a line priced near a coin flip — that's Vegas's median.
  const ranked = rows.slice().sort((a, b) => {
    const da = Math.abs((a.p || 0.5) - 0.5);
    const db = Math.abs((b.p || 0.5) - 0.5);
    return da - db || Number(b.line) - Number(a.line);
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
    return kit;
  }
  if (role === "WR" || role === "TE") {
    if (want("rec", 1)) kit.push(["rec", "Rec", "Receptions"]);
    if (want("rec_yd", 0.1)) kit.push(["rec_yd", "RecYd", "Rec yards"]);
    if (want("rec_td", 6)) kit.push(["rec_td", "ReTD", "Rec TDs"]);
    if (want("rush_yd", 0.1)) kit.push(["rush_yd", "Rush", "Rush yards"]);
    if (want("rush_td", 6)) kit.push(["rush_td", "RuTD", "Rush TDs"]);
    return kit;
  }
  // Flex / unknown skill: show the common skill set.
  if (role !== "K" && role !== "DEF" && role !== "DST") {
    if (want("rush_yd", 0.1)) kit.push(["rush_yd", "Rush", "Rush yards"]);
    if (want("rec", 1)) kit.push(["rec", "Rec", "Receptions"]);
    if (want("rec_yd", 0.1)) kit.push(["rec_yd", "RecYd", "Rec yards"]);
    if (want("rush_td", 6)) kit.push(["rush_td", "RuTD", "Rush TDs"]);
    if (want("rec_td", 6)) kit.push(["rec_td", "ReTD", "Rec TDs"]);
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

  const passYd = expectedFromOver(pickLine(buckets.pass_yd));
  const rushYd = expectedFromOver(pickLine(buckets.rush_yd));
  const recYd = expectedFromOver(pickLine(buckets.rec_yd));
  const recs = expectedFromOver(pickLine(buckets.rec));
  const passTd = expectedTds(pickLine(buckets.pass_td));
  const rushTd = expectedTds(pickLine(buckets.rush_td));
  const recTd = expectedTds(pickLine(buckets.rec_td));
  const anytime = expectedTds(pickLine(buckets.anytime_td));

  // Fold anytime TD into the position's main TD bucket when no typed TD line exists.
  let rushTdUse = rushTd;
  let recTdUse = recTd;
  let passTdUse = passTd;
  const role = String(pos || "").toUpperCase();
  if (anytime > 0) {
    if (role === "QB" && !passTdUse) passTdUse = anytime * 0.35;
    else if (role === "RB" && !rushTdUse) rushTdUse = anytime;
    else if ((role === "WR" || role === "TE") && !recTdUse) recTdUse = anytime;
    else if (!rushTdUse && !recTdUse) {
      if (role === "RB") rushTdUse = anytime;
      else recTdUse = anytime;
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
    return {
      key,
      short,
      label,
      amount: amount == null ? null : +Number(amount).toFixed(2),
      pts: amount == null ? null : +Number(pts).toFixed(2),
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

function suggestSwaps(optimalStart, currentIds, players) {
  const byId = new Map((players || []).map((row) => [row.id, row]));
  const optimalIds = new Set((optimalStart || []).filter((row) => row && row.id && !row.empty).map((row) => row.id));
  const current = (currentIds || []).map(String).filter((id) => byId.has(id));
  const onBench = (players || []).filter((row) => !current.includes(row.id) && optimalIds.has(row.id));
  const shouldSit = current.filter((id) => !optimalIds.has(id)).map((id) => byId.get(id)).filter(Boolean);
  const swaps = [];
  onBench.slice().sort((a, b) => b.score - a.score).forEach((bench) => {
    const victim = shouldSit
      .filter((row) => (bench.fantasy || []).some((pos) => {
        // Same position family or flex-eligible overlap.
        const have = (row.fantasy || []).map((p) => String(p).toUpperCase());
        const want = String(pos).toUpperCase();
        if (have.includes(want)) return true;
        const flex = ["RB", "WR", "TE"];
        return flex.includes(want) && have.some((p) => flex.includes(p));
      }))
      .sort((a, b) => a.score - b.score)[0];
    if (!victim) return;
    const gain = +(bench.score - victim.score).toFixed(1);
    if (gain < 0.4) return;
    swaps.push({
      in: { id: bench.id, name: bench.name, pos: bench.pos, score: bench.score },
      out: { id: victim.id, name: victim.name, pos: victim.pos, score: victim.score },
      gain,
      text: `Start ${bench.name} over ${victim.name} (+${gain} pts)`,
    });
    shouldSit.splice(shouldSit.indexOf(victim), 1);
  });
  return swaps.slice(0, 5);
}

module.exports = { projectPlayer, suggestSwaps, classifyProp, implied };
