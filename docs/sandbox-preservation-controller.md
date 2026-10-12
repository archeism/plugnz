# Deadline-owned evidence preservation

This controller repairs the preservation failure recorded in
`evidence/kimi-zcode-native-sandbox-20261011.md`. That expired attempt remains
incomplete. This is experiment tooling, not a plugnz product API or Native route
admission. Only use it with a fresh, explicitly owned Sandbox.

## Contract

Run `node scripts/sandbox-preservation-controller.mjs <config.json>` as one
long-lived controller process. An agent/root message is never required to trigger
preservation. Each configuration, local output directory, remote evidence root,
privileged control root and archive is single-use. Never overwrite a live arm's
producer or configuration.

Required JSON fields:

| Field | Meaning |
| --- | --- |
| `sandbox`, `project`, `team` | Exact owned Sandbox and approved account scope |
| `cli` | Absolute pinned Sandbox CLI executable |
| `sdkRoot` | Installed official `@vercel/sandbox` package root; current proof uses SDK 3.6.1 with CLI 4.7.1 |
| `expiresAt` | Actual running session expiry, milliseconds since epoch; must exactly match SDK `Sandbox.get`, with `resume:false` |
| `archiveAt` | Absolute preservation deadline, at least 170 seconds before expiry; acquisition needs 630 seconds; private large acquisition needs 780 seconds |
| `baselineUsedBytes` | Fresh whole-filesystem `df -Pk /` used-byte measurement **before any supplier acquisition** |
| `diskGrowthBytes` | Whole-filesystem additional allocation ceiling: at most 3 GiB normally; 6 GiB only for private large acquisition |
| `operation` | Optional `method-probe` / `native-proof`; `acquisition` selects the reviewed Codex budget; `private-large-acquisition` selects only the bounded ZCode supplier-acquisition profile below |
| `diskReserveBytes` | At least 128 MiB; acquisition requires 896 MiB; private large acquisition requires 2.875 GiB |
| `archiveBytes` | At most 100 MiB for Native arms, 768 MiB for acquisition, or 2.75 GiB for private large acquisition |
| `retainedBodyBytes` | Private large acquisition only: raw logical regular-file bodies at most 2.5 GiB |
| `experimentUid` | Empty dedicated UID, 2000–60000, used only by this experiment inside this exact Sandbox |
| `evidenceRoot` | Single owned child of `/vercel/sandbox/proof`; complete mutable trial state must be inside it |
| `output` | New local evidence directory outside Git |
| `command` | Frozen argv array, launched inside evidence root with no inherited API secrets |
| `suppliers` | Optional reconstructible supplier declarations described below |
| `supplierScratchRoot` | Optional fresh `/vercel/sandbox/native`; created and UID-owned before command, never adopts existing scratch |

The controller validates actual expiry before copying/launching. Setup copies are
bounded to 20 seconds each; a late setup refuses launch. Pipeline bounds reserve
15 seconds for stopping and 15 for remote settlement. Native/method arms reserve
50 seconds for archive, 60 for download and 30 margin (170 total). Acquisition
reserves 240 seconds for inventory/archive, 300 for download and 60 margin (630
total), including a 180-second remote compression bound. These are conservative
configured bounds, not a claim tiny probes measured 768 MiB throughput. Download must finish before actual
expiry; local restore can finish afterward. Remote artifact SHA256, size, every
trial file hash/mode and every symlink target are verified after a real local
restore. Source snapshots and SHA256 files accompany each local result: the
controller snapshots itself plus every copied remote helper. No complete receipt
is written when preservation fails.

The private large-acquisition pipeline reserves 15 seconds to stop, 15 to settle,
360 for inventory/archive (including a 300-second compression bound), 300 for
download and 90 margin: 780 seconds total. Its 45-minute session and the linear
projections from one completed 218,988,131-byte acquisition are planning inputs,
not a throughput certification for 2.75 GiB.

## Writer containment and authority

The root supervisor claims the experiment UID only when it has no live processes.
It launches the supplier with `setpriv`, NoNewPrivs and all capability sets empty.
Transport and supervisor remain outside that UID. Stop scans/kills only this
claimed UID inside the Sandbox, never a local machine UID. Detached descendants
are included. Parent exit, disk/output/measurement failure and controller deadline
trigger containment immediately, before waiting for inherited stdout pipes to
close. Failed containment is loud and prevents a stopped archive claim.

Privileged journals live in root-owned
`/vercel/sandbox/preservation-control/<attempt>/control`, outside the trial's
writable parent. The trial cannot rename that control root. Archives have separate
`trial/` and `control/` namespaces; no mutable trial receipt grants privileged
ownership. Symlinks are inventoried and archived without following them. Existing
attempts/archives are not adopted or deleted.

## Budget and reconstruction

Approved acquisition budget (parent explicitly revised the earlier 100 MiB trial
choice): 2 vCPU/4 GiB, sufficient session duration for the
frozen workflow plus the enforced 630-second acquisition archival reserve
(170 seconds for Native arms), additional remote
allocation at most 3 GiB, stop reserve at least 896 MiB, local acquisition archive
at most 768 MiB. Native arm archives remain at most 100 MiB. Before acquisition,
the controller requires at least 3 GiB local free space for bounded archive/restore
scratch. At most three failed acquisition cohorts are authorized by the parent;
measure aggregate local retention before each launch rather than infer it from
the per-arm cap. Whole-filesystem sampling includes npm/pnpm/DNF caches, source/build
scratch, temporary directories and archive growth. The image baseline is not
mistaken for free trial allocation. This method relies on stopped-state archives
and budgeted restores, not VM snapshots or full-store replay copies. The earlier
empty Codex setup's automatically created snapshot remains retained separately;
see [its independent preservation receipt](evidence/preservation-namespace-independent-20261011.md).

