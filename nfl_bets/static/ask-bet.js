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
  else birdSay("Hey. What are you trying to do today?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"]]);
});
document.getElementById("desk-glass").addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!desk || desk.classList.contains("tv-full")) return;
  if (event.target.closest("#bird-born, #bird-born-go")) return;
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

window.askBack = () => {
  const line = document.getElementById("bird-line");
  const desk = document.getElementById("desk");
  const steps = window.askSteps;
  const past = window.askPast;
  const pick = window.choice;
  const chooser = document.getElementById("chooser");
  const onQuiz = !!(desk && desk.classList.contains("bird-on") && line && line.classList.contains("build"));
  const onResult = !!(desk && !desk.classList.contains("bird-on") && !desk.classList.contains("solo") && window.state && window.state.tab === "build" && chooser && chooser.classList.contains("built"));
  if (!desk || desk.classList.contains("solo") || !line || !steps || !past || !past.length || !pick || (!onQuiz && !onResult)) return false;
  if (onResult) {
    chooser.classList.remove("built");
    const again = document.getElementById("choice-again");
    const box = document.getElementById("choice-result");
    if (again) again.hidden = true;
    if (box) box.textContent = "";
    window.asking = true;
  }
  if (onQuiz && steps[0] === "kind" && askButtons.group) { askButtons.group = ""; if (window.askStep) askStep(); return true; }
  const step = past.pop();
  const order = ["when", "sport", "game", "kind", "legs", "money", "risk", "mix"];
  steps.splice(0, steps.length, ...order.slice(Math.max(0, order.indexOf(step))));
  if (step === "kind") { pick.kind = "any"; askButtons.group = ""; } else if (step === "legs") pick.legs = 3; else if (step === "game") pick.gameIds = []; else if (step === "aim") pick.aim = ""; else if (step === "money") { if (pick.aim === "pay") pick.aim = ""; } else if (step === "mix") pick.mix = "even"; else if (step === "when") pick.when = "today";
  if (window.askStep) askStep();
  return true;
};

document.getElementById("desk-back").addEventListener("click", (event) => {
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) return;
  event.stopImmediatePropagation();
  if (window.shareBack && shareBack()) return; if (window.recBack && recBack()) return;
  if (window.askBack && askBack()) return;
  if (desk.classList.contains("bird-on") && /trying to do today/i.test((document.getElementById("bird-line") || {}).textContent || "") && window.tvBack) { tvBack(); return; }
  window.asking = false;
  window.digOn = false;
  desk.classList.remove("dug", "solo");
  if (window.birdGreet) { birdGreet(); if (document.querySelector(".rec-board") && typeof showTab === "function") showTab("today"); }
  else birdSay("Hey. What are you trying to do today?", [["menu", "View Our Recommended Bets", "bets"], ["quiz", "Build Your Own Bet"]]);
}, true);

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
