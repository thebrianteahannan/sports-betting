// Tapping a filter field on a player card opens a list of choices. The small keyboard icon lets the person type instead.
const bandPickChoices = {
  odds: [["-500", "-500"], ["-300", "-300"], ["-200", "-200"], ["-150", "-150"], ["-110", "-110"], ["+100", "100"], ["+150", "150"], ["+200", "200"], ["+300", "300"]],
  pct: [50, 60, 70, 75, 80, 85, 90, 95].map((n) => [`${n}%`, String(n)]),
  cash: [1, 2, 3, 5, 10, 15, 25, 50].map((n) => [`$${n}`, String(n)]),
};

function bandPickProps(input) {
  const kinds = input.closest(".find-kinds");
  const list = kinds && kinds.parentElement;
  if (!list) return [];
  const picked = kinds.querySelector(".find-names button.on");
  const kind = picked ? picked.dataset.kind : "";
  const seen = new Map();
  list.querySelectorAll(":scope > .rec-bet").forEach((row) => {
    if (kind && (row.dataset.kind || "Other") !== kind) return;
    const prop = row.querySelector(".rec-gist .prop");
    const text = prop ? prop.textContent.trim() : "";
    if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
  });
  const num = (text) => Number((text.match(/\d+(?:\.\d+)?/) || [0])[0]);
  const stat = (text) => text.replace(/[\d.+]+/g, "").replace(/\b(over|under)\b/gi, "").trim().toLowerCase();
  return [...seen.values()].sort((a, b) => stat(a).localeCompare(stat(b)) || num(a) - num(b)).slice(0, 80).map((text) => [text, text]);
}

function bandPickClose() {
  document.querySelectorAll(".find-band .band-pick").forEach((menu) => menu.remove());
}

function bandPickOpen(input) {
  bandPickClose();
  const key = input.dataset.key;
  const choices = key === "prop" ? bandPickProps(input) : bandPickChoices[key] || [];
  const menu = document.createElement("div");
  menu.className = key === "prop" ? "band-pick band-pick-list" : "band-pick";
  [["Any", ""], ...choices].forEach(([text, value]) => {
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = text;
    go.classList.toggle("on", input.value === value);
    go.addEventListener("click", (event) => {
      event.preventDefault();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      bandPickClose();
    });
    menu.append(go);
  });
  input.closest("label").append(menu);
  const over = menu.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
  if (over > 0) menu.style.left = `${-over}px`;
}

function bandPick(band) {
  band.querySelectorAll("input[data-key]").forEach((input) => {
    if (input.dataset.pick) return;
    input.dataset.pick = "1";
    input.readOnly = true;
    const type = document.createElement("button");
    type.type = "button";
    type.className = "band-type";
    type.title = "Type it";
    type.setAttribute("aria-label", "Type it");
    type.addEventListener("click", (event) => {
      event.preventDefault();
      bandPickClose();
      input.readOnly = false;
      input.focus();
    });
    input.addEventListener("blur", () => { input.readOnly = true; });
    input.addEventListener("click", () => {
      if (!input.readOnly) return;
      if (input.closest("label").querySelector(".band-pick")) bandPickClose();
      else bandPickOpen(input);
    });
    input.after(type);
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest || !event.target.closest(".find-band label")) bandPickClose();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") bandPickClose(); });
