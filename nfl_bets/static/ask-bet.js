let digHold = false;

function barButton(className, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ghost dig ${className}`;
  button.title = label;
  button.textContent = label;
  return button;
}

function paintDig() {
  document.querySelectorAll("section.chalk > .pick-save [data-pull]").forEach((button) => button.parentElement.append(button));
  document.querySelectorAll("section.chalk > .pick-save").forEach((bar) => {
    if (bar.querySelector(".bet-more")) return;
    const card = bar.closest(".chalk");
    if (!card || card.id === "rec-open" || !card.querySelector("ol li") || (!card.querySelector(".aim") && !card.querySelector("li .quiet"))) return;
    const more = barButton("bet-more", "Show More Info");
    more.setAttribute("aria-label", "Show more info about this bet");
    more.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const desk = document.getElementById("desk");
      if (desk && desk.classList.contains("dug")) hideInfo();
      else showInfo(card);
    });
    const anchor = bar.querySelector(".leg-edit") || bar.querySelector("[data-save], [data-unsave], #choice-save");
    if (anchor) anchor.after(more);
    else bar.prepend(more);
  });
  syncMore();
}

function syncMore() {
  const desk = document.getElementById("desk");
  const open = !!(desk && desk.classList.contains("dug"));
  const label = open ? "Show Less" : "Show More Info";
  document.querySelectorAll(".bet-more").forEach((button) => {
    button.textContent = label;
    button.title = label;
    button.setAttribute("aria-label", open ? "Show less info about this bet" : "Show more info about this bet");
  });
}

function hideInfo() {
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("dug");
  syncMore();
}
new MutationObserver(syncMore).observe(document.getElementById("desk"), { attributes: true, attributeFilter: ["class"] });

function showInfo(card) {
  const desk = document.getElementById("desk");
  const full = document.getElementById("desk-full");
  window.digCard = card;
  if (desk && full && !desk.classList.contains("tv-full")) {
    digHold = true;
    full.click();
    digHold = false;
  }
  window.asking = false;
  window.digOn = false;
  window.askGeneral = false;
  if (desk) {
    desk.classList.add("dug");
    desk.classList.remove("bird-on");
  }
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const head = document.getElementById("desk-head");
  if (head) head.classList.remove("bird-talk");
  const line = document.getElementById("bird-line");
  if (line) line.classList.remove("answer");
  syncMore();
}

let askTrail = [];

function askBet(kind, kept) {
  if (kind === "general" && !kept) askTrail = [];
  window.asking = true;
  window.digOn = true;
  const general = kind === "general";
  window.askGeneral = general;
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("dug", "solo");
  if (general) window.digCard = null;
  const title = !general && window.digCard ? ((window.digCard.querySelector("h2") || {}).textContent || "").trim() : "";
  birdSay(general
    ? "Howdy howdy, I'm Parlay the Parrot, and I know everything about betting ... ask me anything and see if you're smarter than a bird."
    : `What do you want to know about ${title || "this bet"}?`, []);
  const row = document.getElementById("bird-picks");
  if (!row) return;
  const placeholder = general ? "Ask me anything" : "Ask about this bet";
  row.innerHTML = `<textarea id="bet-ask" rows="1" maxlength="160" placeholder="${placeholder}" autocomplete="off"></textarea><button type="button" id="bet-mic" aria-label="Speak your question">Speak</button><button type="button" id="bet-ask-go">Ask</button>`;
  const box = document.getElementById("bet-ask"); if (window.hearAsk) hearAsk(box);
  const go = () => replyBet();
  box.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); go(); } });
  box.addEventListener("input", () => growAsk(box));
  growAsk(box);
  document.getElementById("bet-ask-go").addEventListener("click", go);
  if (general) paintIdeas(row);
  else if (window.digCard && window.digCard.querySelector("ol li")) row.prepend(betPreview(window.digCard));
  focusAsk(box);
}

function growAsk(box) {
  box.style.height = "auto";
  if (box.scrollHeight > box.clientHeight + 1) box.style.height = `${box.scrollHeight}px`;
}

function paintIdeas() {
  const guide = document.getElementById("bird-guide");
  if (!guide) return;
  guide.querySelectorAll(":scope > .ask-ideas").forEach((node) => node.remove());
  const row = document.createElement("div");
  row.className = "ask-ideas";
  row.innerHTML = `<button type="button" data-quiz>Build a bet</button><button type="button">Recommended bets</button>`;
  row.lastElementChild.addEventListener("click", () => { if (window.birdMenu) birdMenu("bets"); });
  guide.prepend(row);
}

function focusAsk(box) {
  openAskScreen();
  box.focus();
  requestAnimationFrame(() => box.focus());
}

function modelTalk(name) {
  const raw = String(name || "").trim();
  const known = { "gemini-3.8-flash": "Gemini 3.8 Flash", "llama3.2": "Llama 3.2" };
  return known[raw] || raw;
}

function openAskScreen() {
  const desk = document.getElementById("desk");
  const full = document.getElementById("desk-full");
  if (!desk || !full || desk.classList.contains("tv-full")) return;
  digHold = true;
  full.click();
  digHold = false;
}

let askingBet = false;

function packOne(card) {
  const legs = [...card.querySelectorAll(":scope > ol > li")].map(legBits);
  const copy = [...card.querySelectorAll(":scope > p")].map((node) => node.textContent.trim()).filter((line) => line && !/^pulled /i.test(line));
  return {
    title: (card.querySelector("h2") || {}).textContent || "",
    aim: (card.querySelector(".aim") || {}).textContent || "",
    copy,
    legs: legs.map(({ price, name, more, pct, quiet }) => ({ price, name, more, pct, quiet })),
  };
}

function gone(id) { const map = { week: "weekThree", week5: "weekFive", safe: "weekSafe", even: "weekEven", best: "band", today: "todayBet", chalk: "chalk", four: "four", plus: "plus", hits: "hits" }; const data = window.state && window.state.board && window.state.board[map[id] || ""]; const rows = data ? [...(data.legs || []), ...((data.groups || []).flatMap((group) => group.legs || []))] : []; return rows.some((leg) => Number.isFinite(Date.parse(leg.kickoff || "")) && Date.parse(leg.kickoff) <= Date.now()) || !!(data && Number.isFinite(Date.parse(data.kickoff || "")) && Date.parse(data.kickoff) <= Date.now()); }

function cardPack(question) {
  const named = namedCard(question);
  if (named && gone(named.id)) return { closed: true };
  if (named && named.querySelector("ol li")) return packOne(named);
  const card = window.digCard;
  if (!window.askGeneral && card && card.isConnected && card.querySelector("ol li")) return packOne(card);
  const cards = ["best", "today", "week", "week5", "safe"].map((id) => document.getElementById(id)).filter((item) => item && item.querySelector("ol li"));
  if (!cards.length) return null;
  return {
    title: "Recommended bets",
    aim: "−150 to +100 window, highest chance parlay today, 3 legs near −200, 5 legs near −200, 3 legs near −350, and 3 legs near −100.",
    copy: cards.map((item) => {
      const packed = packOne(item);
      const names = packed.legs.map((leg) => [leg.price, leg.name].filter(Boolean).join(" ")).join("; ");
      return [packed.title, packed.aim, names].filter(Boolean).join(". ");
    }),
    legs: [],
  };
}

function askAgain() {
  const row = document.getElementById("bird-picks");
  if (!row) return;
  row.insertAdjacentHTML("beforeend", `<textarea id="bet-ask" rows="1" maxlength="160" placeholder="Ask another question" autocomplete="off"></textarea><button type="button" id="bet-mic" aria-label="Speak your question">Speak</button><button type="button" id="bet-ask-go">Ask</button>`);
  const again = document.getElementById("bet-ask"); if (window.hearAsk) hearAsk(again);
  again.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); replyBet(); } });
  again.addEventListener("input", () => growAsk(again));
  growAsk(again);
  document.getElementById("bet-ask-go").addEventListener("click", replyBet);
  again.focus();
}

async function replyBet() {
  if (askingBet) return;
  const box = document.getElementById("bet-ask");
  const question = String((box && box.value) || "").trim();
  if (!question) return;
  askTrail.push({ kind: "ask", general: !!window.askGeneral, question, card: (!window.askGeneral && window.digCard && window.digCard.id) || "" });
  if (askTrail.length > 8) askTrail.shift();
  const card = cardPack(question);
  if (!card || card.closed) { birdSay(card && card.closed ? `You asked: ${question}. A leg already finished, so that parlay can't be started.` : "I don't have a bet in front of me yet.", []); if (card && card.closed) askAgain(); return; }
  askingBet = true;
  window.asking = true;
  const said = /[.?!]$/.test(question) ? question : `${question}.`;
  birdSay(`You asked: ${said} Let me look at that.`, []);
  const model = modelTalk(window.askModel);
  const row = document.getElementById("bird-picks");
  if (row && model) {
    const note = document.createElement("p");
    note.className = "ask-model";
    note.textContent = `This was powered by the ${model} AI model.`;
    row.append(note);
  }
  let answer = "The bird could not think of that.";
  try {
    const response = await fetch("/api/bet-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, card }),
    });
    const payload = await response.json();
    if (response.ok && payload.answer) answer = payload.answer;
    else if (payload.error) answer = payload.error;
  } catch (error) {
    answer = "The bird could not think of that.";
  }
  askingBet = false;
  if (!window.digOn) return;
  showAnswer(question, answer);
}

