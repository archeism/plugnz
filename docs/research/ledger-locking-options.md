# Ledger locking: runtime decision and bounded evidence

Status: research proposal, not implemented. Product foundation is `75c07bf`;
the approved adoption protocol remains
[the exact wire contract](../legacy-adoption-wire-contract.md).
No runtime floor, lock dependency, native capability or production pin changed.

## Decision awaiting the owner

Recommend a private SQLite file lease **if** the owner accepts Node >=22.13.
Keep Bun 1.3.14 supported through its native `bun:sqlite` provider. Current
`engines.node: >=22` includes versions without this unflagged builtin; changing
that public promise is an explicit policy choice, not implementation detail.
Node SQLite was introduced in 22.5 and unflagged in 22.13.
Unflagged is not stable: the versioned API is marked active development, so the
small supported-version/artifact gate remains necessary.
([Node API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html),
[22.13 release](https://nodejs.org/en/blog/release/v22.13.0))

Keeping Node 22.0 requires another proven cross-platform lease. An external
`flock` executable exists on this Linux machine, but is not a universal shipped
dependency. `fs-ext` offers native flock APIs with a compiled addon, bringing
packaging/platform/Bun verification work. None was installed or selected.
([fs-ext source](https://github.com/baudehlo/node-fs-ext))

Socket exclusion is not the general solution: network namespaces isolate
sockets/ports while processes can share a ledger filesystem. The namespace
counterexample is a design inference from the OS contract, not a locally run
positive probe. Both local namespace creation attempts returned EPERM.
([Linux network namespaces](https://man7.org/linux/man-pages/man7/network_namespaces.7.html))

## Proposed smallest private boundary

One lazy provider exposes only `exec(sql)` and `close()`: actual Bun selects
`bun:sqlite.Database`; Node selects `node:sqlite.DatabaseSync` using
`createRequire`. Bun 1.3.14 cannot import `node:sqlite`, but its native provider
passed the actual file-lease matrix below. A static Node-only import would break
existing Bun use, including module loading before any mutation.
([Bun SQLite](https://bun.sh/docs/runtime/sqlite))

The lease opens a stable dedicated lock database, takes `BEGIN EXCLUSIVE`,
and retains the connection in a `try/finally` across the entire asynchronous
critical section. Roll back and close only after native mutation/readback,
ledger COMMIT and required cleanup are finished. Busy is a loud zero-write
refusal, never guessed stale from elapsed time or a PID. SIGKILL releases the OS
lease; it does not erase pending lifecycle intent. Lock files must never be
unlinked/replaced during release or retirement, which could create independent
inodes and permit two holders. Binding, corruption, permission and unsupported
runtime failures must fail before native/ledger writes with actionable context.

SQLite uses OS file locks, unlike a port lease; unreliable network filesystem
locking is not covered by this proposal or local evidence.
([SQLite locking](https://www.sqlite.org/lockingv3.html))

There are **two different locks**:

1. Ledger compare/write critical section: reread current generation and history,
   compare the frozen expectation, then atomic replacement while holding the
   ledger lease. Atomic rename alone is not CAS.
2. Cursor native-root fence: protect exact native prior/candidate observation
   through mutation, readback and cleanup, including different ledger homes
   targeting the same native root. A ledger lock cannot establish this fence.

Lock ordering/reentrance and full Cursor transaction tests still require a
reviewed implementation. No application lock is claimed to prevent arbitrary
external tools ignoring that lock. Native readback/CAS must still detect foreign
state and refuse rather than overwrite it.

Reader-only `doctor`, `list`, `scopes` and dry-run must not import the writer
lease or create a lock database. Global Source/record/admission preflight must
remain before the first writer operation. No new user verb is proposed.

## Complete writer boundary scan at 75c07bf

CodeGraph exploration was followed by exhaustive `rg` for both write APIs.
Protecting only executor mutations or CLI's `add/update/remove` guard is
insufficient: sync, retire, pin, recovery and legacy writes also participate.

| Writer | Current callers |
| --- | --- |
| `writeLifecycleState` | executor Ledger.save; lifecycle-recovery preparation/settlement; pin-lifecycle; pin persisted records; CLI writer-record install and legacy remove pending/final |
| `writeState` v1 | pin; CLI writer-record install and legacy remove pending/final |

Exact files: `src/executor.ts`, `src/lifecycle-recovery.ts`,
`src/pin-lifecycle.ts`, `src/pin.ts`, `src/cli.ts`, `src/state-write.ts`.
`src/update.ts` has an imported legacy writer but no actual call. Source-helper
tests must exercise the same guarded writer boundary; the published package
exposes the CLI, not these TypeScript modules. Scan again after merging newer
main rather than treating these line numbers or callers as permanent.

## Frozen experiments (no real homes or native launchers)

Tracked probe: [ledger-sqlite-lease.mjs](probes/ledger-sqlite-lease.mjs), SHA256
`1e969261d974c1bce27897903a41abf7ab90ac0fb89872b68ca5305cc997a7cd`.
This is a machine-bound research fixture, not shipping mutex code.

Commands, both exit 0:

```sh
/home/charlesfengyc/.local/bin/node docs/research/probes/ledger-sqlite-lease.mjs
/home/charlesfengyc/.local/bin/node docs/research/probes/ledger-sqlite-lease.mjs --pinned
```

Driver Node 22.23.1; first matrix Bun 1.3.14, second Bun 1.4.0. Each covers
Bun/Bun, Bun/Node, Node/Bun and Node/Node: holder takes an exclusive transaction,
allocates 1 MiB pressure and forces GC; contender must observe busy; actual
SIGKILL terminates holder; contender must acquire on restart. A strong database
reference remains in the holder's finally after the suspended await.

| Frozen result | Wall time | Holder RSS range | Lock bytes | SHA256 |
| --- | --- | --- | --- | --- |
| `plugnz-ledger-sqlite-bun1314-node22-gc-evidence.json` | 1.341s | 50.5–70.4 MB | 8192 | `219a2f0c1280d44d5384809277082ad490a3022339cb8672b3302b41164e48a5` |
| `plugnz-ledger-sqlite-bun14-node22-gc-evidence.json` | 1.220s | 48.1–50.5 MB | 8192 | `70c59d7ce53c89b96bde4220c205a8ff555f825df79ae58142ddadd3963a68bd` |

Raw JSON/stderr retained at
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/ledger-locks/`
(48 KiB allocated). Both scratch fixture directories consume 16 KiB each.
Resource numbers are primitive-fixture evidence, not product throughput,
fairness or memory-capacity measurements. Token/cache usage was not measured.

Earlier failed holders lost every strong database reference after block exit;
their second process acquired the lease. Keeping the reference made both single
and multi-statement exec variants pass. This corrects the initial hypothesis:
**no Bun multi-statement API bug was established**. Retained evidence:

- Initial failure stderr SHA256 `2600031aeb5e923312c91268976228b237e705058c95d08521f0f268e119fd23`.
- Retained single-statement success `plugnz-ledger-sqlite-node22-bun14-retained-evidence.json`, SHA256 `1c168c6260ff5634d17bfc85d01a49c9effcf47b57d89f9d635d38eebc8afae0`.
- Retained multi-statement control `plugnz-ledger-sqlite-node22-bun14-multi-retained-evidence.json`, SHA256 `f2e6125db7d9d416905c25be26ab143efb008c8c4883ffcb1bbdd161ee4652ce`.
- UDP matrix success `plugnz-ledger-socket-node22-bun14-evidence.json`, SHA256 `d226d3a55bb8ec8c216ee8fd4631c1fec542ea669327f30df4d0093d3d8cf947`; same namespace only, not general ledger CAS.
- Namespace denial logs `plugnz-ledger-netns-denied.log` / `plugnz-ledger-usernetns-denied.log`, SHA256 `8f8f94f07ecd0e6152663b425f33f1fe8ce609762b9d02fa570dcb92c42a3150` / `6b50086233b9e3c0f8f5ac5e8094da06d7a05f1c3be0b88baf49578943392a94`.

## Required before calling adoption delivered

Owner runtime decision; independent design review; actual competing public
writers cannot lose a generation; SIGKILL inside native/ledger/cleanup sections
resumes without overwriting stale foreign state; permission/corrupt-lock failures
are zero-write; reader imports remain writer-free; published Node/Bun artifact
legs preserve compatibility. Cursor admission must additionally prove exact
legacy marker/Source/projected bytes, global expected-admission matching,
native-root fence, atomic relation/activation/journal COMMIT and immutable A/B/A
history. ZCode's authentic two-physical-ID migration is a separate required
variant, not covered by this primitive. Skills are unchanged; no method A/B
improvement is claimed.
