# Legacy pending adoption — contract proposal

Status: proposed, not implemented; independent design review required before code.
Frozen implementation inspected: `f6b92a5`. Consumer reader corrections are now
merged at Personal `3daf6ca`; this design does not change its production pin.
Scope: restore evidence-backed legacy adoption delivery without weakening sealed
recovery authority. Cursor is the first adapter; other adapters require their own
proof. No new CLI verb, fleet pin, real-home test, or capability bypass.

## Finding and requirement

The existing public `test/add.test.ts` marketplace-collection case fails at its
explicit `add --adopt-existing` retry: 0 passed, 1 failed, 10 assertions, 363 ms.
The fixture supplies a matching old bare Cursor marker and a marketplace-qualified
legacy ledger row with `pending: install`. V1 import truthfully records an
applying `legacy-recovery` journal without a sealed operation. The new recovery
guard rejects the different command; bypassing that guard would still lack
rollback authority. Neither the past mutation nor its completion is known.

The current diagnostic also recommends a nonexistent `legacy-recovery` CLI verb.
That is an actionable-error defect, not a reason to authorize unsealed recovery.

Required delivery follows `SPEC.md` (identity-preserving migration, verified
ownership, rollback and retention), ADRs 0001–0004 (explicit adoption authority,
global preflight, loud defects and retained metadata), and issue #35 stories
18–21, 37–38. The old test's word “recover” needs a more precise assertion:
**a newly proven adoption supersedes the active obligation; it does not settle the
unknown historical attempt.** Keep the old acceptance behavior, add history proof.

## Recommendation: fresh adoption with an explicit supersession link

Use the existing explicit adoption request and activation transaction, plus a
generic adapter-owned admission proof. Do not rewrite the legacy journal command,
action, state, mutation flag, or missing seal. Do not infer ownership from a name,
current Source alone, or discovery. Do not add a synthetic recovery handle to it.

Three facts stay separate:

1. The original legacy journal remains historical, with unknown settlement.
2. A fresh operation gains authority over an exact currently observed installation
   through explicit adoption and adapter proof, then seals its own rollback prior.
3. Only verified fresh commit durably supersedes the original active obligation.

This is narrower than automatic repair of all legacy rows, but does not exclude
their required delivery: additional historical layouts remain outstanding until
their own adapters prove the same protocol. They fail loudly in the meantime.

## Read-only admission, before any command writes

Resolve/freeze the entire current request and classify every scope first. For each
candidate, require an explicit adoption request, one exact recorded Source/target
binding, and one unambiguous original journal/installation mapping. Reject a bad
last scope before recovery, staging, ledger, or native writes in earlier scopes.

The private, immutable admission proof binds:

- The exact original attempt/journal identity and canonical scope, including a
  digest of the retained full legacy activation/record and original journal.
- Canonical current package/native identity and an adapter-enumerated historical
  alias, never a generic basename or `@`-prefix heuristic; exact target context.
- Frozen Source locator/type/ref/revision, package name/version and content proof.
  No Git locator inferred from a SHA, no placeholder locator promoted to Git.
- Live marker identity/source, exact installed roots and content digests; an exact
  independently derived host projection, including recorded pins/conversions.
- Adapter/version/route evidence, retention inventory and the complete mutation
  blast radius. A different physical native ID requires both old and new IDs,
  unambiguous new-ID absence, and transactional rollback/retirement proof.

For the Cursor fixture, old qualified ledger ID and new bare native ID refer to
the **same** physical `plugins/local/personal` directory. The adapter proves that
alias and the marker's exact Source, name/version and projected payload bytes.
Changing marker format means the old full-tree fingerprint cannot simply match:
validate the recognized marker separately and compare every other projected byte.
Do not ignore unknown files, malformed metadata, symlinks or unrelated content.
Metadata differences are allowed only by this exact historical format proof.

