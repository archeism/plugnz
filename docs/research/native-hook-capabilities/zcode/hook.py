#!/usr/bin/env python3
"""Native ZCode process hook; this fixture returns only scoped effect outputs."""
import json, os, secrets, sys, time
from pathlib import Path

event, journal_name, case, workspace_name = sys.argv[1:]
journal, workspace = Path(journal_name), Path(workspace_name)
payload = json.load(sys.stdin)
def record(stage, **fields):
    row = json.dumps({"event":event,"stage":stage,"monotonic_ns":time.monotonic_ns(),
                      "pid":os.getpid(),"payload":payload,**fields}) + "\n"
    if journal.exists() and journal.stat().st_size + len(row.encode()) > 1_000_000:
        raise RuntimeError("hook journal cap exceeded")
    with journal.open("a") as f: f.write(row)
record("enter")
output, nonce, rewritten_content = {}, None, None
if event in ("PreToolUse", "PostToolUse", "Stop"):
    time.sleep(0.15)
    nonce = "ZCODE_" + event.upper() + "_" + secrets.token_hex(20)
    if event == "PreToolUse" and case == "effects":
        rewritten_content = "ZCODE_REWRITTEN_FILE_" + secrets.token_hex(20)
        target = workspace / "rewritten.txt"
        target.write_text(rewritten_content + "\n")
        output = {"hookSpecificOutput":{"hookEventName":event,
                  "updatedInput":{**payload["toolInput"],"file_path":str(target)},
                  "additionalContext":nonce}}
    elif event == "PreToolUse" and case == "deny":
        output = {"hookSpecificOutput":{"hookEventName":event,
                  "permissionDecision":"deny","permissionDecisionReason":nonce}}
    elif event == "PostToolUse" and case == "effects":
        output = {"hookSpecificOutput":{"hookEventName":event,"additionalContext":nonce}}
    elif event == "Stop" and case == "effects" and not payload.get("stopHookActive", False):
        output = {"continue":True,"hookSpecificOutput":{"hookEventName":event,
                  "additionalContext":nonce}}
record("return",nonce=nonce,rewritten_content=rewritten_content,output=output)
print(json.dumps(output))
