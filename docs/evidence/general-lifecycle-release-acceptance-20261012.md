# General lifecycle release acceptance

Owner sequencing: **make the general lifecycle work, test, merge and publish;
then finish refinements**. This does not erase the remaining adoption work.

Frozen tested source: `710b7182f53d3eec5e164f35ff08ae5d8f632583`.
Tree: `dc2ac2f74887cb90ae4a8c6ce8a308926afcad70`.
Built pre-publication 0.0.12 artifact SHA-256:
`701f6db3b56275eab985d82dbae2738e86b38add5e4f1f831a3958318cb4ff33`.
The publish workflow bumps the patch **before** building the registry artifact;
that published artifact needs separate version/integrity/runtime verification.

## Delivered release boundary

Source-tracked ordinary add/update and authoritative sync, changed-byte and
same-version repair, recorded pins, scope-bounded orphan retirement, explicit
offline Source retirement, retained data/metadata/history, visible capability
gaps, actionable errors and command-global preflight failures before host writes.
Modern interrupted operations retain recovery evidence. Native routes remain
bound to each adapter's proven profile; no universal native-capability claim.

The unfinished legacy adoption transaction is **not** delivered. Two active
qualified-legacy retries prove loud `internal.invariant`, actionable missing
fence/executor diagnosis, unchanged Source/native/cache/ledger bytes and retained
original pending history. Successful migration and stronger cross-process
exclusion remain explicit next-phase work. The incomplete Personal receipt
refinement branch is not part of this release.

## Verification

Pinned Bun `1.4.0+34cbb9a40`, actual Node `22.23.1`, frozen dependencies.
Build completed before the artifact-backed public tests:

```sh
bun run check
bun run build
OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test
bash test/node-smoke.sh
bash test/tarball-smoke.sh
bun audit
```

- Full suite: **931 pass, 0 fail, 6 existing skips, 6881 assertions** across
  937 tests / 92 files, **543.99 seconds**, terminal exit 0.
- Typecheck/build: exit 0. No assertion, skip or timeout was weakened.
- Plain Node/Bun-free lifecycle smoke: green.
- Actual tarball install, real npx/bunx launchers and installed-bin lifecycle:
  green. Pack inventory is exactly LICENSE, README, dist/plugnz.mjs, package.json.
- Native dependency audit: no known vulnerabilities; bundled TOML parser is
  locked to patched 1.9.1. The earlier reachable advisory and its correction
  remain documented, not dismissed as development-only.

The six unchanged skips concern Codex cleanup fault injection, two genuine
Hermes-loader/launcher legs, a genuine Grok loader and two desktop-bundled ZCode
detection legs. They are not evidence those native cases passed.

Both independent review axes approved dependency/docs `62ff6ad` and the explicit
general-versus-legacy test boundary `e1af070`. Different-model Spec review used
gpt-6-astra. Source histories are merged and preserved, never squashed.

Raw evidence: `~/.local/state/plugnz-evidence/20261012/general-lifecycle-release/`.
Full suite log `full-suite-710b718-built-first.log`, SHA-256:
`614f28ca11af41e21a0027934da3fa9f70b7c881435a796c561cd03329a67169`.
The earlier build-order attempt was intentionally stopped (exit 130): it started
artifact tests before the bundle existed. Its log is retained separately, not
reported as a completed gate. The unchanged failing case passed once built;
then the complete corrected run above passed. Contended independent timing
failures are also retained, with unchanged-limit isolated passes—not retroactively
reported as a green broad run.

No real plugin installation, native harness upgrade, fleet deployment, backup
deletion, or uncontrolled-repository action was performed. Publication is now
explicitly authorized; registry verification is still a required next step.
Skills remained unchanged; no skill-improvement claim is made.
