---
id: dcode-current-native-audit-2026-10-12
type: research
summary: Code remains 0.1.83; newer main improves skill trust and reload but does not supply the missing component, invocation-policy, or exact-update contracts.
author:
  harness: codex
  model_family: gpt-6-astra
keywords: [dcode, deepagents-code, invocation-policy, native-update, auto-update]
---

# Current dcode Native capability audit

Checked **2026-10-12, 08:16–08:25 UTC**, using official PyPI metadata,
release archives, GitHub APIs, pinned source and official documentation only.
Documentation base: plugnz release `890e03b169a301f256223a19abd340d03485f845`
(`0.0.14`). No dcode/Python/LLM execution, package installation, upgrade,
Sandbox allocation, real installation write, or upstream issue/PR/comment.

## Outcome

There is **no newer stable Code release to clear the remaining gaps**. However,
the earlier [refresh](dcode-upstream-refresh-2026-10-12.md) is now historical:
its observation that main had no Code changes is superseded. Main now changes
explicit skill invocation and catalog refresh. These improvements do not
implement plugin commands/agents, either requested invocation-policy control,
or a synchronous exact-content update contract. Unsupported desired packages
remain in scope and visibly unsupported; skipping their components or entire
pairs is not delivery. No new capability profile is admitted by this audit.

## Exact inputs, including the SDK boundary

| Input | Fresh authoritative result |
| --- | --- |
| Latest `deepagents-code` on PyPI | `0.1.83`; wheel uploaded `2026-10-07T21:55:42.076434Z` |
| Code release tag | `deepagents-code==0.1.83` → `caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b` |
| Official main inspected | `40fbf9d85b0c3554120bb10ab59db424d34c78d4`, dated `2026-10-12T06:17:56Z`; 18 commits ahead of Code release |
| Actual Code wheel dependency | **`deepagents==0.7.23`**, exact, not a floating SDK range |
| Latest SDK on PyPI | `deepagents==0.7.24`; release tag → `838433b4dcd9efa0bacba67d07e61440b43c4459` |
| Official marketplace repository | `langchain-ai/langchain-plugins` at `29a7cebc797eb099cbd9c311cbd927289c656e96` |

