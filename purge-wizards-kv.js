#!/usr/bin/env node
/**
 * Delete leftover Wizards of Wiff rows from the shared Supabase kv table.
 * Keeps only keys that start with "bets/" (Parlay of the Day).
 *
 * Usage:
 *   node purge-wizards-kv.js          # dry run — list what would go
 *   node purge-wizards-kv.js --apply  # delete non-bets keys
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or the environment).
 * Will fail with 402 while the org is still egress-locked — unlock first.
 */

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const WIZARDS_FILES = new Set([
  "roster.json",
  "schedule.json",
  "availability.json",
  "tournament.json",
  "practice.json",
  "announcements.json",
  "jerseys.json",
  "contacts.json",
  "recruits.json",
  "fees.json",
  "activity.json",
  "accounts.json",
  "strategy.json",
  "lineups.json",
]);

function loadEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const cut = line.trim();
    if (!cut || cut.startsWith("#") || !cut.includes("=")) continue;
    const i = cut.indexOf("=");
    const name = cut.slice(0, i);
    let val = cut.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (name && !process.env[name]) process.env[name] = val;
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
  if (!res.ok) throw new Error("Supabase " + res.status + (text ? ": " + text.slice(0, 240) : ""));
  return text ? JSON.parse(text) : [];
}

function classify(k) {
  if (String(k || "").startsWith("bets/")) return "keep";
  if (WIZARDS_FILES.has(k)) return "wizards";
  return "other";
}

(async () => {
  loadEnv();
  const rows = await sb("kv?select=k&order=k");
  const keys = (Array.isArray(rows) ? rows : []).map((row) => String(row.k || "")).filter(Boolean);
  const keep = keys.filter((k) => classify(k) === "keep");
  const drop = keys.filter((k) => classify(k) !== "keep");
  const wizards = drop.filter((k) => classify(k) === "wizards");
  const other = drop.filter((k) => classify(k) === "other");

  console.log("kv keys:", keys.length);
  console.log("keep (bets/):", keep.length);
  console.log("drop Wizards files:", wizards.length, wizards.length ? wizards.join(", ") : "");
  console.log("drop other non-bets:", other.length, other.length ? other.join(", ") : "");

  if (!drop.length) {
    console.log("Nothing to delete. Project is already Parlay-only.");
    return;
  }
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to delete the drop list.");
    return;
  }

  let gone = 0;
  for (const k of drop) {
    await sb("kv?k=eq." + encodeURIComponent(k), { method: "DELETE", prefer: "return=minimal" });
    gone += 1;
    console.log("deleted", k);
  }
  console.log("Deleted", gone, "keys. Kept", keep.length, "bets/ keys.");
})().catch((err) => {
  console.error(String(err && err.message || err));
  process.exit(1);
});
