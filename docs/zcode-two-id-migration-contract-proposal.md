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

Do not force a verified modern activation into `LegacyRecordProof`. The shared
relation needs a strictly discriminated original variant: existing
`legacy-unsealed` proof unchanged, or `verified-activation` containing the exact
strict Scope/activation snapshot and its domain-separated digest. The latter has
no invented legacy original/recovery receipt and requires current independent
native correlation. Original snapshots remain retained after update/retirement.
Legacy eligibility, complete recovery/adoption accounting and first-snapshot
invariants remain exactly those in `97b411d`. This variant must be frozen with the
receipt-contract owner before runtime code; two writers must not invent different
interpretations. No generic modern ownership upgrade is implied.

Add explicit `identity-migrate` plan/journal/handle action. Route remains Native
only if the new route proves it; it is not `install` with an invisible old delete.
The sealed operation must retain two exact priors and composite expected state:
new active-conforming, old inactive/unregistered, old data/options retained.
Do not rewrite the old-ID prior into a new-ID single readback to satisfy existing
single-ID validators. Runtime/serialization, state, reader, report, recovery and
consumer validators must explicitly understand and check both IDs. Exact schemas,
digest domains and worked vectors require independent contract review before code.

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

Machine measured before launch: `/dev/root` has 8.7 GiB available; active checkout
allocated 5.7 MiB, retained Codex evidence 20 MiB, authentic historical home 2 MiB.
Existing retained large native snapshots must also be counted, not recopied per
arm. No Sandbox is launched by this document.

Plan: one 2-vCPU/4-GiB Sandbox, 30 minutes, at most 1 GiB newly allocated total
source/build/store/probe scratch and 100 MiB compressed retained archive. Measure
allocated bytes after each install/build/attempt; refuse a build before exceeding
the budget. Use a verified existing official artifact if its pinned source/hash
and supported runtime can be proved; do not mislabel a community CLI or an old
Node-26 source build as supported-runtime certification. Keep separate Source and
homes for Kimi and ZCode, no real installation/credentials/model turn. Freeze the
controlled HTTPS Source V1/V2 hashes and built producer artifact before each gate.

Proofs: canonical Git Source install, same-HEAD zero-write preview/apply, changed
SHA/content convergence where supported, actual loader skill/command/resource
bytes, actual native failure rollback and foreign-CAS refusal, source-free retire
with data/options/siblings retained. Kimi's currently unverified update remains a
truthful required limitation, not mock-only Native capability admission. Preserve
all failed attempts, archive inventory plus hashes and perform a real bounded
restore before loose-copy deletion; independent review precedes any deletion.