Capture, seal and revalidate that live prior under a proven native mutation fence
before apply. Keep the fence through commit/cleanup. Cursor's existing SPI lacks
cross-process `beginRecovery`; same-process rollback support does **not** prove
restart safety. Add/prove its bounded fence and prior/candidate CAS for this route,
or leave interrupted adoption explicitly pending/unverified. Completion of the
interrupted-adoption requirement cannot be claimed until that public proof passes.

The genuine old-producer `75d7bc1` public lifecycle fixture now captures ZCode's
physical ID `demo@catalog`, different from the current hashed physical ID. This is
isolated historical public-CLI/fixture evidence, not a released native-runtime
compatibility proof. It requires a separate two-ID transaction; old legacy-add
writer inspection, same-ID route migration and Source-provenance repair do not
establish that proof. Do not borrow Cursor's same-root alias equivalence. Other
historical ZCode command/layout combinations remain unverified until captured.

## Durable transaction and interruption

Before apply, persist a fresh modern journal with its own operation ID, sealed
handle, and a versioned adoption relation to the exact original proof/record digest.
Keep the entire legacy activation and journal until verified commit. Existing
sealed-operation identity constraints stay exact; store the historical relation
alongside the handle, not inside a forged canonical prior activation.

After fresh readback verifies active conforming bytes and retention, one ledger
CAS commits the canonical activation, removes only the proven active alias, and
persists a committed supersession relation **together with** the fresh journal's
verified COMMIT settlement and `cleanup-pending` state. These are one atomic ledger
transition, not independently persisted steps. Retain the old activation snapshot
in that durable relation and all original attempt/journal fields. Only then clean
fresh transaction artifacts. The fresh journal closes only after cleanup and fence
release both succeed. Data and inactive historical metadata survive.

- Before fresh seal/apply: original history unchanged; accepted modern intent can
  be settled as not attempted only by existing zero-write rules.
- Applying/crash: modern handle authorizes only the fresh operation's fenced
  prior/candidate settlement. It never authorizes replay of the legacy operation.
  The linked legacy row must not block this exact fresh-operation retry, but all
  other unresolved journals retain normal admission/command guards.
- Verified rollback: restore the exact observed old installation/marker, retain
  old active claim and unknown history; no committed supersession. Retain modern
  rollback/cleanup proof until cleanup and fence release are verified.
- Verified commit, crash or cleanup/release failure: canonical activation and
  supersession remain durable; modern cleanup-pending stays discoverable. Retry
  verifies accepted state and idempotently cleans/releases, never rolls back a
  committed adoption because the old unsealed journal still exists.
- Foreign drift or changed relation/Source/target: refuse without overwriting it;
  retain both histories and artifacts. No silent intent rebind on retry.

## Public contract and consumer completeness

Keep recovery receipts' current meaning: a legacy original cannot have a
completed commit/rollback receipt. Add a separately versioned optional
`adoptions: { schemaVersion: 1, receipts: [...] }` report envelope. Each entry binds
the exact precommand original proof, fresh attempt/operation identity, old/new
native IDs, admission proof ID, status (`pending`, `committed`, `not-attempted`),
and structured reason (including explicit fresh-operation rollback). A committed
entry requires the durable relation and the
fresh operation's verified commit; pending cannot imply convergence. Changes are
already represented by the fresh outcome or modern recovery receipt, never
double-counted as historical native changes.

Reader-only inventory exposes versioned committed supersession links, including
their exact original proof and replacement identity; keep unknown history visible
to doctor/list. Original journals retain their original state. They cease to be
eligible blocking recovery obligations **only** when a strict committed relation
validates against the retained record and an immutable, verified modern adoption
commit. Validity does not depend on the replacement activation still existing or
having its original fingerprint: ordinary update, remove and source-free retirement
must preserve this historical relation and must not resurrect the unknown legacy
journal as an active obligation. “Dangling” means missing or contradictory retained
historical evidence, not a legitimately retired or updated live activation.
Invalid, dangling, duplicate or cross-scope relations are corruption and loud.

