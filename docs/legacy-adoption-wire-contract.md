# Legacy adoption wire contract — review candidate

Status: exact proposed contract, not runtime code or acceptance proof. Read with
[the parent proposal](legacy-adoption-contract-proposal.md). Base `d5a6f05`.
Root approved existing dry-run plus post-scopes verification as the minimal public
seams; those calls are targeted to adoption, not ordinary completed recovery.

## Existing types and strictness

Names below reuse the existing strict `ActivationRecord`, `JournalEntryRecord`,
`RecoveryOperationProof`, `SourceSnapshotReference`, `PersistedTargetIdentity`,
`LifecyclePlanOperation`, `LifecycleReason`, and serialized handle readback shape.
These are references to existing shapes, not open JSON extension bags. All new
objects reject unknown fields and unsupported versions. Required nullable fields
are present; only explicitly optional integration fields may be absent. Strings
use existing stable/credential-free validation. No native credentials, stage paths,
rollback references or executable transport URLs cross this public boundary.

```ts
type Digest = `sha256:${string}`; // exactly 64 lowercase hex digits
type OriginalKey = { attemptId: string; operationId: string };
type LegacyAttemptHeader = {
  id: string; command: "legacy-recovery";
  phase: LifecycleAttemptRecord["phase"]; mutationStarted: boolean;
  scopeIds: string[];
  startedAt: string | null; updatedAt: string | null; completedAt: string | null;
};
type LegacySnapshot = {
  scope: { id: string; source: SourceBinding; target: PersistedTargetIdentity };
  attempt: LegacyAttemptHeader;
  journal: JournalEntryRecord; // exact original; sealedOperation/settlement absent
  activation: ActivationRecord; // exact imported claim, including pending/pins
};
type LegacyRecordProof = {
  schemaVersion: 1;
  original: RecoveryOperationProof; // sealed false, original legacy command/state
  snapshot: LegacySnapshot;
  recordDigest: Digest;
};
type AdoptionNativeProof = {
  adapterId: string;
  format: "cursor/legacy-marker-v1"; // first proven adapter; no generic format escape
  evidenceId: Digest;
  version: TargetVersionObservation;
  aliasMode: "same-root"; // two-ID migration requires a future evidenced variant
  oldLedgerNativeId: string; oldPhysicalNativeId: string; newNativeId: string;
  packageName: string; packageVersion: string;
  marker: { source: string; pluginId: string; fingerprint: string; rawDigest: Digest };
  roots: { label: string; path: string; fullFingerprint: Digest; payloadFingerprint: Digest }[];
  projectedPayloadFingerprint: Digest;
  pins: string[];
  retention: LifecycleReadbackObservation["retention"];
};
type AdoptionAdmission = {
  schemaVersion: 1;
  original: RecoveryOperationProof;
  legacyRecordDigest: Digest;
  source: SourceSnapshotReference;
  target: PersistedTargetIdentity;
  packageName: string; packageVersion: string;
  projectedFingerprint: Digest;
  native: AdoptionNativeProof;
  fresh: {
    attemptId: string; operationId: string; command: "add" | "sync";
    baseStateGeneration: number;
    scopeId: string; packageName: string; nativeId: string;
    sourceSnapshotId: string;
    action: "install" | "route-migrate"; route: "managed";
  };
  admissionId: Digest;
};
```

`LegacySnapshot` preserves validated imported values, not a lossy compatibility
row. Its scope/attempt/journal/activation identities must agree exactly with the
original. Source bindings and target context are checked independently of the
context-free public scope hash. Pins retain their existing sorted semantics.
The copied attempt header's original phase/mutation/timestamps and copied journal
are immutable historical evidence; supersession never rewrites that snapshot.
Because one imported attempt may contain several journals, its live aggregate
phase/mutation/timestamps may legitimately change when other entries are processed.
Historical validity must NOT require those mutable aggregate fields to remain
equal to the snapshot forever. Require live attempt ID/command/scope membership
and the exact original journal identity/action/state to agree, plus the retained
immutable snapshot/commit.

