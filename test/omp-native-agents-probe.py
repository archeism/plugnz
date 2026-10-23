#!/usr/bin/env python3
"""Opt-in OMP native task-agent qualification probe.

Installs one portable-agent plugin through the public plugnz CLI into an
isolated home, then runs the pinned native OMP binary against a bounded
loopback model provider and scripted native `task` calls. The evidence file
records actual child request bodies (system prompt, model, tools), so a parser
assertion alone never counts as qualification.

Raw output stays outside Git; use `--evidence` to point at a retained path.
"""
import argparse, hashlib, http.server, json, os, pathlib, re, resource, shutil, signal
import socket, subprocess, sys, tempfile, threading, time, uuid

P = pathlib.Path
REPO = P(__file__).resolve().parents[1]
MAX_BODY = 256 * 1024
MAX_REQUESTS = 32
SECONDS = 120
MARKERS = {
    "reviewer": "PLUGNZ_REVIEWER_PROSE",
    "explicit": "PLUGNZ_EXPLICIT_PROSE",
    "packaged": "PLUGNZ_PACKAGED_PROSE",
    "unspecified": "PLUGNZ_UNSPECIFIED_PROSE",
}
PROVIDER_MODELS = ["probe-model", "user-alias", "explicit", "pkg-alias", "pkg-alias-fast"]
EXPECTED_MODELS = {
    "reviewer": "user-alias",
    "explicit": "explicit",
    "packaged": "pkg-alias-fast",
    "unspecified": "probe-model",
}
DESCRIPTIONS = {
    "reviewer": "Review changes for correctness and regressions.",
    "explicit": "Explicit destination mapping beats both alias levels.",
    "packaged": "Package alias mapping applies when no user alias is set.",
    "unspecified": "Omitted mapping leaves the native model field absent.",
}
AGENTS = list(MARKERS)


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def allocated(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []


def exists(pid, group=False):
    try:
        if group:
            os.killpg(pid, 0)
        else:
            os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def text(message):
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    return "\n".join(part.get("text", "") for part in content or [] if isinstance(part, dict))


def role_section(system, marker):
    """Extract the agent instruction section the native prompt template embeds."""
    for section in re.split(r"(?m)^§ ", system):
        if section.startswith("Role\n") and marker in section:
            return section[len("Role\n"):].strip()
    return None


def build_fixture(nonce, root):
    source = root / "source"
    (source / "agents").mkdir(parents=True)
    save(source / "plugin.json", {"name": "portable-review", "version": "1.0.0"})
    (source / "plugnz.agents.json").write_text(json.dumps({
        "version": 1,
        "modelAliases": {
            "smart": {"omp": "context-probe/pkg-alias"},
            "fast": {"omp": "context-probe/pkg-alias-fast"},
        },
    }))
    bodies = {
        "reviewer": f"{MARKERS['reviewer']}_{nonce}: Read the change and explain your reasoning.\nReport concrete defects with evidence.\n",
        "explicit": f"{MARKERS['explicit']}_{nonce}: Keep this explicit instruction intact.\n",
        "packaged": f"{MARKERS['packaged']}_{nonce}: Keep this packaged instruction intact.\n",
        "unspecified": f"{MARKERS['unspecified']}_{nonce}: Keep this unspecified instruction intact.\n",
    }
    metadata = {
        "reviewer": "modelAlias: smart\n",
        "explicit": "modelAlias: smart\nmodels:\n  omp: context-probe/explicit\n",
        "packaged": "modelAlias: fast\n",
        "unspecified": "",
    }
    for agent in AGENTS:
        (source / "agents" / f"{agent}.md").write_text(
            f"---\nname: {agent}\ndescription: {DESCRIPTIONS[agent]}\n{metadata[agent]}---\n{bodies[agent]}")
    home = root / "home"
    home.mkdir()
    (home / ".open-plugin").mkdir()
    (home / ".open-plugin" / "model-aliases.json").write_text(json.dumps({
        "version": 1, "modelAliases": {"smart": {"omp": "context-probe/user-alias"}}}))
    return source, home, bodies


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--omp-bin", default=shutil.which("omp") or "")
    parser.add_argument("--seconds", type=int, default=SECONDS)
    args = parser.parse_args()
    evidence = P(args.evidence).resolve()
    if evidence.exists():
        raise SystemExit(f"evidence directory already exists: {evidence}")
    if not args.omp_bin or not P(args.omp_bin).exists():
        raise SystemExit("pinned OMP binary not found; pass --omp-bin")
    omp_bin = str(P(args.omp_bin).resolve())
    evidence.mkdir(parents=True)
    nonce = uuid.uuid4().hex[:12]
    # The work dir must not inherit ambient project configs from the caller's cwd.
    work = P(tempfile.mkdtemp(prefix="plgnz-omp-native-agents-"))
    source, home, bodies = build_fixture(nonce, evidence)
    case = evidence / "case"
    case.mkdir()
    agent_dir = home / ".omp"
    agent_dir.mkdir()
    (agent_dir / "config.yml").write_text(
        "advisor:\n  enabled: false\nasync:\n  enabled: false\n"
        "retry:\n  modelFallback: false\n  usageAwareFallback: false\n  fallbackChains:\n    task: []\n"
        "compaction:\n  enabled: false\n")
    env = {key: os.environ[key] for key in ["PATH", "LANG", "TMPDIR"] if key in os.environ}
    env.update(HOME=str(home), PI_CODING_AGENT_DIR=str(agent_dir), PI_CONFIG_FILES=str(agent_dir / "config.yml"),
               XDG_CONFIG_HOME=str(home / ".config"), NO_COLOR="1", TERM="dumb", PI_OFFLINE="1")
    cli = [shutil.which("bun") or "bun", str(REPO / "bin/plugnz.mjs")]
    install = subprocess.run(cli + ["install", str(source), "--target", "omp", "--json"], cwd=REPO, env=env,
                             capture_output=True, text=True, timeout=180)
    (case / "install.stdout").write_text(install.stdout)
    (case / "install.stderr").write_text(install.stderr)
    if install.returncode != 0:
        raise SystemExit("public install failed: " + install.stderr[-2000:])
    managed = sorted((home / ".omp/plugins/plgnz").iterdir())
    if len(managed) != 1:
        raise SystemExit(f"expected one managed package, found {len(managed)}")
    package = managed[0]
    generated = {}
    for agent in AGENTS:
        path = package / "agents" / f"{agent}.md"
        generated[f"agents/{agent}.md"] = {"sha256": sha(path), "content": path.read_text()}
    lock_row = json.loads((home / ".omp/plugins/omp-plugins.lock.json").read_text())["plugins"]
    npm_name = json.loads((package / "package.json").read_text())["name"]
    save(case / "generated.json", {
        "package": str(package),
        "package_name": npm_name,
        "link_target": os.readlink(home / ".omp/plugins/node_modules" / npm_name),
        "lock_enabled": bool(lock_row.get(npm_name, {}).get("enabled")),
        "files": generated,
    })

    requests, observations, errors = [], [], []
    lock = threading.Lock()
    for name in ["requests.jsonl", "server-errors.jsonl"]:
        (case / name).write_text("")

    def append(name, value):
        with (case / name).open("a") as handle:
            handle.write(json.dumps(value) + "\n")

    state = {"spawned": 0}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass

        def do_POST(self):
            try:
                length = int(self.headers.get("content-length", "0"))
                if length < 1 or length > MAX_BODY:
                    raise ValueError("request body byte cap")
                body = json.loads(self.rfile.read(length))
                if self.path != "/v1/chat/completions":
                    raise ValueError(f"unexpected endpoint {self.path}")
                if body.get("model") not in PROVIDER_MODELS:
                    raise ValueError(f"unexpected model {body.get('model')}")
                system = "\n".join(text(m) for m in body.get("messages", []) if m.get("role") == "system")
                with lock:
                    if len(requests) >= MAX_REQUESTS:
                        raise ValueError("model request cap")
                    item = {"time_ns": time.monotonic_ns(), "index": len(requests), "body": body}
                    requests.append(item)
                    append("requests.jsonl", item)
                    request_index = len(requests)
                child = next((name for name, marker in MARKERS.items() if f"{marker}_{nonce}" in system), None)
                last_role = body.get("messages", [])[-1].get("role") if body.get("messages") else None
                if child is not None:
                    if last_role == "tool":
                        delta, finish = {"content": "PROBE_COMPLETE"}, "stop"
                    else:
                        call = {"index": 0, "id": f"call_yield_{request_index}", "type": "function",
                                "function": {"name": "yield", "arguments": json.dumps({
                                    "data": {"agent": child, "marker": f"{MARKERS[child]}_{nonce}"}})}}
                        delta, finish = {"tool_calls": [call]}, "tool_calls"
                else:
                    with lock:
                        if state["spawned"] < len(AGENTS):
                            agent = AGENTS[state["spawned"]]
                            state["spawned"] += 1
                            call = {"index": 0, "id": f"call_task_{state['spawned']}", "type": "function",
                                    "function": {"name": "task", "arguments": json.dumps({
                                        "agent": f"portable-review:{agent}",
                                        "task": f"Report the controlled native probe marker for {agent}."})}}
                            delta, finish = {"tool_calls": [call]}, "tool_calls"
                        else:
                            delta, finish = {"content": "ALL_DONE"}, "stop"
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Connection", "close")
                self.end_headers()
                for hook, reason in [({"role": "assistant"}, None), (delta, None), ({}, finish)]:
                    chunk = {"id": f"chatcmpl-{request_index}", "object": "chat.completion.chunk", "created": 1,
                             "model": body.get("model"), "choices": [{"index": 0, "delta": hook, "finish_reason": reason}]}
                    self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
                self.close_connection = True
            except Exception as exc:  # noqa: BLE001 - fixture must record, never serve wrong data
                item = {"time_ns": time.monotonic_ns(), "error": str(exc), "path": self.path}
                with lock:
                    errors.append(item)
                    append("server-errors.jsonl", item)
                try:
                    self.send_error(400)
                except Exception:
                    pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = "http://127.0.0.1:" + str(server.server_port)
    models = ", ".join(json.dumps({"id": name, "name": name, "api": "openai-completions", "reasoning": False,
                                   "input": ["text"], "contextWindow": 32768, "maxTokens": 512,
                                   "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}})
                       for name in PROVIDER_MODELS)
    (case / "observer.mjs").write_text(
        "export default function (pi) {\n"
        f"  pi.registerProvider('context-probe', {{ baseUrl: {json.dumps(origin)} + '/v1',"
        f" api: 'openai-completions', apiKey: 'FAKE_LOCAL_ONLY', models: [{models}] }});\n"
        "}\n")
    command = [omp_bin, "--cwd", str(work), "--model", "context-probe/probe-model", "--thinking", "off",
               "--mode", "json", "--extension", str(case / "observer.mjs"), "--no-skills", "--no-rules",
               "--no-lsp", "--no-pty", "--no-title", "--session-dir", str(case / "sessions"),
               "--max-time", f"{max(10, args.seconds - 10)}s", "--print",
               f"TASK_PROBE_{nonce}: delegate to each portable-review agent once."]
    save(case / "invocation.json", {
        "argv": command, "cwd": str(work), "binary": omp_bin, "binary_sha256": sha(P(omp_bin)),
        "native_version": subprocess.run([omp_bin, "--version"], capture_output=True, text=True).stdout.strip(),
        "env_overrides": {key: value for key, value in env.items() if key in ["PI_OFFLINE", "PI_CODING_AGENT_DIR", "XDG_CONFIG_HOME"]},
        "seconds_cap": args.seconds, "requests_cap": MAX_REQUESTS, "body_byte_cap": MAX_BODY, "live_inference": False,
    })
    before = allocated(evidence)
    usage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.monotonic()
    peak_rss = None
    status = "completed"
    proc = None

    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))

    try:
        with (case / "stdout.jsonl").open("wb") as out, (case / "stderr.log").open("wb") as err:
            proc = subprocess.Popen(command, cwd=work, env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                    start_new_session=True, preexec_fn=limits)
            while proc.poll() is None:
                try:
                    values = [int(line.split()[1]) for line in (P("/proc") / str(proc.pid) / "status")
                              .read_text().splitlines() if line.startswith(("VmRSS:", "VmHWM:"))]
                    if values:
                        peak_rss = max(max(values), peak_rss or 0)
                except FileNotFoundError:
                    pass
                if time.monotonic() - start > args.seconds:
                    status = "timeout"
                    break
                if allocated(evidence) > 40 * 1024 * 1024:
                    status = "disk-cap"
                    break
                if errors:
                    status = "fixture-error"
                    break
                time.sleep(0.05)
    except Exception as exc:  # noqa: BLE001
        status = "runner-error:" + str(exc)
    finally:
        if proc is not None:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            if exists(proc.pid, True):
                os.killpg(proc.pid, signal.SIGTERM)
                time.sleep(0.2)
                if exists(proc.pid, True):
                    os.killpg(proc.pid, signal.SIGKILL)
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        shutil.rmtree(work, ignore_errors=True)
    usage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
    closed = False
    try:
        with socket.create_connection(("127.0.0.1", server.server_port), timeout=0.2):
            pass
    except OSError:
        closed = True

    # ---- Independent verification from captured raw bytes. ----
    assertions = {}

    def check(name, condition):
        assertions[name] = bool(condition)

    check("native_completed", proc is not None and proc.returncode == 0 and status == "completed")
    check("no_fixture_errors", not errors)
    check("all_requests_loopback_task_bodies", all(item["body"].get("model") in PROVIDER_MODELS for item in requests))
    children = {}
    for item in requests:
        system = "\n".join(text(m) for m in item["body"].get("messages", []) if m.get("role") == "system")
        child = next((name for name, marker in MARKERS.items() if f"{marker}_{nonce}" in system), None)
        if child is not None and child not in children:
            children[child] = {"index": item["index"], "model": item["body"].get("model"),
                               "system": system, "tools": [t["function"]["name"] for t in item["body"].get("tools", [])],
                               "role_section": role_section(system, MARKERS[child]),
                               "messages": item["body"].get("messages")}
    check("one_child_request_per_agent", sorted(children) == sorted(AGENTS))
    for agent in AGENTS:
        observed = children.get(agent, {})
        expected_section = bodies[agent].strip()
        check(f"child_model_{agent}", observed.get("model") == EXPECTED_MODELS[agent])
        check(f"child_prose_{agent}", observed.get("role_section") == expected_section)
        check(f"generated_description_{agent}",
              f'description: {json.dumps(DESCRIPTIONS[agent])}' in generated[f"agents/{agent}.md"]["content"])
        check(f"child_native_tools_{agent}", {"read", "bash", "edit", "write", "yield"}.issubset(set(observed.get("tools", []))))
        check(f"child_no_portable_metadata_{agent}",
              "modelAlias:" not in observed.get("system", "") and "\nmodels:\n" not in observed.get("system", ""))
        generated_bytes = generated[f"agents/{agent}.md"]["content"]
        check(f"generated_prose_exact_{agent}", generated_bytes.endswith(bodies[agent]))
        check(f"generated_namespaced_{agent}", f'name: "portable-review:{agent}"' in generated_bytes)
        expected_model = EXPECTED_MODELS[agent]
        if agent == "unspecified":
            check("generated_model_absent_unspecified", "model:" not in generated_bytes.split("---")[1])
        else:
            check(f"generated_model_{agent}", f'model: "context-probe/{expected_model}"' in generated_bytes)
    parent_requests = [item for item in requests if all(f"{marker}_{nonce}" not in "\n".join(
        text(message) for message in item["body"].get("messages", []) if message.get("role") == "system")
        for marker in MARKERS.values())]
    task_tools = [tool for tool in parent_requests[0]["body"].get("tools", [])
                  if tool.get("function", {}).get("name") == "task"] if parent_requests else []
    task_description = task_tools[0]["function"].get("description", "") if task_tools else ""
    check("parent_task_tool_lists_namespaced_agents",
          len(task_tools) == 1
          and all(f"- `portable-review:{agent}`: {DESCRIPTIONS[agent]}" in task_description for agent in AGENTS))
    check("server_listener_closed", closed)
    check("server_thread_stopped", not thread.is_alive())
    check("native_pid_absent", proc is not None and not exists(proc.pid))
    check("process_group_absent", proc is not None and not exists(proc.pid, True))

    elapsed = time.monotonic() - start
    verification = {
        "assertions": assertions,
        "pass": all(assertions.values()),
        "child_requests": {name: {"index": value["index"], "model": value["model"],
                                  "tools": value["tools"], "role_section": value["role_section"]}
                           for name, value in children.items()},
        "parent_requests": len(parent_requests),
        "requests": len(requests),
        "native_normalization": {
            "transport": "parseFrontmatter normalize=true repair=true then body.trim()",
            "generated_file": "exact authored body bytes after the closing delimiter",
            "runtime_system_prompt": "authored body trimmed; CRLF to LF; HTML comments removed",
        },
    }
    save(case / "verification.json", verification)
    save(case / "resources.json", {
        "wall_seconds": elapsed,
        "sampled_native_peak_rss_kib": peak_rss,
        "child_cpu_user_seconds": usage_after.ru_utime - usage_before.ru_utime,
        "child_cpu_system_seconds": usage_after.ru_stime - usage_before.ru_stime,
        "allocated_bytes_before": before,
        "allocated_bytes_after": allocated(evidence),
        "requests": len(requests),
        "live_inference": False,
        "token_usage": "Synthetic protocol only; deterministic fixture counters, not billed model usage.",
    })
    save(case / "run.json", {"status": status, "exit_code": proc.returncode if proc else None,
                             "requests": len(requests), "verified": verification["pass"]})
    print(json.dumps({"status": status, "exit_code": proc.returncode if proc else None,
                      "requests": len(requests), "verified": verification["pass"],
                      "evidence": str(evidence)}, indent=2))
    return 0 if verification["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
