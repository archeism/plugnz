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
