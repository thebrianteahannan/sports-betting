const CHOICE_SPORTS = ["NFL", "MLB", "NBA", "NHL", "WNBA", "NCAAF", "PGA"];
const KIND_ORDER = ["yards", "points", "assists", "shots", "strikeouts", "hits"];
const KIND_LABELS = {
  yards: "Yards", points: "Points", assists: "Assists", shots: "Shots", strikeouts: "Strikeouts", hits: "Hits",
};
const SPORT_KINDS = {
  NFL: ["yards"], NCAAF: ["yards"], MLB: ["strikeouts", "hits"], NBA: ["points", "assists"],
  WNBA: ["points", "assists"], NHL: ["shots", "points", "assists"], PGA: [],
};
const AIM_LABEL = { top: "1 safest", safe: "Safe", good: "Good", payout: "Best payout" };
const GO_LABEL = { top: "Show the safest", safe: "Show a safe bet", good: "Show a good bet", payout: "Show the best payout" };
const choice = { sports: [], kind: "any", legs: 3, gameIds: [], when: "today", aim: "top" };
const seenBets = {};

function choiceButton(label, on, attr, value) {
  return `<button type="button" class="${on ? "on" : ""}" ${attr}="${value}">${label}</button>`;
}

function paintChoices() {
  const sports = document.getElementById("choice-sports");
  const legs = document.getElementById("choice-legs");
  const when = document.getElementById("choice-when");
  if (!sports || !legs) return;
  if (when) {
    when.innerHTML = [["today", "Today"], ["week", "This week"]].map(([id, label]) => (
      choiceButton(label, choice.when === id, "data-when", id)
    )).join("");
  }
  sports.innerHTML = CHOICE_SPORTS.map((sport) => (
    choiceButton(sport, choice.sports.includes(sport), "data-sport", sport)
  )).join("");
  legs.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
    choiceButton(count === 1 ? "1 leg" : `${count} legs`, choice.legs === count, "data-legs", String(count))
  )).join("");
  const aim = document.getElementById("choice-aim");
  const go = document.getElementById("choice-go");
  if (aim) {
    aim.innerHTML = Object.entries(AIM_LABEL).map(([id, label]) => (
      choiceButton(label, choice.aim === id, "data-aim", id)
    )).join("");
  }
  if (go) go.textContent = GO_LABEL[choice.aim] || GO_LABEL.safe;
  paintKinds();
  paintGames();
}

function chosenSports() {
  return choice.sports.length ? choice.sports : CHOICE_SPORTS;
}

function paintKinds() {
  const kind = document.getElementById("choice-kind");
  if (!kind) return;
  const allowed = new Set(chosenSports().flatMap((sport) => SPORT_KINDS[sport] || []));
  const kinds = ["any"].concat(KIND_ORDER.filter((name) => allowed.has(name)));
  if (!kinds.includes(choice.kind)) choice.kind = "any";
  kind.innerHTML = kinds.map((name) => (
    `<option value="${name}">${name === "any" ? "Any player prop" : KIND_LABELS[name]}</option>`
  )).join("");
  kind.value = choice.kind;
}

function paintGames() {
  const select = document.getElementById("choice-game");
  const board = window.state && window.state.board;
  if (!select || !board) return;
  const sports = new Set(chosenSports());
  const games = (board.games || []).filter((game) => {
    if (!sports.has(game.sport)) return false;
    const kick = Date.parse(game.kickoff || "");
    return Number.isFinite(kick) && choiceWindow(kick);
  });
  games.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  select.innerHTML = games.map((game) => {
    const clock = typeof when === "function" ? when(game.kickoff) : "";
    const label = `${game.sport} · ${game.match}${clock ? ` · ${clock} ET` : ""}`;
    return `<option value="${String(game.id)}">${esc(label)}</option>`;
  }).join("");
  const wanted = new Set(choice.gameIds);
  [...select.options].forEach((option) => { option.selected = wanted.has(option.value); });
  choice.gameIds = [...select.selectedOptions].map((option) => option.value);
}

function choiceKey() {
  return JSON.stringify({
    sports: choice.sports, kind: choice.kind, legs: choice.legs,
    gameIds: choice.gameIds, when: choice.when, aim: choice.aim,
  });
}

