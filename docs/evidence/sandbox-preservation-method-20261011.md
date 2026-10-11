# Preservation controller probes — 2026-10-11

No released/native supplier was installed or exercised in this method cohort.
All processes and files were in tiny, explicitly owned, nonpersistent Vercel
Sandboxes; no fleet home, LLM API key or snapshot was used. These proofs do not
complete the expired Kimi/ZCode attempt.

## Preserved counterexample and corrections

First simple group-only implementation archived an exit-42 arm and a deadline
arm, but those did **not** establish containment of detached descendants.
The later controlled counterexample killed a parent's process group and measured
its detached writer growing from 90 to 140 bytes. This is preserved at
`/tmp/plugnz-preservation-group-hazard-02/restored/group-only-hazard.json`, archive
SHA256 `536f84fc243b54f6d2402b063bcc54bd883fd5e445144c6647f366ce0753bab2`.
The corrected UID stop then archived/restored it. A separate stopped-writer check
returned zero live owned UID processes and a stable 630-byte writer hash
`96ce83959aecad9e3931858641328f3a6ad18d73ae875a472595b00a8740b0ae`.

Review additionally found inherited pipes could postpone group cleanup until
`close`, privileged journals could be renamed through the trial's writable
parent, and a two-minute reserve did not cover configured transport bounds.
All three were corrected before the final method arms below. The first final
arm cohort failed setup (`ENOENT` creating the trial root) before suppliers
launched. Complete local config/helper snapshots/CLI error streams remain in
`/tmp/plugnz-preservation-{failure,parent-exit,disk,deadline}-final/`; it is not
called green. A missing-root fix used new `-02` attempts, never overwriting them.

## Final actual Sandbox arms

Sandbox `plugnz-preservation-final-20261011`, 2 vCPU/4 GiB, ten-minute timeout.
Official SDK supplied actual running-session expiry `1791760561856` (23:16:01.856
UTC). Whole-filesystem baseline before trials: 3,671,252,992 bytes. Configs and
both helper source snapshots/hashes are retained per arm, outside Git.

Each controller downloaded its remote archive, verified its SHA256 and restored
every inventoried trial file, mode and symlink. Archive/download completed well
before actual expiry. Supplier failure intentionally leaves controller exit1;
that is not an archive failure.

| Local attempt directory under `/tmp/` | Actual trigger | Archive bytes | Archive SHA256 |
| --- | --- | ---: | --- |
| `plugnz-preservation-failure-final-02` | Supplier exit42; attempted privileged-control rename denied | 1064 | `c4d601e1ebdef7816015a5adc526eb3fa848371024799059fd9fa11c46b56fdc` |
| `plugnz-preservation-parent-exit-final-02` | Parent exits while detached descendant inherits stdout and writes; immediate UID containment settles pipes | 1140 | `8b6971cabe171e7ea089628729571b977f6615e8a033fba479f4d6ca8bfbc339` |
| `plugnz-preservation-disk-final-02` | Whole-FS guard stops detached inherited-pipe writer before waiting for close | 3266 | `3c2869356cf2862d5fb4aa095844025a0584d29c5bb1c136482d324603bd3b86` |
| `plugnz-preservation-deadline-final-02` | Absolute controller deadline while supplier keeps writing; no agent/root interaction | 962 | `0afb4ae9d1da4c45eb516c9bded46a89dfa7392a562a55cd3997282c612c80cd` |

Disk arm's privileged receipt records `stopped:disk-budget`, `signal:SIGKILL`,
`stopFailure:null`, and whole-FS used bytes 3,678,318,592. Complete trial bytes,
not only logs, were restored. Failure arm's protection record says `denied:true`;
its fake link to privileged control was preserved without following it.

Local no-network transport regressions cover automatic failure/deadline
preservation and refusal to overwrite an existing attempt. Early test failures
(fixture mode mismatch and expired retry timestamp) were corrected at the
fixture/control boundary, not by weakening trial byte/mode checks. Final focused
test/typecheck command results are recorded with the checkpoint. Independent
review/restore is still required; NativeGit gates and durable identity migration
remain separate outstanding work.

