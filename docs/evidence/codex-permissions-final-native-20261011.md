# Codex corrected native rollback acceptance

Frozen producer: `a14b27cd57c4999d39227cb89086011630e46d94`.
Packed artifact SHA256:
`95654ab2ff3db1d92106d502f5578f987e24646c5aea5b559e5406b1356bff22`.
Proof controller checkpoint: `57113ad`.

Official supplier Codex 0.162.0, actual Node 24.21.0, owned nonpersistent Vercel
Sandbox `plugnz-codex-metadata-a6ecb91`. After retaining the first correction's
failed permissions oracle, two fresh isolated homes used a distinct append-only
controlled Source branch `finish/codex-native-permissions-fixture`:

- V1 `d42234b1adc9bac2a4d1a93d5cab26070494d751`: Managed bootstrap and actual SDK
  skill discovery passed in both homes.
- V2 `785ce7fa217662c1b7f9bc6775ee323a377b48fe`: same-version Native update,
  exact Git checkout, changed skill/resource bytes and actual SDK discovery
  passed in both homes.
- V3 `10c4628d759ede1d5fa87347a5d616c5047d301f`: actual native permission failure
  returned status 1 after reaching V3. No simulated native exit or LLM request.

Clean-failure arm: all four checkout/cache/config/data surface digests, including
permission modes, were exactly restored; prior V2 HEAD retained; actual public
report remained a loud runtime failure, with null recovery ID. Exact fresh
sealed journal rolled back, attempt failed, no pending activation/open journal,
and its stage/rollback bundle were cleaned. Wall time 2973 ms.

Foreign-change arm: injected post-native checkout change remained untouched;
all four surfaces matched native post-call evidence. Exact sealed rollback
journal and recovery-required attempt remained pending with their prior bundle,
foreign sentinel and valuable data intact. Wall time 2717 ms.

This is bounded controlled concurrency evidence, not a native whole-store lock.

## Verified retention

Final archive:
`~/.local/state/plugnz-evidence/20261011/codex-permissions-final-native.tar.gz`
SHA256 `bb585b10b75fd0cfa1a90be2c1e4f7ac3931677d1d59e6ac5c513fce505337c8`.
Allocated archive 13572 KiB; real restore
`/tmp/plugnz-codex-permissions-final-restore.vpb7Gw`, 51036 KiB.
Independent same-harness review verified exact artifact, eight restored surface
digests, both native statuses/HEADs, four SDK responses, journal correlations,
cleanup/refusal boundaries and retained data. Different-model review unavailable;
no model-independence claim.

Official immutable npm URL/integrity and native executable SHA256
`50ed828f357c655a3c82054d346cab8434f24901f14ec19b8267571bdd008b38`
are retained; the 294410952-byte supplier executable is reconstructible, not
duplicated in the evidence archive. No Snapshot or earlier evidence was deleted.

Initial Source-metadata failure archive remains `codex-final-complete-attempt.tar.gz`
(SHA256 `fa44bcca89c8480630d05126a64a554d61ad206b0f6a28e9e215e1ac2083dc3d`).
First corrected permissions-oracle failure remains
`codex-metadata-first-corrected-trial.tar.gz`
(SHA256 `43cc600cf9656c2c067273aefcea0bf91cffd86951875862f9a4825ee9d4f7b4`),
real restore `/tmp/plugnz-codex-metadata-first-restore.buzFG1`, 50904 KiB.
Earlier outer-controller failure streams are not independently archive-verified.

## Resource boundary and remaining gates

Whole Sandbox baseline 3585232 KiB physical used; final trial peak 4360612 KiB,
below 4.75 GiB and 1.5 GiB new-growth limits. All five Linux capability sets zero
and NoNewPrivs enabled during public/native trials. Supplier installation uses
the same measured original baseline for the second homes, not a reset allowance.

Production full gate remains running on the frozen producer. A prior full run
spanning source/test edits ended 757 pass, 5 skip, 1 fail at the permissions
regression; it is not a frozen corrected-candidate gate. Main integration,
combined regression gates and publication verification remain required.
No real fleet deployment, upstream external filing or backup deletion.
Skills unchanged; this is product acceptance, not a causal skill-improvement claim.
