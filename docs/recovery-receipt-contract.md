# Recovery receipt contract — frozen proposal

Status: contract-first proposal; no runtime changes in this checkpoint.
Base: `3f6c651`. Scope: P08 recovery reporting and its strict Personal consumer.

## Why a separate contract

A historical attempt is not the current Desired. In the reproduced public CLI
case, recovery restores native enablement from false to true, then both current
packages are correctly classified `unchanged`. Reporting only those current
outcomes incorrectly reports `summary.changed=false`. Substituting the original
disable operation for a current retirement also misrepresents changed intent.

Keep report schema version 1 and add an optional, independently versioned
`recovery` envelope. Reports without recovery keep their existing shape and
semantics. Strict readers explicitly admit the new envelope; old strict readers
reject it loudly until the deliberate consumer/pin rollout. This is additive,
not transparent compatibility with old consumers.

## Read-only original-operation proof

Each public `scopes` row gains optional `openJournals: { schemaVersion: 1,
operations: [...] }`. It includes every open journal for that scope across all
attempts, not merely `lastAttemptId`, including journal-only installs and
retirements with no Activation. Empty modern inventories may omit the envelope.

Each operation proof has exactly these fields:

- `attemptId`, `command`, `operationId`, `scope` (existing public source/target
  identity), `package` and `nativeId` (nullable only for legacy missing identity).
- `action` (the recorded JournalAction, without converting `remove` to another
  action), `route` (`native`, `managed`, or null for unverified/missing route).
- `journalState` (one of the existing open journal states), `sealed` (boolean).

Modern command/action/route/identity combinations are validated against the
recorded scope and any sealed handle before projection. Legacy incomplete proof
remains visible and explicitly unverified; it never authorizes recovery.
Filesystem handles, rollback paths and native credentials are not projected.
The projection stays reader-only and cannot import lifecycle runtime/writers.
The recorded journal may omit route even for modern accepted intents. A sealed
operation supplies its exact verified route; any conflicting recorded route is
rejected. An unsealed missing route remains null, not an invented managed route.

## Report envelope

`recovery: { schemaVersion: 1, receipts: [...] }` contains historical receipts.
An empty envelope is valid and has no aggregate effect; producers normally omit
it when no recovery was requested. It does not excuse missing eligible originals.
Each receipt has exactly these fields:

- `original`: the exact precommand open-journal proof above, including its
  original command/action and journal state; its identity is never relabelled.
- `status`: `completed`, `pending`, or `not-attempted` (the recovery operation,
  not current Desired; the last form accounts for blocked remaining journals).
- `settlement`: `not-attempted`, `commit`, `rollback`, or null while unverified.
- `finalJournalState`: the actual persisted journal state after this recovery.
- `resourceState`, `activationState`, `mutationStarted`, `changed`,
  `readbackVerified`, `reason`: observed recovery facts, using existing state and
  reason vocabularies rather than a fabricated current convergence outcome.

Receipts are unique by `(attemptId, operationId)`, not by current Desired pair.
All successful and failed recovery paths emit receipts. `completed` requires a
durably closed journal and successful recovery-resource release; commit/rollback
requires verified native readback.

Keep the existing durable `cleanup-pending` journal with its verified settlement
until both cleanup and explicit recovery-fence release succeed; only then close
the journal. No new durable marker is needed. A failed release therefore remains
discoverable in `scopes` and the next same-verb retry. Retrying this phase verifies
the settled native state and performs idempotent cleanup/release, not rollback
again. dcode evidence: cleanup itself releases the native lock in its `finally`,
so the subsequent explicit release is normally a no-op; the current final
release after closing the journal must move before finalization. Its existing
sealed handle plus `settlement` supports cleanup retry after artifacts have been
disposed. Prove this ordering and deleted-artifact retry publicly; if an adapter
cannot prove idempotent cleanup/release it remains loud and unverified rather
than receiving invented recovery authority. `pending` preserves verified
settlement/readback facts; it does not pretend verified native state is unknown.

An accepted/unsealed modern intent may settle `not-attempted`, with no native
mutation/readback claim. An applying/unsealed or incomplete legacy operation
remains blocked; no original identity or authority is guessed.

## Invariants preserved and extended

1. `plan` and `outcomes` describe only the current frozen request. Existing exact
   current Desired-pair coverage, one-outcome-per-operation and action invariants
   remain unchanged. Historical receipts never satisfy current coverage.
2. `summary.changed` is exactly the OR of current outcome changes and historical
   receipt changes. `summary.mutationStarted` covers both boundaries. An
   `unchanged` current outcome still cannot have `changed=true`.
3. A failed recovery retains the entire current frozen plan as not attempted,
   including requested siblings and retirement entries; the historical failing
   operation lives only in the receipt envelope.
