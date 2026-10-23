#!/usr/bin/env python3
"""Verify installed OpenCode portable agents through a real 1.19.0 server and loopback model.

Public `plugnz install` compiles the owned package + loader; this probe then asks
the native server to discover the agents (GET /agent) and makes an actual native
`task` child run per role. Child HTTP requests must carry the exact authored
prose, the resolved model (or the parent model when omitted), and native tools.
"""
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

FIXTURE = "portable-review"


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def allocated(path):
    return int(subprocess.check_output(["du", "-s", "-B1", str(path)], text=True).split()[0])


def agent_markdown(name, extra="", body=""):
    return f"---\nname: {name}\ndescription: {name} probe agent\n{extra}---\n{body}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--bun", default="/root/.bun/bin/bun")
    parser.add_argument("--dependency-seed", type=Path, required=True)
    args = parser.parse_args()
    root = args.out.resolve()
    root.mkdir(parents=True, exist_ok=False)
    work = root / "work"
    work.mkdir()
    nonce = "AGENT_" + uuid.uuid4().hex
    home = root / "home"
    config_dir = home / ".config" / "opencode"
    config_dir.mkdir(parents=True)
    (home / ".open-plugin").mkdir(parents=True)
    save(home / ".open-plugin" / "model-aliases.json", {
        "version": 1,
        "modelAliases": {"smart": {"opencode": "boundary-probe/user-alias-model"}},
    })
    source = root / "source"
    source.mkdir()
    bodies = {
        "explicit": f"\n{nonce}_explicit\n  preserved indentation\nEND_{nonce}\n\n",
        "user-alias": f"\n{nonce}_user_alias\n  preserved indentation\nEND_{nonce}\n\n",
        "package-alias": f"\n{nonce}_package_alias\n  preserved indentation\nEND_{nonce}\n\n",
        "omitted": f"\n{nonce}_omitted\n  preserved indentation\nEND_{nonce}\n\n",
        "unavailable": f"\n{nonce}_unavailable\n  preserved indentation\nEND_{nonce}\n\n",
    }
    save(source / "plugin.json", {"name": FIXTURE, "version": "1.0.0", "description": "OpenCode portable agent probe"})
    save(source / "plugnz.agents.json", {
        "version": 1,
        "modelAliases": {"local": {"opencode": "boundary-probe/pkg-only-model"}},
    })
    (source / "agents").mkdir()
    (source / "agents" / "explicit.md").write_text(agent_markdown(
        "explicit", "modelAlias: smart\nmodels:\n  opencode: boundary-probe/explicit-model\n", bodies["explicit"]))
    (source / "agents" / "user-alias.md").write_text(agent_markdown("user-alias", "modelAlias: smart\n", bodies["user-alias"]))
    (source / "agents" / "package-alias.md").write_text(agent_markdown("package-alias", "modelAlias: local\n", bodies["package-alias"]))
    (source / "agents" / "omitted.md").write_text(agent_markdown("omitted", "", bodies["omitted"]))
    (source / "agents" / "unavailable.md").write_text(agent_markdown(
        "unavailable", "models:\n  opencode: boundary-probe/nonexistent-model\n", bodies["unavailable"]))
    runtime_bin = args.runtime / "node_modules/.bin/opencode"
    env = {key: os.environ[key] for key in ["PATH", "LANG"] if key in os.environ}
    env.update(
        HOME=str(home), XDG_CONFIG_HOME=str(home / ".config"), XDG_DATA_HOME=str(home / ".local/share"),
        XDG_STATE_HOME=str(home / ".local/state"), XDG_CACHE_HOME=str(home / ".cache"),
        OPEN_PLUGIN_HOME=str(home / ".open-plugin"), OPEN_PLUGIN_OPENCODE_ROOT=str(config_dir),
        OPEN_PLUGIN_OPENCODE_BIN=str(runtime_bin),
    )
    for flag in ["OPENCODE_DISABLE_AUTOUPDATE", "OPENCODE_DISABLE_MODELS_FETCH", "OPENCODE_DISABLE_EXTERNAL_SKILLS",
                 "OPENCODE_DISABLE_CLAUDE_CODE", "OPENCODE_DISABLE_LSP_DOWNLOAD", "OPENCODE_DISABLE_PROJECT_CONFIG"]:
        env[flag] = "1"
    install = [args.bun, "bin/plugnz.mjs", "install", str(source), "--target", "opencode", "--json"]
    result = subprocess.run(install, cwd=args.repo, env=env, capture_output=True, text=True, timeout=60)
    (root / "install.stdout").write_text(result.stdout)
    (root / "install.stderr").write_text(result.stderr)
    if result.returncode:
        raise RuntimeError("Public install failed; see retained install.stderr")

    expected = {
        "explicit": {"resolved": "explicit-model", "child": "explicit-model"},
        "user-alias": {"resolved": "user-alias-model", "child": "user-alias-model"},
        "package-alias": {"resolved": "pkg-only-model", "child": "pkg-only-model"},
        "omitted": {"resolved": None, "child": "parent-model"},
        "unavailable": {"resolved": "nonexistent-model", "child": None},
    }
    requests = []
    fixture_errors = []
    sse_packets = {}
    class Provider(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            length = int(self.headers.get("content-length", "0"))
            if length > 2 * 1024 * 1024 or len(requests) >= 40:
                fixture_errors.append("provider request budget exceeded")
                self.send_error(429)
                return
            body = json.loads(self.rfile.read(length))
            messages = body.get("messages", [])
            texts = [item.get("content") for item in messages if isinstance(item.get("content"), str)]
            system = next((text for item in messages if item.get("role") == "system" for text in [item.get("content")] if isinstance(text, str)), "")
            role = next((name for name, text in bodies.items() if system.startswith(text)), None)
            tool_seen = any(item.get("role") == "tool" for item in messages)
            call = None
            if role is None and not tool_seen:
                marker = next((name for name in expected if any(isinstance(text, str) and f"CALL_TASK:{name}" in text for text in texts)), None)
                if marker is not None:
                    call = marker
            row = {"path": self.path, "system_role": role, "call": call, "model": body.get("model"),
                   "headers": {key.lower(): value for key, value in self.headers.items()},
                   "tools": sorted(tool.get("function", {}).get("name", "") for tool in body.get("tools", []) if isinstance(tool, dict)),
                   "body": body, "time": time.monotonic()}
            requests.append(row)
            with (root / "requests.jsonl").open("a") as stream:
                stream.write(json.dumps({key: value for key, value in row.items() if key != "body"}) + "\n")
            if call is not None:
                delta = {"tool_calls": [{"index": 0, "id": "task_" + call, "type": "function",
                          "function": {"name": "task", "arguments": json.dumps({
                              "description": "Run " + call,
                              "prompt": "Return CHILD_OK",
                              "subagent_type": FIXTURE + ":" + call,
                          })}}]}
                finish = "tool_calls"
            else:
                delta = {"content": "CHILD_OK" if role is not None else "PARENT_DONE"}
                finish = "stop"
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "close")
            self.end_headers()
            for part, finish_reason in [({"role": "assistant"}, None), (delta, None), ({}, finish)]:
                packet = {"id": "probe-" + str(len(requests)), "object": "chat.completion.chunk", "created": 1,
                          "model": "probe-model", "choices": [{"index": 0, "delta": part, "finish_reason": finish_reason}]}
                self.wfile.write(("data: " + json.dumps(packet) + "\n\n").encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            self.close_connection = True
    provider = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    provider_thread = threading.Thread(target=provider.serve_forever, daemon=True)
    provider_thread.start()

    for name in ["package.json", "package-lock.json"]:
        shutil.copy2(args.dependency_seed / name, config_dir / name)
    shutil.copytree(args.dependency_seed / "node_modules", config_dir / "node_modules", symlinks=True)
    save(root / "dependency-seed.json", {
        "sdk": json.loads((config_dir / "node_modules/@opencode-ai/plugin/package.json").read_text())["version"],
        "lock_sha256": hashlib.sha256((config_dir / "package-lock.json").read_bytes()).hexdigest(),
        "purpose": "Official SDK bootstrap dependencies only; native runtime and hook consumer are unmodified",
    })
    models = {"parent-model": "Parent fixture model"}
    for name in ["explicit-model", "user-alias-model", "pkg-only-model"]:
        models[name] = "Fixture model " + name
    save(config_dir / "opencode.json", {
        "model": "boundary-probe/parent-model",
        "small_model": "boundary-probe/parent-model",
        "enabled_providers": ["boundary-probe"],
        "share": "disabled",
        "autoupdate": False,
        "provider": {"boundary-probe": {
            "npm": "@ai-sdk/openai-compatible", "name": "Local agent probe",
            "options": {"baseURL": "http://127.0.0.1:" + str(provider.server_port) + "/v1", "apiKey": "FAKE_LOCAL_ONLY"},
            "models": {name: {"name": label, "limit": {"context": 64000, "output": 128}} for name, label in models.items()},
        }},
    })
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    command = [str(runtime_bin), "serve", "--hostname", "127.0.0.1", "--port", str(port)]
    save(root / "invocation.json", {"argv": command, "cwd": str(work), "env": {k: v for k, v in env.items() if k not in ["PATH", "LANG"]},
         "timeout_seconds": 90, "max_model_requests": 40, "max_request_bytes": 2097152,
         "runtime_version": "1.19.0", "install_argv": install})
    before = allocated(root)
    started = time.monotonic()
    operation_deadline = started + 90
    def request(path, body=None, timeout=30):
        remaining = operation_deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Native probe overall deadline exceeded")
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request("http://127.0.0.1:" + str(port) + path, data=data,
                                     headers={"Content-Type": "application/json", "x-opencode-directory": str(work)})
        with urllib.request.urlopen(req, timeout=min(timeout, remaining)) as response:
            return json.load(response)
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
    status = "failed"
    sessions = {}
    checks = {}
    try:
        with (root / "server.stdout").open("wb") as stdout, (root / "server.stderr").open("wb") as stderr:
            proc = subprocess.Popen(command, cwd=work, env=env, stdout=stdout, stderr=stderr,
                                    stdin=subprocess.DEVNULL, start_new_session=True, preexec_fn=limits)
            try:
                save(root / "process.json", {"native_pid": proc.pid, "native_port": port, "provider_port": provider.server_port})
                ready_deadline = min(started + 20, operation_deadline)
                while True:
                    try:
                        health = request("/global/health", timeout=1)
                        save(root / "health.json", health)
                        break
                    except Exception:
                        if time.monotonic() > ready_deadline or proc.poll() is not None:
                            raise RuntimeError("OpenCode server did not become ready")
                        time.sleep(0.1)
                agents = request("/agent", timeout=10)
                save(root / "agents.json", agents)
                discovered = {item.get("name"): item for item in agents if isinstance(item, dict)}
                for role, expected_model in expected.items():
                    name = FIXTURE + ":" + role
                    item = discovered.get(name)
                    probe = {
                        "discovered": item is not None,
                        "mode": item.get("mode") if item else None,
                        "native": item.get("native") if item else None,
                        "prompt_exact": bool(item) and item.get("prompt") == bodies[role],
                        "model": item.get("model") if item else None,
                        "model_ok": bool(item) and (
                            (expected_model["resolved"] is None and item.get("model") is None)
                            or (expected_model["resolved"] is not None and item.get("model") == {
                                "providerID": "boundary-probe", "modelID": expected_model["resolved"]})),
                    }
                    checks["discover:" + role] = all([probe["discovered"], probe["mode"] == "subagent",
                                                      probe["native"] is False, probe["prompt_exact"], probe["model_ok"]])
                    save(root / ("discover-" + role + ".json"), probe)
                for role in expected:
                    session = request("/session", {"title": "Portable agent probe " + role})
                    sessions[role] = session["id"]
                    answer = request("/session/" + session["id"] + "/message", {
                        "model": {"providerID": "boundary-probe", "modelID": "parent-model"},
                        "parts": [{"type": "text", "text": "CALL_TASK:" + role + ": run the controlled probe"}],
                    }, timeout=30)
                    save(root / ("answer-" + role + ".json"), answer)
                    messages = request("/session/" + session["id"] + "/message", timeout=10)
                    save(root / ("messages-" + role + ".json"), messages)
                    answer_text = json.dumps(messages)
                    if role == "unavailable":
                        checks["child-unavailable:" + role] = (
                            "Model not found" in answer_text and "boundary-probe/nonexistent-model" in answer_text)
                    else:
                        expected_id = expected[role]["child"]
                        child = [row for row in requests if row["system_role"] == role]
                        checks["child:" + role] = (
                            len(child) == 1
                            and child[0]["model"] == expected_id
                            and bool(child[0]["body"]["messages"])
                            and child[0]["body"]["messages"][0].get("role") == "system"
                            and child[0]["body"]["messages"][0].get("content", "").startswith(bodies[role])
                            and {"bash", "read", "edit", "write", "glob", "grep"}.issubset(set(child[0]["tools"]))
                            and "CHILD_OK" in answer_text
                            and child[0]["headers"].get("x-opencode-parent-session-id", sessions[role]) == sessions[role]
                        )
                        save(root / ("child-" + role + ".json"), {key: value for key, value in child[0].items() if key != "body"})
                        save(root / ("child-" + role + "-tools.json"), child[0]["tools"])
                        save(root / ("child-" + role + "-body.json"), {
                            "model": child[0]["model"], "headers": child[0]["headers"],
                            "tools": child[0]["tools"], "messages": child[0]["body"].get("messages", []),
                        })
                checks["provider_budget"] = not fixture_errors
                checks["overall_deadline"] = time.monotonic() < operation_deadline
                checks["no_fallback_for_unavailable"] = not any(
                    row["system_role"] == "unavailable" for row in requests)
                save(root / "checks.json", checks)
                status = "passed" if all(checks.values()) else "failed"
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
        summary = {"status": status, "elapsed_seconds": round(time.monotonic() - started, 3),
                   "allocated_growth_bytes": allocated(root) - before, "setup_allocated_bytes": before,
                   "model_request_count": len(requests), "fake_model_usage_only": True, "sessions": sessions,
                   "fixture_errors": fixture_errors, "checks": checks,
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
