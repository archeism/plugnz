# Preserved failed Codex acquisition 02

No Native lifecycle arm ran. Official npm `@openai/codex@0.162.0` installation
was interrupted by the experiment's supplier-retention guard during unpacking.
This is a measured acquisition-budget failure, not a Codex product defect.

Fresh Sandbox `plugnz-codex-b029c54-preserved-02` was created explicitly
nonpersistent and independently checked through SDK `persistent === false`.
SDK expiry was 1791764742506; baseline whole-filesystem allocation was
3671310336 bytes. Dedicated passwd user UID 22063 ran with NoNewPrivs and all
capability sets zero. HOME, npm cache and temporary directories were contained.
Supplier acquisition used frozen controller `2a38c822c0b3427026065db9a1a4b4a9c6fa1690`.

The controller stopped the supplier with SIGKILL and
`stopped: supplier-retention-budget`; `stopFailure` was null. Whole-filesystem
peak was 4362698752 bytes, a 691388416-byte increase; stopped allocation was
4096192512 bytes. The stopped supplier inventory contained 423505910 bytes.
Its principal bodies were a partial 292569994-byte native binary, a
112855360-byte npm temporary compressed stream and 17526146 bytes of cached
compressed package content. The verified complete binary is 294410952 bytes.
The partial binary SHA256 `9c84782dd9d9f0aab092fdd26065610d560795cf984cd9b780427488e0ed3f2e`
does not match the required complete binary SHA256
`50ed828f357c655a3c82054d346cab8434f24901f14ec19b8267571bdd008b38`.
All partial supplier bodies were archived; none were omitted as reconstructible.

Archive: `/tmp/plugnz-codex-b029c54-acquisition-02/evidence.tar.gz`,
225584848 bytes, SHA256
`c6e967d2c8fe6b49f6e83a15685404676be61b4ff564cf068cc21e511e8b6a6b`.
Controller restoration checked every trial and supplier file hash and mode.
Root independently restored into
`/tmp/plugnz-codex-acquisition-independent-k8ga7s` and verified all 12 files,
423509318 bytes, including the explicitly incomplete binary and zero omissions.
Verifier: `/tmp/plugnz-codex-acquisition-independent.mjs`.

The approved retry budget is 768 MiB acquisition/archive cap with 896 MiB remote
scratch reserve, still bounded by 3 GiB whole-filesystem growth and 630 seconds
reserved for preservation before actual expiry. Native evidence remains capped
at 100 MiB. Controller change `be36648` is separately reviewed before any retry.
No claims about maximum archive throughput or Native eligibility follow from
this failed attempt. Local raw evidence and both restored inventories remain
retained; no files or snapshots were deleted.
