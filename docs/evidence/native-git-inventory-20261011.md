# Native Git inventory and repeated sync

This record describes controlled public CLI regressions, not a fresh released
Kimi/ZCode Sandbox admission proof. Git transport maps one exact canonical HTTPS
locator to a real isolated local repository; native boundaries are explicit
fixtures. No real home, network Git repository, or LLM API is used.

## Verified defects and correction

- Kimi installed a Git Source with its canonical locator and immutable revision,
  then inventory mislabeled it Local. The next same-HEAD sync failed global
  provenance validation. New receipts explicitly carry Source type, revision,
  and locator; inventory validates the complete tuple and its original marker
  fields. A pre-tuple canonical Git locator/full revision is validated rather
  than treated as Local. Historical missing origins remain incomplete: they do
  not manufacture locator authority.
- ZCode's generic planned identity was bare/source-marketplace qualified, but
  its native installer requires the existing deterministic `ownedMarketplace`
  identity. Lifecycle receipts also confused logical/native identity with
  deployment scope, and mislabeled Git revisions Local. Planning now uses the
  host's existing native mapping, independent of frozen revision; receipts keep
  logical/native identity and explicit scope/Source identity separately.
  Historical receipts with only logical/native ownership are not automatically
  assigned to an unrelated scope. Compatibility needs exact recorded authority,
  not inference from a serialized locator.
- The expanded six-command Cursor contradiction regression exceeded Bun's
  implicit 5-second case deadline under packed Node/concurrent load. Its explicit
  20-second case budget covers the measured complete subprocess workflow. No
  assertion or production timeout was weakened.

## Verification

`bun test test/native-git-provenance-public.test.ts`: four public Git/Local
install → unchanged preview/apply → changed-byte cases, including global
zero-write foreign-origin/scope/invalid-revision rejection and source-free ZCode
retirement retaining data/options: 4 pass, 90 assertions, 31.18 seconds.

Packed Node expanded Cursor contradiction regression: 1 pass, 21 assertions,
4.46 seconds. Typecheck passed. The preceding frozen `75d7bc1` full suite passed
720 tests, 5 skips, 0 failures, 4821 assertions in 348.65 seconds, but the newly
discovered Git regressions blocked its integration despite that green gate.
Raw log retained by the parent at
`~/.local/state/plugnz-evidence/20261011/plugnz-75d-route-full.log`, SHA256
`8023d5e98cb83d7b971eaf528eeec90bfd7abfe8121928fdc5363ee1cc045f7d`.

## Still required

Fresh released-harness Sandbox proof gates newly reachable Native Git behavior;
fixture success alone is not admission. Kimi changed/forced update and
retirement remain independently unsupported/unverified, not delivered by an
unchanged result. Historical ZCode ownership aliases require separately proven
compatibility authority. Fresh Native admission and durable identity migration
are not delivered by this checkpoint.

## Resource-only drift follow-up

The public Local ZCode probe reproduced an unchanged result after changing only
an external user-only skill resource (1 failure, 13 assertions, 6.23 seconds).
Native cache bytes alone were insufficient. New owned projection receipts bind
the external resource fingerprint; inventory and readback inspect the same
bounded resource root and treat missing, dirty, or receipt-less resources as
nonconforming. A redirected/foreign resource root fails before mutation.

The failed-update control also found an actual staging leak: random activation
staging paths were not reconstructible from durable cleanup references. New
stages have deterministic hashed attempt/operation paths and a receipt binding
the frozen Source and projected artifact. Creation refuses an existing path;
cleanup validates that exact receipt, then removes only the operation's stage.
Rollback controls require exact cache/resource bytes and semantic shared JSON,
including unrelated user options/settings; selective JSON restoration may
legitimately reserialize those files.

Focused follow-up command: `bun test test/native-git-provenance-public.test.ts
test/zcode-cli-activation.test.ts test/zcode-cli-lifecycle.test.ts --timeout
20000`: 14 passes, 2 existing macOS-only skips, 0 failures, 188 assertions in
77.08 seconds. Both Git and Local public cases include dirty-resource rollback,
missing-resource repair, foreign-root zero writes and source-free retirement.
`bun run check` and `git diff --check` passed. This is not a new full-suite or
released-native Sandbox gate.

