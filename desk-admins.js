function createAdmins(readKey, writeKey) {
  const owners = new Set(["bthannan@gmail.com", "parlayoftheday11@gmail.com"]);

  function marked(user) {
    const email = String(user && user.email || "").trim().toLowerCase();
    return owners.has(email) || Boolean(user && user.admin);
  }

  function onlineOf(data) {
    const now = Date.now();
    const signed = new Set();
    Object.values(data.sessions || {}).forEach((session) => {
      if (session && session.userId && Number(session.expires) >= now / 1000) signed.add(session.userId);
    });
    const by = {};
    let none = 0;
    let total = 0;
    data.users.forEach((user) => {
      const then = Date.parse(user.seenAt || "");
      if (!signed.has(user.id) || !Number.isFinite(then) || now - then > 2 * 60 * 1000) return;
      total += 1;
      const code = String(user.state || "").trim().toUpperCase();
      if (!code) none += 1;
      else by[code] = (by[code] || 0) + 1;
    });
    const states = Object.entries(by).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    return { total, none, states };
  }

  function rows(users) {
    return (users || []).map((row) => {
      const end = Date.parse(row.trialEndsAt || "");
      const trial = Number.isFinite(end) && end > Date.now();
      const paid = (row.plan || "free") === "pro" && ["active", "trialing", "past_due"].includes(row.subStatus || "");
      return {
        name: row.name || "",
        email: row.email || "",
        plan: paid ? "pro" : "free",
        admin: marked(row),
        beta: Boolean(row.beta),
        trial,
        trialEndsAt: row.trialEndsAt || "",
        periodEnd: row.periodEnd || "",
        lastLogin: row.lastLogin || "",
        createdAt: row.createdAt || "",
      };
    }).sort((a, b) => String(b.lastLogin).localeCompare(String(a.lastLogin)));
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
    four: "Four yardage legs near 85% each", plus: "Four yardage legs near +250", hits: "Five near 90% vs four near 80%", td2: "2 NFL players, 1 anytime TD each", td3: "3 NFL players, 1 anytime TD each", pay5: "A $5 bet wins $5", pay10: "A $5 bet wins $10", pay15: "A $5 bet wins $15", pay20: "A $5 bet wins $20", pay25: "A $5 bet wins $25", pay50: "A $5 bet wins $50", pra: "Do-it-all PRA", sixth: "6th man in a blowout",
  };
  const AIM_SAY = { top: "the safest price", safe: "a safe price", good: "a price near −100", payout: "the longest price" };
  const KIND_SAY = { any: "any player prop", yards: "yards", points: "points", assists: "assists", shots: "shots", strikeouts: "strikeouts", hits: "hits" };

  function tasteOf(user) {
    const taste = user && user.taste && typeof user.taste === "object" ? user.taste : {};
    return {
      quiz: Array.isArray(taste.quiz) ? taste.quiz : [],
      open: Array.isArray(taste.open) ? taste.open : [],
      found: Array.isArray(taste.found) ? taste.found : [],
      search: Array.isArray(taste.search) ? taste.search : [],
      trail: Array.isArray(taste.trail) ? taste.trail : [],
    };
  }

  function legWho(leg) {
    return String(leg && leg.label || "").split(/\s+—\s+/)[0].replace(/^(over|under)\b.*$/i, "").replace(/\s+(\d|over|under|\+).*$/i, "").replace(/:.*$/, "").trim();
  }

  function parlayLine(parlays) {
    const full = parlays.filter((row) => Array.isArray(row.legs) && row.legs.length);
    if (!full.length) return "";
    const dec = (odds) => { const o = Number(odds); return o > 0 ? 1 + o / 100 : o < 0 ? 1 + 100 / -o : 1; };
    const prices = full.map((row) => row.legs.reduce((p, leg) => p * dec(leg.odds), 1)).sort((a, b) => a - b), mid = prices[Math.floor(prices.length / 2)];
    const price = mid >= 2 ? `+${Math.round((mid - 1) * 100)}` : mid > 1 ? `-${Math.round(100 / (mid - 1))}` : "";
    const sizes = mode(full.map((row) => ({ n: row.legs.length })), (row) => `${row.n} leg${row.n === 1 ? "" : "s"}`);
    const legs = full.flatMap((row) => row.legs), leagues = mode(legs, (leg) => leg.sport || ""), who = mode(legs, legWho);
    return `Has built ${full.length} parlay${full.length === 1 ? "" : "s"}, usually ${sizes}${leagues ? `, mostly ${leagues}` : ""}${price ? `, priced around ${price}` : ""}.${who ? ` Picks ${who} most.` : ""}`;
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

  const HABITS_SINCE = Date.parse("2026-11-11T22:36:00Z");
  function fresh(at) {
    const time = typeof at === "number" ? at : Date.parse(at || "");
    return Number.isFinite(time) && time >= HABITS_SINCE;
  }

  function staySay(ms) {
    const sec = Math.max(1, Math.round((Number(ms) || 0) / 1000));
    if (sec < 60) return `${sec} sec`;
    return `${Math.round(sec / 60)} min`;
  }

  function habitWhen(at) {
    const time = Date.parse(at || "");
    if (!Number.isFinite(time)) return "";
    return new Date(time).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  }

  function describe(user, parlays) {
    const taste = tasteOf(user);
    const lines = [];
    const built = parlayLine((parlays || []).filter((row) => fresh(/^p\d+$/.test(String(row.id)) ? Number(String(row.id).slice(1)) : Number(row.at))));
    if (built) lines.push(built);
    const made = mode(taste.found.filter((row) => fresh(row.at)), (row) => row.title || "");
    if (made) lines.push(`Built ${made}.`);
    const asked = taste.quiz.filter((row) => fresh(row.at)).slice(0, 2).map(quizLine);
    if (asked.length) lines.push(`Asked for ${asked.join(", then ")}.`);
    const looked = [...new Set(taste.search.filter((row) => fresh(row.at)).map((row) => String(row.q || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
    if (looked.length) lines.push(`Searched ${looked.slice(0, 6).join(", ")}.`);
    const opened = mode(taste.open.filter((row) => fresh(row.at)), (row) => CARD_SAY[row.card] || "");
    if (opened) lines.push(`Opens ${opened} most.`);
    const trail = taste.trail.filter((row) => fresh(row.at));
    const pages = {};
    trail.filter((row) => row.kind === "page").forEach((row) => { pages[row.name] = (pages[row.name] || 0) + (Number(row.ms) || 0); });
    const pageLine = Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, ms]) => `${name} ${staySay(ms)}`).join(". ");
    if (pageLine) lines.push(`Pages: ${pageLine}.`);
    const clicks = mode(trail.filter((row) => row.kind === "click"), (row) => row.name);
    if (clicks) lines.push(`Clicks ${clicks} most.`);
    const bets = mode(trail.filter((row) => row.kind === "bet"), (row) => row.name);
    if (bets) lines.push(`Bets on ${bets}.`);
    const recent = [];
    trail.slice(0, 40).forEach((row) => {
      if (row.kind === "page") return;
      const when = habitWhen(row.at);
      const line = `${when} ${row.kind === "bet" ? "bet" : "clicked"} ${row.name}`;
      if (!recent.length || recent.at(-1) !== line) recent.push(line);
    });
    if (recent.length) lines.push(`Recent: ${recent.slice(0, 8).join(". ")}.`);
    return lines.join("\n") || "Nothing tracked yet.";
  }

  async function parlaysOf(user) {
    const [live, done] = await Promise.all([readKey(`bets/parlays/${user.id}.json`), readKey(`bets/parlays/${user.id}-done.json`)].map((job) => job.catch(() => null)));
    return [...((live && live.parlays) || []), ...((done && done.parlays) || [])];
  }

  async function habitsOf(data) {
    return Promise.all(data.users.map(async (user) => ({
      name: user.name || "Member",
      email: user.email || "",
      blurb: describe(user, await parlaysOf(user)),
      recent: [],
    })));
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
      if (kind === "trail") {
        const data = await load();
        const row = data.users.find((item) => item.id === user.id);
        if (!row) return { ok: false };
        const taste = tasteOf(row);
        const now = Date.now();
        let seen = false;
        (Array.isArray(detail.events) ? detail.events : []).slice(0, 20).forEach((event) => {
          const type = ["page", "click", "bet", "here"].includes(event.kind) ? event.kind : "";
          const name = String(event.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
          const ms = Math.max(0, Math.min(30 * 60 * 1000, Number(event.ms) || 0));
          if (type === "here" || type === "click" || type === "bet" || (type === "page" && name === "The Games")) seen = true;
          if (!type || type === "here" || name.length < 2 || (type === "page" && ms < 3000)) return;
          const prior = taste.trail.find((item) => item.kind === type && item.name === name && now - Date.parse(item.at || "") < 15000);
          if (prior && type === "page") { prior.ms = Math.min(30 * 60 * 1000, (Number(prior.ms) || 0) + ms); prior.at = new Date().toISOString(); prior.part = event.part ? 1 : 0; return; }
          if (prior) return;
          taste.trail.unshift({ at: new Date().toISOString(), kind: type, name, ms: type === "page" ? ms : 0, part: event.part ? 1 : 0 });
        });
        if (seen) row.seenAt = new Date().toISOString();
        taste.trail = taste.trail.slice(0, 160);
        row.taste = taste;
        await writeKey("bets/members.json", data);
        return { ok: true };
      }
      const slot = ["quiz", "open", "found", "search"].includes(kind) ? kind : "";
      if (!slot) return { ok: false };
      const data = await load();
      const row = data.users.find((item) => item.id === user.id);
      if (!row) return { ok: false };
      const taste = tasteOf(row);
      const sports = (Array.isArray(detail.sports) ? detail.sports : []).map(String).filter(Boolean).slice(0, 12);
      const lines = (Array.isArray(detail.lines) ? detail.lines : []).map((line) => String(line).slice(0, 140)).filter(Boolean).slice(0, 8);
      const item = slot === "search"
        ? { at: new Date().toISOString(), q: String(detail.q || "").replace(/\s+/g, " ").trim().slice(0, 60) }
        : slot === "open"
        ? { at: new Date().toISOString(), card: ["today", "week", "open"].includes(detail.card) ? detail.card : "" }
        : { at: new Date().toISOString(), when: detail.when === "week" ? "week" : "today", aim: ["top", "safe", "good", "payout"].includes(detail.aim) ? detail.aim : "top", kind: ["any", "yards", "points", "assists", "shots", "strikeouts", "hits"].includes(detail.kind) ? detail.kind : "any", legs: Math.min(10, Math.max(1, Number(detail.legs) || 3)), sports, title: String(detail.title || "").slice(0, 80), lines };
      if ((slot === "open" && !item.card) || (slot === "search" && item.q.length < 3)) return { ok: false };
      const busy = slot === "search" || slot === "quiz" || slot === "found" || slot === "open";
      if (busy) row.seenAt = new Date().toISOString();
      const prior = taste[slot][0];
      if (prior && Date.now() - Date.parse(prior.at || "") < 120000 && JSON.stringify({ ...prior, at: "" }) === JSON.stringify({ ...item, at: "" })) {
        if (busy) await writeKey("bets/members.json", data);
        return { ok: true, already: true };
      }
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
      return { users: rows(data.users), online: onlineOf(data), asks: asksOf(data), habits: await habitsOf(data), built: builtOf(data), strategies: strategiesOf(data), rates: ratesOf(data, tickets) };
    },
    async whoIsHere() {
      return onlineOf(await load());
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
      if (owners.has(clean) && !admin) throw new Error("That admin stays.");
      const data = await load();
      const row = data.users.find((item) => item.email === clean);
      if (!row) throw new Error("That member is not here.");
      row.admin = Boolean(admin);
      await writeKey("bets/members.json", data);
      return { users: rows(data.users), online: onlineOf(data) };
    },
    async dropMember(email) {
      const clean = String(email || "").trim().toLowerCase();
      if (owners.has(clean)) throw new Error("That admin stays.");
      const data = await load();
      const row = data.users.find((item) => item.email === clean);
      if (!row) throw new Error("That member is not here.");
      const id = row.id;
      data.users = data.users.filter((item) => item.id !== id);
      Object.keys(data.sessions).forEach((token) => { if (data.sessions[token] && data.sessions[token].userId === id) delete data.sessions[token]; });
      data.activity = data.activity.filter((item) => item.userId !== id);
      await writeKey("bets/members.json", data);
      const friends = (await readKey("bets/friends.json")) || {};
      const links = Array.isArray(friends.links) ? friends.links : [];
      const left = links.filter((one) => one.a !== id && one.b !== id);
      if (left.length !== links.length) await writeKey("bets/friends.json", { ...friends, links: left });
      await writeKey(`bets/parlays/${id}.json`, { parlays: [], at: Date.now() });
      await writeKey(`bets/parlays/${id}-done.json`, { parlays: [], at: Date.now() });
      await writeKey(`bets/shared/${id}.json`, { items: [], at: Date.now() });
      return { users: rows(data.users), online: onlineOf(data) };
    },
  };
}

module.exports = { createAdmins };
