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
  "version": 1,
  "hooks": {
    "session.start": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"] }],
    "turn.stop": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"] }],
    "tool.before": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"] }],
    "tool.after": [{ "command": ["node", "${PLUGIN_ROOT}/context.mjs"] }]
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

## Install

Inside the authored package, run:

```sh
npx plugnz install
```

The current directory is the default source. Without `--target`, installation uses the existing detection of active native writers. A detected target that cannot consume the package receives an explicit unsupported or unverified result; the installer does not silently narrow selection to the six hook adapters. To install another local package or a supported repository source, supply it explicitly. Use `--target` to choose harnesses:

```sh
npx plugnz install ./my-hook-package --target claude-code --target pi
```

`install <source>` uses the same lifecycle as `add <source>`. Compilation happens in the target's staging area before activation. Handlers run when the harness emits their events; installation does not execute them. Updates start from the recorded authored source and compile again. Native enablement and hook trust remain native decisions.

Claude Code, Codex, OMP, and ZCode use their native plugin stores. Pi receives an owned extension package registered in its extension settings. OpenCode receives an owned package and a native plugin loader file. The Pi and OpenCode routes support portable hook packages for install, update, and remove; their `sync` route is unsupported. Ordinary standalone skill/command distribution remains excluded.

## Build and load explicitly

`hooks build` remains available when you want to inspect or distribute the generated native artifacts. From a checkout:

```sh
bun bin/plugnz.mjs hooks build ./my-hook-package \
  --target claude-code --target codex --target omp \
  --target pi --target opencode --target zcode-cli \
  --out ./generated-hooks

bun bin/plugnz.mjs hooks targets
```

The installed CLI uses the same commands without `bun bin/plugnz.mjs`: `plugnz hooks build …` and `plugnz hooks targets`. Both return JSON. The output directory must be absent or empty and outside the source tree. Each target gets its own subdirectory. The compiler preserves the authored source, checks collisions before publishing, and includes a standalone `hook-runtime.mjs`; generated hooks do not call a globally installed plugnz binary.

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

`plugnz hooks targets` exposes the native event, baseline version, context/continuation capabilities, and delivery timing from the adapter registry.

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