const SKIP_NAME = /^(over|under|points|yards|shots|goals|saves|hits|assists|rebounds|strikeouts|total|moneyline|spread)$/i;

function foldText(text) {
  return String(text || "").toLowerCase().replace(/-/g, " ");
}

function nameWords(card) {
  return [...card.querySelectorAll(":scope > ol > li")].flatMap((li) => (
    legBits(li).name.split(/[^A-Za-z]+/).filter((word) => word.length > 4 && !SKIP_NAME.test(word)).map((word) => word.toLowerCase())
  ));
}

function askCardKeys(card) {
  const title = foldText((card.querySelector("h2") || {}).textContent || "");
  const keys = title ? [title] : [];
  const extra = { best: ["best bet", "150"], today: ["today's best", "todays best"], week: ["3 leg", "three leg"], week5: ["5 leg", "five leg"], safe: ["super safe", "350"] };
  return keys.concat(extra[card.id] || []);
}

function namedCard(question) {
  const asked = foldText(question);
  const hits = [["3 legs, different days, near −100", "even"], ["3 legs, different days, near −350", "safe"], ["5 legs, different days, near −200", "week5"], ["3 legs, different days, near −200", "week"], ["five near 90", "hits"], ["four near 80", "hits"], ["85", "four"], ["250", "plus"], ["180", "chalk"], ["150", "best"], ["highest chance", "today"]].filter(([key]) => asked.includes(foldText(key)));
  return hits.length === 1 ? document.getElementById(hits[0][1]) : null;
}

