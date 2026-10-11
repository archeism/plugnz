# Native Git inventory and repeated sync

This record describes controlled public CLI regressions, not a fresh released
Kimi/ZCode Sandbox admission proof. Git transport maps one exact canonical HTTPS
locator to a real isolated local repository; native boundaries are explicit
fixtures. No real home, network Git repository, or LLM API is used.

## Verified defects and correction

- Kimi installed a Git Source with its canonical locator and immutable revision,
  then inventory mislabeled it Local. The next same-HEAD sync failed global
  provenance validation. New receipts explicitly carry Source type, revision,
  and locator; inventory validates the complete tuple and its original marker
  fields. A pre-tuple canonical Git locator/full revision is validated rather
  than treated as Local. Historical missing origins remain incomplete: they do
  not manufacture locator authority.
- ZCode's generic planned identity was bare/source-marketplace qualified, but
  its native installer requires the existing deterministic `ownedMarketplace`
  identity. Lifecycle receipts also confused logical/native identity with
  deployment scope, and mislabeled Git revisions Local. Planning now uses the
  host's existing native mapping, independent of frozen revision; receipts keep
  logical/native identity and explicit scope/Source identity separately.
  Historical receipts with only logical/native ownership are not automatically
  assigned to an unrelated scope. Compatibility needs exact recorded authority,
  not inference from a serialized locator.
- The expanded six-command Cursor contradiction regression exceeded Bun's
  implicit 5-second case deadline under packed Node/concurrent load. Its explicit
  20-second case budget covers the measured complete subprocess workflow. No
  assertion or production timeout was weakened.

## Verification

`bun test test/native-git-provenance-public.test.ts`: four public Git/Local
install → unchanged preview/apply → changed-byte cases, including global
zero-write foreign-origin/scope/invalid-revision rejection and source-free ZCode
retirement retaining data/options: 4 pass, 90 assertions, 31.18 seconds.

Packed Node expanded Cursor contradiction regression: 1 pass, 21 assertions,
4.46 seconds. Typecheck passed. The preceding frozen `75d7bc1` full suite passed
720 tests, 5 skips, 0 failures, 4821 assertions in 348.65 seconds, but the newly
discovered Git regressions blocked its integration despite that green gate.
Raw log retained by the parent at
`~/.local/state/plugnz-evidence/20261011/plugnz-75d-route-full.log`, SHA256
`8023d5e98cb83d7b971eaf528eeec90bfd7abfe8121928fdc5363ee1cc045f7d`.

## Still required

Fresh released-harness Sandbox proof gates newly reachable Native Git behavior;
fixture success alone is not admission. Kimi changed/forced update and
retirement remain independently unsupported/unverified, not delivered by an
unchanged result. Historical ZCode ownership aliases require separately proven
compatibility authority. External ZCode resource-only drift requires a public
probe; its readback has a resource root not currently present in inventory.
