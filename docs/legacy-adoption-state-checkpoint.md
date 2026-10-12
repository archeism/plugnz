# Legacy adoption state/history prerequisite

Base: independently approved reader `f579e8d`; approved wire `97b411d`.
This increment implements strict durable relation validation and immutable-history
preservation. It **does not enable adoption**: no native admission constructor,
global expected-admission match, Cursor fence, fresh executor transaction, recovery
receipt/supersession eligibility, doctor annotation or Personal extension exists
yet. The existing marketplace adoption RED and real A-rollback/B-progress/A-retry
and SIGKILL gates remain required. Supplied expectations still refuse globally.

State v2 optionally admits versioned `legacyAdoptions`. The reader verifies exact
legacy original/fresh journal linkage, admission/seal/commit digests, actual retained
handle projection, Source/version/evidence/mutation coverage, prior/candidate roots
and retention, phase/settlement compatibility and uniqueness. The atomic-commit
generation must contain the adopted canonical activation and cleanup-pending
intent, with the old active legacy alias absent. Later activation updates/removal
do not erase immutable commit/history or manufacture old-journal settlement.

`scopes` now reuses the first retained original snapshot across every later relation;
shared original attempt header timestamps may change without redefining that
snapshot. The writer additionally compares prior versus next history: previously
retained relations cannot disappear or rewrite their original/admission, and closed
or established seals/commits cannot be changed. A single-document digest validator
alone could not provide that protection. Host-specific native proof shape remains
in the pure `hosts/cursor-adoption-proof.ts` reader, not in generic route selection.

## Public proof and limits

`test/legacy-adoption-record-public.test.ts` seeds explicitly labelled schema
fixtures with real isolated Source/native files, then exercises the actual public
`scopes` subprocess and the real atomic state writer. Fixture profile and operation
IDs are not claims of actual native admission or deterministic plan derivation.
It covers accepted/no-write closure, shared-header timestamp progress, retry reuse,
sealed committed cleanup, post-removal historical validity, and rejection of
contradictory records/retargeted handles. It does not simulate a passing transaction
and must not replace the pending real Cursor acceptance.

Writer RED: deleting the sole relation or redefining its original with recomputed
digests was accepted. 0 pass / 1 fail / 5 assertions, 749 ms;
`/tmp/plugnz-adoption-first-retention-writer-red.log`, SHA-256
`936ddf942c97c0fba484bf4064501a825c2371bbe045db6c7f1a654dd50249e0`.
Semantic marker-source RED: 0 pass / 1 fail / 19 assertions, 1.90 s;
`/tmp/plugnz-adoption-record-semantic-red.log`, SHA-256
`047c1e21786abe8e65afbc67128aedeb038e5d89fac6c0581d5a3fd17d4398b7`.

Initial five-second test watchdog also failed under contention (19 pass / 1 fail,
207 assertions, 8.03 s overall); retained log
`/tmp/plugnz-adoption-record-final-green.log` is a failed attempt despite its name,
SHA-256 `88ab3e61de203f45c302d96a1ea6a4649a47828b38004d515f33339f9140ecd8`.
An unchanged bounded diagnostic verified all then-current assertions in 6.405 s;
`/tmp/plugnz-adoption-record-bounded-diagnostic.log`, SHA-256
`e342d5120ecceb7764bde453f1527a2deb79d2f35d068a90433795d6f314d821`.
Only this multi-CLI test now has an explicit 30-second test budget; production
timeouts and assertions were not relaxed.

Final designated Bun 1.4 command:
`bun test test/legacy-adoption-record-public.test.ts test/legacy-adoption-public.test.ts
test/legacy-adoption-proof.test.ts test/doctor-imports.test.ts test/state.test.ts
test/state-v2.test.ts test/deployment-scope.test.ts`:
**60 pass / 0 fail / 736 assertions, 6.19 s**. Log
`/tmp/plugnz-adoption-record-retention-freeze.log`, SHA-256
`8cfc5b8d54b85dd8cb94edde4812421f0d120a18174965d7e4209c71c9390f77`.
Typecheck and diff check exit 0. Node v22.23.1 also loads the expanded pure module
graph and reproduces the pinned canonical digest literal after Node-target build.
These are focused source/module gates, not full or packed native transaction proof.

## Remaining concurrency proof

Current `writeLifecycleState` checks a freshly read generation and atomically
replaces the document. That alone is not an OS atomic compare-and-swap against two
concurrent writers. This checkpoint does not claim otherwise. The actual adoption
transaction must prove native compare-through-commit and ledger serialization/CAS
before claiming its atomic concurrent-admission guarantee. No independent native
capability is inferred from these reader fixtures.

No real home/native launcher, production pin/main or external repository changed.
Skills unchanged. Independent review precedes use of this foundation by the next
transaction slice; all dependent schema/report/consumer changes remain required.

## Independent correction: bind a newly introduced commit to its write generation

Both review axes rejected `ae0ae2a`: the writer allowed a prepared generation-3
record to become committed in generation 4 while claiming commit generation 3.
Recomputing the commit digest and removing all activations then bypassed the
same-generation atomic activation/cleanup check. Author reproduced both an existing
prepared transition and a newly introduced committed relation: 0 pass / 1 fail /
26 assertions, 2.62 s. Log `/tmp/plugnz-adoption-backdated-commit-red.log`, SHA-256
`4e12b5a7eafc29379810c3d798908d7525c7b14487de6f3f185f5412428d51b2`.

The prior-to-next writer guard now requires every newly introduced COMMIT to bind
exactly `next.stateGeneration`. Previously committed, unchanged history keeps its
original generation so later legitimate updates/removal remain valid. Regression
assertions verify refusal before ledger replacement, a valid generation-4 commit
through the actual writer, and an unchanged historical commit through a subsequent
generation-5 write with the canonical activation removed.

Latest seven-file focused command above: **60 pass / 0 fail / 737 assertions,
6.54 s**, typecheck and diff check exit 0. Log
`/tmp/plugnz-adoption-backdated-commit-freeze.log`, SHA-256
`de53d895b6541e5f98385324596facd726d103089263fefdfa5e87d02831cada`.
This is the bounded state/history correction, not native adoption or CAS delivery;
combined independent re-review is required before downstream use.
