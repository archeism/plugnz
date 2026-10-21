# ZCode CLI — official target

`zcode-cli` means the official Z.ai CLI from
[zai-org/ZCode](https://github.com/zai-org/ZCode), not the community
`kingsword09/zcode-cli` / `zcode-app-cli` distribution.

## Source baseline

- Pinned source: `872ad960de7ec172591f7e1952f7849229f94521` (checked 2026-09-23).
- Agent CLI and runtime: `apps/zcode-cli/`; CLI package: `@zcode/cli`.
- Official build instructions: [README.en.md](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/README.en.md).
- CLI plugin documentation: [apps/zcode-cli/README.md](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/README.md).
- Isolated native evidence: [official CLI probe](https://github.com/archeism/plgnz/blob/main/docs/evidence/zcode-official-cli-872ad960-20260923.json).
- The official GitHub releases API returned no releases at this check. This
  establishes a source-build verification route, not the absence of distribution
  through other official channels.

`scripts/zcode-distribution/runner.mjs` is the Web distribution runner: it
handles `--web`, serve, and version behavior. It is not the terminal CLI
adapter. Build the terminal Agent CLI with `pnpm --filter @zcode/cli... build`,
then run `node apps/zcode-cli/packages/cli/dist/zcode.cjs --help`.

## Acceptance boundary

The pinned official build passed isolated marketplace install, update,
failed-update preservation, and removal probes. It also exposes a
`disable-model-invocation` skill in its loader-visible skill list. Therefore a
user-only skill must be represented as a command excluded from skill discovery.
The tested projection preserves a static resource reference as an absolute owned
path. The separate [source probe](../evidence/zcode-official-cli-command-source-probe-872ad960-20260923.json)
verifies local `$ARGUMENTS`/`$N` expansion; no model session was run.

The isolated build used Node `26.7.0`, while the source declares Node `24.14.0`.
It establishes observed behavior, not supported-runtime certification.

The [public adapter evidence](../evidence/zcode-official-public-adapter-20260923.md)
records the acceptance matrix below. Broader native semantics
remain unsupported unless explicitly covered by that boundary.

The prior community-wrapper probes and its unregistered adapter draft do not
satisfy this gate. Preserve useful fixtures, but revalidate every runtime claim.
Desktop is a separate target; neither CLI source availability nor a CLI pass
proves Desktop compatibility. Do not replace an existing community executable
or reuse its live data directory merely to perform these probes.

## Public adapter boundary

The `zcode-cli` adapter requires an explicit
`OPEN_PLUGIN_ZCODE_CLI_BIN=/absolute/path/to/zcode`. It reads `--version` first
and rejects the historical `zcode-app-cli` banner, then requires `doctor --json`
to report CLI name `zcode` and process name `zcode-cli`. A version string alone
does not prove provenance.

When `ZCODE_STORAGE_DIR` is supplied, the adapter leaves config at
`$HOME/.zcode/cli` as the official CLI does, and uses
`$ZCODE_STORAGE_DIR/cli` for the native registry/cache. Without that variable,
both use the normal `$HOME/.zcode/cli` layout.

The adapter supports static Markdown commands and user-only skills projected as
one namespaced command (`<plugin>:<command>`) with `$ARGUMENTS`/`$N` preserved
and contained Markdown resources rewritten to an owned absolute path. It
refuses shell expansion, unsupported command metadata, unimplemented root
semantics such as inline hooks/MCP, command collisions, and unowned adoption.
The separately qualified standard-file native hook route is described below. Native
content uses `canonical+plgnz.<fingerprint>`; cache path normalization is read
from the native store rather than reconstructed.

The public flow was exercised against the source-built official CLI `0.16.9`
on darwin/arm64 with Node `26.7.0`: fresh add, read-only list/doctor, verified
unchanged re-add, changed-content update, drift detection/recovery, and remove.
All adapter probes used temporary homes and made no model turn. The source
declares Node `24.14.0`, so this is interface evidence rather than a
supported-runtime certification.


## Native advisor hooks

ZCode CLI 0.16.9 at source `aac4755666d09fdcd70272fcf063c077a639015f`
has a separate `native-hooks` capability profile. This is shared profile selection
with host-specific evidence, not a claim that native hook schemas are portable.
Agent Plugins 1.0 keeps these host extensions outside its portable core (spec §8).

The qualified package uses `hooks/hooks.json`, synchronous `command` handlers,
and catch-all matchers for `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`
and `Stop`. Handler options are `command`, optional positive `timeout` in seconds,
and optional `async: false`. Other options, events, handler types and versions
remain unsupported/unverified. Hooks may ship with resource files; this narrow
profile does not admit arbitrary mixtures with agents, MCP or skills.

The native manifest is inventoried before selection. Projection refuses declarations
it cannot preserve instead of overwriting them silently. Conventional hooks,
commands and skills paths may survive projection, but must separately pass their
applicable semantic profile. Native trust/permission policy remains ZCode-owned.
Installing hooks does not execute them, and ordinary install reports do not claim
runtime delivery.

```sh
OPEN_PLUGIN_ZCODE_CLI_BIN="$(command -v zcode)" \
  plugnz add /absolute/path/to/advisor-zcode --target zcode-cli --json
```

`OPEN_PLUGIN_HOME` is an entire home-directory stand-in, not just a ledger directory.
When testing in isolation, direct ZCode checks must use that same HOME. Normal
installations need no home override. Start a new ZCode session after updating hooks.
See [native installation and delivery evidence](../evidence/zcode-native-advisor-hooks-20261021.json).

If an update fails during staging, keep the previous installation, correct the
source, and retry `plugnz update <name> --target zcode-cli --json` before removing
it. Cross-verb recovery is deliberately refused until that pending update settles;
the native qualification exercises this recovery and verifies retained data.
