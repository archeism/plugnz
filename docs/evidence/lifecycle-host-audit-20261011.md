# Lifecycle admission audit: released plugnz 0.0.9

This audit is frozen to `4c4bbe3aa03c7b33ce72674cdc41fe6ab09f202b`.
An independent `gpt-6-astra` reviewer inspected all nine registered adapters,
their production lifecycle profiles and retained evidence. No installation or
deployment was performed. A registered adapter and a legacy capability catalog
entry do not prove a currently eligible Native lifecycle route.

| Host | Production admission at this checkpoint | Evidence boundary / remaining work |
| --- | --- | --- |
| Claude Code | Managed local/Git; no enabled production Native contract. Any parseable semver currently receives a Managed profile. | Loader evidence: 2.1.275; update/store research: 2.1.295. Unknown-version admission is not justified by those two releases. |
| Codex | Exact 0.162.0; Managed update/retirement and conditional Native update. No lifecycle install profile; ordinary skills/MCP/commands not admitted. | Native Git route is dormant without the descriptor. Profile claims rollback while checkout rollback is explicitly unverified; wiring the descriptor alone must not enable it. |
| dcode | Exact 0.1.83, Managed local/Git install/update/disable/retire. | Retained real updater/lock and Sandbox evidence supports bounded Managed delivery, not commands, agents or restricted invocation. |
| Cursor | Managed 2.4.0 plus skills-only `directory` profile. Native refresh and disable unverified. | Command-to-skill projection is admitted without retained runtime semantic proof. Earlier actual runtime attempt failed on quota; generated-file tests are not equivalence evidence. |
| OMP | Exact 18.1.4, Managed local/Git extension-package install/update/disable/retire. | Retained real loader assertions exist; current fresh-Sandbox lifecycle matrix remains required. |
| Hermes | Managed local/Git under synthetic `portable-surface` detected from config shape. | Exact loader source c0d7294769a38c17ceae51d8f7995e66e1dcae27 is evidenced, but current probe does not establish installed runtime revision. Consumer two-context proof uses fixtures. |
| Grok | Native local install/update at 1.0.24 / 1.0.41; no admitted Git, retirement or disable route. | Historical isolated real-loader/lifecycle evidence exists. Fresh-Sandbox acceptance against current lifecycle SPI remains open. |
| Kimi | Exact 2.0.1 Native install local/Git; public Git route blocked by missing descriptor. Update unsupported; retirement unverified. | Historical real loader/legacy public lifecycle is not current update/retirement or fresh-Sandbox proof. |
| ZCode CLI | Exact official 0.16.9 Native local/Git install/update; Git descriptor absent. Managed retention-safe retirement. | Retained official darwin/arm64 loader/public-adapter evidence exists; current fresh-Sandbox lifecycle proof remains open. Native uninstall is not retention-safe. |

## Foundations that still need verification

Both `src/planner.ts` and `src/executor.ts` omit `nativeGit` when constructing
resolved Git snapshots. `src/lifecycle-runtime.ts` consequently refuses Native
Git admission. Supplying this descriptor also changes Source locator provenance
consumed by Managed writers and common handles; old genuine Git installations
must remain recoverable through checked recorded ownership, not marker guesses.
`src/pin-lifecycle.ts` already supplies the descriptor and belongs in the
dependent scan. Git routing/provenance and Codex rollback are separate acceptance
requirements; neither may silently enable the other.

Issue #35 also requires recording the declared manifest version in dcode's native
registry. The released Managed protocol instead omits native registry version:
0.1.83's updater reads the remote manifest's opt-in policy, and `version=None`
is the proven per-package skip. Declared version remains in the manifest and
ledger, and the plugnz reader displays it. This is an explicit acceptance
discrepancy, not a fulfilled checkbox. A version-preserving immutable native
source/opt-out mechanism needs proof, or the spec adjustment needs a human
decision; do not silently weaken either the version or auto-update requirement.