Sources: [Code metadata](https://pypi.org/pypi/deepagents-code/json),
[Code tag API](https://api.github.com/repos/langchain-ai/deepagents/git/ref/tags/deepagents-code%3D%3D0.1.83),
[pinned comparison](https://github.com/langchain-ai/deepagents/compare/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b...40fbf9d85b0c3554120bb10ab59db424d34c78d4),
[SDK metadata](https://pypi.org/pypi/deepagents/json),
[SDK tag API](https://api.github.com/repos/langchain-ai/deepagents/git/ref/tags/deepagents%3D%3D0.7.24).

Code's released plugin middleware imports the SDK skill module, calls its
metadata parser, and subclasses `SkillsMiddleware`. Inspection therefore
followed the **actual pinned SDK wheel**, not just Code's version string.
The `deepagents/middleware/skills.py` bytes are identical in SDK 0.7.23,
SDK 0.7.24 and the inspected main source (hash below). New SDK publication
does not silently replace the exact Code dependency, and even an explicitly
changed dependency would not add the missing flags in this file.
[Released caller](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/adapters/skills_middleware.py),
[SDK parser/catalog](https://github.com/langchain-ai/deepagents/blob/838433b4dcd9efa0bacba67d07e61440b43c4459/libs/deepagents/deepagents/middleware/skills.py).

Other Code dependencies do have ranges, including `langchain>=1.4.3,<2.0.0`
and LangGraph packages. This audit **does not assert whole-runtime or resolved
environment identity**. The narrower result is that the inspected policy
loading/catalog path neither parses nor enforces these declarations. Fresh
resolved-environment runtime proof remains necessary before admission.

An official-source inconsistency is retained, not guessed away: commit
`fe4eeab6f5babf601d9e7ab7fb9cdf558cb1df77` has a patch changing the SDK pin to
0.7.24, but both raw and contents-API reads of `libs/code/pyproject.toml` at
the inspected main SHA returned 0.7.23; the full compare patch also retains
0.7.23. No conclusion depends on a presumed main SDK pin. Released wheel
metadata is unambiguous, and both SDK wheel skill implementations were checked.
[Commit API](https://api.github.com/repos/langchain-ai/deepagents/commits/fe4eeab6f5babf601d9e7ab7fb9cdf558cb1df77),
[pinned contents API](https://api.github.com/repos/langchain-ai/deepagents/contents/libs/code/pyproject.toml?ref=40fbf9d85b0c3554120bb10ab59db424d34c78d4).

## Capability findings

| Requirement | Released 0.1.83 and inspected main | Consequence |
| --- | --- | --- |
| Plugin `commands/` | Manifest explicitly inventories it as unsupported | Explicit skill invocation is not command argument/preprocessing/permission parity |
| Plugin `agents/` | Same unsupported-directory inventory | SDK subagent functionality is not a loader for plugin agent declarations |
| `disable-model-invocation` / manual-only equivalent | SDK metadata/parser does not extract the flag; catalog emits discovered skill metadata without this filter | Preserving frontmatter or offering `/skill:` does not prevent model discovery/invocation |
| `user-invocable` / model-only equivalent | No independent user-invocation field or check in the inspected parser and explicit selection path | No demonstrated user-invocation restriction |
| Codex sidecar equivalent | No integration of `agents/openai.yaml` invocation policy in this loading path | Copying the sidecar is not enforcement |
| Skill permission/preprocessing equivalence | `allowed-tools` is parsed and displayed; SDK tool-resolution APIs are separate machinery | Neither parsed metadata nor extension hooks establish the required permission/preprocessing semantics |

The manifest, models, discovery, store and plugin CLI files are each
byte-identical between the released Code wheel and inspected main. The SDK
parser returns name, description, path, metadata, license, compatibility and
allowed-tools; it does not return either invocation-policy field.
`_format_skills_list` lists discovered skills, while main's explicit pin path
checks selection, readability and trust rather than those policy flags.
[Main manifest](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/manifest.py#L26-L35),
[SDK parser](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/deepagents/deepagents/middleware/skills.py#L467-L560),
[SDK catalog](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/deepagents/deepagents/middleware/skills.py#L1100-L1117),
[main pin checks](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/adapters/skills_middleware.py#L512-L543).

### What actually changed on unreleased main

- `03fa53ff68745610e2da15e30051c5e639047f88` moves explicitly selected skill
  resolution and trust checking server-side before the model runs. It fails
  missing/unreadable selections and enforces trust for the selected roots.
  This is loading/trust protection, not manual-only or model-only policy.
- `d9594dae242546fcb7c1c9d23d1a731bf2a0ca20` refreshes the agent skill catalog
  after `/reload`, with process-aware metadata and forked-subagent propagation.
  It does not introduce a plugin marketplace update command.

Sources: [server-side invocation change](https://github.com/langchain-ai/deepagents/commit/03fa53ff68745610e2da15e30051c5e639047f88),
[reload change](https://github.com/langchain-ai/deepagents/commit/d9594dae242546fcb7c1c9d23d1a731bf2a0ca20).
These are **unreleased Code source**, not tested Native behavior here.

### Experimental mechanisms are not delivered equivalents

Official Python extensions require `DEEPAGENTS_CODE_EXPERIMENTAL=1`; their API
can change or disappear. They register tools, middleware, backend routes and
shutdown hooks. Custom middleware might implement a missing policy, but that
is a **new implementation hypothesis**, not a supported plugin command/agent
loader or verified semantic translation. Plugin Python-extension changes
require restarting the agent graph. Do not enable experimental execution as a
silent fix. [Official extension documentation](https://docs.langchain.com/oss/deepagents/code/extensions),
[plugin activation documentation](https://docs.langchain.com/oss/deepagents/code/plugins).

## Marketplace, update and opt-out ownership

The actual CLI supports plugin list/install/uninstall/enable/disable and
marketplace list/add/remove. It has no plugin or marketplace update/upgrade
subcommand, and install has no revision/force option. Yet the official
marketplace README still recommends `dcode plugin marketplace update
langchain-plugins`. This documentation/parser discrepancy remains; no issue
status or upstream fix is inferred from this refresh.
[Pinned CLI](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/commands_cli.py#L50-L98),
[pinned marketplace README](https://github.com/langchain-ai/langchain-plugins/blob/29a7cebc797eb099cbd9c311cbd927289c656e96/README.md#staying-current).

Versioned install reuses a nonempty cache for that version after validation;
it does not force fresh bytes for same-version source drift. Auto-update is a
separate asynchronous, version-change-only path; official docs place it after
the first prompt and require reload for an active session. List JSON supplies
id/description/enabled, not exact content acknowledgement. These are real
capabilities, but not a synchronous immutable-source/exact-byte update proof.
[Cache reuse](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/store.py#L489-L527),
[auto-update implementation](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/discovery.py#L338-L459),
[official auto-update documentation](https://docs.langchain.com/oss/deepagents/code/plugins#automatically-update-plugins).

The important opt-out distinction:

1. **Source-author per-plugin opt-in exists.** Namespaced
   `com.langchain.deepagents.code.autoUpdate` must be literal `true`; omission
   or false leaves the manifest version intact and does not opt in.
2. **A local installed-plugin, version-preserving veto was not found.** The
   updater refreshes the remote marketplace, materializes that plugin's source,
   and reads **that freshly fetched manifest**, not the installed cache's
   `autoUpdate`. Editing only the installed projection cannot veto a later
   upstream opt-in. Install records contain path/version, not a local opt-out.
3. Global configuration/environment disablement or offline mode stops the
   worker for all plugins. Disabled plugins, unversioned registry entries and
   local marketplaces are skipped. These are not equivalent to leaving one
   enabled remote-source plugin's native version and source binding intact
   while independently opting it out. Changing source to a local proxy or
   stripping registry version would change the contract, not prove this API.

Sources: [manifest flag](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/manifest.py#L300-L334),
[update order](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/discovery.py#L350-L444),
[installed record](https://github.com/langchain-ai/deepagents/blob/40fbf9d85b0c3554120bb10ab59db424d34c78d4/libs/code/deepagents_code/plugins/models.py#L212-L223).

## Preserved evidence and verification limits

Raw acquisition directory:
`~/.local/state/plugnz-evidence/20261012/dcode-current-native-audit/`.
Wheels were downloaded as inert archives, SHA-256 checked against PyPI, then
read with `unzip -p`; none was installed or imported. GitHub reads used `gh api`
and HTTPS raw URLs. Source comparisons used `sha256sum`, not executed fixtures.

| Artifact | SHA-256 |
| --- | --- |
| Code 0.1.83 wheel | `e6fafb872b706260f2076c96fa8d66649cf9cc42ea87b41769676167988f1893` |
| SDK 0.7.23 wheel | `ccba4ca32e82f422e08c04b2321d135f1be321fc44ae5891b9b37a7c8bde5ca7` |
| SDK 0.7.24 wheel | `ed67a550dc261c084e19b499733f98fc280d0d6b873881b5d639330d8e3c6688` |
| SDK skills.py, both wheels and main | `f3cc2139f2b77bd599bf99df032efe27774462b2ecc80f6e58b7ea7edd2d7895` |
| Saved current Code PyPI JSON | `7e06a6f23915971df0be6eb65e17c8f869b6bf72dba6cc52cb4d9c5bc1f3765e` |
| Saved release-to-main comparison JSON | `3a73bd15e9e485a250a75852b36c61b1b1501b5df71ddaf071900a348d7698f9` |

Historical runtime evidence and the real 0.1.56 installation are untouched.
No fresh Native experiment was authorized or performed. H11/U00 are **not
cleared** by a release bump, doc claim, extension hypothesis, or package
omission. Existing human ownership of upstream follow-up remains unchanged;
this research does not file or authorize it. Any eventual implementation or
new admitted runtime requires its own full semantic and lifecycle proof.
Skills were used to separate API ownership, source evidence and runtime
claims; no skill revision was made or claimed.
