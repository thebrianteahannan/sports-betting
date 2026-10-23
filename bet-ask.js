const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.BET_MODEL || "llama3.2";
function geminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim() || "gemini-3.8-flash";
}
const SYSTEM = "You are the parrot on a sports desk. Someone is asking about the bet on the screen. Answer the question the way you would answer a person. The background is the bet and the ESPN pages already pulled. The web results are there so you can look past that. Use both. Talk about what you found. Do not say the bet will win. Do not mention a public log. Use a short paragraph and finish every sentence.";
const MATH = "You are the parrot on a sports desk. The worth math is already done. Say it in a short paragraph. Keep every dollar amount and every percent the same. If the math says the long run is not known, say that. Do not use a win projection. Do not mention a public log.";

function clip(value, max) {
  return String(value || "").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function cardText(card) {
  const legs = (Array.isArray(card.legs) ? card.legs : []).slice(0, 10).map((leg) => (
    [clip(leg.price, 16), clip(leg.name, 180), clip(leg.more, 180), clip(leg.pct, 16)].filter(Boolean).join(" | ")
  ));
  return [
    clip(card.title, 120),
    clip(card.aim, 240),
    ...(Array.isArray(card.copy) ? card.copy : []).slice(0, 8).map((line) => clip(line, 2400)),
    ...legs,
  ].filter(Boolean).join("\n");
}

function promptFor(facts, question, web) {
  const found = web ? `\n\nWeb results:\n${web}` : "";
  return `The bet and the ESPN pages are background. Answer the question. Use the background and the web results.\n\nBackground:\n${facts}${found}\n\nQuestion: ${question}`;
}

function keepsMath(answer, worth) {
  const need = (String(worth).match(/win ([\d.]+)%/) || [])[1];
  const profit = (String(worth).match(/profit is \$([\d.]+)/) || [])[1];
  if (!need || !String(answer).includes(need)) return false;
  if (profit && !String(answer).includes(profit)) return false;
  const dollars = [...String(answer).matchAll(/\$(\d+(?:\.\d+)?)/g)].map((match) => match[1]);
  if (dollars.some((amount) => !String(worth).includes(`$${amount}`))) return false;
  if (/long run is not known/.test(worth) && /profit in the long run|not profitable|expects a profit|expects a loss/i.test(answer)) return false;
  if (/expects a profit/.test(worth) && !/profit/i.test(answer)) return false;
  if (/expects a loss/.test(worth) && !/loss/i.test(answer)) return false;
  return true;
}

async function webNotes(question) {
  const response = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(question)}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return "";
  const html = await response.text();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&quot;/g, "'")
    .replace(/\s+/g, " ")
    .trim());
  return rows.filter((line) => line.length > 45 && !/duckduckgo|lite search/i.test(line)).slice(0, 6).join("\n");
}

function clean(text) {
  const bare = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[ \t]+/g, " ").trim();
  if (bare.length <= 1600) return bare;
  const cut = bare.slice(0, 1600);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return end > 240 ? cut.slice(0, end + 1) : cut;
}

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim().replace(/^["']|["']$/g, "");
}

function said(payload) {
  const parts = ((((payload.candidates || [])[0] || {}).content || {}).parts || []);
  const words = parts.filter((part) => part && part.text && !part.thought).map((part) => part.text).join(" ");
  const any = parts.filter((part) => part && part.text).map((part) => part.text).join(" ");
  return clean(words || any);
}

function geminiFail(status, payload) {
  const message = String((payload.error && payload.error.message) || "").replace(/\s+/g, " ").trim();
  if (status === 429 || /quota|resource_exhausted/i.test(message)) return "The bird is busy. Ask again in a minute.";
  if (/api key/i.test(message)) return "Google did not accept the Gemini key. In Hostinger the name has to be GEMINI_API_KEY, then restart the Node app.";
  if (message) return `The bird could not think of that. ${message.slice(0, 160)}`;
  return "The bird could not think of that.";
}

async function geminiCall(key, question, facts, think, search, locked) {
  const generationConfig = { maxOutputTokens: 640 };
  if (think) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  const body = {
    systemInstruction: { parts: [{ text: locked ? MATH : SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: promptFor(facts, question) }] }],
    generationConfig,
  };
  if (search) body.tools = [{ google_search: {} }];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, text: said(payload), error: payload };
}

async function askGemini(question, facts, locked) {
  const key = geminiKey();
  let result = await geminiCall(key, question, facts, !locked, !locked, locked);
  if (result.status === 400 && !locked) result = await geminiCall(key, question, facts, false, true, false);
  if (result.status === 400) result = await geminiCall(key, question, facts, false, false, locked);
  if (result.status === 429) throw new Error("The bird is busy. Ask again in a minute.");
  if (result.status < 200 || result.status >= 300 || !result.text) throw new Error(geminiFail(result.status, result.error));
  return result.text;
}

async function askLocal(question, facts, locked) {
  let web = "";
  if (!locked) try { web = await webNotes(question); } catch (err) { web = ""; }
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: LOCAL_MODEL,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: locked ? MATH : SYSTEM },
        { role: "user", content: locked ? `Worth math:\n${facts}\n\nSay this in your own words. Keep every dollar amount and every percent.` : promptFor(facts, question, web) },
      ],
      options: { temperature: locked ? 0 : 0.4, num_predict: locked ? 220 : 420 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const text = clean(payload.message && payload.message.content);
  if (!response.ok || !text) throw new Error("The bird could not think of that.");
  return text;
}

function onMac() {
  return process.platform === "darwin";
}

async function askBet(question, card) {
  const q = clip(question, 240);
  if (q.length < 2) throw new Error("Ask a question about this bet.");
  const facts = cardText(card || {});
  if (!facts) throw new Error("Open a bet first.");
  const locked = Boolean(card && card.locked);
  const worth = locked ? clip((card.copy || [])[0], 900) : "";
  try {
    let spoken = "";
    if (onMac()) {
      try {
        spoken = await askLocal(q, facts, locked);
      } catch (error) {
        throw new Error("Ollama did not answer. Start it on this Mac and ask again.");
      }
    } else {
      if (!geminiKey()) throw new Error("This server has no GEMINI_API_KEY. Add that name in Hostinger and restart the Node app.");
      spoken = await askGemini(q, facts, locked);
    }
    return { answer: locked && !keepsMath(spoken, worth) ? worth : spoken };
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("That took too long. Ask again.");
    if (String(error.message || "").startsWith("The bird") || String(error.message || "").startsWith("This server") || String(error.message || "").startsWith("Google did not") || String(error.message || "").startsWith("Ollama did not")) throw error;
    throw new Error("The bird could not think of that.");
  }
}

module.exports = { askBet };
