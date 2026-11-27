/** Sends the finished price-clock lines through the local model and keeps a line only when the numbers survive. */

const crypto = require("crypto");
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL = "qwen3-vl:8b-instruct";

let held = { mark: "", voice: null };
let pending = null;

function pointSize(n) {
  return String(Math.abs(Math.round(Number(n) * 10) / 10));
}

function whenSay(clock) {
  const text = String(clock.when || "");
  if (!/ out$/.test(text)) return text;
  const word = clock.sport === "NFL" ? "kickoff" : "the game";
  return `${text.replace(/ out$/, "")} before ${word}`;
}

function betSay(clock) {
  const side = String(clock.side || "").toLowerCase();
  let prop = String(clock.prop || "");
  if (prop === "Anytime TD") prop = clock.sport === "NHL" ? "anytime goals" : "anytime TDs";
  else if (prop === "Game total") prop = "the game total";
  else prop = prop.toLowerCase().replace(/\btds\b/g, "TDs");
  const who = side === "over" ? "overs" : side === "under" ? "unders" : "";
  return [clock.sport, who && `${who} on`, prop].filter(Boolean).join(" ");
}

function clockKey(row) {
  return [row.sport, row.prop, row.side, row.when].join("|");
}

function groupOf(clock) {
  if (clock.faded) return "skip";
  if (clock.way === "longer") return "wait";
  return clock.held ? "bet" : "fresh";
}

function at(when) {
  if (!when) return "";
  if (/^(in |early )/i.test(when)) return ` ${when}`;
  return ` in the ${when}`;
}

function trendLine(row) {
  const where = at(row.when);
  if (row.group === "skip") return `In ${row.hit} games, ${row.bet} move about ${row.size} points${where}, then the price comes back.`;
  if (row.group === "wait") return `In ${row.hit} games, ${row.bet} get about ${row.size} points cheaper${where}. Wait.`;
  const stay = row.group === "bet" ? " That price stays." : "";
  return `In ${row.hit} games, ${row.bet} cost about ${row.size} points more${where}.${stay}`;
}

function sheet(data) {
  const dive = (data && data.dive) || {};
  const clocks = Array.isArray(dive.clocks) ? dive.clocks : [];
  const early = Array.isArray(data && data.early) ? data.early : [];
  const rows = clocks.map((clock, index) => ({
    id: `c${index}`,
    key: clockKey(clock),
    group: groupOf(clock),
    bet: betSay(clock),
    when: whenSay(clock),
    hit: `${clock.agree} of ${clock.games}`,
    agree: Number(clock.agree),
    games: Number(clock.games),
    size: pointSize(clock.points),
  }));
  rows.forEach((row) => { row.line = trendLine(row); });
  const bets = new Map();
  (dive.now || []).forEach((line) => {
    const text = String(line || "");
    const row = early.find((item) => item && item.label && text.startsWith(`Take ${item.label}`));
    if (!row) return;
    const clock = rows.find((item) => item.key === clockKey(row));
    if (!clock) return;
    const bag = bets.get(clock.key) || { id: `b${bets.size}`, clock, tickets: [], names: [] };
    const price = Number(row.odds);
    const shown = Number.isFinite(price) && price ? (price > 0 ? `+${price}` : `−${Math.abs(price)}`) : "";
    const kick = text.match(/Kickoff is ([^.]+)/);
    const ticket = `${row.label}${shown ? ` at ${shown}` : ""}.${kick ? ` ${kick[1]}.` : ""}`;
    if (!bag.tickets.includes(ticket)) bag.tickets.push(ticket);
    String(row.label).split(/\s+/).filter((word) => /^[A-Z][a-z]{2,}/.test(word)).forEach((name) => {
      if (!bag.names.includes(name)) bag.names.push(name);
    });
    bets.set(clock.key, bag);
  });
  const used = new Set(bets.keys());
  const slots = [
    ...[...bets.values()].map((bag) => ({ id: `BET ${bag.id}`, key: bag.clock.key, group: "bets", line: `${bag.tickets.join(" ")} ${bag.clock.line}`, names: bag.names, agree: bag.clock.agree, games: bag.clock.games, size: bag.clock.size })),
    ...rows.filter((row) => row.group === "wait").map((row) => ({ id: `WAIT ${row.id}`, key: row.key, group: "wait", line: row.line, agree: row.agree, games: row.games, size: row.size })),
    ...rows.filter((row) => row.group === "bet" && !used.has(row.key)).map((row) => ({ id: `STAY ${row.id}`, key: row.key, group: "stay", line: row.line, agree: row.agree, games: row.games, size: row.size })),
    ...rows.filter((row) => row.group === "fresh" && !used.has(row.key)).map((row) => ({ id: `SOON ${row.id}`, key: row.key, group: "soon", line: row.line, agree: row.agree, games: row.games, size: row.size })),
    ...rows.filter((row) => row.group === "skip").map((row) => ({ id: `SKIP ${row.id}`, key: row.key, group: "skip", line: row.line, agree: row.agree, games: row.games, size: row.size })),
  ];
  const mark = crypto.createHash("sha1").update(slots.map((slot) => `${slot.id}: ${slot.line}`).join("\n")).digest("hex").slice(0, 12);
  return { mark, rows, slots };
}

