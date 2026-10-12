import { expect, test } from 'bun:test';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';
import { adoptionDigest, parseLegacyRecordProof, type LegacySnapshot } from '../src/legacy-adoption-proof';
import { parseAdoptionAdmission, parseAdoptionRecord, type AdoptionRecord } from '../src/legacy-adoption-record';
import { createLifecycleReason, LifecycleReportValidationError, parseLifecycleReport, type AdoptionReceipt, type LifecycleReport } from '../src/lifecycle-report';

function rejectReport(value: unknown, diagnostic?: string): void {
  try { parseLifecycleReport(value); throw new Error('unexpected acceptance'); }
  catch (error) {
    expect(error instanceof LifecycleReportValidationError).toBe(true);
    if (diagnostic !== undefined) expect(error instanceof Error ? error.message : String(error)).toContain(diagnostic);
  }
}

/** Synthetic closed-wire fixture: parser evidence, not native or transaction authority. */
function fixture() {
  const scope = createDeploymentScopeIdentity({ kind: 'local', locator: '/fixtures/catalog' }, { kind: 'cursor', instance: 'default' });
  const original = { attemptId: 'legacy-attempt', command: 'legacy-recovery' as const, operationId: 'legacy-operation', scope,
    package: 'demo@catalog', nativeId: 'demo@catalog', action: 'install' as const, route: null,
    journalState: 'pending' as const, sealed: false };
  const snapshot: LegacySnapshot = {
    scope, attempt: { id: original.attemptId, command: 'legacy-recovery', phase: 'accepted', mutationStarted: false,
      scopeIds: [scope.id], startedAt: null, updatedAt: null, completedAt: null },
    journal: { operationId: original.operationId, scopeId: scope.id, packageId: original.package, nativeId: original.nativeId,
      action: 'install', state: 'pending', route: { kind: 'legacy-unverified' } },
    activation: { scopeId: scope.id, packageId: original.package, nativeId: original.nativeId,
      route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim' }, fingerprints: { source: 'f'.repeat(64) },
      activationState: 'unknown', readbackState: 'unverified',
      pending: { operation: 'install', phase: 'accepted', attemptId: original.attemptId }, pins: [] },
  };
  const legacy = parseLegacyRecordProof({ schemaVersion: 1, original, snapshot, recordDigest: adoptionDigest('plugnz/legacy-record/v1', snapshot) });
  const source = { binding: scope.source, revision: 'f'.repeat(64), fingerprint: 'f'.repeat(64) };
  const payload = { schemaVersion: 1, original, legacyRecordDigest: legacy.recordDigest, source, target: scope.target,
    packageName: 'demo', packageVersion: '1.0.0', projectedFingerprint: `sha256:${'a'.repeat(64)}`,
    native: { adapterId: 'cursor', format: 'cursor/legacy-marker-v1', evidenceId: `sha256:${'e'.repeat(64)}`,
      version: { kind: 'detected', version: '2.4.0', probeId: 'version-probe' }, aliasMode: 'same-root',
      oldLedgerNativeId: original.nativeId, oldPhysicalNativeId: 'demo', newNativeId: 'demo', packageName: 'demo', packageVersion: '1.0.0',
      marker: { source: scope.source.locator, pluginId: original.nativeId, fingerprint: 'f'.repeat(64), rawDigest: `sha256:${'b'.repeat(64)}` },
      roots: [{ label: 'local', path: '/fixtures/home/.cursor/plugins/local/demo', fullFingerprint: `sha256:${'c'.repeat(64)}`, payloadFingerprint: `sha256:${'a'.repeat(64)}` }],
      projectedPayloadFingerprint: `sha256:${'a'.repeat(64)}`, pins: [],
      retention: { pluginData: { state: 'absent', fingerprint: null }, inactiveMetadata: { state: 'absent', fingerprint: null } } },
    fresh: { attemptId: 'fresh-attempt', operationId: 'fresh-operation', command: 'sync', baseStateGeneration: 7,
      scopeId: scope.id, packageName: 'demo', nativeId: 'demo', sourceSnapshotId: 'snapshot-1', action: 'install', route: 'managed' } };
  const admission = parseAdoptionAdmission({ ...payload, admissionId: adoptionDigest('plugnz/legacy-admission/v1', payload) });
  const reason = createLifecycleReason('internal', 'internal.invariant', 'verified mutation fence and adoption executor remain unavailable');
  const operation = { operationId: admission.fresh.operationId, coverage: 'desired-pair' as const, scope,
    sourceSnapshotId: admission.fresh.sourceSnapshotId, package: 'demo', nativeId: 'demo', action: 'install' as const, route: 'managed' as const, adoption: admission };
  const report: LifecycleReport = { schemaVersion: 1, command: { name: 'sync', dryRun: false, sourceSnapshots: [{ id: 'snapshot-1', reference: source }] },
    plan: [operation], outcomes: [{ ...operation, result: 'not-attempted', resourceState: 'unknown', activationState: 'unknown', changed: false, reason }],
    summary: { result: 'incomplete', terminalPhase: 'preflight', mutationStarted: false, changed: false,
      failureCategory: 'internal', reason, recoveryId: null, readbackId: null } };
  const record: AdoptionRecord = { schemaVersion: 1, legacy, admission, seal: null, sealDigest: null, phase: 'not-attempted', commit: null };
  const receipt = { original, legacyRecordDigest: legacy.recordDigest, admissionId: admission.admissionId,
    status: 'not-attempted' as const, record: null, reason };
  return { report, receipt, record, admission };
}

