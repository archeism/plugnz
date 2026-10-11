# Hermes source import-shadow regression receipt

Baseline: `92469c6`, production Claude Source guard `30ac366`; Bun 1.4.0
first in PATH for the runner and fixture subprocesses. Independent review
found native `hermes_bootstrap.so` and editable `hermes_cli/main.so` admission
despite Python extension precedence. Native recognition had returned before
shadow validation; editable validation had not descended into its source package.

The public RED uses an ordinary skill-bearing plugin, recognized launcher
bodies and exact supported revision identities. All ten original cases
(five alternatives × native/editable launchers) unexpectedly installed with
exit 0. The two inert-untracked-document controls passed. RED log SHA256:
`7bcbddbae1eb1c1b13bd0cf1b348b302892fcc79d538e8c0139d6a830eac7035`.
The first empty-plugin fixture attempt is also retained; its internal-defect
failure was not an authentic admission repro. It was corrected, not called RED
evidence for a successful mutation.

The fix checks source module/package alternatives read-only in both launcher
paths, including nested initializers, tagged extensions, namespace-package
alternatives and module/package collisions. Editable launchers also check their
bin/site roots for source root-module shadows. The traversal excludes hidden
repository/venv trees and bytecode cache directories, has a 20,000-entry read
bound and does not reject ordinary untracked documents. No Git cleanup,
Hermes/Python source execution or writer import into doctor was added.

The test's `/usr/bin/python3 -I -B` standard-library `PathFinder.find_spec`
probe independently selects `ExtensionFileLoader` for `hermes_bootstrap.so`,
`hermes_cli/main.so` and `hermes_cli/__init__.so`. It never loads these bodies
or imports Hermes; source bytes remain unchanged. Every public negative asserts
`capability.unverified` and unchanged runtime, native store, ledger and ambient
home. Controls actually install and preserve inert documents/runtime bytes.

Focused command:
`bun test test/host-profile-admission-public.test.ts test/hermes-lifecycle-route.test.ts test/doctor-imports.test.ts`.
Result: **50 passes, 330 assertions**, 17.35 s wall, peak RSS 99,752 KiB;
typecheck exit 0. Focused log SHA256
`5e73e9dccab496d9efe08c6454b130c0c8bf53ad17c796c9b2e9258c7dc54387`.
Built-artifact Node 22.23.1 gate uses
`OPEN_PLUGIN_TEST_PACKED_NODE=/home/charlesfengyc/.local/bin/node`: same
50 passes / 330 assertions, 11.90 s wall, peak RSS 100,140 KiB. Packed log
SHA256 `15f5ecbd9f2e35c7c9481f3cb0e39bb1f7e2a988958d3dcf6e71d485c760d57b`.
Artifact SHA256 `60ca98561c9622eaebda35d2e5addf76bbd5c69287bd9be913980f6ce9a71d0b`.

Actual official-source admission was checked again against the **previously
isolated**, retained `/tmp/plugnz-hermes-source-proof` checkout at supported
`dce1e9b37581dd62e480a9064dc04a709c2940d3`: its installed uv console and the
recognized native template both passed public `add --dry-run` with real Git
identity observation. No Hermes executable, source import, model, installed
runtime checkout or native real-home deployment was invoked. Entire scratch
source/Git/venv digest stayed
`a9f22771271347bc3717b7516397c57d5d843b23a1d45d473475055c987c8cc8`,
native store and ledger remained unchanged. The first probe's `print` typo is
retained; the corrected retained script exits 0 (4.88 s, peak RSS 189,936 KiB).
Script SHA256 `ed9bb94e530807c4f248544902e9e30b26bcf2fecbdbfd3d0b358e2030b82ba1`;
output SHA256 `ff9a77d512b6e762775ae5ba996fe8a0459ee6611e1f1ee290dea4e0d665defd`.

All logs/scripts above are retained under
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/` as
`issue35-hermes-source-shadow-*`; their combined allocated size is 88 KiB.
No new source/native copies or Sandbox snapshots were created.
This closes the demonstrated import-shadow paths, not an attestation of every
untracked file or arbitrary Python import customization. Prior actual loader
proof remains separate; no Hermes Native-update route is newly admitted.
Skills are unchanged. Whole-branch independent re-review and a fresh combined
full gate remain integration requirements.
