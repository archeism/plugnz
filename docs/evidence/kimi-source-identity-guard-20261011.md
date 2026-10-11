# Kimi same-physical identity Source guard

Integration base: `2c8c826`. This is focused correction evidence, not full
combined Native Git acceptance or release approval.

The public lifecycle reproduction installs a local package, retains its exact
physical cache root, and changes the legacy marker to an internally consistent
foreign local Source. Before the correction, preview incorrectly accepted that
identity repair (exit 0 instead of 1). Exact-root ownership alone was insufficient.

The planner now requires observed Source kind to match Scope, observed revision
to match the recorded prior, and exact Git locator where applicable. Kimi also
re-reads the marker and requires its Source tuple to match both the frozen
observation and recorded prior. This does not relax native runtime admission.

## Verification

All commands used Bun 1.4.0 with its executable first on PATH, isolated test homes,
and no real native installation writes.

- RED: `/tmp/plugnz-kimi-same-root-source-red.log`, one failing reproduction.
- `bun test test/prior-git-source-public.test.ts test/same-physical-native-identity-public.test.ts --timeout 20000`:
  42 passed, 317 assertions, 85.95 seconds. Log
  `/tmp/plugnz-kimi-source-provenance-green.log`.
- Final identity suite after adding an earlier valid sibling before the foreign
  package: 5 passed, 62 assertions, 9.28 seconds. Log
  `/tmp/plugnz-kimi-same-root-final.log`. Preview and apply preserve both ledger
  and native stores on rejection.
- Typecheck and diff check passed at the correction checkpoint.

The historical provenance fixtures now use admitted Claude 2.1.295 and the
canonical Hermes runtime fixture; the four stale positive cases pass without
bypassing capability checks. Independent re-review and the frozen combined
full-suite gate remain required before main integration. Skills are unchanged.
