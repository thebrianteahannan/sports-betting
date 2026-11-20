/** What a pick is for. Kind by price: safe (-150 or shorter), balanced (-149 to +100), payout (longer than +100).
 * Basis by what backs it: math (his record against the price), script (the game script), or both.
 * Tier: rec when it passes the whittle rules, good when the record clears the price but a rule says not to trust it.
 * Role (steady): solid when minutes/starter look locked; thin when the opportunity is shaky.
 * Cushion: average clears the line by enough room (absolute + % of the line) at a price that still pays. */

function betKind(odds) {
  const o = Number(odds);
  return o <= -150 ? "safe" : o <= 100 ? "balanced" : "payout";
}

function betShrunk(hits, n, need) {
  return (hits - n * need) / (n + 10);
}

function betRole(pick) {
  if (pick.role === "solid" || pick.role === "thin") return pick.role;
  const starter = pick.starter === true, min = Number(pick.min);
  if (starter && (!Number.isFinite(min) || min >= 22)) return "solid";
  if (!starter && Number.isFinite(min) && min >= 28) return "solid";
  if (!starter && Number.isFinite(min) && min < 24) return "thin";
  if (starter) return "solid";
  return "";
}

function n1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

/** Cushion from projection vs line: room = avg − line, pct = room / line. Not from hit rate. */
function betCushionInfo(pick) {
  const avg = Number(pick.avg), line = Number(pick.reach), odds = Number(pick.odds);
  const blank = { on: false, avg: null, line: null, room: null, pct: null, tip: "" };
  if (!Number.isFinite(avg) || !Number.isFinite(line) || line <= 0) return blank;
  const room = avg - line;
  const pct = room / line;
  const priceOk = Number.isFinite(odds) && odds <= 120 && odds >= -220;
  // Enough absolute room and at least 15% of the line — distance to the line, not hit rate.
  const on = priceOk && room >= 2 && pct >= 0.15;
  const tip = on
    ? `Cushion: averages ${n1(avg)} vs line ${n1(line)} (+${n1(room)}, ${Math.round(pct * 100)}%). Soft night can still cash.`
    : "";
  return { on, avg, line, room, pct, tip };
}

function betCushion(pick) {
  if (Number.isFinite(Number(pick.avg)) && Number.isFinite(Number(pick.reach))) return betCushionInfo(pick).on;
  if (pick.cushion === true || pick.cushion === false) return !!pick.cushion;
  return false;
}

function betTag(pick) {
  const odds = Number(pick.odds), need = Number(pick.need), hits = Number(pick.hits), n = Number(pick.n);
  const strong = n > 0 && betShrunk(hits, n, need) >= 0.03;
  const basis = pick.why ? (strong ? "both" : "script") : "math";
  const stat = String(pick.stat || pick.market || "").toLowerCase();
  let drop = "";
  if (n < 8) drop = `his record is only ${n} games`;
  else if (hits / n - need >= 0.3) drop = "the edge over the price is too big to trust";
  else if (odds >= 150 && !strong) drop = "the price is long and ten games do not prove it";
  else if (/goal/.test(stat) && !/shot|against/.test(stat) && Number(pick.reach) === 1 && odds > 0) drop = "one goal at plus money is a coin flip ten games cannot read";
  const role = betRole(pick), info = betCushionInfo(pick);
  return {
    kind: betKind(odds),
    basis,
    tier: drop ? "good" : "rec",
    drop,
    role,
    cushion: info.on,
    cushionRoom: info.on ? info.room : null,
    cushionPct: info.on ? info.pct : null,
    avg: Number.isFinite(info.avg) ? info.avg : undefined,
    reach: Number.isFinite(info.line) ? info.line : undefined,
  };
}

function betCash(odds, result) {
  const o = Number(odds);
  return result === "won" ? 5 * (o > 0 ? o / 100 : 100 / -o) : result === "lost" ? -5 : 0;
}

module.exports = { betKind, betTag, betCash, betRole, betCushion, betCushionInfo };
