// The swap icon on a parlay leg lists bets in the same game at about the same chance, and one tap trades the leg for it.
// Tapping the prop itself lists the other numbers FanDuel has for that player and stat.
// Tapping the player's name lists that player's other stats in the game, each at the line closest to this price.
// Tapping a player's name on his tray row lists one line per stat, and one tap adds it.
const legSwapOpen = new Map(), legSwapDrill = new Map();
let legSwapRec = localStorage.getItem("legSwapRec") !== "0";

function legSwapBoard() {
  return document.querySelector("#desk-glass-in .find-board") || document.querySelector(".find-board");
}

function legSwapChance(odds) {
  const price = Number(odds);
  return price > 0 ? 100 / (price + 100) : price < 0 ? -price / (-price + 100) : 0;
}

function legSwapWhat(person, bet) {
  const rest = String(bet.label || "").replace(person.name, "").split(/\s+—\s+/)[0].trim();
  const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").trim();
  const part = (market.match(/^(1st|2nd|3rd|4th)\s+(qtr|half)\b/i) || [""])[0];
  if (part && rest && !rest.toLowerCase().includes(part.toLowerCase())) return `${part} ${rest}`;
  if ((/^most\s/i.test(market) && !/\d/.test(rest)) || /\b(in the first \d+ minutes|in each quarter)\b/i.test(market)) return market;
  return !rest || /^(over|under)(\s+[\d.]+)?$/i.test(rest) ? [rest, market.replace(/^alt\s+/i, "")].filter(Boolean).join(" ") : rest;
}

function legSwapFind(key) {
  const old = parlayLeg.get(key);
  const board = legSwapBoard();
  if (!old || !board) return [];
  const want = legSwapChance(old.odds), owner = String(old.label || "");
  const best = new Map();
  (board.people || []).forEach((person) => {
    if (person.kind !== "player" || owner.startsWith(person.name)) return;
    (person.bets || []).forEach((bet) => {
      if (bet.match !== old.match || bet.kickoff !== old.kickoff || parlayLeg.has(parlayKey(bet))) return;
      const chance = legSwapChance(bet.odds);
      if (!chance || Math.abs(chance - want) > want * 0.06) return;
      const gap = Math.abs(chance - want), had = best.get(person.key);
      if (!had || gap < had.gap) best.set(person.key, { person, bet, gap });
    });
  });
  return [...best.values()].sort((a, b) => a.gap - b.gap).slice(0, 6);
}

function legSwapStat(person, bet) {
  const market = String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "").replace(/^(alt|total)\s+/i, "").trim().toLowerCase();
  if (/^(any time touchdown scorer|to score \d+\+ touchdowns)$/.test(market)) return "touchdowns";
  return market.replace(/\d+\+/g, "n+").replace(/^n\+\s+/, "").replace(/^made threes$/, "threes");
}

function legLineFind(key) {
  const old = parlayLeg.get(key);
  const board = legSwapBoard();
  if (!old || !board) return [];
  const person = legSwapPerson(key, "line");
  if (!person) return legGameFind(key);
  const stat = (bet) => legSwapStat(person, bet);
  const under = (bet) => /\bunder\b/i.test(bet.label || "");
  const num = (bet) => Number((String(bet.label || "").replace(person.name, "").match(/\d+(?:\.\d+)?/) || String(bet.market || "").match(/\d+(?:\.\d+)?/) || [])[0]) || (stat(bet) === "touchdowns" ? 1 : 0);
  const seen = new Set(), same = (bet) => bet.label === old.label && bet.market === old.market;
  return (person.bets || []).filter((bet) => {
    const id = `${bet.label}|${bet.market}`;
    if (bet.match !== old.match || bet.kickoff !== old.kickoff || stat(bet) !== stat(old) || under(bet) !== under(old) || !Number(bet.odds) || seen.has(id)) return false;
    if (!same(bet) && parlayLeg.has(parlayKey(bet))) return false;
    seen.add(id);
    return true;
  }).map((bet) => ({ person, bet, now: same(bet) })).sort((a, b) => num(a.bet) - num(b.bet));
}

