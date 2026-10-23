import type { LifecycleReport } from './lifecycle-report';

/** Installation evidence is not runtime approval or an observed model request. */
export interface InstallationVerification {
  schemaVersion: 1;
  operations: Array<{
    operationId: string;
    compatibility: 'admitted' | 'unsupported' | 'unverified' | 'unknown';
    /** Only the delivered component can be verified; ignored components never are. */
    registration: 'verified' | 'not-checked' | 'unknown';
    executionApproval: 'not-checked';
    delivery: 'not-observed';
    /** Package components the adapter deliberately did not deliver. */
    ignoredComponents?: readonly string[];
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
      ...(outcome.ignoredComponents === undefined || outcome.ignoredComponents.length === 0
        ? {} : { ignoredComponents: [...outcome.ignoredComponents] }),
    })),
  };
}
