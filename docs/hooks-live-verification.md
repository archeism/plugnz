# Automatic hook installation: real-model verification

This report records the 2026-10-12 validation of portable context hooks installed through the public `plugnz install` command. The tests ran on the owner's remote Linux machine in fresh Docker containers, using real `gemini-3.8-flash` responses through CLIProxyAPI. They are separate from the deterministic native probes in [the initial verification report](hooks-verification.md).

The installer contract is documented in [Portable context hooks](hooks.md). Image recipes and opt-in probe commands are in [the cleanroom README](../test/cleanroom/README.md). Selected receipts are retained in [the evidence directory](evidence/hooks-live-20261012/); full protocol traces and native UI logs remain in the remote run directory because they contain native system prompts and opaque provider payloads.

## What installation now does

An author supplies `plugin.json`, `plugnz.hooks.json`, and executable handlers. Running this inside the authored package installs it:

```sh
npx plugnz install
```

Without explicit targets, the existing native-writer detection chooses the installed harnesses. Unsupported package/target combinations are reported. Use `--target` to restrict the operation to the desired hook adapters.

An explicit source and targets use the same path:

```sh
npx plugnz install ./my-hook-package --target claude-code --target codex \
  --target omp --target pi --target opencode --target zcode-cli
```

The installer identifies the portable manifest, compiles a target-specific package in owned staging, and registers it with the native loader. The recorded source remains the authored package; `update` recompiles it. Installation does not run the handlers.

Claude Code, Codex, OMP, and ZCode use their native plugin stores. Pi uses a native extension registration, and OpenCode uses a native plugin loader file. The Pi/OpenCode routes admit portable hook packages for install, update, and remove. Their `sync` route and ordinary standalone skill/command distribution remain unsupported.

Native enablement, hook trust, and execution permissions remain native decisions. Automatic registration does not establish that a harness has approved execution.

## What the model probes establish

Each fresh project contains a synthetic file whose contents are absent from the user prompt. Hook handlers generate random context markers only when the native event fires. The forwarding recorder passes through actual upstream model responses; it never substitutes model completions.

The probes check these separate properties:

1. The authored package is installed through the public CLI and discovered through native registration.
2. Startup context reaches the first request for the tested task.
3. A native tool reads the fixture, with before/after hooks firing at their corresponding boundaries.
4. Hook context appears in subsequent model input, and the model reports the observed markers.
5. Stop-capable harnesses request one continuation and then settle; OpenCode performs its asynchronous idle check.
6. Extension probes separately verify preservation of original native tool content, independently of the model's final transcription.

The command-hook probes record an inotify witness of the actual file read and require the model to report the exact random file marker; that assertion does not require transcription of the fixture's terminal newline. Extension probes retain the native tool-result structures and their delivery in the next request, with a separate strict final-answer check.

## Results by harness

| Harness | Model protocol | Startup and tool context | Stop | Result |
| --- | --- | --- | --- | --- |
| Claude Code 2.1.285 | Anthropic Messages | Passed | One feedback continuation, then settle | 14/14 checks; 3 real requests |
| Codex 0.161.0 | OpenAI Responses | Passed, including native sandbox read and exact marker recognition | One feedback continuation, then settle | 14/14 checks; 3 real requests |
| OMP 18.8.7 | OpenAI Chat Completions | Passed, including exact file text and marker set | One feedback continuation, then settle | 22 checks; 3 real requests |
| Pi 1.1.0 | OpenAI Chat Completions | Delivery, exact marker set, and raw native tool bytes passed | One feedback continuation, then settle | Final model omitted exactly one terminal LF in its file field; 3 real requests |
| OpenCode 1.19.0 | OpenAI Chat Completions | Passed, including exact file text and marker set | Asynchronous check only | 21 checks; 2 real requests |
| ZCode CLI 0.16.9 | OpenAI Chat Completions | Passed, including native read and exact marker recognition | One feedback continuation, then settle | 14/14 checks; 6 real requests |

OpenCode's idle notification does not hold a turn open or support portable stop feedback. Its passing check does not imply synchronous completion gating.

