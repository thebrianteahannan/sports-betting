#!/usr/bin/env python3
"""Send one-file plan steps to the local 9B and write the edits."""

import json
import os
import re
import shutil
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL_URL = "http://127.0.0.1:1234/v1/chat/completions"
MODEL_ID = "qwen3-coder-30b"
DEFAULT_REPO = Path.home() / "Documents" / "sports-betting"
SITE_LOG = Path.home() / "Library/Logs/ai-server/sports-betting.log"
MAX_STEPS = 40
SYSTEM = (
    "You apply one edit to one file. "
    "Reply with a single SEARCH/REPLACE block and no other text. "
    "SEARCH must be copied from the file exactly."
)
BLOCK_RE = re.compile(
    r"<<<<<<< SEARCH\s*\n(.*)\n=======\s*\n(.*)\n>>>>>>> REPLACE",
    re.S,
)
FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I)


def node_bin():
    found = shutil.which("node")
    if found:
        return found
    bundled = Path("/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node")
    if bundled.is_file():
        return str(bundled)
    raise RuntimeError("node is not installed.")


def stop_site(port=3000):
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        return
    for bit in out.split():
        try:
            os.kill(int(bit), signal.SIGTERM)
        except OSError:
            pass
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            subprocess.check_output(
                ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            return
        time.sleep(0.2)


def restart_site(repo):
    if not (repo / "server.js").is_file():
        return "This repo has no server.js, so the site was left running."
    stop_site()
    SITE_LOG.parent.mkdir(parents=True, exist_ok=True)
    log = SITE_LOG.open("a")
    subprocess.Popen(
        [node_bin(), "server.js"],
        cwd=repo,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:3000/", timeout=2) as resp:
                if resp.status == 200:
                    return "Site restarted at http://127.0.0.1:3000"
        except (OSError, urllib.error.URLError):
            time.sleep(0.3)
    return "The site process started, but port 3000 is not answering yet."


def model_ready():
    try:
        with urllib.request.urlopen("http://127.0.0.1:1234/v1/models", timeout=3) as resp:
            data = json.loads(resp.read().decode())
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return False
    return any(item.get("id") == MODEL_ID for item in data.get("data", []))


def parse_plan(text, repo_override=""):
    raw = text.strip()
    raw = FENCE_RE.sub("", raw).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("The plan needs one JSON object.")
    try:
        data = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        raise ValueError("That is not valid JSON. Ask Grok to reply with the object only.")
    if not isinstance(data, dict):
        raise ValueError("The plan needs one JSON object.")
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValueError("The plan has no steps.")
    if len(steps) > MAX_STEPS:
        raise ValueError(f"A plan can have up to {MAX_STEPS} steps.")
    repo_text = (repo_override or data.get("repo") or str(DEFAULT_REPO)).strip()
    repo = Path(repo_text).expanduser().resolve()
    if not repo.is_dir():
        raise ValueError(f"Repo folder does not exist: {repo}")
    clean = []
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            raise ValueError(f"Step {index} is not an object.")
        rel = str(step.get("file") or "").strip()
        task = str(step.get("task") or "").strip()
        find = step.get("find")
        if find is not None:
            find = str(find)
        replace = step.get("replace")
        if replace is not None:
            replace = str(replace)
        if not rel:
            raise ValueError(f"Step {index} is missing a file.")
        if find is None and replace is None and not task:
            raise ValueError(f"Step {index} needs a task or the exact find and replace text.")
        clean.append({
            "file": rel,
            "task": task or "Apply the planned edit.",
            "find": find,
            "replace": replace,
        })
    return {"repo": repo, "steps": clean}


def resolve_file(repo, rel):
    rel = rel.strip().lstrip("/")
    if not rel or rel.startswith("..") or "/../" in f"/{rel}/":
        raise ValueError("The file path has to stay inside the repo.")
    path = (repo / rel).resolve()
    if path != repo and repo not in path.parents:
        raise ValueError("That file is outside the repo.")
    parts = set(path.parts)
    if ".git" in parts or "node_modules" in parts or path.name.startswith(".env"):
        raise ValueError("That path is off limits.")
    return path


def nearby(text, needle):
    if not needle:
        return text if len(text) <= 8000 else None
    idx = text.find(needle)
    if idx < 0:
        return None
    lines = text.split("\n")
    start = text[:idx].count("\n")
    end = start + needle.count("\n")
    chunk = "\n".join(lines[max(0, start - 12) : min(len(lines), end + 13)])
    if len(chunk) <= 12000:
        return chunk
    return needle if len(needle) <= 12000 else None


def build_prompt(step, excerpt):
    parts = [f"File: {step['file']}", f"Task: {step['task']}"]
    if step["find"] is not None and step["replace"] is not None:
        parts.append("Use this SEARCH text exactly:\n" + step["find"])
        parts.append("Use this REPLACE text exactly:\n" + step["replace"])
    parts.append("File text:\n" + excerpt)
    parts.append(
        "Reply in this shape only:\n"
        "<<<<<<< SEARCH\n"
        "exact lines from the file\n"
        "=======\n"
        "new lines\n"
        ">>>>>>> REPLACE"
    )
    return "\n\n".join(parts)


def call_model(prompt):
    body = {
        "model": MODEL_ID,
        "temperature": 0,
        "max_tokens": 4096,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
    }
    req = urllib.request.Request(
        MODEL_URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    started = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode())
    message = data["choices"][0]["message"]
    content = message.get("content") or ""
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
    usage = data.get("usage") or {}
    return {
        "reply": content,
        "seconds": round(time.time() - started, 1),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
    }


def parse_block(reply):
    match = BLOCK_RE.search(reply or "")
    if not match:
        return None, None
    return match.group(1), match.group(2)


def same_file(file_text, left, right):
    return file_text.replace(left[0], left[1], 1) == file_text.replace(right[0], right[1], 1)


def choose_edit(file_text, step, model_search, model_replace):
    find = step["find"]
    planned = find is not None and step["replace"] is not None and find != ""
    if planned:
        count = file_text.count(find)
        if count != 1:
            why = "missing" if count == 0 else f"found {count} times"
            return None, f"The plan's find text is {why} in the file."
        plan_edit = (find, step["replace"])
        model_once = model_search and file_text.count(model_search) == 1
        if model_once and same_file(file_text, (model_search, model_replace), plan_edit):
            note = "The 9B returned this edit."
        elif not model_search:
            note = "The 9B reply had no edit block. Wrote the plan text."
        else:
            note = "The 9B changed the new text. Wrote the plan text."
        return plan_edit, note
    if model_search and file_text.count(model_search) == 1:
        return (model_search, model_replace), "The 9B wrote this edit."
    if model_search and file_text.count(model_search) > 1:
        return None, "The 9B's old text matches more than once."
    return None, "The 9B's old text is not in the file."


def run_plan(plan, backup_dir, on_update):
    repo = plan["repo"]
    backup_dir.mkdir(parents=True, exist_ok=True)
    saved = set()
    written = []
    results = []

    def finish(ok):
        note = ""
        if written:
            try:
                note = restart_site(repo)
            except Exception as exc:
                note = "The files were written. The site did not restart: " + str(exc)
        on_update(results, written, True, ok, note)
        return results, written

    for index, step in enumerate(plan["steps"]):
        row = {
            "n": index + 1,
            "file": step["file"],
            "task": step["task"],
            "status": "running",
            "detail": "Sending this step to the 9B.",
        }
        results.append(row)
        on_update(results, written, False, None)
        try:
            path = resolve_file(repo, step["file"])
            if not path.is_file():
                raise ValueError("That file does not exist.")
            original = path.read_text(encoding="utf-8")
            if "\x00" in original:
                raise ValueError("That file is binary.")
            if step["find"]:
                count = original.count(step["find"])
                if count != 1:
                    why = "not in the file" if count == 0 else f"in the file {count} times"
                    raise ValueError(f"The find text is {why}. Ask Grok to copy a longer unique snippet.")
            excerpt = nearby(original, step["find"] or "")
            if excerpt is None:
                raise ValueError("This file is too big for a small request. Ask Grok to include find and replace.")
            called = call_model(build_prompt(step, excerpt))
            row["seconds"] = called["seconds"]
            row["prompt_tokens"] = called["prompt_tokens"]
            row["completion_tokens"] = called["completion_tokens"]
            search, replace = parse_block(called["reply"])
            edit, note = choose_edit(original, step, search, replace)
            if edit is None:
                raise ValueError(note)
            find, new_text = edit
            updated = original.replace(find, new_text, 1)
            if updated == original:
                raise ValueError("The edit did not change the file.")
            if step["file"] not in saved:
                dest = backup_dir / step["file"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(original, encoding="utf-8")
                saved.add(step["file"])
            path.write_text(updated, encoding="utf-8")
            written.append(step["file"])
            row["status"] = "done"
            row["detail"] = note
        except Exception as exc:
            row["status"] = "failed"
            row["detail"] = str(exc)
            for later in plan["steps"][index + 1 :]:
                results.append({
                    "n": len(results) + 1,
                    "file": later["file"],
                    "task": later["task"],
                    "status": "skipped",
                    "detail": "Stopped because an earlier step failed.",
                })
            return finish(False)
        on_update(results, written, False, None)
    return finish(True)
