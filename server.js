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
 *
 * The Mac keeps pulling FanDuel and writes bets/board.json and bets/archive.json.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const STATIC = path.join(ROOT, "nfl_bets", "static");
const PORT = Number(process.env.PORT || 3000);
const CARDS = new Set(["chalk", "four", "plus", "hits", "todayBet"]);
const RESULTS = new Set(["won", "lost", "push"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
};

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

function sendJson(res, payload, code) {
  send(res, code || 200, JSON.stringify(payload));
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
    if (req.method === "GET" && ["/app.css", "/app.js", "/choose.js", "/lessons.js", "/swipe.js", "/stars.js", "/subscription.pdf", "/feasibility.pdf"].includes(url.pathname)) {
      serveStatic(res, url.pathname.slice(1));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/board") {
      sendJson(res, await publicBoard());
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (url.pathname === "/api/picks") {
        sendJson(res, await savePick(String(body.card || ""), String(body.group || "")));
        return;
      }
      if (url.pathname === "/api/picks/settle") {
        sendJson(res, await settlePick(String(body.id || ""), String(body.result || "")));
        return;
      }
      if (url.pathname === "/api/archive/good") {
        sendJson(res, await markGood(String(body.id || ""), String(body.card || ""), String(body.group || ""), body.stars));
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