4. `summary.recoveryId` and `readbackId` may reference a uniquely identified
   historical receipt's original operation, with explicit receipt validation;
   existing current-outcome rules remain intact. Ambiguous operation IDs across
   historical attempts are rejected, not guessed.
5. Historical rollback is not current failure or convergence. Replan and execute
   the current frozen inputs after successful recovery. Command convergence
   requires current convergence plus completed recovery receipts.
6. Consumer receipt admission requires exact original-proof equality with its
   read-only precommand inventory, and a scope requested by this invocation.
   Generic `RecordedScope.attempt` and postcommand inventory are insufficient.
   Membership alone is insufficient: after successful global preflight, every
   recovery-eligible precommand journal in requested scopes has exactly one
   receipt. Convergence requires all such receipts completed. Failure includes
   exact `not-attempted` receipts for every remaining journal, preserving their
   original identity/state and claiming no observation or mutation. Cross-verb
   refusal likewise accounts for the blocked originals. Global zero-write
   preflight failure may omit the envelope because recovery never began.
7. Dry runs neither recover nor emit new recovery receipts. Global bad-last
   Source, policy, route and adoption preflight remains zero-write before any
   recovery. Foreign/stale native CAS refusal remains loud and non-overwriting.
8. Exact nested versions/fields/enums are checked on both sides. Unknown versions,
   forged originals, duplicate receipts and contradictory flags fail loudly.
9. Freeze current retirement obligations from the precommand plan/inventory
   before recovery. Replanning cannot drop a requested retirement merely because
   recovery removed its Activation. Keep exactly one current retirement outcome
   with live verified absence/inactivity if already retired, or its actual
   current mutation/failure. Historical receipts do not replace that outcome.
   Frozen obligations do not grant new ownership: bind exact recorded scope,
   package and native ID, and refuse foreign live state rather than delete it.

## Implementation and proof slices

1. Add shared pure proof/receipt types and strict producer parsers; expose all
   open-journal proofs through the existing read-only inventory. Cover nonlatest,
   journal-only, legacy and doctor import-boundary cases.
2. Return complete structured receipts on every recovery path, preserve exact
   original journal identity, and aggregate them without relabelling current
   operations. Keep `cleanup-pending` discoverable through cleanup/release and
   close only afterward; prove retry after artifact disposal. Carry frozen
   precommand retirement obligations through replan and verify live absence.
3. Public CLI regressions: real enablement false-to-true plus fresh `unchanged`;
   changed-intent recovery followed by current retirement; multi-journal earlier
   change then later failure; current sibling coverage; accepted/unsealed intent;
   cleanup-pending completed retirement; stale foreign-native refusal and
   bad-last global preflight. Keep existing failure tests as protection.
4. Mirror strict admission in Personal and validate receipts against precommand
   inventory. Composed producer/consumer isolated-home tests prove exact current
   pair coverage, actionable historical errors and rejected forged/nonrequested
   originals. Do not relax `assertBatchReportCoverage`.
5. Freeze code, run focused/typecheck, independent two-axis review, full Bun 1.4
   gate and packed supported Node 22 gate with real native Python/FileLock.
   No real-home reads/writes, native-capability expansion or automatic fleet pin.

Skills: Addy API/interface design and Matt contract-first TDD guided the separated
historical/current contract. Skill versions remain unchanged; no skill A/B claim.

## Thin inventory checkpoint

The public `scopes --json` regression first failed specifically because older
open journals were absent. The reader now projects all open journal proofs,
including accepted/unsealed and cleanup-pending/sealed rows with no Activation.
Strict proof/envelope checks reject unknown fields/versions, duplicate identities,
forged scope identity and incompatible command/action. Native handles remain
private. Bun 1.4 focused inventory/proof/doctor-import checks: 9 passed, 55
assertions; `bun run check` passed. This proves only the read-only proof slice,
not report receipts, recovery accounting, or consumer receipt admission.

## Published baseline proof (not a pin advancement)

Root verified public 0.0.10 registry gitHead `62aed66`, tarball SHA256
`1716db7d2bfcc7a6bb465f9620220885cf14699f0d9bf0e05b744b188373c4f5`, and
registry-matching SHA512
`opwN0SiUBExRc+VkpCL+PePPMmGGbL/IxCekIhOFbGTqnWkwJvq9DiCvfAJN//bgtflvkUJf7qOHbRnmeSjBDw==`.
Artifact: `/tmp/plugnz-release-0010-proof.phFQfl/plugnz-0.0.10.tgz`.
Extracted Node 22 syntax and publication CI passed. Root ran canonical Personal
316 consumer acceptance with production pin unchanged at 0.0.9:

```sh
PERSONAL_TEST_PLUGNZ_BIN=/tmp/plugnz-release-0010-proof.phFQfl/package/dist/plugnz.mjs \
PERSONAL_TEST_PLUGNZ_VERSION=0.0.10 \
/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun run check:plugin-lifecycle-producer
```

