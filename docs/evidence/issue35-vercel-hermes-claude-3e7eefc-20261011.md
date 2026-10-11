# Fresh Vercel proof of `3e7eefc`: Hermes passes, Claude catalog blocks

This is actual isolated runtime evidence, not admission inferred from mocked
version banners. Candidate: `3e7eefc2aed498606615a1c5958ff05a521370a8`.
Packaged Node CLI SHA-256:
`b9144ed11573a2f35abd40613b595e6152d00a0081e09edf8bc1fafee4d66952`.

## Isolation and exact inputs

Vercel CLI 59.11.7 verified `charfeng1s-projects/workspace-agent-lab` as project
`prj_OhbHIc572xq4SROh5r7vAvnycCKR` using read-only project list and inspect.
Sandbox CLI 4.7.1 created `plugnz-35-hermes-3e7eefc` in iad1 with two vCPUs,
4,096 MB memory and a 40-minute timeout. No real installed harness was executed.
No paid model request, API credential, or `--plugin-dir` bypass was used.

Hermes official source was fetched directly at
`dce1e9b37581dd62e480a9064dc04a709c2940d3`, with sparse checkout of
`hermes_cli agent tools hermes_platform plugins pm gateway`. CPython 3.14.4,
uv 0.12.19 and Node 24.21.0 were the fresh Sandbox runtimes. Only bounded loader
dependencies and the no-dependencies editable distribution were installed;
this is not a complete Hermes runtime/provider installation. Exact dependency
freeze, commands and source/venv inventories are retained in the archive below.

Claude's official `@anthropic-ai/claude-code-linux-x64@2.1.295` tarball was
streamed directly into the Sandbox without a duplicate tarball/cache install.
Its downloaded bytes matched npm's integrity:
`sha512-nC9RZ6ZArEavyAiFdEtGK6/XPhjfE79tP2tCh+PjmRUxSO/6W3IuXv/rmo8c6u2UzHyvgKodRj1z6UcBGlbnyA==`.
The actual binary's `--version` reported 2.1.295.

## Hermes result: supported Managed lifecycle plus actual loader

The official `_launchers._launcher_script` generated the selected native
bootstrap. plugnz read that whole body and checked the exact source revision
without executing Hermes or Python for version detection. Actual public CLI:

1. `node plugnz.mjs sync --manifest manifest2.json --json` installed one package
   into two physical Hermes contexts: work and personal. Managed, exit 0.
2. Actual `PluginManager.discover_and_load` registered the ordinary skill as
   `agent-plugin-proof-demo-0d8b1cc0:ordinary`, excluded the user-only skill from
   model discovery, and registered `proof-demo:manual` and `proof-demo:run`.
   Their real handlers queued the expected instructions, preserving quoted
   arguments and a literal `$1`. No model turn ran.
3. Changing skill bytes while keeping package version 1.0.0, then repeating
   public `sync`, refreshed both native stores. Exit 0.
4. Moving the source aside, then public
   `retire-source <scope> --target hermes --instance work --json`, removed only
   the selected package and its command companion. Exit 0. The personal sibling,
   foreign files, unowned config fields and plugin-data sentinel were retained.
5. The actual loader after work retirement exposed no owned skill or command.

Whole source/Git/venv digest before and after each of those commands:
`2eea1df8ed01ef87a24ce0b09cc594fe5806dfed9511c5927fea398a84fc143e`.
Measured command wall times in milliseconds: launcher generator 217, install
383, loader discovery 1,752, refresh 397, retirement 285, loader readback 1,699.
Per-command stdout/stderr hashes and exact argv are retained in
`evidence-attempt2/commands.json`.

Supplementary public CLI checks admitted the actual uv 0.12.19/CPython 3.14.4
editable entry point because its entire recognized body/helper/import closure
matched the already pinned templates. A dirty tracked checkout was refused as
`capability.unverified`, with unchanged native store and lifecycle ledger.
No release interval, arbitrary installer shape, or Hermes Native-update
equivalence was added.

