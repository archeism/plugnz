#!/usr/bin/env python3
"""Bounded native Pi/OMP read effects, using their real CLI and loopback provider."""
import argparse, ctypes, hashlib, http.server, json, os, pathlib, resource
import shutil, signal, socket, struct, subprocess, threading, time, uuid

P = pathlib.Path
SOURCE = P(__file__).resolve().parent
OLD = P("/root/workspace/harness-hooks-probes-20261012-9c3mll0g")
PI_RUNTIME = OLD / "runtimes/round2/pi"
OMP_BIN = P("/root/.bun/bin/omp")
LIMIT_BYTES = 20 * 1024 * 1024
MAX_BODY = 256 * 1024

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def allocated(root):
    total = 0
    for path in [root, *root.rglob("*")]:
        try:
            if not path.is_symlink():
                total += path.lstat().st_blocks * 512
        except FileNotFoundError:
            # Native SQLite transient journals may vanish between directory listing and stat.
            continue
    return total

def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines()]

def process_exists(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False

def group_exists(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False

def content_text(message):
    value = message.get("content", "")
    if isinstance(value, str):
        return value
    return "\n".join(x.get("text", "") for x in value if isinstance(x, dict))

class AccessWatch:
    """Kernel watch of only the two fixture files; no tool monkey-patching."""
    def __init__(self, paths):
        self.lib = ctypes.CDLL(None, use_errno=True)
        self.fd = self.lib.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
        if self.fd < 0:
            raise OSError(ctypes.get_errno(), "inotify_init1")
        self.watches = {}
        self.events = []
        for path in paths:
            wd = self.lib.inotify_add_watch(self.fd, os.fsencode(path), 0x1 | 0x10 | 0x20)
            if wd < 0:
                raise OSError(ctypes.get_errno(), "inotify_add_watch")
            self.watches[wd] = str(path)
    def drain(self):
        while True:
            try:
                raw = os.read(self.fd, 65536)
            except BlockingIOError:
                return
            if not raw:
                return
            offset = 0
            while offset < len(raw):
                wd, mask, cookie, length = struct.unpack_from("iIII", raw, offset)
                self.events.append({"observer_ns": time.monotonic_ns(),
                    "path": self.watches.get(wd), "mask": mask,
                    "open": bool(mask & 0x20), "access": bool(mask & 0x1),
                    "close_nowrite": bool(mask & 0x10)})
                offset += 16 + length
    def close(self):
        self.drain()
        os.close(self.fd)

def run_case(attempt, lane, harness, mode):
    case = attempt / mode
    case.mkdir()
    work, agent = case / "work", case / "agent"
    work.mkdir()
    agent.mkdir()
    snapshot = case / "source"
    snapshot.mkdir()
    for name in ["probe.py", "effects-extension.mjs"]:
        shutil.copyfile(SOURCE / name, snapshot / name)
    requested = "RAW_REQUESTED_" + uuid.uuid4().hex
    alternate = "RAW_ALTERNATE_" + uuid.uuid4().hex
    (work / "requested.txt").write_text(requested + "\n")
    (work / "alternate.txt").write_text(alternate + "\n")
    task = "TASK_" + uuid.uuid4().hex
    save(case / "expectations.json", {"harness": harness, "case": mode,
        "task": task, "requested_content": requested, "alternate_content": alternate,
        "call_id": "call_read_once", "selected_tool": "read"})
    requests, observations, errors = [], [], []
    lock = threading.Lock()
    for name in ["requests.jsonl", "observations.jsonl", "server-errors.jsonl"]:
        (case / name).write_text("")
    def append(name, value):
        with (case / name).open("a") as f:
            f.write(json.dumps(value) + "\n")
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            try:
                length = int(self.headers.get("content-length", "0"))
                if length > MAX_BODY or length < 1:
                    raise ValueError("body byte cap or missing body")
                body = json.loads(self.rfile.read(length))
                with lock:
                    if self.path == "/observe":
                        if len(observations) >= 128:
                            raise ValueError("observer count cap")
                        row = {"observer_ns": time.monotonic_ns(), "index": len(observations), **body}
                        observations.append(row)
                        append("observations.jsonl", row)
                        self.send_response(200)
                        self.end_headers()
                        self.wfile.write(b"{}")
                        return
                    if self.path != "/v1/chat/completions":
                        raise ValueError("unexpected endpoint " + self.path)
                    if len(requests) >= 6:
                        raise ValueError("model request cap")
                    row = {"observer_ns": time.monotonic_ns(), "index": len(requests),
                        "path": self.path, "body": body}
                    requests.append(row)
                    append("requests.jsonl", row)
                    count = len(requests)
                names = [x["function"]["name"] for x in body.get("tools", [])]
                if "read" not in names:
                    raise ValueError("native read tool absent")
                call = count == 1
                delta = {"tool_calls": [{"index": 0, "id": "call_read_once",
                    "type": "function", "function": {"name": "read",
                    "arguments": json.dumps({"path": "requested.txt"})}}]} if call else {"content": "PROBE_COMPLETE"}
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Connection", "close")
                self.end_headers()
                for d, finish in [({"role": "assistant"}, None), (delta, None),
                                  ({}, "tool_calls" if call else "stop")]:
                    chunk = {"id": "chatcmpl-probe-" + str(count), "object": "chat.completion.chunk",
                        "created": 1, "model": "probe-model",
                        "choices": [{"index": 0, "delta": d, "finish_reason": finish}]}
                    self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
                self.close_connection = True
            except Exception as exc:
                record = {"observer_ns": time.monotonic_ns(), "type": type(exc).__name__,
                    "message": str(exc), "path": self.path}
                with lock:
                    errors.append(record)
                    append("server-errors.jsonl", record)
                try:
                    self.send_error(400)
                except Exception:
                    pass
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = "http://127.0.0.1:" + str(server.server_port)
    env = {k: os.environ[k] for k in ["PATH", "HOME", "LANG", "TMPDIR"] if k in os.environ}
    env.update(PI_CODING_AGENT_DIR=str(agent), PROBE_HARNESS=harness, PROBE_CASE=mode,
        PROBE_ORIGIN=origin, TERM="dumb", NO_COLOR="1")
    if harness == "pi":
        config = {"providers": {"effect-probe": {"baseUrl": origin + "/v1",
            "api": "openai-completions", "apiKey": "FAKE_LOCAL_ONLY",
            "models": [{"id": "probe-model", "name": "Synthetic effect probe", "reasoning": False,
                "input": ["text"], "contextWindow": 32768, "maxTokens": 512,
                "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}}]}}}
        save(agent / "models.json", config)
        save(agent / "auth.json", {})
        save(agent / "settings.json", {"compaction": {"enabled": False}, "retry": {"enabled": False}})
        env["PI_OFFLINE"] = "1"
        binary = PI_RUNTIME / "node_modules/.bin/pi"
        command = [str(binary), "--mode", "json", "--print", "--provider", "effect-probe",
            "--model", "probe-model", "--no-extensions", "-e", str(snapshot / "effects-extension.mjs"),
            "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
            "--tools", "read", "--session-dir", str(agent / "sessions")]
    else:
        config = ("advisor:\n  enabled: false\nretry:\n  modelFallback: false\n"
            "  usageAwareFallback: false\n  fallbackChains:\n    task: []\ncompaction:\n  enabled: false\n")
        (agent / "config.yml").write_text(config)
        env["PI_CONFIG_FILES"] = str(agent / "config.yml")
        binary = OMP_BIN
        command = [str(binary), "--cwd", str(work), "--model", "effect-probe/probe-model",
            "--thinking", "off", "--mode", "json", "--tools", "read", "--no-lsp", "--no-pty",
            "--no-extensions", "--extension", str(snapshot / "effects-extension.mjs"),
            "--no-skills", "--no-rules", "--no-title", "--session-dir", str(agent / "sessions"),
            "--max-time", "35s", "--print"]
    command.append(task + ": Complete the controlled native read probe.")
    save(case / "invocation.json", {"argv": command, "cwd": str(work),
        "env_overrides": {k: v for k, v in env.items() if k.startswith(("PI_", "PROBE_"))},
        "timeout_seconds": 45, "model_request_cap": 6, "request_body_cap_bytes": MAX_BODY,
        "lane_allocated_byte_cap": LIMIT_BYTES, "child_file_size_cap_bytes": 1024 * 1024,
        "binary": str(binary.resolve()), "binary_sha256": sha(binary.resolve()),
        "permission_overrides": [], "configured_tools": ["read"],
        "source_hashes": {p.name: sha(p) for p in snapshot.iterdir()}})
    before = allocated(lane)
    watch = AccessWatch([work / "requested.txt", work / "alternate.txt"])
    start = time.monotonic()
    usage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
    peak_rss = None
    status = "completed"
    proc = None
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    try:
        with (case / "stdout.jsonl").open("wb") as out, (case / "stderr.log").open("wb") as err:
            proc = subprocess.Popen(command, cwd=work, env=env, stdin=subprocess.DEVNULL,
                stdout=out, stderr=err, start_new_session=True, preexec_fn=limits)
            while proc.poll() is None:
                watch.drain()
                try:
                    values = [int(x.split()[1]) for x in (P("/proc") / str(proc.pid) / "status").read_text().splitlines()
                        if x.startswith(("VmRSS:", "VmHWM:"))]
                    if values:
                        peak_rss = max(max(values), peak_rss if peak_rss is not None else max(values))
                except FileNotFoundError:
                    pass
                if time.monotonic() - start > 45:
                    status = "timeout"
                    break
                if allocated(lane) > LIMIT_BYTES:
                    status = "lane-disk-cap"
                    break
                if errors:
                    status = "fixture-error"
                    break
                time.sleep(0.05)
    except Exception as exc:
        status = "runner-error:" + type(exc).__name__ + ":" + str(exc)
    finally:
        if proc is not None:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            if group_exists(proc.pid):
                os.killpg(proc.pid, signal.SIGTERM)
                time.sleep(0.2)
                if group_exists(proc.pid):
                    os.killpg(proc.pid, signal.SIGKILL)
        watch.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    usage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
    save(case / "file-access.json", {"mechanism": "Linux inotify IN_OPEN/IN_ACCESS/IN_CLOSE_NOWRITE",
        "watch_started_before_native_launch": True, "watched_paths": list(watch.watches.values()),
        "events": watch.events, "note": "Fixture wrote files before watches; hashes read only after watches closed."})
    save(case / "resources.json", {"sampled_native_peak_rss_kib": peak_rss, "sample_interval_seconds": 0.05,
        "child_cpu_user_seconds": usage_after.ru_utime - usage_before.ru_utime,
        "child_cpu_system_seconds": usage_after.ru_stime - usage_before.ru_stime,
        "scope": "Native CLI child RSS; RUSAGE_CHILDREN for waited native CLI, not a whole-host profiler.",
        "wall_seconds": time.monotonic() - start, "lane_allocated_before": before,
        "lane_allocated_after": allocated(lane), "live_inference": False,
        "token_usage": "No inference; protocol completion metadata is synthetic, not billable usage."})
    listener_closed = False
    try:
        with socket.create_connection(("127.0.0.1", server.server_port), timeout=0.2):
            pass
    except OSError:
        listener_closed = True
    receipt = {"harness": harness, "case": mode, "status": status,
        "pid": proc.pid if proc else None, "exit_code": proc.returncode if proc else None,
        "process_waited": proc is not None and proc.returncode is not None,
        "native_pid_absent": proc is not None and not process_exists(proc.pid),
        "process_group_absent": proc is not None and not group_exists(proc.pid),
        "listener_closed": listener_closed, "server_thread_stopped": not thread.is_alive(),
        "request_count": len(requests), "observation_count": len(observations),
        "fixture_errors": errors}
    save(case / "run.json", receipt)
    print(json.dumps(receipt), flush=True)
    return receipt

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness", choices=["pi", "omp"], required=True)
    parser.add_argument("--evidence", type=P, required=True)
    args = parser.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=False)
    lane = args.evidence.parent
    if allocated(lane) >= LIMIT_BYTES:
        raise SystemExit("Lane disk budget exhausted before launch")
    save(args.evidence / "claim.json", {
        "boundary": "Real native CLI and built-in read; only loopback Chat Completions responses are synthetic.",
        "cases": ["baseline", "rewrite", "deny"],
        "claims": ["Baseline reads requested file and sends its raw result; candidate replacement nonce stays absent.",
            "Rewrite changes actual built-in read to alternate file and replaces returned model-visible tool content.",
            "Deny produces a matching native error receipt with no read-file open/access or post-execution callback.",
            "OMP rewrite case requests exactly one Stop continuation, observed as one additional task request."],
        "bounds": {"seconds_per_case": 45, "requests_per_case": 6,
            "body_bytes": MAX_BODY, "lane_allocated_bytes": LIMIT_BYTES},
        "skill_sha256": "5440bd6e8ed63cc588153bfbb94f62a54df3939dc3609f619fad47123124fa81",
        "sources": {"omp": "f261ed9faf16b61880b544f599876bface4ded0d", "pi": "781152fc24841dc54b22284514604048ebe5e2c9"},
        "fixture_hashes": {name: sha(SOURCE / name) for name in ["probe.py", "effects-extension.mjs"]}})
    results = []
    for mode in ["baseline", "rewrite", "deny"]:
        receipt = run_case(args.evidence, lane, args.harness, mode)
        results.append(receipt)
        if receipt["status"] != "completed" or receipt["exit_code"] != 0:
            break
    save(args.evidence / "runs.json", results)
    save(args.evidence / "hashes.json", {str(p.relative_to(args.evidence)): sha(p)
        for p in sorted(args.evidence.rglob("*")) if p.is_file() and p.name != "hashes.json"})
    raise SystemExit(0 if len(results) == 3 and all(x["status"] == "completed" and x["exit_code"] == 0 for x in results) else 1)

if __name__ == "__main__":
    main()
