# Context hooks MVP

Current implementation priority, clarified by Charles on 2026-10-12 after the [native capability research](native-hook-capabilities.md). This note supersedes that report's proposed priority of denial and tool-input editing after startup. The original measurements, report, and verification receipts remain preserved at research checkpoint `f52b335446d88745619dd49e7b4b328cbff13000`.

## Purpose

**Run a handler at session entry or after matching tools, and optionally add its returned information to the agent's context.**

The first uses are loading current context, relaying new information, and running checks or lint with actionable feedback. Tool argument editing, permission decisions, full result replacement and Stop continuation remain secondary capabilities.

Personal supplies the six-target inventory. Plugnz installs the native hooks or extension/plugin shims. Scope remains Claude Code, Codex, OMP, Pi, OpenCode, and official ZCode CLI.

## Reference workload: historical AIR / ALP hooks

Charles identified the old `archeism/air` hooks as the intended kind of use. The concrete reference is commit `436f45a55999d72a4549f57dcb209aabb732a72e`, immediately before the September 2 [archive/disable commit][air-archive]. These are historical requirements examples, not claims about AIR's current installed behavior.

| Historical behavior | Information supplied to the agent | Shared use case |
| --- | --- | --- |
| `alp/scripts/session-start.sh`: active work | Active ARD name/title and the command to resume; different instructions when starting new work | Load a current project/task briefing at session entry |
| Same handler: orientation | MCP tool preferences and discovery, navigation with `air index find`, workflow hints | Tell the agent which project capabilities exist and how to use them |
| Same handler: diagnostics | Invalid/multiple/incompletely attached work state; a freshness warning only when staleness was reported | Give actionable context based on actual local state |
| `alp/scripts/triage-feedback.sh`: after relevant AIR transactions | Query pending local or cloud findings, show up to five with severity/location, and report the remaining count; also report explicit all-clear or query failure | Run a check/query after selected tools and contribute its result |

The startup handler uses `hookSpecificOutput.additionalContext` in its Claude plugin route. The triage handler returns the same context field with the actual triggering event name. It performs a session heartbeat refresh as well; its review lookup uses `air triage-list --pending --read-only --json`, with `--pr` for cloud feedback. Its native registrations select Bash and the four AIR MCP transaction tools; the handler then tests command/tool relevance. The registration file's broad comment about state-file activation is not a reliable description of every handler's applicability. [Startup implementation][air-session] · [Triage implementation][air-triage] · [Registrations][air-hooks].

AIR's [ADR-027][air-pipes] already records the useful architecture: detect the relevant operation, call a domain command, format its response as context. It followed failures caused by reconstructing review state from tool-output strings. For plugnz, the consumer owns context content, state resolution, and checker logic; the shared hook layer owns invocation and delivery through each native harness.

Failure coverage is a concrete requirement from this history. [ADR-029][air-failure] records that `air submit` could exit 2 when findings awaited triage, so a success-only post hook missed precisely the feedback the agent needed. The legacy Claude adapter consequently registers the same handler for both post-success and post-failure events. A shared post-tool contract should expose the outcome and declare each adapter's actual coverage; supported failure routes need their own registration and correct output envelope.

Successful checks may also intentionally return context. ALP's explicit all-clear banner was an observability choice. Keep quiet success available for repetitive lint, while allowing a handler to confirm review status when useful; the abstraction should not force either policy.

The [historical OpenCode adapter][air-oc] demonstrates another delivery route: `tool.execute.after` queues a triage banner; a later message transform appends it as synthetic text to the latest available user message, keeping it queued if no target exists. A separate system transform adds active-ARD context before model requests. Its session-created logging is separate from those prompt contributions. This is source evidence of a previous adapter design, not a fresh runtime proof or a reason to require that exact transport in the new adapter.

The first concrete fixtures should therefore be a project briefing, active-work recovery context, selected-operation feedback, and a targeted lint/check report. The existing small result shape below covers each.

## Small shared surface

The proposed handler receives normalized event/session metadata, plus the native tool name, input and outcome where available. A tool selector can cover selected native names or all calls covered by the chosen native post event. Native argument/result schemas remain native.

It returns an optional context contribution:

```json
{"context":"Lint found two issues in src/example.ts: ..."}
```

An empty result means the handler contributes no context:

```json
{}
```

This is one output shape for both session entry and post-tool feedback. The handler can fetch information or run a check before producing it. The adapter handles native output envelopes and message placement.

Execution and feedback are independently useful: a handler may perform work and return no context. When a check is intended to help the agent fix a problem, return concise findings. A successful check can stay quiet; newly relevant positive information can also be returned when useful.

These names and shapes are proposed authoring semantics, not a released plugnz schema or installed adapter.

## First two triggers

| Trigger | Typical handler | Agent-visible contribution |
| --- | --- | --- |
| Session entry | Load current project context, shared decisions or relevant updates | Initial context before the first request on the supported entry path |
| After selected tools | Run a targeted check after code-editing tools | Findings accompanying or following the completed result, before the next model request |
| After all covered tools | Make a cheap check for newly relevant shared information | Only information worth adding to the next request |

For the first implementation, use foreground/awaited handlers. A background check needs a separate later-delivery mechanism; it cannot contribute to a request already sent. A post-tool contribution does not itself force an additional turn.

A tool-name filter does not prove which files changed. Shell commands and custom tools may also edit files. A checker should use the available native payload and actual project state to choose its scope. No universal "file changed" event or changed-file list is assumed.

