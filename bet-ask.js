const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.BET_MODEL || "llama3.2";
function geminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim() || "gemini-3.8-flash";
}
const SYSTEM = "You are the parrot on a sports desk. Someone is asking about the bet on the screen. Answer the question the way you would answer a person. The background is the bet and the ESPN pages already pulled. The web results are there so you can look past that. Use both. Talk about what you found. Do not say the bet will win. Do not mention a public log. Use a short paragraph and finish every sentence.";
const MATH = "You are the parrot on a sports desk. The worth math is already done. Say it in a short paragraph. Keep every dollar amount and every percent the same. Do not say the long run is unknown. Do not say there are no settled bets. Do not add a sentence about what is missing. Do not use a win projection. Do not mention a public log.";

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
  if (/no settled bets|long run is not known|not known yet|can't say|cannot say|waiting for settled|waiting on settled|stay tuned|don't know the long run|do not know the long run/i.test(answer)) return false;
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

async function geminiCall(key, question, facts, think, search, locked, system) {
  const generationConfig = { maxOutputTokens: 640 };
  if (think) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  const body = {
    systemInstruction: { parts: [{ text: system || (locked ? MATH : SYSTEM) }] },
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

const TERMS = "You are the parrot on a sports desk. Someone heard a betting word or a price and wants it in plain language. Use the facts when they are there, and keep every dollar amount and every percent. Two or three sentences. Do not say the bet will win. Do not invent a dollar amount or a price. Do not add a gambling warning.";

function termFacts(question) {
  const text = String(question).replace(/[−–]/g, "-");
  const seen = [];
  const prices = [...text.matchAll(/(^|[^\d])([+-]\d{3,4})(?!\d)/g)].map((match) => Number(match[2])).filter((n) => Math.abs(n) >= 100 && Math.abs(n) < 10000 && (seen.includes(n) ? false : seen.push(n)));
  return prices.map((n) => {
    const chance = (n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100)) * 100;
    const five = Math.round((n < 0 ? 500 / Math.abs(n) : n / 20) * 100) / 100;
    const shown = Math.abs(five - Math.round(five)) < 0.005 ? String(Math.round(five)) : five.toFixed(2);
    const lay = n < 0 ? `You risk $${Math.abs(n)} to win $100.` : `You risk $100 to win $${n}.`;
    return `${n > 0 ? "+" : ""}${n} is an American price. ${lay} A $5 bet wins $${shown}. The price says about ${chance.toFixed(1)}%.`;
  }).join(" ");
}

async function askTermModel(question, facts) {
  const prompt = `Facts:\n${facts}\n\nQuestion: ${question}`;
  if (onMac()) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ model: LOCAL_MODEL, stream: false, think: false, messages: [{ role: "system", content: TERMS }, { role: "user", content: prompt }], options: { temperature: 0.2, num_predict: 220 } }),
    });
    const payload = await response.json().catch(() => ({}));
    const text = clean(payload.message && payload.message.content);
    if (!response.ok || !text) throw new Error("Ollama did not answer. Start it on this Mac and ask again.");
    return text;
  }
  if (!geminiKey()) throw new Error("This server has no GEMINI_API_KEY. Add that name in Hostinger and restart the Node app.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: TERMS }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 320 } }),
  });
  const payload = await response.json().catch(() => ({}));
  const text = said(payload);
  if (!response.ok || !text) throw new Error(geminiFail(response.status, payload));
  return text;
}

function grounded(spoken, question, facts) {
  const allowed = `${question} ${facts}`.replace(/[−–]/g, "-");
  return String(spoken).split(/(?<=[.!?])\s+/).filter((line) => {
    const money = [...line.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((match) => match[1]);
    const prices = [...line.replace(/[−–]/g, "-").matchAll(/[+-]\d{3,4}/g)].map((match) => match[0]);
    return money.every((bit) => allowed.includes(bit)) && prices.every((bit) => allowed.includes(bit));
  }).join(" ").trim();
}

async function askTerm(question) {
  const q = clip(question, 240);
  if (q.length < 2) throw new Error("Type the term.");
  const facts = termFacts(q);
  try {
    const spoken = grounded(await askTermModel(q, facts || "No price was in the question. Explain the betting words. Do not invent a price."), q, facts);
    if (!spoken) return { answer: facts || "The bird could not think of that." };
    const cash = [...facts.matchAll(/wins \$([\d.]+)/g)].map((match) => match[1]);
    const pcts = [...facts.matchAll(/about ([\d.]+)%/g)].map((match) => String(Math.round(Number(match[1]))));
    if (cash.some((amount) => !spoken.includes(amount)) || pcts.some((n) => !spoken.includes(n))) return { answer: facts };
    return { answer: spoken };
  } catch (error) {
    if (facts) return { answer: facts };
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("That took too long. Ask again.");
    throw error;
  }
}

const TREND = "You explain why a player's recent numbers moved. Search for the opponent, the series, who the kick-outs go to, and whether a coach changed the scheme. Name a teammate only when the search shows the pass went to them, and say if their scoring went up only from the box score. Name a coach only when the search ties them to the scheme. Do not invent a quote. Do not say the bet will win. Do not mention age unless the search is about age.";

function plain(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;|&#x27;/gi, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function pageLine(url, last) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
  if (!response.ok) return "";
  const html = await response.text();
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => plain(match[1])).filter((line) => line.length > 80 && line.length < 420 && line.toLowerCase().includes(last));
  for (const para of paras) {
    const bits = para.split(/(?<=\.)\s+/).map((bit) => bit.trim()).filter((bit) => bit.length > 40 && !bit.endsWith("?"));
    const chosen = bits.filter((bit) => /held|shut|paint|defen|assist/i.test(bit)).slice(0, 2);
    if (!chosen.length) continue;
    return chosen.map((sentence) => {
      const cut = sentence.length > 220 ? sentence.slice(0, 220).replace(/\s+\S*$/, "") : sentence;
      return /[.!?]$/.test(cut) ? cut : `${cut}.`;
    }).join(" ");
  }
  return "";
}