Relevant evidence: `docs/hosts/{claude-code,cursor,hermes,grok,kimi,zcode-cli}.md`,
`docs/evidence/codex-personal-20260922.json`,
`docs/evidence/omp-native-extension-package-20260923.json`,
`docs/evidence/hermes-native-loader-c0d7294-20260923.json`,
`docs/evidence/kimi-native-loader-20260922.json`,
`docs/evidence/kimi-public-lifecycle-20260922.json`,
`docs/evidence/zcode-official-cli-872ad960-20260923.json`,
`docs/evidence/dcode-native-update-0.1.83-20261009.json`, and
`docs/evidence/dcode-managed-lifecycle-20261011.md`.

## Consumer checkpoint

Personal merged `31648c9bb34148c9b1c7201a73dcc9d7a1174f03`, preserving commit
history and pinning the independently verified published plugnz 0.0.9 artifact.
Local full checks, 39 focused tests / 174 assertions, the packed-producer golden
and different-model review passed. CI run `38163558809` completed successfully
(`check` and `fixed log`). This proves consumer orchestration/report handling,
not missing native capabilities. No fleet deployment occurred.

Issue #35 remains open: complete released/runtime-proven dcode package semantics,
durable recovery, remaining host admission/provenance corrections, retained
fresh-Native proof and consumer cleanup must not be represented as complete.
External dcode coordination remains a human follow-up. Addy/Matt skills are
unchanged; this audit is product evidence, not a skill-improvement claim.

## Original hashed-adoption bug closure

Fresh verification of shipped plugnz main `4c4bbe3` under Bun 1.4.0 passed
`bun test test/dcode-public-local.test.ts test/dcode-lifecycle.test.ts
test/dcode-sync-public.test.ts`: 42 tests, 327 assertions, 16.81 seconds.
The public CLI scenario explicitly refuses unadopted hashed registration, then
adopts matching bytes into the owned subtree and preserves the sibling. Negative
cases cover mismatched identity/version/content, symlinks, duplicate registrations,
foreign ownership and rollback; final-target mismatch prevents earlier writes.
This supports closing plugnz #29 for the admitted 0.1.83 Managed profile, not
claiming support for arbitrary native versions or complete dcode semantics.

Personal main `31648c9` passed `bun test tests/plugin-sync.test.ts
tests/plugin-deploy-batch.test.ts`: 26 tests, 88 assertions, 845 milliseconds.
Exact pair and command diagnostics outrank empty/generic process stderr; public
batch deployment remains nonzero for capability gaps. No real deployment ran.

Raw logs are retained under `~/.local/state/plugnz-evidence/20261011/`:

| Log | SHA-256 |
| --- | --- |
| `plugnz-main-issue29-verification.log` | `4062502a543602127d939b7d6506a40081293538217e1b6debb4e4a17808aca5` |
| `personal-issue29-diagnostic-verification.log` | `37deb5da69490dada282a3f09723d90ad44c053996c89bedb30742f073433e42` |

## Combined host gate: second deadline failure

Frozen `50b1508` full Bun 1.4 gate: 690 passed, 6 skipped, 1 failed,
4550 assertions, 278.83 seconds. The failed ZCode update/rollback fixture hit
the implicit five-second deadline. An isolated run with that same deadline
also timed out (5.013 seconds), so this is not described as suite-only noise.
A bounded 20-second diagnostic passed in 4.35 seconds, including native update
failure detection and verified rollback. Only this test's explicit deadline is
raised to 20 seconds; production deadlines and assertions remain unchanged.
The corrected test passed without a command-level override: 1 passed,
1 assertion, 4.24 seconds; typecheck and diff checks passed.
The full ZCode activation file at `fe95be7` also passed without a command-level
override: 5 tests, 35 assertions, 14.04 seconds. The retained log is
`plugnz-fe95-zcode-activation.log` in the same durable evidence directory.
The correction is not a full-suite pass or native runtime proof. Claude's
separately confirmed catalog-discovery bug still blocks host integration.

