# Frozen combined Codex native proof

Status: prepared; no supplier acquisition or native lifecycle arm has run.
Supplier acquisition waits for independent acceptance of preservation controller
`2a38c822c0b3427026065db9a1a4b4a9c6fa1690`.

Product input is frozen at `b029c5446f1308ea4b49ab6b2da8763ee12959d2`;
artifact SHA256 is
`c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606`.
The artifact's `0.0.12` label is unreleased proof metadata, not publication.

The released supplier is npm `@openai/codex@0.162.0`, with registry metadata
and package-lock SRI retained. Expected Linux binary SHA256 is
`50ed828f357c655a3c82054d346cab8434f24901f14ec19b8267571bdd008b38`.
Only supplier version verification may run during acquisition.

The original empty setup Sandbox `plugnz-codex-b029c54-20261011` was stopped
before its SDK-confirmed expiry 1791762567587. No supplier or native arm ran.
Stopping created a retained 783 MiB automatic snapshot,
`snap_ZY5e6SZeHRCEToGffC6PaDrEYATS`, expiring after 30 days; it was not deleted.
Observed session duration was 1657.093 seconds, CPU 27.48 seconds, memory 4096 MiB,
ingress 9.1 KiB and egress 4.5 KiB. Its initial filesystem baseline was
3671261184 bytes. This is an abandoned setup, not a completed experiment.

The next fresh Sandbox must explicitly use `--non-persistent` and verify SDK
`persistent === false`. Installed official SDK 3.6.1 exposes
`CreateParameters.persistent` and a live `persistent` getter; its stop result
includes optional snapshot metadata and must be checked rather than assumed.
Project remains `workspace-agent-lab`, team `charfeng1s-projects`, with a dedicated
passwd user only inside that Sandbox. Re-measure its baseline and actual expiry.

Acquisition budget: 3 GiB whole-filesystem growth, 640 MiB stop/scratch reserve,
512 MiB unknown supplier/archive cap, and 630 seconds reserved between archive
deadline and actual expiry. Native cases retain the 100 MiB evidence cap and
128 MiB stop reserve. All temporary/cache paths remain under declared supplier
or trial roots. Privileged controls remain outside the trial UID's writable
tree. NoNewPrivs and every capability set are checked.

New append-only Source branch `proof/codex-b029c54-source-20261011` starts at
retained V1 `d42234b1adc9bac2a4d1a93d5cab26070494d751`. V2/V3 append only after
the preceding phase has been preserved; older refs and evidence are unchanged.

Required arms, each with reports, configuration, source revisions and failures
retained under the controller-owned proof root:

1. Managed V1 bootstrap followed by actual same-version Native V2, including
   released app-server `skills/list` discovery.
2. Actual permission-denied Native V3 after checkout HEAD advances; exact
   rollback comparison of entire cache, config, checkout, data bytes and modes.
3. Foreign checkout and newly introduced unknown cache entry after actual
   Native exit; preserve exact post-call surfaces and pending sealed journals.
4. Older canonical inactive version and slot metadata retained through Managed
   update; assert no marketplace upgrade. Sparse selection also uses Managed.
5. Malformed sparse configuration blocks the entire public batch before writes.

This does not fabricate multiversion Native authority. Full-native admission
remains restricted to the proven physical slot shape. Raw evidence is archived,
downloaded before actual expiry, and restored with independent hash/mode checks.
No proof completion is claimed without its preservation receipt.
