/** Ask what a betting word or a price means. */

function paintTerms() {
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
  board.className = "rec-board find-board";
  board.dataset.page = "terms";
  board.innerHTML = "<h2>What does that mean?</h2>";
  const quiet = document.createElement("p");
  quiet.className = "quiet";
  quiet.textContent = "Type it the way someone said it.";
  const label = document.createElement("label");
  label.className = "find";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Type a term or a bet";
  input.autocomplete = "off";
  input.maxLength = 240;
  label.append(input);
  const hits = document.createElement("div");
  hits.className = "find-hits";
  const go = document.createElement("button");
  go.type = "button";
  go.textContent = "Ask";
  hits.append(go);
  const say = document.createElement("p");
  board.append(quiet, label, hits, say);
  const hold = document.getElementById("desk-hold");
  if (hold) [...row.children].forEach((node) => hold.append(node));
  row.append(board);
  row.scrollTop = 0;
  const run = () => {
    const q = input.value.trim();
    if (q.length < 2) return;
    say.textContent = "Looking that up.";
    fetch("/api/term", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) })
      .then((res) => res.json())
      .then((data) => { say.textContent = data.answer || data.error || "The bird could not think of that."; })
      .catch(() => { say.textContent = "The bird could not think of that."; });
  };
  go.addEventListener("click", run);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); run(); } });
  input.focus();
}

window.paintTerms = paintTerms;
