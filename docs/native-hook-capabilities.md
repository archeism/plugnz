# Native hook capabilities: first batch

Research checkpoint, 2026-10-12. Scope chosen by Charles: **Claude Code, Codex, OMP, Pi, OpenCode, and official ZCode CLI**. Personal supplies the target inventory; plugnz owns the proposed native installation/adaptation. No orchestration runtime is required.

## Recommendation

**Abstract the event and its accepted effects separately.** Receiving an event does not establish permission to deny a tool, revise its input, replace its output, continue a turn, or stop execution.

Start with one command receiving normalized session-entry JSON and returning:

```json
{"context":"Information the agent should receive when entering this session."}
```

Native config or an extension/plugin shim translates the result. Successful startup context delivery is demonstrated across all six, including cold resume. This does not establish uniform context authority, required-context failure enforcement, or an already implemented plugnz installation route.

Next candidates are **deny a selected tool call** and **change execution arguments**. Both have a native mechanism in the inspected contracts across the six, but must be admitted by exact runtime, tool family and mode. Native effect probes now qualify harmless Read paths on OMP, Pi, OpenCode and ZCode. Claude actions remain documentation-qualified, and Codex actions beyond startup remain source-qualified.

Result replacement, native approval requests, explicit approval, stop continuation and teardown are optional capabilities. Do not force them into one universal `allow`/`block`/`continue` field.

## Evidence scope

- **P**: a real native runtime was exercised and the effect observed at execution or the receiving model request. Synthetic responses replaced the provider; no live model inference was used.
- **S**: pinned implementation and its consumer were inspected; this effect was not executed by our fixture.
- **D**: current official documentation, checked on the research date; not a version-pinned control-effect runtime pass.
- **Not mapped**: the native event/result path does not supply that effect, or its route remains unqualified. Arbitrary extension code may have other imperative APIs.

| Harness | Native evidence version | Action-contract source |
| --- | --- | --- |
| Claude Code | 2.1.285 | Current official hooks documentation; original startup/Read lifecycle receipts |
| Codex | 0.161.0 | `979011409de0a60b52f179721948e65531d26144` |
| OMP | 18.8.7 | `f261ed9faf16b61880b544f599876bface4ded0d`; pinned files byte-match installed source |
| Pi | 0.73.1 | `781152fc24841dc54b22284514604048ebe5e2c9`; pinned docs match installed docs |
| OpenCode | 1.19.0 | `733b2c627e5aec39cb33cc22373bdce33053ef2c` |
| Official ZCode CLI | 0.16.9 | `aac4755666d09fdcd70272fcf063c077a639015f`; Node 26.7.0 used, source declares 24.14.0 |

ZCode evidence is observed behavior on this build/runtime, not certification for the declared Node release. This is the official terminal CLI, distinct from Desktop, Web and the historical community CLI.

