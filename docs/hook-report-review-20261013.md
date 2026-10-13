# Hook installation report review — 2026-10-13

Scope: the automatic-hook release (`0.0.19`) and its aggregation of independently executed installation routes. No new hook-commit review comments or open pull requests were present during discovery. The older PR #81/#82/#85 notes were resolved by a concurrent follow-up; those changes are preserved from main `d6d97ed2abb266d6e62a70b9314b0a0fadeb7558`. See [their disposition](review-followups-20261013.md).

## Findings and fixes

**Partial-install reporting could throw after actual installation.** With Pi and Codex selected, a malformed Pi extensions setting can refuse Pi while Codex succeeds. Conversely, an authored Codex-wrapper collision can refuse Codex after Pi succeeds. The old merger copied the first failing route's entire no-mutation summary over all outcomes. Report validation then threw `summary changed flag contradicts its outcomes`, leaving `--json` without a usable report even though another target had changed.

The merger now aggregates `changed` and `mutationStarted` across routes, retains the failure reason and successful outcomes, and no longer labels a partially applied command as a preflight-only failure. The command still exits nonzero. Dry runs remain non-mutating. Independent target behavior is unchanged; this is not an all-or-nothing installation transaction or a new execution policy.

**Historical recovery and adoption accounting was dropped.** The same merger omitted the additive receipt envelopes and could discard a recovery/readback identifier belonging to another route. It now retains those envelopes and identifiers, including a completed rollback that changed native state while the current Desired operation is unchanged. The schema validator still validates the full combined result.

The fix is in `f3806705e12eaec2686d90adf21ddf8c2893b4c9`. `src/add-report.ts` isolates the existing merger for direct regression tests; the CLI uses that same implementation.

## Verification

Seventeen regression cases cover partial results in both route orders, dry runs, unchanged work, pending recovery/readback identifiers, and historical receipt preservation. Eight cases invoke the public `install`/`add` CLI with isolated native stores. Tests reproduce the old merger failures and pass after the fix. The focused hook/report suite passes **55 tests**; type checking passes.

The combined immutable source `e96f81ff6993cb61082ba9cf7cc8ed2fd47574a2` passes **1,067 tests, 6 existing skips, and zero failures**, plus type checking and the Node-target build. It ran as UID 65534 with zero capabilities and a fresh home, using Bun 1.4.3 and Node 22.23.1. Its temporary workspace was removed. The [gate receipt](evidence/hook-report-review-20261013.json) binds the source and logs by hash.

The native hook adapters, handler execution runtime, native trust flow, and real-model mappings are unchanged. No model calls, credential changes, or deployment to personal agent profiles were performed for this reporting fix.
