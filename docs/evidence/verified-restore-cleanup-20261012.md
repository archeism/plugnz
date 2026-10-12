# Verified duplicate restore cleanup, 2026-10-12

Only the exact generated duplicate restore directories listed below were removed. Original trial
archives, durable copies, metadata, verifier scripts, and failed attempts remain.
No installed plugin, user backup, source checkout, or original trial was removed.

## Recovery sources

- Codex acquisition 02:
  `/home/charlesfengyc/.local/state/plugnz-evidence/20261012/codex-acquisition-02/`
  Archive SHA-256: `c6e967d2c8fe6b49f6e83a15685404676be61b4ff564cf068cc21e511e8b6a6b`.
- Codex acquisition 03:
  `/home/charlesfengyc/.local/state/plugnz-evidence/20261012/codex-acquisition-03/`
  Archive SHA-256: `ca055d81032720a7c1b5190c3597869e3da39e8613b6fdc3650c47192343882f`.
- Kimi final C72:
  `/home/charlesfengyc/.local/state/plugnz-evidence/20261012/kimi-final-c72/`
  Archive SHA-256: `1ec7c0b6e2bc2c7819cdb262818e7e9e7da8ea075cc4d6fa7ae683e7b24ec90a`.

To restore, locate the retained `evidence.tar.gz` in the applicable directory,
verify its digest above, create a fresh empty directory with `mktemp -d`, and
extract with `tar -xzf <archive> -C <fresh-directory>`. The retained inventories
and verifier scripts provide the body, mode, and link checks. Do not overwrite
an existing trial or restore directory.

## Exact removed targets

1. `/tmp/plugnz-codex-acquisition-independent-k8ga7s`
2. `/tmp/plugnz-codex-acquisition03-independent-ANlaQI`
3. `/tmp/plugnz-kimi-c72-independent-hEy4t4`
4. `/tmp/plugnz-codex-b029c54-acquisition-02/restored`
5. `/tmp/plugnz-codex-b029c54-acquisition-03/restored`

Independent reviewer `/root/finish_sync` verified durable archive hashes,
complete restored inventories, file bytes/modes, directory modes, symlink
targets, exact real paths, ownership, and absence of active users before
approving these five targets. The root agent then rechecked each target's
non-symlink directory identity and performed a privileged `/proc` cwd/root/FD
scan: zero uses, no unreadable entries. Removal used the five literal targets.

Allocated duplicate storage removed: **1,719,181,312 bytes**. Filesystem available
space immediately afterward: **8,168,738,816 bytes**. This is a dated measurement,
not a permanent launch authorization: remeasure before any new acquisition.

The previous fresh-restore receipts remain historical evidence. Their named
temporary directories no longer exist; the durable archives above are the
current recovery sources. This cleanup changes no runtime capability claim.

## Second independently verified duplicate cohort

Reviewer `/root/native_git_standards` independently compared original and
permanent archives with every existing restore path/body/mode/link, checked
exact real paths and absence of nested mounts, and performed a privileged
process cwd/root/exe/FD/maps scan: zero users. Root rechecked all 13 exact
non-symlink directories and cwd/root/exe/FD users immediately before removal.
Only these duplicate restores were removed:

1. `/tmp/plugnz-kimi-final-c72-01/restored`
2. `/tmp/plugnz-codex-independent-l0cCtL`
3. `/tmp/plugnz-codex-independent-sB7vWC`
4. `/tmp/plugnz-codex-independent-qlvtsU`
5. `/tmp/plugnz-codex-independent-fqqVXW`
6. `/tmp/plugnz-codex-independent-kmHr6b`
7. `/tmp/plugnz-codex-independent-DVb0L5`
8. `/tmp/plugnz-codex-b029c54-rollback-02/restored`
9. `/tmp/plugnz-codex-b029c54-foreign-01/restored`
10. `/tmp/plugnz-codex-b029c54-cache-01/restored`
11. `/tmp/plugnz-codex-b029c54-inactive-01/restored`
12. `/tmp/plugnz-codex-b029c54-sparse-01/restored`
13. `/tmp/plugnz-codex-b029c54-malformed-01/restored`

Native Codex recovery archives and all metadata remain at
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/codex-native-final-c72/`;
the [accepted Native receipt](codex-b029c54-native-accepted-20261012.md) records
the six exact archive hashes and restore instructions. Kimi uses the permanent
archive above. All original archive/config/receipt/helper/log parents and failed
guard attempts were retained; no user backup or real installation was touched.

This cohort's unique allocated duplicate bytes: **483,463,168**. Available space
immediately afterward: **8,322,068,480 bytes**. Other machine activity can change
free space, so this difference is not attributed entirely to this cleanup and
the launch-time floor must still be rechecked. No throughput or capability claim
is added by deleting these verified duplicate copies.

## ZCode acquisition 01 duplicate restores

Independent reviewers `/root/native_git_standards` and `/root/finish_sync`
verified both complete restore inventories against the permanent archive:
28,673 regular files, 2,695 directories, five links, 921,576,867 logical file
bytes, full content hashes and modes, no extras, and only the previously
declared 41-byte acquisition identity omission. Both confirmed canonical
non-symlink roots, no nested mounts and no live process users.

Root immediately rechecked canonical identities, mountinfo, process
cwd/root/exe/FD/maps and the permanent archive digest, then removed only:

1. `/tmp/plugnz-zcode-acquisition-01/restored`
2. `/tmp/plugnz-zcode-acquisition-01-independent-AbGdjr`

Allocated duplicate bytes removed: **2,045,112,320**. Preserve the original
`/tmp/plugnz-zcode-acquisition-01/` parent and its archive, helpers, config,
receipt and logs. The permanent recovery archive is:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/zcode-acquisition-01/controller-output/evidence.tar.gz`.
SHA-256: `0dcbff1a305fc936f80c4f411164cdee89b4f6fda28b9db1be0922ba441db143`.
Permanent metadata and verifier outputs remain under the same cohort's
`controller-output/`, `launcher-setup/` and `independent-verification/` directories.
Restore to a fresh empty directory using the command above, then run the
retained verifier; the two removed paths are historical receipts, not current
restore locations. This does not delete or reclassify the failed acquisition.

Before cleanup, free space was **449,605,632 bytes**, insufficient for a new
acquisition. The independently reviewed cohort-02 launcher at `917e6ad` is
prepared, not executed. Recheck the unchanged **6,442,450,944-byte** free-space
floor before authorizing any new VM; removing these duplicates does not itself
meet that floor. No real installation or user backup was touched.