The frozen `432b7d7` full suite finished with 723 passes, 5 skips, 1 failure,
4911 assertions in 385.79 seconds. The sole failed-update case hit its implicit
5-second test deadline. A separate bounded 20-second diagnostic passed its
actual rollback assertion in 4.32 seconds. The parent independently reproduced
both the deadline failure and the bounded passing diagnostic; neither result
is characterized as a green full gate or solely concurrent-suite noise.

## Cleanup authority review correction

Independent Standards review found that the first deterministic staging receipt
could be forged. The same regression on frozen `9ed82c4` reproduced deletion of
foreign replacement stages for both pre-seal projections and hydrated durable
handles (0 passes, 2 failures, 2.51 seconds). The retained isolated reproduction
is `/tmp/plugnz-zcode-stage-red`; raw log is
`/tmp/plugnz-zcode-stage-authority-red.log`.

Pre-seal staging IDs now capture the actual whole-stage fingerprint. Durable
cleanup checks actual plugin bytes against its sealed artifact, external
resource bytes against the hashed plugin receipt, exact outer layout and
generated marketplace/receipt fields, and canonical native resource binding.
No mutable receipt's claimed fingerprint grants deletion authority. Changed
plugin/resources/marketplace/receipt fields, extra foreign files and dangling
replacement symlinks are retained with a loud failure. Intact stage cleanup
remains repeatable after disposal. No public SPI or durable schema changed.

The four-file dependent gate passed 20 tests, 2 existing platform skips, 0
failures, 248 assertions in 100.07 seconds. The subsequent dangling-symlink
negative passed both authority cases with 30 assertions; typecheck passed.
The final ancestor guard's separate activation/retirement gate passed 11 tests,
99 assertions in 21.63 seconds. Stable native-store symlink compatibility still
needs review: home symlinks remain covered, but this guard refuses symlinked
storage/CLI roots. None of these commands is a fresh full-suite or
released-native Sandbox admission.

## Stable native-root links and captured canonical authority

Both review axes reproduced a compatibility bug in the ancestor guard: a
preexisting declared CLI-root symlink installed and verified successfully but
then failed cleanup. The independent positive control was also reproduced
locally (1 failure, 2.45 seconds), retained in
`/tmp/plugnz-zcode-stable-root-red.log`. Stable storage/CLI-root symlinks are
supported, not an intentional exception to scope.

The internal cleanup contract now preserves the asserted handle's existing
private rollback reference (contract checkpoint `eb16558`). ZCode captures an
absolute canonical physical snapshot root, revalidates that exact operation
reference/current native root before mutation, rollback, compensation and
cleanup, and captures canonical root identity in opaque pre-seal staging IDs.
Stable declared links work; retargeted roots, redirected owned-scratch parents
and dangling snapshot ancestors retain foreign data and recovery evidence.
Disposed-stage and artifact-less retirement cleanup use the durable canonical
reference rather than guessing from the current declared path. Historical
noncanonical references authorize cleanup only where the exact physical root
is independently established; ambiguous references remain loud/pending.

Two empty/dangling-edge controls were RED (2 failures, 4.67 seconds) before the
explicit root-hash and snapshot-ancestor checks. A native-failure/retarget
control found lexical compensation attempted deletion in the foreign root and
masked the original failure with a backup-rename error (1 failure, 6.02 seconds).
Compensation now checks captured authority before any restore write and
preserves both the native error and the refusal reason; the control passed
5 assertions in 8.67 seconds.

The preceding five-file gate passed 38 tests, 2 platform skips, 390 assertions
in 96.27 seconds. The final exact activation/retirement/generic-contract gate
passed 32 tests, 0 failures, 249 assertions in 68.91 seconds. Both stable CLI
and storage links cover install → readback → cleanup → retirement → repeatable
cleanup; negatives cover pre-seal (including absent stage), before/after apply,
already-disposed artifact, retirement, stage/snapshot parent substitution and
native-failure compensation. Failure injection now uses the controlled fake
native environment instead of modifying a sealed marketplace. Typecheck and
diff checks passed. These remain isolated factory/CLI fixture proofs, not a
fresh full suite or released-native Sandbox admission.

## Pre-seal cleanup cannot infer snapshot authority

Both independent review axes found a further deletion bug in `fdbba1c`:
an authentic unsealed stage, whose cleanup reference has no rollback reference,
could delete a foreign operation snapshot through a redirected
`plgnz-lifecycle` parent. The authentic intact-stage regression was RED;
the absent-stage control already refused deletion (1 pass, 1 failure,
4 assertions, 1.88 seconds). Raw evidence is
`/tmp/plugnz-zcode-preseal-snapshot-red.log`.