async function runChoice() {
  const box = document.getElementById("choice-result");
  const key = choiceKey();
  document.getElementById("choice-again").hidden = (document.getElementById("chooser").classList.add("built"), false);
  box.textContent = "Checking FanDuel.";
  const response = await fetch("/api/choose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sports: choice.sports, kind: choice.kind, legs: choice.legs,
      gameIds: choice.gameIds, when: choice.when, aim: choice.aim, skip: seenBets[key] || [],
    }),
  });
  const card = await response.json();
  if (!response.ok) {
    box.textContent = card.error || "FanDuel did not answer.";
    return;
  }
  const mark = (card.players || []).slice().sort().join("|");
  if (mark) seenBets[key] = card.only || card.again ? [mark] : (seenBets[key] || []).concat(mark).slice(-24);
  const legs = (card.legs || []).map((leg) => {
    const sway = [leg.fact, leg.sway, String(leg.form || "").replace(/^In form:\s*/i, "")].filter(Boolean).join(" ");
    const fact = sway ? `<br><span class="quiet">${esc(sway)}</span>` : "";
    return `<li><b>${esc(american(leg.odds))}</b><span>${esc(leg.label)}${fact}</span><em>${esc(leg.pct || "")}</em></li>`;
  }).join("");
  const kicks = [...new Set((card.legs || []).map((leg) => leg.kickoff).filter(Boolean))];
  const whenLine = kicks.length === 1 ? `<p class="when">${esc(when(kicks[0]))} ET</p>` : "";
  const save = (card.legs || []).length ? `<p class="pick-save"><button type="button" id="choice-save">Save this bet</button></p>` : "";
  box.innerHTML = `<h2>${esc(card.title || "Safest parlay")}</h2>${whenLine}<p>${esc(card.game ? `${card.game}. ` : "")}${esc(card.copy || "")}</p><ol class="chalk-legs">${legs}</ol><p class="quiet">${esc(card.note || "")}</p>${save}`;
  const button = document.getElementById("choice-save");
  if (button) button.addEventListener("click", () => saveBuilt(card, button));
}

async function saveBuilt(card, button) {
  button.disabled = true;
  const response = await fetch("/api/choose/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: card.title, american: card.american, copy: card.copy,
      when: choice.when, sports: choice.sports, kind: choice.kind, aim: choice.aim,
      legs: (card.legs || []).slice(0, 10),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    button.disabled = false;
    button.textContent = payload.error || "Could not save.";
    return;
  }
  button.textContent = "Saved";
}

function etDay(ms) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { key: `${bag.year}-${bag.month}-${bag.day}`, weekday: bag.weekday };
}

function choiceWindow(kick) {
  const now = Date.now();
  if (kick < now - 3 * 60 * 60 * 1000) return false;
  const kickDay = etDay(kick);
  const nowDay = etDay(now);
  if (choice.when !== "week") return kickDay.key === nowDay.key;
  const horizon = etDay(now + 14 * 24 * 60 * 60 * 1000);
  return kickDay.key <= horizon.key;
}

