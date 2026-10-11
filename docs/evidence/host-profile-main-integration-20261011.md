# Reviewed Claude/Hermes integration

Main parent: `bd2d06f34639cf589547089c96db4ff0e6cceebc`.
Host parent: `4847f25e44f401d2a9042386a241966859e42b03`.
Frozen tested combined tree: `fe591b1619ebfd88c5aecd1af415f23f11ea6443`.
The merge was automatic, not replacement with the host branch's older base.
Current main recovery contracts remain present. This receipt is added after
verification; no production changes follow the tested tree.

Both independent whole-branch reviews approved the contributions from merge
base `4c4bbe3`, including the Hermes import-shadow correction. Approval is
bounded to the documented pinned Claude profiles and nonexecuting Hermes
runtime admission, not arbitrary Python customization or a new Hermes Native
update capability. Existing actual native evidence archives were independently
restored and checked before their Sandboxes were stopped.

Root combined gate, Bun 1.4.0 on the runner and fixture child PATH:

- `bun test`: 730 passed, 6 existing opt-in/platform skips, zero failed;
  4882 assertions, 736 tests, 64 files, 302.67 seconds.
- `bun run check`: exit 0.
- `OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node bun test`
  with the five host-profile/public/route suites: 75 passed, 2 native opt-in
  skips, zero failed; 577 assertions, 77 tests, 39.14 seconds. Public CLI
  harness uses actual Node 22.23.1 and the built artifact; imported adapter
  unit suites remain Bun tests.
- `bun test test/doctor-imports.test.ts`: 6 passed, 35 assertions, 141 ms.
- Staged and working diff checks: exit 0.

Packed candidate SHA256:
`04e97c79f3775ac5cc95bc71e4fe269559a12eb2f07094268437ccfe143ef57b`.
This is the unpublished 0.0.11-labelled candidate, not a registry release claim.
The automatically published artifact must be verified separately after push.

No real fleet rollout, external repository write, or backup deletion. NativeGit
and legacy-adoption branches remain independent unfinished lanes. The umbrella
must stay open; dcode parity still has the previously human-owned dependency.
Skills unchanged; no causal skill-improvement claim.
