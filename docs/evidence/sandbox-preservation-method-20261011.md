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
