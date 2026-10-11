import { executeLifecycle } from './executor';
import { exitCodeForLifecycleReport, parseLifecycleReport, type LifecycleReport } from './lifecycle-report';
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
      const { reason, operation, changed } = recovery;
      if (operation === null) {
        const report = parseLifecycleReport({ ...plan.report, plan: [], outcomes: [], summary: { result: 'incomplete', terminalPhase: 'preflight', mutationStarted: false, changed: false, failureCategory: reason.category, reason, recoveryId: null, readbackId: null } });
        return { report, exitCode: exitCodeForLifecycleReport(report) };
      }
      const report = parseLifecycleReport({ ...plan.report, plan: [operation], outcomes: [{ ...operation, result: 'pending', resourceState: changed ? 'potentially-changed' : 'unknown', activationState: 'unknown', changed, reason }], summary: { result: 'incomplete', terminalPhase: 'finalize', mutationStarted: true, changed, failureCategory: 'recovery', reason, recoveryId: operation.operationId, readbackId: changed && operation.action === 'disable-nonconforming' ? operation.operationId : null } });
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
