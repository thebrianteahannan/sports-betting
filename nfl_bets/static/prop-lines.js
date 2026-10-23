(function () {
  const sports = new Set(["NBA", "WNBA", "NFL", "MLB", "NHL"]);
  const memory = new Map();
  const queue = [];
  let running = false;

  function worth(node) {
    const sport = String(node.dataset.sport || "").toUpperCase();
    const blob = `${node.dataset.label || ""} ${node.dataset.market || ""}`.toLowerCase();
    if (!sports.has(sport) || node.querySelector("b em")) return false;
    if (/\b(1st|2nd|3rd|4th)\b|quarter|half|period|inning|yard reception|per game/.test(blob)) return false;
    return /(over|under)\s+\d|\d+(?:\.\d+)?\s*\+/.test(blob);
  }

  function key(node) {
    return `${node.dataset.sport}|${node.dataset.player}|${node.dataset.market}|${node.dataset.label}`;
  }

  function paint(node, row) {
    const name = node.querySelector("b");
    if (!row || !name || name.querySelector("em") || !node.isConnected) return;
    const avg = document.createElement("em");
    const games = document.createElement("em");
    avg.textContent = row.avg;
    games.textContent = row.games;
    name.append(avg, games);
  }

  function queueNode(node) {
    if (node.dataset.logged) return;
    node.dataset.logged = "1";
    const saved = memory.get(key(node));
    if (saved) { paint(node, saved); return; }
    queue.push(node);
    drain();
  }

  function scan() {
    document.querySelectorAll("span.leg-line").forEach((node) => {
      if (node.dataset.logged) return;
      if (!worth(node)) { node.dataset.logged = "skip"; return; }
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight + 240) queueNode(node);
    });
  }

  async function drain() {
    if (running || !queue.length) return;
    running = true;
    const batch = queue.splice(0, 4);
    const legs = batch.map((node) => ({
      player: node.dataset.player || "", sport: node.dataset.sport || "",
      market: node.dataset.market || "", label: node.dataset.label || "",
    }));
    try {
      const res = await fetch("/api/prop-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legs }) });
      const data = res.ok ? await res.json() : {};
      const lines = data.lines || [];
      batch.forEach((node, index) => {
        const row = lines[index];
        if (row) memory.set(key(node), row);
        paint(node, row);
      });
    } catch (err) { /* the card stays as it was */ }
    running = false;
    drain();
  }

  let timer = 0;
  function later() { clearTimeout(timer); timer = setTimeout(scan, 80); }
  document.addEventListener("click", later);
  document.addEventListener("scroll", later, true);
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  later();
}());
