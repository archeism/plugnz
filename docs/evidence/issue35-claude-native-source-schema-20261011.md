# Claude pinned native marketplace Source schema guard

The native common-envelope proof at
[83f1b03](issue35-claude-83f1b03-vercel-20261011.md) remains retained. Its
explicitly open Source union gap is reproduced at `60c0fa1`: a foreign
`{source:"github",repo:17}` passed public batch sync with exit zero.
Raw RED: `issue35-claude-source-schema-red.log` in the durable evidence
directory below, SHA-256
`c565593c1a0ccd7de2ee6d70ec20866f8b61edf549f17a9fe843a1d0ff0e0953`.
The new guard validates, never normalizes or repairs,
the native global Source union and settings inline plugin entries.

## Official exact-version source

Both official Linux x64 npm tarballs were streamed with SHA-512 integrity
verification against the corresponding exact npm version metadata; no native
binary was retained locally or executed. Pinned primary artifacts:

- [2.1.275](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.275.tgz),
  integrity `sha512-bYMiMDKEFqC4PJzMt2ESaNSRNH+8PiSZwIjEjPMriMuILVRXrNQ138b8jeMcdvTAAq3lHrn75qGxy02yJcaN6A==`.
- [2.1.295](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.295.tgz),
  integrity `sha512-nC9RZ6ZArEavyAiFdEtGK6/XPhjfE79tP2tCh+PjmRUxSO/6W3IuXv/rmo8c6u2UzHyvgKodRj1z6UcBGlbnyA==`.

Bounded source windows capture the discriminated union, inline plugin schema,
name/control refinements, author object, npm patterns, header-helper contract,
command/timeout limits and archive URL hostname guard. Version 2.1.275 uses
`Ge`, `oc`, `Fs`, `SAn`, `Rt`, `vn`, `rxe`; 2.1.295 uses `Ki(true)`/`ji`,
`wg`, `Bi`, `$p`, `an`, `To`, `z7`. Both support ten marketplace Source
variants and six remote inline plugin Source variants. Unknown object keys
are native-accepted and must remain unchanged.

The profile difference is material: 2.1.275 settings names reject official
reserved/look-alike and non-ASCII names at Source parsing. In 2.1.295,
`Ki(true)` intentionally defers those official/look-alike checks to the
catalog-loading boundary; it retains common name/path/control restrictions.
The guard uses the adapter's detected pinned version rather than silently
imposing the older stricter name contract on newer native-valid registrations.
It does not add semver, GitHub repo-format, regex compilation, absolute-path,
URL constraints on git references, ISO timestamp, or private-RFC1918-host
requirements that these native schemas do not impose.

## Implementation and acceptance boundary

`src/hosts/claude-native-schema.ts` is a read-only compatibility helper on
the writer graph. Its Source checks run at global target observation,
apply precondition revalidation, preparation readback and operation readback.
Unknown/invalid discriminators, required fields, optional field types and
nested inline constraints fail loudly with the exact foreign field path.
The foreign record is neither repaired nor removed. Rollback keeps its
existing retained-slice behavior and is not gated on repairing foreign state.
No Native update admission or version ranges were added.

Public CLI regressions cover a bad foreign Source and bad nested commit SHA
in an earlier-Cursor/later-Claude batch with zero native/ledger changes,
19 additional invalid Source/refinement cases, all ten valid native Source
forms and all six inline remote plugin kinds with opaque metadata preserved,
and the exact 2.1.275/2.1.295 settings-name distinction. The two additive URL
properties in the no-`@types` declaration were checked against every `new URL`
caller (`source-reference.ts` and the new helper); runtime behavior is unchanged.

This closes the *known_marketplaces Source parsing* compatibility boundary,
subject to independent review and fresh native verification. It does not claim
to validate every native catalog/plugin-manifest/settings schema or execution
mechanism. Hooks remain an unadmitted planned capability, not native absence
or an intentional exclusion. Any additional demonstrated native false-green
is a hard blocker, not a reason to silently narrow the whole program.

