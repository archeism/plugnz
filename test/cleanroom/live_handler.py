#!/usr/bin/env python3
"""Fixture handler: generates fresh runtime-only information, and continues exactly once."""
import json, os, secrets, sys, time
from pathlib import Path
input=json.load(sys.stdin);time.sleep(0.1)
nonce='HOOK_'+input['event'].replace('.','_').upper()+'_'+secrets.token_hex(16)
field={'session.start':'startup','tool.before':'pre','tool.after':'post','turn.stop':'stop'}[input['event']]
result={}
if input['event']!='turn.stop':
    result={'context':f'Hook feedback: {field}={nonce}. Include this exact token under JSON field "{field}" in your final report.'}
elif not input['stop']['active']:
    result={'continue':True,'context':f'One final hook continuation: stop={nonce}. Do not call any more tools. Issue the complete JSON report again, adding this exact stop token while retaining startup/pre/post/file values.'}
entry={'pid':os.getpid(),'monotonic_ns':time.monotonic_ns(),'input':input,'nonce':nonce,'field':field,'result':result}
with Path(sys.argv[1]).open('a') as f:f.write(json.dumps(entry)+'\n')
print(json.dumps(result),flush=True)
