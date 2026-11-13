/** What a pick is for. Kind by price: safe (-150 or shorter), balanced (-149 to +100), payout (longer than +100).
 * Basis by what backs it: math (his record against the price), script (the game script), or both.
 * Tier: rec when it passes the whittle rules, good when the record clears the price but a rule says not to trust it. */

function betKind(odds) {
  const o = Number(odds);
  return o <= -150 ? "safe" : o <= 100 ? "balanced" : "payout";
}

function betShrunk(hits, n, need) {
  return (hits - n * need) / (n + 10);
}

function betTag(pick) {
  const odds = Number(pick.odds), need = Number(pick.need), hits = Number(pick.hits), n = Number(pick.n);
  const strong = n > 0 && betShrunk(hits, n, need) >= 0.03;
  const basis = pick.why ? (strong ? "both" : "script") : "math";
  const stat = String(pick.stat || pick.market || "").toLowerCase();
  let drop = "";
  if (n < 10) drop = `his record is only ${n} games`;
  else if (hits / n - need >= 0.3) drop = "the edge over the price is too big to trust";
  else if (odds >= 150 && !strong) drop = "the price is long and ten games do not prove it";
  else if (/goal/.test(stat) && !/shot|against/.test(stat) && Number(pick.reach) === 1 && odds > 0) drop = "one goal at plus money is a coin flip ten games cannot read";
  return { kind: betKind(odds), basis, tier: drop ? "good" : "rec", drop };
}

function betCash(odds, result) {
  const o = Number(odds);
  return result === "won" ? 5 * (o > 0 ? o / 100 : 100 / -o) : result === "lost" ? -5 : 0;
}

module.exports = { betKind, betTag, betCash };
