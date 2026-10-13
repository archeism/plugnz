#!/usr/bin/env python3
"""Verify generated OpenCode hooks against a real 1.19.0 server and loopback model."""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import resource
import signal
import shutil
import socket
import subprocess
import threading
import time
import urllib.request
import uuid

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")

def allocated(path):
    return int(subprocess.check_output(["du", "-s", "-B1", str(path)], text=True).split()[0])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--bun", default="/root/.bun/bin/bun")
    parser.add_argument("--dependency-seed", type=Path, help="Preinstalled official SDK dependencies for an offline native session")
    args = parser.parse_args()
    root = args.out.resolve()
    root.mkdir(parents=True, exist_ok=False)
    work = root / "work"
    work.mkdir()
    nonce = "HOOK_" + uuid.uuid4().hex
    (work / "harmless.txt").write_text("FILE_" + nonce + "\n")
    source = root / "source"
    source.mkdir()
    save(source / "plugin.json", {"name": "context-hook-probe", "version": "0.0.0"})
    handler = source / "context.mjs"
    handler.write_text(
        "import {appendFileSync} from 'node:fs';\n"
        "let raw=''; for await(const chunk of process.stdin) raw+=chunk;\n"
        "const input=JSON.parse(raw);\n"
        "appendFileSync(" + json.dumps(str(root / "events.jsonl")) + ",JSON.stringify(input)+'\\n');\n"
        "console.log(JSON.stringify(input.event==='turn.stop'?{}:{context:"
        + json.dumps(nonce + ":") + "+input.event+':'+input.sessionId}));\n"
    )
    save(source / "plugnz.hooks.json", {"version": 2, "hooks": {
        event: [{"command": ["node", "${PLUGIN_ROOT}/context.mjs"], "requires": {} if event == "turn.stop" else {"context": True}}]
        for event in ["session.start", "turn.stop", "tool.before", "tool.after"]
    }})
    build = [args.bun, "bin/plugnz.mjs", "hooks", "build", str(source),
             "--target", "opencode", "--out", str(root / "built"), "--json"]
    result = subprocess.run(build, cwd=args.repo, capture_output=True, text=True, timeout=45)
    (root / "build.stdout").write_text(result.stdout)
    (root / "build.stderr").write_text(result.stderr)
    if result.returncode:
        raise RuntimeError("Native package build failed; see retained build.stderr")
    requests = []
    counts = {}
    fixture_errors = []
    class Provider(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            length = int(self.headers.get("content-length", "0"))
            if length > 1024 * 1024 or len(requests) >= 10:
                fixture_errors.append("provider request budget exceeded")
                self.send_error(429)
                return
            body = json.loads(self.rfile.read(length))
            text = json.dumps(body.get("messages", []))
            key = "SECOND_" + nonce if "SECOND_" + nonce in text else "FIRST_" + nonce if "FIRST_" + nonce in text else "aux"
            counts[key] = counts.get(key, 0) + 1
            requests.append({"path": self.path, "task": key, "body": body, "time": time.monotonic()})
            with (root / "requests.jsonl").open("a") as stream:
                stream.write(json.dumps(requests[-1]) + "\n")
            call_tool = key != "aux" and counts[key] == 1
            delta = {"tool_calls": [{"index": 0, "id": "read_" + key, "type": "function",
                      "function": {"name": "read", "arguments": json.dumps({"filePath": str(work / "harmless.txt")})}}]} if call_tool else {"content": "PROBE_COMPLETE"}
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "close")
            self.end_headers()
            for part, finish in [({"role": "assistant"}, None), (delta, None), ({}, "tool_calls" if call_tool else "stop")]:
                packet = {"id": "probe-" + str(len(requests)), "object": "chat.completion.chunk", "created": 1,
                          "model": "probe-model", "choices": [{"index": 0, "delta": part, "finish_reason": finish}]}
                self.wfile.write(("data: " + json.dumps(packet) + "\n\n").encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            self.close_connection = True
    provider = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    provider_thread = threading.Thread(target=provider.serve_forever, daemon=True)
    provider_thread.start()
    config_dir = root / "config/opencode"
    config_dir.mkdir(parents=True)
    if args.dependency_seed:
        for name in ["package.json", "package-lock.json"]:
            shutil.copy2(args.dependency_seed / name, config_dir / name)
        shutil.copytree(args.dependency_seed / "node_modules", config_dir / "node_modules", symlinks=True)
        save(root / "dependency-seed.json", {
            "sdk": json.loads((config_dir / "node_modules/@opencode-ai/plugin/package.json").read_text())["version"],
            "lock_sha256": hashlib.sha256((config_dir / "package-lock.json").read_bytes()).hexdigest(),
            "purpose": "Official SDK bootstrap dependencies only; native runtime and hook consumer are unmodified",
        })
    config = {"model": "boundary-probe/probe-model", "small_model": "boundary-probe/probe-model",
              "enabled_providers": ["boundary-probe"], "share": "disabled", "autoupdate": False,
              "plugin": [(root / "built/opencode/plugin.mjs").as_uri()],
              "provider": {"boundary-probe": {"npm": "@ai-sdk/openai-compatible", "name": "Local hook probe",
                  "options": {"baseURL": "http://127.0.0.1:" + str(provider.server_port) + "/v1", "apiKey": "FAKE_LOCAL_ONLY"},
                  "models": {"probe-model": {"name": "Local hook probe", "limit": {"context": 64000, "output": 128}}}}}}
    save(config_dir / "opencode.json", config)
    env = {key: os.environ[key] for key in ["PATH", "HOME", "LANG"] if key in os.environ}
    env.update(XDG_CONFIG_HOME=str(root / "config"), XDG_DATA_HOME=str(root / "data"),
               XDG_STATE_HOME=str(root / "state"), XDG_CACHE_HOME=str(root / "cache"),
               OPENCODE_CONFIG=str(config_dir / "opencode.json"), OPENCODE_CONFIG_DIR=str(config_dir))
    for flag in ["OPENCODE_DISABLE_AUTOUPDATE", "OPENCODE_DISABLE_MODELS_FETCH", "OPENCODE_DISABLE_DEFAULT_PLUGINS",
                 "OPENCODE_DISABLE_EXTERNAL_SKILLS", "OPENCODE_DISABLE_CLAUDE_CODE", "OPENCODE_DISABLE_LSP_DOWNLOAD",
                 "OPENCODE_DISABLE_PROJECT_CONFIG"]:
        env[flag] = "1"
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    command = [str(args.runtime / "node_modules/.bin/opencode"), "serve", "--hostname", "127.0.0.1", "--port", str(port)]
    save(root / "invocation.json", {"argv": command, "cwd": str(work), "env": {k: v for k, v in env.items() if k not in ["PATH", "HOME", "LANG"]},
         "timeout_seconds": 60, "max_model_requests": 10, "max_request_bytes": 1048576,
         "max_evidence_bytes": 64 * 1024 * 1024, "runtime_version": "1.19.0", "build_argv": build})
    before = allocated(root)
    started = time.monotonic()
    operation_deadline = started + 60
    def request(path, body=None, timeout=30):
        remaining = operation_deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Native probe overall deadline exceeded")
        timeout = min(timeout, remaining)
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request("http://127.0.0.1:" + str(port) + path, data=data,
                                     headers={"Content-Type": "application/json", "x-opencode-directory": str(work)})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
    status = "failed"
    sessions = []
    try:
        with (root / "server.stdout").open("wb") as stdout, (root / "server.stderr").open("wb") as stderr:
            proc = subprocess.Popen(command, cwd=work, env=env, stdout=stdout, stderr=stderr,
                                    stdin=subprocess.DEVNULL, start_new_session=True, preexec_fn=limits)
            try:
                save(root / "process.json", {"native_pid": proc.pid, "native_port": port, "provider_port": provider.server_port})
                ready_deadline = min(started + 15, operation_deadline)
                while True:
                    try:
                        health = request("/global/health", timeout=1)
                        save(root / "health.json", health)
                        break
                    except Exception:
                        if time.monotonic() > ready_deadline or proc.poll() is not None:
                            raise RuntimeError("OpenCode server did not become ready")
                        time.sleep(0.1)
                for task in ["FIRST_" + nonce, "SECOND_" + nonce]:
                    session = request("/session", {"title": "Portable hook probe"})
                    sessions.append(session["id"])
                    answer = request("/session/" + session["id"] + "/message", {
                        "model": {"providerID": "boundary-probe", "modelID": "probe-model"},
                        "parts": [{"type": "text", "text": task + ": perform the controlled read"}]}, timeout=20)
                    save(root / (task.split("_")[0].lower() + "-answer.json"), answer)
                    if allocated(root) - before > 64 * 1024 * 1024 or time.monotonic() - started > 55:
                        raise RuntimeError("Native probe resource budget exceeded")
                idle_deadline = min(time.monotonic() + 3, operation_deadline)
                while time.monotonic() < idle_deadline:
                    events = [json.loads(line) for line in (root / "events.jsonl").read_text().splitlines()]
                    if sum(event["event"] == "turn.stop" for event in events) >= 2:
                        break
                    time.sleep(0.05)
                checks = {}
                for index, (task, session) in enumerate(zip(["FIRST_" + nonce, "SECOND_" + nonce], sessions)):
                    actual = [row for row in requests if row["task"] == task]
                    checks["session" + str(index + 1)] = (
                        len(actual) == 2
                        and nonce + ":session.start:" + session in json.dumps(actual[0]["body"])
                        and all(nonce + ":" + event + ":" + session in json.dumps(actual[1]["body"]) for event in ["tool.before", "tool.after"])
                        and "FILE_" + nonce in json.dumps(actual[1]["body"])
                        and sum(row["event"] == "session.start" and row["sessionId"] == session for row in events) == 1
                        and any(row["event"] == "turn.stop" and row["sessionId"] == session for row in events)
                    )
                    foreign = sessions[1 - index]
                    checks["session" + str(index + 1) + "_no_foreign_feedback"] = all(foreign not in json.dumps(row["body"]) for row in actual)
                    checks["session" + str(index + 1) + "_tool_feedback_absent_before_tool"] = bool(actual) and all(":" + name + ":" + session not in json.dumps(actual[0]["body"]) for name in ["tool.before", "tool.after"])
                checks["provider_budget"] = not fixture_errors
                checks["overall_deadline"] = time.monotonic() < operation_deadline
                status = "passed" if all(checks.values()) else "failed"
                save(root / "checks.json", checks)
            finally:
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGTERM)
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait()
    finally:
        provider.shutdown()
        provider.server_close()
        provider_thread.join(timeout=2)
        process_exited = "proc" in locals() and proc.poll() is not None
        process_group_absent = process_exited
        if process_exited:
            try:
                os.killpg(proc.pid, 0)
                process_group_absent = False
            except ProcessLookupError:
                pass
        with socket.socket() as check_socket:
            check_socket.settimeout(1)
            native_listener_closed = check_socket.connect_ex(("127.0.0.1", port)) != 0
        summary = {"hook_config_version": 2, "status": status, "elapsed_seconds": round(time.monotonic() - started, 3),
                   "allocated_growth_bytes": allocated(root) - before, "setup_allocated_bytes": before, "model_request_count": len(requests),
                   "fake_model_usage_only": True, "sessions": sessions, "fixture_errors": fixture_errors,
                   "child_maxrss_kib": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                   "cleanup": {"native_process_exited": process_exited, "native_process_group_absent": process_group_absent,
                               "native_listener_closed": native_listener_closed, "provider_listener_closed": provider.fileno() == -1,
                               "provider_thread_stopped": not provider_thread.is_alive()}}
        if not all(summary["cleanup"].values()):
            status = "failed"
            summary["status"] = status
        save(root / "summary.json", summary)
        print(json.dumps(summary))
    return 0 if status == "passed" else 1

if __name__ == "__main__":
    raise SystemExit(main())
