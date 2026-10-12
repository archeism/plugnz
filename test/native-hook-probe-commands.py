#!/usr/bin/env python3
"""Bounded real command-hook adapter probe. Provider output is synthetic; profile is owned."""
import argparse, hashlib, http.server, json, os, secrets, shutil
import socket, subprocess, threading, time, uuid
from pathlib import Path

import ctypes, resource, selectors, signal, struct, sys
LANE_CAP=64*1024*1024
LOG_CAP=1024*1024
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
                if allocated(lane) > LANE_CAP: failure = "64MiB lane cap"
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
write=write_json


def build(worktree, attempt, harness):
    authored=attempt/'authored'; authored.mkdir()
    write(authored/'plugin.json',{'name':'plugnz-native-context-probe','version':'1.0.0','description':'Owned native hook mechanics fixture'})
    handler=authored/'handler.py'
    handler.write_text('''import json,secrets,sys,time,os
from pathlib import Path
input=json.load(sys.stdin)
time.sleep(0.08)
nonce='NATIVE_'+input['event'].replace('.','_')+'_'+secrets.token_hex(20)
result={}
if input['event']!='turn.stop': result={'context':nonce}
elif not input['stop']['active']: result={'continue':True,'context':nonce}
row={'pid':os.getpid(),'monotonic_ns':time.monotonic_ns(),'input':input,'nonce':nonce,'result':result}
with Path(sys.argv[1]).open('a') as f:f.write(json.dumps(row)+'\\n')
print(json.dumps(result),flush=True)
''')
    event_path=attempt/'events.jsonl'
    write(authored/'plugnz.hooks.json',{'version':1,'hooks':{event:[{'command':['/usr/bin/python3','${PLUGIN_ROOT}/handler.py',str(event_path)],'timeoutMs':2500}] for event in ['session.start','tool.before','tool.after','turn.stop']}})
    code="import {buildHooks} from " + json.dumps(str(worktree/'src/hook-build.ts')) + ";console.log(JSON.stringify(buildHooks(process.argv[1],[process.argv[2]],process.argv[3])));"
    made=subprocess.run(['bun','-e',code,str(authored),harness,str(attempt/'built')],cwd=worktree,capture_output=True,text=True,timeout=30)
    (attempt/'build.stdout').write_text(made.stdout);(attempt/'build.stderr').write_text(made.stderr)
    if made.returncode:raise RuntimeError('Actual hook build failed: '+made.stderr)
    return attempt/'built'/harness

