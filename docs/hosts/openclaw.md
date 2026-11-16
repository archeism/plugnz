# OpenClaw Agent Plugins bundles

The adapter targets OpenClaw **2026.9.1** (`ad6fe23`), using its built-in Agent
Plugins bundle loader. The pinned upstream source is
[`ad6fe23aecb9b833d68139b0ddc9f239b894d2f1`](https://github.com/openclaw/openclaw/tree/ad6fe23aecb9b833d68139b0ddc9f239b894d2f1).
The installed vendor documentation is `docs/plugins/bundles.md`.

This route delivers ordinary skills, plugin-owned resources and MCP servers.
It does not qualify native JavaScript extensions, commands, agents, hooks,
invocation restrictions, permission preprocessing or other OpenClaw versions.
Existing foreign plugins, including the existing Codex-format house bundles, keep
their native registrations.

Agent Plugins 1.0.0 packages use root `plugin.json`, `skills/`, and `mcp.json`
(spec §7.2.1). OpenClaw's Agent Plugins MCP reader requires the standard MCP
`$schema` and `mcpServers`; it does not read `.mcp.json` or inline manifest MCP
servers in this format. A stdio executable stays bare or plugin-relative.
Absolute executable pins are refused. OpenClaw expands `${PLUGIN_ROOT}` and
`${PLUGIN_DATA}` in arguments, environment values and working directories;
plugin data stays in the host's persistent data directory after retirement.
Invalid or unsupported MCP configuration must refuse the affected installation:
a loaded skill alone cannot establish successful MCP delivery.

Manifest targets bind `{root, configPath}` explicitly, with a stable instance
identity. The default instance resolves the configured OpenClaw state root and
`openclaw.json`. Separate logical instances cannot share either physical root or
config path in one batch. Native subprocesses receive the selected
`OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH`.

Publication uses one stable producer-owned bundle directory and selected native
`plugins.load.paths`, `plugins.entries[id]` and `plugins.allow` membership.
The native `plugins install --link` command can retain multiple paths for the
same ID and continue selecting the old version. Atomic replacement at a stable
owned path avoids that observed behavior. Ownership markers, content
fingerprints and scoped configuration snapshots protect updates and rollback;
foreign collisions refuse before replacement. Mode preservation applies to the
adapter's frozen projection, publication and rollback copies; the shared Source
materializer normalizes directory write bits before adapter staging. This route
does not add a raw authored-permission guarantee. Removal clears only the owned
bundle and its selected registration, preserving unrelated plugins and data.
Native CLI discovery and the vendor bundle/MCP runtime provide readback.

Qualification evidence is recorded in
[`openclaw-agent-bundle-20261116.json`](../evidence/openclaw-agent-bundle-20261116.json).
The bounded qualification exercises actual native discovery, same-path updates,
unchanged readback, rollback and retirement, and native MCP catalog projection
without a model request. Broader OpenClaw parity remains outside this increment.