## Evidence retention and measurements

Archive:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/issue35-claude-native-source-schema.tar.gz`,
456 KiB allocated; SHA-256
`004215d11886f32993a88716a48d4184817c15823703852e06619a58970ca138`.
It retains the bounded extractor and exact original and expanded source
windows. Initial window extraction took 3.05 s / 111,788 KiB maximum RSS
for 2.1.275 and 3.40 s / 108,424 KiB for 2.1.295. Expanded dependency-window
extraction time/RSS were not measured; they are unknown, not zero. Exact
initial outputs were reconstructed from the expanded superset and matched
their recorded initial hashes; both copies are retained.

Real restore into `/tmp/plugnz-claude-schema-restore.bUMvIM` (1,520 KiB
allocated) reproduced all four source-window hashes:

- Expanded 2.1.275: `30ec59d0d8965406b4b7d481ac91f3db1fdcdc7fe671ac0bc91d81b2c7a611db`.
- Expanded 2.1.295: `af3fd5332acb9b4fac0886c08331166958dfc00d03d68edf8db058f01cd6d4f2`.
- Initial 2.1.275: `e3d14cc6f258129fed8da9efecbd295e29d419671724c010d2f9c0db85fc2c3c`.
- Initial 2.1.295: `7943f63bbda0c4c7c0f682c71bc75eaa255f25876acdc8b04628578b75b0285c`.

Restore with `tar -xzf <archive> -C <empty-restore-directory>` and verify
those JSON files with `sha256sum`. No Sandbox was launched or resumed for
this implementation increment. A fresh native proof would require a new
bounded storage plan: three retained snapshots already total 2,829 MiB;
adding another persistent snapshot and active state exceeds the previous
3.5 GiB whole-store ceiling. The parent therefore authorized the *next*
proof as nonpersistent, reusing the exact native base, with no new snapshot:
entire active filesystem/proof/source/archive scratch at most 1.5 GiB,
local archive and restore each at most 100 MiB, whole lineage at most
4.5 GiB. Its actual full-filesystem allocation must be measured before
proceeding; if the restored base exceeds the bound, revise the budget rather
than silently exclude base/system storage. Complete archive, real restore
and independent verification precede stop. Prior snapshots/evidence are
not deleted; this does not retroactively change the earlier experiment budget.

Frozen local gates:

```sh
bun run check
bun run build
bun test test/claude-catalog-public.test.ts test/claude-code-lifecycle-route.test.ts \
  test/claude-code-detection.test.ts test/claude-lifecycle.test.ts test/doctor-imports.test.ts
OPEN_PLUGIN_TEST_PACKED_NODE=node bun test test/claude-catalog-public.test.ts \
  test/claude-code-lifecycle-route.test.ts test/claude-code-detection.test.ts \
  test/claude-lifecycle.test.ts test/doctor-imports.test.ts
git diff --check
```

Native Bun: **59 passed, 423 assertions**, 30.02 s wall, 132,968 KiB maximum
RSS. Packed Node: **59 passed, 423 assertions**, 33.74 s wall, 128,720 KiB
maximum RSS. Typecheck, build, whitespace and doctor reader-import boundary
passed. Producer artifact SHA-256:
`ccd91fe45ad14a981c2140d6d5fa6e9c472fab8821acc57158469708f1e5c62c`.
Retained raw focused/packed log hashes respectively:
`1d1e9bc95205f15689b0e8b55fc3d9a834d9f8da4922235cf1e33c1a3d22f3f9`
and `ab85f5d39373ab28aca2f662d64222c95f623668cb335094cb0d6d8c01b4c759`.
Both independent axes and fresh actual native malformed-Source/clean
discovery proof remain required before accepting this new candidate.

Skills are unchanged. Public CLI diagnosis→RED→guard→compatible-positive
checks applied the existing source-driven and TDD methods; no skill A/B
or method-improvement claim is made.
