# Global refusal for unproven authoritative orphans

Base: published `80e9618693a99d11fad8729a250dae8d4bddea74` (0.0.13).
Scope: [P07 #43](https://github.com/archeism/plugnz/issues/43), deterministic defects are command-global zero-write failures; [P09 #45](https://github.com/archeism/plugnz/issues/45), “Foreign/unproven/ambiguous ownership blocks globally before mutation.” This is not a new ownership policy for unrelated foreign packages.

The real CLI reproduction first synchronizes alpha and beta to establish authoritative ownership. It removes only beta's native ownership marker, leaving its physical plugin and authoritative ledger record present. A complete manifest then requests an earlier independent install followed by either alpha-only sync or offline retirement of the recorded scope. On the base, both mutable commands physically install the earlier package before reporting the known ownership failure. Their reports correctly say changed/mutationStarted, but that does not meet global preflight refusal.

The planner now returns a global defect from the existing retirement ownership checks, including incomplete recorded ownership reconstruction. It does not change route capability classification: Desired capability gaps still block that scope's pruning and leave independent pairs executable. V1 non-authoritative omissions remain unpruned. No adapter, executor, public schema, Node policy, writer lease, legacy adoption fence, or Native route is added or changed.

## Evidence

Raw logs: `~/.local/state/plugnz-evidence/20261012/global-orphan-ownership/`. Runner: `/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun` 1.4.0 (`34cbb9a40`); packed CLI runtime: `/home/charlesfengyc/.local/bin/node` v22.23.1. Every subprocess uses the existing isolated-home harness.

- RED `bun test test/orphan-ownership-public.test.ts`: 0 pass / 2 fail. `public-red.log` covers incorrect preview plans; `public-apply-red.log` shows changed/mutationStarted; `public-bytes-red.log` fails on the actual earlier plugin's on-disk JSON bytes. No production changes preceded these failures.
- RED `bun test test/planner.test.ts -t 'authoritative omission|recorded activation is not revalidated'`: 0 pass / 2 fail, returned frozen instead of zero-write-failure.
- GREEN `bun test test/orphan-ownership-public.test.ts test/planner.test.ts`: 16 pass / 217 assertions / 8.80 seconds. Existing planner capability-local and V1 retention controls pass.
- GREEN `bun test test/executor.test.ts test/precondition-public.test.ts`: 32 pass / 282 assertions / 12.42 seconds.
- GREEN `bun run check`; initial typecheck found test-only declarations unsupported by the local ambient types and was corrected without production changes. Both logs retained.
- GREEN `bun run build`.
- GREEN `OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test test/orphan-ownership-public.test.ts test/lifecycle-public-commands.test.ts -t 'unproven authoritative orphan|scenario 4'`: 3 pass / 43 assertions / 9.86 seconds. The repaired tests verify mutable and dry-run zero-write refusal, exact ledger/store preservation, then restore the marker and prove real convergence plus beta's tombstone. The existing public capability-gap scenario still converges its independent pair.
- `git diff --check`: exit 0. Independent review and the full integration suite remain root-owned pending gates, not claimed complete here.

| Log | SHA-256 |
| --- | --- |
| public-red.log | `303f28ee9625cc379f094f1b59d643ae7775b176b1aee49ac8c18b64feff8a89` |
| public-apply-red.log | `9f602f293e9811887d6fc190b483ea9438d7c3ba650c4ca8e1e9cfce367242b0` |
| public-bytes-red.log | `320b1b25c7d762d9905a70bb254b37d7a6144faf2a889ab3705f9a56a115bf3e` |
| planner-red.log | `4bd88bb0086dfa5a7112a4fbdf8bd25f4f60cb13ef6ee2a27c7595370fc7421f` |
| focused-green.log | `ad6f6affa8a707a559fc39404109ef2634cdccc4bf1e60ac21afff89208ad202` |
| dependents.log | `5b74592636471c8927d4906c5fd81df6f69b565f6daccb9b42ab089a4fbdd63c` |
| check.log (initial failure) | `c540b653d545d1baadc76f36f0dfe68fd003d757cb79a480d894e1d4b28a0018` |
| check-green.log | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| build.log | `ddcf34789ca2564ff03d3a0439c3e9717006e1df13a77bd83d5c128e74e70516` |
| packed-node-green.log | `2582f5ad66cc5768ac37c91c15862e32dc5caf9bc88388b005a251b0e3063189` |

The ambient Bun 1.3.14 rejected this repository's lockfile version; installation used the already-available 1.4.0 binary with `--frozen-lockfile`, without changing dependencies or the lockfile. Skill decision: Addy TDD/incremental/Git/documentation methods used unchanged; no skill improvement is claimed. No publication, fleet update, real installation change, or complete child-issue closure is claimed by this checkpoint.