function legGameWhat(bet) {
  const rest = String(bet.label || "").split(/\s+—\s+/)[0].replace(/^[^:]*:\s*/, "");
  return /^(over|under)(\s+[\d.]+)?$/i.test(rest) ? `${rest} ${String(bet.market || "").replace(/^alternate\s+/i, "").toLowerCase()}`.trim() : rest;
}

function legGameFind(key) {
  const old = parlayLeg.get(key);
  const board = legSwapBoard();
  if (!old || !board) return [];
  const fam = (bet) => { const market = String(bet.market || ""); return /^(total|alternate total points?)$/i.test(market) ? "total" : /^(spread|alternate spread)$/i.test(market) ? "spread" : /^moneyline$/i.test(market) ? "money" : ""; };
  const kind = fam(old);
  if (!kind) return [];
  const side = (bet) => (kind === "total" ? "" : String(bet.label || "").replace(/\s[+-]?\d.*$/, "").trim());
  const num = (bet) => Number((String(bet.label || "").match(/[+-]?\d+(?:\.\d+)?/g) || []).pop()) || 0;
  const seen = new Set(), same = (bet) => bet.label === old.label && bet.market === old.market, rows = [];
  (board.people || []).filter((one) => one.kind === "team").forEach((team) => (team.bets || []).forEach((bet) => {
    const id = `${bet.label}|${bet.market}`;
    if (bet.match !== old.match || bet.kickoff !== old.kickoff || fam(bet) !== kind || side(bet) !== side(old) || !Number(bet.odds) || seen.has(id)) return;
    if (!same(bet) && parlayLeg.has(parlayKey(bet))) return;
    seen.add(id);
    rows.push({ person: null, bet, now: same(bet) });
  }));
  return rows.sort((a, b) => /\bunder\b/i.test(a.bet.label || "") - /\bunder\b/i.test(b.bet.label || "") || num(a.bet) - num(b.bet));
}

function legKindFind(key) {
  const old = parlayLeg.get(key);
  const board = legSwapBoard();
  if (!old || !board) return [];
  const person = legSwapPerson(key, "kind");
  if (!person) return [];
  const stat = (bet) => legSwapStat(person, bet);
  const want = legSwapChance(old.odds), best = new Map();
  (person.bets || []).forEach((bet) => {
    if (bet.match !== old.match || bet.kickoff !== old.kickoff || stat(bet) === stat(old) || parlayLeg.has(parlayKey(bet))) return;
    const chance = legSwapChance(bet.odds);
    if (!chance) return;
    const gap = Math.abs(chance - want), had = best.get(stat(bet));
    if (!had || gap < had.gap) best.set(stat(bet), { person, bet, gap });
  });
  return [...best.values()].sort((a, b) => a.gap - b.gap);
}

function legWhoFind(key) {
  const person = parlayPick.get(key.replace(/^who:/, ""));
  if (!person) return [];
  const mine = [...parlayLeg.values()].find((bet) => typeof legOwns === "function" ? legOwns(person, bet) : String(bet.label || "").startsWith(person.name));
  const want = mine ? legSwapChance(mine.odds) : legSwapChance(-110), best = new Map();
  (person.bets || []).forEach((bet) => {
    const chance = legSwapChance(bet.odds);
    if (!chance || parlayLeg.has(parlayKey(bet))) return;
    const group = `${legSwapStat(person, bet)}|${/\bunder\b/i.test(bet.label || "")}|${bet.match}|${bet.kickoff}`;
    const gap = Math.abs(chance - want), had = best.get(group), rec = typeof scriptRecAll !== "undefined" && scriptRecAll.has(`${bet.label}|${bet.market}`);
    if (!had || (rec && !had.rec) || (rec === had.rec && gap < had.gap)) best.set(group, { person, bet, gap, rec });
  });
  const rank = ({ bet, rec }) => (typeof shotWantHit === "function" && shotWantHit(person, bet) ? -8 : 0) + (rec ? -4 : 0) + (/^(1st|2nd|3rd|4th)\s+(qtr|half|quarter)\b|\b(first \d+ minutes|each quarter|first basket)\b/i.test(String(bet.market || "").replace(person.name, "").replace(/^\s*-\s*/, "")) ? 2 : 0) + (/\bunder\b/i.test(bet.label || "") ? 1 : 0);
  return [...best.values()].sort((a, b) => rank(a) - rank(b) || a.gap - b.gap);
}