Two proof-harness mistakes are retained, not hidden: the first loader assertion
expected a package-name skill namespace instead of Hermes's hashed namespace;
the first supplementary no-write assertion included legitimate plugnz-owned
source snapshot cache directories. Fresh isolated homes repeated the corrected
checks. Neither was a product fix or an actual Hermes invocation for detection.

## Claude result: verified false-green blocker

The public Managed `add` exited 0 and marked `claude-proof@local` active in the
ledger, registry and settings. Actual `claude plugin list --json` listed the
install but reported `Marketplace local not found`. Actual
`claude plugin details claude-proof@local` and the short-name form exited 1.
The native debug log explicitly reported that hooks, commands, skills and
servers were not loaded because neither `known_marketplaces.json` nor
`extraKnownMarketplaces` registered the marketplace.

The native [plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference#plugin-details)
defines details as the inventory of an actually loaded plugin and documents
load errors in list JSON. This was not a missing paid session or an unsupported
details flag. The transformed native manifest contained the skills pointer and
explicit command path, but lifecycle `mutateInstall` never registered the
catalog. Legacy `claudeCodeWriter.add` has a wrapper/catalog transaction that
the newer lifecycle path omitted. Local root-only sources therefore produced
dead native installs while reporting success.

Integration is blocked pending a durable owned-catalog lifecycle fix,
collision preflight, native-aware readback, rollback/retirement preservation
and a fresh actual-loader rerun. Claude is not excluded or relabeled unsupported
to bypass this bug. No success claim covers its incomplete refresh/retirement
proof; the failure stopped that runner before those steps.

## Preservation, resources and honest limits

Raw archive:
`/tmp/plugnz-vercel-3e7-proof.uOUMIe/proof-evidence.tar.gz` (476 KiB allocated).
SHA-256: `137d5020885882301ec3730595c5a5000b5d4cbd88c0fc85a31352e5f4c76a7b`.
It retains failed/successful attempt homes and ledgers, source fixtures,
proof scripts, exact packaged CLI, stdout/stderr/debug logs, dependencies and
native/source/venv content inventories. Large official source/runtime and native
binary bodies are excluded from this small raw archive; they remain in the
stopped Sandbox snapshot, not falsely claimed as locally archived.

Real archive extraction to
`/tmp/plugnz-vercel-3e7-proof.uOUMIe/restore` verified 30 command stdout/stderr
streams against their hashes, the packaged CLI hash, both failed and successful
Hermes homes/ledgers, the failed Claude home/ledger, loader acceptance and native
rejection log. Restore command:
`tar -xzf proof-evidence.tar.gz -C <isolated-restore-directory>`.
Verifier: `/tmp/plugnz-vercel-3e7-proof.uOUMIe/verify-restore.mjs`.

Fresh source allocated 67,336 KiB before dependencies and 92,256 KiB afterward.
Final task directory 344,808 KiB, uv cache 37,520 KiB, npm metadata cache 1,876
KiB, and archive 476 KiB: total 384,680 KiB, below the 409,600 KiB active budget.
Local archive plus restored attempt files allocate 3,612 KiB; no loose full
source/native replica was made locally.

Sandbox was stopped, not removed. Session `sbx_A8HcY63fz9W7cG8Xk5pVbMWgvbuj`
reported duration 794.738 seconds, active CPU 38.905 seconds, ingress 138 MiB
and egress 795 KiB. Persistent Sandboxes automatically snapshot on stop
([official persistence contract](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes)).
Actual snapshot `snap_BvLZCdX0ZR3JKj8KWDz1csJmAIM1` is **942 MiB**, expiring
30 days after its last use. That retention size exceeds the active-store
400 MiB allowance; no cause or within-budget retention claim is invented.
The discrepancy was escalated. No snapshot/resource was deleted, no full
snapshot restore was attempted, and future cleanup requires verified complete
preservation and independent review. Reading/copying from the stopped persistent
Sandbox may auto-resume it; metadata-only list/config calls do not run a proof.

This fresh run does not erase the earlier possible real partial-clone Git
object-cache mutation disclosed in the observation correction. No skill files
were revised; this is product acceptance and diagnosis, not a claimed skill A/B.
