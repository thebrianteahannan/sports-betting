/** Game notes from the public page, for when the desk comes back empty. */

(function () {
  const PATHS = {
    NFL: "football/nfl", NBA: "basketball/nba", MLB: "baseball/mlb",
    NHL: "hockey/nhl", WNBA: "basketball/wnba",
  };

  function clip(text, max) {
    const line = String(text || "").replace(/\s+/g, " ").trim();
    if (line.length <= max) return line;
    const cut = line.slice(0, max);
    const stop = cut.lastIndexOf(" ");
    return `${(stop > 40 ? cut.slice(0, stop) : cut).trim()}…`;
  }

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

  function teamsOf(data) {
    return (((((data.header || {}).competitions || [])[0] || {}).competitors) || []).map((row) => ({
      id: String((row.team || {}).id || ""),
      name: String((row.team || {}).displayName || ""),
      short: String((row.team || {}).shortDisplayName || (row.team || {}).displayName || ""),
    })).filter((team) => team.id);
  }

  async function coachLine(path, team) {
    const data = await readJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${team.id}/roster`);
    const coach = ((data && data.coach) || [])[0];
    if (!coach || !coach.lastName) return "";
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
    const years = Number(coach.experience);
    const season = Number.isFinite(years) && years > 0 ? `, year ${years}` : "";
    return `${name} coaches the ${team.short || team.name}${season}.`;
  }

  function records(data) {
    const comps = ((((data.header || {}).competitions || [])[0] || {}).competitors) || [];
    return comps.map((row) => {
      const name = String((row.team || {}).displayName || "");
      const total = (row.record || []).find((item) => item.type === "total");
      const place = (row.record || []).find((item) => item.type === (row.homeAway === "home" ? "home" : "road") || item.type === row.homeAway);
      const spot = place ? `${place.summary} ${row.homeAway === "home" ? "at home" : "on the road"}` : "";
      const bits = [total && total.summary, spot].filter(Boolean);
      return name && bits.length ? `${name} are ${bits.join(", ")}.` : "";
    }).filter(Boolean).join(" ");
  }

  function rest(data, kickoff) {
    const start = Date.parse(kickoff || "");
    return (data.lastFiveGames || []).map((row) => {
      const team = String((row.team || {}).shortDisplayName || (row.team || {}).displayName || "");
      const last = (row.events || []).map((event) => Date.parse(event.gameDate || "")).filter((stamp) => Number.isFinite(stamp) && (!Number.isFinite(start) || stamp < start)).sort((a, b) => b - a)[0];
      if (!team || !Number.isFinite(last) || !Number.isFinite(start)) return "";
      const days = Math.round((start - last) / 86400000);
      const word = days === 1 ? "day" : "days";
      return days >= 13 ? `${team} are off a bye, ${days} ${word} since the last game.` : `${team} have ${days} ${word} since the last game.`;
    }).filter(Boolean).join(" ");
  }

  function form(data) {
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
    return (data.lastFiveGames || []).map((row) => {
      const team = String((row.team || {}).shortDisplayName || (row.team || {}).displayName || "");
      const bits = (row.events || []).slice(0, 5).map((event) => {
        const foe = (event.opponent || {}).abbreviation || (event.opponent || {}).displayName || "";
        const day = Date.parse(event.gameDate || "");
        const stamp = Number.isFinite(day) ? ` ${when.format(day)}` : "";
        return `${event.gameResult || ""} ${event.score || ""} ${event.atVs || ""} ${foe}${stamp}`.replace(/\s+/g, " ").trim();
      }).filter(Boolean);
      return team && bits.length ? `${team} recent games: ${bits.join(", ")}.` : "";
    }).filter(Boolean).join(" ");
  }

  function outs(data) {
    const rank = { out: 0, doubtful: 1, questionable: 2 };
    return (data.injuries || []).map((block) => {
      const team = String((block.team || {}).displayName || "");
      const rows = (block.injuries || []).map((item) => {
        const status = String(item.status || "").toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(rank, status)) return null;
        const name = String((item.athlete || {}).displayName || "");
        if (!name) return null;
        const pos = String(((item.athlete || {}).position || {}).abbreviation || "");
        return { status, line: `${name}${pos ? `, ${pos}` : ""}, ${status}` };
      }).filter(Boolean).sort((a, b) => rank[a.status] - rank[b.status]);
      return rows.length ? `${team}: ${rows.map((row) => row.line).join("; ")}.` : "";
    }).filter(Boolean).join(" ");
  }

  async function meetings(data, path) {
    const sides = teamsOf(data).map((team) => team.id);
    if (sides.length < 2) return "";
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
    if (!games.length) return "";
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const lines = games.map((game) => {
      const away = game.rows.find((row) => row.where === "away") || game.rows[0] || {};
      const home = game.rows.find((row) => row.where === "home") || game.rows[1] || {};
      const date = Number.isFinite(game.when) ? when.format(game.when) : "";
      return `${away.name} ${away.score} at ${home.name} ${home.score}${date ? `, ${date}` : ""}`;
    });
    return `Recent meetings: ${lines.join(". ")}.`;
  }

  function leaders(data) {
    return (data.leaders || []).map((side) => {
      const team = String((side.team || {}).shortDisplayName || (side.team || {}).displayName || "");
      const bits = (side.leaders || []).slice(0, 3).map((cat) => {
        const top = (cat.leaders || [])[0];
        const who = String((top && top.athlete && top.athlete.displayName) || "");
        const value = String((top && top.displayValue) || "");
        return who && value ? `${who} leads ${String(cat.displayName || "").toLowerCase()} at ${value}` : "";
      }).filter(Boolean);
      return team && bits.length ? `${team}: ${bits.join(". ")}.` : "";
    }).filter(Boolean).join(" ");
  }

  async function playing(path, teams, data) {
    const notes = [];
    const seen = new Set();
    (data.injuries || []).forEach((block) => {
      (block.injuries || []).forEach((item) => {
        const comment = String(item.longComment || item.shortComment || "");
        if (!/playing time|snaps|gets the start|starting lineup|more minutes|will start|inactive/i.test(comment)) return;
        const name = String((item.athlete || {}).displayName || "");
        if (name) notes.push(`${name}: ${clip(comment, 180)}`);
      });
    });
    for (const team of teams) {
      let news = {};
      try { news = await readJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/news?limit=8&team=${team.id}`); }
      catch (err) { continue; }
      for (const article of (news.articles || []).slice(0, 8)) {
        const head = String(article.headline || "").replace(/\s+/g, " ").trim();
        if (!head || seen.has(head)) continue;
        const text = [head, article.description].filter(Boolean).join(". ");
        if (!/playing time|snaps|more snaps|will start|starting in place|inactive|ruled out/i.test(text)) continue;
        seen.add(head);
        notes.push(clip(text, 240));
      }
    }
    return notes.slice(0, 4).join(" ");
  }

  async function noteGame(game) {
    const path = PATHS[game.sport];
    if (!path) return { sections: [] };
    const id = await espnId(path, game);
    if (!id) return { sections: [] };
    const data = await readJson(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`);
    const sides = teamsOf(data);
    const [coachBits, played, time] = await Promise.all([
      Promise.all(sides.map((team) => coachLine(path, team).catch(() => ""))),
      meetings(data, path).catch(() => ""),
      playing(path, sides, data).catch(() => ""),
    ]);
    return {
      sections: [
        ["Weather", weather(data, game.sport)],
        ["Coaches", coachBits.filter(Boolean).join(" ")],
        ["Matchup", [records(data), rest(data, game.kickoff), form(data), played].filter(Boolean).join(" ")],
        ["Who's out", outs(data)],
        ["Playing time", time],
        ["Who's carrying it", leaders(data)],
      ].filter((row) => row[1]).map(([name, text]) => ({ name, text })),
    };
  }

  window.noteGame = noteGame;
})();
