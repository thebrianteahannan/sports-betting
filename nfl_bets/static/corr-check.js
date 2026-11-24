/** Correlation Check v1: flag direct conflicts and overlapping exposure on the open tray. */

function corrFold(text) {
  return typeof plainName === "function" ? plainName(text) : String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function corrSide(label, market) {
  const raw = `${label || ""} ${market || ""}`;
  if (/\bunder\b/i.test(raw)) return "under";
  if (/\bover\b/i.test(raw)) return "over";
  const ml = raw.match(/\b(ml|moneyline)\b/i);
  if (ml) return "ml";
  const spread = raw.match(/([+-]\d+(?:\.\d+)?)/);
  if (spread) return Number(spread[1]) > 0 ? "dog" : "fav";
  return "";
}

function corrPlayer(bet) {
  const who = String(bet.who || bet.player || "").trim();
  if (who) return corrFold(who);
  const label = String(bet.label || "");
  const cut = label.split(/\s+(?:\d|Over\b|Under\b|\+|—|-)/)[0];
  return corrFold(cut);
}

function corrLegs(bets) {
  return (bets || []).map((bet, at) => ({
    at,
    bet,
    player: corrPlayer(bet),
    match: corrFold(bet.match || ""),
    market: corrFold(bet.market || ""),
    side: corrSide(bet.label, bet.market),
    label: String(bet.label || ""),
  }));
}

function corrSpread(label, market) {
  const raw = `${label || ""} ${market || ""}`;
  if (/\b(over|under|moneyline|\bml\b)\b/i.test(raw) && !/spread/i.test(raw)) return null;
  const found = raw.match(/([+-]\d+(?:\.\d+)?)/);
  if (!found) return null;
  const n = Number(found[1]);
  return Number.isFinite(n) && n ? n : null;
}

function corrMiddle(a, b) {
  const left = corrSpread(a.label, a.market);
  const right = corrSpread(b.label, b.market);
  if (left == null || right == null || Math.sign(left) === Math.sign(right)) return false;
  const fav = Math.abs(Math.min(left, right));
  const dog = Math.max(left, right);
  // Both sides cash when the margin lands in the gap, which is the key-number middle.
  return Math.floor(fav) + 1 <= Math.ceil(dog) - 1;
}

function corrPairRate(a, b) {
  if (a.player && b.player && a.player === b.player && a.side && b.side && a.side !== b.side && /over|under/.test(`${a.side}${b.side}`)) {
    return { rate: "conflict", line: `${a.label.split(/\s+Over|\s+Under/)[0].trim() || "This player"} is on both sides of the same prop.` };
  }
  const middle = !!(a.match && a.match === b.match && corrMiddle(a, b));
  if (!middle && a.match && a.match === b.match && a.side && b.side && ((a.side === "fav" && b.side === "dog") || (a.side === "dog" && b.side === "fav") || (a.side === "over" && b.side === "under" && /total/.test(`${a.market} ${b.market}`)))) {
    return { rate: "low", line: "These two need opposite games in the same matchup." };
  }
  if (a.player && a.player === b.player && a.match === b.match) {
    return { rate: "moderate", line: "Two legs ride the same player tonight." };
  }
  return null;
}

function corrCheck(bets) {
  const rows = corrLegs(bets);
  if (rows.length < 2) return null;
  let best = null;
  const rank = { conflict: 4, low: 3, moderate: 2, high: 1 };
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const hit = corrPairRate(rows[i], rows[j]);
      if (!hit) continue;
      if (!best || rank[hit.rate] > rank[best.rate]) best = hit;
    }
  }
  return best;
}

function corrPaint(tray, bets) {
  if (!tray) return;
  tray.querySelectorAll(".corr-check").forEach((node) => node.remove());
  const hit = corrCheck(bets);
  if (!hit) return;
  const note = document.createElement("p");
  note.className = `corr-check corr-${hit.rate}`;
  note.textContent = hit.rate === "conflict" ? `These fight. ${hit.line}` : hit.rate === "low" ? `These fight. ${hit.line}` : hit.line;
  const say = tray.querySelector(".find-say");
  if (say && say.nextSibling) tray.insertBefore(note, say.nextSibling);
  else tray.append(note);
}

function corrHomeFeatured(picks) {
  // If two featured home picks directly conflict, drop the lower one from the short desk.
  if (!Array.isArray(picks) || picks.length < 2) return picks;
  const keep = [];
  picks.forEach((pick) => {
    const clash = keep.some((row) => {
      const hit = corrPairRate(
        { player: corrFold(row.who || row.label), match: corrFold(row.match), market: corrFold(row.market), side: corrSide(row.label, row.market), label: row.label },
        { player: corrFold(pick.who || pick.label), match: corrFold(pick.match), market: corrFold(pick.market), side: corrSide(pick.label, pick.market), label: pick.label },
      );
      return hit && hit.rate === "conflict";
    });
    if (!clash) keep.push(pick);
  });
  return keep;
}

window.corrCheck = corrCheck;
window.corrPaint = corrPaint;
window.corrHomeFeatured = corrHomeFeatured;
