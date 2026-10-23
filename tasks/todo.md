# Portable-agent parity issue index

Canonical status: [GitHub milestone](https://github.com/archeism/plugnz/milestone/2). Decision map: [Map native portable-agent parity across supported harnesses](https://github.com/archeism/plugnz/issues/91).

This file is a navigation index; acceptance checklists and status live on GitHub.

## Owner-deferred follow-ups

- [ ] Cursor #96/#105: revisit plugin model stripping and the runtime Task-model convention during the next daytime session; no implementation in this increment.
- [ ] Kimi #97: plugin agents work in Kimi Code 2.1.1, but agent files cannot select a model. Wait for a native per-agent model contract.
- [ ] Hermes #98: needs upstream named-agent registration and per-agent model selection; do not substitute a custom delegation runtime.
- [ ] DCode #100: plugin discovery explicitly excludes agents. Separate user/project agents are assistant-scoped; no standalone registration cutover was authorized.

Charles explicitly deferred all four. Ship verified OMP, OpenCode and Grok support plus Pi warning/skip; these TODOs remain open and are not parity claims.


| Stage | Work | Blocked by |
| --- | --- | --- |
| Decision | [Choose native agent registration for OMP and Cursor](https://github.com/archeism/plugnz/issues/92) | — |
| Decision | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) | — |
| Decision | [Decide native agent routes for Pi and OpenCode without a custom runtime](https://github.com/archeism/plugnz/issues/94) | — |
| Decision | [Decide how explicit model mappings respect native fallback policy](https://github.com/archeism/plugnz/issues/104) | — |
| Decision | [Remaining Cursor native route](https://github.com/archeism/plugnz/issues/105) | — |
| Decision | [Pi existing-extension dependency](https://github.com/archeism/plugnz/issues/106) | Owner chose warning/skip |
| Delivery | [Portable agents: deliver native OMP integration](https://github.com/archeism/plugnz/issues/95) | [Choose native agent registration for OMP and Cursor](https://github.com/archeism/plugnz/issues/92); [Decide how explicit model mappings respect native fallback policy](https://github.com/archeism/plugnz/issues/104) |
| Delivery | [Portable agents: deliver native Cursor integration](https://github.com/archeism/plugnz/issues/96) | [Remaining Cursor native route](https://github.com/archeism/plugnz/issues/105); [Native fallback policy](https://github.com/archeism/plugnz/issues/104) |
| Delivery | [Portable agents: deliver native Kimi integration](https://github.com/archeism/plugnz/issues/97) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: deliver native Hermes integration](https://github.com/archeism/plugnz/issues/98) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: deliver native Grok Build integration](https://github.com/archeism/plugnz/issues/99) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: deliver native DCode integration](https://github.com/archeism/plugnz/issues/100) | [Choose native agent registration for Kimi, Hermes, Grok Build and DCode](https://github.com/archeism/plugnz/issues/93) |
| Delivery | [Portable agents: warn and skip Pi without failing](https://github.com/archeism/plugnz/issues/101) | [Owner's Pi scope decision](https://github.com/archeism/plugnz/issues/106) |
| Delivery | [Portable agents: deliver native OpenCode integration](https://github.com/archeism/plugnz/issues/102) | [Decide native agent routes for Pi and OpenCode without a custom runtime](https://github.com/archeism/plugnz/issues/94) |
| Acceptance | [Accept portable-agent parity and publish the support matrix](https://github.com/archeism/plugnz/issues/103) | Current increment: OMP, Grok, Pi warning/skip, OpenCode; four other deliveries explicitly deferred |