Choose **one immutable snapshot per original**. Before any adoption record exists,
the read-only preview projects the current validated original snapshot. The first
atomic retained prepared relation establishes it, even if that fresh intent later
settles not-attempted or rolls back. Every later admission, retry and relation for
that original reuses this exact retained `LegacyRecordProof` and `recordDigest`;
it never recaptures a new snapshot from the shared attempt's newer aggregate header.
All retained relations for one original must therefore contain identical canonical
snapshots. Preserve the original journal and legacy activation fields exactly;
while the old activation still exists, compare those authority-bearing values to
the retained snapshot. After verified replacement, validate them from retained
history rather than a legitimately changed/retired canonical live activation.

No new mutable-header wire field or digest is needed. Current shared aggregate
phase/mutation/timestamps are not ownership or original-operation authority and
are deliberately excluded from the permanent snapshot-equality check. Existing
`fresh.baseStateGeneration`, deterministic admission identity and ledger CAS bind
each command's actual precommand generation; a concurrent legitimate header update
advances that generation and invalidates a caller's earlier expectation before
writes. Native/Source/target and the original journal/legacy activation remain
independently exact preconditions. This does not claim that a hash of the old
snapshot detects arbitrary edits to unrelated mutable aggregate metadata.

The initial Cursor variant proves one physical root; exact adapter enumeration
must map old ledger ID and canonical native ID to that root. It cannot admit a
different physical directory. Name/version, marker Source and payload bytes must
match the frozen projection. Unknown extra files, marker fields, aliases, paths,
versions or symlinks fail globally. The Source fingerprint and marker fingerprint
are checked against their actual documented fingerprint algorithms; do not equate
the prefixed wire digest with an existing raw tree hash by string accident.
The native proof records the precondition, not permission to skip its later CAS.

## Canonical digest bytes

Let `C(x)` be UTF-8 bytes of compact JSON after recursively sorting object keys by
Unicode scalar order. Arrays retain semantic order. Undefined/functions/NaN,
infinities, malformed Unicode and unsupported keys/types are rejected; validated
finite context numbers serialize with ECMAScript JSON number spelling, `-0` as 0.
Do not normalize string values, paths, timestamps, Unicode or Source references.
Existing optional fields are absent when absent, not rewritten to null. New
required nullable fields serialize explicitly. Roots sort by `(label,path)`;
pins and scopeIds use their documented lexicographic order; duplicate roots/pins
are rejected. JSON object key order alone is not historical evidence.

`H(domain,x) = "sha256:" + SHA256(UTF8(domain + "\0") || C(x))`, lowercase hex.

- `recordDigest = H("plugnz/legacy-record/v1", snapshot)` of the single snapshot
  established by the first retained relation; never recomputed from newer live
  aggregate headers. A pre-retention preview uses the current validated snapshot.
- Marker `rawDigest = "sha256:" + SHA256(exact marker file bytes)`; root full and
  payload fingerprints use the existing framed tree algorithm, prefixed on wire.
- `admissionId = H("plugnz/legacy-admission/v1", admission without admissionId)`.
- `sealDigest` below hashes its exact public `seal` object under
  `"plugnz/legacy-adoption-seal/v1"`.
- `commitId` hashes the complete `commit` object without commitId under
  `"plugnz/legacy-adoption-commit/v1"`.

Consumer recomputes each digest; membership and byte/target/Source correlation are
additional mandatory checks. Collision resistance does not turn an assertion into
ownership. Public golden literals pin canonical bytes and non-ASCII ordering on
both Bun and supported Node; no external canonicalization library is required.

## Existing request and frozen plan extension

An explicit manifest selector gains only this optional expectation:

```ts
type AdoptionExpectation = { schemaVersion: 1; admissionId: Digest };
// Existing selector:
// { package, adoptExisting, expectedAdoption?: AdoptionExpectation }
// Existing plan/outcome:
// { ...existingFields, adoption?: AdoptionAdmission }
```

