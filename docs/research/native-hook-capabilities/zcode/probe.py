#!/usr/bin/env python3
"""Bounded native ZCode effect probe; adapted from the retained startup fixture."""
import argparse, ctypes, hashlib, http.server, json, os, resource, secrets
import selectors, shutil, signal, socket, struct, subprocess, threading, time
from pathlib import Path

LANE_CAP = 20 * 1024 * 1024
REQUEST_CAP = 256 * 1024
JOURNAL_CAP = 2 * 1024 * 1024
LOG_CAP = 1024 * 1024
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write_json(path, value): Path(path).write_text(json.dumps(value, indent=2) + "\n")
def allocated(path):
    return int(subprocess.check_output(["du","-sk",str(path)]).split()[0]) * 1024
def rows(path):
    return [json.loads(x) for x in Path(path).read_text().splitlines()] if Path(path).exists() else []
def inotify_watch(path):
    libc = ctypes.CDLL(None, use_errno=True)
    fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
    if fd < 0: raise OSError(ctypes.get_errno(), "inotify_init1")
    wd = libc.inotify_add_watch(fd, os.fsencode(path), 0x1 | 0x20)
    if wd < 0: os.close(fd); raise OSError(ctypes.get_errno(), "inotify_add_watch")
    return fd, wd
def inotify_finish(fd):
    events = []
    while True:
        try: data = os.read(fd, 65536)
        except BlockingIOError: break
        if not data: break
        offset = 0
        while offset < len(data):
            wd, mask, cookie, size = struct.unpack_from("iIII", data, offset)
            events.append({"wd":wd,"mask":mask,"cookie":cookie})
            offset += 16 + size
    os.close(fd)
    return {"events":events,"open_events":sum(bool(e["mask"] & 0x20) for e in events),
            "access_events":sum(bool(e["mask"] & 0x1) for e in events),
            "queue_overflow":any(e["mask"] & 0x4000 for e in events),
            "note":"Kernel inode events may coalesce; positive/zero witness, not exact read counts."}
