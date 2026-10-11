# Claude Managed catalog lifecycle correction — 2026-10-11

## Acceptance boundary

The fresh official Claude Code 2.1.295 probe in
`issue35-vercel-hermes-claude-3e7eefc-20261011.md` established a real adapter bug:
an enabled installed-cache row alone does not load a plugin. The native catalog
must also be registered and provide the selected member. No Claude upstream
change, model call, native `--plugin-dir` bypass, or broader capability profile
is part of this correction. Fresh actual-loader verification of this corrected
candidate remains required before integration.

Primary contract: [official plugin CLI reference](https://code.claude.com/docs/en/plugins/cli-reference#plugin-details).
The failed raw native debug trace and exact native binary/source identities are
retained in the preceding evidence archive, not replaced by fixture results.

## Durable correction

- Global planning preflights the selected catalog and native metadata paths;
  a last-pair collision blocks every pair before native or ledger mutation.
- Managed activation registers an owned directory catalog and copies the exact
  sealed native projection into its selected member. Cache and catalog copies
  both participate in readback. Missing registration/member or changed catalog
  bytes make the existing activation nonconforming, not an unchanged success.
- Ownership binds the exact native ID and canonical Source scope ID. Local
  Source locators deliberately remain outside the lifecycle adapter boundary;
  no shared identity or privacy invariant was relaxed.
- Refresh, rollback, and source-free retirement edit only the selected member.
  Catalog siblings, foreign entries, foreign container files, plugin data,
  inactive metadata, and unrelated settings remain retained. An empty wrapper
  is removed only when its known owned scaffolding is all that remains.
- A pre-existing foreign directory catalog may remain untouched only when its
  directory matches the canonical local Source scope and its selected native
  member delivers byte-identical staged content. Names or bytes alone never
  establish Source binding or grant ownership of that catalog. Other foreign
  registrations refuse replacement loudly. Marketplace auto-update control
  also checks foreign catalog members, not only installed registry siblings.
- Catalog rollback restores its selected manifest/member slice, not a shared
  catalog snapshot. A foreign replacement of the container or selected copy
  refuses rollback rather than overwriting it.

## Isolated public reproduction

All public commands run as real subprocesses with controlled temporary
Source/home/store roots. The fake Claude executable supplies only the pinned
version boundary and an explicit staged-drift fault; it is not native loader
acceptance evidence. Native loader acceptance is the separate Vercel gate.

The first three public tests were committed RED at `b2ee898`. A detached
`b2ee898` worktree plus the expanded test/fault fixture reproduced six failures
and one compatible-native-catalog positive: missing registration, incomplete
catalog lifecycle, ignored foreign collision, last-pair batch false success,
missing refreshed catalog copy, and missing shared wrapper. The last foreign
container-file regression was added afterward and is not claimed as part of
that initial seven-test RED run. Its exact fixture is preserved at `a73bd0a`
on `evidence/claude-catalog-expanded-red`: **deliberately RED, evidence only,
never merge this branch into main**. Product baseline remains `b2ee898`.

Frozen RED SHA-256 identities:

- public test: `1df5c70e259004c25632356df0cca2e417974ef68afcf20abee419df0d888e3e`
- subprocess harness: `82178c815f40d14c14d0187a3cd2040a3aa6d92bd436f18b5c552e0ca7045c8a`
- baseline writer: `3f287f6d15ce803dfc961aa021d3bc7e5cb4ca9705d9db5d2457e74f681321a6`

Commands:

```sh
# Frozen RED product, expanded seven-test fixture
bun test test/claude-catalog-public.test.ts

# Candidate native-Bun focused gate, then the same public commands via Node artifact
bun run check
bun run build
OPEN_PLUGIN_TEST_PACKED_NODE=node bun test \
  test/claude-catalog-public.test.ts test/claude-code-lifecycle-route.test.ts \
  test/claude-code-detection.test.ts test/claude-lifecycle.test.ts \
  test/doctor-imports.test.ts
git diff --check
```

Native-Bun focused gate: 47 passed, 257 assertions, 13.27 seconds before the
final root-only metadata-stripping refinement in foreign-catalog byte proof.
Final packed-Node gate and frozen RED raw logs are retained under
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/` as
`issue35-claude-catalog-packed-green.log` and
`issue35-claude-catalog-b2ee898-red.log`; their hashes/results accompany the
frozen handoff. Final packed Node gate: **47 passed, 257 assertions**, exit 0,
15.94 seconds wall time, 120,008 KiB maximum RSS. The RED run: **1 passed,
6 failed**, exit 1 as expected, 9.59 seconds wall time, 98,384 KiB maximum RSS.
Typecheck, build, and whitespace checks passed separately.

Retained SHA-256 receipts:

- packed Node log: `ab91c1a2c94cddf8a213117b97d63b4d302315a484a674798e3402df82cb6ffa`
- frozen RED log: `2e92ec84d39ac6e904c20aa7c27517f62dff7bd326059eaff113bab27448490e`
- candidate `dist/plugnz.mjs`: `e6ac589b86b4980880ce2719d7becec140e3e0c1e9d31db8d40bafb62b029731`

## Resource and next proof boundary

Local allocated bytes before the extra RED worktree were 24,696 KiB for the
owned producer worktree, 221,288 KiB for the retained exact-source Hermes lane,
3,940 KiB for the detached RED worktree, and 3,612 KiB for the earlier Vercel
proof scratch. This remains within the authorized 400 MiB local active lane.
No native installed checkout or native home was executed or deployed during
this increment. The earlier incidental installed Git lazy-fetch caveat remains
in the Hermes evidence; it is not erased by these isolated results.

The stopped Vercel snapshot and durable archive remain retained. A fresh
candidate runtime proof must budget the observed 942 MiB automatic snapshot
retention separately from active source/venv/native package bytes and archive
scratch. No additional Sandbox was started or restored for these local tests.

Independent review and fresh actual Claude loader discovery, same-version
refresh, and retirement/readback remain open gates. Local fixture success is
not a claim that those native gates passed. Skills are unchanged; this is a
product correction, not a claimed skill-method improvement.
