#!/usr/bin/env python3
"""Opt-in Grok Build native portable-agent qualification probe.

Runs the public plugnz install against an isolated GROK_HOME with the real
Grok Build binary, then drives one headless session whose model requests are
served by a deterministic loopback OpenAI-compatible fixture. The fixture
script issues native spawn_subagent calls, one per portable agent, and every
captured child request is verified for exact model resolution, authored
prose, native tools, and absence of portable metadata. No paid provider is
contacted: every model in config.toml points at the loopback origin.
"""
import argparse, hashlib, http.server, json, os, pathlib, resource, shutil, signal
import socket, subprocess, sys, tempfile, threading, time

P = pathlib.Path
REPO = P(__file__).resolve().parents[1]
MAX_BODY = 256 * 1024
MAX_REQUESTS = 48
SECONDS = 150
GROK = "/root/.grok/bin/grok"

# Distinct authored markers make child prompts unambiguous inside the system
# prompt Grok renders from the plugin agent definition.
AGENTS = {
    "reviewer": "GRK_ROLE_REVIEWER_QQ17",
    "explicit": "GRK_ROLE_EXPLICIT_QQ23",
    "packaged": "GRK_ROLE_PACKAGED_QQ31",
    "unspecified": "GRK_ROLE_UNSPEC_QQ43",
    "fallback": "GRK_ROLE_FALLBACK_QQ57",
}
BODIES = {name: f"{marker} You are the demo {name}. Inspect diffs and report concrete defects with evidence.\n"
           for name, marker in AGENTS.items()}
