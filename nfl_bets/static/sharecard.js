const SHARE_FONT = "Oswald, Impact, sans-serif";
const SHARE_TEXT = "Rajdhani, sans-serif";
const NAMED_BETS = [
  ["band", "−150 to +100 window", "−150 TO +100"],
  ["todayBet", "Highest chance parlay today", "HIGHEST CHANCE"],
  ["weekThree", "3 legs, different days, near −200", "3 LEGS NEAR −200"],
  ["weekFive", "5 legs, different days, near −200", "5 LEGS NEAR −200"],
  ["weekSafe", "3 legs, different days, near −350", "NEAR −350"],
  ["chalk", "−400 to −700 legs, near −180", "NEAR −180"],
  ["four", "Four yardage legs near 85% each", "FOUR NEAR 85%"],
  ["plus", "Four yardage legs near +250", "FOUR NEAR +250"],
];

let shareChoices = [];
let shareTemplate = null;

function sharePct(value) {
  const n = Number(String(value ?? "").replace("%", ""));
  return Number.isFinite(n) ? n.toFixed(1) : "";
}

function shareSigned(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : String(n);
}

function splitLeg(label) {
  const clean = String(label || "").split(" — ")[0].trim();
  const at = clean.search(/\d/);
  if (at > 1) return { name: clean.slice(0, at).trim(), prop: clean.slice(at).trim() };
  return { name: clean, prop: "" };
}

function gameLine(card) {
  const games = [...new Set((card.legs || []).map((leg) => {
    const parts = String(leg.label || "").split(" — ");
    if (parts.length < 2) return "";
    const bits = parts[1].split(",");
    return (bits[1] || "").trim();
  }).filter(Boolean))];
  if (games.length === 1) return games[0];
  if (card.game && !String(card.game).includes(",")) return card.game;
  return games.length ? "Across the slate" : (card.game || "");
}

function whenLine(card) {
  const stamps = [];
  const add = (iso) => { if (iso && !stamps.includes(iso)) stamps.push(iso); };
  add(card.kickoff);
  (card.legs || []).forEach((leg) => add(leg.kickoff));
  if (!stamps.length || typeof when !== "function") return "";
  stamps.sort();
  if (stamps.length === 1) return `${when(stamps[0])} ET`.toUpperCase();
  return `${when(stamps[0])} – ${when(stamps[stamps.length - 1])} ET`.toUpperCase();
}
function whyLines(card, kicker) {
  if (kicker === "BET OF THE DAY") return ["Highest chance today", "between −150 and +100."];
  if (kicker !== "BET OF THE WEEK") return [];
  const match = String(card.strategy || "").match(/aimed at (-?\d+)/);
  const n = match ? Number(match[1]) : -200;
  const price = n > 0 ? `+${n}` : `−${Math.abs(n)}`;
  return ["Each leg a different day,", `aimed at ${price}.`];
}
function foundLine(card) {
  const board = (window.state && window.state.board) || {};
  const stamp = card.pulledAt || board.updatedAt || "";
  if (!stamp || typeof when !== "function") return "";
  return `${when(stamp)} ET`;
}
function shareFrom(card, kicker, label) {
  const legs = (card.legs || []).filter((leg) => leg && leg.label).map((leg) => ({
    label: String(leg.label),
    pct: sharePct(leg.pct),
    form: String(leg.form || "").replace(/^In form:\s*/i, ""),
  }));
  const price = shareSigned(card.american);
  const strategy = price ? `Near ${price}` : (card.strategy || label || "");
  const profit = card.profit != null ? card.profit : (typeof winOn === "function" ? winOn(card.american) : null);
  let game = gameLine(card);
  if (game === "Across the slate" && kicker === "BET OF THE WEEK") game = "This week";
  if (game === "Across the slate" && kicker === "BET OF THE DAY") game = "Today";
  return {
    kicker, title: card.title || label || "Parlay", strategy, game,
    when: whenLine(card), found: foundLine(card), why: whyLines(card, kicker), legs, pct: sharePct(card.impliedPct), profit,
  };
}

function savedShare(row) {
  const match = String(row.copy || "").match(/about ([0-9.]+)%/);
  return shareFrom({
    title: row.title || "Built bet",
    legs: (row.lines || []).map((line) => ({ label: line })),
    impliedPct: match ? Number(match[1]) : null,
    american: row.american,
    pulledAt: row.at || "",
    strategy: row.when || "",
  }, "BUILT BET", row.title || "Built bet");
}

