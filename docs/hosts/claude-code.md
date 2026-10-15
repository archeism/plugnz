# Claude Code adapter

`claude-code` reads and writes the native user plugin store through
`src/hosts/claude-code.ts` and `src/hosts/claude-code-writer.ts`.

## Evidence and boundary

The store layout was inspected on 2026-09-16:

```
~/.claude/plugins/installed_plugins.json
  { "version": 2, "plugins": { "<name>@<marketplace>": [
      { "scope": "user", "installPath": "<absolute path>", "version": "…" }
  ] } }
~/.claude/plugins/cache/<marketplace>/<name>/<version-or-sha>/
```

Personal's existing delivery uses the native commands `claude plugin
marketplace add/update`, then `claude plugin install/update <name>@personal
--scope user`; its same-version repair uninstalls and reinstalls stale cached
bytes. `claude --version` reported 2.1.275 on 2026-09-22. An isolated native
marketplace install of amended Addy reported all 25 skills through `claude
plugin details`. The same probe did not report the hidden Markdown commands,
so unprojected `.claude/commands` is not treated as loader proof.

The neutral collection’s `marketplace.json` identity is retained (`personal`),
so its native ID is `name@personal`. The adapter copies canonical amended
bytes without projection: `skills/`, `.claude/commands/*.md`, generic
`commands/` sidecars, resources, and existing `.claude-plugin/plugin.json`
remain in the staged tree. The established source location for Addy's Markdown
commands is `.claude/commands/`; Claude 2.1.275's pinned schema requires an
explicit `commands` list to load non-root command paths. plgnz adds every
staged Markdown command to that native list and refuses an existing incomplete
list. Addy's native sidecar contains its `skills` pointer. When a source lacks the
Claude sidecar, plgnz creates the minimal native manifest (`name`, `version`,
optional `description`, and `skills: "./skills/"`) rather than copying generic
Agent Plugins schema fields into it.
No Addy-specific command conversion occurs here.

For a root-only local plugin, the adapter creates one marked catalog wrapper per
marketplace under Claude's managed `plugins/marketplaces/` tree. It copies each
selected canonical plugin into that catalog and registers the catalog without
changing the source checkout. A foreign wrapper collision is refused; removal
deletes only its marked plugin copy and drops the wrapper only once it is empty.

## Lifecycle

Lifecycle admission requires both an observed executable version and evidence
for that release. Managed loader/store profiles currently cover `2.1.275`
(the native loader and command-root probe above), `2.1.285` (the isolated
oh-my-ai skills, MCP, and resource proof in
[`oh-my-ai-native-host-compat-20261015.json`](../evidence/oh-my-ai-native-host-compat-20261015.json)),
and `2.1.295` (the isolated native store/update probe in
`docs/research/native-plugin-update-capabilities-2026-10-09.md`), and `2.1.296`
([isolated native loader/refresh receipt](../evidence/claude-code-2.1.296-native-20261013.json)).
The 2.1.296 probe used separate `OPEN_PLUGIN_CLAUDE_CODE_ROOT` and
`CLAUDE_CONFIG_DIR` roots, without provider authentication: native `plugin details`
loaded a skill and command, observed a same-version skill-directory refresh,
then observed restoration of the original source and removal from `plugin list`.
This proves the Managed store route; it does not add a native remote-update contract. A successfully
parsed older, intermediate, or future release is still `capability.unverified`:
a version string alone is not proof of its registry layout or semantics.
This is an evidence inventory, not a claim those other releases are incompatible.
To extend it, reproduce loader/store, same-version refresh, activation/readback,
and recovery behavior for the actual release and record that evidence before
adding its profile. Native-update contract evidence is evaluated separately;
it does not establish the broader Managed contract for another release.

`add` stages beside the cache slot, validates canonical/native manifest identity
and native content directories, writes a `.plgnz-install.json`
source/identity/fingerprint marker, and swaps the staged directory into place.
The registry is atomically replaced before obsolete owned cache copies are
cleaned up; a registry failure restores the prior cache copy. A changed
fingerprint refreshes bytes in the same version/SHA slot, and a new SHA from
the same source replaces its prior owned cache slot while retaining other
native registry scopes.
Existing unmarked or differently owned slots, and registry entries that point
at a different live user install, fail before activation. `remove` moves only
marker-owned directories aside, atomically removes its user registry row, then
commits deletion; project and other native scope rows and foreign cache content
are left alone. Root-wrapper changes, cache activation, registry, settings, and
known-marketplace metadata share a rollback boundary, including post-stage
registration refusal.

`add --adopt-existing` has a narrower migration path for one unmarked native
user install. Its registry row must point directly under the selected native
cache slot, contain no symlinks, and agree with the selected plugin's native
name and version. plgnz stages a marked sibling named `<version>.plgnz`, then
atomically repoints the user row and enabled setting. The old unmarked directory
is neither marked nor deleted, including on later refreshes. Adoption never
claims or rewrites the existing marketplace wrapper or known-marketplace source:
Claude continues to load through the registry's newly marked `installPath`.

Tests set `OPEN_PLUGIN_CLAUDE_CODE_ROOT` to an isolated temporary root. The
adapter never writes `~/.claude.json`; user-level MCP entries remain reader
only. `pin` only rewrites plugin-local `.mcp.json` / `mcp.json` files.
Canonical Agent Plugins `mcp.json` is projected to Claude's native `.mcp.json`
during staging. If both files are authored, their server declarations must be
equivalent or activation is refused.

The 2.1.285 evidence admits install, changed-byte update, and retirement for
the oh-my-ai package envelope it exercised: ordinary skills, MCP, resources,
and the adapter-owned safeguards for atomic activation, rollback, readback,
reload, and retained plugin data. Disable, commands, agents, and invocation
policy remain outside that exact-release profile.

The 2.1.296 probe is reproducible with
`bun docs/evidence/claude-code-2.1.296-native-probe.ts` on this Mac.
Focused verification: `bun test test/claude-code-lifecycle-route.test.ts
 test/claude-lifecycle.test.ts` passed 35 tests and 168 assertions.
A broader public-catalog run initially exposed a separate macOS canonical-path
binding defect before mutation; that result is not loader incompatibility.
Two exploratory native attempts were retained under `/tmp/plugnz-claude296-*`:
`plugin details` inventories component directory names rather than descriptions
or frontmatter aliases, so the final refresh probe changes the skill directory
and verifies that changed native inventory.

### Claude 2.1.296 user-only skills

The exact 2.1.296 profile additionally supports `model-invocation-control`.
The [native invocation receipt](../evidence/claude-code-2.1.296-invocation-20261013.json)
binds the installed binary hash, native frontmatter-to-command mapping, and its
unmodified Skill gate. Executing that extracted gate with settings set to on
rejects autonomous invocation of `disable-model-invocation: true` with native
error 4 while allowing explicit user invocation. This is a focused native
consumer check, without a provider request; the separate native plugin loader
probe proves the store route. `user-invocation-control` remains unsupported in
this profile, and no broader release range is inferred.

Run `node docs/evidence/claude-code-2.1.296-invocation-probe.mjs` to reproduce
that exact installed-binary check. Admission requires a native dashed
`disable-model-invocation` declaration for each restricted component; a
Codex-only sidecar or unproven alias remains a visible capability gap.

The exact 2.1.296 profile also admits native `agents/*.md` definitions.
An [isolated Addy loader receipt](../evidence/claude-code-2.1.296-agents-20261013.json)
shows all four named agents, their component token inventory, and all 25 skills
loaded by native `plugin details`. This verifies agent discovery without a
provider call; no claim of delegated model execution is made. Hidden
`.claude/agents` roots remain unsupported rather than inferred from this proof.