function clean(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[ \t]+/g, " ").trim();
}

function bad(text) {
  return /will win|long run|no settled|can't promise|cannot promise|gambler|21\+/i.test(text);
}

function hasSize(sentence, size) {
  return new RegExp(`(^|[^\\d.])${String(size).replace(".", "\\.")}([^\\d.]|$)`).test(sentence);
}

function hasHit(sentence, agree, games) {
  if (sentence.includes(`${agree} of ${games}`)) return true;
  const one = new RegExp(`\\b${agree}\\b`).test(sentence);
  const two = new RegExp(`\\b${games}\\b`).test(sentence);
  if (agree === games) return one && /all|every|each/i.test(sentence);
  return one && two;
}

function sameNumbers(source, sentence) {
  const from = String(source).match(/\d+(?:\.\d+)?/g) || [];
  const to = String(sentence).match(/\d+(?:\.\d+)?/g) || [];
  return to.every((n) => from.includes(n));
}

function readLines(text) {
  const found = {};
  String(text || "").split(/\n/).forEach((raw) => {
    const line = raw.replace(/^[-*]\s*/, "").trim();
    const match = line.match(/^(BET|WAIT|SKIP|STAY|SOON)\s+(\S+):\s*(.+)$/i);
    if (!match) return;
    const key = `${match[1].toUpperCase()} ${String(match[2]).toLowerCase()}`;
    const sentence = clean(match[3]).replace(/^["']|["']$/g, "");
    if (!sentence || bad(sentence) || sentence.length > 280) return;
    found[key] = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  });
  return found;
}

const SYSTEM = "Rewrite each line the way you would tell a friend what to bet, what to wait on, and what to skip. Keep every name, price, count, and point size. Do not add a number. Do not drop a player's name. Do not say a bet will win. Do not say a result has not finished. One or two sentences. Reply with the same labels.";

async function askLocal(text) {
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: LOCAL,
      stream: false,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
      options: { temperature: 0.3, num_predict: 500 },
    }),
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => ({}));
  return clean(payload.message && payload.message.content);
}

async function askGemini(text) {
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!key) return "";
  const model = String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim() || "gemini-3.8-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 700 },
    }),
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => ({}));
  const parts = ((((payload.candidates || [])[0] || {}).content || {}).parts || []);
  return clean(parts.filter((part) => part && part.text && !part.thought).map((part) => part.text).join("\n"));
}

async function ask(text) {
  return process.platform === "darwin" ? askLocal(text) : askGemini(text);
}

function keep(source, sentence, row) {
  if (!sentence || !source || !sameNumbers(source, sentence)) return "";
  if (/finish yet|same bets|have not seen/i.test(sentence)) return "";
  if (row && row.names && row.names.some((name) => !sentence.includes(name))) return "";
  if (row && (!hasHit(sentence, row.agree, row.games) || !hasSize(sentence, row.size))) return "";
  return sentence;
}

async function rewrite(pack) {
  const found = {};
  for (let i = 0; i < pack.slots.length; i += 4) {
    const chunk = pack.slots.slice(i, i + 4);
    const text = await ask(`Rewrite these lines.\n${chunk.map((slot) => `${slot.id}: ${slot.line}`).join("\n")}`);
    Object.assign(found, readLines(text));
  }
  const voice = { v: 2, bets: {}, wait: {}, skip: {}, stay: {}, soon: {} };
  pack.slots.forEach((slot) => {
    const sentence = keep(slot.line, found[slot.id], slot);
    if (sentence && voice[slot.group]) voice[slot.group][slot.key] = sentence;
  });
  const n = Object.values(voice).filter((bag) => bag && typeof bag === "object").reduce((sum, bag) => sum + Object.keys(bag).length, 0);
  return n ? voice : null;
}

async function say(data) {
  const pack = sheet(data);
  if (!pack.rows.length) return null;
  if (held.mark === pack.mark && held.voice) return held.voice;
  if (!pending || pending.mark !== pack.mark) pending = { mark: pack.mark, run: rewrite(pack).catch(() => null) };
  const voice = await pending.run;
  if (pending && pending.mark === pack.mark) pending = null;
  if (voice) held = { mark: pack.mark, voice };
  return voice;
}

module.exports = { say };
