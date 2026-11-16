# Dcode native manual skills, 2026-11-16

Verified with the installed **deepagents-code 0.1.83** and its real Python
interpreter, in an isolated HOME/DEEPAGENTS_HOME. No model service or network
credentials were used; a LangChain fake model captured the actual middleware
request. Production plugin stores and ledger were not changed by this probe.

`test/dcode-manual-skills-native-probe.py <projected-fixture-root>` exercises
normal native installed-plugin discovery, manifest `pythonExtensions`, the native
extension registrar, native `PluginSkillsMiddleware`, and a real LangChain agent
graph. The fixture contains an ordinary skill and a manual skill with
`disable-model-invocation: true`, projected by `projectDcodeManualSkills`.

Observed output:

```json
{"nativeVersion":"0.1.83","extensionErrors":[],"frontendSkills":["probe@local:ordinary","probe@local:manual"],"manualExplicitContentLoaded":true,"ordinaryModelVisible":true,"manualModelVisible":false,"modelCalls":1}
```

The frontend catalog uses Dcode's independent `list_skills`; explicit content
loading uses native `load_skill_content` with a containment root. The generated
middleware filters only exact skill paths belonging to its own installed plugin.
It leaves authored skill files and preexisting extension entries intact. Unique
middleware names allow multiple installed plugins to retain their own filters.
Dcode's native model skill workflow exposes skills through catalog metadata and
filesystem tools; its native agent has no dedicated `load_skill` invocation tool.
This projection does not add filesystem access controls.

Admission requires the effective experimental flag and successful native runtime
qualification: exact 0.1.83 distribution, native extension registrar, enabled
native extension settings. With the parent flag unset, only the exact native
Python launcher plus the approved `os.environ.setdefault` preface counts as
feature activation. Explicit parent opt-out refuses. An unknown interpreter or
launcher, or disabled native extensions, refuses manual-skill admission. User
invocation restrictions remain unsupported.

Initial native discovery rejected a synchronous extension factory; Dcode requires
`async def extension(api)`. The accepted projection uses the asynchronous factory.
The native SDK omits internal skills metadata from final graph output; acceptance
therefore checks the actual captured model request, not a final-state shortcut.

## Required Addy persona projection

The same qualified native-extension route admits strict bare personas through
`agentPolicy: prompt-commands`. It does not require authored plugin commands.
Each canonical `agents/*.md` with only `name` and `description` becomes a generated
`skills/persona-<name>/SKILL.md`: the complete original prompt body, an explicit
user invocation, and disabled model invocation. Original agent files remain
byte-identical. Model/tools/permissions metadata, portable agent configuration,
and wrapper collisions refuse; authored plugin commands remain unsupported.
This is prompt-resource delivery through explicit user skills, with no claim of
native agent registration.

Actual Addy source was installed through the public CLI with the real Dcode
0.1.83 runtime and native file lock, using an isolated HOME:

```text
bun bin/plgnz.mjs add /home/charlesfengyc/personal/dist/plgnz/plugins/addy --target dcode --json
summary.result=converged, nativeId=addy@local
```

`test/dcode-persona-native-probe.py <isolated-home> addy@local <source-root>`
then verified normal native plugin/extension discovery, independent frontend
catalog/content loading, preserved source agent bytes, and the actual model
request through the native skill middleware and extension:

```json
{"nativeVersion":"0.1.83","nativeId":"addy@local","extensionErrors":[],"frontendSkillCount":38,"personaFrontendNames":["addy@local:persona-web-performance-auditor","addy@local:persona-test-engineer","addy@local:persona-security-auditor","addy@local:persona-code-reviewer"],"personaExplicitBodyLoaded":true,"originalAgentBytesPreserved":true,"personaModelVisible":false,"ordinaryModelVisible":true,"modelCalls":1}
```

The isolated artifact is under `/tmp/dcode-addy-native-public-20261116/` and
contains the public report plus the complete installed candidate. Production
native stores were not modified by this lane.

## Native bytecode stability protection

A native Dcode import originally created
`__pycache__/.plgnz-manual-skills.cpython-313.pyc`, changing the immutable plugin
projection. The adapter now reuses the exact Hermes companion guard through
`src/python-bytecode-cache.ts`: an empty `__pycache__` directory with mode `0555`
**and effective write denial**. Mode bits alone do not qualify a runtime user
that can bypass them. Hermes keeps its existing facade, error strings and guard
behavior. No bytecode entries are ignored by fingerprints or deleted as cleanup.
An authored cache is preserved and projection refuses to replace it.

The Dcode guard applies to adapter-owned generated extensions during observation,
direct prior inspection, immutable activation and readback. Mode drift refuses
even though directory permissions are absent from content fingerprints. Nonempty
cache drift refuses while retaining its bytes for inspection.

Fresh public Addy install, unsuppressed native frontend/model use, then another
public read-only add were exercised in
`/tmp/dcode-addy-bytecode-protected-20261116/`. Native output recorded
`bytecodeSuppression=false`, `nativeCacheWritable=false`, `nativeCacheMode=365`
(octal `0555`), and `nativeCacheEntries=[]`. The subsequent public report contains
`action=unchanged`, `activationState=active-conforming`, `changed=false` and
`summary.result=converged`. The four explicit persona skills still load their
complete bodies and stay hidden from the model; ordinary skills stay visible.

A separate actual `sudo` probe against the protected fixture recorded
`effectiveUid=0, privilegedWriteRefused=true`; it did not import the native Python
extension as root. Focused Dcode/Hermes guard and lifecycle tests: 42 passed,
268 assertions, 0.728 seconds. Typecheck passed.
