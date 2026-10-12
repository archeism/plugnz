#!/usr/bin/env python3
"""Opt-in real-model native hooks test. Run only inside a fresh owned Docker container."""
import argparse, ctypes, fcntl, hashlib, json, os, pty, re, resource, selectors, shutil, signal, socket, struct, subprocess, sys, termios, time
from pathlib import Path
from live_recorder import LiveRecorder

MODEL='gemini-3.8-flash'
EVENTS=['session.start','tool.before','tool.after','turn.stop']
def write(path,value):Path(path).write_text(json.dumps(value,indent=2)+'\n')
def rows(path):return [json.loads(l) for l in Path(path).read_text().splitlines()] if Path(path).exists() else []
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def watch(path):
    libc=ctypes.CDLL(None,use_errno=True);fd=libc.inotify_init1(os.O_NONBLOCK|os.O_CLOEXEC)
    if fd<0:raise OSError(ctypes.get_errno(),'inotify_init1')
    wd=libc.inotify_add_watch(fd,os.fsencode(path),0x1|0x20)
    if wd<0:raise OSError(ctypes.get_errno(),'inotify_add_watch')
    return fd
def finish_watch(fd):
    masks=[]
    while True:
        try:data=os.read(fd,65536)
        except BlockingIOError:break
        if not data:break
        offset=0
        while offset<len(data):
            wd,mask,cookie,size=struct.unpack_from('iIII',data,offset);masks.append(mask);offset+=16+size
    os.close(fd);return {'open':any(m&0x20 for m in masks),'access':any(m&0x1 for m in masks),'overflow':any(m&0x4000 for m in masks),'masks':masks}
def run(argv,env,evidence,timeout=180):
    started=time.monotonic_ns();before=resource.getrusage(resource.RUSAGE_CHILDREN)
    process=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,start_new_session=True)
    selector=selectors.DefaultSelector();buffers={'stdout':bytearray(),'stderr':bytearray()};failure=None
    for name,pipe in [('stdout',process.stdout),('stderr',process.stderr)]:selector.register(pipe,selectors.EVENT_READ,name)
    deadline=time.monotonic()+timeout;next_disk=time.monotonic()+1
    try:
        while selector.get_map():
            now=time.monotonic()
            if now>deadline:failure=str(timeout)+'s native run cap'
            if now>next_disk:
                next_disk=now+1
                if sum(p.stat().st_size for p in evidence.rglob('*') if p.is_file())>32*1024*1024:failure='32MiB evidence cap'
            if failure and process.poll() is None:os.killpg(process.pid,signal.SIGKILL)
            for key,_ in selector.select(0.1):
                chunk=os.read(key.fileobj.fileno(),65536)
                if not chunk:selector.unregister(key.fileobj);key.fileobj.close();continue
                buffers[key.data].extend(chunk)
                if sum(len(b) for b in buffers.values())>4*1024*1024:failure='4MiB native log cap'
        process.wait(timeout=2)
    finally:
        if process.poll() is None:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=2)
        selector.close()
    token=env.get('LIVE_PROXY_TOKEN','').encode()
    for name,data in buffers.items():(evidence/(name+'.txt')).write_bytes(bytes(data).replace(token,b'[DISPOSABLE_TOKEN_REDACTED]') if token else data)
    after=resource.getrusage(resource.RUSAGE_CHILDREN)
    return {'pid':process.pid,'exit_code':process.returncode,'failure':failure,'started_monotonic_ns':started,'ended_monotonic_ns':time.monotonic_ns(),'wall_seconds':(time.monotonic_ns()-started)/1e9,'child_user_seconds':after.ru_utime-before.ru_utime,'child_system_seconds':after.ru_stime-before.ru_stime,'maxrss_kib_children_cumulative':after.ru_maxrss,'pid_absent':not Path('/proc',str(process.pid)).exists()}
