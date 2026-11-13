/** The bet card: once a leg's game starts, mark the game live and show how each leg and the whole bet are tracking. */

let trayLive = { at: 0, games: [] }, trayLiveJob = null;

function trayLiveLoad() {
  if (trayLiveJob || typeof parlayLeg === "undefined" || Date.now() - trayLive.at < 20000) return;
  const saved = typeof saveList === "function" ? saveList().flatMap((row) => row.legs || []) : [];
  const now = Date.now(), on = [...parlayLeg.values(), ...saved].some((bet) => { const at = Date.parse(bet.kickoff || ""); return Number.isFinite(at) && at < now + 300000 && at > now - 8 * 3600000; });
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
    head.querySelectorAll("i.gm[data-game]").forEach((chip) => {
      const game = found.get(chip.dataset.game);
      if (!game) {
        const kick = legs.filter((bet) => gameShort(bet.match) === chip.dataset.game).map((bet) => bet.kickoff).filter((at) => Date.parse(at || "") > Date.now()).sort()[0];
        if (!kick || typeof gameUntilPaint !== "function") return;
        const soon = document.createElement("i");
        soon.className = "tray-soon find-until";
        soon.dataset.kick = kick;
        gameUntilPaint(soon);
        chip.after(soon);
        return;
      }
      const live = document.createElement("i");
      live.className = `tray-live${game.final ? " done" : ""}`;
      live.textContent = game.final ? "Final" : `Live · ${game.clock}`;
      chip.after(live);
    });
    if (!sum || !sum.parts.length) return;
    const tally = document.createElement("i");
    tally.className = `tray-sum${sum.level ? ` pace-${sum.level}` : ""}`;
    tally.textContent = sum.parts.join(" · ");
    head.append(tally);
  });
}

if (typeof paintParlay === "function") {
  const paintParlayLive = paintParlay;
  paintParlay = function () { paintParlayLive.apply(this, arguments); trayLivePaint(); trayLiveLoad(); };
}
setInterval(trayLiveLoad, 20000);
setTimeout(trayLiveLoad, 1500);
