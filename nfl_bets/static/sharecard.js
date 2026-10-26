const SHARE_FONT = "Oswald, Impact, sans-serif";
const SHARE_TEXT = "Rajdhani, sans-serif";
const NAMED_BETS = [
  ["band", "−150 to +100 window", "−150 TO +100"],
  ["todayBet", "Highest chance parlay today", "HIGHEST CHANCE"],
  ["weekThree", "3 legs, different days, near −200", "3 LEGS NEAR −200"],
  ["weekFive", "5 legs, different days, near −200", "5 LEGS NEAR −200"],
  ["weekSafe", "3 legs, different days, near −350", "NEAR −350"],
  ["weekEven", "3 legs, different days, near −100", "NEAR −100"],
  ["chalk", "−400 to −700 legs, near −180", "NEAR −180"],
  ["four", "Four yardage legs near 85% each", "FOUR NEAR 85%"],
  ["plus", "Four yardage legs near +250", "FOUR NEAR +250"],
];

let shareTemplate = null;
let shareBits = null;
let shareTitleSize = 0;

function sharePct(value) {
  const raw = String(value ?? "").replace("%", "").trim();
  if (!raw) return "";
  const n = Number(raw);
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
    when: whenLine(card), found: foundLine(card), why: whyLines(card, kicker), legs, pct: sharePct(card.impliedPct), profit, serial: typeof betSerial === "function" ? betSerial(card) : "", strategyNo: typeof strategyNo === "function" ? strategyNo(card.card, card.card === "hits" && typeof hitsPart === "function" ? hitsPart(card) : "") : "",
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

function shareKicker(ticket, label) {
  const named = NAMED_BETS.find((row) => row[0] === (ticket && ticket.card));
  if (named) return named[2];
  if (ticket && ticket.card === "hits") return "WHICH STACK";
  return String(label || (ticket && ticket.title) || "PARLAY").toUpperCase();
}

function shareBox() {
  let box = document.getElementById("share-view");
  if (box) return box;
  box = document.createElement("section");
  box.id = "share-view";
  box.hidden = true;
  box.innerHTML = `<div id="share-stage"><img id="share-card-photo" alt="" width="959" height="1024" hidden></div><button type="button" id="share-back" aria-label="Back"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button><p id="share-card-debug"></p><p class="pick-save"><button type="button" id="share-card-download" hidden>Copy</button></p><p class="quiet" id="share-card-note"></p>`;
  (document.getElementById("desk") || document.body).append(box);
  const copy = box.querySelector("#share-card-download");
  if (copy) copy.addEventListener("click", () => { copyShare(); });
  const back = box.querySelector("#share-back");
  if (back) back.addEventListener("click", () => { shareBack(); });
  return box;
}

function shareTicket(button) {
  const id = Number(button.dataset.shareId);
  const kind = button.dataset.share;
  if (kind === "rec") {
    const row = (window.recTickets || [])[id];
    return row && row.ticket ? { ticket: row.ticket, label: row.name || row.ticket.title, kicker: shareKicker(row.ticket, row.name) } : null;
  }
  if (kind === "built") {
    const ticket = (window.builtPile || [])[id];
    return ticket ? { ticket, label: ticket.title, kicker: "BUILT BET" } : null;
  }
  const lists = { saved: window.builtTypes, rate: window.rateShare, picked: window.pickedShare };
  const row = ((lists[kind]) || [])[id];
  return row ? { saved: row } : null;
}

async function openShare(button) {
  const found = shareTicket(button);
  if (!found) return;
  const bet = found.saved ? savedShare(found.saved) : shareFrom(found.ticket, found.kicker || shareKicker(found.ticket, found.label), found.label);
  if (!bet.legs.length) return;
  await drawShare(bet);
}

function shareBack() {
  const box = document.getElementById("share-view");
  if (!box || box.hidden) return false;
  box.hidden = true;
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  return true;
}

function loadTemplate() {
  if (shareTemplate) return Promise.resolve(shareTemplate);
  shareTemplate = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("template"));
    image.src = "/share-template.jpg?v=6";
  });
  return shareTemplate;
}

