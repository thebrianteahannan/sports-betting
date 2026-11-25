/** The close tab. Posted prices, then whether the close got shorter. */

function edgeProvePrice(odds) {
  const n = Number(odds);
  return Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : "";
}

function edgeProvePct(value) {
  const n = Number(value);
  if (!(n > 0 && n < 1)) return "";
  return `${(Math.round(n * 1000) / 10).toFixed(1).replace(/\.0$/, "")}%`;
}

function edgeProveImplied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || !n) return null;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
}

function edgeProveMoved(pile) {
  const avg = Number(pile && pile.avg);
  const points = Math.abs(avg).toFixed(1);
  return avg > 0.05 ? `shorter by ${points} points` : avg < -0.05 ? `longer by ${points} points` : "flat";
}

function edgeProveLine(name, pile) {
  if (!pile || !pile.closed) return `${name} are saved at post. The close is written in the last hour.`;
  return `${name}: ${pile.closed} have a close. The close was ${edgeProveMoved(pile)} on average. ${pile.beat} of ${pile.closed} beat the close.`;
}

function edgeProveOurs(pile) {
  if (!pile || !pile.closed) return "Our number is saved next to the posted price. The close is written in the last hour.";
  return `Our number was at least 3 points over the FanDuel price: ${pile.closed} have a close. The close was ${edgeProveMoved(pile)} on average. ${pile.beat} of ${pile.closed} beat the close.`;
}

function edgeProveCard(title, say, match) {
  const escHtml = (text) => (typeof esc === "function" ? esc(text) : String(text == null ? "" : text));
  return `<article class="golden-card"><div class="golden-card-top"><b>${escHtml(title || "")}</b></div><p class="golden-card-meta">${escHtml([say, match].filter(Boolean).join(" "))}</p></article>`;
}

function edgeProveHtml(data) {
  const escHtml = (text) => (typeof esc === "function" ? esc(text) : String(text == null ? "" : text));
  const tagged = data && data.tagged;
  const rest = data && data.rest;
  const ours = data && data.ours;
  const empty = (!tagged || !tagged.closed) && (!rest || !rest.closed) && (!ours || !ours.closed);
  const lead = empty
    ? `<p class="quiet">The posted price is saved. The close is written in the last hour.</p><p class="quiet">${escHtml(edgeProveOurs(ours))}</p>`
    : `<p class="quiet">${escHtml(edgeProveLine("Tagged prices", tagged))}</p><p class="quiet">${escHtml(edgeProveLine("The other recommended prices", rest))}</p><p class="quiet">${escHtml(edgeProveOurs(ours))}</p>`;
  const cards = (data && data.rows || []).map((row) => {
    const say = `Posted ${edgeProvePrice(row.postedOdds)}. Close ${edgeProvePrice(row.closeOdds)}.${row.beat ? " Beat the close." : ""}`;
    return edgeProveCard(row.label, say, row.match);
  }).join("");
  const oursCards = (data && data.oursRows || []).map((row) => {
    const say = `Our number ${edgeProvePct(row.model)}. FanDuel ${edgeProvePct(edgeProveImplied(row.postedOdds))}. Posted ${edgeProvePrice(row.postedOdds)}. Close ${edgeProvePrice(row.closeOdds)}.${row.recipe === "pull+matchup" ? " The matchup is in that number." : ""}${row.beat ? " Beat the close." : ""}`;
    return edgeProveCard(row.label, say, row.match);
  }).join("");
  return `${lead}${cards}${oursCards}`;
}

function edgeProveBody() {
  const box = document.createElement("div");
  box.className = "find-start-stats golden-tab";
  box.innerHTML = `<p class="quiet">The posted price is saved. The close is written in the last hour.</p>`;
  fetch("/api/edge-prove", { credentials: "same-origin" }).then((res) => res.json()).then((data) => {
    if (box.isConnected && data && !data.error) box.innerHTML = edgeProveHtml(data);
  }).catch(() => {});
  return [box];
}
