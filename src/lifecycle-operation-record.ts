/** Reader-only shape validation. Runtime branding/semantic proof stays in lifecycle-runtime. */
import type { DurableLifecycleOperation, LifecycleReadbackData } from './lifecycle-host';
import { parsePersistedTargetIdentity } from './target-identity';
export type SerializedLifecycleOperation = { [Key in keyof DurableLifecycleOperation as Key extends string ? Key : never]: DurableLifecycleOperation[Key] };
const FIELDS = ['schemaVersion', 'adapterId', 'target', 'targetObservationId', 'operationId', 'attemptId', 'scopeId', 'packageName', 'nativeId', 'sourceType', 'sourceRevision', 'sourceLocator', 'packageVersion', 'action', 'route', 'detectedVersion', 'versionProbeId', 'evidenceId', 'mutationGroupId', 'mutationInvocationOperationId', 'artifactId', 'projectedFingerprint', 'affectedNativeIds', 'affectedOperationIds', 'prior', 'expected', 'rollbackReference'];
export function parseSerializedLifecycleOperation(value: unknown): SerializedLifecycleOperation {
  const row = object(value); exact(row, FIELDS);
  if (row.schemaVersion !== 1) invalid('operation schemaVersion must be 1');
  for (const field of ['adapterId', 'targetObservationId', 'operationId', 'attemptId', 'scopeId', 'packageName', 'nativeId', 'sourceRevision', 'detectedVersion', 'versionProbeId', 'evidenceId', 'mutationGroupId', 'mutationInvocationOperationId', 'rollbackReference']) string(row[field]);
  parsePersistedTargetIdentity(row.target, 'sealed operation target');
  choice(row.sourceType, ['local', 'git']); choice(row.route, ['native', 'managed']);
  choice(row.action, ['install', 'update', 'route-migrate', 'disable-nonconforming', 'retire-orphan', 'remove']);
  for (const field of ['sourceLocator', 'packageVersion', 'artifactId']) if (row[field] !== null) string(row[field]);
  digest(row.projectedFingerprint);
  for (const field of ['affectedNativeIds', 'affectedOperationIds']) {
    if (!Array.isArray(row[field]) || row[field].length === 0) invalid('affected identities must be nonempty arrays');
    for (const item of row[field] as unknown[]) string(item);
  }
  for (const field of ['prior', 'expected']) readback(row[field]);
  return value as SerializedLifecycleOperation;
}
function readback(value: unknown): void {
  const row = object(value);
  exact(row, ['adapterId', 'target', 'scopeId', 'packageName', 'nativeId', 'route', 'presence', 'enablement', 'activation', 'transition', 'installedFingerprint', 'contentRoots', 'retention']);
  for (const field of ['adapterId', 'scopeId', 'packageName', 'nativeId']) string(row[field]);
  parsePersistedTargetIdentity(row.target, 'operation readback target');
  choice(row.route, ['native', 'managed', 'none']); choice(row.presence, ['present', 'absent']);
  choice(row.enablement, ['enabled', 'disabled', 'not-applicable', 'unknown']); choice(row.activation, ['active', 'inactive', 'unknown']);
  digest(row.installedFingerprint);
  const transition = object(row.transition); exact(transition, ['requirement', 'status']);
  choice(transition.requirement, ['none', 'restart', 'reload', 'unknown']); choice(transition.status, ['effective', 'pending', 'unknown']);
  if (!Array.isArray(row.contentRoots)) invalid('content roots must be an array');
  for (const value of row.contentRoots as unknown[]) {
    const root = object(value); exact(root, ['label', 'path', 'fingerprint']); string(root.label); string(root.path); digest(root.fingerprint);
  }
  const retention = object(row.retention); exact(retention, ['pluginData', 'inactiveMetadata']);
  for (const field of ['pluginData', 'inactiveMetadata']) {
    const resource = object(retention[field]); exact(resource, ['state', 'fingerprint']);
    choice(resource.state, ['present', 'absent', 'missing', 'not-observed']); digest(resource.fingerprint);
  }
}
/** Reader-safe reuse for exact public adoption seal/commit projections. */
export function parseLifecycleReadbackData(value: unknown): LifecycleReadbackData {
  readback(value);
  return value as LifecycleReadbackData;
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected object'); return value as Record<string, unknown>; }
function exact(row: Record<string, unknown>, fields: string[]): void { if (Object.keys(row).some(key => !fields.includes(key)) || fields.some(key => !(key in row))) invalid('operation fields do not match schema'); }
function string(value: unknown): void { if (typeof value !== 'string' || !value || /[\r\n\u0000]/u.test(value)) invalid('expected stable nonempty string'); }
function choice(value: unknown, choices: string[]): void { if (typeof value !== 'string' || !choices.includes(value)) invalid('invalid operation enum'); }
function digest(value: unknown): void { if (value !== null && (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))) invalid('invalid operation fingerprint'); }
function invalid(message: string): never { throw new Error(`invalid sealed lifecycle operation: ${message}`); }
