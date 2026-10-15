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
    if (!card || !card.querySelector("ol li")) return;
    const more = barButton("bet-more", "Show More Info");
    more.setAttribute("aria-label", "Show more info about this bet");
    more.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const desk = document.getElementById("desk");
      if (desk && desk.classList.contains("dug")) hideInfo();
      else showInfo(card);
    });
    const ask = barButton("bet-ask-open", "Ask Parlay the Parrot");
    ask.setAttribute("aria-label", "Ask Parlay the Parrot about this bet");
    ask.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBet(card);
    });
    const anchor = bar.querySelector(".leg-edit") || bar.querySelector("[data-save], [data-unsave], #choice-save");
    if (anchor) anchor.after(more, ask);
    else bar.prepend(more, ask);
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
  window.askGeneral = general;
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
  if (general) {
    paintIdeas(row);
    box.addEventListener("click", () => focusAsk(box));
  }
  box.focus();
}

const ASK_IDEAS = [
  ["Best bet of the day", "What's the best bet of the day?"],
  ["This week", "What's the good 3 leg and the good 5 leg this week?"],
  ["Most winning strategies", "What are the most winning strategies?"],
  ["Bets from those strategies", "What are the bets from the most winning strategies?"],
  ["Super safe", "What's the super safe bet?"],
  ["Today's best bet", "What's today's best bet?"],
  ["Good 3-leg", "What's a good 3 leg?"],
  ["Good 5-leg", "What's a good 5 leg?"],
  ["How you pick", "How do you pick a bet?"],
];

function paintIdeas(row) {
  const wrap = document.createElement("div");
  wrap.className = "ask-ideas";
  ASK_IDEAS.forEach(([label, question], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ask-idea";
    button.textContent = label;
    if (index >= 5) button.hidden = true;
    button.addEventListener("click", () => {
      const field = document.getElementById("bet-ask");
      if (field) field.value = question;
      replyBet();
    });
    wrap.append(button);
  });
  const more = document.createElement("button");
  more.type = "button";
  more.className = "ask-rest";
  more.textContent = "Show more";
  more.addEventListener("click", () => {
    wrap.querySelectorAll(".ask-idea[hidden]").forEach((button) => { button.hidden = false; });
    more.hidden = true;
  });
  wrap.append(more);
  row.prepend(wrap);
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

function cardPack() {
  const card = window.digCard;
  if (!window.askGeneral && card && card.isConnected && card.querySelector("ol li")) return packOne(card);
  const cards = ["best", "today", "week", "week5", "safe"].map((id) => document.getElementById(id)).filter((item) => item && item.querySelector("ol li"));
  if (!cards.length) return null;
  return {
    title: "Recommended bets",
    aim: "Best bet of the day, Today's Best Bet, Good 3-leg, Good 5-leg, and Super safe.",
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
  if (!question) return;
  const card = cardPack();
  if (!card) { birdSay("I don't have a bet in front of me yet.", []); return; }
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
  if (title.includes("3 leg")) keys.push("3 leg", "three leg");
  if (title.includes("5 leg")) keys.push("5 leg", "five leg");
  if (title.includes("super safe")) keys.push("super safe");
  if (title.includes("best bet of the day")) keys.push("best bet");
  if (title.includes("today")) keys.push("today's best", "todays best");
  return keys;
}

function pickedCards(question, answer) {
  const text = foldText(`${question}\n${answer}`);
  const said = foldText(answer);
  const cards = [...document.querySelectorAll("section.chalk")].filter((card) => card.id !== "chooser" && card.querySelector("ol li"));
  return cards.filter((card) => {
    if (!window.askGeneral && card === window.digCard) return false;
    if (askCardKeys(card).some((key) => text.includes(foldText(key)))) return true;
    return nameWords(card).some((word) => said.includes(word));
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

function paintRaw(answer) {
  const row = document.getElementById("bird-picks");
  if (!row || !answer) return;
  const raw = document.createElement("p");
  raw.className = "ask-raw";
  raw.hidden = true;
  raw.textContent = answer;
  const more = document.createElement("button");
  more.type = "button";
  more.className = "ask-more";
  more.textContent = "View more";
  more.addEventListener("click", () => {
    raw.hidden = !raw.hidden;
    more.textContent = raw.hidden ? "View more" : "Hide";
  });
  row.append(more, raw);
}

function showAnswer(question, answer) {
  const cards = pickedCards(question, answer);
  const text = String(answer || "").trim();
  if (cards.length) {
    const title = ((cards[0].querySelector("h2") || {}).textContent || "the bet").trim();
    birdSay(cards.length > 1 ? "Here are the bets." : `Here is the ${title}.`, []);
    const row = document.getElementById("bird-picks");
    if (row) cards.forEach((card) => row.append(betPreview(card)));
    paintRaw(text);
  } else {
    const bits = text.split(/(?<=[.!?])\s/).filter(Boolean);
    birdSay(bits[0] || text, []);
    if (bits.length > 1) paintRaw(text);
  }
  askAgain();
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
  desk.classList.remove("dug", "bird-on");
  syncMore();
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

document.getElementById("desk-back").addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) return;
  if (!window.askGeneral && desk.classList.contains("has-back")) return;
  event.stopImmediatePropagation();
  window.askGeneral = false;
  window.asking = false;
  window.digOn = false;
  const full = document.getElementById("desk-full");
  if (full) full.click();
  if (window.birdGreet) birdGreet();
}, true);

document.getElementById("desk-ask").addEventListener("click", () => {
  const glass = document.getElementById("desk-glass");
  const card = (glass && glass.querySelector("section.chalk")) || document.getElementById("best");
  if (card && card.querySelector("ol li")) window.digCard = card;
  askBet("general");
  const box = document.getElementById("bet-ask");
  if (box) focusAsk(box);
});
