import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import type { LifecycleStateV2 } from '../src/state';

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
