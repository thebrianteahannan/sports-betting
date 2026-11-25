/** The bet card: once a leg's game starts, mark the game live and show how each leg and the whole bet are tracking. */

let trayLive = { at: 0, games: [] }, trayLiveJob = null;

function trayKickoff(legs, gameCode) {
  const now = Date.now();
  const mine = (legs || []).filter((bet) => bet && (!gameCode || (typeof gameShort === "function" && gameShort(bet.match) === gameCode)));
  const future = (at) => { const ms = Date.parse(at || ""); return Number.isFinite(ms) && ms > now ? at : ""; };
  const direct = mine.map((bet) => future(bet.kickoff)).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  if (direct) return direct;
  const match = (mine.find((bet) => bet.match) || {}).match || "";
  if (!match) return "";
  const board = document.querySelector("#desk-glass-in .find-board") || document.querySelector(".find-board");
  const fromBoard = ((board && board.people) || []).flatMap((one) => one.bets || []).find((bet) => bet.match === match && future(bet.kickoff));
  if (fromBoard) return fromBoard.kickoff;
  const fromHome = (typeof homeGamesList !== "undefined" ? homeGamesList : []).find((game) => game.match === match && future(game.kickoff));
  if (fromHome) return fromHome.kickoff;
  const fromState = (((window.state && state.board && state.board.games) || []).find((game) => game.match === match && future(game.kickoff)));
  return (fromState && fromState.kickoff) || "";
}

function trayLiveLoad() {
  if (trayLiveJob || typeof parlayLeg === "undefined" || Date.now() - trayLive.at < 20000) return;
  const saved = typeof saveList === "function" ? saveList().flatMap((row) => row.legs || []) : [];
  const now = Date.now(), on = [...parlayLeg.values(), ...saved].some((bet) => { const at = Date.parse(bet.kickoff || trayKickoff([bet]) || ""); return Number.isFinite(at) && at < now + 300000 && at > now - 24 * 3600000; });
  if (!on) return;
  trayLiveJob = fetch("/api/live?all=1").then((res) => res.json()).then((data) => {
    trayLive = { at: Date.now(), games: [...(data.live || []), ...(data.done || [])] };
    trayLivePaint();
  }).catch(() => {}).finally(() => { trayLiveJob = null; });
}

function trayLivePaint() {
  if (typeof parlayLeg === "undefined") return;
  const games = trayLive.games, legs = [...parlayLeg.values()], found = new Map();
  document.querySelectorAll(".find-tray .tray-now, .find-tray .tray-live, .find-tray .tray-sum, .find-tray .tray-soon").forEach((node) => node.remove());
  document.querySelectorAll(".find-tray .find-chose").forEach((line) => {
    const hist = line.querySelector("button.find-leg-hist"), key = (hist && hist.dataset.key) || line.dataset.key, bet = key && parlayLeg.get(key), prop = line.querySelector("span i.prop");
    const game = bet && games.find((one) => liveMine(one, [bet]).length);
    if (!game || !prop) return;
    found.set(gameShort(bet.match), game);
    const read = liveLegState(game, liveLegRead(bet));
    if (!read.say) return;
    const tag = document.createElement("i");
    tag.className = `tray-now ${read.state || (read.level ? `pace-${read.level}` : "")}`;
    tag.textContent = read.say;
    if (read.tip) tag.title = read.tip;
    prop.after(tag);
  });
  const sum = found.size && legs.length > 1 && liveParlaySay(liveParlayCount(legs, games));
  document.querySelectorAll(".find-tray .find-ticket > b").forEach((head) => {
    const waiting = [];
    const chips = [...head.querySelectorAll("i.gm[data-game]")];
    chips.forEach((chip) => {
      const game = found.get(chip.dataset.game);
      if (!game) {
        const kick = trayKickoff(legs, chip.dataset.game);
        if (kick) waiting.push({ chip, kick });
        return;
      }
      const live = document.createElement("i");
      live.className = `tray-live${game.final ? " done" : ""}`;
      live.dataset.liveGame = game.id;
      live.setAttribute("role", "link");
      live.title = "Open this game on The Games";
      live.textContent = game.final ? "Final" : `Live · ${game.clock}`;
      chip.after(live);
    });
    if (!chips.length) {
      const kick = trayKickoff(legs);
      if (kick) waiting.push({ chip: head.querySelector("i.sg, i.pct, i.px") || head.firstChild, kick, append: true });
    }
    const next = waiting.map((row) => Date.parse(row.kick)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const soonest = waiting.find((row) => Date.parse(row.kick) === next);
    if (soonest) {
      legs.forEach((bet) => {
        if (bet.kickoff || !bet.match) return;
        if (soonest.chip && soonest.chip.dataset && soonest.chip.dataset.game && typeof gameShort === "function" && gameShort(bet.match) !== soonest.chip.dataset.game) return;
        bet.kickoff = soonest.kick;
      });
    }
    if (soonest && typeof gameUntilPaint === "function") {
      const soon = document.createElement("i");
      soon.className = "tray-soon find-until";
      soon.dataset.kick = soonest.kick;
      gameUntilPaint(soon);
      if (soonest.append || !soonest.chip || !soonest.chip.after) head.append(soon);
      else soonest.chip.after(soon);
    }
    if (!sum || !sum.parts.length) return;
    const tally = document.createElement("i");
    tally.className = `tray-sum${sum.level ? ` pace-${sum.level}` : ""}`;
    tally.textContent = sum.parts.join(" · ");
    head.append(tally);
  });
  const board = document.querySelector(".manage-board");
  if (trayLive.at && board && board.dataset.liveAt !== String(trayLive.at) && typeof manageRefresh === "function") manageRefresh();
}

if (typeof paintParlay === "function") {
  const paintParlayLive = paintParlay;
  paintParlay = function () { paintParlayLive.apply(this, arguments); trayLivePaint(); trayLiveLoad(); };
}
document.addEventListener("click", (event) => {
  const tag = event.target.closest && event.target.closest(".find-tray i.tray-live[data-live-game]");
  if (!tag) return;
  event.preventDefault();
  event.stopPropagation();
  window.location.href = `/live?${new URLSearchParams({ game: tag.dataset.liveGame })}`;
});
setInterval(trayLiveLoad, 20000);
setTimeout(trayLiveLoad, 1500);