function legSwapTrade(key, person, bet) {
  const old = parlayLeg.get(key);
  if (!old) return;
  const next = parlayKey(bet);
  const keepHist = typeof legHistOpen !== "undefined" && legHistOpen.has(key);
  legSwapOpen.delete(key);
  legSwapDrill.delete(key);
  const owned = typeof legOwner !== "undefined" ? legOwner.get(key) : "";
  parlayLeg.delete(key);
  if (typeof legOwner !== "undefined") legOwner.delete(key);
  parlayLeg.set(next, bet);
  if (person && person.name && typeof legOwner !== "undefined") legOwner.set(next, person.name);
  if (person && !parlayPick.has(person.key)) parlayPick.set(person.key, person);
  [...parlayPick.entries()].forEach(([pick, who]) => { const was = String(old.label || "").startsWith(who.name) || owned === who.name; const left = [...parlayLeg.values()].some((row) => typeof legOwns === "function" ? legOwns(who, row) : String(row.label || "").startsWith(who.name)); if (was && !left) parlayPick.delete(pick); });
  if (keepHist) {
    legHistOpen.delete(key);
    legHistOpen.add(next);
    if (typeof legHistBox !== "undefined") {
      const box = legHistBox.get(key);
      if (box) box.remove();
      legHistBox.delete(key);
    }
  }
  if (typeof legMoreOpen !== "undefined" && legMoreOpen.has(key)) { legMoreOpen.delete(key); legMoreOpen.add(next); }
  if (typeof legMenuKey !== "undefined" && legMenuKey === key) legMenuKey = next;
  paintParlay();
}

function legSwapAdd(person, bet) {
  parlayLeg.set(parlayKey(bet), bet);
  if (person && person.name && typeof legOwner !== "undefined") legOwner.set(parlayKey(bet), person.name);
  if (person && !parlayPick.has(person.key)) parlayPick.set(person.key, person);
  paintParlay();
}

function legSwapClose(key) {
  legSwapOpen.delete(key);
  legSwapDrill.delete(key);
  legSwapPaint();
}

function legIsRec(bet) {
  return typeof scriptRecAll !== "undefined" && scriptRecAll.has(`${bet.label}|${bet.market}`);
}

function legRecFind(key, mode) {
  const person = legSwapPerson(key, mode);
  if (!person) return [];
  const old = mode === "who" ? null : parlayLeg.get(key);
  const wantMatch = old ? old.match : "", wantKick = old ? old.kickoff : "";
  const seen = new Set(), rows = [];
  (person.bets || []).forEach((bet) => {
    if (!Number(bet.odds)) return;
    if (old && (bet.match !== wantMatch || bet.kickoff !== wantKick)) return;
    const same = !!(old && bet.label === old.label && bet.market === old.market);
    if (!legIsRec(bet) && !same) return;
    if (!same && parlayLeg.has(parlayKey(bet))) return;
    const id = `${bet.label}|${bet.market}`;
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ person, bet, now: same });
  });
  return rows.sort((a, b) => Number(b.now) - Number(a.now) || Number(a.bet.odds) - Number(b.bet.odds) || legSwapWhat(a.person, a.bet).localeCompare(legSwapWhat(b.person, b.bet)));
}

function legSwapCatKey(person, bet) {
  return `${legSwapStat(person, bet)}|${/\bunder\b/i.test(bet.label || "") ? 1 : 0}`;
}

