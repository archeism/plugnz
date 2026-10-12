/** Read-only adapter seam. An admission never supplies mutation or recovery authority. */
import type { AdoptionNativeProof } from './legacy-adoption-record';
import type { AdoptionDigest, LegacyRecordProof } from './legacy-adoption-proof';
import type { FrozenPackageSnapshot, ResolvedLifecyclePin, TargetVersionObservation } from './lifecycle-host';
import type { SourceSnapshotReference } from './source-reference';

export interface LegacyAdoptionProofRequest {
  readonly legacy: LegacyRecordProof;
  readonly snapshot: FrozenPackageSnapshot;
  readonly source: SourceSnapshotReference;
  readonly version: TargetVersionObservation;
  readonly evidenceId: AdoptionDigest;
}

/** A candidate correlates identity only; it grants no mutation/recovery authority. */
export interface LegacyAdoptionCandidate {
  readonly prove: (pins: readonly ResolvedLifecyclePin[]) => AdoptionNativeProof;
}

/** Filter identity before resolving pins; null means an unrelated original. */
export type ProveLegacyAdoption = (request: LegacyAdoptionProofRequest) => LegacyAdoptionCandidate | null;