function pickedCards(question, answer) {
  const named = namedCard(question);
  if (named && named.querySelector("ol li") && !gone(named.id)) return [named];
  const asked = foldText(question);
  const said = foldText(answer);
  const lesson = /\b(you need to|when picking|to pick a bet|look at the recommended|decide which|such as)\b/.test(said) && !/\b(3|three|5|five) leg is\b|\bis a parlay of\b/.test(said);
  const hit = (key) => asked.includes(key) || (!lesson && said.includes(key));
  const cards = [...document.querySelectorAll("section.chalk")].filter((card) => card.id !== "chooser" && !card.hidden && card.querySelector("ol li"));
  return cards.filter((card) => {
    if (!window.askGeneral && card === window.digCard) return false;
    return askCardKeys(card).some((key) => hit(foldText(key))) || nameWords(card).some((word) => hit(word));
  }).slice(0, 3);
}

function betPreview(card) {
  const view = card.cloneNode(true);
  view.hidden = false;
  view.classList.add("ask-bet-card");
  view.removeAttribute("id");
  view.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  view.querySelectorAll(".pick-save, .leg-edit, .leg-swap, .leg-check").forEach((node) => node.remove());
  return view;
}

function paintRaw(answer, open) {
  const row = document.getElementById("bird-picks");
  if (!row || !answer) return;
  const raw = document.createElement("p");
  raw.className = "ask-raw";
  raw.hidden = !open;
  raw.textContent = answer;
  const more = document.createElement("button");
  more.type = "button";
  more.className = "ask-more";
  more.textContent = open ? "Hide" : "Parlay the Parrot's Squawkings";
  more.addEventListener("click", () => {
    raw.hidden = !raw.hidden;
    more.textContent = raw.hidden ? "Parlay the Parrot's Squawkings" : "Hide";
  });
  row.append(more, raw);
}

