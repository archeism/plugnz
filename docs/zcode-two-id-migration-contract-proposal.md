# ZCode two-physical-ID migration — contract proposal

Status: design for independent review, not implementation or native admission.
Proposal correction baseline: `584ab4a`; historical producer: `75d7bc1`.
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
  role: "cache" | "marketplace" | "marketplace-cache" | "resources";
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
  targetVersion: Extract<TargetVersionObservation, { kind: "detected" }>;
  nativeFence: NativeFenceEvidence;
  sharedStores: SharedStoresProof;
  evidenceId: Digest;
};
```

Roots are exactly the adapter-derived cache/marketplace/marketplace-cache/resources paths per ID,
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

`marketplace` is plugnz's owned authored materialization;
`marketplace-cache` is the native cached marketplace tree. They are distinct:
the pinned native adapter derives its manifest as
`<pluginStorageRoot>/marketplaces/<sanitized-market>/marketplace.json`.
Both full trees and any native atomic-activation transaction/backup sidecars
belong to the mutation boundary. The private historical fixture's six-root proof
does not prove these additional genuine native surfaces.

## Shared-store witnesses and permitted deltas

This proposal's closed additions below contain digests/membership, never option
values, credentials or rollback artifact paths:

```ts
type EntryDigest = { key: string; presence: "present" | "absent"; valueDigest: Digest | null };
type SharedJsonProof = {
  kind: "installed-registry" | "config" | "marketplace-registry";
  format: "zcode-native/0.16.9";
  physicalPath: string;
  rawDigest: Digest; preservedDigest: Digest;
  selected: EntryDigest[];
  siblings: { key: string; valueDigest: Digest }[];
  siblingOrder: string[];
};
type MarketplaceMembershipProof = {
  nativeId: string; physicalPath: string;
  role: "marketplace" | "marketplace-cache";
  exclusive: boolean;
  selectedEntry: EntryDigest;
  selectedPayloadPath: string;
  selectedPayloadFingerprint: Digest | null;
  preservedMetadataDigest: Digest;
  preservedTreeDigest: Digest;
  siblings: { packageName: string; entryDigest: Digest; physicalPayloadPath: string; payloadFingerprint: Digest }[];
  siblingOrder: string[];
};
type SharedStoresProof = {
  json: [SharedJsonProof, SharedJsonProof, SharedJsonProof];
  marketplaces: MarketplaceMembershipProof[];
  nativeParents: { physicalPath: string; fullInventoryDigest: Digest;
    preservedInventoryDigest: Digest }[];
};
```

The `json` tuple order is installed-registry, config, marketplace-registry and
each canonical physical path is independently adapter-derived. Duplicate/missing
files, rows/keys, roles or sibling membership refuse. `selected` has exactly two
old/new registry entries, four config keys (`enabled:<id>` and `options:<id>`),
or two old/new marketplace entries. Selected keys and the `siblings` digest list
sort lexicographically; `siblingOrder` preserves the original array-relative order
(empty for unordered config objects). Native identity/key parsing is exact, never
basename stripping. Null values hash as present values, not absent entries.

The native 0.16.9 installed file is `{version:1,plugins:[...]}` and known
marketplaces is `{version:1,marketplaces:[...]}`, not the fixture's name-to-path
map. For each JSON surface, remove only its exact selected entries from the
validated decoded value, retaining every other field, container presence,
sibling value and sibling-relative order. Its canonical redacted remainder is
`H("plugnz/zcode-shared-remainder/v1", {kind,physicalPath,value:remainder})`.
Each entry digest is `H("plugnz/zcode-shared-entry/v1", {kind,key,value})`;
rawDigest separately binds exact file bytes for immediate CAS. Unknown preserved
metadata is never dropped during rewriting. All prior full values/raw bytes stay
in private sealed rollback artifacts; public digests do not reconstruct secrets.

`nativeParents` is the exact deduplicated sorted set of parent namespaces in which
the pinned primitives create cache/marketplace activation sidecars or replace the
three shared JSON files. Each canonical path is independently derived from their
actual target paths, with captured physical parent identity in the private handle.
Inventory records every direct child and its complete tree/body/kind/mode digest;
no unknown entry is ignored. Full inventory uses
`H("plugnz/zcode-native-parent/v1", {physicalPath,entries})`; preserved inventory
uses that same domain after removing only exact selected target names and exact
sidecar names bound by this invocation's validated native transaction receipt.
It is not a wildcard exclusion for `.stage-*`, `.backup` or `.transaction.json`.
Missing or unrecognized sidecar ownership keeps the native transition unknown.
These witnesses carry digests, not plugnz rollback paths or native credential data.

The only permitted registry deltas are addition of the exact proved canonical
native row and later removal of the exact old row. No dependency-closure install
outside the two IDs is admitted. Canonical row fields must match the pinned native
record schema, package/version/cache/Source and bounded command receipt; generated
`installedAt`, `updatedAt` and `cacheTransactionId` are recorded exactly in the
post-command witness, not declared arbitrary wildcards in the precommand seal.
An interrupted native call without that complete proved witness is unknown,
not a checkpoint allowing automatic rollback.

Config allows addition of canonical enablement `true`, then removal of the exact
old enablement key. Both old/new options remain byte-equivalent canonical values
to their retained priors throughout; existing old options are never merged,
moved, erased or copied under the new ID. All sibling flags/options, global
switches, higher-level overrides and unrelated metadata are invariant.

For authored and native-cached marketplace trees, bind exact manifest metadata,
selected entry/payload and every sibling entry/path/tree. The preserved metadata
digest covers all manifest fields except `plugins`; preserved tree digest is
`H("plugnz/zcode-marketplace-remainder/v1", sorted full relative inventory)` after
excluding only the independently owned selected payload subtree and manifest
bytes. Inventory includes kind, full mode and body digest for files, all directory
entries and exact symlink targets; unsupported redirected payload roots refuse.
Manifest entry digests use the shared entry domain with the role as `kind`.
Membership is complete, duplicates fail, and sibling-relative order is invariant.
The selected subtree cannot contain a sibling root or an ancestor of one.

Exclusive roots have no siblings or unknown retained payloads: removing their
selected manifest/payload permits removal of the captured whole root and old
marketplace registration. Shared roots remain present at the same physical paths:
remove only the exact selected manifest entry and independently exclusive selected
subtree in each role, preserving all siblings/metadata. Retain the old native
marketplace record; the only allowed field change is `pluginCount = priorCount-1`,
with the prior count independently matching complete native manifest membership.
Every other record field, including Source and native transaction IDs, is unchanged.
All new marketplace metadata comes only from the bounded native command receipt.
No whole shared marketplace refresh, unlink, renamed parent or deletion by name is
authorized. Shared retirement is required acceptance work, not excluded because
the current private precondition refuses it.

Admission carries exact priors; the seal commits the allowed per-step delta policy,
membership and opaque remainder witnesses; each checkpoint/readback carries exact
observed entry/raw/root digests. Rollback must prove the entire matched checkpoint
and all invariant remainders before its first write, then restore selected entries
while preserving siblings. Unknown extra/native sidecar writes or changes to any
remainder are a foreign third state and keep artifacts plus loud pending recovery.

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
sourceFingerprint + "\0" + attemptId)`; there is only one current Desired pair.
Here `"\0"` denotes one actual U+0000 separator, not the two characters
backslash and zero. Each operation field is framed as its decimal JavaScript
UTF-16 `.length`, U+0000, the UTF-8 field bytes, and U+0000; SHA256 of the joined
frames has prefix `operation-v1-`. This is the existing planner protocol, not
the canonical JSON digest protocol. The Source fingerprint is its existing raw
64-hex value, not a newly prefixed wire digest. See the executable literal vector
below; using a backslash-zero salt produces a different, invalid operation ID.

