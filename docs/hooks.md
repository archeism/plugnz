# Portable context hooks

One definition runs command handlers across Claude Code, Codex, OMP, Pi, OpenCode, and ZCode. Handlers receive the same JSON input and return optional context. The host adapter translates the lifecycle event and delivers that context through the harness’s native API.

`plugnz install` detects `plugnz.hooks.json`, compiles the package for the selected harnesses, and registers the generated files with their native plugin or extension loaders. The authored package remains the recorded source for future updates. Native version, capability, and trust checks still apply; the installer reports a capability it cannot activate.

## Author one hook package

Create `plugin.json` with a plugin identity:

```json
{ "name": "my-context-hooks", "version": "0.0.1", "description": "Context for coding agents" }
```

Create `plugnz.hooks.json` beside it:

```json
{
  "version": 2,
  "hooks": {
    "session.start": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"], "requires": { "context": true } }],
    "turn.stop": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"] }],
    "tool.before": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"] }],
    "tool.after": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"], "requires": { "context": true } }]
  }
}
```

Create `context.mjs`:

```js
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const event = JSON.parse(raw);

const context = {
  "session.start": "Context supplied by a portable startup hook.",
  "tool.after": "Context supplied after this tool completed.",
}[event.event];

console.log(JSON.stringify(context ? { context } : {}));
```

Each command is an executable plus literal arguments, not a shell command. `${PLUGIN_ROOT}` is expanded in each argument to the generated package’s directory. The working directory is the agent’s project directory. Commands may run a check, gather information, or do both; write one JSON result to stdout and diagnostics to stderr. Empty stdout means `{}`. Nonzero exit status, malformed output, timeout, and unsupported result fields are reported as errors.

Use `tools: ["Read", "read"]` on a tool handler to select exact native tool names. Omit `tools` to match every tool delivered by that harness. Names and tool argument/result schemas stay native; the runtime does not guess equivalence between tools.

The default command timeout is 10 seconds. `timeoutMs` accepts 1–60,000 milliseconds. Combined stdout and stderr are bounded to 1 MiB per handler. Matching handlers run in declaration order and their context is joined with blank lines. The POSIX runtime terminates a timed-out handler’s process group.

## Declare required effects (configuration version 2)

Use configuration `version: 2` to declare the context effects each handler may return. The installer compares these requirements against the selected adapter's version-specific evidence **before activating that package on that target**. The explicit `hooks build` command uses the same effect comparison and refuses unsupported output rather than publishing a partial build.

| Handler declaration | Contract |
| --- | --- |
| No `requires`, or `{}` | Checks only; no nonblank context or continuation result. |
| `"requires": { "context": true }` | Context may be returned on startup or tool events. |
| `"requires": { "context": true, "continue": true }` at `turn.stop` | Feedback may request one more native pass. |

`false` is equivalent to not declaring that effect. A declaration requires the **ability** to use an effect, not a nonempty result on every invocation: a context-capable handler may always return `{}` when there is nothing to add. Requirements are checked for each handler; one handler cannot borrow another's declaration. In version 2, an undeclared effect is rejected at runtime before it is delivered, even on a capable target. The handler itself has already run, so this is not an operating-system sandbox or a rollback of its side effects.

Stop context and continuation must be declared together, because the portable contract has no passive Stop context slot. Continuation is invalid on all other events. Unknown effect keys, nonboolean values, and unknown configuration versions are rejected. The existing context/continuation output validation, timeouts, and Stop recursion guard still apply.

For example:

```json
{
  "version": 2,
  "hooks": {
    "turn.stop": [{
      "command": ["node", "${PLUGIN_ROOT}/check.mjs"],
      "requires": { "context": true, "continue": true }
    }]
  }
}
```

This package is supported by the evidenced Claude Code, Codex, OMP, Pi, and ZCode routes. OpenCode refuses it because its asynchronous idle callback cannot provide these effects. An OpenCode Stop handler returning only `{}` remains supported. Unsupported combinations report `capability.unsupported`; an unknown runtime or missing effect evidence reports `capability.unverified`. Refusal does not disable or replace a previously active package. Independent target routes may still succeed; use the complete per-target report rather than interpreting a nonzero exit as "nothing changed."

