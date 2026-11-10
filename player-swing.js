/** Volatile or consistent: how far a typical night lands from his average, against the league. */

const SERIES = {
  "Pts/Game": ["points"], "Assists/Game": ["assists"], "Rebounds/Game": ["reb"], "3pters/Game": ["threes"], "Minutes/Game": ["minutes"],
  "Steals/Game": ["steals"], "Blocks/Game": ["blocks"], "PRA/Game": ["points", "reb", "assists"],
  "Pass Yds/Game": ["passingYards"], "Pass TD/Game": ["passingTouchdowns"], "Rush Yds/Game": ["rushingYards"], "Carries/Game": ["rushingAttempts"],
  "Rec Yds/Game": ["receivingYards"], "Receptions/Game": ["receptions"], "Targets/Game": ["receivingTargets"], "TD/Game": ["rushingTouchdowns", "receivingTouchdowns"],
  "Goals/Game": ["goals"], "Points/Game": ["points"], "Shots/Game": ["shots"],
  "Strikeouts/Game": ["strikeouts"], "Hits/Game": ["hits"], "Earned Runs/Game": ["earnedRuns"], "Walks/Game": ["walks"], "Innings/Game": ["inningsPitched"],
  "Home Runs/Game": ["homeRuns"], "RBIs/Game": ["RBIs"], "Runs/Game": ["runs"], "Stolen Bases/Game": ["stolenBases"],
};

const CUT = {
  "hoop|Pts/Game": 0.42, "hoop|Assists/Game": 0.58, "hoop|Rebounds/Game": 0.49, "hoop|3pters/Game": 0.74, "hoop|Minutes/Game": 0.21, "hoop|Steals/Game": 0.96, "hoop|Blocks/Game": 1.32, "hoop|PRA/Game": 0.34,
  "ball|Pass Yds/Game": 0.31, "ball|Pass TD/Game": 0.77, "ball|Rush Yds/Game": 0.89, "ball|Carries/Game": 0.7, "ball|Rec Yds/Game": 0.75, "ball|Receptions/Game": 0.6, "ball|Targets/Game": 0.57, "ball|TD/Game": 1.72,
  "ice|Goals/Game": 1.72, "ice|Assists/Game": 1.39, "ice|Points/Game": 1.14, "ice|Shots/Game": 0.69, "ice|Minutes/Game": 0.13,
};

function series(label, pull) {
  const keys = SERIES[label];
  if (!keys) return [];
  const lists = keys.map((key) => pull(key));
  return lists[0].map((_, at) => (lists.some((list) => list[at] == null) ? null : lists.reduce((sum, list) => sum + list[at], 0))).filter((value) => value != null);
}

function spread(values) {
  if (values.length < 5) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg <= 0) return null;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
  return { avg, sd, cv: sd / avg };
}

function one(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function swingTags(kind, stats, pull) {
  const ratios = [];
  stats.forEach((stat) => {
    const cut = CUT[`${kind}|${stat.label}`];
    const got = cut ? spread(series(stat.label, pull)) : null;
    if (!got) return;
    stat.tag = got.cv > cut ? "Volatile" : "Consistent";
    stat.tip = `Most nights he lands between ${one(Math.max(0, got.avg - got.sd))} and ${one(got.avg + got.sd)}. ${stat.tag === "Volatile" ? "That swing is bigger than two thirds of the league's regulars." : "Most regulars swing more."}`;
    if (stat.label !== "Minutes/Game" && stat.label !== "Innings/Game") ratios.push(got.cv / cut);
  });
  if (ratios.length < 2) return null;
  const score = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  const wild = stats.filter((stat) => stat.tag === "Volatile" && stat.label !== "Minutes/Game" && stat.label !== "Innings/Game").length;
  return { tag: score > 1 ? "Volatile" : "Consistent", tip: `${wild} of ${ratios.length} stats swing more than two thirds of the league's regulars.` };
}

module.exports = { swingTags, SERIES, series, spread };
