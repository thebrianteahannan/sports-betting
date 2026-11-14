#!/usr/bin/env python3
"""Local page: paste a Grok plan, send each step to the 9B."""

import json
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import engine

HOST = "0.0.0.0"
PORT = 8791
PAGE = Path(__file__).with_name("index.html")
BACKUP_ROOT = Path.home() / ".ai-server" / "plan-backups"
LOCK = threading.Lock()
JOBS = {}
CURRENT = {"id": None}


def public_job(job):
    return {
        "id": job["id"],
        "done": job["done"],
        "ok": job["ok"],
        "error": job["error"],
        "repo": job["repo"],
        "backup": job["backup"],
        "written": list(job["written"]),
        "site": job.get("site") or "",
        "steps": [dict(step) for step in job["steps"]],
    }


def remember(job_id, results, written, done, ok, site=""):
    with LOCK:
        job = JOBS[job_id]
        job["steps"] = results
        job["written"] = written
        job["done"] = done
        if site:
            job["site"] = site
        if done:
            job["ok"] = ok


def worker(job_id, plan):
    backup = BACKUP_ROOT / job_id

    def on_update(results, written, done, ok, site=""):
        remember(job_id, results, written, done, ok, site)

    try:
        engine.run_plan(plan, backup, on_update)
    except Exception as exc:
        with LOCK:
            job = JOBS[job_id]
            job["done"] = True
            job["ok"] = False
            job["error"] = str(exc)


def start_job(text, repo_override):
    plan = engine.parse_plan(text, repo_override)
    if not engine.model_ready():
        raise RuntimeError("The 9B is not answering on port 1234.")
    with LOCK:
        current = JOBS.get(CURRENT["id"])
        if current and not current["done"]:
            raise RuntimeError("A plan is already running.")
        job_id = datetime.now().strftime("%Y%m%d-%H%M%S")
        job = {
            "id": job_id,
            "done": False,
            "ok": None,
            "error": None,
            "repo": str(plan["repo"]),
            "backup": str(BACKUP_ROOT / job_id),
            "written": [],
            "steps": [],
        }
        JOBS[job_id] = job
        CURRENT["id"] = job_id
    threading.Thread(target=worker, args=(job_id, plan), daemon=True).start()
    return job


def restore_job(job_id):
    with LOCK:
        job = JOBS.get(job_id)
        if job is None:
            raise ValueError("That run is not in memory. Use the backup folder.")
        if not job["done"]:
            raise RuntimeError("Wait until the run finishes.")
        written = list(job["written"])
        repo = Path(job["repo"])
        backup = Path(job["backup"])
    restored = []
    for rel in written:
        src = backup / rel
        dest = engine.resolve_file(repo, rel)
        if not src.is_file():
            raise ValueError(f"Backup missing for {rel}")
        dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        restored.append(rel)
    return restored


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[plan-runner] {self.address_string()} {fmt % args}")

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 2_000_000:
            raise ValueError("That plan is too large.")
        raw = self.rfile.read(length).decode() if length else "{}"
        return json.loads(raw)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            body = PAGE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/health":
            self.send_json(200, {"model": engine.model_ready()})
            return
        if path == "/api/job":
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            job_id = ""
            for bit in query.split("&"):
                if bit.startswith("id="):
                    job_id = bit[3:]
            with LOCK:
                job = JOBS.get(job_id) if job_id else JOBS.get(CURRENT["id"])
                payload = public_job(job) if job else None
            self.send_json(200, {"job": payload})
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            data = self.read_json()
            if path == "/api/run":
                job = start_job(data.get("plan") or "", data.get("repo") or "")
                self.send_json(200, {"job": public_job(job)})
                return
            if path == "/api/restore":
                restored = restore_job(str(data.get("id") or ""))
                self.send_json(200, {"restored": restored})
                return
            self.send_json(404, {"error": "Not found"})
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Plan runner: http://127.0.0.1:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
