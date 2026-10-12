# Combined full gate and private preservation checkpoint

## Full producer gate remains RED

Frozen checkout `9c6dff8` ran `bun test` under pinned Bun 1.4.0. Root session
`10664` completed with exit **1**: **878 passed, 6 existing skips, 1 failed**, 6,420
assertions, 885 tests across 85 files, 597.41 seconds. The failed acceptance is
`test/add.test.ts:350`: the genuine legacy Cursor pending-repair retry expects
success from explicit `add --adopt-existing`, but the unfinished fresh adoption
transaction returns 1. The test was not skipped, weakened or reclassified.

Main publication cannot use this gate as green. Read-only proof/admission work
does not deliver that transaction, its locking or interruption/retry requirement.
The current combined source remains a candidate, not a completed release.

Retained log:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/recovery-native-integration/plugnz-9c6dff8-combined-full.log`.
SHA-256: `1ec63f231587c85bee31d75915dd7873330a8e2af8bfcfd2aa1603d9c4dd26e2`.

## Independently accepted private preservation method

Method freeze `78034fa7bb6b74401305434b6336b5d8989a391f` was merged with history
preserved at `1f4e36e`. It changes proof tooling, not the producer bundle. Its
private large profile retains the independently reviewed 2.5-GiB raw / 2.75-GiB
archive bounds, 6-GiB growth/local floor and 780-second preservation reserve;
ordinary Native and Codex profiles remain unchanged.

Root Spec review and independent Standards review accepted the frozen method.
Corrections include nonblocking worker inventory with a 750-ms fail-closed scan
deadline, exact bigint device/inode staging checks, a real private-profile writer
stop/zero-process/archive/restore regression, and rejection of raw/archive caps at
or below the 256-MiB monitor headroom **before output or transport writes**.

Root independently ran all three focused files under actual Bun **1.4.0** and
Node **22.23.1**: **27 passed, zero failed, 137 assertions**, 13.78 seconds; root
session `83594` exited 0. Independent Standards also ran 27/137, 15.93 seconds.
Typecheck and diff check passed. This is bounded method acceptance, not genuine
supplier build, Native runtime, capacity or throughput certification.

Retained root GREEN log in the same evidence directory:
`plugnz-78034fa-independent-private-profile-bun14.log`, SHA-256
`23d0248395c7ea97c28f9acc74043386fb29b0583462b6dc6ee351d02981da72`.

The first root rerun accidentally selected Bun 1.3.14 via PATH. It is retained as
`plugnz-78034fa-independent-private-profile.log`, SHA-256
`0f6bc9d7561007fa9828b5e7e42b60c04d368114fd86b5d653abe1943d98dc1f`:
26 passed, one failed, because the wait fixture's setup exceeded its two-second
deadline and correctly refused producer launch. No budgets/assertions changed
for the corrected-runtime rerun. This is not a Bun 1.3 positive method claim or
a change to plugnz's public runtime floor.

No ZCode acquisition is launched by this checkpoint. Launch requires a fresh
verified free-space floor and the frozen exact-source workflow. Skills remain
unchanged; no skill A/B result is claimed.
