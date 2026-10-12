# Hooks verification

Recorded on 2026-10-12 on `charles-netcup`. Production candidate: [`54a628ca53e593df1eab0c8cdf6de6f6d132cb6d`](https://github.com/archeism/plugnz/commit/54a628ca53e593df1eab0c8cdf6de6f6d132cb6d), based on `db1021e8d2e867daa19aae3380c813f531527438`.

## What was verified

The native probes load emitted files into real released harnesses. A loopback provider supplies controlled model responses: request a harmless file read, finish, and finish again if a Stop hook requests continuation. Fresh context markers originate in real command-handler processes. Retained provider requests establish when the native harness actually delivered each marker. These are native integration checks with synthetic model responses; they do not use live model inference or measure model quality.

The portable runtime and generated wrappers are also exercised independently of a harness. Native results and contract tests are separate evidence: a passing wrapper test alone is not presented as native consumption.

## Automated checks

| Check | Result |
| --- | --- |
| `bun test test/hooks.test.ts test/hook-build.test.ts test/command-hooks.test.ts test/omp-hooks.test.ts test/pi-hooks.test.ts test/opencode-hooks.test.ts test/semantic-inventory.test.ts` | 80 passed, 339 assertions, no failures. |
| `bun run check` | Passed. |
| `bun run build` | Passed. |
| `node test/hook-node-smoke.mjs` | Passed on Node 22.23.1. Builds all six targets with an empty `PATH`, removes the authored package, and executes an emitted runtime plus handler. |
| Full repository suite | **991 passed, 6 skipped, 0 failed; 7,133 assertions across 99 files.** Fresh immutable archive of `a25b05ab338843de7b98113c382408a650e793ae`, Bun 1.4.3 / Node 22.23.1, UID 65534 with zero capabilities; 206.10 seconds. [Suite receipt](../test/hooks-suite-results.json). |

The independent reviewer used a different model (`gpt-6.1-sol`) and an immutable `git archive` checkout of the production candidate. It reproduced all 80 focused tests, typecheck, build, and the plain-Node distribution smoke, and found no actionable production defect. It also checked the OMP/Pi raw request sequence and active-stop receipts. Command-host native checks are a separate verification lane.

## Suite environment and crash-fixture correction

The first full run used UID 0 and Bun 1.4.2. Its 19 failures came from fixtures that use `chmod` to deny writes. An immutable baseline at `db1021e` failed the exact same 19 tests; those nine test files and the dependency lock were unchanged. Running the same 19 candidate tests with UID 65534 and zero capabilities passed all 19, with 147 assertions, using the same Bun version.

The first isolated CI-runtime attempt accidentally selected system Node 20.19.2. It is retained as a failed setup attempt: 13 failures required supported Node 22/SQLite, and one was the crash-test timing issue below. The corrected environment uses the existing Node 22.23.1 binary and a separately acquired official Bun 1.4.3 binary, leaving global runtime installations alone.

The corrected pre-repair candidate run passed 990 tests, skipped six, and failed only the dcode cache-rename crash fixture. The unchanged baseline passed both that focused test and its full suite (934 passed, six skipped), so the remaining failure is not described as a reproduced baseline failure. Inspection identified an unsynchronized observation window: a parent `fs.watch` callback can arrive after the child has already performed committed cleanup.

The separate test-only repair [`a25b05ab338843de7b98113c382408a650e793ae`](https://github.com/archeism/plugnz/commit/a25b05ab338843de7b98113c382408a650e793ae) holds the interrupted child immediately after the **real** cache rename returns. The parent still verifies candidate bytes, registry identity, prior bytes, the applying journal, and recovery by a fresh CLI. It additionally requires the child's actual exit signal to be `SIGKILL`; the bounded preload timeout cannot count as a successful crash. No dcode production code changed.

The repaired focused test passed with 13 assertions on CI's Bun 1.4.3 and packed Node 22.23.1. The independent reviewer reproduced it from the immutable repair commit on Bun 1.4.2 and packed Node 22.23.1, also with 13 assertions each. The final full suite on the exact repair commit passed all 991 executed tests, with six named skips and no failures. The [suite receipt](../test/hooks-suite-results.json) binds the complete result, immutable source and runtime hashes, preserved failed attempts, and both focused repair modes.

## Native runs

| Harness | Baseline | Native observation | Receipt |
| --- | --- | --- | --- |
| Claude Code | 2.1.285 | Native plugin loader consumed compiled output. Startup on first request; pre/post context after a real Read; one Stop continuation; active Stop returns `{}`. Three requests; all 12 checks passed. | [Command receipt](../test/native-hook-probe-commands-results.json) |
| Codex | 0.161.0 | Generated command envelopes pass the adapter suite. Native untrusted run retained; trusted consumption and native plugin-loader activation remain unverified because normal trust review was blocked. | [Command receipt and blocker](../test/native-hook-probe-commands-results.json) |
| OMP | 18.8.7 | Startup on first request; pre/post context after a real read; one Stop continuation; active Stop returns `{}`. Baseline: two requests. Context case: three. | [OMP/Pi receipt](../test/omp-hooks-native-results.json) |
| Pi | 1.1.0, `@earendil-works/pi-coding-agent` | Same lifecycle sequence, with post context in the tool result. A separate native fixture confirms preservation of original structured content and details. Baseline: two requests. Context case: three. | [OMP/Pi receipt](../test/omp-hooks-native-results.json) |
| OpenCode | 1.19.0 | Two sessions in one server; startup before each first request; pre/post context plus original read result in each next request; one observed idle check per session. Four total requests. No cross-session context was observed. | [OpenCode receipt](../test/native-hook-probe-opencode-results.json) |
| ZCode CLI | 0.16.9 | Native plugin loader, real Read, startup/pre/post context, one Stop continuation, then active Stop returns `{}`. Three requests; all 12 checks passed. | [Command receipt](../test/native-hook-probe-commands-results.json) |

OMP's context appeared as user messages through the synthetic OpenAI-compatible provider. Pi startup, pre-tool, and Stop feedback appeared as user messages; post-tool feedback appeared in tool messages. These observed roles are provider-specific and do not create a portable system/developer-role guarantee.

OpenCode's Stop result is deliberately narrower: the native idle event supports an asynchronous check, not a completion gate or a feedback continuation. The native probe returned `{}` at Stop. Feedback/continuation rejection and built-in/MCP result shapes are covered by adapter tests.

## Codex approval boundary

The command-adapter suite includes Codex normalization, output envelopes, error handling, and Stop guards. The live untrusted attempt used native user hook configuration referring to the actual compiled wrapper; it emitted no hook events. Its attempted file read also encountered a nested sandbox setup error. This is retained as a negative/setup result, not a trusted consumer pass or a native plugin-loader pass.

Normal native review then stopped at **Folder access → Trust and continue**. Automatic approval review rejected that action because it would persist a folder-trust decision while the review scope disallowed trust-store edits. The UI was closed without granting folder trust or hook trust. The exact four generated command definitions and the rejection are in the command receipt.

The pending approval is narrowly scoped to the following disposable project and profile, followed by normal native review of only the generated `SessionStart`, `PreToolUse`, `PostToolUse`, and `Stop` definitions:

- Project: `/root/workspace/plugnz-context-hooks-20261012-evidence/commands/codex-20261012T171120-3455e9/project`.
- Profile: `/root/workspace/plugnz-context-hooks-20261012-evidence/commands/codex-20261012T171120-3455e9/profile`.
- Generated package: the sibling `built/codex` directory.

The TUI review also exposed a probe-resource error: native marketplace caching grew beyond its declared 64 MiB budget. The final command lane occupied approximately 139 MB, of which approximately 133 MB was downloaded cache. That attempt is explicitly inadmissible as a bounded success. The corrected opt-in TUI script has a before-launch size gate, a periodic disk monitor, and a terminal log cap. Its default budget refuses the already larger retained profile; a future attempt must declare a budget that includes existing storage. No further native attempt was run.

## Reproduce

These scripts are opt-in integration probes. They require the specified native runtime and create new evidence directories; they are not part of the normal `bun test` suite.

```sh
bun run build
node test/hook-node-smoke.mjs

python3 test/omp-hooks-native-probe.py \
  --harness omp --omp-bin /absolute/path/to/omp \
  --evidence /absolute/new-evidence/omp

python3 test/omp-hooks-native-probe.py \
  --harness pi --pi-runtime /absolute/isolated-pi-1.1.0-install \
  --evidence /absolute/new-evidence/pi

python3 test/omp-hooks-native-probe.py \
  --harness pi --pi-runtime /absolute/isolated-pi-1.1.0-install \
  --structured --evidence /absolute/new-evidence/pi-structured

python3 test/native-hook-probe-opencode.py \
  --repo /absolute/plugnz-checkout \
  --runtime /absolute/isolated-opencode-1.19.0-install \
  --out /absolute/new-evidence/opencode
```

See each receipt for exact runtime entry hashes, emitted artifact hashes, invocation paths, request counts, resource measurements, and qualifications. The command-host script is self-contained apart from its native runtime prerequisites; its exact invocations are recorded with its receipt. Codex review remains a separately gated opt-in step.

## Retained evidence and failed attempts

Raw evidence is retained at `/root/workspace/plugnz-context-hooks-20261012-evidence` on the probe machine. It includes authored fixtures, generated artifacts, native stdout/stderr, hook inputs, provider requests, and outcome receipts. Large separately acquired runtimes are not duplicated in git.

The completed native attempts are also archived as `native-evidence-20261012.tar.gz` at that root: 447 entries, 10,910,160 logical file bytes, 1,026,842 compressed bytes, SHA-256 `495d4120e6be6d5365bbbb2114b9ffd78d41e9fc1843b8d0924a5c5848374a5f`. The [archive receipt](hooks-native-evidence.json) identifies the file manifest and explicit runtime/cache exclusions. All included native writers and listeners had stopped before archiving.

- Pi's first baseline reached both expected model requests, then exited with `SIGXFSZ` under the 1 MiB native-file limit. The next attempt disabled Pi's optional Node compile cache and passed under the same limits. Both attempts are retained.
- Claude Code's first command probe aborted in Bun before any hooks or provider requests. The successful correction kept the read-only `bwrap` boundary and supplied private `/tmp`, `/dev`, and `/proc` mounts. Both attempts and the rejected unsandboxed alternative are retained.
- The initial full suite's failure log is retained at `verification/full-suite-01.log`; the exit status is recorded separately from the surrounding process wrapper.

The raw suite logs preserve failed setup attempts as well as the final gate. The test-only repair and native probe corrections are recorded as verification work, not as evidence of a model-performance improvement.

## Practical limits

The native runs cover successful file reads, startup context, and the documented Stop behavior. They do not establish identical behavior for every tool failure, resume mode, model provider, parallel tool batch, remote MCP transport, or child-agent session. Adapter tests and cited native source cover additional mappings, but these are not labeled as extra native probe passes.

Pi was tested on v1.1.0 using the current package namespace; earlier 0.73.x results are not used as evidence for this implementation. ZCode evidence concerns CLI 0.16.9, not an untested desktop version.

The existing plugin installation admission gates and native trust decisions remain in force. Native hook compilation does not imply that every generated package is admitted by every version of the separate `add`/`update`/`sync` lifecycle. See the [public hook contract and native map](hooks.md).
