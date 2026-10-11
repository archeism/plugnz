# Codex native marketplace metadata rollback

## Verified failure, not a capability deferral

Official Codex CLI 0.162.0 on Node 24.21.0 in the owned Vercel Sandbox
`plugnz-codex-final-3ef856a` completed two same-version native updates from
controlled Git V1 to V2, including actual SDK skill discovery. An actual native
cache permission failure while updating to V3 returned exit 1 after changing
the marketplace checkout to V3. Plugnz then incorrectly refused clean rollback.
The original failed attempt and its pending journal remain retained; they are
not rewritten into a successful attempt.

The native checkout differed from the frozen Source by exactly one root file:
`.codex-marketplace-install.json`. All other Source paths, executable modes and
bytes matched. The pinned official writer is
[Codex activation.rs at c138238](https://github.com/openai/codex/blob/c1382380de69521303b416720a52f42d51af6248/codex-rs/core-plugins/src/marketplace_upgrade/activation.rs).
It writes `source_type`, `source`, `ref_name`, `sparse_paths` and `revision`.

## Correction boundary

The read-only host proof accepts that root file only as a regular non-executable
file with exactly those five fields, Git Source locator and full pinned revision
matching the sealed operation, and no sparse paths. Only distributed Source
comparison excludes the validated root file. Nested namesakes and every other
Source byte remain checked. Full rollback fingerprints still include the native
metadata and Git tree, so later foreign changes must continue to block restore.
Doctor's default Source fingerprint is unchanged.

An initial implementation-equivalent helper reproduced three failing tests
after test-fixture setup corrections (two passed). After correction, all five
new tests passed, 18 assertions. Combined existing Codex route coverage passed
24 tests, 92 assertions, 12.13 seconds. Test-only assertion syntax was then
adjusted to the repository's deliberately small ambient type declarations.
These are focused checks, not released-native acceptance of the correction.

## Retained raw evidence

Complete original attempt archive:
`~/.local/state/plugnz-evidence/20261011/codex-final-complete-attempt.tar.gz`.
SHA256: `fa44bcca89c8480630d05126a64a554d61ad206b0f6a28e9e215e1ac2083dc3d`.
Real restore: `/tmp/plugnz-codex-final-complete-restore.JdWFyj`, 159892 KiB.
Archive: 66860 KiB. All eight restored checkout/cache/config/data surface hashes
match the two native boundary post-call records. Both sealed pending journals,
rollback bundles, Sources and resource data are retained. Rejected installer and
discovery-controller scripts and the original SDK response are retained; the
earlier outer-controller failure streams are not independently archive-verified.
The foreign-checkout case
correctly refused rollback without overwriting the injected foreign bytes.

Supplier executable body is not duplicated in the archive; official immutable
npm URL, integrity and executable SHA256 reconstruction metadata are retained.
No real fleet deployment or external repository write was performed.

## Remaining acceptance

- Independent review of the correction and retained evidence.
- Host-route regression exercising post-native metadata capture and rollback.
- Fresh released-native V1/V2/V3 clean-failure rollback and foreign-change refusal
  against the exact corrected packed artifact.
- Full combined suite and typecheck before main integration.

## Host-route regression checkpoint

The route regression creates actual isolated Git prior/candidate commits, invokes
the fixture CLI boundary which checks out the candidate and writes exact native
metadata before returning failure, then calls the actual adapter rollback. With
the previous raw Source comparison restored temporarily, it fails with the same
`checkout changed outside the captured native attempt` diagnostic (three
assertions reached). Restoring the correction passes all five assertions,
including the exact prior full-tree fingerprint and prior Git HEAD. This does
not replace the still-required released-native trial.

Skills unchanged; these results establish product regression evidence, not a
causal skill-improvement claim.

## Released-native correction trial: second defect

Fresh owned Sandbox `plugnz-codex-metadata-a6ecb91` ran official 0.162.0
with frozen artifact SHA256
`685041e13e31e331c7dfb8caea57b03a392ddb5289f4b4f66e8105f1e22b6ea3`.
Both bootstrap SDK discovery and same-version Native V2 refresh passed.
Foreign V3 post-call changes remained untouched with exact sealed pending
recovery. Clean V3 permission failure restored the prior Git HEAD and settled
runtime failure with no pending recovery, but the full surface oracle failed:
checkout root mode changed from 0755 to 0700.

`cpSync` into an existing `mkdtemp` restore directory preserves that directory's
0700 mode. The restore now copies the retained root permission mode explicitly
before activation. The actual host-route regression reproduces the mode bug
(expected 493, received 448), then passes all six assertions after correction.
Released-native reacceptance is still required; the failed oracle is retained.

The full run launched on a6ecb91 was still live when this permission correction
was discovered and applied. Its result must not be presented as a frozen gate
for the corrected source; a fresh full gate is required after this increment.
