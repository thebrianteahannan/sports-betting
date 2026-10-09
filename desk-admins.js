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

  return {
    async adminList() {
      return { users: rows((await load()).users) };
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