## Independent 97e427e verification

The parent independently restored all four literal archive hashes with
`/tmp/plugnz-preservation-independent-restore.mjs` into fresh directories
`/tmp/plugnz-preservation-independent-EeqBal`, `a4cIW7`, `RsBNEf`, `0rYJHC`
(failure, parent-exit, disk, deadline respectively), checking all inventory bytes,
modes, links and exact helper source hashes. All four restores exited zero.
Its live read-only scan of UIDs 21010–21013 found zero experiment writers. It
confirmed the exact Sandbox stopped near its actual 600-second expiry; this is
not called an early stop. No snapshot was deleted. Frozen method received
independent Astra review approval for bounded workflow wiring, not Native route
admission.

## Missing supplier integrity correction

Review of acquisition exposed a dependent gap: missing expected supplier files
aborted archival, while hash-only supplier inventories omitted unknown/partial
bytes without replay proof. The corrected method omits only individually
prebound matching bodies, retains every other declared supplier byte and verifies
those bytes after restore. Acquisition alone has a separately approved 512 MiB
cap/640 MiB remote reserve/3 GiB local headroom; Native arm cap remains 100 MiB.

Actual tiny probe `plugnz-preservation-supplier-20261011` used a declared fixture,
not a Native supplier. It wrote one matching body, one wrong partial body, one
unknown file, left an expected file missing, then exited42. Trial and wrong/unknown
supplier bytes were archived/restored; only the matching body was omitted.
Original manifests and streams are retained in
`/tmp/plugnz-preservation-supplier-partial-01` (also copied to the durable evidence
directory). Archive: 1319 bytes, SHA256
`7bb10aa499256f1bbd071e9b254ff3b1e8c6e9ea744908203964210e0e44a6e0`.
This probe does not prove whole supplier reconstruction, large-install throughput,
the 512 MiB transport worst-case, or official Native behavior.

## Namespace correction after cbe2d2b review

Independent review found global tar basename transforms collided between two
different supplier roots named `same`; glob exclusions could also delete an
unknown sibling of a literal wildcard filename. Author reproduced the exact
old production tar block with isolated local paths: 0 pass, 3 fail, 7 assertions.
RED log and prechange reproduction are retained at
`/tmp/plugnz-preservation-namespace-red.log` and
`/tmp/plugnz-preservation-namespace-red.test.mjs`. That earlier tiny supplier
probe remains valid only for its original simple layout, not general admission.

Replacement staging uses explicit private namespaces and literal inventory
exclusions. Focused controls include identical supplier basenames, trial/control
basename collisions, literal wildcard names, hardlink inode/mode identity,
stale-byte/overlapping-root rejection and cross-device copy refusal. No fallback
full content copy raises the declared scratch budget.

Actual owned tiny Sandbox `plugnz-preservation-namespace-20261011` tested trial
basename `control` and four supplier basenames `same`, `same`, `trial`, `control`.
Two distinct 1 MiB unknown bodies and all supplier sentinels were restored in
their own namespaces; literal `literal*.txt` was omitted only after its prebound
digest matched, while `literalX.txt` survived. Parent exited42, so controller exit1
means supplier failure, not preservation failure. Archive: 4276 bytes, SHA256
`9fbabc1e2e6bfaafebe373ac75a269f86b0b6b8cf305401531031b0abc2e1925`.
Receipt records 14 hardlinked files, same-filesystem strategy, and measured
whole-FS staging allocation growth zero. Exact configs/helper snapshots/streams,
inventory and real restore are retained in
`/tmp/plugnz-preservation-namespace-actual-01` and the durable evidence directory.
This is not a genuine supplier acquisition or a 512 MiB throughput claim.

The parent's old **empty** Codex setup Sandbox was stopped without running any
supplier or Native arm. Stop unexpectedly created snapshot
`snap_ZY5e6SZeHRCEToGffC6PaDrEYATS`, 783 MiB, 30-day retention. It was not deleted
or used. This retained snapshot must be counted, not described as nonexistent;
future sessions must verify their persistence setting/actual snapshot outcome.