Result: 1 passed, 31 assertions, 0 failed, 13.36 seconds. This is actual published
producer with fixture version/lock launchers, not every native adapter proof.
The receipt contract requires a subsequent deliberate producer/consumer release;
this evidence does not authorize advancing the intermediate fleet pin.

Root also verified the exact downloaded 0.0.10 artifact, not a local rebuild,
under Node 22 and the real dcode Python/FileLock runtime: 22 passed, 292
assertions, 0 failed, 92.36 seconds. Command: designated Bun 1.4 `bun test
test/recovery-public.test.ts test/dcode-sync-public.test.ts --timeout 30000`, with
`OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node` and
`OPEN_PLUGIN_TEST_DCODE_PYTHON=/tmp/plugnz-dcode-native-proof/bin/python`.
Durable log:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/plugnz-0010-public-node22-recovery.log`;
SHA256 `3ac2c462249e1049295bc3ca541ef987ff2f3340761bc3f7948689215989e1cc`.
Fixture CLI responses qualify this as packed CLI/recovery/native-filelock
interoperability, not new native component support.

## Runtime receipt checkpoint (not complete acceptance)

The isolated public successful-recovery regression proved actual native
enablement false-to-true while both current Desired outcomes stayed unchanged;
before the runtime change, aggregate changed was false. Recovery now emits
separate original-proof receipts on success/failure, preserves all current
coverage, and holds durable cleanup-pending until cleanup/release succeeds.

Current retirement obligations surviving a completed recovery use an explicit
private readback-only frozen operation. Admission requires the exact current
precommand pair, completed original retirement COMMIT receipt and matching
retained tombstone scope/package/native/route ownership proof. Executor rereads
that proof and live absence/inactivity; it never invents an Activation, mutates
foreign content, or substitutes historical settlement for current coverage.
Rollback receipts still use normal Activation replanning. The journal-only
retirement public test asserts one current succeeded absent/inactive unchanged
retirement plus its separate historical receipt after Source deletion.

Fresh focused gate: 50 passed, 329 assertions, 0 failed, 43.18 seconds across
recovery-public, recovery-receipts-public, lifecycle-report, recovery-proof,
recovery-inventory-public and doctor-imports; `bun run check` passed. Earlier
gate with one retirement tuple failure is retained as a failed attempt; the
fix corrected the implementation tuple, not the expected absence assertion.

Remaining before acceptance: explicit changed-intent/sibling and foreign
reappearance negatives; release-failure retry after artifact disposal; exact
remaining-journal completeness regression; strict consumer precommand receipt
admission/composed public proof; independent review and frozen full/packed gates.
No production pin advancement or real-home deployment has occurred.

## Reviewed blocker correction checkpoint

Independent review found three correctness gaps in the runtime checkpoint:
unsealed applying intent could fail report parsing, legacy unknown accepted
intent could claim successful settlement, and current retirement proof/absence
checks ran after sibling operations rather than before current apply.

Historical pending receipts now preserve original uncertainty without claiming
that this retry mutated native state. Existing current pending-outcome mutation
invariants remain strict. Public applying/unsealed intent returns valid loud JSON
and leaves ledger/native bytes unchanged; incomplete legacy proof cannot settle
as a completed modern accepted intent.

The executor globally validates every readback-only retirement ownership proof
and fresh native absence before any current native/ledger write, then rechecks at
the retirement boundary. Missing retained tombstone proof is a command-global
refusal, not a failed row that permits sibling writes. Global refusal preserves
its actionable summary diagnostic and all current pair outcomes as not attempted.

Public mixed-sync fixtures produce authentic cleanup-pending retirement plus a
sibling: no recorded original command is rewritten. Missing-tombstone and foreign
reappearance after recovery both block a requested sibling update, preserve its
actual native manifest bytes and ledger fingerprint, and retain the completed
historical recovery receipt. Foreign sentinel bytes remain intact. Intermediate
fixture failures were retained diagnostically; they are not acceptance evidence.

Frozen focused gate: 54 passed, 364 assertions, 0 failed, 72.51 seconds across the
same six files; `bun run check` passed. Remaining acceptance work above remains
open, including consumer integration and full/packed gates. Skills unchanged.

Further strict-boundary review found retain-prior rows were not normalized in
the global executor refusal, and sealed-looking legacy proof could still claim
commit/rollback. Global refusal now changes both current plan and outcome to
not-attempted/no-route consistently. All legacy successful or verified settlement
authority is rejected, not only accepted-intent settlement. The authentic public
foreign-reappearance case now also covers a capability-refused retained sibling;
valid loud JSON preserves its native bytes and exact current pair. Focused
receipt/report gate: 34 passed, 111 assertions, 0 failed, 11.41 seconds; typecheck
passed. This is a small correction gate, not full consumer/runtime acceptance.
