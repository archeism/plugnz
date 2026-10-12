# Current producer adoption preview: genuine CLI, fixture host boundary

Question: what must Personal do when an exact legacy admission exists but the
producer cannot execute its required fenced transaction? This is a failure-path
protocol proof, not successful adoption or released Cursor capability evidence.

## Frozen executable and fixture

Actual Node 22.23.1 executed the rebuilt `dist/plugnz.mjs` artifact, SHA-256
`d1acbc05a590ae9af01684ea3bf5480ecd65d574f780a877be5f52b0901cb531`.
The artifact was built at source `8e30057`; the independently inspected source
checkpoint was `589a76b` (subsequent changes were documentation only).

The existing lifecycle CLI harness created isolated source, managed/ambient
homes, host stores and a marketplace manifest. Actual plugnz `add` first
installed `demo`; the probe then explicitly seeded a version-one legacy ledger
and marker, ran `scopes --json`, and ran the original complete manifest through
`sync --manifest <file> --dry-run --json`. The Cursor executable is an explicit
fake version-only 2.4.0 boundary. No released Cursor loader, native command,
cross-process fence or migration capability is claimed.

## Verified result

The preview contained an admission matching the exact precommand original,
record digest, generation zero and current operation. It exited one with:

> exact legacy adoption admission was proven, but plugnz has no verified mutation
> fence and atomic adoption executor; original history and native bytes were retained

`summary.mutationStarted` and `summary.changed` were false. Byte snapshots of
every host store, ambient home and managed ledger matched before/after. The
probe also checked the artifact hash before and after and verified copied
fixture bodies/links against its captured inventory. The oracle exited zero
in 0.77 seconds; measured peak RSS was 91,776 KiB. Token/cache usage is unknown.

This admission is not execution authority. Personal must validate the preview
and stop on this internal failure before any mutating sync or later house write.
It must not fabricate a successful preview, drop unrelated desired pairs,
weaken the producer guard or treat CLI exit alone as durable commit evidence.
The successful transaction, execution receipts and post-command durable-history
verification remain mandatory future acceptance.

## Recoverable raw evidence

Permanent directory (404 KiB allocated):
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/personal-preview-current-producer/`.
It contains `probe.ts`, complete command results/stdout/stderr,
`source-provenance.sha256`, manifest/source/native fixture copy and the summary.

- Replay script SHA-256:
  `1b7a5ee4807049eb108d82db6eea943da4dd879e0bb035e6c30bdee29e8adb73`.
- Complete preview result SHA-256:
  `e84c8f6cbecfea84d96913321ab41e4815cf79f4cb6e9498c52462367b7e0992`.

Root independently read the complete replay script and confirmed both hashes.
The fixture's absolute paths describe the captured attempt; relocation does not
grant admission for another live Source/target. Replay against the stated frozen
source/artifact in fresh isolated homes, never against real installations.
No uncontrolled-repository write, Sandbox allocation or real-home write occurred.
Skills were used unchanged; this does not claim a skill improvement.
