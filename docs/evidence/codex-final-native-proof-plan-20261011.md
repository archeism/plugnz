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
filesystem to 4.75 GiB**. These are separate checks: inherited OS bytes are not
free or silently excluded. Before native installation record whole `du`/`df` and
freeze the measured base; check both caps before each phase and after it. This
revision follows the separate Claude proof's measured 3.77 GiB inherited physical
base; it does not assert that this fresh Codex base will have that same size.
Include native tools, Source cache, both homes, rollback artifacts and archive
scratch. Refuse further growth at either cap. Native tools are shared read-only
between homes. Combined concurrent lineage ceiling is **12.5 GiB**: Claude's
explicit 7.25 GiB lineage plus this 4.75 GiB active filesystem and at most 500 MiB
local Codex archive/restore scratch. Retain every failed attempt.
Local compressed evidence, including retained first/final archives, is bounded
to 200 MiB total and complete restore scratch to 300 MiB. The first-attempt
restore cap was explicitly revised before extraction to 150 MiB: the first
actual proof tree measured 107,224 KiB, exceeding the earlier 100 MiB estimate.
Concurrent lineage accounting now allows 500 MiB local Codex storage,
not the earlier 200 MiB, for a rounded **12.5 GiB** total ceiling. Existing
archives/snapshots are not deleted.

No new snapshot is required for this experiment. Verify archive inventory,
hashes and a real restore, and obtain independent evidence review before ending
compute. Record any product-created rollback artifacts that remain pending.
If complete recoverability needs a larger archive or snapshot, stop and revise
the explicit budget rather than silently growing loose copies.

Before the second home or V2/V3 writes, the whole active cap was explicitly revised
from 4.25 to 4.75 GiB, retaining the independent 1.5 GiB new-growth cap. Actual
whole `du` was 3,034,512 KiB and `df` used 4,375,608 KiB after the retained first
archive, still below the original cap. The second home's measured first-home
analogue needs roughly 107 MiB of authored/native stores plus transient native
allocation. Final Source snapshots and complete first/final archive retention
are budgeted before launch rather than removed from accounting. The local caps
above cover both homes and both archives; the earlier first-attempt archive and
115 MiB restore remain retained. No old archives or snapshots are deleted.

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

## First actual runtime checkpoint — not final rollback acceptance

Official installation completed with scripts disabled. The first supplier
verification failed because the platform dependency is an npm alias:
`@openai/codex-linux-x64` resolves to `@openai/codex@0.162.0-linux-x64`.
Correction `24b1ac1` uses the lockfile's actual supplier name and cross-checks
installed name/version, official registry metadata, tarball URL and integrity.
It verifies the already-installed supplier without repeating installation.
Both installer versions and original installation streams are retained.

Actual native executable: 294,410,952 bytes, SHA256
`50ed828f357c655a3c82054d346cab8434f24901f14ec19b8267571bdd008b38`;
version output `codex-cli 0.162.0`. Physical baseline was 3,585,212 KiB and
post-install usage 4,210,384 KiB, both inside the frozen budget.

Public Managed V1 bootstrap in the rollback home reported converged, with
completed durable journals. Actual SDK discovery returned exactly one enabled
`lifecycle-probe:probe` at the expected native cache path. The initial proof
controller then failed its cleanup gate: terminating only the JavaScript launcher
did not immediately close the native child's inherited pipes. The failed script
and SDK response remain retained. Correction `94f66b2`, independently reviewed,
starts a separate process group and kills that group with a bounded close wait.
Explicit bootstrap-only `resume-discovery` skips marketplace setup/product sync,
reuses the original report and writes a distinct SDK response. That retry passed:
237 ms wall, controller 57,938 user / 35,278 system microseconds; all five
capability sets zero, NoNewPrivs enabled, physical disk 4,321,412 KiB after.
The recorded before/after hashes for this retry are **discovery retry surfaces**,
not reconstructed pre-deployment hashes. No V2 refresh or V3 failure is claimed.

Complete first-attempt proof state, supplier metadata, authored scripts, original
failures, original and resumed SDK replies, public report and journal are archived
at `~/.local/state/plugnz-evidence/20261011/codex-final-first-attempt.tar.gz`.
SHA256 `003b79f70414de3a70980bd6a38c546ab608044b15028c28982c175421ad4e80`;
allocated archive 54,748 KiB. A real complete extraction at
`/tmp/plugnz-codex-final-first-restore.wSaKhh` uses 117,760 KiB, below the explicitly
revised 150 MiB restore cap. Independent controller checks reproduced all four
recorded native surface hashes, completed journals/no pending activations, and
the exact enabled native SDK skill. Supplier executable reconstruction uses
retained official immutable tarball metadata/integrity plus the binary hash;
the 294 MB binary body is not duplicated in this evidence archive.
