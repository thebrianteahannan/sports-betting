const fs = require("fs");
const path = require("path");

const FILES = {
  "readme.pdf": ["docs", "README.pdf"],
  "product.pdf": ["docs", "product.pdf"],
  "risks.pdf": ["docs", "risks.pdf"],
  "business-model.pdf": ["docs", "business-model.pdf"],
  "agreement.pdf": ["docs", "agreement.pdf"],
  "marketing-overview.pdf": ["docs", "marketing", "overview.pdf"],
  "marketing-posts.pdf": ["docs", "marketing", "posts.pdf"],
};

function createDocs(root) {
  return function sendDoc(req, res, name) {
    const parts = FILES[String(name || "").toLowerCase()];
    if (!parts) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : '{"error":"not found"}');
      return;
    }
    fs.readFile(path.join(root, ...parts), (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(req.method === "HEAD" ? undefined : '{"error":"not found"}');
        return;
      }
      const total = data.length;
      let start = 0;
      let end = Math.max(0, total - 1);
      let status = 200;
      const spec = req.method === "HEAD" ? "" : String(req.headers.range || "");
      if (spec.startsWith("bytes=")) {
        const [left, right] = spec.slice(6).split(",")[0].split("-");
        if (!left && right) start = Math.max(0, total - Number(right));
        else {
          start = left ? Number(left) : 0;
          if (right) end = Number(right);
        }
        status = 206;
      }
      if (total) {
        start = Math.min(Math.max(0, start), total - 1);
        end = Math.min(Math.max(start, end), total - 1);
      }
      const headers = {
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${parts[parts.length - 1]}"`,
      };
      if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
      const chunk = data.subarray(start, end + 1);
      headers["Content-Length"] = req.method === "HEAD" ? 0 : chunk.length;
      res.writeHead(status, headers);
      res.end(req.method === "HEAD" ? undefined : chunk);
    });
  };
}

module.exports = { createDocs };
