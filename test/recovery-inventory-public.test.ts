import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import type { LifecycleStateV2 } from '../src/state';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('applying modern unsealed intent returns loud valid JSON without claiming this retry mutated', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('unsealed-applying', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(harness.run(['sync', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    const file = join(harness.home, 'state.json');
    const state: LifecycleStateV2 = JSON.parse(readFileSync(file, 'utf8'));
    const attempt = state.attempts[0]!;
    attempt.phase = 'applying'; attempt.mutationStarted = true;
    const row = attempt.journal[0]!;
    row.state = 'applying'; delete row.sealedOperation; delete row.settlement;
    writeFileSync(file, JSON.stringify(state));
    const result = harness.run(['sync', source, '--target', 'cursor', '--json'], { env });
    expect(result.exitCode).toBe(1);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.summary.changed).toBe(false);
    expect(report.summary.reason!.diagnostic).toContain('no durable sealed operation');
    expect(report.recovery!.receipts[0]!.original.operationId).toBe(row.operationId);
    expect(report.recovery!.receipts[0]!.status).toBe('pending');
    expect(result.state.after).toEqual(result.state.before);
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
}, 20_000);
import { projectRecoveryOperationProof } from '../src/recovery-proof';

test('sealed proof rejects an explicit legacy route instead of upgrading it', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('conflicting-journal-route', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    expect(harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: cursor.path } }).exitCode).toBe(0);
    const state: LifecycleStateV2 = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
    const scope = state.scopes[0]!;
    const attempt = state.attempts[0]!;
    const row = { ...attempt.journal[0]!, state: 'cleanup-pending' as const };
    expect(row.sealedOperation?.route).toBe('managed');
    expect(projectRecoveryOperationProof(scope, attempt, row).sealed).toBe(true);
    let diagnostic: string | undefined;
    try { projectRecoveryOperationProof(scope, attempt, { ...row, route: { kind: 'legacy-unverified' } }); }
    catch (error) { diagnostic = error instanceof Error ? error.message : String(error); }
    expect(diagnostic).toBe('open journal route differs from its sealed operation');
    const { sealedOperation: _seal, ...unsealed } = row;
    const legacy = projectRecoveryOperationProof(scope, attempt, { ...unsealed, route: { kind: 'legacy-unverified' } });
    expect(legacy.route).toBe(null);
    expect(legacy.sealed).toBe(false);
  });
}, 20_000);

test('scopes exposes every older open journal even without an Activation, without writing', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('open-journal-inventory', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    expect(harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: cursor.path } }).exitCode).toBe(0);
    const file = join(harness.home, 'state.json');
    const state: LifecycleStateV2 = JSON.parse(readFileSync(file, 'utf8'));
    const original = state.attempts[0]!;
    const row = original.journal[0]!;
    const { sealedOperation: _handle, settlement: _settlement, ...unsealed } = row;
    state.attempts.unshift({ id: 'older-accepted-attempt', command: 'sync', phase: 'accepted', mutationStarted: false,
      scopeIds: [row.scopeId], journal: [{ ...unsealed, operationId: 'older-accepted-operation', state: 'pending' }] });
    original.phase = 'finalizing';
    row.state = 'cleanup-pending';
    row.settlement = 'commit';
    state.activations = [];
    writeFileSync(file, JSON.stringify(state));
    const result = harness.run(['scopes', '--json']);
    expect(result.exitCode).toBe(0);
    expect(result.state.after).toEqual(result.state.before);
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
    const inventory = JSON.parse(result.stdout);
    expect(inventory.scopes[0].activations).toEqual([]);
    expect(inventory.scopes[0].openJournals).toEqual({ schemaVersion: 1, operations: [
      { attemptId: 'older-accepted-attempt', command: 'sync', operationId: 'older-accepted-operation',
        scope: { id: state.scopes[0]!.id, source: state.scopes[0]!.source, target: { kind: 'cursor', instance: 'default' } },
        package: row.packageId, nativeId: row.nativeId, action: row.action, route: null, journalState: 'pending', sealed: false },
      { attemptId: original.id, command: original.command, operationId: row.operationId,
        scope: { id: state.scopes[0]!.id, source: state.scopes[0]!.source, target: { kind: 'cursor', instance: 'default' } },
        package: row.packageId, nativeId: row.nativeId, action: row.action, route: 'managed', journalState: 'cleanup-pending', sealed: true },
    ] });
  });
}, 20_000);
