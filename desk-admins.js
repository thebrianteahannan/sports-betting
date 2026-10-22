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
    today: "Today", week: "Week", open: "Our Bets", band: "−150 to +100 window", todayBet: "Highest chance parlay today",
    weekThree: "3 legs, different days, near −200", weekFive: "5 legs, different days, near −200", weekSafe: "3 legs, different days, near −350", weekEven: "3 legs, different days, near −100", chalk: "−400 to −700 legs, near −180",
    four: "Four yardage legs near 85% each", plus: "Four yardage legs near +250", hits: "Five near 90% vs four near 80%", td2: "2 NFL players, 1 TD each", td3: "3 NFL players, 1 TD each",
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

  function typeKey(row) {
    const sports = Array.isArray(row.sports) ? row.sports.map(String).filter(Boolean).sort() : [];
    return [row.when === "week" ? "week" : "today", sports.join(","), row.kind || "any", Number(row.legs) || 3, row.aim || "top"].join("|");
  }

  function builtOf(data) {
    const groups = new Map();
    data.users.forEach((user) => {
      tasteOf(user).found.forEach((row) => {
        const key = typeKey(row);
        const hit = groups.get(key) || { key, when: row.when === "week" ? "week" : "today", sports: Array.isArray(row.sports) ? row.sports.map(String).filter(Boolean) : [], kind: row.kind || "any", legs: Number(row.legs) || 3, aim: row.aim || "top", names: [], at: "", title: "", lines: [], count: 0 };
        hit.count += 1;
        const name = user.name || "Member";
        if (!hit.names.includes(name)) hit.names.push(name);
        if (!hit.at || String(row.at || "") > hit.at) { hit.at = row.at || ""; hit.title = row.title || ""; hit.lines = Array.isArray(row.lines) ? row.lines : []; }
        groups.set(key, hit);
      });
    });
    return [...groups.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  }

  function strategiesOf(data) {
    return data.activity.filter((row) => row.kind === "strategy" && row.detail).slice(0, 30).map((row) => ({
      at: row.at || "", key: row.detail.key || typeKey(row.detail), when: row.detail.when || "today", sports: row.detail.sports || [], kind: row.detail.kind || "any", legs: Number(row.detail.legs) || 3, aim: row.detail.aim || "top", title: row.detail.title || "", lines: row.detail.lines || [],
    }));
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

  function legText(ticket, group) {
    if (!ticket) return [];
    const named = group && (ticket.groups || []).find((item) => item.title === group);
    const rows = named ? (named.legs || []) : (ticket.legs || []).length ? ticket.legs : (ticket.groups || []).flatMap((item) => item.legs || []);
    return rows.map((leg) => String(leg.label || "")).filter(Boolean).slice(0, 10);
  }

  function ticketAt(tickets, detail, at) {
    if (detail.id) {
      const hit = tickets.find((row) => String(row.id) === String(detail.id));
      if (hit) return hit;
    }
    const when = Date.parse(at || "");
    if (!detail.card || !Number.isFinite(when)) return null;
    let best = null;
    let bestAt = -Infinity;
    tickets.forEach((row) => {
      if (row.card !== detail.card) return;
      const offered = Date.parse(row.offeredAt || "");
      if (!Number.isFinite(offered) || offered > when || offered < bestAt) return;
      best = row;
      bestAt = offered;
    });
    return best;
  }

  function ratesOf(data, tickets) {
    const names = {};
    data.users.forEach((row) => { names[row.id] = row.name || "Member"; });
    const seen = new Set();
    const out = [];
    data.activity.forEach((row) => {
      if (out.length >= 60 || row.kind !== "rate" || !row.detail || !(Number(row.detail.stars) > 0)) return;
      const detail = row.detail;
      const ticket = detail.built ? { title: detail.title, american: detail.american, legs: detail.legs || [] } : ticketAt(tickets, detail, row.at);
      const lines = detail.built ? (detail.legs || []).map((leg) => String(leg.label || "")).filter(Boolean) : legText(ticket, detail.group);
      const key = `${row.userId}|${detail.stars}|${lines.join("|")}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        at: row.at || "",
        name: names[row.userId] || "Member",
        stars: Number(detail.stars) || 0,
        title: CARD_SAY[detail.card] || detail.title || (ticket && ticket.title) || "Bet",
        american: ticket && ticket.american != null ? ticket.american : detail.american,
        lines,
      });
    });
    return out;
  }

  let tasteChain = Promise.resolve();
  async function saveTaste(user, kind, detail) {
      if (kind === "full") {
        const data = await load();
        const row = data.users.find((item) => item.id === user.id);
        if (!row) return { ok: false };
        const then = Date.parse(row.fullAt || "");
        if (Number.isFinite(then) && Date.now() - then < 600000) return { ok: true, already: true };
        row.fullAt = new Date().toISOString();
        await writeKey("bets/members.json", data);
        return { ok: true };
      }
      if (kind === "strategy") {
        const data = await load();
        const who = data.users.find((item) => item.id === user.id);
        if (!who || !marked(who)) return { ok: false };
        const sports = (Array.isArray(detail.sports) ? detail.sports : []).map(String).filter(Boolean).slice(0, 12);
        const saved = { when: detail.when === "week" ? "week" : "today", aim: ["top", "safe", "good", "payout"].includes(detail.aim) ? detail.aim : "top", kind: ["any", "yards", "points", "assists", "shots", "strikeouts", "hits"].includes(detail.kind) ? detail.kind : "any", legs: Math.min(10, Math.max(1, Number(detail.legs) || 3)), sports, title: String(detail.title || "").slice(0, 80), lines: (Array.isArray(detail.lines) ? detail.lines : []).map((line) => String(line).slice(0, 140)).filter(Boolean).slice(0, 8) };
        saved.key = typeKey(saved);
        if (data.activity.some((row) => row.kind === "strategy" && row.detail && row.detail.key === saved.key)) return { ok: true, already: true };
        data.activity.unshift({ id: Math.random().toString(16).slice(2, 14), userId: user.id, kind: "strategy", at: new Date().toISOString(), detail: saved });
        data.activity = data.activity.slice(0, 400);
        await writeKey("bets/members.json", data);
        return { ok: true };
      }
      const slot = ["quiz", "open", "found"].includes(kind) ? kind : "";
      if (!slot) return { ok: false };
      const data = await load();
      const row = data.users.find((item) => item.id === user.id);
      if (!row) return { ok: false };
      const taste = tasteOf(row);
      const sports = (Array.isArray(detail.sports) ? detail.sports : []).map(String).filter(Boolean).slice(0, 12);
      const lines = (Array.isArray(detail.lines) ? detail.lines : []).map((line) => String(line).slice(0, 140)).filter(Boolean).slice(0, 8);
      const item = slot === "open"
        ? { at: new Date().toISOString(), card: ["today", "week", "open"].includes(detail.card) ? detail.card : "" }
        : { at: new Date().toISOString(), when: detail.when === "week" ? "week" : "today", aim: ["top", "safe", "good", "payout"].includes(detail.aim) ? detail.aim : "top", kind: ["any", "yards", "points", "assists", "shots", "strikeouts", "hits"].includes(detail.kind) ? detail.kind : "any", legs: Math.min(10, Math.max(1, Number(detail.legs) || 3)), sports, title: String(detail.title || "").slice(0, 80), lines };
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
      const archived = (await readKey("bets/archive.json")) || {};
      const tickets = Array.isArray(archived.tickets) ? archived.tickets : [];
      return { users: rows(data.users), asks: asksOf(data), habits: habitsOf(data), built: builtOf(data), strategies: strategiesOf(data), rates: ratesOf(data, tickets) };
    },
    noteTaste(user, kind, detail) {
      const run = tasteChain.then(() => saveTaste(user, kind, detail));
      tasteChain = run.catch(() => {});
      return run;
    },
    async saveRated(user, body) {
      const data = await load();
      const stars = Math.max(0, Math.min(5, Number(body.stars) || 0));
      const legs = (Array.isArray(body.legs) ? body.legs : []).slice(0, 10).map((leg) => ({
        label: String(leg.label || "").slice(0, 180),
        odds: leg.odds,
        pct: String(leg.pct || "").slice(0, 12),
      })).filter((leg) => leg.label);
      const title = String(body.title || "Built bet").slice(0, 80);
      const mark = legs.map((leg) => leg.label).join("|");
      let row = data.activity.find((item) => item.id === String(body.id || "") && item.userId === user.id && item.detail && item.detail.built);
      if (!row && mark) row = data.activity.find((item) => item.kind === "rate" && item.userId === user.id && item.detail && item.detail.built && item.detail.title === title && (item.detail.legs || []).map((leg) => leg.label).join("|") === mark);
      const next = row && Number(row.detail.stars) === stars ? 0 : stars;
      if (!row && next && legs.length) {
        row = { id: Math.random().toString(16).slice(2, 14), userId: user.id, kind: "rate", at: new Date().toISOString(), detail: { built: true, stars: next, title, american: body.american, copy: String(body.copy || "").slice(0, 400), when: body.when === "week" ? "week" : "today", sports: (Array.isArray(body.sports) ? body.sports : []).slice(0, 7), kind: String(body.kind || "any").slice(0, 24), aim: String(body.aim || "").slice(0, 24), legs } };
        data.activity.unshift(row);
      } else if (row && next) {
        row.detail.stars = next;
        row.at = new Date().toISOString();
      } else if (row) {
        const gone = row.id;
        data.activity = data.activity.filter((item) => item !== row);
        data.activity = data.activity.slice(0, 400);
        await writeKey("bets/members.json", data);
        return { stars: 0, id: gone };
      } else return { stars: 0 };
      data.activity = data.activity.slice(0, 400);
      await writeKey("bets/members.json", data);
      return { stars: next, id: row.id };
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