`expectedAdoption` is optional. When provided, it requires `adoptExisting: true`,
one explicit selector and one exactly matching admissible legacy original.
Unknown versions, unsolicited expectations, or a provided expectation without a
matching actual admission are global preflight failures. Absence of this field is
not itself a failure and does not introduce a mandatory preprobe CLI requirement.
Ordinary direct `sync` with an adoption flag, like direct `add --adopt-existing`,
may freeze admission in the same process and use the full global/native-CAS
protocol. The field is not implicit adoption authority or permission to rebind a
different Source/target/record; Personal's two-process adoption flow always supplies
the expectation obtained from its precommand preview.

The consumer reads scopes, compiles the original batch, and uses the existing
`sync --manifest ... --dry-run --json` seam only if that requested batch contains
eligible legacy originals explicitly selected for adoption. It strict-parses the
preview, recomputes admissions against exact retained precommand records, target
contexts, Source snapshots and the current requested pair, then places their IDs
in those selectors. The preview may have unrelated pair capability failures;
none are silently dropped from the eventual batch/current coverage.

The producer freshly freezes and classifies **every** actual scope, recomputes all
admissions, and compares caller expectations before any recovery, stage, ledger or
native write. Source/native/record/version/context drift anywhere produces a
command-global zero-write refusal. Acquisition of a native fence is not mutation;
after acquisition revalidate the original admission before capture/apply. A race
after global preflight cannot overwrite foreign state: refuse that operation and
stop later writes, accurately reporting any earlier applied work.

Dry-run/apply with unchanged inputs use the same base generation, prepared-scope
order, attempt identity and operation identity already defined by
`lifecycleAttemptIdForPlannedScopes`/`operationIdentity`. Their exact UTF-16 string
length framing remains the existing protocol, not the new JSON digest framing.
Publish that pure derivation to both validators and pin worked literal vectors;
the consumer derives IDs from its precommand generation and frozen preview scope
selection, rather than accepting an arbitrary fresh attempt ID from the report.
The adoption expectation itself is excluded from attempt/operation identity input.

Direct `add --adopt-existing` does not require a new preprobe flag. Its entire
request freezes admission in the same process before writes, then uses the same
native fence/CAS and durable transaction. The reported admission remains explicit;
an external consumer choosing this route still verifies its durable commit before
subsequent dependent writes. No global regex alias authorization remains.

## Durable relation, seal projection and immutable commit

State v2 gains optional `legacyAdoptions: { schemaVersion: 1, records: [...] }`.
Each record is strictly typed below; legacy documents without it keep their prior
meaning. A record retains its exact `LegacyRecordProof`, including the old
activation snapshot when the active alias is replaced.

```ts
type AdoptionSeal = {
  schemaVersion: 1; admissionId: Digest;
  adapterId: string; attemptId: string; operationId: string;
  scopeId: string; target: PersistedTargetIdentity;
  packageName: string; nativeId: string; action: "install" | "route-migrate";
  route: "managed"; source: SourceSnapshotReference;
  projectedFingerprint: Digest; affectedNativeIds: string[];
  prior: SerializedLifecycleOperation["prior"];
  expected: SerializedLifecycleOperation["expected"];
};
type AdoptionCommit = {
  schemaVersion: 1; admissionId: Digest; sealDigest: Digest;
  verifiedReadback: SerializedLifecycleOperation["expected"];
  stateGeneration: number; committedAt: string; commitId: Digest;
};
type AdoptionRecord = {
  schemaVersion: 1;
  legacy: LegacyRecordProof;
  admission: AdoptionAdmission;
  seal: AdoptionSeal | null; sealDigest: Digest | null;
  phase: "prepared" | "not-attempted" | "rolled-back" | "committed";
  commit: AdoptionCommit | null;
};
```

No rollback/stage artifact paths or artifact ID appear in `AdoptionSeal`. Its
readback roots are bounded native content paths, not rollback paths. The reader
recomputes this projection from the actual serialized fresh handle and verifies
every identity/Source/action/route/root/retention field, not just its hash. Existing
serialized operation shape and rollback authority remain unchanged.