The Pi qualification is deliberately narrower than a full strict task pass. In the final case, the original `FILE_…\n` bytes were present in the native tool result and the following model request. Gemini reported the correct file marker but omitted its one terminal newline from the JSON string. The original strict receipt remains failed for byte-exact model transcription; the separate qualification permits only that single trailing-LF difference. No additional paid call was made to obtain a cosmetically perfect answer.

Earlier Pi attempts remain retained. One exposed model confusion between original file text and appended hook feedback; a stricter task check caught it. Another exhausted its output allowance on reasoning before completing the visible JSON answer. The final fixture labels feedback explicitly, and the verified proxy allowance was raised from 2048 to 4096 output tokens. These are model-task and test-configuration findings; the native context path was observed in each case.

ZCode passed within its six-request budget. Three intermediate model responses ended with `max_tokens`; native ZCode continued those responses before completing the ordinary turn. The recorded hook sequence still contains exactly one startup, one matched Read before/after pair, and two stop events (`active: false`, then `active: true`). Only the last continuation was requested by the portable stop hook. The final answer contains all context markers and the file marker; the receiving requests independently show when each marker entered context.

### Codex native trust and provider configuration

Final Codex attempt 10 passed all 14 checks in 10.182 seconds with three real model requests and no setup inference. It delivered the startup marker in the first task request, read the fixture through the native sandbox, delivered pre/post context, and performed exactly one stop continuation.

The fresh Codex profile discovered all four generated definitions: `SessionStart`, `PreToolUse`, `PostToolUse`, and `Stop`. Each exact definition was reviewed individually in the ordinary native UI. Before closing the owned setup UI, the test verified that all four were active and that the four exact native approval records were persisted. The installer and probe did not manufacture trust hashes or enable a blanket trust policy.

The owned test profile uses `web_search = "disabled"` so the Gemini Responses adapter receives function tools for the read task. The retained earlier default-web-search attempt returned HTTP 400 for combining built-in search with function calling. That failure is not a hook result, and this test does not establish compatibility for that combination.

Native UI setup has a separate 600-second bound; model execution has a 180-second/six-request cap. In retained attempt 06, setup made three real requests and the task made three, totaling six. The actual task delivered all four context markers and one stop continuation, but the native sandbox could not create a namespace inside the original Docker configuration. Its file read therefore failed. The task-scoped receipt passes 12 of 14 checks; the kernel-read and reported-file checks fail. Session-scoped analysis separates the UI setup session from the tested task without changing the original raw receipt.

Before another model run, a credential-free container probe verified both a successful native sandbox read and a denied write. On this Docker/AppArmor host, that required a container-specific seccomp profile permitting the nested namespace operations and `apparmor=unconfined` for that disposable container. The default seccomp deny action was retained, as were UID 1000, zero capabilities, no-new-privileges, the outer read-only root, and Codex's native read-only policy. No host security profile or sysctl was changed. These are cleanroom container settings; the normal plugin installer does not configure Docker.

Retained attempt 09 passed the native file read and startup/pre/post delivery, but its Stop hook did not fire. That fixture had closed the setup UI immediately after observing four trust confirmations, without verifying durable approval state. The final recipe supplies no automatic approval choices and no automatic UI closure; it checks persisted approvals before ending the owned UI process. Attempt 09 remains failed evidence.

In attempt 06, the native tool returned the original sandbox error as tool output and emitted its post-tool event with `isError: false`. A native tool's error flag is not a portable guarantee that every shell command or check inside it succeeded. Handlers that need that distinction must inspect the native result.

## Candidate identity and regression checks

Final production source: `570e64d4d829d1a7f2480958a4b81da1523a64cb`. The common hook runtime was already present in `d436a15d5eb1105cd963d014cba6dd1d393c222a`. Subsequent fixes repair ZCode discovery/admission and detect installed Pi, OMP, and OpenCode CLIs before a native profile exists.

The final source includes integration commit `11ed2163807774f05524891c13bbf4fbd86c337a`, which merges the owner's concurrent doctor SHA-prefix and YAML undefined-array fixes from main, plus release metadata. The original hook gate, integration gate, ZCode-fix gate, and final production gate are retained separately.

