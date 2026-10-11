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
