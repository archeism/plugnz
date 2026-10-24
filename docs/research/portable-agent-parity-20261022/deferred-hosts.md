# Owner-deferred native agent integrations

Charles originally deferred native execution on these four hosts. He subsequently
chose loud warning/skip behavior for Cursor and Kimi, matching Pi; that is not a
native agent execution claim. Hermes and DCode remain open TODOs with unchanged
adapters. The native constraints below remain valid.

| Target | Verified constraint | Follow-up |
| --- | --- | --- |
| Cursor | CLI 2026.10.19-6bbf2c4 and editor 3.26.16 plugin-agent loaders strip model/tools and substitute model inheritance. P-stack instead instructs the parent to choose a model in its runtime Task call. | [Owner chose warning/skip](https://github.com/archeism/plugnz/issues/96#issuecomment-6382409313); [route decision #105](https://github.com/archeism/plugnz/issues/105) |
| Kimi Code | 2.1.1 discovers plugin agent files and executes native children; its file parser has no model field. Runtime model-pool arguments are a different contract. | [Owner chose warning/skip](https://github.com/archeism/plugnz/issues/97#issuecomment-6382409586) |
| Hermes | Revisions `7dbbb0f4a6ebeec9a8714ec37fa41340fe9e4e00` and `73456e11739f` have no named-agent registrar/per-agent model selector. `delegate_task` uses global delegation settings or parent inheritance. | [#98 owner deferral](https://github.com/archeism/plugnz/issues/98#issuecomment-6369901291) |
| DCode | `deepagents` revision `b4ac8829692785a221150658401ae558f4bff3f3` explicitly excludes agents from plugin inventory. User/project agent directories are separate, assistant-scoped stores. | [#100 owner deferral](https://github.com/archeism/plugnz/issues/100#issuecomment-6369901932) |

## Kimi native evidence

Actual Kimi Code, not the separate Python `kimi-cli` product:

- Binary 2.1.1, SHA-256 `4bab6f96c2c289368b7f05a04f66737c53a59ce740f932d8f149240584758efb`.
- Isolated `KIMI_CODE_HOME` on `macbook-air`, plugin manifest `agents: "./agents/"`.
  Native profile discovery advertised `reviewer` before a network request.
- Deterministic loopback `/v1/chat/completions`: 25 captured requests, including
  12 child requests. All used `echo-model`; child instructions came from the agent
  body, with native tools. No paid/provider inference.
- Binary bundle `workspaceAgentProfileLoader/internal/agentFile.ts` parses name,
  description, whenToUse, override, tools/disallowedTools and subagents, but no
  model. `PluginService.pluginAgentRoots()` supplies enabled plugin roots to the
  native catalog. This newer route corrects the earlier 2.0.1-only investigation.
- Raw source, probe scripts and requests retained on `charles-netcup` at
  `/root/.local/state/plugnz-native-parity/kimi-source/`; wire log:
  `evidence/kimi-2.1.1-loopback-requests.jsonl`. Remote scratch homes were removed;
  the live Kimi installation/configuration was not changed.

## Boundary

No silent model dropping, parent-prompt convention, standalone registration or
custom agent runtime substitutes for the deferred mapping contract. Grok Build's
native loader is a separate supported route; see its versioned qualification.
