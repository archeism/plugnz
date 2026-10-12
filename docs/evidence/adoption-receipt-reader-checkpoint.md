# Adoption receipt reader checkpoint

Base: `589a76bb52e5f1cc0525d42d78cf4488f46e4c2f`.
Source checkpoint: `d0b7a8fabf8f070dcf59221c26c70e0587052d9f`.
Contract: `docs/legacy-adoption-wire-contract.md`, inventory/report projections
and resume/accounting sections. This implements that optional report envelope,
not receipt emission, an adoption executor, a native fence or an ownership upgrade.

The public `parseLifecycleReport` boundary reuses `parseAdoptionRecord` for exact
legacy snapshot/admission/seal/commit validation. It binds each receipt's original,
digest, admission, phase/status and reason to its exact current admission/outcome
or its exact fresh modern recovery relation. Recovery and adoption originals are
disjoint. Delivered admission outcomes without the matching retained transaction
receipt remain rejected; actual current previews still refuse at the internal fence.

The only recovery/current-operation ID exception is an exact retained adoption
relation matching the current admission and the fresh modern recovery original.
That current outcome must have `changed:false`: modern recovery accounts for the
historical mutation once. Existing summary mutation/changed checks stay in force;
adoption receipts add no duplicate flags. Prepared and committed-cleanup pending
relations cannot borrow the other phase's settlement. Rollback cannot claim an
absent/inactive prior when its seal proves a present active same-root prior.

## Limits

RecoveryOperationProof exposes Source binding and target kind/instance, not an
immutable revision, target context or sealed handle. The retained record validates
its own exact Source revision/full context/seal/commit correlations, but a report
cannot prove those facts against a native recovery handle or current machine.
Precommand original eligibility/completeness and exact postcommand durable
relation/journal/handle/commit verification remain mandatory consumer checks.
Neither a valid report nor the synthetic wire vectors grant mutation authority.
Runtime/backend activation, pending repair, native acceptance, production pin and
fleet rollout remain required later work; none is silently waived here.

## Verification

All new tests exercise the agreed public report seam. Fixtures are synthetic
closed-wire vectors, explicitly not native or transaction execution evidence.
The first RED rejected an exact null-record/no-write receipt only because the
approved `adoptions` field was unknown. Later REDs exposed status handling, resume
correlation and prepared-versus-committed pending settlement acceptance.
One intermediate typecheck caught unsupported `toThrow` declarations in this
repo's minimal globals; the tests now use the existing assertion surface and
additionally require typed actionable protocol errors. Globals were not expanded.

Designated Bun 1.4.0 gates:

- Report/adoption/state/doctor/public-admission gate: 65 passed, zero failed,
  442 assertions, 13.89 seconds across eight files.
- State-v2/executor gate: 58 passed, zero failed, 670 assertions, 3.63 seconds.
- `bun run check`, `bun run build`, and `git diff --check`: exit zero.

No full-suite or native acceptance is claimed. The combined integration's required
public adoption failure is not fixed by admitting the new report shape.
Unreleased built artifact SHA256:
`5c4dd4d9209df5309055ae0c59287fe0ef885ac27e00b54bf09e6d2ed7a46918`.

Raw RED/GREEN/focused/build/check logs are retained outside Git (88 KiB allocated):
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/adoption-receipt-reader/`.
Final focused log SHA256
`07869d010cfa8eab21a48681bf56ad9d41208ca7249c537dfa04bffe5bae6d07`;
state/executor log SHA256
`4e7fbdfc5e530af960c8011adbaf43322078e257fab1cf179532b573641d82eb`.
Skills were used unchanged. Independent Standards and Spec review are required
before integration; the author does not approve their own implementation.

## Independent Spec correction: unique fresh relation

Independent review of retained candidate `54d05d2` found a real false accept:
two distinct rehashed legacy originals could reuse one fresh modern operation and
its recovery receipt. Both records individually parsed, but report-level fresh
tuple cardinality was missing. The review RED log is preserved unchanged as
`producer-receipt-spec-collision.log`, SHA256
`c748b05584f68f1df494ebe83df15ae3d431fdd0f26fb1570471a1926985ba5f`.
The permanent reproduction was RED: 10 passed, one failed, 60 assertions.

Correction source checkpoint `9821e2a` adds only nine production lines enforcing
one receipt per fresh `(attemptId, operationId)` across the complete report.
Retained records supply their validated admission; null-record no-write receipts
derive it from their exact validated current plan admission. Tests retain both
current/resume collisions and a mixed null/retained collision. A positive vector
has two real-distinct synthetic package identities sharing an attempt with distinct
fresh operations and ordinary recovery receipts; neither operation is double-counted.
This is closed-wire evidence, not actual native adoption delivery.

The corrected frozen-source gate passed 126 tests, zero failures, 1121 assertions
in 16.47 seconds across ten report/adoption/public-admission/state/executor/doctor
files. Typecheck, build and diff check exited zero. One intermediate typecheck
caught a direct test write to a readonly readback-root field; the fixture now
replaces the root structurally without changing production types or assertions.
That failed log is preserved beside the final checks.
Final focused log SHA256
`7824515348a6ee1c0e1109fb23cc68dc22fd22b4f225d93f883a613d5e515675`;
reproduction RED log SHA256
`a66ee8af5bbf18326fdd57bac5770eb13d5c0cf36cf19044ee0c816017534b25`.
Corrected unreleased artifact SHA256
`8891b462f0657902c82161ed4003de2e197a4cbc41c2e1448fc02d7d9169f882`.
All previous candidates and RED logs remain retained. Both independent axes must
restart review on this correction; no interface field, policy, runtime emission,
native capability or required completion gate changed. Skills remain unchanged.
