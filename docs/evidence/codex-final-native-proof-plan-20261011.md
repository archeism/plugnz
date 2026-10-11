# Final Codex native rollback proof — launch plan

Status: preparation, not acceptance. The previous released-native probe proved
same-version refresh but did not produce the required public native-exit failure.
Its raw stores, failed attempts and archives remain retained. This plan does not
reinterpret that failed gate or enable another capability.

## Preparation checkpoints

The two independent proof-oracle reviews rejected `3ef856a`: a changed `.git`
tree did not prove checkout advancement, aggregate report flags did not prove a
durably settled journal, and positive resource/reported revision checks were
missing. Correction `0486c9e` records actual post-native HEAD before any foreign
injection, requires the exact V3 commit in both failure arms, correlates the fresh
sealed journal and rollback settlement, checks retained versus cleaned artifacts,
and asserts reported revision and exact fixture resource bytes. This correction
is frozen for re-review; syntax checks are not native acceptance.

A fresh nonpersistent measurement-only Sandbox, `plugnz-codex-final-3ef856a`, was
created in the authorized team/project. Before native package installation or
proof uploads, whole `sudo du -skx /` was **2,248,828 KiB** and physical `df -Pk /`
used **3,585,208 KiB**. Actual default Node is **24.21.0**, not the earlier proof's
24.14.0. This launch freezes the actual version; it does not claim parity across
unexecuted Node versions. The native package and both proof homes have not yet
been installed or run at this checkpoint.

The candidate artifact was rebuilt from the frozen production tree in this
worktree and reproduced the exact `d82ecd…` hash below. Another worktree's mutable
`dist/` is not the artifact authority for this trial.

## Frozen inputs and isolation

- Producer code: `53e40bbdfd58692f05f18742e7f2ea8df5681ffd`; packed artifact SHA256
  `d82ecd244e9d06647f7ea528ae614fa5bd0face7042f5e1ae3fa7f680e99d1dd`.
  Its embedded 0.0.11 is not the published 0.0.11 artifact.
- Actual Codex 0.162.0, official source `c1382380de69521303b416720a52f42d51af6248`.
  Verify official package integrity and native executable hash before execution.
- A dedicated append-only fixture branch in controlled `archeism/plugnz`, derived
  from the retained V1 fixture. Keep one canonical HTTPS Source/ref across V1,
  V2 and V3; change skill/resource bytes at unchanged manifest version. Record
  every immutable commit. No fixture changes go into product main.
  Prepared Source: `https://github.com/archeism/plugnz.git#finish/codex-native-proof-final-fixture`;
  initial V1 is `d42234b1adc9bac2a4d1a93d5cab26070494d751`. This new branch
  preserves the earlier proof branch; neither ref was force-updated.
- Fresh Vercel Sandbox in `charfeng1s-projects/workspace-agent-lab`, 2 vCPU / 4 GB,
  30-minute maximum. Two isolated proof homes, no real home, no model request or
  API credentials. Drop all Linux capability sets for permission-failure trials.
- Allow only official package acquisition and controlled Git transport domains.
  Do not replace Git or the native CLI with fixtures for this runtime gate.

## Budget before launch

Bound new experiment growth to **1.5 GiB** and the **entire active Sandbox physical
filesystem to 4.25 GiB**. These are separate checks: inherited OS bytes are not
free or silently excluded. Before native installation record whole `du`/`df` and
freeze the measured base; check both caps before each phase and after it. This
revision follows the separate Claude proof's measured 3.77 GiB inherited physical
base; it does not assert that this fresh Codex base will have that same size.
Include native tools, Source cache, both homes, rollback artifacts and archive
scratch. Refuse further growth at either cap. Native tools are shared read-only
between homes. Combined concurrent lineage ceiling is **11.7 GiB**: Claude's
explicit 7.25 GiB lineage plus this 4.25 GiB active filesystem and at most 200 MiB
local Codex archive/restore scratch. Retain every failed attempt.
Local compressed evidence and restore scratch
are each bounded to 100 MiB; existing archives/snapshots are not deleted.

No new snapshot is required for this experiment. Verify archive inventory,
hashes and a real restore, and obtain independent evidence review before ending
compute. Record any product-created rollback artifacts that remain pending.
If complete recoverability needs a larger archive or snapshot, stop and revise
the explicit budget rather than silently growing loose copies.

## Public acceptance sequence

1. At V1, configure the actual marketplace with its full SHA; public `sync`
   bootstraps both homes through Managed install. Actual app-server `skills/list`
   discovers the installed skill without creating a thread or model turn.
2. Append V2, retarget each isolated native catalog to its exact full SHA. Public
   sync selects Native before mutation, refreshes same-version skill/resources,
   reads back the exact Source SHA and reports active-conforming. Scope is stable.
3. Append V3. In the first home, a wrapper delegates to the released CLI but makes
   only its cache parent unwritable during marketplace upgrade, restoring its
   original mode before returning. Require a **real nonzero native exit** after
   checkout advancement, not a no-op, injected exit code or prior-byte tampering.
   Require exact prior cache/config/checkout/data restoration, runtime diagnostic,
   mutationStarted true and a settled recovery receipt.
4. In the second home, perform the same native-exit failure and inject a foreign
   checkout file after native return, before adapter rollback. Require loud pending
   refusal with exact foreign and native post-call surfaces retained; no restore
   write may overwrite them. This is controlled concurrency evidence, not proof
   of an undocumented native cross-process lock.
5. Preserve complete stdout/stderr, before/after inventories, journals, executable
   hashes and disk/CPU/wall measurements. Review the frozen combined code and the
   actual proof before merging. A fixture test or clean positive cannot waive a
   failed native-exit, retention or foreign-write gate.

Official API authority: [release-pinned plugin CLI](https://github.com/openai/codex/blob/c1382380de69521303b416720a52f42d51af6248/codex-rs/cli/src/plugin_cmd.rs)
and [release-pinned Git operations](https://github.com/openai/codex/blob/c1382380de69521303b416720a52f42d51af6248/codex-rs/core-plugins/src/marketplace_upgrade/git.rs).
The latter pins a full SHA directly and sets `GIT_OPTIONAL_LOCKS=0`; it does not
establish a native whole-marketplace mutation lock. Skills remain unchanged.
