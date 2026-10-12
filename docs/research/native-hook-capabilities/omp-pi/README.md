# Native hook effects: Pi and OMP

**Supported in the tested modes:** Pi 0.73.1 and OMP 18.8.7 native JSON print CLI can deny the selected built-in read, change which fixture file it actually reads, and replace its model-visible result. OMP can additionally request one continuation from its native Stop hook.

This is native hook research. It does not implement or certify a plugnz installation route.

## Observed results

| Runtime | Baseline | Pre-argument change plus post-result replacement | Deny |
| --- | --- | --- | --- |
| Pi 0.73.1 | Requested file read; original tool result delivered | Alternate file read; fresh post-hook nonce delivered as matching tool-role result | Neither fixture file opened/accessed; no post-execution callback; matching denial error delivered |
| OMP 18.8.7 | Requested file read; original tool result delivered | Alternate file read; fresh post-hook nonce delivered as matching tool-role result | Neither fixture file opened/accessed; no post-execution callback; matching denial error delivered |

Each baseline runs the same pre/post callbacks. Its post callback creates a candidate replacement nonce but returns no modification. That nonce is absent from every captured model request. Thus the baseline tests the omitted effect, not merely whether the hook was discovered.

Both positive cases record the native read's original result before the post hook changes it. An independent Linux inotify watch sees only the alternate file opened/accessed, while the receiving model endpoint gets only the replacement nonce in the selected tool result.

OMP's positive case also returns `{continue: true, additionalContext}` exactly once from `session_stop`. That produces a third task request containing the new continuation nonce in **user-role** content. The second Stop pass reports `stop_hook_active: true`, returns no continuation, and exits normally. The other five cases make two task requests each.

## Native effects differ

| Detail | Pi | OMP |
| --- | --- | --- |
| Pre-tool argument action | Mutate `event.input.path` | Return replacement `input` |
| Actual file after rewrite | Alternate | Alternate |
| Native execution-start arguments after rewrite | Still requested file | Alternate file |
| Assistant tool-call arguments in the next model request | Still requested file | Alternate file |
| Post-tool action exercised | Return replacement `content` | Return replacement `content` |
| Native Stop continuation exercised | No native equivalent tested | One continuation with additional context |

**An execution-start event does not establish that the tool ran.** Both denied cases still emit native `tool_execution_start` and an error `tool_execution_end`. Denial is established by the fresh error nonce, absent post-execution callback, and zero opens/accesses of either watched file.

Post-result replacement changes model-visible content. OMP's untouched result details still retain the original read's display metadata. This is not proof of deleting all copies of original output, undoing tool side effects, or redacting UI/history.

## What remained real

The installed native CLI, extension loader, native built-in read, argument handling, ordinary permission behavior, tool events, post-result serialization, session storage, and orderly termination remain unchanged. The only synthetic dependency is a loopback OpenAI Chat Completions server that requests one harmless read and supplies fixed completions.

The extension sends observations to the same Python coordinator that captures model requests, awaiting each acknowledgment. Pre/post and Stop decisions wait 80 ms before returning. Ordering comparisons use the coordinator's single monotonic clock. Inotify timestamps are polling observation times, not claimed exact filesystem operation times.

Pi uses documented `PI_CODING_AGENT_DIR`, offline mode, explicit extension loading, and disabled external context/resource discovery. OMP reuses the documented isolated agent/config/session roots and discovery flags from the earlier native probe. Only `read` is selected. Fake credentials are used for the loopback provider. No native trust, approval, authentication, permission, or global configuration was changed.

## Bounds, resources, and retention

- Three fresh cases per runtime; 45-second maximum per case.
- Six model requests maximum per case; 256 KiB maximum request body.
- 128 observation maximum per case; child-created files capped at 1 MiB.
- 20 MiB allocated cap for the entire raw lane; retained lane measured approximately 2.04 MiB.
- Accepted cases: Pi 1.23–1.38 seconds; OMP 2.11–2.32 seconds, including coordinator teardown.
- Sampled native peak RSS: Pi 173,940–174,468 KiB; OMP 396,912–426,892 KiB.
- CPU/RSS scope and per-case measurements are in `RESULTS.json`; these are observations, not a performance comparison.
- No live inference. Synthetic protocol output is not a model-quality or model-obedience test.

One failed OMP attempt is retained: the disk scanner raced deletion of a transient SQLite journal before any hook or model request. The scanner was corrected to tolerate a vanished temporary file, and a new attempt was frozen. The failed attempt remains unchanged, with its native process and listener closed. No package installation or runtime patch was needed.

Raw root on Charles's remote host:

`/root/workspace/harness-hook-capabilities-20261012/evidence/omp-pi`

Accepted: `attempt-01-pi` and `attempt-02-omp`. Failed apparatus: `attempt-01-omp`.

All seven native processes were waited for; captured PIDs and process groups were absent after teardown, and listeners were closed. The offline recount checks 150 raw-file hashes, real request bodies, native stdout events, observer events, kernel watches, nonempty session identity, and cleanup receipts. It does not trust a runner PASS field.

`EVIDENCE.json` records native package/engine identity and source hashes. Per-case source snapshots are authoritative for their attempt. Current `probe.py` includes the disk-scanner correction; the Pi and failed first OMP attempts retain the earlier exact runner. Raw evidence is retained on this host; there is no off-host-backup claim.

## Replay and offline recount

Run from this directory. No dependencies are installed by these commands; the existing runtime paths in `probe.py` must be available.

```sh
python3 probe.py --harness pi --evidence /absolute/owned/new-pi-attempt
python3 probe.py --harness omp --evidence /absolute/owned/new-omp-attempt
python3 recount.py /root/workspace/harness-hook-capabilities-20261012/evidence/omp-pi
```

The runner refuses existing attempt directories. The recount command deliberately verifies the named retained cohort, including its failed apparatus attempt; it does not start a harness or contact a model.

## Limits and source references

These results cover one built-in read on fresh native CLI sessions. Resume effects, interactive dialogs, approval overrides, native timeout failures, error-status inversion, multiple hook composition, other tools, subagents, crashes, and OMP's continuation cap are untested here. The file watch covers two fixture files, not all filesystem activity or network egress.

Source revisions:

- [Pi extension contracts](https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/coding-agent/docs/extensions.md), [tool execution](https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/agent/src/agent-loop.ts).
- [OMP event/result contracts](https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/shared-events.ts), [tool wrapper](https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/extensions/wrapper.ts), [Stop implementation](https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/session/agent-session.ts).

The final Personal `probe-runtime-boundaries` skill was read and used unchanged (SHA-256 `5440bd6e8ed63cc588153bfbb94f62a54df3939dc3609f619fad47123124fa81`). This is a forward use of the method, not a claim that the skill improved.
