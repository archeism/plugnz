# General lifecycle 0.0.13 — actual registry verification

General lifecycle source was merged to main at
`a04a305f0ae3ee0c495f2c109194d34473eebece`, preserving every commit.
Release-bot `80e9618693a99d11fad8729a250dae8d4bddea74` changes only package
version 0.0.12 → **0.0.13**; tag `v0.0.13` exists.

Official GitHub runs are successful:

- [Publish 38206872879](https://github.com/archeism/plugnz/actions/runs/38206872879).
- [Node compatibility 38206872890](https://github.com/archeism/plugnz/actions/runs/38206872890):
  Node 22 and 24, plain-Node and installed-tarball launcher legs.
- [Source CodeQL 38206871745](https://github.com/archeism/plugnz/actions/runs/38206871745)
  and release-bot CodeQL `38206899438`.

The first official metadata fetch returned 404 during propagation. The same
read-only verifier subsequently succeeded; no republish/release retry occurred.
Reproducer: `test/verify-plugnz-0013-release.mjs`, which requires a fresh
`/tmp/plugnz-release-0013-verify.*` directory and pins exact source/version.

Verified official registry metadata and actual tarball:

- Version 0.0.13; `gitHead` exactly the integration commit above.
- Full SHA-512 integrity matches downloaded bytes; tarball size **307960 bytes**.
- Tarball SHA-256:
  `3ed3821d76febcd4075957443a705729b9ec54c0c3027e8accc258a793fe43f9`.
- Actual extracted/installed CLI SHA-256:
  `c795d86035e2ab0d81029ffc900c8c4c9b13cd3318460624d4c9b71de038ae46`.
- Inventory: exactly four regular files—LICENSE, README.md, package.json and
  dist/plugnz.mjs. Metadata, tarball, extraction and isolated installation are
  retained in `/tmp/plugnz-release-0013-verify.YXdVZd`.
- Actual Node 22.23.1 version document is exactly
  `{"name":"plugnz","version":"0.0.13"}`. Installed shebang, real npx,
  legacy plgnz alias and bunx launchers agree. Bun is absent from the Node/npx
  launcher PATH.

The exact downloaded bundle—not a local rebuild—was copied into a detached
worktree at the release-bot commit, `/tmp/plugnz-general-published-0013`:

```sh
OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node \
bun test test/lifecycle-public-commands.test.ts test/host-profile-admission-public.test.ts
```

Result: **83 passed, 0 failed, 407 assertions, 61.60 seconds**, terminal exit 0.
This covers actual published general lifecycle behavior and truthful host-profile
admission through isolated stores, not successful legacy adoption or universal
native-loader compatibility.
Permanent log: `~/.local/state/plugnz-evidence/20261012/general-lifecycle-release/registry-public-0013.log`;
SHA-256 `b661e89126b83f998ab33c94dcaf8bd27b3c415114a4c6001b8846af3cea818e`.

Different-model independent verification also checked fresh registry metadata,
SHA-512/SHA-1, exact file inventory, source README/LICENSE/package correspondence,
identical copied CLI bytes, and Node version execution with PATH `/nonexistent`.
It independently ran normal manifest sync and source-free retirement with
data/metadata retention and missing/invalid-Source pruning refusal: **2 passed,
0 failed, 9 assertions, 2.91 seconds**, unchanged timeouts. Final artifact LGTM
explicitly excludes undelivered legacy adoption/cross-process guarantees.
Permanent independent logs in the same evidence directory:
`plugnz-0013-independent-artifact-verified.log` SHA-256
`4ca40dcd6acf35dfd9089f6950a1f9c415eb6bc8dffe019d2fd278675f57ab5d`,
and `plugnz-0013-independent-lifecycle.log` SHA-256
`ace873fdbf5ae27b6fe9bb583e43ce37f030fa12a0d76c2e492276542b8537e8`.
An initial independent shebang-assertion typo is retained as a failed probe; its
corrected probe passed, not a product defect. No real install/fleet deployment or
Personal pin changed. Legacy migration/concurrency/consumer adoption refinements
remain explicit subsequent work. Skills unchanged.

This proof is committed on a proof branch to avoid triggering another patch just
for post-publication evidence; the working product code is already on main/npm.
