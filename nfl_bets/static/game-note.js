/** Game notes from the public page, for when the desk comes back empty. */

(function () {
  const PATHS = {
    NFL: "football/nfl", NBA: "basketball/nba", MLB: "baseball/mlb",
    NHL: "hockey/nhl", WNBA: "basketball/wnba",
  };

  async function readJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("lookup failed");
    return res.json();
  }

  async function espnId(path, game) {
    if (game.espnId) return String(game.espnId);
    const parts = String(game.match || "").split(/\s@\s|\sat\s/i).map((part) => part.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter((part) => part.length > 2);
    const stamp = Date.parse(game.kickoff || "");
    if (parts.length < 2 || !Number.isFinite(stamp)) return "";
    const et = new Date(stamp - 4 * 3600000);
    const day = `${et.getUTCFullYear()}${String(et.getUTCMonth() + 1).padStart(2, "0")}${String(et.getUTCDate()).padStart(2, "0")}`;
    const data = await readJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}`);
    const found = (data.events || []).find((event) => {
      const blob = `${event.name || ""} ${event.shortName || ""}`.toLowerCase();
      return parts.every((part) => part.split(" ").some((word) => word.length > 2 && blob.includes(word)));
    });
    return found ? String(found.id || "") : "";
  }

  function weather(data, sport) {
    if (/basketball|hockey|^(NBA|WNBA|NHL|NCAAB)$/i.test(String(sport || ""))) return "";
    const info = data.gameInfo || {};
    const venue = info.venue || {};
    const city = String((venue.address || {}).city || "");
    const place = [String(venue.fullName || ""), city].filter(Boolean).join(" in ");
    const sky = info.weather || {};
    const gust = typeof sky.gust === "number" ? sky.gust : (sky.wind && typeof sky.wind === "object" ? sky.wind.speed : null);
    const posted = typeof sky.temperature === "number" || typeof gust === "number" || typeof sky.precipitation === "number";
    const inside = venue.indoor === true || (/^(NBA|WNBA|NHL)$/.test(String(sport || "")) && !posted);
    const surface = inside ? "" : venue.grass === true ? "grass" : venue.grass === false ? "turf" : "";
    const where = inside ? "indoors" : ["outdoors", surface].filter(Boolean).join(" on ");
    const bits = [];
    if (typeof sky.temperature === "number") bits.push(`${Math.round(sky.temperature)} degrees`);
    if (!inside && typeof gust === "number") bits.push(`wind ${Math.round(gust)} mph`);
    if (!inside && typeof sky.precipitation === "number") bits.push(`${sky.precipitation}% chance of precipitation`);
    const setting = [place, where].filter(Boolean).join(", ");
    return [setting && `${setting}.`, bits.length && `${bits.join(", ")}.`].filter(Boolean).join(" ");
  }

  const SPOT = { qb: "quarterback", rb: "running back", fb: "fullback", wr: "receiver", te: "tight end", lt: "left tackle", lg: "left guard", c: "center", rg: "right guard", rt: "right tackle", fs: "free safety", ss: "strong safety", lcb: "corner", rcb: "corner", nb: "nickel", cb: "corner", mlb: "linebacker", wlb: "linebacker", slb: "linebacker", lilb: "linebacker", lolb: "linebacker", rolb: "linebacker", lde: "end", rde: "end", dt: "tackle", nt: "nose tackle", pg: "point guard", sg: "shooting guard", sf: "forward", pf: "forward", lw: "wing", rw: "wing", ld: "defenseman", rd: "defenseman", g: "goalie", pr: "punt returner", kr: "kick returner", ls: "long snapper", p: "punter", k: "kicker" };

  function pack(name, cols, lines) {
    const bits = [];
    (cols || []).forEach((col) => bits.push([col.title, ...(col.lines || [])].filter(Boolean).join(", ")));
    (lines || []).forEach((line) => bits.push(line));
    const text = bits.filter(Boolean).join(" ");
    if (!text) return null;
    const section = { name, text };
    if (cols && cols.length) section.cols = cols;
    if (lines && lines.length) section.lines = lines;
    return section;
  }

  async function coachCard(path, team) {
    const data = await readJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${team.id}/roster`);
    const coach = ((data && data.coach) || [])[0];
    if (!coach || !coach.lastName) return null;
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
    const years = Number(coach.experience);
    const lines = [`${team.short || team.name}${Number.isFinite(years) && years > 0 ? `, year ${years}` : ""}`];
    let seasons = [];
    const [sportName, league] = path.split("/");
    try {
      const doc = await readJson(`https://sports.core.api.espn.com/v2/sports/${sportName}/leagues/${league}/coaches/${coach.id}?lang=en&region=us`);
      const ref = String((((doc.careerRecords || [])[0] || {}).$ref) || "").replace(/^http:/, "https:");
      if (ref) {
        const rec = await readJson(ref);
        const career = rec.displayValue || rec.summary || "";
        if (career) lines.push(`Career ${career}`);
      }
      const refs = (doc.coachSeasons || []).map((row) => String(row.$ref || "").replace(/^http:/, "https:")).filter(Boolean);
      const docs = await Promise.all(refs.map((url) => readJson(url).catch(() => null)));
      seasons = docs.filter(Boolean).map((row) => {
        const teamRef = String((row.team || {}).$ref || "");
        const season = (teamRef.match(/seasons\/(\d+)/) || [])[1];
        const teamId = (teamRef.match(/teams\/(\d+)/) || [])[1];
        return season && teamId ? { season, teamId } : null;
      }).filter(Boolean);
    } catch (err) { seasons = []; }
    return { name, teamId: String(team.id), lines, seasons };
  }

  async function coachVs(path, left, right) {
    if (!left || !right) return [];
    const foe = new Map(right.seasons.map((row) => [row.season, row.teamId]));
    const years = left.seasons.filter((row) => foe.get(row.season) && foe.get(row.season) !== row.teamId);
    const found = [];
    await Promise.all(years.map(async (row) => {
      let sched = {};
      try { sched = await readJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${row.teamId}/schedule?season=${row.season}`); }
      catch (err) { return; }
      const other = foe.get(row.season);
      for (const ev of sched.events || []) {
        const comp = (ev.competitions || [])[0] || {};
        if (!((comp.status || {}).type || {}).completed) continue;
        const sides = (comp.competitors || []).map((side) => ({
          id: String((side.team || {}).id || ""),
          name: (side.team || {}).shortDisplayName || (side.team || {}).abbreviation || "",
          score: side.score && typeof side.score === "object" ? side.score.displayValue : side.score,
          where: side.homeAway || "",
        }));
        if (!sides.some((side) => side.id === other)) continue;
        const mine = sides.find((side) => side.id === row.teamId) || {};
        const opp = sides.find((side) => side.id === other) || {};
        found.push({ id: String(ev.id || ev.date || ""), when: Date.parse(ev.date || ""), win: Number(mine.score) > Number(opp.score) ? 1 : Number(mine.score) < Number(opp.score) ? -1 : 0, away: sides.find((side) => side.where === "away") || sides[0] || {}, home: sides.find((side) => side.where === "home") || sides[1] || {} });
      }
    }));
    const seen = new Set();
    return found.filter((game) => (seen.has(game.id) ? false : seen.add(game.id))).sort((a, b) => b.when - a.when);
  }

  function versus(left, right, games) {
    if (!left || !right || !games.length) return [];
    const wins = games.filter((game) => game.win === 1).length;
    const losses = games.filter((game) => game.win === -1).length;
    const ties = games.length - wins - losses;
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const list = games.slice(0, 8).map((game) => {
      const date = Number.isFinite(game.when) ? when.format(game.when) : "";
      return `${game.away.name} ${game.away.score} at ${game.home.name} ${game.home.score}${date ? `, ${date}` : ""}`;
    });
    return [`${left.name.split(" ").pop()} is ${ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`} against ${right.name.split(" ").pop()}.`, ...list];
  }

  function matchCols(data, teams, kickoff) {
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
    const start = Date.parse(kickoff || "");
    const comps = ((((data.header || {}).competitions || [])[0] || {}).competitors) || [];
    return teams.map((team) => {
      const row = comps.find((side) => String((side.team || {}).id || "") === team.id) || {};
      const total = (row.record || []).find((item) => item.type === "total");
      const place = (row.record || []).find((item) => item.type === (row.homeAway === "home" ? "home" : "road") || item.type === row.homeAway);
      const lines = [[total && total.summary, place && `${place.summary} ${row.homeAway === "home" ? "at home" : "on the road"}`].filter(Boolean).join(", ")].filter(Boolean);
      const recent = (data.lastFiveGames || []).find((side) => String((side.team || {}).id || "") === team.id) || {};
      const last = (recent.events || []).map((event) => Date.parse(event.gameDate || "")).filter((stamp) => Number.isFinite(stamp) && (!Number.isFinite(start) || stamp < start)).sort((a, b) => b - a)[0];
      if (Number.isFinite(last) && Number.isFinite(start)) {
        const days = Math.round((start - last) / 86400000);
        const word = days === 1 ? "day" : "days";
        lines.push(days >= 13 ? `Off a bye, ${days} ${word} since the last game` : `${days} ${word} since the last game`);
      }
      (recent.events || []).slice(0, 5).forEach((event) => {
        const foe = (event.opponent || {}).abbreviation || (event.opponent || {}).displayName || "";
        const day = Date.parse(event.gameDate || "");
        const stamp = Number.isFinite(day) ? when.format(day) : "";
        const text = `${event.gameResult || ""} ${event.score || ""} ${event.atVs || ""} ${foe}${stamp ? `, ${stamp}` : ""}`.replace(/\s+/g, " ").trim();
        if (text) lines.push(text);
      });
      return { title: team.short || team.name, lines };
    }).filter((col) => col.lines.length);
  }

  async function meetings(data, path) {
    const sides = teamsOf(data).map((team) => team.id);
    if (sides.length < 2) return [];
    const year = new Date().getFullYear();
    const found = [];
    for (const season of [year, year - 1, year - 2]) {
      let sched = {};
      try { sched = await readJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${sides[0]}/schedule?season=${season}`); }
      catch (err) { continue; }
      for (const ev of sched.events || []) {
        const comp = (ev.competitions || [])[0] || {};
        if (!((comp.status || {}).type || {}).completed) continue;
        const rows = (comp.competitors || []).map((side) => ({
          id: String((side.team || {}).id || ""),
          name: (side.team || {}).shortDisplayName || (side.team || {}).abbreviation || "",
          score: side.score && typeof side.score === "object" ? side.score.displayValue : side.score,
          where: side.homeAway || "",
        }));
        if (!rows.some((row) => row.id === sides[1])) continue;
        found.push({ id: String(ev.id || ev.date || ""), when: Date.parse(ev.date || ""), rows });
      }
    }
    const seen = new Set();
    const games = found.filter((game) => (seen.has(game.id) ? false : seen.add(game.id))).sort((a, b) => b.when - a.when).slice(0, 4);
    if (!games.length) return [];
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const lines = games.map((game) => {
      const away = game.rows.find((row) => row.where === "away") || game.rows[0] || {};
      const home = game.rows.find((row) => row.where === "home") || game.rows[1] || {};
      const date = Number.isFinite(game.when) ? when.format(game.when) : "";
      return `${away.name} ${away.score} at ${home.name} ${home.score}${date ? `, ${date}` : ""}`;
    });
    return ["Recent meetings", ...lines];
  }

  function outCols(data, teams) {
    const rank = { out: 0, doubtful: 1, questionable: 2 };
    return teams.map((team) => {
      const block = (data.injuries || []).find((row) => String((row.team || {}).id || "") === team.id) || {};
      const lines = (block.injuries || []).map((item) => {
        const status = String(item.status || "").toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(rank, status)) return null;
        const name = String((item.athlete || {}).displayName || "");
        if (!name) return null;
        const pos = String(((item.athlete || {}).position || {}).abbreviation || "");
        return { status, line: [name, pos, status].filter(Boolean).join(", ") };
      }).filter(Boolean).sort((a, b) => rank[a.status] - rank[b.status]).map((row) => row.line);
      return { title: team.short || team.name, lines };
    }).filter((col) => col.lines.length);
  }

  function slotsOf(doc) {
    const slots = [];
    for (const chart of doc.depthchart || []) {
      const positions = chart.positions || {};
      Object.keys(positions).forEach((key) => {
        const athletes = ((positions[key] || {}).athletes || []).map((ath) => ({ id: String(ath.id || ""), name: ath.displayName || "", spot: SPOT[key] || key })).filter((ath) => ath.id && ath.name);
        if (athletes.length) slots.push(athletes);
      });
    }
    return slots;
  }

  function carryCols(data, teams, docs) {
    const gone = new Set();
    const people = [];
    (data.injuries || []).forEach((block) => {
      const teamId = String((block.team || {}).id || "");
      (block.injuries || []).forEach((item) => {
        const status = String(item.status || "").toLowerCase();
        if (status !== "out" && status !== "injured reserve") return;
        const athlete = item.athlete || {};
        const id = String(athlete.id || "");
        const name = String(athlete.displayName || "");
        if (!id || !name) return;
        gone.add(id);
        const role = String((athlete.position || {}).displayName || "player").toLowerCase();
        const type = String((item.details || {}).type || "");
        const hurt = type && !/not specified/i.test(type) ? type.toLowerCase() : "";
        people.push({ teamId, id, name, role, hurt });
      });
    });
    return teams.map((team, index) => ({
      title: team.short || team.name,
      lines: people.filter((person) => person.teamId === team.id).map((person) => {
      const hits = [];
      slotsOf(docs[index] || {}).forEach((athletes) => { const at = athletes.findIndex((ath) => ath.id === person.id); if (at >= 0) hits.push({ athletes, at }); });
      const fit = hits.filter((row) => { const spot = row.athletes[row.at].spot; return spot === person.role || spot.endsWith(` ${person.role}`) || person.role.endsWith(` ${spot}`); }).sort((a, b) => a.at - b.at);
      const hit = fit[0] || hits.slice().sort((a, b) => a.at - b.at)[0];
      let found = null;
      if (hit) {
        const healthy = hit.athletes.filter((ath) => !gone.has(ath.id));
        found = { spot: hit.athletes[hit.at].spot, next: hit.at === 0 ? healthy.find((ath) => ath.id !== person.id) : healthy[0], starter: hit.at === 0 };
      }
      const tag = person.hurt ? `${person.role} (${person.hurt})` : person.role;
      const lead = `${person.name}, ${tag}, is out.`;
      const spot = found && found.spot.length > 3 ? found.spot : person.role;
      if (!found || !found.next) return lead;
      return found.starter ? `${lead} ${found.next.name} is the next ${spot}.` : `${lead} ${found.next.name} is the ${spot}.`;
      }),
    })).filter((col) => col.lines.length);
  }

  function avgLine(overview) {
    const stats = (overview || {}).statistics || {};
    const names = stats.names || [];
    const split = (stats.splits || []).find((row) => row.displayName === "Regular Season") || (stats.splits || [])[0];
    if (!split) return "";
    return [["avgPoints", "PTS"], ["avgRebounds", "REB"], ["avgAssists", "AST"], ["avgSteals", "STL"], ["avgMinutes", "MIN"]].map(([key, label]) => {
      const at = names.indexOf(key);
      return at >= 0 && split.stats[at] ? `${split.stats[at]} ${label}` : "";
    }).filter(Boolean).join(", ");
  }

  async function startingFive(path, teams, docs, gone) {
    if (!/basketball/.test(path)) return [];
    const spots = { pg: "PG", sg: "SG", sf: "SF", pf: "PF", c: "C" };
    const cols = await Promise.all(teams.map(async (team, index) => {
      const positions = ((((docs[index] || {}).depthchart || [])[0] || {}).positions) || {};
      const picks = Object.keys(spots).map((key) => {
        const athletes = ((positions[key] || {}).athletes) || [];
        const athlete = athletes.find((ath) => !gone.has(String(ath.id))) || athletes[0];
        return athlete ? { key, athlete } : null;
      }).filter(Boolean);
      const lines = await Promise.all(picks.map(async (row) => {
        let line = "";
        try { line = avgLine(await readJson(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${row.athlete.id}/overview`)); }
        catch (err) { line = ""; }
        return `${row.athlete.displayName}, ${spots[row.key]}${line ? `: ${line}` : ""}`;
      }));
      return { title: team.short || team.name, lines };
    }));
    return cols.filter((col) => col.lines.length);
  }

  function teamsOf(data) {
    const teams = (((((data.header || {}).competitions || [])[0] || {}).competitors) || []).map((row) => ({
      id: String((row.team || {}).id || ""),
      name: String((row.team || {}).displayName || ""),
      short: String((row.team || {}).shortDisplayName || (row.team || {}).displayName || ""),
      homeAway: row.homeAway || "",
    })).filter((team) => team.id);
    const away = teams.find((team) => team.homeAway === "away");
    const home = teams.find((team) => team.homeAway === "home");
    return away && home ? [away, home] : teams;
  }

  async function noteGame(game) {
    const path = PATHS[game.sport];
    if (!path) return { sections: [] };
    const id = await espnId(path, game);
    if (!id) return { sections: [] };
    const data = await readJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`);
    const sides = teamsOf(data);
    const gone = new Set();
    (data.injuries || []).forEach((block) => (block.injuries || []).forEach((item) => {
      const status = String(item.status || "").toLowerCase();
      if (status === "out" || status === "injured reserve") gone.add(String((item.athlete || {}).id || ""));
    }));
    const coaches = await Promise.all(sides.map((team) => coachCard(path, team).catch(() => null)));
    const [faced, played, depth] = await Promise.all([
      coachVs(path, coaches[0], coaches[1]).catch(() => []),
      meetings(data, path).catch(() => []),
      Promise.all(sides.map((team) => readJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${team.id}/depthcharts`).catch(() => ({})))),
    ]);
    const five = await startingFive(path, sides, depth, gone).catch(() => []);
    const sky = weather(data, game.sport);
    return { sections: [
      sky ? { name: "Weather", text: sky } : null,
      pack("Coaches", coaches.filter(Boolean).map((coach) => ({ title: coach.name, lines: coach.lines })), versus(coaches[0], coaches[1], faced)),
      pack("Matchup", matchCols(data, sides, game.kickoff), played),
      pack("Who's out", outCols(data, sides), []),
      pack("Who's carrying it", carryCols(data, sides, depth), []),
      pack("Starting five", five, []),
    ].filter(Boolean) };
  }

  window.noteGame = noteGame;
})();
