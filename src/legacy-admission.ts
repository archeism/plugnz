/** Read-only adapter seam. An admission never supplies mutation or recovery authority. */
import type { AdoptionNativeProof } from './legacy-adoption-record';
import type { AdoptionDigest, LegacyRecordProof } from './legacy-adoption-proof';
import type { FrozenPackageSnapshot, ResolvedLifecyclePin, TargetVersionObservation } from './lifecycle-host';
import type { SourceSnapshotReference } from './source-reference';

export interface LegacyAdoptionProofRequest {
  readonly legacy: LegacyRecordProof;
  readonly snapshot: FrozenPackageSnapshot;
  readonly source: SourceSnapshotReference;
  readonly pins: readonly ResolvedLifecyclePin[];
  readonly version: TargetVersionObservation;
  readonly evidenceId: AdoptionDigest;
}

/** null means this original is not the adapter-enumerated selected identity. */
export type ProveLegacyAdoption = (request: LegacyAdoptionProofRequest) => AdoptionNativeProof | null;