function boardChoices() {
  const board = (window.state && window.state.board) || {};
  const rows = [];
  NAMED_BETS.forEach(([id, label, kicker]) => {
    const card = board[id];
    if (!card || !(card.legs || []).length) return;
    rows.push({ key: id, label, card: shareFrom(card, kicker, label) });
  });
  ((board.hits && board.hits.groups) || []).forEach((group, index) => {
    if (!(group.legs || []).length) return;
    const pct = sharePct(group.pct);
    rows.push({
      key: `hits-${index}`,
      label: group.title || "Stack",
      card: shareFrom({
        title: group.title, game: board.hits.game, legs: group.legs,
        impliedPct: pct, american: group.price, strategy: board.hits.title || "",
      }, "WHICH STACK", group.title),
    });
  });
  return rows;
}

async function fillShareCards() {
  const select = document.getElementById("share-card-bet");
  const note = document.getElementById("share-card-note");
  if (!select) return;
  if (!(window.state && window.state.board)) {
    setTimeout(fillShareCards, 400);
    return;
  }
  const previous = select.value;
  shareChoices = boardChoices();
  try {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      (payload.built || []).forEach((row, index) => {
        const card = savedShare(row);
        if (!card.legs.length) return;
        shareChoices.push({ key: `saved-${index}`, label: `${row.name || "Member"} rated ${row.title || "a bet"}`, card });
      });
    }
  } catch (error) {
    if (note) note.textContent = "";
  }
  select.innerHTML = shareChoices.map((row) => `<option value="${esc(row.key)}">${esc(row.label)}</option>`).join("");
  if (previous && shareChoices.some((row) => row.key === previous)) select.value = previous;
  if (!shareChoices.length) {
    if (note) note.textContent = "No bet is on the board yet.";
    return;
  }
  if (note) note.textContent = "";
  drawShare();
}

function loadTemplate() {
  if (shareTemplate) return Promise.resolve(shareTemplate);
  shareTemplate = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("template"));
    image.src = "/share-template.jpg?v=5";
  });
  return shareTemplate;
}

function fitText(ctx, text, max, size, family) {
  let next = size;
  ctx.font = `700 ${next}px ${family}`;
  while (next > 13 && ctx.measureText(text).width > max) {
    next -= 1;
    ctx.font = `700 ${next}px ${family}`;
  }
  return next;
}

