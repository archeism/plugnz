#!/usr/bin/env python3
"""Opt-in generated-adapter proof: native CLI, builtin read, bounded loopback model fixture."""
import argparse, ctypes, hashlib, http.server, json, os, pathlib, resource
import shutil, signal, socket, struct, subprocess, threading, time, uuid

P = pathlib.Path
REPO = P(__file__).resolve().parents[1]
MAX_BODY = 256 * 1024
MAX_REQUESTS = 6
RAW_LIMIT = 20 * 1024 * 1024
SECONDS = 45

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def allocated(path):
    total = 0
    for current, dirs, files in os.walk(path):
        for name in [".", *files]:
            item = P(current) / name
            try:
                if not item.is_symlink(): total += item.stat().st_blocks * 512
            except FileNotFoundError: pass
    return total

def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []

def exists(pid, group=False):
    try:
        (os.killpg if group else os.kill)(pid, 0)
        return True
    except ProcessLookupError: return False

def text(message):
    content = message.get("content", "")
    if isinstance(content, str): return content
    return "\n".join(part.get("text", "") for part in content or [] if isinstance(part, dict))

class AccessWatch:
    def __init__(self, path):
        lib = ctypes.CDLL(None, use_errno=True)
        self.fd = lib.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
        if self.fd < 0: raise OSError(ctypes.get_errno(), "inotify_init1")
        self.wd = lib.inotify_add_watch(self.fd, os.fsencode(path), 0x1 | 0x10 | 0x20)
        if self.wd < 0: raise OSError(ctypes.get_errno(), "inotify_add_watch")
        self.events = []
    def drain(self):
        while True:
            try: raw = os.read(self.fd, 65536)
            except BlockingIOError: return
            if not raw: return
            offset = 0
            while offset < len(raw):
                wd, mask, cookie, length = struct.unpack_from("iIII", raw, offset)
                self.events.append({"time_ns":time.monotonic_ns(), "mask":mask,
                    "open":bool(mask & 0x20), "access":bool(mask & 0x1)})
                offset += 16 + length
    def close(self):
        self.drain()
        os.close(self.fd)

def verify(case, harness, mode, receipt):
    requests = jsonl(case / "requests.jsonl")
    observations = jsonl(case / "observations.jsonl")
    hooks = jsonl(case / "package/handler-receipts.jsonl")
    expected = json.loads((case / "expectations.json").read_text())
    assertions = {}
    def check(name, condition):
        assertions[name] = bool(condition)
    check("native_completed", receipt["status"] == "completed" and receipt["exit_code"] == 0)
    check("actual_request_count", len(requests) == (2 if mode == "baseline" else 3))
    check("all_requests_belong_to_task", all(expected["task"] in json.dumps(item["body"]) for item in requests))
    accesses = json.loads((case / "file-access.json").read_text())["events"]
    check("builtin_read_file_accessed", any(e["open"] for e in accesses) and any(e["access"] for e in accesses))
    originals = [o for o in observations if o["event"] == "tool_result_original" and o.get("toolName") == "read"]
    check("native_original_read_result", len(originals) == 1 and expected["raw"] in json.dumps(originals[0]["content"]))
    check("handler_pids_absent", all(not exists(item["pid"]) for item in hooks))
    check("cleanup", all(receipt.get(key) for key in ["native_pid_absent","process_group_absent","listener_closed","server_thread_stopped"]))
    roles = []
    if len(requests) >= 2:
        native_results = [m for m in requests[1]["body"]["messages"] if m.get("role") == "tool" and m.get("tool_call_id") == "call_read"]
        check("original_tool_result_preserved", len(native_results) == 1 and expected["raw"] in text(native_results[0]))
    if mode == "baseline":
        check("baseline_has_no_hook_invocations", len(hooks) == 0)
    else:
        check("all_handlers_use_same_native_session", len({h["input"].get("sessionId") for h in hooks}) == 1 and all(h["input"].get("sessionId") for h in hooks))
        check("handler_event_counts", [h["input"]["event"] for h in hooks].count("session.start") == 1
            and [h["input"]["event"] for h in hooks].count("tool.before") == (2 if mode == "structured" else 1)
            and [h["input"]["event"] for h in hooks].count("tool.after") == (2 if mode == "structured" else 1))
        stops = [h for h in hooks if h["input"]["event"] == "turn.stop"]
        check("stop_active_transition", [h["input"]["stop"]["active"] for h in stops] == [False, True])
        check("one_continuation_decision", len(stops) == 2 and stops[0]["result"].get("continue") is True and stops[1]["result"] == {})
        for h in hooks:
            event = h["input"]["event"]
            nonce = h["result"].get("context")
            if not nonce: continue
            index = 0 if event == "session.start" else (2 if event == "turn.stop" else 1)
            found = [m["role"] for m in requests[index]["body"]["messages"] if nonce in text(m)] if len(requests) > index else []
            roles.append({"event":event, "tool":h["input"].get("tool",{}).get("name"), "nonce":nonce, "request_index":index, "roles":found})
            check("receiver_nonce_" + nonce, bool(found))
            if event in ["session.start","turn.stop"] or (harness == "pi" and event == "tool.before"):
                check("user_role_" + nonce, found == ["user"])
            elif harness == "pi":
                check("tool_role_" + nonce, found == ["tool"])
            else:
                check("native_context_outside_tool_" + nonce, "tool" not in found)
            check("nonce_not_present_earlier_" + nonce, all(nonce not in json.dumps(r["body"]) for r in requests[:index]))
        if harness == "omp":
            native_stops = [o for o in observations if o["event"] == "session_stop"]
            check("omp_stop_same_turn_and_session", len(native_stops) == 2
                and len({o["turnId"] for o in native_stops}) == 1 and len({o["sessionId"] for o in native_stops}) == 1)
        if mode == "structured":
            final = [o for o in observations if o["event"] == "tool_execution_end" and o.get("toolName") == "structured_probe"]
            check("native_structured_content_preserved", len(final) == 1 and final[0]["result"].get("structuredContent") == {"fixture":expected["structured"]})
            check("native_details_preserved", len(final) == 1 and final[0]["result"].get("details") == {"fixture":expected["structured"]})
    result = {"assertions":assertions, "pass":all(assertions.values()), "actual_requests":len(requests),
        "hook_invocations":len(hooks), "observed_roles":roles}
    save(case / "verification.json", result)
    return result