Personal inventory: [harnesses.yaml](https://github.com/archeism/personal/blob/af8ddb5da101a083ed09eb2545d7c63e77f7cd44/deploy/harnesses.yaml). Priority is Charles's explicit selection, not a ranking inferred from registry order.

## 1. Startup context: common effect, different placement

| Harness | Native binding used by the proven path | Receiving role | Qualification |
| --- | --- | --- | --- |
| Claude Code | `SessionStart` additional context | User | P: fresh and cold resume |
| Codex | Trusted synchronous `SessionStart` additional context | Developer | P: fresh and cold resume; untrusted-definition control does not run |
| OMP | `session_start` fetch/cache plus `before_agent_start` prompt addition | System | P: fresh and cold resume |
| Pi | `session_start` calls `sendMessage(..., {deliverAs:"nextTurn"})` | User | P: fresh and cold resume |
| OpenCode | Awaited plugin factory plus `experimental.chat.system.transform` | System | P: fresh and cold resume |
| ZCode CLI | `SessionStart` additional context | User | P: fresh and cold resume |

Previous delayed-nonce and omit-context fixtures establish startup delivery. New action cases below are fresh sessions; they do not extend resume coverage to every new effect.

User, developer and system content differ in authority. The portable result should promise a text contribution before the relevant request and disclose native placement; it should not promise a uniform system-message privilege.

Lifetime matters too. A native history message, a prompt contribution reconstructed on later turns, and a cached startup value are different. Present probes do not qualify warm in-process session switching, reload, compaction, forks or multi-session server lifetime. OpenCode plugin initialization is instance/workspace-scoped, so one plugin construction cannot stand in for every session start.

OMP and Pi's `session_start` returns void. The proven paths pair/call other native extension facilities. Pi also offers a `before_agent_start` system-prompt result in source; that alternative was not the route tested above.

**Required-context failure is a separate capability.** Awaited successful delivery does not establish refusal to proceed after a hook failure. Codex's pinned startup consumer accepts `continue:false` to prevent that turn's sampling while retaining supplied context. OMP/Pi generally report ordinary callback errors and continue. ZCode's startup consumer uses additional context, not generic block flags. Claude startup exit-code behavior and generalized JSON stop fields require their own control-effect qualification before promising a strict startup veto.

Sources: [previous startup report][startup], [expanded native receipts][expanded], [Codex turn consumer][codex-turn], [Codex context insertion][codex-runtime], [OMP session][omp-session], [Pi contract][pi-docs], [OpenCode dispatch][oc-plugin], [ZCode hooks][z-hooks], [ZCode turn][z-turn].

## 2. Allowed effects by event

P entries below are narrow: fresh native CLI cases, one harmless built-in Read invocation, normal completion. They do not certify all tools, MCP calls, code-mode subcalls, interactive approval or failure paths.

| Intended effect | Claude Code | Codex | OMP | Pi | OpenCode | ZCode CLI |
| --- | --- | --- | --- | --- | --- | --- |
| Add startup context | P | P | P | P | P | P |
| Deny selected tool execution | D | S: reason required | P | P | P: throw before execution | P |
| Change execution arguments | D | S: rewrite protocol | P: returned replacement | P: in-place mutation | P: in-place mutation | P: returned replacement |
| Request native approval from pre-tool hook | D | Unsupported in PreToolUse | No native ask result | No native ask result | Not qualified on inspected path | S: subject to mode/UI |
| Explicitly approve from pre-tool hook | D: policy constraints | Unsupported in PreToolUse | No approval result | No approval result | Not qualified on inspected path | S: cannot override deny/alwaysAsk |
| Replace model-visible result body | D: valid output shape | S: reject/feedback, not general structured replacement | P | P | P for Read body | No replacement field |
| Add separate tool context | D | S: developer context | S | No direct result field | No direct before/after context field | P: appended to result |
| Request continuation at Stop | D | S | P | No native Stop return effect | No native idle-event return effect | P |
| Observe orderly teardown / cleanup | P | S | P | P | S: instance dispose only | No process SessionEnd hook |

An imperative API or a later message may supply a separate adapter feature. It must not silently inherit the semantics of a missing native event result.

### Permission decisions are three separate powers

Codex's `PreToolUse` accepts `permissionDecision:"allow"` only with `updatedInput` as a **rewrite protocol**, not permission approval. Bare allow, ask and unsupported pre-tool stop fields fail open in the pinned parser; deny requires a nonempty reason. Denial suppresses rewrites. Concurrent rewriting hooks use the last result to finish. [Parser][codex-parser], [event implementation][codex-pre], [consumer][codex-tools].

OMP/Pi's `block:false` only declines that hook's veto. OMP runs native approval checks after argument changes. Pi can build extension dialogs, but this is not a native permission-result enum; no-UI confirmation returns false. [OMP wrapper][omp-wrapper], [Pi contract][pi-docs].

ZCode can upgrade an allowed call to ask, or allow an ordinary ask. Pre-tool allow cannot override an existing deny or alwaysAsk requirement. [Consumer][z-permission].

OpenCode declares a `permission.ask` callback type, but its inspected permission service does not dispatch that plugin callback. The Read pre-hook accepts arguments and an exception path, not an allow/ask result. A type alone is insufficient approval evidence. [Types][oc-types], [permission service][oc-permission], [tool consumer][oc-tools].

### Argument editing differs across harnesses

| Harness | Mutation and composition detail |
| --- | --- |
| Claude Code | D: replace the complete input object; permissions evaluate revised input. |
| Codex | S: allow-plus-updatedInput rewrite; last completed rewrite wins unless denied. |
| OMP | P/S: returned replacement works; source revalidates model-issued calls and reruns native approval. Last replacement wins; handlers see original normalized input. Computer-call replacement excluded. |
| Pi | P/S: mutate shared event.input; later handlers see earlier mutations. Source explicitly does not revalidate after mutation. |
| OpenCode | P: mutate properties of existing output.args. Rebinding output.args was ineffective for tested Read. Other tool families need qualification. |
| ZCode CLI | P/S: returned updatedInput is normalized and validated before permission evaluation and execution. |

Pi's positive case kept the original model path in execution-start arguments and assistant history despite reading the alternate file. OMP updated those recorded arguments as well as execution. OpenCode's next request's historical assistant arguments and native tool-state input still showed the original model path. Post-hook arguments, file-access witness and display path proved the alternate file was executed. Do not infer execution from historical model arguments or promise every transcript field is rewritten.

Some OpenCode MCP-resource helper arguments are parsed before pre hooks; ordinary MCP result shapes also differ. A Read pass does not certify every tool. [Consumers][oc-tools].

### Post-tool effects change a later view, not past side effects

The Pi/OMP/OpenCode positive cases recorded the actual alternate Read result, replaced its model-visible body with a fresh hook nonce, then observed the nonce in the correlated next tool message. Original/alternate content was absent from that message.

This does not imply redaction from logs, UI, metadata or durable history. OpenCode stdout retained the actual alternate contents in preview/display metadata despite the model-visible replacement. OMP retained original display metadata in unchanged result details.

ZCode appended independent pre/post context markers to the actual result. Its contract has no post-tool replacement field, and the consumer reads additional contexts only. [Assembly][z-call], [budgeted append][z-result].

Codex exposes result rejection/feedback rather than general structured replacement. `decision:block` returns an error to the model and rejects a nested code-mode call. `continue:false` changes model-visible processing while preserving the original result for other consumers; it does not abort the native turn at this consumer. [Post implementation][codex-post], [consumer][codex-tools].

Claude Code's PostToolUse follows success; failures use PostToolUseFailure, and EndConversation skips both pre/post hooks. Its post-hook block adds feedback beside the original result. The inspected Codex consumer also gates PostToolUse on success. [Claude reference][cc], [Codex consumer][codex-tools].

Do not promise one post callback per pre callback. Denial, invalid input, missing tools or native permission rejection can return before post interception. Denied Pi/OMP cases still emitted tool_execution_start/end, despite no watched-file access and no tool_result interception. Those event names did not prove execution.

### Stop and SessionEnd have different permitted results

A continuation request, ending a turn and shutting down a session are separate actions.

- OMP's actionable event is awaited session_stop, not notification-only agent_end. One new continuation produced a third request containing the hook nonce in user content, then stop_hook_active=true. Source caps the continue:true route at eight consecutive continuations, but decision:block bypasses that cap in 18.8.7. This event applies to the main agent and is fenced against abort/disposal.
- Pi agent_end has no native return effect. An extension follow-up message is a separate action.
- OpenCode session.idle is an observer dispatched without awaiting its promise, not a native stopping veto. experimental.text.complete edits a completed text part; that is not a Stop-continuation contract.
- ZCode's new case continued exactly once in the same session/turn, with stopHookActive false then true. Source requires continuation context and caps these continuations at three.
- Codex's source turns block+reason into continuation input. At Stop, continue:false ends the turn and overrides continuation.

Orderly teardown allows cleanup, not a restart or shutdown veto. OMP runs shutdown handlers concurrently with two-second individual budgets. Pi also emits shutdown for reload/new/resume/fork transitions. OpenCode dispose concerns an instance, not permanent conversation closure. ZCode's process-hook enum has no SessionEnd. None promises cleanup after hard process death.

Sources: [OMP session][omp-session], [OMP dispatch][omp-runner], [Pi types][pi-types], [Pi dispatch][pi-runner], [OpenCode dispatch][oc-plugin], [text consumer][oc-processor], [ZCode Stop][z-stop], [Codex turn][codex-turn], [Codex teardown][codex-end].

## 3. Execution rights and returned effects

There are two meanings of “allowed to do”:

1. The hook program may read files, fetch information, run subprocesses or call extension APIs within its actual process permissions.
2. The harness accepts particular result fields as context, denial, edits or continuation.

A successful fetch does not prove context delivery. A writable filesystem does not supply a permission override. The input's permission-mode label does not describe the hook process's OS sandbox.

Codex's command runner launches a shell from a session environment snapshot with restricted-name filtering, separately from model tool execution. OMP/Pi/OpenCode extensions run inside their runtime. User/project trust, managed policy and containing process restrictions still matter. [Command runner][codex-command], [admission][codex-discovery], [extension contract][pi-docs].

An awaited async JavaScript function is distinct from a background-hook setting. Background completion cannot retroactively deny execution or supply context before an already sent request. Failure policies vary: OMP tool-call callback failures block, while ordinary callback failures generally continue; ZCode records configured-hook failures and continues aggregation. Pi lacks an equivalent generic handler timeout in the inspected runner. [OMP][omp-runner], [Pi][pi-runner], [ZCode][z-runner].

## 4. Minimal portable contract

Keep the first public surface small: **one executable, normalized event input, one event-specific result**.

Normalize common metadata: event, harness, session ID, cwd and native tool-call ID where present. Keep native tool names and argument/result schemas rather than inventing a universal tool schema. Transcript paths, turn IDs, reasons and mode labels remain optional or unknown.

Name intended effects separately: addContext; denyTool; requestApproval; approveTool; replaceToolInput; replaceModelOutput; rejectModelOutput; continueTurn; stopTurn; orderly teardown observation/cleanup.

These are research names, not a released API. Permit only applicable event results. Returning nothing preserves native behavior; it never means unconditional approval.

Do not silently drop an effect the author requires. Intent must be explicit enough for installation admission to reject unsupported effects; unexpected unsupported runtime results need visible errors too. Choose the authoring declaration with implementation, rather than guessing an opaque command's possible stdout.

Evidence needs runtime/version, native route, event, effect, tool/mode scope, placement, waiting/lifetime, failure behavior and evidence level. Preserve native ordering/aggregation unless a stronger adapter contract is actually implemented and tested.

### Expected adapter effort

These are engineering judgments about native adaptation, not delivery estimates or installed support:

| Target / effect | Relative effort and remaining work |
| --- | --- |
| Claude Code, Codex, ZCode startup context | Small command/result translation. Qualify the actual installed versions, trust/admission, native output envelope and session-entry reasons. |
| OMP / Pi startup context | Small extension shim, with more lifecycle care: invoke the shared command at entry, then use the appropriate prompt/message facility and preserve its placement/lifetime. |
| OpenCode startup context | Moderate shim. Use the awaited model-request transform with session identity and explicit cache/entry rules. Instance initialization alone does not cover a long-lived multi-session server. |
| Tool denial / argument change | Moderate adapters across six: native tool schemas, mutation method, validation, permission rechecks and requested/effective input all vary. |
| Result effects / Stop control | Target-specific optional adapters. Distinguish append, replacement and rejection; only expose native continuation where its consumer exists. |
| SessionEnd | Weakest shared promise: orderly cleanup where available. ZCode lacks the event; OpenCode disposal has a different scope. |

For the context MVP, define delivery relative to the first model request of a supported entry path. A handler that obtains context should be awaited there. Report unknown entry reasons as unknown; do not infer warm-resume or exactly-once behavior from the cold-process fixtures. Admission tests must cover the entry paths plugnz actually promises.

Implementation sequence:

1. Install and qualify SessionStart context through plugnz on these six, including the relevant resume/session-replacement cases.
2. Add deny and argument-change adapters, preserving native validation and permissions.
3. Add result replacement/rejection and bounded continuation where supported.
4. Add teardown observation as an explicitly weaker orderly-exit capability.

## 5. Native capability is ahead of plugnz installation

At plugnz base 890e03b169a301f256223a19abd340d03485f845, hook inventory describes declarations, events, handlers, matchers and some execution facets. It does not describe returned action semantics. [Inventory][inventory], [evidence][capabilities].

| Route | Current installation gap |
| --- | --- |
| Claude Code | Projected semantics omit hooks. |
| Codex | Managed semantics omit hooks; shared projection rejects Claude hook metadata. |
| OMP | Projected semantics omit hooks; extension effects need explicit projection. |
| ZCode CLI | Root hook metadata refused; hooks absent from admitted semantics. |
| Pi / OpenCode | Old standalone distribution retired; selected native extension/plugin routes need adapters/evidence. |

Sources: [Claude][cc-writer], [Codex][codex-writer], [OMP][omp-writer], [ZCode][z-projection], [profiles][consumers], [conversion][conversion].

Installer versions differ: Codex writer pins 0.162.0 while the native probe used 0.161.0; Claude managed releases are 2.1.275/2.1.295 while the probe used 2.1.285. Native passes do not automatically widen admission.

Agent Plugins 1.0.0 defines skills/MCP as its portable core (§7), not hooks. This is an explicitly owned plugnz adaptation, with namespaced extension packaging under §8, not an existing conformance guarantee. [Specification §§5.2, 7, 8](https://agent-plugins.org/specification).

## 6. Native action probes and reproducibility

All new cases ran on Charles's remote machine with retained native runtimes, a bounded loopback provider fixture and fake credential. Controlled local files were the requested tool data. No packages installed, native source patches, global credential/trust changes or added permission-bypass modes.

| Runtime | Fresh cases | Effect checked |
| --- | ---: | --- |
| Pi | 3 | Baseline; redirected Read + model-result replacement; deny |
| OMP | 3 | Same, plus exactly one Stop continuation in positive case |
| OpenCode | 4 | Same three, plus ineffective whole-object rebinding control |
| ZCode CLI | 3 | Baseline; redirected Read + pre/post context + one Stop continuation; deny |

Kernel file-access witnesses and actual next-request bodies supplement hook journals. Denial requires no watched-file access and a correlated error receipt. Replacement requires actual alternate-file execution before substitution, then the new output in the receiving message.

Accepted cohort: 13 fresh cases. OMP's first attempt failed before hooks/requests because its disk scan raced a transient SQLite file; retained as apparatus failure. ZCode retained a prelaunch syntax failure, with no native launch. Neither is counted as a runtime failure.

Fixtures bound wall time, requests/body bytes, attempts and disk growth; preserve failures/snapshots; close owned processes/listeners. ZCode retains plan mode and private-root isolation; native source represents plan as build plus planEnabled. CPU/RSS/wall figures are scoped observations, not benchmarks; synthetic usage is not real token consumption.

- [OMP and Pi reproduction/results](research/native-hook-capabilities/omp-pi/README.md)
- [OpenCode reproduction/results](research/native-hook-capabilities/opencode/README.md)
- [ZCode CLI reproduction/results](research/native-hook-capabilities/zcode/README.md)
- [Integration evidence](research/native-hook-capabilities/EVIDENCE.json)
- [Independent review](research/native-hook-capabilities/INDEPENDENT-REVIEW.md)

The final probe-runtime-boundaries skill was used unchanged: SHA-256 5440bd6e8ed63cc588153bfbb94f62a54df3939dc3609f619fad47123124fa81. This is another use of the method, not a measured skill improvement.

## Sources

Claude Code D cells use the [official hooks reference][cc]: SessionStart, PreToolUse decision control, PostToolUse decision control, Stop decision control and SessionEnd. They are not new control-effect passes on 2.1.285. Historical startup receipts remain in their original research location; that location is not an architecture dependency.

[cc]: https://code.claude.com/docs/en/hooks
[startup]: https://github.com/archeism/oh-my-ai/blob/fda5314ac1678504872c8fed659ea732aabd89ed/labs/harness-hooks-probes/README.md
[expanded]: https://github.com/archeism/oh-my-ai/blob/fda5314ac1678504872c8fed659ea732aabd89ed/labs/harness-hooks-probes/round2/README.md
[codex-parser]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/hooks/src/engine/output_parser.rs
[codex-pre]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/hooks/src/events/pre_tool_use.rs
[codex-post]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/hooks/src/events/post_tool_use.rs
[codex-tools]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/core/src/tools/registry.rs
[codex-turn]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/core/src/session/turn.rs
[codex-runtime]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/core/src/hook_runtime.rs
[codex-end]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/core/src/session/handlers.rs
[codex-command]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/hooks/src/engine/command_runner.rs
[codex-discovery]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/hooks/src/engine/discovery.rs
[omp-session]: https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/session/agent-session.ts
[omp-runner]: https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/extensions/runner.ts
[omp-wrapper]: https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/extensions/wrapper.ts
[omp-types]: https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/shared-events.ts
[pi-docs]: https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/coding-agent/docs/extensions.md
[pi-types]: https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/coding-agent/src/core/extensions/types.ts
[pi-runner]: https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/coding-agent/src/core/extensions/runner.ts
[oc-plugin]: https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/plugin/index.ts
[oc-types]: https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/plugin/src/index.ts
[oc-tools]: https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/session/tools.ts
[oc-permission]: https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/permission/index.ts
[oc-processor]: https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/session/processor.ts
[z-hooks]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/runtime/methods/hooks.ts
[z-turn]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/runtime/methods/turn.ts
[z-stop]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/runtime/methods/turn-stop.ts
[z-permission]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/tool/executor/hook-flow.ts
[z-call]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts
[z-result]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/tool/executor/result-serialization.ts
[z-runner]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/hooks/runner.ts
[z-types]: https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/contracts/src/hooks/index.ts
[inventory]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/semantic-inventory.ts
[capabilities]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/capability-evidence.ts
[cc-writer]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/hosts/claude-code-writer.ts
[codex-writer]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/hosts/codex-writer.ts
[omp-writer]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/hosts/omp-writer.ts
[z-projection]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/hosts/zcode-cli-projection.ts
[consumers]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/consumer-profiles.ts
[conversion]: https://github.com/archeism/plugnz/blob/890e03b169a301f256223a19abd340d03485f845/src/conversion.ts