Persist the fresh accepted journal plus prepared relation atomically before any
stage writes. This first retention fixes the original's immutable snapshot for all
future relations; rejected previews do not persist or redefine it. A prepared
relation may initially have null seal/digest; only modern
accepted no-write rules can discard that intent as not attempted. Persist its
actual seal/projection/digest with the fresh handle before markApplying. One open
prepared relation per legacy original is allowed; historical closed failed or
rolled-back fresh relations remain retained. Unique admission IDs and fresh
attempt/operation tuples are required; only one committed relation per original.

At verified readback, one ledger CAS writes the canonical adopted activation,
removes exactly the proven active alias, writes immutable commit/readback and
committed relation, and marks the fresh journal COMMIT/cleanup-pending. There is
no interval where ownership is upgraded without durable supersession and verified
fresh commit. The commit generation is this atomic replacement's generation.
Cleanup/fence release precede final journal close; failures retain cleanup-pending.

Reader validation requires the retained fresh journal/handle and COMMIT settlement
in cleanup-pending or completed state, with exact identity and seal projection.
The journal and immutable commit are retained forever with the old history;
activation updates/removal never mutate them. The commit remains valid after later
updates or source-free retirement: it proves a past verified adoption, not current
live conformance. A removed/changed live activation is not a dangling historical
commit. Missing historical handle/journal or contradictory retained fields is
corruption and refuses mutation; it is never repaired by the relation alone.

## Inventory and report projections

Each scopes row gains optional:

```ts
type AdoptionHistory = {
  schemaVersion: 1;
  legacyRecords: LegacyRecordProof[];
  records: AdoptionRecord[];
};
// scopes row: { ...existingFields, adoptionHistory?: AdoptionHistory }
type AdoptionReceipt = {
  original: RecoveryOperationProof;
  legacyRecordDigest: Digest;
  admissionId: Digest;
  status: "not-attempted" | "pending" | "rolled-back" | "committed";
  record: AdoptionRecord | null;
  reason: LifecycleReason | null;
};
// report: { ...existingFields,
//   adoptions?: { schemaVersion: 1; receipts: AdoptionReceipt[] } }
```

The inventory gathers every relevant legacy record and linked fresh relation
across attempts, not just lastAttemptId. It verifies all relations using pure state
parsers and sealed projections without importing runtime or writers. Before the
first retained relation, legacy proof comes from the current legacy activation
and header. Once any relation is retained, including a not-attempted/rolled-back
one, inventory and every new admission reuse that single immutable original
snapshot. They do not recapture a header after another journal progresses.
Deduplicate identical proofs by original tuple plus digest; conflicting retained
snapshots for one original are corruption. Empty envelopes may be
omitted. All enclosing scopes/contexts and original/record identities must match.

Keep `openJournals.operations` faithful to every physically open journal, including
superseded legacy originals. Blocking eligibility is separately computed as that
set minus originals with validated permanent committed relations. Doctor/list show
“unknown historical attempt, superseded by verified adoption” without calling the
old attempt recovered or pending active work. No new state enum silently hides it.

An adoption receipt references one exact eligible precommand legacy original and
record digest. Its admission must match either the frozen requested pair's preview
and expectation, or an exact precommand prepared modern relation for resume.
It never matches merely by package/native name. The current plan/outcome adoption
object must match byte-for-byte canonical admission and current pair identity.

- `committed`: non-null matching committed record, null reason, verified immutable
  commit; current success alone is insufficient.
- `pending`: non-null prepared or committed record, unresolved fresh modern
  journal, non-null precise reason. A committed record can remain pending while
  its fresh cleanup/release obligation is unfinished; permanent supersession does
  not waive that modern pending journal.
- `rolled-back`: non-null rolled-back record and exact verified fresh rollback
  journal, non-null failure reason. This never settles the legacy original.
- `not-attempted`: null record for no fresh transaction begun, or matching
  not-attempted record for a proven accepted/no-write intent; non-null reason.

Receipt status cannot assert successful legacy settlement. Adoption receipts carry
no extra changed/mutation flag: existing current outcomes and modern historical
recovery receipts account for those facts exactly once. A successful adoption
must have current active conforming readback or its modern committed recovery
proof; failure retains strict current outcomes and retirement obligations.

## Resume, accounting and consumer order