def main():
    ap=argparse.ArgumentParser();ap.add_argument('harness',choices=['claude-code','codex','zcode-cli']);ap.add_argument('--evidence',required=True);ap.add_argument('--worktree',required=True);ap.add_argument('--review',action='store_true');ap.add_argument('--reuse-attempt');a=ap.parse_args()
    lane=Path(a.evidence).resolve();lane.mkdir(parents=True,exist_ok=True)
    if a.harness=='zcode-cli':
        if Path('/proc/self/ns/net').readlink()==Path('/proc/1/ns/net').readlink():raise RuntimeError('ZCode requires unshare --net')
        subprocess.run(['ip','link','set','lo','up'],check=True)
    if allocated(lane)>64*1024*1024:raise RuntimeError('64MiB lane budget exhausted')
    attempt=Path(a.reuse_attempt).resolve() if a.reuse_attempt else lane/(a.harness+'-'+time.strftime('%Y%m%dT%H%M%S')+'-'+secrets.token_hex(3))
    if not a.reuse_attempt:attempt.mkdir()
    if not a.reuse_attempt:shutil.copy2(__file__,attempt/'probe.py')
    target=attempt/'built'/a.harness if a.reuse_attempt else build(Path(a.worktree).resolve(),attempt,a.harness)
    project=attempt/'project';project.mkdir(exist_ok=True);original=project/'harmless.txt';content=original.read_text().strip() if a.reuse_attempt else 'HARMLESS_'+secrets.token_hex(20);original.write_text(content+'\n')
    task='TASK_'+secrets.token_hex(20);requests=[];budget_failures=[];tool_id='native-owned-read';lock=threading.Lock()
    class Provider(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def js(self,value):
            data=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        def do_GET(self):self.js({'object':'list','data':[]})
        def do_POST(self):
            size=int(self.headers.get('Content-Length','0'))
            if size>256*1024:budget_failures.append('256KiB body cap');self.send_error(413);return
            body=json.loads(self.rfile.read(size))
            if 'count_tokens' in self.path:self.js({'input_tokens':1});return
            with lock:
                if len(requests)>=6:budget_failures.append('6 requests cap');self.send_error(429);return
                row={'monotonic_ns':time.monotonic_ns(),'path':self.path,'body':body};requests.append(row)
                with (attempt/'requests.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
                number=len(requests)
            if a.harness=='claude-code':
                blocks=[{'type':'tool_use','id':tool_id,'name':'Read','input':{'file_path':str(original)}}] if number==1 else [{'type':'text','text':'SYNTHETIC_FIXTURE_COMPLETE'}]
                reason='tool_use' if number==1 else 'end_turn'
                msg={'id':'msg_fixture','type':'message','role':'assistant','model':body.get('model','claude-sonnet-4-6'),'content':blocks,'stop_reason':reason,'stop_sequence':None,'usage':{'input_tokens':1,'output_tokens':1}}
                if not body.get('stream'):self.js(msg);return
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                def emit(name,payload):self.wfile.write(('event: '+name+'\ndata: '+json.dumps(payload)+'\n\n').encode());self.wfile.flush()
                emit('message_start',{'type':'message_start','message':{**msg,'content':[],'stop_reason':None}})
                for i,part in enumerate(blocks):
                    emit('content_block_start',{'type':'content_block_start','index':i,'content_block':{**part,**({'input':{}} if part['type']=='tool_use' else {'text':''})}})
                    delta={'type':'input_json_delta','partial_json':json.dumps(part['input'])} if part['type']=='tool_use' else {'type':'text_delta','text':part['text']}
                    emit('content_block_delta',{'type':'content_block_delta','index':i,'delta':delta});emit('content_block_stop',{'type':'content_block_stop','index':i})
                emit('message_delta',{'type':'message_delta','delta':{'stop_reason':reason,'stop_sequence':None},'usage':{'output_tokens':1}});emit('message_stop',{'type':'message_stop'})
            elif a.harness=='zcode-cli':
                msg={'role':'assistant','content':None,'tool_calls':[{'index':0,'id':tool_id,'type':'function','function':{'name':'Read','arguments':json.dumps({'file_path':str(original)})}}]} if number==1 else {'role':'assistant','content':'SYNTHETIC_FIXTURE_COMPLETE'}
                reason='tool_calls' if number==1 else 'stop'
                if not body.get('stream'):self.js({'id':'fixture','object':'chat.completion','created':0,'model':'gpt-4o-mini','choices':[{'index':0,'message':msg,'finish_reason':reason}]});return
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                for payload in [{'id':'fixture','object':'chat.completion.chunk','created':0,'model':'gpt-4o-mini','choices':[{'index':0,'delta':msg,'finish_reason':None}]},{'id':'fixture','object':'chat.completion.chunk','created':0,'model':'gpt-4o-mini','choices':[{'index':0,'delta':{},'finish_reason':reason}],'usage':{'prompt_tokens':10,'completion_tokens':5,'total_tokens':15}}]:self.wfile.write(('data: '+json.dumps(payload)+'\n\n').encode())
                self.wfile.write(b'data: [DONE]\n\n')
            else:
                if number==1:
                    names=[x.get('name') for x in body.get('tools',[]) if x.get('type')=='function'];write(attempt/'advertised-tools.json',body.get('tools',[]))
                    name='exec_command' if 'exec_command' in names else 'shell' if 'shell' in names else 'exec'
                    arguments={'cmd':'cat '+str(original),'workdir':str(project),'max_output_tokens':1000} if name=='exec_command' else {'command':['cat',str(original)]} if name=='shell' else {'code':"const r=await tools.exec_command({cmd:"+json.dumps('cat '+str(original))+"});text(r);"}
                    item={'id':'fc_fixture','type':'function_call','call_id':tool_id,'name':name,'arguments':json.dumps(arguments),'status':'completed'}
                else:item={'id':'msg_fixture','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'SYNTHETIC_FIXTURE_COMPLETE','annotations':[]}]}
                response={'id':'resp_fixture','object':'response','created_at':int(time.time()),'status':'completed','model':'codex-probe','output':[item],'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}
                stream=[{'type':'response.created','response':{**response,'status':'in_progress','output':[]}},{'type':'response.output_item.added','output_index':0,'item':{**item,'status':'in_progress'}},{'type':'response.output_item.done','output_index':0,'item':item},{'type':'response.completed','response':response}]
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Connection','close');self.end_headers()
                for seq,event in enumerate(stream):event['sequence_number']=seq;self.wfile.write(('event: '+event['type']+'\ndata: '+json.dumps(event)+'\n\n').encode())
                self.wfile.flush()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider);port=server.server_address[1];thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    env={k:os.environ[k] for k in ['PATH','HOME','LANG','USER','LOGNAME','TERM','SHELL'] if k in os.environ};profile=attempt/'profile';profile.mkdir(exist_ok=True);prompt=task+'. Read '+str(original)+' once then finish.'
    native_hooks=json.loads((target/'hooks/hooks.json').read_text())['hooks']
    if a.harness=='claude-code':
        temporary=attempt/'tmp';temporary.mkdir(mode=0o700);settings=attempt/'settings.json';write(settings,{})
        env.update(ANTHROPIC_API_KEY='fake-loopback-only',ANTHROPIC_BASE_URL='http://127.0.0.1:'+str(port),CLAUDE_CONFIG_DIR=str(profile),CLAUDE_CODE_TMPDIR=str(temporary),DISABLE_AUTOUPDATER='1',DISABLE_ERROR_REPORTING='1',DISABLE_TELEMETRY='1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1')
        native=['/root/.local/bin/claude','-p','--verbose','--output-format','stream-json','--include-hook-events','--setting-sources','','--settings',str(settings),'--plugin-dir',str(target),'--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-chrome','--restricted','--tools','Read','--permission-prompts','none','--model','claude-sonnet-4-6','--system-prompt','You are an owned native hook mechanics fixture.','--prompt-suggestions','false','--session-id',str(uuid.uuid4()),prompt]
        argv=['bwrap','--ro-bind','/','/','--tmpfs','/tmp','--dev','/dev','--proc','/proc','--bind',str(attempt),str(attempt),'--chdir',str(project),*native]
        runtime='/root/.local/bin/claude'
    elif a.harness=='zcode-cli':
        runtime_root=Path('/root/workspace/harness-hooks-probes-20261012-9c3mll0g/runtimes/round2/zcode');node='/root/.local/share/router-comparison/oar/tooling/node-v26.7.0-linux-x64/bin/node';cli=runtime_root/'source/apps/zcode-cli/packages/cli/dist/zcode.cjs';cache=runtime_root/'bundled-plugin-cache';config=profile/'.zcode/cli/config.json';config.parent.mkdir(parents=True);(config.parent/'plugins').mkdir();(config.parent/'plugins/cache').symlink_to(cache,target_is_directory=True)
        write(config,{'model':'probe/gpt-4o-mini','provider':{'probe':{'kind':'openai-compatible','name':'Loopback fixture','options':{'baseURL':'http://127.0.0.1:'+str(port)+'/v1','apiKey':'fake-loopback-only'},'models':{'gpt-4o-mini':{'contextWindow':128000,'supportsToolCall':True}}}},'plugins':{'enabled':True,'dirs':[str(target)]},'features':{'mcp':False},'hooks':{'enabled':True,'timeoutMs':5000,'events':{}},'modelStream':{'idleTimeoutMs':5000}})
        env.update(ZCODE_STORAGE_DIR=str(profile/'.zcode'),ZCODE_DATA_BASE_DIR=str(profile),ZCODE_MODEL_TELEMETRY_ENABLED='0',NO_COLOR='1')
        native=[node,str(cli),'--prompt',prompt,'--json','--no-color','--mode','plan','--workflow-mode','disabled']
        argv=['bwrap','--ro-bind','/','/','--tmpfs','/root','--ro-bind','/root/.local','/root/.local','--ro-bind',str(runtime_root),str(runtime_root),'--bind',str(profile/'.zcode'),'/root/.zcode','--bind',str(cache),str(cache),'--bind',str(attempt),str(attempt),'--dev','/dev','--proc','/proc','--tmpfs','/tmp','--chdir',str(project),*native];runtime=str(cli)
    else:
        runtime=str(Path('/root/.local/bin/codex').resolve());subprocess.run(['git','init','-q',str(project)],check=True)
        config='model = "codex-probe"\nmodel_provider = "probe"\napproval_policy = "on-request"\nsandbox_mode = "read-only"\n[model_providers.probe]\nname = "Synthetic local probe"\nbase_url = "http://127.0.0.1:'+str(port)+'/v1"\nenv_key = "CODEX_PROBE_FAKE_API_KEY"\nwire_api = "responses"\nrequest_max_retries = 0\nstream_max_retries = 0\nstream_idle_timeout_ms = 10000\nsupports_websockets = false\n[features]\nhooks = true\n'
        if a.reuse_attempt:
            config='\n'.join(('base_url = \"http://127.0.0.1:'+str(port)+'/v1\"') if l.startswith('base_url = \"http://127.0.0.1:') else l for l in (profile/'config.toml').read_text().splitlines())+'\n'
        (profile/'config.toml').write_text(config)
        # Native user-scope hook transport; commands reference unchanged emitted wrapper artifacts.
        command='node "'+str(target/'hooks/plugnz-codex.mjs')+'"'
        for groups in native_hooks.values():
            for group in groups:
                for hook in group['hooks']:hook['command']=command
        write(profile/'hooks.json',{'hooks':native_hooks});env.update(CODEX_PROBE_FAKE_API_KEY='fake-loopback-only',TERM='xterm-256color')
        native=['/tmp/codex-probe-bin/codex','--no-daemon','-C',str(project),'-s','read-only','-a','on-request']
        native+=['--no-alt-screen'] if a.review else ['exec','--json','-s','read-only','-c','approval_policy="on-request"',prompt]
        argv=['bwrap','--die-with-parent','--ro-bind','/','/','--tmpfs','/tmp','--dev','/dev','--proc','/proc','--ro-bind',str(Path(runtime).parent),'/tmp/codex-probe-bin','--bind',str(profile),'/root/.codex','--bind',str(attempt),str(attempt),'--chdir',str(project),*native]
    phase_dir=attempt/('review' if a.review else 'positive') if a.reuse_attempt else attempt
    phase_dir.mkdir(exist_ok=True)
    write(phase_dir/'invocation.json',{'harness':a.harness,'argv':argv,'runtime':runtime,'runtime_sha256':digest(runtime),'target':str(target),'task':task,'file':str(original),'file_content':content,'port':port,'timeout_seconds':40,'request_cap':6,'body_cap':256*1024,'lane_cap':64*1024*1024,'credentials':'fake only','transport':'native plugin loader' if a.harness!='codex' else 'native user hook config referring to generated wrapper; exact native trust required'})
    watch,wd=inotify_watch(original)
    try:
        if a.review:
            write(phase_dir/'review-ready.json',{'argv':argv,'env':env});print(json.dumps({'attempt':str(attempt),'review_ready':True}),flush=True);return
        result=run_native(argv,env,phase_dir,lane)
    finally:
        witness=inotify_finish(watch);write(phase_dir/'file-access.json',witness);server.shutdown();server.server_close();thread.join(timeout=2)
    events=[r for r in rows(attempt/'events.jsonl') if r['monotonic_ns']>=result['started_monotonic_ns']];write(phase_dir/'events.json',events);write(phase_dir/'requests.json',requests);task_requests=[r for r in requests if task in json.dumps(r['body'])];find=lambda e:[r for r in events if r['input']['event']==e]
    checks={'lane_within_cap':allocated(lane)<=LANE_CAP,'exit_zero':result['exit_code']==0,'no_budget_failure':not budget_failures and not result['failure'],'three_task_requests':len(task_requests)==3,'actual_read':content in json.dumps(task_requests[1]['body']) if len(task_requests)>1 else False,'kernel_read':witness['open_events']>0 and witness['access_events']>0,'startup_before_request':bool(find('session.start') and task_requests and find('session.start')[0]['nonce'] in json.dumps(task_requests[0]['body']) and find('session.start')[0]['monotonic_ns']<task_requests[0]['monotonic_ns']),'pre_context_received':bool(find('tool.before') and len(task_requests)>1 and find('tool.before')[0]['nonce'] in json.dumps(task_requests[1]['body'])),'post_context_received':bool(find('tool.after') and len(task_requests)>1 and find('tool.after')[0]['nonce'] in json.dumps(task_requests[1]['body'])),'stop_once_and_active':len(find('turn.stop'))==2 and [r['input']['stop']['active'] for r in find('turn.stop')]==[False,True] and bool(find('turn.stop')[0]['result'].get('continue')) and find('turn.stop')[1]['result']=={},'continuation_received':bool(find('turn.stop') and len(task_requests)>2 and find('turn.stop')[0]['nonce'] in json.dumps(task_requests[2]['body'])),'handler_pids_absent':all(not Path('/proc',str(r['pid'])).exists() for r in events)}
    with socket.socket() as sock:checks['listener_closed']=sock.connect_ex(('127.0.0.1',port))!=0
    report={'harness':a.harness,'attempt':str(attempt),'target':str(target),'checks':checks,'pass':all(checks.values()),'native':result,'events':len(events),'requests':len(requests),'live_inference':False,'synthetic_usage_not_billable':True};write(phase_dir/'receipt.json',report)
    hashes={str(p.relative_to(attempt)):{'sha256':digest(p),'bytes':p.stat().st_size} for p in sorted(attempt.rglob('*')) if p.is_file() and not p.is_symlink()};write(phase_dir/'hashes.json',hashes)
    print(json.dumps(report),flush=True);raise SystemExit(0 if report['pass'] else 1)
if __name__=='__main__':main()
