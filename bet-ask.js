const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.BET_MODEL || "llama3.2";
function geminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim() || "gemini-3.8-flash";
}
const SYSTEM = "You are the parrot on a sports desk. Answer the question using only this card. Explain what the prices and notes mean in plain words. If the question names a player or team that is not on the card, say they are not on this bet, then talk about the players who are. Do not invent stats, injuries, or a final score. Do not say the bet will win. Finish every sentence. Use a short paragraph, and end on a complete sentence. Do not repeat a game time. Do not quote the card back as a list.";

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cardText(card) {
  const legs = (Array.isArray(card.legs) ? card.legs : []).slice(0, 10).map((leg) => (
    [clip(leg.price, 16), clip(leg.name, 90), clip(leg.more, 180), clip(leg.pct, 16), clip(leg.quiet, 240)].filter(Boolean).join(" | ")
  ));
  return [
    clip(card.title, 80),
    clip(card.aim, 160),
    ...(Array.isArray(card.copy) ? card.copy : []).slice(0, 4).map((line) => clip(line, 300)),
    ...legs,
  ].filter(Boolean).join("\n");
}

function promptFor(facts, question) {
  return `Card:\n${facts}\n\nQuestion: ${question}`;
}

function clean(text) {
  const bare = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\s+/g, " ").trim();
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

async function geminiCall(key, question, facts, think) {
  const generationConfig = { maxOutputTokens: 640 };
  if (think) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: promptFor(facts, question) }] }],
      generationConfig,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, text: said(payload), error: payload };
}

async function askGemini(question, facts) {
  const key = geminiKey();
  let result = await geminiCall(key, question, facts, true);
  const message = String((result.error.error && result.error.error.message) || "");
  if (result.status === 400 && /thinking/i.test(message)) result = await geminiCall(key, question, facts, false);
  if (result.status === 429) throw new Error("The bird is busy. Ask again in a minute.");
  if (result.status < 200 || result.status >= 300 || !result.text) throw new Error(geminiFail(result.status, result.error));
  return result.text;
}

async function askLocal(question, facts) {
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: LOCAL_MODEL,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: promptFor(facts, question) },
      ],
      options: { temperature: 0.4, num_predict: 420 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const text = clean(payload.message && payload.message.content);
  if (!response.ok || !text) throw new Error("The bird could not think of that.");
  return text;
}

async function askBet(question, card) {
  const q = clip(question, 160);
  if (q.length < 2) throw new Error("Ask a question about this bet.");
  const facts = cardText(card || {});
  if (!facts) throw new Error("Open a bet first.");
  try {
    if (!geminiKey()) {
      try {
        return { answer: await askLocal(q, facts) };
      } catch (error) {
        throw new Error("This server has no GEMINI_API_KEY. Add that name in Hostinger and restart the Node app.");
      }
    }
    return { answer: await askGemini(q, facts) };
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("That took too long. Ask again.");
    if (String(error.message || "").startsWith("The bird") || String(error.message || "").startsWith("This server") || String(error.message || "").startsWith("Google did not")) throw error;
    throw new Error("The bird could not think of that.");
  }
}

module.exports = { askBet };
