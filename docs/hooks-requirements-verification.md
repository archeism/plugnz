# Hook effect requirements: implementation and verification

Scope: the same four portable events and six harness adapters. This increment adds declarative effect requirements, checks them through existing capability admission, and separates installation facts from runtime execution evidence. It does not add harnesses, subagent configuration, tool rewriting, a workflow engine, or automatic native trust.

The branch began from `3f7d5d5ed6f8949c3e905f340e34340b7ba68f8d` (release 0.0.22). See [the authoring contract](hooks.md) and [machine-readable verification receipt](evidence/hook-requirements-20261014.json).

## Changes

- `050cb00`: reject readable/dangling portable-manifest symlinks and nonregular files before reading; preserve existing Pi extension order and exact settings bytes when updating package contents.
- `541836fcfaca32675489324954b73d6fbca3761d`: configuration version 2, per-handler `requires.context` and `requires.continue`, native effect evidence/admission, runtime enforcement, and separate installation verification facts. Version 1 remains strict and backward compatible. Handler stdin remains protocol version 1.
- `0329618719421032a47a40970cf9caf3263491cc`: repair a mixed-install update defect exposed by the packaged CLI test. Writer-only Pi/OpenCode records in a version-2 lifecycle ledger now use the existing conservative name selector and the same version-preserving ledger writer as installation. No ownership check or legacy downgrade guard was removed.
- `a74753af4622d1e40503cfea1ef6bd84d19f590a`: authoring/migration documentation, a public-package smoke helper, and optional real SDK dependency seeding for the offline OpenCode probe. Production files are identical to the preceding tested commit.

## Contract checks

Version 2 declares capabilities a handler may use, not a requirement to emit nonempty feedback every time. Omitted/false requirements mean no corresponding effect; returning `{}` is valid. Stop feedback requires context and continuation together. Invalid combinations and undeclared runtime effects are rejected per handler, without borrowing declarations from siblings.

The existing capability profile compares each requirement to native version-specific effect evidence. Explicit absence is unsupported; missing evidence is unverified. The compiler uses the same comparison. OpenCode Stop feedback is refused before that target is activated, while checks-only Stop remains supported. Refused updates preserve prior native bytes and ledger state; mixed-target reports retain independent successes and failures.

Install/add reports have an optional schema-v1 `verification` envelope with operation-linked compatibility, registration, execution-approval, and delivery fields. Successful installation/readback can verify registration. It does not verify hook execution approval or delivery, so those are reported as `not-checked` and `not-observed`. The strict parser rejects fabricated facts or inconsistent/duplicate/missing rows. Older reports without the envelope remain valid; strict external consumers need an updated parser for the additive field. Legacy JSON output is unchanged.

## Repository and packaged verification

The complete immutable production source `0329618719421032a47a40970cf9caf3263491cc` passed **1,142 tests, six existing skips, zero failures, and 7,893 assertions** across 104 files. Type checking, the Node-target build, and standalone hook execution under plain Node 22 also passed. The suite ran as UID 65534, without capabilities, in a fresh home with Bun 1.4.3 and Node 22.23.1. Its temporary workspace was removed. The receipt binds source archives, logs, and emitted bundles by SHA256.

Generated command-wrapper tests for Claude Code, Codex, and ZCode, and callback tests for Pi, OMP, and OpenCode, run for both configuration versions. Plain-Node smoke compiles all six targets for both versions, removes the authored source, and executes the emitted runtime with an empty PATH and no Bun dependency.

The regression tests failed before their corresponding repairs: manifest/read/build checks, Pi registration-order updates, new effect declarations, and mixed-ledger updates. The integrated effects/callback/install suite passed 179 tests before the additional mixed-ledger cases; the final complete suite includes those cases.

The actual candidate npm tarball passed **24 checks** through offline `npx` in a fresh UID-1000 Docker container with the real installed Claude Code, Codex, OMP, Pi and OpenCode CLIs. This covers default-source/default-target version-2 installation, dry-run facts, actual registration facts, source preservation, Pi update order and exact bytes, mixed Codex success/OpenCode required-Stop refusal, preservation of the prior OpenCode package, no handler execution during installation, and compiler manifest-symlink refusal. The candidate retains package version 0.0.22; it is not a second public 0.0.22 publication. The release workflow owns the next patch number.

Native `--version` calls are not filesystem-pure: Codex creates temporary launch helpers and OpenCode creates empty configuration/data directories. A separate native probe established that behavior. The corrected dry-run check verifies no active registration/configuration was created, rather than asserting that no directory could appear. The first failed smoke receipt remains retained.

## Native receiving-boundary verification

These are fresh Docker runs of actual native runtimes and generated adapters, using **scripted localhost model-protocol responses**, not paid model inference. Each context marker is generated by a real handler, and receiving requests are inspected independently of final answer text.

| Native runtime | Newly exercised cases | Actual local model requests | Result |
| --- | --- | ---: | --- |
| Pi 1.1.0 | No-hook baseline, version-2 start/tool/Stop feedback, structured-result preservation | 8 | Passed |
| OMP 18.8.7 | No-hook baseline, version-2 start/tool/Stop feedback | 5 | Passed |
| OpenCode 1.19.0 | Two distinct sessions in one server; startup isolation, tool context and asynchronous Stop checks | 4 | Passed with official SDK dependencies provisioned |

Pi and OMP invoke one feedback continuation and then settle. Pi retains original content and structured output. OpenCode supplies context independently to both sessions, preserves the native tool result and runs checks at idle without claiming synchronous Stop continuation. All owned process groups, listeners and containers were removed.

Pi/OMP evidence binds to `541836f`; the later writer-ledger fix did not change their runtime or adapters. OpenCode's seeded probe binds to `a74753a`, whose production modules match the final tested source. This increment does **not** claim new full native-model runs for Claude Code, Codex or ZCode: their emitted real-command wrapper contracts were rerun, and earlier native/real-Gemini receipts remain separately version-bound in [live verification](hooks-live-verification.md).

### OpenCode bootstrap qualification

The first two fresh OpenCode attempts reached health/version reporting but timed out creating the first session; neither produced model traffic. These failed attempts are retained. The native source starts an `@opencode-ai/plugin` SDK dependency install while loading configuration and waits for dependency work before loading plugins. See the pinned [configuration implementation](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/config/config.ts) and [native npm service](https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/core/src/npm.ts).

For the passing offline run, the exact official `@opencode-ai/plugin@1.19.0` dependencies were installed into an isolated seed with npm and scripts disabled, then copied into the fresh native configuration directory. The lock hash and SDK version are recorded. No credentials, sessions, approvals or fabricated results were seeded, and no native runtime code was patched. The roughly 63 MiB dependency footprint is setup data; runtime evidence grew about 2.2 MiB under the existing 64 MiB growth bound. The passing request assertions were unchanged.

## Reproduction and boundaries

Use the existing native probe commands and the new `test/cleanroom/effects-smoke.py` described in the [cleanroom guide](../test/cleanroom/README.md). Full raw traces and failed attempts remain on the owner's remote machine; the repository receipt includes summaries and hashes rather than native prompt dumps.

No paid inference requests, user credential changes, blanket hook approvals, or personal-profile rollout were performed. New declarations do not guarantee fail-closed native behavior when a handler itself fails, nor do they change message priority, pre-tool reconsideration timing, tool coverage, or child-agent propagation. Those remain the existing adapter qualifications.