During a fresh adoption, every eligible precommand original is accounted exactly
once by either an ordinary recovery receipt or an adoption relation receipt.
All unrelated journals still require normal complete accounting, including
not-attempted originals after failure. Historical links never satisfy current
Desired/retirement coverage or erase current obligations. Consumer validation
matches the exact original inventory, requested scope and fresh current operation
or inventoried modern recovery original; it cannot trust arbitrary report IDs.

Strict parsers explicitly admit these versioned fields; unknown versions/fields
remain rejected. Old strict consumers will reject new adoption reports until
deliberate producer release, artifact proof, consumer golden and pin advancement.
No reinterpretation of `recovery.schemaVersion: 1` or relaxed consumer coverage.

### Exact wire freeze — review blocks implementation

The [wire contract](legacy-adoption-wire-contract.md) freezes the exact types,
digest bytes, request expectation, reader projections, fresh-journal/commit
correlation, complete accounting and targeted probe order. No runtime implementation
is authorized until both independent design axes approve that contract. A digest
asserted only by the mutating report is explicitly insufficient authority.

## Dependent scan / implementation boundaries

- `state.ts`: optional strict relation records, cross-record identity/CAS/commit
  checks, legacy import preservation; `state-write.ts`: atomic persistence.
- `lifecycle-host.ts`, runtime/operation record: private admission/fence contract,
  exact current handle serialization; no forged legacy handle or guessed prior.
- `planner.ts`, native identity and Cursor writer: global proof admission, frozen
  relation binding, replacement of regex-only alias authorization, exact adapter
  projection and same-root fence. Other host aliases stay unverified.
- `executor.ts`: seal relation before apply, retain prior record, atomic verified
  commit/supersession, rollback and cleanup ordering; no broad alias deletion.
- `lifecycle-recovery.ts`: partition only admitted linked originals, fenced fresh
  retries, complete receipts and truthful legacy-specific diagnostic.
- `recovery-proof.ts`, scope inventory, state projections, doctor/list: reader-only
  relation validation, all-history visibility and exact eligible inventory.
- `lifecycle-report.ts`, legacy serializer and lifecycle command boundary: strict
  adoption envelope, correlation/convergence rules, actionable non-JSON errors.
- Add/update/sync/remove/retire/pin guards: unresolved legacy stays blocking except
  exact admitted adoption; committed supersession does not invent removal rights.
- Personal `plugin-sync.ts`, `plugin-batch.ts`, `plugins.ts` and public fixtures:
  strict envelope/inventory parser, precommand completeness union, actionable
  rejection before later household writes. Frozen consumer is not changed yet.
- SPEC/implementation contract, Cursor/identity docs, receipt contract/evidence:
  document unknown past versus proven new authority and rollout boundaries.

## Acceptance slices, not implementation claims

1. Existing explicit Cursor adoption case plus exact original history retained,
   canonical activation and committed relation; unchanged retry/update/remove.
2. Missing flag, foreign marker/bytes, wrong Source/ref/context/version, unsupported
   alias, ambiguous old/new IDs and bad-last scope: zero ledger/native writes.
3. Real subprocess interruption before seal, after apply, before commit, and after
   commit/artifact disposal: safe retry, exact rollback/retention and visible proof.
4. Public inventory/report negatives: forged/missing/duplicate/nonrequested links,
   unverified commit, legacy fake settlement, dangling replacement and corruption.
5. Multi-journal and changed-intent consumer composition: exact original accounting
   plus one current pair each; source-free retirement only from new owned record.
   Adoption → update → retire → restart preserves the verified historical relation
   and never reopens its unknown original as a blocking recovery obligation.
6. Doctor import/read-only gates, focused/full producer and Personal checks, packed
   supported Node proof, independent two-axis review, then published-artifact golden.

Until the migration exists, diagnostics must say the legacy attempt has no sealed
recovery authority and its history/native state were retained; never instruct a
nonexistent command. Once proven, point to the actual existing explicit adoption
command and its admission requirements, not manual metadata deletion.