test('exact null-record no-write adoption receipt is readable without claiming delivery', () => {
  const { report, receipt } = fixture();
  const value = { ...report, adoptions: { schemaVersion: 1, receipts: [receipt] } };
  expect(parseLifecycleReport(value)).toEqual(value);
  expect(parseLifecycleReport(value).summary.mutationStarted).toBe(false);
});

function withReceipt(status: AdoptionReceipt['status']) {
  const { report, record, receipt, admission } = fixture();
  const prior = { adapterId: 'cursor', target: admission.target, scopeId: admission.fresh.scopeId, packageName: 'demo', nativeId: 'demo',
    route: 'managed' as const, presence: 'present' as const, enablement: 'enabled' as const, activation: 'active' as const,
    transition: { requirement: 'reload' as const, status: 'effective' as const }, installedFingerprint: 'c'.repeat(64),
    contentRoots: [{ label: 'local', path: admission.native.roots[0]!.path, fingerprint: 'c'.repeat(64) }], retention: admission.native.retention };
  const expected = { ...prior, installedFingerprint: 'a'.repeat(64), contentRoots: [{ ...prior.contentRoots[0]!, fingerprint: 'a'.repeat(64) }] };
  const seal: NonNullable<AdoptionRecord['seal']> = { schemaVersion: 1, admissionId: admission.admissionId, adapterId: 'cursor',
    attemptId: admission.fresh.attemptId, operationId: admission.fresh.operationId, scopeId: admission.fresh.scopeId,
    target: admission.target, packageName: 'demo', nativeId: 'demo', action: 'install', route: 'managed', source: admission.source,
    projectedFingerprint: admission.projectedFingerprint, affectedNativeIds: ['demo'], prior, expected };
  const sealDigest = adoptionDigest('plugnz/legacy-adoption-seal/v1', seal);
  const commitPayload = { schemaVersion: 1 as const, admissionId: admission.admissionId, sealDigest,
    verifiedReadback: expected, stateGeneration: 8, committedAt: '2026-10-12T00:00:00.000Z' };
  const retained = parseAdoptionRecord({ ...record, seal, sealDigest,
    phase: status === 'pending' ? 'prepared' : status,
    commit: status === 'committed' ? { ...commitPayload, commitId: adoptionDigest('plugnz/legacy-adoption-commit/v1', commitPayload) } : null });
  const reason = status === 'committed' ? null : status === 'pending'
    ? createLifecycleReason('recovery', 'recovery.required', 'fresh transaction remains unresolved')
    : status === 'rolled-back' ? createLifecycleReason('runtime', 'runtime.operation-failed', 'fresh candidate failed and paired prior was restored') : receipt.reason;
  const outcome = report.outcomes[0]!;
  if (status !== 'not-attempted') {
    outcome.result = status === 'committed' ? 'succeeded' : status === 'pending' ? 'pending' : 'failed';
    outcome.resourceState = status === 'pending' ? 'potentially-changed' : 'present';
    outcome.activationState = status === 'pending' ? 'unknown' : 'active-conforming';
    outcome.changed = status !== 'pending'; outcome.reason = reason;
    report.summary = { result: status === 'committed' ? 'converged' : 'incomplete', terminalPhase: status === 'committed' ? 'complete' : 'apply',
      mutationStarted: true, changed: outcome.changed, failureCategory: reason?.category ?? null, reason,
      recoveryId: status === 'pending' ? outcome.operationId : null, readbackId: null };
  }
  const adoption: AdoptionReceipt = { ...receipt, status, record: retained, reason };
  report.adoptions = { schemaVersion: 1, receipts: [adoption] };
  return { report, adoption };
}