The acquisition cap was raised after a preserved genuine Codex 0.162.0 npm
attempt exceeded the former 384 MiB retention-stop threshold while unpacking.
Its stopped supplier inventory retained 423,505,910 bytes of partial binary,
compressed npm cache and diagnostics; the pinned binary was 1,840,958 bytes
short of its known complete size. Independent restoration verified every
retained byte, hash and mode and confirmed no partial body was omitted.
The raw evidence archive is SHA256
`c6e967d2c8fe6b49f6e83a15685404676be61b4ff564cf068cc21e511e8b6a6b`.
This is an experiment-budget correction, not a change to supplier selection,
product behavior or Native eligibility. The previous controller/configuration
remain immutable in that failed attempt's evidence. The 630-second acquisition
preservation deadline and 3 GiB whole-filesystem growth cap remain unchanged.

The separate `private-large-acquisition` operation is proof tooling for the
measured ZCode supplier only. It permits at most 2.5 GiB of unique retained
regular-file bodies, a 2.75 GiB archive, 6 GiB whole-filesystem growth, 2.875 GiB
remote reserve and requires 6 GiB local free space before setup mutates output.
Those limits do not widen the Native 100 MiB or Codex acquisition 768 MiB
profiles. No acquisition may launch until this profile is independently reviewed
and the actual local free-space floor is met.

For this private profile, every trial and non-omitted supplier path remains in
the inventory. Capacity counts a regular body once per filesystem `(device,
inode)` while still staging every hardlink path. Node defines `fs.Stats.dev` as
the containing device identifier and `fs.Stats.ino` as the filesystem inode;
the helper requests bigint stats to avoid lossy identity keys. Bun documents its
`node:fs` implementation and the focused suite executes the same provider under
Bun 1.4. Sources: [Node `Stats.dev`](https://nodejs.org/api/fs.html#statsdev),
[Node `Stats.ino`](https://nodejs.org/api/fs.html#statsino), and
[Bun Node compatibility](https://bun.com/docs/runtime/nodejs-compat#nodefs).

The monitor includes trial bodies, supplier bodies, logical sparse-file sizes,
tar headers, long names/link targets, block/end-record padding and a conservative
gzip expansion bound. The synchronous inventory and integrity work runs in a
worker, leaving the root supervisor free to enforce the whole-filesystem guard
and kill timer. A new projection begins immediately after the prior one, and a
projection that has not completed within 750 milliseconds stops the producer
instead of extending the blind interval. It stops at either ceiling with 256 MiB
headroom. This headroom is grounded in the prior attempt's observed 79,128 KiB
maximum half-second growth; 750 milliseconds would project about 119 MiB at that
rate, still below the reserved headroom. These numbers remain a measured budget
hypothesis, not throughput certification. The final stopped inventory is measured
again and cannot archive when either exact ceiling is crossed. Whole-filesystem
sampling continues to include caches, compiler output, tooling, build metadata
and archive growth outside declared supplier roots.

Native homes, resources, journals and failed-operation snapshots are trial state:
they must be inside `evidenceRoot` and archived intact. Each supplier declaration
contains `root` under
`/vercel/sandbox/native/`, `locator`, `revision` and nonempty `integrityFiles`
(`path`, `sha256`). Only an **individual body** exactly matching its independently
prebound immutable digest may be omitted for replay from that pinned locator and
revision. Matching one package manifest never authorizes omitting its directory.
Missing/wrong integrity files mark the acquisition incomplete; all other actual
supplier bytes are archived under `suppliers/<index>/` and checked after restore.
Complete stopped supplier path/type/mode/size/hash/link inventory is retained.
Hash-only inventories do not prove unknown/partial/generated bytes reconstructible.
The Native/Codex monitor stops unknown supplier growth at 75% of its archive
budget, reserving diagnostics/settlement growth; the private large profile uses
the filesystem-identity and archive-projection guard above. An overshoot or
oversized archive remains a loud preservation failure, not an omitted-body claim.
Supplier roots must be declared to include caches/build scratch; undeclared bytes
are not accounted as preserved. Do not classify mutable native state as a supplier
to fit the cap.

The Kimi/ZCode helpers still need workflow-specific contained paths and the
final frozen producer wired before another Native arm. Controller tests do not
grant Native eligibility or deliver two-physical-ID migration.

## Failure boundary

### Namespace-safe stopped staging

Every source gets an explicit private bundle namespace: `trial`, `control`, or
`suppliers/<index>`, regardless of its original basename. No tar transforms or
glob exclusions are used. Individually verified body exclusions match literal
inventory paths; a filename containing `*`, `?` or `[` cannot exclude siblings.
Canonical source-root overlap is refused, not assigned ambiguous authority.

Regular files are hardlinked into the private root-owned bundle on the same
filesystem, never content-copied; cross-device staging fails loudly. Staging
checks the original/staged inode, device, byte hash and mode before tar. It never
chmods hardlinked files. Independently created directories and links preserve
their captured modes/ownership/targets. The private bundle parent remains
inaccessible to experiment UID processes. Whole-FS staging allocation is measured
and must fit the 128 MiB metadata margin; the compressed archive remains covered
by the existing acquisition reserve. Both controller and remote/staging helper
source snapshots accompany every new attempt.

Supplier failure, guard failure, ordinary completion, deadline and one SIGTERM
all enter preservation automatically. Network outage, SIGKILL/controller-machine
loss or exhausted archive budget can still make preservation incomplete; the
method does not pretend otherwise. Keep local partial CLI streams and error
records, and never report a successful launcher as a complete archive. Until
independent review accepts the frozen controller and restores its archives, the
native redo remains blocked.
