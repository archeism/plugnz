#!/usr/bin/env python3
"""Offline recount of actual native receipts and kernel watches; no runner PASS fields."""
import argparse, hashlib, json, os, pathlib

P = pathlib.Path
def load(p): return json.loads(p.read_text())
def lines(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def text(m):
    c = m.get("content", "")
    return c if isinstance(c, str) else "\n".join(x.get("text", "") for x in c if isinstance(x, dict))
def one(items, description):
    assert len(items) == 1, (description, len(items))
    return items[0]
def absent(pid):
    try: os.kill(pid, 0); return False
    except ProcessLookupError: return True

def recount(case):
    expected, run = load(case/"expectations.json"), load(case/"run.json")
    native, events, requests = lines(case/"stdout.jsonl"), lines(case/"observations.jsonl"), lines(case/"requests.jsonl")
    access = load(case/"file-access.json")
    harness, mode, call_id = expected["harness"], expected["case"], expected["call_id"]
    def e(kind): return [x for x in events if x["event"] == kind]
    assert run["status"] == "completed" and run["exit_code"] == 0
    assert run["fixture_errors"] == [] and lines(case/"server-errors.jsonl") == []
    assert absent(run["pid"]) and all(run[k] for k in ["process_waited","native_pid_absent",
        "process_group_absent","listener_closed","server_thread_stopped"])
    assert len(requests) == (3 if harness == "omp" and mode == "rewrite" else 2)
    assert all(r["path"] == "/v1/chat/completions" and len(json.dumps(r["body"]).encode()) <= 256*1024 for r in requests)
    assert all(any(m["role"] == "user" and expected["task"] in text(m) for m in r["body"]["messages"]) for r in requests)
    assert all("read" in [t["function"]["name"] for t in r["body"]["tools"]] for r in requests)
    assert not [m for m in requests[0]["body"]["messages"] if m["role"] == "tool"]
    pre = one(e("pre_enter"), "pre callback")
    assert pre["input"]["path"] == "requested.txt" and pre["toolName"] == "read" and pre["toolCallId"] == call_id
    start = one(e("session_start"), "fresh session start")
    assert start["sessionId"] and P(start["sessionFile"]).exists()
    assert e("agent_end") and len(e("session_shutdown")) == 1
    native_start = one([x for x in native if x.get("type") == "tool_execution_start"], "native execution-start event")
    native_end = one([x for x in native if x.get("type") == "tool_execution_end"], "native execution-end event")
    assert native_start["toolCallId"] == call_id and native_end["toolCallId"] == call_id
    assert native_start["toolName"] == "read" and native_end["toolName"] == "read"
    assert access["watch_started_before_native_launch"] is True and len(access["watched_paths"]) == 2
    assert all(not (x["mask"] & 0x4000) for x in access["events"]), "inotify overflow"
    opened = sorted(set(P(x["path"]).name for x in access["events"] if x["open"] or x["access"]))
    receipts = [one([m for m in r["body"]["messages"] if m["role"]=="tool" and m["tool_call_id"]==call_id],
        "matching tool receipt") for r in requests[1:]]
    assert all(m["role"] == "tool" for m in receipts)
    raw_request_text = [json.dumps(r["body"]) for r in requests]
    assert expected["requested_content"] not in raw_request_text[0] and expected["alternate_content"] not in raw_request_text[0]
    assert requests[0]["observer_ns"] < pre["observer_ns"]
    extras = {}
    if mode == "deny":
        denial = one(e("pre_deny"), "deny decision")
        assert denial["toolCallId"] == call_id and denial["observer_ns"] > pre["observer_ns"]
        assert len(e("post_original")) == 0 and len(e("post_decision")) == 0 and opened == []
        assert native_end["isError"] is True
        assert all(denial["reason"] == text(m) for m in receipts)
        assert all(expected["requested_content"] not in t and expected["alternate_content"] not in t for t in raw_request_text)
        assert requests[1]["observer_ns"] > denial["observer_ns"]
        extras["denial_nonce"] = denial["reason"]
        extras["post_callback_count"] = 0
    else:
        post, decision = one(e("post_original"), "original post result"), one(e("post_decision"), "post decision")
        target, marker = ("alternate.txt", expected["alternate_content"]) if mode == "rewrite" else ("requested.txt", expected["requested_content"])
        assert opened == [target]
        assert any(x["access"] and P(x["path"]).name == target for x in access["events"])
        assert post["toolCallId"] == call_id and post["toolName"] == "read"
        assert post["input"]["path"] == target and marker in text(post) and post["isError"] is False
        assert native_end["isError"] is False and pre["observer_ns"] < post["observer_ns"] < decision["observer_ns"] < requests[1]["observer_ns"]
        assert decision["observer_ns"] - post["observer_ns"] >= 70_000_000
        if mode == "rewrite":
            rewrite = one(e("pre_rewrite"), "rewrite decision")
            assert rewrite["input"]["path"] == "alternate.txt" and decision["returned"] is True
            assert rewrite["observer_ns"] < post["observer_ns"]
            assert all(text(m) == decision["nonce"] for m in receipts)
            assert all(expected["requested_content"] not in t and expected["alternate_content"] not in t for t in raw_request_text)
        else:
            assert len(e("pre_no_effect")) == 1 and len(e("pre_rewrite")) == 0 and decision["returned"] is False
            assert all(marker in text(m) for m in receipts)
            assert all(decision["nonce"] not in t and expected["alternate_content"] not in t for t in raw_request_text)
        extras.update(post_nonce=decision["nonce"],post_nonce_delivered=mode=="rewrite",
            post_original_marker=marker,post_callback_count=1,
            post_to_next_request_ms=(requests[1]["observer_ns"]-decision["observer_ns"])/1e6)
    stop_receipt = None
    if harness == "omp":
        if mode == "rewrite":
            stop = one(e("stop_decision"), "single continuation decision")
            assert len(e("session_stop")) == 2
            assert e("session_stop")[0]["stop_hook_active"] is False and e("session_stop")[1]["stop_hook_active"] is True
            assert stop["observer_ns"] < requests[2]["observer_ns"]
            locations = [(i,m) for i,m in enumerate(requests[2]["body"]["messages"]) if stop["nonce"] in text(m)]
            i, m = one(locations, "continuation actual role")
            assert all(stop["nonce"] not in t for t in raw_request_text[:2])
            stop_receipt = {"nonce":stop["nonce"],"request_index":2,"message_index":i,"role":m["role"],
                "decision_to_request_ms":(requests[2]["observer_ns"]-stop["observer_ns"])/1e6}
        else:
            assert len(e("session_stop")) == 1 and len(e("stop_decision")) == 0
    resources = load(case/"resources.json")
    assert isinstance(resources["sampled_native_peak_rss_kib"],int) and resources["sampled_native_peak_rss_kib"] > 0
    assert resources["lane_allocated_after"] < 20*1024*1024 and resources["wall_seconds"] < 46
    retained_args = [json.loads(tc["function"]["arguments"]) for m in requests[1]["body"]["messages"]
        for tc in m.get("tool_calls",[]) if tc["id"] == call_id]
    return {"harness":harness,"case":mode,"verified":True,"evidence":str(case),
        "native_pid":run["pid"],"session_id":start["sessionId"],
        "request_count":len(requests),"opened_or_accessed":opened,"tool_receipt_role":"tool",
        "native_execution_start_observed":True,"native_execution_end_is_error":native_end["isError"],
        "native_execution_start_args":native_start.get("args"),"assistant_history_tool_args":retained_args,
        "stop_continuation":stop_receipt,"resources":resources,**extras}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("evidence",type=P)
    args=ap.parse_args()
    accepted=[args.evidence/"attempt-01-pi",args.evidence/"attempt-02-omp"]
    failed=args.evidence/"attempt-01-omp"
    hash_count=0
    manifests={}
    for attempt in [*accepted,failed]:
        manifest=load(attempt/"hashes.json")
        for name,digest in manifest.items():
            assert sha(attempt/name)==digest, "hash mismatch "+str(attempt/name)
            hash_count+=1
        manifests[attempt.name]=sha(attempt/"hashes.json")
    results=[recount(attempt/mode) for attempt in accepted for mode in ["baseline","rewrite","deny"]]
    fail_run=load(failed/"baseline/run.json")
    assert fail_run["request_count"]==0 and fail_run["observation_count"]==0
    assert "FileNotFoundError" in fail_run["status"] and "models.db-journal" in fail_run["status"]
    assert fail_run["process_waited"] and fail_run["native_pid_absent"] and absent(fail_run["pid"])
    assert fail_run["listener_closed"] and fail_run["process_group_absent"]
    print(json.dumps({"schema_version":1,"verified_cases":len(results),"results":results,
        "raw_files_hash_verified":hash_count,"attempt_manifest_sha256":manifests,
        "retained_apparatus_failure":{"evidence":str(failed),"run":fail_run,
            "classification":"Disk scanner raced removal of a transient SQLite journal before any native hook/model request."},
        "verification":"Offline raw request/event/kernel-watch recount; no runner PASS fields.",
        "scope":"Fresh native CLI and built-in read only; no resume, approval, runtime crash, cap8, error-status inversion, or other tool-family claims.",
        "script_sha256":sha(P(__file__))},indent=2))

if __name__=="__main__":main()
