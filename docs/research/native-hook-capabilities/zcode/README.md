# ZCode CLI native hook effects

## Result

**Argument rewriting, tool denial, pre/post context, and one Stop continuation
are demonstrated in the native noninteractive CLI.** This is a hooks probe;
it does not qualify plugnz installation.

| Case | Receiving-boundary evidence | Requests | Outcome |
| --- | --- | --- | --- |
| Baseline | Real Read returns the original file; hook nonces are generated but omitted and absent from every request | 2 | Pass |
| Effects | PreToolUse redirects Read to a hook-created file; pre/post context is appended to its model-facing tool result; Stop adds a user-role message and causes one more request | 3 | Pass |
| Deny | PreToolUse rejection reaches the matching model-facing tool result; no PostToolUse and no watched-file open/access event | 2 | Pass |

The actual tool name is **Read**. Each case has a unique call ID. The positive
case's post-hook payload contains the rewritten input and the real replacement
file contents. Its second model request contains those contents plus independent
PreToolUse and PostToolUse nonces under the same tool-call ID, in **tool** role.
The original file's contents are absent.

The Stop hook returns native `continue: true` plus `additionalContext` once.
The third request contains that nonce in **user** role. The next Stop reports
`stopHookActive: true`, keeps the same session and turn IDs, and returns no effect.
No second user prompt or wrapper turn was submitted.

Linux inotify watches the original file only while the native process runs.
Baseline recorded IN_OPEN and IN_ACCESS; effects and deny recorded neither.
The positive baseline validates this witness. Inotify counts may coalesce:
they establish positive/zero observations, not exact read counts.

## Runtime and bounds

- Official source: [zai-org/ZCode@aac4755](https://github.com/zai-org/ZCode/tree/aac4755666d09fdcd70272fcf063c077a639015f), CLI **0.16.9**.
- Existing source-built CLI and Node **26.7.0** reused; hashes match the earlier
  native version receipt. The package declares Node 24.14.0; that release was not tested.
- User-scope foreground process hooks, explicit `--mode plan`, workflow disabled.
  Native execution normalizes this to `mode: build` with planning enabled.
- Private network namespace with loopback only. The synthetic Chat Completions
  provider emits one real Read call, then finishes; no live inference or credentials.
- Retained Bwrap isolation: private `/root`, unchanged HOME, owned profile at
  `/root/.zcode`, read-only runtime/host filesystem, owned writable probe directory
  and existing bundled-plugin cache. Plugins and MCP disabled.
- Per case: 40-second native timeout, 45-second ceiling, six accepted requests,
  256KiB request bodies, 1MiB process output; entire lane capped at 20MiB.
- Observed wall times: baseline 2.175s, effects 2.426s, deny 1.957s.
  These are fixture timings, not a performance comparison.
- Request journal: 335,729 bytes. Completed evidence is approximately 3.34MB.
  Existing 3.53GB runtime/cache storage was reused and accounted separately.
- Native and hook PIDs exited, listener closed, source worktree stayed clean.
  Child CPU is recorded; it includes small disk-monitor subprocesses.
  Max RSS is cumulative across coordinator children, not a per-case peak.
  Provider token counts are synthetic fixture values.

Pre/post/Stop nonces are generated after a 150ms hook delay. Both hook timestamps
and receiver timestamps use Python's kernel monotonic clock on the same host.
The next request is later than the relevant post-hook or Stop return.

## Evidence and reproduction

Canonical frozen attempt:

```text
/root/workspace/harness-hook-capabilities-20261012/evidence/zcode/20261012T145814-02be9d
```

The attempt holds exact probe/hook/verifier snapshots, native config and argv,
requests, native output, hook journals, kernel file events, process/resource
receipts, and a SHA-256 manifest. All 60 manifest entries were re-read and matched.
The source fixture's initial syntax error was caught before native launch;
its original source and failure receipt remain under `evidence/zcode/preflight/`.
The first native cohort passed; no failed native case was discarded.

Reproduce on the machine with retained runtime paths:

```sh
unshare --net -- /usr/bin/python3 docs/research/native-hook-capabilities/zcode/probe.py \
  /absolute/new-evidence-directory \
  --node /root/.local/share/router-comparison/oar/tooling/node-v26.7.0-linux-x64/bin/node \
  --source /root/workspace/harness-hooks-probes-20261012-9c3mll0g/runtimes/round2/zcode/source \
  --cli /root/workspace/harness-hooks-probes-20261012-9c3mll0g/runtimes/round2/zcode/source/apps/zcode-cli/packages/cli/dist/zcode.cjs \
  --bundle-cache /root/workspace/harness-hooks-probes-20261012-9c3mll0g/runtimes/round2/zcode/bundled-plugin-cache
python3 docs/research/native-hook-capabilities/zcode/verify.py /absolute/attempt-directory
```

## Limits and source contract

The effect case combines argument replacement, two independently marked context
outputs, and one Stop continuation; the baseline omits all effects while preserving
callback execution. This is fresh CLI coverage, not resumed-session effect coverage.

Native allow/ask overrides, invalid rewritten inputs, error hooks, interactive UI,
other tools, full result replacement, termination veto, and crash cleanup remain
untested here. No hook should be labeled universally capable because these passed.

Source-backed distinctions, separate from runtime probe coverage:

- [Tool executor](https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts)
  denies before execution, validates rewritten input, then evaluates permissions.
  Successful results consume pre/post additional context.
- [Hook output contract](https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/contracts/src/hooks/index.ts)
  has no PostToolUse replacement field and no SessionEnd process-hook event.
- [Stop consumer](https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/runtime/methods/hooks.ts)
  requires continuation plus nonempty context and limits native continuations to
  three. This probe exercises one continuation, not the maximum.
