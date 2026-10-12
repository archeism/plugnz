# Preserved failed ZCode exact-source acquisition 01

No Native lifecycle arm ran. The official source acquisition reached the
frozen root `pnpm install`, but the private preservation monitor stopped it
when a concurrently mutating pnpm-store file disappeared between inventory and
`lstat`. This is a preservation-monitor race, not a ZCode build or plugnz
product failure. The stopped prefix is complete and retained; the supplier was
not built and is not eligible for Native testing.

## Frozen inputs and allocation

- Exact official source: `zai-org/ZCode` commit
  `872ad960de7ec172591f7e1952f7849229f94521`, tree
  `d185a9a893c00d51fc3fe51fe7371b9eea7de143`.
- Root lock SHA256:
  `a63f2497b6f61711d765be85aa3b6a4b543d792fdcc95a8c0effeaeb3d2292d5`;
  workspace SHA256:
  `f18a18233e82cda1dc40be61bf2ad1bc99de25de63ad0be64bc652761a638372`.
- Exact-source workflow `9b0ce4ccd2a48e2c31ddd9305f875543a2fc40bc` and
  preservation method `78034fa7bb6b74401305434b6336b5d8989a391f`.
- One-shot launcher `ecb7315c1ba3e4165a29ddad92682ba6dfeb523a`,
  SHA256 `a07fb19017ac2a9a90c0e9af4a9d8f87767ade037e5f8e1c391caa9bb5693a0f`.
- Official Node `v24.14.0` archive SHA256
  `41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df`
  and pnpm `10.33.2` registry integrity were verified before source checkout.

The first SDK allocation call returned `403 forbidden/invalidToken` before a
Sandbox name or session existed. Native `vercel whoami` refreshed the existing
login, an SDK list against the exact project/team then succeeded, and the owner
approved one create retry. The null allocation is retained as
`null-allocation.json`; it created no VM, controller, output, or remote state.

The retry created exactly one nonpersistent 2-vCPU/4-GiB Sandbox,
`plugnz-zcode-acquire-20261012-01`, with experiment UID `21071`. Actual local
free space immediately before creation was 6,642,941,952 bytes. Remote baseline
use was 3,671,339,008 bytes. Actual expiry was
`2026-10-12T02:33:01Z`; the archive deadline was `02:20:01Z`, retaining the
reviewed 780-second preservation reserve. The configured bounds were 6 GiB
whole-filesystem growth, 2.5 GiB retained bodies, 2.75 GiB archive and 2.875
GiB remote reserve. The VM stopped after receipt with no snapshot.

## Preserved result

During the frozen root install, the monitor observed a transient path beneath
`pnpm-store/v10/files/a3/` disappear before `lstat`. It conservatively recorded
`measurement-failed`, stopped UID `21071` with `SIGKILL`, and reported
`stopFailure: null`. Final remote allocation was 4,735,217,664 bytes after 155
measurements. The workflow process was killed before it could record a
supplier-failure file; the privileged control journal is authoritative for the
stop reason.

The stopped supplier inventory contains 31,353 entries: 28,653 regular files,
2,695 directories and five symlinks, totaling 920,992,015 regular-file bytes.
Exactly the prebound 41-byte `acquisition-identity.txt` was omitted after its
SHA256 matched; every other partial source, Git object, runtime, download,
pnpm-store/cache and install body was archived. The trial contains 21 files
totaling 584,893 bytes. The conservative archive projection counted 28,679
unique regular bodies, 931,933,430 body bytes, a 971,386,880-byte tar and a
971,683,384-byte gzip upper bound.

The actual archive is 348,239,692 bytes, SHA256
`0dcbff1a305fc936f80c4f411164cdee89b4f6fda28b9db1be0922ba441db143`.
The controller downloaded it, verified its digest, freshly restored it, and
checked every inventoried trial and non-omitted supplier file byte/hash/mode,
directory and symlink target before issuing the receipt. Controller exit was
one because acquisition did not converge; preservation and VM stop completed.

The original archive, restored tree, control output and launcher setup remain
under `/tmp/plugnz-zcode-acquisition-01` and
`/tmp/plugnz-zcode-acquisition-setup-mPVy6P`. A permanent copy of the archive,
receipt, configuration, controller source snapshots/checksums and launcher
records is retained at
`/home/charlesfengyc/.local/state/plugnz-evidence/20261012/zcode-acquisition-01/`.
Restore into a new empty directory with:

```sh
tar -xzf /home/charlesfengyc/.local/state/plugnz-evidence/20261012/zcode-acquisition-01/controller-output/evidence.tar.gz -C <empty-directory>
```

Independent acceptance of the permanent copy is still required before any
duplicate loose restore is eligible for reviewed cleanup. This evidence does
not prove successful installation, official build completion, CLI version
readback, Native compatibility, lifecycle behavior, throughput, or a need for
a larger budget. There is no authorized automatic retry.