function fitText(ctx, text, max, size, family) {
  let next = size;
  const wide = () => Math.max(ctx.measureText(text).width, text.length * next * 0.75);
  ctx.font = `600 ${next}px ${family}`;
  while (next > 10 && wide() > max) { next -= 1; ctx.font = `600 ${next}px ${family}`; }
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
  const titleSize = shareTitleSize = fitText(ctx, title, right - left, 40, SHARE_FONT);
  ctx.fillText(title, left, cursor);
  cursor += titleSize + 4;
  const mark = [bet.strategyNo, bet.serial].filter(Boolean).join("   ");
  if (mark) { ctx.fillStyle = "#f4f7fb"; ctx.font = `600 18px ${SHARE_FONT}`; ctx.fillText(mark, left, cursor); cursor += 24; }
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
    ctx.font = `600 ${gameSize}px ${SHARE_FONT}`;
    ctx.fillText(game, left, cursor);
    cursor += gameSize + 8;
  }
  if (bet.strategy) {
    ctx.fillStyle = "#3dff6e";
    const line = `STRATEGY: ${String(bet.strategy).toUpperCase()}`;
    const size = fitText(ctx, line, right - left, 18, SHARE_TEXT);
    ctx.font = `600 ${size}px ${SHARE_TEXT}`;
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
      ctx.font = `600 24px ${SHARE_FONT}`;
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
  const bar = `${bet.legs.length} LEG PARLAY`;
  ctx.font = `600 ${fitText(ctx, bar, right - left - 80, 24, SHARE_FONT)}px ${SHARE_FONT}`;
  ctx.fillText(bar, left, barY + 8);
  ctx.textAlign = "right";
  if (bet.pct) ctx.fillText(`${bet.pct}%`, right, barY + 8);
  ctx.textAlign = "left";
  ctx.fillStyle = "#3dff6e";
  ctx.font = `600 18px ${SHARE_FONT}`;
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
async function drawShare(bet) {
  const box = shareBox();
  const photo = document.getElementById("share-card-photo");
  const note = document.getElementById("share-card-note");
  if (!photo || !bet) return;
  box.hidden = false;
  box.scrollTop = 0;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  let image;
  try {
    image = await loadTemplate();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (error) {
    if (note) note.textContent = "The share template did not load.";
    return;
  }
  const board = document.createElement("canvas");
  board.width = 959;
  board.height = 1024;
  const ctx = board.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, 959, 1024);
  coverNfl(ctx, image);
  drawBoard(ctx, bet);
  drawFound(ctx, bet);
  shareBits = board;
  const edge = ctx.getImageData(Math.min(board.width - 1, 954), 24, 1, 1).data;
  photo.dataset.draw = `src ${image.naturalWidth} ${board.width} edge ${edge[0]},${edge[1]},${edge[2]} title ${shareTitleSize}`;
  photo.src = board.toDataURL("image/jpeg", 0.9);
  photo.hidden = false;
  const copy = document.getElementById("share-card-download");
  if (copy) { copy.hidden = false; copy.textContent = "Copy"; }
  if (note) note.textContent = "Copy the image, then paste it into a post.";
  shareFit();
  photo.onload = shareFit;
}

function shareFit() {
  const box = document.getElementById("share-view");
  const stage = document.getElementById("share-stage");
  const desk = document.getElementById("desk");
  const w = (desk && desk.clientWidth) || innerWidth;
  const h = (desk && desk.clientHeight) || innerHeight;
  const scale = Math.min(w / 959, h / 1024);
  if (box) { box.style.left = "0px"; box.style.top = "0px"; box.style.width = `${w}px`; box.style.height = `${h}px`; }
  if (stage) stage.style.transform = `translate(${(w - 959 * scale) / 2}px, ${(h - 1024 * scale) / 2}px) scale(${scale})`;
  shareDebug();
}

function shareDebug() {
  const photo = document.getElementById("share-card-photo");
  const box = document.getElementById("share-view");
  const desk = document.getElementById("desk");
  const line = document.getElementById("share-card-debug");
  const view = window.visualViewport;
  if (!line || !photo || !box) return;
  const p = photo.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const vw = view ? view.width : window.innerWidth;
  const off = view ? view.offsetLeft : 0;
  const clip = p.width > 2 && p.right > off + vw + 1;
  const fit = Math.min((desk ? desk.clientWidth : window.innerWidth) / 959, (desk ? desk.clientHeight : window.innerHeight) / 1024);
  line.textContent = [`v52 ${clip ? "CLIP" : "in"}`, `desk ${desk ? desk.clientWidth : 0} visual ${Math.round(vw)} tv ${fit.toFixed(3)}`, `window ${window.innerWidth} scroll ${document.documentElement.scrollWidth} screen ${window.screen.width}`, `pane ${Math.round(b.left)}-${Math.round(b.right)} photo ${Math.round(p.left)}-${Math.round(p.right)} nat ${photo.naturalWidth || 0} draw ${photo.dataset.draw || ""}`].join("\n");
  console.log(line.textContent);
}

async function copyShare() {
  const photo = document.getElementById("share-card-photo");
  const note = document.getElementById("share-card-note");
  const button = document.getElementById("share-card-download");
  if (!photo || photo.hidden || !shareBits) return;
  window.focus();
  try {
    const item = new ClipboardItem({
      "image/png": new Promise((resolve, reject) => {
        shareBits.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png");
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
  document.addEventListener("click", (event) => {
    const share = event.target.closest(".share-bet");
    if (!share) return;
    event.preventDefault();
    openShare(share);
  });
  const refit = () => { const box = document.getElementById("share-view"); if (box && !box.hidden) shareFit(); };
  window.addEventListener("resize", refit);
  if (window.visualViewport) visualViewport.addEventListener("resize", refit);
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
window.shareBack = shareBack;
bindShareCard();
