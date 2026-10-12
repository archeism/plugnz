# General release dependency audit

The general-first release audit found reachable bundled `smol-toml@1.8.0`:
plugin command/semantic inventory and Codex, Kimi and Grok configuration readers
call its parser. Declaring it a development dependency does not make those
bundled runtime paths development-only.

[GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2)
reports quadratic-time parsing on ordinary dot-free TOML keys, fixed in 1.9.0.
The minimum range is now `^1.9.0`; the committed Bun lock resolves **1.9.1**.
No other dependency or CLI engine policy changed.

Reviewed upstream [1.9.0 release](https://github.com/squirrelchat/smol-toml/releases/tag/v1.9.0)
and [1.9.1 release](https://github.com/squirrelchat/smol-toml/releases/tag/v1.9.1):
1.9 introduces null-prototype returned objects and stricter invalid-input parsing;
1.9.1 rejects an invalid extra exponent sign. No parser option or local format
conversion was changed. The installed package has no dependency install script;
bootstrap and frozen verification used `--ignore-scripts`.

Pinned manager: Bun **1.4.0+34cbb9a40**. Ambient Bun 1.3.14 could not audit this
lockfile (`UnknownLockfileVersion`); that failure was not reported as a clean
audit. Pinned `bun audit` reports **no vulnerabilities, 23 packages checked**.
`bun install --frozen-lockfile --ignore-scripts` and `bun run check` exit zero.

Focused parser/consumer regression command:

```sh
bun test test/semantic-inventory.test.ts test/conversion.test.ts \
  test/codex-lifecycle.test.ts test/grok-lifecycle.test.ts test/kimi-lifecycle.test.ts
```

Result: **79 pass, 0 fail, 1 existing skip, 402 assertions, 29.76 seconds**.
The existing Codex cleanup-fault skip was not added or changed. Full release
acceptance and the actual newly built artifact still need their combined gates.

Raw evidence is retained under
`~/.local/state/plugnz-evidence/20261012/general-lifecycle-release/`:
`dependency-audit.log` (original advisory), `dependency-audit-patched.log` and
`toml-focused.log`. README runtime/release instructions now describe the actual
Node bundle and general sync/retirement boundary, without claiming legacy
adoption or cross-process exclusion is delivered.
