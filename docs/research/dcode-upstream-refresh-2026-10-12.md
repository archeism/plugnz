---
id: dcode-upstream-refresh-2026-10-12
type: research
summary: Released dcode remains 0.1.83; no new native capability changes unblock the remaining human-owned upstream lane.
author:
  harness: codex
  model_family: unknown
keywords: [dcode, deepagents-code, capabilities, invocation-policy, native-update]
---

# dcode upstream refresh, 2026-10-12

## Verdict and scope

**Unchanged since the previous 0.1.83 investigation.** The latest released
`deepagents-code` is still **0.1.83**, with the same source revision
`caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b`. Upstream `main` is six commits ahead,
but the compare API reports **no changed files under `libs/code/`**. Therefore
this refresh supplies no release or unreleased Code change that justifies
removing existing commands, agents, invocation-policy, or native-update gaps.
It does not execute dcode, install dependencies, change the real 0.1.56
installation, or establish a new runtime capability profile. The existing
isolated 0.1.83 evidence remains separate from this source-only refresh.
[PyPI metadata](https://pypi.org/pypi/deepagents-code/json),
[release tag](https://github.com/langchain-ai/deepagents/tree/deepagents-code%3D%3D0.1.83),
[pinned comparison](https://github.com/langchain-ai/deepagents/compare/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b...4bb4c7fcbf5f2ef65c39ea0134c42555926bd40b).

## Frozen inputs and evidence confidence

| Input | Observed value |
| --- | --- |
| plugnz documentation base | `1427cc207d69e4e6c5cd680bebb08bbf2e441057` (`0.0.12`) |
| latest Code release | `0.1.83`, PyPI uploaded `2026-10-07T21:55:42.076434Z` |
| release source | `caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b` |
| upstream main checked | `4bb4c7fcbf5f2ef65c39ea0134c42555926bd40b` |
| Code wheel SHA-256 | `e6fafb872b706260f2076c96fa8d66649cf9cc42ea87b41769676167988f1893` |
| SDK dependency in Code wheel metadata | exact `deepagents==0.7.23` |
| SDK wheel SHA-256 | `ccba4ca32e82f422e08c04b2321d135f1be321fc44ae5891b9b37a7c8bde5ca7` |

Both wheels were downloaded as inert archives from PyPI and their SHA-256
digests matched first-party metadata. Source excerpts were inspected directly
with `unzip -p`, not imported or executed. These are **release/source proofs**,
not Sandbox runtime verification. No newer Code release appeared in PyPI;
the SDK wheel was checked because Code pins it, not because newer arbitrary
SDK behavior can stand in for the released CLI.
[Code release metadata](https://pypi.org/pypi/deepagents-code/0.1.83/json),
[SDK release metadata](https://pypi.org/pypi/deepagents/0.7.23/json),
[Code dependency declaration](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/pyproject.toml).

## Released semantic coverage

| Required behavior | Released 0.1.83 evidence | Consequence |
| --- | --- | --- |
| Plugin commands | `manifest.py` explicitly lists `commands` as an unsupported component directory | No native command projection claim |
| Plugin agents | Same list explicitly includes `agents` | No native agent delivery claim |
| `disable-model-invocation` | SDK skill parser does not extract it; plugin middleware namespaces loaded metadata without implementing this policy | Manual-only skills cannot be declared delivered by preserving frontmatter |
| `user-invocable` | SDK metadata/parser has no independent user-invocation field; CLI skill loader uses that parser | No independent user-invocation restriction claim |
| Equivalent sidecar policy | Relevant CLI/SDK loading path has no demonstrated Codex `agents/openai.yaml` policy integration | Sidecar preservation alone is not enforcement |

The SDK parser extracts name, description, path, metadata, license,
compatibility, and experimental allowed-tools. Those fields are not substitutes
for either invocation policy. Code's plugin adapter loads namespaced skills
through that SDK parser, then merges the resulting metadata. Separately, Code
exposes explicit skill invocation; that feature alone does not suppress model
discovery. This preserves the distinction between disabling automatic model
invocation and disabling user invocation rather than collapsing them into one
manual-skill flag.
[Code manifest](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/manifest.py),
[Code plugin skill middleware](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/adapters/skills_middleware.py),
[SDK skill parser](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/deepagents/deepagents/middleware/skills.py),
[CLI skill invocation](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/skills/invocation.py).

Experimental Python extensions can add custom machinery, but official docs
require `DEEPAGENTS_CODE_EXPERIMENTAL=1` and restarting the agent graph. They
are **not stable native parity** for commands, agents, or invocation policies.
No experimental mechanism is used to clear a delivery gap in this report.
[Official plugin documentation](https://docs.langchain.com/oss/deepagents/code/plugins#add-python-extensions).

## Native update contract remains incomplete

- The public parser has `install`, `uninstall`, `enable`, `disable`, and
  marketplace `list`, `add`, `remove`. It still has **no public `update` or
  `upgrade` command**, and install takes neither a revision nor a force option.
  Successful install loads a cached instance and reports that `/reload` is
  needed; list JSON exposes id/description/enabled, not a content digest.
  [CLI parser and execution](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/commands_cli.py),
  [install/readback](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/discovery.py).
- An existing nonempty **versioned** cache is validated and reused, rather
  than refreshed from changed source bytes. Unversioned installs are copied
  again. The synchronous install/load path is useful evidence, but does not
  provide exact desired-byte acknowledgement or repair same-version drift.
  [Cache implementation](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/store.py).
- Remote refs still use shallow `git clone --branch <ref>`; the model explicitly
  says commit-SHA checkout is outside that flow. A branch/tag can move and
  does not prove consumption of plugnz's immutable preflighted revision.
  [Source model](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/models.py),
  [clone implementation](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/marketplace.py).
- Auto-update remains an asynchronous worker, enabled-plugin and
  manifest-opt-in only, skipping unversioned plugins and unchanged declared
  versions. Official docs say it starts after the first prompt and needs
  `/reload` to change an active session. That is not a synchronous exact-package
  force-update contract. [Worker](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/app.py),
  [auto-update implementation](https://github.com/langchain-ai/deepagents/blob/caaa7e7c12d214afa5cf0a1afed8eb6232aa6f7b/libs/code/deepagents_code/plugins/discovery.py),
  [official auto-update documentation](https://docs.langchain.com/oss/deepagents/code/plugins#automatically-update-plugins).

## Documentation discrepancy and human ownership

The official Code plugin docs list only supported administration commands.
However, `langchain-plugins` README at
`29a7cebc797eb099cbd9c311cbd927289c656e96` still recommends
`dcode plugin marketplace update langchain-plugins`, absent from the released
parser. Existing [issue #9](https://github.com/langchain-ai/langchain-plugins/issues/9)
remains **open**. Existing [PR #10](https://github.com/langchain-ai/langchain-plugins/pull/10)
remains **closed, unmerged** (closed 2026-10-09). Neither is newly filed, resolved,
or shipped by this refresh.
[Pinned incorrect README](https://github.com/langchain-ai/langchain-plugins/blob/29a7cebc797eb099cbd9c311cbd927289c656e96/README.md#updating),
[official supported commands](https://docs.langchain.com/oss/deepagents/code/plugins#manage-plugins-from-the-command-line).

**H11 remains human-owned upstream follow-up afterward.** Agents should not
file, duplicate, comment on, or reopen upstream issues/PRs to finish the internal
lane. No newly introduced version needs profiling here: Code source and release
are unchanged. The real 0.1.56 installation remains untouched and is not made
compatible by documentation or latest-source inspection. Any future release
changing these semantics needs its own exact-version source review and isolated
Sandbox runtime proof before internal capability admission.

Related existing records:
[original session findings](dcode-session-findings-2026-10-09.md),
[native update investigation](native-plugin-update-capabilities-2026-10-09.md),
[host capability boundary](../hosts/dcode.md).
