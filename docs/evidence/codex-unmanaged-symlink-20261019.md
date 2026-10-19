# Codex unmanaged bundle inventory regression

- Host: Charless-Mac-mini, Bun 1.4.3, native Codex CLI 0.162.0.
- Observed failure: `personal upgrade` / `personal status` with plugnz 0.0.25
  aborted the entire batch with `inventory: cannot fingerprint symlink: .`.
- Native entry: Codex's bundled Chrome `latest` is a symlink to its installed
  version. No Chrome bytes, links, configuration or ownership were changed.
- Baseline native `codex app-server` `skills/list`: nine Personal plugins,
  96 skills, no Addy. Addy's agents remain outside the adapter's verified
  capabilities; this repair does not add support or drop those components.

The public CLI regression failed before the fix on the exact inventory error.
After the fix it preserves the unrelated bundle through preview, install,
update and retirement. Separate refusal cases retain source-link rejection
and prevent adoption through a linked root, including an ownership marker in
the target. Tests use isolated homes and an explicit fake native version
boundary; these tests are not native-loader proof.

The candidate bundle's read-only preview on the actual Mac passed inventory
and planned a csuite update and Rivet installation. Existing compatible
plugins were unchanged; Addy remained visibly refused. Independent review
found no actionable blocker and reran 13 tests plus the TypeScript check.

Applying the reviewed development bundle through Personal's `deployPlugins`
completed the compatible pairs. The report remained incomplete for explicitly
unsupported pairs, with no recovery or readback failure. A fresh native Codex
app-server then loaded ten Personal plugins and 103 skills, including Rivet's
seven skills; Addy remained absent. Chrome's original `latest` symlink was
unchanged. This is a fresh-loader check, not proof of hot reload in an existing
desktop conversation.

Skill decision: operating instructions unchanged. The reproduced failure was
in native inventory code, so the durable protection is the public CLI regression,
not a new instruction to replace native bundle symlinks manually.

Landing checks: `bun test` — 1171 passed, six skipped, zero failed across
110 files (456.03 seconds); `bun run check` — passed. The skips remain
explicit and are not claimed as exercised host capabilities.
