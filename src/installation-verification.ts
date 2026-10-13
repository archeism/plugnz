import type { LifecycleReport } from './lifecycle-report';

/** Installation evidence is not runtime approval or an observed model request. */
export interface InstallationVerification {
  schemaVersion: 1;
  operations: Array<{
    operationId: string;
    compatibility: 'admitted' | 'unsupported' | 'unverified' | 'unknown';
    registration: 'verified' | 'not-checked' | 'unknown';
    executionApproval: 'not-checked';
    delivery: 'not-observed';
  }>;
}

/** Derive only facts supported by the already validated installation outcomes. */
export function installationVerification(report: Pick<LifecycleReport, 'outcomes' | 'command'>): InstallationVerification {
  return {
    schemaVersion: 1,
    operations: report.outcomes.filter(outcome => outcome.coverage === 'desired-pair').map(outcome => ({
      operationId: outcome.operationId,
      compatibility: outcome.reason?.code === 'capability.unsupported' ? 'unsupported'
        : outcome.reason?.code === 'capability.unverified' ? 'unverified'
        : outcome.result === 'succeeded' ? 'admitted' : 'unknown',
      registration: report.command.dryRun ? 'not-checked'
        : outcome.result === 'succeeded' && outcome.resourceState === 'present' && outcome.activationState === 'active-conforming'
          ? 'verified' : 'unknown',
      executionApproval: 'not-checked',
      delivery: 'not-observed',
    })),
  };
}
