# cursor store layout

Measured 2026-09-16 on this machine (`~/.cursor`). Reader: `src/hosts/cursor.ts`.

## Store

```
~/.cursor/mcp.json                     # user-level { mcpServers: { … } }

~/.cursor/plugins/local/<name>/        # dereferenced plugin copies
  .cursor-plugin/plugin.json           # native manifest (no inline mcpServers measured)
  .mcp.json                            # plugin MCP surface; house route pins the
                                       # command to an absolute path (GUI host)
  mcp.json                             # spec §7.2.1 copy (also pinned here)
  skills/<skill>/SKILL.md

~/.cursor/plugins/cache/<marketplace>/<plugin>/<id>/   # cursor-native cache, observed
~/.cursor/plugins/marketplaces/                        # cursor-native marketplaces, observed
```

`npx plugins --target cursor` does **not** install into Cursor (house route
rejected it); the working route is a dereferenced copy into `plugins/local/`
plus `.cursor-plugin/plugin.json` (omas issue #284).

## Reader decisions

- **Plugin MCP source priority**: `.mcp.json`, then `mcp.json` — both read,
  identical entries deduped. On this machine both files of the omakase plugin
  carry the absolute pinned command, so which one Cursor launches is not
  distinguishable from evidence; reading both covers either.
- **GUI host**: `launchctl getenv PATH` is unset, so a bare command cannot be
  assumed to resolve (spec §7.2.1 makes PATH participation client-defined).
  Doctor flags bare commands `!` with `run plgnz pin`; `pin` rewrites
  them to absolute paths.
- **Shadow semantics (measured)**: a user-level entry and a plugin server of
  the same name both load and duplicate (Cursor runs the plugin one as
  `plugin-<plugin>-<server>`); doctor reports ✗ with "both load and duplicate".
- Native commands may use `${CURSOR_PLUGIN_ROOT}` (measured:
  `plugins/local/alp/.mcp.json`); doctor expands it against the plugin root.

## Pin

Cursor is the default `pin` target (`gui: true`). `pin()` rewrites the bare
`command` of every stdio server in each plugin copy's `mcp.json` *and*
`.mcp.json` — both files, because both carry the server and whichever one
Cursor launches is not distinguishable from the evidence. `~/.cursor/mcp.json`
is a user-level file and is never touched. Rationale and refusal rules:
`docs/pin-and-update.md`.

## Evidence paths (read 2026-09-16)

- `~/.cursor/mcp.json` — user-level `mcpServers` (url-type entry)
- `~/.cursor/plugins/local/omakase/` — `.cursor-plugin/plugin.json`; `.mcp.json` and `mcp.json` both `command: /Users/chaz/.bun/bin/omakase` (absolute)
- `~/.cursor/plugins/{cache,marketplaces}/` — cursor-native dirs observed, not read in v0
- omakase-distribution-state-2026-09-16.md — GUI PATH failure (`launchctl getenv PATH` unset), duplicate failure mode, `plugin-omakase-omakase` toolCount 10

## Open

- No per-plugin registry file observed under `plugins/local/` (unlike
  claude-code); installs are discovered by scanning for
  `.cursor-plugin/plugin.json`. If Cursor grows an index, prefer it.

## plgnz lifecycle and compatibility

`src/hosts/cursor-writer.ts` stages a dereferenced copy beside the native local
store, validates its native manifest, writes a source/id/fingerprint ownership
marker, pins only staged plugin MCP files, then swaps it into
`plugins/local/<name>`. A matching staged tree returns `unchanged`; a changed
local source fingerprint refreshes the same native directory. Existing local
directories without a matching marker are refused unless `--adopt-existing`
is explicit and their native identity matches. Removal deletes only a
marker-owned directory. User `~/.cursor/mcp.json` is never changed.

Default target discovery requires an executable Cursor installation; a
standalone `~/.cursor` directory does not make Cursor an implicit target.
Detection considers `cursor` and `cursor-agent` on the isolated/real PATH,
the macOS application bundle, and standard Linux/Windows installation paths.
An executable with an unknown version remains selected and then fails closed
at capability admission; it is never silently treated as absent.
Explicit `--target cursor` may still address that directory surface. When no
`cursor` binary is configured, that copy uses the directory profile.
mcp, commands, resources, and model-invocation are unverified and refused on
that profile, and a missing binary is not reported as Cursor 2.4.0. An
explicit `OPEN_PLUGIN_CURSOR_BIN` that is empty or points at a missing file is
a refusal, not a silent fallthrough to the directory profile.

The current evidence proves plugin `skills/<name>/SKILL.md`, including the
top-level `disable-model-invocation: true` gate, so the writer copies those
bytes without a conversion. Cursor's command-directory grammar, arguments and
resource semantics are still unverified for the local plugin loader. A plugin
containing `commands/` or `.claude/commands/` therefore fails before activation
instead of borrowing Codex's command-to-skill transform or silently stripping
its invocation policy. The focused lifecycle test uses an isolated Cursor root
and verifies the native-store reader's discovery shape, exact gated-skill
bytes, unchanged re-add, same-version refresh, failed conversion retention,
and owned cleanup. A real Cursor CLI transcript remains a separate runtime
check. Cursor Agent CLI `2026.09.18-9a7762b` has separate
`CURSOR_CONFIG_DIR` and `CURSOR_DATA_DIR` roots; both can point at an isolated
Cursor directory while its normal authentication remains available, so a probe
need not install into the real store. The attempted isolated `--mode ask`
loader probe was rejected for exhausted usage before it could produce a
transcript. It therefore establishes the isolation seam, not runtime skill
loading.

The separate public marketplace lifecycle and Personal composition evidence is
recorded in [Personal → plgnz → Cursor composition](../evidence/personal-cursor-composition-20260923.md).

## Outstanding command-runtime proof

The production Managed lifecycle profile currently admits `commands`, while
the earlier evidence above establishes native-store copying/readback only.
This remains an evidence gap, not proof commands are unsupported. The current
official [Cursor plugin reference](https://cursor.com/docs/reference/plugins)
documents native `commands/` Markdown/text commands, but does not establish the
adapter's conversion of all canonical command bodies or its argument/resource
semantics for the exact detected CLI release. Admission has not been removed
as an incidental audit change.

Complete the proof with an isolated store and fresh session on the profiled
Cursor executable: discover/invoke a namespaced Markdown command; verify an
argument-bearing canonical command's exact expansion; verify a package-root
resource reference reaches the intended resource; and verify a user-only
command is invocable explicitly but absent from implicit model discovery.
Capture the exact executable release, source revision and converted bytes,
native invocation/transcript, and expected/observed sentinels. Existing fixture
CLI successes and directory-reader discovery do not substitute for that runtime
evidence. Any failure must be diagnosed before extending the capability claim.
