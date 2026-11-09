// Team colors on the find board. One team paints its colors; a game with both sides showing mixes the two, away on the left.
const CLUBS = [
  { test: /\bbills\b/i, c1: "#00338D", c2: "#C60C30", ink2: "#ffffff", bg1: "#0a2463", bg2: "#061634", card: "rgba(10, 36, 99, 0.55)", edge: "#2f5fd0", line: "#1d3570", hot: "#ff5c73", cool: "#8fb1ff", input: "#071c4a" },
  { test: /\bvikings\b/i, c1: "#4F2683", c2: "#FFC62F", ink2: "#1a0f2e", bg1: "#3b1d66", bg2: "#170b2b", card: "rgba(79, 38, 131, 0.45)", edge: "#8a5fd1", line: "#3a2160", hot: "#FFC62F", cool: "#cdb8f2", input: "#24113f" },
];
const CLUB_VARS = ["page", "top", "chip", "chip-ink", "pick", "pick-ink", "pick-shadow", "card", "panel", "edge", "line", "hot", "cool", "input"];

function clubPalette(name, sport) {
  const hand = CLUBS.find((club) => club.test.test(String(name || "")));
  if (hand || typeof clubPair !== "function") return hand || null;
  const pair = clubPair(sport, name);
  return pair ? clubBuild(pair) : null;
}

function clubBuild([one, two]) {
  const rgb = (hex) => [0, 2, 4].map((at) => parseInt(hex.slice(1 + at, 3 + at), 16));
  const glow = (hex) => { const [r, g, b] = rgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const mix = (hex, to, t) => `#${rgb(hex).map((n, at) => Math.round(n + (rgb(to)[at] - n) * t).toString(16).padStart(2, "0")).join("")}`;
  const [dark, lite] = glow(one) <= glow(two) ? [one, two] : [two, one];
  const pale = glow(dark) < 30;
  const c1 = pale ? mix(lite, "#000000", 0.45) : dark;
  const [r, g, b] = rgb(pale ? mix(lite, "#000000", 0.6) : dark);
  return {
    c1, c2: lite, ink2: glow(lite) > 150 ? "#111111" : "#ffffff",
    bg1: mix(dark, "#000000", 0.3), bg2: mix(dark, "#000000", 0.62), card: `rgba(${r}, ${g}, ${b}, 0.5)`,
    edge: mix(c1, "#ffffff", 0.25), line: pale ? mix(lite, "#000000", 0.7) : mix(dark, "#000000", 0.45),
    hot: glow(lite) < 110 ? mix(lite, "#ffffff", 0.35) : lite, cool: mix(c1, "#ffffff", 0.55), input: mix(dark, "#000000", 0.5),
  };
}

function clubTheme(list, person) {
  const board = list && list.closest(".find-board");
  if (!board || !person) return;
  const bare = plainName(person.name).replace(/ (jr|sr|ii|iii|iv|v)$/, "");
  board.clubSport = person.sport || ((person.bets || []).find((bet) => bet.sport) || {}).sport || "";
  clubBase(board, [person.kind === "team" ? person.name : clubOf.get(bare) || person.team || ""]);
}

function clubGame(holder, game) {
  const board = holder && holder.closest(".find-board");
  if (!board || !game || !game.match) return;
  board.clubSport = game.sport || "";
  clubBase(board, game.match.includes(" @ ") ? game.match.split(" @ ") : game.match.split(" v ").reverse());
}

function clubBase(board, names) {
  board.clubNames = names.map((name) => String(name || "").replace(/\s*\([^)]*\)/g, "").trim()).filter(Boolean);
  if (!board.dataset.club) {
    board.dataset.club = "1";
    board.addEventListener("click", (event) => { if (event.target.closest(".find-side-go")) clubPaint(board); });
    const field = board.querySelector("label.find input");
    if (field) field.addEventListener("input", () => { board.clubNames = []; clubPaint(board); });
  }
  clubPaint(board);
}

function clubPaint(board) {
  const side = board.querySelector(".find-side-go.on");
  const names = side ? [side.textContent.split(",")[0]] : board.clubNames || [];
  const [a, b] = names.map((name) => clubPalette(name, board.clubSport)).filter(Boolean);
  const glass = board.closest("#desk-glass");
  if (!a) { board.classList.remove("club-on"); CLUB_VARS.forEach((key) => board.style.removeProperty(`--club-${key}`)); if (glass) glass.style.removeProperty("--club-page"); return; }
  const two = b && b !== a;
  const mix = (key) => (two ? `linear-gradient(90deg, ${a[key]}, ${b[key]})` : a[key]);
  const vars = {
    page: mix("bg2"), top: two ? mix("bg1") : `linear-gradient(180deg, ${a.bg1} 0%, ${a.bg2} 22rem)`,
    chip: mix("c1"), "chip-ink": "#ffffff", pick: mix("c2"), "pick-ink": two ? "#ffffff" : a.ink2, "pick-shadow": two ? "0 1px 2px rgba(0, 0, 0, 0.7)" : "none",
    card: mix("card"), panel: mix("card"), edge: a.edge, line: a.line, hot: a.hot, cool: (b || a).cool, input: a.input,
  };
  CLUB_VARS.forEach((key) => board.style.setProperty(`--club-${key}`, vars[key]));
  if (glass) glass.style.setProperty("--club-page", vars.page);
  board.classList.add("club-on");
}
