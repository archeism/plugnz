# Verified duplicate restore cleanup, 2026-10-12

Only five generated duplicate restore directories were removed. Original trial
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
