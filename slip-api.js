/** A pasted bet slip, read into legs and checked against the live box score. */

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { gradeLegs } = require("./slip-grade");
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.BET_MODEL || "llama3.2";
const VISION = process.env.SLIP_MODEL || "qwen3-vl:8b-instruct";
const SWIFT = "/Users/brianhannan/Documents/PilotFish Sandbox/tools/sandbox_control/ocr_vision.swift";
const KEY = "bets/slips.json";
const ASK = `Read every leg on this bet slip. A 3-bet parlay has 3 legs. Do not merge legs into one.
A team to win is its own leg: player is the team, market is "to win", side is "win", line is null.
A player prop: player is the person in normal case, market is only the stat ("rushing yards"), side is over or under, line is the number.
match is the game line as printed, Away @ Home. when is "" when the slip says Today, otherwise YYYY-MM-DD.
odds is the parlay price. stake is the dollars risked, payout is the dollars paid if it wins. Use "" when that number is not printed. sport is NFL, NBA, NHL, MLB, WNBA, or NCAAF.
{"book":"","odds":"-101","stake":"$10.03","payout":"$20.00","legs":[{"player":"Commanders","market":"to win","side":"win","line":null,"match":"Eagles @ Commanders","when":"","sport":"NFL"},{"player":"Saquon Barkley","market":"rushing yards","side":"over","line":24.5,"match":"Eagles @ Commanders","when":"","sport":"NFL"}]}`;
const MONEY = `Read the wager and the payout on this bet slip. Return JSON only. {"stake":"$10.03","payout":"$20.00"} stake is the dollars risked. payout is what it pays if the bet wins. Use "" if that number is not printed.`;

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim().replace(/^["']|["']$/g, "");
}

function geminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim() || "gemini-3.8-flash";
}

async function load(readKey) {
  const data = (await readKey(KEY)) || {};
  return { slips: Array.isArray(data.slips) ? data.slips : [] };
}

function grade(legs) {
  return gradeLegs(legs);
}

function done(leg) {
  return !!(leg && (leg.result === "won" || leg.result === "lost" || leg.result === "push"));
}

function pack(leg, prior) {
  const row = {
    player: leg.player || (prior && prior.player) || "",
    market: leg.market || (prior && prior.market) || "",
    side: leg.side || (prior && prior.side) || "",
    line: leg.line == null ? (prior && prior.line) : leg.line,
    match: leg.match || (prior && prior.match) || "",
    when: leg.when || (prior && prior.when) || "",
    sport: leg.sport || (prior && prior.sport) || "",
    espnId: leg.espnId || (prior && prior.espnId) || "",
    kickoff: leg.kickoff || (prior && prior.kickoff) || "",
  };
  if (!done(leg)) return row;
  row.result = leg.result;
  row.say = leg.say || "";
  row.text = leg.text || "";
  row.pace = leg.pace || "";
  row.chance = Number.isFinite(Number(leg.chance)) ? Number(leg.chance) : null;
  row.clock = leg.clock || "";
  if (typeof leg.have === "number") row.have = leg.have;
  return row;
}

function show(slip, legs) {
  const reached = legs.filter((leg) => leg.result === "won").length;
  const missed = legs.some((leg) => leg.result === "lost");
  const nums = legs.map((leg) => Number(leg.chance)).filter((n) => Number.isFinite(n));
  const chance = missed ? 0 : nums.length === legs.length && legs.length ? Math.max(0, Math.min(100, Math.round(nums.reduce((acc, n) => acc * (n / 100), 1) * 100))) : null;
  const base = missed ? "This bet missed." : legs.length && reached === legs.length ? "This bet is reached." : `${reached} of ${legs.length} ${legs.length === 1 ? "leg" : "legs"} reached.`;
  const line = missed || (legs.length && reached === legs.length) || chance == null ? base : `${base} ${chance}% to win this bet.`;
  return { id: slip.id, book: slip.book || "", odds: slip.odds || "", stake: slip.stake || "", payout: slip.payout || "", at: slip.at, shot: slip.shot || "", line, chance, legs };
}

