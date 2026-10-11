# Claude global marketplace envelope: demonstrated false-green correction

The actual pinned-runtime negative is retained in
[the `75c864a` Vercel receipt](issue35-claude-75c864a-vercel-20261011.md).
Public install reported active-conforming while native component discovery
rejected an unrelated foreign registration missing `lastUpdated`.

## Official evidence, not a guessed date/schema constraint

The official npm artifact
`@anthropic-ai/claude-code-linux-x64@2.1.295` was streamed without retaining
a full native binary locally or executing a native installation. Download
integrity matched the pinned SHA-512 from the earlier native proof. Bounded
source windows capture the bundled `Hg`, `Edt`, `VOr` and `Ki` definitions:

- `Hg` requires a native source object, `installLocation:string` and
  `lastUpdated:string`; `autoUpdate` is an optional boolean.
- `Edt` is a string-keyed record of those registrations. `VOr` validates
  the complete parsed registry and rejects malformed foreign records too.
- Strings have no nonempty or timestamp-format refinement. Empty strings
  must not be refused as invented date validation. Unknown metadata must not
  be rewritten or rejected by this correction.
- `Ki` contains multiple source forms and nested inline plugin declarations.
  This increment validates the demonstrated common registry envelope, **not
  the full recursive native source/plugin schema**. Complete source-schema
  admission validation remains an open coverage gap in the whole program,
  not an intentional exclusion or claim of native compatibility for arbitrary
  source shapes. Hooks also remain an explicit unadmitted planned capability.

Durable source-window archive:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/issue35-claude-native-schema-windows.tar.gz`,
100 KiB allocated; SHA-256
`7731355824202019bc90ff9a4ff113230a11043913426bc04f0d4ac19b5ab05a`.
It retains the bounded extractor scripts, successful raw windows and the
failed source-window attempt that hit its enforced 20-window cap. Real restore
to `schema-restore` reproduced both raw source hashes:
`cc0537402c01f0f39dfd6a48a0b55a1ca97e016f6d67eff0a54a60611b84b2ba`
and `0c2e8077d3187b523a34857fd9027a414396f3c1be3275990a0084fdb7a96794`.
Extraction wall time/RSS were not measured and are recorded as unknown, not
zero. Existing proof scratch including the restored source windows allocates
4,940 KiB. No Sandbox was launched or resumed for this correction.

## RED and correction boundary

Public RED committed at `d26b822`: 12 passed, 1 failed, 87 assertions,
23.39 seconds test-run time. Exact retained log:
`issue35-claude-global-registry-red.log`, SHA-256
`84baaefeacea443d79da82d137e7d0ccb008a16b1213227b51a1f1c267142688`.

The read-only global envelope check runs before target inventory observation,
again at apply precondition revalidation, and before lifecycle readback. It
hard-blocks missing/nonstring required fields and invalid optional boolean
types with the exact foreign field path. It never repairs or drops the
foreign entry. A malformed registry cannot report conforming readback.

The public regression now covers missing, numeric and null timestamps in a
batch with an earlier Cursor pair and two Claude Source scopes. It verifies
all selected native stores and the ledger stay unchanged, with no mutation
started and foreign Source bytes retained. A post-seal drift regression also
verifies byte-identical controlled native state at apply/readback rejection.
Rollback remains able to restore the selected owned slice without replacing
the malformed foreign registration. Existing collision/adoption fixtures were
made native-valid (`lastUpdated:""`) so their intended boundary is still
exercised, rather than accidentally passing on the new timestamp guard.
Compatible opaque registration metadata remains retained.

## Frozen local gates and remaining acceptance

```sh
bun run check
bun run build
bun test test/claude-catalog-public.test.ts test/claude-code-lifecycle-route.test.ts \
  test/claude-code-detection.test.ts test/claude-lifecycle.test.ts test/doctor-imports.test.ts
OPEN_PLUGIN_TEST_PACKED_NODE=node bun test test/claude-catalog-public.test.ts \
  test/claude-code-lifecycle-route.test.ts test/claude-code-detection.test.ts \
  test/claude-lifecycle.test.ts test/doctor-imports.test.ts
git diff --check
```

Native Bun: **55 passed, 317 assertions**, 33.41 seconds wall time,
132,916 KiB maximum RSS. Packed Node: **55 passed, 317 assertions**,
33.20 seconds wall time, 127,780 KiB maximum RSS. Typecheck, build,
whitespace and doctor read-only import gates passed. Raw gate logs:

- `issue35-claude-global-envelope-bun.log`, SHA-256
  `c779c0c3ee2ea82d312cdd443ec0f2996f56abfc940294139d6366915b15051d`.
- `issue35-claude-global-envelope-packed.log`, SHA-256
  `4192bbb8146f0e80fe3a7b9620c63aa8acef045d9bf6063e6b4993c3610f8448`.
- Built CLI SHA-256
  `79a44cbc838094438a90df480e6aa35f2face65bc4a4bda6dc4a3076f8a48d2c`.

Independent two-axis review and fresh actual native negative zero-write and
clean-baseline lifecycle proof remain required before integration. The earlier
scoped native positive does not retroactively accept this new candidate.
Skills are unchanged; this is a product correction, not a skill A/B claim.
