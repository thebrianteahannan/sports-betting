/** How's My Bet. Paste a ticket and the site names the strategy. */

function paintHow() {
  window.asking = true;
  if (window.goFull) goFull();
  if (window.birdQuiet) birdQuiet();
  const desk = document.getElementById("desk");
  if (!desk || !desk.classList.contains("tv-full")) { window.asking = false; if (window.birdGreet) birdGreet(); return; }
  if (window.tvPush) tvPush();
  desk.classList.remove("bird-on", "solo", "dug");
  window.recOpen = false;
  const guide = document.getElementById("bird-guide");
  if (guide) guide.hidden = true;
  const row = document.getElementById("desk-glass-in");
  if (!row) return;
  document.querySelectorAll(".rec-board").forEach((node) => node.remove());
  const board = document.createElement("div");
  board.className = "rec-board how-board";
  board.dataset.page = "how";
  board.innerHTML = `<h2>How's my bet.</h2><div id="how-paste" contenteditable="true" role="textbox" tabindex="0" inputmode="none" spellcheck="false" aria-label="Paste a screenshot of the bet"></div><p class="pick-save"><button type="button" class="ghost" id="how-clip">Paste from clipboard</button></p><p class="quiet" id="how-note"></p><input id="how-file" type="file" accept="image/*" hidden>`;
  board.addEventListener("click", (event) => {
    if (event.target.closest("#how-clip")) howsClip();
  });
  const paste = board.querySelector("#how-paste");
  paste.addEventListener("paste", (event) => {
    const files = howsFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    howsSend(files[0]);
  });
  paste.addEventListener("input", () => {
    const imgs = [...paste.querySelectorAll("img")];
    paste.textContent = "";
    if (imgs.length) howsFrom(imgs);
  });
  paste.addEventListener("keydown", (event) => {
    if (!event.metaKey && !event.ctrlKey) event.preventDefault();
  });
  board.querySelector("#how-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) howsSend(file);
  });
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  row.append(board);
  row.scrollTop = 0;
  if (!window.howsBound) {
    window.howsBound = true;
    window.addEventListener("paste", (event) => {
      const box = document.querySelector(".how-board");
      if (!box || (event.target.closest && event.target.closest("#how-paste, input, textarea"))) return;
      const files = howsFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      howsSend(files[0]);
    });
  }
}

function howsFiles(cd) {
  const fromItems = [];
  for (const item of [...((cd && cd.items) || [])]) {
    if (String(item.type || "").startsWith("image/")) { const blob = item.getAsFile(); if (blob) fromItems.push(blob); }
  }
  return fromItems.length ? fromItems : [...((cd && cd.files) || [])].filter((file) => String(file.type || "").startsWith("image/"));
}

