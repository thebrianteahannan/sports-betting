/** Bet cards inside chat, and the ways a bet gets into chat: the Bet button in a conversation and the chat button on the ticket. Tail it saves a friend's bet or stack to My bets; Open puts it on your ticket. */

let chatGames = { at: 0, games: [] }, chatGamesJob = null;
const chatBriefOpen = new Set();

function chatDec(odds) {
  const n = Number(odds);
  return n > 0 ? 1 + n / 100 : n < 0 ? 1 + 100 / -n : 1;
}

function chatPrice(legs) {
  const dec = legs.reduce((product, leg) => product * chatDec(leg.odds), 1);
  return { dec, text: dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : dec > 1 ? String(Math.round(-100 / (dec - 1))) : "" };
}

function chatCash(n) {
  const v = Math.round(Math.abs(n) * 100) / 100;
  return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

function chatLite(leg) {
  const out = {};
  ["label", "market", "match", "sport", "kickoff", "odds"].forEach((key) => { if (leg && leg[key] != null) out[key] = leg[key]; });
  return out;
}

function chatCardSig() {
  return chatGames.at;
}

function chatGamesLoad() {
  if (typeof trayLive !== "undefined" && trayLive.at > chatGames.at) chatGames = { at: trayLive.at, games: trayLive.games };
  if (chatGamesJob || Date.now() - chatGames.at < 25000) return;
  const now = Date.now(), legs = chat.msgs.flatMap((msg) => (msg.bet ? msg.bet.parts : []).flatMap((part) => part.legs));
  if (!legs.some((leg) => { const at = Date.parse(leg.kickoff || ""); return at < now + 300000 && at > now - 8 * 3600000; })) return;
  chatGamesJob = fetch("/api/live?all=1").then((res) => res.json()).then((data) => {
    chatGames = { at: Date.now(), games: [...(data.live || []), ...(data.done || [])] };
    chatMsgsPaint(true);
  }).catch(() => {}).finally(() => { chatGamesJob = null; });
}

function chatLegMark(leg) {
  if (typeof liveLegState !== "function" || typeof liveMine !== "function" || typeof liveLegRead !== "function") return null;
  const game = chatGames.games.find((one) => liveMine(one, [leg]).length);
  if (!game) return null;
  const read = liveLegState(game, liveLegRead(leg));
  return { state: read.state || "", say: read.say || (game.final ? "Final" : `Live ${game.clock || ""}`.trim()), level: read.level || "" };
}

function chatBoard(fn) {
  if (document.querySelector("#desk-glass-in .find-board")) { fn(); return; }
  if (window.goFull) goFull();
  if (window.birdMenu) birdMenu("find");
  let tries = 0;
  const wait = setInterval(() => { if (document.querySelector("#desk-glass-in .find-board") || ++tries > 40) { clearInterval(wait); fn(); } }, 150);
}

function chatTake(bet, from, keep) {
  if (typeof sharedToTray !== "function" || typeof saveNow !== "function") {
    try { sessionStorage.setItem("chatTake", JSON.stringify({ bet, from, keep })); } catch (error) { console.log("[chat] could not hold the bet", error); }
    window.location.href = "/?go=find";
    return;
  }
  chatBoard(() => {
    if (parlayLeg.size && typeof saveSig === "function" && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
    if (!keep) {
      sharedToTray({ legs: bet.parts[0].legs, fromName: from || "Chat", mine: !from, id: "" }, true);
      chatToggle(false);
      return;
    }
    const group = bet.parts.length > 1 ? { id: `g${Date.now()}`, name: bet.name, briefs: bet.briefs || [] } : null;
    let first = "";
    bet.parts.forEach((part) => {
      sharedToTray({ legs: part.legs, fromName: from || "Chat", mine: !from, id: "" }, true);
      const made = saveNow();
      if (!made) return;
      first = first || made.id;
      const list = saveList(), row = list.find((one) => one.id === made.id);
      if (!row) return;
      if (group) row.group = group;
      if (part.stake && part.stake !== 5) row.stake = part.stake;
      saveStore(list);
    });
    if (first) saveOpen(first);
    paintParlay();
    chat.note = group ? `${bet.name} is in My stacks.` : "It's in My bets.";
    chatMsgsPaint(true);
  });
}

function chatBetCard(msg) {
  const bet = msg.bet, from = msg.from === chat.me ? "" : msg.fromName, card = chatNode("div", "chat-bet"), head = chatNode("p", "chat-bet-head");
  head.append(chatNode("b", "", bet.name));
  if (bet.stack) head.append(chatNode("i", "", `${bet.parts.length} bets`));
  card.append(head);
  let live = false;
  bet.parts.forEach((part) => {
    const box = chatNode("div", "chat-bet-part"), price = chatPrice(part.legs), marks = part.legs.map(chatLegMark);
    part.legs.forEach((leg, at) => {
      const line = chatNode("p", "chat-bet-leg"), mark = marks[at], odds = Number(leg.odds);
      line.append(chatNode("span", "", leg.label), chatNode("i", "", odds > 0 ? `+${odds}` : odds ? String(odds) : ""));
      if (mark) line.append(chatNode("em", `chat-mark ${mark.state || (mark.level ? `pace-${mark.level}` : "")}`, mark.state === "hit" ? "Hit" : mark.state === "lost" ? "Missed" : mark.say));
      box.append(line);
    });
    const done = marks.some((mark) => mark && mark.state === "lost") ? "lost" : marks.every((mark) => mark && mark.state === "hit") ? "hit" : "";
    const cash = chatNode("p", "chat-bet-cash");
    if (part.legs.length > 1) cash.append(chatNode("b", "", price.text));
    cash.append(chatNode("em", "", `${chatCash(part.stake)} → ${chatCash(part.stake * price.dec)} (+${chatCash(part.stake * (price.dec - 1))})`));
    if (done) cash.append(chatNode("strong", `chat-done ${done}`, done === "hit" ? `Cashed +${chatCash(part.stake * (price.dec - 1))}` : `Missed -${chatCash(part.stake)}`));
    if (!part.legs.every((leg) => Date.parse(leg.kickoff || "") < Date.now())) {
      live = true;
      cash.append(chatButton("Open", () => chatTake({ ...bet, parts: [part] }, from, false), "chat-act chat-open"));
    }
    box.append(cash);
    card.append(box);
  });
  if (bet.briefs && bet.briefs.length && typeof stackSavedBox === "function") {
    const open = chatBriefOpen.has(msg.id);
    card.append(chatButton(open ? "Breakdown ▴" : "Breakdown ▾", () => { if (open) chatBriefOpen.delete(msg.id); else chatBriefOpen.add(msg.id); chatMsgsPaint(true); }, "chat-act chat-brief-go"));
    if (open) card.append(stackSavedBox(bet.briefs));
  }
  if (live && from) card.append(chatButton(bet.stack ? "Tail the stack" : "Tail it", () => chatTake(bet, from, true), "chat-btn chat-btn-go chat-tail"));
  return card;
}

function chatSaved() {
  if (typeof saveList === "function") return saveList();
  try { return JSON.parse(localStorage.getItem("pod-saved-parlays") || "[]"); } catch (error) { return []; }
}

function chatStakeOf(row) {
  return (typeof stackSavedStake === "function" && stackSavedStake(row)) || Number(row.stake) || 5;
}

function chatBetOf(legs, stake) {
  const name = legs.length === 1 ? String(legs[0].label || "Bet") : `${legs.length}-leg parlay`;
  const who = legs.map((leg) => String(leg.label || "").split(/\s+(?=\d+\+|Over\b|Under\b|[+-]\d)/)[0].split(" ").pop()).filter(Boolean);
  return { name, label: legs.length === 1 ? name : `${who.slice(0, 2).join(", ")}${legs.length > 2 ? ` +${legs.length - 2}` : ""}`, parts: [{ legs: legs.map(chatLite), stake }] };
}

function chatSources() {
  const out = [], rows = chatSaved();
  if (typeof parlayLeg !== "undefined" && parlayLeg.size) {
    const open = rows.find((row) => row.id === window.parlayOpenId);
    out.push(["The bet", [chatBetOf([...parlayLeg.values()], open ? chatStakeOf(open) : 5)]]);
  }
  const bets = rows.filter((row) => !row.group && (row.legs || []).length).map((row) => chatBetOf(row.legs, chatStakeOf(row)));
  if (bets.length) out.push(["My bets", bets]);
  const groups = new Map();
  rows.filter((row) => row.group && row.group.id && (row.legs || []).length).forEach((row) => {
    const group = groups.get(row.group.id) || { name: row.group.name || "Stack", label: row.group.name || "Stack", stack: true, briefs: [], parts: [] };
    if ((row.group.briefs || []).length > group.briefs.length) group.briefs = row.group.briefs;
    group.parts.push({ legs: row.legs.map(chatLite), stake: chatStakeOf(row) });
    groups.set(row.group.id, group);
  });
  if (groups.size) out.push(["My stacks", [...groups.values()]]);
  return out;
}

function chatPickPaint() {
  const box = document.querySelector("#chat-panel .chat-pick");
  if (!box) return;
  box.hidden = !chat.picking;
  box.replaceChildren();
  if (!chat.picking) return;
  const sources = chatSources();
  if (!sources.length) box.append(chatNode("p", "chat-empty", "Build a bet or save one, then send it here."));
  sources.forEach(([title, list]) => {
    box.append(chatNode("p", "chat-pick-head", title));
    list.forEach((bet) => {
      const go = chatButton("", () => {
        chat.picking = false;
        chatPickPaint();
        const text = document.querySelector("#chat-panel .chat-form textarea"), body = text ? text.value.trim() : "";
        if (text) text.value = "";
        chatSend(body, { name: bet.name, stack: Boolean(bet.stack), parts: bet.parts, briefs: bet.briefs || [] });
      }, "chat-pick-row");
      go.append(chatNode("span", "", bet.label), chatNode("b", "", bet.stack ? `${bet.parts.length} bets` : chatPrice(bet.parts[0].legs).text));
      box.append(go);
    });
  });
}

function chatTicketButton() {
  if (typeof parlayLeg === "undefined") return;
  document.querySelectorAll(".find-tray .find-ticket").forEach((line) => {
    const had = line.querySelector(":scope > .chat-send");
    if (had) { had.hidden = !chat.on; return; }
    if (!chat.on) return;
    const go = chatButton("", () => {
      const rows = chatSaved(), open = rows.find((row) => row.id === window.parlayOpenId), bet = chatBetOf([...parlayLeg.values()], open ? chatStakeOf(open) : 5);
      chat.sharing = { name: bet.name, stack: false, parts: bet.parts, briefs: [] };
      chat.view = "list";
      chat.room = null;
      chatToggle(true);
    }, "chat-send");
    go.innerHTML = CHAT_ICON;
    go.title = "Send in a chat";
    go.setAttribute("aria-label", "Send this bet in a chat");
    const share = line.querySelector(":scope > .share-bet");
    if (share) share.before(go); else line.append(go);
  });
}

if (typeof paintParlay === "function") {
  const chatPaintBase = paintParlay;
  paintParlay = function () { chatPaintBase.apply(this, arguments); chatTicketButton(); };
}

(function chatTakeLater() {
  let raw = null;
  try { raw = sessionStorage.getItem("chatTake"); } catch (error) { return; }
  if (!raw || typeof sharedToTray !== "function") return;
  sessionStorage.removeItem("chatTake");
  let tries = 0;
  const wait = setInterval(() => {
    if (!window.saveWho && ++tries < 60) return;
    clearInterval(wait);
    try { const job = JSON.parse(raw); chatTake(job.bet, job.from, job.keep); } catch (error) { console.log("[chat] could not open the bet", error); }
  }, 500);
})();
