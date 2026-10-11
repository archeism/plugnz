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

## Independent-review corrections after `c0256e1`

Independent reviewers reproduced three false-green boundaries: an owned
selected catalog entry with `strict:false` and `skills` overrides was not
repaired; catalog-only/registration-only repairs reported `changed:false`;
and foreign member proof projected both sides, synthesizing a missing native
command declaration instead of comparing the actual foreign runtime input.
The official selected-entry component merge/conflict contract is documented
in [Claude marketplace strict mode](https://code.claude.com/docs/en/plugin-marketplaces#strict-mode).

Four authentic public CLI regressions were committed RED at `84f371b` against
the `c0256e1` product: **8 passed, 4 failed**, 68 assertions, 16.61 seconds
wall time, 105,880 KiB maximum RSS. The retained log is
`issue35-claude-c025-review-red.log`, SHA-256
`d7ebb7cad0628a39b6307fdc7fc7e87e05777e1c85d00e3f2d7bab2c27d9c7c2`.

The correction binds the complete selected catalog entry, not the shared
marketplace document. Owned entries must equal the minimal generated entry;
compatible foreign entries retain display/opaque metadata but cannot supply
conflicting component declarations or an unproven dependency graph. Their
complete entry digest is captured in both the precondition and readback.
A supplemental regression changes selected opaque metadata after activation
and proves verification fails, while unrelated marketplace metadata and a
foreign sibling remain outside the selected binding. `strict:false` without
component overrides and a boolean `defaultEnabled:false` remain supported:
the explicit enabled setting takes precedence.

Foreign payload proof now projects only the incoming Source and compares it
with an unmodified copy of the actual native member, excluding only the two
explicit root-level plugnz private markers. Missing actual native command
declarations and conflicting foreign catalog entries hard-block before native
or ledger writes. Mutation receipts compare the actual selected catalog,
registration, registry, and enablement slices as well as cache bytes, so an
unchanged cache cannot hide a catalog-only repair.

The first packed gate retained a transport deadline failure: 50 passed,
1 failed, 284 assertions; one pre-existing multi-command case took 5.411
seconds against Bun's default 5-second deadline. Its raw log
`issue35-claude-review-fixed-packed.log` is retained with SHA-256
`252a54e63207fd473b43d0a0fdda407f91548e12670403d5ec7630eec7c40e9a`.
Public cases now have an explicit bounded 20-second subprocess transport
budget; no assertions were removed or made conditional.

Final checks use the same five-file command above:

- Native Bun: **52 passed, 286 assertions**, 26.93 seconds wall time,
  127,336 KiB maximum RSS. Log `issue35-claude-review-fixed-packed-retry2.log`
  (historical filename; this run has no packed environment variable), SHA-256
  `7d7535b14cadd16efc7ef3cab02459c7bdd81f7be22abece9769bdb49fedc6c2`.
- Packed Node (`OPEN_PLUGIN_TEST_PACKED_NODE=node`): **52 passed,
  286 assertions**, 23.44 seconds wall time, 127,424 KiB maximum RSS.
  Log `issue35-claude-review-fixed-packed-final.log`, SHA-256
  `b26e8b16a2974758c71dee7a2a3cdc85fdbbc1a03de8423cbc47df94752c9dd7`.
- Typecheck, build, and whitespace checks passed. Artifact SHA-256:
  `0e2d8bc72941874563116c7cea30ff15e88f1ae7382a655ca457ae1e8dfb66fa`.

Frozen source SHA-256 receipts: writer
`cdf74ed3b36e5ac9fc537a92bb5f2335e68d25104dc57b4fe934e84b9d8b86d7`,
public test `c2c0c9184c3b68d063f9d3e0ad032e61108883e27502e5677d2f1baee043f5fe`,
route test `e299a713fa08908ee2ffc70cc848433e74ae544501f98b219c568e2eb0568d20`.
Producer and RED worktrees allocate 24,748 and 3,948 KiB respectively;
the shared durable evidence directory allocates 22,408 KiB. No additional
Sandbox or real native installation was used for this correction. Independent
re-review and fresh actual native-loader acceptance remain required before
integration; the local gates do not replace them. Skills remain unchanged.
