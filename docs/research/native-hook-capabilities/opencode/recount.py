#!/usr/bin/env python3
"""Recount frozen OpenCode native-effect captures without launching the runtime."""
from pathlib import Path
from collections import Counter
import json, hashlib, datetime, socket, urllib.parse, argparse

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('evidence',type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
ROOT=args.evidence.resolve()
OUT=args.output.resolve().parent
if args.output.resolve().is_relative_to(ROOT):
    parser.error('Keep the recount output outside the frozen attempt.')
if args.output.exists():
    parser.error('Choose a new recount output path.')
OUT.mkdir(parents=True,exist_ok=True)
inputs={}
checks=[]
def read(p):
    data=p.read_bytes()
    inputs[str(p)]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    return data.decode()
def obj(p):return json.loads(read(p))
def rows(p):return [json.loads(l) for l in read(p).splitlines() if l.strip()]
def canon(x):return json.dumps(x,sort_keys=True,separators=(',',':'))
def check(name,ok,detail=None):checks.append({'check':name,'pass':bool(ok),'detail':detail})
hashes=obj(ROOT/'hashes.json')
mismatches=[k for k,v in hashes.items() if hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v]
check('author manifest raw hashes unchanged',not mismatches,mismatches)
obj(ROOT/'summary.json')
results=[]
sessions=[]
pids=[]
for case in ['baseline','rebind','rewrite-replace','deny']:
    p=ROOT/case; start=len(checks)
    inp=obj(p/'inputs.json'); invocation=obj(p/'invocation.json'); result=obj(p/'result.json')
    events=rows(p/'events.jsonl'); native=rows(p/'events.jsonl.runtime')
    requests=rows(p/'requests.jsonl'); stdout=rows(p/'stdout.jsonl'); access=obj(p/'file-access.json')
    plugin=read(p/'source/startup-plugin.mjs'); probe=read(p/'source/probe.py')
    config=obj(p/'config.snapshot.json'); read(p/'stderr.log')
    def ck(name,ok,detail=None):check(case+': '+name,ok,detail)
    def ev(name):return [e for e in events if e['event']==name]
    original=inp['original_content']; alternate=inp['alternate_content']
    ck('receiver events correspond to native journal',
       Counter(canon({k:v for k,v in e.items() if k!='monotonic_ns'}) for e in events)==Counter(canon(e) for e in native))
    ck('exactly two requests',len(requests)==2)
    first,second=requests
    firsttext,secondtext=canon(first['body']),canon(second['body'])
    ck('both requests have correct endpoint, streaming and task',
       all(r['path']=='/v1/chat/completions' and r['body'].get('stream')
           and any(m.get('role')=='user' and invocation['task_identifier'] in canon(m.get('content'))
                   for m in r['body']['messages']) for r in requests))
    ck('native read exposed',any(t.get('function',{}).get('name')=='read' for t in first['body']['tools']))
    ck('both file nonces absent before execution',original not in firsttext and alternate not in firsttext)
    ck('single creation/startup/pre',len(ev('session.created'))==len(ev('startup_complete'))==len(ev('tool_before'))==1)
    session=ev('session.created')[0]['properties']['info']['id']; sessions.append(session)
    casepids={e['pid'] for e in events};pids.extend(casepids)
    ck('one native PID and no longer present',len(casepids)==1 and all(not Path('/proc',str(pid)).exists() for pid in casepids))
    ck('reported runtime version',ev('session.created')[0]['properties']['info']['version']=='1.19.0')
    startup=ev('startup_complete')[0]
    ck('startup nonce in system role before first request',
       [m['role'] for m in first['body']['messages'] if startup['nonce'] in canon(m.get('content'))]==['system']
       and startup['monotonic_ns']<first['monotonic_ns'])
    transforms=ev('transform_complete');ck('one transform per request',len(transforms)==2)
    for i,(transform,req) in enumerate(zip(transforms,requests)):
        ck('current transform nonce before request '+str(i),
           transform['sessionId']==session and transform['monotonic_ns']<req['monotonic_ns']
           and [m['role'] for m in req['body']['messages'] if transform['nonce'] in canon(m.get('content'))]==['system'])
    pre=ev('tool_before')[0]
    ck('pre sees original read within request interval',
       pre['tool']=='read' and pre['args']['filePath']==inp['original_path'] and pre['sessionId']==session
       and first['monotonic_ns']<pre['monotonic_ns']<second['monotonic_ns'])
    calls=[c for m in second['body']['messages'] if m.get('role')=='assistant' for c in m.get('tool_calls',[])]
    toolmsgs=[m for m in second['body']['messages'] if m.get('role')=='tool']
    native_tools=[s for s in stdout if s['type']=='tool_use']
    ck('one correlated call/result/native tool',
       len(calls)==len(toolmsgs)==len(native_tools)==1 and calls[0]['id']==pre['callId']==toolmsgs[0]['tool_call_id']==native_tools[0]['part']['callID'])
    ck('assistant call still records original path',
       calls[0]['function']['name']=='read' and json.loads(calls[0]['function']['arguments'])['filePath']==inp['original_path'])
    received=toolmsgs[0]['content'];state=native_tools[0]['part']['state'];after=ev('tool_after_before_mutation')
    ck('same stdout session',all(s['sessionID']==session for s in stdout))
    ck('scripted final response, normal stop, idle, disposal and successful exit',
       any(s['type']=='text' and s['part'].get('text')=='PROBE_COMPLETE' for s in stdout)
       and sum(s['type']=='step_finish' and s['part'].get('reason')=='stop' for s in stdout)==1
       and len(ev('session.idle'))==len(ev('dispose'))==1 and not ev('session.error')
       and result['exit_code']==0 and result['status']=='completed')
    ck('witness no overflow/unknown event',all(e['file'] in ['harmless.txt','alternate.txt'] and not e['mask']&0x4000 for e in access))
    def fileevents(name):return [e for e in access if e['file']==name]
    def opened_and_read(name):return any(e['mask']&32 for e in fileevents(name)) and any(e['mask']&1 for e in fileevents(name))
    extra={}
    if case in ['baseline','rebind']:
        ck('original OPEN/ACCESS, alternate untouched',opened_and_read('harmless.txt') and not fileevents('alternate.txt'))
        ck('post and receiving result prove original execution',
           len(after)==1 and after[0]['args']['filePath']==inp['original_path'] and original in after[0]['output']
           and original in received and alternate not in secondtext and after[0]['callId']==pre['callId']
           and after[0]['sessionId']==session and pre['monotonic_ns']<after[0]['monotonic_ns']<second['monotonic_ns'])
        ck('native tool completed with original result',state['status']=='completed' and original in state['output'])
        if case=='rebind':
            rebound=ev('args_rebound')
            ck('negative control actually rebound argument object',
               len(rebound)==1 and rebound[0]['args']['filePath']==inp['alternate_path']
               and pre['monotonic_ns']<rebound[0]['monotonic_ns']<after[0]['monotonic_ns'])
            extra['negative_control']='Rebinding output.args did not change executed arguments.'
    elif case=='rewrite-replace':
        mutated=ev('args_mutated');replaced=ev('replacement')
        ck('one mutation/replacement/post',len(mutated)==len(replaced)==len(after)==1)
        mut,rep,post=mutated[0],replaced[0],after[0]
        ck('alternate execution, original untouched',
           opened_and_read('alternate.txt') and not fileevents('harmless.txt')
           and mut['args']['filePath']==post['args']['filePath']==inp['alternate_path']
           and alternate in post['output'] and original not in post['output'])
        ck('effect call correlation',mut['callId']==rep['callId']==post['callId']==pre['callId'] and post['sessionId']==session)
        ck('awaited delayed replacement precedes receiving next request',
           pre['monotonic_ns']<mut['monotonic_ns']<post['monotonic_ns']<rep['monotonic_ns']<second['monotonic_ns']
           and rep['monotonic_ns']-post['monotonic_ns']>=100_000_000)
        ck('replacement nonce is entire next tool body; file text absent from request',
           received==rep['nonce'] and rep['nonce'] not in firsttext and original not in secondtext
           and alternate not in secondtext and state['status']=='completed' and state['output']==rep['nonce'])
        extra={'replacement_nonce':rep['nonce'],'replacement_delay_ms':(rep['monotonic_ns']-post['monotonic_ns'])/1e6,
               'replacement_to_request_ms':(second['monotonic_ns']-rep['monotonic_ns'])/1e6,
               'native_input_still_original':state['input']['filePath']==inp['original_path'],
               'native_metadata_retains_alternate_contents':alternate in canon(state.get('metadata',{}))}
        ck('metadata/history scope qualification',extra['native_input_still_original'] and extra['native_metadata_retains_alternate_contents'])
    else:
        denied=ev('denied');ck('denial and no post/file access',len(denied)==1 and not after and access==[])
        den=denied[0]
        ck('fresh denial becomes correlated next tool error',
           den['callId']==pre['callId'] and pre['monotonic_ns']<den['monotonic_ns']<second['monotonic_ns']
           and received==den['nonce'] and den['nonce'] not in firsttext and original not in secondtext
           and alternate not in secondtext and state['status']=='error' and state['error']==den['nonce'])
        extra['denial_nonce']=den['nonce']
    endpoint=urllib.parse.urlparse(invocation['env_overrides']['PROBE_OBSERVER'])
    with socket.socket() as sock:
        sock.settimeout(.5);connection=sock.connect_ex((endpoint.hostname,endpoint.port))
    ck('recorded loopback port not listening at recount',connection!=0,connection)
    ck('config isolated with fake provider and native permissions',
       config['provider']['boundary-probe']['options']['apiKey']=='FAKE_LOCAL_ONLY' and 'permission' not in config
       and '--auto' not in invocation['argv'] and all(k not in invocation['env_overrides'] for k in ['HOME','CODEX_HOME']))
    ck('watcher spans process lifetime and final drain',
       probe.index('inotify_add_watch')<probe.index('subprocess.Popen')
       and 'proc.wait()\n            drain_access()\n            os.close(watcher)' in probe)
    ck('plugin itself does not read controlled file contents',
       "import { appendFileSync } from 'node:fs'" in plugin and 'readFile' not in plugin)
    results.append({'case':case,'session_id':session,'native_pids':sorted(casepids),'requests':len(requests),
                    'file_access_events':access,'details':extra,
                    'checks_passed':sum(c['pass'] for c in checks[start:]),'checks_total':len(checks)-start})
check('distinct fresh session identities',len(set(sessions))==4)
check('distinct native process identities',len(set(pids))==4)
receipt={
 'reviewer':'/root/claude_codex_powers','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'evidence_root':str(ROOT),'method':'Independent strict parsing, request-role/call correlation, actual file-access witness and post-output recount; no native runtime launched.',
 'all_pass':all(c['pass'] for c in checks),'checks_passed':sum(c['pass'] for c in checks),'checks_total':len(checks),
 'raw_manifest_entries_checked':len(hashes),'results':results,'checks':checks,'inputs':inputs,
 'qualifications':[
  'Native OpenCode 1.19.0 run --format json, local plugin, built-in read, four fresh cases. No live model quality or other-tool/MCP capability claim.',
  'Inotify timestamps are polling receipt times, not kernel event times; events identify watched files, not actor PIDs. Positive baseline/rebind and native post output corroborate the witness.',
  'Executed input changes do not rewrite assistant tool-call arguments or native stdout state.input. Both retain the original requested path.',
  'Replacing output.output hides file contents from the next model request; native stdout metadata.preview/display.text retain alternate contents. This is model-visible result-body replacement, not full metadata/history redaction.',
  'Denied tool invocation becomes a tool error and the turn continues to normal scripted final response.',
  'PID absence and recorded-port closure are bounded cleanup checks, not exhaustive descendant/network audits.',
  'Raw evidence was read only; only this review directory was written.'
 ]}
target=args.output.resolve()
target.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'receipt':str(target),'all_pass':receipt['all_pass'],'checks':len(checks),
                  'failed':[c for c in checks if not c['pass']],'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))

raise SystemExit(0 if receipt['all_pass'] else 1)