### Version 1 compatibility

Existing `version: 1` packages retain their behavior and still reject the new `requires` field. They do not receive static per-handler effect guarantees: the existing native output checks apply when they execute. To migrate, change the configuration version to 2 and add declarations for every effect a handler can return. No handler rewrite is required. The command's **stdin protocol remains `HookInput.version: 1`** and its result remains `{context?, continue?}`; configuration and event-protocol versions are independent.

These are capability requirements, not a guarantee that failing context retrieval will stop the harness. Native approval, execution permissions, failure handling, request timing, and subagent scope remain as documented below.

## Install

Inside the authored package, run:

```sh
npx plugnz install
```

The current directory is the default source. Without `--target`, installation uses the existing detection of active native writers. A detected target that cannot consume the package receives an explicit unsupported or unverified result; the installer does not silently narrow selection to the six hook adapters. To install another local package or a supported repository source, supply it explicitly. Use `--target` to choose harnesses:

```sh
npx plugnz install ./my-hook-package --target claude-code --target pi
```

`install <source>` uses the same lifecycle as `add <source>`. Compilation happens in the target's staging area before activation. Handlers run when the harness emits their events; installation does not execute them. Updates start from the recorded authored source and compile again. Updating a Pi package preserves an existing extension registration's position and exact settings bytes when its membership is unchanged. Native enablement and hook trust remain native decisions.

Claude Code, Codex, OMP, and ZCode use their native plugin stores. Pi receives an owned extension package registered in its extension settings. OpenCode receives an owned package and a native plugin loader file. The Pi and OpenCode routes support portable hook packages for install, update, and remove; their `sync` route is unsupported. Ordinary standalone skill/command distribution remains excluded.

### Inspect compatibility without claiming runtime proof

```sh
npx plugnz install --dry-run --json
```

The existing lifecycle report now includes an optional, separately versioned `verification` envelope, also emitted after an actual install. Each row references a reported desired operation by `operationId`:

```json
{
  "verification": {
    "schemaVersion": 1,
    "operations": [{
      "operationId": "<operation from the lifecycle report>",
      "compatibility": "admitted",
      "registration": "not-checked",
      "executionApproval": "not-checked",
      "delivery": "not-observed"
    }]
  }
}
```

The facts are deliberately separate:

- `compatibility`: `admitted` for an operation that passes its checks; explicit capability refusal is `unsupported` or `unverified`; other failures are `unknown`.
- `registration`: `not-checked` in a dry run, `verified` after successful native installation/readback, and `unknown` on a failed or unattempted operation. `unknown` does not mean that an existing registration was removed.
- `executionApproval`: always `not-checked` here. Registration does not prove native hook trust, and install does not create an approval decision.
- `delivery`: always `not-observed` here. Only a separate native runtime probe can establish that context reached a model request. This is not a claim that delivery failed or that the adapter has never been tested.

Native version queries during preflight can create housekeeping paths: the tested Codex creates temporary launch helpers, and OpenCode creates empty data/configuration directories even for `--version`. Dry-run does not activate hook registrations or alter an existing active configuration; it is not a claim of zero filesystem activity from native executables.

The envelope describes **this command's evidence**, not a runtime-health monitor. Command-global failures with no planned operation remain in the normal report summary. It adds no handler execution, model requests, or additional source/configuration mutation. Human output includes the same status distinctions.

The lifecycle report remains schema version 1 with this additive optional envelope. Readers using strict validation must update to the parser that understands it; older reports without the envelope still validate. The explicit `--legacy-json` compatibility output is unchanged. The validator rejects duplicate/missing verification rows or claims inconsistent with the actual reported outcomes, including invented approval or delivery results.

## Build and load explicitly

`hooks build` remains available when you want to inspect or distribute the generated native artifacts. From a checkout:

