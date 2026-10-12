#!/usr/bin/env python3
"""Normal native exact-definition review in the probe's isolated profile; no trust-store edits."""
import argparse, fcntl, json, os, pty, select, signal, struct, subprocess, termios, time
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('attempt');ap.add_argument('--lane-cap-mib',type=int,default=64);a=ap.parse_args();attempt=Path(a.attempt).resolve();ready=json.loads((attempt/'review/review-ready.json').read_text());root=attempt/'review'
lane=attempt.parent
cap=a.lane_cap_mib*1024*1024
allocated=lambda:int(subprocess.check_output(['du','-sk',str(lane)]).split()[0])*1024
initial_bytes=allocated()
if initial_bytes>cap:raise SystemExit('Review refuses launch: allocated '+str(initial_bytes)+' exceeds declared cap '+str(cap))
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',42,120,0,0))
started=time.monotonic();next_disk=started+1;failure=None;log_bytes=0;proc=subprocess.Popen(ready['argv'],stdin=slave,stdout=slave,stderr=slave,env=ready['env'],start_new_session=True);os.close(slave)
print(json.dumps({'native_pid':proc.pid,'attempt':str(attempt),'normal_exact_review':True}),flush=True)
try:
 with (root/'terminal.raw').open('wb') as raw,(root/'inputs.jsonl').open('a') as journal:
  while proc.poll() is None and time.monotonic()-started<180:
   now=time.monotonic()
   if now>=next_disk:
    next_disk=now+1
    if allocated()>cap:failure='Declared lane disk cap exceeded';break
   available,_,_=select.select([master,0],[],[],0.2)
   if master in available:
    try:data=os.read(master,65536)
    except OSError:break
    log_bytes+=len(data)
    if log_bytes>1048576:failure='1MiB review terminal log cap exceeded';break
    raw.write(data);raw.flush();os.write(1,data)
    if b'\x1b[6n' in data:os.write(master,b'\x1b[1;1R')
    if b'\x1b[c' in data:os.write(master,b'\x1b[?1;2c')
   if 0 in available:
    data=os.read(0,4096)
    if data:journal.write(json.dumps({'monotonic_ns':time.monotonic_ns(),'input_hex':data.hex()})+'\n');journal.flush();os.write(master,data)
finally:
 if proc.poll() is None:
  os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
 os.close(master)
(root/'review-process.json').write_text(json.dumps({'pid':proc.pid,'exit':proc.returncode,'wall_seconds':time.monotonic()-started,'pid_absent':not Path('/proc',str(proc.pid)).exists(),'trust_method':'Native exact-definition review; no trust-all or direct trust-store edits','failure':failure,'lane_cap_bytes':cap,'lane_bytes_before':initial_bytes,'lane_bytes_after':allocated(),'terminal_log_bytes':log_bytes},indent=2)+'\n')