A small targeted check after an edit is a reasonable default. Running a full build or repository-wide lint after every read/search generally adds delay and repetitive output. An all-tools hook makes sense for inexpensive context refresh or similarly cheap checks.

## Post-tool context route across the six

| Harness | Adapter route for additive feedback | Existing evidence |
| --- | --- | --- |
| Claude Code | PostToolUse additionalContext | Current official docs; eligible successful calls |
| Codex | PostToolUse additional_contexts inserted as developer context | Pinned source and consuming code |
| OMP | tool_result returns additionalContext through the call context sink | Pinned source and consuming code |
| Pi | Return content containing the existing blocks plus a new text block; leave other fields unchanged | Pinned extension contract; model-visible result mutation already native-probed |
| OpenCode | Append a labeled text section to the existing output.output on the qualified route | Pinned consumer; built-in Read result mutation already native-probed |
| ZCode CLI | PostToolUse additionalContext appended alongside the actual result | Native-probed for built-in Read |

Pi and OpenCode's append behavior is a proposed adapter over their result-mutation facilities. Their lack of a separate additionalContext return field does not by itself exclude this use case. The append recipe must preserve existing output, non-text content and native metadata as applicable. A built-in Read probe does not qualify all tool families or MCP result shapes.

The earlier startup fixtures establish context delivery on fresh and cold-resumed sessions for all six. Warm session switching and instance/server lifetime still require qualification in the actual installation route, especially for OpenCode.

Sources: [original evidence and scope][research], [Claude post hooks][cc], [Codex consumer][codex], [OMP context result contract][omp-types], [OMP consumer][omp-wrapper], [Pi result contract][pi], [OpenCode consumer][oc], [ZCode native context cases][zcode].

## Check results and handler failures

Keep these outcomes distinct:

- **Check passed:** optionally return no context.
- **Check found problems:** capture the findings and return them as context.
- **Handler could not complete:** surface a handler diagnostic with the native timeout/error policy.

A checker returning a nonzero exit code can mean ordinary lint findings. The wrapper should interpret that check result and return the intended hook JSON; blindly forwarding the checker exit code can acquire a different native hook meaning. Reserve stdout for the declared result protocol and keep incidental diagnostics separate.

Keep the existing tool result and its error status. Adding lint findings should not imply that the original tool failed, that permission was denied, or that the agent is forced to repair the findings.

Bound handler runtime and returned context. Return concise actionable output; long checker logs can remain in an explicitly referenced artifact. Size limits, placement, failure behavior and supported tool routes must be qualified in the adapter.

"After all tools" means all invocations covered by the selected native event. Claude and the inspected Codex post-success path omit failed calls; Claude has a separate PostToolUseFailure event, and EndConversation skips pre/post. Other denial/validation paths can also skip post interception. Broader failure coverage must be mapped explicitly.

## First implementation acceptance cases

1. A delayed session handler's fresh context reaches the first model request; an empty-result control adds nothing.
2. A post-tool handler runs a harmless real checker, preserves the native result, and delivers a fresh finding in the next model request.
3. Selected-tool matching runs the checker only where intended; a nonmatching tool leaves behavior unchanged.
4. A successful quiet check does not add feedback. A checker reporting findings remains distinct from a handler failure.
5. The installed route preserves message placement, native result/error data and documented timeout behavior.
6. Where post-failure coverage is promised, an operation reporting findings through a nonzero result still triggers feedback; unsupported failure routes are identified explicitly.

Use the native versions and modes being admitted by plugnz. Existing research passes inform these tests but do not establish an installation route automatically. No additional native runtime cases were run for this priority clarification.

[research]: https://github.com/archeism/plugnz/blob/f52b335446d88745619dd49e7b4b328cbff13000/docs/native-hook-capabilities.md
[cc]: https://code.claude.com/docs/en/hooks#posttooluse
[codex]: https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/core/src/tools/registry.rs
[omp-types]: https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/shared-events.ts
[omp-wrapper]: https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/extensions/wrapper.ts
[pi]: https://github.com/badlogic/pi-mono/blob/781152fc24841dc54b22284514604048ebe5e2c9/packages/coding-agent/docs/extensions.md
[oc]: https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/session/tools.ts
[zcode]: https://github.com/archeism/plugnz/blob/f52b335446d88745619dd49e7b4b328cbff13000/docs/research/native-hook-capabilities/zcode/README.md

[air-archive]: https://github.com/archeism/air/commit/70c37b2e99747b1f42197e98d4633ea02b8d6217
[air-session]: https://github.com/archeism/air/blob/436f45a55999d72a4549f57dcb209aabb732a72e/alp/scripts/session-start.sh
[air-triage]: https://github.com/archeism/air/blob/436f45a55999d72a4549f57dcb209aabb732a72e/alp/scripts/triage-feedback.sh
[air-hooks]: https://github.com/archeism/air/blob/436f45a55999d72a4549f57dcb209aabb732a72e/alp/hooks/hooks.json
[air-pipes]: https://github.com/archeism/air/blob/436f45a55999d72a4549f57dcb209aabb732a72e/docs/adr/027-hooks-are-dumb-pipes.md
[air-failure]: https://github.com/archeism/air/blob/436f45a55999d72a4549f57dcb209aabb732a72e/docs/adr/029-post-tool-use-failure-hook.md
[air-oc]: https://github.com/archeism/air/blob/436f45a55999d72a4549f57dcb209aabb732a72e/alp-opencode/plugin/alp-opencode.ts
