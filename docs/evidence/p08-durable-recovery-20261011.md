# P08 cross-process recovery checkpoint — 2026-10-11

## Frozen implementation and acceptance

Implementation `f3a4994d26242f302b1e1bda8270e8aee4ee8373` preserves the
incremental commits `6bbc817` and `e06d287`. This evidence checkpoint changes
documentation only. The built Node artifact SHA-256 is
`5fb918d9fef03f8ab4270f22470404f7745142917ea6dfee218e227cbac2759c`.

The latest full gate used Bun 1.4.0:

```sh
PATH=/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin:$PATH bun test --timeout 30000
PATH=/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin:$PATH bun run check
```

Result: **667 passed, five existing skips, zero failures, 4349 assertions**
across 62 files in **204.75 seconds**. Typechecking passed. The skipped cases
are Codex older-slot cleanup, the current Hermes loader, the real Grok loader,
and two official ZCode desktop-detection cases; they are not native proof.

The packed Node public recovery/dcode gate used the supported engine
`/home/charlesfengyc/.local/bin/node` (**22.23.1**) and the existing released
native Python environment (`deepagents-code` **0.1.83**, `filelock` **3.29.7**):

```sh
OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node \
OPEN_PLUGIN_TEST_DCODE_PYTHON=/tmp/plugnz-dcode-native-proof/bin/python \
PATH=/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin:$PATH \
bun test test/recovery-public.test.ts test/dcode-sync-public.test.ts --timeout 30000
```

Result: **20 passed, zero failures, 225 assertions, 51.29 seconds**. These
tests execute the packed Node CLI and actual Python/FileLock with isolated
stores. Their dcode CLI responses are controlled fixtures for deterministic
fault injection: this proves recovery and lock interoperability, not additional
native updater or component capabilities. No real-home deployments occurred.

Independent frozen-checkpoint review approved the correction scope, with no
new high-confidence blocker. Its separate recovery/doctor import gate passed
14 tests and 154 assertions in 27.92 seconds.

## Proven boundaries

Public subprocess tests cover genuine SIGKILL before sealing an accepted new
install and after durable applying intent for install, disable and retirement;
fresh-process rollback and cleanup completion; accepted activation/tombstone
preservation; offline retirement; and retained writable data.

Before recovery writes, all requested Sources remain frozen and independent
scopes receive semantic, policy, route and adoption preflight. Bad-last missing
Source, malformed skill policy and native adoption mismatch regressions prove
earlier pending work remains untouched. Stale native bytes and retargeted
rollback/next-path artifacts are refused without overwriting or deleting a
foreign cache sentinel. Cleanup authority comes from the sealed operation,
not mutable artifact paths.

Journal-only interrupted installs and completed-retirement cleanup remain
visible through read-only `doctor` and `list`. The doctor import gate remains
writer-free. Verified settlement is persisted before backup disposal; retry
does not forget the original journal or falsely report failed Desired as
converged.

Same-command retry is implemented. Cross-command recovery remains a loud,
nonmutating refusal naming the original command and attempt. Mutating unsealed
or legacy unresolved journals are not guessed safe. Other adapters without a
verified native compare-through-cleanup fence remain explicitly unverified;
dcode evidence is not attributed to them.

## Retained failures and raw evidence

The earlier `e06d287` full run recorded 663 passes, five skips and three
failures (4277 assertions, 186.85 seconds). These identified legacy marketplace
alias adoption, ordinary legacy pending diagnostics and zero-mutation retirement
preparation compatibility regressions. They were fixed without weakening their
assertions. Independent review also found skipped semantic preflight, the
accepted-before-seal crash window and mutable cleanup authority; the final
checkpoint includes negative regressions for all three.

An earlier packed run used `/usr/bin/node` 18.19.1 and passed 20 tests/225
assertions in 74.71 seconds. It is retained as supplementary evidence only:
Node 18 is outside the declared supported engine range and is not release proof.

Raw logs are retained outside Git under
`~/.local/state/plugnz-evidence/20261011/`:

| Log | SHA-256 |
| --- | --- |
| `plugnz-f3a4994-full-gate.log` | `39a26d2edff638615454a8f6ea593399b586ca11828da579ae6ea4c948febe06` |
| `plugnz-f3a4994-packed-node22-native-recovery.log` | `54bbc082d5346e74cc32cbb0135764a1a42acd744bc2499e6d2800130b385bb6` |
| `plugnz-f3a4994-packed-node18-native-recovery.log` | `6899cf1b6fd4f3d6dab8584ae0809b65e8145997611c2ccd9fd28ff933e7f49e` |
| `plugnz-e06d287-full-gate-failed.log` | `80815c5fc46f0b18bbc24d415d4f14deb61a1cfc368c45fedc39e4d62d6e42b9` |

Wall times above are runner measurements. Peak RSS and token/cache usage were
not measured. Native dependencies were reused, not copied per attempt. The
Addy API/debugging/incremental/documentation and Matt TDD/review skills were
used unchanged; these product gates are not a skill A/B or improvement claim.
This checkpoint is not publication, consumer-pin or fleet-rollout evidence.

## Integration hold: composed recovery reports

