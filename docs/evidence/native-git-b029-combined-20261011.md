# Native Git combined verification checkpoint

Frozen production/test checkpoint: `b029c5446f1308ea4b49ab6b2da8763ee12959d2`.
Main parent remains verified release `1427cc2` (0.0.12). This receipt is not
main integration, npm publication or a complete native acceptance claim.

## Combined gate

Root ran Bun 1.4.0 with the same pinned Bun first on fixture child PATH:

- `bun test`: 834 passed, 6 existing opt-in/platform skips, zero failed;
  5811 assertions, 840 tests across 74 files, 521.90 seconds. Terminal handle
  `80644` exited 0. Log `/tmp/plugnz-b029-combined-full.log`, SHA256
  `ec933d3f1f6ec28fc362c6c8e8c74580fc1b9650329eb098862bf06f21dfaabe`.
- `bun run check`: exit 0. Frozen Codex file hashes remained unchanged.
- Built artifact SHA256:
  `c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606`.
  Its 0.0.12 label is an unreleased candidate label, not the registry artifact.
- Actual Node 22.23.1 public CLI gate, seven Codex/Kimi/Source suites with
  `OPEN_PLUGIN_TEST_PACKED_NODE`: 53 passed, zero failed, 554 assertions,
  153.33 seconds. The Bun test driver and fake native launchers still use Bun;
  only the public CLI uses Node. Log `/tmp/plugnz-b029-packed-node-public.log`,
  SHA256 `f50d1732d2e8e16ea35cbccd99b6b6f52de507dab2fd9bfe69654ea38bf34f95`.

Independent Kimi and Codex correction reviews returned bounded LGTM. No source
changes followed those frozen production hashes. Actual released-native gates,
preservation workflow wiring, historical adoption and consumer convergence
remain separate unfinished requirements.

## Smoke runtime selection correction

After the full gate, the root found that both shell smokes put `/usr/bin`
before the selected Node directory. On this machine that selected Node 18.19.1
even when the intended runtime was Node 22.23.1. The corrected scripts create
an isolated node-only shim first on their Bun-free PATH and assert identical
`process.execPath` before checking the artifact. NVM npm/npx discovery no longer
replaces the selected runtime. This changes test scripts, not the application
artifact or declared runtime floor.

Both corrected scripts passed independently under actual Node 22.23.1:
Bun-free version/lifecycle legs, populated isolated doctor parity, tarball
installation, installed shebang, npx, bunx and legacy alias. Independent
gpt-5.6-sol review also ran both scripts, syntax and diff checks and returned
LGTM; artifact SHA256 remained unchanged.

Root logs:

- `/tmp/plugnz-b029-node-smoke.log`, SHA256
  `a5d8bb4f5fefc18de553eacd0d974a9b3bfd57d71725776d6f229cc325e7d935`.
- `/tmp/plugnz-b029-tarball-smoke.log`, SHA256
  `ff2451e51075bd3f20bbfc493355fef152db869cb33f207ccbe778d297ea39bb`.

The full-suite result above precedes the two shell-only corrections; it is not
misrepresented as a full run of a later tree. No real-home diagnostics, fleet
deployment, backup deletion, external submission or skill revision occurred.

## Final tree gate after smoke corrections

Frozen checkpoint `6289a7db7086ebe6c41462e2e7ed1c624285368f` also passed the
complete suite: 834 passed, 6 existing skips, zero failed, 5811 assertions,
840 tests across 74 files, 507.82 seconds. Root handle `52367` settled exit 0;
the following typecheck also exited 0. Artifact bytes remain the same `c72c6e`
SHA256 above. This receipt update follows verification without production or
test-script changes.

Final log SHA256:
`8a703f45e7da8257600519e199a3eb89e44a2ba856961ccbbd71cea393533f51`.
The five root verification logs are additionally retained outside temporary
storage at
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/native-git-6289/`.
Actual released-native acceptance and main integration are still pending.

## Preservation integration gate

Frozen combined checkpoint `f470a0d` includes the reviewed namespace-preservation
workflow. Root full suite settled exit 0 (handle `8284`): 843 passed, six existing
skips, zero failed, 5865 assertions, 849 tests across 76 files, 565.55 seconds.
Following typecheck exited 0. The application artifact remains the exact `c72c6e`
SHA256 above; only preservation scripts/tests/docs were integrated.

Full log `/tmp/plugnz-f470a0d-combined-full.log`, SHA256
`0556707646a4be8e51d8bc54ef58ccd7315b83732ffb528be39593e761181246`.
The later acquisition-budget correction was merged at `57dfe5b` after this full
gate. It independently passed both author and reviewer 14-test/69-assertion
controller/namespace gates; this paragraph does not claim a full-suite result
for that later tree. Root independent review keeps Native arms at 100 MiB,
acquisition-only archives at 768 MiB with 896 MiB scratch reserve, the actual
630-second acquisition preservation reserve, and 3 GiB whole-filesystem growth.

The subsequent exact frozen `cd0a66c` full suite, including those reviewed
budget-boundary regressions, settled exit 0 (root handle `10147`): 848 passed,
six existing skips, zero failed, 5880 assertions, 854 tests across 76 files,
531.56 seconds. Following typecheck and diff check passed; artifact SHA256
remained `c72c6e`. Log `/tmp/plugnz-cd0a66c-combined-full.log`, SHA256
`05e0891fbc8146bd67a56348368d173b773b9bbbcf6c4032d758f8ce06a145ed`.
The later Kimi proof-script/receipt integration is not attributed to this
earlier frozen full-suite result. Main remains unchanged pending Native gates.
