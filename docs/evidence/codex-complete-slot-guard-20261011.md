# Codex complete physical cache-slot correction

Frozen integration base: `de55233`. This checkpoint fixes review blockers; it
does not replace the actual released-native or combined full-suite gates.

## Findings and scope

Codex's pinned native updater can replace the complete package cache slot or
discard older version directories, not merely change the active version.
The former adapter captured active bytes but exempted other pre-existing
versions from rollback checks. Logical package ownership did not establish
authority over those other physical roots.

The correction captures complete admitted slots, including directory/file
modes, binds capture manifests to the sealed opaque rollback reference,
checks parent identity and mode, revalidates before native invocation, and
validates all affected slots before any rollback write. Restoration compares
the captured current slot again and verifies the complete restored fingerprint.
Forged snapshots, new foreign entries and changed parent/slot modes refuse
restoration rather than overwrite another writer.

Historical multiversion roots lack independent historical authority in the
current SPI. They therefore select Managed before native writes and remain
retained. A same-scope marker is not sufficient proof; a copied active tree
under a different version name is not a canonical positive case. This preserves
delivery through Managed, not a package exclusion or multiversion Native claim.
Managed preflight also refuses overwriting an occupied inactive destination or
allowing a retained higher version to shadow a downgrade, before earlier
batch siblings or the ledger change. The destination is rechecked before apply.

Valid nonempty `sparse_paths` selects Managed because native rollback proves
the complete frozen Source. Malformed values hard-block both routes; an empty
array remains eligible when all other Native requirements hold.

Pinned supplier source:
[Codex cache store](https://github.com/openai/codex/blob/c1382380de69521303b416720a52f42d51af6248/codex-rs/core-plugins/src/store.rs).

## Frozen verification

Author: `native_git_spec`, gpt-6-astra, Codex harness. Only the Codex writer,
existing lifecycle-route test and new public-slot test were changed.

- Final five-file Codex focused gate: 41 passed, 232 assertions, 25.49 seconds.
  Author execution handle `12058` settled exit 0; typecheck and diff check passed.
- Original RED results remain in the author trajectory: `9e2fe6` (sparse
  admission), `c51830` (incomplete slot restoration), `a21a34` (slot CAS),
  `13e0fc` (forged capture authority), `dc6702` (occupied destination),
  `18de7b` (same-Source inactive winner).
- Frozen SHA256: writer
  `c156bb9cd36365b0d5ea6af64aa682c806c8d803cff4ec916ebdde81d6463e70`;
  lifecycle-route test
  `7d2072b55a07eb83590eb6e16734a327789da0cff4931bc06b3375eb4fa95ca6`;
  public-slot test
  `b6cf2f7879602cb3291d41823cf6276e6aa57f9a4dd3bc1dab82ce56c71300f9`.

The root independently checked these hashes before checkpointing. Independent
review by `native_git_standards` (gpt-5.6-sol, Codex harness) returned LGTM on
the three-file correction: 33 changed tests / 184 assertions and 8 dependent
tests / 48 assertions passed. Parent inode replacement is checked in code;
parent-mode drift, rather than same-mode inode replacement, has a dedicated
regression. The combined gate is recorded separately below. No real
installation, native capability profile, public
schema, runtime floor or skill was changed by this correction. Historical
unbound Native references remain readable, but cannot authorize the new stronger
physical restoration.