def review_codex(argv,env,evidence):
    """Relay observed ordinary native UI; never supply folder/hook approval choices."""
    master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
    child=subprocess.Popen(argv,stdin=slave,stdout=slave,stderr=slave,env={**env,'TERM':'xterm-256color'},start_new_session=True);os.close(slave)
    selector=selectors.DefaultSelector();selector.register(master,selectors.EVENT_READ,'native');selector.register(sys.stdin,selectors.EVENT_READ,'input')
    captured=bytearray();started=time.monotonic();failure=None;trusted=set();active_event=None;verified=set();window=''
    known_events=['PreToolUse','PostToolUse','SessionStart','Stop']
    expected_command='node "/work/home/.codex/plugins/cache/local/plugnz-live-context-fixture/1.0.0/hooks/plugnz-codex.mjs"'
    try:
        while child.poll() is None:
            if time.monotonic()-started>600:failure='600s separately bounded native UI setup cap';break
            if sum(p.stat().st_size for p in evidence.rglob('*') if p.is_file())>32*1024*1024:failure='32MiB evidence cap during native review';break
            for key,_ in selector.select(.1):
                if key.data=='input':
                    data=os.read(sys.stdin.fileno(),4096)
                    if not data:selector.unregister(sys.stdin);continue
                    with (evidence/'native-review-input.jsonl').open('a') as f:f.write(json.dumps({'monotonic_ns':time.monotonic_ns(),'input':data.decode(errors='replace')})+'\n')
                    os.write(master,data)
                else:
                    try:data=os.read(master,65536)
                    except OSError:data=b''
                    if not data:break
                    captured.extend(data);os.write(sys.stdout.fileno(),data)
                    if b'\x1b[6n' in data:os.write(master,b'\x1b[1;1R')
                    if b'\x1b[c' in data:os.write(master,b'\x1b[?1;2c')
                    if len(captured)>1024*1024:failure='1MiB review log cap';break
                    plain=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]',' ',data.decode(errors='replace'));window=(window+plain)[-32000:]
                    for event in known_events:
                        if event+' hooks' in plain:
                            active_event=event;window=plain
                    if active_event and expected_command in window and 'New hook - review required' in window:verified.add(active_event)
                    if active_event in verified and 'Trusted' in plain:trusted.add(active_event)
            if failure:break
    finally:
        if child.poll() is None:os.killpg(child.pid,signal.SIGKILL)
        child.wait(timeout=2);selector.close();os.close(master)
    token=env['LIVE_PROXY_TOKEN'].encode();(evidence/'native-review.ansi').write_bytes(bytes(captured).replace(token,b'[DISPOSABLE_TOKEN_REDACTED]'))
    write(evidence/'native-review.json',{'argv':argv,'exit_code':child.returncode,'failure':failure,'wall_seconds':time.monotonic()-started,'policy':'Manual observed ordinary folder/exact hook UI review in fresh disposable container only; no trust-all or hash/config trust writes. The helper supplies no approval choices.','pid_absent':not Path('/proc',str(child.pid)).exists(),'individually_trusted_events':sorted(trusted),'automatic_prompt_matching':False})
    if failure:raise RuntimeError(failure)
    if len(trusted)!=4:raise RuntimeError('Native UI ended before four unique exact fixture definitions reported Trusted')
def native_text(harness,stdout):
    if harness=='zcode-cli':
        try:return json.loads(stdout).get('response','')
        except ValueError:return ''
    parsed=[]
    for line in stdout.splitlines():
        try:parsed.append(json.loads(line))
        except ValueError:pass
    if harness=='claude-code':
        result=next((r.get('result','') for r in reversed(parsed) if r.get('type')=='result'),'')
        if result:return result
        texts=[''.join(c.get('text','') for c in r.get('message',{}).get('content',[]) if c.get('type')=='text') for r in parsed if r.get('type')=='assistant']
        return next((t for t in reversed(texts) if t),'')
    messages=[r.get('item',{}).get('text','') for r in parsed if r.get('type')=='item.completed' and r.get('item',{}).get('type')=='agent_message']
    return messages[-1] if messages else ''
