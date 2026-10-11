# Lifecycle integration checkpoint — 2026-10-11

## Published baseline

Producer release `0.0.8`, commit
`4c1a81ea5590cb53e350e62452a2bf276d93dbb2`, follows preserved-history
integration `3c92d2520be6e1231fd8a785c0f26a4e9d485b10`.
GitHub Node compatibility, publication and main-push workflows passed.
Before integration, the combined local gate passed 635 tests, skipped five,
failed none, and recorded 3996 assertions in 138.26 seconds; typechecking passed.

A fresh Vercel Sandbox, `plugnz-lifecycle-3c92d25`, ran the immutable release
checkout with Bun 1.4.0 and Node 24.21.0. The command was:

```sh
bun test test/lifecycle-public-commands.test.ts test/dryrun-observations.test.ts test/lifecycle-report.test.ts
bun run check
```

Result: 69 passed, zero failures, 203 assertions, 16.03 seconds. Shell timing
reported 16.040 seconds wall, 15.284 user and 3.201 system. Typechecking passed.
This is public-CLI isolation evidence, not a claim that fixture native binaries
prove all real harness behavior. `/usr/bin/time` was unavailable; peak RSS was
not measured. The sandbox had two vCPUs, 4096 MB RAM and 61 GB free initially.
No real-home install or fleet deployment was performed.

## Candidate work

The dcode checkpoint includes independent Spec and Standards review of hashed
adoption, shared native locking, immutable atomic publication and verified-only
cleanup. Its actual released-native updater proof is recorded separately in
[dcode Managed lifecycle evidence](dcode-managed-lifecycle-20261011.md).

Manual removal now selects exact recorded package/native identities and runs
the retirement SPI without fetching Source. A public subprocess regression
passed 12 assertions: offline removal deletes only the selected activation,
retains its writable data and tombstone, and preserves sibling bytes and the
recorded Source authority. Independent Spec review found no blocker. The
planner/executor/precondition focused gate passed 42 tests and 394 assertions.

The consumer's producer-backed gate against the combined candidate passed one
test with 14 assertions in 20.7 seconds: deploy, observed tamper reporting,
same-version source refresh, orphan retirement and source-free last-scope
retirement. This is candidate evidence, not published-consumer acceptance.

## Scope still open

Protective disable execution, recovery resource release, durable offline pinning,
route migration, pending-recovery reconstruction, final producer/consumer release
verification and the complete requirement audit remain open. Released dcode
command/agent/invocation-policy limitations remain loud and human-owned upstream
follow-up; no noncontrolled-repository changes were authorized or made here.

The Addy debugging/API and Matt TDD/review skills were used unchanged. These
product checks do not constitute a skill A/B experiment or skill improvement.

## Combined candidate verification

Candidate `fda9912` includes dcode lifecycle, selective package retirement,
zero-mutation precondition protection, recovery resource release and protective
disable execution. Bun 1.4.0 passed the full local suite: 648 passed, five
skipped, zero failed, 4096 assertions in 179.37 seconds. Typechecking passed.
An earlier Bun 1.3.14 run failed only the explicitly versioned YAML grammar
contract; it was not treated as an acceptable full gate.

The same immutable candidate passed the full Vercel Sandbox suite: 648 passed,
five skipped, zero failed, 4096 assertions in 54.07 seconds; typechecking passed.
The default sandbox process runs as uid 1000 but has all effective/ambient Linux
capabilities, including permission bypass. The initial full run therefore failed
ten permission-injection tests (638 passed, five skipped); those results were
retained. The acceptance run kept every assertion and used:

```sh
setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs bash -lc 'bun test --timeout 30000 && bun run check'
```

The capability observation after dropping privileges showed empty effective,
bounding and ambient sets. Shell timing reported 54.080 seconds wall, 36.670 user
and 10.080 system. Peak RSS remains unmeasured. The 30-second test deadline covers
multi-subprocess scenarios; no failed assertions were skipped or relaxed.

The sandbox also installed released `deepagents-code==0.1.83` into an isolated
Python 3.13.15 environment. The actual native updater probe passed: the managed
null-version entry remained enabled, discoverable and byte-identical while its
normally versioned sibling advanced. Six public CLI tests with the real native
lock interpreter passed 39 assertions in 5.14 seconds. Native environment, source
checkout and Bun tools used 291 MB, 37 MB and 78 MB respectively (406 MB total,
excluding the package-manager cache and downloaded Python runtime).

Raw evidence is retained outside Git under
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/`:

- `plugnz-unprivileged-full-gate.log`, SHA-256
  `8030e00554627c28a4b1605e7c705a1dad4cc6c5e4021e2d7c88ece382668099`.
- `plugnz-native-deps.txt`, SHA-256
  `81b77af4446bfbe61d51727b599e0cb8b603137a93ae9c631593728feab06c66`.
- `plugnz-privileged-full-gate.log`, the failed permission-injection run.

These gates do not close the outstanding offline-pin and recovery-edge reviews,
route migration or final published consumer verification. The five skips are
explicit platform/real-loader prerequisites, not evidence of those native routes.
