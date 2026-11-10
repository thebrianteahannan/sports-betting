// Team colors by league, [primary, secondary], keyed by the end of the team name.
const CLUB_COLORS = {
  NFL: { Cardinals: ["#97233F", "#FFB612"], Falcons: ["#A71930", "#000000"], Ravens: ["#241773", "#9E7C0C"], Bills: ["#00338D", "#C60C30"], Panthers: ["#0085CA", "#101820"], Bears: ["#0B162A", "#C83803"], Bengals: ["#FB4F14", "#000000"], Browns: ["#311D00", "#FF3C00"], Cowboys: ["#003594", "#869397"], Broncos: ["#FB4F14", "#002244"], Lions: ["#0076B6", "#B0B7BC"], Packers: ["#203731", "#FFB612"], Texans: ["#03202F", "#A71930"], Colts: ["#002C5F", "#A2AAAD"], Jaguars: ["#006778", "#D7A22A"], Chiefs: ["#E31837", "#FFB81C"], Raiders: ["#000000", "#A5ACAF"], Chargers: ["#0080C6", "#FFC20E"], Rams: ["#003594", "#FFA300"], Dolphins: ["#008E97", "#FC4C02"], Vikings: ["#4F2683", "#FFC62F"], Patriots: ["#002244", "#C60C30"], Saints: ["#D3BC8D", "#101820"], Giants: ["#0B2265", "#A71930"], Jets: ["#125740", "#FFFFFF"], Eagles: ["#004C54", "#A5ACAF"], Steelers: ["#FFB612", "#101820"], "49ers": ["#AA0000", "#B3995D"], Seahawks: ["#002244", "#69BE28"], Buccaneers: ["#D50A0A", "#34302B"], Titans: ["#0C2340", "#4B92DB"], Commanders: ["#5A1414", "#FFB612"] },
  NBA: { Hawks: ["#E03A3E", "#C1D32F"], Celtics: ["#007A33", "#BA9653"], Nets: ["#000000", "#FFFFFF"], Hornets: ["#1D1160", "#00788C"], Bulls: ["#CE1141", "#000000"], Cavaliers: ["#860038", "#FDBB30"], Mavericks: ["#00538C", "#B8C4CA"], Nuggets: ["#0E2240", "#FEC524"], Pistons: ["#C8102E", "#1D42BA"], Warriors: ["#1D428A", "#FFC72C"], Rockets: ["#CE1141", "#000000"], Pacers: ["#002D62", "#FDBB30"], Clippers: ["#C8102E", "#1D428A"], Lakers: ["#552583", "#FDB927"], Grizzlies: ["#5D76A9", "#12173F"], Heat: ["#98002E", "#F9A01B"], Bucks: ["#00471B", "#EEE1C6"], Timberwolves: ["#0C2340", "#236192"], Pelicans: ["#0C2340", "#C8102E"], Knicks: ["#006BB6", "#F58426"], Thunder: ["#007AC1", "#EF3B24"], Magic: ["#0077C0", "#C4CED4"], "76ers": ["#006BB6", "#ED174C"], Suns: ["#1D1160", "#E56020"], "Trail Blazers": ["#E03A3E", "#000000"], Kings: ["#5A2D81", "#63727A"], Spurs: ["#C4CED4", "#000000"], Raptors: ["#CE1141", "#000000"], Jazz: ["#002B5C", "#F9A01B"], Wizards: ["#002B5C", "#E31837"] },
  NHL: { Ducks: ["#F47A38", "#B9975B"], Bruins: ["#FFB81C", "#000000"], Sabres: ["#003087", "#FFB81C"], Flames: ["#C8102E", "#F1BE48"], Hurricanes: ["#CE1126", "#000000"], Blackhawks: ["#CF0A2C", "#000000"], Avalanche: ["#6F263D", "#236192"], "Blue Jackets": ["#002654", "#CE1126"], Stars: ["#006847", "#8F8F8C"], "Red Wings": ["#CE1126", "#FFFFFF"], Oilers: ["#041E42", "#FF4C00"], Panthers: ["#041E42", "#C8102E"], Kings: ["#111111", "#A2AAAD"], Wild: ["#154734", "#A6192E"], Canadiens: ["#AF1E2D", "#192168"], Predators: ["#FFB81C", "#041E42"], Devils: ["#CE1126", "#000000"], Islanders: ["#00539B", "#F47D30"], Rangers: ["#0038A8", "#CE1126"], Senators: ["#C52032", "#C2912C"], Flyers: ["#F74902", "#000000"], Penguins: ["#000000", "#FCB514"], Sharks: ["#006D75", "#EA7200"], Kraken: ["#001628", "#99D9D9"], Blues: ["#002F87", "#FCB514"], Lightning: ["#002868", "#FFFFFF"], "Maple Leafs": ["#00205B", "#FFFFFF"], Canucks: ["#00205B", "#00843D"], "Golden Knights": ["#B4975A", "#333F42"], Capitals: ["#041E42", "#C8102E"], Jets: ["#041E42", "#004C97"], Mammoth: ["#6CACE4", "#010101"] },
  MLB: { Diamondbacks: ["#A71930", "#E3D4AD"], Braves: ["#CE1141", "#13274F"], Orioles: ["#DF4601", "#000000"], "Red Sox": ["#BD3039", "#0C2340"], Cubs: ["#0E3386", "#CC3433"], "White Sox": ["#27251F", "#C4CED4"], Reds: ["#C6011F", "#000000"], Guardians: ["#00385D", "#E50022"], Rockies: ["#333366", "#C4CED4"], Tigers: ["#0C2340", "#FA4616"], Astros: ["#002D62", "#EB6E1F"], Royals: ["#004687", "#BD9B60"], Angels: ["#BA0021", "#003263"], Dodgers: ["#005A9C", "#EF3E42"], Marlins: ["#00A3E0", "#EF3340"], Brewers: ["#12284B", "#FFC52F"], Twins: ["#002B5C", "#D31145"], Mets: ["#002D72", "#FF5910"], Yankees: ["#0C2340", "#C4CED3"], Athletics: ["#003831", "#EFB21E"], Phillies: ["#E81828", "#002D72"], Pirates: ["#27251F", "#FDB827"], Padres: ["#2F241D", "#FFC425"], Giants: ["#FD5A1E", "#27251F"], Mariners: ["#0C2C56", "#005C5C"], Cardinals: ["#C41E3A", "#0C2340"], Rays: ["#092C5C", "#8FBCE6"], Rangers: ["#003278", "#C0111F"], "Blue Jays": ["#134A8E", "#1D2D5C"], Nationals: ["#AB0003", "#14225A"] },
  WNBA: { Dream: ["#C8102E", "#418FDE"], Sky: ["#418FDE", "#FFCD00"], Sun: ["#F05023", "#0A2240"], Wings: ["#0C2340", "#C4D600"], Valkyries: ["#4B2E83", "#000000"], Fever: ["#002D62", "#E03A3E"], Aces: ["#A7A8AA", "#000000"], Sparks: ["#702F8A", "#FFC72C"], Lynx: ["#0C2340", "#236192"], Liberty: ["#6ECEB2", "#000000"], Mercury: ["#CB6015", "#201747"], Storm: ["#2C5235", "#FEE11A"], Mystics: ["#C8102E", "#002B5C"] },
};