def run_case(args, mode):
    case = args.evidence / mode
    case.mkdir()
    work, agent = case / "work", case / "agent"
    work.mkdir(); agent.mkdir()
    task, raw, structured = ("TASK_" + uuid.uuid4().hex, "READ_" + uuid.uuid4().hex, "STRUCTURED_" + uuid.uuid4().hex)
    (work / "requested.txt").write_text(raw + "\n")
    save(case / "expectations.json", {"harness":args.harness,"mode":mode,"task":task,"raw":raw,"structured":structured})
    setup = subprocess.run(["/root/.bun/bin/bun",str(REPO / "test/omp-hooks-native-emit.ts"), args.harness, str(case / "package"), mode],
        cwd=REPO, capture_output=True, text=True, timeout=60)
    (case / "compiler.stdout").write_text(setup.stdout)
    (case / "compiler.stderr").write_text(setup.stderr)
    if setup.returncode != 0:
        save(case / "setup-failure.json", {"exit_code":setup.returncode})
        raise RuntimeError("Native fixture compilation failed: " + setup.stderr[:1000])
    requests, observations, errors = [], [], []
    lock = threading.Lock()
    for name in ["requests.jsonl","observations.jsonl","server-errors.jsonl"]: (case / name).write_text("")
    def append(name, value):
        with (case / name).open("a") as f: f.write(json.dumps(value) + "\n")
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *unused): pass
        def do_POST(self):
            try:
                length = int(self.headers.get("content-length","0"))
                if length < 1 or length > MAX_BODY: raise ValueError("request body byte cap")
                body = json.loads(self.rfile.read(length))
                with lock:
                    if self.path == "/observe":
                        if len(observations) >= 128: raise ValueError("observer count cap")
                        item = {"time_ns":time.monotonic_ns(),**body}
                        observations.append(item); append("observations.jsonl",item)
                        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")
                        return
                    if self.path != "/v1/chat/completions": raise ValueError("unexpected endpoint")
                    if len(requests) >= MAX_REQUESTS: raise ValueError("model request cap")
                    item = {"time_ns":time.monotonic_ns(),"index":len(requests),"body":body}
                    requests.append(item); append("requests.jsonl",item)
                    count = len(requests)
                names = [tool["function"]["name"] for tool in body.get("tools",[])]
                if "read" not in names: raise ValueError("native read tool absent")
                calls = [{"index":0,"id":"call_read","type":"function","function":{"name":"read","arguments":json.dumps({"path":"requested.txt"})}}]
                if mode == "structured":
                    if "structured_probe" not in names: raise ValueError("structured fixture tool absent")
                    calls.append({"index":1,"id":"call_structured","type":"function","function":{"name":"structured_probe","arguments":"{}"}})
                delta = {"tool_calls":calls} if count == 1 else {"content":"PROBE_COMPLETE"}
                self.send_response(200); self.send_header("Content-Type","text/event-stream")
                self.send_header("Connection","close"); self.end_headers()
                for d, finish in [({"role":"assistant"},None),(delta,None),({}, "tool_calls" if count == 1 else "stop")]:
                    chunk = {"id":"chatcmpl-probe-" + str(count),"object":"chat.completion.chunk","created":1,"model":"probe-model",
                        "choices":[{"index":0,"delta":d,"finish_reason":finish}]}
                    self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush(); self.close_connection = True
            except Exception as exc:
                item = {"time_ns":time.monotonic_ns(),"error":str(exc),"path":self.path}
                with lock: errors.append(item); append("server-errors.jsonl",item)
                try: self.send_error(400)
                except Exception: pass
    server = http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever,daemon=True); thread.start()
    origin = "http://127.0.0.1:" + str(server.server_port)
    env = {key:os.environ[key] for key in ["PATH","HOME","LANG","TMPDIR"] if key in os.environ}
    # Pi v1 enables Node compile caching; disable that optional cache to keep all probe writes bounded.
    env.update(PI_CODING_AGENT_DIR=str(agent),PROBE_ORIGIN=origin,PROBE_STRUCTURED=structured,TERM="dumb",NO_COLOR="1",PI_OFFLINE="1",NODE_DISABLE_COMPILE_CACHE="1")
    stage = case / "package"
    if args.harness == "pi":
        save(agent / "models.json", {"providers":{"context-probe":{"baseUrl":origin + "/v1","api":"openai-completions","apiKey":"FAKE_LOCAL_ONLY",
            "models":[{"id":"probe-model","name":"Synthetic context probe","reasoning":False,"input":["text"],"contextWindow":32768,"maxTokens":512,
                "cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0}}]}}})
        save(agent / "auth.json",{})
        save(agent / "settings.json",{"compaction":{"enabled":False},"retry":{"enabled":False}})
        binary = args.pi_runtime / "node_modules/.bin/pi"
        command = [str(binary),"--mode","json","--print","--provider","context-probe","--model","probe-model",
            "--no-extensions","--no-mcp","-e",str(stage / "observer.mjs"),"-e",str(stage / "extension.mjs"),
            "--no-skills","--no-prompt-templates","--no-themes","--no-context-files",
            "--tools","read,structured_probe" if mode == "structured" else "read","--session-dir",str(agent / "sessions")]
    else:
        (agent / "config.yml").write_text("advisor:\n  enabled: false\nretry:\n  modelFallback: false\n  usageAwareFallback: false\n  fallbackChains:\n    task: []\ncompaction:\n  enabled: false\n")
        env["PI_CONFIG_FILES"] = str(agent / "config.yml")
        binary = args.omp_bin
        command = [str(binary),"--cwd",str(work),"--model","context-probe/probe-model","--thinking","off","--mode","json",
            "--tools","read","--no-lsp","--no-pty","--no-extensions","--extension",str(stage / "observer.mjs"),
            "--extension",str(stage / "extension.mjs"),"--no-skills","--no-rules","--no-title",
            "--session-dir",str(agent / "sessions"),"--max-time","35s","--print"]
    command.append(task + ": Complete the controlled native context probe.")
    save(case / "invocation.json", {"argv":command,"cwd":str(work),"binary":str(binary.resolve()),"binary_sha256":sha(binary.resolve()),
        "env_overrides":{key:value for key,value in env.items() if key.startswith(("PI_","PROBE_","NODE_"))},
        "seconds_cap":SECONDS,"requests_cap":MAX_REQUESTS,"body_byte_cap":MAX_BODY,"raw_allocated_cap":RAW_LIMIT,
        "permission_overrides":[],"live_inference":False,
        "compiled_hashes":{path.name:sha(path) for path in stage.iterdir() if path.is_file()}})
    before = allocated(args.evidence.parent)
    usage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.monotonic(); peak_rss = None; status = "completed"; proc = None
    watch = AccessWatch(work / "requested.txt")
    def limits(): resource.setrlimit(resource.RLIMIT_FSIZE,(1024*1024,1024*1024))
    try:
        with (case / "stdout.jsonl").open("wb") as out, (case / "stderr.log").open("wb") as err:
            proc = subprocess.Popen(command,cwd=work,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True,preexec_fn=limits)
            while proc.poll() is None:
                watch.drain()
                try:
                    values = [int(line.split()[1]) for line in (P("/proc") / str(proc.pid) / "status").read_text().splitlines() if line.startswith(("VmRSS:","VmHWM:"))]
                    if values: peak_rss = max(max(values),peak_rss or 0)
                except FileNotFoundError: pass
                if time.monotonic() - start > SECONDS: status = "timeout"; break
                if allocated(args.evidence.parent) > RAW_LIMIT: status = "disk-cap"; break
                if errors: status = "fixture-error"; break
                time.sleep(0.05)
    except Exception as exc: status = "runner-error:" + str(exc)
    finally:
        if proc is not None:
            if proc.poll() is None:
                os.killpg(proc.pid,signal.SIGTERM)
                try: proc.wait(timeout=1)
                except subprocess.TimeoutExpired: os.killpg(proc.pid,signal.SIGKILL)
            proc.wait()
            if exists(proc.pid,True):
                os.killpg(proc.pid,signal.SIGTERM); time.sleep(0.2)
                if exists(proc.pid,True): os.killpg(proc.pid,signal.SIGKILL)
        watch.close(); server.shutdown(); server.server_close(); thread.join(timeout=2)
    usage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
    save(case / "file-access.json", {"mechanism":"inotify IN_OPEN/IN_ACCESS/IN_CLOSE_NOWRITE","path":str(work / "requested.txt"),
        "watch_before_native_launch":True,"events":watch.events})
    save(case / "resources.json", {"wall_seconds":time.monotonic()-start,"sampled_native_peak_rss_kib":peak_rss,
        "child_cpu_user_seconds":usage_after.ru_utime-usage_before.ru_utime,"child_cpu_system_seconds":usage_after.ru_stime-usage_before.ru_stime,
        "before_allocated_bytes":before,"after_allocated_bytes":allocated(args.evidence.parent),
        "scope":"Native CLI RSS samples; waited child CPU; raw evidence tree excludes separately bounded acquired runtime.",
        "live_inference":False,"token_usage":"Synthetic protocol only; no model inference or billable tokens."})
    closed = False
    try:
        with socket.create_connection(("127.0.0.1",server.server_port),timeout=0.2): pass
    except OSError: closed = True
    receipt = {"harness":args.harness,"mode":mode,"status":status,"pid":proc.pid if proc else None,"exit_code":proc.returncode if proc else None,
        "native_pid_absent":proc is not None and not exists(proc.pid),"process_group_absent":proc is not None and not exists(proc.pid,True),
        "listener_closed":closed,"server_thread_stopped":not thread.is_alive(),"actual_requests":len(requests),"fixture_errors":errors}
    save(case / "run.json",receipt)
    verification = verify(case,args.harness,mode,receipt)
    print(json.dumps({**receipt,"verified":verification["pass"]}),flush=True)
    return receipt,verification

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness",choices=["pi","omp"],required=True)
    parser.add_argument("--evidence",type=P,required=True)
    parser.add_argument("--pi-runtime",type=P)
    parser.add_argument("--omp-bin",type=P,default=P("/root/.bun/bin/omp"))
    parser.add_argument("--structured",action="store_true")
    args = parser.parse_args()
    if args.harness == "pi" and not args.pi_runtime: parser.error("--pi-runtime is required for Pi")
    if args.structured and args.harness != "pi": parser.error("--structured is only supported in this Pi fixture")
    args.evidence = args.evidence.resolve()
    args.evidence.parent.mkdir(parents=True,exist_ok=True); args.evidence.mkdir()
    if allocated(args.evidence.parent) >= RAW_LIMIT: raise SystemExit("Raw evidence cap exhausted")
    source = args.evidence / "frozen-source"; source.mkdir()
    for name in ["test/omp-hooks-native-probe.py","test/omp-hooks-native-emit.ts","src/hosts/omp-hooks.ts","src/hosts/pi-hooks.ts","src/hooks.ts","src/hook-build.ts"]:
        dest = source / name; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(REPO / name,dest)
    modes = ["structured"] if args.structured else ["baseline","context"]
    save(args.evidence / "plan.json", {"harness":args.harness,"modes":modes,"bounds":{"seconds_per_case":SECONDS,"requests_per_case":MAX_REQUESTS,
        "request_body_bytes":MAX_BODY,"raw_lane_allocated_bytes":RAW_LIMIT},"permission_overrides":[],"native_tool":"read",
        "boundary":"Real generated adapter, real command hook process, native CLI and tools; synthetic loopback model only."})
    results = []
    for mode in modes:
        receipt,verification = run_case(args,mode)
        results.append({"run":receipt,"verification":verification})
        if not verification["pass"]: break
    save(args.evidence / "results.json",results)
    save(args.evidence / "hashes.json",{str(path.relative_to(args.evidence)):sha(path) for path in sorted(args.evidence.rglob("*")) if path.is_file() and path.name != "hashes.json"})
    raise SystemExit(0 if len(results) == len(modes) and all(item["verification"]["pass"] for item in results) else 1)

if __name__ == "__main__": main()