Retained failure logs under `~/.local/state/plugnz-evidence/20261011/`:

| Log | SHA-256 |
| --- | --- |
| `plugnz-50b-host-combined-full-failure.log` | `bc753cc415664bb10158ad7db9e981eb6d2bd67201505248eecc64ccec7feea6` |
| `plugnz-50b-zcode-update-isolated.log` | `388f53d2e5b1ff542917f171e06df35892216bc9749aa98eac9602979210e991` |

## Main-based deadline integration attempt

The isolated deadline-only candidate `36a546d` contains no host adapter changes.
Its full gate failed: 667 passed, 5 skipped, 2 failed, 4416 assertions,
245.87 seconds. Two pre-existing multi-command public CLI fixtures (scenario 5
and independent-pair/ungated-instance handling) hit their implicit five-second
deadlines. The scenario 5 assertion saw a null subprocess exit after the test
watchdog killed the process; this failed attempt is retained, not reported green.
Raw `plugnz-36a-deadline-full.log` SHA-256:
`99b14b686601a5210bf0912ca6d32b795e9ffac0e68f750cb701716f0ed12af1`.

A bounded 20-second diagnostic passed both fixtures and one matching scenario 14
control: 3 tests, 16 assertions, 8.27 seconds. The failing fixtures took 3.434 and
3.183 seconds in isolation. Their explicit per-test deadlines are now 20 seconds;
no production timeout, fixture behavior, or assertion changes. The main-based
candidate still requires independent review and a fresh full gate.
The explicit-deadline focused run passed without a command-level override:
3 tests, 16 assertions, 7.92 seconds; typecheck and diff checks passed.

Frozen `95c7a26` then passed the unmodified full `bun test` command under
Bun 1.4.0: 669 passed, 5 existing skips, 0 failed, 4416 assertions,
234.87 seconds. `bun run check` passed. Independent different-model review
approved both test-only deadline increments separately; production behavior,
timeouts and assertions remain unchanged. This main-based integration does not
contain the held Claude, ZCode resource/provenance, or receipt-contract changes.
The initial expectation of no npm publication was incorrect: the repository's
every-main-push workflow automatically published 0.0.11 from integration
`12dc294`, then pushed release commit `bd2d06f`. No fleet pin or deployment changed.

| Retained log | SHA-256 |
| --- | --- |
| `plugnz-95c-deadline-full.log` | `ffead036f4bc482c6bbc3b306d36a5cccfa2987507f45cbdae6a309909b76fb9` |
| `plugnz-95c-deadline-check.log` | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |

The actual public 0.0.11 registry metadata reports gitHead
`12dc294d0ddc966869741e61a682ce4b8e99a2a0`. Downloaded tarball SHA-256 is
`95a5e34ee35caed425578639f4bd1fd79980c441ab23a2c39b8ad560af81074e`;
its SHA-512 matches registry integrity
`ppgUrDg0uYBpDCtqhRdVaLShw+80TkKhg2gKkf8S2nHE2LLsIfim9m5cUd/qHtC9bDac7abeqNa8PM163YDSCA==`.
The artifact is retained as `plugnz-0.0.11.tgz` in the durable evidence directory.
Supported Node 22 syntax/version checks passed. Main Node-compatibility CI passed.

Canonical Personal `31648c9` ran its public producer golden against the exact
downloaded artifact, with `PERSONAL_TEST_PLUGNZ_BIN` set to the extracted bundle
and `PERSONAL_TEST_PLUGNZ_VERSION=0.0.11`: 1 test passed, 31 assertions,
13.72 seconds. The production pin remains 0.0.9. This uses isolated fixture
native launchers and proves baseline consumer interoperability, not the held
receipt contract or newly fixed native catalog behavior.
