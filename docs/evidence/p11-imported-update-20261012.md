# P11 imported updates use the shared lifecycle core

Base: released `890e03b169a301f256223a19abd340d03485f845` (0.0.14).
Scope: [P11 #57](https://github.com/archeism/plugnz/issues/57), exact Source/package/native binding, pins before activation, one freeze/prepare/apply/readback/journal/report contract. This is an unpublished branch checkpoint, not a fleet rollout or legacy-adoption executor claim.

The published CLI used the shared core for v2 updates but sent v1 updates through `runUpdate`. A renamed marketplace with the same package name therefore wrote pending intent before refusing, and pin repair happened after activation. The CLI now imports v1 through its existing reader and uses the same lifecycle command as v2. Provenance-qualified imported identities are resolved through the existing adapter's exact native identity set before submission. A mismatch is a global preflight refusal. The core freezes/preflights every selected Source before writes; its executor applies recorded pins before sealing the projected fingerprint.

The old update engine and CLI result reconstruction are deleted. Exhaustive production/test import scans found no caller other than `src/cli.ts` and `test/update.test.ts`; package metadata exposes only the bundled CLI, not source-module exports. The old source and every original test remain recoverable at the base commit. Cleanup-only readers/removers remain; updates refuse with typed capability reasons. `--legacy-json` remains the existing core report serialization, not a second mutation engine. Doctor's writer-free import boundary is unchanged.

## Input provenance and compatibility limits

| Fixture | Proven behavior / limit |
| --- | --- |
| Cursor v1 bare ledger + existing modern scoped ownership marker | Compatible same-version update succeeds, records v2 journal/readback and sealed pinned fingerprint. This ledger downgrade is not certification of every pre-core install. |
| Kimi v1 bare ledger + scoped marker rewritten to historical bare `pluginId` | Existing canonicalization protection is retained verbatim: adapter-proven same physical identity updates to `demo@personal`. Modern scope/provenance fields remain; this is not an authentic three-field old marker. |
| Cursor genuine historical three-field marker + v1 owned or pending record | Unproven ownership/pending legacy authority refuses globally before writes; no replacement executor is invented. |
| Kimi genuine historical three-field marker + v1 owned record | Refuses before mutation and preserves ledger/marker bytes. The omitted scope/provenance needs independent authority proof; current missing adoption/fence work remains open. |
| Dcode 0.1.83 fake version/lock boundary + v1 ledger + agent-bearing Source | Returns typed `capability.unverified` profile refusal before mutation; the old fallback returned `recovery.required` after writing pending intent. No native dcode or agent execution is claimed. |

## Explicit old-test migration

These are mappings of individual old `test/update.test.ts` cases, not a claim that a lower test count preserves every obsolete implementation assertion. Public behavior now lives at the real CLI; fault injection lives at the already-public lifecycle host SPI. Old alias-save callbacks, mutable writer-array substitutions and exact private hook counts disappear with their engine. Where the prior expectation allowed partial writes after a deterministic defect, it is replaced by #35's global-preflight requirement.

| Original case at base | Exact surviving/new protection |
| --- | --- |
| target detection exception | `update.test.ts`: original test retained; core catches detection exceptions into uncontaminated preflight JSON. |
| canonical/legacy identity captured once before dry/applied update | `imported-update-public`: renamed marketplace zero-write refusal; existing `lifecycle-public-commands`: exact-source and duplicate-scope identity cases. Private hook call-count assertions are obsolete, not claimed equivalent. |
| name outside target inventory | `update.test`: `public update refuses not-a-target before Source access`, exact usage code and byte retention. |
| active Hermes empty ledger | `update.test`: empty detected host success, empty outcomes, unchanged stores/ledger; host-specific selection is separately retained by Hermes public lifecycle tests. |
| cleanup-only Pi update | `update.test`: Pi refusal, exact capability code, no Source access/ledger change. |
| selected writers leave other hosts untouched | new `update.test`: `public update of a selected host preserves the other host recorded scope`, exact unselected scope/activation and native-store preservation. The unselected Kimi record is a legal fixture, not Kimi delivery evidence. |
| successful target finalized before later failure | `executor.test`: new `an update completed before a later failure stays confirmed while subsequent updates stop`, exact ledger fingerprint/journal and third-host retention. |
| post-intent writer refusal requires recovery | `executor.test`: new update `managed:apply` failure plus existing sealed-handle recovery tests; no untyped old writer callback remains. |
| later updates stop and frozen rows survive | new update completed-before-failure test requires `succeeded/failed/not-attempted`; new five-phase update faults require second update not attempted and byte retention. |
| pin inventory exception | new update `pins` fault proves staged preparation fails before apply; `imported-update-public` unresolved recorded pin proves actual CLI prior retention. The old installed-store pin inventory callback is obsolete because pins precede activation. |
| failed finalization not flushed by later save | new update `finalize` fault replaces the fixture ledger destination with a directory, causing its real finalization write to fail; rollback restores the applying ledger, and assertions reject a false completed journal or later update. Old aliased `writeState` callback is deleted. |
| readback/final-ledger terminal failures | new update `readback/finalize` faults and existing executor readback mismatch/recovery tests. Core rollback semantics replace legacy false-complete/partial-finalization behavior. |
| earlier completion survives later host-probe defect | existing planner `a deterministic ownership defect in the last scope plans nothing and writes nothing`; update Source global-preflight public test. Under #35 a preflight defect permits no earlier completion; obsolete partial-success expectation is intentionally removed. |
| later completion after earlier Source cannot resolve | new `public update freezes every recorded Source before an independent update can write`, exact zero-write state/stores. Prior continuation contradicted global freeze/preflight. |
| distinct legacy packages share logical name | existing `lifecycle-public-commands`: `update pointed at a different source locator keeps the recorded install`, duplicate Source scope ownership refusal; qualified imported renamed-marketplace test. No update mutation engine can select by logical name alone; the existing identity reader must prove adapter equivalence before submission. |
| pin rewrites vs native unchanged/refusal | existing public `a recorded pin is reapplied before the projected fingerprint and survives update` / `update drops a recorded pin whose server is absent from the new source`; imported sealed-pin and unresolved-pin controls. |
| actual CLI dry-run clean JSON | new public `dry-run` case requires one serialized report and exact ledger/store retention. |
| corrupt-state dedicated JSON reason | new public `corrupt` case parses one versioned report; shared reader retains `internal.corrupt-state`. |
| Kimi historical bare canonicalization | original public test retained; genuine three-field refusal appended with provenance distinction above. |
| Kimi copy refresh and recorded SHA advance | new public `refresh` updates real same-version bytes and v2 state; existing modern update exact-source regression retains source revision/readback contract. |
| without name updates every record | new public `all` case plus completed-before-later-failure multi-record update SPI. |
| dry-run writes nothing | new public `dry-run` exact state/store retention. |
| recorded pin re-applied | imported public sealed-pin positive and surviving modern pin test; fingerprints are sealed before apply. |
| pin no longer resolves | imported public unresolved-pin refusal, prior native store byte-identical. |
| no ledger record | new public `unknown-name` refuses before mutation and retains all stores/ledger. |
| empty ledger | new public empty-host success requires empty outcomes, no ledger/store mutation. |
| host absent | new explicit unavailable-host public test requires nonzero usage refusal and unchanged stores/ledger. Inferred absent targets remain outside detected selection. |
| Source no longer provides package | new public `missing-package` follows existing modern `usage.invalid-selection` exit 2, zero writes; v1 renamed binding returns internal preflight refusal. |

## Retained attempts

Logs under `~/.local/state/plugnz-evidence/20261012/p11-imported-update/` retain the initial RED, core/mapping probes, obsolete-test failures, migration failures, Kimi historical probe and final gates. `red.log`: 0 pass / 2 fail (renamed mutation; old engine lacks sealed v2 pin evidence). `dcode-red.log`: release baseline 0 pass / 1 fail, typed recovery after pending write rather than a capability refusal. Tests use Bun 1.4.0; fake host boundaries only, no real home, native runtime, model, credentials or Sandbox use.

Root owns independent review and the combined full gate before integration. No package publication, Node-policy, shared lease, Source interface, Native capability or adoption-fence change. Skills used unchanged; no method-improvement claim.

P11 remains open for the literal compatibility requirement wherever authentic
pre-core v1 updates need the still-missing adoption executor/fence. This safety
checkpoint does not redefine those old formats as out of scope or count a ledger
downgrade as their successful migration.

The inherited modern contract reports a missing recorded package as
`usage.invalid-selection` / exit 2, whereas the removed v1 engine returned exit
1. The migration explicitly tests that distinction; it is not silently called
full compatibility. Missing Source and exact imported-binding refusals remain
nonzero with zero host writes.

## Gates

Pinned test/check runtime: `/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun`
1.4.0 (`34cbb9a40`); packed runtime: Node 22.23.1. No runtime policy changed.

- Final focused `bun test test/update.test.ts test/imported-update-public.test.ts test/executor.test.ts`: **56 pass / 459 assertions / 25.91s**.
- Relevant dependencies `bun test test/update.test.ts test/imported-update-public.test.ts test/executor.test.ts test/lifecycle-public-commands.test.ts test/precondition-public.test.ts test/doctor-imports.test.ts`: **106 pass / 687 assertions / 101.77s**. This preceded equivalent matcher replacements and the final extra selected-host control; the final focused gate covers those final edits.
- Built candidate under Node: `OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test test/imported-update-public.test.ts test/update.test.ts`: **20 pass / 135 assertions / 16.42s**. This preceded the final selected-host test; production source was unchanged afterward.
- `bun run check`, `bun scripts/build.mjs`, `git diff --check`: exit 0. Initial narrow test-declaration matcher failures are retained in `check.log`; no declarations or assertions were weakened.

| Log | SHA256 |
| --- | --- |
| red.log | `05cbba3736c991d4e2da3832e4272b36cc7e187deb6322e068132085bced040a` |
| final-focused.log | `a45c1a56689a47a72721b27ba04c94f70d0992051e0b4d4b01d9035eae161b7d` |
| dcode-red.log | `bc7a53ae3132b9848017689cfc307e29583c8de81c4cd5f926d85821e712d95f` |
| dependents-final.log | `ae900fd925a05675fb0848938be9ca4ea55ddea9421e7873d4e53da9a5e5a1e1` |
| packed-node-green.log | `73ecda062a0f4a0c44a7f0cc51c28c934d8258d25fc3cead2fde5dfa10354b29` |
| target-selection-green.log | `c2316957a6e1d9d2f0ef9fd57ebe059d00f0f2f965044bb0bc1dd1f6a22ecd49` |
| check-final-green.log | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| build.log | `d1c648ee2c3535fa2814103c2d3dd4a64f9a9dcc45322fff945d663a590af87a` |

All intermediate failures remain beside these logs: core and mapping probes,
the obsolete helper-dependent suite, migration mismatch attempts, and the
invalid selected-host fixture's diagnostic. Its generated scope incorrectly
reused another scope's last-attempt ID; the corrected fixture omits that false
history claim and proves exact unselected-record preservation.

## Independent review correction: qualified imported selection

Independent Spec found that `8fe0303` rejected `update demo@personal` for a v1
bare `demo` row whose exact Source and adapter proved that qualified identity.
The new public regression failed at that checkpoint (0 pass / 1 fail). A
Source-derived qualified name is now accepted only when the existing adapter
capture resolves the persisted identity and its exact equivalence set contains
the requested selector. The captured result is reused for manifest selection;
no name-prefix matching, broader Source fallback or legacy ownership relaxation
was added. The foreign-marketplace control requires the exact
`internal.ambiguous-ownership` diagnostic, empty plan and unchanged ledger/store;
the valid selector requires successful updated native bytes.

This positive still starts with a modern scoped marker and downgrades only its
ledger. Genuine three-field legacy-marker refusals and the unfinished P11
compatibility requirement remain unchanged.

- Focused correction: `bun test test/imported-update-public.test.ts test/update.test.ts`: **22 pass / 148 assertions / 25.47s**. After adding exact foreign diagnostic assertions, the built Node gate below verifies the final regression.
- `OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test test/imported-update-public.test.ts --test-name-pattern 'adapter-proven qualified selector'`: **1 pass / 11 assertions / 1.68s**, Node 22.23.1.
- `bun run check`, `bun scripts/build.mjs`, `git diff --check`: exit 0; pinned Bun 1.4.0.

| Correction log | SHA256 |
| --- | --- |
| qualified-red.log | `c0df019760e141645822f87823f173833111e0c46a80a3376d312e86a404231d` |
| qualified-focused-green.log | `f0921985dd617da1c7e823c5a70ffb176faead49f4c11d39dee6664e4b969a66` |
| qualified-packed-green.log | `0bb8029c6671b6bbddb2ea3932437cfdb79ce9d8a522708f433948c68fa5f43d` |
| qualified-check.log | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| qualified-build.log | `13aee9b163da74d6f89c7628b2d1eb6f0258f071b9ec11b44c39828aad30c8bc` |

`8fe0303` and its failed correction replay remain preserved; root review and
the combined built-first full gate are required before integration/publication.

## Follow-up: adapter-proven bare selector for a qualified dcode record

Checkpoint `03388b5b968e1fd0938578bd9f7e10083f3b658c` incorrectly rejected
`update demo` for a persisted `demo@personal` dcode record. The regression starts
from a modern scoped install and downgrades only the ledger; it is not authentic
pre-core marker compatibility evidence. On that same candidate, the qualified
selector succeeds. Release `890e03b` resolves the bare selector but subsequently
fails with `recovery.required` after a pending write; it is not a successful
baseline. Ancestor `8fe0303` also accepted the logical selector.

The correction accepts the captured authored package name OR captured exact
equivalent native IDs, only after adapter resolution proves the persisted ID.
No raw prefix matching or ownership relaxation was added. The positive verifies
successful exact native ID and updated native plugin bytes. The foreign selector
requires exact `internal.ambiguous-ownership`, empty plan, and byte retention.

- RED: new bare dcode case **0 pass / 1 fail / 8 assertions / 1.92s**.
- First GREEN attempts exposed an incorrect test expectation that the retained
  historical activation must be the new activation; those failed logs remain.
  Replaced that assertion with actual updated native bytes; retention unchanged.
- Focused: `bun test test/imported-update-public.test.ts test/update.test.ts`:
  **23 pass / 162 assertions / 30.38s**.
- Built Node 22.23.1: `OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test test/imported-update-public.test.ts`:
  **7 pass / 60 assertions / 11.24s**.
- Pinned Bun 1.4.0 check/build exit 0. CLI SHA256:
  `33ec0b247a869c5323952396cc743a9fdd62b31184b676eccd787f25fee3ffcf`.

Logs remain in the evidence directory above: RED SHA256
`8b10092abe20dd6426993d29cc56724be1ba406fb835303d7f6156e81f0ac88c`;
focused final `204400c4492cfa8815972e9123ca4a0126f9b7d0d2bf311acd01c09f3d13c8fb`;
packed final `316da38f890a3b806e38e16f8bbd1d525fda2dbc0438f5d4cd41a3531f13a276`;
check final `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92`;
build `d849db55076862347a28cd71f1468ad8c3f101f921620f1f4df5d898f7710dfa`.
Failed first GREEN logs have SHA256
`9b709d96464e1b2b28a92edd2631c7e90c9ed1b5bd2ede93982582876f686350`
and `53f09a4c2081a80ad1dcc8ace4a330aa4a13bc2d400efcccd4c24664ed25f6d9`.
Root's previous full gate was interrupted (exit 130), NOT passed: `root/full-03388b5-interrupted.log`,
SHA256 `d948b91fa1325b37513dc34d8ab541f329a5ef5d312b498e4f668249e5f4269f`.
P11's authentic legacy compatibility limitation remains open. No real native
execution, integration or publication occurred in this correction.

## Follow-up: canonical same-native retry and pending custody

Independent review reproduced a successful `update demo` at `74b7c08` leaving
both imported `demo@personal` and confirmed `demo` activations for the same scope
and native ID. An immediate retry refused ambiguity. The new repeated-update
public assertion failed (**0 pass / 1 fail / 11 assertions / 2.44s**).

The existing executor alias supersession now also replaces a nonpending
legacy-unverified/legacy-claim row whose package ID equals its native ID, with
the verified canonical activation having that exact scope/native ID and equal
Source-relative directory. This runs only at verified confirmation, not before
mutation. It does not discard unrelated claims or synthesize a retirement
tombstone for a still-installed native package.

The shared planner preflight separately refuses differently named imported
pending claims for the exact selected scope/native ID. This follows explicit
adoption composition, preserves its diagnostics, and does not change modern
sealed recovery or the existing distinct bare-native legacy repair policy.
The public pending install/remove controls cover update/add/sync, empty plan,
typed `internal.invariant`, and unchanged ledger/native bytes. Before the guard,
these tests failed (**0 pass / 2 fail / 10 assertions / 2.69s**) on nonempty plans.
No new pending journal-custody policy was invented.

The positive retains foreign refusal, verifies updated native bytes, retries
successfully with one canonical activation, then removes successfully with a
real retained-state tombstone. All completed prior attempts are retained exactly;
the pending refusal controls retain the entire original state byte-for-byte.
These fixtures still downgrade modern markers, not authentic legacy authority.

- Focused `bun test test/imported-update-public.test.ts test/update.test.ts test/executor.test.ts test/planner.test.ts`:
  **74 pass / 702 assertions / 34.02s**. The final additional attempt/tombstone
  retention assertions are also covered by the built Node gate below.
- Built Node 22.23.1 `OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test test/imported-update-public.test.ts`:
  **9 pass / 106 assertions / 12.90s**.
- Pinned Bun 1.4.0 check/build and `git diff --check`: exit 0. CLI SHA256
  `cdffb0b396653d4701cf4bf370be66534085e59cceaf6d630729cc01e240ff1d`.

Evidence log SHA256s: retry RED
`5b17464aeda7c8edb9f4f94341ec2e956b96697d0b88cc022970c15e98577c1a`;
pending RED `260cd8f8dec0309966dd75100f65403683ebc6a9bb23e59eb6b17c30033918ae`;
focused `6ca4fe70de1644187f05fefcda9c1113d99d8c43801000420e0674e71e006509`;
packed `7af2131cd30b316f5aae18778c085941427edc5d842f998def0f694d911f6776`;
check `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92`;
build `5ab4377519d53ef9594e808f7b591b5697802b12d46e18f2a1f0eadbe7a05144`.
Root's `74b7c08` full gate was interrupted, exit 130, NOT passed (SHA256
`5d907e3ae9f995438a1866cdd86bc14be2105f40b2d31fdcd833da98e8c8c00f`).
All ancestors and failed evidence remain preserved; independent review precedes
the next full gate. Authentic pre-core compatibility and P11 closure remain open.

