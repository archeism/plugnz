import { expect, test } from 'bun:test';
import { mergeAddReports } from '../src/add-report';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';
import { createLifecycleReason, parseLifecycleReport, type LifecycleReport } from '../src/lifecycle-report';

const binding = { kind: 'local', locator: '/fixtures/hooks' } as const;
function success(target: string, changed = true): LifecycleReport {
  const operation = {
    operationId: 'install-' + target, coverage: 'desired-pair' as const,
    scope: createDeploymentScopeIdentity(binding, { kind: target, instance: 'default' }),
    sourceSnapshotId: 'source-0', package: 'fixture', nativeId: 'fixture@local',
    action: changed ? 'install' as const : 'unchanged' as const, route: 'managed' as const,
  };
  return parseLifecycleReport({
    schemaVersion: 1,
    command: { name: 'add', dryRun: false, sourceSnapshots: [{ id: 'source-0', reference: { binding, revision: 'revision-1', fingerprint: 'fingerprint-1' } }] },
    plan: [operation],
    outcomes: [{ ...operation, result: 'succeeded', resourceState: 'present', activationState: 'active-conforming', changed, reason: null }],
    summary: { result: 'converged', terminalPhase: 'complete', mutationStarted: changed, changed,
      failureCategory: null, reason: null, recoveryId: null, readbackId: null },
  });
}
function refusal(target: string): LifecycleReport {
  const report = success(target, false);
  const reason = createLifecycleReason('capability', 'capability.unverified', 'Unsupported native version', 'hooks', 'fixture');
  report.plan[0] = { ...report.plan[0]!, action: 'not-attempted', route: 'none' };
  report.outcomes[0] = { ...report.plan[0]!, result: 'failed', resourceState: 'unknown', activationState: 'unknown', changed: false, reason };
  report.summary = { ...report.summary, result: 'incomplete', terminalPhase: 'preflight', failureCategory: reason.category, reason };
  return parseLifecycleReport(report);
}

for (const refusedFirst of [false, true]) {
  test('partial add preserves mutation facts with refusal ' + (refusedFirst ? 'first' : 'last'), () => {
    const failed = refusal('pi'), applied = success('codex');
    const inputs = refusedFirst ? [failed, applied] : [applied, failed];
    const before = JSON.stringify(inputs);
    const result = mergeAddReports(inputs);
    expect(result.summary).toEqual({ ...failed.summary, terminalPhase: 'apply', mutationStarted: true, changed: true });
    expect(result.outcomes).toEqual(inputs.flatMap(report => report.outcomes));
    expect(result.command.sourceSnapshots).toHaveLength(1);
    expect(JSON.stringify(inputs)).toBe(before);
  });
}

test('unchanged successful route and preflight refusal do not claim changed work', () => {
  const unchanged = success('pi', false), failed = refusal('codex');
  expect(mergeAddReports([unchanged, failed]).summary).toEqual(failed.summary);
  unchanged.summary.mutationStarted = true; // The writer may persist intent without changing native bytes.
  expect(mergeAddReports([unchanged, failed]).summary).toEqual({ ...failed.summary, mutationStarted: true, terminalPhase: 'apply' });
});

test('dry-run mixed result remains non-mutating', () => {
  const applied = success('pi'), failed = refusal('codex');
  for (const report of [applied, failed]) {
    report.command.dryRun = true;
    report.outcomes.forEach(row => { row.changed = false; });
    report.summary.changed = false;
    report.summary.mutationStarted = false;
    parseLifecycleReport(report);
  }
  expect(mergeAddReports([applied, failed]).summary).toEqual(failed.summary);
});

