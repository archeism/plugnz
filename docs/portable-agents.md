# Portable agents and model aliases

Author one agent definition and install it through a harness's native plugin loader.
Qualified targets are Claude Code 2.1.285/2.1.296, Codex 0.161.0/0.162.0,
ZCode CLI 0.16.9, OMP 18.8.7, OpenCode 1.19.0 and Grok Build 1.0.46.
Pi deliberately warns and skips portable agents without failing; it is not
qualified for execution. Cursor, Kimi, Hermes and DCode remain unchanged and
explicitly deferred as [owner follow-ups](../tasks/todo.md#owner-deferred-follow-ups).
These targets refuse this format until their native agent projection is qualified.
Codex also projects plain canonical `agents/*.md` with only `name` and
`description`, without a sidecar. Other native packages keep their existing behavior.

## Author a plugin

Keep the regular `plugin.json` manifest. Add `plugnz.agents.json`:

```json
{
  "version": 1,
  "modelAliases": {
    "fast": { "claude-code": "haiku" },
    "smart": { "claude-code": "sonnet" }
  }
}
```

`{ "version": 1 }` is sufficient when the user supplies all mappings, or when
agents should use the harness's normal model selection. This sidecar is a plugnz
authoring extension; it is not a new mandatory Agent Plugins manifest field.

Create `agents/reviewer.md`:

```markdown
---
name: reviewer
description: Review changes for correctness and regressions.
modelAlias: smart
models:
  claude-code: opus
---
Read the change and explain your reasoning. Report concrete defects with evidence.
```

Name, description and nonblank instructions are required. The name matches the
filename and uses lowercase letters, digits and hyphens, starting with a letter.
`modelAlias` and `models` are optional. Plugnz preserves the authored instruction
body in generated definitions. Native loaders may normalize whitespace, line
endings or Markdown comments; qualification records those transformations and
checks the meaningful instructions in actual child requests. This follows the
[owner's native-parsing decision](https://github.com/archeism/plugnz/issues/104#issuecomment-6346091818).
Portable agent metadata deliberately excludes tools, permissions, effort and
runtime settings. The generated definition leaves native tools at their normal defaults.

## Configure shared aliases

Put machine-wide choices in `~/.open-plugin/model-aliases.json`:

```json
{
  "version": 1,
  "modelAliases": {
    "fast": { "claude-code": "haiku", "zcode-cli": "YOUR_PROVIDER/YOUR_FAST_MODEL" },
    "smart": { "claude-code": "opus", "zcode-cli": "YOUR_PROVIDER/YOUR_SMART_MODEL" }
  }
}
```

Replace the ZCode placeholders with configured native provider/model identifiers.
`fast` and `smart` are useful conventions, not built-in model choices. Custom alias
names work identically. Each user mapping overrides only that alias/target entry;
the remaining package defaults survive.

For each agent and destination, resolution is:

1. The agent's explicit `models[destination]`.
2. The selected alias's user mapping for that destination.
3. The selected alias's package mapping for that destination.
4. Omit the generated native `model` field.

An undefined alias or missing destination mapping means omission. Nothing guesses
an equivalent model, copies a different destination's choice, or emits `inherit`.
Plugnz passes the exact resolved value; it never substitutes another model.
The native harness still owns model availability, credentials, account/admin
policy and fallback. A mapped model may therefore fail or be substituted by the
harness; target qualification must disclose that behavior, not promise strict
selection. This follows the [owner's native-policy decision](https://github.com/archeism/plugnz/issues/104#issuecomment-6345606404).
ZCode mappings must use its native `provider/model` or `custom:` encoding.
Bare `haiku`, `sonnet`, `opus`, `main` and `inherit` are rejected because ZCode
treats them as inheritance rather than a specific model choice.

ZCode 0.16.9 uses a limited frontmatter parser. Its adapter preserves quotes and
backslashes with native-compatible quoting and rejects text that cannot survive
that parser unchanged (including literal backslash-n in descriptions, carriage
returns, surrounding description whitespace and certain quote combinations).
Actual multiline descriptions reach the runtime correctly; ZCode's discovery UI
displays their native `\n` escape. Model identifiers must be single-line.

## Install and update

```sh
plugnz install ./my-plugin --target claude-code --target codex --target zcode-cli
plugnz update my-plugin
```

After editing shared aliases, run `update` to apply them. Resolution freezes user
choices into the effective source bytes before fingerprinting and planning. An
alias-only edit therefore triggers an update. Existing frozen sources remain
unchanged; recovery uses the captured choices rather than rereading mutable config.
The source binding/revision retains authored provenance; the source fingerprint
describes effective bytes including local choices. Source files are never edited.
Under test isolation, `OPEN_PLUGIN_HOME/model-aliases.json` replaces the usual path.

Claude and ZCode generated packages contain ordinary native agent Markdown, without
`modelAlias`, `models`, or the portable sidecar. Claude's managed installation route
prevents a native Git refresh from bypassing projection. ZCode's native marketplace
route installs the generated package. Both use their existing update/rollback flow.

Mixed portable-agent/hook packages are refused on qualified native-agent targets.
Pi is the owner-approved exception: it warns, excludes agents and installs only
supported hooks. Native agent metadata without the sidecar remains native on
Claude and ZCode; portable model fields without the sidecar fail validation.
No agent runtime or execution abstraction is added to plugnz.

## OMP native task agents

OMP 18.8.7 discovers generated `<plugin>:<agent>` names through the enabled
native extension package's `agents/*.md`. Explicit `models.omp` and alias
mappings use native OMP model selectors; no mapping emits no model field.
Native task children keep their ordinary tools. OMP may fall back to the parent
model when requested credentials are unavailable. Its parser trims outer
whitespace, normalizes line endings and removes HTML comments; generated files
retain authored body bytes. Do not place required instructions in HTML comments.

Owned payload edits and user/enabled-package agent-name collisions refuse
replacement, including absolute or `~/` persisted user extension paths.
Project agents and relative extension paths are session-relative and may override
the installed definition under native policy. Start a fresh session after changes. See
[OMP qualification](evidence/omp-portable-agents-20261022.md).

## OpenCode native subagents

OpenCode 1.19.0 uses a generated native plugin `config(cfg)` callback to register
`<plugin>:<agent>` definitions. Its task tool executes the children. Resolved
`models.opencode` values use `provider/model`; omission inherits the invoking
parent model. The full prompt survives this route unchanged, and tools remain
native. An unavailable mapped model fails with `Model not found`, without a
fallback request in the qualified version.

User config/name collisions and edited owned payloads/loaders refuse mutation.
The runtime callback also checks project-local collisions before registering any
roles; OpenCode logs its error but continues starting. Restart OpenCode after
install/update/removal. See [OpenCode qualification](evidence/opencode-portable-agents-20261022.md).

## Grok Build native plugin agents

Grok Build 1.0.46 registers `agents/<name>.md` from a trusted marketplace
plugin as `<plugin>:<agent>` subagent types; its `spawn_subagent` tool then
advertises and accepts those namespaced types. Generated definitions keep the
bare authored name because the loader adds the plugin namespace itself.
Resolved `models.grok` values pin the child model when Grok knows that id; an
omitted mapping inherits the parent model, and an unknown mapped id falls back
to the parent model with a warning (native policy, disclosed). A resolved
model whose value is `inherit` (case-insensitive) is refused because Grok treats
it as inheritance rather than a concrete model; multiline model IDs are also refused.
Native children keep their ordinary tools, and the child prompt carries the
authored body with surrounding whitespace trimmed. Plain native
`agents/*.md` without the sidecar, and versions other than 1.0.46, fail
closed. Public `remove` retires the owned marketplace install natively
(plugin, namespaced types, link, and registry row disappear; unrelated plugins
and user configuration survive; mid-removal failures roll back). See
[Grok qualification](evidence/grok-portable-agents-20261022.md).

## Pi: explicit non-failing skip

Pi agent-only packages produce a loud stderr warning, including with `--json`,
and a `skipped` outcome with `ignoredComponents: ["agents"]`. No native agent
registration or installation record is created. Existing supported hooks in a
mixed package remain eligible for installation; malformed definitions and
unrelated unsupported components still fail. Updating an installed mixed package
to agent-only skips the update and retains its previous hooks and ledger unchanged,
reported as `retained-prior`; explicitly remove that installation to retire its hooks. This is the
[owner-approved deferral](https://github.com/archeism/plugnz/issues/101#issuecomment-6346092250),
not a claim of Pi parity.

## Codex native roles

Codex receives `agents/<name>.toml` with `name`, `description`,
`developer_instructions`, and `model` only when resolved. Its model mapping key is
`codex`. Names are scoped to the plugin, such as `addy:code-reviewer`.
The adapter registers each generated file through
`[agents."addy:code-reviewer"]` / `config_file` in `CODEX_HOME/config.toml`.
Original Markdown remains available for resource links. Codex loads the role and
runs its native subagent; plugnz does not implement an agent runtime.

Plain definitions need no portable sidecar or companion command. Alias/model
fields require the sidecar. Arbitrary native TOML input and tools/permissions/memory
metadata are not part of this conversion contract and are refused.

Install, update and removal manage only registrations backed by plugnz ownership.
Existing user roles and edited owned registrations cause a visible refusal, not an
overwrite. Updates rename/retire roles, track versioned paths and repair missing
references. Rollback restores prior references and preserves unrelated user config.
Marketplace refreshes use the managed route when generated roles would be affected.

**Reload Codex after changes.** Native delegation must be available in the harness;
plugnz does not change feature flags or tool permissions. Codex's native plugin
`enabled` flag does not disable these separately registered roles. Use
`plugnz remove <plugin> --target codex` to unregister them. Two marketplaces cannot
claim the same `<plugin>:<agent>` role; the second installation refuses the collision.

Public installation and actual native child execution were verified for both
qualified Codex versions, including all four upstream Addy agents. See
[Codex native qualification](evidence/codex-native-agents-20261022.md).

## Implementation and verification

`src/portable-agents.ts` owns validation, model resolution and common Markdown
serialization. Source resolution captures local configuration; host adapters own
native registration. Capability admission requires an explicit portable-native
profile, so a prompt resource cannot masquerade as a runnable agent.

Tests cover destination-specific precedence, omission, prose preservation,
malformed input, immutable aliases, source fingerprints, native projection and
public lifecycle updates. Native qualification details and limitations are recorded
in the [baseline evidence](evidence/portable-agents-20261022.md) and the
[integrated support matrix and installed-package proof](evidence/native-agent-parity-20261023.md).

The design follows the existing canonical-source/generated-harness-tree pattern
used by [Cursor's pstack generator](https://github.com/cursor/plugins/blob/eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10/scripts/generate-pstack-harness-trees.mjs).
Unlike instructions asking the model to translate a choice, this projection resolves
explicit mappings during installation. This is packaging; execution belongs to the harness.
