# Recovery/native integration checkpoint, 2026-10-12

Candidate merge: `40ab2b10e0b068464b9f8a7392d6b73dac72b227`, combining
`2cfd1f2` with reviewed recovery/adoption-proof foundation `3234c72`.
Commit history was preserved. Main and the real installation remain unchanged.

The sole manual conflict in `src/planner.ts` retains both safeguards: the
existing changed-physical-identity/global-refusal checks and the new explicit
expected-adoption admission refusal. No ownership or migration authority is
inferred. Independent reviewer `/root/finish_sync` checked this resolution and
the auto-merged executor, recovery, command and report boundaries against both
parents: bounded integration LGTM, no concrete blockers.

## Executed gate

Pinned Bun 1.4.0 executed:

```sh
bun test test/cursor-adoption-projection-public.test.ts test/legacy-adoption-public.test.ts test/legacy-adoption-proof.test.ts test/legacy-adoption-record-public.test.ts test/recovery-inventory-public.test.ts test/recovery-proof.test.ts test/recovery-public.test.ts test/recovery-receipts-public.test.ts test/native-identity-preflight.test.ts test/same-physical-native-identity-public.test.ts test/native-git-provenance-public.test.ts test/lifecycle-report.test.ts test/sync-manifest.test.ts test/doctor-imports.test.ts
bun run check
git diff --cached --check
```

Results: **93 passed, zero failed, 1,079 assertions**, 14 files, 178.64 seconds.
Terminal root session `23263` exited 0. Typecheck and staged diff check exited 0.
All homes/native stores in this gate are isolated fixtures; NativeGit launcher
fixtures are not genuine released-harness runtime certification.

Retained log:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/recovery-native-integration/plugnz-recovery-native-combined-20261012.log`
SHA-256: `82e4072dfd6be16418616198716e71646586e093ed8b66ba5829f4715c232f72`.

## Explicit limits

This integrates strict historical recovery receipts, immutable legacy-proof
readers, history/wire foundations and Cursor's read-only projection proof. It
does **not** implement fresh adoption admission/execution, cross-process locking,
the two-physical-ID ZCode migration, or consumer cutover. Those requirements
remain outstanding. No runtime floor, dependency, real-host deployment, or
outside repository was changed.

The frozen C72 binary remains evidence for its original producer only. The newly
combined production source requires its own rebuild, full gate and final artifact
verification; earlier Native trials are not reattributed to this new source.
Addy/Matt skills are unchanged; this is product integration, not a skill A/B win.
