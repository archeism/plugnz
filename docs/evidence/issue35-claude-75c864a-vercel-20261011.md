# Actual Claude `75c864a`: clean lifecycle passes, global validator blocks integration

Candidate `75c864acffd6d255f81912d311ba17a8535fba30` was independently
approved on both review axes before this fresh runtime proof. Artifact SHA-256:
`e2e2fc6a5f1ccea6b8e2e1208e822b1146b247e6673ca1767adc6ebd1e097223`.

## Exact runtime and isolation

Vercel CLI 59.11.7 verified project
`charfeng1s-projects/workspace-agent-lab`,
`prj_OhbHIc572xq4SROh5r7vAvnycCKR`. Sandbox CLI 4.7.1 created
`plugnz-35-claude-75c864a` from retained snapshot
`snap_BvLZCdX0ZR3JKj8KWDz1csJmAIM1`, with two vCPUs, 4,096 MB memory,
a 25-minute timeout and **deny-all network**. Each attempted proof has a
distinct fresh controlled home; no real native installation was called.

Pinned official Claude 2.1.295 binary: 256,113,848 bytes, SHA-256
`4503bfe11a6c7fcc1e0b39b5e0d347c04248f750b03b0977b3ad6b531fe6f358`.
The restored native/source inventory verified 3,721 prior manifest records,
including source/Git/venv file hashes, without running Hermes or Python.
Claude's whole native directory digest also remained unchanged through the
positive proof. The previous installed partial-clone Git caveat remains in
the historical evidence; this isolated run does not erase it.

No model request, user prompt, auth token or `--plugin-dir` bypass was used.
The SDK control request contained only
`{"type":"control_request","request_id":"…","request":{"subtype":"initialize"}}`.
Its successful response reported `account.tokenSource:"none"`. Network policy
was deny-all throughout. Published CLI execution used Node 24.21.0.

## Clean-baseline scoped positive: attempt 4

Public `add` installed the selected package and a same-marketplace sibling;
registry, settings and native catalog registration pointed to the managed
catalog. Actual `claude plugin list --json` reported the selected
`readFromFolder` as that catalog member. Actual `plugin details` discovered
the `ordinary` skill and `proof-server` MCP declaration.

Details does not contain a Commands section in this pinned runtime. The
no-message SDK initialize response supplied the stronger command oracle:
`claude-proof:check` and `claude-proof:ordinary` appeared with their original
descriptions. Public same-version `sync` refreshed cache and catalog skill,
command and opaque resource bytes. A new initialize response then reported
the command's updated description. No command or skill was invoked.

After moving the Source aside, public `retire-source` removed the selected
registry/catalog/cache install. Actual native list and initialize exposed no
selected command or skill; the sibling command remained. Foreign native rows,
foreign catalog bytes, sibling rows/bytes, unrelated settings and selected
plugin-data sentinel were retained. MCP declaration discovery is proven;
tool schemas, MCP tool execution and model-turn behavior are not claimed.
Opaque resources are proven by byte readback, not a native resource API.

Measured wall times: install 152 ms, initialize installed 357 ms, same-version
refresh 172 ms, initialize refreshed 344 ms, retirement 136 ms, initialize
retired 285 ms. All exact argv, control input, stdout/stderr hashes and times
are retained in `claude-75-proof4/evidence/commands.json`.

## Integration-blocking negative: attempt 2

The controlled foreign `known_marketplaces.json` baseline omitted its
`lastUpdated`. Candidate public add nevertheless reported
`activationState:"active-conforming"`, `reason:null`, and wrote the install.
Actual pinned native details then refused discovery:

> foreign-market.lastUpdated: Invalid input: expected string, received undefined

This is a **product false-green**, not waived as a fixture-only error. An
unrelated malformed global marketplace record prevents the native loader
from consuming an otherwise valid selected install. The adapter must validate
the actual native global configuration read-only before writes, preserve
foreign/user data, and avoid active-conforming readback when native global
validation rejects it. Exact schema boundaries must come from this pinned
runtime/source evidence, not a guessed replacement JSON schema. Integration
remains blocked pending the minimal fix, independent review and fresh proof.

## Other retained attempts and limits

Attempt 1 included hooks and hard-blocked without selected mutation because
the current Claude profile does not admit hooks. This is an **unadmitted
planned capability**, not evidence of native hook absence or a user-chosen
exclusion. No hook profile was broadened to obtain a positive result.

Attempt 3 used a valid foreign registration and reached actual skills/MCP
discovery, but incorrectly expected details to list command names. Its failed
assertion is retained; initialize subsequently proved command discovery in
that same home. Attempt 4 used the correct initialize oracle in a new home.
An initial restore verifier expected `active` rather than the report's exact
`active-conforming` spelling; the corrected verifier validates the real
false-green, not a rewritten report.

## Preservation and measured budget

Durable raw archive:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/issue35-75c864a-claude-vercel.tar.gz`
359,661 bytes / 352 KiB allocated; SHA-256
`8342a95d2c6d6ac8244b251257e0e50fca88796c528c6cc6727053029cb317cb`.
It contains all four attempt homes/ledgers/fixtures, scripts, exact CLI and
raw native/producer streams. A real extraction into
`/tmp/plugnz-claude-75-proof.sRqSr8/restore` verified 623 complete inventory
entries and 52 command streams, both the global-validator negative and the
clean-baseline positive. Restore scratch plus scripts allocate 4,008 KiB.

```sh
tar -xzf issue35-75c864a-claude-vercel.tar.gz -C <isolated-restore-directory>
node /home/charlesfengyc/.local/state/plugnz-evidence/20261011/verify-issue35-75-claude-restore.mjs <isolated-restore-directory>
```

Large native/source bodies remain in the retained platform snapshot rather
than being duplicated locally. `/vercel/sandbox` grew from 346,120 to
347,492 KiB before archiving; `/root/.cache` was 0 KiB and `/root/.npm`
104 KiB. Earlier restored cache locations outside these measured paths are
not falsely counted as zero; the conservative active-store budget charges
400 MiB, including the previously recorded cache allowance. The new snapshot
is **943 MiB**, separately from old retained **942 MiB**. Incremental task
charge (new snapshot + conservative active + archive/restore) is below
2 GiB; whole old+new conservative charge is below the authorized 2.5 GiB.
Neither is a claim of 400 MiB total retention.

Sandbox stopped and retained: session `sbx_1C8Y1z8P8ylsWU5wwLOTyumpZTX5`,
352.244 seconds duration, 25.344 seconds active CPU, 328 KiB ingress,
432 KiB egress. New snapshot `snap_dsNyyXhX8K8m3yADy2Bg6nbVY6ag`,
943 MiB, expires 30 days after last use. It can be restored with
`sandbox create --snapshot <snapshot> --project workspace-agent-lab --scope charfeng1s-projects`
only within a newly verified budget. No old snapshot or evidence was deleted.
Skills are unchanged. The clean positive is scoped lifecycle evidence;
the verified global false-green means the overall adapter is not accepted.