The final candidate tarball is `plugnz-0.0.18.tgz`, built from `570e64d…`. The release workflow owns the subsequent version bump. Its SHA256 is:

```text
e20a0988653aa9ac9becdfa9b1ce1ff151c87e0541d7d48fc76e1b42984fec0f
```

The final full gate ran against an immutable archive of `570e64d…` as UID 65534 with no effective or bounding capabilities and no-new-privileges enabled:

| Gate | Result |
| --- | --- |
| `bun test` | 1037 passed, 6 existing skips, 0 failed |
| Assertions | 7400 across 1043 tests in 100 files |
| `bun run check` | Passed |
| Runtimes | Bun 1.4.3; Node 22.23.1 |
| Full-suite elapsed time | 211.444 seconds |
| Independent production review | Approved, including cold CLI detection and portable-only admission |

The review fixes reject a conflicting historical standalone registration before installation and reject authored native auto-update directives that the portable route cannot project. Codex is detected from its actual CLI before a home configuration exists, and preflight update refusals are reported as not attempted. The ZCode cold test then exposed two concrete omissions: Linux PATH discovery was absent, and a separate projection guard still rejected compiled portable hooks. Both are fixed, with fresh-home public install coverage and preserved refusal of authored native or mixed hook declarations. The final fresh-profile audit also replaced directory-only presence checks for Pi, OMP, and OpenCode with installed-executable discovery. Detection itself does not launch a process or create a profile; explicit binary overrides, selected native roots, and version/admission checks retain their prior authority.

The final source archive SHA256 is `724a4eeab9fa826558e36d4b7f5b196174d7b92328e5d016a9b3956002519216`; its test log SHA256 is `c7cf65ed38ccafadd60065c17fcc66e2da6923794120e8feec98e758ee159512`. Earlier gates passed 1010 tests at `d436a15…`, 1013 at `11ed216…`, and 1021 at `8046dcf…`, each with six skips and zero failures.

Live receipts bind to their actual source candidates:

| Candidate | Production commit | Verified use |
| --- | --- | --- |
| 01 | `0d7d658035b7f144c81f30591fc7293d5900c317` | OMP, OpenCode, first Pi case |
| 02 | `c4577147d5767299856d2f0089865a1c61469f4a` | Claude Code, strict budget-limited Pi case |
| 03 | `d436a15d5eb1105cd963d014cba6dd1d393c222a` | Final Pi, public npx smoke, Codex command cases |
| 04 | `8046dcf5697a2ae468cef20d8201232610c1b523` | ZCode fresh-install and real-model case |
| 05 | `570e64d4d829d1a7f2480958a4b81da1523a64cb` | Cold-home Pi npx installation and automatic selection of all five installed CLIs; no inference |

Changes after candidate 01 affect admission checks, reporting, and cold CLI detection. They do not alter the native hook adapters or context runtime exercised by the earlier passing cases. The report retains those exact candidate bindings instead of claiming every model call used the final tarball.

### Public npx proof

A fresh no-network container invoked the actual candidate tarball with:

```sh
npx --offline --yes --package /opt/plugnz-candidate.tgz \
  plugnz install --target pi --json
```

The working directory was the authored fixture; no source argument was supplied. All five checks passed: process success, correct current-directory source installed, authored source unchanged, native extension present, and no handler execution during installation. This original candidate-03 fixture first created an empty Pi profile directory; it proves installation through npx but does not establish discovery before native profile initialization. The later cold-home proof is recorded separately. Neither smoke test makes inference requests.

Candidate 05 then passed the literal cold-home test with actual Pi 1.1.0: all six checks passed, including an empty home before invocation and no native profile scaffolding. The same `npx --offline --yes --package … plugnz install --target pi --json` path registered the native extension, preserved authored bytes, and did not execute the handler. Its container had no network and was removed with its temporary filesystems. Public CLI regressions additionally cover all six selected targets with never-created profiles, custom native roots, invalid overrides, and unsupported versions.

A further candidate-05 case removed the explicit target selection too:

