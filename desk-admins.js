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

  return {
    async adminList() {
      const data = await load();
      return { users: rows(data.users), asks: asksOf(data) };
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