test('exact retained record status correlates with pending, rolled-back and committed current outcomes', () => {
  for (const status of ['not-attempted', 'pending', 'rolled-back', 'committed'] as const) {
    const { report } = withReceipt(status);
    expect(parseLifecycleReport(report)).toEqual(report);
  }
});

function resumeReport(status: 'pending' | 'rolled-back' | 'committed', sameCurrentIdentity = false) {
    const { report, adoption } = withReceipt(status);
    const fresh = adoption.record!.admission.fresh;
    if (!sameCurrentIdentity) {
      delete report.plan[0]!.adoption; delete report.outcomes[0]!.adoption;
      report.plan[0]!.operationId = 'current-operation'; report.plan[0]!.action = 'unchanged';
    }
    report.outcomes[0] = { ...report.plan[0]!, result: status === 'pending' && sameCurrentIdentity ? 'not-attempted' : 'succeeded',
      resourceState: status === 'pending' && sameCurrentIdentity ? 'unknown' : 'present',
      activationState: status === 'pending' && sameCurrentIdentity ? 'unknown' : 'active-conforming', changed: false,
      reason: status === 'pending' && sameCurrentIdentity ? createLifecycleReason('runtime', 'runtime.operation-failed', 'current work stopped before unresolved modern recovery') : null };
    report.recovery = { schemaVersion: 1, receipts: [{
      original: { attemptId: fresh.attemptId, operationId: fresh.operationId, command: fresh.command, scope: adoption.original.scope,
        package: fresh.packageName, nativeId: fresh.nativeId, action: fresh.action, route: 'managed', sealed: true,
        journalState: status === 'rolled-back' ? 'rollback' : status === 'pending' ? 'applying' : 'cleanup-pending' },
      status: status === 'pending' ? 'pending' : 'completed', settlement: status === 'pending' ? null : status === 'rolled-back' ? 'rollback' : 'commit',
      finalJournalState: status === 'pending' ? 'applying' : status === 'rolled-back' ? 'rolled-back' : 'completed',
      resourceState: status === 'pending' ? 'potentially-changed' : status === 'rolled-back' ? 'retained' : 'present',
      activationState: status === 'pending' ? 'unknown' : status === 'rolled-back' ? 'retained-prior' : 'active-conforming',
      mutationStarted: true, changed: status !== 'pending', readbackVerified: status !== 'pending',
      reason: status === 'pending' ? adoption.reason : null,
    }] };
    report.summary.changed = status !== 'pending'; report.summary.readbackId = status === 'pending' ? null : fresh.operationId;
    report.summary.recoveryId = status === 'pending' ? fresh.operationId : null;
    return report;
}

test('resume accounts for the exact fresh modern journal without substituting current Desired or legacy recovery', () => {
  for (const status of ['pending', 'rolled-back', 'committed'] as const) {
    const report = resumeReport(status);
    expect(parseLifecycleReport(report)).toEqual(report);
  }
});

test('same-identity resume accounts native change once and retains aggregate modern recovery flags', () => {
  for (const status of ['pending', 'committed'] as const) {
    const report = resumeReport(status, true);
    expect(parseLifecycleReport(report)).toEqual(report);
    expect(report.outcomes[0]!.changed).toBe(false);
    const missingMutation = { ...report, summary: { ...report.summary, mutationStarted: false } };
    rejectReport(missingMutation);
    report.outcomes[0]!.changed = true;
    rejectReport(report);
  }
});

