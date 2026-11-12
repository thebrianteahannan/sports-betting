/** The home page's scripts joined into one file, in page order, so a first visit makes one request instead of 55. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATIC = path.join(__dirname, "nfl_bets", "static");
const TAG = /<script src="\/([\w\-]+\.js)\?v=\d+"><\/script>/g;
let made = null;

function bundlePage() {
  const html = fs.readFileSync(path.join(STATIC, "index.html"), "utf8");
  const names = [...html.matchAll(TAG)].map((match) => match[1]);
  const key = html + names.map((name) => fs.statSync(path.join(STATIC, name)).mtimeMs).join(",");
  if (made && made.key === key) return made;
  const body = names.map((name) => `${fs.readFileSync(path.join(STATIC, name), "utf8")}\n;`).join("\n");
  const hash = crypto.createHash("sha1").update(body).digest("hex").slice(0, 12);
  let first = true;
  const page = html.replace(TAG, () => (first ? ((first = false), `<script src="/bundle.js?v=${hash}"></script>`) : ""));
  made = { key, page, body };
  return made;
}

module.exports = { bundlePage };