function clubPair(sport, name) {
  const team = String(name || "").replace(/\s*\([^)]*\)/g, "").trim();
  const leagues = CLUB_COLORS[String(sport || "").toUpperCase()] ? [String(sport).toUpperCase()] : Object.keys(CLUB_COLORS);
  for (const league of leagues) {
    const table = CLUB_COLORS[league];
    const key = Object.keys(table).filter((nick) => team === nick || team.endsWith(` ${nick}`)).sort((a, b) => b.length - a.length)[0];
    if (team && key) return table[key];
  }
  return null;
}

function clubColor(sport, name) {
  if (!CLUB_COLORS[String(sport || "").toUpperCase()]) return "";
  const pair = clubPair(sport, name);
  if (!pair) return "";
  const [c1, c2] = pair;
  const glow = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  return glow(c1) < 40 ? c2 : c1;
}

function clubTray(tray) {
  if (!tray || typeof parlayPick === "undefined") return;
  const people = [...parlayPick.values()];
  tray.querySelectorAll(".find-row").forEach((row) => {
    const name = row.querySelector(".find-in .find-name");
    const person = name && people.find((who) => who.name === name.textContent);
    if (!person) return;
    const bare = typeof plainName === "function" ? plainName(person.name).replace(/ (jr|sr|ii|iii|iv|v)$/, "") : "";
    const team = person.team || (typeof clubOf !== "undefined" && clubOf.get(bare)) || "";
    const sport = person.sport || ((person.bets || []).find((bet) => bet.sport) || {}).sport || "";
    if (!team) clubAsk(person, sport);
    const color = clubColor(sport, team);
    if (!color) return;
    row.style.backgroundImage = `linear-gradient(90deg, ${color} 0 5px, ${color}66 5px, ${color}1f 75%)`;
  });
  tray.querySelectorAll(".find-chose").forEach((line) => {
    const who = line.querySelector("span i.who");
    const person = who && people.find((one) => one.name === who.textContent);
    if (!person || person.kind === "team") return;
    const bare = typeof plainName === "function" ? plainName(person.name).replace(/ (jr|sr|ii|iii|iv|v)$/, "") : "";
    const sport = person.sport || ((person.bets || []).find((bet) => bet.sport) || {}).sport || "";
    const team = person.team || (typeof clubOf !== "undefined" && clubOf.get(bare)) || "", pos = person.pos || clubSpot.get(bare) || "";
    if (!team || !pos) clubAsk(person, sport);
    const text = [clubNick(sport, team), pos].filter(Boolean).join(" · ");
    let spot = who.nextElementSibling && who.nextElementSibling.matches("i.spot") ? who.nextElementSibling : null;
    if (!text) { if (spot) spot.remove(); return; }
    if (!spot) { spot = document.createElement("i"); spot.className = "spot"; who.after(spot); }
    spot.textContent = text;
  });
}

