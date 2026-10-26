function createShelve(readKey, writeKey) {
  const cards = new Set(["chalk", "four", "plus", "hits", "todayBet", "band", "weekThree", "weekFive", "weekSafe", "weekEven", "safe2", "mid3", "win4", "plusLegs", "mix21", "low3", "yards3", "ou4", "alt3", "games4", "early3", "prime3", "weekend4", "td2", "td3", "pay5", "pay10", "pay15", "pay20", "pay25", "pay50"]);

  async function list() {
    const data = (await readKey("bets/shelved.json")) || {};
    return Array.isArray(data.cards) ? data.cards.map((id) => String(id || "")).filter(Boolean) : [];
  }

  function keyOf(body) {
    const card = String(body.card || "").trim();
    const part = String(body.part || "").trim();
    if (!cards.has(card)) throw new Error("That strategy is not here.");
    if (part && (card !== "hits" || (part !== "five" && part !== "four"))) throw new Error("That strategy is not here.");
    return part ? `${card}|${part}` : card;
  }

  async function save(body) {
    const key = keyOf(body);
    const rows = new Set(await list());
    if (body.on) rows.add(key); else rows.delete(key);
    const next = [...rows];
    await writeKey("bets/shelved.json", { cards: next });
    return { cards: next };
  }

  return { cards: list, save };
}

module.exports = { createShelve };
