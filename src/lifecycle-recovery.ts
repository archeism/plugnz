import { fingerprintTree } from './fingerprint';
import { unknownErrorDiagnostic } from './error-diagnostic';
import { hydrateDurableLifecycleOperation } from './lifecycle-runtime';
import { createLifecycleReason, type LifecycleReason, type LifecycleRecoveryReceipt, type LifecycleResourceState, type LifecycleActivationState } from './lifecycle-report';
import { projectRecoveryOperationProof } from './recovery-proof';
import type { LifecyclePlan, PlannerHost } from './planner';
import { readLifecycleState, type JournalEntryRecord, type LifecycleStateV2 } from './state';
import { writeLifecycleState } from './state-write';
import { canonicalTargetContextBytes } from './target-identity';

const OPEN = new Set(['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending']);
/** All Sources have already resolved and frozen before this write-capable boundary. */
export async function recoverLifecycleJournals(plan: Extract<LifecyclePlan, { kind: 'frozen' }>, hosts: readonly PlannerHost[], now: string): Promise<{ reason: LifecycleReason | null; receipts: readonly LifecycleRecoveryReceipt[] }> {
  let state = readLifecycleState().state;
  const scopeIds = new Set(plan.scopes.map(row => row.scope.id));
  const journals = state.attempts.flatMap(attempt => attempt.journal.filter(row => scopeIds.has(row.scopeId) && OPEN.has(row.state)).map(row => ({ attempt, row })));
  const notAttempted = createLifecycleReason('runtime', 'runtime.operation-failed', 'historical recovery not attempted because an earlier recovery remains unresolved');
  const receipts: LifecycleRecoveryReceipt[] = journals.map(({ attempt, row }) => ({
    original: projectRecoveryOperationProof(state.scopes.find(scope => scope.id === row.scopeId)!, attempt, row),
    status: 'not-attempted', settlement: null, finalJournalState: row.state,
    resourceState: 'unknown', activationState: 'unknown', mutationStarted: false, changed: false, readbackVerified: false, reason: notAttempted,
  }));
  if (journals.length === 0) return { reason: null, receipts };
  const incompatible = journals.find(({ attempt }) => attempt.command !== plan.report.command.name);
  if (incompatible !== undefined) return {
    receipts,
    reason: createLifecycleReason('internal', 'internal.invariant', `pending operation '${incompatible.row.operationId}' belongs to '${incompatible.attempt.command}' attempt '${incompatible.attempt.id}'; cross-verb recovery is unverified. Retry the original '${incompatible.attempt.command}' command for scope '${incompatible.row.scopeId}' before '${plan.report.command.name}'. Pending proof and native state were retained.`),
  };
  let pending = journals[0]!.row;
  let pendingIndex = 0;
  let changed = false;
  let mutationStarted = false;
  let settlement: 'commit' | 'rollback' | null = null;
  let readbackVerified = false;
  let resourceState: LifecycleResourceState = 'unknown';
  let activationState: LifecycleActivationState = 'unknown';
  try {
    for (const source of plan.frozenSources.values()) if (fingerprintTree(source.snapshotDir) !== source.snapshot.fingerprint) throw new Error('retained Source drifted before recovery');
    // Hydrate every handle before the first recovery write, including a bad last scope.
    const prepared = journals.map(({ attempt, row }, index) => {
      pending = row; pendingIndex = index;
      if (row.state === 'pending' && row.sealedOperation === undefined) return { row, attemptId: attempt.id, handle: null, host: null };
      if (row.sealedOperation === undefined) throw new Error(`journal '${row.operationId}' has no durable sealed operation; recovery remains unverified`);
      const handle = hydrateDurableLifecycleOperation(row.sealedOperation);
      const scope = state.scopes.find(scope => scope.id === row.scopeId);
      if (handle.attemptId !== attempt.id || handle.target.kind !== scope?.target.kind || handle.target.instance !== scope.target.instance
        || canonicalTargetContextBytes(handle.target.context) !== canonicalTargetContextBytes(scope.target.context)) throw new Error('recovery target/attempt differs from recorded authority');
      const host = hosts.find(host => host.adapter.id === handle.adapterId && host.kinds.includes(handle.target.kind));
      if (host === undefined) throw new Error(`recovery adapter '${handle.adapterId}' is unavailable`);
      return { row, attemptId: attempt.id, handle, host };
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
    for (const [index, { row, attemptId, handle, host }] of prepared.entries()) {
      pending = row;
      pendingIndex = index;
      changed = false;
      mutationStarted = false; settlement = null; readbackVerified = false;
      resourceState = 'unknown'; activationState = 'unknown';
      if (handle === null || host === null) {
        if (readLifecycleState().state.stateGeneration !== state.stateGeneration) throw new Error('recovery ledger changed concurrently; refusing stale accepted-intent settlement');
        const next: LifecycleStateV2 = { ...state, stateGeneration: state.stateGeneration + 1,
          activations: state.activations.map(activation => {
            if (activation.pending?.attemptId !== attemptId || activation.scopeId !== row.scopeId || activation.packageId !== row.packageId || activation.nativeId !== row.nativeId) return activation;
            const { pending: _pending, ...kept } = activation; return { ...kept, readbackState: activation.readbackState === 'pending' ? 'unverified' : activation.readbackState, updatedAt: now };
          }),
          attempts: state.attempts.map(attempt => attempt.id !== attemptId ? attempt : { ...attempt, phase: 'failed', updatedAt: now, journal: attempt.journal.map(entry => entry.operationId !== row.operationId ? entry : { ...entry, state: 'not-attempted', updatedAt: now }) }),
        };
        writeLifecycleState(next, { globalPreflight: 'succeeded' }); state = next;
        receipts[index] = { ...receipts[index]!, status: 'completed', settlement: 'not-attempted', finalJournalState: 'not-attempted', reason: null };
        continue; // No native apply began; any unsealed preparation remains retained.
      }
      try {
        const observed = await host.adapter.beginRecovery(handle);
        const committed = row.settlement === 'commit' || row.settlement === undefined && (row.state === 'readback-verified' || row.state === 'cleanup-pending');
        let verifiedObservation = observed.observation;
        if (committed) {
          if (observed.kind !== 'expected') throw new Error('committed recovery candidate changed; refusing stale cleanup');
        } else {
          if (row.settlement !== 'rollback') { mutationStarted = true; changed = (await host.adapter.rollback(handle)).changed; }
          verifiedObservation = await host.adapter.readback(handle);
          host.adapter.verifyRollback(handle, verifiedObservation);
        }
        readbackVerified = true;
        resourceState = verifiedObservation.presence === 'absent' ? 'absent' : committed ? 'present' : 'retained';
        activationState = verifiedObservation.presence === 'absent' || verifiedObservation.activation === 'inactive' ? 'inactive' : committed ? 'active-conforming' : 'retained-prior';
        // Inactive committed containment retains its resource; it is not Desired convergence.
        if (resourceState === 'present' && activationState === 'inactive') resourceState = 'retained';
        const verifiedSettlement = committed ? 'commit' : 'rollback';
        persist(row, verifiedSettlement, false); // Durable verified receipt before disposing any backup.
        settlement = verifiedSettlement;
        await host.adapter.cleanup(handle, committed ? 'verified-commit' : 'verified-rollback');
        await host.adapter.releaseRecovery(handle);
        persist(row, verifiedSettlement, true);
        receipts[index] = { original: receipts[index]!.original, status: 'completed', settlement,
          finalJournalState: committed ? 'completed' : 'rolled-back', resourceState, activationState,
          changed, mutationStarted, readbackVerified, reason: null };
      } catch (error) {
        try { await host.adapter.releaseRecovery(handle); }
        catch (releaseError) { throw new Error(`${unknownErrorDiagnostic(error)}; releasing recovery fence failed: ${unknownErrorDiagnostic(releaseError)}`); }
        throw error;
      }
    }
    return { reason: null, receipts };
  } catch (error) {
    const reason = createLifecycleReason('recovery', 'recovery.required', `cross-process recovery of operation '${pending.operationId}' remains pending: ${unknownErrorDiagnostic(error)}`);
    const persisted = state.attempts.flatMap(attempt => attempt.journal).find(row => row.operationId === pending.operationId && row.scopeId === pending.scopeId);
    receipts[pendingIndex] = { original: receipts[pendingIndex]!.original, status: 'pending', settlement,
      finalJournalState: persisted?.state ?? pending.state, changed, mutationStarted: mutationStarted || pending.sealedOperation !== undefined,
      readbackVerified, resourceState: changed && !readbackVerified ? 'potentially-changed' : resourceState, activationState, reason };
    return { reason, receipts };
  }
}
