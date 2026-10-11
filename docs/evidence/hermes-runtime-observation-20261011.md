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
