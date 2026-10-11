import { fingerprintTree } from './fingerprint';
import { unknownErrorDiagnostic } from './error-diagnostic';
import { hydrateDurableLifecycleOperation } from './lifecycle-runtime';
import { createLifecycleReason, type LifecycleReason, type LifecyclePlanOperation } from './lifecycle-report';
import type { LifecyclePlan, PlannerHost } from './planner';
import { readLifecycleState, type JournalEntryRecord, type LifecycleStateV2 } from './state';
import { writeLifecycleState } from './state-write';

const OPEN = new Set(['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending']);
/** All Sources have already resolved and frozen before this write-capable boundary. */
export async function recoverLifecycleJournals(plan: Extract<LifecyclePlan, { kind: 'frozen' }>, hosts: readonly PlannerHost[], now: string): Promise<{ reason: LifecycleReason; operation: LifecyclePlanOperation | null; changed: boolean } | boolean> {
  let state = readLifecycleState().state;
  const scopeIds = new Set(plan.scopes.map(row => row.scope.id));
  const journals = state.attempts.flatMap(attempt => attempt.journal.filter(row => scopeIds.has(row.scopeId) && OPEN.has(row.state)).map(row => ({ attempt, row })));
  if (journals.length === 0) return false;
  const incompatible = journals.find(({ attempt }) => attempt.command !== plan.report.command.name);
  if (incompatible !== undefined) return {
    operation: null, changed: false,
    reason: createLifecycleReason('internal', 'internal.invariant', `pending operation '${incompatible.row.operationId}' belongs to '${incompatible.attempt.command}' attempt '${incompatible.attempt.id}'; cross-verb recovery is unverified. Retry the original '${incompatible.attempt.command}' command for scope '${incompatible.row.scopeId}' before '${plan.report.command.name}'. Pending proof and native state were retained.`),
  };
  let pending = journals[0]!.row;
  let changed = false;
  try {
    for (const source of plan.frozenSources.values()) if (fingerprintTree(source.snapshotDir) !== source.snapshot.fingerprint) throw new Error('retained Source drifted before recovery');
    // Hydrate every handle before the first recovery write, including a bad last scope.
    const prepared = journals.map(({ attempt, row }) => {
      if (row.sealedOperation === undefined) throw new Error(`journal '${row.operationId}' has no durable sealed operation; recovery remains unverified`);
      const handle = hydrateDurableLifecycleOperation(row.sealedOperation);
      const scope = state.scopes.find(scope => scope.id === row.scopeId);
      if (handle.attemptId !== attempt.id || JSON.stringify(handle.target) !== JSON.stringify(scope?.target)) throw new Error('recovery target/attempt differs from recorded authority');
      const host = hosts.find(host => host.adapter.id === handle.adapterId && host.kinds.includes(handle.target.kind));
      if (host === undefined) throw new Error(`recovery adapter '${handle.adapterId}' is unavailable`);
      return { row, handle, host };
    });
    const persist = (row: JournalEntryRecord, settled: 'commit' | 'rollback', finished: boolean): void => {
      if (readLifecycleState().state.stateGeneration !== state.stateGeneration) throw new Error('recovery ledger changed concurrently; refusing stale commit');
      const next: LifecycleStateV2 = { ...state, stateGeneration: state.stateGeneration + 1,
        activations: state.activations.map(activation => {
          if (activation.scopeId !== row.scopeId || activation.nativeId !== row.nativeId || activation.packageId !== row.packageId) return activation;
          const { pending: _pending, ...kept } = activation;
          return finished ? { ...kept, readbackState: 'verified', readbackAt: now, updatedAt: now } : { ...kept, pending: { operation: row.action as NonNullable<typeof activation.pending>['operation'], phase: 'cleanup', attemptId: row.sealedOperation!.attemptId, startedAt: now }, readbackState: 'verified' };
        }),
        attempts: state.attempts.map(attempt => {
          if (attempt.id !== row.sealedOperation!.attemptId) return attempt;
          const journal: JournalEntryRecord[] = attempt.journal.map(entry => entry.operationId === row.operationId ? { ...entry, state: finished ? (settled === 'rollback' ? 'rolled-back' : 'completed') : 'cleanup-pending', settlement: settled, updatedAt: now } : entry);
          const unresolved = journal.some(entry => OPEN.has(entry.state));
          const failed = journal.some(entry => entry.state === 'rolled-back' || entry.state === 'failed' || entry.state === 'not-attempted' || entry.action === 'disable-nonconforming');
          return { ...attempt, phase: unresolved ? 'finalizing' : failed ? 'failed' : 'completed', ...(!unresolved && !failed ? { completedAt: now } : {}), updatedAt: now, journal };
        }),
      };
      if (finished && settled === 'commit') next.scopes = next.scopes.map(scope => {
        const requested = plan.scopes.find(item => item.scope.id === scope.id);
        if (scope.id !== row.scopeId || requested?.selectorMode !== 'retired' || requested.retirementPackages !== undefined
          || next.activations.some(activation => activation.scopeId === scope.id)
          || next.attempts.some(attempt => attempt.journal.some(entry => entry.scopeId === scope.id && OPEN.has(entry.state)))) return scope;
        const { desired: _desired, lastConverged: _converged, ...kept } = scope;
        return { ...kept, lifecycle: 'retired', selectorMode: 'retired', retiredAt: now, updatedAt: now };
      });
      writeLifecycleState(next, { globalPreflight: 'succeeded' }); state = next;
    };
    for (const { row, handle, host } of prepared) {
      pending = row;
      changed = false;
      try {
        const observed = await host.adapter.beginRecovery(handle);
        const committed = row.settlement === 'commit' || row.settlement === undefined && (row.state === 'readback-verified' || row.state === 'cleanup-pending');
        if (committed) {
          if (observed.kind !== 'expected') throw new Error('committed recovery candidate changed; refusing stale cleanup');
        } else {
          if (row.settlement !== 'rollback') changed = (await host.adapter.rollback(handle)).changed;
          host.adapter.verifyRollback(handle, await host.adapter.readback(handle));
        }
        const settlement = committed ? 'commit' : 'rollback';
        persist(row, settlement, false); // Durable verified receipt before disposing any backup.
        await host.adapter.cleanup(handle, committed ? 'verified-commit' : 'verified-rollback');
        persist(row, settlement, true);
      } finally { await host.adapter.releaseRecovery(handle); }
    }
    return true;
  } catch (error) {
    const scope = plan.scopes.find(scope => scope.scope.id === pending.scopeId)!.scope;
    return { changed, reason: createLifecycleReason('recovery', 'recovery.required', `cross-process recovery of operation '${pending.operationId}' remains pending: ${unknownErrorDiagnostic(error)}`), operation: {
      operationId: pending.operationId, scope, sourceSnapshotId: null, package: pending.packageId ?? 'unknown', nativeId: pending.nativeId ?? null,
      coverage: pending.action === 'retire-orphan' || pending.action === 'remove' ? 'retirement' : 'desired-pair', action: pending.action === 'remove' ? 'retire-orphan' : pending.action, route: pending.route?.kind === 'native' ? 'native' : 'managed',
    } };
  }
}