for (const category of ['recovery', 'readback'] as const) {
  test('a later ' + category + ' failure keeps its identifying fields', () => {
    const pending = success('codex', false);
    const reason = category === 'recovery'
      ? createLifecycleReason('recovery', 'recovery.required', 'Native mutation needs recovery')
      : createLifecycleReason('readback', 'readback.failed', 'Native readback unavailable');
    pending.plan[0] = { ...pending.plan[0]!, action: 'install' };
    pending.outcomes[0] = { ...pending.plan[0]!, result: 'pending', resourceState: 'potentially-changed', activationState: 'unknown', changed: false, reason };
    pending.summary = { result: 'incomplete', terminalPhase: category === 'readback' ? 'readback' : 'apply',
      mutationStarted: true, changed: false, failureCategory: category, reason,
      recoveryId: pending.plan[0]!.operationId, readbackId: category === 'readback' ? pending.plan[0]!.operationId : null };
    parseLifecycleReport(pending);
    const result = mergeAddReports([refusal('pi'), pending]);
    expect(result.summary.mutationStarted).toBe(true);
    expect(result.summary.changed).toBe(false);
    expect(result.summary.recoveryId).toBe(pending.summary.recoveryId);
    expect(result.summary.readbackId).toBe(pending.summary.readbackId);
    expect(result.outcomes[1]).toEqual(pending.outcomes[0]);
  });
}

test('historical recovery proof survives when current Desired work is unchanged', () => {
  const recovered = success('codex', false);
  const original = { attemptId: 'prior-attempt', command: 'add' as const, operationId: 'prior-operation',
    scope: recovered.plan[0]!.scope, package: 'fixture', nativeId: 'fixture@local', action: 'disable-nonconforming' as const,
    route: 'managed' as const, journalState: 'rollback' as const, sealed: true };
  recovered.recovery = { schemaVersion: 1, receipts: [{ original,
    status: 'completed', settlement: 'rollback', finalJournalState: 'rolled-back', resourceState: 'retained',
    activationState: 'retained-prior', mutationStarted: true, changed: true, readbackVerified: true, reason: null }] };
  recovered.summary = { ...recovered.summary, mutationStarted: true, changed: true, readbackId: original.operationId };
  parseLifecycleReport(recovered);
  for (const other of [success('pi', false), refusal('pi')]) {
    const result = mergeAddReports([other, recovered]);
    expect(result.recovery).toEqual(recovered.recovery);
    expect(result.outcomes.every(row => !row.changed)).toBe(true);
    expect(result.summary.changed).toBe(true);
    expect(result.summary.mutationStarted).toBe(true);
    expect(result.summary.readbackId).toBe(original.operationId);
  }
});

test('pending historical recovery remains identifiable after another route refusal', () => {
  const recovered = refusal('codex');
  const reason = createLifecycleReason('recovery', 'recovery.required', 'Historical rollback is pending');
  const original = { attemptId: 'prior-attempt', command: 'add' as const, operationId: 'prior-operation',
    scope: recovered.plan[0]!.scope, package: 'fixture', nativeId: 'fixture@local', action: 'install' as const,
    route: 'managed' as const, journalState: 'rollback' as const, sealed: true };
  recovered.recovery = { schemaVersion: 1, receipts: [{ original,
    status: 'pending', settlement: null, finalJournalState: 'rollback', resourceState: 'potentially-changed',
    activationState: 'unknown', mutationStarted: true, changed: false, readbackVerified: false, reason }] };
  recovered.summary = { ...recovered.summary, terminalPhase: 'finalize', mutationStarted: true,
    failureCategory: reason.category, reason, recoveryId: original.operationId };
  parseLifecycleReport(recovered);
  const result = mergeAddReports([refusal('pi'), recovered]);
  expect(result.recovery).toEqual(recovered.recovery);
  expect(result.summary.recoveryId).toBe(original.operationId);
});

test('additive adoption accounting is preserved rather than silently discarded', () => {
  const report = refusal('codex');
  report.adoptions = { schemaVersion: 1, receipts: [] };
  const result = mergeAddReports([success('pi'), report]);
  expect(result.adoptions).toEqual(report.adoptions);
});