For requested scopes, compute eligible precommand open originals before mutation.
They must be a **disjoint complete union** of ordinary recovery originals and
adoption receipt originals. The legacy original may not also receive a recovery
receipt; every separate modern prepared-adoption journal still requires its own
ordinary recovery receipt. Cross-verb unrelated originals retain exact visible
not-attempted diagnostics. Global zero-write preflight keeps the existing omission
exception. Committed precommand supersessions are historical, not new obligations.

On resume, precommand inventory proves the exact fresh relation/handle while the
original legacy fields remain unchanged. Recovery admits that modern same-verb
operation, with its fenced prior/candidate CAS; the linked legacy original is a
dependency, not recovery authority. A fresh rollback closes only the modern
operation. If explicit current adoption remains requested, generate a new admission
using the same frozen Source and proven restored prior; retain the old relation
and reuse its immutable original snapshot/digest, not the newer shared header.
Only the final admission is the legacy original's one adoption receipt, while the
old modern rollback remains an ordinary recovery receipt. A changed Source or
ambiguous original/native binding that cannot be independently classified before
recovery must refuse globally, not postpone deterministic admission until after
recovery writes. Source-free retirement may settle a committed modern cleanup then
retire only the canonical adopted record, never an unknown legacy claim.

Expected admissions and their frozen current operation IDs are validated at global
preflight and carried through recovery/replan; the command's own generation writes
do not invalidate that precommand expectation or silently regenerate a different
attempt identity. Replan may settle modern history, but not refetch/replace Source
or change the approved adoption binding. Any necessary fresh post-rollback
admission is classified from the sealed prior before recovery begins and native
CAS verified afterward. Inability to prove that classification is loud refusal,
not a synthetic inventory or speculative authorization.

Consumer order is: precommand scopes → targeted adoption dry-run/expectations →
actual command → strict report/current coverage/original completeness → targeted
postcommand scopes → verify exact durable relation/fresh journal/commit → later
house writes. Capture/report validation precedes any early pending throw. Pending
adoption, invalid receipts, or a failed postcommand readback stop later writes and
use existing read-only recovery probing; they never trigger another mutation.
Post-scopes source-free verification uses retained commit evidence without reading
or requiring the old Source. Historical validity never substitutes for status's
live conformance observation. No extra probe for an ordinary completed recovery.

## Compatibility and proof gates

All extensions are optional/versioned additions to strict v1 manifest/report and
v2 state; old documents preserve existing meaning. Existing strict binaries/readers
reject new fields loudly rather than silently downconverting. Producer/consumer
must upgrade together deliberately after publication/integrity/actual-artifact
golden; production Personal pin remains 0.0.9 until then. No legacy command is
invented and no generic legacy recovery authority is upgraded.

Before runtime: two independent design axes approve this exact freeze. Then public
Cursor fixture RED→GREEN, global bad-last/drift zero-write, canonical literal
digest/ID vectors, process-kill/fence prior-candidate and cleanup-release retries,
reader no-writer gates, adoption→update→retire→restart history, complete composed
consumer accounting/forgery/probe negatives, focused/full and packed Node gates.
Add the shared-attempt public gate: legacy journals A and B share one attempt;
A's fresh adoption rolls back and retains its snapshot, B progresses and changes
the live aggregate header, then A retries successfully. A's original snapshot and
recordDigest stay identical across both relations; A's new admission ID/attempt
uses the newer live generation; B's progress does not become corruption or give
A authority over B. A stale expectation from before B's progress refuses globally
with zero writes; a refreshed expectation succeeds without relaxing original
journal/activation or native-byte checks. Preserve both failed and successful
relations plus unknown original history through later retirement/restart.
The genuine `75d7bc1` public lifecycle fixture now captures ZCode physical
`demo@catalog`, different from the current hashed physical ID. This proves that
isolated historical CLI/fixture layout, NOT released native-runtime admission.
Its future adapter needs a distinct two-ID transaction variant with complete
old/new blast-radius, rollback and safe-retirement proof. Other old command/layout
combinations remain unverified; never infer them from legacy-add writer inspection.
