# ZCode two-physical-ID migration — contract proposal

Status: design for independent review, not implementation or native admission.
Code baseline: `d3da1d5`; historical producer: `75d7bc1`.
Shared legacy wire baseline: `97b411d` in
`docs/legacy-adoption-wire-contract.md` on the separate receipt-contract branch.
This extends its evidenced two-ID variant; it does not reuse Cursor's same-root
proof, reinterpret old journals, or remove the current zero-write guard.

## Verified premise and smallest delivery

The authentic old public lifecycle installs `demo@catalog`; the corrected producer
plans a different physical ID, `demo@plgnz-3c708994a71afe18`. Their cache,
marketplace, resource and data namespaces differ. The retained historical fixture
and hashes are recorded in [identity evidence](evidence/native-git-inventory-20261011.md).
Legacy `add` writer inspection is not evidence of that public lifecycle mapping.

The captured modern record is **created**, readback-verified, and not pending. Its
old marker has no Scope, Source type/locator or resource fingerprint fields. It
does retain exact old native/logical IDs, package fingerprint, immutable Source
revision and resource path. Therefore:

1. A strict recorded modern activation can authorize a fresh migration only after
   the adapter independently correlates its exact current native bytes/resources.
   It must not be downgraded to a fabricated legacy-recovery original.
2. A v1 imported claim cannot borrow that authority. Explicit adoption must use
   the shared original snapshot/admission/supersession protocol, including unknown
   original history and its first-retained snapshot rule.
3. Neither case is a new install followed by a separate best-effort remove. Both
   IDs are one fenced, sealed, rollback-capable transaction and one atomic ledger
   replacement. An unproved case remains loud, not silently duplicated/excluded.

## Read-only admission

Before any requested Scope writes, require all of the following:

- Exact strict Source locator/type/ref and target/context binding; exact recorded
  `sourceRelativeDir`, package name/version and immutable revision. No basename,
  `@` stripping, Source URL inferred from a SHA, or new Source binding inferred
  solely from marker possession. No null/path ambiguity can grant admission.
- One selected old activation and one actual old native registry row, user scope,
  exact old marker ID and exact cache root. The supported old ID is derived from
  that frozen Source's actual marketplace declaration and package name, not a
  string prefix heuristic. A new-ID row, enabled flag, cache, resource tree,
  marketplace root/entry or data directory already present is not absence.
