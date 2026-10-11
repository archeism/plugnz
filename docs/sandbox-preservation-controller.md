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
| `archiveAt` | Absolute preservation deadline, at least 170 seconds before expiry; acquisition needs 630 seconds |
| `baselineUsedBytes` | Fresh whole-filesystem `df -Pk /` used-byte measurement **before any supplier acquisition** |
| `diskGrowthBytes` | Whole-filesystem additional allocation ceiling, at most 3 GiB |
| `operation` | Optional `method-probe` / `native-proof`; explicit `acquisition` permits the separately approved acquisition budget |
| `diskReserveBytes` | At least 128 MiB; acquisition requires 640 MiB (512 MiB archive plus 128 MiB growth margin) |
| `archiveBytes` | At most 100 MiB for Native arms; acquisition alone permits at most 512 MiB |
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
configured bounds, not a claim tiny probes measured 512 MiB throughput. Download must finish before actual
expiry; local restore can finish afterward. Remote artifact SHA256, size, every
trial file hash/mode and every symlink target are verified after a real local
restore. Source snapshots and SHA256 files for both controller helpers accompany
each local result. No complete receipt is written when preservation fails.

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
frozen workflow plus the enforced 170-second archival reserve, additional remote
allocation at most 3 GiB, stop reserve at least 640 MiB, local acquisition archive
at most 512 MiB. Native arm archives remain at most 100 MiB. Before acquisition,
the controller requires at least 3 GiB local free space for bounded archive/restore
scratch. At most three failed acquisition cohorts are authorized by the parent;
measure aggregate local retention before each launch rather than infer it from
the per-arm cap. Whole-filesystem sampling includes npm/pnpm/DNF caches, source/build
scratch, temporary directories and archive growth. The image baseline is not
mistaken for free trial allocation. No snapshots or full-store copies are used.

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
The monitor stops unknown supplier growth at 75% of the raw retention budget,
reserving diagnostics/settlement growth; an overshoot or oversized archive remains
a loud preservation failure, not an omitted-body claim. Supplier roots must be
declared to include caches/build scratch; undeclared bytes are not accounted as
preserved. Do not classify mutable native state as a supplier to fit the cap.

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