const SPOKEN_SPORTS = [
  ["college football", "NCAAF"], ["ncaa football", "NCAAF"], ["ncaaf", "NCAAF"],
  ["womens basketball", "WNBA"], ["wnba", "WNBA"], ["football", "NFL"], ["nfl", "NFL"],
  ["baseball", "MLB"], ["mlb", "MLB"], ["basketball", "NBA"], ["nba", "NBA"],
  ["hockey", "NHL"], ["nhl", "NHL"], ["golf", "PGA"], ["pga", "PGA"],
];
const SPOKEN_KINDS = [
  ["passing yards", "yards"], ["rushing yards", "yards"], ["receiving yards", "yards"],
  ["strikeouts", "strikeouts"], ["strikeout", "strikeouts"], ["assists", "assists"],
  ["assist", "assists"], ["shots", "shots"], ["shot", "shots"], ["yards", "yards"],
  ["yardage", "yards"], ["points", "points"], ["point", "points"], ["hits", "hits"], ["hit", "hits"],
  ["any prop", "any"], ["player prop", "any"], ["any", "any"],
];
const SPOKEN_MISSING = [
  ["three pointers", "three pointers"], ["three pointer", "three pointers"], ["three point", "three pointers"],
  ["home runs", "home runs"], ["home run", "home runs"], ["money line", "moneyline"], ["moneyline", "moneyline"],
  ["puck line", "puck line"], ["run line", "run line"], ["over under", "total"], ["first half", "first half"],
  ["first basket", "first basket"], ["double double", "double double"], ["to score", "to score"],
  ["touchdowns", "touchdowns"], ["touchdown", "touchdowns"], ["receptions", "receptions"], ["reception", "receptions"],
  ["rebounds", "rebounds"], ["rebound", "rebounds"], ["field goal", "field goal"], ["goals", "goals"],
  ["interceptions", "interceptions"], ["sacks", "sacks"], ["tackles", "tackles"], ["steals", "steals"],
  ["blocks", "blocks"], ["saves", "saves"], ["spread", "spread"], ["totals", "total"], ["total", "total"],
  ["threes", "threes"], ["futures", "futures"], ["soccer", "soccer"], ["tennis", "tennis"], ["boxing", "boxing"],
  ["cricket", "cricket"], ["nascar", "nascar"], ["formula 1", "Formula 1"], ["ufc", "UFC"], ["mma", "MMA"], ["mvp", "MVP"],
];
const SPOKEN_AIM = [
  ["best payout", "payout"], ["biggest payout", "payout"], ["longest price", "payout"],
  ["highest chance", "top"], ["one safest", "top"], ["safest", "top"], ["payout", "payout"],
  ["safe", "safe"], ["good", "good"],
];
const SPOKEN_WHEN = [
  ["this week", "week"], ["next week", "week"], ["weekend", "week"], ["week", "week"],
  ["tonight", "today"], ["today", "today"],
];
const LEG_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NICK_ALIAS = {
  niners: "49ers", pats: "patriots", bucs: "buccaneers", cards: "cardinals", mavs: "mavericks",
  sixers: "76ers", cavs: "cavaliers", dubs: "warriors", wolves: "timberwolves",
};
const SPOKEN_SKIP = new Set("i me my a an the bet bets parlay parlays please give show for of on with and some to be like can you make build just get this that it its from in at prop props player players game games leg legs set use using about around looking look need would gonna let do does have has something anything thanks thank want wanted".split(" "));

function spokenNorm(text) {
  return String(text || "").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function cutPhrase(text, phrase) {
  const re = new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`);
  if (!re.test(text)) return null;
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

function takePhrase(text, phrases) {
  for (let i = 0; i < phrases.length; i += 1) {
    const next = cutPhrase(text, phrases[i][0]);
    if (next !== null) return [phrases[i][1], next];
  }
  return ["", text];
}

function takeAll(text, phrases) {
  const values = [];
  let next = text;
  for (let guard = 0; guard < 8; guard += 1) {
    const [value, rest] = takePhrase(next, phrases);
    if (!value) break;
    if (!values.includes(value)) values.push(value);
    next = rest;
  }
  return [values, next];
}

function takeLegs(text) {
  const words = Object.keys(LEG_WORDS).join("|");
  const match = text.match(new RegExp(`\\b(\\d+|${words})\\s*-?\\s*legs?\\b`));
  if (!match) return [0, text];
  const count = Number(match[1]) || LEG_WORDS[match[1]] || 0;
  const next = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  return [count, next];
}

function gamesIn(when) {
  const board = window.state && window.state.board;
  const saved = choice.when;
  if (when) choice.when = when;
  const games = ((board && board.games) || []).filter((game) => {
    const kick = Date.parse(game.kickoff || "");
    return Number.isFinite(kick) && choiceWindow(kick);
  });
  if (when) choice.when = saved;
  return games;
}

function gameRows(games) {
  return games.map((game) => {
    const nicks = String(game.match || "").split("@").map((side) => {
      const bits = side.replace(/\([^)]*\)/g, "").trim().split(/\s+/).filter(Boolean);
      return (bits[bits.length - 1] || "").toLowerCase();
    }).filter((nick) => nick.length >= 4);
    return { id: String(game.id), sport: game.sport, nicks };
  });
}

function takeGames(text, when, sports) {
  const rows = gameRows(when ? gamesIn(when) : gamesIn("today").concat(gamesIn("week")));
  const known = new Map();
  rows.forEach((row) => row.nicks.forEach((nick) => { if (!known.has(nick)) known.set(nick, row); }));
  Object.entries(NICK_ALIAS).forEach(([alias, nick]) => {
    const row = rows.find((item) => item.nicks.includes(nick));
    if (row && !known.has(alias)) known.set(alias, row);
  });
  const ids = [];
  const labels = [];
  let next = text;
  const wanted = sports && sports.length ? new Set(sports) : null;
  [...known.keys()].sort((a, b) => b.length - a.length).forEach((nick) => {
    const re = new RegExp(`(^|\\s)${nick.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i");
    if (!re.test(next)) return;
    const row = known.get(nick);
    if (wanted && !wanted.has(row.sport)) return;
    next = next.replace(re, " ").replace(/\s+/g, " ").trim();
    if (!ids.includes(row.id)) ids.push(row.id);
    const target = NICK_ALIAS[nick] || nick;
    const label = row.nicks.find((name) => name === target) || target;
    if (label && !labels.includes(label)) labels.push(label);
  });
  return { ids, labels, text: next };
}

