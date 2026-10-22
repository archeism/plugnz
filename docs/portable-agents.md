# Portable agents and model aliases

Author one agent definition and install it through a harness's native plugin loader.
Qualified targets are Claude Code 2.1.285/2.1.296, Codex 0.161.0/0.162.0 and
ZCode CLI 0.16.9.
Other targets refuse this format until their native agent projection is qualified.
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

Mixed portable-agent/hook packages are not qualified in this increment and are
refused rather than silently dropping either behavior. Native agent metadata
without the sidecar remains native on Claude and ZCode; portable model fields without the sidecar fail
validation. No agent runtime or execution abstraction is added to plugnz.

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
in [the evidence report](evidence/portable-agents-20261022.md).

The design follows the existing canonical-source/generated-harness-tree pattern
used by [Cursor's pstack generator](https://github.com/cursor/plugins/blob/eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10/scripts/generate-pstack-harness-trees.mjs).
Unlike instructions asking the model to translate a choice, this projection resolves
explicit mappings during installation. This is packaging; execution belongs to the harness.
