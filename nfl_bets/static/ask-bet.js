let digHold = false;

function paintDig() {
  document.querySelectorAll("section.chalk > .pick-save [data-pull]").forEach((button) => button.parentElement.append(button));
  document.querySelectorAll("section.chalk > .pick-save").forEach((bar) => {
    if (bar.querySelector(".dig")) return;
    const card = bar.closest(".chalk");
    if (!card || !card.querySelector("ol li")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost dig";
    button.dataset.dig = "1";
    button.setAttribute("aria-label", "Dig deeper into this bet");
    button.title = "Dig Deeper";
    button.textContent = "Dig Deeper";
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBet(card);
    });
    const anchor = bar.querySelector(".leg-edit") || bar.querySelector("[data-save], [data-unsave], #choice-save");
    if (anchor) anchor.after(button);
    else bar.prepend(button);
  });
}

function openBet(card) {
  const desk = document.getElementById("desk");
  const full = document.getElementById("desk-full");
  window.digCard = card;
  if (desk && full && !desk.classList.contains("tv-full")) {
    digHold = true;
    full.click();
    digHold = false;
  }
  if (desk) desk.classList.add("dug");
  askBet();
}

function askBet(kind) {
  window.asking = true;
  window.digOn = true;
  const general = kind === "general";
  birdSay(general
    ? "Howdy howdy, I'm Parlay the Parrot, and I know everything about betting ... ask me anything and see if you're smarter than a bird."
    : "What do you want to know about this bet?", []);
  const row = document.getElementById("bird-picks");
  if (!row) return;
  const placeholder = general ? "Ask me anything" : "Ask about this bet";
  row.innerHTML = `<input id="bet-ask" maxlength="160" placeholder="${placeholder}" autocomplete="off"><button type="button" id="bet-ask-go">Ask</button>`;
  const box = document.getElementById("bet-ask");
  const go = () => replyBet();
  box.addEventListener("keydown", (event) => { if (event.key === "Enter") go(); });
  document.getElementById("bet-ask-go").addEventListener("click", go);
  if (general) box.addEventListener("click", () => focusAsk(box));
  box.focus();
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

function cardPack() {
  const card = window.digCard;
  if (!card) return null;
  const legs = [...card.querySelectorAll(":scope > ol > li")].map(legBits);
  const copy = [...card.querySelectorAll(":scope > p")].map((node) => node.textContent.trim()).filter((line) => line && !/^pulled /i.test(line));
  return {
    title: (card.querySelector("h2") || {}).textContent || "",
    aim: (card.querySelector(".aim") || {}).textContent || "",
    copy,
    legs: legs.map(({ price, name, more, pct, quiet }) => ({ price, name, more, pct, quiet })),
  };
}

function askAgain() {
  const row = document.getElementById("bird-picks");
  if (!row) return;
  row.insertAdjacentHTML("beforeend", `<input id="bet-ask" maxlength="160" placeholder="Ask another question" autocomplete="off"><button type="button" id="bet-ask-go">Ask</button>`);
  const again = document.getElementById("bet-ask");
  again.addEventListener("keydown", (event) => { if (event.key === "Enter") replyBet(); });
  document.getElementById("bet-ask-go").addEventListener("click", replyBet);
  again.focus();
}

async function replyBet() {
  if (askingBet) return;
  const box = document.getElementById("bet-ask");
  const question = String((box && box.value) || "").trim();
  const card = cardPack();
  if (!question || !card) return;
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
  birdSay(answer, []);
  const line = document.getElementById("bird-line");
  if (line) line.classList.add("answer");
  showMentioned(answer);
  askAgain();
}

const SKIP_NAME = /^(over|under|points|yards|shots|goals|saves|hits|assists|rebounds|strikeouts|total|moneyline|spread)$/i;

function nameWords(card) {
  return [...card.querySelectorAll(":scope > ol > li")].flatMap((li) => (
    legBits(li).name.split(/[^A-Za-z]+/).filter((word) => word.length > 4 && !SKIP_NAME.test(word)).map((word) => word.toLowerCase())
  ));
}

function mentionedCards(answer) {
  const text = String(answer || "").toLowerCase();
  const cards = [...document.querySelectorAll("section.chalk")].filter((card) => card.id !== "chooser" && card.querySelector("ol li"));
  const hits = cards.filter((card) => nameWords(card).some((word) => text.includes(word)));
  const current = window.digCard;
  if (current && current.querySelector("ol li") && !hits.includes(current)) hits.unshift(current);
  return hits.slice(0, 4);
}

function showMentioned(answer) {
  const row = document.getElementById("bird-picks");
  if (!row) return;
  mentionedCards(answer).forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.showBet = card.id || "bet";
    const title = ((card.querySelector("h2") || {}).textContent || "this bet").trim();
    button.textContent = `Show ${title}`;
    button.addEventListener("click", () => revealBet(card));
    row.append(button);
  });
}

function revealBet(card) {
  window.asking = false;
  window.digOn = false;
  const desk = document.getElementById("desk");
  if (desk) desk.classList.remove("bird-on", "dug");
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const head = document.getElementById("desk-head");
  if (head) head.classList.remove("bird-talk");
  const line = document.getElementById("bird-line");
  if (line) line.classList.remove("answer");
  const week = card.closest("#pane-week");
  const build = card.id === "chooser" || card.closest("#pane-build");
  if (typeof showTab === "function") showTab(week ? "week" : build ? "build" : "today");
  const glass = document.getElementById("desk-glass-in");
  if (glass && !glass.contains(card)) glass.append(card);
  card.hidden = false;
  card.scrollIntoView({ block: "start" });
}

function legBits(li) {
  const price = (li.querySelector("b") || {}).textContent || "";
  const quiet = (li.querySelector(".quiet") || {}).textContent || "";
  const pct = (li.querySelector("em") || {}).textContent || "";
  const more = (li.querySelector(".leg-more") || {}).textContent || "";
  const name = [...((li.querySelector("span") || {}).childNodes || [])].filter((node) => node.nodeType === 3).map((node) => node.textContent).join(" ").trim();
  return { price, name, more: more.trim(), pct, quiet: quiet.trim(), text: `${name} ${more} ${quiet}`.toLowerCase() };
}

document.getElementById("desk-full").addEventListener("click", () => {
  if (digHold) return;
  const desk = document.getElementById("desk");
  if (!desk || desk.classList.contains("tv-full")) return;
  desk.classList.remove("dug", "bird-on");
  const guide = document.getElementById("bird-guide");
  const head = document.getElementById("desk-head");
  if (guide) guide.hidden = true;
  if (head) head.classList.remove("bird-talk");
  window.digOn = false;
  window.asking = false;
});
window.paintDig = paintDig;

const sayBird = window.birdSay;
if (sayBird) {
  window.birdSay = (text, picks) => {
    const line = document.getElementById("bird-line");
    if (line) line.classList.remove("answer");
    sayBird(text, picks);
  };
}

document.getElementById("desk-ask").addEventListener("click", () => {
  const glass = document.getElementById("desk-glass");
  const card = (glass && glass.querySelector("section.chalk")) || document.getElementById("best");
  if (!card || !card.querySelector("ol li")) return;
  window.digCard = card;
  askBet("general");
});
