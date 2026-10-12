# Published global orphan refusal verification

The reviewed fix was integrated at `d4551246d24577f2a1aacce5831aa367d1c67450`
and published as **plugnz 0.0.14**. Release commit/tag:
`890e03b169a301f256223a19abd340d03485f845` / `v0.0.14`.
Publish run `38221050691`, Node compatibility run `38221050644` and CodeQL run
`38221051005` all completed successfully. The pre-push full source gate passed
933 tests with zero failures and six existing opt-in skips; see the integrated
`docs/evidence/global-orphan-ownership-20261012.md` receipt.

Actual registry bytes were downloaded into
`/tmp/plugnz-release-0014-verify.jBoNNh`, not substituted by a local rebuild.
`test/verify-plugnz-0014-release.mjs` checks the exact metadata version/gitHead,
HTTPS registry URL without redirects, SHA-512 SRI and SHA-1 before saving bytes.
Registry gitHead is the integration commit above, not the later bump commit.

- Tarball: 307855 bytes; SHA256 `fe76119c1f29dd18b7024ce79d866466ffeb85bb9688e88230081753f202c9ef`.
- CLI SHA256: `f43cfb7286334e2b1ceca786acee2a44314b6da42c04e0008b1bf6d8d0a07ead`.
- Archive contains exactly LICENSE, README.md, package.json and dist/plugnz.mjs.
- Actual Node CLI version output: `{"name":"plugnz","version":"0.0.14"}`.

Root copied that downloaded CLI into this isolated proof worktree's ignored
dist directory, without building. With Node 22.23.1 and Bun 1.4.0:
`OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test
test/orphan-ownership-public.test.ts test/lifecycle-public-commands.test.ts`
completed **44 pass / 0 fail / 206 assertions / 60.81s**. This covers all public
lifecycle scenarios and both new ownership-refusal paths against registry bytes.
Independent verification checked metadata, SRI/SHA-1, archive/bin declarations,
direct archive CLI hash and version; its focused actual-artifact gate passed
**3 tests / 43 assertions / 9.85s**, including genuine capability continuation.
Artifact and proof-script review returned LGTM.

The first metadata GET returned 404 and the verifier rejected it. Its outer shell
printed the directory afterward, so that wrapper's zero exit was not acceptance.
The failed probe remains in the tool transcript. The direct verifier retry after
30 seconds returned 200 and passed; no claim is made about the 404's root cause.

Root raw public log is retained under
`~/.local/state/plugnz-evidence/20261012/global-orphan-ownership/root-registry-public.log`.
This proof does not claim a fleet upgrade, real-home mutation, legacy-adoption
executor/fence, production writer lease or new Native capability. Skills unchanged.
