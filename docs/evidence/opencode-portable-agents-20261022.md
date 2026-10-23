# OpenCode native agent qualification — 2026-10-22

Base: `636aa91` (milestone 2 portable-agent delivery; implementation in this
change set). Scope: install a portable-agent package through the public CLI,
discover the roles through OpenCode's native plugin `config(cfg)` hook, run an
actual native `task` child per model-precedence variant, and preserve the
existing hook package behavior. This is integration qualification, not a
model-quality benchmark.

## Native contract

Pinned runtime **OpenCode 1.19.0** (`opencode-ai@1.19.0`, binary SHA-256
`135ac3f86c43f2a22328a3554fec5f0bc57d71576077902661bc38dac34871fd`, upstream
source `anomalyco/opencode@733b2c627e5aec39cb33cc22373bdce33053ef2c`).

`Config.get()` loads the global config directory and then
`ConfigPlugin.load(dir)` discovers `{plugin,plugins}/*.{ts,js}`; every plugin's
`config?.(cfg)` hook runs before `Agent.state` caches agents (`Config` →
`Plugin.state` ordering). Plugnz installs the generated module inside the
existing owned hook package and exposes it with the existing owned loader
`<config>/plugins/plugnz-<key>.js`; no user config file is edited.

`config(cfg)` assigns `<plugin>:<agent>` entries under `cfg.agent`:

- `prompt: agent.body` — the authored bytes are carried through
  `JSON.stringify` into the generated module and returned unchanged. Unlike the
  Markdown agent loader (`prompt: md.content.trim()`), the config hook performs
  no trim/normalization. Leading blank lines, interior indentation and trailing
  newlines reach the child request system message exactly.
- `model: <provider>/<model>` only when resolution produced a value
  (`models.opencode` > user alias > package alias). Omission leaves `model`
  absent so `TaskTool` inherits the invoking assistant message's provider/model.
  Model strings are validated as non-empty `<provider>/<model>` before install;
  bare names, `inherit` and whitespace/newlines refuse.
- `mode: 'subagent'` — the role appears in `GET /agent` with `native: false`.
- No `tools` or `permission` keys: the child keeps OpenCode's ordinary native
  tool set and only its standard subagent denies; plugnz adds no tool policy.
- Registration is atomic per package: every planned role is checked for a
  built-in or existing `cfg.agent` entry before any mutation, and the hook
  throws instead of overwriting.

OpenCode catches `config` hook errors (`plugin config hook failed`) and keeps
starting, so the visible refusal is duplicated at install time: user config
`agent`/`mode` names (JSON/JSONC), user Markdown agents/modes (filename and
frontmatter name), and another owned package claiming the `<plugin>` namespace
or the same role all refuse before mutation. Project-local config is outside the
global preflight; the runtime guard then fails loudly in OpenCode's log without
partially registering.

## Actual public installation and execution

`plugnz install <source> --target opencode --json` into an isolated home
installed `portable-review@local` (`converged`, `changed: true`) and wrote the
owned package plus loader. The probe then started the real server
(`opencode serve`, version 1.19.0) against a loopback OpenAI-compatible
provider. `GET /agent` returned all five roles with `mode: subagent`,
`native: false`, the exact prompt bytes and the resolved model (or no model).

Actual native child runs were triggered by the assistant calling OpenCode's own
`task` tool with `subagent_type: portable-review:<role>`. Captured child HTTP
requests (14 loopback requests total, **zero paid requests**):

| Role | Resolution | Child `model` | Child tools |
| --- | --- | --- | --- |
| `portable-review:explicit` | explicit `models.opencode` wins | `explicit-model` | bash, edit, glob, grep, read, skill, webfetch, write |
| `portable-review:user-alias` | user alias wins over package alias | `user-alias-model` | same native set |
| `portable-review:package-alias` | package alias (no user mapping) | `pkg-only-model` | same native set |
| `portable-review:omitted` | no mapping | `parent-model` (inherited) | same native set |
| `portable-review:unavailable` | mapped to an undeclared model | native failure, no request | — |

Each successful child request asserted:

- the first system message starts with the authored body bytes (sentinel,
  `\"  preserved indentation\"` and trailing newlines included);
- `Authorization`-free loopback request with header
  `x-opencode-parent-session-id` equal to the parent session id;
- the child task result `CHILD_OK` reached the parent session history.

The unavailable mapping fails closed with
`Model not found: boundary-probe/nonexistent-model` and produced **zero** child
or fallback model requests. This matches the [native-policy decision][policy]:
plugnz resolves the mapping and discloses that the harness owns availability.

## Lifecycle and regression

The focused public suite `test/opencode-portable-agents.test.ts` (10 tests)
covers unchanged re-add (no writes), same-version body update, alias-only
update (explicit and package aliases untouched), role rename/removal (stale
roles disappear with the single generated module), failed-update activation
restoring the prior package/loader while preserving concurrent unrelated edits,
edited owned loader refusal, modified owned payload refusal (marker
`payloadFingerprint`), foreign user-config/markdown/namespace refusals, mixed
hook+agent refusal, invalid model refusal, unsupported semantics
(`ordinary-skills`), and execution-semantics manifest fields (`hooks`, `mcpServers`,
`agents`, `agent`, `executables`, `extensions`, `commands`, `skills`); inert author
metadata (`author`, `license`, `homepage`, `repository`, `keywords`, `$schema`)
is accepted verbatim. Removal
preserves unrelated plugins, user agents and `opencode.jsonc` byte-for-byte.

Capability admission uses a `portable-agents` profile (`agentPolicy:
portable-native`) on the managed route at exactly 1.19.0. Because the hooks and
agents profiles each mark the other format unsupported, mixed packages refuse.
Hook packages keep the exact historical marker bytes and loader transaction;
the payload fingerprint is only written for `portable-agents` packages, so the
existing hook lifecycle and qualification remain unchanged.

Affected suites, `setpriv --bounding-set=-dac_override,-dac_read_search` (root
otherwise bypasses the permission tests):

```sh
bun test test/opencode-portable-agents.test.ts test/hook-install.test.ts \
  test/opencode-hooks.test.ts test/portable-agents.test.ts \
  test/source-model-aliases.test.ts
# 122 passed, 0 failed
bun test test/claude-portable-agents.test.ts test/codex-agents.test.ts \
  test/codex-native-agents-public.test.ts test/zcode-portable-agents.test.ts \
  test/zcode-native-hooks.test.ts
# 67 passed, 0 failed (existing Claude/Codex/ZCode protections)
bun run check   # no errors in this slice
```

The repository full suite and build are run at the integration checkpoint, not
per delivery.

The probe exits nonzero whenever any assertion or cleanup check is false, after
saving its evidence. This was exercised with a scratch copy of the probe holding
one deliberately wrong expected child model: the run retained
`failure-exercise/` (`summary.json` status `failed`, `child:explicit` false)
and exited 1; the genuine run exits 0.

## Resource evidence and method

Probe run `run-06`: 5.6s wall, 14 loopback model requests, 0 paid requests,
4.7 MB allocated growth over a 66.6 MB setup, child `maxrss` 644,928 KiB.
Native process, process group and both listeners were verified stopped after
the run. Token/cache counters are synthetic fixture values, not measured
inference usage; CPU time and model quality were not measured (unknown, not
zero). The generated package includes the authored tree without
`plugnz.agents.json`, rendered agent Markdown without portable fields, and the
generated `plugin.mjs`. OpenCode must be restarted (or a new instance
bootstrapped) to pick up install/update/remove.

Raw evidence is retained outside Git under
`/root/workspace/plugnz-opencode-agents-20261022-evidence` (`run-06`):
`install.stdout`, `agents.json`, `requests.jsonl`, `child-*-body.json`,
`messages-unavailable.json`, `checks.json`, `summary.json`,
`server.{stdout,stderr}`, plus the isolated home. The companion manifest pins
artifact and implementation hashes:
[opencode-portable-agents-20261022.json](opencode-portable-agents-20261022.json).

[policy]: https://github.com/archeism/plugnz/issues/104#issuecomment-6345606404
