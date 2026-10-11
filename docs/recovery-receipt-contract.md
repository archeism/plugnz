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
