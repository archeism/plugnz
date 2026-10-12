# ZCode exact-source supplier workflow (not launched)

Question: can the genuine, unmodified official CLI supplier be acquired and
built within a fully preserved isolated attempt, before testing plugnz Native
lifecycle behavior? Acceptance requires successful upstream build and actual CLI
version readback, then independent verification of the entire stopped archive.
This checkpoint is an inert workflow, not a successful build or capability proof.

## Verified source requirements

The supplier is [zai-org/ZCode at 872ad960](https://github.com/zai-org/ZCode/tree/872ad960de7ec172591f7e1952f7849229f94521).
Its [application manifest](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/package.json)
identifies CLI `0.16.9`, exact Node `24.14.0`, pnpm `10.33.2`, and upstream
`build = turbo run build`. The separate private
[@zcode/cli workspace manifest](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/cli/package.json)
uses package version `0.1.0`; that is not the reported CLI version.

The earlier hypothesis that this supplier needs Bun is not supported by its
build graph. The [official CLI builder](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/cli/scripts/build.mjs)
uses Node plus esbuild, writes a Node shebang and mode `0755` to
`dist/zcode.cjs`, targets Node 22 syntax, and keeps `@zcode/tui`, `playwright-core`,
and `koffi` external. The
[TUI builder](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/tui/scripts/build.mjs)
also uses Node/esbuild and retains package-relative native/worker dependencies.
The installed [OpenTUI fork metadata](https://registry.npmjs.org/@mbears%2fopentui-core/0.2.15)
declares Node >=22, but includes `bun-ffi-structs`. This does not establish every
interactive runtime path as Bun-free. No Bun runtime is installed by this
workflow; an actual Node CLI failure is preserved, not patched around.

The [upstream Turbo graph](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/turbo.json)
orders dependent workspace builds. The workflow runs the unmodified app build,
not a handwritten subset or SEA packaging. Whether the exact root/nested Turbo
workspace configuration succeeds remains a runtime question.

## Budget correction

The prior package measurement covered Linux x64 glibc applicability. The
[authoritative workspace configuration](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/pnpm-workspace.yaml)
also requests Darwin/Linux/Windows and x64/arm64 optional dependencies.
Therefore that measurement is a lower bound, not a complete expected frozen
installation. A shallow Git fetch also retains `.git` objects, unlike the
previous measured source tarball. No platform override, configuration edit,
dependency-pruning fallback, or lock relaxation is authorized here.

The private large-acquisition guard must preserve a failed prefix if the exact
supplier does not fit. Increasing its cap is a separate measured decision, not
something this workflow does silently. The proposed bounds remain 2.5 GiB
retained bodies, 2.75 GiB archive, 6 GiB whole-FS growth, 2.875 GiB remote
staging reserve, 6 GiB local free space, and 780 seconds preservation reserve.
The controller/profile is independently reviewed elsewhere; this document does
not approve an unreviewed profile or authorize a launch.

## Frozen contained command

Copy `test/zcode-exact-source-acquire.mjs` and its adjacent contract module into
the protected VM proof directory before the controller's baseline. Configure:

```json
{
  "operation": "private-large-acquisition",
  "evidenceRoot": "/vercel/sandbox/proof/zcode-acquire-01",
  "supplierScratchRoot": "/vercel/sandbox/native",
  "command": ["node", "/vercel/sandbox/proof/zcode-exact-source-acquire.mjs"],
  "retainedBodyBytes": 2684354560,
  "archiveBytes": 2952790016,
  "diskGrowthBytes": 6442450944,
  "diskReserveBytes": 3087007744,
  "suppliers": [{
    "root": "/vercel/sandbox/native/zcode-0169",
    "locator": "https://github.com/zai-org/ZCode.git",
    "revision": "872ad960de7ec172591f7e1952f7849229f94521",
    "integrityFiles": [{
      "path": "acquisition-identity.txt",
      "sha256": "1dcf663d41bc117f65e7334f077a526456af12ac7b09c088cdd7f46048618a1a"
    }]
  }]
}
```

The actual controller configuration must additionally supply its verified
Sandbox identity, project/team routing, SDK/CLI paths, fresh experiment UID,
actual SDK expiry, archive deadline and frozen whole-FS baseline. Require a
nonpersistent 45-minute, 2-vCPU/4-GiB Sandbox; `tar`, `xz`, `curl`, `git`,
`setpriv`, and initial Node must exist before baseline. No Sandbox is created by
these files, and no credentials or model API variables enter supplier commands.

The only permitted omission is the individually prebound 41-byte identity
marker. It is not evidence of a completed supplier. Every other download,
source/Git object, package cache/store, temporary file, lifecycle-script output,
build result and failed prefix remains inventoried and archived. No clean-up
runs inside the workflow. The controller, not child timeouts, owns complete UID
containment, preservation deadlines, stopped snapshots, archive bounds, download
and fresh-restore verification.

Node's archive is checked against the
[official v24.14.0 checksums](https://nodejs.org/dist/v24.14.0/SHASUMS256.txt);
pnpm is checked against the exact
[10.33.2 registry integrity](https://registry.npmjs.org/pnpm/10.33.2).
The source is fetched by immutable commit with depth 1; revision, Git tree,
root lock and workspace hashes are recorded before installation. The root
frozen install selects `@zcode/cli...` and `zcode-cli`, keeps upstream lifecycle
scripts and architecture policy, and uses an isolated retained pnpm store.
Both install and build must leave tracked source and root lock unchanged.
Failures record stdout/stderr/status/signal and a failure receipt. The VM's
complete stopped state remains the authoritative evidence if hard termination
prevents the helper writing its final receipt.

## Admission to a later Native proof

Require independently accepted archive SHA256, full path inventory, modes,
symlinks and restored bodies; exact Git revision/tree and immutable tool archive
integrities; exit-zero install/build; clean tracked source; unchanged root lock;
and actual CLI `--version` reporting `0.16.9`. The later native arm must use the
entire restored supplier closure, not copy only `zcode.cjs`: its external TUI,
Playwright and native-library packages need their installed relative paths.
Use a different unprivileged UID, freeze supplier bytes, and independently
attest the complete supplier before and after that arm.

This workflow neither implements nor proves historical two-physical-ID migration,
native update, duplicate-ID handling, skill discovery, interactive invocation,
or a real user installation. Those remain separate production and Native gates.

## Verification at this checkpoint

Focused contract suite: seven passing tests, 17 assertions under Bun 1.3.14.
The archive-member regression was first RED (missing validator), then GREEN.
Initial contract checks were source-driven checks, not claimed RED-first proof.
`node --check` validates acquisition syntax; no acquisition/install/build command
was executed. Full product gates belong to the combined candidate integration.
Skills are unchanged; this is a supplier-proof method artifact, not a measured
skill improvement.
