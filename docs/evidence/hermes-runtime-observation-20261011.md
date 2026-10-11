# Hermes read-only runtime identity correction

Candidate branch: `fix/evidence-backed-host-profiles`; rejected checkpoint:
`c26613b`. Scope: Managed admission only, not Hermes-native update admission.

Independent review found two genuine defects: the reader's temporary-profile
filesystem writes violated doctor's import graph; and invoking `hermes
--version` could execute checkout recovery before flags, independent of HOME.
Python imports could also create bytecode in the source/interpreter tree.
Official evidence is the pinned
[`_launchers.py`](https://github.com/NousResearch/hermes-agent/blob/dce1e9b37581dd62e480a9064dc04a709c2940d3/hermes_cli/_launchers.py)
and
[`_early_recovery.py`](https://github.com/NousResearch/hermes-agent/blob/dce1e9b37581dd62e480a9064dc04a709c2940d3/hermes_cli/_early_recovery.py).

The correction never launches Hermes or Python. Lifecycle-only code reads the
selected executable's recognized source binding and queries that root with
read-only Git. Unknown launcher layouts fail as `capability.unverified` with
the missing proof and supported recognition documented. Existing evidenced
`c0d7294` and `dce1e9b` profiles are retained, not widened.
The older revision's official
[`pyproject.toml`](https://github.com/NousResearch/hermes-agent/blob/c0d7294769a38c17ceae51d8f7995e66e1dcae27/pyproject.toml)
declares the same `hermes_cli.main:main` Python console entry point; the newer
native bootstrap is a distinct recognized binding, not assumed historical.

RED evidence: `bun test test/doctor-imports.test.ts
test/host-profile-admission-public.test.ts -t 'filesystem|interrupted'` failed
both protections on `c26613b`. The external disposable startup sentinel
rewrote `.git/hermes-update-pull`, created `recovery-sentinel`, and generated
Python bytecode before the CLI ultimately refused an unknown profile.
This sentinel represents the documented recovery-before-arguments boundary;
it does not claim to test every native recovery algorithm. The final fixture
uses a real disposable Git checkout, source, interpreter-state directory and
interrupted-update marker; before/after snapshots require zero writes.

Fresh official source remains `/tmp/plugnz-hermes-source-proof` at exact
`dce1e9b37581dd62e480a9064dc04a709c2940d3`, independently cloned with its own
interpreter/dependencies. The native loader test imports only this isolated
source. Positive public-CLI tests recognize its actual editable uv entry point
and the official generated native bootstrap through a literal forwarder.
Full source/venv/Git-metadata content digests before and after each public
probe require no writes. Official launcher generation itself runs separately
under temporary HOME/profile/XDG and `python -I -B`; the generated launcher is
read, never executed, by plugnz.

No real installed checkout subprocesses or home deployments were used for
this correction. Retained source/worktree allocation remains about 242 MiB
under the authorized 400 MiB ceiling. No broad compatibility interval, model
turn, gateway injection, or Native route equivalence is claimed. Earlier
possible installed partial-clone object-cache mutation remains disclosed in
the previous evidence; this correction does not erase that incident.

## Verification

- `bun run check`, `bun run build`, `git diff --check`: passed.
- Doctor/host/route focused gate: 15 passed, 122 assertions, 0.77 seconds.
- `HERMES_SOURCE_ROOT=/tmp/plugnz-hermes-source-proof OPEN_PLUGIN_TEST_PACKED_NODE=/usr/bin/node bun test test/hermes-native-loader.test.ts test/host-profile-admission-public.test.ts test/hermes-batch-public.test.ts`:
  9 passed, 74 assertions, 27.53 seconds. This includes the interrupted native
  startup sentinel, loud unknown-layout refusal, preserved supported revisions,
  source-free retirement, and actual official source/launcher digest protection.
- A larger 64-test public/route run had 62 passes and two 5-second timeouts
  (`sync updates an independent pair...`, `add --target dcode after a planner...`).
  Both passed individually with `--timeout 20000` (8.91 and 3.98 seconds).
  The first run and retries are retained; this is not a claim that the larger
  run was green. Independent combined-tree/full-gate review remains required.

The initial full-tree digest test exceeded Bun's default 5-second timeout;
the isolated source attestation test now has an explicit 30-second test bound.
No skill revision or causal skill-improvement claim is made.

## Whole-template correction after `ca67044`

Root review found that prefix/import/suffix recognition still allowed an
arbitrary middle statement to redirect `sys.path`; the console body and
editable finder likewise were only partially checked. Fresh public subprocess
regressions reproduced both native-middle and console-prelude spoofs as
successful deployments (exit 0) before correction. Both now refuse as
`capability.unverified`, with unchanged source, native store, ownership ledger
and ambient home. Additional precedence/finder regressions cover foreign
venv-bin modules, site-package modules, extra `.pth` data and injected finder
code. These are recurrence checks, not held-out skill evaluation.

Templates in `src/hosts/hermes-launcher-templates.ts` are frozen from the
official isolated dce generator, the actual uv editable entry point, and its
setuptools 83.0.0 finder. No arbitrary executable middle is permitted; data
slots must remain static, root-contained literals. Normalized SHA-256 values:

- Native bootstrap: `223cda4c44458d0819b2007007ba9abb98787af26f4be4ff4fa448dc63e97309`
- Editable finder algorithm: `737fcd335c87eb12e1adcb6364783c723d163414bf5888c4ef60bc6f265bb642`
- uv console body: `cb72b238a2cc040f10a1914b6a68acc2fe439765d13afe43d647093115c28eaa`
- Allowed uv `_virtualenv.py`: `cfb3db86aaa53bb62b5ff764970bec2d71c9228590a0ebec57f6ec926cc0bf1a`

Editable import closure refuses unknown `.pth` hooks, system-site inclusion,
ambient Python source overrides and module/customization shadows. This is
explicitly layout evidence, not a new release exclusion. A valid but different
installer body/finder/hook requires an independently derived whole-template
proof before admission; it does not become supported through a matching marker.
The real isolated native generator and uv entry point are rechecked against
full source/venv/Git digests; neither selected launcher is executed by plugnz.

Whole-template verification: focused doctor/host/Hermes routes passed 22 tests
with 181 assertions (11.17 seconds). Packed Node plus actual isolated native
loader/launcher proof passed 15 tests with 110 assertions (24.83 seconds).
The final finder data refinement additionally requires each mapping/namespace
path to be the canonical source-relative path for its module name, rather than
an arbitrary different subtree. The actual official loader/launcher proof was
rerun after that refinement. Typecheck and packaged build passed.

## Venv configuration and sourceless-import correction after `09c55a3`

Independent review found two remaining static-observation admission holes.
The old regex accepted a false config line even when a later duplicate enabled
system-site packages, and it ignored `bin/pyvenv.cfg`. Source-only shadow checks
also missed Python's sourceless and extension loaders.

Primary runtime evidence is CPython 3.13.14's
[site.venv](https://github.com/python/cpython/blob/v3.13.14/Lib/site.py#L542-L589):
site initialization checks the executable-directory config before the parent
config and assigns each encountered key in order. Its
[import loader list](https://github.com/python/cpython/blob/v3.13.14/Lib/importlib/_bootstrap_external.py#L1669-L1686)
includes platform extension, source and sourceless bytecode loaders. This is
why matching one false line or examining only `.py` files is insufficient.

Nine fresh public actual-add regressions reproduced exit 0 on `09c55a3` before
the correction: conflicting config keys, duplicate identical keys, bin config
precedence, site sourceless modules, bin tagged extensions, site extension
customization, source sourceless customization, venv-helper extensions and
editable-finder sourceless files. Command:
`bun test test/host-profile-admission-public.test.ts --test-name-pattern 'config|sourceless|extension'`.
RED result: nine failed, one existing config-only case passed, 4.08 seconds.

Admission now requires an unambiguous, unique-key root config explicitly
disabling system-site packages and refuses a bin config as an unproved layout.
All examined bin/site/source shadow roots reject package directories, `.py`,
`.pyc`, and plain/tagged `.so`/`.pyd` files, retaining only the specifically
attested source package and helper source files. The same guards protect
editable finder and venv helper names. No Python execution or dynamically
evaluated suffix discovery was added; this is conservative layout recognition,
not a new compatible release interval or an assertion of incompatibility.
Both proved revisions and actual official launcher forms remain admitted.

Verification:

- `bun test test/host-profile-admission-public.test.ts test/doctor-imports.test.ts test/hermes-lifecycle-route.test.ts test/hermes-batch-public.test.ts`:
  31 passed, 235 assertions, 17.42 seconds; after the additional conservative
  debug-extension suffix recurrence check, 32 passed, 241 assertions, 19.79 seconds.
- `bun run check` and `bun run build`: passed.
- `HERMES_SOURCE_ROOT=/tmp/plugnz-hermes-source-proof OPEN_PLUGIN_TEST_PACKED_NODE=/usr/bin/node bun test test/hermes-native-loader.test.ts test/host-profile-admission-public.test.ts test/hermes-batch-public.test.ts`:
  24 passed, 164 assertions, 21.45 seconds, including official isolated loader,
  launcher forms and complete source/venv no-write digests. The final debug
  extension suffix candidate also passed: 25 tests, 170 assertions, 35.44
  seconds (focused and packed gates overlapped in that rerun).
- Allocated source plus worktree remains 242 MiB under the approved 400 MiB
  ceiling. No real installed launcher, Python or installed-checkout Git call
  was used for this correction. Earlier object-cache uncertainty is unchanged.

The native/finder/console template hashes above are unchanged. No skill files
were revised; these are product regression checks, not skill-improvement scores.
Independent frozen-candidate review and the separate full/all-host Native gate
remain required.

## Combined main acceptance gate

Frozen combination `b6a80e41c9d91a9da8ebe7ef8b8d6c8cc386daa4` preserves
the host corrections through `3e7eefc` and released main `d6428f0`. Typecheck
passed. Its unmodified full suite finished with 690 passes, six explicit skips,
one failure and 4549 assertions in 258.65 seconds. The failing Cursor scenario
hit its default five-second test deadline; Bun killed its active CLI, causing
an empty-JSON parse failure. It passed isolated without a timeout override:
one test, ten assertions, 3.46 seconds. Only this multi-CLI test's deadline is
now explicitly 20 seconds; assertions and production timeouts are unchanged.
A fresh full gate is required before integration; focused success is not it.

Retained logs under the existing `plugnz-evidence/20261011` directory:

| Log | SHA-256 |
| --- | --- |
| `plugnz-b6a-host-combined-full-failure.log` | `416124623182000e584bc63c2e45cb792bd9f4155467fe31a0152172f2e58deb` |
| `plugnz-b6a-cursor-retirement-isolated.log` | `45dea4b6e1bae38d315e4b63a2b1a99c721edc5ef0b7f1cf9f70d34e2cfc8648` |