function betChoice(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ask-choice";
  const title = ((card.querySelector("h2") || {}).textContent || "This bet").trim();
  const copy = [...card.querySelectorAll(":scope > p")].map((node) => node.textContent.trim()).join(" ");
  const found = copy.match(/about ([\d.]+%)/) || copy.match(/parlay is ([\d.]+%)/);
  const pct = found ? found[1] : "";
  const money = (copy.match(/A \$5 bet would (?:win \$[\d.]+|become \$[\d.]+ with a profit of \$[\d.]+)/) || [])[0] || "";
  const name = document.createElement("b");
  name.textContent = title;
  button.append(name);
  const note = [pct, money].filter(Boolean).join(". ");
  if (note) {
    const line = document.createElement("span");
    line.textContent = note.endsWith(".") ? note : `${note}.`;
    button.append(line);
  }
  if (card.id) button.dataset.card = card.id;
  button.addEventListener("click", () => {
    const raw = document.querySelector("#bird-picks .ask-raw");
    askTrail.push({ kind: "choices", general: !!window.askGeneral, text: (document.getElementById("bird-line") || {}).textContent || "", ids: [...document.querySelectorAll(".ask-choice")].map((node) => node.dataset.card).filter(Boolean), raw: raw ? raw.textContent : "" });
    card.hidden = false;
    const glass = document.getElementById("desk-glass-in");
    if (glass && !glass.contains(card)) glass.append(card);
    showInfo(card);
    const desk = document.getElementById("desk");
    if (desk) { desk.classList.add("solo"); desk.classList.remove("dug"); }
    document.querySelectorAll(".solo-on").forEach((node) => node.classList.remove("solo-on"));
    card.classList.add("solo-on");
    syncMore();
    if (glass) glass.scrollTop = 0;
    card.scrollIntoView({ block: "start" });
  });
  return button;
}

function showAnswer(question, answer) {
  const cards = pickedCards(question, answer);
  if (window.legStarted && window.state && window.state.board) { const map = { best: "band", today: "todayBet", week: "weekThree", week5: "weekFive", safe: "weekSafe", even: "weekEven", chalk: "chalk", four: "four", plus: "plus", hits: "hits" }; Object.keys(map).forEach((id) => { const card = document.getElementById(id); const data = window.state.board[map[id]]; if (card && data && window.legStarted(data)) card.hidden = true; }); }
  const text = String(answer || "").trim();
  birdSay(`You asked: ${question}`, []);
  const line = document.getElementById("bird-line");
  if (line) { line.classList.add("answer"); const q = document.createElement("strong"); q.textContent = line.textContent; line.replaceChildren(q); if (!cards.length && text) line.append(document.createTextNode(`\n${text}`)); }
  const row = document.getElementById("bird-picks");
  if (row && cards.length) { cards.forEach((card) => row.append(betChoice(card))); paintRaw(text, true); }
  askAgain();
}

