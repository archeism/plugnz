import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { readLifecycleState, type LifecycleStateV2 } from '../src/state';
import { writeLifecycleState } from '../src/state-write';
import { adoptionDigest, canonicalAdoptionJson, projectLegacyRecordProofs } from '../src/legacy-adoption-proof';
import { projectAdoptionSeal, type AdoptionAdmission, type AdoptionRecord } from '../src/legacy-adoption-record';
import type { SerializedLifecycleOperation } from '../src/lifecycle-operation-record';
import { fingerprintTree } from '../src/fingerprint';
import { CryptoHasher } from '../src/runtime';

test('scopes retains the first original snapshot across closed admission, shared-header progress and retry', async () => {
  await withLifecycleCliHarness(harness => {
    const source = harness.source('legacy', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const marker = JSON.stringify({ source, pluginId: 'demo', fingerprint: fingerprintTree(source) });
    harness.writeHome({ 'state.json': JSON.stringify({ version: 1, installs: [{ host: 'cursor', id: 'demo@personal',
      source, sourceSha: 'original-revision', ownership: 'plgnz', pending: 'install' }] }),
      '.cursor/plugins/local/demo/plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      '.cursor/plugins/local/demo/.plgnz-install.json': marker });
    const file = join(harness.home, 'state.json');
    const state = readLifecycleState(file).state;
    const legacy = projectLegacyRecordProofs(state, state.scopes[0]!)[0]!;
    const nativeRoot = join(harness.home, '.cursor/plugins/local/demo');
    const payloadFingerprint = fingerprintTree(source);
    const admissionPayload: Omit<AdoptionAdmission, 'admissionId'> = {
      schemaVersion: 1, original: legacy.original, legacyRecordDigest: legacy.recordDigest,
      source: { binding: state.scopes[0]!.source, revision: payloadFingerprint, fingerprint: payloadFingerprint },
      target: state.scopes[0]!.target, packageName: 'demo', packageVersion: '1.0.0', projectedFingerprint: `sha256:${payloadFingerprint}`,
      native: { adapterId: 'cursor', format: 'cursor/legacy-marker-v1', evidenceId: `sha256:${'e'.repeat(64)}`,
        version: { kind: 'detected', version: 'fixture-directory-profile', probeId: 'fixture-profile-probe' }, aliasMode: 'same-root',
        oldLedgerNativeId: 'demo@personal', oldPhysicalNativeId: 'demo', newNativeId: 'demo', packageName: 'demo', packageVersion: '1.0.0',
        marker: { source, pluginId: 'demo', fingerprint: payloadFingerprint,
          rawDigest: `sha256:${new CryptoHasher('sha256').update(marker).digest('hex')}` },
        roots: [{ label: 'local', path: nativeRoot, fullFingerprint: `sha256:${fingerprintTree(nativeRoot)}`, payloadFingerprint: `sha256:${payloadFingerprint}` }],
        projectedPayloadFingerprint: `sha256:${payloadFingerprint}`, pins: [],
        retention: { pluginData: { state: 'not-observed', fingerprint: null }, inactiveMetadata: { state: 'not-observed', fingerprint: null } } },
      fresh: { attemptId: 'fixture-fresh-A', operationId: 'fixture-operation-A', command: 'sync', baseStateGeneration: 0,
        scopeId: legacy.original.scope.id, packageName: 'demo', nativeId: 'demo', sourceSnapshotId: 'fixture-source-snapshot', action: 'install', route: 'managed' },
    };
    const admission: AdoptionAdmission = { ...admissionPayload, admissionId: adoptionDigest('plugnz/legacy-admission/v1', admissionPayload) };
    const record: AdoptionRecord = { schemaVersion: 1, legacy, admission, seal: null, sealDigest: null, phase: 'prepared', commit: null };
    state.stateGeneration = 1;
    state.attempts.push({ id: admission.fresh.attemptId, command: 'sync', phase: 'accepted', mutationStarted: false,
      scopeIds: [state.scopes[0]!.id], journal: [{ operationId: admission.fresh.operationId, scopeId: state.scopes[0]!.id,
        packageId: 'demo', nativeId: 'demo', action: 'install', state: 'pending' }] });
    state.legacyAdoptions = { schemaVersion: 1, records: [record] };
    writeFileSync(file, JSON.stringify(state));
    let output = harness.run(['scopes', '--json']);
    expect(output.exitCode).toBe(0);
    expect(output.state.after).toEqual(output.state.before);
    const before = JSON.parse(output.stdout) as { scopes: Array<{ adoptionHistory: { legacyRecords: unknown[]; records: unknown[] } }> };
    expect(before.scopes[0]!.adoptionHistory.legacyRecords).toEqual([legacy]);
    expect(before.scopes[0]!.adoptionHistory.records).toEqual([record]);
    const immutableWrites = [
      (candidate: LifecycleStateV2) => { candidate.legacyAdoptions!.records = []; },
      (candidate: LifecycleStateV2) => {
        const row = candidate.legacyAdoptions!.records[0]!;
        row.legacy.snapshot.attempt.updatedAt = '2026-10-12T00:00:00.000Z';
        row.legacy.recordDigest = adoptionDigest('plugnz/legacy-record/v1', row.legacy.snapshot);
        row.admission.legacyRecordDigest = row.legacy.recordDigest;
        const { admissionId: _id, ...payload } = row.admission;
        row.admission.admissionId = adoptionDigest('plugnz/legacy-admission/v1', payload);
      },
    ].map(mutate => {
      writeFileSync(file, JSON.stringify(state));
      const candidate = JSON.parse(canonicalAdoptionJson(state)) as LifecycleStateV2;
      candidate.stateGeneration = 2; mutate(candidate);
      try { writeLifecycleState(candidate, { globalPreflight: 'succeeded' }, file); return false; } catch { return true; }
    });
    expect(immutableWrites).toEqual([true, true]);
    writeFileSync(file, JSON.stringify(state));

    // A proven accepted/no-write intent closes without settling old history.
    state.attempts[1]!.phase = 'failed'; state.attempts[1]!.journal[0]!.state = 'not-attempted'; record.phase = 'not-attempted';
    state.attempts[0]!.updatedAt = '2026-10-12T00:00:00.000Z'; state.stateGeneration = 2;
    const retryPayload = { ...admissionPayload, fresh: { ...admission.fresh, attemptId: 'fixture-fresh-A-retry', operationId: 'fixture-operation-A-retry', baseStateGeneration: 2 } };
    const retry: AdoptionRecord = { ...record, phase: 'prepared', admission: { ...retryPayload, admissionId: adoptionDigest('plugnz/legacy-admission/v1', retryPayload) } };
    state.attempts.push({ ...state.attempts[1]!, id: retry.admission.fresh.attemptId, phase: 'accepted',
      journal: [{ ...state.attempts[1]!.journal[0]!, operationId: retry.admission.fresh.operationId, state: 'pending' }] });
    state.legacyAdoptions.records.push(retry); state.stateGeneration = 3;
    writeFileSync(file, JSON.stringify(state));
    output = harness.run(['scopes', '--json']);
    expect(output.exitCode).toBe(0);
    const after = JSON.parse(output.stdout) as typeof before;
    expect(after.scopes[0]!.adoptionHistory.legacyRecords).toEqual([legacy]);
    expect(after.scopes[0]!.adoptionHistory.records).toEqual([record, retry]);
    expect(output.state.after).toEqual(output.state.before);

    const negatives: Array<(candidate: LifecycleStateV2) => void> = [
      candidate => { candidate.legacyAdoptions!.schemaVersion = 2 as 1; },
      candidate => { candidate.legacyAdoptions!.records.push(candidate.legacyAdoptions!.records[1]!); },
      candidate => { candidate.legacyAdoptions!.records[1]!.phase = 'committed'; },
      candidate => { candidate.attempts[2]!.journal[0]!.nativeId = 'foreign'; },
      candidate => { candidate.activations[0]!.sourceRevision = 'foreign-revision'; },
      candidate => {
        const row = candidate.legacyAdoptions!.records[1]!;
        row.admission.native.marker.source = '/foreign/source';
        const { admissionId: _id, ...payload } = row.admission;
        row.admission.admissionId = adoptionDigest('plugnz/legacy-admission/v1', payload);
      },
      candidate => {
        const row = candidate.legacyAdoptions!.records[1]!;
        row.admission.fresh.baseStateGeneration = candidate.stateGeneration;
        const { admissionId: _id, ...payload } = row.admission;
        row.admission.admissionId = adoptionDigest('plugnz/legacy-admission/v1', payload);
      },
      candidate => {
        const row = candidate.legacyAdoptions!.records[1]!;
        row.legacy.snapshot.attempt.updatedAt = '2026-10-12T00:00:00.000Z';
        row.legacy.recordDigest = adoptionDigest('plugnz/legacy-record/v1', row.legacy.snapshot);
        row.admission.legacyRecordDigest = row.legacy.recordDigest;
        const { admissionId: _id, ...payload } = row.admission;
        row.admission.admissionId = adoptionDigest('plugnz/legacy-admission/v1', payload);
      },
    ];
    for (const mutate of negatives) {
      const candidate = JSON.parse(canonicalAdoptionJson(state)) as LifecycleStateV2; mutate(candidate);
      writeFileSync(file, JSON.stringify(candidate));
      const refused = harness.run(['scopes', '--json']);
      expect(refused.exitCode).toBe(1);
      expect(refused.state.after).toEqual(refused.state.before);
    }

    // Reader-only schema fixtures, not execution or native-CAS evidence. Seal
    // validation must bind the actual retained handle rather than hash claims.
    const modern = state.attempts[2]!; const fresh = retry.admission.fresh;
    const prior: SerializedLifecycleOperation['prior'] = { adapterId: 'cursor', target: retry.admission.target,
      scopeId: fresh.scopeId, packageName: 'demo', nativeId: 'demo', route: 'managed', presence: 'present',
      enablement: 'enabled', activation: 'active', transition: { requirement: 'reload', status: 'effective' },
      installedFingerprint: retry.admission.native.roots[0]!.fullFingerprint.slice(7),
      contentRoots: [{ label: 'local', path: nativeRoot, fingerprint: retry.admission.native.roots[0]!.fullFingerprint.slice(7) }],
      retention: retry.admission.native.retention };
    const expected: SerializedLifecycleOperation['expected'] = { ...prior, installedFingerprint: payloadFingerprint,
      contentRoots: [{ label: 'local', path: nativeRoot, fingerprint: payloadFingerprint }] };
    const handle: SerializedLifecycleOperation = { schemaVersion: 1, adapterId: 'cursor', target: retry.admission.target,
      targetObservationId: 'fixture-observation', operationId: fresh.operationId, attemptId: fresh.attemptId,
      scopeId: fresh.scopeId, packageName: 'demo', nativeId: 'demo', sourceType: 'local', sourceRevision: payloadFingerprint,
      sourceLocator: null, packageVersion: '1.0.0', action: 'install', route: 'managed', detectedVersion: 'fixture-directory-profile',
      versionProbeId: 'fixture-profile-probe', evidenceId: retry.admission.native.evidenceId, mutationGroupId: fresh.operationId,
      mutationInvocationOperationId: fresh.operationId, artifactId: 'fixture-artifact', projectedFingerprint: payloadFingerprint,
      affectedNativeIds: ['demo'], affectedOperationIds: [fresh.operationId], prior, expected,
      rollbackReference: join(harness.root, 'fixture-rollback') };
    retry.seal = projectAdoptionSeal(retry.admission, handle);
    retry.sealDigest = adoptionDigest('plugnz/legacy-adoption-seal/v1', retry.seal);
    retry.phase = 'committed';
    const commitPayload = { schemaVersion: 1 as const, admissionId: retry.admission.admissionId, sealDigest: retry.sealDigest,
      verifiedReadback: expected, stateGeneration: 4, committedAt: '2026-10-12T00:01:00.000Z' };
    retry.commit = { ...commitPayload, commitId: adoptionDigest('plugnz/legacy-adoption-commit/v1', commitPayload) };
    modern.phase = 'finalizing'; modern.mutationStarted = true;
    modern.journal[0] = { ...modern.journal[0]!, state: 'cleanup-pending', settlement: 'commit', sealedOperation: handle };
    state.stateGeneration = 4;
    state.activations = [{ scopeId: fresh.scopeId, packageId: 'demo', nativeId: 'demo', sourceRevision: payloadFingerprint,
      route: { kind: 'managed', evidenceKey: { kind: 'capability-profile', key: retry.admission.native.evidenceId } },
      ownership: { kind: 'adopted', proofKey: { kind: 'managed-marker', key: `sha256:${'f'.repeat(64)}` },
        verifiedAt: commitPayload.committedAt, adoptedAt: commitPayload.committedAt },
      fingerprints: { source: payloadFingerprint, projected: payloadFingerprint, installed: payloadFingerprint },
      activationState: 'active', readbackState: 'verified', pins: [],
      pending: { operation: 'install', phase: 'cleanup', attemptId: fresh.attemptId } }];
    writeFileSync(file, JSON.stringify(state));
    const committed = harness.run(['scopes', '--json']);
    expect({ exitCode: committed.exitCode, stderr: committed.stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect(committed.state.after).toEqual(committed.state.before);
    expect((JSON.parse(committed.stdout) as typeof before).scopes[0]!.adoptionHistory.records).toEqual([record, retry]);
    for (const mutate of [
      (candidate: LifecycleStateV2) => { delete candidate.activations[0]!.pending; },
      (candidate: LifecycleStateV2) => { candidate.activations[0]!.readbackState = 'failed'; },
      (candidate: LifecycleStateV2) => { candidate.activations[0]!.activationState = 'inactive'; },
      (candidate: LifecycleStateV2) => { candidate.activations.push(JSON.parse(canonicalAdoptionJson(legacy.snapshot.activation)) as typeof legacy.snapshot.activation); },
    ]) {
      const candidate = JSON.parse(canonicalAdoptionJson(state)) as LifecycleStateV2; mutate(candidate);
      writeFileSync(file, JSON.stringify(candidate));
      const refused = harness.run(['scopes', '--json']);
      expect(refused.exitCode).toBe(1);
      expect(refused.state.after).toEqual(refused.state.before);
    }

    // Close only the modern journal. Later canonical activation removal does not
    // invalidate immutable adoption history or rewrite the legacy journal.
    modern.phase = 'completed'; modern.completedAt = '2026-10-12T00:02:00.000Z';
    modern.journal[0]!.state = 'completed'; state.stateGeneration = 5;
    state.activations = [];
    writeFileSync(file, JSON.stringify(state));
    const retired = harness.run(['scopes', '--json']);
    expect({ exitCode: retired.exitCode, stderr: retired.stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect((JSON.parse(retired.stdout) as typeof before).scopes[0]!.adoptionHistory.legacyRecords).toEqual([legacy]);
    expect(retired.state.after).toEqual(retired.state.before);

    const alteredHandle = JSON.parse(canonicalAdoptionJson(state)) as LifecycleStateV2;
    const oldHandle = alteredHandle.attempts[2]!.journal[0]!.sealedOperation!;
    alteredHandle.attempts[2]!.journal[0]!.sealedOperation = { ...oldHandle, expected: { ...oldHandle.expected,
      contentRoots: [{ label: 'local', path: '/foreign/root', fingerprint: payloadFingerprint }] } };
    writeFileSync(file, JSON.stringify(alteredHandle));
    const lostProof = harness.run(['scopes', '--json']);
    expect(lostProof.exitCode).toBe(1);
    expect(lostProof.state.after).toEqual(lostProof.state.before);
  });
}, 30_000); // Multiple isolated CLI reads; the initial thirteen took 6.405 s under concurrent gates.
