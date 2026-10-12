import { expect, test } from 'bun:test';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';
import { parseOpenLifecycleJournals, parseRecoveryOperationProof, type RecoveryOperationProof } from '../src/recovery-proof';

const original: RecoveryOperationProof = {
  attemptId: 'attempt-original', command: 'sync', operationId: 'operation-original',
  scope: createDeploymentScopeIdentity({ kind: 'local', locator: '/isolated/source' }, { kind: 'dcode', instance: 'default' }),
  package: 'demo', nativeId: 'demo@source', action: 'disable-nonconforming', route: 'managed', journalState: 'rollback', sealed: true,
};

test('strict open-journal envelope retains original identity and exposes incomplete legacy proof', () => {
  expect(parseOpenLifecycleJournals({ schemaVersion: 1, operations: [original] })).toEqual({ schemaVersion: 1, operations: [original] });
  const legacy = { ...original, command: 'legacy-recovery', package: null, nativeId: null, route: null, sealed: false };
  expect(parseRecoveryOperationProof(legacy)).toEqual(legacy);
});

test('proof rejects unsupported versions, extra fields, duplicate identities and forged scope/action', () => {
  for (const value of [
    { schemaVersion: 2, operations: [original] },
    { schemaVersion: 1, operations: [original], extra: true },
    { schemaVersion: 1, operations: [original, original] },
  ]) rejects(() => parseOpenLifecycleJournals(value));
  for (const value of [
    { ...original, scope: { ...original.scope, id: 'forged' } },
    { ...original, scope: { ...original.scope, target: { ...original.scope.target, context: {} } } },
    { ...original, nativeId: null }, { ...original, route: null },
    { ...original, command: 'retire-source' }, { ...original, action: 'remove' },
    { ...original, journalState: 'completed' }, { ...original, sealed: 'true' },
    { ...original, rollbackReference: '/private/artifact' },
  ]) rejects(() => parseRecoveryOperationProof(value));
});

function rejects(run: () => unknown): void {
  let rejected = false;
  try { run(); } catch { rejected = true; }
  expect(rejected).toBe(true);
}
