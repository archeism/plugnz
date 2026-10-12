# Private SQLite file lease: unwired checkpoint

Base `5c28d0e`; contract proposal:
[ledger-locking-options.md](ledger-locking-options.md). This candidate does not
change the published Node engine policy or activate any writer/CLI import.

`withSqliteFileLease(absoluteCanonicalPath, asyncCallback)` holds a local same-file
SQLite `BEGIN EXCLUSIVE` transaction with `busy_timeout=0` through the awaited
callback. The callback result is returned only after rollback/close succeeds.
An ordinary callback exception is preserved unchanged after clean release;
typed `SqliteFileLeaseError` retains acquisition/runtime/binding failures or the
original callback plus every release failure. No stale PID/TTL inference, lock
unlink/replacement, enable flag, fallback native addon or dependency is used.

The parent must already exist, be canonical without redirected ancestors, owned
by the current UID, non-group/world-writable, and owner-writable/searchable. An
existing database must be an owned writable regular single-link file. Exact
bigint device/inode bindings are checked around acquisition and release. This is
a private caller contract tested on Linux, not a new CLI path policy or a claim
of Windows/network-filesystem support. It excludes cooperating plugnz callers,
not arbitrary external inode replacement or native tools ignoring the lease.

The SQLite provider is loaded lazily: actual Bun uses `bun:sqlite.Database`,
otherwise unflagged Node uses `node:sqlite.DatabaseSync`. Unsupported version or
builtin availability refuses before creating the database. The owner still must
choose the public runtime policy before production wiring. The helper remains
absent from doctor and all production command/writer import graphs.

## Strong-reference regression

A first matrix passed while GC ran before callback suspension. The strengthened
test awaits before forced GC and repeats GC while the holder is suspended: it
found Bun/Bun exclusion failure despite a database reference used in `finally`.
Inlining rollback/close alone still failed. A module-level strong-reference set
made the retained four-leg matrix pass; entries are removed only after a
successful close. Close failure retains the connection and reports it loudly
rather than guessing that the lease settled. These are observed fixture results,
not a diagnosis of a particular Bun internals defect.

## Gates and scope

```sh
OPEN_PLUGIN_TEST_LEASE_BUN=/home/charlesfengyc/.local/bin/bun \
OPEN_PLUGIN_TEST_LEASE_NODE=/home/charlesfengyc/.local/bin/node \
bun test test/sqlite-file-lease.test.mjs test/doctor-imports.test.ts
bun test test/sqlite-file-lease.test.mjs
bun run check
git diff --check
```

Pinned children: Bun 1.3.14 and Node 22.23.1, all Bun/Bun, Bun/Node, Node/Bun and
Node/Node legs. Test runner: Bun 1.4.0. Pinned gate: 10 passed, zero failed,
117 assertions, 14.84 seconds. Portable-default gate: four passed, zero failed,
76 assertions, 14.11 seconds. Both ran concurrently in distinct isolated
temporary homes. Typecheck/diff checks exited zero. The test uses Bun's real
Node-target build for the helper and launches actual Bun/Node subprocesses; it
does not change the production build or expose a provider injection framework.

Coverage includes post-await GC, 1 MiB allocation pressure, actual contention,
same inode retention after SIGKILL, successful callback return, awaited exception
release, corrupt/permission-invalid/symlink/hardlink refusal before protected
callback writes, and an actually unavailable Node builtin with SQLite explicitly
disabled. The negative flag is test-only: no product process is restarted with
flags. Release-error tests inject faults *after real provider rollback/close*,
retaining both diagnostics; they are not claims of naturally occurring vendor
release failures. Per-leg RSS, elapsed time, pressure and lease bytes are retained
in raw logs. Token/cache usage was not measured.

Every RED/failed/null attempt log is retained under
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/private-sqlite-file-lease/`
(48 KiB allocated). Final pinned log SHA-256
`c3fec3c7409be5c7102bf2fab229279c10e29c5e05fa53a859996dc4b48521be`;
default log SHA-256
`b92e148f1db6e934a41122f7efa4d091ae14747d996f6d85a0951134344dfebe`.

No full-suite, ledger CAS, native-root fence, adoption execution or public pending
repair completion is claimed. Independent Standards and Spec reviews are required
before further wiring. Skills were used unchanged; no skill improvement claim.

## Independent approval and combined integration

Both independent review axes approved immutable candidate
`9ae6276280fcc856047462bb435db7bfc73fccd4`: Standards ran 10 tests / 117
assertions in 4.94 seconds; Spec ran the same gate in 4.35 seconds and separately
verified awaited `throw undefined` preservation and subsequent reacquisition.
Spec log SHA-256:
`955d34a81730fc546fc080d164870e8ee1ed66579bc9e70cf9fbd9597447c652`.

Merged without squashing into the combined source integration branch at
`53e167c149296fa6fb43cb64c0f2346d45d6c0a4`. Root repeated the documented pinned
matrix with actual Bun 1.3.14 and Node 22.23.1: 10 passed, zero failed, 117
assertions, 5.37 seconds. `bun run check` exited zero. All four contention legs
refused while held, then reacquired the same persistent inode after actual
SIGKILL. This checkpoint still does not wire the helper into production or
change the public Node minimum. The known combined end-to-end adoption failure
remains unresolved; these focused gates do not claim a green full suite.