test('resume refuses contradictory retained phases and purported rollback states', () => {
  const pending = resumeReport('pending');
  const modern = pending.recovery!.receipts[0]!;
  pending.recovery = { schemaVersion: 1, receipts: [{ ...modern, settlement: 'commit', finalJournalState: 'cleanup-pending',
    resourceState: 'present', activationState: 'active-conforming', readbackVerified: true }] };
  rejectReport(pending, 'settlement');
  const rollback = resumeReport('rolled-back');
  rollback.recovery = { schemaVersion: 1, receipts: [{ ...rollback.recovery!.receipts[0]!, resourceState: 'absent', activationState: 'inactive' }] };
  rejectReport(rollback, 'prior');
});

test('receipts reject forgery, unsolicited identities, duplicate and cross-recovery original accounting', () => {
  const { report } = withReceipt('committed');
  const negatives: Array<(value: LifecycleReport) => void> = [
    value => { delete value.adoptions; },
    value => { value.adoptions = { schemaVersion: 1, receipts: [] }; },
    value => { value.command.dryRun = true; },
    value => { value.adoptions = { ...value.adoptions!, schemaVersion: 2 as 1 }; },
    value => { value.adoptions = { schemaVersion: 1, receipts: [...value.adoptions!.receipts, ...value.adoptions!.receipts] }; },
    value => { const receipt = value.adoptions!.receipts[0]!; value.adoptions = { schemaVersion: 1, receipts: [{ ...receipt, admissionId: `sha256:${'0'.repeat(64)}` }] }; },
    value => { const receipt = value.adoptions!.receipts[0]!; value.adoptions = { schemaVersion: 1, receipts: [{ ...receipt, legacyRecordDigest: `sha256:${'0'.repeat(64)}` }] }; },
    value => { const receipt = value.adoptions!.receipts[0]!; value.adoptions = { schemaVersion: 1, receipts: [{ ...receipt, record: null }] }; },
    value => { delete value.plan[0]!.adoption; delete value.outcomes[0]!.adoption; },
    value => { value.adoptions!.receipts[0]!.record!.commit!.commitId = `sha256:${'0'.repeat(64)}`; },
    value => { value.adoptions!.receipts[0]!.record!.seal!.target = { ...value.adoptions!.receipts[0]!.record!.seal!.target, context: { root: '/foreign' } }; },
    value => { const receipt = value.adoptions!.receipts[0]!; value.adoptions = { schemaVersion: 1, receipts: [{ ...receipt, status: 'rolled-back', reason: createLifecycleReason('runtime', 'runtime.operation-failed', 'false rollback') }] }; },
    value => { value.recovery = { schemaVersion: 1, receipts: [{ original: value.adoptions!.receipts[0]!.original,
      status: 'not-attempted', settlement: null, finalJournalState: 'pending', resourceState: 'unknown', activationState: 'unknown',
      mutationStarted: false, changed: false, readbackVerified: false, reason: createLifecycleReason('internal', 'internal.invariant', 'legacy remains unknown') }] }; },
  ];
  for (const mutate of negatives) {
    const value = JSON.parse(JSON.stringify(report)) as LifecycleReport; mutate(value);
    rejectReport(value);
  }
});

test('resume requires exact fresh tuple, scope and settlement without duplicate mutation accounting', () => {
  const negatives: Array<(value: LifecycleReport) => void> = [
    value => { delete value.recovery; },
    value => { const row = value.recovery!.receipts[0]!; value.recovery = { schemaVersion: 1, receipts: [{ ...row, original: { ...row.original, attemptId: 'foreign-attempt' } }] }; },
    value => { const row = value.recovery!.receipts[0]!; value.recovery = { schemaVersion: 1, receipts: [{ ...row, original: { ...row.original, scope: createDeploymentScopeIdentity({ kind: 'local', locator: '/foreign/source' }, { kind: 'cursor', instance: 'default' }) } }] }; },
    value => { const row = value.recovery!.receipts[0]!; value.recovery = { schemaVersion: 1, receipts: [{ ...row, settlement: 'rollback', finalJournalState: 'rolled-back', resourceState: 'retained', activationState: 'retained-prior' }] }; },
    value => { value.summary.changed = false; },
    value => { value.summary.mutationStarted = false; },
  ];
  for (const mutate of negatives) {
    const value = resumeReport('committed'); mutate(value);
    rejectReport(value);
  }
  const same = resumeReport('committed', true);
  same.outcomes[0]!.changed = true;
  rejectReport(same, 'accounted once');
  const unrelated = resumeReport('committed', true);
  delete unrelated.adoptions;
  delete unrelated.plan[0]!.adoption; delete unrelated.outcomes[0]!.adoption;
  rejectReport(unrelated, 'ambiguous');
});

