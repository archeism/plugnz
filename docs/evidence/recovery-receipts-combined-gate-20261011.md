# Combined recovery receipt verification

Frozen candidate: `c89f57e`, based on released `bd2d06f` (0.0.11), with reviewed producer receipt contract `f6b92a5` merged preserving history. This candidate is not a published artifact.

## Initial full gate

`PATH=/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin:$PATH bun test` (Bun 1.4.0): **682 pass, 5 skip, 2 fail, 4563 assertions, 689 tests / 65 files, 268.68s**.

Failures are not waived:

- `test/add.test.ts`, Cursor marketplace collection / legacy pending repair: expected exit 0, received 1. This is a behavioral regression requiring investigation before integration.
- `test/lifecycle-public-commands.test.ts`, scenario 1: the default 5-second test watchdog killed the multi-command test at 5034.29ms, leaving incomplete JSON. An unchanged focused diagnostic with `--timeout 20000` passed all 10 assertions in 4.45s (case 4299.06ms). The test now has an explicit 20-second transport budget; assertions and production timeouts are unchanged. This diagnostic is not a passing full gate.

The separately invoked `bun run check` passed. A packed Node 22 / real isolated Python FileLock gate was running alongside the initial full gate; contention is possible, not a proven explanation for either failure.

Raw full output is retained at `~/.local/state/plugnz-evidence/20261011/plugnz-c89-receipt-full.log`, SHA256 `224b69f635c7656150adc81ac7ece328b36a3a05372a0139773d85fd6855e4a3`.

Integration remains blocked until the behavioral regression is repaired and the resulting frozen candidate passes the full gate and independent review.

## Focused packed recovery gate

The frozen `c89f57e` artifact was built with Bun 1.4.0 and passed Node 22 syntax validation. Its SHA256 is `0e319b239d716e3d55c6a4af85f1419e03d296f67793637355188fc979596d9c`. Its embedded 0.0.11 version does **not** make it the actual published 0.0.11 artifact.

`OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node OPEN_PLUGIN_TEST_DCODE_PYTHON=/tmp/plugnz-dcode-native-proof/bin/python bun test test/recovery-public.test.ts test/recovery-receipts-public.test.ts test/dcode-sync-public.test.ts` (designated Bun 1.4.0 on PATH): **28 pass, 0 fail, 395 assertions, 106.11s**. The Python runtime is isolated deepagents-code 0.1.83 / FileLock 3.29.7. Native CLI boundaries remain fixtures; this is packed-runtime and real locking proof, not proof of unsupported native component capabilities.

Raw output: `~/.local/state/plugnz-evidence/20261011/plugnz-c89-packed-recovery.log`, SHA256 `99f77bf5364721a906a4d6834913723e0d61f1d4f6fc1a703c04bd74b790cc70`.

Scenario 1 with its committed explicit 20-second budget, without a CLI timeout override: **1 pass, 10 assertions, 4.26s** (case 4050.50ms). Raw output: `~/.local/state/plugnz-evidence/20261011/plugnz-receipt-scenario1-explicit.log`, SHA256 `7f2aae2a990c254d35606244fa635601ea93f65f9d5999cdbf9057e79e5ce0e7`.

## Reviewed consumer and published baseline compatibility

Both independent review axes approved Personal `216ef2a...e658803` as a bounded consumer correction. Their focused results were 52 tests / 246 assertions (17.24s and 18.98s); composed actual-candidate Node checks passed 3 tests / 69 assertions (12.37s and 13.86s). These validate the locally built unreleased receipt candidate, not publication.

A separate root check ran the existing live-status / same-version repair / source-free retirement baseline against the **actual downloaded public 0.0.11 artifact**, through Node 22, with fresh fixture HOME and isolated PATH: **1 pass, 31 assertions, 9.19s**. The two new receipt-specific cases were explicitly filtered out because the published baseline does not contain the new contract. No new-contract publication or dependency-pin claim follows from this result.

Raw output: `~/.local/state/plugnz-evidence/20261011/personal-e658-public-0011-baseline.log`, SHA256 `f568ac94b141e141883dea80c8342758dca3ef9a5c23370901f3f15bee6f971f`.