`native.targetVersion` is the fresh adapter observation from this precommand
inventory, never the original activation's recorded version, a consumer metadata
profile or a supplied string. Unknown/unparseable observations cannot create an
admission. Admission hashing includes that complete observation; the existing
capability `evidenceId` binds its reviewed route/version profile. Exact verified
native supplier/runtime hashes remain in acquisition and capability-proof receipts,
not in a newly invented mandatory public artifact field.
Fresh probing/revalidation after ALL required fences are acquired must equal the previewed
observation and capability evidence before any recovery, stage, ledger or native write;
version/probe/evidence drift invalidates the expectation globally. The paired seal's
`detectedVersion`/`versionProbeId` equal those detected fields; its capability
evidence and fence evidence must bind the same version/probe and target.

Existing explicit manifest selector may add optional
`expectedMigration: { schemaVersion: 1; admissionId: Digest }`. It must match a
real migration and cannot create one. A legacy-unsealed origin also requires
existing explicit `adoptExisting: true`; a verified modern owned origin does not
require invented adoption authority. Direct commands freeze the complete batch
read-only, acquire all required fences, then revalidate that complete batch before
the first accepted intent/relation/recovery write; Personal's two-process flow
supplies the preview expectation. Original
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
  nativeFence: NativeFenceEvidence;
  mutationGroupId: string; mutationInvocationOperationId: string;
  affectedNativeIds: [string, string]; affectedOperationIds: [string];
  old: { nativeId: string; prior: SerializedLifecycleOperation["prior"]; expected: SerializedLifecycleOperation["expected"] };
  canonical: { nativeId: string; prior: SerializedLifecycleOperation["prior"]; expected: SerializedLifecycleOperation["expected"] };
  priorRoots: RootProof[]; expectedRoots: RootProof[];
  priorRetention: RetentionProof[]; expectedRetention: RetentionProof[];
  priorSharedStores: SharedStoresProof;
  checkpointPolicy: PairedCheckpointPolicy;
};
type IdentityMigrationCommit = {
  schemaVersion: 1; admissionId: Digest; sealDigest: Digest;
  verifiedReadback: {
    old: SerializedLifecycleOperation["expected"];
    canonical: SerializedLifecycleOperation["expected"];
    roots: RootProof[]; retention: RetentionProof[]; sharedStores: SharedStoresProof;
  };
  stateGeneration: number; committedAt: string; commitId: Digest;
};
```

The old/canonical readbacks retain their actual distinct native IDs; all other
adapter/Scope/target/package identity fields match the operation. Old prior is
present and verified active; canonical prior independently absent with no active
entry or roots. Old expected is absent/inactive with disabled serialized enablement
(public outcome enablement can be not-applicable),
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
reflect the actual verified paired observation. Its shared-store witness must equal
the final exact candidate checkpoint admitted by the sealed delta policy, including
native-generated record metadata bound by its retained command receipt; it is not
a fabricated pre-seal digest for timestamps/transaction IDs that do not yet exist.
Invariant remainders/membership are fixed by the admission and seal throughout.
Its generation is the one atomic
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

<!-- zcode-operation-golden-v1 -->
```json
{
  "scopeId": "scope-v1-39b5df12b629b9414c9c752db5ee5f8e437e42195f63f343e991146760e5f7ae",
  "sourceFingerprint": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "packageName": "demo",
  "newNativeId": "demo@plgnz-3c708994a71afe18",
  "stateGeneration": 7,
  "attemptId": "attempt-v1-539846b9c0b94590ffd345250188834e1ba0db89a1d7a04654abd6fd475bbe11",
  "operationId": "operation-v1-43655b1cb41cb836e6b1dfb9acb13031c1f6b7b56a65bad742343e6df015550f",
  "framedUtf8Hex": "313200646573697265642d706169720037330073636f70652d76312d3339623564663132623632396239343134633963373532646235656535663865343337653432313935663633663334336539393131343637363065356637616500340064656d6f0032370064656d6f40706c676e7a2d3363373038393934613731616665313800313430006666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666600617474656d70742d76312d3533393834366239633062393435393066666433343532353031383838333465316261306462383961316437613034363534616264366664343735626265313100"
}
```

The attempt frames `["7","sync",scopeId,sourceFingerprint,"demo"]`; the operation
frames `["desired-pair",scopeId,"demo",newNativeId,sourceFingerprint+NUL+attemptId]`.
Its last field length is 140 UTF-16 units. A backslash-zero salt yields invalid
`operation-v1-8bfc31decbc66d89967a5d55058e006303f44ac5a85e4bbc6e5265a24f4f6ad8`.
`test/zcode-migration-contract-vectors.test.mjs` pins these literals and calls the
existing pure planner attempt derivation. These are framing vectors, not native
admission, original-history, checkpoint or capability proof.

## Closed checkpoint and fence boundary

These are proposal types, not additions to current runtime/state enums:

```ts
type NativeFenceEvidence = {
  mechanism: "host-enforced-cross-process";
  targetVersion: Extract<TargetVersionObservation, { kind: "detected" }>;
  evidenceId: Digest;
  writerCoverageDigest: Digest; physicalBoundaryDigest: Digest;
};
type PairedCheckpointPoint =
  | "sealed" | "canonical-marketplace-source-ready" | "canonical-resources-ready"
  | "canonical-marketplace-registered"
  | "canonical-verified" | "old-flag-removed" | "old-row-removed"
  | "old-cache-removed" | "old-resources-removed"
  | "old-source-entry-removed" | "old-source-payload-removed"
  | "old-cache-entry-removed" | "old-cache-payload-removed"
  | "old-marketplace-record-retired" | "old-source-root-retired"
  | "old-marketplace-cache-root-retired" | "candidate-verified"
  | "committed" | "restoring" | "rolled-back";
