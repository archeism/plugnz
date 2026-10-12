#!/usr/bin/env python3
"""Recount effects from native hook payloads, model requests, and kernel file events."""
import hashlib, json, sys
from pathlib import Path

def read(path):return json.loads(Path(path).read_text())
def rows(path):return [json.loads(x) for x in Path(path).read_text().splitlines()]
def text(value):return json.dumps(value,ensure_ascii=False)
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def main():
    root=Path(sys.argv[1]);report=read(root/"report.json");identity=read(root/"identity.json")
    reqs=rows(root/"requests.jsonl");outputs=[]
    global_checks={"three_cases":len(report["cases"])==3,"listener_closed":report["listener_closed"],
       "private_network":identity["network_namespace"]!=identity["host_network_namespace"],
       "source_unchanged":identity["source_status_before"]==report["source_status_after"]=="",
       "source_pinned":identity["source_commit"]=="aac4755666d09fdcd70272fcf063c077a639015f",
       "cli_hash_matches":sha(identity["cli"])==identity["cli_sha256"],
       "node_hash_matches":sha(identity["node"])==identity["node_sha256"],
       "no_budget_failures":not report["budget_failures"],
       "lane_within_budget":report["raw_bytes_after"]<=20*1024*1024}
    for case in ("baseline","effects","deny"):
        out=root/case
        if not (out/"run.json").exists():outputs.append({"case":case,"status":"FAIL","missing_run":True});continue
        run=read(out/"run.json");meta=read(out/"case.json");watch=read(out/"file-access.json")
        events=rows(out/"events.jsonl");returned=[r for r in events if r["stage"]=="return"]
        pre=[r for r in returned if r["event"]=="PreToolUse"]
        post=[r for r in returned if r["event"]=="PostToolUse"]
        stop=[r for r in returned if r["event"]=="Stop"]
        requests=[r for r in reqs if r["case"]==case and meta["task_nonce"] in text(r["body"].get("messages",[]))]
        second=requests[1]["body"]["messages"] if len(requests)>1 else []
        tool_messages=[m for m in second if m.get("role")=="tool" and m.get("tool_call_id")==meta["tool_id"]]
        tool_text=text(tool_messages)
        all_requests=text([r["body"] for r in requests])
        original=meta["original_content"]
        checks={"native_exit_zero":run["exit_code"]==0 and run["failure"] is None,
          "pids_exited":run["pid_absent"] and run["hook_pids_absent"],
          "wall_within_budget":run["wall_ms"]<=45000,
          "one_pre_hook":len(pre)==1,"request_count":len(requests)==(3 if case=="effects" else 2),
          "correlated_tool_result":len(tool_messages)==1,
          "no_inotify_overflow":not watch["queue_overflow"],
          "native_plan_mode":all(r["payload"].get("mode")=="build" for r in returned)
                             and "--mode" in meta["argv"] and "plan" in meta["argv"],
          "plan_context_present":bool(requests) and "plan" in text(requests[0]["body"]).lower()}
        if len(pre)==1:
            checks["pre_original_arguments"]=pre[0]["payload"]["toolInput"]["file_path"]==meta["original"]
            checks["pre_tool_id"]=pre[0]["payload"]["toolCallId"]==meta["tool_id"]
            entry=next(r for r in events if r["event"]=="PreToolUse" and r["stage"]=="enter")
            checks["pre_delayed_nonce"]=pre[0]["monotonic_ns"]-entry["monotonic_ns"]>=140_000_000
            checks["pre_nonce_not_first_request"]=bool(requests) and pre[0]["nonce"] not in text(requests[0]["body"])
        if case=="baseline":
            checks.update(original_read=original in tool_text,
              kernel_read_witness=watch["open_events"]>0 and watch["access_events"]>0,
              one_post_hook=len(post)==1,one_stop=len(stop)==1,
              all_effects_omitted=all(r["output"]=={} for r in returned),
              omitted_nonces_absent=all(r["nonce"] is None or r["nonce"] not in all_requests for r in returned))
            if len(post)==1:
                checks["post_real_read"]=post[0]["payload"]["toolResponse"]["content"].strip()==original
                checks["post_tool_id"]=post[0]["payload"]["toolCallId"]==meta["tool_id"]
        elif case=="effects" and len(pre)==1:
            rewritten=pre[0]["rewritten_content"];updated=pre[0]["output"]["hookSpecificOutput"]["updatedInput"]
            checks.update(one_post_hook=len(post)==1,original_not_read=watch["open_events"]==watch["access_events"]==0,
              original_content_absent=original not in all_requests,
              rewritten_content_delivered=bool(rewritten) and rewritten in tool_text,
              pre_context_in_tool_result=pre[0]["nonce"] in tool_text,
              two_stop_hooks=len(stop)==2)
            if len(post)==1:
                checks["rewritten_input_executed"]=post[0]["payload"]["toolInput"]==updated
                checks["rewritten_result_correlated"]=post[0]["payload"]["toolCallId"]==meta["tool_id"] and post[0]["payload"]["toolResponse"]["content"].strip()==rewritten
                checks["post_context_in_tool_result"]=post[0]["nonce"] in tool_text
                checks["post_context_not_original_result"]=post[0]["nonce"] not in text(post[0]["payload"]["toolResponse"])
                checks["second_request_after_post"]=len(requests)>1 and requests[1]["monotonic_ns"]>post[0]["monotonic_ns"]
            if len(stop)==2 and len(requests)==3:
                stop_messages=[m for m in requests[2]["body"]["messages"] if stop[0]["nonce"] in text(m.get("content"))]
                checks["stop_state_transition"]=stop[0]["payload"]["stopHookActive"] is False and stop[1]["payload"]["stopHookActive"] is True
                checks["same_turn_continuation"]=stop[0]["payload"]["sessionId"]==stop[1]["payload"]["sessionId"] and stop[0]["payload"]["turnId"]==stop[1]["payload"]["turnId"]
                checks["stop_return_effect"]=stop[0]["output"].get("continue") is True and stop[1]["output"]=={}
                checks["stop_context_delivered_user"]=len(stop_messages)==1 and stop_messages[0]["role"]=="user"
                checks["stop_context_not_earlier"]=stop[0]["nonce"] not in text([r["body"] for r in requests[:2]])
                checks["third_request_after_stop"]=requests[2]["monotonic_ns"]>stop[0]["monotonic_ns"]
                checks["final_stop_marker_omitted"]=stop[1]["nonce"] not in all_requests
        elif case=="deny" and len(pre)==1:
            checks.update(no_post_hook=len(post)==0,no_original_file_access=watch["open_events"]==watch["access_events"]==0,
              original_content_absent=original not in all_requests,
              deny_reason_in_tool_result=pre[0]["nonce"] in tool_text,
              denial_only=pre[0]["output"]=={"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":pre[0]["nonce"]}},
              one_stop=len(stop)==1)
            checks["denial_after_pre"]=len(requests)>1 and requests[1]["monotonic_ns"]>pre[0]["monotonic_ns"]
        outputs.append({"case":case,"status":"PASS" if all(checks.values()) else "FAIL","checks":checks,
             "event_order":[r["event"] for r in returned],"request_count":len(requests),
             "tool_result_roles":[m["role"] for m in tool_messages],
             "file_access":{"open_events":watch["open_events"],"access_events":watch["access_events"]}})
    verdict={"status":"PASS" if all(global_checks.values()) and all(x["status"]=="PASS" for x in outputs) else "FAIL",
             "global_checks":global_checks,"cases":outputs}
    print(json.dumps(verdict,indent=2))
    raise SystemExit(0 if verdict["status"]=="PASS" else 1)
if __name__=="__main__":main()