def extract_report(text):
    decoder=json.JSONDecoder()
    for i,c in enumerate(text):
        if c=='{':
            try:value,end=decoder.raw_decode(text[i:])
            except ValueError:continue
            if isinstance(value,dict) and 'file' in value:return value
    return {}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('harness',choices=['claude-code','codex','zcode-cli']);ap.add_argument('--evidence',default='/evidence');ap.add_argument('--plugnz',default='/opt/plugnz/package/dist/plugnz.mjs');ap.add_argument('--proxy',default='http://plugnz-live-proxy:8317');ap.add_argument('--candidate-commit',required=True);ap.add_argument('--codex-review',action='store_true');a=ap.parse_args()
    if not Path('/.dockerenv').exists() or os.getuid()!=1000:raise SystemExit('Refusing non-container/non-1000 execution')
    for host_path in ['/root/.air','/root/workspace','/workspace/harness-hooks-probes-20261012-9c3mll0g']:
        try: visible=Path(host_path).exists()
        except PermissionError: visible=False
        if visible:raise SystemExit('Unexpected host/source tree visibility')
    if not os.environ.get('LIVE_PROXY_TOKEN'):raise SystemExit('Missing disposable frontend token')
    evidence=Path(a.evidence).resolve();evidence.mkdir(parents=True,exist_ok=True)
    if list(evidence.iterdir()):raise SystemExit('Evidence directory must be fresh')
    package_path=Path(a.plugnz).resolve().parent.parent/'package.json'
    package=json.loads(package_path.read_text())
    write(evidence/'candidate.json',{'commit':a.candidate_commit,'package_version':package['version'],'packaged_cli_sha256':sha(a.plugnz),'helpers':{p.name:sha(p) for p in [Path(__file__),Path(__file__).with_name('live_recorder.py'),Path(__file__).with_name('live_handler.py')]}})
    home=Path.home();home.mkdir(parents=True,exist_ok=True);project=Path('/work/project');project.mkdir(parents=True,exist_ok=True);plugin=Path('/work/fixture-plugin');plugin.mkdir()
    original=project/'harmless.txt';file_nonce='FILE_'+os.urandom(16).hex();original.write_text(file_nonce+'\n')
    shutil.copy2(Path(__file__).with_name('live_handler.py'),plugin/'live_handler.py')
    write(plugin/'plugin.json',{'name':'plugnz-live-context-fixture','version':'1.0.0','description':'Owned real-model context fixture'})
    write(plugin/'plugnz.hooks.json',{'version':1,'hooks':{e:[{'command':['python3','${PLUGIN_ROOT}/live_handler.py',str(evidence/'events.jsonl')],'timeoutMs':5000}] for e in EVENTS}})
    selected_bin='/opt/harnesses/'+a.harness+('/node_modules/.bin' if a.harness!='zcode-cli' else '')
    os.environ['PATH']=selected_bin+os.pathsep+os.environ['PATH']
    os.chdir(plugin)
    install_argv=['node',a.plugnz,'install','--target',a.harness]
    installed=subprocess.run(install_argv,capture_output=True,text=True,timeout=60)
    (evidence/'install.stdout').write_text(installed.stdout);(evidence/'install.stderr').write_text(installed.stderr)
    write(evidence/'installation.json',{'argv':install_argv,'cwd':str(plugin),'default_cwd_source':True,'selected_runtime_bin':selected_bin,'authored_file_hashes':{str(p.relative_to(plugin)):sha(p) for p in plugin.rglob('*') if p.is_file()},'exit_code':installed.returncode,'plugnz_sha256':sha(a.plugnz),'home':str(home)})
    if installed.returncode:raise SystemExit('Native hook installation failed before live inference')
    registration={}
    for relative in ['.claude/settings.json','.claude/plugins/installed_plugins.json','.claude/plugins/known_marketplaces.json','.codex/config.toml','.codex/plugins/installed_plugins.json','.zcode/cli/config.json','.zcode/cli/plugins/installed_plugins.json']:
        path=home/relative
        if path.exists():registration[relative]={'sha256':sha(path),'contents':path.read_text().replace(os.environ.get('LIVE_PROXY_TOKEN',''),'[DISPOSABLE_TOKEN_REDACTED]')}
    write(evidence/'native-registration.json',registration)
    recorder=LiveRecorder(evidence,a.proxy,max_calls=6);endpoint=recorder.start();token=os.environ['LIVE_PROXY_TOKEN'];env=dict(os.environ)
    env.update(NO_COLOR='1',DISABLE_AUTOUPDATER='1',DISABLE_ERROR_REPORTING='1',DISABLE_TELEMETRY='1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1')
    task_nonce='TASK_'+os.urandom(8).hex()
    prompt=task_nonce+'. Read the file '+str(original)+' exactly once with '+('exec_command using cat' if a.harness=='codex' else 'the native Read tool')+'. Make no file changes. Then return one JSON object with string fields startup, pre, post and file. Obtain startup/pre/post from hook feedback in your context, and file from the file contents. Use null if any information is unavailable. Do not invent values. After a hook asks for a continuation, return the complete JSON again with its additional stop field and do not call any further tools.'
    if file_nonce in prompt:raise RuntimeError('Fixture marker leaked to prompt')
    os.chdir(project)
    if a.harness=='claude-code':
        temporary=Path('/work/claude-tmp');temporary.mkdir(mode=0o700);env.update(ANTHROPIC_API_KEY=token,ANTHROPIC_BASE_URL=endpoint,CLAUDE_CODE_TMPDIR=str(temporary),ANTHROPIC_MODEL=MODEL,ANTHROPIC_SMALL_FAST_MODEL=MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL=MODEL,ANTHROPIC_DEFAULT_SONNET_MODEL=MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL=MODEL)
        cli=shutil.which('claude') or '/opt/harnesses/claude-code/node_modules/.bin/claude'
        argv=[cli,'-p','--verbose','--output-format','stream-json','--include-hook-events','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-chrome','--tools','Read','--permission-prompts','none','--model',MODEL,'--system-prompt','You are running an owned cleanroom hook-context test. Follow the task and report actual observed data.','--prompt-suggestions','false',prompt]
    elif a.harness=='codex':
        subprocess.run(['git','init','-q',str(project)],check=True)
        profile=home/'.codex';profile.mkdir(exist_ok=True);cfg=profile/'config.toml';previous=cfg.read_text() if cfg.exists() else ''
        # Preserve installer registration. Configure normal read-only native policy; do not write any trust state.
        previous='\n'.join(l for l in previous.splitlines() if not any(l.startswith(key+' =') for key in ['model','model_provider','approval_policy','sandbox_mode']))+'\n'
        config='web_search = "disabled"\nmodel = "'+MODEL+'"\nmodel_provider = "live"\napproval_policy = "on-request"\nsandbox_mode = "read-only"\n'+previous+'\n[model_providers.live]\nname = "Disposable live conversion proxy"\nbase_url = "'+endpoint+'/v1"\nenv_key = "LIVE_PROXY_TOKEN"\nwire_api = "responses"\nrequest_max_retries = 0\nstream_max_retries = 0\nstream_idle_timeout_ms = 120000\nsupports_websockets = false\n'
        cfg.write_text(config);cli=shutil.which('codex') or '/opt/harnesses/codex/node_modules/.bin/codex';argv=[cli,'--no-daemon','-C',str(project),'-s','read-only','-a','on-request','exec','--json','-s','read-only',prompt]
    else:
        profile=home/'.zcode/cli';profile.mkdir(parents=True,exist_ok=True);cfg=profile/'config.json';config=json.loads(cfg.read_text()) if cfg.exists() else {}
        config.update({'model':'live/'+MODEL,'provider':{'live':{'kind':'openai-compatible','name':'Disposable live conversion proxy','options':{'baseURL':endpoint+'/v1','apiKey':token},'models':{MODEL:{'contextWindow':128000,'supportsToolCall':True}}}},'features':{'mcp':False},'modelStream':{'idleTimeoutMs':120000}});cfg.write_text(json.dumps(config))
        cli=shutil.which('zcode') or '/opt/harnesses/zcode-cli/zcode';argv=[cli,'--prompt',prompt,'--json','--no-color','--mode','plan','--workflow-mode','disabled']
    version=subprocess.check_output([cli,'--version'],text=True,timeout=15).strip()
    write(evidence/'invocation.json',{'harness':a.harness,'candidate_commit':a.candidate_commit,'package_version':package['version'],'packaged_cli_sha256':sha(a.plugnz),'helper_sha256':sha(__file__),'argv':argv,'runtime_version':version,'runtime_path':cli,'runtime_sha256':sha(Path(cli).resolve()),'model':MODEL,'task_nonce':task_nonce,'prompt':prompt,'file_content':file_nonce,'uid':os.getuid(),'home':str(home),'provider_credentials_in_container':False,'disposable_frontend_token_not_recorded':True,'bounds':{'seconds':180,'inference_requests':6,'evidence_bytes':32*1024*1024}})
    if a.codex_review:
        if a.harness!='codex':raise RuntimeError('Native review applies only to Codex')
        installed_root=home/'.codex/plugins/cache/local/plugnz-live-context-fixture/1.0.0'
        write(evidence/'native-review-definitions.json',{'plugin':str(installed_root),'project':str(project),'profile':str(home/'.codex'),'files':{str(p.relative_to(installed_root)):{'sha256':sha(p),'contents':p.read_text()} for p in installed_root.rglob('*') if p.is_file() and p.suffix in ['.json','.mjs']}})
        review_codex([cli,'--no-daemon','-C',str(project),'-s','read-only','-a','on-request','--no-alt-screen'],env,evidence )
    fd=watch(original)
    try:native=run(argv,env,evidence,timeout=180)
    finally:witness=finish_watch(fd);recorder.close()
    all_events=rows(evidence/'events.jsonl');events=[r for r in all_events if r['monotonic_ns']>=native['started_monotonic_ns']];requests=[r for r in recorder.requests if r['inference'] and task_nonce in json.dumps(r.get('body'))];by_event={e:[r for r in events if r['input']['event']==e] for e in EVENTS}
    observed={r['field']:r['nonce'] for r in events if r['result'].get('context')};text=native_text(a.harness,(evidence/'stdout.txt').read_text());reported=extract_report(text)
    checks={'native_exit_zero':native['exit_code']==0,'no_native_budget_failure':native['failure'] is None,'proxy_budget_respected':recorder.calls<=6 and not recorder.failures,'selected_model_only':all(r.get('body',{}).get('model')==MODEL for r in recorder.requests if r['inference']),'markers_absent_user_prompt':all(n not in prompt for n in observed.values()),'startup_in_first_request':bool(by_event['session.start'] and requests and by_event['session.start'][0]['nonce'] in json.dumps(requests[0]['body'])),'kernel_read':witness['open'] and witness['access'] and not witness['overflow'],'tool_before_observed':bool(by_event['tool.before']),'tool_after_observed':bool(by_event['tool.after']),'post_in_later_request':bool(by_event['tool.after'] and any(by_event['tool.after'][0]['nonce'] in json.dumps(r['body']) and r['monotonic_ns']>by_event['tool.after'][0]['monotonic_ns'] for r in requests)),'one_stop_continuation':len(by_event['turn.stop'])==2 and [r['input']['stop']['active'] for r in by_event['turn.stop']]==[False,True] and by_event['turn.stop'][1]['result']=={},'real_model_consumed_context':all(reported.get(k)==v for k,v in observed.items()) and set(observed)=={'startup','pre','post','stop'},'real_model_read_fixture':reported.get('file')==file_nonce,'handlers_exited':all(not Path('/proc',str(r['pid'])).exists() for r in events)}
    report={'harness':a.harness,'pass':all(checks.values()),'checks':checks,'native':native,'requests':recorder.calls,'setup_events':len(all_events)-len(events),'task_events':len(events),'proxy_failures':recorder.failures,'expected_runtime_markers':observed,'model_report':reported,'model_text':text,'kernel_witness':witness,'live_inference':True,'model':MODEL,'qualification':'Exact native installation in this image/profile; no trust bypass; failure is retained as failed or blocked rather than upgraded to support.'}
    write(evidence/'receipt.json',report);write(evidence/'hashes.json',{str(p.relative_to(evidence)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in evidence.rglob('*') if p.is_file()});print(json.dumps({'harness':a.harness,'pass':report['pass'],'checks':checks,'requests':recorder.calls}),flush=True)
    raise SystemExit(0 if report['pass'] else 1)
if __name__=='__main__':main()