DESCRIPTIONS = {name: f"Review the change as {name}" for name in AGENTS}
# Explicit destination mapping > user alias > package alias > omitted field.
# `fallback` maps to an unregistered model id, proving the disclosed native
# inherit fallback rather than a hidden substitution.
EXPECTED_MODELS = {
    "reviewer": "probe-user",
    "explicit": "probe-explicit",
    "packaged": "probe-pkg-fast",
    "unspecified": "probe-parent",
    "fallback": "probe-parent",
}
PROBE_MODELS = ["probe-parent", "probe-user", "probe-explicit", "probe-pkg-fast", "probe-pkg"]


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def allocated(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (P(root) / name).stat().st_blocks * 512
            except OSError:
                pass
    return total


def exists(pid, group=False):
    try:
        os.killpg(pid, 0) if group else os.kill(pid, 0)
        return True
    except OSError:
        return False


def text(message):
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    return "\n".join(part.get("text", "") for part in content or [] if isinstance(part, dict))


def build_fixture(root):
    source = root / "source"
    package = source / "plugins" / "demo"
    (package / "agents").mkdir(parents=True)
    (source / ".claude-plugin").mkdir(parents=True)
    (source / ".claude-plugin" / "marketplace.json").write_text(json.dumps(
        {"name": "catalog", "plugins": [{"name": "demo", "source": "./plugins/demo"}]}))
    (package / "plugin.json").write_text('{"name":"demo","version":"1.0.0","description":"Demo"}\n')
    (package / "plugnz.agents.json").write_text(json.dumps(
        {"version": 1, "modelAliases": {"smart": {"grok": "probe-pkg"}, "fast": {"grok": "probe-pkg-fast"}}}))
    meta = {
        "reviewer": "modelAlias: smart\n",
        "explicit": "modelAlias: smart\nmodels:\n  grok: probe-explicit\n",
        "packaged": "modelAlias: fast\n",
        "unspecified": "",
        "fallback": "models:\n  grok: probe-missing\n",
    }
    for name, marker in AGENTS.items():
        (package / "agents" / f"{name}.md").write_text(
            f"---\nname: {name}\ndescription: {DESCRIPTIONS[name]}\n{meta[name]}---\n{BODIES[name]}")
    (package / "skills" / "ordinary" / "SKILL.md").parent.mkdir(parents=True)
    (package / "skills" / "ordinary" / "SKILL.md").write_text(
        "---\nname: ordinary\ndescription: ordinary\n---\n\nfirst\n")
    return source


def generated_bytes(name, model):
    body = BODIES[name]
    model_line = "" if model is None else f'model: "{model}"\n'
    return f'---\nname: "{name}"\ndescription: "{DESCRIPTIONS[name]}"\n{model_line}---\n{body}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--grok-bin", default=GROK)
    parser.add_argument("--seconds", type=int, default=SECONDS)
    args = parser.parse_args()
    evidence = P(args.evidence).resolve()
    if evidence.exists():
        raise SystemExit(f"evidence directory already exists: {evidence}")
    grok_bin = P(args.grok_bin).resolve()
    if not grok_bin.exists():
        raise SystemExit("pinned Grok binary not found; pass --grok-bin")
    evidence.mkdir(parents=True)
    case = evidence / "case"
    case.mkdir()
    root = P(tempfile.mkdtemp(prefix="plgnz-grok-native-agents-"))
    home = root / "home"
    (home / ".grok").mkdir(parents=True)
    work = root / "work"
    work.mkdir()
    source = build_fixture(root)
    (home / ".grok" / "plugins" / "unrelated").mkdir(parents=True)
    (home / ".grok" / "plugins" / "unrelated" / "plugin.json").write_text('{"name":"unrelated","version":"0.4.2"}\n')

    # User alias overrides only `smart`; `fast` keeps its package mapping.
    (home / "model-aliases.json").write_text(json.dumps(
        {"version": 1, "modelAliases": {"smart": {"grok": "probe-user"}}}))

    requests, errors = [], []
    lock = threading.Lock()
    for name in ["requests.jsonl", "server-errors.jsonl"]:
        (case / name).write_text("")

    def append(name, value):
        with (case / name).open("a") as handle:
            handle.write(json.dumps(value) + "\n")

    state = {"spawned": []}

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
                if body.get("model") not in PROBE_MODELS + ["grok-4.6", "grok-4.5"]:
                    raise ValueError(f"unexpected model {body.get('model')}")
                system = "\n".join(text(m) for m in body.get("messages", []) if m.get("role") == "system")
                with lock:
                    if len(requests) >= MAX_REQUESTS:
                        raise ValueError("model request cap")
                    item = {"time_ns": time.monotonic_ns(), "index": len(requests), "body": body}
                    requests.append(item)
                    append("requests.jsonl", item)
                    request_index = len(requests)
                child = next((name for name, marker in AGENTS.items() if marker in system), None)
                has_spawn = any(t.get("function", {}).get("name") == "spawn_subagent"
                                for t in body.get("tools", []))
                if child is not None and has_spawn:
                    delta, finish = {"content": f"CHILD_DONE_{child}"}, "stop"
                elif has_spawn:
                    with lock:
                        remaining = [name for name in AGENTS if name not in state["spawned"]]
                        if remaining:
                            agent = remaining[0]
                            state["spawned"].append(agent)
                            call = {"index": 0, "id": f"call_task_{request_index}", "type": "function",
                                    "function": {"name": "spawn_subagent", "arguments": json.dumps({
                                        "description": f"Run demo {agent}",
                                        "prompt": f"Report the controlled native probe marker for {agent}.",
                                        "background": False,
                                        "subagent_type": f"demo:{agent}"})}}
                            delta, finish = {"tool_calls": [call]}, "tool_calls"
                        else:
                            delta, finish = {"content": "ALL_DONE"}, "stop"
                else:
                    delta, finish = {"content": "SUMMARY"}, "stop"
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

    model_tables = "\n".join(
        f'[model.{name}]\ndisplay_name = "Probe {name}"\nbase_url = "{origin}/v1"\napi_key = "probe-key"\n'
        for name in ["probe-parent", "probe-user", "probe-explicit", "probe-pkg-fast", "probe-pkg"])
    user_config = (model_tables + "\n[memory]\nenabled = false\n").encode()
    (home / ".grok" / "config.toml").write_bytes(user_config)

    env = {key: os.environ[key] for key in ["PATH", "LANG", "TMPDIR"] if key in os.environ}
    env.update(HOME=str(home), GROK_HOME=str(home / ".grok"), TERM="dumb", NO_COLOR="1",
               XDG_CONFIG_HOME=str(home / ".config"), XDG_CACHE_HOME=str(home / ".cache"),
               XDG_DATA_HOME=str(home / ".local/share"), XAI_API_KEY="dummy-local-only",
               OPEN_PLUGIN_HOME=str(home), OPEN_PLUGIN_GROK_ROOT=str(home / ".grok"),
               OPEN_PLUGIN_GROK_BIN=str(grok_bin))
    for key in ["CLAUDE_CONFIG_DIR", "GROK_CONFIG_DIR"]:
        env.pop(key, None)
    bun = shutil.which("bun") or "bun"
    cli = [bun, str(REPO / "bin/plugnz.mjs")]
    version = subprocess.run([str(grok_bin), "--version"], env=env, capture_output=True, text=True, timeout=60)
    install = subprocess.run(cli + ["install", str(source), "--target", "grok", "--json"], cwd=str(REPO), env=env,
                             capture_output=True, text=True, timeout=180)
    (case / "install.stdout").write_text(install.stdout)
    (case / "install.stderr").write_text(install.stderr)
    if install.returncode != 0:
        shutil.rmtree(root, ignore_errors=True)
        server.shutdown()
        server.server_close()
        raise SystemExit("public install failed: " + (install.stderr or install.stdout)[-2000:])

    inspect = json.loads(subprocess.run([str(grok_bin), "inspect", "--json"], cwd=str(work), env=env,
                                        capture_output=True, text=True, timeout=90).stdout)
    save(case / "inspect.json", inspect)
    installed_path = None
    for plugin in inspect.get("plugins", []):
        if plugin.get("name") == "demo":
            installed_path = P(plugin["path"]).resolve()
    generated = {}
    sidecar_absent = installed_path is not None and not os.path.lexists(installed_path / "plugnz.agents.json")
    if installed_path is not None:
        for name in AGENTS:
            path = installed_path / "agents" / f"{name}.md"
            generated[f"agents/{name}.md"] = {"sha256": sha(path), "content": path.read_text()}
    save(case / "generated.json", {"installed_path": str(installed_path), "files": generated,
                                 "sidecar_absent": sidecar_absent})

    command = [str(grok_bin), "-m", "probe-parent",
               "-p", "Run each demo portable agent once: reviewer, explicit, packaged, unspecified, fallback.",
               "--output-format", "json", "--always-approve", "--max-turns", "24"]
    save(case / "invocation.json", {
        "argv": command, "cwd": str(work), "binary": str(grok_bin), "binary_sha256": sha(grok_bin),
        "native_version": version.stdout.strip(),
        "env_overrides": {key: value for key, value in env.items()
                          if key in ["GROK_HOME", "XAI_API_KEY", "OPEN_PLUGIN_GROK_ROOT"]},
        "seconds_cap": args.seconds, "requests_cap": MAX_REQUESTS, "body_byte_cap": MAX_BODY,
        "live_inference": False,
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
        with (case / "stdout.json").open("wb") as out, (case / "stderr.log").open("wb") as err:
            proc = subprocess.Popen(command, cwd=str(work), env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
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

        removal = None
        if status == "completed" and proc is not None and proc.returncode == 0:
            # Public retirement with the real binary: the owned install must
            # disappear natively while unrelated data survives.
            config_before_removal = (home / ".grok" / "config.toml").read_bytes()
            removal = subprocess.run(cli + ["remove", "demo@catalog", "--target", "grok", "--json"],
                                      cwd=str(REPO), env=env, capture_output=True, text=True, timeout=180)
            (case / "remove.stdout").write_text(removal.stdout)
            (case / "remove.stderr").write_text(removal.stderr)
            removal_inspect = json.loads(subprocess.run([str(grok_bin), "inspect", "--json"], cwd=str(work), env=env,
                                                        capture_output=True, text=True, timeout=90).stdout)
            save(case / "remove-inspect.json", removal_inspect)
            removal_state = {
                "plugins": [p.get("name") for p in removal_inspect.get("plugins", [])],
                "agents": [a.get("name") for a in removal_inspect.get("agents", [])],
                "activation_link_exists": os.path.lexists(home / ".grok" / "plugins" / "demo"),
                "marketplaces_entries": sorted(os.listdir(home / ".grok" / "plgnz-marketplaces")),
                "registry_repos": sorted(json.loads((home / ".grok" / "installed-plugins" / "registry.json")
                                                    .read_text()).get("repos", {})) if (home / ".grok" / "installed-plugins" / "registry.json").exists() else [],
                "unrelated_plugin": (home / ".grok" / "plugins" / "unrelated" / "plugin.json").read_text(),
                "unrelated_config": user_config in config_before_removal
                    and user_config in (home / ".grok" / "config.toml").read_bytes(),
                "user_config_sha256": hashlib.sha256(user_config).hexdigest(),
                "config_before_sha256": hashlib.sha256(config_before_removal).hexdigest(),
                "config_after_sha256": sha(home / ".grok" / "config.toml"),
            }
            save(case / "removal-state.json", removal_state)
    except Exception as exc:  # noqa: BLE001
        status = "runner-error:" + str(exc)
    finally:
        if proc is not None:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=5)
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
        shutil.rmtree(root, ignore_errors=True)
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

    inspect_agents = {a.get("name"): a for a in inspect.get("agents", [])}
    inspect_plugin = next((p for p in inspect.get("plugins", []) if p.get("name") == "demo"), None)
    check("install_succeeded", install.returncode == 0)
    check("inspect_plugin_enabled", inspect_plugin is not None and inspect_plugin.get("enabled") is True
          and inspect_plugin.get("provides", {}).get("agents") == 1)
    for name in AGENTS:
        entry = inspect_agents.get(f"demo:{name}")
        check(f"inspect_namespaced_{name}", entry is not None
              and entry.get("description") == DESCRIPTIONS[name]
              and entry.get("source", {}).get("type") == "plugin"
              and entry.get("source", {}).get("plugin_name") == "demo")
    expected_generated_model = {"reviewer": "probe-user", "explicit": "probe-explicit",
                                "packaged": "probe-pkg-fast", "unspecified": None, "fallback": "probe-missing"}
    for name in AGENTS:
        content = generated.get(f"agents/{name}.md", {}).get("content")
        check(f"generated_bytes_{name}", content == generated_bytes(name, expected_generated_model[name]))
    check("generated_sidecar_absent", sidecar_absent)
    check("native_completed", proc is not None and proc.returncode == 0 and status == "completed")
    check("no_fixture_errors", not errors)
    check("all_requests_loopback", all(item["body"].get("model") in PROBE_MODELS + ["grok-4.6", "grok-4.5"]
                                       for item in requests))
    children = {}
    for item in requests:
        system = "\n".join(text(m) for m in item["body"].get("messages", []) if m.get("role") == "system")
        child = next((name for name, marker in AGENTS.items() if marker in system), None)
        if child is not None and child not in children:
            children[child] = {"index": item["index"], "model": item["body"].get("model"),
                               "system": system, "tools": [t["function"]["name"] for t in item["body"].get("tools", [])]}
    check("one_child_request_per_agent", sorted(children) == sorted(AGENTS))
    native_tools = {"run_terminal_command", "read_file", "search_replace", "list_dir", "grep"}
    for name in AGENTS:
        observed = children.get(name, {})
        check(f"child_model_{name}", observed.get("model") == EXPECTED_MODELS[name])
        check(f"child_prose_{name}", BODIES[name].strip() in (observed.get("system") or ""))
        check(f"child_native_tools_{name}", native_tools.issubset(set(observed.get("tools", []))))
        check(f"child_no_portable_metadata_{name}",
              "modelAlias:" not in (observed.get("system") or "") and "\nmodels:\n" not in (observed.get("system") or ""))
    parent_requests = [item for item in requests
                       if not any(marker in "\n".join(text(m) for m in item["body"].get("messages", [])
                                                      if m.get("role") == "system") for marker in AGENTS.values())
                       and any(t.get("function", {}).get("name") == "spawn_subagent" for t in item["body"].get("tools", []))]
    spawn_tools = [t for item in parent_requests for t in item["body"].get("tools", [])
                   if t.get("function", {}).get("name") == "spawn_subagent"]
    check("parent_spawn_tool_present", len(spawn_tools) >= 1)
    spawn_schema = (spawn_tools[0]["function"].get("parameters", {}).get("properties", {}) if spawn_tools else {})
    subagent_type = spawn_schema.get("subagent_type", {}) if isinstance(spawn_schema, dict) else {}
    check("parent_spawn_tool_advertises_namespaced_types",
          sorted(subagent_type.get("enum", [])) == sorted(f"demo:{name}" for name in AGENTS)
          and all(f"demo:{name}: {DESCRIPTIONS[name]}" in (subagent_type.get("description") or "") for name in AGENTS))
    check("server_listener_closed", closed)
    check("server_thread_stopped", not thread.is_alive())
    check("native_pid_absent", proc is not None and not exists(proc.pid))
    check("process_group_absent", proc is not None and not exists(proc.pid, True))
    removal_state = json.loads((case / "removal-state.json").read_text()) if (case / "removal-state.json").exists() else None
    check("public_remove_succeeded", removal is not None and removal.returncode == 0)
    check("post_remove_plugin_absent", removal_state is not None and "demo" not in removal_state["plugins"])
    check("post_remove_agents_absent", removal_state is not None
          and not any(name.startswith("demo:") for name in removal_state["agents"]))
    check("post_remove_link_absent", removal_state is not None and removal_state["activation_link_exists"] is False)
    check("post_remove_marketplace_empty", removal_state is not None and removal_state["marketplaces_entries"] == [])
    check("post_remove_registry_row_absent", removal_state is not None and "demo" not in removal_state["registry_repos"])
    check("unrelated_plugin_preserved", removal_state is not None
          and removal_state["unrelated_plugin"] == '{"name":"unrelated","version":"0.4.2"}\n')
    check("unrelated_config_preserved", removal_state is not None and removal_state["unrelated_config"] is True)

    elapsed = time.monotonic() - start
    verification = {
        "assertions": assertions,
        "pass": all(assertions.values()),
        "child_requests": {name: {"index": value["index"], "model": value["model"], "tools": value["tools"]}
                           for name, value in children.items()},
        "parent_spawn_requests": len(parent_requests),
        "requests": len(requests),
        "native_model_policy": {
            "definition_model": "ModelOverride::Override pins the mapped model id when registered",
            "unknown_model": "falls back to the parent model with a warning (disclosed per issue #104)",
            "omitted_model": "ModelOverride::Inherit uses the parent model",
        },
        "native_normalization": {
            "generated_file": "exact authored body bytes after the closing delimiter",
            "runtime_system_prompt": "authored body with surrounding whitespace trimmed",
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
                      "requests": len(requests), "children": sorted(children),
                      "verified": verification["pass"], "evidence": str(evidence)}, indent=2))
    return 0 if verification["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
