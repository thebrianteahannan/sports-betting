const state = window.state = { board: null, tab: "today" };

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function american(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : String(n);
}

function when(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function load() {
  const response = await fetch("/api/board", { cache: "no-store" });
  state.board = await response.json();
  render();
  clearTimeout(state.timer);
  state.timer = setTimeout(load, liveBoard(state.board) ? 15000 : 120000);
}

function render() {
  const board = state.board || {};
  $("lede").textContent = board.updatedAt
    ? `FanDuel ${when(board.updatedAt)} ET.`
    : "No board yet.";
  const banner = $("banner");
  if (board.errors && board.errors.length) {
    banner.hidden = false;
    banner.textContent = board.errors.join(" ");
  } else {
    banner.hidden = true;
  }
  renderLive(board.archive || []);
  const week = bestBet(board);
  const today = todayCandidate(board);
  renderFeatured("best", today, "Today's Best Bet", "A bet you can place today.");
  const same = today && week && legKey({ legs: today.legs }) === legKey({ legs: week.legs });
  renderFeatured("week", same ? null : week, "Bet of the Week", "The highest combined chance among this week's cards.");
  ["chalk", "four", "plus", "hits"].forEach((id) => renderParlay(id, board[id]));
  renderArchive(board.archive || []);
  renderPicks(board.picks || []);
  showTab(state.tab);
  if (window.paintChoices) window.paintChoices();
}

function dropMiss(text) {
  return String(text || "").replace(/\s*(?:It|Either) can miss\./g, "").trim();
}

function legItem(leg) {
  const row = withLive(leg);
  const bits = [];
  const now = progress(row);
  if (!now && row.note && !/mark this/i.test(row.note)) bits.push(row.note);
  if (row.kickoff) bits.push(`${when(row.kickoff)} ET`);
  const extra = bits.length ? ` · ${bits.join(" ")}` : "";
  const count = now ? ` <b class="sofar">${esc(now)}</b>` : "";
  const mark = typeof legState === "function" ? legState(row) : "wait";
  return `<li><b>${esc(american(row.odds) || row.odds)}</b><span><i class="leg-mark ${mark}" title="${mark === "won" ? "Won" : mark === "lost" ? "Missed" : mark === "push" ? "Push" : "Waiting"}">${mark === "won" ? "✓" : mark === "lost" ? "✕" : mark === "push" ? "–" : "◌"}</i>${esc(row.label)}</span><em>${esc(row.pct || "")}${count}${esc(extra)}</em></li>`;
}

function withLive(leg) {
  if (leg.have != null && leg.have !== "") return leg;
  const rows = ((state.board && state.board.archive) || []).flatMap((ticket) => ticket.legs || []);
  const hit = rows.find((row) => row.label === leg.label && String(row.odds) === String(leg.odds) && row.have != null && row.have !== "");
  return hit ? { ...leg, have: hit.have, line: hit.line, result: hit.result, stat: hit.stat || leg.stat } : leg;
}

function progress(leg) {
  const have = Number(leg.have);
  const line = Number(leg.line);
  if (!Number.isFinite(have) || !Number.isFinite(line)) return "";
  const unit = unitOf(leg);
  const shown = (value) => Number.isInteger(value) ? String(value) : String(value);
  return `${shown(have)} of ${shown(line)}${unit ? ` ${unit}` : ""}`;
}

function unitOf(leg) {
  const text = `${leg.label || ""} ${leg.stat || ""}`.toLowerCase();
  const words = ["shots on goal", "receiving yards", "rushing yards", "passing yards", "assists", "rebounds", "points", "receptions", "strikeouts", "saves"];
  return words.find((word) => text.includes(word)) || "";
}

function renderLive(archive) {
  const box = $("live");
  const now = Date.now();
  const rows = (archive || []).filter((ticket) => {
    if (ticket.result !== "open" || !ticket.good) return false;
    return (ticket.legs || []).some((leg) => {
      const kick = Date.parse(leg.kickoff || ticket.kickoff || "");
      return Number.isFinite(kick) && kick <= now && now - kick < 8 * 60 * 60 * 1000;
    });
  });
  box.hidden = !rows.length;
  $("live-list").innerHTML = rows.map((ticket) => pickRow(ticket, true)).join("");
}

function liveBoard(board) {
  const now = Date.now();
  return ((board && board.archive) || []).some((ticket) => ticket.result === "open" && (ticket.legs || []).some((leg) => {
    const kick = Date.parse(leg.kickoff || ticket.kickoff || "");
    return Number.isFinite(kick) && kick <= now && now - kick < 8 * 60 * 60 * 1000;
  }));
}

function renderFeatured(prefix, best, heading, aim) {
  const box = $(prefix);
  if (!best) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const live = $(`${prefix}-live`);
  const pulled = state.board && state.board.updatedAt ? when(state.board.updatedAt) : "";
  if (best.live) {
    live.hidden = false;
    live.textContent = pulled
      ? `Live. FanDuel in-play prices from ${pulled} ET.`
      : "Live. FanDuel in-play prices.";
  } else {
    live.hidden = true;
    live.textContent = "";
  }
  $(`${prefix}-aim`).textContent = aim;
  $(`${prefix}-title`).textContent = heading;
  $(`${prefix}-when`).textContent = eventClock(best.card, best.legs);
  if (!best.legs.length) {
    $(`${prefix}-copy`).textContent = best.empty || "Nothing left to bet on today's slate.";
    $(`${prefix}-legs`).innerHTML = "";
    $(`${prefix}-note`).textContent = "";
    $(`${prefix}-save`).innerHTML = "";
    return;
  }
  const game = best.game ? `${best.game}. ` : "";
  const win = best.profit != null ? ` A $5 bet would win $${Number(best.profit).toFixed(2)}.` : "";
  $(`${prefix}-copy`).textContent = `${game}Strategy: ${best.strategy}. The legs are ${pctWords(best.legs)}. The parlay is ${best.pct}%.${win}`;
  $(`${prefix}-legs`).innerHTML = best.legs.map(legItem).join("");
  $(`${prefix}-note`).textContent = dropMiss(best.note || "");
  mountHistory($(`${prefix}`), best.id, best.game, best.group);
  const saved = bestSaved(best);
  const shaped = best.group ? { legs: best.legs } : best.card;
  const mine = cardGood(best.id, shaped);
  const group = best.group ? ` data-group="${esc(best.group)}"` : "";
  $(`${prefix}-save`).innerHTML = `${saved
    ? `<button type="button" class="ghost" disabled>Saved</button>`
    : `<button type="button" class="ghost" data-save="${esc(best.id)}"${group}>Save this pick</button>`
  }${starHtml(mine, best.id, best.group, "")}`;
}

function todayCandidate(board) {
  const card = board.todayBet;
  if (!card) return null;
  const legs = card.legs || [];
  const pct = Number(card.impliedPct);
  if (!legs.length || !Number.isFinite(pct)) {
    return {
      id: "todayBet", strategy: "", game: card.game || "", pct: null, legs: [],
      profit: null, note: "", live: false, group: "", card, empty: card.copy || "",
    };
  }
  return {
    id: "todayBet", strategy: card.strategy || card.title || "", game: card.game || "", pct, legs,
    profit: card.profit != null ? card.profit : winOn(card.american), note: card.note || "",
    live: card.live, group: "", card,
  };
}

function bestBet(board) {
  const candidates = [];
  ["chalk", "four", "plus"].forEach((id) => {
    const card = board[id];
    const legs = (card && card.legs) || [];
    const pct = Number(card && card.impliedPct);
    if (!legs.length || !Number.isFinite(pct)) return;
    candidates.push({
      id, strategy: card.title || id, game: card.game || "", pct, legs,
      profit: card.profit, note: card.note || "", live: card.live, group: "", card,
    });
  });
  const hits = board.hits || {};
  (hits.groups || []).forEach((group) => {
    const legs = group.legs || [];
    const pct = Number(String(group.pct || "").replace("%", ""));
    if (!legs.length || !Number.isFinite(pct)) return;
    candidates.push({
      id: "hits", strategy: group.title || "Stack", game: hits.game || "", pct, legs,
      profit: winOn(group.price), note: hits.note || "", live: hits.live, group: group.title || "", card: hits,
    });
  });
  candidates.sort((a, b) => b.pct - a.pct);
  return candidates[0] || null;
}

function eventClock(card, legs) {
  const stamps = [];
  const add = (iso) => {
    if (iso && !stamps.includes(iso)) stamps.push(iso);
  };
  if (card) add(card.kickoff);
  (legs || (card && card.legs) || []).forEach((leg) => add(leg.kickoff));
  ((card && card.groups) || []).forEach((group) => {
    (group.legs || []).forEach((leg) => add(leg.kickoff));
  });
  stamps.sort();
  return stamps.map((iso) => `${when(iso)} ET`).join(" · ");
}

function pctWords(legs) {
  const bits = legs.map((leg) => String(leg.pct || "").trim()).filter(Boolean);
  if (bits.length < 2) return bits[0] || "listed below";
  return `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
}

function winOn(price) {
  const n = Number(String(price ?? "").replace("+", ""));
  if (!Number.isFinite(n) || n === 0) return null;
  const decimal = n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  return Math.round(5 * (decimal - 1) * 100) / 100;
}

function bestSaved(best) {
  const labels = best.legs.map((leg) => leg.label).join("|");
  return ((state.board && state.board.picks) || []).find((pick) => (
    pick.result === "open"
    && pick.card === best.id
    && (pick.legs || []).map((leg) => leg.label).join("|") === labels
  ));
}

function renderParlay(id, card) {
  const box = $(id);
  if (!card) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  let live = box.querySelector(".live-note");
  if (!live) {
    live = document.createElement("p");
    live.className = "live-note";
    box.insertBefore(live, box.firstChild);
  }
  if (card.live) {
    const pulled = state.board && state.board.updatedAt ? when(state.board.updatedAt) : "";
    const clock = pulled ? ` from ${pulled} ET` : "";
    live.hidden = false;
    live.textContent = String(card.game || "").includes(",")
      ? `Live. A game on this card is in progress. FanDuel in-play prices${clock}.`
      : `Live. This game is in progress. FanDuel in-play prices${clock}.`;
  } else {
    live.hidden = true;
    live.textContent = "";
  }
  const game = card.game ? `${card.game}. ` : "";
  $(`${id}-aim`).textContent = card.goal || "";
  $(`${id}-title`).textContent = card.title || "";
  $(`${id}-when`).textContent = eventClock(card);
  $(`${id}-copy`).textContent = dropMiss(`${game}${card.copy || ""}`);
  const groups = card.groups || [];
  $(`${id}-legs`).innerHTML = groups.length
    ? groups.map((group) => `<li class="split"><b>${esc(group.price)}</b><span>${esc(group.title)}</span><em>${esc(group.pct || "")}</em></li>${(group.legs || []).map(legItem).join("")}`).join("")
    : (card.legs || []).map(legItem).join("");
  $(`${id}-note`).textContent = dropMiss(card.note || "");
  mountHistory(box, id, card.game || "", "");
  let save = box.querySelector(".pick-save");
  if (!save) {
    save = document.createElement("p");
    save.className = "pick-save";
    box.appendChild(save);
  }
  const saved = openCopy(id, card);
  const mine = cardGood(id, card);
  save.innerHTML = `${saved
    ? `<button type="button" class="ghost" disabled>Saved</button>`
    : `<button type="button" class="ghost" data-save="${esc(id)}">Save this pick</button>`
  }${starHtml(mine, id, "", "")}`;
}

function mountHistory(box, cardId, game, group) {
  if (!box) return;
  let slot = box.querySelector(".history-slot");
  if (!slot) {
    slot = document.createElement("div");
    slot.className = "history-slot";
    const save = box.querySelector(".pick-save");
    if (save) box.insertBefore(slot, save);
    else box.appendChild(slot);
  }
  slot.innerHTML = historyHtml(cardId, game, group);
}

function historyHtml(cardId, game, group) {
  const rows = ((state.board && state.board.archive) || []).filter((ticket) => (
    ticket.card === cardId
    && (ticket.legs || []).length
    && (!game || ticket.game === game)
    && (!group || String(ticket.title || "").endsWith(group))
  )).sort((a, b) => String(a.offeredAt).localeCompare(String(b.offeredAt)));
  const versions = [];
  rows.forEach((ticket) => {
    const key = (ticket.legs || []).map((leg) => `${leg.label}|${leg.odds}`).join("||");
    const last = versions[versions.length - 1];
    if (last && last.key === key) return;
    versions.push({ key, from: ticket.offeredAt, legs: ticket.legs });
  });
  if (!versions.length) return "";
  const first = when(versions[0].from);
  if (versions.length === 1) return `<p class="quiet">First seen ${esc(first)} ET. These prices have not moved.</p>`;
  const items = versions.map((row) => {
    const legs = row.legs.map((leg) => `${american(leg.odds)} ${String(leg.label).split(" — ")[0]}`).join("; ");
    return `<li><b>${esc(when(row.from))} ET</b><span>${esc(legs)}</span></li>`;
  }).join("");
  return `<details class="history"><summary>Price history since ${esc(first)} ET. ${versions.length} versions.</summary><ol>${items}</ol></details>`;
}

function cardGood(id, card) {
  const wanted = cardKeys(card);
  const hits = ((state.board && state.board.archive) || []).filter((ticket) => (
    ticket.card === id && wanted.includes(legKey(ticket))
  ));
  return hits.length ? Math.max(...hits.map((ticket) => Number(ticket.stars) || (ticket.good ? 1 : 0))) : 0;
}

function cardKeys(card) {
  const groups = card.groups || [];
  const packs = groups.length ? groups.map((group) => group.legs || []) : [card.legs || []];
  return packs.map((legs) => legs.map((leg) => `${leg.label}|${leg.odds}`).join("||"));
}

function legKey(ticket) {
  return (ticket.legs || []).map((leg) => `${leg.label}|${leg.odds}`).join("||");
}

function openCopy(id, card) {
  return ((state.board && state.board.picks) || []).find((pick) => (
    pick.result === "open" && pick.card === id && String(pick.american) === String(card.american) && pick.copy === card.copy
  ));
}

function renderArchive(tickets) {
  const open = tickets.filter((ticket) => ticket.result === "open" || !ticket.result);
  const won = tickets.filter((ticket) => ticket.result === "won");
  const lost = tickets.filter((ticket) => ticket.result === "lost");
  const push = tickets.filter((ticket) => ticket.result === "push");
  const decided = won.length + lost.length;
  const pct = decided ? `${((won.length / decided) * 100).toFixed(1)}%` : "";
  $("open-score").textContent = open.length
    ? `${open.length} open. Each one is waiting on a box score.`
    : "No open bets yet.";
  $("open-list").innerHTML = open.map((ticket) => pickRow(ticket, true)).join("");
  const rate = pct
    ? `Win percentage ${pct}, from ${won.length} wins and ${lost.length} losses.`
    : "No completed bets yet.";
  $("wins-score").textContent = won.length ? `${won.length} wins. ${rate}` : rate;
  $("losses-score").textContent = lost.length ? `${lost.length} losses. ${rate}` : rate;
  $("wins-list").innerHTML = won.map((ticket) => pickRow(ticket, true)).join("");
  $("losses-list").innerHTML = lost.map((ticket) => pickRow(ticket, true)).join("");
  $("pushes-score").textContent = `${push.length} pushes. ${rate}`;
  $("pushes-list").innerHTML = push.map((ticket) => pickRow(ticket, true)).join("");
  $("tab-pushes").hidden = push.length === 0;
  $("tab-wins").textContent = pct ? `Wins ${pct}` : "Wins";
}

function showTab(name) {
  state.tab = name;
  const titles = { today: "Today's bets", build: "Build a bet", swipe: "Swipe", open: "Open bets", wins: "Wins", losses: "Losses", pushes: "Pushes" };
  $("page-title").textContent = titles[name] || titles.today;
  ["today", "build", "swipe", "open", "wins", "losses", "pushes"].forEach((id) => {
    $(`pane-${id}`).hidden = id !== name;
    document.querySelector(`[data-tab="${id}"]`).classList.toggle("on", id === name);
  });
}

function renderPicks(picks) {
  const counts = { open: 0, won: 0, lost: 0, push: 0 };
  picks.forEach((pick) => { counts[pick.result] = (counts[pick.result] || 0) + 1; });
  $("tracked-score").textContent = picks.length
    ? `Open ${counts.open}. Won ${counts.won}. Lost ${counts.lost}. Push ${counts.push}. Nothing here is sent to FanDuel.`
    : "Save a card above. This list only remembers the pick. It does not place the bet.";
  $("tracked-list").innerHTML = picks.map(pickRow).join("");
}

function manualMark(pick) {
  if (pick.result && pick.result !== "open") {
    return `<span class="mark ${esc(pick.result)}">${esc(pick.result)}${pick.how ? ` · ${esc(pick.how)}` : ""}</span>`;
  }
  return "";
}

function archiveMark(ticket) {
  if (ticket.result && ticket.result !== "open") {
    const how = ticket.how === "box score" ? "box score" : (ticket.how || "");
    return `<span class="mark ${esc(ticket.result)}">${esc(ticket.result)}${how ? ` · ${esc(how)}` : ""}</span>`;
  }
  const legs = ticket.legs || [];
  const moving = legs.map(progress).filter(Boolean);
  if (moving.length) {
    return `<span class="status">Live. ${esc(moving.join(". "))}.</span>`;
  }
  const kick = nextKick(ticket);
  return `<span class="status">Open until ${esc(kick || "the game starts")}${kick ? " ET" : ""}. The box score will say won or lost.</span>`;
}

function nextKick(ticket) {
  const stamps = [ticket.kickoff, ...(ticket.legs || []).map((leg) => leg.kickoff)].filter(Boolean);
  const future = stamps.filter((stamp) => new Date(stamp).getTime() > Date.now()).sort();
  const pick = future[0] || stamps.sort()[0];
  return pick ? when(pick) : "";
}

function pickRow(pick, archive) {
  const groups = pick.groups || [];
  const legs = groups.length
    ? groups.map((group) => `<li class="split"><b>${esc(group.price)}</b><span>${esc(group.title)}</span><em>${esc(group.pct || "")}</em></li>${(group.legs || []).map(legItem).join("")}`).join("")
    : (pick.legs || []).map(legItem).join("");
  const mark = archive ? archiveMark(pick) : manualMark(pick);
  const good = goodControl(pick, archive);
  const price = american(pick.american);
  const clock = when(archive ? pick.offeredAt : pick.savedAt);
  return `<article><h3>${esc(pick.title)}${price ? ` ${esc(price)}` : ""}</h3><p class="quiet">${esc(clock)}${pick.game ? ` · ${esc(pick.game)}` : ""}</p><ol class="chalk-legs">${legs}</ol><p class="pick-save">${good}${mark}</p></article>`;
}

function goodControl(pick, archive) {
  if (!archive) return "";
  const rating = Number(pick.stars) || (pick.good ? 1 : 0);
  return starHtml(rating, "", "", pick.id);
}

async function postPick(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    $("banner").hidden = false;
    $("banner").textContent = payload.error || "Could not save that pick.";
    return;
  }
  if (payload.picks) state.board.picks = payload.picks;
  if (payload.archive) state.board.archive = payload.archive;
  $("banner").hidden = !payload.already;
  if (payload.already) $("banner").textContent = "That pick is already on your list.";
  render();
}

document.body.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (tab) showTab(tab.dataset.tab);
  const star = event.target.closest("[data-stars]");
  if (star) {
    const host = star.closest("[data-good-card], [data-good]");
    const stars = Number(star.dataset.stars);
    postPick("/api/archive/good", host.dataset.good
      ? { id: host.dataset.good, stars }
      : { card: host.dataset.goodCard, group: host.dataset.group || "", stars });
    return;
  }
  const save = event.target.closest("[data-save]");
  if (save) postPick("/api/picks", { card: save.dataset.save, group: save.dataset.group || "" });
});

load().catch((error) => {
  $("lede").textContent = "The desk did not load.";
  $("banner").hidden = false;
  $("banner").textContent = String(error);
});
