# Independent verification

This checkpoint qualifies native effects for the explicitly selected first batch. Reviews read actual receiving requests and execution evidence; normal process exit and a fixture's own PASS label were not acceptance criteria.

## Raw native-effect recounts

| Independent reviewer | Lane | Accepted fresh cases / requests | Checks and raw integrity |
| --- | --- | --- | --- |
| `/root/claude_codex_powers` | OpenCode 1.19.0 | 4 / 8 | 106 checks; 77 raw hashes matched |
| `/root/hook_contract_review` | OMP 18.8.7 and Pi 0.73.1 | 6 / 13 | 775 checks; 150 raw hashes matched, including the retained failed OMP apparatus attempt |
| `/root/omp_pi_powers` | Official ZCode CLI 0.16.9 | 3 / 7 | 286 assertions; 60 raw file lengths/hashes matched |

Each reviewer examined a lane they did not author. They wrote separate parsers for raw requests, native hook payloads, call/session correlation, controlled file access, and cleanup. No additional native sessions were launched by these reviews.

The 13 accepted cases produced 28 actual requests to the synthetic provider. This does not add new runtime control-effect evidence for Claude Code or Codex.

### Findings preserved in the report

- OpenCode argument-object rebinding ran but did not change execution. In-place mutation did.
- Pi and OpenCode can change effective execution while preserving the original path in historical arguments. OMP updates the execution-start and subsequent assistant-history arguments.
- Actual post-execution output was observed before its model-visible body was replaced. OpenCode and OMP retained content in display metadata; the result is not comprehensive redaction.
- Denial produced a correlated tool error without the ordinary post callback or watched-file access. Pi and OMP still emitted native execution-start/end notifications.
- ZCode appended pre/post context alongside the actual result. It did not replace that result.
- OMP and ZCode each performed exactly one verified native Stop continuation. The caps were not exercised.

## Different-model final review

A separate **GPT-6.1 Sol** reviewer in the ChatGPT collaboration harness reviewed the integrated report against the raw OpenCode sample, captured official Claude documentation, and pinned Codex consumers. The primary author used GPT-6 Astra Pro.

Verdict: **PASS for this bounded research checkpoint; no material fixes required.**

The review binds the final report to SHA-256:

```text
657749d8ceab4cd0bb584afeae38ee70b0193d1134182704d56aff0a141e3512
```

Seventeen inspected files were hashed in the review receipt. Integration file-link and artifact-hash validation was explicitly left to the final packaging check.

## Precision corrections completed

The earlier integrated review identified one required scope correction: Codex approval-result exclusions must say **PreToolUse**, because a separate PermissionRequest contract exists outside the five-event scope. The report now uses that wording.

The report also spells out Codex Stop's `continue:false`, identifies post-success gating and Claude's EndConversation exception, and records Pi's argument-history disparity and OMP's retained display metadata. The OMP/Pi evidence label `recount_result_sha256` identifies its result JSON; the script hash is separately recorded.

## Evidence receipts

Raw receipts and reviewer scripts are retained in the verified archive described by [EVIDENCE.json](EVIDENCE.json). Paths below are relative to its `evidence/` root.

| Receipt | SHA-256 |
| --- | --- |
| `review/opencode-independent-recount.json` | `f1a5a8d14d7afed2846fdcf125e6f5528d37f564f8f1d7d320eccab2ff68415c` |
| `review/omp-pi-independent-receipt.json` | `7c12f9c995f6eadde99c77b1abbf8a1792c607bff8f1535313cd206d9c2b0f02` |
| `review/omp-pi-independent-addendum.json` | `bd7cded7ec1a80892edffbfed8f2fc6d26c2c02cddd6b79b7e840a14e23dbbb2` |
| `review/zcode-independent-20261012-omp-pi/receipt.json` | `9b270b63dd4af21a479609d15fbbd36c3c604c72e5619955b7d509fcdbb3a28c` |
| `review/integrated-report-claude-codex.md` | `c02cdd0bb6a31f1345f9ef6fb38a8d66fcca3570e866e238406e237092d7e9e3` |
| `review/final-cross-model-review.md` | `bbbc0f90697eac9f3ff969fc5d61ca5fbe85b07795fc4d94d552c1bb9a0d418f` |
| `review/final-cross-model-review.json` | `303d036234b37383b423f4b3142d93607db5c522a8898f30a63c9e63a6a11604` |

## Limits

These results cover fresh, noninteractive native CLI sessions and a selected built-in Read tool. The provider saw serialized messages; no claim is made about a model obeying their content. Prior startup fixtures separately cover cold resume.

File-access observations cover the controlled files, do not identify the accessing PID, and use observation times. ZCode watches the original file only; its rewritten read is corroborated by native post payload, file contents, byte count, and receiving result.

PID/group absence, original server shutdown receipts, and the recorded private-namespace checks are bounded cleanup evidence. The ZCode namespace scan recorded two unreadable or exited entries. None of these checks certifies crash cleanup or exhaustive network/descendant behavior.

The research does not qualify all tool families, permission upgrades, error inversion, multi-handler composition, continuation caps, warm session switching, or plugnz's future installation route.