```sh
npx --offline --yes --package /opt/plugnz-candidate.tgz plugnz install --json
```

From an empty home and the authored working directory, the installer automatically selected exactly the five real CLIs in the image: Claude Code, Codex, OMP, Pi, and OpenCode. All five installations succeeded and converged. All 14 checks passed, including native artifacts and registrations, executed package identity and bytes, default source registration, source preservation, and no handler execution. No native profile was scaffolded before invocation, and the container had no network or credentials. ZCode is outside this image's expected set and has the separate fresh-install/model result above. The container and owned evidence mount were removed after the 5.537-second driver run.

The preceding default-target attempt also installed all five successfully, but its external checker counted Claude Code's local marketplace mirror as a second activated cache package. The final check inspects the package referenced by native registration. Only that checker changed; the failed receipt remains retained, and production/candidate-05 bytes did not change.

## Container and upstream provenance

The five npm-distributed harnesses were acquired inside the image at the exact versions shown above. Their real `--version` commands passed in a fresh home with networking disabled. No host-installed harness binary, agent home, or original working tree was mounted into a runner.

The base is Node 24.21.0 Bookworm slim, pinned to `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`. CLIProxyAPI is the official v8.0.26 release, commit `a27799ec`, with archive SHA256 `252171485fe4c1f3f865ca063176a50f002a071a446f6305e36c456053677c07`.

The official Gemini catalog exposed `models/gemini-3.8-flash`. Three independent preflight calls returned HTTP 200 and their exact requested markers through Chat Completions, Responses, and Anthropic Messages. The proxy exposes only this selected model and has provider retries disabled.

The official ZCode source build completed and produced a standalone CLI reporting `0.16.9` in a fresh, no-network, read-only container as UID 1000 with zero capabilities. The image is `sha256:c7eb1048438b387657deaa7a03314fe219f8f8b0b56ab91ecd473ef8356ddb07`; the ELF binary SHA256 is `b7427cd6e82674d649053bd93dde023910902b80cb6addccabaf31727e00763d`.

ZCode is built from the official source revision `aac4755666d09fdcd70272fcf063c077a639015f`. Fresh Git/codeload retrieval timed out, so the fallback input is a `git archive` of that verified revision from the existing official checkout. The archive excludes the working tree, Git metadata, and installed dependencies. Its SHA256 is `b70fdb32efe83cebcbdd476fd01d945fdd58c936eab1c3b969d159d70fb5b075`. Dependency installation and official SEA packaging run inside Docker. This is cached source provenance with a fresh container build, not a successful fresh network checkout. The builder uses Node 24.21.0; the pinned source requests 24.14.0.

The model containers use UID 1000, dropped capabilities, no-new-privileges, a dedicated bridge network, 4 GiB memory, two CPUs, and at most 256 processes. Home and project directories are temporary in-container filesystems. Command-hook runs used a read-only root filesystem. The retained extension runs did not set Docker's `--read-only` flag; their writable container filesystem was disposable, and their only host bind was the owned evidence directory. The committed reproduction recipe now adds `--read-only`, and the no-network npx recipe smoke verifies that configuration without repeating paid model calls.

Each model case is bounded to six requests, 180 seconds, and 32 MiB of retained evidence. Build-only host networking was needed for public dependency acquisition on this machine; model runners do not use host networking.

Only the proxy received the upstream key through a private configuration mount. Runners received a disposable frontend token. All model runners and the proxy were removed after their cases, and the generated private credential directory was deleted. A check of 482 repository files found no actual runtime credential bytes. The original `~/.air/gemini-api-key` file remains in place.

## Practical limits

These results establish the named Linux CLI versions, native loaders, selected provider configurations, and tested lifecycle paths. They do not establish every earlier or later release, desktop or ACP surfaces, Windows behavior, every tool failure mode, or identical hook propagation into subagents.

A context hook supplies information at a native boundary. Pre-tool context does not rewind a tool call that the model has already selected. A check can return no context. Stop feedback requires explicit continuation where the harness supports it. The [native capability map](hooks.md#native-map) remains the authority for these differences; successful registration alone is not a promise that every result capability exists on every target.