function spokenLeft(text) {
  return text.split(/\s+/).filter((word) => word.length >= 3 && !SPOKEN_SKIP.has(word) && !/^\d+$/.test(word));
}

function sportsFromGames(ids, when) {
  if (!ids.length) return [];
  const rows = gameRows(gamesIn(when || "week"));
  return [...new Set(rows.filter((row) => ids.includes(row.id)).map((row) => row.sport))];
}

function kindFits(kind, sports) {
  if (kind === "any") return true;
  const names = sports && sports.length ? sports : CHOICE_SPORTS;
  return names.some((sport) => (SPORT_KINDS[sport] || []).includes(kind));
}

function spokenTitle(phrase) {
  return String(phrase || "").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function parseSpoken(text) {
  let left = spokenNorm(text);
  const [missingHits, afterMissing] = takeAll(left, SPOKEN_MISSING);
  left = afterMissing;
  const [kind, afterKind] = takePhrase(left, SPOKEN_KINDS);
  left = afterKind;
  const [sports, afterSports] = takeAll(left, SPOKEN_SPORTS);
  left = afterSports;
  const [aim, afterAim] = takePhrase(left, SPOKEN_AIM);
  left = afterAim;
  const [when, afterWhen] = takePhrase(left, SPOKEN_WHEN);
  left = afterWhen;
  const [legs, afterLegs] = takeLegs(left);
  left = afterLegs;
  const games = takeGames(left, when, sports);
  left = games.text;
  const missing = missingHits.map(spokenTitle);
  if (legs && (legs < 2 || legs > 10)) missing.push(`${legs} legs`);
  const kindSports = sports.length ? sports : sportsFromGames(games.ids, when);
  if (kind && !kindFits(kind, kindSports)) missing.push(KIND_LABELS[kind] || spokenTitle(kind));
  spokenLeft(left).forEach((word) => missing.push(spokenTitle(word)));
  return {
    when, sports, aim,
    kind: kind && kindFits(kind, sports) ? kind : "",
    legs: legs >= 2 && legs <= 10 ? legs : 0,
    gameIds: games.ids,
    gameLabels: games.labels,
    missing,
  };
}

function spokenSet(parsed) {
  const bits = [];
  if (parsed.when) bits.push(parsed.when === "week" ? "This week" : "Today");
  if (parsed.sports.length) bits.push(parsed.sports.join(", "));
  if (parsed.gameLabels.length) bits.push(parsed.gameLabels.map(spokenTitle).join(", "));
  if (parsed.kind) bits.push(parsed.kind === "any" ? "Any player prop" : KIND_LABELS[parsed.kind]);
  if (parsed.legs) bits.push(`${parsed.legs} legs`);
  if (parsed.aim) bits.push(AIM_LABEL[parsed.aim]);
  return bits.join(", ");
}

async function saveAsk(said, missing) {
  const response = await fetch("/api/choose/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ said, missing }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok ? payload : { ok: false, error: payload.error || "Could not save that request." };
}

async function hearChoice(text) {
  const heard = document.getElementById("choice-heard");
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (raw.length < 2) {
    if (heard) heard.textContent = "Say the league, the prop, or how many legs.";
    return;
  }
  const parsed = parseSpoken(raw);
  if (parsed.when) choice.when = parsed.when;
  else if (parsed.gameIds.length) {
    const todayIds = new Set(gamesIn("today").map((game) => String(game.id)));
    if (!parsed.gameIds.every((id) => todayIds.has(id))) choice.when = "week";
  }
  if (parsed.sports.length) choice.sports = parsed.sports.slice();
  if (parsed.kind) {
    choice.kind = parsed.kind;
    const held = choice.sports.length ? choice.sports : CHOICE_SPORTS;
    if (!held.some((sport) => parsed.kind === "any" || (SPORT_KINDS[sport] || []).includes(parsed.kind))) choice.sports = [];
  }
  if (parsed.legs) choice.legs = parsed.legs;
  if (parsed.aim) choice.aim = parsed.aim;
  if (parsed.gameIds.length) {
    if (!parsed.sports.length) {
      const rows = gameRows(gamesIn(choice.when));
      parsed.sports = [...new Set(rows.filter((row) => parsed.gameIds.includes(row.id)).map((row) => row.sport))];
      choice.sports = parsed.sports.slice();
    }
    choice.gameIds = parsed.gameIds.slice();
  }
  paintChoices();
  const set = spokenSet(parsed);
  const named = [...new Set(parsed.missing)];
  const gap = named.length < 2 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  let message = named.length ? `${gap} ${named.length === 1 ? "is" : "are"} not on Build a Bet.` : "";
  if (set) message = message ? `${message} Set ${set}.` : `Set ${set}.`;
  if (!message) message = "Say the league, the prop, or how many legs.";
  if (named.length) {
    const saved = await saveAsk(raw, named.join(", "));
    if (!saved.ok) message = `${message} ${saved.error}`;
  }
  if (heard) heard.textContent = message;
}

let choiceMic = null;

function speakChoice() {
  const button = document.getElementById("choice-speak");
  const heard = document.getElementById("choice-heard");
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    if (heard) heard.textContent = "This browser cannot hear a bet. Pick the options on the page.";
    return;
  }
  if (choiceMic) {
    choiceMic.stop();
    return;
  }
  const rec = new Speech();
  choiceMic = rec;
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    const said = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
    hearChoice(said);
  };
  rec.onerror = (event) => {
    if (heard && event.error !== "aborted") {
      heard.textContent = event.error === "not-allowed"
        ? "Allow the microphone, then speak the bet."
        : "The microphone did not catch that.";
    }
  };
  rec.onend = () => {
    choiceMic = null;
    if (button) button.textContent = "Speak a bet";
  };
  if (button) button.textContent = "Listening…";
  if (heard) heard.textContent = "Listening.";
  rec.start();
}