function roundBox(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBoard(ctx, bet) {
  const x = 574;
  const y = 0;
  const w = 382;
  const h = 648;
  const left = x + 16;
  const right = x + w - 16;
  roundBox(ctx, x, y, w, h, 8);
  ctx.fillStyle = "#07131a";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#3dff6e";
  ctx.stroke();
  let cursor = y + 16;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#3dff6e";
  const title = bet.kicker || String(bet.title || "PARLAY").toUpperCase();
  const titleSize = fitText(ctx, title, right - left, 40, SHARE_FONT);
  ctx.fillText(title, left, cursor);
  cursor += titleSize + 6;
  ctx.fillStyle = "#f4f7fb";
  ctx.font = `600 18px ${SHARE_TEXT}`;
  if (bet.when) {
    const clock = fitText(ctx, bet.when, right - left, 18, SHARE_TEXT);
    ctx.font = `600 ${clock}px ${SHARE_TEXT}`;
    ctx.fillText(bet.when, left, cursor);
    cursor += clock + 8;
  }
  if (bet.game) {
    ctx.fillStyle = "#ffffff";
    const game = String(bet.game).toUpperCase();
    const gameSize = fitText(ctx, game, right - left, 24, SHARE_FONT);
    ctx.font = `700 ${gameSize}px ${SHARE_FONT}`;
    ctx.fillText(game, left, cursor);
    cursor += gameSize + 8;
  }
  if (bet.strategy) {
    ctx.fillStyle = "#3dff6e";
    const line = `STRATEGY: ${String(bet.strategy).toUpperCase()}`;
    const size = fitText(ctx, line, right - left, 18, SHARE_TEXT);
    ctx.font = `700 ${size}px ${SHARE_TEXT}`;
    ctx.fillText(line, left, cursor);
    cursor += size + 8;
  }
  const shown = bet.legs.length > 6 ? bet.legs.slice(0, 5) : bet.legs;
  const extra = bet.legs.length - shown.length;
  const bottom = y + h - 118;
  const noted = shown.some((leg) => leg.form);
  const slots = Math.max(shown.length + (extra ? 1 : 0), 1);
  const rowH = Math.min(noted ? 98 : 76, Math.max(noted ? 72 : 40, (bottom - cursor) / slots));
  shown.forEach((leg) => {
    ctx.strokeStyle = "rgba(61,255,110,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, cursor);
    ctx.lineTo(right, cursor);
    ctx.stroke();
    const parts = splitLeg(leg.label);
    ctx.fillStyle = "#ffffff";
    const nameSize = fitText(ctx, parts.name.toUpperCase(), right - left - 86, 20, SHARE_FONT);
    ctx.fillText(parts.name.toUpperCase(), left, cursor + 6);
    let under = cursor + 8 + nameSize;
    if (parts.prop) {
      ctx.fillStyle = "#d5deea";
      const propSize = fitText(ctx, parts.prop.toUpperCase(), right - left - 86, 15, SHARE_TEXT);
      ctx.font = `600 ${propSize}px ${SHARE_TEXT}`;
      ctx.fillText(parts.prop.toUpperCase(), left, under);
      under += propSize + 3;
    }
    if (leg.form) {
      const note = leg.form.toUpperCase();
      ctx.fillStyle = "#b7ffc9";
      const noteSize = fitText(ctx, note, right - left, 15, SHARE_TEXT);
      ctx.font = `600 ${noteSize}px ${SHARE_TEXT}`;
      ctx.fillText(note, left, under);
    }
    if (leg.pct) {
      ctx.fillStyle = "#3dff6e";
      ctx.font = `700 24px ${SHARE_FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(`${leg.pct}%`, right, cursor + 10);
      ctx.textAlign = "left";
    }
    cursor += rowH;
  });
  if (extra) {
    ctx.fillStyle = "#d5deea";
    ctx.font = `600 16px ${SHARE_TEXT}`;
    ctx.fillText(`+ ${extra} MORE LEGS`, left, cursor);
  }
  const barY = y + h - 102;
  ctx.fillStyle = "#3dff6e";
  ctx.fillRect(x + 10, barY, w - 20, 44);
  ctx.fillStyle = "#07131a";
  ctx.font = `700 24px ${SHARE_FONT}`;
  ctx.fillText(`${bet.legs.length} LEG PARLAY`, left, barY + 8);
  ctx.textAlign = "right";
  if (bet.pct) ctx.fillText(`${bet.pct}%`, right, barY + 8);
  ctx.textAlign = "left";
  ctx.fillStyle = "#3dff6e";
  ctx.font = `700 18px ${SHARE_FONT}`;
  const win = bet.profit != null ? `$5 BET WOULD WIN $${Number(bet.profit).toFixed(2)}` : "21+";
  ctx.fillText(win, left, barY + 50);
  ctx.font = `600 13px ${SHARE_TEXT}`;
  ctx.fillStyle = "#d5deea";
  ctx.fillText("21+   PARLAYOFTHEDAY.COM", left, barY + 72);
}

function drawFound(ctx, bet) {
  ctx.save();
  ctx.translate(490, 850);
  ctx.rotate(-0.22);
  ctx.fillStyle = "#f3e4ce";
  ctx.fillRect(-155, -132, 320, 247);
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "top";
  const hand = "'Bradley Hand', 'Marker Felt', cursive";
  const wide = 290;
  ctx.font = `700 24px ${hand}`;
  ctx.fillText("FOUND", -140, -90);
  ctx.font = `${fitText(ctx, bet.found || "Just now", wide, 18, hand)}px ${hand}`;
  ctx.fillText(bet.found || "Just now", -140, -60);
  ctx.font = `${fitText(ctx, "Prices can change.", wide, 18, hand)}px ${hand}`;
  ctx.fillText("Prices can change.", -140, -36);
  const lines = bet.why || [];
  if (lines.length) {
    ctx.font = `700 24px ${hand}`;
    ctx.fillText("WHY", -140, -2);
    lines.forEach((line, index) => {
      ctx.font = `${fitText(ctx, line, wide, 18, hand)}px ${hand}`;
      ctx.fillText(line, -140, 28 + index * 24);
    });
  }
  ctx.restore();
}
function coverNfl(ctx, image) {
  ctx.drawImage(image, 152, 318, 52, 58, 2, 294, 116, 118);
}
async function drawShare() {
  const select = document.getElementById("share-card-bet");
  const canvas = document.getElementById("share-card-canvas");
  const note = document.getElementById("share-card-note");
  const chosen = shareChoices.find((row) => row.key === (select && select.value));
  if (!canvas || !chosen) return;
  let image;
  try {
    image = await loadTemplate();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (error) {
    if (note) note.textContent = "The share template did not load.";
    return;
  }
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  fitShareCanvas(canvas);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  coverNfl(ctx, image);
  drawBoard(ctx, chosen.card);
  drawFound(ctx, chosen.card);
  canvas.hidden = false;
  const copy = document.getElementById("share-card-download");
  if (copy) { copy.hidden = false; copy.textContent = "Copy"; }
  if (note) note.textContent = "Copy the image, then paste it into a post.";
}

function fitShareCanvas(canvas) {
  const pane = document.getElementById("admin-card");
  if (pane) { pane.style.maxWidth = "100%"; pane.style.minWidth = "0"; pane.style.overflow = "hidden"; }
  const pick = document.getElementById("share-card-bet");
  if (pick) { pick.style.maxWidth = "100%"; pick.style.minWidth = "0"; }
  canvas.style.width = "0px";
  canvas.style.maxWidth = "100%";
  canvas.style.minWidth = "0";
  const wide = Math.max(220, (pane && pane.clientWidth) || ((document.documentElement.clientWidth || window.innerWidth) - 48));
  canvas.style.width = `${wide}px`;
  canvas.style.height = `${Math.round(wide * canvas.height / canvas.width)}px`;
  canvas.style.aspectRatio = "auto";
  canvas.style.display = "block";
  canvas.style.boxSizing = "border-box";
  canvas.style.borderRadius = "12px";
  canvas.style.marginTop = "0.8rem";
}

async function copyShare() {
  const canvas = document.getElementById("share-card-canvas");
  const note = document.getElementById("share-card-note");
  const button = document.getElementById("share-card-download");
  if (!canvas || canvas.hidden) return;
  window.focus();
  try {
    const item = new ClipboardItem({
      "image/png": new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png");
      }),
    });
    await navigator.clipboard.write([item]);
    if (button) button.textContent = "Copied";
    if (note) note.textContent = "Copied. Paste it into a post.";
  } catch (error) {
    if (note) note.textContent = "The browser did not copy the image. Click Copy again.";
  }
}

function bindShareCard() {
  const go = document.getElementById("share-card-go");
  const download = document.getElementById("share-card-download");
  const select = document.getElementById("share-card-bet");
  if (go) go.addEventListener("click", () => { drawShare(); });
  if (download) download.addEventListener("click", () => { copyShare(); });
  if (select) select.addEventListener("change", () => { drawShare(); });
  window.addEventListener("resize", () => {
    const canvas = document.getElementById("share-card-canvas");
    if (canvas && !canvas.hidden && canvas.width) fitShareCanvas(canvas);
  });
}

const posterMark = {};

function posterText(ids, boxId, show) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });
  const box = document.getElementById(boxId);
  if (box) box.classList.toggle("open-share", !show);
  if (boxId === "week") {
    const intro = document.getElementById("week-intro");
    if (intro) intro.hidden = !show;
  }
}

async function paintPoster(key, imgId, card, kicker, label, textIds, boxId) {
  const img = document.getElementById(imgId);
  if (!img) return;
  if (!card || !(card.legs || []).length) {
    img.hidden = true;
    img.style.display = "none";
    posterText(textIds, boxId, true);
    return;
  }
  const bet = shareFrom(card, kicker, label);
  const mark = `${bet.legs.map((leg) => `${leg.label}|${leg.form || ""}`).join("|")}|${card.american || ""}|4`;
  if (posterMark[key] === mark && img.getAttribute("src")) {
    img.hidden = false;
    img.style.display = "block";
    posterText(textIds, boxId, false);
    if (window.fitPoster) window.fitPoster();
    return;
  }
  try {
    const image = await loadTemplate();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    coverNfl(ctx, image);
    drawBoard(ctx, bet);
    drawFound(ctx, bet);
    img.src = canvas.toDataURL("image/jpeg", 0.82);
    img.hidden = false;
    img.style.display = "block";
    posterMark[key] = mark;
    posterText(textIds, boxId, false);
    if (window.fitPoster) window.fitPoster();
  } catch (error) {
    posterText(textIds, boxId, true);
  }
}
const DAY_TEXT = ["best-aim", "best-title", "best-when", "best-copy", "best-legs", "best-note"];
const WEEK_TEXT = ["week-aim", "week-title", "week-when", "week-copy", "week-legs", "week-note"];

function paintDayShare(board) {
  paintPoster("day", "day-share", board && board.band, "−150 TO +100", "−150 to +100 window", DAY_TEXT, "best");
}

function paintWeekShare(board) {
  paintPoster("week", "week-share", board && board.weekThree, "3 LEGS NEAR −200", "3 legs, different days, near −200", WEEK_TEXT, "week");
}

window.paintDayShare = paintDayShare;
window.paintWeekShare = paintWeekShare;
window.fillShareCards = fillShareCards;
bindShareCard();
