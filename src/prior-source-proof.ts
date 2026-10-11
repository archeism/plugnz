/** Private compatibility authority: native markers alone never prove a Git locator. */
import { fingerprintTree } from './fingerprint';
import type { DeploymentScopeIdentity } from './deployment-scope';
import type { DurableLifecycleOperation, FrozenPackageSnapshot, PinsAppliedProjection, TargetInstallationData } from './lifecycle-host';
import { sameSourceBinding } from './scope-inventory';
import type { ActivationRecord, DeploymentScopeRecord } from './state';
import { canonicalTargetContextBytes } from './target-identity';

export interface PriorSourceProof {
  readonly scopeId: string;
  readonly nativeId: string;
  readonly locator: string;
  readonly revision: string;
  readonly sourceFingerprint: string;
  readonly installedFingerprint: string;
}

const snapshots = new WeakMap<FrozenPackageSnapshot, PriorSourceProof>();
const preparations = new Map<string, PriorSourceProof>();

/** Called identically by global planning and fresh execution observation. */
export function bindRecordedPriorSource(
  snapshot: FrozenPackageSnapshot,
  scope: DeploymentScopeIdentity,
  recordedScope: DeploymentScopeRecord | undefined,
  activation: ActivationRecord | undefined,
  observed: TargetInstallationData | undefined,
): boolean {
  if (scope.source.kind !== 'git'
    || recordedScope?.authority !== 'authoritative' || recordedScope.lifecycle !== 'active'
    || recordedScope.id !== scope.id || !sameSourceBinding(recordedScope.source, scope.source)
    || recordedScope.target.kind !== scope.target.kind || recordedScope.target.instance !== scope.target.instance
    || canonicalTargetContextBytes(recordedScope.target.context) !== canonicalTargetContextBytes(scope.target.context)
    || activation?.scopeId !== scope.id || activation.nativeId !== snapshot.nativeId
    || activation.packageId !== snapshot.packageName || activation.pending !== undefined
    || activation.readbackState !== 'verified' || activation.ownership.kind === 'legacy-claim'
    || (activation.route.kind !== 'managed' && activation.route.kind !== 'native')
    || activation.sourceRevision === undefined || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(activation.sourceRevision)
    || activation.fingerprints.source === undefined || activation.fingerprints.installed === undefined
    || observed?.ownership.kind !== 'owned' || observed.ownership.scopeId !== scope.id
    || observed.presence !== 'present' || observed.installedFingerprint !== activation.fingerprints.installed
    || observed.contentRoots.length === 0
    || (observed.source !== null && (observed.source.type !== 'git'
      || observed.source.immutableRevision !== activation.sourceRevision || observed.source.locator !== null))) return false;
  for (const root of observed.contentRoots) if (fingerprintTree(root.path) !== root.fingerprint) return false;
  snapshots.set(snapshot, Object.freeze({ scopeId: scope.id, nativeId: snapshot.nativeId,
    locator: scope.source.locator, revision: activation.sourceRevision,
    sourceFingerprint: activation.fingerprints.source, installedFingerprint: activation.fingerprints.installed }));
  return true;
}

export function recordedPriorSource(snapshot: FrozenPackageSnapshot): Readonly<PriorSourceProof> | undefined {
  return snapshots.get(snapshot);
}

export function capturePriorSourceRepair(projection: PinsAppliedProjection, installedFingerprint: string | null): void {
  const proof = snapshots.get(projection.snapshot);
  if (proof !== undefined && installedFingerprint === proof.installedFingerprint) preparations.set(key(projection), proof);
}

/** An exact historical producer marker, never an arbitrary locator mismatch. */
export function priorSourceRepairAllows(handle: DurableLifecycleOperation, acceptsHistoricalMarker: (proof: Readonly<PriorSourceProof>) => boolean): boolean {
  const proof = preparations.get(key(handle));
  if (proof === undefined || handle.sourceLocator !== proof.locator || handle.prior.installedFingerprint !== proof.installedFingerprint
    || handle.scopeId !== proof.scopeId || handle.nativeId !== proof.nativeId) return false;
  return acceptsHistoricalMarker(proof);
}

export function releasePriorSourceRepair(reference: { readonly attemptId: string; readonly operationId: string }): void {
  preparations.delete(key(reference));
}

function key(value: { readonly attemptId: string; readonly operationId: string }): string {
  return `${value.attemptId}\0${value.operationId}`;
}
