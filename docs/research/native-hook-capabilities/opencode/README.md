# OpenCode native hook effect probes

Native **OpenCode 1.19.0**, source commit `733b2c627e5aec39cb33cc22373bdce33053ef2c`.

Four fresh native CLI sessions exercise the built-in `read` tool through the normal plugin loader and tool executor. The provider is a bounded local Chat Completions fixture with synthetic responses. No live model inference is used.

## Results

| Case | Actual execution and receiving effect |
| --- | --- |
| Baseline | Requested file is opened/read and its original contents reach the next correlated tool message. |
| Rebind `output.args` | The callback assigns a new argument object, but the native consumer still executes the original arguments. This is the negative control for argument mutation. |
| Mutate existing arguments and replace output | `output.args.filePath` changes which file is actually read. The after-hook sees the alternate file contents, then replaces `output.output` after an awaited delay. Its new nonce becomes the entire next model-visible tool-result body. |
| Deny | Throwing from the before-hook prevents the selected read. Neither watched file is opened/accessed; the after-hook does not run. A fresh denial nonce becomes the matching tool error and the turn continues to its scripted final response. |

Each case made two task requests and exited normally. An independent reviewer parsed the raw native events, provider requests, file-access observations, and result metadata: **106/106 checks passed**, and **77 raw file hashes** matched.

[RESULTS.json](RESULTS.json) records the bounded capability verdict. [EVIDENCE.json](EVIDENCE.json) identifies runtime, fixture, and review provenance.

## Material qualifications

- Native historical assistant arguments and stdout `state.input` retain the model's original path even when the alternate file executes. The after-hook's arguments, file-access witness, and display path establish effective execution. Preserve requested and effective input separately.
- Model-visible result-body replacement is not complete redaction. Native stdout preview/display metadata retains the actual alternate file contents. No tool side effect is undone.
- The ordinary Read consumer retains the original argument-object reference. Whole-object rebinding is ineffective on this path; in-place property mutation is effective. MCP and other tool families require their own qualification.
- Denial prevents one tool call. It does not abort the entire turn.
- Inotify observes controlled files, not an accessing PID. Timestamps are observer drain times, not kernel event timestamps. Positive baseline access, native post-output, and receiving-provider receipts corroborate the witness.
- The case invokes normal native permissions with a dedicated XDG configuration and fake provider credential. Discovery, automatic downloads, default plugins and updates are disabled through native flags. This lane does not use a private network namespace or claim an exhaustive egress audit.
- Recorded native PIDs were absent and recorded listener ports refused connections at independent review. These are bounded cleanup checks, not an exhaustive descendant-process audit.
- These are fresh noninteractive CLI Read cases. They do not establish resumed-session action effects, other tools, interactive approval, hook failure/timeout policy, multi-handler composition, or plugnz installation.

The earlier startup cohort separately qualified fresh/cold-resume context via awaited plugin initialization and `experimental.chat.system.transform`. Plugin initialization is instance-scoped and is not a universal session-entry event.

## Reproduce

Prerequisites are Python 3, Linux inotify, and a retained native OpenCode 1.19.0 installation. The runner neither installs the runtime nor changes its source. The retained installation used here is:

```text
/root/workspace/harness-hooks-probes-20261012-9c3mll0g/runtimes/round2/opencode
```

Run from the repository, choosing a new absolute evidence directory with a unique basename:

```sh
python3 docs/research/native-hook-capabilities/opencode/probe.py \
  --runtime /absolute/path/to/retained/opencode-runtime \
  --evidence /absolute/path/to/new-unique-attempt
```

The runtime directory must contain `node_modules/.bin/opencode` and its existing provider dependencies. The evidence directory must not already exist. The runner creates isolated per-case configuration under that retained runtime and captures state under the new evidence root.

Boundaries: 45 seconds/case, six requests/case, 256 KiB/request, 2 MiB per process-written file, 20 MiB raw lane, and 2 GiB retained runtime. Accepted cases took approximately 4.70–4.79 seconds each, including teardown. Resource observations are not performance benchmarks; recorded child CPU also includes disk measurement processes.

For an offline independent recount of a frozen attempt, choose a new output path outside that attempt:

```sh
python3 docs/research/native-hook-capabilities/opencode/recount.py \
  /absolute/path/to/frozen-attempt \
  --output /absolute/path/to/new-review.json
```

This recount reads raw evidence, compares recorded hashes, correlates native call/session identities and next-request roles, checks the file witness and metadata limitations, and checks bounded PID/listener cleanup. It does not launch OpenCode. Cleanup observations describe the time of recount.

## Provenance and retained evidence

Actual attempt:

```text
/root/workspace/harness-hook-capabilities-20261012/evidence/opencode-effects/attempt-01
```

The independent recount was authored separately by `/root/claude_codex_powers`; the checked-in copy adds path arguments for replay. Its original script and receipt remain in the integration evidence archive. No failed native action attempt was omitted.

Native executable SHA-256:

```text
135ac3f86c43f2a22328a3554fec5f0bc57d71576077902661bc38dac34871fd
```

The package metadata, native session version receipt, and recomputed retained binary digest agree on the tested runtime. The final Personal probing skill was used unchanged, SHA-256 `5440bd6e8ed63cc588153bfbb94f62a54df3939dc3609f619fad47123124fa81`.

## Pinned implementation references

- [Plugin result types](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/plugin/src/index.ts)
- [Plugin dispatch and initialization](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/plugin/index.ts)
- [Tool consumer: argument reference and result handling](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/session/tools.ts)
- [Ordinary tool validation wrapper](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/tool/tool.ts)
- [Permission service](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/permission/index.ts)
