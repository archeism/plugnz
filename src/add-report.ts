import { parseLifecycleReport, type LifecycleReport, type LifecycleSourceSnapshotContext } from './lifecycle-report';

/** Combine independent native installation routes without hiding partial work. */
export function mergeAddReports(reports: readonly LifecycleReport[]): LifecycleReport {
  const snapshots = new Map<string, LifecycleSourceSnapshotContext>();
  for (const report of reports) {
    for (const snapshot of report.command.sourceSnapshots) snapshots.set(snapshot.id, snapshot);
  }
  const failure = reports.find((report) => report.summary.result !== 'converged') ?? null;
  const mutationStarted = reports.some((report) => report.summary.mutationStarted);
  const changed = reports.some((report) => report.summary.changed);
  // A refusal is local to its route. Another route may already have mutated,
  // so its facts cannot be replaced with the refusing route's no-write summary.
  const terminalPhase = failure === null ? 'complete'
    : mutationStarted && ['parse', 'resolve', 'freeze', 'preflight'].includes(failure.summary.terminalPhase)
      ? 'apply' : failure.summary.terminalPhase;
  return parseLifecycleReport({
    schemaVersion: 1,
    command: { name: 'add', dryRun: reports.some((report) => report.command.dryRun), sourceSnapshots: [...snapshots.values()] },
    plan: reports.flatMap((report) => report.plan),
    outcomes: reports.flatMap((report) => report.outcomes),
    // Keep historical proof: it can account for mutation even when the current
    // Desired operation is unchanged, and may contain an unresolved recovery.
    ...(reports.some((report) => report.recovery !== undefined) ? {
      recovery: { schemaVersion: 1, receipts: reports.flatMap((report) => report.recovery?.receipts ?? []) },
    } : {}),
    ...(reports.some((report) => report.adoptions !== undefined) ? {
      adoptions: { schemaVersion: 1, receipts: reports.flatMap((report) => report.adoptions?.receipts ?? []) },
    } : {}),
    summary: {
      result: failure?.summary.result ?? 'converged',
      terminalPhase,
      mutationStarted,
      changed,
      failureCategory: failure?.summary.failureCategory ?? null,
      reason: failure?.summary.reason ?? null,
      recoveryId: reports.find((report) => report.summary.recoveryId !== null)?.summary.recoveryId ?? null,
      readbackId: reports.find((report) => report.summary.readbackId !== null)?.summary.readbackId ?? null,
    },
  });
}