The same bounded baseline also passed against the retained actual public 0.0.9 tarball (Personal's unchanged production pin), extracted into a fresh temporary directory and invoked through Node 22: **1 pass, 31 assertions, 6.30s**. This is backward-compatibility evidence, not recovery-contract delivery; the new receipt-specific cases were again explicitly filtered out. Raw output: `~/.local/state/plugnz-evidence/20261011/personal-e658-public-0009-baseline.log`, SHA256 `e87c455b7e743fbd4542662bc078c6014708686d37f26aa8e8f3a950ade92e1f`.

Personal integration candidate `c4440dcd4cf6248c095b2cdb9cc56654c29938a6` preserves all three consumer commits above current remote main `cdd46b0`. Root `bun run check`, with fresh HOME and PATH limited to designated Bun 1.4.0 plus `/usr/bin:/bin`, completed **exit 0**. The deployed-banner audit explicitly reports no plugin host and nothing to audit. Upstream freshness remains explicitly unverified; the existing pin notice reports 0.0.9 versus registry 0.0.11 and is not a rollout. Raw output: `~/.local/state/plugnz-evidence/20261011/personal-reader-merge-full.log`, SHA256 `d2f2e728c36254c0508430e5ec0e55f63deeb7fde5a0763177e415708625d07b`.

The full combined Standards review, not merely the final increment, approved `cdd46b0...c4440dc` after independently verifying 52 focused tests / 246 assertions (22.09s) and 3 actual candidate composition tests / 69 assertions (17.19s).

Root's exact `bun run check:plugin-lifecycle` also passed 52 tests / 246 assertions (21.26s), followed by the Hermes skip safety gate. Raw output: `~/.local/state/plugnz-evidence/20261011/personal-reader-merge-lifecycle.log`, SHA256 `517c31d5f2f9ac70df78f1476b40efd259f9a9e1134bb64bea461ae3b6d9ffae`.

**Full-range Spec review blocks this candidate.** A permitted completed, verified historical receipt may retain its uniquely identified `summary.readbackId` while current outcomes converge and `recoveryId` is null. Parsing accepts this valid report, but `plugin-sync.ts` treats that historical readback pointer as unfinished recovery; actual public `deployPlugins` then hard-blocks and performs unnecessary read-only probes. Existing composed producer outputs clear successful readback IDs, so passing them does not cover this edge. The fix must exempt only completed verified historical readback, retaining hard blocks for pending, invalid, failed, or potentially changed state. No consumer main push occurred; a new candidate requires re-review and isolated gates.

## Consumer blocker resolution and main integration

The historical-pointer defect was repaired in Personal `50963b0`. Review then
found a distinct summary-only current readback failure that incorrectly inherited
the exemption; `4d3fc30` restored that required read-only probe. Both are actual
public-boundary RED→GREEN checks, not waived failures.

The full combined consumer was independently approved by both axes, with current
Desired/retirement coverage and complete historical membership retained. Two
measured existing multi-CLI watchdog cases now have explicit 20-second test budgets,
without assertion or production-timeout changes; their failed reviewer attempts
remain documented. Root's final exact lifecycle gate passed **57 tests / 273
assertions / 32.88s**, and its fresh isolated full `bun run check` passed. Raw logs:

- `personal-reader-ship-lifecycle.log`, SHA256 `955be759f4af0d6625eef4c44240bac7032e294698230984fc9aa950d0b7058b`.
- `personal-reader-ship-full.log`, SHA256 `c50434cd1392619e8170f85a7f9ebc84798fe2858af3df9db14b031f12d38681`.

Both live under the same retained evidence directory above. The unrelated remote
main journal commit `16e14ff` was merged preserving history; no user change was
discarded. Personal main integration is **`3daf6ca8d358c052a1c5d92bb1e40a195af03778`**,
verified by remote ref after successful push. CI run **38173798571** was queued at
that checkpoint. Subsequent authoritative inspection confirmed **completed / success**
on the exact `3daf6ca` head: both `check` (including lifecycle and full checks) and
`fixed log` jobs passed. [CI evidence](https://github.com/archeism/personal/actions/runs/38173798571).

Personal's production pin remains **0.0.9**. This integrates the reviewed compatible
consumer, not the unreleased producer receipt contract or a fleet rollout. Producer
legacy adoption remains a design/implementation blocker. Actual Claude native
proof separately exposed malformed foreign-marketplace global-config false-green,
which also remains a product blocker; a clean native lifecycle pass does not waive it.
Skills are unchanged; no method-improvement claim is made.