document.getElementById("choice-speak").addEventListener("click", speakChoice);
window.hearChoice = hearChoice;

document.getElementById("chooser").addEventListener("click", (event) => {
  const when = event.target.closest("[data-when]");
  if (when) {
    choice.when = when.dataset.when;
    paintChoices();
    return;
  }
  const sport = event.target.closest("[data-sport]");
  if (sport) {
    const name = sport.dataset.sport;
    choice.sports = choice.sports.includes(name)
      ? choice.sports.filter((item) => item !== name)
      : choice.sports.concat(name);
    paintChoices();
    return;
  }
  const legs = event.target.closest("[data-legs]");
  if (legs) {
    choice.legs = Number(legs.dataset.legs);
    paintChoices();
    return;
  }
  const aim = event.target.closest("[data-aim]");
  if (aim) {
    choice.aim = aim.dataset.aim;
    paintChoices();
  }
});

document.getElementById("choice-kind").addEventListener("change", (event) => {
  choice.kind = event.target.value;
});

document.getElementById("choice-game").addEventListener("change", (event) => {
  choice.gameIds = [...event.target.selectedOptions].map((option) => option.value);
});

document.getElementById("choice-go").addEventListener("click", () => {
  runChoice().catch((error) => {
    document.getElementById("choice-result").textContent = String(error);
  });
});

document.getElementById("choice-another").onclick = () => { const chooser = document.getElementById("chooser"); chooser.classList.remove("built"); chooser.querySelector("#choice-again").hidden = true; chooser.querySelector("#choice-result").textContent = ""; };

window.paintChoices = paintChoices;
paintChoices();
