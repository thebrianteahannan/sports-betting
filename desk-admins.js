function createAdmins(readKey, writeKey) {
  const owner = "bthannan@gmail.com";

  function marked(user) {
    const email = String(user && user.email || "").trim().toLowerCase();
    return email === owner || Boolean(user && user.admin);
  }

  function rows(users) {
    return (users || []).map((row) => ({
      name: row.name || "",
      email: row.email || "",
      plan: row.plan || "free",
      admin: marked(row),
      lastLogin: row.lastLogin || "",
      createdAt: row.createdAt || "",
    })).sort((a, b) => String(b.lastLogin).localeCompare(String(a.lastLogin)));
  }

  async function load() {
    const data = (await readKey("bets/members.json")) || {};
    return {
      users: Array.isArray(data.users) ? data.users : [],
      sessions: data.sessions && typeof data.sessions === "object" ? data.sessions : {},
      activity: Array.isArray(data.activity) ? data.activity : [],
    };
  }

  const CARD_SAY = {
    today: "Today", week: "Week", open: "Our Bets", band: "Best bet of the day", todayBet: "Today's Best Bet",
    weekThree: "Good 3-leg", weekFive: "Good 5-leg", weekSafe: "Super safe", chalk: "Near −180",
    four: "Four at 85%", plus: "Safest near +250", hits: "Which stack hits more",
  };
  const AIM_SAY = { top: "the safest price", safe: "a safe price", good: "a price near −100", payout: "the longest price" };
  const KIND_SAY = { any: "any player prop", yards: "yards", points: "points", assists: "assists", shots: "shots", strikeouts: "strikeouts", hits: "hits" };

  function tasteOf(user) {
    const taste = user && user.taste && typeof user.taste === "object" ? user.taste : {};
    return {
      quiz: Array.isArray(taste.quiz) ? taste.quiz : [],
      open: Array.isArray(taste.open) ? taste.open : [],
      found: Array.isArray(taste.found) ? taste.found : [],
    };
  }

  function mode(rows, pick) {
    const counts = {};
    rows.forEach((row) => {
      const label = pick(row);
      if (!label) return;
      counts[label] = (counts[label] || 0) + 1;
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!best.length) return "";
    const labels = best.filter((row) => row[1] === best[0][1]).slice(0, 3).map((row) => row[0]);
    return labels.length < 3 ? labels.join(" and ") : `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
  }

  function quizLine(row) {
    const sports = Array.isArray(row.sports) && row.sports.length ? row.sports.join(", ") : "all leagues";
    const when = row.when === "week" ? "this week" : "today";
    return `${when}, ${sports}, ${KIND_SAY[row.kind] || "any player prop"}, ${row.legs || 3} legs, ${AIM_SAY[row.aim] || "the safest price"}`;
  }

  function describe(user, rates) {
    const taste = tasteOf(user);
    const bits = [];
    if (taste.quiz.length === 1) bits.push(`Has answered once: ${quizLine(taste.quiz[0])}.`);
    else if (taste.quiz.length) bits.push(`Answers lean toward ${mode(taste.quiz, (row) => (row.when === "week" ? "this week" : "today"))}, ${mode(taste.quiz, (row) => (Array.isArray(row.sports) && row.sports.length ? row.sports.join(", ") : "all leagues"))}, ${mode(taste.quiz, (row) => KIND_SAY[row.kind] || "any player prop")}, ${mode(taste.quiz, (row) => `${row.legs || 3} legs`)}, and ${mode(taste.quiz, (row) => AIM_SAY[row.aim] || "the safest price")}.`);
    const opened = mode(taste.open, (row) => CARD_SAY[row.card] || "");
    if (opened) bits.push(taste.open.length === 1 ? `Opened ${opened}.` : `Opens ${opened} most often.`);
    const foundAim = mode(taste.found, (row) => AIM_SAY[row.aim] || "");
    const wide = taste.found.filter((row) => Array.isArray(row.sports) && row.sports.length > 3).length;
    const foundSports = mode(taste.found.flatMap((row) => (Array.isArray(row.sports) && row.sports.length <= 3 ? row.sports : []).map((sport) => ({ sport }))), (row) => row.sport);
    if (taste.found.length && wide >= taste.found.length / 2) bits.push(`The bets that come back spread across several leagues${foundAim ? `, aimed at ${foundAim}` : ""}.`);
    else if (foundSports || foundAim) bits.push(`The bets that come back are mostly ${foundSports || "mixed leagues"}${foundAim ? `, aimed at ${foundAim}` : ""}.`);
    const likes = [];
    const seen = new Set();
    rates.forEach((row) => {
      const stars = Number(row.detail && row.detail.stars) || 0;
      const label = row.detail ? (CARD_SAY[row.detail.card] || row.detail.card || "") : "";
      if (!label || stars < 1 || seen.has(label)) return;
      seen.add(label);
      likes.push(`${label} ${stars} star${stars === 1 ? "" : "s"}`);
    });
    if (likes.length) bits.push(`Gives ${likes.slice(0, 4).join(", ")}.`);
    return bits.join(" ") || "No questions, opened bets, or stars yet.";
  }

  function habitsOf(data) {
    return data.users.map((user) => {
      const taste = tasteOf(user);
      const rates = data.activity.filter((row) => row.kind === "rate" && row.userId === user.id && row.detail);
      return {
        name: user.name || "Member",
        email: user.email || "",
        blurb: describe(user, rates),
        recent: taste.quiz.slice(0, 5).map(quizLine),
      };
    });
  }

  function asksOf(data) {
    const names = {};
    data.users.forEach((row) => { names[row.id] = row.name || row.email || "Member"; });
    return data.activity.filter((row) => row.kind === "ask" && row.detail).slice(0, 60).map((row) => ({
      at: row.at || "",
      name: names[row.userId] || "Member",
      said: row.detail.said || "",
      missing: row.detail.missing || "",
    }));
  }

  let tasteChain = Promise.resolve();
  async function saveTaste(user, kind, detail) {
      const slot = ["quiz", "open", "found"].includes(kind) ? kind : "";
      if (!slot) return { ok: false };
      const data = await load();
      const row = data.users.find((item) => item.id === user.id);
      if (!row) return { ok: false };
      const taste = tasteOf(row);
      const sports = (Array.isArray(detail.sports) ? detail.sports : []).map(String).filter((sport) => ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"].includes(sport)).slice(0, 7);
      const item = slot === "open"
        ? { at: new Date().toISOString(), card: ["today", "week", "open"].includes(detail.card) ? detail.card : "" }
        : { at: new Date().toISOString(), when: detail.when === "week" ? "week" : "today", aim: ["top", "safe", "good", "payout"].includes(detail.aim) ? detail.aim : "top", kind: ["any", "yards", "points", "assists", "shots", "strikeouts", "hits"].includes(detail.kind) ? detail.kind : "any", legs: Math.min(10, Math.max(1, Number(detail.legs) || 3)), sports, title: String(detail.title || "").slice(0, 80) };
      if (slot === "open" && !item.card) return { ok: false };
      const prior = taste[slot][0];
      if (prior && Date.now() - Date.parse(prior.at || "") < 120000 && JSON.stringify({ ...prior, at: "" }) === JSON.stringify({ ...item, at: "" })) return { ok: true, already: true };
      taste[slot].unshift(item);
      taste[slot] = taste[slot].slice(0, 24);
      row.taste = taste;
      await writeKey("bets/members.json", data);
      return { ok: true };
    }

  return {
    async adminList() {
      const data = await load();
      return { users: rows(data.users), asks: asksOf(data), habits: habitsOf(data) };
    },
    noteTaste(user, kind, detail) {
      const run = tasteChain.then(() => saveTaste(user, kind, detail));
      tasteChain = run.catch(() => {});
      return run;
    },
    async saveAsk(user, said, missing) {
      const text = String(said || "").replace(/\s+/g, " ").trim().slice(0, 240);
      const gap = String(missing || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (text.length < 2) throw new Error("Say what you wanted.");
      const data = await load();
      const prior = data.activity.find((row) => row.kind === "ask" && row.userId === user.id && row.detail && row.detail.said === text);
      if (prior) return { ok: true, already: true };
      data.activity.unshift({
        id: Math.random().toString(16).slice(2, 14),
        userId: user.id,
        kind: "ask",
        at: new Date().toISOString(),
        detail: { said: text, missing: gap },
      });
      data.activity = data.activity.slice(0, 400);
      await writeKey("bets/members.json", data);
      return { ok: true, already: false };
    },
    async setMemberAdmin(email, admin) {
      const clean = String(email || "").trim().toLowerCase();
      if (clean === owner && !admin) throw new Error("That admin stays.");
      const data = await load();
      const row = data.users.find((item) => item.email === clean);
      if (!row) throw new Error("That member is not here.");
      row.admin = Boolean(admin);
      await writeKey("bets/members.json", data);
      return { users: rows(data.users) };
    },
  };
}

module.exports = { createAdmins };
