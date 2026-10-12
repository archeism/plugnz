# Legacy adoption input safety checkpoint

Authoring base: approved exact contract `97b411d`, runtime baseline `f6b92a5`.
This slice does **not** deliver pending legacy adoption. The existing Cursor
marketplace repair acceptance remains an outstanding requirement. State/history,
admission digest construction, transaction, native fence and consumer extensions
are not implemented by this checkpoint.

The manifest strictly admits the optional versioned `expectedAdoption` selector,
requires explicit adoption and canonical lowercase SHA-256 identity, and preserves
it through package selection. Until independently proven admission is implemented,
every supplied expectation is refused globally before ledger/staging/native writes.
The public two-scope regression verifies that an earlier ordinary install is not
applied when the last scope has an unmatched expectation.

Unsealed imported legacy history remains blocked and byte-for-byte retained. Its
diagnostic now states the absent durable sealed authority instead of recommending
the nonexistent `legacy-recovery` command. Modern cross-verb retry guidance and
recovery guards remain unchanged.

## Evidence

Bun executable: `/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun` (1.4.0).
All public subprocess homes are isolated fixtures; no installed native launcher or
real installation is invoked.

- Initial input RED: `/tmp/plugnz-adoption-expectation-red.log`, 0 pass / 2 fail;
  SHA-256 `7d0e5eaf9616e3f3e47d371e39af84bbcb75965f03e1b69680002c4a3b2aac70`.
- Authentic legacy diagnostic RED: `/tmp/plugnz-adoption-legacy-diagnostic-red.log`,
  0 pass / 1 fail / 2 assertions, 414 ms;
  SHA-256 `36d420e650716170eaa26ea85409531211d55656436bbad9a36600b0dd498229`.
- Focused GREEN: `bun test test/sync-manifest.test.ts
  test/legacy-adoption-public.test.ts test/doctor-imports.test.ts
  test/planner.test.ts test/recovery-public.test.ts --timeout 30000`:
  41 pass / 0 fail / 455 assertions, 36.66 s.
  Log `/tmp/plugnz-adoption-input-focused.log`, SHA-256
  `aeb66a5f298e27a5decab7ba347fdda0769f82b011005332c5623a70f57d6344`.
- `bun run check`: exit 0; `git diff --check`: exit 0.

These are focused source gates, not full-suite, packed-artifact, native-fence or
consumer-golden acceptance. Production pins and main are unchanged. Skills remain
unchanged; the exact contract and public negative tests are the protected floor.