Pre-seal cleanup now never deletes an inferred snapshot. Before disposing its
stage it refuses redirected snapshot ancestors or an existing exact operation
snapshot without captured durable authority. Unrelated snapshot siblings remain
untouched. An earlier stage reference cannot dispose a snapshot captured later
by sealing; the correct asserted durable handle still can. The tests use a
genuine stage before directives/sealing, not a mutated or forged handle.

The final activation/retirement/generic-contract gate passed 36 tests,
0 failures, 266 assertions in 53.03 seconds; `bun run check` passed. Raw log:
`/tmp/plugnz-zcode-preseal-snapshot-focused.log`. Controls preserve foreign
sentinels with the stage present or absent, valid repeatable pre-seal cleanup,
unrelated siblings, sealed/durable cleanup and stable native-root links.
This is a bounded fixture checkpoint pending independent review, not a fresh
full-suite or released-native Sandbox admission.

## Combined main and test-budget verification

`d7583eb` preserves the reviewed cleanup history and merges main `bd2d06f`
(package 0.0.11). The exact frozen full run had 740 passes, 5 skips, 3 failures,
5043 assertions in 531.24 seconds; typecheck passed. All three failures hit
Bun's implicit 5-second case deadline: ZCode fresh-install rollback, ZCode
failed fresh install, and Grok failed-update rollback. The failed run remains
retained, not reported as a successful gate:
`/tmp/plugnz-d758-combined-full.log`, SHA256
`676616c26f225f5b40458648ba04c16a6be175d35b843a5005b7a87ff418ba18`.
Its runner was Bun 1.4.0, but ambient-PATH fixture shebangs resolved Bun 1.3.14.

The bounded 20-second diagnostic passed the original rollback assertions:
4 tests (including an adjacent fresh-install control), 59 assertions, 9.89
seconds; the three failed cases individually took 2.61, 2.55 and 3.02 seconds.
Only those three cases gain explicit 20-second budgets. The final focused run
without a CLI timeout override passed 4 tests, 59 assertions in 8.77 seconds;
typecheck passed. No assertion or production timeout changed. Raw final log:
`/tmp/plugnz-d758-final-explicit-deadlines.log`, SHA256
`11b8eed1db16a003853f26c66ca088763afa016e8edc26ccc71817bdf27db0cd`.

The frozen packed Node gate passed 48 tests, 534 assertions in 255.25 seconds:
Native Git public CLI, precondition, recovery, route contract and ZCode
activation/retirement files. CLI-harness subprocesses used Node 22.23.1 and
the built artifact; factory tests still used Bun 1.4.0. Native CLI boundaries
were fixtures, not a released-native proof. Artifact SHA256:
`d82ecd244e9d06647f7ea528ae614fa5bd0face7042f5e1ae3fa7f680e99d1dd`;
log `/tmp/plugnz-d758-packed-node22.log`, SHA256
`218183d83afcaf4d0ad12efe14c241b791dfd4d5c89e28c2402a084f94f76812`.

Next full verification pins PATH to Bun 1.4.0 for both runner and fixture
shebangs. A passing focused/packed gate does not erase the failed full attempt.

The subsequent exact frozen `53e40bb` full suite, with runner and fixture PATH
pinned to Bun 1.4.0, passed 743 tests, 5 existing skips, 0 failures, 5059
assertions in 433.45 seconds. Typecheck passed; the runner explicitly reported
`test_status=0 check_status=0`. Log `/tmp/plugnz-53e-combined-full.log`, SHA256
`61f0e3b10b82d10acd2912e68a15e3f2df84574c8708212fb81ad11527d5ce29`.

The pre-seal deletion RED and focused GREEN remain retained respectively at
`/tmp/plugnz-zcode-preseal-snapshot-red.log` (SHA256
`7a7a027ac96989ad52fbb8850ab16592ad3c18c95e04d578e89bfed38562f658`)
and `/tmp/plugnz-zcode-preseal-snapshot-focused.log` (SHA256
`bd743e2084ee8a49515054f3ab3f14a488eecb04120ad9266e74b9460e1c9ab6`).

## Genuine historical physical identity: still RED