## Follow-up: prepare exact imported metadata before seal

Independent review of preserved `fc19ea6` identified two real counterexamples:
omitting optional v1 `sourceDir` left duplicate claims after success, and a
qualified imported row with recorded MCP pins lost those pins before staging.
The pin regressions for both directory variants failed (**0 pass / 2 fail /
26 assertions / 5.04s**) on actual native command `/usr/bin/node` becoming `node`.

`Ledger.activation` remains exact and unchanged. A separate preparation lookup
now accepts a unique nonpending legacy-claim/legacy-unverified qualified row only
for the exact planned scope/native ID, whose package ID equals that native ID,
with Source-relative directory either omitted or matching the frozen package.
The shared planner already validates the exact observed authored/native binding;
it now globally refuses contradictory defined directory, foreign package claim,
or multiple same-native imported claims. No raw prefix or same-name Source
fallback grants authority. The imported record's pins reach existing staged pin
application before projection/seal; its activation/creation metadata reaches
confirmed replacement. Verified alias supersession uses the same narrow relation,
including the proven omitted-directory case. Pending claims remain refused intact.

Public fixtures cover both optional-directory forms with actual absolute MCP
command, canonical pins and original activation time, repeated update, and remove.
Removal verifies exact prior attempts and canonical Source revision, route,
ownership, fingerprints, pins and activation time in the retained-state tombstone.
Shared add/sync controls globally refuse contradictory/foreign/multiple claims
with exact diagnostic, empty plan and byte retention. All remain modern-marker
ledger downgrades; authentic pre-core compatibility is still unfinished.

