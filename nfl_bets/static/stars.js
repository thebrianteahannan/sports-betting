function legState(row) {
  if (row.result === "won" || row.result === "lost" || row.result === "push") return row.result;
  const have = Number(row.have);
  const line = Number(row.line);
  if (Number.isFinite(have) && Number.isFinite(line) && have >= line) return "won";
  return "wait";
}

function starHtml(rating, card, group, id) {
  const n = Number(rating) || 0;
  const attrs = id
    ? ` data-good="${esc(id)}"`
    : ` data-good-card="${esc(card)}"${group ? ` data-group="${esc(group)}"` : ""}`;
  const stars = [1, 2, 3, 4, 5].map((value) => (
    `<button type="button" class="star${value <= n ? " on" : ""}" data-stars="${value}" aria-label="${value} star${value > 1 ? "s" : ""}">★</button>`
  )).join("");
  return `<span class="stars"${attrs}>${stars}</span>`;
}
