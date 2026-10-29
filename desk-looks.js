let api = null;

function createLooks(readKey, writeKey) {
  const seed = [
    ["cb", "Opposing corner out", "A corner or safety on the other team is out. A receiver has a better chance at yards and a score."],
    ["qb", "Quarterback out", "The starting quarterback is out. The passing game has fewer clean chances."],
    ["wr", "Other receiver out", "Another receiver on his team is out. The one still playing can see more targets."],
    ["rb", "Lead back out", "The lead back is out. The next back can see more carries."],
    ["up", "Targets up", "His targets in the last few games are higher than the games before."],
    ["down", "Targets down", "His targets have fallen off."],
    ["hot", "Cleared it lately", "He has cleared this number lately, and the FanDuel price is short of that count."],
    ["foe", "Against this team", "He has cleared this number against this team."],
    ["home", "At home", "He clears this number at home, and the road games are different."],
    ["road", "On the road", "He clears this number on the road, and the home games are different."],
    ["bye", "Off a bye", "He is coming off a bye."],
    ["short", "Short week", "This is a short week, and his short weeks play out differently."],
    ["rest", "More rest", "He has had more rest than the other team."],
    ["back", "First game back", "This is his first game back from a layoff."],
    ["early", "Early East start", "A West Coast team is playing an early East Coast game."],
    ["zones", "Two time zones", "This trip crosses two time zones."],
    ["script", "High-scoring script", "His team's side of the number says a lot of points."],
    ["throw", "They'll be throwing", "His team is a big underdog, so the script leans pass."],
    ["run", "They'll be running", "His team is a big favorite, so the script leans run."],
    ["move", "The number didn't move", "The spread or the total moved, and this player's number stayed."],
    ["cold", "The other team is cold", "The other team has won few of its last games."],
    ["prime", "Prime time", "The kickoff is 7:00 PM ET or later."],
    ["rival", "Rivalry", "These two teams are rivals."],
    ["after", "After a rivalry", "This is the game after a rivalry."],
    ["next", "A rivalry is next", "A rivalry is the next game."],
    ["wind", "Wind", "Wind is 20 mph or more and the game is outside."],
    ["rain", "Rain", "Rain is in the forecast and the game is outside."],
    ["air", "Cold", "It is cold, and this bet is a pass or a catch."],
    ["dome", "Indoors", "The game is indoors."],
    ["denver", "Denver", "This game is in the altitude."],
    ["abroad", "Overseas", "This game is outside the usual US building."],
  ];

  function fresh() {
    return seed.map(([id, name, gist]) => ({ id, name, gist }));
  }

  function clean(row) {
    if (!row || typeof row !== "object") return null;
    const name = String(row.name || "").replace(/\s+/g, " ").trim().slice(0, 48);
    const gist = String(row.gist || "").replace(/\s+/g, " ").trim().slice(0, 180);
    if (name.length < 2 || gist.length < 8) return null;
    return { id: String(row.id || ""), name, gist };
  }

  async function load() {
    const data = await readKey("bets/looks.json");
    if (!data || !Array.isArray(data.looks)) return fresh();
    return data.looks.map(clean).filter(Boolean);
  }

  async function list() {
    return { looks: await load() };
  }

  async function save(body) {
    const looks = await load();
    const op = String(body.op || "");
    const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 48);
    const gist = String(body.gist || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const id = String(body.id || "");
    if (op === "add") {
      if (name.length < 2 || gist.length < 8) throw new Error("Name it, and say what we look for.");
      looks.push({ id: Date.now().toString(36), name, gist });
    } else if (op === "edit") {
      const row = looks.find((item) => item.id === id);
      if (!row) throw new Error("That one is not here.");
      if (name.length < 2 || gist.length < 8) throw new Error("Name it, and say what we look for.");
      row.name = name;
      row.gist = gist;
    } else if (op === "delete") {
      const next = looks.filter((item) => item.id !== id);
      if (!id || next.length === looks.length) throw new Error("That one is not here.");
      looks.splice(0, looks.length, ...next);
    } else throw new Error("Choose add, edit, or delete.");
    await writeKey("bets/looks.json", { looks });
    return { looks };
  }

  api = { list, save };
  return api;
}

async function currentLooks() {
  if (!api) return { looks: [] };
  return api.list();
}

module.exports = { createLooks, currentLooks };
