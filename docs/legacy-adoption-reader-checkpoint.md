# Legacy adoption reader prerequisite checkpoint

Base: reviewed `ddd254e`, exact approved contract `97b411d`.
This is a public reader behavior increment, **not** successful adoption or a
retained relation/state transaction. The existing Cursor adoption repair RED,
immutable first-relation retention, atomic COMMIT and process-kill/native-fence
acceptance remain outstanding. Supplied expectations still refuse before writes.

`scopes --json` now projects `adoptionHistory` for exact open imported originals.
Its `legacyRecords` preserve the actual qualified original package/native IDs,
pending activation, pins, source revision, journal and nullable copied attempt
header; `records` is empty because no relation can yet be created. The pure parser
reuses canonical state validators for nested state fields, checks exact original
identity and recomputes the domain-separated snapshot digest. It never converts
that history into ownership, a seal or successful recovery authority. State is not
written. This projection is a pre-retention preview; later relation implementation
must switch to the single immutable retained snapshot, not recapture shared headers.

Canonical JSON is explicitly implemented instead of relying on object insertion
order. Numeric object keys and non-BMP scalar ordering have a literal vector;
unsupported JSON values, malformed Unicode, symbols, accessors and sparse arrays
are rejected instead of silently dropped. No external package is required.

## Verification

Designated Bun 1.4.0: `/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun`.

- Public reader RED: 0 pass / 1 fail / 2 assertions, 492 ms; log
  `/tmp/plugnz-legacy-reader-red.log`, SHA-256
  `cb6df4a001c3f9112e3f05cb3daf12cfe069e06963218ef9b5820ec8517e48fe`.
- Canonical sparse-array RED: 1 pass / 1 fail / 12 assertions, 119 ms; log
  `/tmp/plugnz-legacy-canonical-red.log`, SHA-256
  `401c519ad16be8411e59838fbb0571e5bd5eef207d99078720b2dd9726cd49ef`.
- `bun test test/legacy-adoption-proof.test.ts
  test/legacy-adoption-public.test.ts test/doctor-imports.test.ts test/state.test.ts`:
  19 pass / 0 fail / 181 assertions, 1.376 s; log
  `/tmp/plugnz-legacy-reader-focused.log`, SHA-256
  `2654c351b3bd5782cb983a13b6cc1f99d02fc0e8c22e3d37af9659293e1ab699`.
- `bun test test/lifecycle-public-commands.test.ts --test-name-pattern scopes
  --timeout 30000`: 2 pass / 0 fail / 2 assertions, 794 ms; log
  `/tmp/plugnz-legacy-reader-scopes.log`, SHA-256
  `d55f7bcd0652d7c90c4409a4091a1fec85b706ccce1f6c7f7030f5e9fc7e6e7b`.
- `bun run check` and `git diff --check`: exit 0.
- Node v22.23.1 `/home/charlesfengyc/.local/bin/node` independently evaluated the
  pinned canonical digest literal from a Node-target build of this pure module;
  exit 0. Built module `/tmp/plugnz-legacy-proof-node.mjs`, SHA-256
  `b498e3d7006c1c09d41518c1f80bbf0f4976f97c0fba72dc3a59437fed39b783`.
  This is module parity evidence, not a packed CLI/adoption transaction gate.

No real home/native launcher, production pin, main or external repo was changed.
Consumer strict admission/reader extensions remain separate required work before
integration. Skills unchanged; public reader and canonical negatives form the
next protected floor, subject to independent review.

## Independent review correction: mandatory original activation linkage

The first reader checkpoint `7242867` was **not accepted**: Spec review proved
that removing the copied activation's pending record disabled the canonical state
validator's conditional linkage check. A correctly recomputed digest then admitted
either the unlinked activation or an unrelated package/native activation. Hash
consistency is not identity proof.

The corrected parser explicitly requires activation scope/package/native IDs to
equal the original and requires its retained pending attempt/action to equal the
original operation. Existing state validation additionally checks pending phase
against journal state and attempt semantics. The historical snapshot always retains
this original pending link; later live activation settlement does not erase it.

Author public-fixture RED: 0 pass / 1 fail / 14 assertions, 372 ms;
`/tmp/plugnz-legacy-pending-link-red.log`, SHA-256
`a19eae50ed83b19f3977119ae5b69a136f218b15256fac48251ed06011cc6714`.
Both missing-link and foreign-activation cases were accepted with recomputed valid
digests. Added wrong pending attempt/action controls also recompute their digests.
Corrected focused command above: 19 pass / 0 fail / 183 assertions, 957 ms;
`/tmp/plugnz-legacy-pending-link-green.log`, SHA-256
`ffc7a6072054e90d100293f2a9030159e35d3f67c4ee5b88dba4bb687d9cee86`.
Typecheck and diff check exit 0. No downstream transaction/schema work was started
while this proof boundary remained rejected. Combined review is still required.
