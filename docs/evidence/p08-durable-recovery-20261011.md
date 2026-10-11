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
