/** Short game names for the parlay head, like BUF@MIN. */

const GAME_SHORT = {};
[
  "ARI Arizona Cardinals|ATL Atlanta Falcons|BAL Baltimore Ravens|BUF Buffalo Bills|CAR Carolina Panthers|CHI Chicago Bears|CIN Cincinnati Bengals|CLE Cleveland Browns",
  "DAL Dallas Cowboys|DEN Denver Broncos|DET Detroit Lions|GB Green Bay Packers|HOU Houston Texans|IND Indianapolis Colts|JAX Jacksonville Jaguars|KC Kansas City Chiefs",
  "LV Las Vegas Raiders|LAC Los Angeles Chargers|LAR Los Angeles Rams|MIA Miami Dolphins|MIN Minnesota Vikings|NE New England Patriots|NO New Orleans Saints|NYG New York Giants",
  "NYJ New York Jets|PHI Philadelphia Eagles|PIT Pittsburgh Steelers|SF San Francisco 49ers|SEA Seattle Seahawks|TB Tampa Bay Buccaneers|TEN Tennessee Titans|WAS Washington Commanders",
  "ATL Atlanta Hawks|BOS Boston Celtics|BKN Brooklyn Nets|CHA Charlotte Hornets|CHI Chicago Bulls|CLE Cleveland Cavaliers|DAL Dallas Mavericks|DEN Denver Nuggets|DET Detroit Pistons",
  "GSW Golden State Warriors|HOU Houston Rockets|IND Indiana Pacers|LAC LA Clippers|LAC Los Angeles Clippers|LAL Los Angeles Lakers|MEM Memphis Grizzlies|MIA Miami Heat|MIL Milwaukee Bucks",
  "MIN Minnesota Timberwolves|NOP New Orleans Pelicans|NYK New York Knicks|OKC Oklahoma City Thunder|ORL Orlando Magic|PHI Philadelphia 76ers|PHX Phoenix Suns|POR Portland Trail Blazers",
  "SAC Sacramento Kings|SAS San Antonio Spurs|TOR Toronto Raptors|UTA Utah Jazz|WAS Washington Wizards",
  "ANA Anaheim Ducks|BOS Boston Bruins|BUF Buffalo Sabres|CGY Calgary Flames|CAR Carolina Hurricanes|CHI Chicago Blackhawks|COL Colorado Avalanche|CBJ Columbus Blue Jackets|DAL Dallas Stars",
  "DET Detroit Red Wings|EDM Edmonton Oilers|FLA Florida Panthers|LAK Los Angeles Kings|MIN Minnesota Wild|MTL Montreal Canadiens|NSH Nashville Predators|NJD New Jersey Devils",
  "NYI New York Islanders|NYR New York Rangers|OTT Ottawa Senators|PHI Philadelphia Flyers|PIT Pittsburgh Penguins|SJS San Jose Sharks|SEA Seattle Kraken|STL St Louis Blues",
  "TBL Tampa Bay Lightning|TOR Toronto Maple Leafs|UTA Utah Mammoth|UTA Utah Hockey Club|VAN Vancouver Canucks|VGK Vegas Golden Knights|WSH Washington Capitals|WPG Winnipeg Jets",
].join("|").split("|").forEach((row) => { const [code, ...name] = row.split(" "); GAME_SHORT[gameShortKey(name.join(" "))] = code; });

function gameShortKey(name) {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function gameShortTeam(name) {
  const key = gameShortKey(name);
  if (GAME_SHORT[key]) return GAME_SHORT[key];
  const words = key.split(" ").filter(Boolean);
  if (words.length > 2) return words.slice(0, -1).map((word) => word[0]).join("").toUpperCase();
  return (words[0] || "").slice(0, 3).toUpperCase();
}

function gameShort(match) {
  const sides = String(match || "").split(/\s+(?:@|at|vs\.?|v)\s+/i);
  return sides.length === 2 ? sides.map(gameShortTeam).join("@") : "";
}

function gameShortList(legs) {
  return [...new Set((legs || []).map((leg) => gameShort(leg.match)).filter(Boolean))].join(", ");
}

document.addEventListener("click", (event) => {
  const tag = event.target.closest && event.target.closest(".find-board .find-ticket i.gm[data-game]");
  if (!tag || typeof paintMatch !== "function" || typeof parlayLeg === "undefined") return;
  const board = tag.closest(".find-board");
  const leg = [...parlayLeg.values()].find((row) => gameShort(row.match) === tag.dataset.game);
  const teams = board.querySelector(":scope > .find-teams"), list = board.querySelector(":scope > .find-list"), hits = board.querySelector(":scope > .find-hits:not(.find-tray)"), span = board.querySelector(":scope > .find-span"), more = board.querySelector(".find-games-go");
  if (!leg || !teams || !list) return;
  if (hits) hits.replaceChildren();
  teams.replaceChildren(); list.replaceChildren(); list.classList.remove("find-only-on");
  if (span) { span.classList.add("find-picked"); span.querySelectorAll(".find-games").forEach((node) => { node.open = false; }); }
  if (more) more.hidden = false;
  paintMatch(teams, leg, board.people || [], list, hits, true);
  teams.scrollIntoView({ block: "start", behavior: "smooth" });
});