function clubNick(sport, team) {
  const name = String(team || "").trim();
  if (!name) return "";
  const table = CLUB_COLORS[String(sport || "").toUpperCase()] || {};
  return Object.keys(table).filter((nick) => name === nick || name.endsWith(` ${nick}`)).sort((a, b) => b.length - a.length)[0] || name.split(/\s+/).pop();
}

const clubAsked = new Set(), clubSpot = new Map();

function clubAsk(person, sport) {
  if (typeof clubOf === "undefined") return;
  const bet = [...parlayLeg.values()].find((row) => String(row.label || "").startsWith(person.name) && row.match) || (person.bets || []).find((row) => row.match);
  if (!bet) return;
  bet.match.split(/ @ | v /).map((side) => side.trim()).filter((side) => side && !clubAsked.has(`${sport}|${side}`)).forEach((side) => {
    clubAsked.add(`${sport}|${side}`);
    fetch("/api/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: "roster", name: side, sport }) })
      .then((res) => res.json())
      .then((data) => {
        (data.players || []).forEach((row) => { const name = String((row && row.name) || row || "").replace(/, out$/, ""); if (!name) return; const bare = plainName(name).replace(/ (jr|sr|ii|iii|iv|v)$/, ""); clubOf.set(bare, side); if (row && row.pos) clubSpot.set(bare, String(row.pos)); });
        document.querySelectorAll(".find-tray").forEach((tray) => clubTray(tray));
      })
      .catch(() => {});
  });
}

function clubSlate(button, game) {
  if (!button || !game || !game.match) return;
  const [away, home] = game.match.includes(" @ ") ? game.match.split(" @ ") : game.match.split(" v ").reverse();
  const a = clubColor(game.sport, away), h = clubColor(game.sport, home);
  if (!a && !h) return;
  const left = a || "#1e3a2a", right = h || "#1e3a2a";
  button.classList.add("club-slate");
  button.style.backgroundImage = `linear-gradient(90deg, ${left} 0 6px, ${left}59 6px, ${right}59 calc(100% - 6px), ${right} calc(100% - 6px))`;
}
