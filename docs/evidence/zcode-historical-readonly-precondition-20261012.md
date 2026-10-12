# ZCode historical identity: read-only prerequisite slice

This implements a private adapter-owned precondition, not identity migration.
The design proposal still requires independent contract review. No new state,
report, action enum, public admission envelope, planner permission, Native
capability, mutation fence, transaction, apply or recovery authority is added.
`mutationAuthority` is literally `false`. Public `sync` retains its existing
command-global `internal.invariant` hard block for different physical IDs; this
missing plugnz transaction is not mislabeled native `capability.unsupported`.

## What is proved

`proveZcodeHistoricalIdentity` consumes the strict complete modern state and a
previously frozen Source, never a legacy original or marker alone. It verifies:

- authoritative active exact Scope/Source/target, exact selected package and
  authored marketplace declaration, package-relative path, same immutable Source
  revision and actual frozen bytes;
- one verified created/adopted modern active record, exact completed sealed old
  install/readback and no unresolved old/new journal; no pins or legacy claim;
- exact historical `demo@catalog` mapping derived from that declaration versus
  the current deterministic `demo@plgnz-3c708994a71afe18`, exact user registration,
  version, cache path, enabled flag and closed seven-field old marker;
- every projected payload/resource byte and executable distinction, including
  command metadata, user-only skill conversion and resource-link rewrite; actual
  native/resource fingerprints equal the retained old readback;
- old marketplace bytes/registration are independently exclusive; unknown cache
  versions, shared marketplace siblings, extra files and redirected roots refuse;
- new registry row, flag (even false), options, whole cache/marketplace/resource
  namespace and data directory are independently absent; old data/options are
  retained and fingerprinted, option values are never exposed.

Raw registry/config/marketplace hashes bind complete current shared JSON surfaces
without exposing credentials. The returned origin digest is a **private current
precondition digest**, not the proposed stable modern original key, permanent
first-retained snapshot, public admission ID or commit. It must not be persisted
or interpreted as any of those. The historical sealed `0.16.9` evidence is not a
fresh live native version/capability probe. A later accepted transaction must
perform its own fresh target/capability/fence checks and reproving under that fence.

## Shared projection and authentic evidence

`projectZcodePayload` reads into an in-memory tree and never stages on disk. The
real `projectZcodePlugin` writer now materializes those same byte trees; it does
not maintain a second more permissive historical projection. Its ownership marker
remains separately generated. Existing-source ownership markers are rejected.
Equal-source destinations and pre-existing output symlinks refuse before writes.

Before replacing the writer, the pure projection was independently compared with
the original writer for empty command directories, user-only skills with nested
resources/inline-code masking, metadata, and nested TOML commands. That comparison
found an extra empty `commands` directory in the first pure implementation and
was RED before correction. Equal-source and redirected-output probes then found
two introduced write hazards, each RED before the upfront guards. After the
refactor, those staging checks are plumbing consistency checks, not independent
goldens. Literal command text and the historical CLI test supply independent
expectations.

The historical test decompresses the checksummed original `75d7bc1` producer and
invokes its real public `sync` in a fresh isolated home. It uses the existing
explicit native-command fixture, not a released ZCode binary. It creates the
modern completed ledger, marker, external resources and root TOML command itself;
no test fabricates created ownership or relocates an old home. The shared helper
was extracted without changing the immutable compressed fixture/checksums. The
old producer refuses nested command roots with `usage.invalid-argument`:
`component root entries must be regular files: commands/sub`; the successful
historical case uses its actual supported root command layout, not a patched old
producer. Current nested TOML projection is separately checked.

The authentic positive has all six old/new root observations, exact old/new IDs,
and no filesystem change. Negatives cover legacy ownership, wrong recorded package
path, unknown marker fields, duplicate old/canonical registration, canonical false
flag/options, extra resource bytes, each occupied new payload namespace and new
data. Each refuses without changing that observed fixture. Public preview/apply
still refuse without state/store writes, including the existing bad-last batch
and weaker v1/v1-missing-path histories.

## Limits that remain required work

Initially only the same-revision local historical format and exclusive marketplace
are classified. Changed Source bytes, historical Git locator correlation and
shared marketplace retirement remain explicitly unverified, with refusal; they
are not removed from the overall migration requirement. Legacy-unsealed origins
need the separate exact legacy adoption protocol and cannot borrow this modern
proof. No accepted paired serialization/schema, first-retained modern snapshot,
paired rollback/commit/CAS, interruption/restart handling, real native supplier
proof or concurrency fence exists in this slice. No real installation is touched.

Focused checks are recorded in the commit handoff. Full combined/packed-runtime
and independent two-axis reviews remain integration gates. The writer refactor
changes production bundle bytes: earlier C72 Native evidence must not be relabeled
as verification of this exact producer. Skill instructions are unchanged; no
skill A/B improvement is claimed.