```sh
bun bin/plugnz.mjs hooks build ./my-hook-package \
  --target claude-code --target codex --target omp \
  --target pi --target opencode --target zcode-cli \
  --out ./generated-hooks

bun bin/plugnz.mjs hooks targets
```

The installed CLI uses the same commands without `bun bin/plugnz.mjs`: `plugnz hooks build …` and `plugnz hooks targets`. Both return JSON. The output directory must be absent or empty and outside the source tree. The portable manifest must be a regular file; readable and dangling manifest symlinks are rejected before reading. Each target gets its own subdirectory. The compiler preserves the authored source, checks collisions before publishing, and includes a standalone `hook-runtime.mjs`; generated hooks do not call a globally installed plugnz binary.

Load generated output through the native harness:

| Target | Native entry point |
| --- | --- |
| Claude Code | `claude --plugin-dir /absolute/generated-hooks/claude-code` |
| Codex | Generated `.codex-plugin/plugin.json` and `hooks/hooks.json`; use the native plugin registration and exact hook trust review. |
| OMP | `omp --extension /absolute/generated-hooks/omp/extension.mjs` |
| Pi | `pi --extension /absolute/generated-hooks/pi/extension.mjs` |
| OpenCode | Add the absolute file URL of `opencode/plugin.mjs` to the native config’s `plugin` array. |
| ZCode CLI | Generated `.zcode-plugin/plugin.json` and `hooks/hooks.json`; load through the official CLI’s native plugin route. |

For command-hook harnesses, Node must be available to the native hook process. Handler executables must also resolve in that process’s environment. Native enablement, trust, and permissions still apply.

The compiler translates a root `plugin.json` containing `name`, `version`, and `description` into native command-hook metadata. Root manifest fields beyond those identity fields are refused, even when a native manifest also exists. Move other declarations into the appropriate native manifest and remove the unsupported root fields before compiling. Codex’s competing root manifest is removed only in the generated package so its native hook loader is selected. Authored custom hook routes and generated-file collisions are refused.

## Contract

```ts
type HookEvent = "session.start" | "turn.stop" | "tool.before" | "tool.after";

interface HookInput {
  version: 1;
  event: HookEvent;
  harness: string;
  cwd: string;
  sessionId?: string;
  reason?: string;
  tool?: {
    name: string;
    id?: string;
    input?: unknown;
    output?: unknown;
    isError?: boolean;
  };
  stop?: { active: boolean };
}

interface HookResult {
  context?: string;
  continue?: boolean;
}
```

`session.start` means the adapter can supply context before the next agent prompt. Startup/resume/new-session distinctions are reported in `reason` only when available. OpenCode initializes lazily before the first model request and caches by session ID within the plugin instance; it does not treat plugin factory creation as a session.

Tool handlers execute at the native before/after boundary. Context is consumed by a later model request; returning pre-tool context does not cause the model to reconsider an already selected call before that call executes. Post-tool failure coverage differs by harness and is listed below. The tool error flag follows the native harness's interpretation; a tool may return a failed shell command's output without marking the tool invocation itself as an error. Inspect the native result when that distinction matters. Missing native identifiers and native metadata remain absent.

### Stop is explicit

Returning `{}` runs the check and lets the turn settle. Feedback at stop must request continuation:

```js
const result = event.stop.active
  ? {}
  : { context: "Additional context for a final pass.", continue: true };
console.log(JSON.stringify(result));
```

The portable contract requires nonblank context and `continue: true` together at `turn.stop`. It rejects passive stop context, continuation without feedback, continuation from another event, and a repeated continuation when `stop.active` is already true. This limits the adapter to one feedback continuation per chain. A handler should return `{}` when no further work is needed.

`continue: false` means this handler does not request continuation; it does not veto another handler or native queued work. Input replacement, tool denial, permission changes, and configured subagents are outside this result contract.

