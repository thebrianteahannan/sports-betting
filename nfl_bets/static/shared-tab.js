/** The Shared tab on Build a bet: bets friends sent you and bets you sent. Tap a bet to read it in place; "Bet this" starts a new bet with its legs, and Back puts your old bet back. */

let sharedSide = "in", sharedPeek = "";

function sharedLive(items) {
  return (items || []).filter((item) => item.legs.some((leg) => !(Date.parse(leg.kickoff || "") < Date.now())));
}

function sharedTabLabel() {
  const fresh = sharedLive(window.sharedItems).filter((item) => !item.viewed).length;
  return `Shared${fresh ? ` ${fresh} new` : ""}`;
}

function sharedTabKey() {
  return JSON.stringify([Boolean(window.saveWho), sharedLive(window.sharedItems).map((item) => [item.id, item.viewed, item.saved]), sharedLive(window.sharedSent).map((item) => [item.id, item.to]), ((window.friendsData || {}).incoming || []).map((one) => one.id)]);
}

function sharedTabGo(flash) {
  startTab = "shared"; sharedSide = "in";
  startPaint(1);
  const box = document.querySelector("#desk-glass-in .find-start");
  if (!box) return;
  box.scrollIntoView({ block: "start", behavior: "smooth" });
  if (!flash) return;
  box.querySelectorAll(".find-shared-card[data-shared]").forEach((card) => { if (!flash.has(card.dataset.shared)) return; card.classList.remove("find-flash"); void card.offsetWidth; card.classList.add("find-flash"); setTimeout(() => card.classList.remove("find-flash"), 2400); });
}

function sharedLegs(item) {
  const box = document.createElement("div");
  box.className = "stack-set stack-brief stack-open find-shared-legs";
  item.legs.forEach((leg) => {
    const row = typeof stackLeg === "function" ? stackLeg(leg) : Object.assign(document.createElement("div"), { className: "rec-bet", textContent: leg.label });
    row.querySelectorAll(".rec-gist").forEach((node) => node.remove());
    const at = Date.parse(leg.kickoff || ""), game = typeof gameShort === "function" ? gameShort(leg.match) : "";
    const when = [game, at ? new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""].filter(Boolean).join(" · ");
    if (when) row.insertAdjacentHTML("beforeend", `<p class="find-shared-when">${esc(when)}</p>`);
    box.append(row);
  });
  return box;
}

function sharedLoad(board, item) {
  const had = parlayLeg.size > 0;
  if (had && saveSig([...parlayLeg.values()]) !== saveHeld) saveNow();
  const prior = had ? window.parlayOpenId || "" : "", ids = new Set(saveList().map((row) => row.id));
  sharedPeek = "";
  sharedToTray(item, true);
  startPaint(1);
  startUndo = { board, keys: [...parlayLeg.keys()], ids, prior };
}

function sharedCard(board, item) {
  const chip = sharedChip(item), head = chip.querySelector(":scope > button:not(.find-saved-x)"), open = sharedPeek === item.id;
  const card = document.createElement("div");
  card.className = `find-shared-card${!item.mine && !item.viewed ? " fresh" : ""}${open ? " open" : ""}`;
  if (!item.mine) card.dataset.shared = item.id;
  const peek = head.cloneNode(true);
  peek.setAttribute("aria-expanded", String(open));
  peek.addEventListener("click", () => {
    sharedPeek = open ? "" : item.id;
    if (!open && !item.mine) { sharedSeen(); sharedMark(item.id, "viewed"); }
    startPaint(1);
  });
  head.replaceWith(peek);
  card.append(chip);
  if (!open) return card;
  const from = [item.mine ? "You sent this" : `From ${item.fromName}`, item.at ? friendsAgo(item.at) : ""].filter(Boolean).join(", ");
  card.insertAdjacentHTML("beforeend", `<p class="find-shared-from">${esc(from)}</p>${item.note ? `<p class="find-shared-note">“${esc(item.note)}”</p>` : ""}`);
  card.append(sharedLegs(item));
  const row = document.createElement("p");
  row.className = "find-shared-do";
  row.append(friendsButton("Bet this", () => sharedLoad(board, item)));
  card.append(row);
  return card;
}

function sharedTabBody(board) {
  const box = document.createElement("div"), note = document.createElement("p");
  box.className = "find-shared-tab"; note.className = "find-friends-note";
  ((window.friendsData || {}).incoming || []).forEach((one) => {
    const row = document.createElement("p");
    row.className = "find-friends-row";
    row.innerHTML = `<span><b>${esc(one.name)}</b> wants to be friends</span>`;
    row.append(friendsButton("Accept", () => friendsAct({ action: "accept", id: one.id }, note)), friendsButton("Decline", () => friendsAct({ action: "decline", id: one.id }, note), "find-friends-quiet"));
    box.append(row);
  });
  box.append(note);
  const inbox = sharedLive(window.sharedItems), sent = sharedLive(window.sharedSent), bar = document.createElement("p");
  bar.className = "stack-kind-bar find-shared-side";
  [["in", `Sent to you ${inbox.length}`], ["out", `You sent ${sent.length}`]].forEach(([side, label]) => {
    const chip = Object.assign(document.createElement("button"), { type: "button", textContent: label, className: sharedSide === side ? "on" : "" });
    chip.setAttribute("aria-pressed", String(sharedSide === side));
    chip.addEventListener("click", () => { sharedSide = side; sharedPeek = ""; startPaint(1); });
    bar.append(chip);
  });
  const friends = friendsButton("Friends", () => {
    if (window.goFull) goFull();
    if (typeof showTab === "function") showTab("profile");
    setTimeout(() => {
      profileShared();
      const spot = document.getElementById("profile-shared"), head = spot && [...spot.querySelectorAll(".find-friends-sub")].find((node) => node.textContent.startsWith("Friends"));
      if (spot) (head || spot).scrollIntoView({ block: "start", behavior: "smooth" });
    }, 250);
  }, "find-friends-quiet");
  friends.title = "Add or remove friends on your profile";
  bar.append(friends);
  box.append(bar);
  const items = sharedSide === "in" ? inbox : sent;
  if (!items.length) box.insertAdjacentHTML("beforeend", `<p class="find-friends-empty">${sharedSide === "in" ? "When a friend sends you a bet, it lands here." : "Send a bet from its share card and it shows up here."}</p>`);
  items.forEach((item) => box.append(sharedCard(board, item)));
  return box;
}
