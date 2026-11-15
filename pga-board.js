/** The PGA scoreboard. Scores and finished rounds, so the tournament script has somewhere to stand. */

let pgaMem = { at: 0, data: null };

function pgaRound(line) {
  const text = String(line.displayValue || "");
  if (text === "E") return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

async function pgaBoard() {
  if (pgaMem.data && Date.now() - pgaMem.at < 120000) return pgaMem.data;
  try {
    const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard", {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", Referer: "https://www.espn.com/" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const event = (data.events || [])[0] || {};
    const comp = (event.competitions || [])[0] || {};
    const detail = ((comp.status || {}).type || {}).detail || "";
    const players = (comp.competitors || []).map((row) => {
      const score = Number(row.score);
      const rounds = (row.linescores || []).filter((line) => [1, 2, 3, 4].includes(line.period) && line.displayValue).map(pgaRound).filter((n) => n != null);
      return { name: (row.athlete || {}).displayName || "", score: Number.isFinite(score) ? score : null, rounds };
    }).filter((row) => row.name && row.score != null);
    pgaMem = { at: Date.now(), data: { name: event.name || "", detail, players } };
  } catch (error) {
    console.log("[pga] the scoreboard did not load", error);
    if (!pgaMem.data) pgaMem = { at: Date.now(), data: { name: "", detail: "", players: [] } };
  }
  return pgaMem.data;
}

module.exports = { pgaBoard };
