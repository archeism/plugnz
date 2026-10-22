# Portable agent qualification — 2026-10-22

Base: `871352c5836a82d6f43988b43a7274a43c9f9f4e` (plugnz 0.0.29).
Scope: portable agent authoring, shared model aliases and native Claude/ZCode
projection. No model-quality benchmark or runtime orchestration changes.

## Acceptance

- Direct destination mapping wins over shared aliases.
- User alias entry wins over the package entry for that target only.
- Unmapped model is absent, with no guessed mapping or synthetic `inherit`.
- Native tools remain available; instructions retain their prose.
- Alias-only changes update the installed artifact; captured snapshots remain immutable.
- Unsupported targets refuse portable agents instead of installing prompt resources.

## Native checks

Claude Code **2.1.285**: public `node dist/plugnz.mjs install` into an isolated
`HOME=OPEN_PLUGIN_HOME`, followed by native registry discovery without `--plugin-dir`.
A local Anthropic-compatible fixture instructed the parent to call the real native
`Agent` tool. The call did not override the child's model. All three children
received the correct model/instructions and returned results to the parent.

| Definition | Captured native child model |
| --- | --- |
| `fast` alias → `haiku` | `claude-haiku-4-5-20251001` |
| explicit `sonnet`, overriding alias | `claude-sonnet-4-6` |
| omitted mapping | parent/native default `claude-opus-5-5` |

Bash, Read, Edit and Write remained present in all three child tool lists.
**31 assertions passed**, nine loopback requests, zero upstream model calls.
Native fixture runtime: 2.14 seconds; child CPU 2.03 seconds; peak child RSS
237,212 KiB; allocated evidence 1,449,984 bytes. Provider token counters are
synthetic fixture values, not actual billed model usage or quality evidence.
Claude 2.1.296 additionally has existing native loader evidence in
`claude-code-2.1.296-agents-20261013.json` and the public lifecycle regression test;
this qualification did not execute a 2.1.296 child.

ZCode CLI **0.16.9**, upstream source
`aac4755666d09fdcd70272fcf063c077a639015f`: real isolated install, reinstall,
alias-only update, invalid update preserving active bytes, corrected retry and
removal passed. Its actual upstream discovery and runtime parser confirmed three
agents, explicit/alias/omitted selections, prose and absent tool restrictions.
This proves native registration and model parsing; **live ZCode child execution
was not tested**. Zero model calls. Whole lifecycle timing and CPU were not measured.

Independent review found two native parser defects before release: whitespace
before a `$` reasoning suffix could silently inherit, and generic JSON quoting
corrupted quoted/backslash-containing ZCode metadata. Both received regression
tests and actual upstream parser checks. The final six-case scalar check covers
quoted descriptions, Windows-style paths, multiline descriptions, quoted model
IDs, and explicit refusal of unrepresentable input. ZCode discovery displays the
newline escape while the runtime decodes it; this limitation is documented.

## Reproduction and retained evidence

Raw evidence remains outside Git under
`/root/.local/state/plugnz-portable-agents-20261022/` on `charles-netcup`:

- `claude/installed-20261022-150249/`: install receipt, native trajectories,
  requests, report, assertions and SHA-256 manifest.
- `claude/qualify-installed.py` and `claude/check-installed.py`: isolated fixture
  runner and independent assertions. Earlier direct-plugin and failed `--bare`
  attempts are preserved separately.
- `zcode/attempt-145707/`: native lifecycle receipts, parser proof, terminal result.
  The earlier assertion expecting component details from `plugins list` is retained;
  ZCode does not expose those details there, so actual discovery/parser evidence
  supplies that check.
- `zcode/reasoning-suffix-native-proof.jsonl` and
  `zcode/scalar-roundtrip-proof.json`: native regression checks.
- `tests.log`, `tests-final.log`: full regression runs.

The portable unit/public lifecycle tests run with `bun test`; typecheck with
`bun run check`. Linux root permission tests require removing DAC override:

```sh
setpriv --bounding-set=-dac_override,-dac_read_search -- bun test
```

Final regression result: **1,269 passed, seven existing skips, zero failures**;
8,339 assertions across 117 files in 181.56 seconds. `bun run check` and
`bun run build` passed. These timings describe this verification run, not a
performance comparison. [The small hash manifest](portable-agents-20261022.json)
pins source and retained evidence without committing raw transcripts.

Native qualification requires the pinned installed harnesses and their source;
ordinary CI does not silently claim native execution by substituting mocks.

## Review and method

Implementation was split across the core resolver, immutable source capture and
native adapters. A separate GPT-6 Astra reviewer inspected the combined change
and reproduced the native quoting defect independently. Review fixes extend the
regression floor; they are not a held-out benchmark score.
The reviewer accepted the fix after independently checking 12 native parser cases
and 27 focused tests, with no further code defects found.

The cleaned Trajectories view was used for historical user requirements and the
implementation subagent `codex:01a163a7-0284-7e50-8ef9-2fa9da0adffc`. Search coverage
was explicitly degraded for 10 of 16 sources, not exhaustive. The useful lesson
was to verify generated metadata with native parsers, not just a general YAML
parser; that protection lives in the product tests and native evidence.

Skills unchanged; no skill-improvement or model-quality claim:

- `addy:api-and-interface-design` 0.1.0:
  `5dafd0c44a3aabf11cae5bcb34f6fcc24dfa5c01ba6e0d3176bce997f4d68bc8`.
- `mattpocock:codebase-design` 1.3.1:
  `2c20617f87ec8af6a434859f381b2f061a69b530444e74eb39e78bb016a6d1e2`.
