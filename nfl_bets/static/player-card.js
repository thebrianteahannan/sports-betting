/** The player line and the prop numbers, under the name. */

function paintCard(list, heading, person) {
  const sport = String(((person.bets || []).find((bet) => bet && bet.sport) || {}).sport || person.sport || "");
  const box = document.createElement("div");
  box.className = "find-card";
  const wait = document.createElement("p");
  wait.className = "quiet";
  wait.textContent = "Reading the player.";
  box.append(wait);
  heading.after(box);
  if (window.paintLive) paintLive(list, heading, person);
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "card", name: person.name, sport }) }).then((res) => res.json()).then((data) => {
    if (!box.isConnected) return;
    if (!data || (!data.line && !(data.stats || []).length)) {
      wait.className = "find-why";
      wait.textContent = (data && data.miss) || `No season log for ${person.name || "him"} yet.`;
      return;
    }
    box.replaceChildren();
    const kinds = box.parentElement && box.parentElement.querySelector(":scope > .find-kinds");
    if (kinds && box.compareDocumentPosition(kinds) & Node.DOCUMENT_POSITION_PRECEDING) kinds.before(box);
    if (data.line) { const line = document.createElement("p"); line.className = "find-why"; line.textContent = data.line; box.append(line); }
    const swing = (tag, tip) => { const pill = document.createElement("i"); pill.className = `find-swing${tag === "Volatile" ? " vol" : ""}`; pill.textContent = tag; pill.title = tip || ""; return pill; };
    if (data.span) { const span = document.createElement("p"); span.className = "quiet"; span.textContent = data.span; if (data.swing) span.append(" ", swing(data.swing.tag, data.swing.tip)); if (data.blowout) { const pill = swing(data.blowout.tag, data.blowout.tip); pill.className = `find-swing find-blow ${data.blowout.kind || "flat"}`; span.append(" ", pill); } box.append(span); }
    const grid = document.createElement("div");
    grid.className = "find-log";
    (data.stats || []).forEach((stat) => {
      const item = document.createElement("span");
      const title = document.createElement("b");
      title.textContent = stat.label;
      item.append(title);
      if (stat.value) item.append(document.createTextNode(stat.value));
      if (stat.tag) item.append(" ", swing(stat.tag, stat.tip));
      if (stat.blowTag) {
        const pill = swing(stat.blowTag, stat.blowTip);
        pill.className = `find-swing find-blow ${stat.blow}`;
        item.append(" ", pill);
      }
      if (stat.value && typeof profileStatBet === "function") {
        item.classList.add("find-log-bet");
        item.tabIndex = 0;
        const whom = typeof betOnSay === "function" && /her\b/i.test(betOnSay(person)) ? "her" : "his";
        item.title = `Bet ${stat.label} near ${whom} ${stat.value} average`;
        const go = () => {
          const hit = profileStatBet(person, stat.label, stat.value);
          if (!hit) return;
          const host = box.parentElement;
          const acts = host && (host.querySelector(".find-profile-acts") || host.querySelector(".td-more-acts"));
          if (typeof profileAskPut === "function" && acts) profileAskPut(acts, hit);
          else if (typeof profileBetPut === "function") profileBetPut(hit, false);
        };
        item.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); go(); });
        item.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          go();
        });
      }
      grid.append(item);
    });
    if (grid.childNodes.length) box.append(grid);
    if (data.blowout && window.proofTake) proofTake(person.name, data.blowout);
  }).catch(() => {
    if (!box.isConnected) return;
    wait.className = "find-why";
    wait.textContent = `Could not load the card for ${person.name || "him"}.`;
  });
}

window.paintCard = paintCard;

const REC_MORE_SAY = ["Just the bet", "Why the price is off", "How he gets the ball"];

function recMoreSlider(board, pick) {
  const wrap = document.createElement("label");
  wrap.className = "desk-rec-slide";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "2";
  input.value = "0";
  input.className = "desk-rec-range";
  input.setAttribute("aria-label", "More on this bet");
  input.setAttribute("aria-valuemin", "0");
  input.setAttribute("aria-valuemax", "2");
  input.setAttribute("aria-valuenow", "0");
  input.setAttribute("aria-valuetext", REC_MORE_SAY[0]);
  wrap.append(input);
  input.addEventListener("input", () => {
    const card = wrap.closest(".desk-rec");
    if (card) recMoreSet(board, pick, card, Number(input.value));
  });
  if (typeof rowSlide === "function") rowSlide(input);
  requestAnimationFrame(() => { input.value = "0"; });
  return wrap;
}

function recMoreStep(board, pick, card) {
  const input = card.querySelector(".desk-rec-range");
  const now = input ? Number(input.value) || 0 : 0;
  recMoreSet(board, pick, card, (now + 1) % 3);
}

function recMoreSet(board, pick, card, level) {
  const n = Math.max(0, Math.min(2, Math.round(Number(level) || 0)));
  const input = card.querySelector(".desk-rec-range");
  if (input) {
    input.value = String(n);
    input.setAttribute("aria-valuenow", String(n));
    input.setAttribute("aria-valuetext", REC_MORE_SAY[n]);
  }
  let more = card.querySelector(":scope > .desk-rec-more");
  if (!n) { if (more) more.remove(); return; }
  if (!more) {
    more = document.createElement("div");
    more.className = "desk-rec-more";
    const mark = document.createElement("span");
    mark.hidden = true;
    mark.className = "desk-rec-mark";
    const why = typeof startRecWhy === "function" ? startRecWhy(pick) : null;
    if (why) more.append(why);
    more.append(mark);
    card.append(more);
  }
  more.dataset.level = String(n);
  if (n >= 2 && !more.dataset.card) {
    more.dataset.card = "1";
    const hit = typeof startHit === "function" ? startHit(board, pick) : null;
    const mark = more.querySelector(".desk-rec-mark");
    if (hit && mark) paintCard(more, mark, hit.person);
  }
}

function recMoreAttach(pick, box) {
  if (!pick || !box) return;
  if (typeof startRecWhy === "function") {
    const why = startRecWhy(pick);
    const told = why && why.querySelector(".desk-rec-why-how");
    if (told) told.remove();
    if (why && why.childNodes.length) box.append(why);
  }
}

window.recMoreSlider = recMoreSlider;
window.recMoreStep = recMoreStep;
window.recMoreSet = recMoreSet;
window.recMoreAttach = recMoreAttach;