type PairedObservation = {
  old: SerializedLifecycleOperation["expected"];
  canonical: SerializedLifecycleOperation["expected"];
  roots: RootProof[]; retention: RetentionProof[]; sharedStores: SharedStoresProof;
};
type ForwardCheckpointPoint = Exclude<PairedCheckpointPoint, "restoring" | "rolled-back">;
type PairedCheckpointPolicy = {
  schemaVersion: 1;
  steps: { from: Exclude<ForwardCheckpointPoint, "committed">;
    to: Exclude<ForwardCheckpointPoint, "sealed">;
    primitive: "rename-owned-tree" | "replace-selected-json" | "native-marketplace-add" | "native-install"
      | "verified-readback" | "ledger-cas";
    allowedDeltaDigest: Digest }[];
  reverse: { from: Exclude<ForwardCheckpointPoint, "committed">;
    steps: { index: number; primitive: "rename-owned-tree" | "replace-selected-json";
      allowedDeltaDigest: Digest }[] }[];
};
type PairedStepIntent = {
  schemaVersion: 1; admissionId: Digest; sealDigest: Digest;
  predecessorCheckpointId: Digest; direction: "forward" | "reverse";
  policyIndex: number; beforeDigest: Digest; expectedAfterDigest: Digest | null;
  intentId: Digest;
};
type PairedCheckpoint = {
  schemaVersion: 1; admissionId: Digest; sealDigest: Digest;
  attemptId: string; operationId: string;
  sequence: number; point: PairedCheckpointPoint;
  previousCheckpointId: Digest | null; fenceEpoch: string;
  observation: PairedObservation; stepIntentId: Digest | null;
  rollback: { fromCheckpointId: Digest; step: number } | null;
  nativeReceipt: { command: "marketplace-add" | "install";
    invocationId: string; invocationWindowDigest: Digest;
    stdoutDigest: Digest; observedDeltaDigest: Digest } | null;
  checkpointId: Digest;
};
```

All fields/versions are closed; unknown points, duplicate steps and skipped or
reordered transitions fail. `checkpointId` is
`H("plugnz/zcode-paired-checkpoint/v1", checkpoint without checkpointId)`.
`sequence` starts at zero and increments by one. The sealed checkpoint has null
predecessor/receipt and equals the seal's complete prior; every successor binds its
predecessor ID and exact admission/seal/attempt/operation/fence epoch. Observation
digests use `H("plugnz/zcode-paired-observation/v1", observation)`; sealed delta
policy digests use `H("plugnz/zcode-paired-delta/v1", exact allowed selected paths/keys/operation)`.
Hashes are correlation checks, never possession or native mutation authority.
The seal fixes delta policies, not guessed full future native timestamp/UUID
digests. Before each step append one immutable intent under the held fence;
`intentId = H("plugnz/zcode-paired-intent/v1", intent without intentId)`.
Its beforeDigest equals the exact predecessor observation, index/direction select
exactly one sealed policy, and expectedAfterDigest is derived from that predecessor
plus the sealed deterministic delta for every managed/reverse step. It may be null
only for the two native calls whose generated metadata is receipt-bound. Checkpoint
stepIntentId matches that exact intent; sealed has null stepIntentId. Intents cannot
alter the delta policy, Scope, Source, IDs, roots, prior or retained original.

The fixed forward chain is the points above through candidate-verified, then
committed. Shared-root retirement points are verified no-ops preserving the complete
shared root; exclusive-root points remove only their captured root after selected
contents are retired. Rolled-back is reachable only through whole paired readback
verification after restoration, never because one root happens to match its prior.
Restoring/rolled-back are not members of the forward chain. A forward checkpoint
has null rollback; restoring/rolled-back require its exact start checkpoint ID and
an index into the seal's complete deterministic reverse policy for that start point.

| Point reached | Sole permitted difference; every unlisted witness is invariant |
| --- | --- |
| canonical-marketplace-source-ready | Atomic rename of exact sealed authored marketplace tree into absent canonical root; old unchanged |
| canonical-resources-ready | Atomic rename of exact sealed resource tree into absent canonical root; all other surfaces unchanged |
| canonical-marketplace-registered | Native marketplace add creates exact canonical known record/cached marketplace, including full native sidecar inventory |
| canonical-verified | Native install creates canonical cache/installed row/enablement; actual loader, Source/resources and complete native delta verify; old unchanged |
| old-flag-removed | Remove only old enablement; old registered cache inactive; all data/options unchanged |
| old-row-removed | Remove only old installed row; captured payload roots still exist |
| old-cache-removed | Remove only independently exclusive old cache tree |
| old-resources-removed | Remove only independently exclusive old external-resource tree |
| old-source-entry-removed | Remove only selected authored manifest entry; preserve sibling entries/order/metadata |
| old-source-payload-removed | Remove only selected authored package subtree; preserve sibling roots/inventory |
| old-cache-entry-removed | Remove only selected native-cached marketplace manifest entry; siblings unchanged |
| old-cache-payload-removed | Remove only selected native-cached package subtree; siblings unchanged |
| old-marketplace-record-retired | Exclusive: remove exact old known record; shared: only proved pluginCount decrement |
| old-source-root-retired | Exclusive root absent; shared complete preserved authored root remains |
| old-marketplace-cache-root-retired | Exclusive root absent; shared complete preserved native-cached root remains |
| candidate-verified | No mutation; match both readbacks, every root/shared remainder/sibling and retention |
| committed | One ledger generation CAS replacing exact old row and persisting immutable relation/commit plus cleanup-pending journal; native unchanged |

The two native transitions permit `expectedAfterDigest:null` only for the pinned
schema's native-generated timestamps/transaction IDs captured from the exact approved
command under the proven shared fence. Their sealed delta policy fixes every semantic
field/path and all siblings/remainders. Before any old retirement, durably record the
exact validated command receipt plus full post-state checkpoint and read it back.
A timeout, exit failure, kill, absent receipt, unrecognized sidecar or incomplete
native state never authorizes a guessed transition or broad rollback. Interruption
between native mutation and that durable checkpoint is explicitly unknown, with
loud pending recovery and complete backups. Real native recovery classification
of this window remains required acceptance work; this schema does not prove it.

For managed writes, expectedAfterDigest is mandatory and derived before apply from
sealed bytes/entries and predecessor, never from arbitrary post-state. Persist
intent before each write. Tree activation/retirement uses one same-filesystem
atomic rename between an exact captured root and an exclusive private staged or
retained artifact slot; both parents' captured physical identity/device and the
destination's absence are mandatory. Root retirement does not recursively delete
live contents: it removes their native path by rename, retaining the complete
artifact until COMMIT cleanup. JSON replacement uses a fully written deterministic
candidate and atomic same-parent rename, with exact prior raw bytes/mode and every
preserved remainder checked under the fence. Thus each managed edge leaves exactly
predecessor or successor. Recursive live deletion, multi-object live copy and
cross-device rename are forbidden primitives for this format, not deferred prefix
wildcards. Final disposal is modern cleanup after durable COMMIT, never rollback
authority over an unproved live tree.
Restart matches one full witnessed checkpoint or proved atomic-edge outcome across
all surfaces; Cartesian mixtures of old/new roots/JSON are foreign states. For every
forward checkpoint except committed, the seal contains exactly one reverse recipe:
reverse its completed native/managed deltas in deterministic order, using only
captured owned-tree rename and selected-JSON replacement, never native uninstall.
Unchanged surfaces are verified no-ops; each reverse intent fixes full before/after
observation digests for its sealed precise selected paths/keys. Reverse indices start at zero,
are contiguous, and terminate at the complete sealed prior. Restore progress uses
the same predecessor/successor CAS across all surfaces, checks all invariant
remainders before its first write, and records each completed atomic step before
the next. Only full final prior readback permits rolled-back. A reverse policy
missing any start point, surface or exact artifact authority refuses sealing.
Failure retains artifacts/pending state. COMMIT is irreversible:
cleanup cannot follow a reverse edge or resurrect old ownership.

The fence begins before snapshots/native staging and spans both IDs, both
marketplace roles, shared installed/known registries, every effective config path,
data/options witnesses, native transaction sidecars and ledger CAS. Keep it through
paired verification and rollback or committed cleanup. Restart acquires a fresh
epoch and reproves every exact witness. Coverage must include native CLI,
app-server/protocol, discovery/seed/atomic-recovery writers, plugnz and any
plugin-data writers excluded by claimed retention fingerprints. Versioned capability
evidence must prove actual exclusion and crash/restart semantics for this complete
writer/root boundary. Matching hashes, empty process scans, lock filenames,
promise queues, a plugnz-only lease and successful child exit are not participation.

### Pinned native limitation and owner options

At official [Source 872ad960's plugin-storage-lock.ts](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/bootstrap/src/lib/plugin-storage-lock.ts#L1-L27),
the entire mutation lock is an in-process `Map<string,Promise<unknown>>`; lines 1–5
explicitly make cross-process locking a non-goal. Separate CLI/app-server processes
therefore do not share it. The
[official seed lock](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/bootstrap/src/app/official-plugin-seed-lock.ts)
is scoped to bundled-version seeding, not this paired boundary. Native
[atomic directory activation](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/adapters/src/plugins/atomic-directory.ts)
has per-target reservations/exclusive markers and recovery; its POSIX atomic file
replacement path does not acquire a common registry/config fence. These useful
narrower protections do not provide whole-store cross-process exclusion. The
[native marketplace implementation](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts#L587-L669)
installs a dependency closure and separately saves registry state, explaining why
outside closure writes and interrupted sidecars need complete witnessing.

This is verified source-level evidence, not a released-CLI concurrency replay or
successful genuine supplier build. Acquisition and later Native replay retain their
own exact supplier/runtime hashes and failed attempts. No accepted producer of
NativeFenceEvidence exists for the pinned version; it cannot currently produce a
Native identity-migration admission or seal. Missing native cross-process exclusion
is a real route capability limitation. Unfinished plugnz checkpoint/transaction/CAS
code is separately an internal defect/invariant. Neither is a green skip or a
waiver of required migration.

Options requiring explicit owner choice, not an automatic scope decision:

1. Preserve automatic Native safety and pursue an upstream-supported cross-process
   transaction/fence covering the complete boundary, enabling only a later proved
   native version. External issue/PR/coordination is **human-owned afterwards**;
   this agent files nothing outside controlled repositories.
2. Approve a separately specified offline/OS-exclusive maintenance route enforcing
   absence of native/data writers throughout the transaction, not a one-time scan.
   It needs its own real exclusion/restart proof and changes the operational
   contract; it is not relabeled automatic Native support.
3. Retain historical activations and visibly hard-block migration while completing
   other supported lifecycle work. This preserves state but does not deliver or
   exclude migration. Managed-only materialization alone does not exclude native
   writers and is not a proven substitute for either fence option.

This proposal selects none. No real host is stopped, no upstream is modified/filed,
no runtime floor changes and no safety gate is weakened.

## Transaction, CAS and restart

1. Global read-only admission freezes the COMPLETE command batch: every Scope,
   both-ID coverage, Source snapshot, native/version/capability evidence and each
   expectation. An expectation from preview binds the precommand generation.
   This phase performs no accepted intent, relation, recovery, staging, ledger or
   native write. It cannot recover/replan an earlier operation to make admission
   pass or silently rebind/refetch a precommand expectation or Source.
2. Acquire ALL required fences for that complete batch in deterministic global canonical order.
   Before acquiring any, enumerate the complete lock set, including the ledger
   write lease and every proven native-writer boundary. Record their distinct
   roles: Native fences exclude native application writers; the ledger writer
   lease authorizes ledger CAS writes, including final journal closure. Neither
   substitutes for the other. An ambiguous physical alias/role assignment cannot
   authorize release; its exact authority and release protocol must be proved.
   Canonical physical lock-resource
   identities, not Scope order or logical aliases, determine one common total
   order for admission, apply and recovery. Deduplicate aliases of the same lock;
   acquire it once, never reentrantly. Ledger lease acquisition participates in
   this same order, not a nested ledger-first/native-first order chosen per route.
   Every cooperating writer uses that order; an incompatible native lock protocol
   blocks admission until its coherent ordering/exclusion is proved. Acquisition
   failure releases acquired fences in reverse order without proceeding to writes.
   Exclusion acquisition must not create/repair accepted ledger state, run recovery,
   mutate native state or Source, or grant a mutation exception to the zero-write
   promise. Its actual primitive and any lock bookkeeping need reviewed evidence;
   this proposal supplies neither an implementation nor an imaginary native fence.
3. Revalidate the COMPLETE frozen batch with ALL fences held, including the ledger
   generation, every Scope/target/context, frozen Source snapshot, both native IDs,
   canonical roots and complete native/shared-store/retention witnesses, fresh
   TargetVersionObservation/probe, capability/fence evidence, and all expectations.
   Any deterministic drift, including a bad last Scope, is command-global zero-write:
   release all fences without accepted intent/relation/recovery/native/Source writes.
   No per-Scope accept-then-lock loop and no recovery/replan/refetch can bypass this
   boundary. Missing actual native exclusion remains the capability hard block
   described above; a ledger lease cannot satisfy it.
4. FIRST atomic accepted intent/relation/recovery writes occur only after that
   complete revalidation: persist fresh accepted intent plus the exact retained
   origin/admission relation atomically, bound to the unchanged precommand
   expectation/generation. Keep the complete fence set held through capture,
   staging, sealing, apply, readback and commit or bounded recovery. Then snapshot
   both cache selections, registry/config entries, marketplace
   entries/owned trees, external resources and data/options boundaries before any
   native mutation. Capture canonical physical roots so supported stable native-store
   links remain valid and later root retargets cannot authorize deletion.
5. Seal the fresh handle and paired priors with the complete attempt/operation,
   both IDs, roots/fingerprints, Source and origin digest. Persist it before apply.
   Native fence proof is a required gate: a plugnz-only lock must not be described
   as excluding concurrent native harness writers. Existing ZCode currently has no
   `beginRecovery` implementation; single-process rollback is insufficient.
6. Stage/install the new owned identity without overwriting existing foreign
   paths. Keep old usable state until new byte/loader/retention readback verifies.
   Then retire only the exact old activation entries and roots supported by the
   admission. Preserve old-ID data/options in place; do not guess an options merge
   or delete data because the old ID is no longer active. Report retained paths.
7. Composite readback verifies new conforming bytes, old no longer active and
   exact retention/sibling preservation. One ledger generation CAS writes the
   canonical activation, removes only the exact old active record, commits the
   retained migration relation/readback and modern COMMIT cleanup-pending journal.
   `lastConverged` advances only at this verified composite boundary.
8. Cleanup/dispose only exact captured artifacts after the durable commit receipt,
   with the ledger write lease and Native fences still held. Retain referenced
   artifacts for unresolved cleanup; original historical proofs always stay.
   No post-COMMIT failure can authorize Native rollback.
9. Release and verify the Native fences after verified cleanup, in reverse order
   within their canonical acquisition order, while keeping the ledger writer
   lease held. Releasing this subset acquires no new lock and does not alter the
   common acquisition order. Unresolved application Native-fence release is
   cleanup-pending, not successful finalization: keep the modern COMMIT journal
   open and report the exact unresolved fence/evidence loudly. Any pending-state
   ledger write still requires the held lease and exact generation CAS. Do not
   close the journal merely because Native payload convergence succeeded.
10. Atomically close the fresh journal only after verified cleanup and Native-fence
    release, with the ledger write lease still held and the exact current ledger
    generation/commit identity CAS. Closure is the last ledger write under that
    lease. Journal-close failure leaves accurate durable COMMIT cleanup-pending;
    it never rolls back committed Native state or erases historical relations.
    If cleanup, Native release or closure cannot complete, do not close: finish
    any truthful pending-state CAS under the held lease, then proceed to ledger
    lease release after the last such write. Retain the existing pending journal
    if that CAS also fails; report the unresolved operation rather than inventing
    a successful pending-state update or retaining assumed write authority.
11. Release the ledger writer lease only AFTER that last write. A writer-mutex
    release error is distinct from application Native-fence-release pending: return
    loud nonzero with the actual committed/journal-close result and mutex failure,
    never roll back committed Native state, and never claim all finalization green.
    Failed release does not confer assumed continuing ledger authority. No repair
    write may occur after releasing or losing that lease. If any repair write is
    contemplated, first reacquire the complete required lock set in the same
    canonical order and revalidate the exact current generation, commit identity
    and journal state before writing; do not re-open a closed journal or fabricate
    cleanup-pending when only mutex release failed. If cleanup or Native release
    was unresolved instead, retain its existing cleanup-pending journal and exact
    referenced artifacts, without claiming successful closure.

Rollback validates **all** affected surfaces before its first restore write.
Each must equal the sealed prior or an exact reachable fresh candidate/phase
state; foreign third states produce pending recovery, never deletion/overwrite.
Restore old selection/payload/resources and old enablement, restore the proved
absent new state, and preserve unrelated JSON entries semantically. Validate both
priors and retention before publishing rollback/cleanup-pending; artifacts survive
ledger failure. No same-ID snapshot can authorize deletion of the other ID.

Restart parses the exact paired sealed handle and durable relation read-only,
re-acquires the complete required fence set in the same global canonical order,
validates the complete frozen batch and both-ID prior/candidate CAS before its
first recovery write, and settles only the fresh operation. Prior/candidate
classifications must include reachable intermediate
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

## Correction checkpoint verification (design only)

The operation recipe/golden tests were first RED against the prior proposal:
zero pass, two fail, two assertions. After correction, pinned Bun 1.4.0 ran
`bun test test/zcode-migration-contract-vectors.test.mjs`: three pass, zero fail,
13 assertions. Its independent Node subprocess used Node 22.23.1 and reproduced
the literal attempt and operation IDs using built-in SHA256 and actual NUL bytes.
`bun run check` and `git diff --check` exited 0. These are pure framing checks,
not migration execution, a runtime schema gate, Native concurrency proof or a
whole producer/consumer verification. No current enum, state schema, executor,
native route, runtime minimum, dependency or real installation changes here.
The corrected closed proposal still requires both independent design axes;
native fence availability still requires the owner decision described above.
Skills remain unchanged; no skill-performance improvement is claimed.

The later ordering correction preserves that checkpoint and fixes the conflicting
transaction sequence: global read-only admission, acquisition of the complete
canonically ordered fence/ledger-lease set, complete frozen-batch revalidation,
then the first atomic accepted intent/relation/recovery writes. Its pure proposal
regression was RED against `7303ca6` (three pass, one fail, 16 assertions): acquisition
and revalidation occupied the same later step while persistence was first. After
correction, Bun 1.3.14 ran the same focused file with four pass, zero fail and
19 assertions; Node 22.23.1 again reproduced the framing literals. Typecheck and
diff checks exited 0. This checks the documented sequence, not an executor,
working lock primitive, actual concurrency or migration functionality. Both
independent design axes must review this delta; native exclusion remains blocked.

The finalization correction distinguishes Native application fences from the
ledger writer lease: cleanup and verified Native release precede atomic journal
closure under the still-held ledger lease; lease release follows the last write.
The new pure regression was RED against `9b24990` (four pass, one fail, 20
assertions) because the proposal released the entire set before journal closure.
It checks the documented roles and final ordering, not working runtime exclusion.
After correction Bun 1.3.14 ran five passing tests, zero failures and 25
assertions; Node 22.23.1 reproduced the framing literals, and typecheck/diff
checks exited 0. No executor, runtime policy, capability grant or owner fence
option changed; both independent axes must review this finalization delta.

Proofs: canonical Git Source install, same-HEAD zero-write preview/apply, changed
SHA/content convergence where supported, actual loader skill/command/resource
bytes, actual native failure rollback and foreign-CAS refusal, source-free retire
with data/options/siblings retained. Kimi's currently unverified update remains a
truthful required limitation, not mock-only Native capability admission. Preserve
all failed attempts, archive inventory plus hashes and perform a real bounded
restore before loose-copy deletion; independent review precedes any deletion.
