function createIgnore(readKey, writeKey, archive) {
  const RULES = [
    ["short", "Under half the line"],
    ["early", "One miss, legs still open"],
    ["college", "College receiving yards"],
  ];

  function sport(leg) {
    if (leg.sport) return leg.sport;
    const tail = String(leg.label || "").split(" — ")[1] || "";
    return tail.split(",")[0].trim();
  }

  function tags(ticket) {
    const legs = Array.isArray(ticket.legs) ? ticket.legs : [];
    const found = [];
    if (legs.some((leg) => sport(leg) === "NCAAF" && leg.stat === "receivingYards")) found.push("college");
    const missed = legs.filter((leg) => leg.result === "lost");
    if (missed.some((leg) => Number(leg.line) && Number(leg.have) < Number(leg.line) * 0.5)) found.push("short");
    if (missed.length && legs.some((leg) => !leg.result || leg.result === "open")) found.push("early");
    return found;
  }

  function count(rows, id) {
    return rows.filter((row) => (row.ignoredBecause || tags(row)).includes(id)).length;
  }

  async function parkedRows() {
    const data = (await readKey("bets/ignored.json")) || {};
    return Array.isArray(data.tickets) ? data.tickets : [];
  }

  async function ignoreView() {
    const live = await archive();
    const parked = await parkedRows();
    const labels = Object.fromEntries(RULES);
    return {
      rules: RULES.map(([id, label]) => ({ id, label, onRecord: count(live, id), ignored: count(parked, id) })),
      ignored: parked.slice(-80).reverse().map((row) => ({
        id: row.id || "",
        title: row.title || "",
        result: row.result || "open",
        reasons: (row.ignoredBecause || tags(row)).map((id) => labels[id] || id),
        at: row.offeredAt || "",
      })),
    };
  }

  async function sweepIgnored() {
    const live = await archive();
    const parked = await parkedRows();
    const seen = new Set(parked.map((row) => String(row.id || "")));
    const drop = [];
    const keep = [];
    for (const row of live) {
      const reason = tags(row);
      if (!reason.length) {
        keep.push(row);
        continue;
      }
      if (!seen.has(String(row.id || ""))) {
        drop.push(Object.assign({}, row, { ignoredBecause: reason }));
        seen.add(String(row.id || ""));
      }
    }
    await writeKey("bets/archive.json", { tickets: keep });
    await writeKey("bets/ignored.json", { tickets: parked.concat(drop).slice(-400) });
    return ignoreView();
  }

  return { ignoreView, sweepIgnored };
}

module.exports = { createIgnore };
