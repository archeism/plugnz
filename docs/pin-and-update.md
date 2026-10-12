# pin and update

Two verbs that act on installs **plgnz knows about**, plus the
`state.json` fields they share. Code: `src/pin.ts`, `src/cli.ts`, `src/executor.ts`,
`src/mcp.ts` (`pinPluginMcpFiles`), one `pin()` per host module.

## Why `pin` exists

Spec §7.2.1 makes a stdio `command` a single executable token — a bare name or
a `./`-relative path — and says outright that *whether a configured `PATH`
participates in resolving a bare `command` is client-defined*, so a plugin
claimed to be conformant must not depend on it.

A macOS GUI app starts with no shell PATH (`launchctl getenv PATH` is unset on
this machine — see the ground-truth doc, evidence line for cursor). For Cursor
that turns a perfectly valid spec `command` into a server that never launches.
`pin` is the repair: resolve the bare name **now**, on a real shell PATH, and
write the absolute path into the host's copy.

Consequences worth knowing:

- The pinned form (an absolute path) is not one of the two forms §7.2.1 lists
  for `command`. It is a host-native repair for a client with no shell PATH,
  and it keeps the field a single executable token, which is what §7.2.1 is
  protecting. `doctor` verifies both forms the same way (does the target
  exist and is it executable).
- `pin` rewrites **plugin copies only**. A host's user-level MCP config
  (`~/.cursor/mcp.json` keyed by hand) is left alone even when it carries a
  bare command: it belongs to the user, and doctor's `!` finding already
  points at it.
- A bare command that does not resolve is **refused** — reported `✗`, exit 1,
  file untouched. Guessing a path would be worse than leaving the entry bare,
  and the failure is a real one the user should see.
- A `./`-relative command is already unambiguous and is never rewritten.

### Targets

| Invocation | Hosts |
| --- | --- |
| `pin` | the GUI hosts (`HostReader.gui` — cursor today) |
| `pin --target <host>…` | exactly those hosts; an unknown id is a usage error (exit 2) |
| `pin --all` | every host in the registry |

`--dry-run` reports the same lines prefixed `[dry-run] ` and writes nothing,
to the plugin copy or to the ledger.

### What gets recorded

`state.json` gains a per-install `pins: ["<server>", …]` (sorted) for installs
plgnz made. That is the only reason `update` can restore a pin: a fresh
copy carries the source's bare command again.

A plugin with **no** ledger record is still pinned — the repair is about
launchability, not ownership — but the run reports `!` that the pin is not
recorded and will not survive a re-install by whichever tool owns it. No
record is invented for it: a pins-only entry would make `update` try to re-add
a plugin whose source plgnz does not know.

## `update`

`update [name]` selects exact recorded Source/package/native bindings. Both
imported v1 and modern v2 records use the shared lifecycle core:

1. Freeze and preflight every selected Source and observed host before writes.
2. Stage the candidate and reapply recorded pins before sealing its projected
   fingerprint or activating it.
3. Apply, read back and finalize through the recovery journal. A mutation failure
   stops later mutations; add/update never prune omitted packages.

Imported ownership is revalidated, not inferred from a package name. Legacy
identity migration or adoption without a proven executor/fence refuses before
writes; the old per-host re-add engine is not a fallback.

Refusals:

- `name` given, no record → `✗ … refusing to modify it`, exit 1. plgnz
  has no basis for calling another tool's install up to date, and a re-add
  would quietly take ownership of it.
- source gone or no longer providing the exact package → nonzero, store untouched.
- unsupported/unverified host operation → typed nonzero capability refusal.

`--dry-run` writes neither the copy nor the ledger.

## state.json

See `docs/state.md` for the full shape. V2 activations retain their pin server
names alongside Source/projected/installed fingerprints and recovery history.

## Evidence

- Spec §7.2.1 (the `command` token rule and the client-defined PATH sentence)
  — `open-plugin-spec-1.0.0.md`
- `omakase-distribution-state-2026-09-16.md` — cursor MCP command pinned to
  an absolute path because GUI apps lack a shell PATH (`launchctl getenv PATH`
  unset); the house route wrote exactly this form by hand
- `~/.cursor/plugins/local/omakase/{.mcp.json,mcp.json}` — both statements of
  the same server carry the absolute command, which is why `pin` rewrites
  every candidate file rather than only the one a reader reports first
- `~/.kimi-code/plugins/managed/omakase/...` — same twin-file shape, plus the
  inline `.kimi-plugin/plugin.json` entries (see `docs/hosts/kimi.md`)
