// A typed prop on the player filter: numbers match the line (250 finds 250+ and 250.5), words match the stat.
function propSeekField(band, run) {
  const label = document.createElement("label");
  label.className = "find find-seek";
  const span = document.createElement("span");
  span.textContent = "Prop";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "250 passing";
  input.autocomplete = "off";
  input.addEventListener("input", () => {
    const kinds = band.closest(".find-kinds");
    if (input.value.trim() && kinds) kinds.querySelectorAll(".find-names button.on").forEach((button) => { button.classList.remove("on"); button.setAttribute("aria-pressed", "false"); });
    clearTimeout(propSeekField.timer);
    propSeekField.timer = setTimeout(run, 200);
  });
  label.append(span, input);
  band.prepend(label);
  return input;
}

function propSeekHit(row, text) {
  const prop = row.querySelector(".rec-gist .prop");
  const words = `${prop ? prop.textContent : ""} ${row.dataset.market || ""}`.toLowerCase();
  const lines = words.match(/\d+(?:\.\d+)?/g) || [];
  return String(text).toLowerCase().split(/[\s,]+/).filter(Boolean).every((token) => {
    const bare = token.replace(/[+]$/, "");
    return /^\d+(?:\.\d*)?$/.test(bare) ? lines.some((line) => line.startsWith(bare)) : words.includes(token);
  });
}
