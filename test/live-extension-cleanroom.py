#!/usr/bin/env python3
"""Opt-in live extension proof inside a fresh disposable container; never supplies canned completions."""
import argparse, hashlib, http.server, json, os, pathlib, resource, signal, socket, subprocess, shutil, threading, time, urllib.request, uuid
P = pathlib.Path

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def jsonl(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()] if path.exists() else []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--harness', choices=['omp', 'pi', 'opencode'], required=True)
    ap.add_argument('--repo', type=P, required=True)
    ap.add_argument('--candidate-commit', required=True, help='Frozen reviewed production commit represented by the packaged CLI')
    ap.add_argument('--runtime', type=P, required=True)
    ap.add_argument('--out', type=P, required=True)
    ap.add_argument('--home', type=P, default=P('/work/home'), help='Fresh container-only HOME outside retained evidence')
    ap.add_argument('--proxy-base', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--max-output-tokens', type=int, default=1024, help='Native provider output budget, including provider thinking if applicable')
    ap.add_argument('--install-argv-json', required=True, help='Public install argv; placeholders {source}, {harness}, {out}')
    ap.add_argument('--entry', help='Optional expected installed native entry; otherwise discover owned package')
    args = ap.parse_args()
    if not 1<=args.max_output_tokens<=8192:ap.error('--max-output-tokens must be 1..8192')
    identity={'candidate_commit':args.candidate_commit,'helper_sha256':hashlib.sha256(P(__file__).read_bytes()).hexdigest(),'candidate_cli_sha256':hashlib.sha256((args.repo/'dist/plugnz.mjs').read_bytes()).hexdigest(),'candidate_package_version':json.loads((args.repo/'package.json').read_text())['version']}
    started=time.monotonic();deadline=started+180
    token = os.environ.get('LIVE_PROXY_TOKEN')
    if not token: raise RuntimeError('LIVE_PROXY_TOKEN is required')
    root = args.out.resolve(); root.mkdir(parents=True, exist_ok=False)
    profile=args.home.resolve()
    if profile.exists() and any(profile.iterdir()):raise RuntimeError('Cleanroom HOME must be absent or empty')
    profile.mkdir(parents=True,exist_ok=True)
    work = profile / 'work'; work.mkdir()
    source = profile / 'source'; source.mkdir()
    file_marker = 'FILE_' + uuid.uuid4().hex
    (work / 'harmless.txt').write_text(file_marker + '\n')
    (root/'fixture-file.txt').write_text(file_marker+'\n')
    events_file = root / 'events.jsonl'
    agent=profile/('.omp/agent' if args.harness=='omp' else '.pi/agent');agent.mkdir(parents=True)
    configdir=profile/'.config/opencode';configdir.mkdir(parents=True)
    env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','TMPDIR']}
    env.update(HOME=str(profile),OPEN_PLUGIN_HOME=str(profile),PATH=str(args.runtime/'node_modules/.bin')+':'+env.get('PATH',''),NODE_DISABLE_COMPILE_CACHE='1',NO_COLOR='1',TERM='dumb',XDG_CONFIG_HOME=str(profile/'.config'),XDG_DATA_HOME=str(profile/'.local/share'),XDG_STATE_HOME=str(profile/'.local/state'),XDG_CACHE_HOME=str(profile/'.cache'))
    if args.harness=='pi':env.update(PI_CODING_AGENT_DIR=str(agent),PI_OFFLINE='1')
    if args.harness=='omp':(profile/'.omp/plugins').mkdir(parents=True)
    source_before={str(x.relative_to(source)):hashlib.sha256(x.read_bytes()).hexdigest() for x in source.rglob('*') if x.is_file()}
    # Markers are minted only at the hook boundary, absent from user prompt and authored fixtures.
    (source / 'context.mjs').write_text("""import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const input=JSON.parse(raw);const marker=input.event.toUpperCase().replaceAll('.','_')+'_'+randomUUID();
let result={};
if(input.event!=='turn.stop')result={context:'HOOK_FEEDBACK (not file contents): Retain this hook-only marker for the final JSON markers array: '+marker};
else if(input.harness!=='opencode'&&!input.stop.active)result={context:'HOOK_FEEDBACK (not file contents): A final pass is required. Return only the original file bytes in the file field, excluding appended HOOK_FEEDBACK; preserve all previous markers; add this Stop marker to your final JSON markers array: '+marker,continue:true};
appendFileSync(process.argv[2],JSON.stringify({time:Date.now(),pid:process.pid,input,marker,result})+'\\n');
console.log(JSON.stringify(result));
""")
    save(source / 'plugin.json', {'name':'live-context-proof','version':'0.0.0','description':'Owned harmless live hook fixture'})
    save(source / 'plugnz.hooks.json', {'version':1,'hooks':{event:[{'command':['node','${PLUGIN_ROOT}/context.mjs',str(events_file)],'timeoutMs':5000,**({'tools':['read']} if event.startswith('tool.') else {})}] for event in ['session.start','tool.before','tool.after','turn.stop']}})
    substitutions = {'source':str(source),'harness':args.harness,'out':str(root)}
    install = [x.format(**substitutions) for x in json.loads(args.install_argv_json)]
    source_before={str(x.relative_to(source)):hashlib.sha256(x.read_bytes()).hexdigest() for x in source.rglob('*') if x.is_file()}
    shutil.copytree(source,root/'authored-fixture')
    save(root/'install-invocation.json',{'argv':install,'cwd':str(args.repo),'home':str(profile),'timeout_seconds':60})
    try:
        installed = subprocess.run(install,cwd=args.repo,env=env,capture_output=True,text=True,timeout=60)
    except Exception as exc:
        receipt={**identity,'status':'failed','stage':'install','error_kind':type(exc).__name__,'harness':args.harness}
        save(root/'receipt.json',receipt);print(json.dumps(receipt));return 1
    (root/'install.stdout').write_text(installed.stdout);(root/'install.stderr').write_text(installed.stderr)
    if installed.returncode:
        receipt={**identity,'status':'failed','stage':'install','exit_code':installed.returncode,'harness':args.harness}
        save(root/'receipt.json',receipt);print(json.dumps(receipt));return 1
    candidates=[x for x in profile.rglob('plugin.mjs' if args.harness=='opencode' else 'extension.mjs') if '.plgnz' in str(x) or '/.omp/plugins/' in str(x)]
    if args.entry:entry=P(args.entry.format(**substitutions))
    elif len(candidates)==1:entry=candidates[0]
    else:
        receipt={**identity,'status':'failed','stage':'install-entry-discovery','candidate_count':len(candidates),'harness':args.harness}
        save(root/'receipt.json',receipt);print(json.dumps(receipt));return 1
    if not entry.is_file():
        receipt={**identity,'status':'failed','stage':'install-entry-readback','entry':str(entry),'harness':args.harness}
        save(root/'receipt.json',receipt);print(json.dumps(receipt));return 1
    save(root/'install.json',{**identity,'argv':install,'entry':str(entry),'entry_sha256':hashlib.sha256(entry.read_bytes()).hexdigest(),'native_home':str(profile),'artifact_hashes':{str(x.relative_to(entry.parent)):hashlib.sha256(x.read_bytes()).hexdigest() for x in entry.parent.rglob('*') if x.is_file()}})
    registrations=[]
    for pattern in ['.pi/agent/settings.json','.omp/plugins/installed_plugins.json','.omp/plugins/omp-plugins.lock.json','.config/opencode/plugins/plugnz-*.js']:
        for path in profile.glob(pattern):
            registrations.append({'path':str(path),'content':path.read_text()})
    save(root/'native-registration.json',registrations)
    requests=[];responses=[];errors=[];lock=threading.Lock()
    def append(path,value):
        with path.open('a') as f:f.write(json.dumps(value)+'\n')
    class Forwarder(http.server.BaseHTTPRequestHandler):
        def log_message(self,*unused):pass
        def do_POST(self):
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size<1 or size>1024*1024:raise RuntimeError('request-body-cap')
                body=json.loads(self.rfile.read(size))
                with lock:
                    if len(requests)>=6:raise RuntimeError('six-model-request-cap')
                    row={'index':len(requests),'time':time.monotonic()-started,'path':self.path,'body':body}
                    requests.append(row);append(root/'requests.jsonl',row)
                remaining=deadline-time.monotonic()
                if remaining<=0:raise TimeoutError('overall-deadline')
                url=args.proxy_base.rstrip('/')+'/chat/completions'
                req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
                fragments=[];packets=[];response_bytes=0
                with urllib.request.urlopen(req,timeout=min(remaining,90)) as upstream:
                    self.send_response(upstream.status)
                    self.send_header('Content-Type',upstream.headers.get('Content-Type','text/event-stream'))
                    self.send_header('Connection','close');self.end_headers()
                    if body.get('stream'):
                        for line in upstream:
                            if time.monotonic()>deadline:raise TimeoutError('overall-deadline')
                            response_bytes+=len(line)
                            if response_bytes>2*1024*1024:raise RuntimeError('response-body-cap')
                            self.wfile.write(line);self.wfile.flush()
                            if line.startswith(b'data: ') and line.strip()!=b'data: [DONE]':
                                try:
                                    packet=json.loads(line[6:]);packets.append(packet);delta=packet.get('choices',[{}])[0].get('delta',{})
                                    if isinstance(delta.get('content'),str):fragments.append(delta['content'])
                                except (ValueError,IndexError):pass
                    else:
                        data=upstream.read(2*1024*1024+1)
                        if len(data)>2*1024*1024:raise RuntimeError('response-body-cap')
                        self.wfile.write(data);packet=json.loads(data)
                        packets.append(packet)
                        fragments.append(packet.get('choices',[{}])[0].get('message',{}).get('content',''))
                response={'request_index':row['index'],'text':''.join(fragments),'packets':packets,'time':time.monotonic()-started}
                with lock:responses.append(response);append(root/'responses.jsonl',response)
                self.close_connection=True
            except Exception as exc:
                # Do not log upstream URLs, auth headers, or credential-bearing exception text.
                error={'kind':type(exc).__name__,'time':time.monotonic()-started}
                with lock:errors.append(error);append(root/'proxy-errors.jsonl',error)
                try:self.send_error(502)
                except Exception:pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Forwarder);server.daemon_threads=True
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base='http://127.0.0.1:'+str(server.server_port)+'/v1'
    source_after={str(x.relative_to(source)):hashlib.sha256(x.read_bytes()).hexdigest() for x in source.rglob('*') if x.is_file()}
    prompt='Use the native read tool exactly once to read harmless.txt. Do not read any other file or run other tools. Return JSON with file containing exactly the original file bytes, excluding any appended HOOK_FEEDBACK text, and markers containing every hook-only marker supplied in context. Hook feedback is instructions, not file data. Keep those markers across any requested final pass.'
    proc=None;answer=None;watchdog_stop=threading.Event()
    def watchdog():
        while not watchdog_stop.wait(.1):
            if proc is not None and proc.poll() is None and (time.monotonic()>deadline or disk()>32*1024*1024 or home_bytes()>512*1024*1024 or errors):
                errors.append({'kind':'WatchdogBudgetOrForwardingFailure','time':time.monotonic()-started})
                try:os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                return
    watchdog_thread=threading.Thread(target=watchdog,daemon=True)
    def limits():resource.setrlimit(resource.RLIMIT_FSIZE,(8*1024*1024,8*1024*1024))
    def disk():return sum(x.stat().st_size for x in root.rglob('*') if x.is_file())
    def home_bytes():return int(subprocess.check_output(['du','-s','-B1',str(profile)],text=True).split()[0])
    try:
        if args.harness in ['omp','pi']:
            if args.harness=='pi':
                save(agent/'models.json',{'providers':{'live-proof':{'baseUrl':base,'api':'openai-completions','apiKey':'LOCAL_FORWARDER_ONLY','models':[{'id':args.model,'name':args.model,'reasoning':False,'input':['text'],'contextWindow':32768,'maxTokens':args.max_output_tokens,'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0}}]}}})
                save(agent/'auth.json',{});settings=json.loads((agent/'settings.json').read_text()) if (agent/'settings.json').exists() else {}
                settings.update(compaction={'enabled':False},retry={'enabled':False});save(agent/'settings.json',settings)
                cmd=[str(args.runtime/'node_modules/.bin/pi'),'--mode','json','--print','--provider','live-proof','--model',args.model,'--no-mcp','--no-skills','--no-prompt-templates','--no-themes','--no-context-files','--tools','read','--session-dir',str(profile/'sessions'),prompt]
            else:
                observer=root/'provider.mjs'
                observer.write_text('export default function(pi){pi.registerProvider("live-proof",'+json.dumps({'baseUrl':base,'api':'openai-completions','apiKey':'LOCAL_FORWARDER_ONLY','models':[{'id':args.model,'name':args.model,'api':'openai-completions','reasoning':False,'input':['text'],'contextWindow':32768,'maxTokens':args.max_output_tokens,'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0}}]})+');}')
                (profile/'config.yml').write_text('advisor:\n  enabled: false\nretry:\n  modelFallback: false\n  usageAwareFallback: false\ncompaction:\n  enabled: false\n')
                env['PI_CONFIG_FILES']=str(profile/'config.yml')
                cmd=[str(args.runtime/'node_modules/.bin/omp'),'--cwd',str(work),'--model','live-proof/'+args.model,'--thinking','off','--mode','json','--tools','read','--no-lsp','--no-pty','-e',str(observer),'--no-skills','--no-rules','--no-title','--session-dir',str(profile/'sessions'),'--max-time','175s','--print',prompt]
        else:
            # Keep the public install's owned plugins/*.js loader; add only provider configuration.
            save(configdir/'opencode.json',{'model':'live-proof/'+args.model,'small_model':'live-proof/'+args.model,'enabled_providers':['live-proof'],'share':'disabled','autoupdate':False,'provider':{'live-proof':{'npm':'@ai-sdk/openai-compatible','name':'Live proxy proof','options':{'baseURL':base,'apiKey':'LOCAL_FORWARDER_ONLY'},'models':{args.model:{'name':args.model,'limit':{'context':64000,'output':args.max_output_tokens}}}}}})
            env.update(OPENCODE_CONFIG=str(configdir/'opencode.json'),OPENCODE_CONFIG_DIR=str(configdir))
            for flag in ['AUTOUPDATE','MODELS_FETCH','DEFAULT_PLUGINS','EXTERNAL_SKILLS','CLAUDE_CODE','LSP_DOWNLOAD','PROJECT_CONFIG']:env['OPENCODE_DISABLE_'+flag]='1'
            with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
            cmd=[str(args.runtime/'node_modules/.bin/opencode'),'serve','--hostname','127.0.0.1','--port',str(port)]
        save(root/'invocation.json',{'argv':cmd,'harness':args.harness,'model':args.model,'max_output_tokens':args.max_output_tokens,'request_cap':6,'seconds_cap':180,'live_inference':True,'installed_entry':str(entry)})
        with (root/'native.stdout').open('wb') as out,(root/'native.stderr').open('wb') as err:
            proc=subprocess.Popen(cmd,cwd=work,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True,preexec_fn=limits)
            watchdog_thread.start()
            if args.harness=='opencode':
                def native(path,body=None,timeout=1):
                    remaining=deadline-time.monotonic()
                    if remaining<=0:raise TimeoutError('overall-deadline')
                    req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','x-opencode-directory':str(work)})
                    with urllib.request.urlopen(req,timeout=min(timeout,remaining)) as r:return json.load(r)
                ready=min(deadline,time.monotonic()+30)
                while True:
                    try:native('/global/health');break
                    except Exception:
                        if time.monotonic()>ready or proc.poll() is not None:raise RuntimeError('OpenCode readiness failure')
                        time.sleep(.1)
                session=native('/session',{'title':'Owned live context proof'},10)
                answer=native('/session/'+session['id']+'/message',{'model':{'providerID':'live-proof','modelID':args.model},'parts':[{'type':'text','text':prompt}]},170)
                save(root/'native-answer.json',answer)
                idle=min(deadline,time.monotonic()+5)
                while time.monotonic()<idle and not any(x['input']['event']=='turn.stop' for x in jsonl(events_file)):time.sleep(.1)
            else:
                while proc.poll() is None:
                    if time.monotonic()>deadline or disk()>32*1024*1024 or home_bytes()>512*1024*1024 or errors:raise RuntimeError('Live probe budget/forwarding failure')
                    time.sleep(.1)
    except Exception as exc:
        errors.append({'kind':type(exc).__name__,'stage':'native-run','time':time.monotonic()-started})
    finally:
        if proc is not None:
            if proc.poll() is None:
                os.killpg(proc.pid,signal.SIGTERM)
                try:proc.wait(timeout=3)
                except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
        watchdog_stop.set()
        if watchdog_thread.ident is not None:watchdog_thread.join(timeout=2)
        server.shutdown();server.server_close();thread.join(timeout=2)
    events=jsonl(events_file)
    delivered=[x for x in events if x['result'].get('context')]
    final=max(responses,key=lambda x:x['request_index'])['text'] if responses else ''
    try:
        json_text=final.strip()
        if json_text.startswith('```'):json_text='\n'.join(json_text.splitlines()[1:-1])
        final_document=json.loads(json_text)
    except (ValueError,TypeError):final_document=None
    native_calls={call.get('id'):call for row in requests for message in row['body'].get('messages',[]) if message.get('role')=='assistant' for call in message.get('tool_calls',[])}
    checks={'final_json':isinstance(final_document,dict),'exact_original_file':isinstance(final_document,dict) and final_document.get('file')==file_marker+'\n','exact_hook_marker_set':isinstance(final_document,dict) and isinstance(final_document.get('markers'),list) and all(isinstance(x,str) for x in final_document['markers']) and len(final_document['markers'])==len(delivered) and set(final_document['markers'])=={x['marker'] for x in delivered},'one_native_read_only':len(native_calls)==1 and all(call.get('function',{}).get('name')=='read' for call in native_calls.values()),'live_requests_within_cap':0<len(requests)<=6,'no_forwarding_error':not errors,'deadline':time.monotonic()<=deadline+5,'home_budget':home_bytes()<512*1024*1024,'original_tool_result_preserved':any(file_marker in json.dumps(m) for x in requests for m in x['body'].get('messages',[]) if m.get('role')=='tool'),'post_hook_observed_original_result':any(x['input']['event']=='tool.after' and file_marker in json.dumps(x['input'].get('tool',{}).get('output')) for x in events),'model_uses_file':file_marker in final,'model_uses_all_hook_markers':bool(delivered) and all(x['marker'] in final for x in delivered),'startup_once':sum(x['input']['event']=='session.start' for x in events)==1,'tool_before_once':sum(x['input']['event']=='tool.before' for x in events)==1,'tool_after_once':sum(x['input']['event']=='tool.after' for x in events)==1,'stop_observed':any(x['input']['event']=='turn.stop' for x in events),'authored_source_preserved':source_before==source_after,'native_exited':proc is not None and proc.poll() is not None,'native_exit_expected':proc is not None and (args.harness=='opencode' or proc.returncode==0),'provider_closed':server.fileno()==-1 and not thread.is_alive()}
    for x in delivered:
        matches=[r['index'] for r in requests if x['marker'] in json.dumps(r['body'])]
        event=x['input']['event']
        checks['timing_'+event]=bool(matches) and (min(matches)==0 if event=='session.start' else min(matches)>0)
    stops=[x for x in events if x['input']['event']=='turn.stop']
    checks['stop_contract']=all(x['result']=={} for x in stops) if args.harness=='opencode' else len(stops)==2 and [x['input']['stop']['active'] for x in stops]==[False,True] and stops[0]['result'].get('continue') is True and stops[1]['result']=={}
    receipt={**identity,'status':'passed' if all(checks.values()) else 'failed','checks':checks,'requests':len(requests),'hook_events':len(events),'wall_seconds':time.monotonic()-started,'harness':args.harness,'model':args.model,'max_output_tokens':args.max_output_tokens,'real_model_inference':True,'errors':errors,'native_exit':proc.returncode if proc is not None else None,'final_model_text':final,'file_marker':file_marker,'installed_entry':str(entry),'resource':{'evidence_logical_bytes':disk(),'home_allocated_bytes':home_bytes(),'home_cap_bytes':512*1024*1024,'children_maxrss_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}}
    save(root/'receipt.json',receipt);print(json.dumps({'status':receipt['status'],'checks':checks,'requests':len(requests),'harness':args.harness}))
    return 0 if all(checks.values()) else 1

if __name__=='__main__':raise SystemExit(main())
