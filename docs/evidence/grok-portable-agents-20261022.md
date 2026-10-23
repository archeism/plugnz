# Grok Build native portable agents — qualification 2026-10-22

Base: `dedbdc9` plus the Grok slice working tree recorded by
[the hash manifest](grok-portable-agents-20261022.json). Scope: portable-agent
projection into Grok Build's native plugin `agents/` directory, native child
execution through `spawn_subagent`, and the public install/update lifecycle.
No model-quality benchmark, paid provider call, or runtime abstraction.

## Decision context

[The route investigation](https://github.com/archeism/plugnz/issues/93) chose
native plugin-agent registration. [The native fallback
policy](https://github.com/archeism/plugnz/issues/104#issuecomment-6345606404)
resolved as **preserve native policy**: plugnz passes the exact resolved model
and Grok owns availability. [The native-parsing
decision](https://github.com/archeism/plugnz/issues/104#issuecomment-6346091818)
allows disclosed native normalization while generated files keep authored
bytes. This delivery is limited to the exact version actually exercised:
Grok Build `1.0.46 (2765805b9442)` at `/root/.grok/bin/grok`
(sha256 `41626a53292324140b92556b9d42ff5542e3dcd04aff85eafb8689dd4adb44fc`).
The previously proven `1.0.24`/`1.0.41` profiles keep `agents: unverified` and
fail closed for portable agents.

## Projection

`projectGrokSource` in `src/hosts/grok-writer.ts` resolves portable agents with
the shared `planPortableAgents(root, 'grok')` precedence (explicit destination >
user alias > package alias > omitted field), overwrites the staged
`agents/<name>.md` files through the common
`renderPortableAgentMarkdown`, and removes the `plugnz.agents.json` sidecar
from the staged package. **The generated native `name` stays the bare authored
name**: Grok's plugin loader registers plugin agents as `<plugin>:<agent>`
itself, so no adapter-side namespacing is added. A manifest `agents` pointer
other than the default `./agents` spelling is refused as unverified, and a
resolved model whose trimmed value is case-insensitive `inherit` is refused
because Grok treats it as inheritance rather than a concrete model id.
Multiline model IDs are also refused. Both refusals are asserted in
`test/grok-portable-agents.test.ts`.

## Native loader semantics (installed Grok Build 1.0.46)

Verified live on the pinned binary in an isolated `GROK_HOME`:

| Case | Observed native behavior |
| --- | --- |
| marketplace install with `--trust` | plugin agents registered as spawnable `demo:<agent>` subagent types |
| untrusted user-scope `~/.grok/plugins/<name>` copy | counted in `provides.agents` but **not** registered as types |
| `grok inspect --json` | `plugins[].provides.agents` counts agent directories (1 for `agents/`); top-level `agents[]` lists each `demo:<agent>` with `source.type: "plugin"` and the definition path |
| `spawn_subagent` schema with plugin agents present | advertises `subagent_type` with an enum of the `<plugin>:<agent>` names and their authored descriptions; with no registered agents the same binary omits the parameter and says so in prose |
| `spawn_subagent(subagent_type: "demo:reviewer")` | spawns a child from the plugin definition |
| definition `model:` | pins that model id for the child when it is a registered model |
| definition `model:` unknown to config | warns (`Agent definition model references unknown model, falling through to inherit`) and the child request uses the parent model |
| omitted `model:` | child inherits the parent session model |
| `prompt_body` | delivered in the child system prompt with surrounding whitespace trimmed; generated files keep exact bytes |
| child tools | the ordinary native toolset (`run_terminal_command`, `read_file`, `search_replace`, `list_dir`, `grep`, …); no allowlist projected |
| plgnz activation symlink `~/.grok/plugins/demo` | transparent; `demo:<agent>` stays registered through it |

## Actual native child execution

Method: public `plugnz install` into an isolated `HOME`/`GROK_HOME`, then the
pinned `grok` binary headlessly (`-p … --output-format json --always-approve`)
against a loopback OpenAI-compatible fixture. Every model in `config.toml`
(`[model.*]` tables with `base_url` to `127.0.0.1`) is fixture-owned; the
fixture scripts the parent to call `spawn_subagent` once per discovered agent
and captures every raw request. Retained run: `native-run3`
(`native-run1` had two probe-side assertion bugs and `native-run2` lacked the
removal phase; product behavior was correct in both). 51/51 assertions passed.

| Agent | Mapping | Generated `model` | Actual child request model | Prose in child prompt |
| --- | --- | --- | --- | --- |
| `reviewer` | package alias overridden by user alias | `probe-user` | `probe-user` | exact trimmed body |
| `explicit` | explicit destination mapping over alias | `probe-explicit` | `probe-explicit` | exact trimmed body |
| `packaged` | package alias only | `probe-pkg-fast` | `probe-pkg-fast` | exact trimmed body |
| `unspecified` | omitted field | absent | parent `probe-parent` | exact trimmed body |
| `fallback` | explicit mapping to an unregistered id | `probe-missing` | parent `probe-parent` (native inherit fallback, disclosed) | exact trimmed body |

17 loopback requests total: 6 parent turns (5 spawns plus the final turn), 5
child sessions with their own title requests. Every child request carried the
full native toolset and none contained `modelAlias`/`models` metadata. The
parent `spawn_subagent` schema advertised exactly the five `demo:<agent>` types
with their authored descriptions.

## Public remove lifecycle (native retirement)

The durable grok adapter now implements `captureRetirementPreparation` and
`retire` on the same ownership guard as the direct writer
(`removeOwnedGrokInstall`): registry readability, single plgnz-owned install,
marketplace provenance, marker identity, single-plugin marketplace ownership,
an unambiguous marketplace source row, and a guarded activation link. The
native projection admits retire as the recorded representation's removal, and
a dedicated retire profile for 1.0.46 only (`retirement` and
`retention-safety` supported) keeps every other version fail-closed.

Retained run `native-run3` adds the real-binary removal phase after the child
session: public `plugnz remove demo@catalog --target grok --json` exited 0,
and `grok inspect --json` afterwards shows the `demo` plugin and every
`demo:*` agent gone, the `~/.grok/plugins/demo` activation link gone, the
plgnz marketplace directory empty, and the installed-plugins registry row
removed — while an unrelated user-scope plugin directory and an unrelated
`[memory]` config section survive byte-for-byte. The fake-native suite proves
the crash path: a marketplace remove that deactivates the plugin and then
fails leaves a pending recovery whose rollback restores the marketplace
registration, native bytes, registry row, and link before a same-verb retry
completes the retirement. The verified-commit apply also drops its marketplace
backup directory, so failed updates no longer leak stale
`*.plgnz-backup-attempt-*` copies into the store.


## Model policy disclosure

The resolved value is passed through unchanged; the table above shows the exact
values reaching native requests. Grok still owns availability: a mapped model
unknown to its configuration logs a warning and the child falls back to the
parent model (observed live for `fallback`). This follows the owner's resolved
native-policy decision; plugnz adds no bypass and makes no strict-selection
promise beyond exact-value delivery.

## Public lifecycle checks

`test/grok-portable-agents.test.ts` (8 tests) drives the public CLI against a
stateful fake Grok marketplace native:

1. `1.0.46` install projects bare native names, resolves all precedence
   levels byte-exactly, removes the sidecar from the staged package while the
   authored source keeps its bytes, and coexists with an ordinary skill; a dry
   run leaves the store absent.
2. Unchanged re-add, same-version body update (byte-exact generated output),
   alias-only update, source agent rename/removal, and a no-op native update
   that fails readback and restores the prior installed bytes followed by a
   same-verb retry; an unrelated `config.toml` section survives every step.
3. An edited owned native agent payload refuses replacement with the edited
   bytes preserved; a foreign same-name native install is refused before
   mutation.
4. `1.0.41` refuses portable agents (`no verified … portable agent`
   admission) without mutating the store.
5. The `inherit` sentinel model, a custom manifest `agents` pointer, and
   `modelAlias` metadata without the sidecar are explicit failures.
6. Mixed portable-agent/portable-hook packages are refused
   (`unverified for hooks`).
7. Public `remove` of the lifecycle-recorded install retires it natively: the
   registry row, marketplace, and activation link disappear while unrelated
   config stays; direct writer removal of the owned package likewise preserves
   an unrelated foreign native install, its registry row, and user
   configuration; and a marketplace remove that crashes after deactivating the
   plugin rolls the install back (bytes, registration, registry row, link)
   before a same-verb retry completes the retirement. Reversible disable stays
   an explicit failure.

## Reproduction

```sh
# Native qualification (bounded loopback fixture, no paid calls)
python3 test/grok-native-agents-probe.py \
  --evidence /root/.local/state/plugnz-grok-portable-agents-20261022/native-run3 \
  --grok-bin /root/.grok/bin/grok

# Focused public lifecycle suite
bun test test/grok-portable-agents.test.ts

# Adjacent grok/portable regression checkpoint used for this evidence
bun test test/grok-lifecycle.test.ts test/grok-lifecycle-spi.test.ts \
  test/portable-agents.test.ts test/grok-portable-agents.test.ts
```

## Retained evidence and resources

Raw artifacts stay outside Git under
`/root/.local/state/plugnz-grok-portable-agents-20261022/`; hashes are pinned
in [the manifest](grok-portable-agents-20261022.json). Native run resources:
wall 2.18 s; sampled peak native RSS 131,040 KiB; child CPU 0.24 s user /
0.20 s system; evidence tree 1,503,972 bytes; 17 loopback requests; zero live
inference. Token counters are synthetic fixture values, not billed usage.

Adjacent checkpoint: 54/54 grok-lifecycle/grok-lifecycle-spi/portable-agents
tests and 8/8 focused tests passed. `test/grok-native-loader.test.ts` fails on
the clean tree before its Grok leg (its Claude-Code step reports
`claude-code 2.1.285 managed install is unsupported for commands` on this
machine; it needs a separate Claude version proof and stays disclosed), and
the two `add.test.ts` permission failures are chmod-based root DAC-override
artifacts, green under the final gate's
`setpriv --bounding-set=-dac_override,-dac_read_search`; both are outside
Grok scope. The full suite, build, and `bun run check` belong to the
integration checkpoint.

Integration review also found failed retirement re-enabled a previously disabled
plugin. Rollback now captures enablement and restores native enable/disable;
the stateful regression covers disable, mutation-then-failure, disabled rollback
and successful retry (nine focused cases, 63 adjacent cases at that checkpoint).
The final probe records sidecar absence before deleting the fixture and uses
`lexists` to reject dangling activation links. An intermediate `native-run4`
failed an overbroad full-config equality assertion: native marketplace removal
legitimately removes its own TOML stanza. The corrected assertion compares the
exact original user model/memory bytes before and after removal, while still
checking native registration removal. All 51 assertions passed in
`/root/.local/state/plugnz-native-parity/grok-release-proof/`; raw failed attempts
remain retained. The combined release report records the final packaged replay.


## Limitations

- Qualification applies to the exact `grok 1.0.46 (2765805b9442)` binary on the
  marketplace `--trust` route only; `1.0.24`/`1.0.41` (and any other version)
  refuse portable agents.
- Untrusted user-scope `~/.grok/plugins/<name>` copies do not register agent
  types in 1.0.46; the plgnz activation symlink is transparent because the
  marketplace registration owns discovery.
- Native parsing trims the authored body's surrounding whitespace in the
  delivered child prompt; generated files keep exact bytes.
- Native model fallback to the parent model for unknown mapped ids is Grok
  policy, disclosed here, not a plugnz substitution.
- Reversible disable stays unverified and fails closed; the ACP/`grok agent
  stdio` face and `--agents` inline definitions were not exercised.
- No paid model calls; the fixture is deterministic and bounded. Skills are
  unchanged; no model-quality claim.
