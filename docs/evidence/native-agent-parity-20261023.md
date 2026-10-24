# Native portable agents — integrated acceptance, 2026-10-23

Product checkpoint: `92cd137` (includes upstream ownership fixes through
`ad394d6`). OMP, OpenCode and Grok Build add native execution support; Pi implements
Charles's explicit warning/skip decision. Cursor, Kimi, Hermes and DCode remain
[deferred TODOs](../research/portable-agent-parity-20261022/deferred-hosts.md), not
parity claims. Release/registry receipts belong to [acceptance #103](https://github.com/archeism/plugnz/issues/103).
The original milestone remains open for deferred work. No fleet rollout.

## Support matrix

| Target/version | Discovery and child execution | Model/instructions/tools | Lifecycle and limit |
| --- | --- | --- | --- |
| OMP 18.8.7 | Enabled extension-package agent discovery; four actual native task children | Explicit > user alias > package alias > omitted parent model; native credential fallback allowed. Native Markdown normalization/comment removal disclosed; ordinary tools retained. | Install/re-add/update/alias change/rename/remove, collision/edit guards, pin dry-run preservation and legacy Git migration covered. Restart; project/relative-extension precedence remains native/session-relative. |
| OpenCode 1.19.0 | Native plugin config registration; four actual task children | Exact prompt, mapping precedence and parent inheritance; unavailable mapped model errors without a fallback request; native tools retained. | Owned package/loader update and removal, collision/edit guards and atomic runtime registration. Restart required; native config callback errors are logged by OpenCode. |
| Grok Build 1.0.46 | Trusted native marketplace discovery; five actual spawn_subagent children | Mapping precedence, omitted parent model and unknown-model native fallback; trimmed native prompt and ordinary tools | Public install/remove checked on real binary; updates, ownership, rollback and disabled-prior restoration covered by lifecycle regressions. Reversible disable remains unqualified/fail-closed. |
| Pi | **No native agent registration or execution** | Loud stderr warning plus skipped/ignoredComponents reporting, including JSON mode | Agent-only install/preview/repeat leave native files and ledger unchanged. Mixed packages retain hooks; update-to-agent-only retains prior hooks. Unrelated invalid input/state still fails. |
| Claude Code 2.1.285/2.1.296, Codex 0.161.0/0.162.0, ZCode CLI 0.16.9 | Existing baseline preserved by combined regressions, not newly requalified here | Existing documented contracts unchanged | Historical ZCode evidence proves loader/parser/lifecycle, **not live child execution**. See [baseline evidence](portable-agents-20261022.md) and [Codex evidence](codex-native-agents-20261022.md). |
| Cursor, Kimi, Hermes, DCode | Deferred; no new portable-agent support | Exact gaps and owner decisions linked above | Existing adapters unchanged by this feature; upstream legacy ownership fixes remain included. |

## Combined gate

```sh
setpriv --bounding-set=-dac_override,-dac_read_search -- bun test
bun run check
bun run build
```

Bun 1.4.2, Node 22.23.1: **1,357 passed, seven existing opt-in skips, zero failures**,
9,119 assertions across 125 files; tests 285.20 seconds. Typecheck and build passed;
bundle 1,652 KiB. Dropping root DAC overrides allows permission-denial regressions
to exercise their actual failure paths. CI separately qualifies its pinned runtime
and gates publication on the exact main-branch SHA.

## Installed-package native proof

Built and packed with `bun pm pack`, installed the tarball into an isolated
consumer with `bun install --ignore-scripts`, and ran its shipped bundle under
Node. The candidate retains pre-release package version 0.0.31; it is **not** a
claim that registry 0.0.31 contains this feature. Release automation owns the bump.
A scratch launcher symlink points to the installed bundle, not repository source.

- OMP: 41 assertions, nine loopback requests, four native children.
- OpenCode: all 13 checks plus five cleanup checks; 14 requests, four children,
  and the unavailable-model refusal. Container network disabled; loopback only.
- Grok: 51 assertions, 17 requests, five native children and public native removal.
  Plugin/agent discovery, activation link and marketplace registration disappear;
  exact original user model/memory bytes and an unrelated plugin survive.
- Pi: installed Node CLI preview/apply/repeat each exit zero with a loud warning,
  skipped outcome, no claimed delivery, and unchanged native settings/ledger.

| Packed native run | Measured native wall time | Peak RSS, KiB | Requests |
| --- | ---: | ---: | ---: |
| OMP | 3.005 s | 469,928 sampled | 9 |
| OpenCode | 5.458 s | 600,212 child maximum | 14 |
| Grok | 2.183 s | 131,748 sampled | 17 |

These are compatibility fixtures, not quality or performance comparisons. Token
counters are synthetic; real billed model/cache usage is not measured. Zero paid
provider inference. All native runs used isolated homes; live user stores were
not modified. Raw transcripts, generated bytes, requests and resources are retained
under `/root/.local/state/plugnz-native-parity/` on `charles-netcup`, pinned by
[the manifest](native-agent-parity-20261023.json).

## Review fixes and retained failures

Independent reviewers found and rechecked lifecycle/report defects: authorized
OMP pinning and dry-run proof, configured extension collisions, legacy Git
provenance, OpenCode metadata and probe exception propagation, Pi skipped-update
and earlier-failure reporting, and Grok disabled-state rollback. The final gate
includes their regression protections; no held-out benchmark claim.

Failed attempts remain retained: OpenCode container permission setup, injected
OpenCode evidence-write failure (nonzero exit with diagnostics), Grok full-config
comparison (native-owned marketplace stanza legitimately changes), and a packed
Grok fixture broken pipe. The SSE fixture now emits a complete length-framed
response in one write; exceptions still fail qualification, and the packaged
replay passed. Sidecar absence is captured before cleanup, dangling symlinks use
lexists, and user-byte checks exclude only native-owned registration changes.
One pre-final gate passed its tests while a concurrent test edit broke typecheck;
it is not the final green gate above.

## Method decision

API/interface design, codebase design, CodeGraph and local zgrep were used for
scope and source discovery. Reviews and native requests, not copied definitions
or successful launcher exits, supplied acceptance. Skills unchanged; no skill
revision, skill A/B improvement or model-quality claim. Product protections live
in behavior regressions and executable native probes.

## Cursor/Kimi warning-and-skip follow-up

The owner subsequently replaced Cursor/Kimi native-agent delivery with the
same non-failing exclusion policy as Pi
([Cursor #96](https://github.com/archeism/plugnz/issues/96),
[Kimi #97](https://github.com/archeism/plugnz/issues/97)).
The matrix above records the earlier increment; Cursor and Kimi are no longer
deferred under the amended scope. Hermes and DCode remain deferred.

Agent-only packages warn on stderr and report `skipped` with
`ignoredComponents: ["agents"]`, without native or ledger mutation. Mixed
packages retain supported components and omit both agent roots and the portable
agent sidecar. Updates to agent-only sources retain the previous installation.
Malformed source/native declarations and command-global failures still fail.
This is not native agent registration or execution support.

Packed Node CLI smoke exercised both hosts: preview/install/repeat, mixed skill
delivery, update preview/update/sync retention, and malformed-source refusal.
Kimi used its real npm runtime 2.0.1 in an isolated network namespace; Cursor
used its existing directory-managed adapter. Sources and unrelated user bytes
survived. Mixed smoke completed in 15.207 seconds. No paid model inference;
token/cache counters and peak memory were not measured.

Raw candidate evidence remains under
`/root/.local/state/plugnz-native-parity/` on `charles-netcup`:

| Artifact | SHA-256 |
| --- | --- |
| `cursor-kimi-candidate-skip/summary.json` | `75f4415fd7afa911e6677f4b0a1d1d9bd86f35d994b09949ada1e6d641c56663` |
| `cursor-kimi-candidate-mixed/summary.json` | `54e9815cc4a5211d67ffb28f9d40ad1b309700eea418abcb81c2d5eec4f67138` |
| Candidate installed `dist/plugnz.mjs` | `044aceb009b0bb024d12ba9f74a74b1eee83cadba889eb4f99dd1fd79e742dd8` |

That candidate carries pre-release version 0.0.34, not a registry feature
claim. Subsequent validation-only repairs reject canonical Kimi `executables`
and missing native commands directories; final release receipts and published
artifact replay belong to #96/#97.

Independent Sol6.1 reviews found and approved fixes for skipped-scope ledger
writes, recovery/adoption reports, command-global refusals, attempt identities,
native-manifest validation, and native-only Kimi MCP retention. Failed test and
smoke attempts were retained; regressions cover those boundaries. Skills remain
unchanged: no skill-improvement or model-quality claim.
