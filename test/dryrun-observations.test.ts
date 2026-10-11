import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';

test('dry-run states describe live observations, not the prospective install or retirement', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('observed-state', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'payload.txt': 'first bytes\n',
    });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 48 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    const preview = () => harness.run(['sync', source, '--target', 'cursor', '--dry-run', '--json'], { env });
    const absent = preview();
    expect(absent.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(absent.stdout)).outcomes.map((row) => ({ action: row.action, resource: row.resourceState, activation: row.activationState })))
      .toEqual([{ action: 'install', resource: 'absent', activation: 'inactive' }]);
    expect(absent.state.after).toEqual(absent.state.before);
    expect(absent.stores.cursor.after).toEqual(absent.stores.cursor.before);

    expect(harness.run(['sync', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(source, 'payload.txt'), 'changed bytes\n');
    const stale = preview();
    expect(stale.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(stale.stdout)).outcomes.map((row) => ({ action: row.action, resource: row.resourceState, activation: row.activationState })))
      .toEqual([{ action: 'update', resource: 'present', activation: 'active-nonconforming' }]);
    expect(stale.stores.cursor.after).toEqual(stale.stores.cursor.before);
    expect(harness.run(['sync', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    const retire = harness.run(['retire-source', source, '--target', 'cursor', '--dry-run', '--json'], { env });
    expect(retire.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(retire.stdout)).outcomes.map((row) => ({ action: row.action, resource: row.resourceState, activation: row.activationState })))
      .toEqual([{ action: 'retire-orphan', resource: 'present', activation: 'active-conforming' }]);
    expect(retire.state.after).toEqual(retire.state.before);
    expect(retire.stores.cursor.after).toEqual(retire.stores.cursor.before);
  });
});
