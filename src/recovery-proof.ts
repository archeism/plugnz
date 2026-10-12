import { createDeploymentScopeIdentity, type DeploymentScopeIdentity } from './deployment-scope';
import type { DeploymentScopeRecord, JournalAction, JournalEntryRecord, JournalState, LifecycleAttemptRecord } from './state';
import { canonicalTargetContextBytes } from './target-identity';

export const OPEN_LIFECYCLE_JOURNAL_STATES = ['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending'] as const;
export type OpenLifecycleJournalState = typeof OPEN_LIFECYCLE_JOURNAL_STATES[number];

/** Reader-safe historical identity. No native handles or artifact paths leave this boundary. */
export interface RecoveryOperationProof {
  readonly attemptId: string;
  readonly command: LifecycleAttemptRecord['command'];
  readonly operationId: string;
  readonly scope: DeploymentScopeIdentity;
  readonly package: string | null;
  readonly nativeId: string | null;
  readonly action: JournalAction;
  readonly route: 'native' | 'managed' | null;
  readonly journalState: OpenLifecycleJournalState;
  readonly sealed: boolean;
}

export interface OpenLifecycleJournals {
  readonly schemaVersion: 1;
  readonly operations: readonly RecoveryOperationProof[];
}

/** Strict additive public envelope; do not silently admit future versions or fields. */
export function parseOpenLifecycleJournals(value: unknown): OpenLifecycleJournals {
  const envelope = object(value, 'openJournals');
  fields(envelope, ['schemaVersion', 'operations'], 'openJournals');
  if (envelope['schemaVersion'] !== 1 || !Array.isArray(envelope['operations'])) throw new Error('openJournals requires schemaVersion 1 and operations');
  const seen = new Set<string>();
  const operations = envelope['operations'].map(value => {
    const proof = parseRecoveryOperationProof(value);
    const key = JSON.stringify([proof.attemptId, proof.operationId]);
    if (seen.has(key)) throw new Error('duplicate open journal proof');
    seen.add(key);
    return proof;
  });
  return { schemaVersion: 1, operations };
}

export function parseRecoveryOperationProof(value: unknown): RecoveryOperationProof {
  const row = object(value, 'recovery original');
  fields(row, ['attemptId', 'command', 'operationId', 'scope', 'package', 'nativeId', 'action', 'route', 'journalState', 'sealed'], 'recovery original');
  for (const key of ['attemptId', 'operationId']) string(row[key], key);
  member(row['command'], ['sync', 'retire-source', 'add', 'update', 'remove', 'legacy-recovery'], 'command');
  member(row['action'], ['install', 'update', 'route-migrate', 'disable-nonconforming', 'retire-orphan', 'remove', 'unchanged', 'retain-prior'], 'action');
  member(row['journalState'], OPEN_LIFECYCLE_JOURNAL_STATES, 'journalState');
  if (row['route'] !== null) member(row['route'], ['native', 'managed'], 'route');
  if (typeof row['sealed'] !== 'boolean') throw new Error('recovery original sealed must be boolean');
  for (const key of ['package', 'nativeId']) if (row[key] !== null) string(row[key], key);
  const scope = object(row['scope'], 'scope');
  fields(scope, ['id', 'source', 'target'], 'scope');
  const source = object(scope['source'], 'source');
  fields(source, source['kind'] === 'git' ? ['kind', 'locator', 'ref'] : ['kind', 'locator'], 'source');
  const target = object(scope['target'], 'target');
  fields(target, ['kind', 'instance'], 'target');
  string(target['kind'], 'target kind'); string(target['instance'], 'target instance');
  // The canonical constructor validates Source shape and stable target identity.
  const identity = createDeploymentScopeIdentity(source as unknown as DeploymentScopeIdentity['source'],
    { kind: target['kind'] as string, instance: target['instance'] as string });
  if (identity.id !== scope['id']) throw new Error('recovery original scope identity mismatch');
  if (row['sealed'] && (row['package'] === null || row['nativeId'] === null || row['route'] === null)) throw new Error('sealed recovery original requires exact package/native/route');
  const command = row['command']; const action = row['action'];
  if (command !== 'legacy-recovery' && (row['package'] === null || row['nativeId'] === null
    || command === 'sync' && action === 'remove'
    || command === 'retire-source' && action !== 'retire-orphan'
    || (command === 'add' || command === 'update') && (action === 'remove' || action === 'retire-orphan')
    || command === 'remove' && action !== 'remove' && action !== 'retire-orphan')) {
    throw new Error('recovery original identity/action contradicts command');
  }
  return { ...row, scope: identity } as unknown as RecoveryOperationProof;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).some(key => !expected.includes(key)) || expected.some(key => !(key in value))) throw new Error(`${label} has missing or unknown fields`);
}
function string(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be nonempty text`);
}
function member(value: unknown, choices: readonly string[], label: string): void {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`${label} is unsupported`);
}

export function isOpenLifecycleJournalState(state: JournalState): state is OpenLifecycleJournalState {
  return (OPEN_LIFECYCLE_JOURNAL_STATES as readonly string[]).includes(state);
}

export function projectRecoveryOperationProof(
  scope: DeploymentScopeRecord,
  attempt: LifecycleAttemptRecord,
  row: JournalEntryRecord,
): RecoveryOperationProof {
  if (row.scopeId !== scope.id || !attempt.scopeIds.includes(scope.id) || !isOpenLifecycleJournalState(row.state)) {
    throw new Error('open journal proof does not belong to the recorded scope/attempt');
  }
  const identity = createDeploymentScopeIdentity(scope.source, { kind: scope.target.kind, instance: scope.target.instance });
  if (identity.id !== scope.id) throw new Error('open journal proof scope identity differs from recorded source/target');
  const sealed = row.sealedOperation;
  if (sealed !== undefined && (sealed.attemptId !== attempt.id || sealed.operationId !== row.operationId
    || sealed.scopeId !== scope.id || sealed.packageName !== row.packageId || sealed.nativeId !== row.nativeId
    || sealed.action !== row.action || sealed.target.kind !== scope.target.kind || sealed.target.instance !== scope.target.instance
    || canonicalTargetContextBytes(sealed.target.context) !== canonicalTargetContextBytes(scope.target.context))) {
    throw new Error('open journal proof differs from its sealed operation');
  }
  const recordedRoute = row.route?.kind === 'native' || row.route?.kind === 'managed' ? row.route.kind : null;
  if (sealed !== undefined && row.route !== undefined && row.route.kind !== sealed.route) {
    throw new Error('open journal route differs from its sealed operation');
  }
  return parseRecoveryOperationProof({
    attemptId: attempt.id, command: attempt.command, operationId: row.operationId, scope: identity,
    package: row.packageId ?? null, nativeId: row.nativeId ?? null, action: row.action,
    route: sealed?.route ?? recordedRoute,
    journalState: row.state, sealed: sealed !== undefined,
  });
}
