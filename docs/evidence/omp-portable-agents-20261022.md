# OMP native portable agents — qualification 2026-10-22

Base: `636aa91` plus the OMP slice working tree recorded by
[the hash manifest](omp-portable-agents-20261022.json). Scope: portable-agent
projection into OMP's native extension-package `agents/*.md` lane, native child
execution, and the public install/update/remove lifecycle. No model-quality
benchmark, paid provider call, or runtime abstraction.

## Decision context

[The route investigation](../research/portable-agent-parity-20261022/omp-cursor.md) chose the existing
native extension-package route. [The native fallback policy](https://github.com/archeism/plugnz/issues/104#issuecomment-6345606404)
resolved as **preserve native policy**: plugnz passes the exact resolved model
and the harness owns availability. Charles additionally approved normal native
parsing in the implementation session: **plugnz preserves generated prose, and
the harness parser may trim/normalize/comments; verify meaningful instructions
and disclose the exact behavior, with no patched runtime.**

## Projection

`projectOmpAgents` resolves portable agents with the shared
`planPortableAgents(root, 'omp')` precedence (explicit destination > user alias >
package alias > omitted field), overwrites the staged `agents/<name>.md` files
with native Markdown carrying `name: "<plugin>:<agent>"`, drops the
`plugnz.agents.json` sidecar from the package root, and leaves the immutable
`.plgnz/source` snapshot intact. No `tools` field is emitted; native defaults
apply. Plain native `agents/*.md` packages without the sidecar keep their
existing (refused) behavior, and mixed portable-agent/portable-hook packages
stay refused.

Namespace choice was proven, not assumed: installed OMP 18.8.7
`parseAgent`/`parseAgentFields` accepts the colon form, matches agents by exact
string, and only rejects the bare `main`/`sub` sentinels — a namespaced
`<plugin>:main` is valid. Discovery deduplicates first-wins across extension
roots, so the namespace prevents a silent collision with user or bundled agents.

## Native parser semantics (installed OMP 18.8.7)

Source: `/root/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent`
(`package.json` version `18.8.7`; binary sha256
`2a1f0be0d536031830c2de5abc1a0f7f06948e7c3fdcb77542ef70cba3497481`).
`task/agents.ts:parseAgent` calls `parseFrontmatter` with defaults
(`normalize: true`, `repair: true`) and builds `systemPrompt` from the result.
A direct probe of those modules recorded:

| Case | Observed native behavior |
| --- | --- |
| `name: "demo-plugin:reviewer"` | accepted; identity preserved exactly |
| `name: "main"` / `"sub"` | rejected (`Invalid agent field`); `demo-plugin:main` accepted |
| body with leading/trailing blank lines | `systemPrompt` is `.trim()`ed |
| CRLF body | normalized to LF |
| `<!-- comment -->` in body | stripped from the delivered prompt |
| interior spaces/tabs/newlines | preserved verbatim |
| `model: "context-probe/child-explicit"` | parsed as one-element model list |
| omitted `model` | absent; parent/default selection applies |
| JSON-quoted description with quotes/backslash/colon | round-trips unchanged |
| leaked `modelAlias`/`models` keys | ignored by the native parser (still stripped by projection) |

The probe source and raw results are retained outside Git
(`parser-probe.ts`, `parser-results.json`).

### Prose contract

Generated `agents/*.md` files contain the authored body byte-for-byte after the
closing frontmatter delimiter (asserted in the public lifecycle test and in the
native probe). The native runtime then applies its ordinary parser: the child
receives the authored body with surrounding whitespace trimmed, CRLF normalized
to LF, and HTML comments removed. This is uniform OMP behavior — bundled agents
go through the same parser — and the qualification verifies that meaningful
interior prose arrives intact. No runtime shim or byte-patching is added.

## Actual native child execution

Method: public `plugnz install` into an isolated `HOME`, then the real pinned
`omp` binary (`omp/18.8.7`) against a loopback OpenAI-compatible fixture that
registers the `context-probe` provider through a session extension. Task
blocking was enabled (`async.enabled: false`) and the model was scripted to
call the native `task` tool once per discovered agent. The fixture served nine
requests: five parent turns and four native child turns.

| Agent | Mapping | Generated `model` | Actual child request model | Prose in child prompt |
| --- | --- | --- | --- | --- |
| `reviewer` | package alias overridden by user alias | `context-probe/user-alias` | `user-alias` | exact trimmed body |
| `explicit` | explicit destination mapping over alias | `context-probe/explicit` | `explicit` | exact trimmed body |
| `packaged` | package alias only | `context-probe/pkg-alias-fast` | `pkg-alias-fast` | exact trimmed body |
| `unspecified` | omitted field | absent | parent `probe-model` | exact trimmed body |

Every child request carried the normal native tool list (`read`, `bash`,
`edit`, `write`, `eval`, `glob`, `grep`, `task`, `wait`, `web_search`, `yield`)
— no tool allowlist or restriction was projected. The parent's native `task`
tool description advertised the four namespaced agents with their authored
descriptions. The probe's 41 assertions include generated-file bytes, namespaced
names, per-child model/prose/tools, absence of portable metadata, and process /
listener cleanup. Full request bodies are retained outside Git.

`reviewer` demonstrates user alias > package alias, `packaged` demonstrates
package alias > omitted, and `explicit` demonstrates explicit mapping over both
alias levels.

### Model policy disclosure

The mapped value is passed through unchanged. The four requests above delivered
exactly that value because the fixture provider catalog defines those models.
OMP still owns model availability: its resolver can substitute under native
policy when a requested model is unavailable (documented in issue #104's
resolved comment, including `authFallbackUsed` resolver evidence gathered
separately). This qualification makes no strict-selection promise beyond
"the exact resolved value reaches the native request", and adds no runtime
bypass.

## Public lifecycle checks

`test/omp-portable-agents.test.ts` (15 tests) uses the public CLI with a fake
native version probe:

1. Install projects namespaced agents, resolves all four precedence levels,
   removes the sidecar, keeps the private source snapshot, and records the
   enabled lock row; a dry run leaves the store absent.
2. Unchanged re-add, same-version body update (byte-exact generated output),
   alias-only update, source rename (stale file removed), and retirement remove
   only the owned package while a foreign plugin directory, lock row, and shared
   lock settings survive.
3. A redirected native `node_modules` link fails ownership revalidation on
   remove and leaves the installed bytes and lock untouched.
4. An unowned managed slot is refused without changing the store; an edited
   installed agent payload refuses both update and remove while preserving the
   edited bytes; user-scope, user-configured-extension, and other-marketplace
   namespace collisions refuse without touching existing content, while a
   disabled package no longer counts as a collision. MCP pinning is an
   authorized mutation: install → pin → update → remove all succeed.
5. A forced activation failure (`after-old-move`) during update restores the
   prior package bytes and lock row.
6. `18.1.4` and `18.10.3` refuse portable agents with
   `is unsupported for agents` and create no store content.
7. Plain native agent packages and mixed portable-agent/portable-hook packages
   are refused.
8. Portable agents coexist with ordinary skills in the same extension package.

The capability profile adds `portable-agents` admission only for `18.8.7`
(`install`, `update`, `retire`, managed route) with `agents: supported` on top
of that release's existing qualified semantics. Older/newer OMP profiles keep
`agents: unsupported`, so they fail closed rather than inheriting this proof.

## Owned-configuration protections

The managed route now refuses instead of silently replacing:

- **Unowned slot.** An existing `~/.omp/plugins/plgnz/<slug>` without a valid
  plugnz marker, or one whose marker names another plugin/package, is refused
  before activation. The legacy direct writer path keeps its original refusal.
- **Edited owned payload.** Every generated marker records the payload
  fingerprint plugnz wrote. Update/install/remove re-fingerprint the installed
  package (excluding the marker) and refuse on any mismatch, preserving the
  edited bytes. Historical markers without a recorded projection are left
  verifiable only by their link/marker ownership, so upgrades of pre-existing
  installs are not blocked.
- **Authorized mutations.** The payload fingerprint is finalized after every
  authorized staging mutation: lifecycle pins re-record it in `applyPins`, and
  the direct `pin` entry point validates the ownership proof before mutating
  and refreshes it after, so pinning never masquerades as an edit.
- **Namespace collisions.** Before staging, the generated `<plugin>:<agent>`
  identities are compared against native user-scope agents
  (`~/.omp/agent/agents`), persisted user `extensions:` directories from
  `~/.omp/agent/config.yml`/`config.yaml` (legacy `settings.json` only when no
  YAML config exists, matching native precedence), and the native-enabled
  packages in `~/.omp/plugins/node_modules` (dependencies plus lock rows,
  minus disabled or stale entries — disabled packages cannot collide). A match
  refuses the install and leaves the existing content untouched. This covers
  the same plugin name installed from a different marketplace, which the
  namespace alone cannot distinguish because native discovery is first-wins.
  The plugin's own managed root is excluded so ordinary updates converge.
  Relative `extensions:` entries and project-scope `.omp` configuration resolve
  against the harness session cwd and are not install-time observable; that
  remains the disclosed session-relative limitation.

## Reproduction

```sh
# Native qualification (bounded loopback fixture, no paid calls)
python3 test/omp-native-agents-probe.py \
  --evidence /root/.local/state/plugnz-omp-portable-agents-20261022/native-run7 \
  --omp-bin /root/.bun/bin/omp

# Focused public lifecycle suite
bun test test/omp-portable-agents.test.ts

# Regression checkpoint used for this evidence
bun test test/omp-lifecycle.test.ts test/omp-lifecycle-adapter.test.ts \
  test/omp-native-upgrade.test.ts test/omp-hooks.test.ts \
  test/omp-portable-agents.test.ts test/portable-agents.test.ts \
  test/conversion.test.ts test/claude-portable-agents.test.ts \
  test/zcode-portable-agents.test.ts test/codex-agents.test.ts \
  test/codex-native-agents-public.test.ts
bun run check
```

## Retained evidence and resources

Raw artifacts stay outside Git under
`/root/.local/state/plugnz-omp-portable-agents-20261022/`; hashes are pinned in
[the manifest](omp-portable-agents-20261022.json). The retained run is
`native-run7` (earlier `native-run1..6` directories are debug iterations or
pre-fix runs and are not evidence).

Native run resources: wall 2.67 s; sampled peak native RSS 476,988 KiB; child
CPU 2.84 s user / 0.36 s system; evidence tree 3,487,048 bytes; 9 loopback
requests; zero live inference. Provider token counters are synthetic fixture
values, not billed usage.

Final focused checkpoint after review fixes: 37 OMP tests passed (including
the 15 public lifecycle/protection tests), zero failures; the wider checkpoint
above ran before the protection repairs.
Every file in this OMP slice typechecks cleanly; the repository-wide
`tsc --noEmit` at hand-off reports errors only in the concurrent OpenCode slice
(`src/hosts/opencode-agents.ts`, `test/opencode-portable-agents.test.ts`), which
is outside this slice. The full suite and build belong to the integration
checkpoint.

## Limitations

- Qualification applies to the exact installed `omp/18.8.7` and the managed
  extension-package route only. ACP/editor surfaces were not exercised.
- Native parsing normalizes prose as described above; HTML comment text inside
  an authored body is not delivered by OMP.
- Native model substitution remains the harness's policy; only exact-value
  delivery was observed with registered models.
- No paid model calls; the fixture is deterministic and bounded.
- Skills unchanged; no model-quality or performance claim.