Dependency scan: only Cursor provides `proveLegacyAdoption` (`src/lifecycle-hosts.ts`).
Its proof requires canonical native ID equal authored package (`src/hosts/cursor-adoption.ts:39`),
so existing admitted qualified history has a distinct bare physical ID and is
outside the new same-native pending guard. Existing bare history has unchanged
package identity and is also outside it. No speculative admission bypass added.

- Final focused imported/update/executor/planner: **76 pass / 782 assertions / 47.62s**.
- Final built Node 22.23.1 imported suite: **11 pass / 184 assertions / 19.58s**.
- Legacy proof/public/record/Cursor projection: **7 pass / 362 assertions / 9.15s**.
- Four actual recovery files: **21 pass / 324 assertions / 65.64s**.
- Pinned Bun 1.4.0 check/build/diff: exit 0. CLI SHA256
  `1eade8edc499e661f5563c8d313b67dfd23da1ff890e69ac0279f401ce38c70f`.

Logs in the retained evidence directory: `canonical-pins-red.log`
`d9908ff1531a84276f4419e550a9ef272c7b72149e88a01f0195f67e560c60dd`;
`canonical-metadata-focused-final.log`
`bc0dd40e46d86877105cac9f4ff7f9274dcd9d3d33d88d8379f54e34b808487c`;
`canonical-metadata-packed-final.log`
`ae5049405abbfaa6f25c243eb6e0d4b0dd9bc200ea89d7020de3135cc4a298b5`;
`canonical-metadata-adoption.log`
`3e92e47d2577aa2c1937e2ef64b2af4df88f0c29a4e139306c2da32b59cbf72f`;
`canonical-metadata-recovery.log`
`ab72beb5c3b891e5993320c8bacb36b5e8224309d3948468c9d55473017ae231`;
`canonical-metadata-check-final2.log`
`8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92`;
`canonical-metadata-build.log`
`758e4167e71a9e8c42d07cf1da3713537ee28d20ce8f12b17329636ec6945892`.
Failed intermediate checks/fixture attempts remain: unavailable `structuredClone`
in the project's narrow TypeScript globals and serializing imported generation 0
as v2. Corrected fixture sets generation 1 and validates it via `readLifecycleState`
before assertions, so corrupt-state failure cannot satisfy ownership controls.
The initial dependency command included nonexistent `test/recovery.test.ts`;
only its four actual legacy files counted. The subsequent four recovery-* files
were separately executed (both before and after the metadata correction).
