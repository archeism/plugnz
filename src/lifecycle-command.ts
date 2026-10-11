import { executeLifecycle } from './executor';
import { createLifecycleReason, exitCodeForLifecycleReport, parseLifecycleReport, type LifecycleReport } from './lifecycle-report';
import type { PlannerHost } from './planner';
import { planLifecycle } from './planner';
import type { SyncManifest } from './sync-manifest';
import { recoverLifecycleJournals } from './lifecycle-recovery';
import type { FrozenSource } from './source';

export interface FrozenLifecycleCommand {
  readonly manifest: SyncManifest;
  readonly dryRun: boolean;
  readonly hosts: readonly PlannerHost[];
  readonly now: string;
  readonly command?: 'add' | 'update' | 'remove';
  /** Original add argument. Carries fetch credentials that must not enter the manifest. */
  readonly transportSource?: string;
  readonly removalSelection?: readonly { readonly scopeId: string; readonly packageId: string; readonly nativeId: string }[];
}

export async function runFrozenLifecycle(command: FrozenLifecycleCommand): Promise<{
  readonly report: LifecycleReport;
  readonly exitCode: number;
}> {
  const retainedSources = new Map<string, FrozenSource>();
  const input = {
    manifest: command.manifest,
    dryRun: command.dryRun,
    validatedAt: command.now,
    hosts: command.hosts,
    ...(command.command === undefined ? {} : { command: command.command }),
    ...(command.transportSource === undefined ? {} : { transportSource: command.transportSource }),
    ...(command.removalSelection === undefined ? {} : { removalSelection: command.removalSelection }),
    retainedSources,
  };
  let plan = await planLifecycle({ ...input, recoveryPreflight: !command.dryRun });
  if (!command.dryRun && plan.kind === 'frozen') {
    const recovery = await recoverLifecycleJournals(plan, command.hosts, command.now);
    if (typeof recovery !== 'boolean') {
      const { reason, operation, changed, settled } = recovery;
      const blocked = createLifecycleReason('runtime', 'runtime.operation-failed', `not attempted while recovery remains unresolved: ${reason.diagnostic}`);
      const operations = plan.report.plan
        .filter(row => ![...settled, ...(operation === null ? [] : [operation])].some(recovered => row.scope.id === recovered.scope.id && row.package === recovered.package && row.nativeId === recovered.nativeId && row.coverage === recovered.coverage))
        // Retain-prior claims verified containment, which recovery has not executed.
        .map(row => row.action === 'retain-prior' ? { ...row, action: 'not-attempted' as const, route: 'none' as const } : row);
      const outcomes = operations.map(row => ({ ...row, result: 'not-attempted' as const, resourceState: 'unknown' as const, activationState: 'unknown' as const, changed: false, reason: operation === null ? reason : blocked }));
      if (operation === null) {
        const report = parseLifecycleReport({ ...plan.report, plan: operations, outcomes, summary: { result: 'incomplete', terminalPhase: 'preflight', mutationStarted: false, changed: false, failureCategory: reason.category, reason, recoveryId: null, readbackId: null } });
        return { report, exitCode: exitCodeForLifecycleReport(report) };
      }
      const recoveredOutcomes = [{ ...operation, result: 'pending' as const, resourceState: changed ? 'potentially-changed' as const : 'unknown' as const, activationState: 'unknown' as const, changed, reason }, ...settled];
      const report = parseLifecycleReport({ ...plan.report, plan: [operation, ...settled.map(({ result: _result, resourceState: _resource, activationState: _activation, changed: _changed, reason: _reason, ...row }) => row), ...operations], outcomes: [...recoveredOutcomes, ...outcomes], summary: { result: 'incomplete', terminalPhase: 'finalize', mutationStarted: true, changed: recoveredOutcomes.some(row => row.changed), failureCategory: 'recovery', reason, recoveryId: operation.operationId, readbackId: recoveredOutcomes.find(row => row.changed && row.action === 'disable-nonconforming')?.operationId ?? null } });
      return { report, exitCode: exitCodeForLifecycleReport(report) };
    }
    if (recovery) plan = await planLifecycle(input);
  }
  const executed = await executeLifecycle({
    plan,
    hosts: command.hosts,
    now: command.now,
  });
  const report = parseLifecycleReport(executed.report);
  return { report, exitCode: exitCodeForLifecycleReport(report) };
}