- Recognized old marker fields **exactly**, with unknown fields rejected. Its
  native cache fingerprint must equal the retained modern installed fingerprint
  (or explicit adoption's independently derived historical payload proof).
  A missing historical Scope field is not replaced by the adapter's fallback
  Scope constant; Source/Scope correlation comes from strict record plus exact
  Source/native-byte proof, never the fallback alone.
- A pure historical projection compares every old payload byte with the frozen
  package, including command metadata and resource-link rewrite. Only the exact
  recognized marker difference is separated from payload comparison. External
  resource bytes and the full bounded resource tree must independently match the
  frozen historical projection; old absence of `resourceFingerprint` cannot waive
  that check. Unknown extra files, redirected roots or unsupported pins fail.
- Single unambiguous physical mapping for both IDs and all affected roots. An old
  marketplace shared with siblings requires exact entry-level ownership and
  sibling preservation, never deletion of the marketplace directory by name.
  If the old root cannot be independently bounded, admission fails globally.
- Exact pinned adapter/version/route capability evidence, complete retention
  inventory and old+new mutation coverage. Current single-ID Native admission
  does not prove migration or a shared native mutation fence.

Projection proof must be pure; no native staging during dry-run. Share the byte
projection between proof and actual stage rather than invent a second permissive
comparison. The compressed historical CLI fixture supplies actual historical
goldens, not runtime authority or a required production dependency.

Initially prove the captured same-revision/payload case. Changed Source bytes,
Git historical locator repair and every additional old format remain required
follow-on acceptance cases until independently proved; they remain explicitly
unverified in the meantime, not waived from the complete migration requirement.

## Typed contract extension for review

Reuse the shared wire's `C`, domain-separated `H`, first immutable historical
snapshot, generation CAS, admission identity and immutable commit rules. Native
proof gains a discriminated variant, not an open format string:

```ts
type RootProof = {
  role: "cache" | "marketplace" | "resources";
  nativeId: string;
  physicalPath: string;
  presence: "present" | "absent";
  fingerprint: Digest | null; // null iff absent
};
type RetentionProof = {
  nativeId: string;
  data: { physicalPath: string; presence: "present" | "absent"; fingerprint: Digest | null };
  options: { configPath: string; presence: "present" | "absent"; valueDigest: Digest | null };
};
type ZCodeTwoIdProof = {
  adapterId: "zcode-cli";
  format: "zcode-cli/native-lifecycle-75d-v1";
  aliasMode: "two-physical-ids";
  oldLedgerNativeId: string; oldPhysicalNativeId: string; newNativeId: string;
  oldObservationId: string;
  oldRetirementRoute: "managed";
  oldMarkerRawDigest: Digest;
  oldReadback: SerializedLifecycleOperation["prior"];
  newPrior: SerializedLifecycleOperation["prior"]; // absent, independently proved
  oldRoots: RootProof[]; newRoots: RootProof[];
  retainedData: RetentionProof[];
  evidenceId: Digest;
};
```

Roots are exactly the adapter-derived cache/marketplace/resources paths per ID,
sorted by `(nativeId,role)`, with no duplicate/missing role. Retention entries are
exactly old/new IDs, sorted, with no duplicate/missing ID. `physicalPath` is the
captured canonical physical root (missing tails resolved from the nearest actual
ancestor); names and containment must match the adapter's independently derived
mapping. Presence is checked from the filesystem, not the receipt's assertion.
Options digest is `H("plugnz/zcode-options/v1", exact existing option value)`;
no option value or native credential crosses this public boundary. Absence must
include absence of that exact configuration key. Present data/tree fingerprints
use the existing framed tree algorithm, prefixed; no unknown extra resource bytes
are ignored. Existing retention observations remain mandatory composite readback,
but their path/status-only shape is not a substitute for these byte proofs.

Do not force a verified modern activation into `LegacyRecordProof`. The approved
`75c07bf` foundation is strictly legacy-only; its `legacyAdoptions` v1 fields and
entries stay unchanged. Coordinate with that owner before runtime/schema edits.
The exact separate optional envelope proposed below distinguishes origin kinds;
it reuses shared canonical hashing/first-retention/immutable-commit rules without
pretending modern history has an unknown legacy operation.

Add explicit `identity-migrate` plan/journal/handle action. Route remains Native
only if the new route proves it; it is not `install` with an invisible old delete.
The sealed operation must retain two exact priors and composite expected state:
new active-conforming, old inactive/unregistered, old data/options retained.
Do not rewrite the old-ID prior into a new-ID single readback to satisfy existing
single-ID validators. Runtime/serialization, state, reader, report, recovery and
consumer validators must explicitly understand and check both IDs. Exact schemas,
digest domains and worked vectors require independent contract review before code.

## Exact origin, relation and public accounting extension

All types below are closed, reject unknown fields/versions, and use the existing
strict validators for referenced types. Required nullable fields are present.
`Digest` and canonical `H` are exactly the shared wire's definitions, not a new
JSON-hashing algorithm. The separate optional state field is:

```ts
type VerifiedActivationIdentity = {
  scopeId: string; packageId: string; nativeId: string;
  sourceRelativeDir: string; sourceRevision: string;
  ownership: Exclude<OwnershipProofRecord, { kind: "legacy-claim" }>;
  activatedAt: string | null;
};
type VerifiedActivationSnapshot = {
  scope: DeploymentScopeRecord;
  activation: ActivationRecord;
};
type VerifiedActivationOriginal = {
  schemaVersion: 1;
  identity: VerifiedActivationIdentity;
  originalId: Digest;
  snapshot: VerifiedActivationSnapshot;
  recordDigest: Digest;
};
type IdentityMigrationOrigin =
  | { kind: "verified-activation"; original: VerifiedActivationOriginal }
  | { kind: "legacy-unsealed"; legacy: LegacyRecordProof };
type IdentityMigrationAdmission = {
  schemaVersion: 1;
  origin: IdentityMigrationOrigin;
  source: SourceSnapshotReference;
  target: PersistedTargetIdentity;
  packageName: string; packageVersion: string;
  sourceRelativeDir: string;
  projectedFingerprint: Digest;
  native: ZCodeTwoIdProof;
  fresh: {
    attemptId: string; operationId: string; command: "add" | "sync" | "update";
    baseStateGeneration: number;
    scopeId: string; packageName: string; nativeId: string;
    sourceSnapshotId: string; action: "identity-migrate"; route: "native";
  };
  admissionId: Digest;
};
type IdentityMigrationRecord = {
  schemaVersion: 1;
  admission: IdentityMigrationAdmission;
  seal: PairedIdentitySeal | null; sealDigest: Digest | null;
  phase: "prepared" | "not-attempted" | "rolled-back" | "committed";
  commit: IdentityMigrationCommit | null;
};
// Optional state-v2 addition; does not change legacyAdoptions-v1:
// identityMigrations?: { schemaVersion: 1; records: IdentityMigrationRecord[] }
```

`VerifiedActivationIdentity` is derived field-for-field from the original strict
activation, never supplied by a caller. Its `originalId` is
`H("plugnz/verified-activation-identity/v1", identity)`. Require authoritative
matching active Scope, exact Source/target/context, created/adopted ownership,
known route, verified active readback, no pending activation/journal for that pair,
and non-null installed/projected/source fingerprints. Version/path/revision and
ownership times must be valid strict values. `sourceRelativeDir` is mandatory;
absence cannot be guessed. Its record digest is
`H("plugnz/verified-activation-record/v1", snapshot)`.

This stable original key excludes mutable Scope aggregate desired/lastAttempt
headers, but includes the existing ownership proof and verification time plus
activation time/revision/path. A newly re-enrolled activation is not silently
treated as the old origin merely because its name/Native ID matches. If distinct
live records produce the same key but different exact activation authority, fail
as contradictory history rather than choosing one.

First atomic prepared retention fixes one exact snapshot/recordDigest per modern
`originalId`, even after not-attempted/rolled-back fresh relations. Later retries
reuse it, never recapture newer Scope aggregate headers. While the old activation
is active, every authority-bearing activation field must still equal the retained
snapshot; live Scope identity/source/target/context/authority must match. Mutable
Scope desired/attempt/timestamp aggregate fields may legitimately progress under
the existing generation CAS and are not permanent snapshot-equality predicates.
After verified replacement, retain proof/sealed commit permanently; subsequent
canonical update/remove/retire does not require the old activation to reappear.
Historical validity is not live Desired conformance or retirement authority.

Legacy origins reuse the exact immutable `LegacyRecordProof`, digest and original
tuple from the shared wire. Across **both** optional envelopes, all records for
one legacy original must reuse its first retained snapshot and there may be only
one open prepared relation/one committed supersession. Existing v1 entries are
not rewritten into modern origins or rehashed under a different record domain.
The new origin union alone grants no ownership or legacy recovery authority.

Admission identity is
`H("plugnz/identity-migration-admission/v1", admission without admissionId)`.
Strict origin/native/Source/target/fresh-operation correlations are additional
checks, never replaced by a matching hash. The shared deterministic attempt and
operation derivation applies unchanged. Expectations are excluded from derivation.
The exact migration
input is `operationIdentity("desired-pair", scopeId, packageName, newNativeId,
sourceFingerprint + "\\0" + attemptId)`; there is only one current Desired pair.

Existing explicit manifest selector may add optional
`expectedMigration: { schemaVersion: 1; admissionId: Digest }`. It must match a
real migration and cannot create one. A legacy-unsealed origin also requires
existing explicit `adoptExisting: true`; a verified modern owned origin does not
require invented adoption authority. Direct commands freeze admission before
writes; Personal's two-process flow supplies the preview expectation. Original
Scope/Source/target/version/native-byte drift or ambiguous correspondence anywhere
is global zero-write refusal. Own recovery/replan writes cannot silently rebind a
precommand expectation or refetch Source.

Inventory and public report additions are separately optional/versioned:

```ts
type IdentityMigrationHistory = {
  schemaVersion: 1;
  modernOriginals: VerifiedActivationOriginal[];
  records: IdentityMigrationRecord[];
};
// scopes row: identityMigrationHistory?: IdentityMigrationHistory
// plan/outcome: identityMigration?: IdentityMigrationAdmission
type IdentityMigrationReceipt = {
  origin: IdentityMigrationOrigin;
  admissionId: Digest;
  status: "not-attempted" | "pending" | "rolled-back" | "committed";
  record: IdentityMigrationRecord | null;
  reason: LifecycleReason | null;
};
// report: identityMigrations?: { schemaVersion: 1; receipts: IdentityMigrationReceipt[] }
```

Modern originals expose each eligible exact precommand activation once, keyed by
`originalId` plus recordDigest; conflicts are corruption. Historical relation
snapshots persist even when a live modern original has been replaced. Inventory
must not fabricate a modern original from an imported legacy claim. All scopes,
contexts, Source identities and records correlate exactly, not by package names.

A modern receipt matches exactly one requested previewed migration or inventoried
fresh pending relation. It is never a `RecoveryOperationProof` for the old modern
activation, never included in the legacy-original accounting set, and never emits
a legacy recovery/adoption receipt. A resumed fresh journal receives its ordinary
modern recovery receipt; the origin/migration receipt accounts for the historical
relation, not a second native mutation. Current outcomes/modern recovery receipts
carry changed flags once; migration receipts carry no extra changed flag.

For legacy originals, eligible precommand originals form the **disjoint complete**
union of ordinary recovery receipts, existing v1 adoption receipts, and new
legacy-unsealed migration receipt origins. One original in two families is invalid;
all unrelated pending originals retain ordinary not-attempted accounting. A
committed relation removes blocking eligibility only after strict retained
original/paired-seal/modern-COMMIT validation. Both histories remain reader-visible.

`committed` requires matching durable committed record, immutable paired commit
and null reason; `pending` requires prepared/committed record plus exact unresolved
modern journal and precise reason; `rolled-back` requires verified paired rollback
and non-null failure reason; `not-attempted` permits null record only before fresh
intent or an exact no-write settled record. No status settles an unknown original.
Consumer ordering is precommand scopes → targeted preview/expectation → command
→ strict coverage/accounting → targeted post-scopes durable-commit verification
→ later writes, using existing seams and the shared omission exception only.

## Exact paired seal and immutable commit

```ts
type PairedIdentitySeal = {
  schemaVersion: 1; admissionId: Digest;
  adapterId: "zcode-cli"; attemptId: string; operationId: string;
  scopeId: string; target: PersistedTargetIdentity;
  packageName: string; action: "identity-migrate"; route: "native";
  oldRetirementRoute: "managed";
  source: SourceSnapshotReference;
  packageFingerprint: Digest; projectedFingerprint: Digest;
  detectedVersion: string; versionProbeId: string; capabilityEvidenceId: string;
  mutationGroupId: string; mutationInvocationOperationId: string;
  affectedNativeIds: [string, string]; affectedOperationIds: [string];
  old: { nativeId: string; prior: SerializedLifecycleOperation["prior"]; expected: SerializedLifecycleOperation["expected"] };
  canonical: { nativeId: string; prior: SerializedLifecycleOperation["prior"]; expected: SerializedLifecycleOperation["expected"] };
  priorRoots: RootProof[]; expectedRoots: RootProof[];
  priorRetention: RetentionProof[]; expectedRetention: RetentionProof[];
};
type IdentityMigrationCommit = {
  schemaVersion: 1; admissionId: Digest; sealDigest: Digest;
  verifiedReadback: {
    old: SerializedLifecycleOperation["expected"];
    canonical: SerializedLifecycleOperation["expected"];
    roots: RootProof[]; retention: RetentionProof[];
  };
  stateGeneration: number; committedAt: string; commitId: Digest;
};
```

The old/canonical readbacks retain their actual distinct native IDs; all other
adapter/Scope/target/package identity fields match the operation. Old prior is
present and verified active; canonical prior independently absent with no active
entry or roots. Old expected is absent/inactive with not-applicable enablement,
but retained data/options; canonical expected is active/present/enabled with
exact projected native/resource bytes. Root proofs describe actual filesystem
post-state, not only registry presence. Old owned payload roots are removed only
if independently exclusive; shared roots are preserved with exact remaining
fingerprints and unchanged sibling membership explicitly bound by the native
proof. A shared path cannot appear as both absent and preserved. If this cannot
be proved, do not seal this format's migration.

Both affected Native IDs occur exactly once in sorted order, exactly old/new;
affectedOperationIds is exactly this fresh operation, and group/invocation IDs are
exactly its operation ID. This proposal does not batch several migrations under
an invented leader. Detected version/probe and capability evidence match the
fresh selected route and admission; all package/Source fingerprints use the actual
documented algorithm, with wire digest prefix validated rather than string-coerced.
The public seal is the exact projection of the new paired serialized handle,
excluding private artifact/rollback paths; validators recompute it field-for-field.
The private handle retains both rollback priors and artifact references, never
forges an old-ID prior under the canonical new ID.

Existing ZCode explicitly marks Native uninstall unsupported because it drops
data/options. `route: native` is the new canonical activation route;
`oldRetirementRoute: managed` is mandatory and visible. A distinct composite
`identity-migrate` capability profile must prove new Native activation and
retention-safe adapter-managed old retirement, including paired rollback. It
cannot borrow current Native install/update support or invoke Native uninstall.
The old expected absent readback reflects Managed retirement; old prior retains
the actual Native representation. No prior route is rewritten to hide this fact.

`sealDigest = H("plugnz/identity-migration-seal/v1", seal)`;
`commitId = H("plugnz/identity-migration-commit/v1", commit without commitId)`.
Commit verifiedReadback must equal both expected readbacks/roots/retention and
reflect the actual verified paired observation. Its generation is the one atomic
replacement generation, not a later cleanup generation. Admission/handle IDs,
journal `identity-migrate` action/Native route, seal, immutable COMMIT settlement
and cleanup-pending/completed state must all correlate. Missing/contradictory
history is loud; later canonical activation updates/removal cannot alter commit.

## Coverage and one atomic Desired pair

Freeze exactly one Desired operation keyed by `(Scope, packageName)` with canonical
new Native ID and `identity-migrate` action. Its coverage consumes **both** old and
new IDs; the old owned activation is a transaction dependency, not an independent
orphan. Global omission planning must subtract admitted old activation identities
before classifying retire-orphan operations. Another requested remove/retire/pin
against either ID conflicts globally; no duplicate package outcome or second
retirement is permitted. An unadmitted old identity remains blocked by the guard,
never omitted to force convergence. A failed/pending migration blocks Scope prune
and leaves lastConverged unchanged; a composite verified commit advances it once.

Ledger acceptance retains the old active record unchanged until the composite
commit. The fresh paired journal is discoverable by its canonical ID **and** old-ID
dependency; all add/sync/update/remove/retire/pin/recovery guards must find it even
if no new activation exists yet. Commit CAS atomically replaces the exact old
active row, writes the canonical owned row, immutable relation/commit/readback and
fresh COMMIT cleanup-pending journal. No independently persisted intermediate
ownership upgrade or old-record deletion is valid. Rolled-back attempts retain
the same origin snapshot and both priors, with no committed replacement relation.

## Worked stable-key/retry/coverage vectors

This canonicalization-only vector is synthetic, not native authority. Local
Source `/fixtures/catalog` and `zcode-cli/default` derive the existing Scope ID
below. Canonical payload is the exact one-line JSON (without final newline):

```json
{"activatedAt":"2026-10-11T00:00:00.000Z","nativeId":"demo@catalog","ownership":{"kind":"created","proofKey":{"key":"sha256:0000000000000000000000000000000000000000000000000000000000000000","kind":"managed-marker"},"verifiedAt":"2026-10-11T00:00:00.000Z"},"packageId":"demo","scopeId":"scope-v1-39b5df12b629b9414c9c752db5ee5f8e437e42195f63f343e991146760e5f7ae","sourceRelativeDir":"plugins/demo","sourceRevision":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}
```

`H("plugnz/verified-activation-identity/v1", payload)` is
`sha256:da34a68e23a7d78f2b72ead91e9111b0a9a7719136cf701d7cd75b7eb122c557`.
Changing verification time/revision/path/ownership must change it; mutable Scope
aggregate headers do not. The record digest separately covers the full original
snapshot. Executable Bun/Node record/admission/paired-seal/commit golden vectors
and unknown/missing-field negatives remain required before runtime admission.

Retry example: A retains snapshot S1/digest D1 at generation G1, then rolls back.
Sibling B changes aggregate Scope header H1→H2 and generation G1→G2 without
changing A's actual activation/Source/context. A's refreshed admission reuses
S1/D1 and uses G2/new attempt identity with freshly reproved native bytes. It
cannot recapture S2 just because H2 differs. Stale G1 expectation refuses globally.
Re-enrollment with new verified ownership identity is a different origin.

Coverage example: one selected `demo` Desired pair consumes old `demo@catalog`
and new hashed ID through one `identity-migrate` operation, not an install plus
old retire-orphan. One composite readback/CAS commits canonical row, exact old-row
replacement, relation/readback and cleanup-pending journal. Old data/options stay.
Restart after that point settles only modern cleanup; update/retire cannot alter
the immutable historical commit or reactivate old history.

Intermediate recovery CAS accepts only the complete prior, complete candidate or
an exact phase-specific checkpoint proved from the chosen native/managed
primitives. New installed while old remains active is a reachable checkpoint;
each managed old cache/registry/flag/resource/marketplace retirement step requires
its own exact fingerprint/metadata witness. Arbitrary Cartesian combinations or
unknown partial native-command states stay pending with backups. This checkpoint
schema and actual fence proof must be reviewed before migration implementation.

## Transaction, CAS and restart

1. Global admission freezes every Scope and both-ID coverage. Persist fresh
   accepted intent plus exact retained origin/admission relation atomically before
   staging. An expectation from preview binds the precommand generation.
2. Acquire a proven mutation fence, revalidate admission/current native roots,
   then snapshot both cache selections, registry/config entries, marketplace
   entries/owned trees, external resources and data/options boundaries before any
   mutation. Capture canonical physical roots so supported stable native-store
   links remain valid and later root retargets cannot authorize deletion.
3. Seal the fresh handle and paired priors with the complete attempt/operation,
   both IDs, roots/fingerprints, Source and origin digest. Persist it before apply.
   Native fence proof is a required gate: a plugnz-only lock must not be described
   as excluding concurrent native harness writers. Existing ZCode currently has no
   `beginRecovery` implementation; single-process rollback is insufficient.
4. Stage/install the new owned identity without overwriting existing foreign
   paths. Keep old usable state until new byte/loader/retention readback verifies.
   Then retire only the exact old activation entries and roots supported by the
   admission. Preserve old-ID data/options in place; do not guess an options merge
   or delete data because the old ID is no longer active. Report retained paths.
5. Composite readback verifies new conforming bytes, old no longer active and
   exact retention/sibling preservation. One ledger generation CAS writes the
   canonical activation, removes only the exact old active record, commits the
   retained migration relation/readback and modern COMMIT cleanup-pending journal.
   `lastConverged` advances only at this verified composite boundary.
6. Cleanup/dispose only exact captured artifacts after the durable commit receipt;
   release the fence, then close the modern journal. Any failure keeps accurate
   durable pending state and referenced backups. Original historical proofs stay.

Rollback validates **all** affected surfaces before its first restore write.
Each must equal the sealed prior or an exact reachable fresh candidate/phase
state; foreign third states produce pending recovery, never deletion/overwrite.
Restore old selection/payload/resources and old enablement, restore the proved
absent new state, and preserve unrelated JSON entries semantically. Validate both
priors and retention before publishing rollback/cleanup-pending; artifacts survive
ledger failure. No same-ID snapshot can authorize deletion of the other ID.

Restart parses the exact paired sealed handle and durable relation, re-acquires
the same fence, validates both-ID prior/candidate CAS, and settles only the fresh
operation. Prior/candidate classifications must include reachable intermediate
states (new installed while old active; new verified while old retirement partial).
Unknown mixtures/foreign state fail loudly. Committed cleanup cannot resurrect
the old activation, roll back a committed migration, or reopen a superseded
legacy obligation. Fresh retries never replay the original unknown operation.

## Acceptance and foundation scan

Required public subprocess proofs use authentic historical CLI-generated homes,
not forged created ownership: same-revision old→new, unchanged repeat, update,
pin refusal/preservation, source-free retirement and retained old/new data/options.
Preview/apply bad-last batches and wrong Scope/Source/ref/path/version/old format,
foreign roots/resources, duplicate old rows or existing new state are global zero
writes. Include siblings in shared registry/config/marketplace stores.

Kill real subprocesses before seal, after new install, during old retirement,
before atomic commit and after commit/disposal; restart verifies exact rollback
or commit and preserves first historical snapshot. Inject native exit failures,
readback mismatch, ledger permission failure, cleanup/release failure, and foreign
third states on **either** ID before rollback's first write. No production timeout
or assertion is weakened to make a gate pass.

Scan every action enum, SPI/factory, sealed serializer/validator, activation/prune
lookup, journal state/CAS, recovery inventory/receipt, report/legacy serializer,
doctor/list reader and Personal validator before enabling the variant. Pin and
remove cannot rebind the original by name or reopen unknown history. Final gates:
two independent design/code axes, focused/full producer/consumer, packed supported
Node artifact and fresh official pinned ZCode loader/native-update/failure proof.

## Fresh NativeGit proof budget (separate acceptance)

The original 1-GiB source-build/100-MiB archive plan below this heading was
insufficient and is superseded, not an approved current launch configuration.
Its failed acquisition did not yield a complete stopped archive and cannot count
as a genuine supplier or Native proof. Historical free-space measurements are
not current capacity evidence.

The [exact-source supplier workflow](evidence/zcode-exact-source-workflow-20261012.md)
pins official Source `872ad960`, Node 24.14.0, pnpm 10.33.2, the root frozen lock,
and upstream's Node/esbuild/Turbo build. It distinguishes private package version
0.1.0 from actual CLI version 0.16.9. The all-platform optional-dependency policy
means the prior Linux-only package-size measurement is only a lower bound.
No community wrapper, desktop asset, lock relaxation or upstream patch is a
substitute. The workflow itself has not established a successful build.

Supplier acquisition requires the separately reviewed private large-preservation
profile: 2.5-GiB retained bodies, 2.75-GiB archive, 6-GiB whole-filesystem growth,
2.875-GiB remote reserve, 6-GiB local free-space floor and 780-second preservation
reserve. Profile review and an actual launch-time capacity/expiry check are
mandatory; stating these bounds does not approve an unreviewed controller or
guarantee the build fits. Preserve every failed prefix and independently restore
the entire accepted supplier before a Native arm. Existing raw evidence and
durable archives count toward disk use; do not duplicate complete suppliers per
arm. The later Native arm has its own bounded budget and distinct unprivileged
UID. Freeze controlled HTTPS Source V1/V2 and the rebuilt combined producer
artifact before each gate; earlier C72 proofs belong only to their own producer.
No real installation, user credentials or model turn is in this proof scope.

Proofs: canonical Git Source install, same-HEAD zero-write preview/apply, changed
SHA/content convergence where supported, actual loader skill/command/resource
bytes, actual native failure rollback and foreign-CAS refusal, source-free retire
with data/options/siblings retained. Kimi's currently unverified update remains a
truthful required limitation, not mock-only Native capability admission. Preserve
all failed attempts, archive inventory plus hashes and perform a real bounded
restore before loose-copy deletion; independent review precedes any deletion.
