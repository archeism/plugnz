# codex store layout

## plgnz lifecycle projection

Codex activates `local` ahead of every version; otherwise its store compares semantic versions and falls back to lexical ordering. plgnz therefore materializes a plugin at its manifest version (or `local` when absent), not at a Git SHA. It stages the Codex projection in the same cache slot, validates it, then swaps the owned version directory only after the stage succeeds.

Each plgnz-created version root contains `.plgnz-install.json` with its source identity, native plugin id, and content fingerprint. An exact re-add compares staged bytes before leaving that root untouched; changed bytes from the same source refresh the same version. A foreign root is adopted only when its bytes match the staged representation excluding that marker. Different foreign roots, winning foreign versions, different owned source identities, and symlinked managed slots are refused. Activation keeps the old root as a filesystem-rename backup until config enable succeeds. Removal deletes only marked versions for the requested native id; it removes an otherwise-empty plugin table or disables a table with user fields.

Lifecycle-created markers additionally retain the canonical deployment `scopeId`,
`sourceType`, immutable `sourceRevision`, and observed `route`. Local lifecycle
source identity is stable by canonical scope, not by the mutable content hash.
Native inventory reads these fields rather than inventing a different scope, and
readback obtains the installed route from the marker, including after rollback.
The Managed install/update/retire profile remains version-gated and retains its
existing per-component capability limits. `test/codex-sync-public.test.ts` proves
the public CLI bootstrap, changed-byte update, canonical ownership, and offline
retirement against the documented native store with an isolated version boundary;
it is not proof of a real native marketplace-upgrade invocation.

Measured 2026-09-16 on this machine (`~/.codex`). Reader: `src/hosts/codex.ts`.

## Store

```
~/.codex/config.toml
  [plugins."<name>@<marketplace>"]     # enabled = true|false — the install registry
  [mcp_servers.<name>]                 # user-level MCP: command/args/env/cwd (stdio)
                                       # or url (HTTP); optional enabled flag

~/.codex/plugins/cache/<marketplace>/<name>/<version>/   # install dirs
  .codex-plugin/plugin.json   # native manifest whose `mcpServers` is a pointer
                              # string ("./.mcp.json") — never inline (13 measured:
                              # 6 pointers, 7 absent)
  .mcp.json / mcp.json        # spec copies written by the plugins CLI
  .plugin/plugin.json         # spec §5.2 manifest
  skills/<skill>/SKILL.md
```

For converted Agent Plugins without a native manifest, plgnz writes a minimal
`.codex-plugin/plugin.json` containing only `name`, `version`, `description`,
and `skills`. The isolated `codex app-server` loader probe on 2026-09-22 loaded
the resulting skill as `loader-probe:hello` from an isolated `CODEX_HOME`.

## Reader decisions

- **Plugin MCP source priority**: `.codex-plugin/plugin.json` (its `mcpServers`
  pointer resolved against the plugin root), then `.mcp.json`, then `mcp.json`
  — all read, identical entries deduped.
- Install dirs are keyed by version; `local` wins, then semantic version order,
  then lexical fallback.
- Native commands may use `${CODEX_PLUGIN_ROOT}` (measured:
  `cache/air-local/alp/0.1.43/.mcp.json`); doctor expands it against the
  plugin root. A spec `mcp.json` `command` must not contain placeholders
  (spec §7.2.1).
- `enabled = false` entries are still checked, with ` [disabled]` appended to
  the message — a dead disabled entry is a latent failure mode, not a healthy
  one.
- **Shadow semantics (measured)**: a user-level `[mcp_servers.X]` silently
  wins over a plugin-provided server of the same name; doctor reports ✗ with
  "the user entry wins and silently shadows the plugin server".

## Pin

`pin` rewrites the file `.codex-plugin/plugin.json` **points at**
(`"mcpServers": "./.mcp.json"`, resolved against the plugin root) plus
`mcp.json`. The pointer string is not a command and is left alone — codex
resolves it itself. `~/.codex/config.toml` `[mcp_servers.*]` is the user's own
config and is never touched. codex is not a GUI host, so it is not a default
`pin` target. Rationale: `docs/pin-and-update.md`.

## Evidence paths (read 2026-09-16)

- `~/.codex/config.toml:566` — `[plugins."omakase@plugins-cli"] enabled = true`
- `~/.codex/config.toml:306+` — `[mcp_servers.*]` stdio (`command`/`args`) and url-type entries
- `~/.codex/plugins/cache/plugins-cli/omakase/0.0.0/` — install dir with `.codex-plugin/plugin.json` (`"mcpServers": "./.mcp.json"`), `.mcp.json`, `mcp.json`, `.plugin/`
- omakase-distribution-state-2026-09-16.md — the shadow incident: a hand-written `[mcp_servers.omakase]` shadowed the plugin server until deleted (`codex mcp list`)

## Open

- Relative commands in user config (`./…`) are resolved against `~/.codex`;
  the codex client's actual cwd at launch is not knowable from config — such
  entries can be false ✗s (one measured: the disabled `computer-use` entry).

## Exact 0.162.0 policy and MCP evidence (2026-10-13)

The Managed profile admits model-invocation control, projected prompt commands
and MCP after the isolated native probe in
[`evidence/codex-policy-mcp-20261013.json`](../evidence/codex-policy-mcp-20261013.json).
The real `skills/list` enumerates ordinary, manual and projected command skills.
Two actual outbound request captures to a localhost fake Responses provider
prove automatic catalog exclusion for both frontmatter and sidecar manual
policies, and explicit projected command-body injection. No model inference or
external provider request occurs.

A portable `mcp.json` without `.mcp.json` requires an explicit native manifest
`mcpServers: "./mcp.json"` pointer. The writer now generates it when the source
has no existing pointer or default `.mcp.json`; native `mcpServerStatus/list`
then discovers the local server and its tool. Existing authored pointers stay
intact. This proves wiring and native discovery, not third-party authentication.
Agents and user-invocation suppression remain unsupported; declaring agent
files still prevents full-package admission rather than silently dropping them.

Inline manifest `mcpServers` remain unverified and are refused before activation.
Native MCP pointers must name an existing file inside the plugin. When canonical
and native MCP files coexist, their server objects must agree (JSON object key
order and `$schema` do not affect comparison); conflicts refuse the candidate
and preserve the previous installed bytes and user config.

Complete native cache rollback capture explicitly restores the copied root's
permission bits before comparing its physical fingerprint. Bun 1.4.3 on macOS
can otherwise create that root as `0755` when recursive copy also creates missing
parents, even when the source is `0750`; nested modes still copy correctly. The
existing complete-slot rollback and CAS tests cover mode preservation and refusal
of later mode changes without weakening physical-fingerprint checks.
