# Combined lifecycle checkpoint — 2026-10-12

This checkpoint preserves integration evidence, not a lifecycle completion claim.

Producer source: `1ed876dbda2825eb41c6d1579323f89278aa90d6`.
Consumer source: `3f9e5ce0615f96e1ff513668ed55bd6f9baa5691`.
Producer artifact SHA-256:
`8891b462f0657902c82161ed4003de2e197a4cbc41c2e1448fc02d7d9169f882`.

## Verified behavior

The actual built producer ran through Personal on Bun 1.3.14 and Node 22.23.1:

```sh
PERSONAL_PLUGNZ_NOTICE=off \
PERSONAL_TEST_PLUGNZ_BIN=/tmp/plugnz-native-git-main-integration/dist/plugnz.mjs \
PERSONAL_TEST_PLUGNZ_NODE=/home/charlesfengyc/.local/bin/node \
PERSONAL_TEST_PLUGNZ_VERSION=0.0.12 \
PERSONAL_TEST_HERMES_BIN=/tmp/plugnz-hermes-source-proof/.venv/bin/hermes \
PATH=/home/charlesfengyc/.local/bin:/usr/bin:/bin \
bun run check:plugin-lifecycle-producer
```

Result: **5 passed, 0 failed, 78 assertions, 18.59 seconds**. This covers
live status, same-version repair, source-free retirement and retained historical
recovery receipts, plus the supplier-inventory collision regression. Explicit
legacy adoption preview still refuses the missing fence before any mutable sync.

Raw log:
`~/.local/state/plugnz-evidence/20261012/combined-receipt-consumer-8891.log`.
SHA-256: `451e0bdbdcc2285627560a64757dd1691a17243d02a8cb73f7a166e0645c3ec9`.
Framed whole Hermes supplier digest remained unchanged:
`b60a33ee072893bc6b9c108e8ed81691c84c9bc03bcf3d6fa573261d948cc94e`.
The supplied Hermes launcher/source was observed, not executed or repaired.

Producer focused validation:
`bun test test/adoption-receipt-report.test.ts test/lifecycle-report.test.ts test/doctor-imports.test.ts`
passed **50 tests / 179 assertions**; `bun run check` and build exited zero.
Independent receipt-reader and supplier-fixture reviews are retained in their
own evidence documents and source commit histories.

## Still required

- The existing Cursor add/list/doctor/legacy-repair/update/remove test still fails
  at actual legacy adoption. No assertion, skip or timeout has been weakened.
- Adoption receipt parsing does not implement or emit an adoption transaction.
- Personal still needs adoption execution accounting and durable post-command
  verification before its later house writes.
- Crash-safe ledger exclusion remains unwired; the runtime-policy choice is
  unresolved. ZCode's native cross-process fence is not proven.
- Full acceptance, sandbox delivery verification, publication verification and
  the consumer pin are not complete. No real installation was changed.

Supporting checks must not be reported as delivery of these missing behaviors.