async function newsItems(query) {
  const response = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((match) => {
    const grab = (tag) => {
      const found = match[1].match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return found ? plain(found[1]) : "";
    };
    const link = (match[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    return { title: grab("title"), description: grab("description"), url: decodeURIComponent((link.match(/url=([^&]+)/) || [])[1] || "") };
  }).filter((item) => item.title);
}

function passTargets(name) {
  return newsItems(`${clip(name, 80)} pass`).then((items) => {
    const blob = items.map((item) => `${item.title}. ${item.description}`).join(" ");
    const found = [];
    for (const match of blob.matchAll(/pass(?:ed)? to (?:a |the )?([A-Z][a-z]+ [A-Z][a-z]+)/g)) {
      const who = match[1];
      if (who.toLowerCase() === String(name).toLowerCase() || /state|game|finals|arena/i.test(who)) continue;
      if (!found.includes(who)) found.push(who);
    }
    return { who: found.slice(0, 2), look: /no-look pass to/i.test(blob) };
  });
}

function schemeFrom(text) {
  const flat = plain(text);
  const coach = (flat.match(/\bcoach ([A-Z][a-z]+ [A-Z][a-z]+)/) || [])[1] || "";
  const pronoun = /make him a passer/i.test(flat) ? "him" : (/make her a passer/i.test(flat) ? "her" : "");
  const turn = (flat.match(/turned over ([a-z0-9]+) times/i) || [])[1] || "";
  if (!pronoun || !/two bodies/i.test(flat)) return "";
  const lead = coach ? `Coach ${coach} had them throw two bodies at ${pronoun} and make ${pronoun} a passer.` : `They threw two bodies at ${pronoun} to make ${pronoun} a passer.`;
  return turn ? `${lead} ${pronoun === "him" ? "He" : "She"} turned it over ${turn} times.` : lead;
}

async function schemeNote(name) {
  const items = await newsItems(`${clip(name, 80)} defensive plan`);
  const urls = items.map((item) => item.url).filter((url) => /^https:/.test(url) && !/bing\.com|msn\.com/i.test(url)).slice(0, 2);
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
      if (!response.ok) continue;
      const line = schemeFrom(await response.text());
      if (line) return line;
    } catch (err) { /* the next story */ }
  }
  return "";
}

function mateLine(sport, name, mates) {
  const { execFileSync } = require("child_process");
  const raw = execFileSync("python3", ["-m", "nfl_bets.why"], {
    input: JSON.stringify({ name, sport, mates }),
    encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024, cwd: __dirname,
  });
  return String(JSON.parse(raw).why || "");
}

async function seriesLine(name) {
  const last = String(name || "").trim().split(/\s+/).pop().toLowerCase();
  if (!last) return "";
  const response = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(`${name} defense`)}&format=rss`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return "";
  const xml = await response.text();
  const urls = [...xml.matchAll(/<link>([\s\S]*?)<\/link>/g)].map((match) => decodeURIComponent((match[1].match(/url=([^&]+)/) || [])[1] || "")).filter((url) => /^https:/.test(url) && !/bing\.com|msn\.com/i.test(url)).slice(0, 4);
  for (const url of urls.slice(0, 2)) {
    try {
      const line = await pageLine(url, last);
      if (line) return line;
    } catch (err) { /* the next story, or the box score */ }
  }
  return "";
}

async function askTrend(name, text, facts, sport) {
  const question = `Why the recent trend for ${clip(name, 80)}? ${clip(text, 180)}`;
  const background = clip(facts, 1200);
  const key = geminiKey();
  if (key) {
    try {
      const result = await geminiCall(key, question, background, false, true, false, TREND);
      if (result.status >= 200 && result.status < 300 && result.text) return result.text;
    } catch (err) { /* the box score still answers */ }
  }
  const bits = [];
  try {
    const defense = await seriesLine(name);
    if (defense) bits.push(defense);
  } catch (err) { /* the pass and the coach can still answer */ }
  try {
    const pass = await passTargets(name);
    if (pass.who.length) {
      let scores = "";
      try { scores = mateLine(String(sport || ""), name, pass.who); } catch (err) { scores = ""; }
      const kind = pass.look ? "no-look pass" : "pass";
      bits.push(`The ${kind} went to ${pass.who.join(" and ")}. ${scores}`.trim());
    }
  } catch (err) { /* the coach line can still answer */ }
  try {
    const scheme = await schemeNote(name);
    if (scheme) bits.push(scheme);
  } catch (err) { /* the box score still answers */ }
  return bits.length ? `${bits.join(" ")} ${background}`.trim() : "";
}

module.exports = { askBet, askTerm, askTrend };
