# Cursor adoption: read-only projection checkpoint

Base: `d995192`, following the reviewed foundation `75c07bf` and
[exact adoption contract](legacy-adoption-wire-contract.md) (`97b411d`).
This checkpoint implements a precondition constructor, **not adoption delivery**.
No planner admission, generic lifecycle SPI extension, lease, native fence,
ledger CAS, runtime floor, dependency, consumer wire or pin changed.
The existing Cursor pending-repair acceptance remains outstanding.

## Bounded public contract seam

`proveCursorLegacyAdoption` in `src/hosts/cursor-adoption.ts` takes the validated
retained `LegacyRecordProof`, frozen package handle, exact Source reference,
resolved pins and caller-observed version/evidence. It returns the existing
`CursorAdoptionNativeProof` wire shape. The constructor revalidates the retained
record rather than accepting an asserted ownership shape.

It compares Source/target/scope, exact package path and adapter-owned collection
alias, current Source fingerprints, strict three-field legacy marker and native
payload. The original qualified ledger identity is retained; the physical Cursor
directory remains the canonical package name. A second physical alias is refused.
Collection metadata follows existing resolver precedence: Claude, OMP, then root
marketplace manifest, with the exact selected package path independently bound.

Projection stays entirely in memory: copied manifest bytes/mode, command precedence
and conversion into skills, recorded MCP pin JSON serialization, all resources,
empty directories and executable bits. Fingerprinting uses the existing framed
tree algorithm's hierarchical traversal, not flat path order. Payload proof omits
only the root ownership marker; full-root proof includes its exact bytes/mode.
Retained data/metadata are observed without editing them. Symlinks (including
broken retained-parent symlinks), unsupported resources and foreign evidence fail.

No stage, backup, ledger or native write is performed by the constructor. It does
not execute Cursor, model sessions, pin executables or an updater. Observations
are not atomic native authority: the later admission/executor must revalidate
the exact precondition under the approved native fence before writes. Constructor
success must never skip global expected-admission verification or ledger CAS.

The in-memory recipe is intentionally checked against the existing writer rather
than changing it in this slice. Changes to Cursor writer projection must preserve
this parity gate; a future shared recipe must preserve the same independent public
writer oracle and zero-staging proof, not reduce the gate to self-comparison.

## Evidence and limits

`test/cursor-adoption-projection-public.test.ts` uses actual public CLI `add` and
`pin` to produce the native store independently of the constructor. A fixture
shell launcher reports Cursor 2.4.0; **no actual installed Cursor runtime or native
capability is proven**. The test then restores the legacy three-field marker and
qualified pending v1 ledger fixture used by the established repair acceptance.
The Source/frozen-package handle is validated by existing APIs; no fake branded
handle is cast into authority.

All three marketplace layouts are exercised. Known literal generated skill and
manifest bytes are checked. Negative controls cover Source/collection/alias drift,
missing or changed pins, marker fields, foreign payload bytes, executable-bit
changes, extra/missing empty directories, a second physical alias and symlinks.
For ordinary negatives the state bytes plus complete native/Source fingerprints
remain unchanged. Final public `scopes` state and every Cursor store byte/shape
match the pre-constructor snapshot. The retained-parent symlink RED specifically
caught an incorrect `absent` observation; the final constructor refuses it.

Authoring runtime: `/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun` 1.4.0.
Homes, Sources, launcher and native stores are isolated fixtures; no real home or
installed host launcher is used. Worktree allocated size stayed approximately
26 MiB with reused dependencies. This is a behavior gate, not a throughput or
skill A/B experiment; tokens/cache/RSS were not measured.

Retained logs:

| Gate | Result | Log SHA256 |
| --- | --- | --- |
| Initial missing-constructor RED | import failure | `b513757bbb4d6bd08854f59b3091ecb45ba27fe0bb892958a8639ab40d056223` |
| Command/pin parity RED | 0 pass / 1 fail / 2 assertions | `081511880fbec8f3e4b87a29d442431b44f0ed701fc1f5f9dbf030c9bccef9bf` |
| Collection-binding RED | 0 pass / 1 fail / 54 assertions; altered collection accepted | `0e66df0c4997eff81777ee59b6b6ce83d6d9b1e2c4ad5227ab630657e15ee734` |
| Broken-retention-parent RED | 0 pass / 1 fail / 69 assertions; symlink accepted as absent | `134b05fdc6ef7c0d03e54a4965a774826ab19c6e7fddf7ed79abba0efe301c9f` |
| Frozen focused gate | 18 pass / 0 fail / 412 assertions / 8.92s | `a792a5017319b7416c57b007ad7b2ab8884ddc89b127b8b08d04f49de63eb70d` |

Raw logs live in `/tmp/plugnz-cursor-projection-{red,commands-pins-red,negatives-red,retention-red,freeze}.log`
and durable copies under
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/cursor-adoption-projection/`.

Frozen focused command:

```sh
bun test test/cursor-adoption-projection-public.test.ts test/cursor-managed-lifecycle.test.ts test/legacy-adoption-public.test.ts test/legacy-adoption-proof.test.ts test/legacy-adoption-record-public.test.ts test/doctor-imports.test.ts
bun run check
git diff --check
```

Typecheck and diff check exit 0. The new public projection case is 3.424s,
216 assertions, with an explicit 20-second multi-CLI test budget; production
timeouts and assertions are unchanged. This is not a full-suite, packed artifact,
cross-process native fence, process-kill adoption, A/B/A-history or consumer-golden
acceptance. Main remains root-owned and unchanged by this lane.

Skills unchanged: Matt TDD SHA256
`712be9536b9e3d29e7baf5a80937a7ce3c6d85eaca796bdfa6079e24bc80cabc`,
Addy API SHA256 `5dafd0c44a3aabf11cae5bcb34f6fcc24dfa5c01ba6e0d3176bce997f4d68bc8`.
The observed misses became product negative gates; no method-improvement or
causal skill-quality claim is made.
