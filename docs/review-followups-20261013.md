# Review follow-up — 2026-10-13

Scope: remaining review notes from merged PRs #81, #82, and #85, checked against release `0.0.19` (`38c4e35d4c8def996d038cbf4c23519295d9c448`). There were no open pull requests or comments on the recent hook implementation commits at the time of inspection.

## Disposition

| Review | Finding | Disposition |
| --- | --- | --- |
| [PR #81](https://github.com/archeism/plugnz/pull/81#pullrequestreview-5488656215) | Function and symbol values serialize as text instead of being omitted | Fixed in `e2c644c29aef3f2df00c25c0666a669421db700d`. Arrays and mappings omit these values recursively, without dropping null, false, zero, or empty strings. |
| [PR #81](https://github.com/archeism/plugnz/pull/81#pullrequestreview-5488656215) | Root undefined becomes YAML null rather than no document | Fixed in the same commit. Root undefined, functions, and symbols return JavaScript undefined. TypeScript overloads preserve the possible absence for unknown inputs and the string result for known document values. |
| [PR #85](https://github.com/archeism/plugnz/pull/85#pullrequestreview-5493662591) | Test-only `sameSha` export | Removed in `b0a1d44765313a445982c2d8e91e0df3ef4e6b79`. Thirteen table-driven cases now exercise public `runDoctor` findings and exit codes, including abbreviated hashes, case differences, and unavailable source heads. |
| [PR #85](https://github.com/archeism/plugnz/pull/85#pullrequestreview-5493662591) | Magic SHA length numbers | Named private constants in the same commit; freshness policy is unchanged. |
| [PR #82](https://github.com/archeism/plugnz/pull/82#pullrequestreview-5491513044) | Manual dispatch skips the same-SHA Tests gate | Documented explicitly in `9c2423b55135fe97026109abd3f25383c2ab45ec`. This remains an intentional operator override, not a claim that the selected ref passed tests. A parsed-workflow equivalence check confirmed no configuration behavior changed. |

## Already addressed before this follow-up

The Tests and publish-build Bun pins, leading-BOM quoting and leading-with-suffix regression, deterministic source discovery, hermetic Node shim, removal of redundant Tests-job typechecking, and push-publication Tests gate were already present. CodeRabbit's [workflow-path suffix finding](https://github.com/archeism/plugnz/pull/82#discussion_r4248130382) was already addressed in `1caaf4b`; it was not reapplied.

## Validation

Three new YAML omission regressions failed against the unchanged writer, then passed after the fix under pinned Bun 1.4.3. The focused YAML, doctor, and doctor-import graph run passed 56 tests with 583 assertions, and type checking passed. A separately bundled plain-Node 22.23.1 probe passed all five omission cases.

The YAML frontmatter corpus and existing character/roundtrip sweeps remain unchanged and pass. This follow-up does not claim universal serialization parity for arbitrary JavaScript objects; it addresses the omitted-value types identified by the review.

The native hook adapters, hook runtime, and install/update implementations were not changed. No paid model calls or fleet/profile changes were needed.

The complete gate on `9c2423b55135fe97026109abd3f25383c2ab45ec` passed **1,050 tests, six existing skips, zero failures, and 7,465 assertions** across 100 files. Build and type checking also passed. It ran as UID 65534 with no effective/bounding capabilities, a fresh home, copied development dependencies, Bun 1.4.3, and Node 22.23.1. The temporary workspace was removed. See [the retained gate receipt](evidence/review-followups-20261013.json).

The first isolated-gate attempt dereferenced npm binary links while copying dependencies, which broke TypeScript's relative module lookup. That test-apparatus failure is retained outside the repository. Preserving relative dependency links fixed the apparatus; no production change or assertion relaxation was needed.
