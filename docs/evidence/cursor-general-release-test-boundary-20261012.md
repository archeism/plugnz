# Cursor general lifecycle and legacy refinement test boundary

Owner decision: ship and verify the general lifecycle first, then complete legacy
adoption refinements. Base: `d0154f1`; isolated branch
`fix/cursor-general-release-test`. No production adapter, protocol, release pin,
timeout or test skip changed.

The old mixed test `cursor > marketplace collection survives add, list, doctor,
legacy pending repair, update failures, and removal` first failed at its obsolete
legacy-success expectation: zero pass, one fail, 10 assertions. It prevented later
ordinary lifecycle assertions from running. Raw log:
`/tmp/plugnz-cursor-general-release-original-red.log`.

The split keeps ALL ordinary add/list/doctor/unchanged/update-failure/retry/removal
assertions active. It adds explicit installed-byte tampering and repair under the
same package version 0.2.0. Previously unreachable later assertions passed without
a general lifecycle product fix. Whole add file: 35 passed / 191 assertions /
10.28 s, no failure. The first split run's legacy diagnostic expectation was wrong
and failed; its raw output is retained at
`/tmp/plugnz-cursor-general-release-split.log`. Actual refusal is internal.invariant:
exact admission proved, but no verified mutation fence and atomic adoption
executor. The final active legacy case asserts that precise actionable refusal,
zero mutation/changed flags, byte-identical native/cache/ledger/Source home tree,
and retention of the original qualified pending claim. It does NOT claim adoption
succeeded. An initial typecheck also rejected this repository's undeclared
toBeDefined matcher; the test now uses the existing declared boolean matcher.

## Required successful-adoption refinement acceptance

The original successful-adoption intent remains required future work; splitting
it does not waive or implement it. Its exact former test remains in Git history
with this exact retrieval command (complete file, no assertion filtering):

```sh
git show d0154f1118c401b2adad780381fdc780dbc45393:test/add.test.ts
```

Its fixture is preserved in the active refusal
regression: original bare marker, same physical native directory, and qualified
`personal@personal` imported pending record. Future acceptance must prove:

1. Explicit adoption succeeds only with verified writer exclusion, native CAS and
   atomic durable adoption executor; no name-only aliases or legacy recovery
   authority are fabricated.
2. Canonical owned activation and marker follow the approved
   [legacy adoption wire contract](../legacy-adoption-wire-contract.md); immutable
   original snapshot/digest, physical journal and verified supersession relation
   remain visible. Do not merely delete history or revive the old silent repair.
3. Unchanged repeat, same-version repair/refresh, failure containment/recovery and
   subsequent removal/retention still pass through the public lifecycle command.
4. Kill/restart and foreign-CAS negatives preserve all siblings/data/options and
   fail loudly; producer/consumer receipt and postcommand verification are real.

General release evidence must not label the refusal regression as successful
adoption delivery. This change has no main push, publication, real-installation
write or upstream issue/PR. Skills unchanged; independent review is required.

Independent review requested an identical retry of the qualified legacy command;
both attempts now assert the same actionable refusal, unchanged home snapshot,
retained pending claim and zero mutation/changed flags. A redundant full suite
was intentionally stopped with SIGINT (exit 130) at the release owner's request;
its retained partial log is not a completed pass/fail claim. Before termination,
the old suite configuration observed historical-CLI proof failures because its
default Node did not meet the Node 22+ gate. Root's sole final combined full suite
must use the explicit verified Node 22+ fixture input and frozen release deps,
with other suites stopped; this branch does not waive those observed failures.
