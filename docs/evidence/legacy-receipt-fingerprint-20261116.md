# Legacy installation fingerprint compatibility

On charles, public `sync` refused the existing `addy@personal` installation as
owned by the synthetic scope `claude-code:addy@personal`. The unscoped marker
and imported legacy activation agreed on source, package and source digest.
The installation was unchanged: its raw-byte digest matched the recorded
`c6385f7a5a5991ae6d0ea7ec8341828c7039dc0b3cd3d0464bfeed0f75272076`.
The current digest additionally includes executable modes (introduced by
`00adef6`) and therefore could not equal that historical receipt.

Legacy scope resolution now accepts the historical digest only for unscoped
markers backed by one exact imported `legacy-claim`/`legacy-unverified`
activation. Target, source locator, package identity and marker source digest
still must match. All observations and newly written receipts retain the
current mode-aware digest. Dcode uses the same proof rather than assigning all
unscoped markers the synthetic `dcode:default` owner. Claude's separately
validated legacy catalog copy also recognizes the historical source digest.

Historical receipts cannot attest executable modes that they never recorded.
They continue to prove exact file paths and bytes; a current receipt still
rejects mode changes. The focused public regression covers modern and raw
receipts across Claude, Codex, Cursor, OMP and dcode; modified content, modified
catalog copies, unrelated sources and a current-receipt chmod are refused.
Native real-system read-only planning converged for all 11 desired Claude and
Codex packages after their independently qualified runtime prerequisites.
