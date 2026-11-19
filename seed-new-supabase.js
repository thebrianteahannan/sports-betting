#!/usr/bin/env node
/**
 * Seed the new Parlay Supabase project from local output/ files.
 * Run after docs/supabase-setup.sql succeeds:
 *   node seed-new-supabase.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
    const cut = line.trim();
    if (!cut || cut.startsWith("#") || !cut.includes("=")) continue;
    const i = cut.indexOf("=");
    const name = cut.slice(0, i);
    let val = cut.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (name) process.env[name] = val;
  }
}

async function sb(pathname, options = {}) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(url + "/rest/v1/" + pathname, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error("Supabase " + res.status + (text ? ": " + text.slice(0, 300) : ""));
  return text ? JSON.parse(text) : null;
}

async function put(k, v) {
  await sb("kv", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { k, v },
  });
  console.log("wrote", k);
}

function readJson(name, fallback) {
  const file = path.join(__dirname, "output", name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function archiveTag(tickets) {
  return crypto.createHash("sha1").update(JSON.stringify(tickets || [])).digest("hex").slice(0, 12);
}

(async () => {
  loadEnv();
  const host = new URL(process.env.SUPABASE_URL).host;
  console.log("seeding", host);

  const probe = await sb("kv?select=k&limit=1");
  console.log("kv ok", Array.isArray(probe));

  const board = readJson("board.json", {});
  const archive = readJson("archive.json", { tickets: [] });
  const ignored = readJson("ignored.json", { tickets: [] });
  const picks = readJson("picks.json", { picks: [] });
  const members = readJson("members.json", { users: [], sessions: {}, activity: [] });

  const tickets = Array.isArray(archive.tickets) ? archive.tickets : [];
  await put("bets/board.json", board);
  await put("bets/archive.json", { tickets, tag: archiveTag(tickets) });
  await put("bets/ignored.json", ignored);
  await put("bets/picks.json", Array.isArray(picks.picks) ? picks : { picks: [] });

  const users = Array.isArray(members.users) ? members.users : [];
  if (users.length) {
    await put("bets/members.json", {
      users,
      sessions: members.sessions && typeof members.sessions === "object" ? members.sessions : {},
      activity: Array.isArray(members.activity) ? members.activity : [],
    });
    console.log("members users", users.length, "(local file — may be stale vs old project)");
  } else {
    await put("bets/members.json", { users: [], sessions: {}, activity: [] });
    console.log("members empty — people will need to join again unless we import from the old project");
  }

  console.log("done");
})().catch((err) => {
  console.error(String(err && err.message || err));
  process.exit(1);
});
