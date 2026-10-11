import { executeLifecycle } from './executor';
import { exitCodeForLifecycleReport, parseLifecycleReport, type LifecycleReport } from './lifecycle-report';
import type { PlannerHost } from './planner';
import { planLifecycle } from './planner';
import type { SyncManifest } from './sync-manifest';

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
  const plan = await planLifecycle({
    manifest: command.manifest,
    dryRun: command.dryRun,
    validatedAt: command.now,
    hosts: command.hosts,
    ...(command.command === undefined ? {} : { command: command.command }),
    ...(command.transportSource === undefined ? {} : { transportSource: command.transportSource }),
    ...(command.removalSelection === undefined ? {} : { removalSelection: command.removalSelection }),
  });
  const executed = await executeLifecycle({
    plan,
    hosts: command.hosts,
    now: command.now,
  });
  const report = parseLifecycleReport(executed.report);
  return { report, exitCode: exitCodeForLifecycleReport(report) };
}
