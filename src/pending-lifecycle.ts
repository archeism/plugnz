/** Reader-only visibility for unresolved journals, including those without an Activation. */
import { readLifecycleState, type LifecycleStateV2 } from './state';

const UNRESOLVED = new Set(['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending']);
export function pendingLifecycleOperations(state: LifecycleStateV2 = readLifecycleState().state) {
  return state.attempts.filter(attempt => attempt.command !== 'legacy-recovery').flatMap(attempt => attempt.journal
    .filter(row => UNRESOLVED.has(row.state))
    .map(row => ({ host: state.scopes.find(scope => scope.id === row.scopeId)!.target.kind,
      scopeId: row.scopeId, attemptId: attempt.id, operationId: row.operationId,
      id: row.nativeId ?? row.packageId ?? row.operationId, action: row.action, phase: row.state, command: attempt.command,
    })));
}