OpenCode supports an asynchronous stop check returning `{}`. Its idle notification cannot deliver stop feedback or hold the current turn open. Returning feedback/continuation there produces a diagnostic. It is not a synchronous completion gate, and process shutdown may interrupt asynchronous checks.

## Native map

`plugnz hooks targets` exposes supported configuration versions (`configVersions: [1, 2]`), the native event, baseline version, context/continuation capabilities, and delivery timing from the adapter registry.

| Harness baseline | `session.start` | `tool.before` | `tool.after` | `turn.stop` |
| --- | --- | --- | --- | --- |
| Claude Code 2.1.285 | `SessionStart` → additional context | `PreToolUse` → additional context | `PostToolUse`, `PostToolUseFailure` → additional context | `Stop` → block with feedback and continue |
| Codex 0.161.0 | `SessionStart` → developer context | `PreToolUse` → additional context | `PostToolUse` → additional context on success | `Stop` → block with feedback and continue |
| OMP 18.8.7 | `session_start` → context-only custom message | `tool_call` → native additional context after the batch | `tool_result` → native additional context after the batch | `session_stop` → native continuation with context |
| Pi 1.1.0 | `session_start` → context-only custom message | `tool_call` → queued custom message after the batch | `tool_result` → appended text; original structured content preserved | `agent_before_settle` → message draft plus native continuation |
| OpenCode 1.19.0 | `experimental.chat.system.transform` → per-session startup context | `tool.execute.before` → context delivered with the result or next request | `tool.execute.after` → append to built-in or MCP result on success | `session.idle` → asynchronous check only |
| ZCode CLI 0.16.9 | `SessionStart` → additional context | `PreToolUse` → context appended with tool results | `PostToolUse`, `PostToolUseFailure` → additional context | `Stop` → native continuation with context |

These are explicit implementation baselines, not a promise that every earlier/later version or desktop surface has identical behavior. Native hooks that are skipped by the harness cannot be manufactured by this layer. In Claude Code, `EndConversation` bypasses pre/post tool hooks. Hook propagation into subagents remains a native harness policy; this layer does not promise identical child-agent scope.

## Evidence and implementation

- Runtime and schema: `src/hooks.ts`.
- Compiler and public map: `src/hook-build.ts`, `src/hook-cli.ts`.
- Native translation: `src/hosts/*-hooks.ts`.
- Contract and generated-wrapper checks: `test/hooks.test.ts`, `test/hook-build.test.ts`, `test/command-hooks.test.ts`, `test/{omp,pi,opencode}-hooks.test.ts`.
- Version-2 admission, reporting, and native regression results: [effect requirement verification](hooks-requirements-verification.md).
- Initial native runtime receipts and exact commands: [hooks verification](hooks-verification.md).
- Automatic installation and real Gemini runs in fresh Docker containers: [live verification](hooks-live-verification.md).
- Reproduction helpers and image recipes: [real-model cleanroom](../test/cleanroom/README.md).

Primary native contracts:

- [Claude Code hooks](https://code.claude.com/docs/en/hooks).
- [Codex released hook engine](https://github.com/openai/codex/tree/979011409de0a60b52f179721948e65531d26144/codex-rs/hooks) and [current plugin loader](https://github.com/openai/codex/blob/0c7362d121d1c7f69540262425fd4e2209fd8e8d/codex-rs/core-plugins/src/loader.rs).
- [OMP shared events](https://github.com/can1357/oh-my-pi/blob/f261ed9faf16b61880b544f599876bface4ded0d/packages/coding-agent/src/extensibility/shared-events.ts).
- [Pi v1.1.0 extension types](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/extensions/types.ts) and [boundary consumer](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/agent-session.ts).
- [OpenCode plugin API](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/plugin/src/index.ts) and [tool dispatch](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/session/tools.ts).
- [ZCode hook contracts](https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/contracts/src/hooks/index.ts) and [stop consumer](https://github.com/zai-org/ZCode/blob/aac4755666d09fdcd70272fcf063c077a639015f/apps/zcode-cli/packages/core/src/runtime/methods/turn-stop.ts).
