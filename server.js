/**
 * Hostinger site for the betting desk.
 *
 * hPanel → Node.js web app → import the GitHub repo.
 *   Node.js        20 or 22
 *   Entry file     server.js
 *   Build script   (empty)
 *   Package manager npm
 * Environment (do not commit these):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Local Mac reads the same names from .env. Hostinger sets them in hPanel.
 *
 * The Mac keeps pulling FanDuel and writes bets/board.json and bets/archive.json.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createIgnore } = require("./desk-ignore");
const { createAdmins } = require("./desk-admins");
const { createDocs } = require("./desk-docs"); const { chooseBet } = require("./choose-api");
const { createPull } = require("./desk-pull");
const { createNotes } = require("./desk-notes");
const { createResearch } = require("./desk-research");
const ROOT = __dirname;
loadEnv(path.join(ROOT, ".env"));
const sendDoc = createDocs(ROOT);
const STATIC = path.join(ROOT, "nfl_bets", "static");
const PORT = Number(process.env.PORT || 3000);
const CARDS = new Set(["chalk", "four", "plus", "hits", "todayBet", "band", "weekThree", "weekFive", "weekEven"]);
const RESULTS = new Set(["won", "lost", "push"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function loadEnv(file) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const cut = line.trim();
    if (!cut || cut.startsWith("#") || !cut.includes("=")) continue;
    const name = cut.slice(0, cut.indexOf("=")).trim();
    const raw = cut.slice(cut.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    if (name && !process.env[name]) process.env[name] = raw;
  }
}

function env(name) {
  return String(process.env[name] || "").trim().replace(/\/$/, "");
}

async function sb(pathname, options = {}) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase is not configured on the host.");
  const response = await fetch(url + "/rest/v1/" + pathname, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Supabase " + response.status);
  return text ? JSON.parse(text) : null;
}

async function readKey(key) {
  const rows = await sb("kv?k=eq." + encodeURIComponent(key) + "&select=v");
  if (Array.isArray(rows) && rows[0]) return rows[0].v;
  return null;
}

async function writeKey(key, value) {
  await sb("kv", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { k: key, v: value },
  });
}

async function board() {
  return (await readKey("bets/board.json")) || {};
}

async function archive() {
  const data = (await readKey("bets/archive.json")) || { tickets: [] };
  return Array.isArray(data.tickets) ? data.tickets : [];
}

const { ignoreView, sweepIgnored } = createIgnore(readKey, writeKey, archive);
const pullLive = createPull(readKey, writeKey, ROOT);
const { adminList, setMemberAdmin, saveAsk, noteTaste, saveRated } = createAdmins(readKey, writeKey);
const { list: noteList, save: noteSave } = createNotes(readKey, writeKey);
const researchBet = createResearch(readKey);

async function picks() {
  const data = (await readKey("bets/picks.json")) || { picks: [] };
  return Array.isArray(data.picks) ? data.picks : [];
}

async function publicBoard() {
  const data = await board();
  data.archive = await archive();
  data.picks = await picks();
  return data;
}

function leg(row) {
  return { label: String(row.label || ""), odds: row.odds, pct: String(row.pct || "") };
}

function labels(row) {
  const names = (row.legs || []).map((item) => String(item.label || ""));
  for (const group of row.groups || []) {
    names.push(String(group.title || ""));
    for (const item of group.legs || []) names.push(String(item.label || ""));
  }
  return names.join("|");
}

async function savePick(cardId, groupTitle) {
  const data = await board();
  let card = data[cardId];
  if (!CARDS.has(cardId) || !card) throw new Error("That card is not on the board.");
  if (groupTitle) {
    const chosen = (card.groups || []).find((group) => group.title === groupTitle);
    if (!chosen) throw new Error("That stack is not on the board.");
    card = {
      ...card,
      title: (card.title || "Pick") + " · " + groupTitle,
      legs: chosen.legs || [],
      groups: [],
      american: Number(String(chosen.price || "").replace("+", "")) || card.american,
    };
  }
  const fresh = {
    id: crypto.randomBytes(6).toString("hex"),
    card: cardId,
    title: String(card.title || "Pick"),
    game: String(card.game || ""),
    american: card.american,
    impliedPct: card.impliedPct,
    copy: String(card.copy || ""),
    legs: (card.legs || []).map(leg),
    groups: (card.groups || []).map((group) => ({
      title: String(group.title || ""),
      price: String(group.price || ""),
      pct: String(group.pct || ""),
      legs: (group.legs || []).map(leg),
    })),
    savedAt: new Date().toISOString(),
    result: "open",
  };
  if (!fresh.legs.length && !fresh.groups.length) throw new Error("That card has no bet to save.");
  const rows = await picks();
  const prior = rows.find((row) => row.result === "open" && row.card === cardId && row.american === fresh.american && labels(row) === labels(fresh));
  if (prior) return { picks: rows, pick: prior, already: true };
  rows.unshift(fresh);
  await writeKey("bets/picks.json", { picks: rows });
  return { picks: rows, pick: fresh, already: false };
}

async function dropPick(id) {
  const rows = await picks();
  const found = rows.find((row) => String(row.id) === id && row.result === "open");
  if (!found) throw new Error("That pick is not saved.");
  const next = rows.filter((row) => row !== found);
  await writeKey("bets/picks.json", { picks: next });
  return { picks: next };
}

async function settlePick(id, result) {
  if (!RESULTS.has(result)) throw new Error("Mark it won, lost, or push.");
  const rows = await picks();
  const found = rows.find((row) => String(row.id) === id);
  if (!found) throw new Error("That pick is not saved.");
  if (found.result !== "open") throw new Error("That pick is already marked.");
  found.result = result;
  found.settledAt = new Date().toISOString();
  await writeKey("bets/picks.json", { picks: rows });
  return { picks: rows, pick: found };
}

function signature(row) {
  const legs = (row.legs || []).map((item) => String(item.label || "") + "|" + item.odds).join("||");
  return String(row.card || "") + "\n" + String(row.title || "") + "\n" + legs;
}

async function markGood(id, cardId, groupTitle, stars) {
  const data = await board();
  const rows = await archive();
  let found = [];
  if (id) found = rows.filter((row) => String(row.id) === id);
  else if (cardId && data[cardId]) {
    const card = data[cardId];
    const packs = groupTitle
      ? (card.groups || []).filter((group) => group.title === groupTitle)
      : card.groups && card.groups.length
        ? card.groups
        : [{ title: card.title, legs: card.legs || [] }];
    const keys = new Set(packs.map((pack) => {
      let title = card.title || "Bet";
      if (card.groups && card.groups.length) title += " · " + (pack.title || groupTitle || "Stack");
      const legs = (pack.legs || []).map((item) => String(item.label || "") + "|" + item.odds).join("||");
      return cardId + "\n" + title + "\n" + legs;
    }));
    found = rows.filter((row) => keys.has(signature(row)));
  }
  if (!found.length) throw new Error("That bet is not on record yet.");
  const current = (row) => (row.stars != null && row.stars !== "" ? Number(row.stars) || 0 : (row.good ? 1 : 0));
  let next = stars == null || stars === "" ? (found.every((row) => current(row) > 0) ? 0 : 1) : Math.max(0, Math.min(5, Number(stars) || 0));
  if (stars != null && stars !== "" && next && found.every((row) => current(row) === next)) next = 0;
  for (const row of found) {
    row.stars = next;
    row.good = next > 0;
    if (next) row.goodAt = new Date().toISOString();
    else delete row.goodAt;
  }
  await writeKey("bets/archive.json", { tickets: rows });
  return { archive: rows };
}

async function settleArchive(id, result) {
  if (!RESULTS.has(result)) throw new Error("Mark it won, lost, or push.");
  const rows = await archive();
  const found = rows.find((row) => String(row.id) === id);
  if (!found) throw new Error("That bet is not on record.");
  if (found.result && found.result !== "open") throw new Error("That bet is already marked.");
  found.result = result;
  found.settledAt = new Date().toISOString();
  found.how = "marked here";
  await writeKey("bets/archive.json", { tickets: rows });
  return { archive: rows };
}

function send(res, code, body, type) {
  const raw = Buffer.from(body);
  res.writeHead(code, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": raw.length,
  });
  res.end(raw);
}

function sendJson(res, payload, code, headers) {
  const raw = Buffer.from(JSON.stringify(payload));
  res.writeHead(code || 200, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": raw.length,
  }, headers || {}));
  res.end(raw);
}

function cookieToken(req) {
  const hit = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("pod="));
  return hit ? hit.slice(4) : "";
}

function passHash(password, salt) {
  return crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 120000, 32, "sha256").toString("hex");
}

function isAdmin(user) {
  const email = String(user && user.email || "").trim().toLowerCase();
  return email === "bthannan@gmail.com" || Boolean(user && user.admin);
}

function cleanState(value) {
  const state = String(value || "").trim().toUpperCase();
  if (!"AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ").includes(state)) throw new Error("Choose your state.");
  return state;
}

function cleanBook(value) {
  const book = String(value || "").trim().toLowerCase();
  if (!["fanduel", "hardrock", "draftkings", "betmgm", "thescore"].includes(book)) throw new Error("Choose your sportsbook.");
  return book;
}

function cleanBorn(value) {
  const born = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(born);
  if (!match) throw new Error("Enter your date of birth.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Enter your date of birth.");
  const [ty, tm, td] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  let age = ty - year;
  if (tm < month || (tm === month && td < day)) age -= 1;
  if (age < 21) throw new Error("You have to be 21 to use this desk.");
  if (year < ty - 120) throw new Error("Enter your date of birth.");
  return born;
}

function publicMember(user) {
  return { id: user.id, name: user.name, email: user.email, plan: "free", admin: isAdmin(user), state: user.state || "", book: user.book || "", born: user.born || "", fullAt: user.fullAt || "" };
}

async function loadMembers() {
  const data = (await readKey("bets/members.json")) || {};
  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: data.sessions && typeof data.sessions === "object" ? data.sessions : {},
    activity: Array.isArray(data.activity) ? data.activity : [],
  };
}

async function memberFrom(req) {
  const token = cookieToken(req);
  if (!token) return null;
  const data = await loadMembers();
  const session = data.sessions[token];
  if (!session || Number(session.expires) < Date.now() / 1000) return null;
  const user = data.users.find((row) => row.id === session.userId);
  const then = user ? Date.parse(user.lastLogin || "") : NaN;
  if (user && (!Number.isFinite(then) || Date.now() - then >= 600000)) {
    user.lastLogin = new Date().toISOString();
    await writeKey("bets/members.json", data);
  }
  return user || null;
}

function memberProfile(data, user) {
  const activity = data.activity.filter((row) => row.userId === user.id).slice(0, 30);
  return { member: publicMember(user), activity };
}

async function openSession(data, user) {
  const token = crypto.randomBytes(24).toString("hex");
  data.sessions[token] = { userId: user.id, expires: Date.now() / 1000 + 60 * 60 * 24 * 30 };
  await writeKey("bets/members.json", data);
  return token;
}

async function loadReports() {
  const data = (await readKey("bets/reports.json")) || {};
  return { reports: Array.isArray(data.reports) ? data.reports : [] };
}

function reportView(row, mine) {
  return { id: row.id, name: row.name || "", strategy: row.strategy || "", story: row.story || "", at: row.at || "", decision: row.decision || "", mine: Boolean(mine) };
}

async function noteMember(user, kind, detail) {
  const data = await loadMembers();
  data.activity.unshift({ id: crypto.randomBytes(6).toString("hex"), userId: user.id, kind, at: new Date().toISOString(), detail });
  data.activity = data.activity.slice(0, 400);
  await writeKey("bets/members.json", data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function serveStatic(res, name) {
  const file = path.join(STATIC, name);
  if (!file.startsWith(STATIC)) {
    sendJson(res, { error: "not found" }, 404);
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      sendJson(res, { error: "not found" }, 404);
      return;
    }
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      serveStatic(res, "index.html");
      return;
    }
    if (req.method === "GET" && ["/app.css", "/app.js", "/desk.css", "/desk.js", "/choose.js", "/lessons.js", "/swipe.js", "/stars.js", "/filters.js", "/members.js", "/reports.js", "/admin.js", "/sharecard.js", "/states.js", "/states.css", "/ask-bet.js", "/bet-ask.js", "/ask-bet.css", "/us-map.svg", "/doc-view.html", "/logo.png", "/favicon.ico", "/share-template.jpg"].includes(url.pathname)) {
      serveStatic(res, url.pathname.slice(1));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/scene/") && !url.pathname.includes("..")) {
      serveStatic(res, url.pathname.slice(1));
      return;
    }
    if ((req.method === "GET" && url.pathname === "/api/admin") || ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/api/admin/doc/"))) {
      const user = await memberFrom(req);
      if (!user || !isAdmin(user)) { sendJson(res, { error: "Sign in as an admin." }, 403); return; }
      if (url.pathname !== "/api/admin") { sendDoc(req, res, decodeURIComponent(url.pathname.slice(15))); return; }
      sendJson(res, await adminList());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/notes") { sendJson(res, await noteList()); return; }
    if (req.method === "GET" && url.pathname === "/api/admin/ignore") {
      const user = await memberFrom(req);
      if (!user || !isAdmin(user)) { sendJson(res, { error: "Sign in as an admin." }, 403); return; }
      sendJson(res, await ignoreView());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/reports") {
      const user = await memberFrom(req);
      if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
      const data = await loadReports();
      const rows = isAdmin(user) ? data.reports : data.reports.filter((row) => row.userId === user.id);
      sendJson(res, { admin: isAdmin(user), reports: rows.slice(0, 40).map((row) => reportView(row, row.userId === user.id)) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/reports/shot") {
      const user = await memberFrom(req);
      if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
      const data = await loadReports();
      const row = data.reports.find((item) => item.id === url.searchParams.get("id"));
      if (!row || (row.userId !== user.id && !isAdmin(user)) || !row.image) { sendJson(res, { error: "That screenshot is not here." }, 404); return; }
      const blob = Buffer.from(row.image, "base64");
      res.writeHead(200, { "Content-Type": row.mime || "image/png", "Cache-Control": "no-store", "Content-Length": blob.length });
      res.end(blob);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = await memberFrom(req);
      if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
      sendJson(res, memberProfile(await loadMembers(), user));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/record") {
      const rows = await archive();
      const won = rows.filter((ticket) => ticket.result === "won").length;
      const lost = rows.filter((ticket) => ticket.result === "lost").length;
      const decided = won + lost;
      sendJson(res, { won, lost, pct: decided ? ((won / decided) * 100).toFixed(1) : null });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/board") {
      if (!(await memberFrom(req))) { sendJson(res, { error: "Sign in to open the board." }, 401); return; }
      sendJson(res, await publicBoard());
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (url.pathname === "/api/choose") { if (!(await memberFrom(req))) { sendJson(res, { error: "Sign in." }, 401); return; } sendJson(res, await chooseBet(body, await board())); return; }
      if (url.pathname === "/api/bet-ask") { if (!(await memberFrom(req))) { sendJson(res, { error: "Sign in." }, 401); return; } sendJson(res, await researchBet(body)); return; }
      if (url.pathname === "/api/admin/pull") {
        const user = await memberFrom(req);
        if (!user || !isAdmin(user)) { sendJson(res, { error: "Sign in as an admin." }, 403); return; }
        sendJson(res, await pullLive(String(body.card || "")));
        return;
      }
      if (url.pathname === "/api/name") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
        if (name && name.length < 2) throw new Error("Use at least 2 letters, or leave it blank.");
        const data = await loadMembers();
        const row = data.users.find((item) => item.id === user.id);
        if (!row) throw new Error("That membership is not here.");
        row.name = name;
        await writeKey("bets/members.json", data);
        sendJson(res, { member: publicMember(row) });
        return;
      }
      if (url.pathname === "/api/state") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        const state = cleanState(body.state);
        const data = await loadMembers();
        const row = data.users.find((item) => item.id === user.id);
        if (!row) throw new Error("That membership is not here.");
        row.state = state;
        await writeKey("bets/members.json", data);
        sendJson(res, { member: publicMember(row) });
        return;
      }
      if (url.pathname === "/api/born") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        const born = cleanBorn(body.born);
        const data = await loadMembers();
        const row = data.users.find((item) => item.id === user.id);
        if (!row) throw new Error("That membership is not here.");
        row.born = born;
        await writeKey("bets/members.json", data);
        sendJson(res, { member: publicMember(row) });
        return;
      }
      if (url.pathname === "/api/book") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        const book = cleanBook(body.book);
        const data = await loadMembers();
        const row = data.users.find((item) => item.id === user.id);
        if (!row) throw new Error("That membership is not here.");
        row.book = book;
        await writeKey("bets/members.json", data);
        sendJson(res, { member: publicMember(row) });
        return;
      }
      if (url.pathname === "/api/choose/ask") { const user = await memberFrom(req); if (!user) { sendJson(res, { error: "Sign in." }, 401); return; } sendJson(res, await saveAsk(user, body.said, body.missing)); return; }
      if (url.pathname === "/api/taste") { const user = await memberFrom(req); if (!user) { sendJson(res, { error: "Sign in." }, 401); return; } sendJson(res, await noteTaste(user, String(body.slot || ""), body)); return; }
      const cookie = (token) => ({ "Set-Cookie": "pod=" + token + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000" });
      if (url.pathname === "/api/join" || url.pathname === "/api/login") {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const data = await loadMembers();
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (!email.includes("@")) throw new Error("Enter an email.");
        let user = data.users.find((row) => row.email === email);
        if (url.pathname === "/api/join") {
          const name = String(body.name || "").replace(/\s+/g, " ").trim();
          const state = cleanState(body.state);
          const born = cleanBorn(body.born);
          if (name.length < 2) throw new Error("Enter your name.");
          if (user) throw new Error("That email already has a membership.");
          const salt = crypto.randomBytes(16).toString("hex");
          user = { id: crypto.randomBytes(8).toString("hex"), name, email, state, born, salt, hash: passHash(password, salt), plan: "free", createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() };
          data.users.push(user);
        } else {
          const digest = user ? passHash(password, user.salt) : "";
          const match = user && digest.length === user.hash.length && crypto.timingSafeEqual(Buffer.from(user.hash), Buffer.from(digest));
          if (!match) throw new Error("Email or password does not match.");
          user.lastLogin = new Date().toISOString();
        }
        const token = await openSession(data, user);
        sendJson(res, memberProfile(data, user), 200, cookie(token));
        return;
      }
      if (url.pathname === "/api/admin/ignore") {
        const user = await memberFrom(req);
        if (!user || !isAdmin(user)) { sendJson(res, { error: "Sign in as an admin." }, 403); return; }
        sendJson(res, await sweepIgnored());
        return;
      }
      if (url.pathname === "/api/admin/notes") {
        const user = await memberFrom(req);
        if (!user || !isAdmin(user)) { sendJson(res, { error: "Sign in as an admin." }, 403); return; }
        sendJson(res, await noteSave(body));
        return;
      }
      if (url.pathname === "/api/admin/role") {
        const user = await memberFrom(req);
        if (!user || !isAdmin(user)) { sendJson(res, { error: "Sign in as an admin." }, 403); return; }
        sendJson(res, await setMemberAdmin(body.email, body.admin));
        return;
      }
      if (url.pathname === "/api/reports") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        const strategy = String(body.strategy || "").replace(/\s+/g, " ").trim();
        const story = String(body.story || "").replace(/\s+/g, " ").trim();
        if (strategy.length < 8) throw new Error("Say what you did, in a sentence or two.");
        if (story.length < 8) throw new Error("Say a little about the bet.");
        const image = String(body.image || "").split(",").pop();
        const blob = Buffer.from(image, "base64");
        if (blob.length > 1500000) throw new Error("That screenshot is too large.");
        const mime = blob[0] === 0x89 ? "image/png" : blob[0] === 0xff ? "image/jpeg" : "";
        if (!mime) throw new Error("Use a PNG or JPEG screenshot.");
        const data = await loadReports();
        data.reports.unshift({ id: crypto.randomBytes(8).toString("hex"), userId: user.id, name: user.name, strategy: strategy.slice(0, 400), story: story.slice(0, 1200), image, mime, at: new Date().toISOString(), decision: "" });
        data.reports = data.reports.slice(0, 200);
        await writeKey("bets/reports.json", data);
        sendJson(res, { ok: true });
        return;
      }
      if (url.pathname === "/api/reports/decision") {
        const user = await memberFrom(req);
        if (!user || !isAdmin(user)) throw new Error("Sign in as an admin.");
        const choice = String(body.decision || "");
        if (choice !== "use" && choice !== "skip") throw new Error("Choose use or skip.");
        const data = await loadReports();
        const row = data.reports.find((item) => item.id === String(body.id || ""));
        if (!row) throw new Error("That report is not here.");
        row.decision = choice;
        await writeKey("bets/reports.json", data);
        sendJson(res, { ok: true });
        return;
      }
      if (url.pathname === "/api/logout") {
        const data = await loadMembers();
        delete data.sessions[cookieToken(req)];
        await writeKey("bets/members.json", data);
        sendJson(res, { ok: true }, 200, { "Set-Cookie": "pod=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });
        return;
      }
      if (url.pathname === "/api/picks") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        const saved = await savePick(String(body.card || ""), String(body.group || ""));
        await noteMember(user, "save", { card: String(body.card || ""), group: String(body.group || "") });
        sendJson(res, saved);
        return;
      }
      if (url.pathname === "/api/picks/drop") {
        if (!(await memberFrom(req))) { sendJson(res, { error: "Sign in." }, 401); return; }
        sendJson(res, await dropPick(String(body.id || "")));
        return;
      }
      if (url.pathname === "/api/picks/settle") {
        sendJson(res, await settlePick(String(body.id || ""), String(body.result || "")));
        return;
      }
      if (url.pathname === "/api/archive/good") {
        const user = await memberFrom(req);
        if (!user) { sendJson(res, { error: "Sign in." }, 401); return; }
        if (body.built) { sendJson(res, await saveRated(user, body)); return; }
        const saved = await markGood(String(body.id || ""), String(body.card || ""), String(body.group || ""), body.stars);
        await noteMember(user, "rate", { stars: Number(body.stars) || 0, id: String(body.id || ""), card: String(body.card || ""), group: String(body.group || "") });
        sendJson(res, saved);
        return;
      }
      if (url.pathname === "/api/archive/settle") {
        sendJson(res, await settleArchive(String(body.id || ""), String(body.result || "")));
        return;
      }
    }
    sendJson(res, { error: "not found" }, 404);
  } catch (err) {
    sendJson(res, { error: err.message || "The desk could not answer." }, 400);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Betting desk site on port " + PORT);
});