async function slipList(user, readKey, writeKey) {
  const data = await load(readKey);
  const mine = data.slips.filter((row) => row.userId === user.id);
  let dirty = false;
  const slips = await Promise.all(mine.map(async (slip) => {
    const saved = slip.legs || [];
    const open = saved.filter((leg) => !done(leg));
    let fresh = [];
    if (open.length) {
      try { fresh = await grade(open); } catch (err) { console.error("slip grade:", err && err.message); fresh = open.map((leg) => ({ ...leg, say: "Waiting on the game.", result: "open", text: [leg.player, leg.market].filter(Boolean).join(" ") })); }
    }
    let at = 0;
    const legs = saved.map((leg) => (done(leg) ? leg : (fresh[at++] || leg)));
    const next = legs.map((leg, index) => pack(leg, saved[index]));
    if (JSON.stringify(next) !== JSON.stringify(saved)) { slip.legs = next; dirty = true; }
    if (!slip.money && slip.shot) {
      try {
        const money = await readMoney(String(slip.shot).split(",").pop());
        slip.stake = money.stake; slip.payout = money.payout; slip.money = true; dirty = true;
      } catch (err) { console.error("slip money:", err && err.message); }
    }
    return show(slip, legs);
  }));
  if (dirty) await writeKey(KEY, data);
  return { slips };
}

function parseSlip(text) {
  const start = String(text || "").indexOf("{");
  const end = String(text || "").lastIndexOf("}");
  let body = {};
  if (start >= 0 && end > start) {
    try { body = JSON.parse(String(text).slice(start, end + 1)); } catch (err) { body = {}; }
  }
  const legs = (Array.isArray(body.legs) ? body.legs : []).filter((leg) => leg && (leg.player || leg.market)).slice(0, 16);
  if (!legs.length) {
    console.error("slip read:", String(text || "").replace(/\s+/g, " ").slice(0, 300));
    throw new Error("I could not read a bet on that screenshot.");
  }
  return { book: String(body.book || "").slice(0, 40), odds: String(body.odds || "").slice(0, 20), stake: dollars(body.stake), payout: dollars(body.payout), kind: String(body.kind || "").slice(0, 40), legs };
}

function dollars(value) {
  const text = String(value || "").replace(/[^0-9.]/g, "");
  const num = Number(text);
  if (!text || !Number.isFinite(num) || num <= 0) return "";
  return `$${num.toFixed(2)}`;
}

function parseMoney(text) {
  const start = String(text || "").indexOf("{");
  const end = String(text || "").lastIndexOf("}");
  let body = {};
  if (start >= 0 && end > start) { try { body = JSON.parse(String(text).slice(start, end + 1)); } catch (err) { body = {}; } }
  return { stake: dollars(body.stake), payout: dollars(body.payout) };
}

async function readMoney(image) {
  if (!onMac()) {
    const key = geminiKey();
    if (!key) return { stake: "", payout: "" };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: image } }, { text: MONEY }] }], generationConfig: { maxOutputTokens: 200, temperature: 0 } }),
    });
    const payload = await response.json().catch(() => ({}));
    const text = ((((payload.candidates || [])[0] || {}).content || {}).parts || []).filter((part) => part && part.text && !part.thought).map((part) => part.text).join(" ");
    if (!response.ok || !text) throw new Error("I could not read the wager.");
    return parseMoney(text);
  }
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: VISION, stream: false, format: "json", think: false,
      messages: [{ role: "system", content: "You read a sportsbook bet slip. Return JSON only." }, { role: "user", content: MONEY, images: [image] }],
      options: { temperature: 0, num_predict: 200 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const raw = String((payload.message && (payload.message.content || payload.message.thinking)) || "");
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!response.ok || !text) throw new Error("Ollama did not read the wager.");
  return parseMoney(text);
}