function restoreAsk(shot) {
  const desk = document.getElementById("desk");
  if (desk) { desk.classList.add("bird-on"); desk.classList.remove("solo", "dug"); document.querySelectorAll(".solo-on").forEach((node) => node.classList.remove("solo-on")); }
  if (shot.kind === "choices") {
    window.asking = true;
    window.digOn = true;
    window.askGeneral = !!shot.general;
    if (desk) desk.classList.remove("dug");
    birdSay(shot.text || "Which of these do you want?", []);
    const backLine = document.getElementById("bird-line"); if (backLine && /^You asked:/.test(shot.text || "")) { backLine.classList.add("answer"); const q = document.createElement("strong"); q.textContent = backLine.textContent; backLine.replaceChildren(q); }
    const row = document.getElementById("bird-picks");
    if (!row) return;
    shot.ids.forEach((id) => { const card = document.getElementById(id); if (!card) return; row.append(betChoice(card)); card.classList.remove("solo-on"); const map = { week: "weekThree", week5: "weekFive", safe: "weekSafe", even: "weekEven", best: "band", today: "todayBet", chalk: "chalk", four: "four", plus: "plus", hits: "hits" }; const data = window.state && window.state.board && window.state.board[map[id]]; if (data && window.legStarted && window.legStarted(data)) card.hidden = true; });
    if (shot.raw) paintRaw(shot.raw, true);
    askAgain();
    return;
  }
  if (shot.card) window.digCard = document.getElementById(shot.card);
  askBet(shot.general ? "general" : undefined, true);
  const box = document.getElementById("bet-ask");
  if (box) box.value = shot.question || "";
}

function legBits(li) {
  const price = (li.querySelector("b") || {}).textContent || "";
  const quiet = (li.querySelector(".quiet") || {}).textContent || "";
  const pct = (li.querySelector("em") || {}).textContent || "";
  const more = (li.querySelector(".leg-more") || {}).textContent || "";
  const name = [...((li.querySelector("span") || {}).childNodes || [])].filter((node) => node.nodeType === 3).map((node) => node.textContent).join(" ").trim();
  return { price, name, more: more.trim(), pct, quiet: quiet.trim(), text: `${name} ${more} ${quiet}`.toLowerCase() };
}

const FULL_GAP = 8 * 60 * 60 * 1000;
let fullNagged = false;

function fullStamp() {
  let local = "";
  try { local = localStorage.getItem("parlay-full-at") || ""; } catch (error) {}
  const saved = Date.parse(window.fullAt || "");
  const here = Date.parse(local);
  return Math.max(Number.isFinite(saved) ? saved : 0, Number.isFinite(here) ? here : 0);
}

function markFull() {
  const at = new Date().toISOString();
  window.fullAt = at;
  try { localStorage.setItem("parlay-full-at", at); } catch (error) {}
  if (window.noteTaste) noteTaste("full");
}

function remindFull() {
  if (fullNagged) return;
  const desk = document.getElementById("desk");
  if (!window.memberReady || document.body.classList.contains("needs-member") || !desk) {
    setTimeout(remindFull, 4000);
    return;
  }
  if (desk.classList.contains("tv-full") || window.asking || desk.classList.contains("bird-on")) {
    setTimeout(remindFull, 15000);
    return;
  }
  if (fullStamp() && Date.now() - fullStamp() < FULL_GAP) return;
  fullNagged = true;
  if (!window.birdSay) return;
  birdSay("Hey, full screen mode can make the site much easier to view. The button is in the corner.", []);
  const row = document.getElementById("bird-picks");
  if (!row) return;
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Open full screen";
  open.addEventListener("click", () => {
    const full = document.getElementById("desk-full");
    if (!full || desk.classList.contains("tv-full")) return;
    window.asking = false;
    full.click();
    desk.classList.remove("bird-on", "dug");
    const guide = document.getElementById("bird-guide");
    if (guide) guide.hidden = true;
  });
  row.append(open);
}