test('new malformed receipt paths preserve typed actionable protocol errors and ordinary reports stay compatible', () => {
  const { report, receipt } = fixture();
  expect(parseLifecycleReport(report)).toEqual(report);
  expect(parseLifecycleReport({ ...report, adoptions: { schemaVersion: 1, receipts: [] } })).toEqual({ ...report, adoptions: { schemaVersion: 1, receipts: [] } });
  for (const malformed of [
    { ...receipt, record: {} }, { ...receipt, original: {} }, { ...receipt, future: true }, { ...receipt, changed: true },
  ]) {
    rejectReport({ ...report, adoptions: { schemaVersion: 1, receipts: [malformed] } });
  }
  const sparse = new Array(1);
  rejectReport({ ...report, adoptions: { schemaVersion: 1, receipts: sparse } }, 'adoption receipt JSON');
  const dry = { ...report, command: { ...report.command, dryRun: true }, adoptions: { schemaVersion: 1, receipts: [] } };
  rejectReport(dry, 'dry run');
});

test('committed supersession remains pending until its exact modern cleanup journal settles', () => {
  const report = resumeReport('committed');
  const reason = createLifecycleReason('recovery', 'recovery.required', 'verified commit still awaits native fence release');
  report.adoptions = { schemaVersion: 1, receipts: [{ ...report.adoptions!.receipts[0]!, status: 'pending', reason }] };
  report.recovery = { schemaVersion: 1, receipts: [{ ...report.recovery!.receipts[0]!, status: 'pending',
    finalJournalState: 'cleanup-pending', reason }] };
  report.summary = { ...report.summary, result: 'incomplete', terminalPhase: 'finalize', failureCategory: 'recovery', reason,
    recoveryId: report.recovery.receipts[0]!.original.operationId };
  expect(parseLifecycleReport(report)).toEqual(report);
  const modern = report.recovery.receipts[0]!;
  report.recovery = { schemaVersion: 1, receipts: [{ ...modern, settlement: null, readbackVerified: false }] };
  rejectReport(report, 'settlement');
});

test('a resumed accepted no-write intent accounts only the modern settlement and never settles legacy history', () => {
  const { report, receipt, record, admission } = fixture();
  delete report.plan[0]!.adoption; delete report.outcomes[0]!.adoption;
  report.plan[0]!.operationId = 'current-operation'; report.plan[0]!.action = 'unchanged';
  report.outcomes[0] = { ...report.plan[0]!, result: 'succeeded', resourceState: 'present', activationState: 'active-conforming', changed: false, reason: null };
  report.adoptions = { schemaVersion: 1, receipts: [{ ...receipt, record }] };
  report.recovery = { schemaVersion: 1, receipts: [{ original: { attemptId: admission.fresh.attemptId,
    operationId: admission.fresh.operationId, command: admission.fresh.command, scope: receipt.original.scope,
    package: admission.fresh.packageName, nativeId: admission.fresh.nativeId, action: admission.fresh.action,
    route: null, journalState: 'pending', sealed: false }, status: 'completed', settlement: 'not-attempted', finalJournalState: 'not-attempted',
    resourceState: 'unknown', activationState: 'unknown', changed: false, mutationStarted: false, readbackVerified: false, reason: null }] };
  expect(parseLifecycleReport(report)).toEqual(report);
  expect(parseLifecycleReport(report).summary.result).toBe('incomplete');
});
