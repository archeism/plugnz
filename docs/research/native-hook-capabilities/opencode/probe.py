#!/usr/bin/env python3
"""Real OpenCode tool-effect probes with loopback provider and kernel file-access witness."""
import argparse, hashlib, http.server, json, os, pathlib, resource, shutil, signal, subprocess, threading, time, uuid, ctypes, struct
P = pathlib.Path
SOURCE = P(__file__).resolve().parent

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def allocated(path):
    return int(subprocess.check_output(['du', '-s', '-B1', str(path)], text=True).split()[0])

def parse_events(path):
    if not path.exists():
        return []
    values = []
    for line in path.read_text().splitlines():
        try:
            values.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return values

def text_content(message):
    content = message.get('content', '')
    if isinstance(content, str):
        return content
    return '\n'.join(p.get('text', '') for p in content or [] if isinstance(p, dict) and p.get('type') in ['text', 'input_text'])

def run_case(root, runtime, name, deliver, session=None, state=None, tool=False):
    case = root / name
    case.mkdir()
    cwd = (state / 'work') if state else case / 'work'
    cwd.mkdir(exist_ok=True)
    state = state or case
    runtime_state = runtime / 'probe-state' / ('hook-actions-' + root.name) / state.name
    config_dir = runtime_state / 'config/opencode'
    config_dir.mkdir(parents=True, exist_ok=True)
    (runtime_state / 'tmp').mkdir(exist_ok=True)
    original_content = 'ORIGINAL_FILE_' + uuid.uuid4().hex
    alternate_content = 'ALTERNATE_FILE_' + uuid.uuid4().hex
    (cwd / 'harmless.txt').write_text(original_content + '\n')
    (cwd / 'alternate.txt').write_text(alternate_content + '\n')
    save(case / 'inputs.json', {'original_content': original_content, 'alternate_content': alternate_content, 'original_path': str(cwd/'harmless.txt'), 'alternate_path': str(cwd/'alternate.txt'), 'action': name})
    libc = ctypes.CDLL(None, use_errno=True)
    watcher = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
    if watcher < 0: raise OSError(ctypes.get_errno(), 'inotify_init1')
    watched = {}
    for file in [cwd/'harmless.txt', cwd/'alternate.txt']:
        wd = libc.inotify_add_watch(watcher, str(file).encode(), 0x00000001 | 0x00000020)
        if wd < 0: raise OSError(ctypes.get_errno(), 'inotify_add_watch')
        watched[wd] = file.name
    access_events = []
    def drain_access():
        while True:
            try: data = os.read(watcher, 65536)
            except BlockingIOError: break
            if not data: break
            offset = 0
            while offset < len(data):
                wd, mask, cookie, size = struct.unpack_from('iIII', data, offset)
                offset += 16 + size
                access_events.append({'file': watched.get(wd), 'mask': mask, 'observer_ns': time.monotonic_ns()})

    task = 'TASK_OPENCODE_' + uuid.uuid4().hex
    prompt = task + ': Complete the controlled probe.'
    requests = []
    fixture_errors = []
    task_request_count = 0
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            nonlocal task_request_count
            length = int(self.headers.get('content-length', '0'))
            if self.path == '/observe':
                if length > 256 * 1024:
                    self.send_error(413)
                    return
                observation = json.loads(self.rfile.read(length))
                observation['monotonic_ns'] = time.monotonic_ns()
                with (case / 'events.jsonl').open('a') as f:
                    f.write(json.dumps(observation) + '\n')
                self.send_response(204)
                self.end_headers()
                return
            if length > 256 * 1024 or len(requests) >= 6:
                self.send_error(429)
                fixture_errors.append('request budget exceeded')
                return
            try:
                body = json.loads(self.rfile.read(length))
            except Exception:
                self.send_error(400)
                fixture_errors.append('invalid JSON')
                return
            relevant = any(task in text_content(m) for m in body.get('messages', []) if m.get('role') == 'user')
            if relevant:
                task_request_count += 1
            req = {'monotonic_ns': time.monotonic_ns(), 'path': self.path, 'body': body, 'index': len(requests), 'task_related': relevant}
            requests.append(req)
            with (case / 'requests.jsonl').open('a') as f:
                f.write(json.dumps(req) + '\n')
            if self.path != '/v1/chat/completions':
                self.send_error(404)
                fixture_errors.append('unexpected endpoint: ' + self.path)
                return
            call_tool = tool and relevant and task_request_count == 1
            call = {'id': 'call_opencode_read', 'type': 'function', 'function': {'name': 'read', 'arguments': json.dumps({'filePath': str(cwd / 'harmless.txt')})}}
            finish = 'tool_calls' if call_tool else 'stop'
            if not body.get('stream'):
                response = {'id': 'chatcmpl-local-' + str(len(requests)), 'object': 'chat.completion', 'created': 1, 'model': 'probe-model', 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'PROBE_COMPLETE'}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}}
                data = json.dumps(response).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            content = {'tool_calls': [{'index': 0, **call}]} if call_tool else {'content': 'PROBE_COMPLETE'}
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            for delta, done in [({'role': 'assistant'}, None), (content, None), ({}, finish)]:
                packet = {'id': 'chatcmpl-local-' + str(len(requests)), 'object': 'chat.completion.chunk', 'created': 1, 'model': 'probe-model', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': done}]}
                self.wfile.write(('data: ' + json.dumps(packet) + '\n\n').encode())
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
            self.close_connection = True
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    endpoint = 'http://127.0.0.1:' + str(server.server_port) + '/v1'
    config = {'$schema': 'https://opencode.ai/config.json', 'model': 'boundary-probe/probe-model', 'small_model': 'boundary-probe/probe-model', 'enabled_providers': ['boundary-probe'], 'share': 'disabled', 'autoupdate': False, 'plugin': [(SOURCE / 'startup-plugin.mjs').as_uri()], 'provider': {'boundary-probe': {'npm': '@ai-sdk/openai-compatible', 'name': 'Boundary probe', 'options': {'baseURL': endpoint, 'apiKey': 'FAKE_LOCAL_ONLY'}, 'models': {'probe-model': {'name': 'Boundary probe', 'limit': {'context': 64000, 'output': 128}}}}}}
    save(config_dir / 'opencode.json', config)
    save(case / 'config.snapshot.json', config)
    env = {k: os.environ[k] for k in ['PATH', 'HOME', 'LANG'] if k in os.environ}
    env.update(XDG_CONFIG_HOME=str(runtime_state / 'config'), XDG_DATA_HOME=str(state / 'data'), XDG_STATE_HOME=str(state / 'state'), XDG_CACHE_HOME=str(runtime / 'probe-cache'), TMPDIR=str(runtime_state / 'tmp'), OPENCODE_CONFIG=str(config_dir / 'opencode.json'), OPENCODE_CONFIG_DIR=str(config_dir), PROBE_EVENTS=str(case / 'events.jsonl'), PROBE_DELIVER='1' if deliver else '0', PROBE_ACTION=name, PROBE_ALTERNATE=str(cwd/'alternate.txt'), PROBE_OBSERVER=endpoint.removesuffix('/v1') + '/observe')
    for flag in ['OPENCODE_DISABLE_AUTOUPDATE', 'OPENCODE_DISABLE_MODELS_FETCH', 'OPENCODE_DISABLE_DEFAULT_PLUGINS', 'OPENCODE_DISABLE_EXTERNAL_SKILLS', 'OPENCODE_DISABLE_CLAUDE_CODE', 'OPENCODE_DISABLE_LSP_DOWNLOAD', 'OPENCODE_DISABLE_PROJECT_CONFIG']:
        env[flag] = '1'
    command = [str(runtime / 'node_modules/.bin/opencode'), 'run', '--format', 'json', '--title', 'Boundary context probe', '--model', 'boundary-probe/probe-model']
    if session:
        command += ['--session', session]
    command.append(prompt)
    snapshot = case / 'source'
    snapshot.mkdir()
    for f in ['probe.py', 'startup-plugin.mjs']:
        shutil.copyfile(SOURCE / f, snapshot / f)
    save(case / 'invocation.json', {'argv': command, 'env_overrides': {k: v for k, v in env.items() if k not in ['PATH', 'HOME', 'LANG']}, 'cwd': str(cwd), 'task_identifier': task, 'nonce_source': 'hooks create their own startup, transform, denial and replacement markers; file markers exist only in controlled files', 'timeout_seconds': 45, 'request_cap': 6, 'request_body_cap_bytes': 262144, 'permissions': 'native defaults; no --auto and no permission override'})
    before = allocated(root)
    start = time.monotonic()
    status = 'completed'
    usage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
    sampled_peak_rss_kib = 0
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024 * 1024, 2 * 1024 * 1024))
    with (case / 'stdout.jsonl').open('wb') as out, (case / 'stderr.log').open('wb') as err:
        proc = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True, preexec_fn=limits)
        try:
            while proc.poll() is None:
                drain_access()
                try:
                    lines = (P('/proc') / str(proc.pid) / 'status').read_text().splitlines()
                    sampled_peak_rss_kib = max(sampled_peak_rss_kib, max([int(line.split()[1]) for line in lines if line.startswith(('VmRSS:', 'VmHWM:'))], default=0))
                except FileNotFoundError:
                    pass
                if time.monotonic() - start > 45:
                    status = 'timeout'
                    break
                if allocated(root) > 20 * 1024 * 1024 or allocated(runtime) > 2 * 1024 * 1024 * 1024:
                    status = 'disk-cap'
                    break
                time.sleep(0.1)
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            drain_access()
            os.close(watcher)
            save(case / 'file-access.json', access_events)
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
    usage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
    save(case / 'resources.json', {'sampled_runtime_peak_rss_kib': sampled_peak_rss_kib, 'sample_interval_seconds': 0.1, 'child_cpu_user_seconds': usage_after.ru_utime - usage_before.ru_utime, 'child_cpu_system_seconds': usage_after.ru_stime - usage_before.ru_stime, 'cpu_scope': 'native CLI plus disk measurement subprocesses during this case'})
    events = parse_events(case / 'events.jsonl')
    startups = [e for e in events if e['event'] == 'startup_complete']
    transforms = [e for e in events if e['event'] == 'transform_complete']
    relevant = [r for r in requests if r['task_related']]
    first = relevant[0] if relevant else None
    nonce = startups[0]['nonce'] if startups else None
    transform = next((e for e in transforms if first and int(e['monotonic_ns']) < first['monotonic_ns']), None)
    locations = [{'index': i, 'role': m.get('role'), 'content': text_content(m)} for i, m in enumerate(first['body'].get('messages', [])) if nonce and nonce in text_content(m)] if first else []
    system_locations = [p for p in locations if p['role'] in ['system', 'developer']]
    stdout_events = parse_events(case / 'stdout.jsonl')
    session_id = transform.get('sessionId') if transform else next((e.get('sessionID') for e in stdout_events if e.get('sessionID')), None)
    checks = {'startup_hook_once': len(startups) == 1, 'first_task_request_exists': bool(first), 'startup_nonce_delivered_expected': bool(system_locations) == deliver if first and nonce else False, 'transform_nonce_delivered_expected': any(transform['nonce'] in text_content(m) for m in first['body'].get('messages', []) if m.get('role') in ['system', 'developer']) == deliver if first and transform else False, 'first_request_after_hook_complete': bool(first and startups and first['monotonic_ns'] > int(startups[0]['monotonic_ns'])), 'first_request_after_transform_complete': bool(transform), 'normal_cli_exit': proc.returncode == 0 and status == 'completed', 'normal_completion_received': any(e.get('type') == 'step_finish' and e.get('part', {}).get('reason') == 'stop' for e in stdout_events), 'no_fixture_error': not fixture_errors}
    before_events = [e for e in events if e['event'] == 'tool_before']
    after_events = [e for e in events if e['event'] == 'tool_after_before_mutation']
    received_tools = [m for r in relevant[1:] for m in r['body'].get('messages', []) if m.get('role') == 'tool' and m.get('tool_call_id') == 'call_opencode_read']
    received_text = '\n'.join(text_content(m) for m in received_tools)
    checks.update(exactly_one_pre=len(before_events)==1, second_task_request=len(relevant)==2, correlated_tool_result=bool(received_tools))
    accesses = {label: [e for e in access_events if e['file']==label and e['mask'] & (1|32)] for label in ['harmless.txt','alternate.txt']}
    if name in ['baseline','rebind']:
        checks.update(original_result_received=original_content in received_text,
                      alternate_absent=alternate_content not in received_text,
                      original_file_accessed=bool(accesses['harmless.txt']),
                      alternate_file_unaccessed=not accesses['alternate.txt'],
                      native_post_once=len(after_events)==1)
    elif name == 'rewrite-replace':
        replacement = next((e.get('nonce') for e in events if e['event']=='replacement'),None)
        checks.update(alternate_actually_read=len(after_events)==1 and alternate_content in after_events[0].get('output',''),
                      alternate_file_accessed=bool(accesses['alternate.txt']),
                      original_file_unaccessed=not accesses['harmless.txt'],
                      replacement_received=bool(replacement and replacement in received_text),
                      original_and_alternate_hidden_from_next_result=original_content not in received_text and alternate_content not in received_text)
    elif name == 'deny':
        denied = next((e.get('nonce') for e in events if e['event']=='denied'),None)
        checks.update(no_native_post=not after_events, both_files_unaccessed=not any(accesses.values()),
                      denial_received=bool(denied and denied in received_text),
                      original_and_alternate_absent=original_content not in received_text and alternate_content not in received_text)
    result = {'case': name, 'verdict': 'pass' if all(checks.values()) else 'fail', 'status': status, 'exit_code': proc.returncode, 'checks': checks, 'nonce': nonce, 'transform_nonce': transform.get('nonce') if transform else None, 'nonce_locations': locations, 'session_id': session_id, 'request_count': len(requests), 'first_task_request_index': first['index'] if first else None, 'wall_seconds': time.monotonic() - start, 'disk_bytes_before': before, 'disk_bytes_after': allocated(root), 'runtime_disk_bytes': allocated(runtime), 'fixture_errors': fixture_errors, 'listener_closed': not thread.is_alive(), 'process_waited': proc.returncode is not None}
    save(case / 'result.json', result)
    print(json.dumps({k: v for k, v in result.items() if k != 'nonce_locations'}), flush=True)
    return result, state

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runtime', required=True, type=P)
    ap.add_argument('--evidence', required=True, type=P)
    args = ap.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=False)
    results = []
    for name in ['baseline','rebind','rewrite-replace','deny']:
        result, _ = run_case(args.evidence, args.runtime, name, True, tool=True)
        results.append(result)
        if result['verdict'] != 'pass':
            break
    summary = {'claim': 'Native OpenCode tool hooks can deny execution, mutate read arguments in place and replace model-visible read output; rebinding output.args is an observed negative control.',
               'results': results, 'all_pass': len(results)==4 and all(r['verdict']=='pass' for r in results),
               'clock': 'One Python loopback receiver timestamps hook observations and model requests. Linux inotify witnesses target file OPEN/ACCESS.',
               'synthetic': 'Loopback OpenAI Chat Completions responses only; real native CLI/plugin loader/read/runtime. No live model inference.',
               'permissions': 'Native defaults; isolated XDG profile; no approval override.',
               'limits': {'case_seconds':45,'case_requests':6,'request_bytes':262144,'raw_lane_bytes':20971520},
               'parent_probe_sha256': '0cecf32d5d93d1d604c05bddd92dd46a3dda2e38b69c9aefb4a20ca895906e58'}
    save(args.evidence / 'summary.json', summary)
    files = sorted(p for p in args.evidence.rglob('*') if p.is_file())
    save(args.evidence / 'hashes.json', {str(p.relative_to(args.evidence)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
    raise SystemExit(0 if summary['all_pass'] else 1)

if __name__ == '__main__':
    main()