function legSwapCatSay(person, bet) {
  const under = /\bunder\b/i.test(bet.label || "");
  const raw = String(legSwapStat(person, bet) || "").replace(/\bn\+\b/g, "").trim();
  const name = raw.replace(/\b\w/g, (c) => c.toUpperCase()) || "Prop";
  return under ? `Under ${name}` : name;
}

function legSwapPerson(key, mode) {
  if (mode === "who") {
    const pick = parlayPick.get(key.replace(/^who:/, "")) || null;
    if (!pick) return null;
    const board = legSwapBoard();
    const full = ((board && board.people) || []).find((one) => one.kind === "player" && one.name === pick.name);
    return full || pick;
  }
  const old = parlayLeg.get(key);
  const board = legSwapBoard();
  if (!old) return null;
  const people = (board && board.people) || [];
  const owned = typeof legOwner !== "undefined" ? legOwner.get(key) : "";
  if (owned) {
    const hit = people.find((one) => one.kind === "player" && one.name === owned)
      || [...parlayPick.values()].find((one) => one.name === owned);
    if (hit) {
      const full = people.find((one) => one.kind === "player" && one.name === hit.name);
      return full || hit;
    }
  }
  return people.find((one) => one.kind === "player" && String(old.label || "").startsWith(one.name)) || null;
}

function legSwapSaid(key, mode) {
  if (mode === "who") {
    const person = legSwapPerson(key, mode);
    return person ? person.name : "Props";
  }
  const old = parlayLeg.get(key);
  if (!old) return "";
  const person = legSwapPerson(key, mode);
  return person ? legSwapWhat(person, old) : legGameWhat(old);
}

function legCatFind(key, mode) {
  const person = legSwapPerson(key, mode);
  if (!person) return [];
  const old = mode === "who" ? null : parlayLeg.get(key);
  const wantMatch = old ? old.match : "", wantKick = old ? old.kickoff : "";
  const nowCat = old ? legSwapCatKey(person, old) : "";
  const best = new Map();
  (person.bets || []).forEach((bet) => {
    if (!Number(bet.odds)) return;
    if (old && (bet.match !== wantMatch || bet.kickoff !== wantKick)) return;
    if (!old && parlayLeg.has(parlayKey(bet))) return;
    const cat = legSwapCatKey(person, bet), same = !!(old && bet.label === old.label && bet.market === old.market);
    const had = best.get(cat), rec = typeof scriptRecAll !== "undefined" && scriptRecAll.has(`${bet.label}|${bet.market}`);
    if (!had) best.set(cat, { person, bet, cat, now: cat === nowCat, count: 1, rec: !!rec, same });
    else {
      had.count += 1;
      if (same) { had.bet = bet; had.same = true; had.now = true; }
      else if (!had.same && rec && !had.rec) { had.bet = bet; had.rec = true; }
    }
  });
  return [...best.values()].sort((a, b) => Number(b.now) - Number(a.now) || Number(b.rec) - Number(a.rec) || legSwapCatSay(a.person, a.bet).localeCompare(legSwapCatSay(b.person, b.bet)));
}

function legCatLines(key, mode, cat) {
  const person = legSwapPerson(key, mode);
  if (!person || !cat) return [];
  const old = mode === "who" ? null : parlayLeg.get(key);
  const wantMatch = old ? old.match : "", wantKick = old ? old.kickoff : "";
  const under = cat.endsWith("|1"), stat = cat.slice(0, cat.lastIndexOf("|"));
  const num = (bet) => Number((String(bet.label || "").replace(person.name, "").match(/\d+(?:\.\d+)?/) || String(bet.market || "").match(/\d+(?:\.\d+)?/) || [])[0]) || (stat === "touchdowns" ? 1 : 0);
  const seen = new Set(), rows = [];
  (person.bets || []).forEach((bet) => {
    const id = `${bet.label}|${bet.market}`;
    if (!Number(bet.odds) || seen.has(id)) return;
    if (old && (bet.match !== wantMatch || bet.kickoff !== wantKick)) return;
    if (legSwapStat(person, bet) !== stat || /\bunder\b/i.test(bet.label || "") !== under) return;
    const same = !!(old && bet.label === old.label && bet.market === old.market);
    if (!same && parlayLeg.has(parlayKey(bet))) return;
    seen.add(id);
    rows.push({ person, bet, now: same });
  });
  return rows.sort((a, b) => num(a.bet) - num(b.bet));
}

