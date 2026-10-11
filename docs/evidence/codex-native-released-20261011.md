# Released Codex native administration probe

Measured in disposable Vercel Sandbox `plugnz-codex-native-20261011`, project
`workspace-agent-lab`, 2 vCPU / 4 GB, bounded 30-minute lifetime. No model API
credentials or real installation were used. Codex package version 0.162.0;
`codex --version` returned `codex-cli 0.162.0`; Node 24.21.0. Installed native
tools used 432 MB. Raw evidence is outside Git at
`/tmp/plugnz-codex-native-evidence/` (224 KB before final public-route evidence).

Reproducer: `test/codex-native-released-probe.mjs`, run under `setpriv
--bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs`.
The probe asserts all five Linux capability sets are zero. Isolated roots are
restricted to `/vercel/sandbox/codex-native-proof/`.

Frozen repository: `https://github.com/archeism/plugnz.git`, approved fixture
branch `finish/codex-native-proof` (fixture-only; never merge its root marketplace
or source-symlink removal into product main).

- V1: `c7e8ddd43e5419be18eac7817275f59ac80beb11`.
- V2: `c49adb733cd8e19d8c116707b2d24101b4f2ea10`.
- Both declare plugin version `0.1.0`; skill and resource bytes differ.

Verified native `plugin marketplace add URL --ref SHA --json`, `plugin add
lifecycle-probe@plugnz-proof --json`, and `plugin marketplace upgrade
plugnz-proof --json`. Upgrade installed V2 bytes at unchanged declared version,
returned no errors, and advanced checkout HEAD to exactly V2. Native config
uses `source_type = "git"`, `source = URL`, and **`ref = SHA`**, not `ref_name`.

A deliberately unwritable cache parent caused native upgrade to exit 1, but
the native checkout at `.codex/.tmp/marketplaces/plugnz-proof` had already moved
to V1. Thus native per-plugin atomic copying is not whole-marketplace rollback.
An explicit isolated full-home control restoration recovered exact tree bytes,
prior checkout SHA, and valuable plugin runtime data. This control is **not**
proof that plugnz's adapter rollback is complete; public-route proof is separate.

Real app-server `skills/list` found `lifecycle-probe:probe`, enabled, scoped user,
with plugin ID `lifecycle-probe@plugnz-proof` and native cache path; errors were
empty. Reproducer: `test/codex-native-skills-probe.mjs`. No model call was made.

Primitive success: 1,997 ms wall time, controller CPU usage recorded in raw
`native-primitive-03.result.json`. Failed attempts 01 (missing pre-created
CODEX_HOME) and 02 (incorrect probe assumption `ref_name`) were retained in the
Sandbox before cleanup. The successful raw streams, manifest, and skills/list
response are copied outside Git. All three attempts and their complete isolated
stores are additionally retained in the 7.6 MB compressed archive
`/tmp/plugnz-codex-native-evidence/native-primitive-archive.tar.gz`, SHA-256
`f745bc6b8d79999ce744e5ebf657a117f06d96825e3a447e9d69b811f8393042`.
Its 1,335-entry inventory was listed successfully; the restored result bytes
match the separate result SHA-256
`9848889c473abe424f610f6f53bc6e5a8302da7462e91189022320959e681fb8`.
No live/loose proof roots were deleted. Published source inspected at
`c1382380de69521303b416720a52f42d51af6248`: core-plugins Git operations set
`GIT_OPTIONAL_LOCKS=0`; inspected store/marketplace paths do not establish a
cross-process mutation lock. Do not infer concurrency-safe whole-store rollback.