setTimeout(remindFull, 20000);

document.getElementById("desk-full").addEventListener("click", () => {
  const desk = document.getElementById("desk");
  if (desk && desk.classList.contains("tv-full")) markFull();
  if (digHold) return;
  if (!desk || desk.classList.contains("tv-full")) return;
  desk.classList.remove("dug", "solo");
  window.digOn = false;
  window.asking = false;
  if (window.birdGreet) birdGreet();
  else birdSay("Hey. What are you trying to do today?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"], ["parrot", "Ask Parlay the Parrot"]]);
});
document.getElementById("desk-glass").addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!desk || desk.classList.contains("tv-full")) return;
  const button = event.target.closest("button");
  event.preventDefault(); event.stopPropagation(); document.getElementById("desk-full").click();
  if (button && desk.contains(button)) setTimeout(() => button.click(), 0);
}, true);
window.paintDig = paintDig;

const sayBird = window.birdSay;
if (sayBird) {
  window.birdSay = (text, picks) => {
    const line = document.getElementById("bird-line");
    if (line) line.classList.remove("answer", "build");
    sayBird(text, picks);
  };
}

window.askBack = () => { const line = document.getElementById("bird-line"); const desk = document.getElementById("desk"); const steps = window.askSteps; const past = window.askPast; const pick = window.choice; if (!desk || desk.classList.contains("solo") || !desk.classList.contains("bird-on") || !line || !line.classList.contains("build") || !steps || !past || !past.length || !pick) return false; const step = past.pop(); const order = ["when", "sport", "game", "kind", "legs"].concat(window.askFree ? ["aim"] : [], ["mix"]); steps.splice(0, steps.length, ...order.slice(Math.max(0, order.indexOf(step)))); if (step === "sport") pick.sports = []; else if (step === "kind") pick.kind = "any"; else if (step === "legs") pick.legs = 3; else if (step === "game") pick.gameIds = []; else if (step === "aim") pick.aim = ""; else if (step === "mix") pick.mix = "even"; else if (step === "when") pick.when = "today"; if (window.askStep) askStep(); return true; };

document.getElementById("desk-back").addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) return;
  event.stopImmediatePropagation();
  if (window.shareBack && shareBack()) return; if (window.recBack && recBack()) return;
  if (window.askBack && askBack()) return;
  const shot = askTrail.pop();
  if (shot) { restoreAsk(shot); return; }
  if (desk.classList.contains("bird-on") && /trying to do today/i.test((document.getElementById("bird-line") || {}).textContent || "") && window.tvBack) { tvBack(); return; }
  window.askGeneral = false;
  window.asking = false;
  window.digOn = false;
  desk.classList.remove("dug", "solo");
  if (window.birdGreet) birdGreet();
  else birdSay("Hey. What are you trying to do today?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"], ["parrot", "Ask Parlay the Parrot"]]);
}, true);

document.getElementById("desk-ask").addEventListener("click", () => askBet("general"));
function openBuilt(index) {
  const ticket = (window.builtPile || [])[Number(index)];
  if (!ticket || !window.openRec) return;
  const glass = document.getElementById("desk-glass-in");
  window.builtKeep = { scroll: glass ? glass.scrollTop : 0 };
  window.builtBack = true;
  openRec((window.recTickets = window.recTickets || []).push({ ticket, name: ticket.title || "This bet" }) - 1);
}
window.openBuilt = openBuilt;
document.getElementById("desk-name").addEventListener("click", () => {
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) return;
  window.recOpen = false;
  const card = document.getElementById("rec-open");
  if (card) { card.classList.remove("solo-on"); card.hidden = true; }
  const full = document.getElementById("desk-full");
  if (full) full.click();
  if (typeof showTab === "function") showTab("today");
  const home = document.getElementById("desk-home");
  if (home) home.click();
});