function legSwapBox(key, mode) {
  const box = document.createElement("div");
  box.className = "find-tray-swap";
  box.dataset.key = key;
  const cats = mode === "who" || mode === "kind";
  const usedRec = !!(cats && legSwapRec);
  const recRows = usedRec ? legRecFind(key, mode) : null;
  const drill = cats && !usedRec ? legSwapDrill.get(key) || "" : "";
  const top = document.createElement("div");
  top.className = "find-swap-top";
  const said = legSwapSaid(key, mode);
  if (said && mode !== "swap") {
    const hold = document.createElement("span");
    hold.className = "find-swap-held";
    hold.textContent = mode === "who" ? said : `Selected · ${said}`;
    top.append(hold);
  }
  if (cats) {
    const label = document.createElement("label");
    label.className = "find-swap-rec";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = legSwapRec;
    const saveRec = () => {
      legSwapRec = check.checked;
      try { localStorage.setItem("legSwapRec", legSwapRec ? "1" : "0"); } catch (error) {}
      if (legSwapRec) legSwapDrill.delete(key);
      legSwapPaint();
    };
    label.addEventListener("click", (event) => event.stopPropagation());
    check.addEventListener("click", (event) => event.stopPropagation());
    check.addEventListener("change", saveRec);
    label.append(check, document.createTextNode("Show Recommended"));
    top.append(label);
  }
  const shut = document.createElement("button");
  shut.type = "button";
  shut.className = "find-swap-x";
  shut.textContent = "Close";
  shut.setAttribute("aria-label", "Close");
  shut.addEventListener("click", () => legSwapClose(key));
  top.append(shut);
  box.append(top);
  if (drill) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "find-swap-back";
    const person = legSwapPerson(key, mode), sample = person && (person.bets || []).find((bet) => legSwapCatKey(person, bet) === drill);
    back.textContent = `◂ ${sample ? legSwapCatSay(person, sample) : "Props"}`;
    back.addEventListener("click", () => { legSwapDrill.delete(key); legSwapPaint(); });
    box.append(back);
  }
  let rows, listMode = mode;
  if (cats && drill) { rows = legCatLines(key, mode, drill); listMode = "line"; }
  else if (usedRec) { rows = recRows; listMode = "line"; }
  else if (cats) { rows = legCatFind(key, mode); listMode = "cat"; }
  else rows = mode === "line" ? legLineFind(key) : legSwapFind(key);
  if (!rows.length || (mode === "swap" && !rows.some((row) => !row.now))) {
    const none = document.createElement("p");
    none.textContent = usedRec ? "No recommended props for this player in this game." : mode === "who" ? "FanDuel has no props posted for this player." : mode === "line" || listMode === "line" ? "FanDuel has no other numbers on this prop." : mode === "kind" || listMode === "cat" ? "FanDuel has no other props for this player in this game." : "Nothing else in this game sits at this price.";
    box.append(none);
    return box;
  }
  rows.forEach((row) => {
    const { person, bet, now, cat, count } = row;
    const price = Number(bet.odds);
    const go = document.createElement("button");
    go.type = "button";
    go.className = now ? "find-swap-go now" : "find-swap-go";
    if (listMode === "cat") {
      go.title = now ? "Selected prop" : "Pick a number";
      go.innerHTML = [`<i class="prop">${esc(legSwapCatSay(person, bet))}</i>`, count > 1 && `<i class="pct">${esc(`${count} lines`)}</i>`, now && `<i class="held">Selected</i>`].filter(Boolean).join("");
      go.addEventListener("click", () => { legSwapDrill.set(key, cat); legSwapPaint(); });
    } else {
      go.title = now ? "Selected · in the parlay" : mode === "who" ? "Add to the parlay" : mode === "line" || (listMode === "line" && !usedRec) ? "Change to this number" : mode === "kind" || usedRec ? "Change to this prop" : `Trade this leg for ${person.name}`;
      go.innerHTML = [`<i class="px">${esc(price > 0 ? `+${price}` : String(price))}</i>`, typeof findPct === "function" && findPct(price) && `<i class="pct">${esc(findPct(price))}</i>`, mode === "swap" && `<i class="who">${esc(person.name)}</i>`, `<i class="prop">${esc(person ? legSwapWhat(person, bet) : legGameWhat(bet))}</i>`, now && `<i class="held">Selected</i>`].filter(Boolean).join("");
      const proof = person && bet.sport === "NBA" && typeof proofOf === "function" && proofOf(person.name, bet.market, bet.label, bet.odds);
      const rec = typeof scriptRecPill === "function" && scriptRecPill(bet);
      if (rec) go.append(rec);
      if (proof) go.append(proofPill(proof));
    }
    const line = document.createElement("div");
    line.className = "find-swap-row";
    line.append(go);
    if (listMode !== "cat") {
      go.addEventListener("click", () => {
        if (now) { legSwapClose(key); return; }
        if (mode === "who") {
          const put = (fresh) => {
            legSwapOpen.delete(key);
            legSwapDrill.delete(key);
            if (fresh && parlayLeg.size && typeof saveNew === "function") saveNew();
            legSwapAdd(person, bet);
            if (typeof parlayOpenTray === "function") parlayOpenTray();
          };
          if (parlayLeg.size) {
            box.querySelectorAll(".desk-rec-ask").forEach((node) => node.remove());
            const ask = document.createElement("span");
            ask.className = "desk-rec-ask";
            ask.innerHTML = `<i>You have a bet open.</i><span role="button" tabindex="0" data-bet-go="add">Add to this bet</span><span role="button" tabindex="0" data-bet-go="new">Start a new bet</span>`;
            ask.addEventListener("click", (event) => {
              const goAsk = event.target.closest("[data-bet-go]");
              if (!goAsk) return;
              event.preventDefault();
              event.stopPropagation();
              ask.remove();
              put(goAsk.dataset.betGo === "new");
            });
            line.append(ask);
            return;
          }
          put(false);
          return;
        }
        legSwapTrade(key, person, bet);
      });
    }
    if (!now && listMode !== "cat" && mode !== "who") {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "find-swap-add";
      add.title = "Add to the parlay";
      add.setAttribute("aria-label", "Add to the parlay");
      add.addEventListener("click", () => legSwapAdd(person, bet));
      line.append(add);
    }
    box.append(line);
  });
  return box;
}

