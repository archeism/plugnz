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