An isolated public `sync` run from actual producer
`75d7bc1a5db8045b6534f0c29cccd3dd0d6354a3` installed a marketplace package as
physical Native ID `demo@catalog`, with that exact ID in the sealed operation,
registry, cache and strict ledger. This differs from the old legacy `add` writer,
which already used the hashed mapping; inspecting that writer alone cannot
establish historical lifecycle identity. Current planning uses
`demo@plgnz-3c708994a71afe18`. A two-physical-ID transaction is required here,
not an assumed same-root alias equivalence.

Current `53e40bb` dry-run incorrectly plans a successful fresh install; apply
succeeds and leaves both old and new ledger activations and the old cache.
This verified duplicate-ID bug blocks historical migration acceptance even
though the ordinary full suite is green. Immediate global zero-write containment
is the next slice, not delivery of the durable migration or adapter exclusion.

The authentic old Source and home are preserved without invented ownership:
`/tmp/plugnz-75d-zcode-authentic-source-copy-v2` and
`/tmp/plugnz-75d-zcode-authentic-home-copy-v2`. Original capture
`/tmp/plugnz-75d-zcode-public-capture-v2.json`, SHA256
`46c97ef2ec7a5552a43ff0f72321df5bd9a7f6813be71d0e9982a3fb248959cd`;
current RED `/tmp/plugnz-75d-zcode-current-probe.json`, SHA256
`ba88d13fd5b4269c056ecd8fcd1bc338c27e921ae81740e6ee4cbc14e1d4c346`.
Native commands used a controlled fixture, not a released-native admission.
The prior successful capture with incomplete Source retention is also retained;
the v2 replay preserves both Source and home before harness cleanup.

## Historical identity containment (not migration)

The regression now invokes the authentic `75d7bc1` Node artifact in an isolated
CLI harness, then runs the current producer against the resulting installation.
The checksummed compressed fixture is 264 KiB, bounded to 2 MiB unpacked, and
retains repository and bundled dependency license notices. Its provenance and
both independent SHA256 literals are in
`test/fixtures/historical-plugnz-75d/README.md`. No history fetch, real host,
native released CLI or model API is involved.

The new preflight refuses a recorded physical identity change globally before
any lifecycle mutation. Modern exact package identity is sufficient for this
refusal. A v1 import preserves its original qualified `packageId`; exact explicit
Source-relative path plus observed old Native ID and package name can correlate
it for refusal, but does not grant ownership or permission to migrate. When that
Source path is missing or contradictory, the same-Scope, actually present old
Native ID with the selected package name instead yields a loud **unverified**
correspondence failure. No basename inference or qualified-ID rewriting is used.
An absent old Native ID alone does not turn a legacy claim into this proof; the
existing legacy Codex unsupported capability report remains unchanged.

Tests cover authentic modern records, weaker v1 claims and v1 claims without
Source-relative metadata, each in dry-run/apply and as the last Scope of a
multi-Scope batch. They assert no outcomes, no ledger changes and no native-store
changes, including the earlier otherwise valid Scope. The first modern RED was
0 pass / 2 fail; the v1 RED was 2 pass / 2 fail. The missing-path RED was
4 pass / 2 fail / 70 assertions, log
`/tmp/plugnz-historical-native-id-ambiguous-red.log`, SHA256
`0568b93926c1439b9d7c7a0252489bef7fd18fcf3ca75ce232acb3c73f9e6fde`.

Final focused dependent gate: 59 pass / 0 fail / 421 assertions, 31.96 seconds,
including the existing Codex report, planner and mutation-contract controls;
typecheck passed. Log `/tmp/plugnz-historical-native-id-complete-dependents.log`,
SHA256 `edcee64df7e9e73c2263e043afb377579df2d555c7b8f348c42efda084143d2e`.
Packed Node 22.23.1 gate: 39 pass / 0 fail / 176 assertions in 33.47 seconds
(historical identity, public preconditions and CLI-harness controls). Artifact
SHA256 `3195517292d557ddacb93f8b957b87f6442b7d24bb47b2bc9becdb30935511dc`;
log `/tmp/plugnz-historical-native-id-complete-node22.log`, SHA256
`ff7af2f633caf2f3223c29ddc2dcdeaac7c5ccc5df4c2008d323e6dbb5dde549`.
This fixes duplicate-install containment only. The proven, durable two-physical-ID
migration, Native Git admission and fresh released-native proofs remain required;
the earlier `53e40bb` full GREEN is not attributed to this later guard.