function legSwapPaint() {
  document.querySelectorAll(".find-tray button.find-leg-hist").forEach((hist) => {
    const key = hist.dataset.key;
    let swap = hist.parentElement.querySelector("button.find-leg-swap");
    if (!swap) {
      swap = document.createElement("button");
      swap.type = "button";
      swap.className = "find-leg-swap";
      swap.dataset.key = key;
      swap.setAttribute("aria-label", "Show other bets at this price");
      hist.after(swap);
    }
    if (!hist.parentElement.querySelector("button.find-leg-more")) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "find-leg-more";
      more.dataset.key = key;
      more.textContent = "⋯";
      more.setAttribute("aria-label", "More for this leg");
      hist.parentElement.append(more);
    }
    const open = legMoreOpen.has(key), more = hist.parentElement.querySelector("button.find-leg-more");
    hist.parentElement.classList.toggle("acts-open", open);
    more.classList.toggle("on", open);
    more.setAttribute("aria-expanded", String(open));
    const mode = parlayLeg.has(key) ? legSwapOpen.get(key) : "", on = mode === "swap";
    swap.classList.toggle("on", on);
    swap.setAttribute("aria-expanded", String(on));
    swap.title = on ? "Hide the swaps" : "Swap for a bet at the same price";
    const line = hist.closest(".find-chose");
    const prop = line && line.querySelector("span i.prop");
    if (prop) { prop.dataset.key = key; prop.title = mode === "line" ? "Hide the other numbers" : "Change the number"; prop.classList.toggle("on", mode === "line"); }
    const who = line && line.querySelector("span i.who");
    if (who && String((parlayLeg.get(key) || {}).label || "").startsWith(who.textContent)) { who.dataset.key = key; who.title = mode === "kind" ? "Hide the other props" : "Other props for this player"; who.classList.toggle("on", mode === "kind"); }
    document.querySelectorAll(".find-tray .find-tray-swap").forEach((box) => { if (box.dataset.key === key) box.remove(); });
    if (mode && line) { const box = legSwapBox(key, mode); box.dataset.key = key; line.after(box); }
  });
  document.querySelectorAll(".find-tray .find-loose .find-chose[data-key]").forEach((line) => {
    const key = line.dataset.key, mode = parlayLeg.has(key) ? legSwapOpen.get(key) : "";
    const prop = line.querySelector("span i.prop");
    if (prop) { prop.dataset.key = key; prop.title = mode === "line" ? "Hide the other numbers" : "Change the number"; prop.classList.toggle("on", mode === "line"); }
    document.querySelectorAll(".find-tray .find-tray-swap").forEach((box) => { if (box.dataset.key === key) box.remove(); });
    if (mode === "line") { const box = legSwapBox(key, mode); box.dataset.key = key; line.after(box); }
  });
  document.querySelectorAll(".find-tray .find-in button.find-name[data-key]").forEach((name) => {
    const key = `who:${name.dataset.key}`, on = legSwapOpen.get(key) === "who";
    name.classList.toggle("on", on);
    name.setAttribute("aria-expanded", String(on));
    name.title = on ? "Hide his props" : "Show his props";
    document.querySelectorAll(".find-tray .find-tray-swap").forEach((box) => { if (box.dataset.key === key) box.remove(); });
    if (on) { const box = legSwapBox(key, "who"); box.dataset.key = key; name.closest(".find-in").after(box); }
  });
}

