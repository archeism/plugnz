# Verified host-profile release 0.0.12

Reviewed integration commit `8b6a0c5abb10fc927ec6323140ce48da11ac3195` is on
main; release-bot commit `1427cc207d69e4e6c5cd680bebb08bbf2e441057` changes
package version only. Histories were merged, never squashed.

GitHub runs:
- Publish `38179284801`: success.
- Node compatibility `38179284826`: Node 22 and 24 bun-free and tarball smoke
  legs successful.
- Main checks `38179284937` and release commit `38179309394`: success.

Registry initially returned 404 while npm's successful publish explicitly said
the package was still processing. The same verifier subsequently fetched actual
0.0.12 metadata and tarball, without republishing or treating propagation as a
terminal failure. Reproducer: `test/verify-plugnz-0012-release.mjs`.

Verified official registry metadata:
- Version `0.0.12` and gitHead equal the integration commit above.
- Tarball bytes 276981; integrity matches the registry's full SHA512 SRI.
- Tarball SHA256
  `cf110e3901af6d507cd4ddf0090fa9d5ad090596a706619eb554d3a6a53d14e8`.
- Actual extracted CLI SHA256
  `cbe35a4f076a1fef02c8d0fe22175f3a9c2127b0d9ef2f02914a3b8250477dec`.
- Actual Node 22.23.1 version output is exactly
  `{"name":"plugnz","version":"0.0.12"}`.

Raw official metadata/tarball retained in
`/tmp/plugnz-release-0012-verify.OPTyq5`; tar inventory contained only LICENSE,
package.json, README and dist/plugnz.mjs. The actual extracted registry bundle
was copied into a separate detached source worktree at the release commit,
not replaced by a new local build, for public CLI tests.

`OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test
test/host-profile-admission-public.test.ts test/claude-catalog-public.test.ts`:
58 pass, zero fail, 454 assertions, 31.76 seconds. Tests use isolated homes.
No fleet deployment or Personal pin change. NativeGit and adoption remain
unfinished independent lanes; issue #35 stays open. Skills unchanged.
