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

## Independent Spec finding: unrelated original pins

Review of `1427335` proved that resolving every scope original's pins before the
adapter's identity filter could veto selected `demo` using unrelated `other` pins.
The permanent public regression installs both packages through the CLI, pins only
`other`, then retains both qualified legacy originals. Selected `demo` has no
retained pins but an unresolved unpinned MCP command: its admission must reach the
same internal fence refusal without inspecting the unrelated original's pins.

The adapter seam now returns an identity-filtered read-only candidate before pin
resolution. Only a matched candidate receives resolved pins for the full native
proof. This does not infer aliases in the planner or supply mutation authority.
The same regression selects `other` after its own pinned command becomes missing
and requires the existing `runtime.operation-failed` diagnostic and zero writes.

The focused command above now passes 90 tests, 913 assertions, in 23.91 seconds;
typecheck and diff check exit zero. Durable raw RED, initial GREEN and focused logs
are retained in
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/cursor-admission-pin-filter/`.
The RED log is `plugnz-cursor-admission-unrelated-pin-red-exact.log`, SHA-256
`90f9eb1cc4760c1d934027a4391d42e24c3a4d942568bc7ddd60137f4d5b77d1`.
Both independent axes must re-review this corrected frozen checkpoint; actual
adoption execution, durable mutation recovery and full-suite acceptance remain
unfinished, not excluded.

## Corrected candidate and combined verification

Corrected candidate `2a7ca8b084e50927f1b0facf3808e97a61fab1ed` received
independent bounded LGTM on both axes. Spec reran the ten focused files:
90 passed, zero failed, 913 assertions, 19.43 seconds; typecheck and diff check
passed. Its log `/tmp/plugnz-cursor-admission-spec-independent-2a7.log` has
SHA-256 `49757cd25383ca958a0e704c7a876aa0be9f282f0c40e2b1b44e40a929f84383`.
Standards independently ran admission, executor, pin and doctor-import checks:
47 passed, zero failed, 405 assertions, 9.05 seconds; typecheck and diff check
passed. Neither reviewer edited the frozen candidate.

Integration merge `7e89b008841cd415ab9ea9458bffa014d9df345d` retained all
candidate commits and the previous combined recovery/ZCode work. Root reran the
ten-file command above on the actual installed **Bun 1.3.14**: 90 passed,
zero failed, 913 assertions, 20.19 seconds (terminal test handle `14160`,
exit zero). `bun run check` terminated successfully (handle `28920`).
This focused check verifies the preserved Bun runtime floor for this slice,
not the separate Bun 1.4 differential YAML development gate.

This remains an integration-branch checkpoint, not a main merge or release.
The known full-suite marketplace adoption execution failure remains required
work. Read-only admission approval does not certify the missing fence,
atomic executor, interruption/retry, final receipts or Personal cutover.
