# Cursor read-only admission composition

This increment implements only the read-only composition step of
`legacy-adoption-wire-contract.md`. It does not deliver the adoption transaction.
The mutation fence, atomic executor, durable execution/retry and final receipts
remain required work; an exact proven admission reports `internal.invariant` and
exits nonzero before recovery, staging, native mutation or ledger writes.

## Contract and boundary

The generic planner asks an adapter-owned proof callback to correlate a selected
frozen package with an exact retained legacy original. Cursor enumerates only its
documented bare/collection-qualified aliases. Only an independently proved
same-physical identity can pass the historical identity refusal. Genuine modern
ZCode two-physical-ID origins are not legacy records and are not admitted by this
interface.

Every selected scope is prepared before any execution. Source, target observation,
actual version, managed projection evidence, original snapshot/digest, resolved
retained pins, operation IDs and the optional exact caller admission expectation
are bound into a strict admission. Bad-last expectation/native drift refuses the
entire batch with no writes. The public report permits this admission only on its
matching current operation and cannot claim successful delivery.

The shared admission reader now rejects a main projected fingerprint that differs
from its native payload proof even if an attacker recomputes the canonical ID.
The public regression demonstrated acceptance before the predicate was added.
Consumers mirroring this reader must retain this predicate.

Pin resolution was extracted unchanged from the executor into a read-only module
so preview and execution use the same resolution semantics. No mutation authority
or new durable adoption envelope was introduced.

## Verification

Base: `572f701`. Bun: `1.4.0`.

```sh
bun test test/cursor-admission-composition-public.test.ts test/cursor-adoption-projection-public.test.ts test/cursor-managed-lifecycle.test.ts test/legacy-adoption-public.test.ts test/legacy-adoption-proof.test.ts test/legacy-adoption-record-public.test.ts test/lifecycle-report.test.ts test/executor.test.ts test/pin.test.ts test/doctor-imports.test.ts
bun run check
git diff --check
```

Focused result: 89 passed, zero failed, 892 assertions, 16.58 seconds across ten
files; typecheck and diff check exited zero. Raw log:
`/tmp/plugnz-cursor-admission-focused.log`, SHA-256
`23492272c0d9bb7c0b1d6cf14439c401da48f93b514d579c006ba7f1af86e4c9`.

Public CLI tests use isolated homes and fake native version launchers, not the
real installation. They prove read-only accounting and refusal, not native
adoption or a completed mutation transaction. No full-suite/native acceptance is
claimed for this checkpoint; independent review is pending. The existing combined
full-suite legacy marketplace pending-repair failure remains unresolved.

Failed attempts remain in `/tmp/plugnz-cursor-admission-composition-red.log`,
`/tmp/plugnz-cursor-admission-projected-proof-red.log` and
`/tmp/plugnz-cursor-admission-composition-pins.log`. The last failed because the
test omitted the required explicit `--plugin demo` selector; correcting that
invocation did not relax production behavior. Skill instructions were used
unchanged; no skill improvement or benchmark attribution is claimed.