The combined integration checkpoint `b55ecdc` passed `bun run check` and
unmodified `bun test` under Bun 1.4.0: 667 passes, five skips, zero failures,
4349 assertions, 203.79 seconds. Its full log is retained as
`plugnz-b55-integration-full.log`, SHA-256
`8ec51066f6d03a1887c3fbdd70b200c9a2c34b0578edf1966251e2badd045505`.

A subsequent real CLI probe nevertheless found an uncovered reporting defect:
failed recovery in a two-package scope replaced the frozen plan with only the
pending operation, omitting the independent sibling. Personal correctly rejects
that incomplete report, which can obscure the actionable recovery diagnostic.
This is a producer defect, not permission to weaken consumer coverage checks.
The candidate remains off main pending corrected complete-plan reporting,
multi-journal recovery accounting, independent review and fresh verification.

The failing probe and its output are retained in the same evidence directory
(the scratch probe imports the integration worktree's public CLI harness):

| Artifact | SHA-256 |
| --- | --- |
| `plugnz-b55-missing-sibling-recovery.test.ts` | `9df142f82bf7498b6eabb4a10e93f804a23c6908145304296578227c01caafb4` |
| `plugnz-b55-missing-sibling-recovery.log` | `8f2b625286c6207c7f68d6903cba44a85a65206f8461e61ef478767e87fc8e25` |

## Successful recovery accounting: confirmed remaining defect

A subsequent isolated public CLI probe against frozen `9e294ac` recreates the
exact disabled candidate of a pending disable journal, restores the ordinary
Source Desired content and retries sync. Recovery changes native enablement from
false to true; the fresh Desired plan is then unchanged and the CLI exits zero.
Its report nevertheless claims `mutationStarted: false` and `changed: false`.
The final probe fails its aggregate-change assertion (five assertions, 2.98
seconds). This is a real reporting gap, not complete P08 acceptance. It uses a
seeded exact candidate and fake native version/lock fixtures, not an actual
SIGKILL or proof of every native runtime.

Current report parsing rejects duplicate scope/package operations; Personal
also requires one current Desired outcome per submitted pair. Historical
recovery therefore cannot be truthfully accounted for by duplicating current
outcomes, changing an unchanged action to claim a mutation, or treating an old
settlement as current convergence. A separately validated, explicitly versioned
recovery-receipt contract must retain original attempt/operation identity and
contribute to aggregate mutation accounting while leaving current coverage exact.
Changed-intent retry also needs this distinction. The read-only scope inventory
currently exposes only the last attempt, whereas recovery scans all open
journals; original receipts require public proof for nonlatest and journal-only
operations too. No consumer-validation relaxation or capability exclusion is
authorized by this finding.

Retained artifacts in the same evidence directory:

| Artifact | SHA-256 |
| --- | --- |
| `plugnz-9e-successful-recovery-accounting.test.ts` | `b6e7a131de3e8ea940c1512b64cbaf3c034acccd6bca5fc181c99304331eb6ba` |
| `plugnz-9e-successful-recovery-accounting-04.log` | `93d50df9e1aa3c499bb119b5cd4b85109d682d49399a955d54f75e84001742d6` |

## Combined gate and bounded test-budget correction

Frozen integration `3f6c651` passed typecheck but its unmodified `bun test`
terminated with 667 passes, five skips and two failures (4415 assertions,
224.31 seconds). Both failures hit Bun's default five-second deadline in the
existing ZCode multi-CLI activation scenarios. The exact same file passed in
isolation without a timeout override: five tests, 35 assertions, 13.55 seconds;
the affected cases took 2.71 and 3.48 seconds. This is not a green full gate and
is not attributed to a native capability defect from timeout alone.

Only those two multi-CLI test deadlines are now explicitly bounded at 20 seconds;
assertions and production subprocess timeouts are unchanged. Focused recheck:
five tests, 35 assertions, 13.52 seconds; typecheck and diff check passed. A fresh
unmodified full suite on the corrected frozen tree remains required before main.

| Retained log | SHA-256 |
| --- | --- |
| `plugnz-3f6-integration-full-timeout.log` | `04886a6c64d9112d4af3498ae8e0337a6e0571ee7f053c6ee8f4b2fe1b46b72c` |
| `plugnz-3f6-zcode-isolated.log` | `88a698ad077550780e69b6f44a13cf167a9665abe58dab0cc1f8c1042de9f0a3` |

The next frozen tree, `3f18c2f`, passed both ZCode cases but its full suite
terminated with 668 passes, five skips, one failure and one subsequent error
(4413 assertions, 214.51 seconds). The dcode cache-rename SIGKILL test hit its
default five-second deadline; Bun killed its active CLI, and the test's
continuation subsequently observed a null subprocess status. The exact test
passed isolated without an override: 12 assertions, 3.81 seconds. Its explicit
deadline is now 30 seconds, matching other multi-process recovery tests. Focused
recheck passed all 12 assertions in 4.06 seconds; typecheck passed. Native process
timeouts, crash injection and assertions are unchanged; another frozen full gate
is required, not inferred from the focused success.

| Retained log | SHA-256 |
| --- | --- |
| `plugnz-3f18-integration-full-timeout.log` | `31494c011f75cebd97f6614030321ae59f858f37dd04773197e10face7527d6d` |
| `plugnz-3f18-dcode-kill-isolated.log` | `2ef65add1a4d4dec93a6f2210ec6002d8526948d3eda23ab7f2e9268bb86e9b4` |
