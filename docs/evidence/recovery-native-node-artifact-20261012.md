# Combined recovery producer: local Node artifact gate

Frozen producer checkout: `c032344` (source merge `40ab2b1`). This is an
unreleased candidate still labelled `0.0.12`, **not** the npm registry's 0.0.12
artifact. No published package, Personal pin or installed harness was changed.

Pinned Bun 1.4.0 built the combined source into one Node-shebang bundle:

- SHA-256: `215174eb1a9a150e2fbcac433c26ea366258338eae6490cdcb063324afda69a9`.
- Retained bundle:
  `/home/charlesfengyc/.local/state/plugnz-evidence/20261012/artifacts/plugnz-c032344-215174eb.mjs`.
- Earlier C72 producer retained separately as `plugnz-b029c54-c72.mjs` in that
  directory; its Native evidence is not reattributed to this new producer.

## Executed runtime checks

Actual ambient Node **22.23.1**, explicitly first on PATH, ran both scripts:

```sh
REQUIRE_LOCAL_22=true sh test/node-smoke.sh
sh test/tarball-smoke.sh
```

Both exited 0. The scripts assert the restricted PATH resolves the selected
Node executable and contains no Bun for the plain-Node legs. The isolated
Cursor install/list/doctor/remove lifecycle passed. Full doctor JSON matched
the development Bun launcher. The locally packed npm tarball installed into a
fresh prefix, included `dist` but no source tree, and passed installed-shebang,
actual npx launcher, legacy bin alias and lifecycle checks. A separate intentional
Bun-enabled bunx leg emitted byte-identical version JSON.

This is not a supported-version matrix, real-harness loader proof, exhaustive
recovery-under-Node gate or registry publication acceptance. Node's minimum
remains `>=22`; no SQLite lease/runtime-floor decision was inferred.

Raw logs are retained under
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/recovery-native-integration/`:

- `plugnz-c032344-node-smoke.log`, SHA-256
  `a5d8bb4f5fefc18de553eacd0d974a9b3bfd57d71725776d6f229cc325e7d935`.
- `plugnz-c032344-tarball-smoke.log`, SHA-256
  `ff2451e51075bd3f20bbfc493355fef152db869cb33f207ccbe778d297ea39bb`.

The full combined suite, remaining admission/transaction implementations,
genuine final-harness trials and deliberate consumer cutover remain required.
Skills unchanged; no causal skill-quality improvement is claimed.
