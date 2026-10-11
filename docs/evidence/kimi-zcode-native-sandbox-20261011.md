# Kimi / official-source ZCode Sandbox attempt 01

This is partial component evidence, **not final combined Native Git admission**.
Sandbox `plugnz-kimi-zcode-native-20261011` expired after its 30-minute lifetime.
At 22:44 UTC, execution returned HTTP 400, `Cannot resume sandbox: no snapshot
available`. Full remote homes, detailed result JSON and partial supplier build
state were not archived before expiration. That is a preservation failure;
there is no complete archive or restore proof. The locally streamed evidence
below survives. No replacement Sandbox was launched by this checkpoint.

## Frozen inputs and observed results

- Component producer: reviewed/full-green `d3da1d5`, artifact SHA256
  `efe017a6fb28c84a7d2f762d2ed875f0494bf962cc3c2cfe31f3eeaf2d4cebf2`.
  This is not the parent's newer combined main candidate.
- Controlled HTTPS Source `https://github.com/archeism/plugnz.git`, ref
  `finish/native-kimi-zcode-proof`; V1
  `f60a45efeab8b608995ec06eb022ced88d42aedf`, same-version V2
  `db0237713b2e4d07f5ef3baa65d66b043eab49bc`.
- Actual released supplier `@moonshot-ai/kimi-code@2.0.1`; Native Git V1 install
  and same-HEAD preview/apply passed. Native byte-and-mode digests were equal
  across unchanged calls. Native server discovery reported one skill and one
  command, and authored static command cache bytes matched exactly. This proves
  discovery and byte delivery, not command invocation or a model turn. Child
  Linux capabilities were zero and NoNewPrivs was enabled; no LLM API key used.
- V2 attempt failed the oracle's incorrect expectation of
  `capability.unverified`. Actual pinned `kimiUpdateProfile` deliberately reports
  `capability.unsupported`, operation `operation.update`, evidence
  `sha256:754f910c5cfa319ab144e4b7002bfeb67183752b023d28dc6be17bf4737c3452`.
  Correction `9de479e` checks that exact supported diagnostic contract and
  preserves the original attempt with distinct retry filenames. It was **not
  executed before expiration**; changed-Source zero-write proof remains open.
- ZCode supplier was unpatched official Source
  `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`, intended CLI 0.16.9,
  exact Node 24.14.0 and pnpm 10.33.2. It is an official-source build, not a
  published npm artifact. Attempt 01 used the nested application lockfile and
  failed frozen-lockfile validation. Attempt 02 used the authoritative root
  workspace lockfile, then the disk guard stopped installation at 940184 KiB
  including 169300 KiB DNF cache. The filtered workspace planned 1859 packages;
  only 82 had downloaded. No ZCode build or native lifecycle proof completed.

## Retained evidence

Local raw logs are outside Git at
`~/.local/state/plugnz-evidence/20261011/kimi-zcode-sandbox-01/`:

| File | SHA256 |
| --- | --- |
| `plugnz-kimi-native-v1-attempt01.log` | `b77d4ca1beb999e5c986f13927714ea6ed93ea7baf66b27d3d2b8f5918fe5068` |
| `plugnz-kimi-native-v2-attempt01.log` | `8c6af6c4ba194f7e12ccd49051dc4f5b9c1e85eece1f4773c2a79e8aabb2cdc0` |
| `plugnz-zcode-source-install-attempt01.log` | `537fecb29c8f6b3b91cee70443062ed50661f650c0922c1222bd306f6fe0a8d2` |
| `plugnz-zcode-source-install-attempt02.log` | `78df7a88f05e3af0b5e67d9286b76c9634f57f59d749d2a280c335d4cc47376d` |

The failed frozen-lockfile and disk-budget detail logs are retained alongside
them. They cannot reconstruct the expired Native homes. Neither supplier's
final combined candidate admission nor durable two-physical-ID ZCode migration
is delivered by this attempt.

## Required next attempt boundary

Before another launch: approve measured supplier disk/time budgets, acquire
the final frozen producer, and make remote-to-local preservation an enforced
deadline action rather than optional end-of-session work. Preserve each arm's
streams and complete stopped-state archive early enough to verify inventory
and a real restore before expiration. A corrected oracle or successful launcher
must not retroactively turn this partial attempt into complete admission.
