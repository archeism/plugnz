# Portable-agent parity issue index

Canonical status: [GitHub milestone](https://github.com/archeism/plugnz/milestone/2). Decision map: [Map native portable-agent parity across supported harnesses](https://github.com/archeism/plugnz/issues/91).

This file is a navigation index; acceptance checklists and status live on GitHub.

## Owner-deferred follow-ups

- [ ] Hermes #98: needs upstream named-agent registration and per-agent model selection; do not substitute a custom delegation runtime.
- [ ] DCode #100: plugin discovery explicitly excludes agents. Separate user/project agents are assistant-scoped; no standalone registration cutover was authorized.

Hermes and DCode remain deferred. Cursor and Kimi instead use the owner-approved warning/skip contract, alongside Pi; native execution on those three is not claimed. OMP, OpenCode and Grok retain their qualified native support.


| Stage | Work | Blocked by |
| --- | --- | --- |
| Decision | [Choose native agent registration for OMP and Cursor](https://github.com/archeism/plugnz/issues/92) | — |
| Decision | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) | — |
| Decision | [Decide native agent routes for Pi and OpenCode without a custom runtime](https://github.com/archeism/plugnz/issues/94) | — |
| Decision | [Decide how explicit model mappings respect native fallback policy](https://github.com/archeism/plugnz/issues/104) | — |
| Decision | [Cursor warning/skip route](https://github.com/archeism/plugnz/issues/105) | Owner chose warning/skip |
| Decision | [Pi existing-extension dependency](https://github.com/archeism/plugnz/issues/106) | Owner chose warning/skip |
| Delivery | [Portable agents: deliver native OMP integration](https://github.com/archeism/plugnz/issues/95) | [Choose native agent registration for OMP and Cursor](https://github.com/archeism/plugnz/issues/92); [Decide how explicit model mappings respect native fallback policy](https://github.com/archeism/plugnz/issues/104) |
| Delivery | [Portable agents: warn and skip Cursor without failing](https://github.com/archeism/plugnz/issues/96) | [Owner's scope decision](https://github.com/archeism/plugnz/issues/96#issuecomment-6382409313) |
| Delivery | [Portable agents: warn and skip Kimi without failing](https://github.com/archeism/plugnz/issues/97) | [Owner's scope decision](https://github.com/archeism/plugnz/issues/97#issuecomment-6382409586) |
| Delivery | [Portable agents: deliver native Hermes integration](https://github.com/archeism/plugnz/issues/98) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: deliver native Grok Build integration](https://github.com/archeism/plugnz/issues/99) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: deliver native DCode integration](https://github.com/archeism/plugnz/issues/100) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: warn and skip Pi without failing](https://github.com/archeism/plugnz/issues/101) | [Owner's Pi scope decision](https://github.com/archeism/plugnz/issues/106) |
| Delivery | [Portable agents: deliver native OpenCode integration](https://github.com/archeism/plugnz/issues/102) | [Decide native agent routes for Pi and OpenCode without a custom runtime](https://github.com/archeism/plugnz/issues/94) |
| Acceptance | [Accept portable-agent parity and publish the support matrix](https://github.com/archeism/plugnz/issues/103) | Initial release: OMP, Grok, Pi warning/skip, OpenCode. Cursor/Kimi warning-skip follow-up tracked in #96/#97; Hermes/DCode deferred |