const legMoreOpen = new Set();

document.addEventListener("click", (event) => {
  const more = event.target.closest && event.target.closest(".find-tray button.find-leg-more");
  if (!more) return;
  if (legMoreOpen.has(more.dataset.key)) legMoreOpen.delete(more.dataset.key);
  else {
    legMoreOpen.add(more.dataset.key);
    if (typeof legToolsSolo === "function") legToolsSolo(more.dataset.key, "more");
  }
  legSwapPaint();
});

document.addEventListener("click", (event) => {
  const hit = event.target.closest && event.target.closest(".find-tray button.find-leg-swap, .find-tray .find-chose i.prop[data-key], .find-tray .find-chose i.who[data-key], .find-tray .find-in button.find-name[data-key]");
  if (!hit) return;
  const name = hit.matches("button.find-name");
  const key = name ? `who:${hit.dataset.key}` : hit.dataset.key, mode = name ? "who" : hit.matches("i.prop") ? "line" : hit.matches("i.who") ? "kind" : "swap";
  const open = legSwapOpen.get(key) !== mode;
  if (legSwapOpen.get(key) === mode) { legSwapOpen.delete(key); legSwapDrill.delete(key); }
  else {
    legSwapOpen.set(key, mode);
    legSwapDrill.delete(key);
    if (!name && typeof legToolsSolo === "function") legToolsSolo(key, mode === "line" ? "line" : "swap");
  }
  if (open && name) {
    const glass = document.getElementById("desk-glass-in");
    if (glass) glass.scrollTo({ top: 0, behavior: "smooth" });
  }
  legSwapPaint();
  if (typeof legHistPaint === "function") legHistPaint();
  if (typeof legMenuPaint === "function") legMenuPaint();
});

if (typeof paintParlay === "function") {
  const paintParlaySwaps = paintParlay;
  paintParlay = function () { paintParlaySwaps.apply(this, arguments); legSwapPaint(); };
}
