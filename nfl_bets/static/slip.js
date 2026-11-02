/** Current Bets on the profile. Paste a ticket, then watch each leg. */

function slipEsc(text) {
  return String(text || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

const slipOpen = new Set();

function paintSlips(payload) {
  const list = document.getElementById("slip-list");
  if (!list) return;
  const slips = (payload && payload.slips) || [];
  if (!slips.length) {
    list.innerHTML = "<p class=\"quiet\">No bets pasted yet.</p>";
    return;
  }
  list.innerHTML = slips.map((slip) => {
    const head = [slip.book, slip.odds].filter(Boolean).join(" · ");
    const clock = (slip.legs || []).map((leg) => leg.clock).find(Boolean);
    const legs = (slip.legs || []).map((leg) => {
      const spot = [leg.match, leg.when].filter(Boolean).join(" · ");
      const math = [leg.pace, Number.isFinite(Number(leg.chance)) ? `${leg.chance}% chance` : ""].filter(Boolean).join(". ");
      return `<p class="slip-leg ${slipEsc(leg.result || "open")}"><b>${slipEsc(leg.text || leg.player || "")}</b> ${slipEsc(leg.say || "")}${math ? `<i>${slipEsc(math)}</i>` : ""}${spot ? `<i>${slipEsc(spot)}</i>` : ""}</p>`;
    }).join("");
    const shot = slip.shot ? `<img class="slip-shot" alt="The bet you pasted" src="${slipEsc(slip.shot)}">` : "";
    const done = (slip.legs || []).length && (slip.legs || []).every((leg) => leg.result === "won" || leg.result === "lost" || leg.result === "push");
    const open = !done || slipOpen.has(slip.id);
    const tone = slip.line === "This bet missed." ? "lost" : slip.line === "This bet is reached." ? "won" : "";
    const summary = [((slip.legs || [])[0] || {}).match, slip.line, slip.odds].filter(Boolean).join(" · ");
    const fold = done ? `<button type="button" class="slip-fold ${tone}" data-slip-fold="${slipEsc(slip.id)}">${slipEsc(summary)}</button>` : "";
    const top = done ? "" : `<p class="slip-line">${slipEsc(slip.line || "")}</p>${head ? `<p class="quiet">${slipEsc(head)}</p>` : ""}`;
    const body = `<div class="slip-body"${open ? "" : " hidden"}>${shot}${top}${clock ? `<p class="quiet">${slipEsc(clock)}</p>` : ""}${legs}<p class="pick-save"><button type="button" class="ghost" data-slip-drop="${slipEsc(slip.id)}">Take this bet off</button></p></div>`;
    return `<article class="slip-card${open ? " open" : ""}" data-slip-id="${slipEsc(slip.id)}">${fold}${body}</article>`;
  }).join("");
}

async function loadSlips() {
  const response = await fetch("/api/slip", { cache: "no-store" });
  if (!response.ok) throw new Error("The check did not go through.");
  paintSlips(await response.json());
}

function checkNow() {
  const note = document.getElementById("slip-note");
  if (note) note.textContent = "Checking the bets.";
  return loadSlips().then(() => {
    if (note && note.textContent === "Checking the bets.") note.textContent = "Checked.";
    setTimeout(() => { if (note && note.textContent === "Checked.") note.textContent = ""; }, 2000);
  }).catch(() => { if (note) note.textContent = "The check did not go through."; });
}

function fitShot(file) {
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

async function sendSlip(file) {
  const note = document.getElementById("slip-note");
  if (note) note.textContent = "Reading the bet.";
  const image = await fitShot(file);
  const list = document.getElementById("slip-list");
  if (list && image) list.insertAdjacentHTML("afterbegin", `<article class="slip-card" id="slip-reading"><img class="slip-shot" alt="The bet you pasted" src="${image}"><p class="quiet">Reading the bet.</p></article>`);
  const response = await fetch("/api/slip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "I could not read a bet on that screenshot.");
  if (note) note.textContent = "";
  paintSlips(payload);
}

function showProfileTab(name) {
  const bets = name === "bets";
  const member = document.getElementById("activity");
  const box = document.getElementById("profile-bets");
  if (member) member.hidden = bets;
  if (box) box.hidden = !bets;
  document.querySelectorAll("#profile-tabs .tab").forEach((button) => {
    button.classList.toggle("on", button.dataset.profileTab === name);
  });
  if (bets) loadSlips().catch(() => {});
}

function clipFiles(cd) {
  const fromItems = [];
  for (const item of [...((cd && cd.items) || [])]) {
    if (String(item.type || "").startsWith("image/")) { const blob = item.getAsFile(); if (blob) fromItems.push(blob); }
  }
  return fromItems.length ? fromItems : [...((cd && cd.files) || [])].filter((file) => String(file.type || "").startsWith("image/"));
}

function takeShot(file) {
  if (!file) return;
  sendSlip(file).catch((error) => { const note = document.getElementById("slip-note"); if (note) note.textContent = error.message; });
}

function shotsFrom(imgs) {
  return Promise.all(imgs.map((img) => fetch(img.src).then((response) => response.blob()).catch(() => null))).then((blobs) => {
    const blob = blobs.find((item) => item && String(item.type || "").startsWith("image/"));
    if (blob) takeShot(new File([blob], "screenshot.png", { type: blob.type || "image/png" }));
  });
}

function bindSlips() {
  const tabs = document.getElementById("profile-tabs");
  const paste = document.getElementById("slip-paste");
  const file = document.getElementById("slip-file");
  const list = document.getElementById("slip-list");
  if (!tabs || tabs.dataset.bound) return;
  tabs.dataset.bound = "1";
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile-tab]");
    if (button) showProfileTab(button.dataset.profileTab);
  });
  if (paste) {
    paste.addEventListener("input", () => {
      const imgs = [...paste.querySelectorAll("img")];
      paste.textContent = "";
      if (imgs.length) shotsFrom(imgs);
    });
    paste.addEventListener("keydown", (event) => {
      if (!event.metaKey && !event.ctrlKey) event.preventDefault();
    });
    paste.addEventListener("paste", (event) => {
      const files = clipFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      takeShot(files[0]);
    });
  }
  window.addEventListener("paste", (event) => {
    const box = document.getElementById("profile-bets");
    if (!box || box.hidden || (event.target.closest && event.target.closest("#slip-paste, input, textarea"))) return;
    const files = clipFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    takeShot(files[0]);
  });
  const clip = document.getElementById("slip-clip");
  if (clip) clip.addEventListener("click", () => {
    const note = document.getElementById("slip-note");
    const read = navigator.clipboard && navigator.clipboard.read;
    if (!read) { if (paste) paste.focus(); if (note) note.textContent = "Tap the box, then paste the screenshot."; return; }
    read().then((items) => {
      for (const item of items) {
        const type = (item.types || []).find((name) => String(name).startsWith("image/"));
        if (!type) continue;
        item.getType(type).then((blob) => takeShot(new File([blob], "screenshot.png", { type: blob.type || type })));
        return;
      }
      if (paste) paste.focus();
      if (note) note.textContent = "Tap the box, then paste the screenshot.";
    }).catch(() => { if (paste) paste.focus(); if (note) note.textContent = "Tap the box, then paste the screenshot."; });
  });
  const check = document.getElementById("slip-check");
  if (check) check.addEventListener("click", () => checkNow());
  if (file) file.addEventListener("change", () => {
    const blob = file.files && file.files[0];
    file.value = "";
    takeShot(blob);
  });
  if (list) list.addEventListener("click", (event) => {
    const fold = event.target.closest("[data-slip-fold]");
    if (fold) {
      const card = fold.closest("article");
      const body = card && card.querySelector(".slip-body");
      if (!card || !body) return;
      const opening = body.hidden;
      body.hidden = !opening;
      card.classList.toggle("open", opening);
      if (opening) slipOpen.add(fold.dataset.slipFold); else slipOpen.delete(fold.dataset.slipFold);
      return;
    }
    const button = event.target.closest("[data-slip-drop]");
    if (!button) return;
    fetch("/api/slip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drop: true, id: button.dataset.slipDrop }) })
      .then((response) => response.json())
      .then((payload) => paintSlips(payload))
      .catch(() => {});
  });
  setInterval(() => {
    const box = document.getElementById("profile-bets");
    if (box && !box.hidden && document.visibilityState !== "hidden") loadSlips().catch(() => {});
  }, 15000);
}

bindSlips();
