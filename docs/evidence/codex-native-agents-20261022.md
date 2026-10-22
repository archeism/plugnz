# Codex native agent qualification — 2026-10-22

Base: `5d57841158f264b639b5d67ffd4969e89828d67d` (plugnz 0.0.30).
Scope: convert canonical agent Markdown into Codex TOML, register native roles,
preserve model precedence and safe install/update/removal. This is integration
qualification, not a model-quality benchmark.

## Native contract

Codex source `83086188ae0614bd882818ff1aa23f3194962012` supplies the contract:
`codex-rs/agent-roles/src/loader.rs`, `agent_role_config.rs`,
`codex-rs/core/src/agent/role.rs`, and `core-plugins/src/manifest.rs`.
The plugin manifest does not register agent TOML files itself. The adapter uses
explicit `[agents."plugin:agent"]` / `config_file` references to generated files
inside the owned plugin cache. File `name` and config key must agree. Missing
`model` inherits the parent. Instructions use `developer_instructions`.

Canonical source is Markdown. Native TOML source packages and arbitrary native
agent settings are outside this conversion contract. The generated role leaves
tools, permissions and effort to Codex. Native plugin disable does not unregister
these global role references; `plugnz remove` does. Native delegation policy and
feature flags remain user/harness settings. Reload is required after changes.

## Actual public installation and execution

Public `plugnz install /root/personal/plugins/addy --target codex` into isolated
homes passed on actual **Codex 0.161.0 and 0.162.0**. Both loaded all four roles:
`addy:code-reviewer`, `addy:security-auditor`, `addy:test-engineer`, and
`addy:web-performance-auditor`. An actual child received the exact code-reviewer
body and inherited its parent model. Its native tool-name set matched an
unrestricted hand-authored native-role baseline on each version.

The source is Personal's packaged Addy, whose four agent files match
`addyosmani/agent-skills` at `dc27a9c2e13721158157632de61b4106c6c2a2a1`.
No sidecar or source changes were needed.

| Probe | Native child model / result |
| --- | --- |
| User `fast` alias overriding plugin alias | `gpt-6.1-sol` |
| Agent-specific model overriding alias | `gpt-6-sol` |
| No mapping | Parent `gpt-5.3-codex` |
| Alias-only public update | Only alias-selected output changes |
| Remove mapped test plugin | Its refs removed; four Addy roles preserved |
| Remove Addy | All four Addy refs removed |

These model/lifecycle checks used 0.162.0. The public Addy execution took 2.44s
on 0.161 and 3.43s on 0.162. Across public native qualification: **13 localhost
Responses requests, zero paid requests**. Fixtures choose tool calls deterministically;
provider token counters are synthetic, not measured inference usage. Model quality
and total CPU/RSS were not measured. Actual native dispatch, child instructions,
models and tool schemas were captured. No live user configuration was modified.

The default installed 0.161 binary was untouched. Isolated 0.162 release binary
SHA-256: `8daf67f6261161aa5939d8d42a516032d760406216779d7ce6040f242140ff73`.
The public-probe CLI bundle hash is in each report; subsequent changes add route
preservation guards and documentation, without changing the native serialization.

## Regression and independent review

Projection/config tests cover exact prose, omission, unsafe input, name collisions,
TOML parsing and preservation of unrelated config. Public lifecycle tests cover
both versions, bare agent packages, alias/version updates, rename/removal of all
agents, edited-ref refusal, missing-ref repair and forced update/removal rollback.
Rollback also preserves unrelated config edits and the actual prior absence of a
missing reference.

Independent GPT-6 Astra review reproduced a native marketplace refresh that could
delete generated TOML while leaving global refs. The fix forces managed updates
when any affected installed package contains generated roles, including when the
new requested source removes all its agents. Requested-package and sibling
regressions now protect this boundary. Review found no remaining blocker.

**Full suite: 1,307 passed, seven existing skips, zero failures; 8,593 assertions
across 120 files in 209.77s. Typecheck and build passed.**
[The companion manifest](codex-native-agents-20261022.json) pins results and hashes.
The root permission-test invocation removes DAC bypass, with disk-backed scratch:

```sh
TMPDIR=/root/.local/state/plugnz-codex-agents-20261022/test-tmp \
  nice -n 19 setpriv --bounding-set=-dac_override,-dac_read_search -- bun test
bun run check
bun run build
```

## Retained evidence and method

Raw evidence lives on `charles-netcup` under
`/root/.local/state/plugnz-codex-agents-20261022/`:

- `public-161-01/report.json` and `public-162-01/report.json`: installed Addy proof.
- `public-162-01/models-report.json`: native model and public update/removal proof.
- `qualify-public.py`, `qualify-public-models.py`: local-provider reproducers.
- `native-config-{spawn,model}-*/`: earlier native registration probes.
- `review-sibling.test.ts`: independently reproduced pre-fix refresh defect.
- `tests-final.log`: complete regression output.

Raw native homes and the isolated binary occupy approximately 446 MiB before
full-suite logs/scratch. No full store copies or paid runs were made. The original
400 MiB estimate was exceeded by native SQLite/WAL growth; further native home
creation stopped. Evidence remains retained rather than silently deleted.
The small companion manifest pins reports and current implementation files.

Historical requirements and preceding implementation trajectories were read in the
portable-agent increment; this increment inspected bounded native execution traces
and independent review evidence. Its concrete miss was treating native refresh as
safe based only on the incoming source; the fix considers existing affected roles.
Skills remain unchanged. No skill-improvement or model-quality claim is made.
