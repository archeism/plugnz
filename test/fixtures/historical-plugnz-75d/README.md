# Historical public CLI fixture

This is an immutable regression fixture, not a supported current CLI or proof
that a released native ZCode binary works. Tests use only isolated homes and
explicit controlled native binaries; they never fetch Git or call an LLM.

- Repository: archeism/plugnz, commit
  `75d7bc1a5db8045b6534f0c29cccd3dd0d6354a3` (clean tracked tree).
- Build: Bun 1.4.0 `bun run build` using that commit's `scripts/build.mjs`.
- Bundled dependencies: yaml 2.9.1 (ISC), smol-toml 1.8.0 (BSD-3-Clause).
  Their complete notices and the repository MIT license are retained here.
- Compression: `gzip -k dist/plugnz.mjs`; 264 KiB compressed, 1315 KiB unpacked.
- Compressed SHA256:
  `1a49ed61123091f662ba7d65aeda66aed381d455a20c203a5cf85582123add6f`.
- Unpacked SHA256:
  `68395da67885a85a2ba4715864b2d8b81bec7ffe01a95ef59c20e42207449ab3`.

Tests check independent literal digests before invoking Node 22+, cap decompressed
output at 2 MiB, and unpack only below an isolated fixture home. The raw bundle
remains outside Git at `/tmp/plugnz-zcode-old-producer/dist/plugnz.mjs`.
The compressed fixture is needed in CI to produce genuine historical ledger,
marker and Source identities without inventing ownership or requiring old Git
history in a shallow checkout. The Native-ID containment test does not deliver
the still-required two-ID durable migration.
