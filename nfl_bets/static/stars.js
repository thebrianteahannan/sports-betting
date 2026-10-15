function legState(row) {
  if (row.result === "won" || row.result === "lost" || row.result === "push") return row.result;
  const have = Number(row.have);
  const line = Number(row.line);
  if (Number.isFinite(have) && Number.isFinite(line) && have >= line) return "won";
  return "wait";
}

function starHtml(rating, card, group, id, built) {
  const n = Number(rating) || 0;
  const attrs = built
    ? ` data-built="${esc(built)}"`
    : id
      ? ` data-good="${esc(id)}"`
      : ` data-good-card="${esc(card)}"${group ? ` data-group="${esc(group)}"` : ""}`;
  const stars = [1, 2, 3, 4, 5].map((value) => (
    `<button type="button" class="star${value <= n ? " on" : ""}" data-stars="${value}" aria-label="${value} star${value > 1 ? "s" : ""}">★</button>`
  )).join("");
  return `<span class="stars"${attrs}>${stars}</span>`;
}

const WEATHER_CARDS = ["band", "weekThree", "weekFive", "weekSafe", "todayBet", "chalk", "four", "plus", "hits"];
const INDOOR = new Set(["NHL", "NBA", "WNBA", "NCAAB"]);
const ROOF = new Set(["Arizona Cardinals", "Atlanta Falcons", "Dallas Cowboys", "Detroit Lions", "Houston Texans", "Indianapolis Colts", "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Minnesota Vikings", "New Orleans Saints", "Arizona Diamondbacks", "Houston Astros", "Miami Marlins", "Milwaukee Brewers", "Texas Rangers", "Toronto Blue Jays", "Tampa Bay Rays"]);
const CITY = {
  "Golden State Valkyries": "San Francisco", "Golden State Warriors": "San Francisco",
  "Utah Jazz": "Salt Lake City", "Utah Hockey Club": "Salt Lake City", "Utah Mammoth": "Salt Lake City",
  "Minnesota Wild": "Saint Paul", "Minnesota Vikings": "Minneapolis", "Minnesota Timberwolves": "Minneapolis", "Minnesota Twins": "Minneapolis",
  "New York Giants": "East Rutherford", "New York Jets": "East Rutherford", "New England Patriots": "Foxborough",
  "New York Islanders": "Elmont", "Colorado Avalanche": "Denver", "Florida Panthers": "Sunrise",
  "Carolina Hurricanes": "Raleigh", "Carolina Panthers": "Charlotte", "Arizona Cardinals": "Glendale",
  "Arizona Diamondbacks": "Phoenix", "Tennessee Titans": "Nashville", "Indiana Pacers": "Indianapolis",
  "Indiana Fever": "Indianapolis", "Vegas Golden Knights": "Las Vegas", "Portland Trail Blazers": "Portland",
  "New Jersey Devils": "Newark", "Los Angeles Angels": "Anaheim",
};
const geoCache = new Map();
const skyCache = new Map();
const skyWait = new Map();
let weatherBusy = false;

function weatherLegs() {
  const board = window.state && state.board;
  const legs = [];
  const take = (card) => {
    if (!card) return;
    (card.legs || []).forEach((leg) => legs.push(leg));
    (card.groups || []).forEach((group) => (group.legs || []).forEach((leg) => legs.push(leg)));
  };
  if (board) {
    WEATHER_CARDS.forEach((key) => take(board[key]));
    (board.picks || []).forEach(take);
  }
  (window.builtLegs || []).forEach((leg) => legs.push(leg));
  return legs;
}

function gameFor(leg) {
  const games = (window.state && state.board && state.board.games) || [];
  return games.find((row) => String(row.id) === String(leg.gameId || "")) || null;
}

function homeTeam(leg) {
  const label = String(leg.label || "");
  const named = label.match(/(?:@|\bat)\s+([^,]+)/i);
  if (named) return named[1].trim();
  const match = String((gameFor(leg) && gameFor(leg).match) || "");
  const hit = match.match(/(?:@|\bat)\s+(.+)$/i);
  return hit ? hit[1].trim() : "";
}

function kickoffOf(leg) {
  return leg.kickoff || (gameFor(leg) && gameFor(leg).kickoff) || "";
}

function cityOf(team) {
  if (CITY[team]) return CITY[team];
  const parts = team.split(/\s+/);
  const two = parts.slice(0, 2).join(" ");
  if (/^(Los Angeles|New York|Tampa Bay|San Francisco|San Antonio|San Diego|Kansas City|Oklahoma City|New Orleans|Green Bay|Las Vegas|Salt Lake)$/.test(two)) return two;
  return parts.slice(0, -1).join(" ") || team;
}

