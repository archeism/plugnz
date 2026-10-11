# Recorded Git provenance compatibility

Historical producer `88d89c5` omitted the canonical Git locator from lifecycle
markers. This is a producer bug, not permission to derive an origin from a native
ownership marker. Hermes stored the old SHA with `sourceLocator: null`; dcode
stored `local:<scope>` despite `sourceType: git`.

An isolated public CLI run of that genuine producer reproduced both failures
before the compatibility change: Hermes refused replacement as another Source;
dcode rejected its own historical marker as an invalid Git locator. Raw attempts
remain outside Git under `/tmp/plugnz-old-git-proof-lShWcb` (RED) and
`/tmp/plugnz-old-git-proof-pObNH9` (GREEN plus original native homes). The latter
is below 1 MB. No real installation was read or mutated.

`test/fixtures/prior-git-source/producer-88d89c5.json` contains the actual original
native files and strict lifecycle ledger, captured before the new CLI ran. The
only substitution is the isolated home path in dcode's native registration;
native content and ledger fingerprints are unchanged. The Git transport wrapper
delegates to actual `/usr/bin/git` against an isolated local repository; it maps
the credential-free canonical fixture URL without making an external request.

The new preparation proof is private and process-local. It requires the same
authoritative active Source binding and target, verified recorded ownership and
revision, unchanged recorded installed bytes, and current content-root digests.
Each adapter additionally validates its exact historical marker format. Null
inventory provenance is an observation, never authority. An absent ledger,
rebound Source or changed prior bytes refuses globally before host/state writes.
Same-byte sync must still plan an update to end the broken metadata lifecycle.
Named physical contexts, when recorded, must match the actual observed target;
older default-target ledgers without that field remain bound by exact owned
native roots and installed-byte proof, not a guessed context.

Public regression gate: `bun test test/prior-git-source-public.test.ts` covers
genuine captured producer stores for Hermes, dcode, Codex, Claude, Cursor and OMP,
plus fresh-process recovery after a readback fault and SIGKILL before apply.
`test/prior-git-pin-public.test.ts` proves offline dcode pin preserves its recorded
Source and repairs the historical origin without fetching. `bun run check`
passed. Separate actual Python 0.1.83 lock-backed
public runs reproduced and repaired Hermes and dcode. The portable regression
gate uses a lock-boundary double, not an assertion of released native behavior.

Additional genuine producer captures are retained at
`/tmp/plugnz-old-git-proof-DyKdFu` (six hosts; 1.5 MB) and
`/tmp/plugnz-old-git-proof-68KCRi` (dcode MCP/offline pin). Tracked JSON fixtures
preserve their original native bytes and ledger, substituting isolated home
paths and symlink targets only. The CLI-version probes are boundary doubles;
these tests do not establish released Native update capability.

Native update admission/proof, truthful migration preflight and the dcode
registry-version acceptance discrepancy remain separate work; this evidence
does not resolve those questions.