function ocrShot(image, mime) {
  const ext = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : mime === "image/gif" ? ".gif" : ".png";
  const file = path.join(os.tmpdir(), `slip-${process.pid}-${Date.now()}${ext}`);
  fs.writeFileSync(file, Buffer.from(image, "base64"));
  const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}` };
  try {
    let text = "";
    const tess = fs.existsSync("/opt/homebrew/bin/tesseract") ? "/opt/homebrew/bin/tesseract" : "tesseract";
    try { text = execFileSync(tess, [file, "stdout", "-l", "eng", "--psm", "6"], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024, env }).trim(); } catch (err) { text = ""; }
    if (text.length < 40 && fs.existsSync(SWIFT)) {
      try {
        const seen = execFileSync("/usr/bin/swift", [SWIFT, file], { encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024, env }).trim();
        if (seen.length > text.length) text = seen;
      } catch (err) { text = text; }
    }
    return text;
  } finally {
    try { fs.unlinkSync(file); } catch (err) { /* temp shot is already gone */ }
  }
}

async function readWords(text, ask) {
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: LOCAL_MODEL,
      stream: false,
      think: false,
      messages: [{ role: "user", content: `${ask || ASK}\n\nSlip text:\n${String(text).slice(0, 6000)}` }],
      options: { temperature: 0, num_predict: 1200 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const raw = String((payload.message && (payload.message.content || payload.message.thinking)) || "");
  const spoken = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!response.ok || !spoken) throw new Error("Ollama did not read that screenshot. Start it on this Mac and paste again.");
  return parseSlip(spoken);
}

function onMac() {
  return process.platform === "darwin";
}

async function readLocal(image, ask) {
  let response;
  try {
    response = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: VISION,
        stream: false,
        format: "json",
        think: false,
        messages: [
          { role: "system", content: "You read a sportsbook bet slip. Return JSON only." },
          { role: "user", content: ask || ASK, images: [image] },
        ],
        options: { temperature: 0, num_predict: 1200 },
      }),
    });
  } catch (err) {
    throw new Error("Ollama did not read that screenshot. Start it on this Mac and paste again.");
  }
  const payload = await response.json().catch(() => ({}));
  const raw = String((payload.message && (payload.message.content || payload.message.thinking)) || "");
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!response.ok || !text) throw new Error("Ollama did not read that screenshot. Start it on this Mac and paste again.");
  return parseSlip(text);
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

async function readShot(image, mime, ask) {
  const prompt = ask || ASK;
  if (onMac()) {
    try { return await readLocal(image, prompt); } catch (err) {
      const text = ocrShot(image, mime);
      if (text.length >= 20) return readWords(text, prompt);
      throw err;
    }
  }
  const key = geminiKey();
  if (!key) throw new Error("This server has no GEMINI_API_KEY. Add that name in Hostinger and restart the Node app.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: image } }, { text: prompt }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const parts = ((((payload.candidates || [])[0] || {}).content || {}).parts || []);
  const text = parts.filter((part) => part && part.text && !part.thought).map((part) => part.text).join(" ");
  if (!response.ok || !text) {
    const again = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: image } }, { text: prompt }] }] }),
    });
    const second = await again.json().catch(() => ({}));
    const more = ((((second.candidates || [])[0] || {}).content || {}).parts || []).filter((part) => part && part.text && !part.thought).map((part) => part.text).join(" ");
    if (!again.ok || !more) throw new Error("I could not read a bet on that screenshot.");
    return parseSlip(more);
  }
  return parseSlip(text);
}

async function slipPost(user, body, readKey, writeKey) {
  if (body && body.drop) {
    const data = await load(readKey);
    data.slips = data.slips.filter((row) => !(row.userId === user.id && row.id === String(body.id || "")));
    await writeKey(KEY, data);
    return slipList(user, readKey, writeKey);
  }
  const image = String((body && body.image) || "").split(",").pop();
  const blob = Buffer.from(image, "base64");
  const mime = blob[0] === 0x89 ? "image/png" : blob[0] === 0xff ? "image/jpeg" : blob[0] === 0x52 ? "image/webp" : "";
  if (!mime || blob.length < 32 || blob.length > 6 * 1024 * 1024) throw new Error("Paste a screenshot of the bet.");
  const read = await readShot(image, mime);
  const data = await load(readKey);
  data.slips.unshift({
    id: require("crypto").randomBytes(8).toString("hex"),
    userId: user.id,
    book: read.book,
    odds: read.odds,
    stake: read.stake || "",
    payout: read.payout || "",
    money: !!(read.stake || read.payout),
    at: new Date().toISOString(),
    shot: String((body && body.image) || "").startsWith("data:image/") && String(body.image).length < 1800000 ? String(body.image) : "",
    legs: read.legs.map((leg) => ({
      player: String(leg.player || "").slice(0, 80),
      market: String(leg.market || "").slice(0, 80),
      side: String(leg.side || "").toLowerCase(),
      line: Number(leg.line),
      match: String(leg.match || "").slice(0, 120),
      when: /^\d{4}-\d{2}-\d{2}$/.test(String(leg.when || "")) ? String(leg.when).slice(0, 10) : today(),
      sport: String(leg.sport || "").toUpperCase(),
    })),
  });
  data.slips = data.slips.filter((row) => row.userId === user.id).slice(0, 8).concat(data.slips.filter((row) => row.userId !== user.id)).slice(0, 80);
  await writeKey(KEY, data);
  return slipList(user, readKey, writeKey);
}

module.exports = { slipList, slipPost, readShot };
