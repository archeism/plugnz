# dcode Managed lifecycle evidence

Released `deepagents-code==0.1.83` is the exact native contract. The package was
installed in a disposable Python 3.13 environment; no real plugin home was used.

`plugins/discovery.py:auto_update_plugins` reads the **remote source** manifest's
auto-update policy, not the activated copy. It explicitly skips installed entries
whose native registry version is `None`. Managed activation therefore omits the
registry version while preserving the declared manifest version, source revision,
ownership and complete content fingerprint. The reader displays manifest version.
This opts out one plugin without altering marketplace siblings or global policy.

`test/dcode-native-updater-probe.py` runs the released updater with only external
source materialization replaced by local fixtures. Both upstream manifests opt in
and advance version; only the normally versioned sibling updates. The managed
plugin remains enabled, unchanged and discoverable.

Mutations hold dcode's own `plugins/.mutation.lock` using the installed Python
runtime's `filelock`, verified against distribution version 0.1.83. Acquisition
is bounded to ten seconds and release to two seconds. Missing/unverified Python
or lock failure hard-blocks mutation. The lock spans precondition readback,
activation/disable/retirement, verification and rollback until cleanup. Parent
exit closes stdin, releasing the child-held lock. An explicit
`OPEN_PLUGIN_DCODE_PYTHON_BIN` can select a verified interpreter for wrapper-based
installations; it is not an unlocked fallback.

Public CLI regression tests exercise install, same-version changed-byte update,
hashed native adoption, source-free retirement, and preservation of writable data.
Durable rollback snapshots contain only the affected registry/enablement row and
active roots; restoring one operation never replaces unrelated rows. Retirement
removes registration and owned active bytes, not `plugins/data` or lifecycle ledger
metadata. A disable changes only enablement and is reversible through the same
durable row snapshot. Hooks remain subject to the existing exact capability gate;
commands, agents and restricted invocation are not translated or weakened.

Verification commands: `bun test test/dcode-sync-public.test.ts
test/dcode-public-local.test.ts test/dcode-lifecycle.test.ts` and `bun run check`.
Real native probe: `<isolated-python> test/dcode-native-updater-probe.py`.
