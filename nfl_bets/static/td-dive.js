function paintDive(card, pick) {
  const why = document.createElement("p");
  why.className = "find-why";
  why.textContent = pick.summary || pick.line || "";
  why.addEventListener("click", (event) => event.stopPropagation());
  card.append(why);
  (pick.parts || []).forEach((part) => {
    const block = document.createElement("div");
    block.className = "td-part";
    const title = document.createElement("b");
    title.textContent = part.title || "";
    const text = document.createElement("p");
    text.textContent = part.text || "";
    block.append(title, text);
    if (part.proof) {
      const proof = document.createElement("p");
      proof.className = "td-proof";
      proof.textContent = part.proof;
      block.append(proof);
    }
    block.addEventListener("click", (event) => event.stopPropagation());
    card.append(block);
  });
}
window.paintDive = paintDive;