def run_native(argv, env, out, lane):
    started = time.monotonic_ns()
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    proc = subprocess.Popen(argv, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    sel, files = selectors.DefaultSelector(), {}
    for name, pipe in [("stdout",proc.stdout),("stderr",proc.stderr)]:
        sel.register(pipe, selectors.EVENT_READ, name)
        files[name] = (out / (name+".txt")).open("wb")
    failure, total, deadline, next_disk = None, 0, time.monotonic()+40, time.monotonic()+1
    try:
        while sel.get_map():
            now = time.monotonic()
            if failure is None and now >= deadline: failure = "40s native timeout"
            if failure is None and now >= next_disk:
                next_disk = now+1
                if allocated(lane) > LANE_CAP: failure = "20MiB lane cap"
            if failure and proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try: proc.wait(timeout=2)
                except subprocess.TimeoutExpired: os.killpg(proc.pid, signal.SIGKILL)
            for key, _ in sel.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk: sel.unregister(key.fileobj); key.fileobj.close(); continue
                remaining = max(0, LOG_CAP-total)
                files[key.data].write(chunk[:remaining]); total += min(remaining, len(chunk))
                if len(chunk) > remaining and failure is None: failure = "1MiB process log cap"
            if failure and time.monotonic() > deadline+4:
                break
        proc.wait(timeout=2)
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGKILL); proc.wait(timeout=2)
        for f in files.values(): f.close()
        sel.close()
    ended = time.monotonic_ns()
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    return {"pid":proc.pid,"exit_code":proc.returncode,"failure":failure,
            "started_monotonic_ns":started,"ended_monotonic_ns":ended,"wall_ms":(ended-started)/1e6,
            "log_bytes":total,"pid_absent":not Path("/proc",str(proc.pid)).exists(),
            "resources":{"child_user_seconds":after.ru_utime-before.ru_utime,
                         "child_system_seconds":after.ru_stime-before.ru_stime,
                         "children_maxrss_kib_cumulative":after.ru_maxrss}}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("evidence"); p.add_argument("--node",required=True); p.add_argument("--cli",required=True)
    p.add_argument("--source",required=True); p.add_argument("--bundle-cache",required=True)
    a=p.parse_args()
    host_net=Path("/proc/1/ns/net").readlink(); own_net=Path("/proc/self/ns/net").readlink()
    if own_net == host_net: raise RuntimeError("Launch via unshare --net; refusing host networking")
    subprocess.run(["ip","link","set","lo","up"], check=True)
    root=Path(a.evidence).resolve(); root.mkdir(parents=True, exist_ok=True)
    before_bytes=allocated(root)
    if before_bytes>LANE_CAP: raise RuntimeError("20MiB lane cap already exceeded")
    attempt=root/(time.strftime("%Y%m%dT%H%M%S")+"-"+secrets.token_hex(3)); attempt.mkdir()
    for name in ("probe.py","hook.py","verify.py"): shutil.copy2(Path(__file__).with_name(name),attempt/name)
    identity={"source_commit":subprocess.check_output(["git","-C",a.source,"rev-parse","HEAD"],text=True).strip(),
              "source_status_before":subprocess.check_output(["git","-C",a.source,"status","--short"],text=True),
              "cli":a.cli,"cli_sha256":digest(a.cli),"node":a.node,"node_sha256":digest(a.node),
              "node_version":subprocess.check_output([a.node,"--version"],text=True).strip(),
              "reported_harness_version":"0.16.9","network_namespace":str(own_net),
              "host_network_namespace":str(host_net),"native_protocol":"OpenAI Chat Completions",
              "runtime_storage_allocated_bytes":allocated(Path(a.source).parent),
              "clock":"Both process hooks and receiver use Python time.monotonic_ns on the same kernel.",
              "budgets":{"case_wall_seconds":45,"native_timeout_seconds":40,"requests_per_case":6,
                         "request_body_bytes":REQUEST_CAP,"request_journal_bytes":JOURNAL_CAP,
                         "process_log_bytes_per_case":LOG_CAP,"lane_allocated_bytes":LANE_CAP}}
    write_json(attempt/"identity.json", identity)
    current={}; captured=[]; budget_failures=[]; capture_bytes=0; lock=threading.Lock()
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def send_json(self,payload):
            data=json.dumps(payload).encode();self.send_response(200)
            self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(data)))
            self.end_headers();self.wfile.write(data)
        def do_GET(self):self.send_json({"object":"list","data":[{"id":"gpt-4o-mini","object":"model"}]})
        def do_POST(self):
            nonlocal capture_bytes
            size=int(self.headers.get("Content-Length","0"))
            if size>REQUEST_CAP:budget_failures.append("256KiB request body cap");self.send_error(413);return
            body=json.loads(self.rfile.read(size))
            with lock:
                current["requests"]+=1
                if current["requests"]>6:budget_failures.append("6 requests/case cap");self.send_error(429);return
                row={"case":current["case"],"path":self.path,"monotonic_ns":time.monotonic_ns(),"body":body}
                data=json.dumps(row)+"\n"
                if capture_bytes+len(data.encode())>JOURNAL_CAP:budget_failures.append("2MiB request journal cap");self.send_error(429);return
                capture_bytes+=len(data.encode());captured.append(row)
                with (attempt/"requests.jsonl").open("a") as f:f.write(data)
                is_task=current["task_nonce"] in json.dumps(body.get("messages",[]))
                if is_task: current["task_requests"]+=1
                if is_task and current["task_requests"]==1:
                    message={"role":"assistant","content":None,"tool_calls":[{"index":0,"id":current["tool_id"],
                             "type":"function","function":{"name":"Read","arguments":json.dumps({"file_path":current["original"]})}}]}
                    finish="tool_calls"
                else:message={"role":"assistant","content":"SYNTHETIC_FIXTURE_COMPLETE"};finish="stop"
            if body.get("stream"):
                self.send_response(200);self.send_header("Content-Type","text/event-stream");self.end_headers()
                for payload in [{"id":"fixture","object":"chat.completion.chunk","created":0,"model":"gpt-4o-mini","choices":[{"index":0,"delta":message,"finish_reason":None}]},
                                {"id":"fixture","object":"chat.completion.chunk","created":0,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":finish}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}]:
                    self.wfile.write(("data: "+json.dumps(payload)+"\n\n").encode())
                self.wfile.write(b"data: [DONE]\n\n")
            else:self.send_json({"id":"fixture","object":"chat.completion","created":0,"model":"gpt-4o-mini","choices":[{"index":0,"message":message,"finish_reason":finish}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}})
    server=http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler);port=server.server_address[1]
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    cases=[]
    try:
        for case in ("baseline","effects","deny"):
            if allocated(root)>LANE_CAP:raise RuntimeError("20MiB lane cap")
            out=attempt/case;out.mkdir();profile=out/"profile";config_path=profile/".zcode/cli/config.json"
            config_path.parent.mkdir(parents=True);cache=config_path.parent/"plugins/cache"
            cache.parent.mkdir(parents=True);cache.symlink_to(Path(a.bundle_cache).resolve(),target_is_directory=True)
            cwd=out/"project";cwd.mkdir();original=cwd/"original.txt"
            original_content="ZCODE_ORIGINAL_FILE_"+secrets.token_hex(20);original.write_text(original_content+"\n")
            task_nonce="TASK_"+secrets.token_hex(16);tool_id="read-"+case
            current.update(case=case,requests=0,task_requests=0,task_nonce=task_nonce,tool_id=tool_id,original=str(original))
            events=out/"events.jsonl"
            hooks={event:[{"hooks":[{"type":"process","command":"/usr/bin/python3",
                   "args":[str(attempt/"hook.py"),event,str(events),case,str(cwd)]}]}]
                   for event in ("SessionStart","PreToolUse","PostToolUse","Stop")}
            config={"model":"probe/gpt-4o-mini","provider":{"probe":{"kind":"openai-compatible","name":"Loopback fixture",
                    "options":{"baseURL":f"http://127.0.0.1:{port}/v1","apiKey":"fixture-not-a-secret"},
                    "models":{"gpt-4o-mini":{"contextWindow":128000,"supportsToolCall":True}}}},
                    "plugins":{"enabled":False},"features":{"mcp":False},"hooks":{"enabled":True,"timeoutMs":2500,"events":hooks},
                    "modelStream":{"idleTimeoutMs":5000}}
            write_json(config_path,config);write_json(out/"config.json",config)
            prompt=f"Probe task {task_nonce}. Read {original} with Read then finish."
            native=[a.node,a.cli,"--prompt",prompt,"--json","--no-color","--mode","plan","--workflow-mode","disabled"]
            argv=["bwrap","--ro-bind","/","/","--tmpfs","/root","--ro-bind","/root/.local","/root/.local",
                  "--ro-bind",str(Path(a.source).parent),str(Path(a.source).parent),
                  "--bind",str(profile/".zcode"),"/root/.zcode","--bind",str(Path(a.bundle_cache).resolve()),str(Path(a.bundle_cache).resolve()),
                  "--dev","/dev","--proc","/proc","--bind",str(attempt),str(attempt),
                  "--tmpfs","/tmp","--chdir",str(cwd),*native]
            env={k:os.environ[k] for k in ("PATH","HOME","LANG") if k in os.environ}
            env.update(ZCODE_STORAGE_DIR=str(profile/".zcode"),ZCODE_DATA_BASE_DIR=str(profile),ZCODE_MODEL_TELEMETRY_ENABLED="0",NO_COLOR="1")
            write_json(out/"case.json",{"case":case,"argv":argv,"task_nonce":task_nonce,"tool_id":tool_id,
                       "original":str(original),"original_content":original_content,
                       "mode":"--mode plan; native mode build with planEnabled true","env_names":sorted(env)})
            fd,wd=inotify_watch(original)
            try: result=run_native(argv,env,out,root)
            finally: witness=inotify_finish(fd)
            write_json(out/"file-access.json",{"watched_path":str(original),"watch_descriptor":wd,**witness})
            result.update(case=case,request_count=current["requests"],task_request_count=current["task_requests"],
                          allocated_lane_bytes=allocated(root),hook_pids=[r["pid"] for r in rows(events) if r["stage"]=="enter"])
            result["hook_pids_absent"]=all(not Path("/proc",str(pid)).exists() for pid in result["hook_pids"])
            write_json(out/"run.json",result);cases.append(result)
            print(json.dumps({"case":case,"exit":result["exit_code"],"failure":result["failure"],
                              "requests":result["request_count"],"file_opens":witness["open_events"],"wall_ms":result["wall_ms"]}),flush=True)
            if result["failure"] or result["exit_code"]!=0: break
    finally:
        server.shutdown();server.server_close();thread.join()
    with socket.socket() as s: listener_closed=s.connect_ex(("127.0.0.1",port))!=0
    source_status=subprocess.check_output(["git","-C",a.source,"status","--short"],text=True)
    report={"schema":1,"attempt":str(attempt),"cases":cases,"listener_closed":listener_closed,
            "request_capture_bytes":capture_bytes,"budget_failures":budget_failures,
            "raw_bytes_before":before_bytes,"raw_bytes_after":allocated(root),"source_status_after":source_status,
            "backend":"Synthetic localhost provider; usage counters are fixture values; no live inference.",
            "limitations":["fresh native noninteractive CLI only","built-in Read only","no native allow/ask override probe",
                           "no post-tool replacement claim","one Stop continuation only; native maximum not probed",
                           "no crash cleanup or plugin installation certification"]}
    write_json(attempt/"report.json",report)
    check=subprocess.run(["/usr/bin/python3",str(attempt/"verify.py"),str(attempt)],capture_output=True,text=True)
    (attempt/"verification.stdout.json").write_text(check.stdout);(attempt/"verification.stderr.txt").write_text(check.stderr)
    manifest={str(f.relative_to(attempt)):{"sha256":digest(f),"bytes":f.stat().st_size}
              for f in sorted(attempt.rglob("*")) if f.is_file() and not f.is_symlink()}
    write_json(attempt/"manifest.json",manifest)
    print(json.dumps({"attempt":str(attempt),"verification_exit":check.returncode,
                      "raw_bytes":allocated(root),"files":len(manifest),"listener_closed":listener_closed}),flush=True)
    raise SystemExit(check.returncode)
if __name__=="__main__":main()
