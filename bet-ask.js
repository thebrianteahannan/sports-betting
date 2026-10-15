const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.BET_MODEL || "llama3.2";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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

async function askGemini(question, facts) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: promptFor(facts, question) }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 420, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 429) throw new Error("The bird is busy. Ask again in a minute.");
  const text = clean(((payload.candidates || [])[0] || {}).content && (((payload.candidates || [])[0].content.parts || []).map((part) => part.text).join(" ")));
  if (!response.ok || !text) throw new Error("The bird could not think of that.");
  return text;
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
    const answer = process.env.GEMINI_API_KEY ? await askGemini(q, facts) : await askLocal(q, facts);
    return { answer };
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("That took too long. Ask again.");
    if (String(error.message || "").startsWith("The bird") || error.message === "Ask a question about this bet." || error.message === "Open a bet first.") throw error;
    throw new Error("The bird could not think of that.");
  }
}

module.exports = { askBet };
