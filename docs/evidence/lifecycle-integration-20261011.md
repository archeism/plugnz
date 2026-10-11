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

Route migration, pending-recovery reconstruction, final producer/consumer release
verification and the complete requirement audit remain open. Released dcode
command/agent/invocation-policy limitations remain loud and human-owned upstream
follow-up; no noncontrolled-repository changes were authorized or made here.

The Addy debugging/API and Matt TDD/review skills were used unchanged. These
product checks do not constitute a skill A/B experiment or skill improvement.

## Offline pin and physical-context checkpoint

Candidate `9631eaa` adds protective disable/recovery durability, offline immutable
dcode pinning and frozen physical target contexts. The full Bun 1.4.0 gate passed
657 tests, skipped five, failed none, and recorded 4200 assertions in 167.27
seconds; typechecking passed. The packed Node public dcode suite using the real
released 0.1.83 Python interpreter passed 12 tests and 97 assertions in 25.44
seconds. The five existing platform/native-loader skips are not native proof.

Personal's real-producer two-Hermes-context lifecycle gate passed 31 assertions
in 13.80 seconds against this candidate. This is not published-artifact or fleet
deployment evidence.

Independent different-model review (Codex, gpt-6-astra) found one blocker:
disable/retirement preparation could emit its refusal but retain the native
lock. Both public regressions were first red (timeout, no process exit).
The capture boundary now releases its lock before propagating any preparation
failure. Independent verification passed both regressions, 16 assertions, in
2.85 seconds: exit 1, original actionable diagnostic, concurrent native bytes
unchanged, no false pending intent. Focused recovery/precondition/disable checks
passed nine tests and 83 assertions in 18.27 seconds; typechecking passed.
The reviewer approved the corrected checkpoint. No skills were modified.

The previous candidate's bounded raw logs are retained outside Git under
`~/.local/state/plugnz-evidence/20261011/`:

- `plugnz-9631eaa-local-full-gate.log`: SHA-256
  `df2fdbbca026afd78f1aabc32bfc3cd5ded4c8e27a9de71b02e61ec39eb85570`.
- `plugnz-9631eaa-packed-native-dcode-gate.log`: SHA-256
  `bca61cb5787ae2bd6fc7dc8d235192a3bac82ff520ac18503dbcb25dada26fba`.

The corrected lock refusal regressions also passed in the packed Node CLI:
two tests, 16 assertions, 2.90 seconds. These use a controlled fake interpreter
to place the concurrent native mutation precisely at lock acquisition; the
separate real-native interpreter gate above proves ordinary lock compatibility.

The final corrected source checkpoint `3040700` passed the full Bun 1.4.0 gate:
659 passed, five skipped, zero failed, 4216 assertions across 664 tests in 61
files, 167.76 seconds; typechecking passed. The retained log is
`~/.local/state/plugnz-evidence/20261011/plugnz-3040700-lockfix-full-gate.log`.
Its SHA-256 is
`4cbbe0d984de7cac6d7e490cdee663cdd16ec5def974640c1ceb53531ac25d27`.

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

The three copied raw files were verified locally against their hashes before
stopping the owned sandbox. Cleanup completed for session
`sbx_7yjopUk71tVjA1Y2rNPXtNB52Tlq`: 192.117 seconds active CPU, 1347.406 seconds
session duration, 4096 MB configured memory, 175 MB ingress and 1.2 MB egress.
The retained raw evidence occupies 256 KB. No sandbox snapshot was created or
deleted, and no real installation or existing backup was touched.
