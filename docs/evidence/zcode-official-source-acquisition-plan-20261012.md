# Official-source ZCode acquisition plan

This is a measured pre-launch plan, not a successful acquisition, build, or
Native proof. No ZCode Sandbox was launched from this checkpoint.

## Supplier boundary

The required supplier remains unpatched official Source
`zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`, with Node
`24.14.0`, pnpm `10.33.2`, and the authoritative root lockfile. The pinned
`apps/zcode-cli/package.json` is private and identifies CLI `0.16.9`; its
`@zcode/cli` workspace package is private and identifies package version
`0.1.0`. There is no corresponding published npm CLI artifact.

The official GitHub release API exposes only `v3.14.3`, with a 185,386,581-byte
macOS ARM DMG and a 150,014,088-byte Windows x64 executable. Its annotated tag
resolves to `29628c9acdb81b703bbd4080c207a0e7ce5e276e`, one commit after the
pinned Source. The compare API reports changes in CLI implementation, build
scripts, and `pnpm-lock.yaml`. Neither platform asset nor the newer revision is
an exact substitute for the pinned Linux source build.

## Measured inputs

The root lock has 1,881 package entries. The prior frozen filtered install
planned 1,859 packages. Registry metadata for the pinned lock identifies 1,636
packages applicable to Linux x64 glibc. A one-byte range request to every
immutable registry tarball supplied an exact aggregate compressed length of
432,452,312 bytes. Published `dist.unpackedSize` values cover 1,560 of those
packages and total 1,696,408,662 bytes; 76 older packages omit unpacked-size
metadata, so this is a lower bound, not a full allocation estimate.

| Input | Compressed bytes | Expanded/logical bytes |
| --- | ---: | ---: |
| Applicable locked npm package bodies | 432,452,312 | at least 1,696,408,662 |
| Exact GitHub Source archive | 39,836,580 | 72,117,118 |
| Node 24.14.0 Linux x64 archive | 31,039,304 | 192,909,682 |
| pnpm 10.33.2 package | 4,538,183 | 18,936,903 |
| **Known total** | **507,866,379** | **at least 1,980,372,365** |

The earlier genuine attempt grew from 725,524 KiB to 940,184 KiB in 3.58
seconds while only 82 packages had downloaded. It was correctly stopped and
did not establish a completed install or build.

The complete package sweep is retained outside Git at
`~/.local/state/plugnz-evidence/20261012/zcode-acquisition-budget/zcode-lock-package-budget.json`
(930,294 bytes, SHA256
`616276bfcc14cd69072aaf0608b1e653d8c71ba3c7f00883061f2ae0fdbe3c0d`).
It can be regenerated with `scripts/zcode-source-budget-measure.mjs` (SHA256
`e2ce330e25f9b7b5ffdf7b4eb98e2f36e6664f33abf4b05243a6e199fdc883d0`).
The prior allocation/download log is retained at
`~/.local/state/plugnz-evidence/20261011/kimi-zcode-sandbox-01/plugnz-zcode-source-install-budget-details.log`
(SHA256
`4b345612393c96bf63b8096bac4cf8a237fdb216ff95f237fda7e357b87717d1`).

## Preservation consequence

The reviewed 768 MiB acquisition controller stops unknown supplier bodies at
75% of the compressed archive cap: 576 MiB raw. The official dependency graph
must expand to at least 1.696 GB before source, runtime, build output, and the
76 unmeasured packages. That guard therefore cannot complete this genuine
supplier.

The controller also sums each inventory path. pnpm may hardlink files between
its store and workspace, so path-summing can count the same retained inode
twice even though the namespace-safe tar encodes a same-filesystem hardlink
once. Its archive precheck likewise compares raw logical bytes to the compressed
archive cap. Merely raising `archiveBytes` would conflate two different bounds
and is not an acceptable repair.

An earlier draft proposed keeping the 768 MiB archive cap while accepting 2.5
GiB raw. That is rejected: an incompressible partial or generated body can fit
the raw limit but overflow the archive, leaving stopped evidence stranded on a
nonpersistent VM.

## Proposed private large-acquisition profile

Before launch, independently review a proof-tooling-only controller change with
these explicit bounds:

- inventory every trial and supplier path, but measure retained regular bodies
  once per `(device, inode)` for the raw preservation ceiling;
- acquisition-only raw retained-body ceiling: 2.5 GiB;
- archive ceiling: 2.75 GiB, covering the entire raw ceiling plus 256 MiB for
  tar entries, names, gzip expansion, and end records without assuming useful
  compression;
- whole-filesystem growth ceiling: 6 GiB;
- remote archive/staging reserve: 2.875 GiB (archive plus 128 MiB staging
  margin);
- local archive-plus-fresh-restore floor: 6 GiB;
- 2 vCPU / 4 GiB, nonpersistent 45-minute Sandbox;
- preservation reserve: 780 seconds: 15 seconds to stop, 15 to settle, 360 to
  archive, 300 to download, and 90 seconds of margin.

The reserve is grounded in the completed Codex acquisition rather than the tiny
method probe. Its 218,988,131-byte archive took at most 20.66 seconds to create
and 16.48 seconds to copy. Linear 2.75 GiB projections are about 279 and 222
seconds. The proposed timeouts leave 81 and 78 seconds respectively, plus the
separate 90-second pipeline margin. The 45-minute Sandbox leaves 32 minutes for
source acquisition/build before the preservation deadline.

The large profile must remain private to this experiment; the 100 MiB Native
and 768 MiB Codex acquisition profiles stay unchanged. Its monitor must retain
all path inventories while deduplicating only same-device/same-inode regular
bodies for capacity. It must include trial data as well as non-omitted supplier
data, conservatively project tar header/name/end-record overhead, and stop with
256 MiB raw headroom. The prior genuine attempt's fastest observed half-second
growth was 79,128 KiB, below that margin. Crossing a bound must still produce a
complete failed archive and fresh restore; owned Source/compiler data cannot be
omitted merely because it is reproducible.

Required focused tests are:

1. same-inode trial/supplier aliases count one body but preserve every path;
2. scaled incompressible raw-at-limit data plus long-name/empty-entry overhead
   archives and restores within the corresponding archive bound;
3. a fast partial writer crosses the stop threshold, reaches zero owned
   processes within the declared stop bound, and its entire stopped prefix is
   archived and freshly restored;
4. copied (different-inode) equal bodies count separately;
5. sparse files, symlinks, and hardlinks cannot understate the projected tar;
6. the large profile rejects insufficient remote reserve, local free space,
   lifetime reserve, or any attempt to alter the smaller existing profiles.

This is a budget, not a throughput or fit claim. The current machine has only
about 5.5 GiB free, below the proposed local floor, so launch remains blocked
even after a reviewed implementation exists.

The contained command will verify the exact Source revision and clean tracked
state, use the root frozen lock, install the official filtered workspace, run
the official `apps/zcode-cli` build, require the built CLI to report `0.16.9`,
and record exact output hashes and modes. No source patch, relaxed lock, nested
lock, npm substitute, community extraction, real home, or LLM call is allowed.

After an independent fresh restore accepts that acquisition, a separate small
Native arm can use only the exact restored CLI artifact and frozen C72 producer.
That later arm retains the 100 MiB Native archive ceiling and must prove the
requested two-physical-ID migration and global duplicate-ID refusal. A source
build alone grants no Native capability claim.