function skyWord(code) {
  const n = Number(code);
  if (n === 0) return "clear";
  if (n <= 3) return "cloudy";
  if (n === 45 || n === 48) return "fog";
  if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82)) return "rain";
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return "snow";
  if (n >= 95) return "a thunderstorm";
  return "mixed skies";
}

function affect(label, temp, wind, pop, code) {
  const text = String(label || "").toLowerCase();
  const wet = pop >= 40 || ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95);
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const notes = [];
  if (snow) notes.push("Snow can make the ball and the footing less sure");
  else if (wet) notes.push("Rain can make the ball slick");
  if (wind >= 15 && /pass|receiv|kick|punt|golf|total/.test(text)) notes.push("Wind at this speed can move a pass or a kick");
  if (temp <= 32 && /pass|receiv|rush|yard|kick/.test(text)) notes.push("A freeze can stiffen grip");
  else if (temp >= 90) notes.push("Heat can wear a player down late");
  if (!notes.length) return "Mild conditions. Weather is not the main thing on this leg.";
  return `${notes.slice(0, 2).join(". ")}. It can still hit.`;
}

async function locate(name) {
  const key = name.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`);
  const data = await response.json();
  const row = (data.results || []).find((item) => item.country_code === "US" || item.country_code === "CA");
  const found = row ? { lat: row.latitude, lon: row.longitude, place: row.name } : null;
  geoCache.set(key, found);
  return found;
}

function forecast(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (skyCache.has(key)) return Promise.resolve(skyCache.get(key));
  if (skyWait.has(key)) return skyWait.get(key);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&past_days=3&forecast_days=16`;
  const job = fetch(url).then((response) => response.json()).then((data) => {
    if (!data.hourly) throw new Error("no hourly");
    skyCache.set(key, data.hourly);
    skyWait.delete(key);
    return data.hourly;
  }).catch(() => { skyWait.delete(key); return null; });
  skyWait.set(key, job);
  return job;
}

function hourAt(hourly, kickoff) {
  const times = (hourly && hourly.time) || [];
  const target = new Date(kickoff).getTime();
  if (!times.length || !Number.isFinite(target)) return -1;
  let best = 0;
  times.forEach((stamp, index) => {
    if (Math.abs(new Date(stamp).getTime() - target) < Math.abs(new Date(times[best]).getTime() - target)) best = index;
  });
  return Math.abs(new Date(times[best]).getTime() - target) <= 3 * 3600 * 1000 ? best : -1;
}

async function describeWeather(leg) {
  const team = homeTeam(leg);
  const kick = kickoffOf(leg);
  if (!team || !kick) return "";
  const place = await locate(cityOf(team));
  if (!place) return "";
  const hourly = await forecast(place.lat, place.lon);
  const index = hourAt(hourly, kick);
  if (index < 0) return "";
  const temp = hourly.temperature_2m[index];
  const wind = hourly.wind_speed_10m[index];
  const pop = hourly.precipitation_probability[index];
  const code = hourly.weather_code[index];
  const cond = `${Math.round(temp)}°F, ${skyWord(code)}, wind ${Math.round(wind)} mph`;
  const indoors = INDOOR.has(String(leg.sport || "")) || /—\s*(NHL|NBA|WNBA|NCAAB)\b/.test(String(leg.label || ""));
  if (indoors || ROOF.has(team)) {
    const why = indoors
      ? "This game is indoors, so that weather does not change the leg."
      : "The roof is usually closed, so the outside forecast is a weak read on this leg.";
    return `${place.place}: ${cond} outside. ${why}`;
  }
  return `${place.place} at kickoff: ${cond}. ${affect(leg.label, temp, wind, pop, code)}`;
}

function paintBuiltWeather() {
  const legs = window.builtLegs || [];
  document.querySelectorAll("#choice-result li").forEach((row, index) => {
    const text = legs[index] && legs[index].weather;
    if (!text) return;
    const host = row.querySelector("span");
    if (!host) return;
    let note = host.querySelector(".quiet");
    if (!note) {
      note = document.createElement("span");
      note.className = "quiet";
      host.append(note);
    }
    if (!note.textContent.includes(text)) note.textContent = [note.textContent, text].filter(Boolean).join(" ");
  });
}

async function paintWeather() {
  if (weatherBusy) return;
  const legs = weatherLegs().filter((leg) => leg.weather == null);
  if (!legs.length) return;
  weatherBusy = true;
  try {
    const queue = legs.slice();
    const worker = async () => {
      while (queue.length) {
        const leg = queue.shift();
        try { leg.weather = await describeWeather(leg); }
        catch (error) { leg.weather = ""; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, legs.length) }, worker));
    if (window.render) render();
    paintBuiltWeather();
  } finally {
    weatherBusy = false;
  }
}
