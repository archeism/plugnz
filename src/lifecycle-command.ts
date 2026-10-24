import { executeLifecycle } from './executor';
import { createLifecycleReason, exitCodeForLifecycleReport, parseLifecycleReport, type LifecycleReport, type LifecycleRecoveryReceipt, type LifecycleReason } from './lifecycle-report';
import type { PlannerHost } from './planner';
import { planLifecycle } from './planner';
import type { SyncManifest } from './sync-manifest';
import { recoverLifecycleJournals } from './lifecycle-recovery';
import type { FrozenSource } from './source';
import { readLifecycleState } from './state';

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
  const retirementObligations = plan.kind === 'frozen' ? plan.report.plan.filter(row => row.coverage === 'retirement') : [];
  let recoveryReceipts: readonly LifecycleRecoveryReceipt[] = [];
  let preExecutionDefect: LifecycleReason | null = null;
  if (!command.dryRun && plan.kind === 'frozen') {
    const recovery = await recoverLifecycleJournals(plan, command.hosts, command.now);
    recoveryReceipts = recovery.receipts;
    if (recovery.reason !== null) {
      const { reason } = recovery;
      const blocked = createLifecycleReason('runtime', 'runtime.operation-failed', `not attempted while recovery remains unresolved: ${reason.diagnostic}`);
      const operations = plan.report.plan
        // Retain-prior claims verified containment, which recovery has not executed.
        .map(row => row.action === 'retain-prior' ? { ...row, action: 'not-attempted' as const, route: 'none' as const } : row);
      // A settled skip stays skipped; rewriting it as not-attempted would
      // contradict its plan action and claim uncertainty about settled state.
      const outcomes = operations.map(row => row.action === 'skip'
        ? plan.report.outcomes.find(outcome => outcome.operationId === row.operationId)
          ?? { ...row, result: 'skipped' as const, resourceState: 'absent' as const, activationState: 'inactive' as const, changed: false, reason: blocked }
        : { ...row, result: 'not-attempted' as const, resourceState: 'unknown' as const, activationState: 'unknown' as const, changed: false, reason: blocked });
      const pending = recoveryReceipts.find(row => row.status === 'pending');
      const report = parseLifecycleReport({ ...plan.report, plan: operations, outcomes,
        recovery: { schemaVersion: 1, receipts: recoveryReceipts },
        summary: { result: 'incomplete', terminalPhase: pending === undefined ? 'preflight' : 'finalize',
          mutationStarted: recoveryReceipts.some(row => row.mutationStarted), changed: recoveryReceipts.some(row => row.changed),
          failureCategory: reason.category, reason, recoveryId: pending?.original.operationId ?? null,
          readbackId: recoveryReceipts.find(row => row.changed && row.readbackVerified && row.original.action === 'disable-nonconforming')?.original.operationId ?? null } });
      return { report, exitCode: exitCodeForLifecycleReport(report) };
    }
    if (recoveryReceipts.length > 0) {
      plan = await planLifecycle(input);
      if (plan.kind === 'frozen') {
        const tombstones = readLifecycleState().state.tombstones;
        for (const obligation of retirementObligations) {
          if (plan.report.plan.some(row => row.scope.id === obligation.scope.id && row.package === obligation.package)) continue;
          const committed = recoveryReceipts.find(row => row.status === 'completed' && row.settlement === 'commit'
            && (row.original.action === 'retire-orphan' || row.original.action === 'remove')
            && row.original.scope.id === obligation.scope.id && row.original.package === obligation.package && row.original.nativeId === obligation.nativeId);
          if (committed === undefined) continue;
          const tombstone = tombstones.find(row => row.scopeId === obligation.scope.id && row.packageId === obligation.package
            && row.nativeId === obligation.nativeId && row.route.kind === committed.original.route);
          if (tombstone === undefined) {
            const reason = createLifecycleReason('internal', 'internal.invariant', 'completed retirement has no exact retained tombstone proof');
            preExecutionDefect = reason;
            const operation = { ...obligation, action: 'not-attempted' as const, route: 'none' as const };
            plan = { ...plan, operations: [...plan.operations, { operation, reason, journal: { kind: 'none' } }],
              report: { ...plan.report, plan: [...plan.report.plan, operation], outcomes: [...plan.report.outcomes,
                { ...operation, result: 'failed', resourceState: 'unknown', activationState: 'unknown', changed: false, reason }] } };
            continue;
          }
          const operation = { ...obligation, action: 'retire-orphan' as const, route: tombstone.route.kind };
          plan = { ...plan, operations: [...plan.operations, { operation, reason: null, completedRetirement: tombstone, journal: { kind: 'none' } }],
            report: { ...plan.report, plan: [...plan.report.plan, operation], outcomes: [...plan.report.outcomes,
              { ...operation, result: 'succeeded', resourceState: 'absent', activationState: 'inactive', changed: false, reason: null }] } };
        }
      }
    }
  }
  if (preExecutionDefect !== null) {
    const operations = plan.report.plan.map(row => row.action === 'retain-prior' ? { ...row, action: 'not-attempted' as const, route: 'none' as const } : row);
    const report = parseLifecycleReport({ ...plan.report, plan: operations,
      outcomes: operations.map(row => row.action === 'skip'
        ? plan.report.outcomes.find(outcome => outcome.operationId === row.operationId)
          ?? { ...row, result: 'skipped' as const, resourceState: 'absent' as const, activationState: 'inactive' as const, changed: false, reason: preExecutionDefect }
        : { ...row, result: 'not-attempted', resourceState: 'unknown', activationState: 'unknown', changed: false, reason: preExecutionDefect }),
      recovery: { schemaVersion: 1, receipts: recoveryReceipts },
      summary: { result: 'incomplete', terminalPhase: 'finalize', mutationStarted: recoveryReceipts.some(row => row.mutationStarted),
        changed: recoveryReceipts.some(row => row.changed), failureCategory: preExecutionDefect.category, reason: preExecutionDefect, recoveryId: null, readbackId: null },
    });
    return { report, exitCode: exitCodeForLifecycleReport(report) };
  }
  const executed = await executeLifecycle({
    plan,
    hosts: command.hosts,
    now: command.now,
  });
  const report = parseLifecycleReport(recoveryReceipts.length === 0 ? executed.report : { ...executed.report,
    recovery: { schemaVersion: 1, receipts: recoveryReceipts },
    summary: { ...executed.report.summary,
      ...((recoveryReceipts.some(row => row.changed || row.mutationStarted) && ['parse', 'resolve', 'freeze', 'preflight'].includes(executed.report.summary.terminalPhase)) ? { terminalPhase: 'finalize' as const } : {}),
      changed: executed.report.summary.changed || recoveryReceipts.some(row => row.changed),
      mutationStarted: executed.report.summary.mutationStarted || recoveryReceipts.some(row => row.mutationStarted) },
  });
  return { report, exitCode: exitCodeForLifecycleReport(report) };
}
