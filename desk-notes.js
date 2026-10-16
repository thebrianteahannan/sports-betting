function createNotes(readKey, writeKey) {
  const starter = [
    "I already picked tonight.",
    "Tomorrow I pick again.",
    "Five dollars. That's the night.",
    "The group chat is guessing.",
    "Star it. I remember.",
    "I looked. You ask.",
    "Read this before dinner.",
    "Tonight is handled.",
    "The week is handled too.",
    "Walk in knowing the bet.",
    "Got a friend who asks? Send them.",
    "New games. Same bird.",
    "Nothing boring made the list.",
    "A new game every day.",
    "Come see the score.",
    "Tap my head. Ask me.",
    "You place it when you're ready.",
    "You get the fun part.",
  ];
  const previous = new Set([
    "Come back tomorrow. New games.",
    "Come back tomorrow. New slate.",
    "A $5 night stays a $5 night.",
    "I never send the bet. You do.",
    "Look at the *chance* it wins.",
    "Look at the *chance*, not the juice.",
    "Save a bet. I'll remember it.",
    "Star one. I'll remember it.",
    "Big payouts lose more often.",
    "The loud price misses more.",
    "One bet today. One for the week.",
    "One ticket today. One this week.",
    "Ask me. I already looked.",
    "Ask me. I already checked.",
    "Tired of guessing which bet?",
    "Tired of guessing the number?",
    "Check the chance before dinner.",
    "Your group chat picks the big payout.",
    "Your group chat picks the loud one.",
    "Bring the friend who asks what the bet is.",
    "New games tomorrow. Same parrot.",
    "Fresh prices. Same parrot.",
    "I leave the tiny payouts off.",
    "−800 stays off the main card.",
    "This week's picks are on different days.",
    "Each week leg is a different day.",
    "Wins and losses stay written down.",
    "Click my head and ask anything.",
    "I can't promise the next one wins.",
    "I can't promise the next one hits.",
    "Last week does not promise this one.",
    "Past tickets do not promise the next one.",
    "21+. Only what you can lose. 1-800-GAMBLER.",
  ]);

  function fresh() {
    return starter.map((text, index) => ({ id: `n${index}`, text }));
  }

  async function load() {
    const data = (await readKey("bets/notes.json")) || {};
    const notes = Array.isArray(data.notes) ? data.notes.filter((row) => row && row.text) : [];
    if (!notes.length || notes.every((row) => previous.has(String(row.text)))) return fresh();
    return notes.map((row) => ({ id: String(row.id || ""), text: String(row.text) }));
  }

  async function list() {
    return { notes: await load() };
  }

  async function save(body) {
    const notes = await load();
    const op = String(body.op || "");
    const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const id = String(body.id || "");
    if (op === "add") {
      if (text.length < 4) throw new Error("Write a line.");
      notes.push({ id: Date.now().toString(36), text });
    } else if (op === "edit") {
      const row = notes.find((item) => item.id === id);
      if (!row) throw new Error("That line is not here.");
      if (text.length < 4) throw new Error("Write a line.");
      row.text = text;
    } else if (op === "delete") {
      const next = notes.filter((item) => item.id !== id);
      if (!id || next.length === notes.length) throw new Error("That line is not here.");
      if (!next.length) throw new Error("Leave at least one line.");
      notes.splice(0, notes.length, ...next);
    } else throw new Error("Choose add, edit, or delete.");
    await writeKey("bets/notes.json", { notes });
    return { notes };
  }

  return { list, save };
}

module.exports = { createNotes };
