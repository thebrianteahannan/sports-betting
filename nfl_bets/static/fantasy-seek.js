/** Type a player. Tag each league where nobody owns him. */

let fantasySeek = { user: "", q: "", id: "", player: null, free: [], matches: [], note: "", typedAt: 0, timer: 0, open: false };
let fantasySeekToken = 0;

function fantasySeekMount() {
  if (fantasySeek.user && fantasySeek.user !== fantasyState.user) {
    fantasySeek = { user: "", q: "", id: "", player: null, free: [], matches: [], note: "", typedAt: 0, timer: 0, open: false };
  }
  fantasySeek.user = fantasyState.user;
  const wrap = document.createElement("div");
  wrap.className = "fantasy-seek";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "fantasy-seek-toggle";
  toggle.textContent = "Find what leagues a player is available";
  const body = document.createElement("div");
  body.className = "fantasy-seek-body";
  body.hidden = !fantasySeek.open;
  toggle.setAttribute("aria-expanded", fantasySeek.open ? "true" : "false");
  const field = document.createElement("label");
  field.className = "fantasy-field";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Type a name";
  input.autocomplete = "off";
  input.value = fantasySeek.q;
  input.addEventListener("input", () => {
    fantasySeek.q = input.value;
    fantasySeek.id = "";
    fantasySeek.typedAt = Date.now();
    clearTimeout(fantasySeek.timer);
    if (fantasySeek.q.trim().length < 2) {
      fantasySeek.player = null;
      fantasySeek.free = [];
      fantasySeek.matches = [];
      fantasySeek.note = "";
      fantasySeekShow();
      return;
    }
    fantasySeek.timer = setTimeout(fantasySeekRun, 320);
  });
  toggle.addEventListener("click", () => {
    fantasySeek.open = !fantasySeek.open;
    body.hidden = !fantasySeek.open;
    toggle.setAttribute("aria-expanded", fantasySeek.open ? "true" : "false");
    if (fantasySeek.open) input.focus();
  });
  field.append(input);
  const note = document.createElement("p");
  note.className = "fantasy-note";
  const picks = document.createElement("div");
  picks.className = "fantasy-seek-picks";
  body.append(field, note, picks);
  wrap.append(toggle, body);
  setTimeout(() => {
    fantasySeekShow();
    if (fantasySeek.open && Date.now() - fantasySeek.typedAt < 2000) {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
  }, 0);
  return wrap;
}

function fantasySeekShow() {
  const field = document.querySelector(".fantasy-board .fantasy-seek");
  if (!field) return;
  const note = field.querySelector(".fantasy-note");
  if (note) {
    note.textContent = fantasySeek.note || "";
    note.hidden = !fantasySeek.note;
  }
  const picks = field.querySelector(".fantasy-seek-picks");
  if (picks) {
    picks.replaceChildren();
    (fantasySeek.matches || []).forEach((row) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = [row.name, row.pos, row.team].filter(Boolean).join(" · ");
      btn.addEventListener("click", () => {
        fantasySeek.id = row.id;
        fantasySeek.typedAt = Date.now();
        fantasySeekRun();
      });
      picks.append(btn);
    });
  }
  const free = new Set(fantasySeek.free || []);
  document.querySelectorAll(".fantasy-board button.fantasy-league").forEach((btn) => {
    const old = btn.querySelector(".league-tag.free");
    if (old) old.remove();
    if (!free.has(btn.dataset.league)) return;
    let tags = btn.querySelector(".league-tags");
    if (!tags) {
      tags = document.createElement("span");
      tags.className = "league-tags";
      btn.append(tags);
    }
    const tag = document.createElement("i");
    tag.className = "league-tag free";
    tag.textContent = "Available";
    tags.append(tag);
  });
}

async function fantasySeekRun() {
  const token = ++fantasySeekToken;
  const q = fantasySeek.q.trim();
  const user = fantasyState.user;
  const id = fantasySeek.id;
  if (!user || q.length < 2) return;
  fantasySeek.note = "Looking up that name.";
  fantasySeek.matches = [];
  fantasySeekShow();
  try {
    const data = await fantasyPost("/api/fantasy/available", { user, name: q, id });
    if (token !== fantasySeekToken || fantasyState.user !== user || fantasySeek.q.trim() !== q) return;
    fantasySeek.matches = data.matches || [];
    fantasySeek.player = data.player || null;
    fantasySeek.free = (data.leagues || []).map((row) => row.league_id);
    if (fantasySeek.player) {
      const n = fantasySeek.free.length;
      const name = fantasySeek.player.name;
      fantasySeek.note = n ? `${name} is free in ${n} ${n === 1 ? "league" : "leagues"}.` : `${name} is rostered in every league.`;
      fantasySeek.matches = [];
    } else if (fantasySeek.matches.length) fantasySeek.note = "Which player?";
    else fantasySeek.note = "No player with that name.";
  } catch (error) {
    if (token !== fantasySeekToken) return;
    fantasySeek.player = null;
    fantasySeek.free = [];
    fantasySeek.matches = [];
    fantasySeek.note = String((error && error.message) || error);
  }
  fantasySeekShow();
}