function howsFit(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That screenshot could not be read."));
    reader.onload = () => {
      const raw = String(reader.result || "");
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1100 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
        const pen = canvas.getContext("2d");
        if (!pen) { resolve(raw); return; }
        pen.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

function howsFrom(imgs) {
  Promise.all(imgs.map((img) => fetch(img.src).then((response) => response.blob()).catch(() => null))).then((blobs) => {
    const blob = blobs.find((item) => item && String(item.type || "").startsWith("image/"));
    if (blob) howsSend(new File([blob], "screenshot.png", { type: blob.type || "image/png" }));
  });
}

function howsClip() {
  const note = document.getElementById("how-note");
  const paste = document.getElementById("how-paste");
  const read = navigator.clipboard && navigator.clipboard.read;
  if (!read) { if (paste) paste.focus(); if (note) note.textContent = "Tap the box, then paste the screenshot."; return; }
  read().then((items) => {
    for (const item of items) {
      const type = (item.types || []).find((name) => String(name).startsWith("image/"));
      if (!type) continue;
      item.getType(type).then((blob) => howsSend(new File([blob], "screenshot.png", { type: blob.type || type })));
      return;
    }
    if (paste) paste.focus();
    if (note) note.textContent = "Tap the box, then paste the screenshot.";
  }).catch(() => { if (paste) paste.focus(); if (note) note.textContent = "Tap the box, then paste the screenshot."; });
}

function howsWait(board) {
  const old = board.querySelector(".how-result");
  if (old) old.remove();
  const box = document.createElement("div");
  box.className = "how-result how-load";
  box.innerHTML = `<span><img src="/scene/parrot-head.webp?v=1" alt=""></span><p>Reading the bet.</p>`;
  board.append(box);
}

async function howsSend(file) {
  const board = document.querySelector(".how-board");
  const note = document.getElementById("how-note");
  if (!board || !file) return;
  if (note) note.textContent = "";
  howsWait(board);
  try {
    const image = await howsFit(file);
    const response = await fetch("/api/how", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "I could not read a bet on that screenshot.");
    if (board.isConnected) howsShow(board, payload, image);
  } catch (error) {
    const wait = board.querySelector(".how-load");
    if (wait) wait.remove();
    if (note) note.textContent = error.message;
  }
}

function howsShow(board, data, image) {
  const old = board.querySelector(".how-result");
  if (old) old.remove();
  const box = document.createElement("div");
  box.className = "how-result";
  if (image) {
    const shot = document.createElement("img");
    shot.className = "slip-shot";
    shot.alt = "The bet you pasted";
    shot.src = image;
    box.append(shot);
  }
  const groups = Array.isArray(data.bets) && data.bets.length ? data.bets : [data];
  if (groups.length > 1) {
    const head = document.createElement("h3");
    head.textContent = data.kind || `${groups.length} bets`;
    box.append(head);
  }
  groups.forEach((group) => {
    const title = document.createElement("h3");
    title.textContent = group.kind || "The bet";
    const history = document.createElement("p");
    history.className = "rec-history";
    history.innerHTML = `<i class="rec-pay">${esc(group.verdict || "")}</i>`;
    box.append(title, history);
    (group.strategies || []).forEach((row) => {
      const bet = document.createElement("div");
      bet.className = "rec-bet";
      const extra = row.line && row.line !== group.verdict ? `<p class="rec-gist"><i class="prop">${esc(row.line)}</i></p>` : "";
      bet.innerHTML = `<b><i class="px">${esc(row.no)}</i> <i class="pct">${esc(row.name)}</i></b>${extra}`;
      box.append(bet);
    });
    const legs = group.legs || [];
    legs.forEach((leg) => {
      const bet = document.createElement("div");
      bet.className = "rec-bet";
      const head = [leg.player, leg.market === "anytime touchdown" ? "" : leg.side, leg.line, leg.market].filter((bit) => bit != null && bit !== "").join(" ");
      const where = [leg.match, legs.length === 1 || leg.stake ? leg.stake : ""].filter(Boolean).join(". ");
      bet.innerHTML = `<b><i class="px">${esc(leg.odds || "Single")}</i> <i class="pct">${esc(head)}</i></b>${where ? `<p class="rec-gist"><i class="prop">${esc(where)}</i></p>` : ""}`;
      box.append(bet);
    });
    if (legs.length === 1 && legs[0].player && /over|under/.test(String(legs[0].side || ""))) howsWhy(history, legs[0]);
  });
  board.append(box);
}

function howsWhy(history, leg) {
  const text = [leg.player, leg.line, leg.market].filter((bit) => bit != null && bit !== "").join(" ");
  const odds = Number(String(leg.odds || "").replace(/[−–]/g, "-").replace(/[^\d.+-]/g, ""));
  fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "why", name: leg.player, text, bet: { label: text, market: leg.market || "", odds }, odds }) })
    .then((response) => response.json())
    .then((data) => { if (history.isConnected && data && data.why) history.innerHTML = `<i class="rec-pay">${esc(data.why)}</i>`; })
    .catch(() => {});
}

window.paintHow = paintHow;
