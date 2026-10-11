# Independent preservation namespace restore

Root independently restored the actual stopped-state archive produced by the
namespace-fix checkpoint `2a38c82`, without using the author's restore directory.
This is bounded preservation-method evidence, not released-native acceptance,
supplier reconstruction proof, or a large-data throughput result.

Archive SHA256:
`9fbabc1e2e6bfaafebe373ac75a269f86b0b6b8cf305401531031b0abc2e1925`
(4276 bytes). Retained archive, configuration, receipt and frozen scripts:
`/home/charlesfengyc/.local/state/plugnz-evidence/20261011/preservation-method/plugnz-preservation-namespace-actual-01/`.

Fresh restore: `/tmp/plugnz-preservation-namespace-independent-QfZiNT`.
Verifier: `/tmp/plugnz-preservation-namespace-independent.mjs`, Node 22.23.1,
exit 0. All eight retained trial/supplier data files passed their full inventory
byte-length, SHA256 and mode assertions. Four supplier roots whose basenames
are `same`, `same`, `trial`, and `control` remained distinct from one another
and from the trial/control namespaces. Both distinct one-MiB body buffers were
restored exactly. Only the proven literal `literal*.txt` was omitted;
`literalX.txt` remained intact. Three missing-integrity suppliers remained
explicitly incomplete, with no omitted paths.

The frozen source hashes also matched:

- Controller: `5e4e593443bb4f760c21cb70c11d8711c755e1dfd3602242c1c0dc2adf3c86cf`.
- Remote: `c1abd70defb04f4f6f5bd9e3d9363ee768b1c41e3f23d64d881c31de205204a5`.
- Staging: `37051a377df3351bc7c06aebe00524180b7abaac1d9db973055f754e56e71ab9`.

The failed supplier exited 42, the supervisor reported no stop failure, and the
archive receipt predates the configured actual Sandbox expiration. The receipt
reports 14 same-filesystem hardlinked staging files and zero measured allocated
filesystem growth. This does not measure a 512-MiB archive/download workload.

Independent source review is a separate gate. Genuine acquisition and native
trials must use a fresh Sandbox with sufficient actual lifetime for acquisition,
stop, archive, download and restore. The earlier empty Codex setup was stopped;
its automatically created 783-MiB snapshot
`snap_ZY5e6SZeHRCEToGffC6PaDrEYATS` remains retained, not deleted. No native trial
ran in that setup. No real host deployment or skill revision occurred.
